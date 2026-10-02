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
