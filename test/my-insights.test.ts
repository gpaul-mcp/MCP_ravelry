import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RavelryClient } from '../src/ravelry/client.ts';
import type { ApiPattern, ApiProject, ApiProjectFull, ApiStash } from '../src/ravelry/types.ts';
import { createServer } from '../src/server.ts';
import { jsonResponse } from './helpers.ts';

const page = (results: number) => ({ page: 1, page_count: 1, page_size: 100, results });

const patterns: ApiPattern[] = [
  { id: 1, name: 'Hat A', permalink: 'hat-a', free: true, yardage: 200, difficulty_average: 2 },
  { id: 2, name: 'Cowl B', permalink: 'cowl-b', free: true, yardage: 400, difficulty_average: 3 },
  { id: 3, name: 'Shawl C', permalink: 'shawl-c', free: true, yardage: 300 },
  {
    id: 10,
    name: 'Big Sweater',
    permalink: 'big-sweater',
    free: false,
    yardage: 600,
    yardage_max: 900,
    yarn_weight: { name: 'Worsted' },
  },
  {
    id: 11,
    name: 'Worsted Hat',
    permalink: 'worsted-hat',
    free: true,
    yardage: 200,
    yarn_weight: { name: 'Worsted' },
  },
  {
    id: 12,
    name: 'Worsted Cowl',
    permalink: 'worsted-cowl',
    free: true,
    yardage: 250,
    yarn_weight: { name: 'Worsted' },
    craft: { name: 'Knitting' },
    pattern_attributes: [{ id: 1, permalink: 'in-the-round' }],
    pattern_needle_sizes: [
      { name: 'US 7 - 4.5 mm', metric: 4.5 },
      { name: 'US 8 - 5.0 mm', metric: 5 },
    ],
  },
  {
    id: 20,
    name: 'Cable Hat',
    permalink: 'cable-hat',
    free: true,
    difficulty_average: 3.5,
    pattern_attributes: [{ id: 2, permalink: 'cables' }],
  },
];

const projects: ApiProject[] = [
  {
    id: 101,
    name: 'Hat A',
    permalink: 'hat-a',
    pattern_id: 1,
    status_name: 'Finished',
    craft_name: 'Knitting',
    started: '2025/01/01',
    completed: '2025/01/11',
  },
  {
    id: 102,
    name: 'Cowl B',
    permalink: 'cowl-b',
    pattern_id: 2,
    status_name: 'Finished',
    craft_name: 'Knitting',
    started: '2025/02/01',
    completed: '2025/02/21',
  },
  {
    id: 103,
    name: 'Shawl C',
    permalink: 'shawl-c',
    pattern_id: 3,
    status_name: 'Finished',
    craft_name: 'Knitting',
    started: '2025/03/01',
    completed: '2025/03/11',
  },
  {
    id: 104,
    name: 'Sweater in progress',
    permalink: 'sweater',
    pattern_id: 10,
    status_name: 'In progress',
    craft_name: 'Knitting',
    progress: 50,
  },
];

const stash: ApiStash[] = [
  {
    id: 1,
    name: 'Worsted stash',
    personal_yarn_weight: { name: 'Worsted' },
    primary_pack: { total_yards: 300 },
    created_at: '2019/05/01 10:00:00 -0400',
  },
];

function fakeRavelry() {
  return vi.fn<typeof fetch>(input => {
    const url = new URL(input);
    const path = url.pathname;
    const project = /^\/projects\/knitter\/(\d+)\.json$/.exec(path);
    let body: unknown;
    if (path === '/projects/knitter/list.json') body = { projects, paginator: page(4) };
    else if (project) {
      const found = projects.find(p => p.id === Number(project[1]));
      // Yarn used: the hat and cowl recorded theirs; the shawl did not (pattern yardage is used).
      const yards = { 101: 200, 102: 400 }[found?.id ?? 0];
      body = {
        project: {
          ...found,
          packs: yards ? [{ id: 1, total_yards: yards }] : [],
        } as ApiProjectFull,
      };
    } else if (path === '/patterns.json') {
      const ids = (url.searchParams.get('ids') ?? '').split(' ').map(Number);
      body = {
        patterns: Object.fromEntries(patterns.filter(p => ids.includes(p.id)).map(p => [p.id, p])),
      };
    } else if (path === '/people/knitter/queue/list.json') {
      body = {
        queued_projects: [
          { id: 1, pattern_id: 11, pattern_name: 'Worsted Hat', created_at: '2026/09/01' },
          { id: 2, pattern_id: 11, pattern_name: 'Worsted Hat', created_at: '2026/09/02' },
          { id: 3, pattern_id: 1, pattern_name: 'Hat A', created_at: '2020/01/01' },
        ],
        paginator: page(3),
      };
    } else if (path === '/people/knitter/stash/list.json') body = { stash, paginator: page(1) };
    else if (path === '/people/knitter/stash/1.json') body = { stash: stash[0] };
    else if (path === '/people/knitter/favorites/list.json') {
      body = { favorites: [{ id: 1, type: 'pattern', favorited: { id: 3 } }], paginator: page(1) };
    } else if (path === '/people/knitter/needles/list.json') {
      body = {
        needle_records: [
          { id: 1, needle_type: { id: 1, metric_name: '4.5', type_name: 'straight', length: 10 } },
          { id: 2, needle_type: { id: 2, metric_name: '5', type_name: 'circular', length: 16 } },
        ],
      };
    } else if (path === '/patterns/search.json') {
      body = {
        patterns: [
          { id: 1, name: 'Hat A', permalink: 'hat-a', free: true },
          { id: 20, name: 'Cable Hat', permalink: 'cable-hat', free: true },
        ],
        paginator: page(2),
      };
    }
    return Promise.resolve(body === undefined ? jsonResponse({}, 404) : jsonResponse(body));
  });
}

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

async function connect(fetchMock: typeof fetch) {
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
  return client;
}

async function call(name: string, args: Record<string, unknown>) {
  const fetchMock = fakeRavelry();
  const client = await connect(fetchMock);
  const result = await client.callTool({ name, arguments: args });
  return { result, output: result.structuredContent as Record<string, unknown>, fetchMock };
}

describe('personal planning tools', () => {
  it('predicts a finish date from the user pace and checks a deadline', async () => {
    // Paces: 200 yd / 10 d = 20, 400 / 20 = 20, 300 (pattern) / 10 = 30 → median 20.
    const { result, output } = await call('estimate_finish_date', {
      pattern_id: 10,
      start: '2026-01-01',
      deadline: '2026-01-21',
    });
    expect(result.isError).toBeFalsy();
    expect(output).toMatchObject({
      what: 'Big Sweater',
      yards_to_go: 600,
      pace: { yards_per_day: 20, slow: 20, fast: 25, based_on: 3 },
      estimate: { days: 30, finish_date: '2026-01-31' },
      deadline: { days_available: 20, yards_per_day_needed: 30, verdict: 'unlikely' },
    });
  });

  it('counts only what is left of a project in progress', async () => {
    const { output } = await call('estimate_finish_date', { project_id: 104, start: '2026-01-01' });
    expect(output).toMatchObject({ what: 'Sweater in progress', yards_to_go: 300 });
  });

  it('spends each stash yard once when building a shopping list', async () => {
    const { output } = await call('plan_yarn_shopping', { pattern_ids: [11, 12] });
    expect(output).toMatchObject({
      patterns: [
        { pattern: 'Worsted Hat', yards_needed: 200, yards_to_buy: 0 },
        { pattern: 'Worsted Cowl', yards_needed: 250, yards_to_buy: 150 },
      ],
      to_buy_by_weight: [{ weight: 'worsted', yards: 165 }],
    });
  });

  it('finds duplicates, patterns already made and old entries in the queue', async () => {
    const { output } = await call('review_my_queue', {});
    expect(output).toMatchObject({
      queue_size: 3,
      duplicates: [{ queued_id: 2, pattern: 'Worsted Hat' }],
      already_made: [{ queued_id: 3, pattern: 'Hat A', status: 'Finished' }],
      stale: [{ queued_id: 3 }],
      total_yards: 600,
    });
  });

  it('audits the stash against how the user crafts', async () => {
    const { output } = await call('audit_my_stash', {});
    expect(output).toMatchObject({
      entries: 1,
      total_yards: 300,
      oldest: [{ stash_id: 1, added: '2019-05-01' }],
      weights: [{ weight: 'worsted', stash_yards: 300, queued_patterns: 1 }],
      unplanned: [],
    });
  });

  it('finds patterns to learn a skill, leaving out what the user already knows', async () => {
    const { output, fetchMock } = await call('discover_patterns_for_me', {
      goal: 'learn_a_skill',
      skill: 'cables',
    });
    expect(output).toMatchObject({
      skill: 'cables',
      patterns: [{ id: 20, name: 'Cable Hat', difficulty: 3.5 }],
    });
    const search = fetchMock.mock.calls
      .map(([input]) => new URL(input as string))
      .find(url => url.pathname === '/patterns/search.json');
    expect(search?.searchParams.get('pa')).toBe('cables');
    expect(search?.searchParams.get('craft')).toBe('knitting');
  });

  it('checks owned needles against a pattern worked in the round', async () => {
    const { output } = await call('get_my_needles', { pattern_id: 12 });
    expect(output).toMatchObject({
      needles: [
        { mm: 4.5, type: 'straight', length_cm: 25 },
        { mm: 5, type: 'circular', length_cm: 41 },
      ],
      pattern: { in_the_round: true, missing: ['US 7 - 4.5 mm'] },
    });
  });
});
