// Live check of the personal tools against a real Ravelry account, through a
// real MCP client. Creates a test yarn and project, logs progress, finishes it,
// edits and deletes the yarn, then removes everything it created.
//
// Runs where the sign-in database lives (the server), e.g.:
//   RAVELRY_ACCOUNT=<username> DATA_DIR=/app/data node scripts/live-account-check.ts
import { join } from 'node:path';

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';

import { setupAccounts } from '../src/account/setup.ts';
import { openDatabase } from '../src/auth/db.ts';
import { loadConfig } from '../src/config.ts';
import { RavelryClient } from '../src/ravelry/client.ts';

const config = loadConfig({ ...process.env, MCP_TRANSPORT: 'http' });
if (!config.account) throw new Error('RAVELRY_OAUTH_CLIENT_ID / _SECRET are not set');
const username = process.env.RAVELRY_ACCOUNT;
if (!username) throw new Error('Set RAVELRY_ACCOUNT to the Ravelry username to test with');

const databasePath = join(config.account.dataDir, 'ravelry-mcp.db');
const row = openDatabase(databasePath)
  .prepare('SELECT account_id FROM ravelry_accounts WHERE username = ?')
  .get(username) as { account_id: string } | undefined;
if (!row) throw new Error(`${username} has not signed in on this server`);

const publicRavelry = new RavelryClient({
  username: config.ravelryUsername,
  password: config.ravelryPassword,
});
const accounts = setupAccounts({
  config: config.account,
  publicRavelry,
  trustProxy: false,
  requestTimeoutMs: 20_000,
  userAgent: 'ravelry-mcp-live-check',
  databasePath,
});
const handler = createMcpHandler(accounts.factory);
const authInfo = {
  token: 'live-check',
  clientId: 'live-check',
  scopes: ['ravelry:read', 'ravelry:write'],
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
  extra: { accountId: row.account_id },
};
const client = new Client(
  { name: 'live-check', version: '1.0.0' },
  { versionNegotiation: { mode: 'auto' } },
);
await client.connect(
  new StreamableHTTPClientTransport(new URL('http://live-check/account/mcp'), {
    fetch: (url, init) => handler.fetch(new Request(url, init), { authInfo }),
  }),
);

async function call<T = Record<string, unknown>>(
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) throw new Error(`${name}: ${JSON.stringify(result.content)}`);
  return result.structuredContent as T;
}

interface Stash {
  stash: {
    id: number;
    yarn: string;
    yards: number | null;
    total_yards: number | null;
    status: string | null;
    in_projects: unknown[];
  }[];
}
const find = (stash: Stash, id: number) => stash.stash.find(entry => entry.id === id);
const check = (label: string, ok: boolean, detail: unknown) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  ${JSON.stringify(detail)}`);
  if (!ok) process.exitCode = 1;
};

let stashId: number | undefined;
let projectId: number | undefined;
const extraProjects: number[] = [];
try {
  // Cascade 220 (yarn 523): 3 skeins x 220 yd.
  const added = await call<{ added: { stash_id: number }[] }>('add_to_my_stash', {
    entries: [{ yarn_id: 523, colorway: 'MCP live check', skeins: 3, location: 'test' }],
    allow_duplicates: true,
  });
  stashId = added.added[0]?.stash_id;
  check('add_to_my_stash', !!stashId, added);

  let stash = await call<Stash>('get_my_stash', { search: 'MCP live check' });
  check('stash shows 660 yd free', find(stash, stashId!)?.yards === 660, find(stash, stashId!));

  const started = await call<{ id: number; yarn: { yards: number | null }[]; log: string }>(
    'start_project',
    {
      pattern_id: 990044,
      name: 'MCP live check project',
      yarn: [{ stash_id: stashId, yards: 200 }],
      note: 'Cast on 120 stitches.',
    },
  );
  projectId = started.id;
  check('start_project sets 200 yd aside', started.yarn[0]?.yards === 200, started);

  stash = await call<Stash>('get_my_stash', { search: 'MCP live check' });
  check(
    'stash now 460 yd free of 660',
    find(stash, stashId!)?.yards === 460 && find(stash, stashId!)?.total_yards === 660,
    find(stash, stashId!),
  );

  const logged = await call<{ progress: number; log: string; yarn: { yards: number | null }[] }>(
    'log_project_progress',
    {
      project_id: projectId,
      note: 'Row 42 of the brim',
      progress: 40,
      yarn_used: [{ stash_id: stashId, yards: 250 }],
    },
  );
  check(
    'log_project_progress',
    logged.progress === 40 && logged.log.includes('Row 42') && logged.yarn[0]?.yards === 250,
    logged,
  );

  stash = await call<Stash>('get_my_stash', { search: 'MCP live check' });
  check('stash now 410 yd free', find(stash, stashId!)?.yards === 410, find(stash, stashId!));

  const picked = await call<{ candidates: unknown[] }>('pick_from_my_queue', {});
  check('pick_from_my_queue still works', Array.isArray(picked.candidates), picked);

  const finished = await call<{ status: string; progress: number; marked_used_up: number[] }>(
    'update_project_status',
    {
      project_id: projectId,
      status: 'finished',
      yarn_used: [{ stash_id: stashId, yards: 300 }],
      note: 'Blocked and done',
    },
  );
  check(
    'finished, leftovers kept',
    finished.status === 'Finished' &&
      finished.progress === 100 &&
      finished.marked_used_up.length === 0,
    finished,
  );

  stash = await call<Stash>('get_my_stash', { search: 'MCP live check' });
  check('360 yd left after finishing', find(stash, stashId!)?.yards === 360, find(stash, stashId!));

  const updated = await call<{ stash: { location: string | null; status: string | null } }>(
    'update_stash_entry',
    {
      stash_id: stashId,
      location: 'Blue box',
      status: 'will-trade',
    },
  );
  check(
    'update_stash_entry',
    updated.stash.location === 'Blue box' && /trade/i.test(updated.stash.status ?? ''),
    updated,
  );

  const project = await call<{ log: string }>('get_my_project', { project_id: projectId });
  check('get_my_project log', project.log.split('\n').length >= 3, project.log);

  // Frogging gives the yarn back to the stash.
  const frogProject = await call<{ id: number }>('start_project', {
    name: 'MCP live check frog',
    craft: 'knitting',
    yarn: [{ stash_id: stashId, yards: 360 }],
  });
  extraProjects.push(frogProject.id);
  stash = await call<Stash>('get_my_stash', { search: 'MCP live check' });
  check('all 360 yd set aside', (find(stash, stashId!)?.yards ?? 0) <= 0, find(stash, stashId!));
  const frogged = await call<{ status: string; released_yarn: boolean }>('update_project_status', {
    project_id: frogProject.id,
    status: 'frogged',
  });
  check(
    'frogged releases the yarn',
    frogged.status === 'Frogged' && frogged.released_yarn,
    frogged,
  );
  stash = await call<Stash>('get_my_stash', { search: 'MCP live check' });
  check('360 yd free again', find(stash, stashId!)?.yards === 360, find(stash, stashId!));

  // Finishing with every yard used marks the yarn used up (and hides it from the stash).
  const lastProject = await call<{ id: number }>('start_project', {
    name: 'MCP live check used up',
    craft: 'crochet',
    yarn: [{ stash_id: stashId, yards: 360 }],
  });
  extraProjects.push(lastProject.id);
  const done = await call<{ marked_used_up: number[] }>('update_project_status', {
    project_id: lastProject.id,
    status: 'finished',
  });
  check('empty yarn marked used up', done.marked_used_up.includes(stashId!), done);
  stash = await call<Stash>('get_my_stash', { search: 'MCP live check' });
  check('used-up yarn no longer listed', !find(stash, stashId!), stash.stash.length);
} finally {
  // Clean up directly with the user's sign-in: there is deliberately no "delete project" tool.
  const ravelry = new RavelryClient({
    authorization: async () => `Bearer ${await accounts.store.accessToken(row.account_id)}`,
  });
  for (const id of [projectId, ...extraProjects]) {
    if (!id) continue;
    await ravelry.deleteProject(username, id).then(
      () => {
        console.log('cleanup project: deleted');
      },
      (error: unknown) => {
        console.log('cleanup project failed:', String(error));
      },
    );
  }
  if (stashId) {
    const removed = await client.callTool({
      name: 'remove_from_stash',
      arguments: { stash_ids: [stashId] },
    });
    console.log('cleanup stash', JSON.stringify(removed.structuredContent));
  }
  await client.close();
  await handler.close();
  accounts.close();
}
