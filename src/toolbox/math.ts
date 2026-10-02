// Knitting and crochet arithmetic. Language models get these wrong easily, so
// the tools compute them and the model explains the result.

export type Craft = 'knitting' | 'crochet';

export interface SpreadInput {
  stitches: number;
  /** Positive to increase, negative to decrease. */
  change: number;
  worked: 'flat' | 'round';
  craft: Craft;
  /** Crochet stitch to use, e.g. "sc" or "dc". */
  stitch?: string;
}

export interface SpreadStep {
  repeat: number;
  plain: number;
  then: 'inc' | 'dec' | null;
}

export interface SpreadResult {
  instructions: string;
  steps: SpreadStep[];
  stitches_before: number;
  stitches_after: number;
}

export class CalculationError extends Error {
  override name = 'CalculationError';
}

/**
 * Spreads increases or decreases evenly across a row or round, e.g. 13
 * increases over 97 stitches. Flat rows keep about half a gap at each edge so
 * the shaping stays away from the selvedges.
 */
export function spreadEvenly(input: SpreadInput): SpreadResult {
  const { stitches, change, worked, craft } = input;
  const count = Math.abs(change);
  if (!Number.isInteger(stitches) || stitches < 1) {
    throw new CalculationError('stitches must be a positive whole number.');
  }
  if (!Number.isInteger(change) || change === 0) {
    throw new CalculationError('change must be a non-zero whole number.');
  }
  const increasing = change > 0;
  // Stitches each shaping uses from the row below: M1 none, crochet "2 in next" one, k2tog two.
  const used = increasing ? (craft === 'crochet' ? 1 : 0) : 2;
  const plain = stitches - count * used;
  if (plain < 0 || (increasing && craft === 'knitting' && count > stitches)) {
    throw new CalculationError(
      `Too many ${increasing ? 'increases' : 'decreases'} for ${stitches} stitches; ` +
        `work them over two rows or ${increasing ? 'double every stitch first' : 'use double decreases'}.`,
    );
  }

  const gaps = worked === 'round' ? count : count + 1;
  const weights = Array.from({ length: gaps }, (_, i) =>
    worked === 'flat' && (i === 0 || i === gaps - 1) ? 0.5 : 1,
  );
  const sizes = apportion(plain, weights);
  const op = increasing ? 'inc' : 'dec';

  // Inner gaps, larger first, so the result reads as at most two repeats.
  const inner = worked === 'round' ? sizes : sizes.slice(1, -1);
  inner.sort((a, b) => b - a);
  const pairs: SpreadStep[] =
    worked === 'round'
      ? inner.map(size => ({ repeat: 1, plain: size, then: op }))
      : [
          { repeat: 1, plain: sizes[0] ?? 0, then: op },
          ...inner.map((size): SpreadStep => ({ repeat: 1, plain: size, then: op })),
          { repeat: 1, plain: sizes.at(-1) ?? 0, then: null },
        ];

  const steps: SpreadStep[] = [];
  for (const pair of pairs) {
    const last = steps.at(-1);
    if (last?.plain === pair.plain && last.then === pair.then) last.repeat++;
    else steps.push({ ...pair });
  }

  return {
    instructions: describeSteps(steps, input),
    steps,
    stitches_before: stitches,
    stitches_after: stitches + change,
  };
}

/** Splits `total` into whole parts proportional to `weights` (largest remainder). */
function apportion(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  const exact = weights.map(w => (total * w) / sum);
  const parts = exact.map(Math.floor);
  let left = total - parts.reduce((a, b) => a + b, 0);
  const order = exact
    .map((value, index) => ({ index, rest: value - Math.floor(value) }))
    .sort((a, b) => b.rest - a.rest || a.index - b.index);
  for (const { index } of order) {
    if (left <= 0) break;
    parts[index] = (parts[index] ?? 0) + 1;
    left--;
  }
  return parts;
}

function describeSteps(steps: SpreadStep[], input: SpreadInput): string {
  const stitch = input.stitch?.trim() ? input.stitch.trim() : 'sc';
  const work = (n: number) =>
    input.craft === 'knitting'
      ? `k${n}`
      : n === 1
        ? `${stitch} in next st`
        : `${stitch} in next ${n} sts`;
  const shaping = (op: 'inc' | 'dec') =>
    input.craft === 'knitting'
      ? op === 'inc'
        ? 'M1'
        : 'k2tog'
      : op === 'inc'
        ? `2 ${stitch} in next st`
        : `${stitch}2tog`;
  const unit = (step: SpreadStep) =>
    [step.plain > 0 ? work(step.plain) : null, step.then ? shaping(step.then) : null]
      .filter(Boolean)
      .join(', ');

  const parts = steps
    .filter(step => step.plain > 0 || step.then)
    .map(step => (step.repeat > 1 ? `[${unit(step)}] ${step.repeat} times` : unit(step)));
  const where = input.worked === 'round' ? 'Round' : 'Row';
  return `${where}: ${parts.join(', ')}. (${input.stitches} → ${input.stitches + input.change} sts)`;
}

// ---- Gauge ----

export interface Gauge {
  stitches: number;
  rows?: number | undefined;
  /** Width the counts are measured over. */
  over: number;
  unit: 'cm' | 'in';
}

const CM_PER_IN = 2.54;

/** Stitches (and rows) per 10 cm. */
export function per10cm(gauge: Gauge): { stitches: number; rows: number | null } {
  const cm = gauge.unit === 'cm' ? gauge.over : gauge.over * CM_PER_IN;
  return {
    stitches: (gauge.stitches * 10) / cm,
    rows: gauge.rows ? (gauge.rows * 10) / cm : null,
  };
}

/** Rounds `value` to the nearest count that fits a stitch repeat (multiple of `of`, plus `plus`). */
export function roundToRepeat(value: number, of = 1, plus = 0): number {
  const repeats = Math.max(0, Math.round((value - plus) / of));
  return repeats * of + plus;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

export interface GaugeComparison {
  pattern_per_10cm: { stitches: number; rows: number | null };
  yours_per_10cm: { stitches: number; rows: number | null };
  stitch_difference_percent: number;
  row_difference_percent: number | null;
  verdict: 'matches' | 'looser' | 'tighter';
  as_written_scale: number;
  needle_advice: string;
}

/**
 * Compares the user's swatch with the pattern gauge. `as_written_scale`
 * is how much bigger (>1) or smaller the piece comes out if they follow the
 * pattern's numbers unchanged.
 */
export function compareGauge(pattern: Gauge, yours: Gauge): GaugeComparison {
  const p = per10cm(pattern);
  const y = per10cm(yours);
  const stitchDiff = (y.stitches - p.stitches) / p.stitches;
  const rowDiff = p.rows && y.rows ? (y.rows - p.rows) / p.rows : null;
  const verdict = Math.abs(stitchDiff) <= 0.02 ? 'matches' : stitchDiff < 0 ? 'looser' : 'tighter';
  // Rule of thumb: one needle size (~0.25–0.5 mm) moves gauge by about 2 sts per 10 cm.
  const sizes = Math.max(1, Math.round(Math.abs(y.stitches - p.stitches) / 2));
  const needle_advice =
    verdict === 'matches'
      ? 'Your stitch gauge matches: keep this needle.'
      : `You get ${verdict === 'looser' ? 'fewer' : 'more'} stitches than the pattern, so the ` +
        `fabric is ${verdict === 'looser' ? 'bigger' : 'smaller'}. Try about ${sizes} needle ` +
        `size${sizes === 1 ? '' : 's'} ${verdict === 'looser' ? 'smaller' : 'larger'} ` +
        '(roughly 0.25–0.5 mm per size) and swatch again, or keep your fabric and recalculate ' +
        'the numbers.';
  return {
    pattern_per_10cm: { stitches: round1(p.stitches), rows: p.rows ? round1(p.rows) : null },
    yours_per_10cm: { stitches: round1(y.stitches), rows: y.rows ? round1(y.rows) : null },
    stitch_difference_percent: Math.round(stitchDiff * 1000) / 10,
    row_difference_percent: rowDiff === null ? null : Math.round(rowDiff * 1000) / 10,
    verdict,
    as_written_scale: Math.round((p.stitches / y.stitches) * 1000) / 1000,
    needle_advice,
  };
}

// ---- Yarn quantities ----

export const METERS_PER_YARD = 0.9144;

export interface YarnNeeded {
  yards: number;
  meters: number;
  skeins: number;
  spare_yards: number;
}

/** Whole skeins to buy for `yards`, with a safety margin (percent). */
export function skeinsFor(yards: number, yardsPerSkein: number, marginPercent: number): YarnNeeded {
  const withMargin = yards * (1 + marginPercent / 100);
  const skeins = Math.ceil(withMargin / yardsPerSkein - 1e-9);
  return {
    yards: Math.round(withMargin),
    meters: Math.round(withMargin * METERS_PER_YARD),
    skeins,
    spare_yards: Math.round(skeins * yardsPerSkein - yards),
  };
}
