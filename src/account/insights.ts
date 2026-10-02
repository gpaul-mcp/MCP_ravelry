import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';

import type { RavelryClient } from '../ravelry/client.ts';
import type { ApiPattern } from '../ravelry/types.ts';
import { resolveCategory, weightPermalink } from '../ravelry/vocabulary.ts';
import { categoryPath, patternUrl, range, rounded } from '../tools/format.ts';
import { patternSummarySchema, toPatternSummary } from '../tools/search-patterns.ts';
import type { UserContext } from './context.ts';
import { loadStash, patternYardage, type StashEntry, totalsByWeight } from './stash.ts';

const readOnly = { readOnlyHint: true, idempotentHint: true, openWorldHint: true } as const;

const json = <T extends Record<string, unknown>>(output: T) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(output) }],
  structuredContent: output,
});

/** Patterns that use at least this share of the yarn, so suggestions actually use it up. */
const MIN_YARN_SHARE = 0.4;

const toRef = (entry: StashEntry) => ({ id: entry.id, yarn: entry.yarn, yards: entry.yards });

export function registerAccountInsights(server: McpServer, user: UserContext): void {
  registerPatternsForStash(server, user);
  registerPickFromQueue(server, user);
  registerCraftingProfile(server, user);
}

function registerPatternsForStash(server: McpServer, user: UserContext): void {
  const stashRef = z.object({ id: z.number(), yarn: z.string(), yards: z.number().nullable() });

  server.registerTool(
    'find_patterns_for_my_stash',
    {
      title: 'What can I make with my stash?',
      description:
        "Suggests patterns that fit yarn in the signed-in user's stash: same yarn weight, and " +
        `between ${MIN_YARN_SHARE * 100}% and 100% of the yards available. Pass stash_ids (from ` +
        'get_my_stash) to plan around specific yarns; otherwise it uses the three yarn weights ' +
        'the user has the most of.',
      inputSchema: z.object({
        stash_ids: z
          .array(z.number().int().positive())
          .min(1)
          .max(10)
          .optional()
          .describe(
            'Stash entries to combine. Entries of different weights are planned separately.',
          ),
        craft: z.enum(['knitting', 'crochet']).optional(),
        category: z
          .string()
          .trim()
          .min(2)
          .max(50)
          .optional()
          .describe('What to make, e.g. "hat", "shawl", "sweater".'),
        difficulty_max: z.number().int().min(1).max(10).optional(),
        availability: z.enum(['free', 'ravelry', 'any']).default('free'),
        per_weight: z
          .number()
          .int()
          .min(1)
          .max(10)
          .default(5)
          .describe('Patterns per yarn weight.'),
      }),
      outputSchema: z.object({
        groups: z.array(
          z.object({
            weight: z.string(),
            total_yards: z.number(),
            stash: z.array(stashRef),
            total_matches: z.number(),
            patterns: z.array(patternSummarySchema),
          }),
        ),
        skipped: z
          .array(stashRef)
          .describe('Selected entries without a known weight or yardage; add them on Ravelry.'),
        missing_stash_ids: z.array(z.number()),
      }),
      annotations: readOnly,
    },
    async (input, ctx) => {
      const signal = ctx.mcpReq.signal;
      const stash = await loadStash(user, signal);
      const selected = input.stash_ids
        ? stash.filter(entry => input.stash_ids?.includes(entry.id))
        : stash;
      const groups = totalsByWeight(selected).slice(0, input.stash_ids ? undefined : 3);
      const category = input.category
        ? resolveCategory(input.category, await user.publicRavelry.getPatternCategories(signal))
        : undefined;

      const results = await Promise.all(
        groups.map(async group => {
          const response = await user.publicRavelry.searchPatterns(
            {
              weight: group.weight,
              yardage: range(Math.round(group.yards * MIN_YARN_SHARE), group.yards),
              craft: input.craft,
              pc: category,
              diff: range(undefined, input.difficulty_max),
              availability: input.availability === 'any' ? undefined : input.availability,
              sort: 'popularity',
              page_size: input.per_weight,
            },
            signal,
          );
          return {
            weight: group.weight,
            total_yards: group.yards,
            stash: group.entries.map(toRef),
            total_matches: response.paginator.results,
            patterns: response.patterns.map(toPatternSummary),
          };
        }),
      );

      const found = new Set(stash.map(entry => entry.id));
      return json({
        groups: results,
        skipped: selected.filter(entry => !entry.weight || !entry.yards).map(toRef),
        missing_stash_ids: (input.stash_ids ?? []).filter(id => !found.has(id)),
      });
    },
  );
}

const VERDICTS = ['planned_yarn_in_stash', 'enough_in_stash', 'unknown', 'need_yarn'] as const;

function registerPickFromQueue(server: McpServer, user: UserContext): void {
  server.registerTool(
    'pick_from_my_queue',
    {
      title: 'What can I start from my queue?',
      description:
        "Checks the signed-in user's queue against their stash. For each queued pattern it " +
        'compares the yarn weight and yardage the pattern needs with the yarn they own, and ' +
        'ranks patterns they can start now first.',
      inputSchema: z.object({
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(15)
          .describe('How many queued patterns to check.'),
      }),
      outputSchema: z.object({
        candidates: z.array(
          z.object({
            verdict: z
              .enum(VERDICTS)
              .describe(
                'planned_yarn_in_stash: the yarn noted in the queue is in the stash in sufficient ' +
                  'amount; enough_in_stash: other stash yarn of the right weight covers it; ' +
                  'unknown: the pattern does not list weight or yardage; need_yarn: not enough.',
              ),
            queue_position: z.number().nullable(),
            pattern_id: z.number(),
            pattern: z.string(),
            url: z.string(),
            weight: z.string().nullable(),
            yards_needed: z.string().nullable().describe('Smallest to largest size.'),
            yards_available: z.number().describe('Stash yards of the same weight.'),
            shortfall_yards: z.number().nullable(),
            planned_yarn: z.string().nullable(),
            matching_stash: z.array(
              z.object({ id: z.number(), yarn: z.string(), yards: z.number().nullable() }),
            ),
          }),
        ),
        queue_size: z.number(),
      }),
      annotations: readOnly,
    },
    async ({ limit }, ctx) => {
      const signal = ctx.mcpReq.signal;
      const [queue, stash] = await Promise.all([
        user.ravelry.listQueue(user.username, { page: 1, page_size: limit }, signal),
        loadStash(user, signal),
      ]);
      const patternIds = [
        ...new Set(queue.queued_projects.map(item => Number(item.pattern_id)).filter(id => id > 0)),
      ];
      const patterns = new Map(
        (await getPatternsInBatches(user.publicRavelry, patternIds, signal)).map(p => [p.id, p]),
      );
      const totals = new Map(totalsByWeight(stash).map(total => [total.weight, total]));

      const candidates = queue.queued_projects.flatMap(item => {
        const pattern = patterns.get(Number(item.pattern_id));
        if (!pattern) return [];
        const weight = weightPermalink(pattern.yarn_weight?.name) ?? null;
        const need = patternYardage(pattern);
        const sameWeight = weight ? totals.get(weight) : undefined;
        const available = sameWeight?.yards ?? 0;
        const plannedYards = stash
          .filter(entry => item.yarn_id && entry.yarn_id === Number(item.yarn_id))
          .reduce((sum, entry) => sum + (entry.yards ?? 0), 0);

        let verdict: (typeof VERDICTS)[number];
        if (need.min && plannedYards >= need.min) verdict = 'planned_yarn_in_stash';
        else if (!need.min || !weight) verdict = 'unknown';
        else if (available >= need.min) verdict = 'enough_in_stash';
        else verdict = 'need_yarn';

        return [
          {
            verdict,
            queue_position: item.position_in_queue ?? null,
            pattern_id: pattern.id,
            pattern: pattern.name,
            url: patternUrl(pattern.permalink),
            weight,
            yards_needed: need.min
              ? need.max !== need.min
                ? `${need.min}–${need.max}`
                : `${need.min}`
              : null,
            yards_available: available,
            shortfall_yards: verdict === 'need_yarn' && need.min ? need.min - available : null,
            planned_yarn: item.yarn_name ?? null,
            matching_stash: (sameWeight?.entries ?? [])
              .toSorted((a, b) => (b.yards ?? 0) - (a.yards ?? 0))
              .slice(0, 3)
              .map(toRef),
          },
        ];
      });

      candidates.sort(
        (a, b) =>
          VERDICTS.indexOf(a.verdict) - VERDICTS.indexOf(b.verdict) ||
          (a.queue_position ?? Infinity) - (b.queue_position ?? Infinity),
      );
      return json({ candidates, queue_size: queue.paginator.results });
    },
  );
}

function registerCraftingProfile(server: McpServer, user: UserContext): void {
  const counted = z.array(z.object({ name: z.string(), count: z.number() }));

  server.registerTool(
    'get_my_crafting_profile',
    {
      title: 'My crafting profile',
      description:
        'A summary of the signed-in user as a maker, built from their Ravelry projects, stash, ' +
        'queue and favorites: crafts, what they make most, yarn weights they use, difficulty ' +
        'they handle, and what they have on hand. Use it to personalize advice; `summary` is a ' +
        'short paragraph suitable for remembering.',
      inputSchema: z.object({}),
      outputSchema: z.object({
        username: z.string(),
        projects: z.object({
          total: z.number(),
          by_status: counted,
          by_craft: counted,
          recent_finished: z.array(
            z.object({
              name: z.string(),
              pattern: z.string().nullable(),
              completed: z.string().nullable(),
            }),
          ),
        }),
        favourite_categories: counted,
        yarn_weights_used: counted,
        difficulty: z.object({
          average_finished: z.number().nullable(),
          hardest_finished: z.number().nullable(),
          estimated_level: z.string(),
        }),
        stash: z.object({ entries: z.number(), total_yards: z.number(), yards_by_weight: counted }),
        queue_size: z.number(),
        favorites_count: z.number(),
        summary: z.string(),
      }),
      annotations: readOnly,
    },
    async (_input, ctx) => {
      const signal = ctx.mcpReq.signal;
      const [projectsResponse, stash, queue, favorites] = await Promise.all([
        user.ravelry.listProjects(
          user.username,
          { sort: 'created_', page: 1, page_size: 1000 },
          signal,
        ),
        loadStash(user, signal),
        user.ravelry.listQueue(user.username, { page: 1, page_size: 1 }, signal),
        user.ravelry.listFavorites(user.username, { page: 1, page_size: 1 }, signal),
      ]);
      const projects = projectsResponse.projects;
      const finished = projects.filter(p => p.status_name?.toLowerCase() === 'finished');

      // Look at the patterns behind the most recent projects (finished and in progress).
      const recentIds = [
        ...new Set(projects.map(p => p.pattern_id).filter((id): id is number => !!id)),
      ].slice(0, 40);
      const patterns = new Map(
        (await getPatternsInBatches(user.publicRavelry, recentIds, signal)).map(p => [p.id, p]),
      );
      const recentPatterns = [...patterns.values()];
      const finishedDifficulties = finished
        .map(p => (p.pattern_id ? patterns.get(p.pattern_id)?.difficulty_average : undefined))
        .filter((d): d is number => typeof d === 'number' && d > 0);
      const average = finishedDifficulties.length
        ? finishedDifficulties.reduce((a, b) => a + b, 0) / finishedDifficulties.length
        : null;
      const hardest = finishedDifficulties.length ? Math.max(...finishedDifficulties) : null;

      const output = {
        username: user.username,
        projects: {
          total: projects.length,
          by_status: count(projects.map(p => p.status_name)),
          by_craft: count(projects.map(p => p.craft_name)),
          recent_finished: finished
            .toSorted((a, b) => (b.completed ?? '').localeCompare(a.completed ?? ''))
            .slice(0, 5)
            .map(p => ({
              name: p.name,
              pattern: p.pattern_name ?? null,
              completed: p.completed ?? null,
            })),
        },
        favourite_categories: count(
          recentPatterns.map(p => {
            const first = p.pattern_categories?.[0];
            return first ? categoryPath(first).split(' > ').slice(-2).join(' > ') : undefined;
          }),
        ).slice(0, 6),
        yarn_weights_used: count(recentPatterns.map(p => p.yarn_weight?.name)).slice(0, 6),
        difficulty: {
          average_finished: rounded(average),
          hardest_finished: rounded(hardest),
          estimated_level: estimateLevel(finished.length, average, hardest),
        },
        stash: {
          entries: stash.length,
          total_yards: stash.reduce((sum, entry) => sum + (entry.yards ?? 0), 0),
          yards_by_weight: totalsByWeight(stash).map(t => ({ name: t.weight, count: t.yards })),
        },
        queue_size: queue.paginator.results,
        favorites_count: favorites.paginator.results,
        summary: '',
      };
      output.summary = summarize(output, stash);
      return json(output);
    },
  );
}

async function getPatternsInBatches(
  ravelry: RavelryClient,
  ids: readonly number[],
  signal: AbortSignal,
): Promise<ApiPattern[]> {
  const batches: number[][] = [];
  for (let i = 0; i < ids.length; i += 20) batches.push(ids.slice(i, i + 20));
  return (await Promise.all(batches.map(batch => ravelry.getPatterns(batch, signal)))).flat();
}

function count(values: readonly (string | null | undefined)[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const value of values) if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].map(([name, n]) => ({ name, count: n })).sort((a, b) => b.count - a.count);
}

function estimateLevel(finished: number, average: number | null, hardest: number | null): string {
  if (finished >= 30 && (hardest ?? 0) >= 6) return 'experienced';
  if (finished >= 10 && (average ?? 0) >= 3) return 'intermediate';
  if (finished >= 3) return 'advanced beginner';
  return 'beginner';
}

function summarize(
  profile: {
    username: string;
    projects: { total: number; by_craft: { name: string }[] };
    favourite_categories: { name: string }[];
    yarn_weights_used: { name: string }[];
    difficulty: { estimated_level: string };
    queue_size: number;
  },
  stash: readonly StashEntry[],
): string {
  const crafts =
    profile.projects.by_craft.map(c => c.name.toLowerCase()).join(' and ') || 'crafting';
  const makes = profile.favourite_categories.slice(0, 3).map(c => c.name.toLowerCase());
  const weights = profile.yarn_weights_used.slice(0, 2).map(w => w.name);
  return [
    `Ravelry user ${profile.username}: ${profile.difficulty.estimated_level} at ${crafts} with ${profile.projects.total} projects.`,
    makes.length ? `Mostly makes ${makes.join(', ')}.` : '',
    weights.length ? `Usually works in ${weights.join(' and ')} weight yarn.` : '',
    `Has ${stash.length} yarns in stash and ${profile.queue_size} patterns queued.`,
  ]
    .filter(Boolean)
    .join(' ');
}
