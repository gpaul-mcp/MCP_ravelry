import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';

import { RavelryApiError } from '../ravelry/client.ts';
import type { ApiPattern } from '../ravelry/types.ts';
import { weightPermalink } from '../ravelry/vocabulary.ts';
import { patternUrl, yarnUrl } from '../tools/format.ts';
import { skeinsFor } from '../toolbox/math.ts';
import type { UserContext } from './context.ts';
import {
  addDays,
  daysBetween,
  finishedWithYardage,
  getPatternsInBatches,
  isFinished,
  isoDate,
  loadProjects,
  loadQueue,
  type Pace,
  paceFrom,
  packYards,
  today,
} from './data.ts';
import { loadStash, patternYardage, totalsByWeight } from './stash.ts';

const readOnly = { readOnlyHint: true, idempotentHint: true, openWorldHint: true } as const;

const json = <T extends Record<string, unknown>>(output: T) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(output) }],
  structuredContent: output,
});

const YARDS_PER_MILE = 1760;
/** Queued longer than this is worth a second look. */
const STALE_YEARS = 2;
/** Free yards below this are leftovers: scrap projects, not a garment. */
const LEFTOVER_YARDS = 60;

const paceSchema = z
  .object({
    yards_per_day: z.number().describe('Median yards per calendar day, breaks included.'),
    slow: z.number(),
    fast: z.number(),
    based_on: z.number().describe('Finished projects used.'),
  })
  .nullable();

export function registerPlanningTools(server: McpServer, user: UserContext): void {
  registerEstimateFinish(server, user);
  registerShoppingList(server, user);
  registerQueueReview(server, user);
  registerStashAudit(server, user);
}

/** The user's pace from their last finished projects. */
async function loadPace(user: UserContext, signal: AbortSignal) {
  const projects = await loadProjects(user, signal);
  const finished = await finishedWithYardage(user, projects, signal);
  return { projects, finished, pace: paceFrom(finished) };
}

function registerEstimateFinish(server: McpServer, user: UserContext): void {
  server.registerTool(
    'estimate_finish_date',
    {
      title: 'When will I finish?',
      description:
        'Predicts when the signed-in user finishes a pattern or a project in progress, from their ' +
        'own pace (yards per day over their recent finished projects, breaks included). With a ' +
        'deadline (e.g. a birthday), says whether it is comfortable, tight or unlikely and what ' +
        'pace it would take. Pass yards_per_day when the user has no finished projects yet.',
      inputSchema: z.object({
        pattern_id: z.number().int().positive().optional(),
        project_id: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('A project in progress: only what is left is counted.'),
        yards: z.number().positive().optional().describe('Yardage to knit, if no pattern.'),
        size: z.enum(['smallest', 'largest']).default('smallest'),
        start: z.iso.date().optional().describe('YYYY-MM-DD, default today.'),
        deadline: z.iso.date().optional().describe('YYYY-MM-DD the piece is needed by.'),
        yards_per_day: z
          .number()
          .positive()
          .optional()
          .describe("Override the user's measured pace."),
      }),
      outputSchema: z.object({
        what: z.string(),
        url: z.string().nullable(),
        yards_to_go: z.number(),
        pace: paceSchema,
        estimate: z.object({
          days: z.number(),
          finish_date: z.string(),
          if_fast: z.string().nullable(),
          if_slow: z.string().nullable(),
        }),
        deadline: z
          .object({
            date: z.string(),
            days_available: z.number(),
            yards_per_day_needed: z.number(),
            verdict: z.enum(['comfortable', 'tight', 'unlikely', 'past']),
          })
          .nullable(),
        recent_projects: z.array(
          z.object({ name: z.string(), days: z.number(), yards: z.number().nullable() }),
        ),
        notes: z.array(z.string()),
      }),
      annotations: readOnly,
    },
    async (input, ctx) => {
      const signal = ctx.mcpReq.signal;
      const notes: string[] = [];
      let what = 'This project';
      let url: string | null = null;
      let yardsToGo = input.yards ?? null;
      let start = input.start ?? today();

      const { finished, pace: measured } = await loadPace(user, signal);
      if (input.project_id) {
        const { project } = await user.ravelry.getProject(user.username, input.project_id, signal);
        what = project.name;
        url = project.links?.self?.href ?? null;
        const [pattern] = project.pattern_id
          ? await user.publicRavelry.getPatterns([project.pattern_id], signal)
          : [];
        const need = pattern ? pick(pattern, input.size) : null;
        const used = (project.packs ?? []).reduce((sum, pack) => sum + (packYards(pack) ?? 0), 0);
        if (yardsToGo === null && need) {
          yardsToGo = project.progress
            ? need * (1 - project.progress / 100)
            : Math.max(0, need - used);
          notes.push(
            project.progress
              ? `Counted from the project's ${project.progress}% progress.`
              : 'Counted from the yarn logged on the project so far; log progress for a better estimate.',
          );
        }
        if (!input.start) start = today();
      } else if (input.pattern_id) {
        const [pattern] = await user.publicRavelry.getPatterns([input.pattern_id], signal);
        if (!pattern) throw new RavelryApiError(`No pattern with id ${input.pattern_id}.`);
        what = pattern.name;
        url = patternUrl(pattern.permalink);
        yardsToGo ??= pick(pattern, input.size);
      }
      if (yardsToGo === null) {
        throw new RavelryApiError(
          'Unknown yardage: pass yards (from the pattern) to estimate this one.',
        );
      }

      const pace: Pace | null = input.yards_per_day
        ? {
            yards_per_day: input.yards_per_day,
            slow: input.yards_per_day,
            fast: input.yards_per_day,
            based_on: 0,
          }
        : measured;
      if (!pace) {
        throw new RavelryApiError(
          "Not enough finished projects with dates and yardage to know the user's pace. Ask " +
            'how long a similar project took them and pass yards_per_day.',
        );
      }
      if (finished.some(project => project.yards_source === 'pattern')) {
        notes.push('Some past projects have no yarn recorded, so their pattern yardage was used.');
      }

      const days = Math.ceil(yardsToGo / pace.yards_per_day);
      const deadline = input.deadline
        ? (() => {
            const available = daysBetween(start, input.deadline) ?? -1;
            const needed = available > 0 ? yardsToGo / available : Infinity;
            const verdict =
              available <= 0
                ? 'past'
                : needed <= pace.slow
                  ? 'comfortable'
                  : needed <= pace.fast
                    ? 'tight'
                    : 'unlikely';
            return {
              date: input.deadline,
              days_available: Math.max(0, available),
              yards_per_day_needed: Number.isFinite(needed) ? Math.round(needed * 10) / 10 : 0,
              verdict,
            } as const;
          })()
        : null;

      return json({
        what,
        url,
        yards_to_go: Math.round(yardsToGo),
        pace: pace.based_on ? pace : null,
        estimate: {
          days,
          finish_date: addDays(start, days),
          if_fast: pace.based_on ? addDays(start, Math.ceil(yardsToGo / pace.fast)) : null,
          if_slow: pace.based_on ? addDays(start, Math.ceil(yardsToGo / pace.slow)) : null,
        },
        deadline,
        recent_projects: finished
          .slice(0, 8)
          .map(project => ({ name: project.name, days: project.days, yards: project.yards })),
        notes,
      });
    },
  );
}

function pick(pattern: ApiPattern, size: 'smallest' | 'largest'): number | null {
  const need = patternYardage(pattern);
  return size === 'largest' ? need.max : need.min;
}

function registerShoppingList(server: McpServer, user: UserContext): void {
  server.registerTool(
    'plan_yarn_shopping',
    {
      title: 'Yarn shopping list',
      description:
        'Builds a shopping list for patterns the signed-in user wants to make (queued or any): ' +
        'what each needs, what their stash already covers (same weight, free yarn only, each ' +
        'yard used once), and what is left to buy per pattern and per yarn weight, in skeins ' +
        'of the planned yarn when known. Then find_yarn_shops can find where to buy it.',
      inputSchema: z
        .object({
          queued_ids: z
            .array(z.number().int().positive())
            .max(15)
            .optional()
            .describe('From get_my_queue.'),
          pattern_ids: z.array(z.number().int().positive()).max(15).optional(),
          size: z.enum(['smallest', 'largest']).default('smallest'),
          use_stash: z.boolean().default(true),
          margin_percent: z.number().min(0).max(50).default(10),
        })
        .refine(input => (input.queued_ids?.length ?? 0) + (input.pattern_ids?.length ?? 0) > 0, {
          message: 'Give queued_ids or pattern_ids',
          path: ['pattern_ids'],
        }),
      outputSchema: z.object({
        patterns: z.array(
          z.object({
            pattern_id: z.number(),
            pattern: z.string(),
            url: z.string(),
            weight: z.string().nullable(),
            yards_needed: z.number().nullable(),
            from_stash: z.array(
              z.object({ stash_id: z.number(), yarn: z.string(), yards: z.number() }),
            ),
            yards_to_buy: z.number().nullable(),
            planned_yarn: z
              .object({
                id: z.number(),
                name: z.string(),
                url: z.string(),
                skeins_to_buy: z.number().nullable(),
              })
              .nullable(),
          }),
        ),
        to_buy_by_weight: z.array(z.object({ weight: z.string(), yards: z.number() })),
        unknown: z.array(z.string()).describe('Patterns without weight or yardage on Ravelry.'),
        notes: z.array(z.string()),
      }),
      annotations: readOnly,
    },
    async (input, ctx) => {
      const signal = ctx.mcpReq.signal;
      const [queue, stash] = await Promise.all([
        input.queued_ids?.length ? loadQueue(user, signal) : Promise.resolve([]),
        input.use_stash ? loadStash(user, signal) : Promise.resolve([]),
      ]);
      const wanted = [
        ...(input.queued_ids ?? []).flatMap(id => {
          const item = queue.find(q => q.id === id);
          return item?.pattern_id
            ? [
                {
                  patternId: Number(item.pattern_id),
                  yarnId: item.yarn_id ? Number(item.yarn_id) : null,
                },
              ]
            : [];
        }),
        ...(input.pattern_ids ?? []).map(patternId => ({ patternId, yarnId: null })),
      ];
      const [patterns, yarns] = await Promise.all([
        getPatternsInBatches(
          user.publicRavelry,
          wanted.map(w => w.patternId),
          signal,
        ),
        (async () => {
          const ids = [...new Set(wanted.flatMap(w => (w.yarnId ? [w.yarnId] : [])))];
          return ids.length ? user.publicRavelry.getYarns(ids, signal) : [];
        })(),
      ]);
      const byId = new Map(patterns.map(p => [p.id, p]));
      const yarnById = new Map(yarns.map(y => [y.id, y]));

      // Free stash yards per entry, spent once across all the patterns, biggest first.
      const free = new Map(stash.filter(e => e.weight && e.yards).map(e => [e.id, e.yards ?? 0]));
      const unknown: string[] = [];
      const rows = wanted.flatMap(({ patternId, yarnId }) => {
        const pattern = byId.get(patternId);
        if (!pattern) return [];
        const weight = weightPermalink(pattern.yarn_weight?.name) ?? null;
        const need = pick(pattern, input.size);
        if (!need || !weight) unknown.push(pattern.name);
        let missing = need ?? 0;
        const fromStash: { stash_id: number; yarn: string; yards: number }[] = [];
        if (weight && need) {
          const sameWeight = stash
            .filter(entry => entry.weight === weight && (free.get(entry.id) ?? 0) > 0)
            .sort(
              (a, b) =>
                // The planned yarn first, then the biggest amounts.
                Number(b.yarn_id === yarnId) - Number(a.yarn_id === yarnId) ||
                (free.get(b.id) ?? 0) - (free.get(a.id) ?? 0),
            );
          for (const entry of sameWeight) {
            if (missing <= 0) break;
            const take = Math.min(missing, free.get(entry.id) ?? 0);
            free.set(entry.id, (free.get(entry.id) ?? 0) - take);
            missing -= take;
            fromStash.push({ stash_id: entry.id, yarn: entry.yarn, yards: Math.round(take) });
          }
        }
        const yarn = yarnId ? yarnById.get(yarnId) : undefined;
        return [
          {
            pattern_id: pattern.id,
            pattern: pattern.name,
            url: patternUrl(pattern.permalink),
            weight,
            yards_needed: need,
            from_stash: fromStash,
            yards_to_buy: need ? Math.round(missing) : null,
            planned_yarn: yarn
              ? {
                  id: yarn.id,
                  name: `${yarn.yarn_company?.name ?? yarn.yarn_company_name ?? ''} ${yarn.name}`.trim(),
                  url: yarnUrl(yarn.permalink),
                  skeins_to_buy:
                    missing > 0 && yarn.yardage
                      ? skeinsFor(missing, yarn.yardage, input.margin_percent).skeins
                      : missing > 0
                        ? null
                        : 0,
                }
              : null,
          },
        ];
      });

      const byWeight = new Map<string, number>();
      for (const row of rows) {
        if (row.weight && row.yards_to_buy) {
          byWeight.set(row.weight, (byWeight.get(row.weight) ?? 0) + row.yards_to_buy);
        }
      }
      return json({
        patterns: rows,
        to_buy_by_weight: [...byWeight].map(([weight, yards]) => ({
          weight,
          yards: Math.round(yards * (1 + input.margin_percent / 100)),
        })),
        unknown,
        notes: [
          `Amounts to buy include a ${input.margin_percent}% margin per weight; buy each yarn from one dye lot.`,
          ...(input.use_stash ? [] : ['The stash was not counted.']),
        ],
      });
    },
  );
}

function registerQueueReview(server: McpServer, user: UserContext): void {
  const item = z.object({
    queued_id: z.number(),
    pattern_id: z.number().nullable(),
    pattern: z.string(),
    queued_on: z.string().nullable(),
  });
  server.registerTool(
    'review_my_queue',
    {
      title: 'Tidy up my queue',
      description:
        "Reviews the signed-in user's whole queue: duplicates, patterns they already made or are " +
        'making, entries queued years ago, and how long the whole queue would take at their pace. ' +
        'Suggests what to remove; never removes anything itself.',
      inputSchema: z.object({}),
      outputSchema: z.object({
        queue_size: z.number(),
        duplicates: z.array(item),
        already_made: z.array(item.extend({ status: z.string() })),
        stale: z.array(item.extend({ years_queued: z.number() })),
        total_yards: z.number().describe('Smallest sizes, patterns with a known yardage.'),
        days_to_finish_at_your_pace: z.number().nullable(),
        years_to_finish_at_your_pace: z.number().nullable(),
        pace: paceSchema,
      }),
      annotations: readOnly,
    },
    async (_input, ctx) => {
      const signal = ctx.mcpReq.signal;
      const [queue, { projects, pace }] = await Promise.all([
        loadQueue(user, signal),
        loadPace(user, signal),
      ]);
      const patterns = new Map(
        (
          await getPatternsInBatches(
            user.publicRavelry,
            queue.flatMap(q => (q.pattern_id ? [Number(q.pattern_id)] : [])),
            signal,
          )
        ).map(p => [p.id, p]),
      );
      const toItem = (q: (typeof queue)[number]) => ({
        queued_id: q.id,
        pattern_id: q.pattern_id ? Number(q.pattern_id) : null,
        pattern: q.short_pattern_name ?? q.pattern_name ?? q.name ?? 'Untitled',
        queued_on: isoDate(q.created_at),
      });

      const seen = new Set<number>();
      const duplicates = queue.filter(q => {
        const id = Number(q.pattern_id);
        if (!id) return false;
        if (seen.has(id)) return true;
        seen.add(id);
        return false;
      });
      const made = new Map(
        projects
          .filter(p => p.pattern_id && !/frogged/i.test(p.status_name ?? ''))
          .map(p => [p.pattern_id, p.status_name ?? 'In progress']),
      );
      const now = Date.now();
      const stale = queue
        .map(q => ({
          q,
          years: q.created_at
            ? (now - Date.parse(isoDate(q.created_at) ?? '')) / 31_557_600_000
            : 0,
        }))
        .filter(({ years }) => years >= STALE_YEARS)
        .sort((a, b) => b.years - a.years);
      const totalYards = queue.reduce((sum, q) => {
        const pattern = patterns.get(Number(q.pattern_id));
        return sum + (pattern ? (patternYardage(pattern).min ?? 0) : 0);
      }, 0);

      return json({
        queue_size: queue.length,
        duplicates: duplicates.map(toItem),
        already_made: queue
          .filter(q => made.has(Number(q.pattern_id)))
          .map(q => ({ ...toItem(q), status: made.get(Number(q.pattern_id)) ?? '' })),
        stale: stale.map(({ q, years }) => ({
          ...toItem(q),
          years_queued: Math.round(years * 10) / 10,
        })),
        total_yards: totalYards,
        days_to_finish_at_your_pace: pace ? Math.ceil(totalYards / pace.yards_per_day) : null,
        years_to_finish_at_your_pace: pace
          ? Math.round((totalYards / pace.yards_per_day / 365) * 10) / 10
          : null,
        pace,
      });
    },
  );
}

function registerStashAudit(server: McpServer, user: UserContext): void {
  const ref = z.object({
    stash_id: z.number(),
    yarn: z.string(),
    weight: z.string().nullable(),
    yards: z.number().nullable(),
  });
  server.registerTool(
    'audit_my_stash',
    {
      title: 'Stash check-up',
      description:
        "A check-up of the signed-in user's stash against how they actually craft: how long it " +
        'would last at their pace, yarn no queued pattern or project plans to use, the oldest ' +
        'yarn, weights they keep buying but rarely use, leftovers for scrap projects, and ' +
        'entries missing a weight or yardage.',
      inputSchema: z.object({}),
      outputSchema: z.object({
        entries: z.number(),
        total_yards: z.number(),
        total_miles: z.number(),
        yards_used_last_year: z.number().nullable(),
        years_of_yarn: z.number().nullable().describe('Stash yards ÷ yards used in the last year.'),
        weights: z.array(
          z.object({
            weight: z.string(),
            stash_yards: z.number(),
            projects_last_two_years: z.number(),
            queued_patterns: z.number(),
          }),
        ),
        unplanned: z.array(ref).describe('Free yarn in a weight no queued pattern uses.'),
        oldest: z
          .array(ref.extend({ added: z.string().nullable(), years: z.number() }))
          .describe('Yarn in the stash for over a year, oldest first.'),
        leftovers: z.object({ entries: z.number(), yards: z.number(), items: z.array(ref) }),
        missing_info: z.array(ref),
      }),
      annotations: readOnly,
    },
    async (_input, ctx) => {
      const signal = ctx.mcpReq.signal;
      const [stash, queue, { projects, finished }] = await Promise.all([
        loadStash(user, signal),
        loadQueue(user, signal),
        loadPace(user, signal),
      ]);
      const toRef = (entry: (typeof stash)[number]) => ({
        stash_id: entry.id,
        yarn: entry.yarn,
        weight: entry.weight,
        yards: entry.yards,
      });

      const queuePatterns = await getPatternsInBatches(
        user.publicRavelry,
        queue.flatMap(q => (q.pattern_id ? [Number(q.pattern_id)] : [])),
        signal,
      );
      const twoYearsAgo = addDays(today(), -730);
      const recentProjects = projects.filter(
        p => isFinished(p) && (isoDate(p.completed) ?? '') >= twoYearsAgo,
      );
      const recentPatterns = await getPatternsInBatches(
        user.publicRavelry,
        recentProjects.flatMap(p => (p.pattern_id ? [p.pattern_id] : [])),
        signal,
      );
      const weightCount = (patterns: readonly ApiPattern[]) => {
        const counts = new Map<string, number>();
        for (const pattern of patterns) {
          const weight = weightPermalink(pattern.yarn_weight?.name);
          if (weight) counts.set(weight, (counts.get(weight) ?? 0) + 1);
        }
        return counts;
      };
      const queued = weightCount(queuePatterns);
      const used = weightCount(recentPatterns);

      const oneYearAgo = addDays(today(), -365);
      const lastYear = finished.filter(p => p.completed >= oneYearAgo && p.yards);
      const yardsLastYear = lastYear.length
        ? lastYear.reduce((sum, p) => sum + (p.yards ?? 0), 0)
        : null;
      const totalYards = stash.reduce((sum, entry) => sum + (entry.yards ?? 0), 0);

      const now = today();
      const oldest = stash
        .filter(entry => entry.added && entry.added <= addDays(now, -365))
        .map(entry => ({ entry, date: entry.added ?? '' }))
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 5)
        .map(({ entry, date }) => ({
          ...toRef(entry),
          added: date,
          years: Math.round(((Date.parse(now) - Date.parse(date)) / 31_557_600_000) * 10) / 10,
        }));
      const leftovers = stash.filter(
        entry => entry.yards !== null && entry.yards > 0 && entry.yards < LEFTOVER_YARDS,
      );

      return json({
        entries: stash.length,
        total_yards: totalYards,
        total_miles: Math.round((totalYards / YARDS_PER_MILE) * 10) / 10,
        yards_used_last_year: yardsLastYear,
        years_of_yarn:
          yardsLastYear && yardsLastYear > 0
            ? Math.round((totalYards / yardsLastYear) * 10) / 10
            : null,
        weights: totalsByWeight(stash).map(total => ({
          weight: total.weight,
          stash_yards: Math.round(total.yards),
          projects_last_two_years: used.get(total.weight) ?? 0,
          queued_patterns: queued.get(total.weight) ?? 0,
        })),
        unplanned: stash
          .filter(
            entry =>
              entry.weight &&
              (entry.yards ?? 0) >= LEFTOVER_YARDS &&
              entry.in_projects.length === 0 &&
              !queued.has(entry.weight),
          )
          .sort((a, b) => (b.yards ?? 0) - (a.yards ?? 0))
          .slice(0, 10)
          .map(toRef),
        oldest,
        leftovers: {
          entries: leftovers.length,
          yards: leftovers.reduce((sum, entry) => sum + (entry.yards ?? 0), 0),
          items: leftovers.slice(0, 10).map(toRef),
        },
        missing_info: stash.filter(entry => !entry.weight || !entry.yards).map(toRef),
      });
    },
  );
}
