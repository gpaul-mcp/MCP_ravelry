import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';

import type { RavelryClient } from '../ravelry/client.ts';
import type { ApiYarn, ApiYarnListItem } from '../ravelry/types.ts';
import { weightPermalink, YARN_WEIGHTS } from '../ravelry/vocabulary.ts';
import { rounded } from './format.ts';
import { toYarnSummary, yarnSummarySchema } from './yarns.ts';
import { VIEW_META } from '../view.ts';

const METERS_TO_YARDS = 1.0936;

const itemSchema = z.object({
  label: z
    .string()
    .trim()
    .min(2)
    .max(300)
    .describe('The line or label text as read, e.g. "Malabrigo Rios 856 Azul Profundo x3 100g".'),
  brand: z.string().trim().max(100).optional().describe('Brand / company, if identified.'),
  name: z.string().trim().max(100).optional().describe('Yarn line name, if identified.'),
  weight: z.enum(YARN_WEIGHTS).optional(),
  fiber: z
    .string()
    .trim()
    .max(100)
    .optional()
    .describe('Fiber content as printed, e.g. "100% merino".'),
  yards_per_skein: z.number().positive().optional(),
  meters_per_skein: z.number().positive().optional(),
  grams_per_skein: z.number().positive().optional(),
});

type Item = z.infer<typeof itemSchema>;

const candidateSchema = yarnSummarySchema.extend({
  fibers: z.array(z.string()),
  score: z.number().describe('0 to 1.'),
  reasons: z.array(z.string()).describe('What matched or did not.'),
});

type Candidate = z.infer<typeof candidateSchema>;

const outputSchema = z.object({
  matches: z.array(
    z.object({
      label: z.string(),
      query: z.string().describe('The Ravelry search that was run.'),
      confidence: z
        .enum(['high', 'medium', 'low', 'none'])
        .describe('high: safe to use best; medium: confirm with the user; low/none: ask the user.'),
      best: candidateSchema.nullable(),
      alternatives: z.array(candidateSchema),
    }),
  ),
});

export function registerMatchYarns(server: McpServer, ravelry: RavelryClient): void {
  server.registerTool(
    'match_yarns',
    {
      title: 'Match yarns to Ravelry',
      description:
        'Finds the Ravelry yarn behind text read from a ball band, receipt or invoice. Pass one ' +
        'item per yarn with the raw label plus whatever you could read (brand, name, weight, ' +
        'fiber, yards/meters and grams per skein). Returns the best match with a confidence and ' +
        'alternatives; use the yarn ids with add_to_my_stash or get_yarn_details.',
      inputSchema: z.object({ items: z.array(itemSchema).min(1).max(20) }),
      outputSchema,
      _meta: VIEW_META,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ items }, ctx) => {
      const signal = ctx.mcpReq.signal;
      const matches = [];
      // Sequential: a receipt rarely has many lines, and it is kind to Ravelry's API.
      for (const item of items) matches.push(await matchOne(ravelry, item, signal));
      const output = { matches };
      return {
        content: [{ type: 'text', text: JSON.stringify(output) }],
        structuredContent: output,
      };
    },
  );
}

async function matchOne(ravelry: RavelryClient, item: Item, signal: AbortSignal) {
  const queries = [
    [item.brand, item.name].filter(Boolean).join(' '),
    item.name ?? '',
    cleanLabel(item.label),
  ].filter((query, index, all) => query.length > 1 && all.indexOf(query) === index);

  let query = queries[0] ?? item.label;
  let found: ApiYarnListItem[] = [];
  for (const candidateQuery of queries) {
    const response = await ravelry.searchYarns(
      { query: candidateQuery, page_size: 10, sort: 'best' },
      signal,
    );
    if (response.yarns.length > 0) {
      query = candidateQuery;
      found = response.yarns;
      break;
    }
  }

  if (found.length === 0) {
    return { label: item.label, query, confidence: 'none' as const, best: null, alternatives: [] };
  }

  // Full records add fiber content, which helps tell similar yarns apart.
  const details = new Map(
    (
      await ravelry.getYarns(
        found.slice(0, 8).map(yarn => yarn.id),
        signal,
      )
    ).map(y => [y.id, y]),
  );
  const scored = found
    .slice(0, 8)
    .map(yarn => score(item, details.get(yarn.id) ?? yarn, query))
    .sort((a, b) => b.score - a.score);

  const [best, second] = scored;
  const margin = (best?.score ?? 0) - (second?.score ?? 0);
  const confidence =
    best && best.score >= 0.75 && margin >= 0.1
      ? ('high' as const)
      : best && best.score >= 0.5
        ? ('medium' as const)
        : ('low' as const);

  return {
    label: item.label,
    query,
    confidence,
    best: best ?? null,
    alternatives: scored.slice(1, 4),
  };
}

function score(item: Item, yarn: ApiYarnListItem | ApiYarn, query: string): Candidate {
  const reasons: string[] = [];
  const wanted = tokens(`${query} ${item.label}`);
  const company = yarn.yarn_company_name ?? ('yarn_company' in yarn ? yarn.yarn_company?.name : '');
  const have = tokens(`${company ?? ''} ${yarn.name}`);
  const nameTokens = tokens(yarn.name);
  const covered = [...have].filter(token => wanted.has(token)).length / Math.max(have.size, 1);
  const nameCovered = [...nameTokens].every(token => wanted.has(token));
  let value = 0.55 * covered + (nameCovered ? 0.15 : 0);
  reasons.push(
    nameCovered ? 'name matches' : `name partly matches (${Math.round(covered * 100)}%)`,
  );

  const weight = weightPermalink(yarn.yarn_weight?.name);
  if (item.weight && weight) {
    if (item.weight === weight) {
      value += 0.15;
      reasons.push('same weight');
    } else {
      value -= 0.2;
      reasons.push(`weight differs (${weight})`);
    }
  }

  const yards =
    item.yards_per_skein ??
    (item.meters_per_skein ? item.meters_per_skein * METERS_TO_YARDS : undefined);
  if (yards && yarn.yardage) {
    const difference = Math.abs(yarn.yardage - yards) / yards;
    if (difference <= 0.05) {
      value += 0.15;
      reasons.push('yardage matches');
    } else if (difference <= 0.15) {
      value += 0.05;
      reasons.push('yardage close');
    } else {
      value -= 0.15;
      reasons.push(`yardage differs (${yarn.yardage} yd)`);
    }
  }

  if (item.grams_per_skein && yarn.grams) {
    if (Math.abs(yarn.grams - item.grams_per_skein) <= 2) {
      value += 0.05;
      reasons.push('skein weight matches');
    } else {
      value -= 0.1;
      reasons.push(`skein weight differs (${yarn.grams} g)`);
    }
  }

  const fibers =
    'yarn_fibers' in yarn
      ? (yarn.yarn_fibers ?? []).flatMap(f =>
          f.fiber_type?.name
            ? [`${f.percentage ? `${f.percentage}% ` : ''}${f.fiber_type.name}`]
            : [],
        )
      : [];
  if (item.fiber && fibers.length > 0) {
    const printed = tokens(item.fiber);
    if (fibers.some(fiber => [...tokens(fiber)].some(token => printed.has(token)))) {
      value += 0.1;
      reasons.push('fiber matches');
    }
  }

  if (yarn.discontinued) reasons.push('discontinued');

  return {
    ...toYarnSummary(yarn),
    fibers,
    score: rounded(Math.min(1, Math.max(0, value)), 2) ?? 0,
    reasons,
  };
}

const STOP_WORDS = new Set(['yarn', 'yarns', 'wool', 'the', 'and', 'de', 'la', 'le', 'by']);

function tokens(text: string): Set<string> {
  return new Set(
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(token => token.length > 1 && !STOP_WORDS.has(token) && !/^\d+$/.test(token)),
  );
}

/** Drops quantities, prices and sizes from a receipt line, keeping the words. */
function cleanLabel(label: string): string {
  return label
    .replace(/\b\d+\s*(x|×|pcs?|pelotes?|skeins?)\b|\b(x|×)\s*\d+\b/gi, ' ')
    .replace(/[$€£]\s*\d+([.,]\d+)?|\d+([.,]\d+)?\s*[$€£]/g, ' ')
    .replace(/\b\d+([.,]\d+)?\s*(g|gr|grams?|m|yds?|yards?|meters?|metres?)\b/gi, ' ')
    .replace(/#?\b\d{2,}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
