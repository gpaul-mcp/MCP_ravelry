import * as z from 'zod';

import type { ApiPattern, ApiStash } from '../ravelry/types.ts';
import { weightPermalink } from '../ravelry/vocabulary.ts';
import { nonEmpty, yarnUrl } from '../tools/format.ts';
import type { UserContext } from './context.ts';

const METERS_TO_YARDS = 1.0936;
const MAX_PAGES = 10;
const PAGE_SIZE = 100;

export const stashEntrySchema = z.object({
  id: z.number(),
  yarn: z.string().describe('Yarn name with its brand, or the name the user gave it.'),
  yarn_id: z.number().nullable().describe('Ravelry yarn id, for get_yarn_details.'),
  yarn_url: z.string().nullable(),
  weight: z.string().nullable().describe('Yarn weight filter value, e.g. "dk".'),
  colorway: z.string().nullable(),
  skeins: z.number().nullable(),
  yards: z.number().nullable().describe('Total yards in this stash entry.'),
  grams: z.number().nullable(),
  status: z.string().nullable(),
  location: z.string().nullable(),
});

export type StashEntry = z.infer<typeof stashEntrySchema>;

export function toStashEntry(stash: ApiStash): StashEntry {
  const pack = stash.primary_pack ?? {};
  const skeins = pack.skeins == null || pack.skeins === '' ? null : Number(pack.skeins);
  const perSkein = pack.yards_per_skein ?? stash.yarn?.yardage ?? null;
  const yards =
    pack.total_yards ??
    (pack.total_meters ? pack.total_meters * METERS_TO_YARDS : null) ??
    (skeins && perSkein ? skeins * perSkein : null);
  const grams =
    pack.total_grams ??
    (skeins && (pack.grams_per_skein ?? stash.yarn?.grams)
      ? skeins * (pack.grams_per_skein ?? stash.yarn?.grams ?? 0)
      : null);
  const yarnName = stash.yarn
    ? `${stash.yarn.yarn_company_name ?? ''} ${stash.yarn.name}`.trim()
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
    skeins: Number.isFinite(skeins) ? skeins : null,
    yards: yards == null ? null : Math.round(yards),
    grams: grams == null ? null : Math.round(grams),
    status: nonEmpty(status ?? null),
    location: nonEmpty(stash.location),
  };
}

/** The whole stash (up to 1,000 entries), normalized. */
export async function loadStash(user: UserContext, signal: AbortSignal): Promise<StashEntry[]> {
  const entries: StashEntry[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const response = await user.ravelry.listStash(
      user.username,
      { page, page_size: PAGE_SIZE, sort: 'weight' },
      signal,
    );
    entries.push(...response.stash.map(toStashEntry));
    const lastPage = response.paginator?.page_count ?? page;
    if (response.stash.length < PAGE_SIZE || page >= lastPage) break;
  }
  // Entries marked as used up or given away are not available to knit with.
  return entries.filter(entry => !/used up/i.test(entry.status ?? ''));
}

export interface WeightTotal {
  weight: string;
  yards: number;
  entries: StashEntry[];
}

/** Yards available per yarn weight, largest first. Entries without a weight or yardage are skipped. */
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
