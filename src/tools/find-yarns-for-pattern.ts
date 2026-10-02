import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';

import { RavelryApiError, type RavelryClient } from '../ravelry/client.ts';
import { weightPermalink } from '../ravelry/vocabulary.ts';
import { patternUrl } from './format.ts';
import { toYarnSummary, yarnSummarySchema } from './yarns.ts';
import { VIEW_META } from '../view.ts';

const inputSchema = z.object({
  pattern_id: z.number().int().positive().describe('Ravelry pattern id (from search_patterns).'),
  same_weight_only: z
    .boolean()
    .default(false)
    .describe("Only return yarns of the pattern's own yarn weight, the safest substitutes."),
  include_discontinued: z
    .boolean()
    .default(false)
    .describe('Also return yarns that are no longer made.'),
  limit: z.number().int().min(1).max(50).default(15).describe('How many yarns to return.'),
});

const outputSchema = z.object({
  pattern: z.object({
    id: z.number(),
    name: z.string(),
    url: z.string(),
    yarn_weight: z.string().nullable(),
    yardage: z.string().nullable(),
    gauge: z.string().nullable(),
    designer_suggested_yarns: z.array(z.string()).describe('Yarns named in the pattern itself.'),
  }),
  yarns: z
    .array(
      yarnSummarySchema.extend({
        projects_using_it: z.number().describe('Ravelry projects of this pattern made with it.'),
      }),
    )
    .describe('Yarns other people used for this pattern, most used first.'),
  total_yarns_used: z.number().describe('How many different yarns people have used in total.'),
});

export function registerFindYarnsForPattern(server: McpServer, ravelry: RavelryClient): void {
  server.registerTool(
    'find_yarns_for_pattern',
    {
      title: 'Find yarns for a pattern',
      description:
        'Yarn substitution: lists the yarns other Ravelry users actually used to make a ' +
        'pattern, ranked by how many projects used each one, next to the yarn weight, ' +
        'yardage and gauge the pattern calls for and the yarns its designer suggested.',
      inputSchema,
      outputSchema,
      _meta: VIEW_META,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ pattern_id, same_weight_only, include_discontinued, limit }, ctx) => {
      const signal = ctx.mcpReq.signal;
      const [pattern] = await ravelry.getPatterns([pattern_id], signal);
      if (!pattern) {
        throw new RavelryApiError(
          `No pattern with id ${pattern_id}. Check the id with search_patterns.`,
        );
      }

      const weight = weightPermalink(pattern.yarn_weight?.name);
      // The default ("best") order ranks yarns by how many projects used them.
      const response = await ravelry.searchYarns(
        {
          'yarn-ideas-for': pattern.permalink,
          include: 'yarn_ideas_attributes',
          weight: same_weight_only ? weight : undefined,
          discontinued: include_discontinued ? undefined : 'no',
          page_size: limit,
        },
        signal,
      );

      const suggested = (pattern.packs ?? []).flatMap(pack => {
        const name =
          pack.yarn_name ??
          (pack.yarn ? `${pack.yarn.yarn_company_name ?? ''} ${pack.yarn.name}`.trim() : '');
        return name ? [name] : [];
      });

      const output: z.infer<typeof outputSchema> = {
        pattern: {
          id: pattern.id,
          name: pattern.name,
          url: patternUrl(pattern.permalink),
          yarn_weight: pattern.yarn_weight_description ?? pattern.yarn_weight?.name ?? null,
          yardage: pattern.yardage_description ?? null,
          gauge: pattern.gauge_description ?? null,
          designer_suggested_yarns: [...new Set(suggested)],
        },
        yarns: response.yarns.map(yarn => ({
          ...toYarnSummary(yarn),
          projects_using_it: yarn.yarn_ideas_attributes?.projects_count ?? 0,
        })),
        total_yarns_used: response.paginator.results,
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output) }],
        structuredContent: output,
      };
    },
  );
}
