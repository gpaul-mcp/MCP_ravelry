import { McpServer } from '@modelcontextprotocol/server';

import type { UserContext } from './account/context.ts';
import { registerAccountInsights } from './account/insights.ts';
import { registerCounterTools } from './account/counters.ts';
import { registerAccountLists } from './account/lists.ts';
import { registerNeedleTools } from './account/needles.ts';
import { registerPlanningTools } from './account/planning.ts';
import { registerStyleTools } from './account/style.ts';
import { registerProjectTools } from './account/projects.ts';
import { registerAccountWrites } from './account/write.ts';
import {
  registerAccountPrompts,
  registerAccountWritePrompts,
  registerHelpPrompts,
  registerPrompts,
} from './prompts.ts';
import type { RavelryClient } from './ravelry/client.ts';
import { registerToolbox } from './toolbox/tools.ts';
import { registerFindYarnShops } from './tools/find-yarn-shops.ts';
import { registerFindYarnsForPattern } from './tools/find-yarns-for-pattern.ts';
import { registerGetPatternDetails } from './tools/get-pattern-details.ts';
import { registerMatchYarns } from './tools/match-yarns.ts';
import { registerSearchPatterns } from './tools/search-patterns.ts';
import { registerYarnTools } from './tools/yarns.ts';
import { registerView } from './view.ts';

export const SERVER_NAME = 'ravelry';
export const SERVER_VERSION = '2.5.0';

const INSTRUCTIONS = `Tools for knitters and crocheters, backed by Ravelry.
- Patterns: search_patterns (defaults to free patterns; pass availability "any" to include paid ones), then get_pattern_details with up to 20 ids for yarn, gauge, needles, sizes and notes. For "what can I make with this yarn", combine weight and yardage_max.
- Yarns: search_yarns, then get_yarn_details for fiber content, needles, gauge and care.
- Labels, receipts, invoices: read the yarn details from the image, then match_yarns to find the Ravelry yarn ids.
- Substitutions: find_yarns_for_pattern shows the yarns other people used for a pattern. Prefer yarns of the same weight and check the total yardage still fits.
- Shops: find_yarn_shops, using coordinates of the place the user names.
- Calculations: never do knitting arithmetic in your head. adjust_for_gauge (swatch vs pattern gauge, recalculated counts), spread_evenly ("increase 13 evenly across 97"), yarn_needed (skeins to buy), count_stitches (check written rows and stitch counts before explaining them).
- crafting_reference for needle/hook sizes, yarn weights across regions, US/UK terms and abbreviations. A pattern's terminology field says whether its crochet terms are US or UK.
Always give the user the Ravelry url of every pattern, yarn or shop you mention.`;

const ACCOUNT_INSTRUCTIONS = `
The user is signed in to Ravelry, so you can also read their own data:
- get_my_crafting_profile first when you need to know them (level, crafts, what they make, yarn they own). Its summary is worth remembering if they want you to.
- get_my_stash, get_my_queue, get_my_projects, get_my_favorites, search_my_library for the raw lists.
- find_patterns_for_my_stash to suggest patterns for yarn they own; pick_from_my_queue to see which queued patterns their stash already covers.
- add_to_my_stash (e.g. from a receipt photo: match_yarns first, show the user what will be added, then add) and add_to_my_queue. Only add what the user asked for.
- Projects keep the stash accurate: start_project sets stash yarn aside for a pattern; while the user works, log_project_progress records where they are ("row 42 of the sleeve") and how much yarn the project has used so far; update_project_status finishes (leftovers stay in the stash, empty yarn becomes used up), pauses or frogs (yarn goes back). get_my_project shows the log, so read it to know where the user left off. Fix or tidy the stash with update_stash_entry; delete with remove_from_stash only when explicitly asked.
- Planning: estimate_finish_date (their own pace, deadlines), plan_yarn_shopping (what to buy after the stash), review_my_queue and audit_my_stash (tidy-ups: suggest, never delete without asking), discover_patterns_for_me (new patterns from their taste, or to learn a skill), get_my_needles (what they own; with a pattern, what is missing).
- Row counters: get_row_counter shows a project's counters as a card the user taps while crafting; update_row_counter adds rows, sets targets ("48 rows") and pattern repeats. Counters are kept on this server; when the user stops, offer to log the position with log_project_progress.
- Confirm with the user before changing or deleting anything.
Suggest patterns at or slightly above their level, and avoid recommending what they already made.`;

/**
 * Builds a fresh server instance. Transports call this once per connection or
 * request. With a signed-in `user`, the personal tools are added.
 */
export function createServer(ravelry: RavelryClient, user?: UserContext): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, title: 'Ravelry', version: SERVER_VERSION },
    { instructions: user ? INSTRUCTIONS + ACCOUNT_INSTRUCTIONS : INSTRUCTIONS },
  );

  registerSearchPatterns(server, ravelry);
  registerGetPatternDetails(server, ravelry);
  registerYarnTools(server, ravelry);
  registerFindYarnsForPattern(server, ravelry);
  registerMatchYarns(server, ravelry);
  registerFindYarnShops(server, ravelry);
  registerToolbox(server, ravelry);
  registerPrompts(server);
  registerHelpPrompts(server);
  registerView(server);

  if (user) {
    registerAccountLists(server, user);
    registerAccountInsights(server, user);
    registerAccountWrites(server, user);
    registerProjectTools(server, user);
    registerPlanningTools(server, user);
    registerStyleTools(server, user);
    registerNeedleTools(server, user);
    registerCounterTools(server, user);
    registerAccountPrompts(server);
    registerAccountWritePrompts(server);
  }

  return server;
}
