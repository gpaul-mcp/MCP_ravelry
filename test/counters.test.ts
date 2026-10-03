import { randomBytes } from 'node:crypto';

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CounterStore } from '../src/account/counters.ts';
import { PreferenceStore } from '../src/account/preferences.ts';
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
  const key = randomBytes(32);
  const store = new CounterStore(db, key);
  const preferences = new PreferenceStore(db, key);
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
  return { db, store, preferences, fetchMock };
}

async function connect(
  store: CounterStore,
  fetchMock: typeof fetch,
  preferences?: PreferenceStore,
  capabilities: Record<string, unknown> = {},
) {
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
      preferences,
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
    { versionNegotiation: { mode: 'auto' }, capabilities },
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
  const raw = (name: string, args: Record<string, unknown>) =>
    client.callTool({ name, arguments: args });
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await raw(name, args);
    if (result.isError) throw new Error(JSON.stringify(result.content));
    return result.structuredContent as {
      project: { id: number | null; name: string } | null;
      counters: Record<string, unknown>[];
      other_projects: { id: number; summary: string }[];
    };
  };
  return Object.assign(call, { raw, instructions: () => client.getInstructions() });
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

  it('keeps counters for things that are not Ravelry projects, found by name', async () => {
    const { store, fetchMock } = setup();
    const call = await connect(store, fetchMock);

    const empty = await call('get_row_counter', { project_name: 'Onigiri Pouch' });
    expect(empty).toMatchObject({ project: { id: null, name: 'Onigiri Pouch' }, counters: [] });

    const first = await call('update_row_counter', { project_name: 'Onigiri Pouch', amount: 5 });
    const second = await call('update_row_counter', { project_name: 'onigiri pouch' });
    const other = await call('update_row_counter', { project_name: 'Scarf', action: 'configure' });

    expect(first.project?.id).toBe(-1);
    expect(second).toMatchObject({ project: { id: -1 }, counters: [{ name: 'Rows', value: 6 }] });
    expect(other.project?.id).toBe(-2);
    // Never looked up on Ravelry.
    expect(fetchMock).not.toHaveBeenCalled();

    const byId = await call('update_row_counter', { project_id: -1, action: 'subtract' });
    expect(byId.counters[0]).toMatchObject({ value: 5 });
  });

  it('asks the model not to repeat what the widget shows, only for clients with widgets', async () => {
    const { store, fetchMock } = setup();
    const plain = await connect(store, fetchMock);
    expect((await plain.raw('get_row_counter', {})).content).toHaveLength(1);
    await cleanup?.();

    const withWidgets = await connect(store, fetchMock, undefined, {
      extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } },
    });
    const content = (await withWidgets.raw('get_row_counter', {})).content as { text: string }[];
    expect(content).toHaveLength(2);
    expect(content[1]?.text).toMatch(/Do not repeat the numbers/);
  });

  it('remembers the units and tells the model', async () => {
    const { store, preferences, fetchMock } = setup();
    const first = await connect(store, fetchMock, preferences);
    expect(first.instructions()).toMatch(/has not chosen units yet/);
    await first.raw('set_my_preferences', { units: 'metric' });
    await cleanup?.();

    const next = await connect(store, fetchMock, preferences);
    expect(next.instructions()).toMatch(/METRIC/);
    expect(preferences.get('knitter')).toEqual({ units: 'metric' });
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
