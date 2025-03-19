import Ravelry from '@/class/ravelry.class';
import { mcpServer } from '@/index';
import { z } from 'zod';

mcpServer.tool(
  'search-patterns',
  'Search patterns on Ravelry',
  {
    query: z.string().describe('Item to be search on ravelry'),
    page: z.number().int().positive().default(1).describe('Page number to retrieve'),
    craft: z.string().describe('Craft type to be searched (knitting, crochet)'),
    availability: z
      .string()
      .default('free')
      .describe('Price of the item can be either: free, ravelry, online'),
  },
  async ({ query, page, craft, availability }) => {
    const ravelryInstance = new Ravelry(
      process.env.AUTH_USER as string,
      process.env.AUTH_PASS as string,
    );

    try {
      const patterns = await ravelryInstance.searchPatterns(query, page, craft, availability);

      if (!patterns) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'No pattern found' }],
        };
      }

      const response = patterns.map(pattern => {
        return {
          free: pattern.free,
          id: pattern.id,
          name: pattern.name,
          permalink: pattern.permalink,
        };
      });

      return {
        content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'Failure while searching patterns' }],
      };
    }
  },
);
