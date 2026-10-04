// Grams ↔ length. Yarn is sold by weight in much of the world, but whether it is
// enough depends on length, and that ratio differs from yarn to yarn. Use the
// yarn's own skein data when known, else a typical ratio for its weight.

/** Typical yards per 100 g by yarn weight (middle of the usual range). */
export const TYPICAL_YARDS_PER_100G: Record<string, number> = {
  cobweb: 1300,
  thread: 900,
  lace: 800,
  'light-fingering': 500,
  fingering: 420,
  sport: 330,
  dk: 250,
  worsted: 200,
  aran: 180,
  bulky: 130,
  'super-bulky': 80,
  jumbo: 40,
};

export interface YardsPerGram {
  ratio: number;
  /** How the ratio was found: the yarn's own skein data, or typical for its weight. */
  source: 'yarn' | 'typical_for_weight';
}

export function yardsPerGram(
  yarn: { yardage?: number | null; grams?: number | null } | null | undefined,
  weight: string | null | undefined,
): YardsPerGram | null {
  if (yarn?.yardage && yarn.grams) return { ratio: yarn.yardage / yarn.grams, source: 'yarn' };
  const typical = weight ? TYPICAL_YARDS_PER_100G[weight] : undefined;
  return typical ? { ratio: typical / 100, source: 'typical_for_weight' } : null;
}
