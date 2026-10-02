import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';

import { RavelryApiError, type RavelryClient } from '../ravelry/client.ts';
import { weightPermalink } from '../ravelry/vocabulary.ts';
import { nonEmpty, patternUrl, yarnUrl } from '../tools/format.ts';
import {
  CalculationError,
  compareGauge,
  type Gauge,
  METERS_PER_YARD,
  per10cm,
  roundToRepeat,
  skeinsFor,
  spreadEvenly,
} from './math.ts';
import {
  ABBREVIATIONS,
  CROCHET_TERMS,
  JAPANESE_NEEDLE_SIZES,
  KNITTING_TERMS,
  UK_NEEDLE_SIZES,
  YARN_WEIGHT_INFO,
} from './reference-data.ts';
import { countRows } from './stitch-count.ts';

/** Pure calculations: no side effects, same answer every time. */
const calculation = {
  readOnlyHint: true,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const json = <T extends Record<string, unknown>>(output: T) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(output) }],
  structuredContent: output,
});

const gaugeInput = z.object({
  stitches: z.number().positive().describe('Stitches counted across the swatch width.'),
  rows: z.number().positive().optional().describe('Rows (or rounds) counted over the same length.'),
  over: z.number().positive().default(10).describe('Width counted over, e.g. 10 (cm) or 4 (in).'),
  unit: z.enum(['cm', 'in']).default('cm'),
});

const craftInput = z.enum(['knitting', 'crochet']).default('knitting');

export function registerToolbox(server: McpServer, ravelry: RavelryClient): void {
  registerAdjustForGauge(server, ravelry);
  registerSpreadEvenly(server);
  registerYarnNeeded(server, ravelry);
  registerCountStitches(server);
  registerCraftingReference(server, ravelry);
}

function registerAdjustForGauge(server: McpServer, ravelry: RavelryClient): void {
  server.registerTool(
    'adjust_for_gauge',
    {
      title: 'Adjust a pattern to my gauge',
      description:
        "Compares the user's swatch with a pattern's gauge: whether to change needles, how big " +
        'the piece comes out if they follow the pattern as written, and pattern numbers ' +
        '(cast-on, stitch counts, rows) recalculated for their gauge so the size stays right. ' +
        'Give the pattern gauge, or a pattern_id to read it from Ravelry.',
      inputSchema: z.object({
        pattern_id: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Reads the gauge from Ravelry.'),
        pattern_gauge: gaugeInput.optional().describe('The gauge printed in the pattern.'),
        my_gauge: gaugeInput.describe("The user's swatch, measured after blocking if possible."),
        counts: z
          .array(
            z.object({
              label: z.string().trim().max(80).describe('e.g. "cast on", "sleeve stitches".'),
              stitches: z.number().int().positive().optional(),
              rows: z.number().int().positive().optional(),
            }),
          )
          .max(20)
          .optional()
          .describe('Numbers from the pattern to recalculate for the user.'),
        stitch_multiple: z
          .object({ of: z.number().int().min(1), plus: z.number().int().min(0).default(0) })
          .optional()
          .describe('Stitch repeat, e.g. "multiple of 4 + 2", so new counts still fit it.'),
        measurements: z
          .array(
            z.object({
              label: z.string().trim().max(80).describe('e.g. "chest", "hat circumference".'),
              value: z.number().positive(),
              unit: z.enum(['cm', 'in']).default('cm'),
              direction: z.enum(['width', 'length']).default('width'),
            }),
          )
          .max(20)
          .optional()
          .describe('Finished measurements from the pattern, to see what the user would get.'),
      }),
      outputSchema: z.object({
        pattern: z
          .object({
            id: z.number(),
            name: z.string(),
            url: z.string(),
            gauge: z.string().nullable(),
          })
          .nullable(),
        pattern_per_10cm: z.object({ stitches: z.number(), rows: z.number().nullable() }),
        yours_per_10cm: z.object({ stitches: z.number(), rows: z.number().nullable() }),
        stitch_difference_percent: z.number(),
        row_difference_percent: z.number().nullable(),
        verdict: z.enum(['matches', 'looser', 'tighter']),
        as_written_scale: z
          .number()
          .describe('Width factor if the pattern is followed unchanged: 1.1 = 10% bigger.'),
        needle_advice: z.string(),
        measurements_as_written: z.array(
          z.object({ label: z.string(), pattern: z.number(), yours: z.number(), unit: z.string() }),
        ),
        adjusted_counts: z.array(
          z.object({
            label: z.string(),
            stitches: z.number().nullable(),
            adjusted_stitches: z.number().nullable(),
            rows: z.number().nullable(),
            adjusted_rows: z.number().nullable(),
          }),
        ),
        notes: z.array(z.string()),
      }),
      annotations: { ...calculation, openWorldHint: true },
    },
    async (input, ctx) => {
      let patternGauge: Gauge | undefined = input.pattern_gauge;
      let pattern: { id: number; name: string; url: string; gauge: string | null } | null = null;
      if (input.pattern_id) {
        const [found] = await ravelry.getPatterns([input.pattern_id], ctx.mcpReq.signal);
        if (!found) throw new RavelryApiError(`No pattern with id ${input.pattern_id}.`);
        pattern = {
          id: found.id,
          name: found.name,
          url: patternUrl(found.permalink),
          gauge: found.gauge_description ?? null,
        };
        // Ravelry stores stitches (and rows) per `gauge_divisor` inches.
        if (!patternGauge && found.gauge) {
          patternGauge = {
            stitches: found.gauge,
            rows: found.row_gauge ?? undefined,
            over: found.gauge_divisor === 0 ? 4 : (found.gauge_divisor ?? 4),
            unit: 'in',
          };
        }
      }
      if (!patternGauge) {
        throw new CalculationError(
          pattern
            ? `"${pattern.name}" has no gauge on Ravelry; ask the user for the pattern gauge.`
            : 'Give pattern_gauge or a pattern_id.',
        );
      }

      const comparison = compareGauge(patternGauge, input.my_gauge);
      const p = per10cm(patternGauge);
      const y = per10cm(input.my_gauge);
      const notes: string[] = [];
      if (
        comparison.row_difference_percent !== null &&
        Math.abs(comparison.row_difference_percent) > 3
      ) {
        notes.push(
          'Row gauge differs: where the pattern says "work until it measures…", follow the ' +
            'measurement; where it counts rows (raglans, yokes, short rows), use the adjusted rows.',
        );
      }
      if (input.counts?.some(c => c.rows) && (!p.rows || !y.rows)) {
        notes.push(
          'Rows were not adjusted: give the row gauge for both the pattern and the swatch.',
        );
      }

      return json({
        pattern,
        ...comparison,
        measurements_as_written: (input.measurements ?? []).map(m => {
          const scale =
            m.direction === 'length' && p.rows && y.rows
              ? p.rows / y.rows
              : p.stitches / y.stitches;
          return {
            label: m.label,
            pattern: m.value,
            yours: Math.round(m.value * scale * 10) / 10,
            unit: m.unit,
          };
        }),
        adjusted_counts: (input.counts ?? []).map(c => ({
          label: c.label,
          stitches: c.stitches ?? null,
          adjusted_stitches: c.stitches
            ? roundToRepeat(
                (c.stitches * y.stitches) / p.stitches,
                input.stitch_multiple?.of,
                input.stitch_multiple?.plus,
              )
            : null,
          rows: c.rows ?? null,
          adjusted_rows: c.rows && p.rows && y.rows ? Math.round((c.rows * y.rows) / p.rows) : null,
        })),
        notes,
      });
    },
  );
}

function registerSpreadEvenly(server: McpServer): void {
  server.registerTool(
    'spread_evenly',
    {
      title: 'Increase or decrease evenly',
      description:
        'Spaces increases or decreases evenly across a row or round, e.g. "increase 13 stitches ' +
        'evenly across 97": returns the exact written instruction. Knitting uses M1 / k2tog, ' +
        'crochet uses 2 sts in one / sc2tog.',
      inputSchema: z.object({
        stitches: z.number().int().min(1).max(5000).describe('Stitches on the needle now.'),
        change: z
          .number()
          .int()
          .refine(value => value !== 0, 'change cannot be 0')
          .describe('Stitches to add (positive) or remove (negative).'),
        worked: z.enum(['flat', 'round']).default('flat'),
        craft: craftInput,
        stitch: z
          .string()
          .trim()
          .max(10)
          .optional()
          .describe('Crochet stitch, e.g. "sc", "hdc", "dc" (default sc).'),
      }),
      outputSchema: z.object({
        instructions: z.string(),
        steps: z.array(
          z.object({
            repeat: z.number(),
            plain: z.number(),
            then: z.enum(['inc', 'dec']).nullable(),
          }),
        ),
        stitches_before: z.number(),
        stitches_after: z.number(),
      }),
      annotations: calculation,
    },
    input => json({ ...spreadEvenly(input) }),
  );
}

function registerYarnNeeded(server: McpServer, ravelry: RavelryClient): void {
  server.registerTool(
    'yarn_needed',
    {
      title: 'How much yarn to buy',
      description:
        'Works out how many skeins to buy for a pattern with a given yarn, with a safety margin. ' +
        'Reads the yardage from a Ravelry pattern (smallest and largest size) and the skein ' +
        'length from a Ravelry yarn, or takes the numbers directly. Can account for a gauge ' +
        'difference or a bigger size (scale).',
      inputSchema: z.object({
        pattern_id: z.number().int().positive().optional(),
        pattern_yards: z
          .number()
          .positive()
          .optional()
          .describe('Total the pattern needs for the chosen size (meters: multiply by 1.094).'),
        yarn_id: z.number().int().positive().optional().describe('The yarn the user will use.'),
        yards_per_skein: z.number().positive().optional(),
        meters_per_skein: z.number().positive().optional(),
        scale: z
          .number()
          .min(0.2)
          .max(5)
          .default(1)
          .describe('Multiply the yardage, e.g. 1.15 for a bigger size or a looser gauge.'),
        margin_percent: z.number().min(0).max(50).default(10).describe('Safety margin.'),
      }),
      outputSchema: z.object({
        pattern: z
          .object({
            id: z.number(),
            name: z.string(),
            url: z.string(),
            weight: z.string().nullable(),
            yardage: z.string().nullable(),
          })
          .nullable(),
        yarn: z
          .object({
            id: z.number(),
            name: z.string(),
            url: z.string(),
            weight: z.string().nullable(),
            yards_per_skein: z.number().nullable(),
            grams_per_skein: z.number().nullable(),
          })
          .nullable(),
        yards_per_skein: z.number(),
        options: z.array(
          z.object({
            size: z.string(),
            yards: z.number().describe('Yards to plan for, margin included.'),
            meters: z.number(),
            skeins: z.number(),
            spare_yards: z.number().describe('Expected leftover yards once the pattern is done.'),
            grams: z.number().nullable(),
          }),
        ),
        notes: z.array(z.string()),
      }),
      annotations: { ...calculation, openWorldHint: true },
    },
    async (input, ctx) => {
      const signal = ctx.mcpReq.signal;
      const [[pattern], [yarn]] = await Promise.all([
        input.pattern_id ? ravelry.getPatterns([input.pattern_id], signal) : Promise.resolve([]),
        input.yarn_id ? ravelry.getYarns([input.yarn_id], signal) : Promise.resolve([]),
      ]);
      if (input.pattern_id && !pattern)
        throw new RavelryApiError(`No pattern with id ${input.pattern_id}.`);
      if (input.yarn_id && !yarn) throw new RavelryApiError(`No yarn with id ${input.yarn_id}.`);

      const perSkein =
        input.yards_per_skein ??
        (input.meters_per_skein ? input.meters_per_skein / METERS_PER_YARD : undefined) ??
        yarn?.yardage ??
        undefined;
      if (!perSkein) {
        throw new CalculationError(
          'Give yards_per_skein, meters_per_skein or a yarn_id with a known skein length.',
        );
      }

      const sizes: { size: string; yards: number }[] = [];
      if (input.pattern_yards) sizes.push({ size: 'as given', yards: input.pattern_yards });
      else if (pattern?.yardage) {
        sizes.push({
          size: pattern.yardage_max ? 'smallest size' : 'pattern',
          yards: pattern.yardage,
        });
        if (pattern.yardage_max && pattern.yardage_max !== pattern.yardage) {
          sizes.push({ size: 'largest size', yards: pattern.yardage_max });
        }
      }
      if (sizes.length === 0) {
        throw new CalculationError(
          pattern
            ? `"${pattern.name}" has no yardage on Ravelry; ask the user for it.`
            : 'Give pattern_yards or a pattern_id.',
        );
      }

      const notes: string[] = ['Buy every skein from the same dye lot.'];
      const patternWeight = weightPermalink(pattern?.yarn_weight?.name);
      const yarnWeight = weightPermalink(yarn?.yarn_weight?.name);
      if (patternWeight && yarnWeight && patternWeight !== yarnWeight) {
        notes.push(
          `The pattern is written for ${patternWeight} but this yarn is ${yarnWeight}: swatch ` +
            'and use adjust_for_gauge, the yardage will change too.',
        );
      }
      const gramsPerYard = yarn?.grams && yarn.yardage ? yarn.grams / yarn.yardage : null;

      return json({
        pattern: pattern
          ? {
              id: pattern.id,
              name: pattern.name,
              url: patternUrl(pattern.permalink),
              weight: pattern.yarn_weight?.name ?? null,
              yardage: pattern.yardage_description ?? null,
            }
          : null,
        yarn: yarn
          ? {
              id: yarn.id,
              name: `${yarn.yarn_company?.name ?? yarn.yarn_company_name ?? ''} ${yarn.name}`.trim(),
              url: yarnUrl(yarn.permalink),
              weight: yarn.yarn_weight?.name ?? null,
              yards_per_skein: yarn.yardage ?? null,
              grams_per_skein: yarn.grams ?? null,
            }
          : null,
        yards_per_skein: Math.round(perSkein),
        options: sizes.map(({ size, yards }) => {
          const needed = skeinsFor(yards * input.scale, perSkein, input.margin_percent);
          return {
            size,
            ...needed,
            grams: gramsPerYard ? Math.round(needed.skeins * perSkein * gramsPerYard) : null,
          };
        }),
        notes,
      });
    },
  );
}

function registerCountStitches(server: McpServer): void {
  server.registerTool(
    'count_stitches',
    {
      title: 'Check stitch counts',
      description:
        'Reads written knitting or crochet instructions row by row ("*k2, p2; rep from * to last ' +
        '2 sts, k2", "(sc, inc) x 6 (18)") and counts the stitches each step uses and makes. ' +
        'Flags rows that do not use every stitch and counts that differ from the one printed in ' +
        'the pattern. Use it to walk someone through a row or to check a pattern for errors.',
      inputSchema: z.object({
        rows: z
          .array(z.string().trim().min(1).max(1000))
          .min(1)
          .max(40)
          .describe('Consecutive rows or rounds, one per item, as written in the pattern.'),
        stitches_before: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('Stitches on the needle before the first row (0 for a magic ring).'),
        craft: craftInput,
      }),
      outputSchema: z.object({
        rows: z.array(
          z.object({
            row: z.string(),
            stitches_before: z.number().nullable(),
            stitches_after: z.number().nullable(),
            stitches_used: z.number().nullable(),
            stated_count: z.number().nullable().describe('The count printed in the pattern.'),
            steps: z.array(
              z.object({
                text: z.string(),
                meaning: z.string(),
                times: z.number(),
                uses: z.number(),
                makes: z.number(),
              }),
            ),
            warnings: z.array(z.string()).describe('Something does not add up.'),
            notes: z.array(z.string()).describe('Worth knowing, not a problem.'),
          }),
        ),
        problems: z.number().describe('Rows with at least one warning.'),
      }),
      annotations: calculation,
    },
    ({ rows, stitches_before, craft }) => {
      const results = countRows(rows, stitches_before, craft);
      return json({ rows: results, problems: results.filter(r => r.warnings.length > 0).length });
    },
  );
}

const REFERENCE_TOPICS = [
  'needles_and_hooks',
  'yarn_weights',
  'crochet_terms',
  'knitting_terms',
  'abbreviations',
] as const;

function registerCraftingReference(server: McpServer, ravelry: RavelryClient): void {
  server.registerTool(
    'crafting_reference',
    {
      title: 'Knitting and crochet reference',
      description:
        'Reference tables: needle and hook sizes (metric, US, UK, Japanese), yarn weights ' +
        'across regions (US worsted = UK aran = AU 10 ply, with typical needles and gauge), ' +
        'US↔UK crochet and knitting terms (UK "dc" is US "sc"!), and standard abbreviations. ' +
        'Use `lookup` to find one entry, e.g. "4mm", "US 8", "H", "DK", "8 ply", "ssk", "htr".',
      inputSchema: z.object({
        topic: z.enum(REFERENCE_TOPICS),
        lookup: z
          .string()
          .trim()
          .max(50)
          .optional()
          .describe('Filter, e.g. "4.5", "ssk", "UK dc".'),
        craft: z.enum(['knitting', 'crochet']).optional().describe('For abbreviations.'),
      }),
      outputSchema: z.object({
        topic: z.string(),
        rows: z.array(z.record(z.string(), z.unknown())),
        notes: z.array(z.string()),
      }),
      annotations: { ...calculation, openWorldHint: true },
    },
    async ({ topic, lookup, craft }, ctx) => {
      const signal = ctx.mcpReq.signal;
      let rows: Record<string, unknown>[] = [];
      const notes: string[] = [];
      switch (topic) {
        case 'needles_and_hooks': {
          const sizes = await ravelry.getNeedleSizes(signal);
          const seen = new Set<number>();
          rows = sizes
            .toSorted((a, b) => a.metric - b.metric)
            .filter(size => {
              // Ravelry lists some metric sizes twice (with and without a US name).
              const keep = !seen.has(size.metric) || Boolean(size.us);
              seen.add(size.metric);
              return keep;
            })
            .map(size => ({
              mm: size.metric,
              us_needle: nonEmpty(size.us?.trim().replace(/\.0$/, '') ?? null),
              us_hook: size.hook ?? null,
              uk_needle: UK_NEEDLE_SIZES[size.metric] ?? null,
              japanese_needle:
                JAPANESE_NEEDLE_SIZES.find(jp => jp.mm === size.metric)?.number ?? null,
            }));
          notes.push(
            `Japanese needles follow their own steps: ${JAPANESE_NEEDLE_SIZES.map(jp => `JP ${jp.number} = ${jp.mm} mm`).join(', ')}.`,
          );
          break;
        }
        case 'yarn_weights': {
          const weights = await ravelry.getYarnWeights(signal);
          rows = weights
            .filter(weight => YARN_WEIGHT_INFO[weight.name])
            .map(weight => {
              const info = YARN_WEIGHT_INFO[weight.name];
              return {
                ravelry: weight.name,
                filter_value: weightPermalink(weight.name) ?? null,
                cyc: info?.cyc,
                uk: info?.uk,
                au_nz: info?.au_nz,
                also_called: info?.also,
                ply: weight.ply ?? null,
                wraps_per_inch: weight.wpi ?? null,
                knit_sts_per_4in: weight.knit_gauge ?? null,
                needles_mm: info?.needles_mm,
                hook_mm: info?.hook_mm,
              };
            });
          notes.push('Gauge and tools are typical ranges; the ball band and pattern win.');
          break;
        }
        case 'crochet_terms':
          rows = CROCHET_TERMS.map(entry => ({ ...entry }));
          notes.push(
            'UK patterns have no "single crochet": every UK stitch name is one step taller.',
          );
          break;
        case 'knitting_terms':
          rows = KNITTING_TERMS.map(entry => ({ ...entry }));
          break;
        case 'abbreviations':
          rows = ABBREVIATIONS.map(entry => ({ ...entry })).filter(
            entry => !craft || entry.craft === craft || entry.craft === 'both',
          );
          break;
      }

      if (lookup) {
        const filtered = rows.filter(row => matches(row, lookup));
        if (filtered.length === 0) notes.push(`Nothing matched "${lookup}"; showing everything.`);
        else rows = filtered;
      }
      return json({ topic, rows, notes });
    },
  );
}

/** Loose match: "4mm" ↔ 4, "US 8" ↔ us_needle 8, "uk dc" ↔ "double crochet (dc)". */
function matches(row: Record<string, unknown>, lookup: string): boolean {
  const wanted = lookup
    .toLowerCase()
    .replace(/\s*mm$/, '')
    .trim();
  const prefixed = /^(us|uk|jp|japanese)\s+(.+)$/.exec(wanted);
  const entries = Object.entries(row);
  if (prefixed) {
    const [, region = '', value = ''] = prefixed;
    const keys = entries.filter(([key]) =>
      key.startsWith(region === 'japanese' ? 'japanese' : region),
    );
    if (keys.length > 0) {
      // Needle sizes match exactly: "US 8" is not the "8/0" steel hook.
      if ('mm' in row) {
        return keys.some(([, v]) => typeof v === 'string' && v.toLowerCase() === value.trim());
      }
      return keys.some(([, v]) => containsToken(v, value));
    }
  }
  const number = Number(wanted);
  if (Number.isFinite(number) && 'mm' in row) return row.mm === number;
  return entries.some(([, value]) => containsToken(value, wanted));
}

function containsToken(value: unknown, wanted: string): boolean {
  if (value === null || value === undefined) return false;
  const text = (
    typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
      ? String(value)
      : Array.isArray(value)
        ? value.join(' ')
        : JSON.stringify(value)
  ).toLowerCase();
  if (text === wanted) return true;
  const escaped = wanted.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(text);
}
