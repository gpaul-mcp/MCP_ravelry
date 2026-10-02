import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';

// Conversation starters that clients surface to people (e.g. as slash commands
// or "+" menu entries). Each one turns into a user message the model answers
// with the tools.

const userMessage = (text: string) => ({
  messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }],
});

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'find_a_pattern',
    {
      title: 'Find a pattern',
      description: 'Describe what you want to make and get matching Ravelry patterns.',
      argsSchema: z.object({
        idea: z.string().describe('What you want to make, e.g. "a cosy cabled hat for my dad".'),
        yarn: z
          .string()
          .optional()
          .describe('Yarn you want to use, if any, e.g. "2 skeins of DK merino, 230 m each".'),
        level: z.string().optional().describe('Your experience, e.g. "beginner".'),
      }),
    },
    ({ idea, yarn, level }) =>
      userMessage(
        [
          `Help me find a Ravelry pattern for: ${idea}.`,
          yarn && `I want to use this yarn: ${yarn}. Make sure the yardage fits.`,
          level && `My level: ${level}.`,
          'Search with filters, then compare your best 3–5 picks (difficulty, yarn weight, ' +
            'yardage, price) and link each one.',
        ]
          .filter(Boolean)
          .join('\n'),
      ),
  );

  server.registerPrompt(
    'substitute_yarn',
    {
      title: 'Substitute a yarn',
      description: 'Find yarns that work for a pattern, based on what other makers used.',
      argsSchema: z.object({
        pattern: z.string().describe('Pattern name or Ravelry link.'),
        preferences: z
          .string()
          .optional()
          .describe('What matters to you, e.g. "machine washable, no wool, under 10€ a skein".'),
      }),
    },
    ({ pattern, preferences }) =>
      userMessage(
        [
          `I want to make "${pattern}" but need a different yarn.`,
          preferences && `My preferences: ${preferences}.`,
          'Find the pattern, look at the yarns other people used for it, and recommend a few ' +
            'that match its weight and gauge. Tell me how many skeins I would need of each.',
        ]
          .filter(Boolean)
          .join('\n'),
      ),
  );

  server.registerPrompt(
    'use_my_yarn',
    {
      title: 'What can I make with this yarn?',
      description: 'Get pattern ideas for yarn you already have.',
      argsSchema: z.object({
        yarn: z
          .string()
          .describe('The yarn and how much, e.g. "3 skeins of Malabrigo Rios, 210 yd each".'),
        craft: z.string().optional().describe('knitting or crochet'),
      }),
    },
    ({ yarn, craft }) =>
      userMessage(
        [
          `I have this yarn: ${yarn}.`,
          craft && `I ${craft === 'crochet' ? 'crochet' : 'knit'}.`,
          'Look the yarn up to get its weight and yardage, work out how many yards I have in ' +
            'total, then suggest a few varied patterns that fit within that amount.',
        ]
          .filter(Boolean)
          .join('\n'),
      ),
  );

  server.registerPrompt(
    'find_yarn_shops',
    {
      title: 'Yarn shops near me',
      description: 'Find local yarn shops around a place.',
      argsSchema: z.object({
        place: z.string().describe('City, neighbourhood or address.'),
      }),
    },
    ({ place }) =>
      userMessage(
        `Find yarn shops near ${place}. List the closest ones with their address, distance ` +
          'and website.',
      ),
  );
}

/** Pattern help: reading, translating and fixing, with the toolbox doing the counting. */
export function registerHelpPrompts(server: McpServer): void {
  server.registerPrompt(
    'read_me_this_row',
    {
      title: 'Read me this row',
      description: 'Paste a row or a few rows and get them explained step by step.',
      argsSchema: z.object({
        rows: z.string().describe('The rows as written in the pattern.'),
        stitches: z.string().optional().describe('Stitches on the needle before the first row.'),
        craft: z.string().optional().describe('knitting or crochet'),
      }),
    },
    ({ rows, stitches, craft }) =>
      userMessage(
        [
          `Walk me through these ${craft === 'crochet' ? 'crochet' : 'knitting'} instructions:`,
          rows,
          stitches && `I have ${stitches} stitches before I start.`,
          'Check the stitch counts with count_stitches first (one row per item), then explain ' +
            'each step in plain words, one line per step, with the running stitch count. Expand ' +
            'every abbreviation (crafting_reference) and point out anything that does not add up.',
        ]
          .filter(Boolean)
          .join('\n'),
      ),
  );

  server.registerPrompt(
    'chart_to_written',
    {
      title: 'Chart ↔ written instructions',
      description: 'Turn a chart (photo) into written rows, or written rows into a chart.',
      argsSchema: z.object({
        direction: z
          .string()
          .optional()
          .describe('"chart to written" (default) or "written to chart".'),
        details: z
          .string()
          .optional()
          .describe(
            'Stitch count, flat or in the round, and the chart key if it is not in the photo.',
          ),
      }),
    },
    ({ direction, details }) =>
      userMessage(
        [
          /written to chart/i.test(direction ?? '')
            ? 'Turn the written instructions I give you into a chart: a grid with one symbol per ' +
              'stitch (use the standard symbols and give a key), row numbers on the side where ' +
              'the row starts.'
            : 'Turn the chart I attach into written instructions, one line per row, using ' +
              'standard abbreviations. Read right-side rows right to left and wrong-side rows left ' +
              'to right (in the round, every round right to left), and swap knit/purl symbols on ' +
              'wrong-side rows.',
          details && `Details: ${details}.`,
          'Then check every row with count_stitches and fix anything that does not add up before ' +
            'showing me the result. Tell me if part of the chart is hard to read.',
        ]
          .filter(Boolean)
          .join('\n'),
      ),
  );

  server.registerPrompt(
    'pattern_from_photo',
    {
      title: 'Find a pattern from a photo',
      description: 'Attach a photo of something you saw and find patterns like it.',
      argsSchema: z.object({
        notes: z
          .string()
          .optional()
          .describe('Anything to add, e.g. "for a child", "free only", "I crochet".'),
      }),
    },
    ({ notes }) =>
      userMessage(
        [
          'Look at the photo I attach and find Ravelry patterns like it.',
          notes && `Notes: ${notes}.`,
          'First describe what you see: knit or crochet, what it is, construction (top down, ' +
            'raglan, yoke, seamless...), stitch patterns (cables, lace, colorwork...), and the ' +
            'likely yarn weight. Then search_patterns with category, attributes and weight, try ' +
            'a second search if the first is thin, and show the closest 3–5 with what matches ' +
            'and what differs.',
        ]
          .filter(Boolean)
          .join('\n'),
      ),
  );

  server.registerPrompt(
    'fix_my_problem',
    {
      title: 'Fix my knitting or crochet problem',
      description: 'Describe what went wrong (or attach a photo) and get help fixing it.',
      argsSchema: z.object({
        problem: z
          .string()
          .describe(
            'e.g. "my scarf curls", "my gauge is off", "a hole appeared", "edges are wavy".',
          ),
      }),
    },
    ({ problem }) =>
      userMessage(
        [
          `I have a problem with my project: ${problem}.`,
          'Ask me the one or two questions you need first (craft, yarn, stitch pattern, ' +
            'a photo if it helps) unless the answer is obvious. Then explain the likely cause, ' +
            'how to fix it now (with and without ripping back), and how to avoid it next time. ' +
            'Use the calculators when numbers are involved (adjust_for_gauge for gauge, ' +
            'count_stitches for counts).',
        ].join('\n'),
      ),
  );
}

/** Starters that only make sense when the user is signed in to Ravelry. */
export function registerAccountPrompts(server: McpServer): void {
  server.registerPrompt(
    'what_next',
    {
      title: 'What should I make next?',
      description: 'Get a suggestion based on your queue, your stash and what you have made.',
      argsSchema: z.object({
        mood: z
          .string()
          .optional()
          .describe('Anything specific, e.g. "something quick", "a gift", "a challenge".'),
      }),
    },
    ({ mood }) =>
      userMessage(
        [
          'Help me decide what to make next.',
          mood && `I'm in the mood for: ${mood}.`,
          'Look at my crafting profile, check which queued patterns my stash already covers, ' +
            'and suggest 2–3 options with why each one fits me. Prefer yarn I already own.',
        ]
          .filter(Boolean)
          .join('\n'),
      ),
  );

  server.registerPrompt(
    'use_my_stash',
    {
      title: 'Use up my stash',
      description: 'Find patterns for yarn you already own.',
      argsSchema: z.object({
        what: z.string().optional().describe('What you would like to make, e.g. "a hat".'),
      }),
    },
    ({ what }) =>
      userMessage(
        [
          'Find patterns I can make with yarn I already have in my stash.',
          what && `Ideally: ${what}.`,
          'Group the ideas by which yarn they would use, and say how much of it each one uses.',
        ]
          .filter(Boolean)
          .join('\n'),
      ),
  );
}

/** Starters that write to the user's Ravelry (only offered when signed in). */
export function registerAccountWritePrompts(server: McpServer): void {
  server.registerPrompt(
    'add_yarn_from_photo',
    {
      title: 'Add yarn to my stash from a photo',
      description:
        'Attach a photo of a receipt, invoice or ball band, and add the yarn to your stash.',
      argsSchema: z.object({
        details: z
          .string()
          .optional()
          .describe(
            'Anything not on the photo, e.g. "bought at Lil Weasel", "stored in the blue box".',
          ),
      }),
    },
    ({ details }) =>
      userMessage(
        [
          'Add the yarn in the attached photo (receipt, invoice or ball band) to my Ravelry stash.',
          details && `Extra details: ${details}.`,
          'Read every yarn line (brand, name, colorway, dye lot, quantity, length, weight, price), ' +
            'match them with match_yarns, show me a short table of what you will add and ask me to ' +
            'confirm anything uncertain before adding.',
        ]
          .filter(Boolean)
          .join('\n'),
      ),
  );
}
