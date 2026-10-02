import type { ApiPatternCategoryNode } from './types.ts';

// Filter values Ravelry accepts. An unknown value makes the search API answer
// HTTP 500, so tools only offer values from these lists (each one was checked
// against the live API).

export const YARN_WEIGHTS = [
  'cobweb',
  'thread',
  'lace',
  'light-fingering',
  'fingering',
  'sport',
  'dk',
  'worsted',
  'aran',
  'bulky',
  'super-bulky',
  'jumbo',
] as const;

export const PATTERN_FITS = [
  'preemie',
  'baby',
  'toddler',
  'child',
  'teen',
  'adult',
  'doll-size',
  'female',
  'male',
  'unisex',
] as const;

export const LANGUAGES = {
  af: 'Afrikaans',
  ar: 'Arabic',
  ca: 'Catalan',
  cs: 'Czech',
  cy: 'Welsh',
  da: 'Danish',
  de: 'German',
  el: 'Greek',
  en: 'English',
  es: 'Spanish',
  et: 'Estonian',
  fi: 'Finnish',
  fo: 'Faroese',
  fr: 'French',
  ga: 'Irish',
  gl: 'Galician',
  he: 'Hebrew',
  hi: 'Hindi',
  hr: 'Croatian',
  hu: 'Hungarian',
  id: 'Indonesian',
  is: 'Icelandic',
  it: 'Italian',
  ja: 'Japanese',
  kr: 'Korean',
  lt: 'Lithuanian',
  lv: 'Latvian',
  ms: 'Malay',
  nl: 'Dutch',
  no: 'Norwegian',
  pl: 'Polish',
  pr: 'Persian',
  pt: 'Portuguese',
  ro: 'Romanian',
  ru: 'Russian',
  sk: 'Slovak',
  sr: 'Serbian',
  sv: 'Swedish',
  tr: 'Turkish',
  u: 'Universal (charts only, no written language)',
  uk: 'Ukrainian',
  ur: 'Urdu',
  zh: 'Chinese',
} as const;

export const LANGUAGE_CODES = Object.keys(LANGUAGES) as [
  keyof typeof LANGUAGES,
  ...(keyof typeof LANGUAGES)[],
];

export const YARN_FIBERS = [
  'wool',
  'merino',
  'alpaca',
  'llama',
  'camel',
  'yak',
  'bison',
  'qiviut',
  'cashmere',
  'mohair',
  'angora',
  'silk',
  'cotton',
  'linen',
  'hemp',
  'bamboo',
  'soy',
  'plant-fiber',
  'acrylic',
  'nylon',
  'polyester',
  'microfiber',
  'rayon',
  'tencel',
  'metallic',
  'other',
] as const;

export const YARN_ATTRIBUTES = [
  // care
  'superwash',
  'machine-wash',
  'machine-dry',
  'hand-wash',
  'hand-wash-cold',
  'dry-flat',
  // color
  'solid',
  'semi-solid',
  'tonal',
  'heathered',
  'tweed',
  'marled',
  'speckled',
  'variegated',
  'gradient',
  'self-striping',
  'self-patterning',
  // dye
  'hand-dyed',
  'machine-dyed',
  'natural-dyes',
  'undyed',
  // texture
  'halo',
  'thick-and-thin',
  'mercerized',
  // sustainability & put-up
  'certified-organic',
  'fair-trade',
  'recycled',
  'mini-skeins',
] as const;

/** Ravelry's yarn weight name ("Light Fingering") → filter value ("light-fingering"). */
export function weightPermalink(name: string | null | undefined): string | undefined {
  if (!name) return undefined;
  const permalink = name.toLowerCase().replace(/\s+/g, '-');
  return (YARN_WEIGHTS as readonly string[]).includes(permalink) ? permalink : undefined;
}

export class UnknownCategoryError extends Error {
  override name = 'UnknownCategoryError';
}

// Everyday words whose Ravelry category is not found by name alone, e.g.
// "toys" would otherwise hit Pet > Toys instead of Toys and Hobbies.
const CATEGORY_ALIASES: Record<string, string> = {
  toy: 'toysandhobbies',
  amigurumi: 'softies',
  stuffed: 'softies',
  'stuffed animal': 'animal',
  softie: 'softies',
  'pet toy': 'toys',
  jumper: 'pullover',
  beanie: 'beanie-toque',
  toque: 'beanie-toque',
  beret: 'beret-tam',
  tam: 'beret-tam',
  shawl: 'shawl-wrap',
  wrap: 'shawl-wrap',
  mitt: 'fingerless',
  'fingerless mitt': 'fingerless',
  dishcloth: 'washcloth',
  cushion: 'pillow',
  ornament: 'decorative',
  sweater: 'sweater',
  cardi: 'cardigan',
};

const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Resolves a free-text category ("hats", "Shawl", "cardigan") to the permalink
 * Ravelry's `pc` filter expects. Throws with close suggestions when nothing fits.
 */
export function resolveCategory(input: string, root: ApiPatternCategoryNode): string {
  const all: ApiPatternCategoryNode[] = [];
  const walk = (node: ApiPatternCategoryNode) => {
    all.push(node);
    node.children?.forEach(walk);
  };
  root.children?.forEach(walk);

  const wanted = normalize(input);
  const singular = wanted.replace(/s$/, '');

  const alias = CATEGORY_ALIASES[wanted] ?? CATEGORY_ALIASES[singular];
  if (alias && all.some(node => node.permalink === alias)) return alias;
  const keys = (node: ApiPatternCategoryNode) =>
    [node.permalink, node.name, node.long_name ?? ''].map(normalize);

  // "Other" leaves exist under many parents, so never pick one by name alone.
  const candidates = all.filter(node => !node.permalink.startsWith('other-'));
  const exact = candidates.find(node => keys(node).some(key => key === wanted || key === singular));
  if (exact) return exact.permalink;

  const partial = candidates.filter(node =>
    keys(node).some(key => key.split(' ').some(word => word === wanted || word === singular)),
  );
  if (partial.length === 1 && partial[0]) return partial[0].permalink;

  const suggestions = (
    partial.length > 0
      ? partial
      : candidates.filter(node => keys(node).some(key => key.includes(singular.slice(0, 4))))
  )
    .slice(0, 10)
    .map(node => `"${node.permalink}" (${node.name})`);

  throw new UnknownCategoryError(
    `Unknown pattern category "${input}".` +
      (suggestions.length > 0
        ? ` Did you mean one of: ${suggestions.join(', ')}?`
        : ' Try a broad one such as "hat", "sweater", "shawl-wrap", "socks", "blanket" or "toys".'),
  );
}
