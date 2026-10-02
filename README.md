# Ravelry MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server that lets AI assistants search for, explore and compare knitting and crochet patterns on [Ravelry](https://www.ravelry.com).

[![CI](https://github.com/gpaul-mcp/MCP_ravelry/actions/workflows/ci.yml/badge.svg)](https://github.com/gpaul-mcp/MCP_ravelry/actions/workflows/ci.yml)
[![MCP SDK v2](https://img.shields.io/badge/MCP_SDK-v2-blue)](https://ts.sdk.modelcontextprotocol.io/v2/)
[![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)

This project was inspired by my girlfriend, whose passion for knitting and crochet encouraged me to create this bridge between AI assistants and the Ravelry crafting community. Since she's not very tech-savvy and somewhat skeptical about AI, this serves as my way of connecting with her interests and showing how technology can enhance her crafting experience rather than replace it.

## Tools

### Patterns

| Tool                  | What it does                                                                                                                                                                                                                                                                                                                                          |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search_patterns`     | Search by keyword plus filters: `craft`, `category` (plain words like "hat", "toys" or "jumper" are mapped to Ravelry's categories), yarn `weight`, `yardage_min`/`yardage_max`, `difficulty_max`, `fit` (baby, child, adult...), `language`, `designer`, `availability` (`free` _(default)_, `ravelry`, `online`, `inprint`, `any`), `sort`, paging. |
| `get_pattern_details` | Full details for 1–20 patterns: designer, price, difficulty, rating, yarn weight, yardage, gauge, needle/hook sizes, sizes, languages, photo and designer notes.                                                                                                                                                                                      |

### Yarns

| Tool                     | What it does                                                                                                                                                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search_yarns`           | Search by name plus `weight`, `fiber` (merino, alpaca, cotton...) and `attributes` (superwash, hand-dyed, self-striping...), sorted by best match, rating or popularity. Discontinued yarns are hidden unless asked. |
| `get_yarn_details`       | For 1–20 yarns: fiber content, yards and grams per skein, recommended needles and hooks, gauge, care, texture, color/dye attributes, where it was made, and notes.                                                   |
| `find_yarns_for_pattern` | Yarn substitution: the yarns other Ravelry users actually used for a pattern, ranked by how many projects used each, next to the weight, yardage and gauge the pattern calls for and the designer's suggested yarns. |

### Shops

| Tool              | What it does                                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `find_yarn_shops` | Local yarn shops around a point (latitude/longitude + radius, nearest first) or by name or city: address, distance, website, phone, email. |

Every tool is read-only (`readOnlyHint`), validates its input against the values Ravelry accepts, and returns typed `structuredContent` described by an `outputSchema`.

Example prompts:

- "I have 400 yards of DK yarn. Find an easy free knitted hat that fits."
- "Find a free crochet amigurumi pattern written in French."
- "This pattern calls for a discontinued yarn, what do other knitters use instead?"
- "Compare three well-rated superwash merino DK yarns."
- "Are there yarn shops within 5 km of the Louvre?"

## Get Ravelry API credentials

The server uses Ravelry's **read-only basic-auth API keys**, not your Ravelry login:

1. Sign in at <https://www.ravelry.com/pro/developer>.
2. Create an app and choose **basic auth** with read-only access.
3. Copy the generated **username** and **password**.

## Install

Requires Node.js 22 or later.

### Claude Desktop: one-click bundle (recommended)

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

| Variable                | Default     | Description                                                              |
| ----------------------- | ----------- | ------------------------------------------------------------------------ |
| `RAVELRY_USERNAME`      | (required)  | Read-only API username (`AUTH_USER` is still accepted).                  |
| `RAVELRY_PASSWORD`      | (required)  | Read-only API password (`AUTH_PASS` is still accepted).                  |
| `MCP_TRANSPORT`         | `stdio`     | `stdio`, or `http` to serve Streamable HTTP at `/mcp`.                   |
| `HOST`                  | `127.0.0.1` | HTTP mode bind address.                                                  |
| `PORT`                  | `3000`      | HTTP mode port.                                                          |
| `RAVELRY_TIMEOUT_MS`    | `15000`     | Timeout for each Ravelry API request.                                    |
| `MCP_ALLOWED_HOSTS`     | (none)      | HTTP mode: public hostnames accepted besides localhost, comma-separated. |
| `MCP_URL_SECRET`        | (none)      | HTTP mode: serve at `/mcp/<secret>` instead of `/mcp` (16+ characters).  |
| `RATE_LIMIT_PER_MINUTE` | `60`        | HTTP mode: requests per client per minute; `0` disables.                 |
| `TRUST_PROXY`           | `false`     | HTTP mode: identify clients by `CF-Connecting-IP` / `X-Forwarded-For`.   |

### HTTP mode and hosting

`MCP_TRANSPORT=http npm start` serves Streamable HTTP at `http://127.0.0.1:3000/mcp`, plus `GET /health`. `Host` and `Origin` headers must be localhost or one of `MCP_ALLOWED_HOSTS` (protection against DNS rebinding).

To share the server so people can add it to Claude or ChatGPT by URL, follow **[Self-hosting with Cloudflare Tunnel](docs/self-hosting.md)**: a Docker Compose setup that runs it on your own machine for free.

### Prompts

The server also provides conversation starters, which clients show as prompts or slash commands: **Find a pattern**, **Substitute a yarn**, **What can I make with this yarn?** and **Yarn shops near me**.

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
├── http.ts                     # Streamable HTTP transport: host checks, URL secret, rate limit, /health
├── rate-limit.ts               # Per-client request limiter
├── prompts.ts                  # Conversation starters (MCP prompts)
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
