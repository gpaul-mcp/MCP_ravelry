import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';

import { attributeName } from '../ravelry/attributes.ts';
import type { RavelryClient } from '../ravelry/client.ts';
import type { ApiPattern } from '../ravelry/types.ts';
import { categoryPath, nonEmpty, patternUrl, rounded, truncate } from './format.ts';

const MAX_IDS = 20;
const MAX_NOTES_LENGTH = 4_000;

const inputSchema = z.object({
  ids: z
    .array(z.number().int().positive())
    .min(1)
    .max(MAX_IDS)
    .describe(`Ravelry pattern ids (from search_patterns), 1 to ${MAX_IDS} per call.`),
});

const patternSchema = z.object({
  id: z.number(),
  name: z.string(),
  url: z.string(),
  designer: z.string().nullable(),
  craft: z.string().nullable(),
  pattern_type: z.string().nullable(),
  categories: z.array(z.string()),
  free: z.boolean(),
  price: z.string().nullable().describe('Price with currency, null when free or unknown.'),
  download_url: z.string().nullable(),
  published: z.string().nullable(),
  difficulty: z.number().nullable().describe('Average difficulty rating, 1 (easy) to 10 (hard).'),
  rating: z.number().nullable().describe('Average rating out of 5.'),
  rating_count: z.number().nullable(),
  projects_count: z.number().nullable(),
  favorites_count: z.number().nullable(),
  yarn_weight: z.string().nullable(),
  yardage: z.string().nullable(),
  gauge: z.string().nullable(),
  gauge_per_10cm: z
    .object({ stitches: z.number(), rows: z.number().nullable() })
    .nullable()
    .describe('The gauge as numbers, per 10 cm / 4 in, for adjust_for_gauge.'),
  terminology: z
    .enum(['US', 'UK', 'US and UK'])
    .nullable()
    .describe('Crochet terms the pattern is written in: UK "dc" is US "sc".'),
  attributes: z
    .array(z.string())
    .describe('Techniques and construction, e.g. "top down", "cables", "chart".'),
  needles_or_hooks: z.array(z.string()),
  sizes_available: z.string().nullable(),
  languages: z.array(z.string()),
  photo_url: z.string().nullable(),
  notes: z.string().nullable().describe('Designer notes, truncated when very long.'),
});

const outputSchema = z.object({
  patterns: z.array(patternSchema),
  missing_ids: z.array(z.number()).describe('Requested ids Ravelry returned nothing for.'),
});

type PatternDetails = z.infer<typeof patternSchema>;
type DetailsOutput = z.infer<typeof outputSchema>;

export function registerGetPatternDetails(server: McpServer, ravelry: RavelryClient): void {
  server.registerTool(
    'get_pattern_details',
    {
      title: 'Get Ravelry pattern details',
      description:
        'Get full details for one or more Ravelry patterns by id: designer, price, difficulty, ' +
        'rating, yarn weight, yardage, gauge, needle/hook sizes, sizes, techniques, crochet ' +
        'terminology (US/UK), and the designer notes.',
      inputSchema,
      outputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ ids }, ctx) => {
      const uniqueIds = [...new Set(ids)];
      const patterns = await ravelry.getPatterns(uniqueIds, ctx.mcpReq.signal);
      const found = new Set(patterns.map(pattern => pattern.id));

      const output: DetailsOutput = {
        patterns: patterns.map(toDetails),
        missing_ids: uniqueIds.filter(id => !found.has(id)),
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output) }],
        structuredContent: output,
      };
    },
  );
}

function toDetails(pattern: ApiPattern): PatternDetails {
  const yardage =
    nonEmpty(pattern.yardage_description) ??
    (pattern.yardage
      ? `${pattern.yardage}${pattern.yardage_max ? `–${pattern.yardage_max}` : ''} yards`
      : null);

  return {
    id: pattern.id,
    name: pattern.name,
    url: patternUrl(pattern.permalink),
    designer: pattern.pattern_author?.name ?? null,
    craft: pattern.craft?.name ?? null,
    pattern_type: pattern.pattern_type?.name ?? null,
    categories: (pattern.pattern_categories ?? []).map(categoryPath),
    free: pattern.free,
    price:
      !pattern.free && pattern.price != null
        ? `${pattern.price} ${pattern.currency ?? ''}`.trim()
        : null,
    download_url: pattern.download_location?.url ?? pattern.url ?? null,
    published: pattern.published ?? null,
    difficulty: rounded(nonEmpty(pattern.difficulty_average)),
    rating: rounded(nonEmpty(pattern.rating_average), 2),
    rating_count: pattern.rating_count ?? null,
    projects_count: pattern.projects_count ?? null,
    favorites_count: pattern.favorites_count ?? null,
    yarn_weight: nonEmpty(pattern.yarn_weight_description) ?? nonEmpty(pattern.yarn_weight?.name),
    yardage,
    gauge: nonEmpty(pattern.gauge_description),
    gauge_per_10cm: gaugePer10cm(pattern),
    terminology: terminology(pattern),
    attributes: (pattern.pattern_attributes ?? []).map(a => attributeName(a.permalink)),
    needles_or_hooks: (pattern.pattern_needle_sizes ?? []).map(size => size.name),
    sizes_available: nonEmpty(pattern.sizes_available),
    languages: (pattern.languages ?? []).map(language => language.name),
    photo_url: pattern.photos?.[0]?.medium_url ?? null,
    notes: pattern.notes ? truncate(pattern.notes, MAX_NOTES_LENGTH) : null,
  };
}

/** Ravelry stores gauge per `gauge_divisor` inches; 4 in ≈ 10 cm, as on ball bands. */
export function gaugePer10cm(
  pattern: ApiPattern,
): { stitches: number; rows: number | null } | null {
  // 0 or missing means Ravelry's default, 4 inches.
  const per = pattern.gauge_divisor === 0 ? 4 : (pattern.gauge_divisor ?? 4);
  if (!pattern.gauge) return null;
  const scale = (value: number) => Math.round((value * 4 * 10) / per) / 10;
  return {
    stitches: scale(pattern.gauge),
    rows: pattern.row_gauge ? scale(pattern.row_gauge) : null,
  };
}

function terminology(pattern: ApiPattern): 'US' | 'UK' | 'US and UK' | null {
  if (pattern.has_us_terminology && pattern.has_uk_terminology) return 'US and UK';
  if (pattern.has_uk_terminology) return 'UK';
  if (pattern.has_us_terminology) return 'US';
  return null;
}
