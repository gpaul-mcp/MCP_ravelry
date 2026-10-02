// Reads a written knitting or crochet row ("*k2, p2; rep from * to last 2 sts,
// k2") and counts the stitches it uses and makes, step by step. Language
// models are unreliable at this bookkeeping; the model explains, this counts.

import type { Craft } from './math.ts';

export interface Step {
  text: string;
  meaning: string;
  times: number;
  uses: number;
  makes: number;
}

export interface RowCount {
  row: string;
  stitches_before: number | null;
  stitches_after: number | null;
  stitches_used: number | null;
  stated_count: number | null;
  steps: Step[];
  warnings: string[];
}

interface Op {
  kind: 'op';
  text: string;
  meaning: string;
  uses: number;
  makes: number;
  /** Uses every remaining stitch except `rest`. */
  toEnd?: { last: number };
  times: number;
}

interface Group {
  kind: 'group';
  text: string;
  items: Item[];
  times: number;
  toEnd?: { last: number };
  /** Worked into a single stitch, e.g. "(k1, yo, k1) in next st". */
  intoOne?: boolean;
  /** Worked into the ring or chain space, using no stitches. */
  intoNothing?: boolean;
}

type Item = Op | Group;

const TO_END =
  /\b(?:to end|across|around|to the end(?: of (?:row|rnd|round))?|to end of (?:row|rnd|round)|to marker|to m)\b/;
// "to last 3 sts", "to last st" (stitch words may already be stripped).
const TO_LAST = /\bto (?:the )?last(?: (\d+))?(?: (?:sts?|stitches))?(?=$|[\s,;.)\]])/;
const lastCount = (match: RegExpExecArray) => Number(match[1] ?? 1);

/** Standard knitting abbreviations: stitches used from the left needle and made on the right. */
const KNIT_OPS: { pattern: RegExp; uses: number; makes: number; meaning: string }[] = [
  {
    pattern: /^(?:k|p)(\d+)tog(?: ?tbl)?$/,
    uses: -1,
    makes: 1,
    meaning: 'stitches worked together',
  },
  {
    pattern: /^(?:ssk|ssp|skp|skpo|sl1,? ?k1,? ?psso|k2tog ?tbl|p2tog ?tbl|ssk ?tbl|dec)$/,
    uses: 2,
    makes: 1,
    meaning: 'single decrease',
  },
  {
    pattern:
      /^(?:sssk|sssp|sk2p|sk2po|s2kp|s2kpo|s2kp2|cdd|sl1,? ?k2tog,? ?psso|sl2,? ?k1,? ?p2sso|k3tog ?tbl|p3tog ?tbl)$/,
    uses: 3,
    makes: 1,
    meaning: 'double decrease',
  },
  {
    pattern: /^(?:yo2|double yo|yo twice)$/,
    uses: 0,
    makes: 2,
    meaning: 'double yarn over (2 new sts)',
  },
  {
    pattern:
      /^(?:yo|yfwd|yfrn|yrn|yon|yf|m1|m1l|m1r|m1p|m1lp|m1rp|m1pl|m1pr|lli|rli|lri|make ?1|make one|m1 ?(?:left|right))$/,
    uses: 0,
    makes: 1,
    meaning: 'increase (new stitch)',
  },
  {
    pattern: /^(?:kfb|pfb|k1fb|kf&b|kf ?& ?b|inc|inc ?1|k1f&b|kbf)$/,
    uses: 1,
    makes: 2,
    meaning: 'increase into one stitch',
  },
  {
    pattern: /^(?:kfbf|k1,? ?yo,? ?k1 in next st)$/,
    uses: 1,
    makes: 3,
    meaning: 'double increase into one stitch',
  },
  { pattern: /^psso$/, uses: 0, makes: -1, meaning: 'pass slipped stitch over' },
  { pattern: /^p2sso$/, uses: 0, makes: -2, meaning: 'pass 2 slipped stitches over' },
  {
    pattern:
      /^(?:pm|sm|slm|rm|place marker|slip marker|remove marker|turn|w&t|w ?\+ ?t|wrap and turn|wrp-t|mds|join|pu|pick up)$/,
    uses: 0,
    makes: 0,
    meaning: 'no stitches',
  },
  {
    pattern: /^(?:mb|make bobble|nupp|bobble)$/,
    uses: 1,
    makes: 1,
    meaning: 'bobble in one stitch',
  },
  {
    pattern: /^(?:c|t|cr|lc|rc|lt|rt|lpc|rpc)(\d+)(?:f|b|l|r|lc|rc|lpc|rpc)?$/,
    uses: -2,
    makes: -2,
    meaning: 'cable cross',
  },
  {
    pattern: /^(\d+)\/(\d+) ?(?:lc|rc|lpc|rpc|lt|rt|lsc|rsc|c|pc)$/,
    uses: -3,
    makes: -3,
    meaning: 'cable cross',
  },
];

const CROCHET_STITCHES =
  /^(?:(\d+) ?)?(sc|hdc|dc|tr|dtr|trtr|sl ?st|slst|ss|esc|fpsc|bpsc|fphdc|bphdc|fpdc|bpdc|fptr|bptr|x|puff|bobble|pc|popcorn|cl|cluster)(?: ?(?:blo|flo|tbl))?(?: ?(\d+))?$/;

const MEANINGS: Record<string, string> = {
  k: 'knit',
  p: 'purl',
  sl: 'slip',
  bo: 'bind off',
  co: 'cast on',
  ch: 'chain',
  sk: 'skip',
  sc: 'single crochet',
  hdc: 'half double crochet',
  dc: 'double crochet',
  tr: 'treble crochet',
  dtr: 'double treble crochet',
  'sl st': 'slip stitch',
  slst: 'slip stitch',
  ss: 'slip stitch',
};

/** Counts one or more consecutive rows; each row starts with the previous row's count. */
export function countRows(
  rows: readonly string[],
  stitchesBefore: number | undefined,
  craft: Craft,
): RowCount[] {
  const results: RowCount[] = [];
  let before: number | null = stitchesBefore ?? null;
  for (const row of rows) {
    const result = countRow(row, before, craft);
    results.push(result);
    before = result.stitches_after ?? result.stated_count;
  }
  return results;
}

export function countRow(rawRow: string, before: number | null, craft: Craft): RowCount {
  const warnings: string[] = [];
  let text = rawRow.replace(/[–—]/g, '-').replace(/×/g, 'x').trim();
  // "Row 5 (RS):", "Rnd 3:", "R12:" labels.
  text = text.replace(
    /^(?:row|rnd|round|r)\s*\d+(?:\s*[-&,]\s*\d+)?\s*(?:\((?:rs|ws)\))?\s*[:.-]\s*/i,
    '',
  );
  text = text.replace(/^\((?:rs|ws)\)\s*:?\s*/i, '');

  // Stated count at the end: "(18)", "[18 sts]", "- 18 sts", ": 18 sts".
  let stated: number | null = null;
  const statedMatch =
    /[([]\s*(\d+)\s*(?:sts?|stitches)?\s*[)\]]\s*\.?\s*$/i.exec(text) ??
    /(?:-|:|—|=)\s*(\d+)\s*(?:sts?|stitches)\s*(?:rem(?:ain)?(?:ing)?)?\.?\s*$/i.exec(text);
  if (statedMatch) {
    stated = Number(statedMatch[1]);
    text = text.slice(0, statedMatch.index).trim();
  }

  let lower = text.toLowerCase().replace(/\.\s*$/, '');
  // "Purl." or "knit all sts" as the whole row.
  if (/^(?:k|p|knit|purl)(?: all(?: sts| stitches)?)?$/.test(lower)) lower += ' to end';
  const items = parseSequence(starRepeats(lower), craft, warnings);
  const steps: Step[] = [];
  const outcome = evaluate(items, before, steps, warnings);

  const used = outcome ? outcome.used : null;
  const after = outcome ? outcome.made : null;
  if (
    before !== null &&
    used !== null &&
    used !== before &&
    !/w&t|wrap and turn|turn\b/.test(lower)
  ) {
    warnings.push(
      used < before
        ? `This row only works ${used} of the ${before} stitches (${before - used} left over).`
        : `This row needs ${used} stitches but there are only ${before}.`,
    );
  }
  if (stated !== null && after !== null && stated !== after) {
    warnings.push(`The pattern says ${stated} stitches, but the instructions give ${after}.`);
  }
  if (/(?:^|[\s,])ch\s*\d*,?\s*turn\b/.test(lower)) {
    warnings.push(
      'The turning chain is not counted; if the pattern says it counts as a stitch, add it.',
    );
  }

  return {
    row: rawRow.trim(),
    stitches_before: before,
    stitches_after: after,
    stitches_used: used,
    stated_count: stated,
    steps,
    warnings,
  };
}

/** Rewrites "*k2, p2; rep from * to end" style repeats into bracket groups. */
function starRepeats(text: string): string {
  // "*k2, p2*, rep from *" closes the repeat with a second asterisk.
  let out = text.replace(/\*([^*]+?)\*\s*[,;.]?\s*(?=rep)/g, '*$1; ');
  const star =
    /\*+([^*]+?)[;,.]?\s*rep(?:eat)?(?:\s+from)?\s+\*+\s*(?:(\d+)\s+more\s+times?|(\d+)\s+times?|(twice)|(?:once\s+more)|(to (?:the )?last(?: \d+)? (?:sts?|stitches))|(to end(?: of (?:row|rnd|round))?|across|around|to marker|to m))?/;
  for (let guard = 0; guard < 10; guard++) {
    const match = star.exec(out);
    if (!match) break;
    const [whole, body, more, total, twice, toLast, toEnd] = match;
    const clause = more
      ? `${Number(more) + 1} times`
      : total
        ? `${total} times`
        : twice
          ? '2 times'
          : /once\s+more/.test(whole)
            ? '2 times'
            : (toLast ?? toEnd ?? 'to end');
    out = out.replace(whole, `[${body}] ${clause}`);
  }
  return out;
}

/** Splits at top-level commas and semicolons, keeping bracket groups together. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of text) {
    if (char === '[' || char === '(') depth++;
    if (char === ']' || char === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && (char === ',' || char === ';')) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts.map(part => part.trim()).filter(Boolean);
}

function parseSequence(text: string, craft: Craft, warnings: string[]): Item[] {
  const items: Item[] = [];
  const parts = splitTopLevel(text);
  for (const [index, part] of parts.entries()) {
    // A chain right before "turn" is a turning chain.
    if (/^(?:ch|chain)\s*\d*$/.test(part) && /^turn\b/.test(parts[index + 1] ?? '')) {
      items.push({
        kind: 'op',
        text: part,
        meaning: 'turning chain (not counted)',
        uses: 0,
        makes: 0,
        times: 1,
      });
      continue;
    }
    const groupMatch = /^(.*?)([[(])(.*)([\])])(.*)$/.exec(part);
    if (groupMatch && /^\s*$/.test(groupMatch[1] ?? '')) {
      const [, , , inside = '', , after = ''] = groupMatch;
      const suffix = after.trim();
      // A parenthesised note such as "(RS)" or "(does not count as a st)".
      if (/^(?:rs|ws|does not count.*|counts as.*|see .*)$/.test(inside.trim())) {
        if (suffix) items.push(...parseSequence(suffix, craft, warnings));
        continue;
      }
      const group: Group = {
        kind: 'group',
        text: part,
        items: parseSequence(inside, craft, warnings),
        times: 1,
      };
      applySuffix(group, suffix, warnings);
      items.push(group);
      continue;
    }
    const op = parseOp(part, craft, warnings);
    if (op) items.push(op);
  }
  return items;
}

/** Repeat counts and "in next st" after a bracket group. */
function applySuffix(group: Group, suffix: string, warnings: string[]): void {
  if (!suffix) return;
  const times = /^(?:x\s*(\d+)|(\d+)\s*(?:x|times?)|\*\s*(\d+)|(twice)|(three times))/.exec(suffix);
  if (times) {
    group.times = times[4] ? 2 : times[5] ? 3 : Number(times[1] ?? times[2] ?? times[3]);
    return;
  }
  const last = TO_LAST.exec(suffix);
  if (last) {
    group.toEnd = { last: lastCount(last) };
    return;
  }
  if (TO_END.test(suffix)) {
    group.toEnd = { last: 0 };
    return;
  }
  if (/\b(?:in|into)\s+(?:the\s+)?(?:next|same)\s+st(?:itch)?\b/.test(suffix)) {
    group.intoOne = true;
    return;
  }
  if (/\b(?:in|into)\s+(?:the\s+)?(?:ring|mr|magic ring|ch-?sp|space|sp)\b/.test(suffix)) {
    group.intoNothing = true;
    return;
  }
  warnings.push(`Did not understand "${suffix}" after "${group.text}".`);
}

function parseOp(raw: string, craft: Craft, warnings: string[]): Op | null {
  let text = raw
    .replace(/\s+/g, ' ')
    .replace(/\bsts?\b|\bstitches\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  let times = 1;
  const repeat = /\s+(?:(\d+)\s*times?|x\s*(\d+)|(twice))$/.exec(text);
  if (repeat) {
    times = repeat[3] ? 2 : Number(repeat[1] ?? repeat[2]);
    text = text.slice(0, repeat.index).trim();
  }
  const op = (uses: number, makes: number, meaning: string, extra?: Partial<Op>): Op => ({
    kind: 'op',
    text: raw.trim(),
    meaning,
    uses,
    makes,
    times,
    ...extra,
  });

  // "k to end", "p to last 3 sts", "sc across", "dc in each st to end".
  const last = TO_LAST.exec(text);
  const toEnd = last ? { last: lastCount(last) } : TO_END.test(text) ? { last: 0 } : undefined;
  if (toEnd) {
    const base = text
      .replace(TO_LAST, '')
      .replace(TO_END, '')
      .replace(/\bin each\b/, '')
      .trim();
    if (/^(?:bo|bind off|cast off)\b/.test(base)) return op(0, 0, 'bind off', { toEnd });
    const factor = /^(\d+)\s/.exec(base);
    const name = base.replace(/^(\d+)\s/, '').trim();
    return op(0, 0, `${meaningOf(name)} every stitch`, {
      toEnd,
      ...(factor ? { makes: Number(factor[1]) } : {}),
    });
  }

  // Bind off / cast on.
  const bindOff = /^(?:bo|bind off|cast off)\s*(\d+|all)?/.exec(text);
  if (bindOff) {
    if (bindOff[1] === 'all' || !bindOff[1]) return op(0, 0, 'bind off', { toEnd: { last: 0 } });
    return op(Number(bindOff[1]), 0, 'bind off');
  }
  const castOn = /^(?:co|cast on)\s*(\d+)/.exec(text);
  if (castOn) return op(0, Number(castOn[1]), 'cast on');

  if (craft === 'crochet') {
    const crochet = parseCrochet(text, op);
    if (crochet) return crochet;
  }

  // Plain knit/purl/slip with a count: "k2", "p 3", "knit 5", "k1tbl", "sl1 wyif".
  const plain =
    /^(k|p|knit|purl|sl|slip)\s*(\d*)\s*(?:tbl|b|below|wyif|wyib|kwise|pwise|k-?wise|p-?wise|purlwise|knitwise|\s)*$/.exec(
      text,
    );
  if (plain) {
    const n = plain[2] ? Number(plain[2]) : 1;
    return op(n, n, meaningOf(plain[1] ?? ''));
  }

  for (const rule of KNIT_OPS) {
    const match = rule.pattern.exec(text);
    if (!match) continue;
    if (rule.uses === -1) {
      const n = Number(match[1]);
      return op(n, 1, `${n} ${rule.meaning} (decrease)`);
    }
    if (rule.uses === -2) {
      const n = Number(match[1]);
      return op(n, n, `${rule.meaning} over ${n} sts`);
    }
    if (rule.uses === -3) {
      const n = Number(match[1]) + Number(match[2]);
      return op(n, n, `${rule.meaning} over ${n} sts`);
    }
    return op(rule.uses, rule.makes, rule.meaning);
  }

  if (craft === 'knitting') {
    const crochet = parseCrochet(text, op);
    if (crochet) return crochet;
  }

  warnings.push(`Unknown step "${raw.trim()}": not counted.`);
  return op(0, 0, 'unknown, not counted');
}

function parseCrochet(text: string, op: (u: number, m: number, meaning: string) => Op): Op | null {
  // Chains, skips.
  const chain = /^ch\s*(\d*)$|^chain\s*(\d*)$|^(\d+)\s*ch$/.exec(text);
  if (chain) {
    const n = firstNumber(chain[1], chain[2], chain[3]) ?? 1;
    return op(0, n, `chain ${n}`);
  }
  const skip = /^(?:sk|skip|miss)\s*(\d*)(?:\s*(?:next|ch|ch-sp))?\s*(\d*)$/.exec(text);
  if (skip) {
    const n = firstNumber(skip[1], skip[2]) ?? 1;
    return op(n, 0, `skip ${n}`);
  }
  // Decreases: "sc2tog", "dc3tog", "invdec", "dec".
  const together = /^(sc|hdc|dc|tr)(\d)tog$/.exec(text);
  if (together)
    return op(
      Number(together[2]),
      1,
      `${meaningOf(together[1] ?? '')} ${together[2]} together (decrease)`,
    );
  if (/^(?:invdec|inv dec|dec|sc dec)$/.test(text)) return op(2, 1, 'decrease');
  if (/^(?:inc|sc inc|2 sc in next|2sc in next)$/.test(text))
    return op(1, 2, 'increase: 2 sts in one');

  // "3 dc in next st", "2 sc in same st", "6 sc in ring", "sc in next 5 sts".
  const into =
    /^(\d+)?\s*([a-z ]+?)\s+(?:in|into)\s+(?:the\s+)?(next|same|each of (?:the )?next|ring|mr|magic ring|ch-?sp|sp|space)\s*(\d*)\s*(?:st|ch|ch-?sp)?$/.exec(
      text,
    );
  if (into) {
    const per = firstNumber(into[1]) ?? 1;
    const name = (into[2] ?? '').trim();
    const where = into[3] ?? '';
    const n = firstNumber(into[4]) ?? 1;
    if (/ring|mr|sp|space/.test(where))
      return op(0, per, `${per} ${meaningOf(name)} into the ${where}`);
    if (where === 'same') return op(0, per, `${per} ${meaningOf(name)} in the same stitch`);
    return op(
      n,
      n * per,
      per > 1 ? `${per} ${meaningOf(name)} in each of ${n} st` : `${meaningOf(name)} in ${n} st`,
    );
  }

  const stitch = CROCHET_STITCHES.exec(text);
  if (stitch) {
    const n = firstNumber(stitch[1], stitch[3]) ?? 1;
    return op(n, n, meaningOf(stitch[2] ?? ''));
  }
  return null;
}

/** The first regex capture that holds a number (optional groups capture "" or nothing). */
function firstNumber(...captures: (string | undefined)[]): number | undefined {
  const found = captures.find(capture => capture !== undefined && capture !== '');
  return found === undefined ? undefined : Number(found);
}

function meaningOf(name: string): string {
  return MEANINGS[name.trim()] ?? name.trim();
}

interface Outcome {
  used: number;
  made: number;
}

function evaluate(
  items: readonly Item[],
  before: number | null,
  steps: Step[],
  warnings: string[],
): Outcome | null {
  let used = 0;
  let made = 0;
  for (const item of items) {
    const available = before === null ? null : before - used;
    if (item.kind === 'op') {
      let times = item.times;
      let uses = item.uses;
      let makes = item.makes;
      if (item.toEnd) {
        if (available === null) {
          warnings.push(`"${item.text}" depends on the stitch count: give stitches_before.`);
          return null;
        }
        const rest = Math.max(0, available - item.toEnd.last);
        times = 1;
        uses = rest;
        makes = item.meaning === 'bind off' ? 0 : rest * (item.makes || 1);
      }
      steps.push({
        text: item.text,
        meaning: item.meaning,
        times,
        uses: uses * times,
        makes: makes * times,
      });
      used += uses * times;
      made += makes * times;
      continue;
    }

    // Group: count one pass, then repeat.
    const inner: Step[] = [];
    const once = evaluate(item.items, null, inner, warnings);
    if (!once) return null;
    let times = item.times;
    if (item.toEnd) {
      if (available === null) {
        warnings.push(`"${item.text}" repeats to the end: give stitches_before to count it.`);
        return null;
      }
      const span = available - item.toEnd.last;
      if (once.used <= 0) {
        warnings.push(`Cannot repeat "${item.text}" to the end: it uses no stitches.`);
        return null;
      }
      times = Math.floor(span / once.used);
      if (span % once.used !== 0) {
        warnings.push(
          `The repeat "${item.text}" uses ${once.used} sts but ${span} are available: ` +
            `${times} full repeats leave ${span % once.used} over.`,
        );
      }
    }
    const uses = item.intoOne ? 1 : item.intoNothing ? 0 : once.used;
    steps.push({
      text: item.text,
      meaning: `${inner.map(step => step.meaning).join(', ')}${item.intoOne ? ', all in one stitch' : ''}`,
      times,
      uses: uses * times,
      makes: once.made * times,
    });
    used += uses * times;
    made += once.made * times;
  }
  return { used, made };
}
