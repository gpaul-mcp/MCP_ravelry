# Changelog

## 2.4.0

### Added

Personal planning from the signed-in user's own Ravelry data (nothing new is stored):

- `estimate_finish_date`: finish date from the user's pace (yards per day over recent finished projects), for a pattern or what is left of a project; deadline check.
- `plan_yarn_shopping`: what to buy for chosen patterns after the stash (each free yard used once), per pattern and per weight.
- `review_my_queue`: duplicates, patterns already made, long-waiting entries, time to finish the whole queue.
- `audit_my_stash`: how long the stash lasts, unplanned yarn, oldest yarn, weights bought but rarely used, leftovers, missing information.
- `discover_patterns_for_me`: patterns from the user's style profile, or to learn a new technique.
- `get_my_needles`: needle and hook inventory, checked against a pattern.
- Cards for all of them; stash entries now include the date they were added.

## 2.3.0

### Added

- Calculators: `adjust_for_gauge` (swatch vs pattern gauge, needle advice, size as written, recalculated counts rounded to the stitch repeat), `spread_evenly` (even increases/decreases, knitting or crochet, flat or round), `yarn_needed` (skeins to buy with a margin) and `count_stitches` (reads written rows and repeats, checks every stitch count).
- `crafting_reference`: needle and hook sizes (metric/US/UK/Japanese, from Ravelry), yarn weights across regions, US↔UK crochet and knitting terms, abbreviations.
- `search_patterns`: `attributes` filter for techniques and construction (229 Ravelry pattern attributes, each checked against the live API), all or any of them; `fit` gains petite, plus, tall, maternity, fitted, oversized, miniature and the three ease values.
- `get_pattern_details`: `gauge_per_10cm`, crochet `terminology` (US/UK) and `attributes`.
- Prompts: Read me this row, Chart ↔ written instructions, Find a pattern from a photo, Fix my knitting or crochet problem.

## 2.2.0

### Added

- **Sign in with Ravelry** at `/account/mcp`: an OAuth-protected MCP endpoint (MCP authorization spec) where users connect their own Ravelry account. Built on oidc-provider with dynamic client registration, mandatory PKCE, RFC 8707 resource-bound tokens, refresh tokens, and a consent page for every new client. Ravelry tokens stay on the server and are refreshed automatically.
- Personal tools: `get_my_crafting_profile`, `get_my_stash`, `get_my_queue`, `get_my_projects`, `get_my_favorites`, `search_my_library`, `find_patterns_for_my_stash`, `pick_from_my_queue`; prompts "What should I make next?" and "Use up my stash".
- Encrypted SQLite storage (hashed keys, AES-256-GCM records) in a `ravelry-data` Docker volume.
- `match_yarns`: matches yarn read from a ball band, receipt or invoice to Ravelry yarns, scored on name, weight, yardage, grams and fiber with a confidence level.
- `add_to_my_stash` and `add_to_my_queue` (new `ravelry:write` scope, additive only, duplicates skipped) and an "Add yarn to my stash from a photo" prompt.
- Project tracking that keeps the stash accurate, using Ravelry's own yarn bookkeeping (packs): `start_project`, `log_project_progress` (progress log in the project's private notes, yarn used so far), `update_project_status` (finish: leftovers kept, empty yarn marked used up; frog: yarn returned), `get_my_project`. Stash tools now report free yarn (total minus what projects use).
- `update_stash_entry` and `remove_from_stash`; the write permission now covers add, update and remove.
- `scripts/live-account-check.ts`: end-to-end check of the personal tools against a real account (creates and removes test data).
- Interactive cards (MCP Apps): pattern, yarn, stash, queue, receipt-match, shop and profile views rendered in the chat, built with Vite into a single HTML resource.
- New settings: `RAVELRY_OAUTH_CLIENT_ID`, `RAVELRY_OAUTH_CLIENT_SECRET`, `PUBLIC_URL`, `AUTH_SECRET`, `DATA_DIR`.

## 2.1.1

- README: the hosted instance at `https://ravelry-mcp.gonz-paul.dev/mcp` comes first, with setup for Claude, ChatGPT, Claude Code, VS Code and Cursor; local installation moves to "Run it yourself".
- Tool output: trims stray whitespace in shop details and rounds ratings/difficulty, found while testing the hosted instance.
- HTTP mode: `GET /` serves a landing page showing the connector URL (never the URL secret).

## 2.1.0

### Added

- `search_patterns` filters: `category` (plain words such as "hat", "toys" or "jumper" are mapped to Ravelry's category tree), yarn `weight`, `yardage_min`/`yardage_max`, `difficulty_max`, `fit`, `language` and `designer`.
- `search_yarns` and `get_yarn_details`: find yarns by weight, fiber and attributes; read fiber content, needles, hooks, gauge, care and origin.
- `find_yarns_for_pattern`: yarn substitution based on the yarns other Ravelry users actually used for a pattern.
- `find_yarn_shops`: local yarn shops around a location or by name or city.
- Self-hosting: Docker image, Compose file with an optional Cloudflare Tunnel, and [a guide](docs/self-hosting.md).
- HTTP mode: `MCP_ALLOWED_HOSTS` for public hostnames, `MCP_URL_SECRET` for an unlisted endpoint, per-client rate limiting (`RATE_LIMIT_PER_MINUTE`, `TRUST_PROXY`), and `GET /health`.
- MCP prompts: Find a pattern, Substitute a yarn, What can I make with this yarn?, Yarn shops near me.
- Every filter value offered was checked against the live API. Ravelry answers HTTP 500 to unknown values, so the tools validate them first and suggest close category matches.

## 2.0.0

Full modernization for the MCP TypeScript SDK v2 and the 2026-07-28 protocol revision.

### Breaking changes

- **Tools renamed and merged:**
  - `search-patterns` → `search_patterns`
  - `get-pattern-details` and `get-multiple-pattern-details` → `get_pattern_details`, which takes `ids` (1–20 numbers)
- **Credentials are no longer compiled into `dist/`.** The old `prebuild` step copied `.env.production` into the build output. They are now read from the environment at startup.
- Environment variables are now `RAVELRY_USERNAME` / `RAVELRY_PASSWORD`. The old `AUTH_USER` / `AUTH_PASS` names still work.
- `.env.development` / `.env.production` are no longer loaded; use a single `.env` for local development, or set the variables in your MCP client config.
- Requires Node.js 22+; the package is now ESM.

### Added

- `outputSchema` + `structuredContent` on every tool, tool `title`s and read-only `annotations`.
- Server `instructions` to guide the model through the search → details workflow.
- Validated tool inputs: enums for craft, availability and sort (all checked against the live API), page size limits.
- `sort` and `page_size` options for `search_patterns`; `missing_ids` in `get_pattern_details`.
- Curated, token-efficient pattern details (category paths, needle sizes, yardage, truncated notes) instead of the raw API payload.
- Request timeouts, client cancellation forwarded to Ravelry requests, and actionable error messages (bad credentials, rate limiting, outages).
- Optional Streamable HTTP transport (`MCP_TRANSPORT=http`) with localhost Host/Origin validation.
- MCP Bundle (`manifest.json`, `npm run pack:mcpb`) for one-click Claude Desktop install.
- Vitest suite using a real in-process MCP client, a live smoke test, GitHub Actions CI, Dependabot.

### Changed

- `@modelcontextprotocol/sdk` 1.x → `@modelcontextprotocol/server` 2.x (`registerTool`, `serveStdio`).
- zod 3 → 4, axios → native `fetch`, dotenv → Node's `--env-file`.
- Jest/ts-node/nodemon → Vitest and Node's built-in TypeScript support and `--watch`.
- ESLint 8 → 10 flat config with type-checked `typescript-eslint` rules; Prettier 3; Husky 9.
