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
