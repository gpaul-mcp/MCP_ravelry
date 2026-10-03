[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/gpaul-mcp-mcp-ravelry-badge.png)](https://mseep.ai/app/gpaul-mcp-mcp-ravelry)

# Ravelry MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server that lets AI assistants search for, explore and compare knitting and crochet patterns on [Ravelry](https://www.ravelry.com).

[![CI](https://github.com/gpaul-mcp/MCP_ravelry/actions/workflows/ci.yml/badge.svg)](https://github.com/gpaul-mcp/MCP_ravelry/actions/workflows/ci.yml)
[![MCP SDK v2](https://img.shields.io/badge/MCP_SDK-v2-blue)](https://ts.sdk.modelcontextprotocol.io/v2/)
[![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)

This project was inspired by my girlfriend, whose passion for knitting and crochet encouraged me to create this bridge between AI assistants and the Ravelry crafting community. Since she's not very tech-savvy and somewhat skeptical about AI, this serves as my way of connecting with her interests and showing how technology can enhance her crafting experience rather than replace it.

## Use it now: no installation

A hosted instance is running at:

```
https://ravelry-mcp.gonz-paul.dev/mcp
```

You don't need a Ravelry account or API key: add the URL to your AI assistant and start asking.

**Claude** (web, desktop and mobile): **Settings → Connectors → Add custom connector**, give it a name ("Ravelry") and paste the URL. Once added, it is available everywhere you use Claude.

**ChatGPT**: add the URL as a custom MCP connector (developer mode), with no authentication.

**Claude Code**

```bash
claude mcp add --transport http ravelry https://ravelry-mcp.gonz-paul.dev/mcp
```

**VS Code** (`.vscode/mcp.json`)

```json
{
  "servers": {
    "ravelry": { "type": "http", "url": "https://ravelry-mcp.gonz-paul.dev/mcp" }
  }
}
```

**Cursor** (`~/.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "ravelry": { "url": "https://ravelry-mcp.gonz-paul.dev/mcp" }
  }
}
```

Then try one of the [example prompts](#tools), or the built-in starters: **Find a pattern**, **Substitute a yarn**, **What can I make with this yarn?** and **Yarn shops near me**.

> The hosted server only reads public Ravelry data with this project's read-only API key (with Ravelry's permission), stores nothing about your conversations, and allows 60 requests per minute per user. Prefer to run your own? See [Run it yourself](#run-it-yourself).

### With your own Ravelry account

To also let your assistant read **your** stash, queue, projects, favorites and library, add this URL instead:

```
https://ravelry-mcp.gonz-paul.dev/account/mcp
```

The first time, your assistant opens a page where you sign in with Ravelry, then confirm on a second page which app gets access. Access is **read-only**: nothing can be changed on Ravelry. You can revoke it at any time from your Ravelry account's app settings.

Then you can ask things like:

- "What should I make next?" (it checks which queued patterns your stash already covers)
- "What can I make with the DK yarn in my stash?"
- "Look at my projects and tell me what kind of maker I am." (a crafting profile your assistant can remember)

What the server stores: your Ravelry username and its Ravelry sign-in tokens, encrypted, so it can keep your connection working, and the row counters you create (encrypted, deleted when you remove them). Nothing else about you or your conversations.

## Tools

### Patterns

| Tool                  | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search_patterns`     | Search by keyword plus filters: `craft`, `category` (plain words like "hat", "toys" or "jumper" are mapped to Ravelry's categories), yarn `weight`, `yardage_min`/`yardage_max`, `difficulty_max`, `fit` (baby, child, adult, petite, plus, negative ease...), `attributes` (techniques and construction in plain words: "top down", "raglan", "cables", "Fair Isle", "toe up", "granny square"... all of them or any of them), `language`, `designer`, `availability` (`free` _(default)_, `ravelry`, `online`, `inprint`, `any`), `sort`, paging. |
| `get_pattern_details` | Full details for 1–20 patterns: designer, price, difficulty, rating, yarn weight, yardage, gauge (also as numbers per 10 cm), needle/hook sizes, sizes, techniques, crochet terminology (US or UK), languages, photo and designer notes.                                                                                                                                                                                                                                                                                                            |

### Yarns

| Tool                     | What it does                                                                                                                                                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search_yarns`           | Search by name plus `weight`, `fiber` (merino, alpaca, cotton...) and `attributes` (superwash, hand-dyed, self-striping...), sorted by best match, rating or popularity. Discontinued yarns are hidden unless asked. |
| `get_yarn_details`       | For 1–20 yarns: fiber content, yards and grams per skein, recommended needles and hooks, gauge, care, texture, color/dye attributes, where it was made, and notes.                                                   |
| `find_yarns_for_pattern` | Yarn substitution: the yarns other Ravelry users actually used for a pattern, ranked by how many projects used each, next to the weight, yardage and gauge the pattern calls for and the designer's suggested yarns. |
| `match_yarns`            | Matches what was read from a ball band, receipt or invoice (brand, name, weight, fiber, yards/grams per skein) to Ravelry yarns, with a confidence level, the reasons and alternatives.                              |

### Calculators and reference

The assistant uses these instead of doing knitting arithmetic in its head, so the numbers are right and it can focus on explaining.

| Tool                 | What it does                                                                                                                                                                                                                     |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `adjust_for_gauge`   | Your swatch vs the pattern gauge (typed in, or read from a Ravelry pattern): change needles or not, how big the piece comes out as written, and the pattern's numbers recalculated for your gauge, rounded to the stitch repeat. |
| `spread_evenly`      | "Increase 13 evenly across 97" → `[k8, M1] 6 times, [k7, M1] 7 times`. Knitting or crochet, flat or in the round.                                                                                                                |
| `yarn_needed`        | Skeins to buy for a pattern (smallest and largest size) in a given yarn, with a safety margin; warns when the yarn weight differs.                                                                                               |
| `count_stitches`     | Reads written rows (`*k2, p2; rep from * to last 2 sts, k2`, `(sc, inc) x 6 (18)`) and counts what each step uses and makes; flags rows that don't add up and counts that differ from the pattern's.                             |
| `crafting_reference` | Needle and hook sizes (metric, US, UK, Japanese), yarn weights across regions (US worsted = UK aran = AU 10 ply), US↔UK crochet and knitting terms, and standard abbreviations.                                                  |

Starters: **Read me this row**, **Chart ↔ written instructions**, **Find a pattern from a photo** and **Fix my knitting or crochet problem**.

### Shops

| Tool              | What it does                                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `find_yarn_shops` | Local yarn shops around a point (latitude/longitude + radius, nearest first) or by name or city: address, distance, website, phone, email. |

### Your account (at `/account/mcp`, after signing in)

| Tool                         | What it does                                                                                                                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_my_crafting_profile`    | Who you are as a maker: crafts, what you make most, yarn weights you use, difficulty you handle (with an estimated level), stash and queue size, plus a short summary worth remembering.                            |
| `get_my_stash`               | Your yarn with weight, colorway, skeins and total yards, and yards available per weight.                                                                                                                            |
| `get_my_queue`               | Your queued patterns with the yarn you planned for each.                                                                                                                                                            |
| `get_my_projects`            | Your projects: pattern, craft, status, progress, dates, your rating.                                                                                                                                                |
| `get_my_favorites`           | Your favorited patterns, yarns, designers…                                                                                                                                                                          |
| `search_my_library`          | Patterns, books and magazines in your Ravelry library.                                                                                                                                                              |
| `find_patterns_for_my_stash` | Patterns that fit yarn you own: same weight, using 40–100 % of the yardage.                                                                                                                                         |
| `pick_from_my_queue`         | Ranks your queue by what your stash already covers: planned yarn on hand, enough yarn of the right weight, or how many yards you're short.                                                                          |
| `add_to_my_stash`            | Adds yarn to your stash (e.g. from a receipt photo) with colorway, dye lot, skeins, length, weight, price, shop and purchase date. Skips yarn already stashed.                                                      |
| `add_to_my_queue`            | Queues patterns, optionally with the yarn you plan to use and a note. Skips patterns already queued.                                                                                                                |
| `get_my_project`             | One project: pattern, status, progress, the stash yarn it uses, and its progress log.                                                                                                                               |
| `start_project`              | Starts a project from a pattern (or a queued pattern, which leaves the queue) and sets stash yarn aside for it.                                                                                                     |
| `log_project_progress`       | "Row 42 of the sleeve, used 1 skein": adds a dated line to the project's private log, sets the %, and records yarn used so far.                                                                                     |
| `update_project_status`      | Finish (leftovers stay in the stash, empty yarn becomes used up), pause, resume or frog (yarn goes back).                                                                                                           |
| `update_stash_entry`         | Fix colorway, dye lot, location, notes, status or the total owned.                                                                                                                                                  |
| `remove_from_stash`          | Permanently delete stash entries (only when you ask; "used up" keeps the history).                                                                                                                                  |
| `estimate_finish_date`       | "When will I finish?": from your own pace (yards a day over your recent finished projects), for a pattern or a project in progress; with a deadline, says if it's comfortable, tight or unlikely.                   |
| `plan_yarn_shopping`         | Shopping list for queued or chosen patterns: what your stash already covers (each yard counted once) and what's left to buy per pattern and per weight, in skeins of the planned yarn when known.                   |
| `review_my_queue`            | Queue tidy-up: duplicates, patterns you already made, entries waiting for years, and how long the whole queue would take at your pace. Suggests only; never removes anything.                                       |
| `audit_my_stash`             | Stash check-up: how long it would last at your pace, yarn no plan uses, the oldest yarn, weights you buy but rarely use, leftovers for scrap projects, entries missing information.                                 |
| `discover_patterns_for_me`   | New patterns from your own taste (techniques, categories, designers in your favorites), or to learn a technique you haven't used yet, leaving out what you already favorited, queued or made.                       |
| `get_my_needles`             | Your needles and hooks; with a pattern, which sizes you have and what's missing (circulars or DPNs for patterns worked in the round).                                                                               |
| `get_row_counter`            | A row counter card for a project: big + / − buttons you tap while crafting, several named counters (rows, repeats, decreases), a target and the position in the pattern repeat. Also "where am I?" across projects. |
| `update_row_counter`         | Changes a counter from the chat ("add 4 rows", "set a 48-row target", "8-row repeat"). Counters are kept on this server (encrypted), not on Ravelry; "Save to Ravelry log" writes the position to the project.      |

Plus three extra starters: **What should I make next?**, **Use up my stash** and **Add yarn to my stash from a photo**.

Changing anything needs one extra permission ("add, update and remove" on your stash, queue and projects), asked on the same consent page. Your assistant confirms before each change.

#### Keeping the stash up to date

Ravelry itself does the yarn bookkeeping: when a project uses part of a stash entry, Ravelry keeps that amount aside and the rest stays free. So the assistant works through projects:

1. **Start**: "Let's start Musselburgh with my teal Rios": the project is created and the yarn is set aside.
2. **Work**: "I'm at row 42 of the brim, used about one skein": a dated line goes into the project's private notes (your progress log) and the yarn used is updated. Next time, "where was I?" reads that log.
3. **Finish or frog**: finished projects keep their yarn and the leftovers stay in your stash (yarn with nothing left becomes "used up"); frogged projects give the yarn back.

That way "what can I make with my stash?" and "what can I start from my queue?" only count yarn that is really free.

### Cards in the chat

In apps that support [MCP Apps](https://modelcontextprotocol.io/extensions/apps) (Claude, ChatGPT, VS Code…), results show up as interactive cards: pattern and yarn photos, your stash by yarn weight, a "what can I start" view of your queue, receipt matches with confidence badges, and shop cards with map links. Buttons on the cards open Ravelry, show details, or ask your assistant for yarn ideas or to queue a pattern. Other apps get the same results as text.

Every tool except the two `add_to_my_*` ones is read-only (`readOnlyHint`). All of them validate their input against the values Ravelry accepts and return typed `structuredContent` described by an `outputSchema`.

Example prompts:

- "I have 400 yards of DK yarn. Find an easy free knitted hat that fits."
- "Find a free crochet amigurumi pattern written in French."
- "This pattern calls for a discontinued yarn, what do other knitters use instead?"
- "Compare three well-rated superwash merino DK yarns."
- "Are there yarn shops within 5 km of the Louvre?"
- "My swatch is 24 stitches per 10 cm but Musselburgh wants 6 per inch. What do I cast on?"
- "Check this round for me: (2 sc, inc) x 6 (24)."
- "This UK pattern says htr. What is that in US terms?"

## Run it yourself

Only needed if you don't want to use the [hosted instance](#use-it-now-no-installation). Requires Node.js 22 or later and your own Ravelry API key.

### Get Ravelry API credentials

The server uses Ravelry's **read-only basic-auth API keys**, not your Ravelry login:

1. Sign in at <https://www.ravelry.com/pro/developer> (a free Pro account is created if you don't have one).
2. Create an app and choose **basic auth** with read-only access.
3. Copy the generated **username** and **password**.

### Claude Desktop: one-click bundle

```bash
npm install
npm run pack:mcpb
```

Then double-click the generated `ravelry-mcp.mcpb` (or drag it onto Claude Desktop's **Settings → Extensions** page). Claude Desktop asks for the API username and password and stores the password securely.

### Any MCP client: build and point at `dist/index.js`

```bash
git clone https://github.com/gpaul-mcp/MCP_ravelry.git
cd MCP_ravelry
npm install
npm run build
```

**Claude Code**

```bash
claude mcp add ravelry -e RAVELRY_USERNAME=your-api-username -e RAVELRY_PASSWORD=your-api-password -- node /absolute/path/to/MCP_ravelry/dist/index.js
```

**Claude Desktop** (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "ravelry": {
      "command": "node",
      "args": ["/absolute/path/to/MCP_ravelry/dist/index.js"],
      "env": {
        "RAVELRY_USERNAME": "your-api-username",
        "RAVELRY_PASSWORD": "your-api-password"
      }
    }
  }
}
```

**VS Code** (`.vscode/mcp.json`, prompts for the password instead of storing it in the file)

```json
{
  "inputs": [
    {
      "type": "promptString",
      "id": "ravelry-password",
      "description": "Ravelry API password",
      "password": true
    }
  ],
  "servers": {
    "ravelry": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/MCP_ravelry/dist/index.js"],
      "env": {
        "RAVELRY_USERNAME": "your-api-username",
        "RAVELRY_PASSWORD": "${input:ravelry-password}"
      }
    }
  }
}
```

## Configuration

All configuration comes from environment variables. For local development you can put them in a `.env` file (see [`.env.example`](.env.example)); it is git-ignored.

| Variable                                                  | Default     | Description                                                                                                                             |
| --------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `RAVELRY_USERNAME`                                        | (required)  | Read-only API username (`AUTH_USER` is still accepted).                                                                                 |
| `RAVELRY_PASSWORD`                                        | (required)  | Read-only API password (`AUTH_PASS` is still accepted).                                                                                 |
| `MCP_TRANSPORT`                                           | `stdio`     | `stdio`, or `http` to serve Streamable HTTP at `/mcp`.                                                                                  |
| `HOST`                                                    | `127.0.0.1` | HTTP mode bind address.                                                                                                                 |
| `PORT`                                                    | `3000`      | HTTP mode port.                                                                                                                         |
| `RAVELRY_TIMEOUT_MS`                                      | `15000`     | Timeout for each Ravelry API request.                                                                                                   |
| `MCP_ALLOWED_HOSTS`                                       | (none)      | HTTP mode: public hostnames accepted besides localhost, comma-separated.                                                                |
| `MCP_URL_SECRET`                                          | (none)      | HTTP mode: serve at `/mcp/<secret>` instead of `/mcp` (16+ characters).                                                                 |
| `RATE_LIMIT_PER_MINUTE`                                   | `60`        | HTTP mode: requests per client per minute; `0` disables.                                                                                |
| `TRUST_PROXY`                                             | `false`     | HTTP mode: identify clients by `CF-Connecting-IP` / `X-Forwarded-For`.                                                                  |
| `RAVELRY_OAUTH_CLIENT_ID` / `RAVELRY_OAUTH_CLIENT_SECRET` | (none)      | Enables "Sign in with Ravelry" and `/account/mcp`. A Ravelry OAuth 2.0 app whose redirect URL is `<PUBLIC_URL>/oauth/ravelry/callback`. |
| `PUBLIC_URL`                                              | (none)      | With sign-in: the public origin, e.g. `https://ravelry.example.com`.                                                                    |
| `AUTH_SECRET`                                             | (none)      | With sign-in: 32+ random characters; encrypts stored tokens and signs cookies.                                                          |
| `DATA_DIR`                                                | `./data`    | With sign-in: where the SQLite sign-in database is kept.                                                                                |

### HTTP mode and hosting

`MCP_TRANSPORT=http npm start` serves Streamable HTTP at `http://127.0.0.1:3000/mcp`, plus `GET /health` and a short landing page at `/` that shows the connector URL. `Host` and `Origin` headers must be localhost or one of `MCP_ALLOWED_HOSTS` (protection against DNS rebinding).

To host your own instance that people add to Claude or ChatGPT by URL (like the hosted one above), follow **[Self-hosting with Cloudflare Tunnel](docs/self-hosting.md)**: a Docker Compose setup that runs it on your own machine for free.

### How "Sign in with Ravelry" works

`/account/mcp` is an OAuth-protected MCP endpoint, following the MCP authorization spec:

1. An unauthenticated request gets `401` with a `WWW-Authenticate` header pointing to `/.well-known/oauth-protected-resource/account/mcp`, which names this server as the authorization server.
2. The client discovers `/.well-known/oauth-authorization-server`, registers itself (dynamic client registration) and starts an authorization-code flow with PKCE (required).
3. The server ([oidc-provider](https://github.com/panva/node-oidc-provider)) sends the user to Ravelry's OAuth to sign in, then shows its own consent page naming the client. Each new client must be approved, so another app can't silently reuse someone's Ravelry sign-in.
4. The client receives an access token (1 hour) and refresh token, scoped to `/account/mcp` (RFC 8707). Ravelry's own tokens never leave the server; they are refreshed as needed.

Everything is stored in SQLite under `DATA_DIR`: lookup keys are hashed and every record (including Ravelry tokens) is encrypted with a key derived from `AUTH_SECRET`.

## Development

```bash
npm run dev        # run from source with auto-restart (Node runs the TypeScript directly)
npm run inspect    # build and open the MCP Inspector against the server
npm run check      # typecheck + lint + tests
npm run smoke      # after `npm run build`: live end-to-end test against the real Ravelry API
```

| Script              | Purpose                                                    |
| ------------------- | ---------------------------------------------------------- |
| `npm run build`     | Compile to `dist/` with `tsc`.                             |
| `npm start`         | Run the compiled server.                                   |
| `npm test`          | Vitest suite: drives the server through a real MCP client. |
| `npm run lint`      | ESLint (type-checked rules) + Prettier check.              |
| `npm run lint:fix`  | Auto-fix lint and formatting.                              |
| `npm run pack:mcpb` | Build a Claude Desktop bundle (`ravelry-mcp.mcpb`).        |

A Husky pre-commit hook runs lint-staged, the typecheck and the tests. CI runs the same checks on Node 22 and 24.

### Project structure

```
src/
├── index.ts                    # Entry point: config, transport (stdio or HTTP), shutdown
├── server.ts                   # createServer() factory: server info, instructions, tools
├── config.ts                   # Environment variable parsing and validation (zod)
├── http.ts                     # Streamable HTTP: host checks, URL secret, rate limit, /health, landing page
├── rate-limit.ts               # Per-client request limiter
├── prompts.ts                  # Conversation starters (MCP prompts)
├── auth/                       # "Sign in with Ravelry": OAuth server, consent page, storage
│   ├── server.ts               # oidc-provider setup, Ravelry login step, consent, token checks
│   ├── ravelry-oauth.ts        # Ravelry's OAuth 2.0 endpoints
│   ├── accounts.ts             # Signed-in accounts and Ravelry token refresh
│   ├── adapter.ts / db.ts      # Encrypted SQLite storage
│   └── crypto.ts / pages.ts    # Key derivation, encryption, HTML pages
├── account/                    # Personal tools for signed-in users
│   ├── lists.ts                # get_my_stash, get_my_queue, get_my_projects, ...
│   ├── insights.ts             # find_patterns_for_my_stash, pick_from_my_queue, profile
│   ├── stash.ts                # Stash normalization (yards per weight)
│   └── setup.ts                # Wires sign-in and the per-user server
├── ravelry/
│   ├── client.ts               # Ravelry API client (fetch, timeouts, cancellation, errors)
│   ├── types.ts                # Ravelry API response types
│   └── vocabulary.ts           # Verified filter values and category resolution
└── tools/
    ├── search-patterns.ts      # search_patterns tool
    ├── get-pattern-details.ts  # get_pattern_details tool
    ├── yarns.ts                # search_yarns and get_yarn_details tools
    ├── find-yarns-for-pattern.ts # find_yarns_for_pattern tool
    ├── find-yarn-shops.ts      # find_yarn_shops tool
    └── format.ts               # Shared formatting helpers
test/                           # Vitest tests (in-process MCP client, mocked Ravelry API)
scripts/
├── smoke.ts                    # Live end-to-end check over stdio
└── pack-mcpb.ts                # MCP Bundle packaging
manifest.json                   # MCP Bundle manifest
```

### Adding a tool

1. Create `src/tools/<name>.ts` exporting `register<Name>(server, ravelry)` that calls `server.registerTool()` with a `title`, a `description` written for the model, a zod `inputSchema` (use `.describe()` on every field), an `outputSchema`, and `annotations`.
2. Register it in `src/server.ts` and list it in `manifest.json`.
3. Add a test in `test/server.test.ts`.

## License

MIT, see [LICENSE](LICENSE).
