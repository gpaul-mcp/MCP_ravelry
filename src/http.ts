import { timingSafeEqual } from 'node:crypto';
import { createServer as createHttpServer, type IncomingMessage } from 'node:http';

import { hostHeaderValidation, originValidation, toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler, type McpServer } from '@modelcontextprotocol/server';

import { RateLimiter } from './rate-limit.ts';

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

export interface HttpOptions {
  host: string;
  port: number;
  /** Public hostnames (e.g. behind a tunnel) accepted in addition to localhost. */
  allowedHosts?: string[];
  /** When set, the endpoint is `/mcp/<secret>` instead of `/mcp`. */
  urlSecret?: string | undefined;
  /** Requests per client per minute; 0 disables the limit. */
  rateLimitPerMinute?: number;
  /** Identify clients by the proxy's `CF-Connecting-IP` / `X-Forwarded-For` headers. */
  trustProxy?: boolean;
}

/**
 * Serves the MCP endpoint over Streamable HTTP, plus `GET /health`.
 *
 * Host and Origin headers are checked against localhost and `allowedHosts`
 * (DNS-rebinding protection). The endpoint itself has no user authentication:
 * use `urlSecret` to keep a publicly reachable instance unlisted, and the rate
 * limit to protect the Ravelry API key it shares between users.
 */
export async function serveHttp(
  factory: () => McpServer,
  options: HttpOptions,
): Promise<{ port: number; close: () => Promise<void> }> {
  const handler = createMcpHandler(factory);
  const nodeHandler = toNodeHandler(handler);
  const hostnames = [...LOCAL_HOSTS, ...(options.allowedHosts ?? [])];
  const validateHost = hostHeaderValidation(hostnames);
  const validateOrigin = originValidation(hostnames);
  const limiter = new RateLimiter(options.rateLimitPerMinute ?? 0);
  const endpoint = options.urlSecret ? `/mcp/${options.urlSecret}` : '/mcp';

  const httpServer = createHttpServer((req, res) => {
    if (!validateHost(req, res) || !validateOrigin(req, res)) return;

    const { pathname } = new URL(req.url ?? '/', 'http://localhost');
    if (pathname === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"status":"ok"}');
      return;
    }
    if (pathname === '/' && req.method === 'GET') {
      const url = options.urlSecret
        ? undefined
        : `${publicOrigin(req, options.trustProxy ?? false)}${endpoint}`;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(landingPage(url));
      return;
    }
    if (!pathMatches(pathname, endpoint)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found.');
      return;
    }

    const retryAfter = limiter.hit(clientKey(req, options.trustProxy ?? false));
    if (retryAfter > 0) {
      res
        .writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) })
        .end(
          JSON.stringify({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: `Too many requests. Try again in ${retryAfter}s.`,
            },
            id: null,
          }),
        );
      return;
    }

    void nodeHandler(req, res);
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(options.port, options.host, resolve);
  });

  const address = httpServer.address();
  return {
    port: typeof address === 'object' && address ? address.port : options.port,
    close: async () => {
      await handler.close();
      await new Promise<void>(resolve =>
        httpServer.close(() => {
          resolve();
        }),
      );
    },
  };
}

/** Constant-time comparison, so the URL secret cannot be guessed by timing. */
function pathMatches(pathname: string, endpoint: string): boolean {
  const actual = Buffer.from(pathname.replace(/\/+$/, ''));
  const expected = Buffer.from(endpoint);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function publicOrigin(req: IncomingMessage, trustProxy: boolean): string {
  const forwarded = trustProxy ? req.headers['x-forwarded-proto'] : undefined;
  const proto = typeof forwarded === 'string' && forwarded === 'https' ? 'https' : 'http';
  return `${proto}://${req.headers.host ?? 'localhost'}`;
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);

/** What a person sees when opening the server in a browser. */
function landingPage(mcpUrl: string | undefined): string {
  const connect = mcpUrl
    ? `<p>Add this URL as a custom connector in Claude (Settings → Connectors) or any MCP client:</p>
<pre>${escapeHtml(mcpUrl)}</pre>`
    : '<p>This is a private instance. Ask its owner for the connector URL.</p>';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ravelry MCP server</title>
<style>
body { font: 16px/1.5 system-ui, sans-serif; max-width: 40rem; margin: 3rem auto; padding: 0 1rem; color: #222; background: #fff; }
pre { background: #f4f4f4; padding: .75rem 1rem; border-radius: 6px; overflow-x: auto; }
@media (prefers-color-scheme: dark) { body { color: #eee; background: #161616; } pre { background: #262626; } a { color: #8ab4ff; } }
</style>
</head>
<body>
<h1>Ravelry MCP server</h1>
<p>Lets AI assistants search Ravelry patterns, find yarns and yarn substitutes, and look up local yarn shops.</p>
${connect}
<p><a href="https://github.com/gpaul-mcp/MCP_ravelry">Documentation and source code</a></p>
</body>
</html>
`;
}

function clientKey(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const cloudflare = req.headers['cf-connecting-ip'];
    if (typeof cloudflare === 'string' && cloudflare) return cloudflare;
    const forwarded = req.headers['x-forwarded-for'];
    const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.socket.remoteAddress ?? 'unknown';
}
