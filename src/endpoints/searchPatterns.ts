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
    availability: z.string().default('free').describe('Price of the item free per default'),
  },
  async ({ query, page, craft, availability }) => {
    const ravelryInstance = new Ravelry(
      process.env.RAVELRY_USER as string,
      process.env.RAVELRY_PASSWORD as string,
    );

    try {
      const patterns = await ravelryInstance.searchPatterns(query, page, craft, availability);

      if (!patterns) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'Error while searching patterns' }],
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
