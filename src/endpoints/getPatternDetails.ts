import Ravelry from '@/class/ravelry.class';
import { mcpServer } from '@/index';
import { z } from 'zod';

mcpServer.tool(
  'get-pattern-details',
  'Retrieve details of a pattern on Ravelry',
  {
    id: z.string().describe('Id of the pattern to be retrieved'),
  },
  async ({ id }) => {
    const ravelryInstance = new Ravelry(
      process.env.AUTH_USER as string,
      process.env.AUTH_PASS as string,
    );

    try {
      const patterns = await ravelryInstance.getPatternDetails(parseInt(id));

      if (!patterns) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'No pattern found' }],
        };
      }

      const response = {
        ...patterns,
        pattern_categories: '',
        pattern_attributes: '',
        pattern_author: '',
        photos: '',
        pattern_type: '',
        printings: '',
        packs: '',
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'Failure while fetching details for a patterns' }],
      };
    }
  },
);
