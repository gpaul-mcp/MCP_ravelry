import { type McpServer, requireScopes } from '@modelcontextprotocol/server';
import * as z from 'zod';

import { ACCOUNT_SCOPE, WRITE_SCOPE } from '../auth/server.ts';
import { RavelryApiError } from '../ravelry/client.ts';
import type { ApiPack, ApiProjectFull, ApiStashFull } from '../ravelry/types.ts';
import { nonEmpty, patternUrl, truncate } from '../tools/format.ts';
import type { UserContext } from './context.ts';
import { patternYardage, toStashEntry } from './stash.ts';

const METERS_TO_YARDS = 1.0936;
const MAX_LOG_LENGTH = 4_000;

/** Ravelry's ids, from /projects/project_statuses.json and /projects/crafts.json. */
const STATUS_IDS = { 'in-progress': 1, finished: 2, hibernating: 3, frogged: 4 } as const;
const CRAFT_IDS = {
  crochet: 1,
  knitting: 2,
  weaving: 5,
  'machine-knitting': 6,
  'loom-knitting': 7,
} as const;

const json = <T extends Record<string, unknown>>(output: T) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(output) }],
  structuredContent: output,
});

const writeScopes = requireScopes(ACCOUNT_SCOPE, WRITE_SCOPE);
const today = () => new Date().toISOString().slice(0, 10);

const yarnAmount = z
  .object({
    stash_id: z.number().int().positive().describe('From get_my_stash.'),
    yards: z.number().positive().optional(),
    meters: z.number().positive().optional(),
    skeins: z.number().positive().optional(),
  })
  .describe('Yarn from the stash and how much of it (one of yards, meters or skeins).');

type YarnAmount = z.infer<typeof yarnAmount>;

export const projectSchema = z.object({
  id: z.number(),
  name: z.string(),
  url: z.string().nullable(),
  pattern_id: z.number().nullable(),
  pattern: z.string().nullable(),
  pattern_url: z.string().nullable(),
  status: z.string().nullable(),
  progress: z.number().nullable().describe('Percent complete.'),
  started: z.string().nullable(),
  completed: z.string().nullable(),
  size: z.string().nullable(),
  made_for: z.string().nullable(),
  yarn: z.array(
    z.object({
      pack_id: z.number().nullable(),
      stash_id: z.number().nullable(),
      yarn: z.string().nullable(),
      colorway: z.string().nullable(),
      yards: z
        .number()
        .nullable()
        .describe('Yards of this yarn used or set aside for the project.'),
      skeins: z.number().nullable(),
    }),
  ),
  pattern_needs: z.string().nullable().describe('Yardage the pattern calls for.'),
  log: z.string().nullable().describe('Progress log (private project notes), oldest first.'),
});

type ProjectView = z.infer<typeof projectSchema>;

export function registerProjectTools(server: McpServer, user: UserContext): void {
  async function view(project: ApiProjectFull, signal: AbortSignal): Promise<ProjectView> {
    const [pattern] = project.pattern_id
      ? await user.publicRavelry.getPatterns([project.pattern_id], signal).catch(() => [])
      : [];
    const needs = pattern ? patternYardage(pattern) : undefined;
    return {
      id: project.id,
      name: project.name,
      url: project.links?.self?.href ?? null,
      pattern_id: project.pattern_id ?? null,
      pattern: nonEmpty(project.pattern_name ?? null),
      pattern_url: pattern ? patternUrl(pattern.permalink) : null,
      status: nonEmpty(project.status_name ?? null),
      progress: project.progress ?? null,
      started: nonEmpty(project.started ?? null),
      completed: nonEmpty(project.completed ?? null),
      size: nonEmpty(project.size ?? null),
      made_for: nonEmpty(project.made_for ?? null),
      yarn: (project.packs ?? []).map(pack => ({
        pack_id: pack.id ?? null,
        stash_id: pack.stash_id ?? null,
        yarn: nonEmpty(pack.yarn_name ?? pack.yarn?.name ?? null),
        colorway: nonEmpty(pack.colorway ?? null),
        yards: packYards(pack),
        skeins: Number(pack.skeins) || null,
      })),
      pattern_needs: needs?.min
        ? `${needs.min}${needs.max && needs.max !== needs.min ? `–${needs.max}` : ''} yards`
        : null,
      log: project.private_notes ? truncate(project.private_notes, MAX_LOG_LENGTH) : null,
    };
  }

  /** A pack amount in the stash entry's own units (Ravelry keeps a project pack in those). */
  async function packAmount(
    amount: YarnAmount,
    signal: AbortSignal,
  ): Promise<Record<string, string>> {
    if (amount.skeins) return { skeins: String(amount.skeins) };
    const yards = amount.yards ?? (amount.meters ? amount.meters * METERS_TO_YARDS : undefined);
    if (!yards) return {};
    const { stash } = await user.ravelry.getStash(user.username, amount.stash_id, signal);
    const metric = primaryPack(stash)?.prefer_metric_length === true;
    return { total_length: String(Math.round(metric ? yards / METERS_TO_YARDS : yards)) };
  }

  server.registerTool(
    'get_my_project',
    {
      title: 'My project',
      description:
        "One of the signed-in user's projects: pattern, status, progress, the stash yarn it uses and " +
        'how much, and the progress log. Read the log to know where the user is in the pattern.',
      inputSchema: z.object({
        project_id: z.number().int().positive().describe('From get_my_projects.'),
      }),
      outputSchema: projectSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ project_id }, ctx) => {
      const { project } = await user.ravelry.getProject(
        user.username,
        project_id,
        ctx.mcpReq.signal,
      );
      return json(await view(project, ctx.mcpReq.signal));
    },
  );

  server.registerTool(
    'start_project',
    {
      title: 'Start a project',
      description:
        'Starts a Ravelry project from a pattern and sets yarn from the stash aside for it; Ravelry ' +
        'then counts that yarn as in use. Give each yarn an amount (yards, meters or skeins); ' +
        "without one, the pattern's yardage is used when known. Starting from a queued pattern " +
        '(queued_id from get_my_queue) also removes it from the queue.',
      inputSchema: z
        .object({
          pattern_id: z
            .number()
            .int()
            .positive()
            .optional()
            .describe('From search_patterns or the queue.'),
          name: z
            .string()
            .trim()
            .min(1)
            .max(150)
            .optional()
            .describe('Defaults to the pattern name.'),
          craft: z
            .enum(['knitting', 'crochet', 'loom-knitting', 'machine-knitting', 'weaving'])
            .optional(),
          yarn: z.array(yarnAmount).max(10).default([]),
          size: z.string().trim().max(100).optional(),
          made_for: z.string().trim().max(100).optional(),
          started: z.iso.date().optional().describe('YYYY-MM-DD, default today.'),
          note: z.string().trim().max(1000).optional().describe('First line of the progress log.'),
          queued_id: z.number().int().positive().optional(),
        })
        .refine(input => input.pattern_id !== undefined || input.name !== undefined, {
          message: 'Give a pattern_id, or a name for a project without a Ravelry pattern',
          path: ['pattern_id'],
        }),
      outputSchema: projectSchema.extend({ removed_from_queue: z.boolean() }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      scopeChallenge: writeScopes,
    },
    async (input, ctx) => {
      const signal = ctx.mcpReq.signal;
      const [pattern] = input.pattern_id
        ? await user.publicRavelry.getPatterns([input.pattern_id], signal)
        : [];
      if (input.pattern_id && !pattern) {
        throw new RavelryApiError(`No pattern with id ${input.pattern_id}.`);
      }
      const craft =
        input.craft ??
        (pattern?.craft?.name.toLowerCase().replace(/\s+/g, '-') as
          keyof typeof CRAFT_IDS | undefined) ??
        'knitting';
      const defaultYards = pattern ? patternYardage(pattern).min : null;

      const packs = await Promise.all(
        input.yarn.map(async amount => ({
          stash_id: amount.stash_id,
          ...(await packAmount(
            amount.yards || amount.meters || amount.skeins || !defaultYards
              ? amount
              : { ...amount, yards: defaultYards / input.yarn.length },
            signal,
          )),
        })),
      );
      const started = input.started ?? today();
      const { project } = await user.ravelry.createProject(
        user.username,
        withoutUndefined({
          name: input.name ?? pattern?.name,
          pattern_id: input.pattern_id,
          craft_id: (CRAFT_IDS as Record<string, number>)[craft] ?? CRAFT_IDS.knitting,
          project_status_id: STATUS_IDS['in-progress'],
          progress: 0,
          started,
          size: input.size,
          made_for: input.made_for,
          private_notes: `${started}: Started.${input.note ? ` ${input.note}` : ''}`,
          packs: packs.length ? packs : undefined,
        }),
        signal,
      );

      let removedFromQueue = false;
      if (input.queued_id) {
        await user.ravelry.deleteQueuedProject(user.username, input.queued_id, signal).then(
          () => (removedFromQueue = true),
          () => undefined,
        );
      }
      // The create response may omit pack details; read the project back.
      const full = await user.ravelry.getProject(user.username, project.id, signal);
      return json({ ...(await view(full.project, signal)), removed_from_queue: removedFromQueue });
    },
  );

  server.registerTool(
    'log_project_progress',
    {
      title: 'Log project progress',
      description:
        "Records where the user is in a project: appends a dated line to the project's progress " +
        'log (private notes), optionally sets the percent complete, and updates how much stash yarn ' +
        'the project has used so far so the stash stays accurate. yarn_used amounts are totals so ' +
        'far for this project, not increments.',
      inputSchema: z.object({
        project_id: z.number().int().positive(),
        note: z
          .string()
          .trim()
          .min(1)
          .max(1000)
          .describe('Where the user is, e.g. "Row 42 of the left sleeve, decreases done".'),
        progress: z.number().int().min(0).max(100).optional().describe('Percent complete.'),
        yarn_used: z.array(yarnAmount).max(10).optional(),
        date: z.iso.date().optional().describe('YYYY-MM-DD, default today.'),
      }),
      outputSchema: projectSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      scopeChallenge: writeScopes,
    },
    async ({ project_id, note, progress, yarn_used, date }, ctx) => {
      const signal = ctx.mcpReq.signal;
      const { project } = await user.ravelry.getProject(user.username, project_id, signal);
      await setYarnUsed(project, yarn_used ?? [], signal);
      const line = `${date ?? today()}: ${note}`;
      const { project: updated } = await user.ravelry.updateProject(
        user.username,
        project_id,
        withoutUndefined({
          progress,
          private_notes: project.private_notes
            ? `${project.private_notes.trimEnd()}\n${line}`
            : line,
        }),
        signal,
      );
      return json(
        await view(
          {
            ...updated,
            packs: (await user.ravelry.getProject(user.username, project_id, signal)).project.packs,
          },
          signal,
        ),
      );
    },
  );

  server.registerTool(
    'update_project_status',
    {
      title: 'Finish, pause or frog a project',
      description:
        "Changes a project's status. finished: sets the end date and 100%, records the final yarn " +
        'used, and marks stash yarn with nothing left as used up (also any stash ids listed in ' +
        'mark_used_up, e.g. tiny leftovers the user throws away). frogged: gives the yarn back to ' +
        'the stash unless release_yarn is false. hibernating / in-progress: pause or resume.',
      inputSchema: z.object({
        project_id: z.number().int().positive(),
        status: z.enum(['in-progress', 'finished', 'hibernating', 'frogged']),
        note: z.string().trim().max(1000).optional().describe('Added to the progress log.'),
        yarn_used: z
          .array(yarnAmount)
          .max(10)
          .optional()
          .describe('Final totals used, when finishing.'),
        mark_used_up: z.array(z.number().int().positive()).max(10).optional(),
        release_yarn: z
          .boolean()
          .default(true)
          .describe('For frogged: return the yarn to the stash.'),
        rating: z.number().int().min(0).max(4).optional().describe("The user's rating, 0–4."),
        date: z.iso.date().optional().describe('YYYY-MM-DD, default today.'),
      }),
      outputSchema: projectSchema.extend({
        marked_used_up: z.array(z.number()),
        released_yarn: z.boolean(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
      scopeChallenge: writeScopes,
    },
    async (input, ctx) => {
      const signal = ctx.mcpReq.signal;
      const day = input.date ?? today();
      const { project } = await user.ravelry.getProject(user.username, input.project_id, signal);
      if (input.status === 'finished') await setYarnUsed(project, input.yarn_used ?? [], signal);

      let releasedYarn = false;
      if (input.status === 'frogged' && input.release_yarn) {
        for (const pack of project.packs ?? []) {
          if (pack.id && pack.stash_id) await user.ravelry.deletePack(pack.id, signal);
        }
        releasedYarn = (project.packs ?? []).some(pack => pack.stash_id);
      }

      const line = `${day}: ${titleFor(input.status)}${input.note ? `. ${input.note}` : ''}`;
      await user.ravelry.updateProject(
        user.username,
        input.project_id,
        withoutUndefined({
          project_status_id: STATUS_IDS[input.status],
          progress: input.status === 'finished' ? 100 : undefined,
          completed: input.status === 'finished' ? day : undefined,
          rating: input.rating,
          private_notes: project.private_notes
            ? `${project.private_notes.trimEnd()}\n${line}`
            : line,
        }),
        signal,
      );

      const markedUsedUp: number[] = [];
      if (input.status === 'finished') {
        const stashIds = new Set([
          ...(project.packs ?? []).flatMap(pack => (pack.stash_id ? [pack.stash_id] : [])),
          ...(input.mark_used_up ?? []),
        ]);
        for (const stashId of stashIds) {
          const { stash } = await user.ravelry.getStash(user.username, stashId, signal);
          const free = toStashEntry(stash).yards ?? 0;
          if (free <= 0 || input.mark_used_up?.includes(stashId)) {
            await user.ravelry.updateStash(user.username, stashId, { stash_status_id: 2 }, signal);
            markedUsedUp.push(stashId);
          }
        }
      }

      const { project: updated } = await user.ravelry.getProject(
        user.username,
        input.project_id,
        signal,
      );
      return json({
        ...(await view(updated, signal)),
        marked_used_up: markedUsedUp,
        released_yarn: releasedYarn,
      });
    },
  );

  /** Sets how much of each stash yarn a project uses, adding the yarn if it was not linked yet. */
  async function setYarnUsed(project: ApiProjectFull, amounts: YarnAmount[], signal: AbortSignal) {
    for (const amount of amounts) {
      const data = await packAmount(amount, signal);
      if (Object.keys(data).length === 0) continue;
      const pack = project.packs?.find(p => p.stash_id === amount.stash_id);
      if (pack?.id) await user.ravelry.updatePack(pack.id, data, signal);
      else
        await user.ravelry.createPack(
          { project_id: project.id, stash_id: amount.stash_id, ...data },
          signal,
        );
    }
  }
}

function titleFor(status: keyof typeof STATUS_IDS): string {
  return {
    'in-progress': 'Resumed',
    finished: 'Finished',
    hibernating: 'Paused',
    frogged: 'Frogged',
  }[status];
}

function primaryPack(stash: ApiStashFull): ApiPack | undefined {
  return stash.primary_pack ?? stash.packs?.find(pack => !pack.project_id && !pack.primary_pack_id);
}

function packYards(pack: ApiPack): number | null {
  if (pack.total_yards != null) return Math.round(pack.total_yards);
  if (pack.total_meters != null) return Math.round(pack.total_meters * METERS_TO_YARDS);
  return null;
}

function withoutUndefined(object: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
}
