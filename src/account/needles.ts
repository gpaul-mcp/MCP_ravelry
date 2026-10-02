import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';

import { RavelryApiError } from '../ravelry/client.ts';
import { nonEmpty, patternUrl } from '../tools/format.ts';
import type { UserContext } from './context.ts';

const json = <T extends Record<string, unknown>>(output: T) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(output) }],
  structuredContent: output,
});

const CM_PER_INCH = 2.54;

const needleSchema = z.object({
  mm: z.number().nullable(),
  type: z.string().nullable().describe('straight, circular, dpn, hook, interchangeable…'),
  length_cm: z.number().nullable(),
  description: z.string().nullable(),
  comment: z.string().nullable(),
});

export function registerNeedleTools(server: McpServer, user: UserContext): void {
  server.registerTool(
    'get_my_needles',
    {
      title: 'My needles and hooks',
      description:
        'The needles and hooks the signed-in user owns (from their Ravelry needle inventory), ' +
        'by size and type. With a pattern_id, checks which of the sizes the pattern calls for ' +
        'they already have, and whether they have circulars or DPNs for patterns worked in the ' +
        'round.',
      inputSchema: z.object({
        pattern_id: z.number().int().positive().optional(),
      }),
      outputSchema: z.object({
        needles: z.array(needleSchema),
        pattern: z
          .object({
            id: z.number(),
            name: z.string(),
            url: z.string(),
            in_the_round: z.boolean(),
            sizes: z.array(
              z.object({
                mm: z.number(),
                name: z.string(),
                tool: z.enum(['needle', 'hook']),
                owned: z.array(needleSchema),
                suitable: z.boolean().describe('Owned in a type that works for this pattern.'),
              }),
            ),
            missing: z.array(z.string()).describe('Sizes to buy or borrow.'),
          })
          .nullable(),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ pattern_id }, ctx) => {
      const signal = ctx.mcpReq.signal;
      const [records, patterns] = await Promise.all([
        user.ravelry.listNeedles(user.username, signal),
        pattern_id ? user.publicRavelry.getPatterns([pattern_id], signal) : Promise.resolve([]),
      ]);
      const needles = records
        .map(record => {
          const type = record.needle_type;
          const mm = Number(type?.metric_name);
          return {
            mm: Number.isFinite(mm) && mm > 0 ? mm : null,
            type: nonEmpty(type?.type_name ?? null),
            length_cm: type?.length ? Math.round(type.length * CM_PER_INCH) : null,
            description: nonEmpty(type?.description ?? null),
            comment: nonEmpty(record.comment ?? null),
          };
        })
        .sort((a, b) => (a.mm ?? 0) - (b.mm ?? 0));

      let pattern = null;
      if (pattern_id) {
        const [found] = patterns;
        if (!found) throw new RavelryApiError(`No pattern with id ${pattern_id}.`);
        const inTheRound = (found.pattern_attributes ?? []).some(
          a => a.permalink === 'in-the-round',
        );
        const crochet = (found.craft?.name ?? '').toLowerCase().includes('crochet');
        const sizes = (found.pattern_needle_sizes ?? []).map(size => {
          const tool: 'needle' | 'hook' = crochet ? 'hook' : 'needle';
          const owned = needles.filter(n => n.mm === size.metric);
          const fits = (n: (typeof needles)[number]) => {
            const type = (n.type ?? '').toLowerCase();
            if (tool === 'hook') return type.includes('hook') || type === '';
            if (type.includes('hook')) return false;
            return inTheRound ? !type.includes('straight') : true;
          };
          return { mm: size.metric, name: size.name, tool, owned, suitable: owned.some(fits) };
        });
        pattern = {
          id: found.id,
          name: found.name,
          url: patternUrl(found.permalink),
          in_the_round: inTheRound,
          sizes,
          missing: sizes.filter(s => !s.suitable).map(s => s.name),
        };
      }
      return json({ needles, pattern });
    },
  );
}
