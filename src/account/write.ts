import { type McpServer, requireScopes } from '@modelcontextprotocol/server';
import * as z from 'zod';

import { ACCOUNT_SCOPE, WRITE_SCOPE } from '../auth/server.ts';
import { RavelryApiError } from '../ravelry/client.ts';
import { YARN_WEIGHTS } from '../ravelry/vocabulary.ts';
import { patternUrl } from '../tools/format.ts';
import type { UserContext } from './context.ts';
import { loadStash, stashEntrySchema, toStashEntry } from './stash.ts';

/** Ravelry's yarn weight ids (from /yarn_weights.json), for yarns not in its database. */
const WEIGHT_IDS: Record<(typeof YARN_WEIGHTS)[number], number> = {
  aran: 1,
  bulky: 4,
  fingering: 5,
  'super-bulky': 6,
  lace: 7,
  cobweb: 8,
  thread: 9,
  sport: 10,
  dk: 11,
  worsted: 12,
  'light-fingering': 13,
  jumbo: 16,
};

/** Adds content but never edits or deletes, so not destructive; each call creates new records. */
const additive = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
} as const;

const json = <T extends Record<string, unknown>>(output: T) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(output) }],
  structuredContent: output,
});

const errorMessage = (error: unknown) =>
  error instanceof RavelryApiError ? error.message : 'Ravelry did not accept this entry.';

const stashEntryInput = z
  .object({
    yarn_id: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Ravelry yarn id, from match_yarns or search_yarns. Preferred.'),
    yarn_name: z
      .string()
      .trim()
      .min(2)
      .max(150)
      .optional()
      .describe('Only for yarn that is not on Ravelry: the name to show.'),
    weight: z.enum(YARN_WEIGHTS).optional().describe('Required with yarn_name.'),
    colorway: z.string().trim().max(150).optional().describe('Color name or number.'),
    dye_lot: z.string().trim().max(50).optional(),
    skeins: z.number().positive().max(1000).optional(),
    total_length: z.number().positive().optional().describe('Total length of all skeins.'),
    length_units: z.enum(['yards', 'meters']).default('yards'),
    total_grams: z.number().positive().optional().describe('Total weight of all skeins in grams.'),
    purchased_date: z.iso.date().optional().describe('YYYY-MM-DD.'),
    shop: z.string().trim().max(150).optional().describe('Where it was bought.'),
    price_paid: z.number().nonnegative().optional().describe('Total paid for this line.'),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional()
      .describe('3-letter code, e.g. EUR.'),
    location: z.string().trim().max(150).optional().describe('Where it is stored at home.'),
    notes: z.string().trim().max(2000).optional(),
    tags: z.array(z.string().trim().min(1).max(50)).max(10).optional(),
  })
  .refine(entry => entry.yarn_id !== undefined || entry.yarn_name !== undefined, {
    message: 'Give yarn_id, or yarn_name for yarn that is not on Ravelry',
    path: ['yarn_id'],
  })
  .refine(entry => entry.yarn_id !== undefined || entry.weight !== undefined, {
    message: 'weight is required with yarn_name',
    path: ['weight'],
  });

type StashEntryInput = z.infer<typeof stashEntryInput>;

export function registerAccountWrites(server: McpServer, user: UserContext): void {
  server.registerTool(
    'add_to_my_stash',
    {
      title: 'Add yarn to my stash',
      description:
        "Adds yarn to the signed-in user's Ravelry stash, e.g. from a receipt, invoice or ball " +
        'band the user shared. Match each yarn with match_yarns first and confirm unclear ' +
        'matches with the user. One entry per yarn and colorway. Entries already in the stash ' +
        '(same yarn, colorway and dye lot) are skipped unless allow_duplicates is true.',
      inputSchema: z.object({
        entries: z.array(stashEntryInput).min(1).max(20),
        allow_duplicates: z.boolean().default(false),
      }),
      outputSchema: z.object({
        added: z.array(
          z.object({
            stash_id: z.number(),
            yarn: z.string(),
            colorway: z.string().nullable(),
            url: z.string(),
          }),
        ),
        skipped_duplicates: z.array(
          z.object({ index: z.number(), yarn: z.string(), existing_stash_id: z.number() }),
        ),
        failed: z.array(z.object({ index: z.number(), error: z.string() })),
      }),
      annotations: additive,
      scopeChallenge: requireScopes(ACCOUNT_SCOPE, WRITE_SCOPE),
    },
    async ({ entries, allow_duplicates }, ctx) => {
      const signal = ctx.mcpReq.signal;
      const existing = allow_duplicates
        ? []
        : await loadStash(user, signal, { freeAmounts: false });
      const output = {
        added: [] as { stash_id: number; yarn: string; colorway: string | null; url: string }[],
        skipped_duplicates: [] as { index: number; yarn: string; existing_stash_id: number }[],
        failed: [] as { index: number; error: string }[],
      };

      for (const [index, entry] of entries.entries()) {
        const duplicate = existing.find(
          stash =>
            (entry.yarn_id ? stash.yarn_id === entry.yarn_id : same(stash.yarn, entry.yarn_name)) &&
            same(stash.colorway, entry.colorway),
        );
        if (duplicate) {
          output.skipped_duplicates.push({
            index,
            yarn: duplicate.yarn,
            existing_stash_id: duplicate.id,
          });
          continue;
        }
        try {
          const { stash } = await user.ravelry.createStash(
            user.username,
            toStashPost(entry),
            signal,
          );
          output.added.push({
            stash_id: stash.id,
            yarn: toStashEntry(stash).yarn,
            colorway: stash.colorway_name ?? entry.colorway ?? null,
            url: `https://www.ravelry.com/people/${encodeURIComponent(user.username)}/stash/${stash.permalink ?? stash.id}`,
          });
        } catch (error) {
          if (signal.aborted) throw error;
          output.failed.push({ index, error: errorMessage(error) });
        }
      }
      return json(output);
    },
  );

  server.registerTool(
    'add_to_my_queue',
    {
      title: 'Add patterns to my queue',
      description:
        "Adds patterns to the signed-in user's Ravelry queue, optionally with the yarn they plan " +
        'to use and a note. Patterns already queued are skipped unless allow_duplicates is true.',
      inputSchema: z.object({
        items: z
          .array(
            z.object({
              pattern_id: z.number().int().positive().describe('From search_patterns.'),
              yarn_id: z.number().int().positive().optional().describe('Planned yarn, if known.'),
              skeins: z.number().positive().max(100).optional(),
              notes: z.string().trim().max(2000).optional(),
            }),
          )
          .min(1)
          .max(10),
        allow_duplicates: z.boolean().default(false),
      }),
      outputSchema: z.object({
        added: z.array(
          z.object({
            queued_id: z.number(),
            pattern_id: z.number(),
            pattern: z.string().nullable(),
            url: z.string(),
          }),
        ),
        skipped_already_queued: z.array(z.object({ pattern_id: z.number() })),
        failed: z.array(z.object({ pattern_id: z.number(), error: z.string() })),
      }),
      annotations: additive,
      scopeChallenge: requireScopes(ACCOUNT_SCOPE, WRITE_SCOPE),
    },
    async ({ items, allow_duplicates }, ctx) => {
      const signal = ctx.mcpReq.signal;
      const output = {
        added: [] as {
          queued_id: number;
          pattern_id: number;
          pattern: string | null;
          url: string;
        }[],
        skipped_already_queued: [] as { pattern_id: number }[],
        failed: [] as { pattern_id: number; error: string }[],
      };
      const patterns = new Map(
        (
          await user.publicRavelry.getPatterns([...new Set(items.map(i => i.pattern_id))], signal)
        ).map(pattern => [pattern.id, pattern]),
      );

      for (const item of items) {
        const pattern = patterns.get(item.pattern_id);
        if (!pattern) {
          output.failed.push({ pattern_id: item.pattern_id, error: 'No pattern with this id.' });
          continue;
        }
        try {
          if (!allow_duplicates) {
            const queued = await user.ravelry.listQueue(
              user.username,
              { pattern_id: item.pattern_id, page: 1, page_size: 1 },
              signal,
            );
            if (queued.paginator.results > 0) {
              output.skipped_already_queued.push({ pattern_id: item.pattern_id });
              continue;
            }
          }
          const { queued_project } = await user.ravelry.createQueuedProject(
            user.username,
            {
              pattern_id: item.pattern_id,
              ...(item.yarn_id ? { yarn_id: item.yarn_id } : {}),
              ...(item.skeins ? { skeins: item.skeins } : {}),
              ...(item.notes ? { notes: item.notes } : {}),
            },
            signal,
          );
          output.added.push({
            queued_id: queued_project.id,
            pattern_id: item.pattern_id,
            pattern: pattern.name,
            url: patternUrl(pattern.permalink),
          });
        } catch (error) {
          if (signal.aborted) throw error;
          output.failed.push({ pattern_id: item.pattern_id, error: errorMessage(error) });
        }
      }
      return json(output);
    },
  );

  server.registerTool(
    'update_stash_entry',
    {
      title: 'Update a stash entry',
      description:
        'Corrects or updates one stash entry: colorway, dye lot, where it is stored, notes, status ' +
        '(in-stash, used-up, will-trade, gone), or how much the user owns in total (skeins or ' +
        'length; Ravelry keeps what projects use separately). To record yarn used by a project, ' +
        'use log_project_progress instead.',
      inputSchema: z.object({
        stash_id: z.number().int().positive().describe('From get_my_stash.'),
        colorway: z.string().trim().max(150).optional(),
        dye_lot: z.string().trim().max(50).optional(),
        location: z.string().trim().max(150).optional(),
        notes: z.string().trim().max(2000).optional().describe('Replaces the current notes.'),
        status: z.enum(['in-stash', 'used-up', 'will-trade', 'gone']).optional(),
        total_skeins: z.number().positive().max(1000).optional(),
        total_length: z.number().positive().optional(),
        length_units: z.enum(['yards', 'meters']).default('yards'),
      }),
      outputSchema: z.object({ stash: stashEntrySchema }),
      annotations: { ...additive, destructiveHint: true, idempotentHint: true },
      scopeChallenge: requireScopes(ACCOUNT_SCOPE, WRITE_SCOPE),
    },
    async (input, ctx) => {
      const signal = ctx.mcpReq.signal;
      // The total owned lives on the stash's primary pack. Ravelry only lets it be
      // changed through the stash itself: /packs/{id} refuses packs without a project.
      const pack = withoutUndefined({
        colorway: input.colorway,
        dye_lot: input.dye_lot,
        ...(input.total_skeins
          ? { skeins: String(input.total_skeins) }
          : input.total_length
            ? { total_length: String(input.total_length), length_units: input.length_units }
            : {}),
      });
      const changes = withoutUndefined({
        location: input.location,
        notes: input.notes,
        stash_status_id: input.status ? STASH_STATUS_IDS[input.status] : undefined,
        pack: Object.keys(pack).length > 0 ? pack : undefined,
      });
      if (Object.keys(changes).length > 0) {
        await user.ravelry.updateStash(user.username, input.stash_id, changes, signal);
      }

      const { stash } = await user.ravelry.getStash(user.username, input.stash_id, signal);
      return json({ stash: toStashEntry(stash) });
    },
  );

  server.registerTool(
    'remove_from_stash',
    {
      title: 'Delete stash entries',
      description:
        'Permanently deletes stash entries from Ravelry. Only when the user explicitly asks to ' +
        'delete (e.g. added by mistake); for yarn that was used, given away or sold, prefer ' +
        'update_stash_entry with status used-up or gone, which keeps the history.',
      inputSchema: z.object({
        stash_ids: z.array(z.number().int().positive()).min(1).max(20),
      }),
      outputSchema: z.object({
        deleted: z.array(z.object({ stash_id: z.number(), yarn: z.string() })),
        failed: z.array(z.object({ stash_id: z.number(), error: z.string() })),
      }),
      annotations: { ...additive, destructiveHint: true, idempotentHint: true },
      scopeChallenge: requireScopes(ACCOUNT_SCOPE, WRITE_SCOPE),
    },
    async ({ stash_ids }, ctx) => {
      const signal = ctx.mcpReq.signal;
      const output = {
        deleted: [] as { stash_id: number; yarn: string }[],
        failed: [] as { stash_id: number; error: string }[],
      };
      for (const stashId of new Set(stash_ids)) {
        try {
          const { stash } = await user.ravelry.deleteStash(user.username, stashId, signal);
          output.deleted.push({ stash_id: stashId, yarn: toStashEntry(stash).yarn });
        } catch (error) {
          if (signal.aborted) throw error;
          output.failed.push({ stash_id: stashId, error: errorMessage(error) });
        }
      }
      return json(output);
    },
  );
}

/** Ravelry's stash status ids (Stash POST docs). */
const STASH_STATUS_IDS = { 'in-stash': 1, 'used-up': 2, 'will-trade': 3, gone: 4 } as const;

function toStashPost(entry: StashEntryInput): Record<string, unknown> {
  const pack: Record<string, unknown> = {
    colorway: entry.colorway,
    dye_lot: entry.dye_lot,
    skeins: entry.skeins?.toString(),
    total_length: entry.total_length?.toString(),
    length_units: entry.total_length ? entry.length_units : undefined,
    total_weight: entry.total_grams?.toString(),
    weight_units: entry.total_grams ? 'grams' : undefined,
    purchased_date: entry.purchased_date,
    personal_shop_name: entry.shop,
    total_paid: entry.price_paid?.toString(),
    total_paid_currency: entry.price_paid !== undefined ? entry.currency : undefined,
  };
  if (!entry.yarn_id) {
    pack.personal_name = entry.yarn_name;
    pack.personal_yarn_weight_id = entry.weight ? WEIGHT_IDS[entry.weight] : undefined;
  }
  return withoutUndefined({
    yarn_id: entry.yarn_id,
    stash_status_id: 1, // active
    location: entry.location,
    notes: entry.notes,
    tag_list: entry.tags?.join(' '),
    pack: withoutUndefined(pack),
  });
}

function withoutUndefined(object: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
}

const same = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
