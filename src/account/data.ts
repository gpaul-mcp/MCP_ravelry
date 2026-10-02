// Loaders and statistics shared by the personal insight tools. Everything here
// reads only the signed-in user's own Ravelry data.

import type { RavelryClient } from '../ravelry/client.ts';
import type { ApiPack, ApiPattern, ApiProject, ApiQueuedProject } from '../ravelry/types.ts';
import { rounded } from '../tools/format.ts';
import type { UserContext } from './context.ts';
import { mapLimit } from './stash.ts';

const METERS_TO_YARDS = 1.0936;
/** Longer than two years is a project that sat in a drawer, not crafting time. */
const MAX_DAYS = 730;
const DETAIL_CONCURRENCY = 5;

export async function getPatternsInBatches(
  ravelry: RavelryClient,
  ids: readonly number[],
  signal: AbortSignal,
): Promise<ApiPattern[]> {
  const unique = [...new Set(ids)];
  const batches: number[][] = [];
  for (let i = 0; i < unique.length; i += 20) batches.push(unique.slice(i, i + 20));
  return (await Promise.all(batches.map(batch => ravelry.getPatterns(batch, signal)))).flat();
}

export function count(
  values: readonly (string | null | undefined)[],
): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const value of values) if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].map(([name, n]) => ({ name, count: n })).sort((a, b) => b.count - a.count);
}

/** Ravelry dates ("2024/11/22", "2024/11/22 10:00:00 -0500") → "2024-11-22". */
export function isoDate(date: string | null | undefined): string | null {
  const match = /^(\d{4})[/-](\d{2})[/-](\d{2})/.exec(date ?? '');
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

export function daysBetween(start: string | null | undefined, end: string | null | undefined) {
  const a = isoDate(start);
  const b = isoDate(end);
  if (!a || !b) return null;
  const days = Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
  return days >= 0 && days <= MAX_DAYS ? days : null;
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(date) + Math.round(days) * 86_400_000).toISOString().slice(0, 10);
}

export const today = () => new Date().toISOString().slice(0, 10);

export function quartiles(
  values: readonly number[],
): { median: number; p25: number; p75: number } | null {
  if (values.length === 0) return null;
  const sorted = values.toSorted((a, b) => a - b);
  const at = (q: number) => {
    const position = (sorted.length - 1) * q;
    const low = sorted[Math.floor(position)] ?? 0;
    const high = sorted[Math.ceil(position)] ?? low;
    return low + (high - low) * (position - Math.floor(position));
  };
  return { median: at(0.5), p25: at(0.25), p75: at(0.75) };
}

export function packYards(pack: ApiPack): number | null {
  if (pack.total_yards != null) return pack.total_yards;
  if (pack.total_meters != null) return pack.total_meters * METERS_TO_YARDS;
  return null;
}

/** Every project (Ravelry returns up to 1,000 per page; that covers almost everyone). */
export async function loadProjects(user: UserContext, signal: AbortSignal): Promise<ApiProject[]> {
  const response = await user.ravelry.listProjects(
    user.username,
    { sort: 'created_', page: 1, page_size: 1000 },
    signal,
  );
  return response.projects;
}

/** The whole queue, in queue order (up to 500). */
export async function loadQueue(user: UserContext, signal: AbortSignal) {
  const queue: ApiQueuedProject[] = [];
  for (let page = 1; page <= 5; page++) {
    const response = await user.ravelry.listQueue(user.username, { page, page_size: 100 }, signal);
    queue.push(...response.queued_projects);
    if (page >= response.paginator.page_count) break;
  }
  return queue;
}

/** Favorited pattern ids with when they were favorited, newest first (up to 500). */
export async function loadFavoritePatterns(user: UserContext, signal: AbortSignal) {
  const favorites: { pattern_id: number; created_at: string | null }[] = [];
  for (let page = 1; page <= 5; page++) {
    const response = await user.ravelry.listFavorites(
      user.username,
      { types: 'pattern', page, page_size: 100 },
      signal,
    );
    for (const favorite of response.favorites) {
      if (favorite.favorited?.id) {
        favorites.push({
          pattern_id: favorite.favorited.id,
          created_at: favorite.created_at ?? null,
        });
      }
    }
    if (page >= response.paginator.page_count) break;
  }
  return favorites;
}

export const isFinished = (project: ApiProject) =>
  project.status_name?.toLowerCase() === 'finished';

export interface FinishedProject {
  id: number;
  name: string;
  pattern_id: number | null;
  started: string;
  completed: string;
  days: number;
  /** Yarn used, from the project's yarn or else the pattern's yardage. */
  yards: number | null;
  yards_source: 'project' | 'pattern' | null;
}

/**
 * Finished projects with real dates and the yarn they used, newest first.
 * Reads up to `limit` projects in full (their yarn amounts are not in the list).
 */
export async function finishedWithYardage(
  user: UserContext,
  projects: readonly ApiProject[],
  signal: AbortSignal,
  limit = 20,
): Promise<FinishedProject[]> {
  const dated = projects
    .filter(isFinished)
    .map(project => ({ project, days: daysBetween(project.started, project.completed) }))
    .filter((item): item is { project: ApiProject; days: number } => item.days !== null)
    .sort((a, b) =>
      (isoDate(b.project.completed) ?? '').localeCompare(isoDate(a.project.completed) ?? ''),
    )
    .slice(0, limit);

  const patterns = new Map(
    (
      await getPatternsInBatches(
        user.publicRavelry,
        dated.flatMap(({ project }) => (project.pattern_id ? [project.pattern_id] : [])),
        signal,
      )
    ).map(pattern => [pattern.id, pattern]),
  );

  return mapLimit(dated, DETAIL_CONCURRENCY, async ({ project, days }) => {
    let yards: number | null = null;
    let source: FinishedProject['yards_source'] = null;
    try {
      const { project: full } = await user.ravelry.getProject(user.username, project.id, signal);
      const total = (full.packs ?? []).reduce((sum, pack) => sum + (packYards(pack) ?? 0), 0);
      if (total > 0) {
        yards = Math.round(total);
        source = 'project';
      }
    } catch (error) {
      if (signal.aborted) throw error;
    }
    const pattern = project.pattern_id ? patterns.get(project.pattern_id) : undefined;
    if (yards === null && pattern?.yardage) {
      yards = pattern.yardage;
      source = 'pattern';
    }
    return {
      id: project.id,
      name: project.name,
      pattern_id: project.pattern_id ?? null,
      started: isoDate(project.started) ?? '',
      completed: isoDate(project.completed) ?? '',
      days,
      yards,
      yards_source: source,
    };
  });
}

export interface Pace {
  yards_per_day: number;
  slow: number;
  fast: number;
  based_on: number;
}

/**
 * The user's crafting pace in yards per calendar day (breaks included), from
 * their own finished projects. Null when they have too little history.
 */
export function paceFrom(finished: readonly FinishedProject[]): Pace | null {
  const rates = finished
    .filter(project => project.yards && project.yards > 0)
    .map(project => (project.yards ?? 0) / Math.max(1, project.days));
  const spread = quartiles(rates);
  if (!spread || rates.length < 2) return null;
  return {
    yards_per_day: rounded(spread.median) ?? 0,
    slow: rounded(spread.p25) ?? 0,
    fast: rounded(spread.p75) ?? 0,
    based_on: rates.length,
  };
}
