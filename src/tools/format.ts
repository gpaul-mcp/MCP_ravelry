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

/** Ravelry uses 0 and "" for "not set"; map those to null. */
export function nonEmpty<T extends string | number>(value: T | null | undefined): T | null {
  if (!value) return null;
  return value;
}
