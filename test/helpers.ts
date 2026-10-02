import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { vi } from 'vitest';

import { RavelryClient } from '../src/ravelry/client.ts';
import { createServer } from '../src/server.ts';

export type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Answers each Ravelry request from `routes`, keyed by URL pathname. */
export function routeFetch(routes: Record<string, unknown>): FetchMock {
  return vi.fn<typeof fetch>(input => {
    const { pathname } = new URL(input);
    const body = routes[pathname];
    return Promise.resolve(
      body === undefined ? jsonResponse({ error: 'not found' }, 404) : jsonResponse(body),
    );
  });
}

/** The URLs the server requested from Ravelry, in order. */
export function requestedUrls(fetchMock: FetchMock): URL[] {
  return fetchMock.mock.calls.map(([input]) => new URL(input as string));
}

/** Connects a real MCP client to the server in-process, backed by `fetchMock`. */
export async function connect(fetchMock: FetchMock) {
  const ravelry = new RavelryClient({ username: 'user', password: 'pass', fetch: fetchMock });
  const handler = createMcpHandler(() => createServer(ravelry));
  const client = new Client(
    { name: 'test-client', version: '1.0.0' },
    { versionNegotiation: { mode: 'auto' } },
  );
  await client.connect(
    new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), {
      fetch: (url, init) => handler.fetch(new Request(url, init)),
    }),
  );
  return {
    client,
    close: async () => {
      await client.close();
      await handler.close();
    },
  };
}
