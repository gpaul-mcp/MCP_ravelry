import * as z from 'zod';

import type { ApiPack, ApiPattern, ApiStash, ApiStashFull } from '../ravelry/types.ts';
import { weightPermalink } from '../ravelry/vocabulary.ts';
import { nonEmpty, toMeters, yarnUrl } from '../tools/format.ts';
import type { UserContext } from './context.ts';

const METERS_TO_YARDS = 1.0936;
const MAX_PAGES = 10;
const PAGE_SIZE = 100;
/** Stash entries fetched at once to read what is still free (the list only has totals). */
const DETAIL_CONCURRENCY = 6;

export const stashEntrySchema = z.object({
  id: z.number(),
  yarn: z.string().describe('Yarn name with its brand, or the name the user gave it.'),
  yarn_id: z.number().nullable().describe('Ravelry yarn id, for get_yarn_details.'),
  yarn_url: z.string().nullable(),
  weight: z.string().nullable().describe('Yarn weight filter value, e.g. "dk".'),
  colorway: z.string().nullable(),
  skeins: z.number().nullable().describe('Skeins still free (not used by a project).'),
  yards: z.number().nullable().describe('Yards still free: total minus what projects use.'),
  total_yards: z.number().nullable().describe('Yards the entry started with.'),
  meters: z.number().nullable().describe('Free length in meters.'),
  total_meters: z.number().nullable(),
  grams: z.number().nullable(),
  in_projects: z
    .array(z.object({ project_id: z.number(), yards: z.number().nullable() }))
    .describe('Projects using part of this yarn.'),
  status: z.string().nullable(),
  location: z.string().nullable(),
  added: z.string().nullable().describe('Date the yarn was added to the stash.'),
});

export type StashEntry = z.infer<typeof stashEntrySchema>;

const yardsOf = (pack: ApiPack | undefined): number | null => {
  if (!pack) return null;
  if (pack.total_yards != null) return pack.total_yards;
  if (pack.total_meters != null) return pack.total_meters * METERS_TO_YARDS;
  const skeins = Number(pack.skeins);
  return skeins && pack.yards_per_skein ? skeins * pack.yards_per_skein : null;
};

const round = (value: number | null) => (value == null ? null : Math.round(value));

/**
 * Normalizes a stash entry. With full details (`packs`), Ravelry's own
 * bookkeeping gives what is still free: the total ("primary") pack, an
 * unallocated remainder pack, and one pack per project using the yarn.
 */
export function toStashEntry(stash: ApiStash | ApiStashFull): StashEntry {
  const packs = 'packs' in stash ? (stash.packs ?? []) : [];
  const primary =
    stash.primary_pack ??
    packs.find(pack => !pack.project_id && !pack.primary_pack_id) ??
    undefined;
  const remainder = packs.find(pack => !pack.project_id && pack.primary_pack_id);
  const projectPacks = packs.filter(pack => pack.project_id);

  const totalYards =
    yardsOf(primary) ??
    (Number(primary?.skeins) && stash.yarn?.yardage
      ? Number(primary?.skeins) * stash.yarn.yardage
      : null);
  const freeYards = remainder ? yardsOf(remainder) : totalYards;
  const freeSkeins = Number((remainder ?? primary)?.skeins);
  const gramsPerSkein = primary?.grams_per_skein ?? stash.yarn?.grams;

  // Full stash records nest the brand as yarn.yarn_company; lists flatten it.
  const company =
    stash.yarn?.yarn_company_name ??
    (stash.yarn as { yarn_company?: { name?: string } } | null | undefined)?.yarn_company?.name;
  const yarnName = stash.yarn
    ? `${company ?? ''} ${stash.yarn.name}`.trim()
    : (nonEmpty(stash.name) ?? 'Unnamed yarn');
  const status =
    typeof stash.stash_status === 'string' ? stash.stash_status : stash.stash_status?.name;

  return {
    id: stash.id,
    yarn: yarnName,
    yarn_id: stash.yarn?.id ?? null,
    yarn_url: stash.yarn ? yarnUrl(stash.yarn.permalink) : null,
    weight:
      weightPermalink(stash.yarn?.yarn_weight?.name) ??
      weightPermalink(stash.personal_yarn_weight?.name) ??
      weightPermalink(stash.yarn_weight_name) ??
      null,
    colorway: nonEmpty(stash.colorway_name),
    skeins: Number.isFinite(freeSkeins) && freeSkeins > 0 ? freeSkeins : null,
    yards: round(freeYards),
    total_yards: round(totalYards),
    meters: toMeters(freeYards),
    total_meters: toMeters(totalYards),
    // Ravelry does not always update grams on the remainder pack, so derive them from skeins.
    grams:
      freeSkeins && gramsPerSkein
        ? Math.round(freeSkeins * gramsPerSkein)
        : ((remainder ?? primary)?.total_grams ?? null),
    in_projects: projectPacks.map(pack => ({
      project_id: pack.project_id ?? 0,
      yards: round(yardsOf(pack)),
    })),
    status: nonEmpty(status ?? null),
    location: nonEmpty(stash.location),
    added: /^\d{4}[/-]\d{2}[/-]\d{2}/.test(stash.created_at ?? '')
      ? (stash.created_at ?? '').slice(0, 10).replace(/\//g, '-')
      : null,
  };
}

/**
 * The stash (up to 1,000 entries), normalized. Used-up yarn is left out. With
 * `freeAmounts` (the default) each entry is fetched in full to know how much
 * is still free; without it, amounts are the entries' totals.
 */
export async function loadStash(
  user: UserContext,
  signal: AbortSignal,
  { freeAmounts = true } = {},
): Promise<StashEntry[]> {
  const listed: ApiStash[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const response = await user.ravelry.listStash(
      user.username,
      { page, page_size: PAGE_SIZE, sort: 'weight' },
      signal,
    );
    listed.push(...response.stash);
    const lastPage = response.paginator?.page_count ?? page;
    if (response.stash.length < PAGE_SIZE || page >= lastPage) break;
  }

  const active = listed.filter(stash => !/used up/i.test(statusName(stash)));
  if (!freeAmounts) return active.map(toStashEntry);
  const listedById = new Map(active.map(stash => [stash.id, stash]));

  const detailed = await mapLimit(active, DETAIL_CONCURRENCY, stash =>
    user.ravelry
      .getStash(user.username, stash.id, signal)
      .then(response => response.stash)
      .catch((error: unknown) => {
        if (signal.aborted) throw error;
        return stash; // Fall back to the list data (total amounts).
      }),
  );
  // Keep list-only fields (e.g. created_at) when the full record lacks them.
  return detailed.map(stash => toStashEntry({ ...listedById.get(stash.id), ...stash }));
}

function statusName(stash: ApiStash): string {
  return (
    (typeof stash.stash_status === 'string' ? stash.stash_status : stash.stash_status?.name) ?? ''
  );
}

export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index] as T);
    }
  });
  await Promise.all(workers);
  return results;
}

export interface WeightTotal {
  weight: string;
  yards: number;
  entries: StashEntry[];
}

/** Free yards per yarn weight, largest first. Entries without a weight or yardage are skipped. */
export function totalsByWeight(entries: readonly StashEntry[]): WeightTotal[] {
  const byWeight = new Map<string, WeightTotal>();
  for (const entry of entries) {
    if (!entry.weight || !entry.yards) continue;
    const total = byWeight.get(entry.weight) ?? { weight: entry.weight, yards: 0, entries: [] };
    total.yards += entry.yards;
    total.entries.push(entry);
    byWeight.set(entry.weight, total);
  }
  return [...byWeight.values()].sort((a, b) => b.yards - a.yards);
}

/** Yards a pattern needs: its smallest size, and its largest when known. */
export function patternYardage(pattern: ApiPattern): { min: number | null; max: number | null } {
  const min = nonEmpty(pattern.yardage ?? null);
  const max = nonEmpty(pattern.yardage_max ?? null) ?? min;
  return { min, max };
}
