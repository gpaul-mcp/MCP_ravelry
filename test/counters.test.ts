import { randomBytes } from 'node:crypto';

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CounterStore } from '../src/account/counters.ts';
import { openDatabase } from '../src/auth/db.ts';
import { RavelryClient } from '../src/ravelry/client.ts';
import { createServer } from '../src/server.ts';
import { jsonResponse } from './helpers.ts';

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

function setup() {
  const db = openDatabase(':memory:');
  const store = new CounterStore(db, randomBytes(32));
  const fetchMock = vi.fn<typeof fetch>(input => {
    const match = /^\/projects\/knitter\/(\d+)\.json$/i.exec(new URL(input).pathname);
    return Promise.resolve(
      match
        ? jsonResponse({
            project: {
              id: Number(match[1]),
              name: `Project ${match[1]}`,
              permalink: 'p',
              links: { self: { href: `https://www.ravelry.com/projects/knitter/p${match[1]}` } },
            },
          })
        : jsonResponse({}, 404),
    );
  });
  return { db, store, fetchMock };
}

async function connect(store: CounterStore, fetchMock: typeof fetch) {
  const ravelry = new RavelryClient({
    authorization: () => Promise.resolve('Bearer t'),
    fetch: fetchMock,
  });
  const handler = createMcpHandler(() =>
    createServer(ravelry, {
      username: 'Knitter',
      ravelry,
      publicRavelry: ravelry,
      counters: store,
    }),
  );
  const authInfo = {
    token: 't',
    clientId: 'c',
    scopes: ['ravelry:read'],
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
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args });
    if (result.isError) throw new Error(JSON.stringify(result.content));
    return result.structuredContent as {
      project: { id: number; name: string } | null;
      counters: Record<string, unknown>[];
      other_projects: { id: number; summary: string }[];
    };
  };
  return call;
}

describe('row counters', () => {
  it('counts rows with a target and a pattern repeat', async () => {
    const { store, fetchMock } = setup();
    const call = await connect(store, fetchMock);

    await call('update_row_counter', { project_id: 7, action: 'configure', target: 48, repeat: 8 });
    await call('update_row_counter', { project_id: 7 });
    await call('update_row_counter', { project_id: 7, action: 'add', amount: 10 });
    const output = await call('update_row_counter', { project_id: 7, action: 'subtract' });

    expect(output.project).toEqual({
      id: 7,
      name: 'Project 7',
      url: 'https://www.ravelry.com/projects/knitter/p7',
    });
    expect(output.counters).toEqual([
      {
        name: 'Rows',
        value: 10,
        target: 48,
        repeat: 8,
        row_in_repeat: 2,
        repeats_done: 1,
        remaining: 38,
      },
    ]);
    // The project name is read from Ravelry once, when the counter is created.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps several counters per project and lists other projects', async () => {
    const { store, fetchMock } = setup();
    const call = await connect(store, fetchMock);

    await call('update_row_counter', { project_id: 7, action: 'set', value: 20 });
    await call('update_row_counter', { project_id: 7, counter: 'Decreases', amount: 2 });
    await call('update_row_counter', { project_id: 9, action: 'set', value: 3 });

    const seven = await call('get_row_counter', { project_id: 7 });
    expect(seven.counters.map(c => [c.name, c.value])).toEqual([
      ['Rows', 20],
      ['Decreases', 2],
    ]);
    expect(seven.other_projects).toEqual([{ id: 9, name: 'Project 9', summary: 'Rows 3' }]);

    const all = await call('get_row_counter', {});
    expect(all.project).toBeNull();
    expect(all.other_projects.map(p => p.id).sort()).toEqual([7, 9]);
  });

  it('never goes below zero, and removing the last counter forgets the project', async () => {
    const { store, fetchMock } = setup();
    const call = await connect(store, fetchMock);

    const low = await call('update_row_counter', { project_id: 7, action: 'subtract', amount: 5 });
    expect(low.counters[0]).toMatchObject({ value: 0 });
    await call('update_row_counter', { project_id: 7, action: 'remove' });
    expect(store.get('knitter', 7)).toBeUndefined();
  });

  it('shows an empty card for a project without counters', async () => {
    const { store, fetchMock } = setup();
    const call = await connect(store, fetchMock);
    const output = await call('get_row_counter', { project_id: 5 });
    expect(output).toMatchObject({ project: { id: 5, name: 'Project 5' }, counters: [] });
    expect(store.get('knitter', 5)).toBeUndefined();
  });

  it('stores counters encrypted, under a hashed owner', () => {
    const { db, store } = setup();
    store.save('Knitter', 7, {
      name: 'Secret Sweater',
      url: null,
      counters: [{ name: 'Rows', value: 3, target: null, repeat: null }],
    });
    const row = db.prepare('SELECT owner, data FROM row_counters').get() as {
      owner: string;
      data: string;
    };
    expect(row.owner).not.toContain('nitter');
    expect(row.data).not.toContain('Secret');
    expect(store.get('knitter', 7)?.name).toBe('Secret Sweater');
  });
});
