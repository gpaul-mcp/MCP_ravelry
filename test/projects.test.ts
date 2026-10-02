import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RavelryClient } from '../src/ravelry/client.ts';
import type { ApiPattern, ApiProjectFull, ApiStashFull } from '../src/ravelry/types.ts';
import { createServer } from '../src/server.ts';
import { jsonResponse } from './helpers.ts';

const pattern: ApiPattern = {
  id: 990044,
  name: 'Musselburgh',
  permalink: 'musselburgh',
  free: false,
  craft: { name: 'Knitting' },
  yardage: 400,
};

const stash: ApiStashFull = {
  id: 5,
  name: 'Test yarn',
  packs: [{ id: 50, stash_id: 5, total_yards: 660, skeins: 3, prefer_metric_length: false }],
};

/** A fake Ravelry that keeps one project in memory and records every write. */
function fakeRavelry() {
  let project: ApiProjectFull = {
    id: 77,
    name: 'Musselburgh',
    permalink: 'musselburgh',
    pattern_id: 990044,
    status_name: 'In progress',
    progress: 0,
    private_notes: '2026-10-01: Started.',
    packs: [{ id: 70, stash_id: 5, total_yards: 200 }],
  };
  const writes: { method: string; path: string; body: unknown }[] = [];
  const fetchMock = vi.fn<typeof fetch>((input, init) => {
    const url = new URL(input);
    const method = init?.method ?? 'GET';
    const body =
      typeof init?.body === 'string'
        ? (JSON.parse(init.body) as Record<string, unknown>)
        : undefined;
    if (method !== 'GET') writes.push({ method, path: url.pathname, body });

    const route = `${method} ${url.pathname}`;
    let response: unknown = { error: 'not found' };
    if (route === 'GET /patterns.json') response = { patterns: { '990044': pattern } };
    else if (route === 'GET /people/knitter/stash/5.json') response = { stash };
    else if (route === 'POST /people/knitter/stash/5.json') response = { stash };
    else if (route === 'POST /projects/knitter/create.json') response = { project };
    else if (route === 'GET /projects/knitter/77.json') response = { project };
    else if (route === 'POST /projects/knitter/77.json') {
      project = { ...project, ...(body as Partial<ApiProjectFull>) };
      response = { project };
    } else if (route === 'POST /packs/70.json' || route === 'DELETE /packs/70.json')
      response = { pack: {} };
    else if (route === 'DELETE /people/knitter/queue/9.json') response = {};
    else return Promise.resolve(jsonResponse(response, 404));
    return Promise.resolve(jsonResponse(response));
  });
  return { fetchMock, writes };
}

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

async function connect(fetchMock: typeof fetch, scopes = ['ravelry:read', 'ravelry:write']) {
  const publicRavelry = new RavelryClient({ username: 'app', password: 'key', fetch: fetchMock });
  const ravelry = new RavelryClient({
    authorization: () => Promise.resolve('Bearer t'),
    fetch: fetchMock,
  });
  const handler = createMcpHandler(() =>
    createServer(publicRavelry, { username: 'knitter', ravelry, publicRavelry }),
  );
  const authInfo = {
    token: 't',
    clientId: 'c',
    scopes,
    expiresAt: Math.floor(Date.now() / 1000) + 600,
  };
  const client = new Client(
    { name: 'test', version: '1.0.0' },
    { versionNegotiation: { mode: 'auto' } },
  );
  await client.connect(
    new StreamableHTTPClientTransport(new URL('http://test.local/account/mcp'), {
      fetch: (url, init) => handler.fetch(new Request(url, init), { authInfo }),
    }),
  );
  cleanup = async () => {
    await client.close();
    await handler.close();
  };
  return client;
}

describe('project tools', () => {
  it('starts a project with stash yarn and removes it from the queue', async () => {
    const { fetchMock, writes } = fakeRavelry();
    const client = await connect(fetchMock);

    const result = await client.callTool({
      name: 'start_project',
      arguments: {
        pattern_id: 990044,
        queued_id: 9,
        yarn: [{ stash_id: 5, yards: 200 }],
        note: 'Cast on',
      },
    });

    expect(result.isError).toBeFalsy();
    const create = writes.find(w => w.path === '/projects/knitter/create.json');
    expect(create?.body).toMatchObject({
      name: 'Musselburgh',
      pattern_id: 990044,
      craft_id: 2,
      project_status_id: 1,
      packs: [{ stash_id: 5, total_length: '200' }],
    });
    expect((create?.body as { private_notes: string }).private_notes).toMatch(
      /^\d{4}-\d{2}-\d{2}: Started\. Cast on$/,
    );
    expect(
      writes.some(w => w.method === 'DELETE' && w.path === '/people/knitter/queue/9.json'),
    ).toBe(true);
    expect(result.structuredContent).toMatchObject({
      id: 77,
      removed_from_queue: true,
      pattern_needs: '400 yards',
    });
  });

  it('logs progress: appends to the log and records yarn used so far', async () => {
    const { fetchMock, writes } = fakeRavelry();
    const client = await connect(fetchMock);

    await client.callTool({
      name: 'log_project_progress',
      arguments: {
        project_id: 77,
        note: 'Row 42 of the brim',
        progress: 40,
        yarn_used: [{ stash_id: 5, yards: 250 }],
        date: '2026-10-02',
      },
    });

    expect(writes.find(w => w.path === '/packs/70.json')?.body).toEqual({ total_length: '250' });
    expect(writes.find(w => w.path === '/projects/knitter/77.json')?.body).toEqual({
      progress: 40,
      private_notes: '2026-10-01: Started.\n2026-10-02: Row 42 of the brim',
    });
  });

  it('frogging returns the yarn to the stash', async () => {
    const { fetchMock, writes } = fakeRavelry();
    const client = await connect(fetchMock);

    const result = await client.callTool({
      name: 'update_project_status',
      arguments: { project_id: 77, status: 'frogged', date: '2026-10-02' },
    });

    expect(writes.some(w => w.method === 'DELETE' && w.path === '/packs/70.json')).toBe(true);
    expect(writes.find(w => w.path === '/projects/knitter/77.json')?.body).toMatchObject({
      project_status_id: 4,
      private_notes: '2026-10-01: Started.\n2026-10-02: Frogged',
    });
    expect(result.structuredContent).toMatchObject({ released_yarn: true });
  });

  it('asks for the write permission when the connection is read-only', async () => {
    const { fetchMock, writes } = fakeRavelry();
    const client = await connect(fetchMock, ['ravelry:read']);

    await expect(
      client.callTool({ name: 'log_project_progress', arguments: { project_id: 77, note: 'x' } }),
    ).rejects.toThrow();
    expect(writes).toHaveLength(0);
  });

  it('changes the total owned through the stash, not the pack endpoint', async () => {
    // Ravelry answers 400 to /packs/{id} for a stash pack without a project.
    const { fetchMock, writes } = fakeRavelry();
    const client = await connect(fetchMock);

    const result = await client.callTool({
      name: 'update_stash_entry',
      arguments: { stash_id: 5, total_skeins: 4, location: 'Box', colorway: 'Teal' },
    });

    expect(result.isError).toBeFalsy();
    expect(writes).toEqual([
      {
        method: 'POST',
        path: '/people/knitter/stash/5.json',
        body: { location: 'Box', pack: { colorway: 'Teal', skeins: '4' } },
      },
    ]);
  });

  it("refuses someone else's project (Ravelry ignores the username in the URL)", async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        jsonResponse({
          project: { id: 999, name: 'Not mine', permalink: 'x', user: { username: 'someoneelse' } },
        }),
      ),
    );
    const client = await connect(fetchMock);
    const result = await client.callTool({
      name: 'get_my_project',
      arguments: { project_id: 999 },
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toMatch(/not one of knitter's projects/);
  });
});
