import { request } from 'node:http';

import { afterEach, describe, expect, it } from 'vitest';

import { serveHttp } from '../src/http.ts';
import { RavelryClient } from '../src/ravelry/client.ts';
import { RateLimiter } from '../src/rate-limit.ts';
import { createServer } from '../src/server.ts';
import { routeFetch } from './helpers.ts';

const SECRET = 'test-secret-0123456789';
const ravelry = new RavelryClient({ username: 'u', password: 'p', fetch: routeFetch({}) });

let server: Awaited<ReturnType<typeof serveHttp>> | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

async function start(options: Partial<Parameters<typeof serveHttp>[1]> = {}) {
  server = await serveHttp(() => createServer(ravelry), { host: '127.0.0.1', port: 0, ...options });
  return `http://127.0.0.1:${server.port}`;
}

const initialize = (base: string, path: string, headers: Record<string, string> = {}) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...headers,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0.0' },
      },
    }),
  });

// fetch() ignores a custom Host header, so this uses node:http directly.
function statusWithHost(base: string, host: string): Promise<number | undefined> {
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 't', version: '1' },
    },
  });
  return new Promise((resolve, reject) => {
    const req = request(`${base}/mcp`, {
      method: 'POST',
      headers: {
        Host: host,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
    });
    req.on('response', res => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('error', reject);
    req.end(body);
  });
}

describe('serveHttp', () => {
  it('answers the health check', async () => {
    const base = await start();
    const response = await fetch(`${base}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('serves MCP on /mcp and 404s elsewhere', async () => {
    const base = await start();
    expect((await initialize(base, '/mcp')).status).toBe(200);
    expect((await initialize(base, '/other')).status).toBe(404);
  });

  it('accepts configured public hostnames and rejects others', async () => {
    const base = await start({ allowedHosts: ['ravelry.example.com'] });
    expect(await statusWithHost(base, 'ravelry.example.com')).toBe(200);
    expect(await statusWithHost(base, 'evil.example.com')).toBe(403);
  });

  it('only serves the endpoint under the URL secret when one is set', async () => {
    const base = await start({ urlSecret: SECRET });
    expect((await initialize(base, '/mcp')).status).toBe(404);
    expect((await initialize(base, `/mcp/${SECRET}x`)).status).toBe(404);
    expect((await initialize(base, `/mcp/${SECRET}`)).status).toBe(200);
  });

  it('rate limits per client, using the proxy header when trusted', async () => {
    const base = await start({ rateLimitPerMinute: 2, trustProxy: true });
    const as = (ip: string) => initialize(base, '/mcp', { 'CF-Connecting-IP': ip });

    expect((await as('1.1.1.1')).status).toBe(200);
    expect((await as('1.1.1.1')).status).toBe(200);
    const limited = await as('1.1.1.1');
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect((await as('2.2.2.2')).status).toBe(200);
  });
});

describe('RateLimiter', () => {
  it('resets after the window', () => {
    const limiter = new RateLimiter(1, 1_000);
    expect(limiter.hit('a', 0)).toBe(0);
    expect(limiter.hit('a', 500)).toBe(1);
    expect(limiter.hit('a', 1_000)).toBe(0);
  });

  it('is disabled with a limit of 0', () => {
    const limiter = new RateLimiter(0);
    for (let i = 0; i < 100; i++) expect(limiter.hit('a')).toBe(0);
  });
});
