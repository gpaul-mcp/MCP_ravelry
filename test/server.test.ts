import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RavelryClient } from '../src/ravelry/client.ts';
import type { ApiPattern, ApiPatternSearchResponse } from '../src/ravelry/types.ts';
import { createServer } from '../src/server.ts';
import { connect, routeFetch } from './helpers.ts';

const searchResponse: ApiPatternSearchResponse = {
  patterns: [
    {
      id: 101,
      name: 'Easy Beanie',
      permalink: 'easy-beanie',
      free: true,
      designer: { id: 1, name: 'Jane Knits', permalink: 'jane-knits' },
      first_photo: { medium_url: 'https://images.example/beanie.jpg' },
    },
  ],
  paginator: { page: 1, page_count: 3, page_size: 20, results: 55 },
};

const detailedPattern: ApiPattern = {
  id: 101,
  name: 'Easy Beanie',
  permalink: 'easy-beanie',
  free: true,
  craft: { name: 'Knitting' },
  pattern_categories: [
    {
      name: 'Beanie, Toque',
      parent: { name: 'Hat', parent: { name: 'Accessories', parent: { name: 'Categories' } } },
    },
  ],
  pattern_author: { id: 1, name: 'Jane Knits', permalink: 'jane-knits' },
  difficulty_average: 2.4615384615,
  rating_average: 4.815425940138143,
  rating_count: 120,
  yarn_weight_description: 'Worsted (9 wpi)',
  yardage: 180,
  yardage_max: 220,
  pattern_needle_sizes: [{ name: 'US 7 - 4.5 mm', metric: 4.5 }],
  languages: [{ name: 'English' }],
  notes: 'x'.repeat(5_000),
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('ravelry MCP server', () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
  let client: Client;
  let handler: ReturnType<typeof createMcpHandler>;

  beforeEach(async () => {
    fetchMock = vi.fn<typeof fetch>();
    const ravelry = new RavelryClient({ username: 'user', password: 'pass', fetch: fetchMock });
    handler = createMcpHandler(() => createServer(ravelry));

    client = new Client(
      { name: 'test-client', version: '1.0.0' },
      { versionNegotiation: { mode: 'auto' } },
    );
    await client.connect(
      new StreamableHTTPClientTransport(new URL('http://test.local/mcp'), {
        fetch: (url, init) => handler.fetch(new Request(url, init)),
      }),
    );
  });

  afterEach(async () => {
    await client.close();
    await handler.close();
  });

  it('lists read-only tools with schemas', async () => {
    const { tools } = await client.listTools();

    expect(tools.map(tool => tool.name).sort()).toEqual([
      'adjust_for_gauge',
      'count_stitches',
      'crafting_reference',
      'find_yarn_shops',
      'find_yarns_for_pattern',
      'get_pattern_details',
      'get_yarn_details',
      'match_yarns',
      'search_patterns',
      'search_yarns',
      'spread_evenly',
      'yarn_needed',
    ]);
    // Pure calculators never reach Ravelry; every other tool does.
    const offline = ['count_stitches', 'spread_evenly'];
    for (const tool of tools) {
      expect(tool.annotations).toMatchObject({
        readOnlyHint: true,
        openWorldHint: !offline.includes(tool.name),
      });
      expect(tool.outputSchema).toBeDefined();
    }
  });

  it('searches patterns with authenticated request and default filters', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(searchResponse));

    const result = await client.callTool({
      name: 'search_patterns',
      arguments: { query: 'beanie', craft: 'knitting' },
    });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      patterns: [
        {
          id: 101,
          name: 'Easy Beanie',
          url: 'https://www.ravelry.com/patterns/library/easy-beanie',
          free: true,
          designer: 'Jane Knits',
          photo_url: 'https://images.example/beanie.jpg',
        },
      ],
      category: null,
      attributes: [],
      page: 1,
      page_count: 3,
      total_results: 55,
    });

    const requestUrl = requestedUrl(fetchMock);
    const init = fetchMock.mock.calls[0]?.[1];
    expect(requestUrl.pathname).toBe('/patterns/search.json');
    expect(Object.fromEntries(requestUrl.searchParams)).toEqual({
      query: 'beanie',
      craft: 'knitting',
      availability: 'free',
      page: '1',
      page_size: '20',
    });
    expect(new Headers(init?.headers).get('Authorization')).toBe(
      `Basic ${Buffer.from('user:pass').toString('base64')}`,
    );
  });

  it('omits the availability filter when "any" is requested', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(searchResponse));

    await client.callTool({ name: 'search_patterns', arguments: { availability: 'any' } });

    const requestUrl = requestedUrl(fetchMock);
    expect(requestUrl.searchParams.has('availability')).toBe(false);
  });

  it('rejects invalid arguments before calling Ravelry', async () => {
    const result = await client.callTool({
      name: 'search_patterns',
      arguments: { page_size: 500 },
    });

    expect(result.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns curated details and reports missing ids', async () => {
    // Like Ravelry: one unknown id makes the whole batch 404, so it is split.
    fetchMock.mockImplementation(input => {
      const ids = new URL(input).searchParams.get('ids');
      return Promise.resolve(
        ids === '101'
          ? jsonResponse({ patterns: { '101': detailedPattern } })
          : jsonResponse({ error: '404 Not Found' }, 404),
      );
    });

    const result = await client.callTool({
      name: 'get_pattern_details',
      arguments: { ids: [101, 999, 101] },
    });

    expect(result.isError).toBeFalsy();
    const output = result.structuredContent as {
      patterns: Record<string, unknown>[];
      missing_ids: number[];
    };
    expect(output.missing_ids).toEqual([999]);
    expect(output.patterns[0]).toMatchObject({
      id: 101,
      designer: 'Jane Knits',
      craft: 'Knitting',
      categories: ['Accessories > Hat > Beanie, Toque'],
      yarn_weight: 'Worsted (9 wpi)',
      yardage: '180–220 yards',
      needles_or_hooks: ['US 7 - 4.5 mm'],
      price: null,
      difficulty: 2.5,
      rating: 4.82,
    });
    expect(String(output.patterns[0]?.notes)).toMatch(/… \[truncated\]$/);

    expect(
      fetchMock.mock.calls.map(([input]) => new URL(input as string).searchParams.get('ids')),
    ).toEqual(['101 999', '101', '999']);
  });

  it('turns Ravelry auth failures into an actionable tool error', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'unauthorized' }, 401));

    const result = await client.callTool({ name: 'get_pattern_details', arguments: { ids: [1] } });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('ravelry.com/pro/developer');
  });
});

function requestedUrl(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>, call = 0): URL {
  const input = fetchMock.mock.calls[call]?.[0];
  if (typeof input !== 'string') throw new Error(`fetch call ${call} did not use a string URL`);
  return new URL(input);
}

describe('interactive view (MCP Apps)', () => {
  it('links the main tools to the view and serves it with Ravelry image access', async () => {
    const { client, close } = await connect(routeFetch({}));
    try {
      const { tools } = await client.listTools();
      const withView = tools.filter(tool => {
        const ui = tool._meta?.ui as { resourceUri?: string } | undefined;
        return ui?.resourceUri === 'ui://ravelry/view.html';
      });
      expect(withView.map(tool => tool.name).sort()).toEqual([
        'find_yarn_shops',
        'find_yarns_for_pattern',
        'get_pattern_details',
        'get_yarn_details',
        'match_yarns',
        'search_patterns',
        'search_yarns',
      ]);

      const resource = await client.readResource({ uri: 'ui://ravelry/view.html' });
      const [content] = resource.contents;
      expect(content?.mimeType).toBe('text/html;profile=mcp-app');
      expect(content && 'text' in content ? content.text : '').toContain('<html');
      expect(content?._meta).toMatchObject({
        ui: { csp: { resourceDomains: ['https://*.ravelrycache.com'] } },
      });
    } finally {
      await close();
    }
  });
});
