// Pattern attributes Ravelry accepts in the `pa` search filter, grouped as on
// Ravelry (from /pattern_attributes/groups.json). Their permalinks are not in that
// list, so they were read from pattern details and each one was checked against
// the live search API (an unknown value makes it answer HTTP 500).
// Fit, size, ease and gender use the `fit` filter instead (PATTERN_FITS).

/** [permalink, name] pairs per group. */
export const PATTERN_ATTRIBUTE_GROUPS = {
  accessibility: [
    ['adaptive', 'adaptive design'],
    ['medical-device-access', 'medical device access'],
    ['medical-device-accessory', 'medical device support'],
    ['mobility-aid-accessory', 'mobility aid support'],
    ['other-accessibility', 'other'],
    ['therapy-aid', 'therapy aid/toy'],
  ],
  colorwork: [
    ['corrugated-ribbing', 'corrugated ribbing'],
    ['illusion', 'illusion/shadow'],
    ['Intarsia', 'Intarsia'],
    ['mosaic', 'mosaic'],
    ['other-colorwork', 'other'],
    ['stranded', 'stranded'],
    ['stripes-colorwork', 'stripes / colorwork'],
  ],
  construction: [
    ['bias', 'bias'],
    ['bottom-up', 'bottom up'],
    ['buttonholes', 'buttonholes'],
    ['doubleknit', 'double knitting'],
    ['entrelac', 'entrelac'],
    ['felted', 'felted/fulled'],
    ['freeform', 'freeform'],
    ['gusset', 'gusset'],
    ['icord', 'icord'],
    ['kitchener', 'kitchener/grafting'],
    ['modular', 'modular / join as you go'],
    ['moebius', 'moebius'],
    ['motifs', 'motifs'],
    ['one-piece', 'one-piece'],
    ['provisional', 'provisional cast-on'],
    ['seamed', 'seamed'],
    ['seamless', 'seamless'],
    ['selvedge', 'selvedge'],
    ['short-rows', 'short rows'],
    ['sideways', 'sideways'],
    ['steeks', 'steeks'],
    ['three-needle-bind', 'three needle bind off'],
    ['thrums', 'thrums'],
    ['top-down', 'top down'],
    ['twined', 'twined knitting'],
    ['worked-flat', 'worked flat'],
    ['in-the-round', 'worked in the round'],
  ],
  crochet: [
    ['broomstick', 'broomstick crochet'],
    ['bruges', 'bruges crochet'],
    ['bullion', 'bullion / roll stitch'],
    ['clones', 'clones knot'],
    ['crohook', 'cro-hook / croknit'],
    ['crotat', 'cro-tatting / crochet'],
    ['filet-crochet', 'filet crochet'],
    ['post-stitch', 'front/back post stitch'],
    ['granny-square', 'granny square'],
    ['hairpin-crochet', 'hairpin crochet'],
    ['irish-crochet', 'Irish crochet'],
    ['lovers', "lover's knot/Solomon's knot/knot stitch"],
    ['pineapple', 'pineapple crochet'],
    ['slip-stitch', 'slip stitch crochet'],
    ['surface-crochet', 'surface crochet'],
    ['tapestry-crochet', 'tapestry crochet'],
    ['tunisian', 'Tunisian / afghan crochet'],
  ],
  design: [
    ['aline', 'A line'],
    ['appliqued', 'appliqued / embellished'],
    ['asymmetric', 'asymmetric'],
    ['backfastening', 'back fastening'],
    ['beads', 'beads / pailettes'],
    ['box-pleats', 'box pleats'],
    ['braids-plaiting', 'braids / plaiting'],
    ['buttoned', 'buttoned'],
    ['circular-yoke', 'circular yoke'],
    ['convertible', 'convertible'],
    ['cropped', 'cropped'],
    ['darts', 'darts'],
    ['doublebreasted', 'double breasted'],
    ['duplicate-stitch', 'duplicate stitch'],
    ['embroidery', 'embroidery'],
    ['empire', 'empire waist'],
    ['facings', 'facings'],
    ['fringe', 'fringe'],
    ['front-fastening', 'front fastening'],
    ['gathers', 'gathers'],
    ['hems', 'hems'],
    ['hood', 'hood'],
    ['lined', 'lined'],
    ['notched', 'notched'],
    ['peplum', 'peplum'],
    ['picots', 'picots'],
    ['pleated', 'pleated'],
    ['racerback', 'racer back'],
    ['ruffles', 'ruffles'],
    ['shoulder-fastening', 'shoulder fastening'],
    ['single-breasted', 'single breasted'],
    ['snaps', 'snaps'],
    ['straight', 'straight'],
    ['stripes', 'stripes'],
    ['swing', 'swing'],
    ['tassel', 'tassel / pompom'],
    ['tied', 'tied'],
    ['waist', 'waist shaping'],
    ['wrap', 'wrap'],
    ['zipper', 'zipper'],
  ],
  'design/collar': [
    ['collar', 'collared'],
    ['mandarin', 'mandarin'],
    ['peterpan', 'peter pan'],
    ['rolled', 'rolled'],
    ['shawl', 'shawl collar'],
    ['shirt-collar', 'shirt'],
  ],
  'design/edging': [
    ['crocheted-edging', 'crocheted edging'],
    ['icord-edging', 'icord edging'],
    ['lace-edging', 'lace edging'],
    ['other-edging', 'other edging'],
  ],
  'design/neck': [
    ['ballet-neck', 'ballet neck'],
    ['boat-neck', 'boat neck'],
    ['cowl-neck', 'cowl neck'],
    ['crew-neck', 'crew neck'],
    ['funnel-neck', 'funnel neck'],
    ['halter-neck', 'halter'],
    ['henley-neck', 'henley'],
    ['keyhole-neck', 'keyhole neck'],
    ['mock-turtleneck', 'mock turtle'],
    ['scoop-neck', 'scoop neck'],
    ['square-neck', 'square neck'],
    ['surplice-neck', 'surplice'],
    ['sweetheart-neck', 'sweetheart neck'],
    ['turtleneck', 'turtle neck'],
    ['v-neck', 'v neck'],
  ],
  'design/pocket': [
    ['afterthought-pocket', 'afterthought pocket'],
    ['pockets', 'any pockets'],
    ['hidden-pocket', 'hidden / inseam'],
    ['patch-pocket', 'patch'],
    ['set-in-pocket', 'set-in'],
    ['tubular-pocket', 'tubular'],
  ],
  'design/sleeve': [
    ['3-4-sleeve', '3/4 length'],
    ['sleeves', 'any sleeves'],
    ['bracelet-sleeve', 'bracelet length'],
    ['cap-sleeve', 'cap'],
    ['contiguous', 'contiguous'],
    ['cuffed-sleeve', 'cuffed'],
    ['dolman-sleeve', 'dolman'],
    ['drop-sleeve', 'drop'],
    ['elbow-sleeve', 'elbow'],
    ['flutter-sleeve', 'flutter'],
    ['long-sleeve', 'long'],
    ['modified-drop-sleeve', 'modified drop'],
    ['nalgar-sleeve', 'Nalgar (EZ notation)'],
    ['puffed-sleeve', 'puffed'],
    ['raglan-sleeve', 'raglan'],
    ['saddle-shoulder', 'saddle shoulder'],
    ['set-in-sleeve', 'set in'],
    ['short-sleeve', 'short'],
    ['sleeveless', 'sleeveless'],
    ['tulip-sleeve', 'tulip'],
  ],
  fabric: [
    ['bobble-or-popcorn', 'bobble / popcorn / nupp'],
    ['brioche-tuck', 'brioche / tuck stitch'],
    ['cables', 'cables'],
    ['chevron', 'chevron / flame stitch'],
    ['dropped-stitches', 'dropped stitches'],
    ['elastic', 'elastic'],
    ['eyelets', 'eyelets'],
    ['lace', 'lace'],
    ['mesh', 'mesh'],
    ['reversible', 'reversible'],
    ['ribbed', 'ribbed / ribbing'],
    ['ripple', 'ripple'],
    ['slipped-stitches', 'slipped stitches'],
    ['smocked', 'smocked'],
    ['textured', 'textured'],
    ['twisted-stitches', 'twisted stitches'],
  ],
  instructions: [
    ['captioned-video', 'captioned video'],
    ['chart', 'chart'],
    ['color-blind-accessible', 'color blind accessible'],
    ['digital-audio', 'digital audio'],
    ['digital-braille', 'digital braille'],
    ['schematic', 'has schematic'],
    ['low-vision', 'low vision'],
    ['machine-instructions', 'machine instructions'],
    ['phototutorial', 'photo tutorial'],
    ['press-braille', 'press braille'],
    ['pattern-recipe', 'recipe - percentage / calculated'],
    ['screen-reader', 'screen reader access'],
    ['video-tutorial', 'video tutorial'],
    ['written-pattern', 'written pattern'],
  ],
  regional: [
    ['amigurumi', 'amigurumi'],
    ['andean', 'Andean / Peruvian'],
    ['aran', 'Aran'],
    ['bavarian', 'Bavarian'],
    ['cowichan', 'Cowichan (Salish)'],
    ['danish', 'Danish'],
    ['estonian', 'Estonian'],
    ['fairisle', 'Fair Isle'],
    ['faroese', 'Faroese'],
    ['finnish', 'Finnish / Suomi'],
    ['guernsey', 'Guernsey / Gansey'],
    ['icelandic', 'Icelandic'],
    ['irish', 'Irish'],
    ['latvian', 'Latvian'],
    ['norwegian', 'Norwegian'],
    ['orenburg', 'Orenburg'],
    ['sami', 'Sami'],
    ['Shetland', 'Shetland'],
    ['swedish', 'Swedish'],
    ['turkish', 'Turkish'],
  ],
  shapes: [
    ['3-dimensional', '3 dimensional'],
    ['circle-shaped', 'circle'],
    ['crescent-shape', 'crescent'],
    ['cube-shaped', 'cube'],
    ['halfcircle-shape', 'half-circle'],
    ['hexagon', 'hexagon'],
    ['octagon', 'octagon'],
    ['oval', 'oval'],
    ['pentagon-shape', 'pentagon'],
    ['pyramid', 'pyramid'],
    ['rectangle', 'rectangle'],
    ['sphere-shaped', 'sphere'],
    ['square', 'square'],
    ['star-shaped', 'star'],
    ['triangle-shaped', 'triangle'],
  ],
  sock: [
    ['noshaping', 'no shaping'],
    ['seamed-sock', 'seamed sock'],
    ['shaped-arches', 'shaped arches'],
    ['start-in-middle', 'starting in middle'],
    ['toe-up', 'toe up'],
    ['top-cuff-down', 'top/cuff down'],
    ['2-at-a-time', 'two at a time'],
  ],
  'sock/heel': [
    ['afterthought-heel', 'afterthought heel'],
    ['dutch-heel', 'Dutch heel'],
    ['heel-flap', 'heel flap'],
    ['other-heel', 'other heel'],
    ['short-row-heel', 'short row heel'],
  ],
  'sock/toe': [
    ['other-toe', 'other'],
    ['short-row-toe', 'short row toe'],
    ['star-toe', 'star'],
    ['wide-toe', 'wide'],
  ],
} as const satisfies Record<string, readonly (readonly [string, string])[]>;

export type PatternAttributeGroup = keyof typeof PATTERN_ATTRIBUTE_GROUPS;

export interface PatternAttribute {
  permalink: string;
  name: string;
  group: PatternAttributeGroup;
}

export const PATTERN_ATTRIBUTES: readonly PatternAttribute[] = Object.entries(
  PATTERN_ATTRIBUTE_GROUPS,
).flatMap(([group, pairs]) =>
  pairs.map(([permalink, name]) => ({ permalink, name, group: group as PatternAttributeGroup })),
);

const BY_PERMALINK = new Map(PATTERN_ATTRIBUTES.map(a => [a.permalink, a]));

/** Attribute name for a permalink from pattern details, e.g. "in-the-round" → "worked in the round". */
export function attributeName(permalink: string): string {
  return BY_PERMALINK.get(permalink)?.name ?? permalink.replace(/-/g, ' ');
}

// Everyday words whose attribute is not found by its Ravelry name alone.
const ATTRIBUTE_ALIASES: Record<string, string> = {
  colorwork: 'stranded',
  colourwork: 'stranded',
  'stranded colorwork': 'stranded',
  'fair isle': 'fairisle',
  yoke: 'circular-yoke',
  'yoke sweater': 'circular-yoke',
  raglan: 'raglan-sleeve',
  'set in sleeves': 'set-in-sleeve',
  'drop shoulder': 'drop-sleeve',
  'in the round': 'in-the-round',
  circular: 'in-the-round',
  flat: 'worked-flat',
  'cuff down': 'top-cuff-down',
  'top down socks': 'top-cuff-down',
  charted: 'chart',
  charts: 'chart',
  written: 'written-pattern',
  'written instructions': 'written-pattern',
  video: 'video-tutorial',
  tutorial: 'phototutorial',
  bobbles: 'bobble-or-popcorn',
  nupps: 'bobble-or-popcorn',
  brioche: 'brioche-tuck',
  ribbing: 'ribbed',
  pockets: 'pockets',
  hooded: 'hood',
  'double knit': 'doubleknit',
  'short row': 'short-rows',
  steek: 'steeks',
  granny: 'granny-square',
  'granny squares': 'granny-square',
  'two at a time': '2-at-a-time',
  'percentage pattern': 'pattern-recipe',
  recipe: 'pattern-recipe',
};

const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export class UnknownAttributeError extends Error {
  override name = 'UnknownAttributeError';
}

/**
 * Resolves a plain-words attribute ("top down", "cables", "Fair Isle") to the
 * permalink the `pa` filter expects. Throws with close suggestions otherwise.
 */
export function resolveAttribute(input: string): PatternAttribute {
  const wanted = normalize(input);
  const singular = wanted.replace(/s$/, '');
  const alias = ATTRIBUTE_ALIASES[wanted] ?? ATTRIBUTE_ALIASES[singular];
  const aliased = alias ? BY_PERMALINK.get(alias) : undefined;
  if (aliased) return aliased;

  // "other" exists in many groups, so it is only reachable by its exact permalink.
  const candidates = PATTERN_ATTRIBUTES.filter(a => normalize(a.name) !== 'other');
  const keys = (a: PatternAttribute) => [normalize(a.permalink), normalize(a.name)];
  const exact =
    BY_PERMALINK.get(input.trim()) ??
    candidates.find(a => keys(a).some(key => key === wanted || key === singular));
  if (exact) return exact;

  const padded = (text: string) => ` ${text} `;
  const partial = candidates.filter(a =>
    keys(a).some(
      key => padded(key).includes(padded(wanted)) || padded(key).includes(padded(singular)),
    ),
  );
  if (partial.length === 1 && partial[0]) return partial[0];

  const stem = singular.slice(0, 4);
  const suggestions = (
    partial.length > 0 ? partial : candidates.filter(a => keys(a).some(key => key.includes(stem)))
  )
    .slice(0, 8)
    .map(a => `"${a.name}" (${a.group})`);
  throw new UnknownAttributeError(
    `Unknown pattern attribute "${input}".` +
      (suggestions.length > 0
        ? ` Did you mean one of: ${suggestions.join(', ')}?`
        : ' Use construction or technique words such as "top down", "seamless", "cables", ' +
          '"stranded", "lace", "raglan", "toe up" or "granny square".'),
  );
}
