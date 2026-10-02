import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';

import type { RavelryClient } from '../ravelry/client.ts';
import type { ApiPatternListItem } from '../ravelry/types.ts';
import {
  LANGUAGE_CODES,
  PATTERN_FITS,
  resolveCategory,
  YARN_WEIGHTS,
} from '../ravelry/vocabulary.ts';
import { patternUrl, range } from './format.ts';
import { VIEW_META } from '../view.ts';

const inputSchema = z
  .object({
    query: z
      .string()
      .trim()
      .max(200)
      .optional()
      .describe('Free-text search, e.g. "cabled beanie". Omit to browse by filters alone.'),
    craft: z
      .enum(['knitting', 'crochet', 'machine-knitting', 'loom-knitting'])
      .optional()
      .describe('Only return patterns for this craft. Omit for all crafts.'),
    category: z
      .string()
      .trim()
      .min(2)
      .max(50)
      .optional()
      .describe(
        'What the pattern makes, in plain words: "hat", "socks", "cardigan", "shawl", ' +
          '"blanket", "toy"... The closest Ravelry category is used.',
      ),
    weight: z
      .array(z.enum(YARN_WEIGHTS))
      .min(1)
      .max(4)
      .optional()
      .describe('Yarn weights the pattern is written for (any of them matches).'),
    yardage_min: z.number().int().min(0).optional().describe('Minimum total yardage, in yards.'),
    yardage_max: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        'Maximum total yardage, in yards (1 m ≈ 1.09 yd). Use for "what can I make with ' +
          'the yarn I have".',
      ),
    difficulty_max: z
      .number()
      .int()
      .min(1)
      .max(10)
      .optional()
      .describe('Highest average difficulty rating, 1 (easiest) to 10. Beginner ≈ 3 or less.'),
    fit: z
      .array(z.enum(PATTERN_FITS))
      .min(1)
      .max(4)
      .optional()
      .describe('Who it is sized for (any of them matches).'),
    language: z
      .enum(LANGUAGE_CODES)
      .optional()
      .describe('Language the pattern is written in, as a code: en, fr, de, es, ja, nl...'),
    designer: z
      .string()
      .trim()
      .min(2)
      .max(100)
      .optional()
      .describe('Only patterns by this designer, e.g. "Ysolda Teague".'),
    availability: z
      .enum(['free', 'ravelry', 'online', 'inprint', 'any'])
      .default('free')
      .describe(
        'free = free patterns only (default); ravelry = sold as a Ravelry download; ' +
          'online = available on another website; inprint = in a printed book/magazine; any = no filter.',
      ),
    sort: z
      .enum(['best', 'popularity', 'recently-popular', 'projects', 'favorites', 'date', 'rating'])
      .optional()
      .describe('Result order. Defaults to Ravelry\'s "best match".'),
    page: z.number().int().min(1).default(1).describe('1-based results page.'),
    page_size: z.number().int().min(1).max(50).default(20).describe('Results per page (max 50).'),
  })
  .refine(
    input =>
      input.yardage_min === undefined ||
      input.yardage_max === undefined ||
      input.yardage_min <= input.yardage_max,
    { message: 'yardage_min must not be greater than yardage_max', path: ['yardage_min'] },
  );

export const patternSummarySchema = z.object({
  id: z.number().describe('Pass to get_pattern_details for full information.'),
  name: z.string(),
  url: z.string(),
  free: z.boolean(),
  designer: z.string().nullable(),
  photo_url: z.string().nullable(),
});

export function toPatternSummary(
  pattern: ApiPatternListItem,
): z.infer<typeof patternSummarySchema> {
  return {
    id: pattern.id,
    name: pattern.name,
    url: patternUrl(pattern.permalink),
    free: pattern.free,
    designer: (pattern.designer ?? pattern.pattern_author)?.name ?? null,
    photo_url: pattern.first_photo?.medium_url ?? pattern.first_photo?.small_url ?? null,
  };
}

const outputSchema = z.object({
  patterns: z.array(patternSummarySchema),
  category: z.string().nullable().describe('The Ravelry category the search was filtered to.'),
  page: z.number(),
  page_count: z.number(),
  total_results: z.number(),
});

type SearchOutput = z.infer<typeof outputSchema>;

export function registerSearchPatterns(server: McpServer, ravelry: RavelryClient): void {
  server.registerTool(
    'search_patterns',
    {
      title: 'Search Ravelry patterns',
      description:
        'Search the Ravelry pattern database by keyword and filters: craft, category, yarn ' +
        'weight, yardage, difficulty, fit, language, designer and price. Returns a page of ' +
        'matches; call get_pattern_details with the ids for yarn, gauge, needles and notes.',
      inputSchema,
      outputSchema,
      _meta: VIEW_META,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    async (input, ctx) => {
      const signal = ctx.mcpReq.signal;
      const category = input.category
        ? resolveCategory(input.category, await ravelry.getPatternCategories(signal))
        : undefined;

      const response = await ravelry.searchPatterns(
        {
          query: input.query,
          craft: input.craft,
          pc: category,
          weight: input.weight,
          yardage: range(input.yardage_min, input.yardage_max),
          diff: range(undefined, input.difficulty_max),
          fit: input.fit,
          language: input.language,
          designer: input.designer,
          availability: input.availability === 'any' ? undefined : input.availability,
          sort: input.sort,
          page: input.page,
          page_size: input.page_size,
        },
        signal,
      );

      const output: SearchOutput = {
        patterns: response.patterns.map(toPatternSummary),
        category: category ?? null,
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
}
