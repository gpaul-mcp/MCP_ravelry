// Reference tables that Ravelry does not provide. Needle sizes and yarn weights
// come from Ravelry itself (cached); these add the UK/Japanese/regional names,
// terminology and the standard abbreviations (Craft Yarn Council list plus the
// common extras).

/** Old UK/Canadian needle numbers by metric size. */
export const UK_NEEDLE_SIZES: Record<number, string> = {
  2: '14',
  2.25: '13',
  2.75: '12',
  3: '11',
  3.25: '10',
  3.75: '9',
  4: '8',
  4.5: '7',
  5: '6',
  5.5: '5',
  6: '4',
  6.5: '3',
  7: '2',
  7.5: '1',
  8: '0',
  9: '00',
  10: '000',
};

/** Japanese needle numbers (they follow their own 0.3 mm steps). */
export const JAPANESE_NEEDLE_SIZES: { number: string; mm: number }[] = [
  { number: '0', mm: 2.1 },
  { number: '1', mm: 2.4 },
  { number: '2', mm: 2.7 },
  { number: '3', mm: 3 },
  { number: '4', mm: 3.3 },
  { number: '5', mm: 3.6 },
  { number: '6', mm: 3.9 },
  { number: '7', mm: 4.2 },
  { number: '8', mm: 4.5 },
  { number: '9', mm: 4.8 },
  { number: '10', mm: 5.1 },
  { number: '11', mm: 5.4 },
  { number: '12', mm: 5.7 },
  { number: '13', mm: 6 },
  { number: '14', mm: 6.3 },
  { number: '15', mm: 6.6 },
];

/** Regional names and typical tools per Ravelry yarn weight (Craft Yarn Council ranges). */
export const YARN_WEIGHT_INFO: Record<
  string,
  { cyc: string; uk: string; au_nz: string; also: string[]; needles_mm: string; hook_mm: string }
> = {
  Thread: {
    cyc: '0 Lace',
    uk: 'Crochet thread / cotton',
    au_nz: 'Crochet cotton',
    also: ['crochet thread', 'size 10 thread'],
    needles_mm: '1.5–2.25',
    hook_mm: '1.0–1.75 (steel)',
  },
  Cobweb: {
    cyc: '0 Lace',
    uk: '1-ply',
    au_nz: '1 ply',
    also: [],
    needles_mm: '1.5–2.25',
    hook_mm: '1.5–2.25',
  },
  Lace: {
    cyc: '0 Lace',
    uk: '2-ply',
    au_nz: '2 ply',
    also: [],
    needles_mm: '1.5–2.25',
    hook_mm: '1.5–2.25',
  },
  'Light Fingering': {
    cyc: '1 Super Fine',
    uk: '3-ply',
    au_nz: '3 ply',
    also: ['baby'],
    needles_mm: '2.0–2.75',
    hook_mm: '2.25–3.0',
  },
  Fingering: {
    cyc: '1 Super Fine',
    uk: '4-ply',
    au_nz: '4 ply',
    also: ['sock', 'baby'],
    needles_mm: '2.25–3.25',
    hook_mm: '2.25–3.5',
  },
  Sport: {
    cyc: '2 Fine',
    uk: '5-ply / baby',
    au_nz: '5 ply',
    also: ['baby'],
    needles_mm: '3.25–3.75',
    hook_mm: '3.5–4.5',
  },
  DK: {
    cyc: '3 Light',
    uk: 'DK (double knitting)',
    au_nz: '8 ply',
    also: ['light worsted'],
    needles_mm: '3.75–4.5',
    hook_mm: '4.5–5.5',
  },
  Worsted: {
    cyc: '4 Medium',
    uk: 'Aran (UK Aran is close to US worsted)',
    au_nz: '10 ply',
    also: ['afghan'],
    needles_mm: '4.5–5.5',
    hook_mm: '5.5–6.5',
  },
  Aran: {
    cyc: '4 Medium',
    uk: 'Aran',
    au_nz: '10–12 ply',
    also: ['heavy worsted'],
    needles_mm: '5.0–5.5',
    hook_mm: '5.5–6.5',
  },
  Bulky: {
    cyc: '5 Bulky',
    uk: 'Chunky',
    au_nz: '12–14 ply',
    also: ['chunky', 'craft', 'rug'],
    needles_mm: '5.5–8.0',
    hook_mm: '6.5–9.0',
  },
  'Super Bulky': {
    cyc: '6 Super Bulky',
    uk: 'Super chunky',
    au_nz: '14+ ply',
    also: ['roving'],
    needles_mm: '8.0–12.75',
    hook_mm: '9.0–15',
  },
  Jumbo: {
    cyc: '7 Jumbo',
    uk: 'Jumbo',
    au_nz: 'Jumbo',
    also: ['arm knitting'],
    needles_mm: '12.75 and up',
    hook_mm: '15 and up',
  },
};

/** US → UK crochet stitch names. The same words mean different stitches! */
export const CROCHET_TERMS: { us: string; uk: string; note?: string }[] = [
  { us: 'chain (ch)', uk: 'chain (ch)' },
  { us: 'slip stitch (sl st)', uk: 'slip stitch (ss)' },
  { us: 'single crochet (sc)', uk: 'double crochet (dc)' },
  { us: 'half double crochet (hdc)', uk: 'half treble (htr)' },
  { us: 'double crochet (dc)', uk: 'treble (tr)' },
  { us: 'treble / triple crochet (tr)', uk: 'double treble (dtr)' },
  { us: 'double treble (dtr)', uk: 'triple treble (trtr)' },
  { us: 'single crochet 2 together (sc2tog)', uk: 'double crochet 2 together (dc2tog)' },
  { us: 'double crochet 2 together (dc2tog)', uk: 'treble 2 together (tr2tog)' },
  { us: 'front post double crochet (FPdc)', uk: 'front post treble (FPtr)' },
  { us: 'back post double crochet (BPdc)', uk: 'back post treble (BPtr)' },
  { us: 'skip', uk: 'miss' },
  { us: 'yarn over (yo)', uk: 'yarn over hook (yoh) / yarn round hook (yrh)' },
  { us: 'gauge', uk: 'tension' },
  { us: 'fasten off', uk: 'fasten off' },
  {
    us: 'tip',
    uk: 'tip',
    note: 'A pattern that never uses "sc" but uses "dc" a lot is probably in UK terms; check with the pattern\'s terminology field.',
  },
];

/** US → UK knitting words (the stitches are the same, the vocabulary differs). */
export const KNITTING_TERMS: { us: string; uk: string; note?: string }[] = [
  { us: 'bind off', uk: 'cast off' },
  { us: 'gauge', uk: 'tension' },
  { us: 'stockinette stitch', uk: 'stocking stitch' },
  { us: 'reverse stockinette', uk: 'reverse stocking stitch' },
  { us: 'seed stitch', uk: 'moss stitch' },
  { us: 'moss stitch', uk: 'double moss stitch', note: 'Also called Irish moss.' },
  {
    us: 'yarn over (yo)',
    uk: 'yarn forward (yfwd), yarn round needle (yrn), yarn over needle (yon)',
  },
  { us: 'work even', uk: 'work straight' },
  { us: 'skein', uk: 'ball / hank' },
  { us: 'join (in the round)', uk: 'join' },
];

export interface Abbreviation {
  abbr: string;
  meaning: string;
  craft: 'knitting' | 'crochet' | 'both';
}

export const ABBREVIATIONS: Abbreviation[] = [
  // Both crafts
  { abbr: 'alt', meaning: 'alternate', craft: 'both' },
  { abbr: 'approx', meaning: 'approximately', craft: 'both' },
  { abbr: 'beg', meaning: 'begin / beginning', craft: 'both' },
  { abbr: 'bet', meaning: 'between', craft: 'both' },
  { abbr: 'BOR', meaning: 'beginning of round', craft: 'both' },
  { abbr: 'CC', meaning: 'contrasting color', craft: 'both' },
  { abbr: 'cont', meaning: 'continue', craft: 'both' },
  { abbr: 'dec', meaning: 'decrease (one stitch fewer)', craft: 'both' },
  { abbr: 'foll', meaning: 'follow / following', craft: 'both' },
  { abbr: 'inc', meaning: 'increase (one stitch more)', craft: 'both' },
  { abbr: 'lp(s)', meaning: 'loop(s)', craft: 'both' },
  { abbr: 'm', meaning: 'marker', craft: 'both' },
  { abbr: 'MC', meaning: 'main color', craft: 'both' },
  { abbr: 'patt', meaning: 'pattern', craft: 'both' },
  { abbr: 'pm', meaning: 'place marker', craft: 'both' },
  { abbr: 'rem', meaning: 'remain / remaining', craft: 'both' },
  { abbr: 'rep', meaning: 'repeat', craft: 'both' },
  { abbr: 'rnd(s)', meaning: 'round(s)', craft: 'both' },
  { abbr: 'RS', meaning: 'right side (the public side)', craft: 'both' },
  { abbr: 'sk', meaning: 'skip', craft: 'both' },
  { abbr: 'sm', meaning: 'slip marker', craft: 'both' },
  { abbr: 'st(s)', meaning: 'stitch(es)', craft: 'both' },
  { abbr: 'tbl', meaning: 'through the back loop', craft: 'both' },
  { abbr: 'tog', meaning: 'together', craft: 'both' },
  { abbr: 'WS', meaning: 'wrong side', craft: 'both' },
  { abbr: 'yo', meaning: 'yarn over', craft: 'both' },
  { abbr: '* … ; rep from *', meaning: 'repeat the steps after the asterisk', craft: 'both' },
  { abbr: '[ … ] or ( … ) n times', meaning: 'work the steps in brackets n times', craft: 'both' },

  // Knitting
  { abbr: 'BO', meaning: 'bind off (UK: cast off)', craft: 'knitting' },
  { abbr: 'CO', meaning: 'cast on', craft: 'knitting' },
  { abbr: 'cn', meaning: 'cable needle', craft: 'knitting' },
  {
    abbr: 'C4F / C4B',
    meaning:
      'cable 4 front / back: slip 2 sts to cable needle, hold in front (left cross) or back ' +
      '(right cross), k2, then k2 from cable needle',
    craft: 'knitting',
  },
  {
    abbr: '1/1 LC, 2/2 RC…',
    meaning: 'cable crosses: left (LC) or right (RC) cross, stitches over stitches',
    craft: 'knitting',
  },
  { abbr: 'dpn(s)', meaning: 'double-pointed needle(s)', craft: 'knitting' },
  { abbr: 'g st', meaning: 'garter stitch (knit every row)', craft: 'knitting' },
  { abbr: 'k', meaning: 'knit', craft: 'knitting' },
  { abbr: 'k2tog', meaning: 'knit 2 together (right-leaning decrease)', craft: 'knitting' },
  { abbr: 'k3tog', meaning: 'knit 3 together (right-leaning double decrease)', craft: 'knitting' },
  {
    abbr: 'kfb',
    meaning: 'knit into the front and back of the same stitch (increase)',
    craft: 'knitting',
  },
  { abbr: 'k-wise / kwise', meaning: 'knitwise (as if to knit)', craft: 'knitting' },
  { abbr: 'k1tbl', meaning: 'knit 1 through the back loop (twisted stitch)', craft: 'knitting' },
  { abbr: 'LH / RH', meaning: 'left-hand / right-hand (needle)', craft: 'knitting' },
  {
    abbr: 'LLI / RLI',
    meaning: 'left / right lifted increase (into the stitch below)',
    craft: 'knitting',
  },
  {
    abbr: 'M1 / M1L',
    meaning:
      'make 1 left: lift the bar between stitches from front to back, knit it through the back ' +
      'loop (increase)',
    craft: 'knitting',
  },
  {
    abbr: 'M1R',
    meaning: 'make 1 right: lift the bar from back to front, knit it through the front (increase)',
    craft: 'knitting',
  },
  { abbr: 'M1P', meaning: 'make 1 purlwise (increase)', craft: 'knitting' },
  { abbr: 'MB', meaning: 'make bobble (see the pattern for how)', craft: 'knitting' },
  {
    abbr: 'MDS',
    meaning: 'make double stitch (German short rows)',
    craft: 'knitting',
  },
  { abbr: 'p', meaning: 'purl', craft: 'knitting' },
  { abbr: 'p2tog', meaning: 'purl 2 together (decrease)', craft: 'knitting' },
  { abbr: 'p-wise / pwise', meaning: 'purlwise (as if to purl)', craft: 'knitting' },
  {
    abbr: 'psso',
    meaning: 'pass slipped stitch over (the one just worked)',
    craft: 'knitting',
  },
  { abbr: 'PU / pick up and knit', meaning: 'pick up stitches along an edge', craft: 'knitting' },
  { abbr: 'rev St st', meaning: 'reverse stockinette (purl side showing)', craft: 'knitting' },
  { abbr: 'rm', meaning: 'remove marker', craft: 'knitting' },
  {
    abbr: 's2kp / cdd',
    meaning: 'centered double decrease: slip 2 together knitwise, k1, pass the 2 slipped sts over',
    craft: 'knitting',
  },
  {
    abbr: 'sk2p / sk2po',
    meaning: 'slip 1, k2tog, pass slipped stitch over (left-leaning double decrease)',
    craft: 'knitting',
  },
  {
    abbr: 'skp / skpo',
    meaning: 'slip 1, knit 1, pass slipped stitch over (left-leaning decrease)',
    craft: 'knitting',
  },
  { abbr: 'sl', meaning: 'slip (purlwise unless told otherwise)', craft: 'knitting' },
  {
    abbr: 'ssk',
    meaning:
      'slip, slip, knit: slip 2 sts knitwise one at a time, knit them together through the back ' +
      '(left-leaning decrease)',
    craft: 'knitting',
  },
  { abbr: 'ssp', meaning: 'slip, slip, purl (decrease)', craft: 'knitting' },
  {
    abbr: 'sssk',
    meaning: 'slip, slip, slip, knit (left-leaning double decrease)',
    craft: 'knitting',
  },
  { abbr: 'St st', meaning: 'stockinette (UK: stocking) stitch', craft: 'knitting' },
  {
    abbr: 'w&t',
    meaning: 'wrap and turn (short rows): the row stops there',
    craft: 'knitting',
  },
  { abbr: 'wyib / wyif', meaning: 'with yarn in back / in front', craft: 'knitting' },
  { abbr: 'yfwd / yrn / yon', meaning: 'UK names for a yarn over', craft: 'knitting' },

  // Crochet (US terms)
  { abbr: 'BLO / FLO', meaning: 'back loop only / front loop only', craft: 'crochet' },
  { abbr: 'BPdc / FPdc', meaning: 'back / front post double crochet', craft: 'crochet' },
  { abbr: 'ch', meaning: 'chain', craft: 'crochet' },
  { abbr: 'ch-sp', meaning: 'chain space (the gap under a chain)', craft: 'crochet' },
  { abbr: 'cl', meaning: 'cluster', craft: 'crochet' },
  { abbr: 'dc', meaning: 'double crochet (US) — UK treble', craft: 'crochet' },
  { abbr: 'dc2tog', meaning: 'double crochet 2 together (decrease)', craft: 'crochet' },
  { abbr: 'dtr', meaning: 'double treble crochet', craft: 'crochet' },
  { abbr: 'FO', meaning: 'fasten off', craft: 'crochet' },
  { abbr: 'hdc', meaning: 'half double crochet (US) — UK half treble', craft: 'crochet' },
  { abbr: 'inc', meaning: '2 stitches in the same stitch', craft: 'crochet' },
  {
    abbr: 'invdec',
    meaning: 'invisible decrease: front loops of the next 2 sts, then sc',
    craft: 'crochet',
  },
  { abbr: 'MR', meaning: 'magic ring (adjustable ring)', craft: 'crochet' },
  { abbr: 'pc', meaning: 'popcorn stitch', craft: 'crochet' },
  { abbr: 'sc', meaning: 'single crochet (US) — UK double crochet', craft: 'crochet' },
  { abbr: 'sc2tog', meaning: 'single crochet 2 together (decrease)', craft: 'crochet' },
  { abbr: 'sl st', meaning: 'slip stitch', craft: 'crochet' },
  { abbr: 'tch', meaning: 'turning chain', craft: 'crochet' },
  { abbr: 'tr', meaning: 'treble (triple) crochet (US) — UK double treble', craft: 'crochet' },
  { abbr: 'V-st', meaning: '(dc, ch 1, dc) in the same stitch', craft: 'crochet' },
];
