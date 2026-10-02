import type { Client } from '@modelcontextprotocol/client';
import { afterEach, describe, expect, it } from 'vitest';

import { resolveAttribute } from '../src/ravelry/attributes.ts';
import type { ApiPattern, ApiYarn } from '../src/ravelry/types.ts';
import { compareGauge, skeinsFor, spreadEvenly } from '../src/toolbox/math.ts';
import { countRow, countRows } from '../src/toolbox/stitch-count.ts';
import { connect, requestedUrls, routeFetch } from './helpers.ts';

describe('spread_evenly math', () => {
  it('spreads increases around a round in at most two repeats', () => {
    const result = spreadEvenly({ stitches: 97, change: 13, worked: 'round', craft: 'knitting' });
    expect(result.instructions).toBe('Round: [k8, M1] 6 times, [k7, M1] 7 times. (97 → 110 sts)');
  });

  it('keeps half a gap at each edge when worked flat', () => {
    const { steps, stitches_after } = spreadEvenly({
      stitches: 100,
      change: -7,
      worked: 'flat',
      craft: 'knitting',
    });
    expect(stitches_after).toBe(93);
    const plain = steps.reduce((sum, step) => sum + step.plain * step.repeat, 0);
    const decreases = steps.reduce((sum, step) => sum + (step.then ? step.repeat : 0), 0);
    expect(decreases).toBe(7);
    expect(plain + decreases * 2).toBe(100);
    expect(steps[0]?.plain).toBe(steps.at(-1)?.plain);
  });

  it('uses crochet increases that work into a stitch', () => {
    expect(
      spreadEvenly({ stitches: 36, change: 6, worked: 'round', craft: 'crochet' }).instructions,
    ).toBe('Round: [sc in next 5 sts, 2 sc in next st] 6 times. (36 → 42 sts)');
  });

  it('refuses impossible decreases', () => {
    expect(() =>
      spreadEvenly({ stitches: 10, change: -6, worked: 'round', craft: 'knitting' }),
    ).toThrow(/Too many decreases/);
  });
});

describe('gauge and yarn math', () => {
  it('compares gauges given in different units', () => {
    const result = compareGauge(
      { stitches: 22, rows: 30, over: 10, unit: 'cm' },
      { stitches: 20, rows: 28, over: 4, unit: 'in' },
    );
    expect(result.verdict).toBe('looser');
    expect(result.yours_per_10cm.stitches).toBe(19.7);
    expect(result.as_written_scale).toBeCloseTo(1.118, 3);
  });

  it('rounds skeins up after the margin', () => {
    expect(skeinsFor(1200, 220, 10)).toEqual({
      yards: 1320,
      meters: 1207,
      skeins: 6,
      spare_yards: 120,
    });
  });
});

describe('count_stitches parsing', () => {
  it('counts a rib with a repeat to the last stitches', () => {
    const row = countRow('*k2, p2; rep from * to last 2 sts, k2.', 98, 'knitting');
    expect(row).toMatchObject({ stitches_used: 98, stitches_after: 98, warnings: [] });
  });

  it('checks shaping against the count printed in the pattern', () => {
    const row = countRow('k3, ssk, k to last 5 sts, k2tog, k3 (58 sts)', 60, 'knitting');
    expect(row).toMatchObject({ stitches_after: 58, stated_count: 58, warnings: [] });
  });

  it('flags a lace repeat that does not fit', () => {
    const row = countRow('Row 1 (RS): k1, *yo, k2tog; rep from * to last st, k1.', 21, 'knitting');
    expect(row.warnings.join(' ')).toMatch(/9 full repeats leave 1 over/);
  });

  it('chains rows and finds a wrong round in an amigurumi pattern', () => {
    const rows = countRows(
      [
        'Rnd 1: 6 sc in MR (6)',
        'Rnd 2: inc x 6 (12)',
        'Rnd 3: (sc, inc) x 6 (18)',
        'Rnd 4: (sc in next 3 sts, inc) x 6 (32)',
      ],
      0,
      'crochet',
    );
    expect(rows.map(r => r.stitches_after)).toEqual([6, 12, 18, 30]);
    expect(rows[3]?.warnings).toEqual([
      'This row needs 24 stitches but there are only 18.',
      'The pattern says 32 stitches, but the instructions give 30.',
    ]);
  });

  it('understands groups worked into one stitch and passed stitches', () => {
    const row = countRow('(k1, yo, k1) in next st, k5, sl1, k2tog, psso, k4', 13, 'knitting');
    expect(row).toMatchObject({ stitches_used: 13, stitches_after: 13 });
  });

  it('does not count a turning chain', () => {
    const row = countRow('ch 1, turn, sc in each st across', 20, 'crochet');
    expect(row.stitches_after).toBe(20);
  });

  it('counts shaping repeated to the end by its own ratio', () => {
    const rows = countRows(
      ['inc around (12)', '2 sc in each st around (24)', 'dec around (12)'],
      6,
      'crochet',
    );
    expect(rows.map(r => r.stitches_after)).toEqual([12, 24, 12]);
    expect(rows.flatMap(r => r.warnings)).toEqual([]);
    expect(countRow('k2tog to end', 9, 'knitting').warnings[0]).toMatch(/1 over/);
  });

  it('understands turning chains that count, short rows and "work in pattern"', () => {
    expect(
      countRow(
        'Ch 3 (counts as dc), dc in next st, *ch 1, sk 1, dc in next 2 sts; rep from * across, turn.',
        20,
        'crochet',
      ),
    ).toMatchObject({ stitches_used: 20, stitches_after: 20, warnings: [] });
    expect(countRow('k2, w&t, p2, w&t', 19, 'knitting')).toMatchObject({
      stitches_after: 19,
      warnings: [],
      notes: [expect.stringMatching(/15 stitches stay unworked/)],
    });
    expect(countRow('k1, work in patt to last st, k1', 19, 'knitting').stitches_after).toBe(19);
    expect(countRow('knit the knits and purl the purls', 19, 'knitting').warnings).toEqual([]);
  });

  it('asks for the stitch count when a repeat runs to the end', () => {
    const row = countRow('*k1, p1; rep from * to end', null, 'knitting');
    expect(row.stitches_after).toBeNull();
    expect(row.warnings[0]).toMatch(/give stitches_before/);
  });
});

describe('pattern attributes', () => {
  it('maps everyday words to Ravelry attributes', () => {
    expect(resolveAttribute('top down').permalink).toBe('top-down');
    expect(resolveAttribute('Fair Isle').permalink).toBe('fairisle');
    expect(resolveAttribute('in the round').permalink).toBe('in-the-round');
    expect(resolveAttribute('nupps').permalink).toBe('bobble-or-popcorn');
  });

  it('suggests close attributes for unknown words', () => {
    expect(() => resolveAttribute('edging')).toThrow(/lace edging/);
  });
});

const pattern: ApiPattern = {
  id: 5,
  name: 'Gauge Hat',
  permalink: 'gauge-hat',
  free: true,
  gauge: 20,
  row_gauge: 28,
  gauge_divisor: 4,
  gauge_description: '20 stitches and 28 rows = 4 inches',
  yardage: 180,
  yardage_max: 250,
  yarn_weight: { name: 'Worsted' },
  has_uk_terminology: false,
  has_us_terminology: true,
  pattern_attributes: [
    { id: 1, permalink: 'in-the-round' },
    { id: 2, permalink: 'cables' },
  ],
};

const yarn: ApiYarn = {
  id: 7,
  name: 'Rios',
  permalink: 'malabrigo-yarn-rios',
  yarn_company: { name: 'Malabrigo Yarn' },
  yarn_weight: { name: 'Worsted' },
  yardage: 210,
  grams: 100,
};

describe('toolbox tools', () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
  });

  async function client(routes: Record<string, unknown>): Promise<Client> {
    const fetchMock = routeFetch(routes);
    const connection = await connect(fetchMock);
    close = connection.close;
    fetched = () => requestedUrls(fetchMock);
    return connection.client;
  }
  let fetched: () => URL[] = () => [];

  it('filters searches by attributes, all of them by default', async () => {
    const tools = await client({
      '/patterns/search.json': {
        patterns: [],
        paginator: { page: 1, page_count: 1, page_size: 20, results: 0 },
      },
    });
    const result = await tools.callTool({
      name: 'search_patterns',
      arguments: { attributes: ['top down', 'raglan'] },
    });
    expect(result.structuredContent).toMatchObject({ attributes: ['top down', 'raglan'] });
    expect(fetched()[0]?.searchParams.get('pa')).toBe('top-down+raglan-sleeve');
  });

  it('adds gauge numbers, terminology and attributes to pattern details', async () => {
    const tools = await client({ '/patterns.json': { patterns: { '5': pattern } } });
    const result = await tools.callTool({ name: 'get_pattern_details', arguments: { ids: [5] } });
    expect((result.structuredContent as { patterns: unknown[] }).patterns[0]).toMatchObject({
      gauge_per_10cm: { stitches: 20, rows: 28 },
      terminology: 'US',
      attributes: ['worked in the round', 'cables'],
    });
  });

  it('adjusts pattern numbers to the user gauge, reading the pattern gauge from Ravelry', async () => {
    const tools = await client({ '/patterns.json': { patterns: { '5': pattern } } });
    const result = await tools.callTool({
      name: 'adjust_for_gauge',
      arguments: {
        pattern_id: 5,
        my_gauge: { stitches: 22, rows: 30, over: 4, unit: 'in' },
        counts: [{ label: 'cast on', stitches: 100 }],
        stitch_multiple: { of: 4 },
        measurements: [{ label: 'circumference', value: 50 }],
      },
    });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({
      verdict: 'tighter',
      adjusted_counts: [{ label: 'cast on', stitches: 100, adjusted_stitches: 112 }],
      measurements_as_written: [{ label: 'circumference', pattern: 50, yours: 45.5 }],
    });
  });

  it('works out skeins for the smallest and largest size', async () => {
    const tools = await client({
      '/patterns.json': { patterns: { '5': pattern } },
      '/yarns.json': { yarns: { '7': yarn } },
    });
    const result = await tools.callTool({
      name: 'yarn_needed',
      arguments: { pattern_id: 5, yarn_id: 7 },
    });
    expect(result.structuredContent).toMatchObject({
      yards_per_skein: 210,
      options: [
        { size: 'smallest size', skeins: 1, grams: 100 },
        { size: 'largest size', skeins: 2, grams: 200 },
      ],
    });
  });

  it('looks up needle sizes with UK and Japanese names', async () => {
    const tools = await client({
      '/needles/sizes.json': {
        needle_sizes: [
          { id: 6, metric: 4, us: '6.0', hook: 'G' },
          { id: 49, metric: 4.25, us: null, hook: 'G' },
          { id: 7, metric: 4.5, us: '7.0', hook: null },
        ],
      },
    });
    const result = await tools.callTool({
      name: 'crafting_reference',
      arguments: { topic: 'needles_and_hooks', lookup: '4.5mm' },
    });
    expect((result.structuredContent as { rows: unknown[] }).rows).toEqual([
      { mm: 4.5, us_needle: '7', us_hook: null, uk_needle: '7', japanese_needle: '8' },
    ]);
  });

  it('translates crochet terms', async () => {
    const tools = await client({});
    const result = await tools.callTool({
      name: 'crafting_reference',
      arguments: { topic: 'crochet_terms', lookup: 'sc' },
    });
    expect((result.structuredContent as { rows: unknown[] }).rows[0]).toMatchObject({
      us: 'single crochet (sc)',
      uk: 'double crochet (dc)',
    });
  });
});
