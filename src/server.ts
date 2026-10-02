import { McpServer } from '@modelcontextprotocol/server';

import { registerPrompts } from './prompts.ts';
import type { RavelryClient } from './ravelry/client.ts';
import { registerFindYarnShops } from './tools/find-yarn-shops.ts';
import { registerFindYarnsForPattern } from './tools/find-yarns-for-pattern.ts';
import { registerGetPatternDetails } from './tools/get-pattern-details.ts';
import { registerSearchPatterns } from './tools/search-patterns.ts';
import { registerYarnTools } from './tools/yarns.ts';

export const SERVER_NAME = 'ravelry';
export const SERVER_VERSION = '2.1.0';

const INSTRUCTIONS = `Tools for knitters and crocheters, backed by Ravelry.
- Patterns: search_patterns (defaults to free patterns; pass availability "any" to include paid ones), then get_pattern_details with up to 20 ids for yarn, gauge, needles, sizes and notes. For "what can I make with this yarn", combine weight and yardage_max.
- Yarns: search_yarns, then get_yarn_details for fiber content, needles, gauge and care.
- Substitutions: find_yarns_for_pattern shows the yarns other people used for a pattern. Prefer yarns of the same weight and check the total yardage still fits.
- Shops: find_yarn_shops, using coordinates of the place the user names.
Always give the user the Ravelry url of every pattern, yarn or shop you mention.`;

/** Builds a fresh server instance. Transports call this once per connection or request. */
export function createServer(ravelry: RavelryClient): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, title: 'Ravelry', version: SERVER_VERSION },
    { instructions: INSTRUCTIONS },
  );

  registerSearchPatterns(server, ravelry);
  registerGetPatternDetails(server, ravelry);
  registerYarnTools(server, ravelry);
  registerFindYarnsForPattern(server, ravelry);
  registerFindYarnShops(server, ravelry);
  registerPrompts(server);

  return server;
}
