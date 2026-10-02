import type { Client } from '@modelcontextprotocol/client';
import { afterEach, describe, expect, it } from 'vitest';

import type {
  ApiPattern,
  ApiPatternCategoryNode,
  ApiShopSearchResponse,
  ApiYarn,
  ApiYarnSearchResponse,
} from '../src/ravelry/types.ts';
import { connect, type FetchMock, requestedUrls, routeFetch } from './helpers.ts';

const categories: ApiPatternCategoryNode = {
  name: 'Categories',
  permalink: 'categories',
  children: [
    {
      name: 'Accessories',
      permalink: 'accessories',
      children: [{ name: 'Hat', permalink: 'hat', children: [] }],
    },
    {
      name: 'Toys and Hobbies',
      permalink: 'toysandhobbies',
      children: [{ name: 'Softies', permalink: 'softies' }],
    },
    { name: 'Pet', permalink: 'pet', children: [{ name: 'Toys', permalink: 'toys' }] },
  ],
};

const emptyPage = { page: 1, page_count: 1, page_size: 20, results: 0 };

const yarnSearch: ApiYarnSearchResponse = {
  yarns: [
    {
      id: 7,
      name: 'Rios ',
      permalink: 'malabrigo-yarn-rios',
      yarn_company_name: 'Malabrigo Yarn',
      yarn_weight: { name: 'Worsted' },
      yardage: 210,
      grams: 100,
      machine_washable: true,
      discontinued: false,
      rating_average: 4.7,
      rating_count: 9000,
      yarn_ideas_attributes: { projects_count: 296 },
    },
  ],
  paginator: { page: 1, page_count: 1, page_size: 20, results: 1 },
};

const fullYarn: ApiYarn = {
  ...yarnSearch.yarns[0]!,
  yarn_company: { name: 'Malabrigo Yarn' },
  yarn_fibers: [{ percentage: 100, fiber_type: { name: 'Merino' } }],
  yarn_attributes: [{ name: 'Superwash' }, { name: 'Hand dyed' }],
  yarn_provenance: [{ phase_name: 'Dyed', country_name: 'Uruguay' }],
  min_needle_size: { name: 'US 7  - 4.5 mm', metric: 4.5 },
  max_needle_size: { name: 'US 9  - 5.5 mm', metric: 5.5 },
  min_gauge: 18,
  max_gauge: 20,
  gauge_divisor: 4,
  notes_html: '<p>Soft &amp; <b>squishy</b></p>',
};

const pattern: ApiPattern = {
  id: 990044,
  name: 'Musselburgh',
  permalink: 'musselburgh',
  free: false,
  yarn_weight: { name: 'Fingering' },
  yarn_weight_description: 'Fingering (14 wpi)',
  yardage_description: '400 yards',
  gauge_description: '28 stitches = 4 inches',
  packs: [
    { yarn_name: 'Neighborhood Fiber Co. Studio Sock' },
    { yarn_name: 'Neighborhood Fiber Co. Studio Sock' },
  ],
};

let session: Awaited<ReturnType<typeof connect>> | undefined;

async function start(fetchMock: FetchMock): Promise<Client> {
  session = await connect(fetchMock);
  return session.client;
}

afterEach(async () => {
  await session?.close();
  session = undefined;
});

describe('search_patterns filters', () => {
  it('resolves the category and maps every filter to Ravelry parameters', async () => {
    const fetchMock = routeFetch({
      '/pattern_categories/list.json': { pattern_categories: categories },
      '/patterns/search.json': { patterns: [], paginator: emptyPage },
    });
    const client = await start(fetchMock);

    const result = await client.callTool({
      name: 'search_patterns',
      arguments: {
        category: 'Hats',
        weight: ['dk', 'sport'],
        yardage_max: 250,
        difficulty_max: 3,
        fit: ['baby'],
        language: 'fr',
        designer: 'Ysolda Teague',
      },
    });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ category: 'hat' });
    const search = requestedUrls(fetchMock).find(url => url.pathname === '/patterns/search.json');
    expect(Object.fromEntries(search!.searchParams)).toMatchObject({
      pc: 'hat',
      weight: 'dk|sport',
      yardage: '|250',
      diff: '|3',
      fit: 'baby',
      language: 'fr',
      designer: 'Ysolda Teague',
      availability: 'free',
    });
  });

  it('maps everyday words through aliases ("toys" is not Pet > Toys)', async () => {
    const fetchMock = routeFetch({
      '/pattern_categories/list.json': { pattern_categories: categories },
      '/patterns/search.json': { patterns: [], paginator: emptyPage },
    });
    const client = await start(fetchMock);

    const result = await client.callTool({
      name: 'search_patterns',
      arguments: { category: 'toys' },
    });

    expect(result.structuredContent).toMatchObject({ category: 'toysandhobbies' });
  });

  it('caches the category list between calls', async () => {
    const fetchMock = routeFetch({
      '/pattern_categories/list.json': { pattern_categories: categories },
      '/patterns/search.json': { patterns: [], paginator: emptyPage },
    });
    const client = await start(fetchMock);

    await client.callTool({ name: 'search_patterns', arguments: { category: 'hat' } });
    await client.callTool({ name: 'search_patterns', arguments: { category: 'hat' } });

    const listCalls = requestedUrls(fetchMock).filter(
      url => url.pathname === '/pattern_categories/list.json',
    );
    expect(listCalls).toHaveLength(1);
  });

  it('rejects an unknown category without searching', async () => {
    const fetchMock = routeFetch({
      '/pattern_categories/list.json': { pattern_categories: categories },
    });
    const client = await start(fetchMock);

    const result = await client.callTool({
      name: 'search_patterns',
      arguments: { category: 'spaceship' },
    });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('Unknown pattern category');
    expect(requestedUrls(fetchMock).map(url => url.pathname)).toEqual([
      '/pattern_categories/list.json',
    ]);
  });

  it('rejects an inverted yardage range', async () => {
    const client = await start(routeFetch({}));

    const result = await client.callTool({
      name: 'search_patterns',
      arguments: { yardage_min: 500, yardage_max: 100 },
    });

    expect(result.isError).toBe(true);
  });
});

describe('yarn tools', () => {
  it('search_yarns maps filters and hides discontinued yarns by default', async () => {
    const fetchMock = routeFetch({ '/yarns/search.json': yarnSearch });
    const client = await start(fetchMock);

    const result = await client.callTool({
      name: 'search_yarns',
      arguments: { weight: ['worsted'], fiber: ['merino', 'silk'], attributes: ['superwash'] },
    });

    expect(result.structuredContent).toMatchObject({
      yarns: [
        {
          id: 7,
          name: 'Rios',
          company: 'Malabrigo Yarn',
          url: 'https://www.ravelry.com/yarns/library/malabrigo-yarn-rios',
          yards_per_skein: 210,
          machine_washable: true,
        },
      ],
      total_results: 1,
    });
    const [url] = requestedUrls(fetchMock);
    expect(Object.fromEntries(url!.searchParams)).toMatchObject({
      weight: 'worsted',
      fiber: 'merino|silk',
      ya: 'superwash',
      discontinued: 'no',
      sort: 'best',
    });
  });

  it('get_yarn_details summarizes fibers, needles, gauge, origin and notes', async () => {
    const fetchMock = routeFetch({ '/yarns.json': { yarns: { '7': fullYarn } } });
    const client = await start(fetchMock);

    const result = await client.callTool({ name: 'get_yarn_details', arguments: { ids: [7, 8] } });

    expect(result.structuredContent).toMatchObject({
      yarns: [
        {
          fibers: ['100% Merino'],
          attributes: ['Superwash', 'Hand dyed'],
          needles: 'US 7 - 4.5 mm to US 9 - 5.5 mm',
          gauge: '18–20 stitches = 4 in',
          origin: ['Dyed: Uruguay'],
          notes: 'Soft & squishy',
        },
      ],
      missing_ids: [8],
    });
    expect(requestedUrls(fetchMock)[0]!.searchParams.get('ids')).toBe('7 8');
  });
});

describe('find_yarns_for_pattern', () => {
  it('returns the yarns people used, with the pattern requirements', async () => {
    const fetchMock = routeFetch({
      '/patterns.json': { patterns: { '990044': pattern } },
      '/yarns/search.json': yarnSearch,
    });
    const client = await start(fetchMock);

    const result = await client.callTool({
      name: 'find_yarns_for_pattern',
      arguments: { pattern_id: 990044, same_weight_only: true },
    });

    expect(result.structuredContent).toMatchObject({
      pattern: {
        name: 'Musselburgh',
        yarn_weight: 'Fingering (14 wpi)',
        yardage: '400 yards',
        designer_suggested_yarns: ['Neighborhood Fiber Co. Studio Sock'],
      },
      yarns: [{ name: 'Rios', projects_using_it: 296 }],
      total_yarns_used: 1,
    });
    const search = requestedUrls(fetchMock).find(url => url.pathname === '/yarns/search.json');
    expect(Object.fromEntries(search!.searchParams)).toMatchObject({
      'yarn-ideas-for': 'musselburgh',
      include: 'yarn_ideas_attributes',
      weight: 'fingering',
      discontinued: 'no',
      page_size: '15',
    });
  });

  it('reports an unknown pattern as a tool error', async () => {
    const client = await start(routeFetch({ '/patterns.json': { patterns: {} } }));

    const result = await client.callTool({
      name: 'find_yarns_for_pattern',
      arguments: { pattern_id: 1 },
    });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('No pattern with id 1');
  });
});

describe('find_yarn_shops', () => {
  const shops: ApiShopSearchResponse = {
    shops: [
      {
        id: 1,
        name: ' Loop ',
        permalink: 'loop',
        location: '15 Camden Passage, London',
        city: 'London',
        country: { name: 'United Kingdom' },
        url: 'https://loopknitting.com',
        phone: '',
        distance: 1.234,
      },
      { id: 2, name: 'Gone', permalink: 'gone', closed: true },
    ],
    paginator: { page: 1, page_count: 1, page_size: 20, results: 2 },
  };

  it('searches around coordinates and drops closed shops', async () => {
    const fetchMock = routeFetch({ '/shops/search.json': shops });
    const client = await start(fetchMock);

    const result = await client.callTool({
      name: 'find_yarn_shops',
      arguments: { latitude: 51.5, longitude: -0.12, radius: 5, units: 'miles' },
    });

    expect(result.structuredContent).toMatchObject({
      shops: [
        {
          name: 'Loop',
          city: 'London',
          distance: 1.2,
          phone: null,
          website: 'https://loopknitting.com',
          ravelry_url: 'https://www.ravelry.com/shops/loop',
        },
      ],
      units: 'miles',
    });
    expect((result.structuredContent as { shops: unknown[] }).shops).toHaveLength(1);
    expect(Object.fromEntries(requestedUrls(fetchMock)[0]!.searchParams)).toMatchObject({
      lat: '51.5',
      lng: '-0.12',
      radius: '5',
      units: 'miles',
    });
  });

  it('requires a query or coordinates', async () => {
    const fetchMock = routeFetch({});
    const client = await start(fetchMock);

    const result = await client.callTool({ name: 'find_yarn_shops', arguments: {} });

    expect(result.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
