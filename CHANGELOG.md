# Changelog

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
