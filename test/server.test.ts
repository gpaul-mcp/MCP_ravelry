import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RavelryClient } from '../src/ravelry/client.ts';
import type { ApiPattern, ApiPatternSearchResponse } from '../src/ravelry/types.ts';
import { createServer } from '../src/server.ts';

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
  difficulty_average: 2.5,
  rating_average: 4.8,
  rating_count: 120,
  yarn_weight_description: 'Worsted (9 wpi)',
  yardage: 180,
  yardage_max: 220,
  pattern_needle_sizes: [{ name: 'US 7 - 4.5 mm' }],
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
      'find_yarn_shops',
      'find_yarns_for_pattern',
      'get_pattern_details',
      'get_yarn_details',
      'search_patterns',
      'search_yarns',
    ]);
    for (const tool of tools) {
      expect(tool.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: true });
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
    fetchMock.mockResolvedValueOnce(jsonResponse({ patterns: { '101': detailedPattern } }));

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
    });
    expect(String(output.patterns[0]?.notes)).toMatch(/… \[truncated\]$/);

    const requestUrl = requestedUrl(fetchMock);
    expect(requestUrl.pathname).toBe('/patterns.json');
    expect(requestUrl.searchParams.get('ids')).toBe('101 999');
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
