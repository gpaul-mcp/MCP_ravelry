import { timingSafeEqual } from 'node:crypto';
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';

import { hostHeaderValidation, originValidation, toNodeHandler } from '@modelcontextprotocol/node';
import {
  type AuthInfo,
  bearerAuthChallengeResponse,
  createMcpHandler,
  getOAuthProtectedResourceMetadataUrl,
  type McpServer,
  type McpServerFactory,
  verifyBearerToken,
} from '@modelcontextprotocol/server';

import { ACCOUNT_SCOPE, type AuthServer, WRITE_SCOPE } from './auth/server.ts';
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
  /** "Sign in with Ravelry": OAuth endpoints plus the protected `/account/mcp` endpoint. */
  account?: {
    auth: AuthServer;
    /** Builds the per-request server for a verified user. */
    factory: McpServerFactory;
    /** Public URL of `/account/mcp`; the OAuth resource identifier. */
    resourceUrl: string;
  };
}

export const ACCOUNT_PATH = '/account/mcp';

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
  const { account } = options;
  const accountHandler = account && createMcpHandler(account.factory);
  const accountNodeHandler = accountHandler && toNodeHandler(accountHandler);
  const resourceMetadataUrl =
    account && getOAuthProtectedResourceMetadataUrl(new URL(account.resourceUrl));

  const httpServer = createHttpServer((req, res) => {
    if (!validateHost(req, res) || !validateOrigin(req, res)) return;

    const { pathname } = new URL(req.url ?? '/', 'http://localhost');
    if (pathname === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"status":"ok"}');
      return;
    }
    if (pathname === '/' && req.method === 'GET') {
      const origin = publicOrigin(req, options.trustProxy ?? false);
      const page = landingPage(
        options.urlSecret ? undefined : `${origin}${endpoint}`,
        account ? account.resourceUrl : undefined,
      );
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(page);
      return;
    }

    const isAccountRoute =
      account !== undefined &&
      (account.auth.handles(pathname) ||
        pathname === ACCOUNT_PATH ||
        pathname === new URL(resourceMetadataUrl ?? '/', 'http://x').pathname);
    if (!isAccountRoute && !pathMatches(pathname, endpoint)) {
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

    if (account && accountNodeHandler && resourceMetadataUrl && isAccountRoute) {
      if (account.auth.handles(pathname)) {
        void account.auth.handle(req, res, pathname);
      } else if (pathname === ACCOUNT_PATH) {
        void serveAccount(req, res, account.auth, accountNodeHandler, resourceMetadataUrl);
      } else {
        res
          .writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          })
          .end(JSON.stringify(protectedResourceMetadata(account.resourceUrl)));
      }
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
      await accountHandler?.close();
      await new Promise<void>(resolve =>
        httpServer.close(() => {
          resolve();
        }),
      );
    },
  };
}

/** Verifies the bearer token, then serves the personal MCP endpoint as that user. */
async function serveAccount(
  req: IncomingMessage & { auth?: AuthInfo },
  res: ServerResponse,
  verifier: AuthServer,
  handler: ReturnType<typeof toNodeHandler>,
  resourceMetadataUrl: string,
): Promise<void> {
  const options = { requiredScopes: [ACCOUNT_SCOPE], resourceMetadataUrl };
  try {
    req.auth = await verifyBearerToken(req.headers.authorization, { verifier, ...options });
  } catch (error) {
    // Ask for write too, so one sign-in covers reading and adding to stash/queue.
    const challenge = bearerAuthChallengeResponse(error, {
      requiredScopes: [ACCOUNT_SCOPE, WRITE_SCOPE],
      resourceMetadataUrl,
    });
    res
      .writeHead(challenge.status, Object.fromEntries(challenge.headers))
      .end(Buffer.from(await challenge.arrayBuffer()));
    return;
  }
  await handler(req, res);
}

/** RFC 9728 document that tells MCP clients where to sign in. */
function protectedResourceMetadata(resourceUrl: string) {
  return {
    resource: resourceUrl,
    authorization_servers: [new URL(resourceUrl).origin],
    scopes_supported: [ACCOUNT_SCOPE, WRITE_SCOPE],
    bearer_methods_supported: ['header'],
    resource_name: 'Ravelry (your account)',
    resource_documentation: 'https://github.com/gpaul-mcp/MCP_ravelry',
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
function landingPage(mcpUrl: string | undefined, accountUrl: string | undefined): string {
  const publicPart = mcpUrl
    ? `<p>Add this URL as a custom connector in Claude (Settings → Connectors) or any MCP client:</p>
<pre>${escapeHtml(mcpUrl)}</pre>`
    : '<p>This is a private instance. Ask its owner for the connector URL.</p>';
  const accountPart = accountUrl
    ? `<p>Or, to also let the assistant read your own stash, queue, projects and favorites, use this one instead. You'll be asked to sign in with Ravelry:</p>
<pre>${escapeHtml(accountUrl)}</pre>`
    : '';
  const connect = publicPart + accountPart;
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
