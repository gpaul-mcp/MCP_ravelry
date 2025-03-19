import Ravelry from '@/class/ravelry.class';
import { mcpServer } from '@/index';
import { number, z } from 'zod';

mcpServer.tool(
  'get-multiple-pattern-details',
  'Retrieve details for a list of patterns on Ravelry',
  {
    ids: z.array(number()).describe('Ids of the patterns to be retrieved'),
  },
  async ({ ids }) => {
    const ravelryInstance = new Ravelry(
      process.env.AUTH_USER as string,
      process.env.AUTH_PASS as string,
    );

    try {
      const patterns = await ravelryInstance.getMultiplePatternDetails(ids);

      if (!patterns) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'No pattern found' }],
        };
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(patterns, null, 2) }],
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'Failure while fetching details for a patterns' }],
      };
    }
  },
);
