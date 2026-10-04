import type { ApiPatternCategory } from '../ravelry/types.ts';

export function patternUrl(permalink: string): string {
  return `https://www.ravelry.com/patterns/library/${permalink}`;
}

/** "Hat > Beanie, Toque" style path, root first. */
export function categoryPath(category: ApiPatternCategory): string {
  const names: string[] = [];
  for (let node: ApiPatternCategory | null | undefined = category; node; node = node.parent) {
    // Ravelry roots every tree at a generic "Categories" node.
    if (node.name !== 'Categories') names.unshift(node.name);
  }
  return names.join(' > ');
}

export function truncate(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength).trimEnd()}… [truncated]`;
}

export function yarnUrl(permalink: string): string {
  return `https://www.ravelry.com/yarns/library/${permalink}`;
}

export function shopUrl(permalink: string): string {
  return `https://www.ravelry.com/shops/${permalink}`;
}

/** Ravelry's "min|max" range syntax; either end may be left open. */
export function range(min: number | undefined, max: number | undefined): string | undefined {
  if (min === undefined && max === undefined) return undefined;
  return `${min ?? ''}|${max ?? ''}`;
}

/** Strips tags and decodes the common entities from Ravelry's `*_html` fields. */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>|<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Ravelry uses 0, "" and stray whitespace for "not set"; map those to null and trim the rest. */
export function nonEmpty<T extends string | number>(value: T | null | undefined): T | null {
  const cleaned = typeof value === 'string' ? (value.trim() as T) : value;
  if (!cleaned) return null;
  return cleaned;
}

/** Averages like 4.815425940138143 cost tokens and add nothing; keep one or two decimals. */
export function rounded(value: number | null, decimals = 1): number | null {
  if (value === null) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export const METERS_PER_YARD = 0.9144;

/** Yards → whole meters (null stays null), for users who work in metric. */
export function toMeters(yards: number | null | undefined): number | null {
  return yards == null ? null : Math.round(yards * METERS_PER_YARD);
}

/** "119–558 m" from a yardage range. */
export function metersRange(min: number | null | undefined, max: number | null | undefined) {
  const low = toMeters(min);
  const high = toMeters(max);
  if (low === null) return null;
  return high !== null && high !== low ? `${low}–${high} m` : `${low} m`;
}
