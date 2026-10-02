import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';

import type { RavelryClient } from '../ravelry/client.ts';
import type { ApiNeedleSize, ApiYarn, ApiYarnListItem } from '../ravelry/types.ts';
import { YARN_ATTRIBUTES, YARN_FIBERS, YARN_WEIGHTS } from '../ravelry/vocabulary.ts';
import { htmlToText, nonEmpty, truncate, yarnUrl } from './format.ts';

const MAX_IDS = 20;
const MAX_NOTES_LENGTH = 2_000;

export const yarnSummarySchema = z.object({
  id: z.number().describe('Pass to get_yarn_details for fibers, needles, gauge and care.'),
  name: z.string(),
  company: z.string().nullable(),
  url: z.string(),
  weight: z.string().nullable(),
  yards_per_skein: z.number().nullable(),
  grams_per_skein: z.number().nullable(),
  machine_washable: z.boolean().nullable(),
  discontinued: z.boolean().nullable(),
  rating: z.number().nullable().describe('Average rating out of 5.'),
  rating_count: z.number().nullable(),
  photo_url: z.string().nullable(),
});

export type YarnSummary = z.infer<typeof yarnSummarySchema>;

export function toYarnSummary(yarn: ApiYarnListItem | ApiYarn): YarnSummary {
  return {
    id: yarn.id,
    name: yarn.name.trim(),
    company: yarn.yarn_company_name ?? null,
    url: yarnUrl(yarn.permalink),
    weight: yarn.yarn_weight?.name ?? null,
    yards_per_skein: yarn.yardage ?? null,
    grams_per_skein: yarn.grams ?? null,
    machine_washable: yarn.machine_washable ?? null,
    discontinued: yarn.discontinued ?? null,
    rating: yarn.rating_count ? nonEmpty(yarn.rating_average) : null,
    rating_count: yarn.rating_count ?? null,
    photo_url: yarn.first_photo?.medium_url ?? yarn.first_photo?.small_url ?? null,
  };
}

const searchInput = z.object({
  query: z
    .string()
    .trim()
    .max(200)
    .optional()
    .describe('Yarn or brand name, e.g. "Malabrigo Rios" or "Drops". Omit to browse by filters.'),
  weight: z
    .array(z.enum(YARN_WEIGHTS))
    .min(1)
    .max(4)
    .optional()
    .describe('Yarn weights (any of them matches).'),
  fiber: z
    .array(z.enum(YARN_FIBERS))
    .min(1)
    .max(4)
    .optional()
    .describe('Fibers the yarn contains (any of them matches).'),
  attributes: z
    .array(z.enum(YARN_ATTRIBUTES))
    .min(1)
    .max(4)
    .optional()
    .describe('Yarn attributes such as superwash, hand-dyed or self-striping (any matches).'),
  include_discontinued: z
    .boolean()
    .default(false)
    .describe('Also return yarns that are no longer made.'),
  sort: z
    .enum(['best', 'rating', 'projects'])
    .default('best')
    .describe('best = best match; rating = highest rated; projects = most used on Ravelry.'),
  page: z.number().int().min(1).default(1).describe('1-based results page.'),
  page_size: z.number().int().min(1).max(50).default(20).describe('Results per page (max 50).'),
});

const searchOutput = z.object({
  yarns: z.array(yarnSummarySchema),
  page: z.number(),
  page_count: z.number(),
  total_results: z.number(),
});

const detailsSchema = yarnSummarySchema.extend({
  fibers: z.array(z.string()).describe('Fiber content, e.g. "75% Wool".'),
  attributes: z.array(z.string()).describe('Care, color, dye and texture attributes.'),
  texture: z.string().nullable(),
  needles: z.string().nullable().describe('Recommended knitting needle range.'),
  hooks: z.string().nullable().describe('Recommended crochet hook range.'),
  gauge: z.string().nullable(),
  origin: z.array(z.string()).describe('Where the fiber was sourced, spun or dyed.'),
  notes: z.string().nullable(),
});

const detailsOutput = z.object({
  yarns: z.array(detailsSchema),
  missing_ids: z.array(z.number()).describe('Requested ids Ravelry returned nothing for.'),
});

export function registerYarnTools(server: McpServer, ravelry: RavelryClient): void {
  server.registerTool(
    'search_yarns',
    {
      title: 'Search Ravelry yarns',
      description:
        'Search the Ravelry yarn database by name, weight, fiber and attributes (superwash, ' +
        'hand-dyed, self-striping...). Excludes discontinued yarns unless asked. Returns ' +
        'yardage and grams per skein, washability and rating for each match.',
      inputSchema: searchInput,
      outputSchema: searchOutput,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    async (input, ctx) => {
      const response = await ravelry.searchYarns(
        {
          query: input.query,
          weight: input.weight,
          fiber: input.fiber,
          ya: input.attributes,
          discontinued: input.include_discontinued ? undefined : 'no',
          sort: input.sort,
          page: input.page,
          page_size: input.page_size,
        },
        ctx.mcpReq.signal,
      );

      const output: z.infer<typeof searchOutput> = {
        yarns: response.yarns.map(toYarnSummary),
        page: response.paginator.page,
        page_count: response.paginator.page_count,
        total_results: response.paginator.results,
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(output) }],
        structuredContent: output,
      };
    },
  );

  server.registerTool(
    'get_yarn_details',
    {
      title: 'Get Ravelry yarn details',
      description:
        'Get full details for one or more yarns by id: fiber content, recommended needles and ' +
        'hooks, gauge, care, texture, color/dye attributes, where it is made, and notes.',
      inputSchema: z.object({
        ids: z
          .array(z.number().int().positive())
          .min(1)
          .max(MAX_IDS)
          .describe(`Ravelry yarn ids, 1 to ${MAX_IDS} per call.`),
      }),
      outputSchema: detailsOutput,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ ids }, ctx) => {
      const uniqueIds = [...new Set(ids)];
      const yarns = await ravelry.getYarns(uniqueIds, ctx.mcpReq.signal);
      const found = new Set(yarns.map(yarn => yarn.id));

      const output: z.infer<typeof detailsOutput> = {
        yarns: yarns.map(toYarnDetails),
        missing_ids: uniqueIds.filter(id => !found.has(id)),
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(output) }],
        structuredContent: output,
      };
    },
  );
}

function toYarnDetails(yarn: ApiYarn): z.infer<typeof detailsSchema> {
  return {
    ...toYarnSummary(yarn),
    company: yarn.yarn_company?.name ?? yarn.yarn_company_name ?? null,
    fibers: (yarn.yarn_fibers ?? []).flatMap(fiber => {
      const name = fiber.fiber_type?.name;
      if (!name) return [];
      return [fiber.percentage ? `${fiber.percentage}% ${name}` : name];
    }),
    attributes: (yarn.yarn_attributes ?? []).map(attribute => attribute.name),
    texture: yarn.texture ?? null,
    needles: sizeRange(yarn.min_needle_size, yarn.max_needle_size),
    hooks: sizeRange(yarn.min_hook_size, yarn.max_hook_size),
    gauge: gauge(yarn),
    origin: (yarn.yarn_provenance ?? []).flatMap(step =>
      step.country_name ? [`${step.phase_name ?? 'Made'}: ${step.country_name}`] : [],
    ),
    notes: yarn.notes_html ? truncate(htmlToText(yarn.notes_html), MAX_NOTES_LENGTH) : null,
  };
}

function sizeRange(
  min: ApiNeedleSize | null | undefined,
  max: ApiNeedleSize | null | undefined,
): string | null {
  const low = min?.name.replace(/\s+/g, ' ').trim();
  const high = max?.name.replace(/\s+/g, ' ').trim();
  if (low && high && low !== high) return `${low} to ${high}`;
  return low ?? high ?? null;
}

function gauge(yarn: ApiYarn): string | null {
  const { min_gauge: min, max_gauge: max, gauge_divisor: divisor } = yarn;
  if (!min && !max) return null;
  const stitches = min && max && min !== max ? `${min}–${max}` : String(min ?? max);
  return `${stitches} stitches = ${divisor ?? 4} in`;
}
