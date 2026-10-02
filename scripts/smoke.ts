// Live end-to-end check: spawns the built server over stdio and calls every
// tool against the real Ravelry API. Needs credentials in the environment or .env.
//
//   npm run build && npm run smoke
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const client = new Client({ name: 'ravelry-smoke-test', version: '1.0.0' });
await client.connect(
  new StdioClientTransport({
    command: process.execPath,
    args: ['--env-file-if-exists=.env', 'dist/index.js'],
    env: process.env as Record<string, string>,
    stderr: 'inherit',
  }),
);

async function call<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) throw new Error(`${name} failed: ${JSON.stringify(result.content)}`);
  return result.structuredContent as T;
}

interface Named {
  id: number;
  name: string;
}

try {
  const { tools } = await client.listTools();
  console.log('tools:', tools.map(tool => tool.name).join(', '));

  const search = await call<{ patterns: Named[]; total_results: number; category: string }>(
    'search_patterns',
    {
      category: 'hats',
      craft: 'knitting',
      weight: ['dk'],
      yardage_max: 250,
      difficulty_max: 3,
      sort: 'popularity',
      page_size: 3,
    },
  );
  console.log(
    `search_patterns: easy DK hats ≤250 yd (category ${search.category}): ` +
      `${search.total_results} results, first: ${search.patterns[0]?.name ?? 'none'}`,
  );

  for (const category of [
    'blanket',
    'toys',
    'amigurumi',
    'shawl',
    'jumper',
    'socks',
    'mittens',
    'baby blanket',
    'dishcloth',
    'sweaters',
    'xyzzy',
  ]) {
    const result = await client.callTool({
      name: 'search_patterns',
      arguments: { category, page_size: 1 },
    });
    const output = result.structuredContent as { category?: string } | undefined;
    console.log(
      `  category "${category}" →`,
      result.isError ? JSON.stringify(result.content) : output?.category,
    );
  }

  const details = await call<{ patterns: { name: string; yarn_weight: string }[] }>(
    'get_pattern_details',
    { ids: search.patterns.map(pattern => pattern.id) },
  );
  console.log(`get_pattern_details: ${details.patterns.map(p => p.name).join(' | ')}`);

  const yarns = await call<{ yarns: Named[]; total_results: number }>('search_yarns', {
    weight: ['dk'],
    fiber: ['merino'],
    attributes: ['superwash'],
    sort: 'rating',
    page_size: 3,
  });
  console.log(
    `search_yarns: ${yarns.total_results} superwash merino DK, top: ${yarns.yarns[0]?.name}`,
  );

  const yarnDetails = await call<{ yarns: { name: string; fibers: string[]; needles: string }[] }>(
    'get_yarn_details',
    { ids: yarns.yarns.map(yarn => yarn.id) },
  );
  for (const yarn of yarnDetails.yarns) {
    console.log(`get_yarn_details: ${yarn.name} — ${yarn.fibers.join(', ')} — ${yarn.needles}`);
  }

  const ideas = await call<{
    pattern: { name: string; yarn_weight: string };
    yarns: (Named & { weight: string; projects_using_it: number })[];
    total_yarns_used: number;
  }>('find_yarns_for_pattern', { pattern_id: 990044, same_weight_only: true, limit: 5 });
  console.log(
    `find_yarns_for_pattern: ${ideas.pattern.name} (${ideas.pattern.yarn_weight}), ` +
      `${ideas.total_yarns_used} yarns: ` +
      ideas.yarns.map(y => `${y.name} [${y.weight}] ×${y.projects_using_it}`).join(', '),
  );

  const shops = await call<{ shops: { name: string; distance: number }[]; total_results: number }>(
    'find_yarn_shops',
    { latitude: 48.8566, longitude: 2.3522, radius: 5, page_size: 3 },
  );
  console.log(
    `find_yarn_shops: ${shops.total_results} within 5 km of Paris: ` +
      shops.shops.map(s => `${s.name} (${s.distance} km)`).join(', '),
  );

  console.log('smoke test passed');
} finally {
  await client.close();
}
