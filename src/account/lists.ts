import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';

import { YARN_WEIGHTS } from '../ravelry/vocabulary.ts';
import { nonEmpty, truncate } from '../tools/format.ts';
import type { UserContext } from './context.ts';
import { loadStash, stashEntrySchema } from './stash.ts';
import { VIEW_META } from '../view.ts';

const readOnly = { readOnlyHint: true, idempotentHint: true, openWorldHint: true } as const;

const json = <T extends Record<string, unknown>>(output: T) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(output) }],
  structuredContent: output,
});

const pageInput = {
  page: z.number().int().min(1).default(1).describe('1-based results page.'),
  page_size: z.number().int().min(1).max(100).default(50).describe('Results per page (max 100).'),
};

const pageOutput = {
  page: z.number(),
  page_count: z.number(),
  total_results: z.number(),
};

/** Read-only views of the signed-in user's own Ravelry data. */
export function registerAccountLists(server: McpServer, user: UserContext): void {
  server.registerTool(
    'get_my_stash',
    {
      title: 'My Ravelry stash',
      description:
        "The signed-in user's yarn stash: each yarn with its weight, colorway, skeins and total " +
        'yards, plus totals per yarn weight. Used-up yarn is left out.',
      inputSchema: z.object({
        weight: z
          .array(z.enum(YARN_WEIGHTS))
          .min(1)
          .optional()
          .describe('Only yarn of these weights.'),
        search: z
          .string()
          .trim()
          .max(100)
          .optional()
          .describe('Only entries whose yarn or colorway contains this text.'),
      }),
      outputSchema: z.object({
        stash: z.array(stashEntrySchema),
        yards_by_weight: z.record(z.string(), z.number()),
        total_entries: z.number(),
      }),
      _meta: VIEW_META,
      annotations: readOnly,
    },
    async ({ weight, search }, ctx) => {
      const needle = search?.toLowerCase();
      const stash = (await loadStash(user, ctx.mcpReq.signal)).filter(
        entry =>
          (!weight || (entry.weight !== null && (weight as string[]).includes(entry.weight))) &&
          (!needle || `${entry.yarn} ${entry.colorway ?? ''}`.toLowerCase().includes(needle)),
      );
      const yardsByWeight: Record<string, number> = {};
      for (const entry of stash) {
        if (entry.weight && entry.yards) {
          yardsByWeight[entry.weight] = (yardsByWeight[entry.weight] ?? 0) + entry.yards;
        }
      }
      return json({ stash, yards_by_weight: yardsByWeight, total_entries: stash.length });
    },
  );

  server.registerTool(
    'get_my_queue',
    {
      title: 'My Ravelry queue',
      description:
        "The signed-in user's queue of patterns they plan to make, in queue order, with the yarn " +
        'they noted for each. Use pick_from_my_queue to see which ones their stash can cover.',
      inputSchema: z.object({
        search: z.string().trim().max(100).optional().describe('Full-text search in the queue.'),
        ...pageInput,
      }),
      outputSchema: z.object({
        queue: z.array(
          z.object({
            id: z.number(),
            position: z.number().nullable(),
            pattern_id: z.number().nullable().describe('For get_pattern_details.'),
            pattern: z.string().nullable(),
            designer: z.string().nullable(),
            planned_yarn: z.string().nullable(),
            planned_skeins: z.number().nullable(),
            notes: z.string().nullable(),
          }),
        ),
        ...pageOutput,
      }),
      annotations: readOnly,
    },
    async ({ search, page, page_size }, ctx) => {
      const response = await user.ravelry.listQueue(
        user.username,
        { query: search, page, page_size },
        ctx.mcpReq.signal,
      );
      return json({
        queue: response.queued_projects.map(item => ({
          id: item.id,
          position: item.position_in_queue ?? null,
          pattern_id: item.pattern_id ? Number(item.pattern_id) : null,
          pattern: nonEmpty(item.pattern_name ?? item.name ?? null),
          designer: nonEmpty(item.pattern_author_name ?? null),
          planned_yarn: nonEmpty(item.yarn_name ?? null),
          planned_skeins: item.skeins ?? null,
          notes: item.notes ? truncate(item.notes, 500) : null,
        })),
        page: response.paginator.page,
        page_count: response.paginator.page_count,
        total_results: response.paginator.results,
      });
    },
  );

  server.registerTool(
    'get_my_projects',
    {
      title: 'My Ravelry projects',
      description:
        "The signed-in user's projects (things they made or are making): pattern, craft, status, " +
        'progress, dates and their rating. Newest first.',
      inputSchema: z.object({
        status: z
          .enum(['in-progress', 'finished', 'hibernating', 'frogged'])
          .optional()
          .describe('Only projects with this status.'),
        ...pageInput,
      }),
      outputSchema: z.object({
        projects: z.array(
          z.object({
            id: z.number(),
            name: z.string(),
            pattern_id: z.number().nullable(),
            pattern: z.string().nullable(),
            craft: z.string().nullable(),
            status: z.string().nullable(),
            progress: z.number().nullable().describe('Percent complete.'),
            started: z.string().nullable(),
            completed: z.string().nullable(),
            rating: z.number().nullable().describe("The user's own rating, 0–4."),
            size: z.string().nullable(),
            made_for: z.string().nullable(),
            url: z.string().nullable(),
          }),
        ),
        ...pageOutput,
      }),
      annotations: readOnly,
    },
    async ({ status, page, page_size }, ctx) => {
      // Ravelry cannot filter by status, so with a filter fetch everything and page locally.
      const response = await user.ravelry.listProjects(
        user.username,
        status
          ? { sort: 'created_', page: 1, page_size: 1000 }
          : { sort: 'created_', page, page_size },
        ctx.mcpReq.signal,
      );
      const wanted = status?.replace('-', ' ');
      const matching = wanted
        ? response.projects.filter(project => project.status_name?.toLowerCase() === wanted)
        : response.projects;
      const pageItems = wanted
        ? matching.slice((page - 1) * page_size, page * page_size)
        : matching;
      const paging = wanted
        ? {
            page,
            page_count: Math.max(1, Math.ceil(matching.length / page_size)),
            total_results: matching.length,
          }
        : {
            page: response.paginator.page,
            page_count: response.paginator.page_count,
            total_results: response.paginator.results,
          };
      return json({
        ...paging,
        projects: pageItems.map(project => ({
          id: project.id,
          name: project.name,
          pattern_id: project.pattern_id ?? null,
          pattern: nonEmpty(project.pattern_name ?? null),
          craft: nonEmpty(project.craft_name ?? null),
          status: nonEmpty(project.status_name ?? null),
          progress: project.progress ?? null,
          started: nonEmpty(project.started ?? null),
          completed: nonEmpty(project.completed ?? null),
          rating: project.rating ?? null,
          size: nonEmpty(project.size ?? null),
          made_for: nonEmpty(project.made_for ?? null),
          url: project.links?.self?.href ?? null,
        })),
      });
    },
  );

  server.registerTool(
    'get_my_favorites',
    {
      title: 'My Ravelry favorites',
      description:
        'Things the signed-in user favorited on Ravelry (patterns, yarns, designers, projects...), ' +
        'newest first, with their comment and tags.',
      inputSchema: z.object({
        types: z
          .array(
            z.enum(['pattern', 'yarn', 'designer', 'project', 'stash', 'yarnbrand', 'yarnshop']),
          )
          .min(1)
          .optional()
          .describe('Only these kinds of favorites. Omit for all.'),
        search: z.string().trim().max(100).optional().describe('Full-text search in favorites.'),
        ...pageInput,
      }),
      outputSchema: z.object({
        favorites: z.array(
          z.object({
            type: z.string(),
            id: z.number().nullable().describe('Pattern or yarn id, for the details tools.'),
            name: z.string().nullable(),
            by: z.string().nullable().describe('Designer or yarn brand.'),
            free: z.boolean().nullable(),
            comment: z.string().nullable(),
            tags: z.string().nullable(),
          }),
        ),
        ...pageOutput,
      }),
      annotations: readOnly,
    },
    async ({ types, search, page, page_size }, ctx) => {
      const response = await user.ravelry.listFavorites(
        user.username,
        { types: types?.join(' '), query: search, page, page_size },
        ctx.mcpReq.signal,
      );
      return json({
        favorites: response.favorites.map(favorite => {
          const item = favorite.favorited;
          return {
            type: favorite.type,
            id: item?.id ?? null,
            name: nonEmpty(item?.name ?? item?.title ?? null),
            by: nonEmpty(
              item?.designer?.name ?? item?.pattern_author?.name ?? item?.yarn_company_name ?? null,
            ),
            free: item?.free ?? null,
            comment: nonEmpty(favorite.comment ?? null),
            tags: nonEmpty(favorite.tag_list ?? null),
          };
        }),
        page: response.paginator.page,
        page_count: response.paginator.page_count,
        total_results: response.paginator.results,
      });
    },
  );

  server.registerTool(
    'search_my_library',
    {
      title: 'My Ravelry library',
      description:
        "Patterns, books and magazines in the signed-in user's Ravelry library (bought, " +
        'downloaded or saved).',
      inputSchema: z.object({
        search: z.string().trim().max(100).optional().describe('Full-text search.'),
        type: z
          .enum(['pattern', 'pdf', 'book', 'magazine', 'booklet'])
          .optional()
          .describe('Only this kind of item; "pdf" means Ravelry downloads.'),
        ...pageInput,
      }),
      outputSchema: z.object({
        library: z.array(
          z.object({
            title: z.string(),
            author: z.string().nullable(),
            pattern_id: z.number().nullable().describe('For single patterns: get_pattern_details.'),
            patterns_count: z.number().nullable(),
            downloadable: z.boolean().nullable(),
          }),
        ),
        ...pageOutput,
      }),
      annotations: readOnly,
    },
    async ({ search, type, page, page_size }, ctx) => {
      const response = await user.ravelry.searchLibrary(
        user.username,
        { query: search, type, sort: 'added_', page, page_size },
        ctx.mcpReq.signal,
      );
      return json({
        library: response.volumes.map(volume => ({
          title: volume.title,
          author: nonEmpty(volume.author_name ?? null),
          pattern_id: volume.pattern_id ?? null,
          patterns_count: volume.patterns_count ?? null,
          downloadable: volume.has_downloads ?? null,
        })),
        page: response.paginator.page,
        page_count: response.paginator.page_count,
        total_results: response.paginator.results,
      });
    },
  );
}
