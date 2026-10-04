# What the Ravelry MCP server can do

A knitting and crochet companion for AI assistants, with Ravelry as its backbone: 13 tools for everyone, 38 once you sign in with Ravelry, two interactive widgets, and 11 conversation starters. The assistant explains and advises; the tools fetch the real data and do every calculation, so stitch counts and yardages are exact.

To set up a Claude project dedicated to the hobby, see [Your knitting & crochet guide in Claude](claude-project.md).

## Two ways to connect

| Connector URL                                   | You get                                                                                                                                                                                |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `https://ravelry-mcp.gonz-paul.dev/mcp`         | Pattern and yarn search, substitutions, shops, calculators, reference. No account needed.                                                                                              |
| `https://ravelry-mcp.gonz-paul.dev/account/mcp` | All of the above, plus your own stash, queue, projects, favorites, library and needles, project tracking, planning, row counters and preferences. Sign in with Ravelry the first time. |

Changing anything on your Ravelry account needs a second permission, asked on the same consent page, and the assistant confirms each change with you first.

## Find patterns

| Ask                                                             | What happens                                                                                                                                                                                                     | Tool                                   |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| "A free cabled hat in DK, not too hard"                         | Search by keyword, category, yarn weight, yardage, difficulty, fit, techniques (top down, raglan, cables, Fair Isle, toe up, granny square… 229 in all), language, designer and price; shown as a photo carousel | `search_patterns`                      |
| "Tell me more about the second one"                             | Yarn, yardage in meters and yards, gauge, needles, sizes, techniques, US or UK crochet terms, and whether it is free, free online with a paid PDF, or paid                                                       | `get_pattern_details`                  |
| Send a photo: "I want to make this"                             | The assistant describes the construction and techniques, then searches                                                                                                                                           | starter _Find a pattern from a photo_  |
| "Find me patterns like what I love" / "I want to learn brioche" | Suggestions from your favorites and finished projects, or approachable patterns for a technique you haven't used, leaving out what you already have                                                              | `discover_patterns_for_me` (signed in) |

## Yarn

| Ask                                               | What happens                                                                                          | Tool                     |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------ |
| "Superwash merino DK, well rated"                 | Yarn search by name, weight, fiber and attributes (superwash, hand-dyed, self-striping…)              | `search_yarns`           |
| "What's this yarn made of, which needles?"        | Fiber content, meters and grams per skein, needles, hooks, gauge, care, origin                        | `get_yarn_details`       |
| "This pattern's yarn is discontinued, what else?" | The yarns other makers actually used for that pattern, most used first                                | `find_yarns_for_pattern` |
| Photo of a ball band or receipt                   | The yarn identified on Ravelry with a confidence level                                                | `match_yarns`            |
| "How many balls of Rios for this pattern?"        | Skeins to buy for the smallest and largest size, with a margin, in meters, yards and grams            | `yarn_needed`            |
| "I have 200 g of DK, how many meters is that?"    | Grams ↔ meters ↔ yards ↔ skeins, from the yarn's ball band or a typical ratio (marked as an estimate) | `convert_yarn_amount`    |

## Yarn shops

| Ask                          | What happens                                                                         | Tool              |
| ---------------------------- | ------------------------------------------------------------------------------------ | ----------------- |
| "Yarn shops near the Louvre" | Shops around a place or by name or city: address, distance, website, phone, map link | `find_yarn_shops` |

## Calculators and reference

The assistant uses these instead of doing knitting arithmetic in its head.

| Ask                                                                  | What happens                                                                                                                | Tool                 |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| "I get 24 sts per 10 cm, the pattern says 22"                        | Change needles or not, how big it comes out as written, the pattern's numbers recalculated and rounded to the stitch repeat | `adjust_for_gauge`   |
| "Increase 13 evenly across 97"                                       | The exact instruction, e.g. `[k8, M1] 6 times, [k7, M1] 7 times`; knitting or crochet, flat or round                        | `spread_evenly`      |
| "Check this round: (2 sc, inc) x 6 (24)"                             | Each step's stitches used and made; flags rows that don't add up and counts that differ from the pattern                    | `count_stitches`     |
| "What's a 4 mm in US?", "UK htr in US terms?", "What does ssk mean?" | Needle and hook sizes (metric, US, UK, Japanese), yarn weights across countries, US↔UK terms, abbreviations                 | `crafting_reference` |

## Your Ravelry (signed in)

| Ask                                                     | What happens                                                                                                       | Tool                                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| "What kind of maker am I?"                              | Crafts, what you make, weights, difficulty handled, estimated level, a short summary                               | `get_my_crafting_profile`                                                  |
| "Show my stash"                                         | Each yarn with weight, colorway, free length in meters and yards, grams; yarn recorded only in grams gets a length | `get_my_stash`                                                             |
| "My queue", "my projects", "my favorites", "my library" | The lists as on Ravelry                                                                                            | `get_my_queue`, `get_my_projects`, `get_my_favorites`, `search_my_library` |
| "Which needles do I need for this?"                     | Your needles and hooks; with a pattern, the sizes you're missing (circulars or DPNs for patterns in the round)     | `get_my_needles`                                                           |

## Projects and stash bookkeeping (signed in, asks before changing anything)

| Ask                                         | What happens                                                                                   | Tool                                      |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Receipt photo: "Add these to my stash"      | Matched yarns added, duplicates skipped                                                        | `add_to_my_stash`                         |
| "Queue this pattern with my teal Rios"      | Added to your queue                                                                            | `add_to_my_queue`                         |
| "Let's start the Antler Toque with my Rios" | Project created on Ravelry, yarn set aside, removed from the queue                             | `start_project`                           |
| "Row 42 of the sleeve, used one ball"       | A dated line in the project's log, progress and yarn used updated                              | `log_project_progress`                    |
| "Where was I?"                              | The project, its yarn and its log                                                              | `get_my_project`                          |
| "Finished!", "pause it", "I frogged it"     | Status changed; leftovers stay in the stash, empty yarn marked used up, frogged yarn goes back | `update_project_status`                   |
| "Fix the colorway", "I gave that yarn away" | Stash entry corrected; deletion only when you ask                                              | `update_stash_entry`, `remove_from_stash` |

## Planning (signed in)

| Ask                                    | What happens                                                                                                                            | Tool                         |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| "What can I make with my stash?"       | Patterns that use 40–100 % of the yarn you have, per weight, as a carousel                                                              | `find_patterns_for_my_stash` |
| "What can I start from my queue?"      | Your queue ranked by what your stash already covers                                                                                     | `pick_from_my_queue`         |
| "What do I need to buy for these two?" | What your stash covers (each meter counted once) and what's left to buy, in meters, yards and grams                                     | `plan_yarn_shopping`         |
| "Can I finish this by Christmas?"      | A date from your own pace (meters a day over your recent finished projects), and whether the deadline is comfortable, tight or unlikely | `estimate_finish_date`       |
| "Tidy up my queue"                     | Duplicates, patterns already made, entries waiting for years, how long the queue would take                                             | `review_my_queue`            |
| "Stash check-up"                       | How long your stash would last, yarn with no plans, oldest yarn, weights you buy but rarely use, leftovers                              | `audit_my_stash`             |

## Row counters (signed in)

| Ask                                             | What happens                                                                                        | Tool                                    |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------- |
| "Count rows for my sock, 8-row repeat, 60 rows" | The counter widget: big − / + buttons, target, position in the repeat, several counters per project | `get_row_counter`, `update_row_counter` |

A counter belongs to a Ravelry project or to any name ("Onigiri Pouch"). Taps are saved on the server, so the count is there in any later chat. "Save to Ravelry log" writes the position into the project.

## Preferences (signed in)

| Ask            | What happens                                                                               | Tool                 |
| -------------- | ------------------------------------------------------------------------------------------ | -------------------- |
| "I use meters" | Metric or imperial saved; the assistant answers in those units and the carousel shows them | `set_my_preferences` |

## Widgets

In apps that support [MCP Apps](https://modelcontextprotocol.io/extensions/apps) (Claude, ChatGPT…) two results are interactive; every other result is text.

- **Pattern carousel** (`search_patterns`, `discover_patterns_for_me`, `find_patterns_for_my_stash`): photo cards that open Ravelry when tapped, with difficulty, yarn weight, length, rating and price. Tap 👍 or 👎 on each; your picks reach the assistant as you go, and **Find more like my 👍** asks it to dig deeper. Each card has **Similar**, **Details** and **Queue**, and an m / yd switch sits at the top.
- **Row counter** (`get_row_counter`): − / + buttons that respond instantly and save in the background, keyboard support, target and repeat settings, add a counter, save to the Ravelry log.

When a widget is shown, the assistant is told not to repeat its content, so its reply stays short.

## Conversation starters

Available in apps that list MCP prompts (often in the "+" menu or as slash commands).

| Starter                            | Signed in only |
| ---------------------------------- | -------------- |
| Find a pattern                     |                |
| Substitute a yarn                  |                |
| What can I make with this yarn?    |                |
| Yarn shops near me                 |                |
| Read me this row                   |                |
| Chart ↔ written instructions       |                |
| Find a pattern from a photo        |                |
| Fix my knitting or crochet problem |                |
| What should I make next?           | yes            |
| Use up my stash                    | yes            |
| Add yarn to my stash from a photo  | yes            |

## What is stored

| Data                                        | Where                                           | Why                             |
| ------------------------------------------- | ----------------------------------------------- | ------------------------------- |
| Your Ravelry username and sign-in tokens    | This server's database, encrypted               | To keep your connection working |
| Row counters                                | Same database, encrypted, under a hashed owner  | So taps persist between chats   |
| Units preference                            | Same database, encrypted                        | So every chat uses your units   |
| Everything else (stash, projects, searches) | Read from Ravelry on each request, never stored |                                 |

Projects, progress logs and stash changes are written to your Ravelry account itself.

## Limits

- **Pattern instructions are not on Ravelry's website:** they are PDFs (bought or downloaded) or designers' pages. Attach the PDF or a photo of the page and the assistant works from it; it never makes up instructions.
- **No social features:** no forums, groups, friends, messages or other makers' comments.
- **Estimates are labelled:** grams ↔ length without a known yarn, finish dates and pace are estimates and say so.
- **Ravelry's own data:** a pattern without yardage or gauge on Ravelry can't be calculated without you giving the numbers.
