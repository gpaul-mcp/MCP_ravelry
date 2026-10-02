import { randomUUID } from 'node:crypto';
import { createServer as createNetServer } from 'node:net';

import {
  Client,
  type OAuthClientMetadata,
  type OAuthClientProvider,
  type OAuthDiscoveryState,
  type StoredOAuthClientInformation,
  type StoredOAuthTokens,
  StreamableHTTPClientTransport,
  UnauthorizedError,
} from '@modelcontextprotocol/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setupAccounts } from '../src/account/setup.ts';
import { serveHttp } from '../src/http.ts';
import { RavelryClient } from '../src/ravelry/client.ts';
import type { ApiPattern, ApiQueueResponse, ApiStashListResponse } from '../src/ravelry/types.ts';
import { createServer } from '../src/server.ts';
import { jsonResponse } from './helpers.ts';

const REDIRECT_URI = 'http://127.0.0.1:9/callback';

const stash: ApiStashListResponse = {
  stash: [
    {
      id: 1,
      colorway_name: 'Teal',
      yarn: {
        id: 7,
        name: 'Rios',
        permalink: 'malabrigo-yarn-rios',
        yarn_company_name: 'Malabrigo Yarn',
        yarn_weight: { name: 'Worsted' },
        yardage: 210,
      },
      primary_pack: { skeins: 2, total_yards: 420 },
    },
    {
      id: 2,
      name: 'Mystery DK',
      personal_yarn_weight: { name: 'DK' },
      primary_pack: { skeins: 1, total_meters: 200 },
    },
    { id: 3, name: 'Old leftovers', stash_status: { name: 'Used up' } },
  ],
  paginator: { page: 1, page_count: 1, page_size: 100, results: 3 },
};

const queue: ApiQueueResponse = {
  queued_projects: [
    { id: 10, pattern_id: '500', pattern_name: 'Big Sweater', position_in_queue: 1 },
    {
      id: 11,
      pattern_id: 501,
      pattern_name: 'Worsted Hat',
      position_in_queue: 2,
      yarn_id: 7,
      yarn_name: 'Rios',
    },
  ],
  paginator: { page: 1, page_count: 1, page_size: 15, results: 2 },
};

const queuedPatterns: Record<string, ApiPattern> = {
  '502': { id: 502, name: 'New Cowl', permalink: 'new-cowl', free: true },
  '500': {
    id: 500,
    name: 'Big Sweater',
    permalink: 'big-sweater',
    free: true,
    yarn_weight: { name: 'Worsted' },
    yardage: 1200,
    yardage_max: 1800,
  },
  '501': {
    id: 501,
    name: 'Worsted Hat',
    permalink: 'worsted-hat',
    free: true,
    yarn_weight: { name: 'Worsted' },
    yardage: 180,
    yardage_max: 220,
  },
};

/** Fake Ravelry: its OAuth endpoints, and the API checked against the user's token. */
function fakeRavelry() {
  return vi.fn<typeof fetch>((input, init) =>
    Promise.resolve(route(new URL(input as string), init)),
  );
}

function route(url: URL, init: RequestInit | undefined): Response {
  const authorization = new Headers(init?.headers).get('Authorization') ?? '';

  if (url.href === 'https://www.ravelry.com/oauth2/token') {
    const body = new URLSearchParams(typeof init?.body === 'string' ? init.body : '');
    if (authorization !== `Basic ${Buffer.from('cid:csecret').toString('base64')}`) {
      return jsonResponse({ error: 'invalid_client' }, 401);
    }
    if (body.get('grant_type') === 'authorization_code' && body.get('code') === 'ravelry-code') {
      return jsonResponse({
        access_token: 'user-token',
        refresh_token: 'user-refresh',
        expires_in: 86400,
      });
    }
    return jsonResponse({ error: 'invalid_grant' }, 400);
  }

  const personal = url.pathname.startsWith('/people/') || url.pathname === '/current_user.json';
  if (personal && authorization !== 'Bearer user-token') return jsonResponse({}, 403);

  switch (url.pathname) {
    case '/current_user.json':
      return jsonResponse({ user: { id: 42, username: 'knitter' } });
    case '/people/knitter/stash/list.json':
      return jsonResponse(stash);
    case '/people/knitter/queue/list.json': {
      const patternId = url.searchParams.get('pattern_id');
      const items = queue.queued_projects.filter(
        item => !patternId || String(item.pattern_id) === patternId,
      );
      return jsonResponse({
        ...queue,
        queued_projects: items,
        paginator: { ...queue.paginator, results: items.length },
      });
    }
    case '/people/knitter/stash/create.json': {
      const body = JSON.parse(init?.body as string) as {
        pack?: { colorway?: string; personal_name?: string };
      };
      return jsonResponse({
        stash: {
          id: 900,
          permalink: 'new-yarn',
          name: body.pack?.personal_name,
          colorway_name: body.pack?.colorway,
        },
      });
    }
    case '/people/knitter/queue/create.json':
      return jsonResponse({ queued_project: { id: 700 } });
    case '/patterns.json':
      return jsonResponse({ patterns: queuedPatterns });
    default:
      return jsonResponse({ error: 'not found' }, 404);
  }
}

async function freePort(): Promise<number> {
  const server = createNetServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  await new Promise<void>(resolve =>
    server.close(() => {
      resolve();
    }),
  );
  if (typeof address !== 'object' || !address) throw new Error('no port');
  return address.port;
}

/** An MCP client's OAuth state, kept in memory. */
class TestOAuthProvider implements OAuthClientProvider {
  authorizationUrl: URL | undefined;
  #client: StoredOAuthClientInformation | undefined;
  #tokens: StoredOAuthTokens | undefined;
  #verifier = '';
  #discovery: OAuthDiscoveryState | undefined;
  readonly #state = randomUUID();

  get redirectUrl() {
    return REDIRECT_URI;
  }
  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: 'Test MCP Client',
      redirect_uris: [REDIRECT_URI],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    };
  }
  state() {
    return this.#state;
  }
  clientInformation() {
    return this.#client;
  }
  saveClientInformation(info: StoredOAuthClientInformation) {
    this.#client = info;
  }
  tokens() {
    return this.#tokens;
  }
  saveTokens(tokens: StoredOAuthTokens) {
    this.#tokens = tokens;
  }
  redirectToAuthorization(url: URL) {
    this.authorizationUrl = url;
  }
  saveCodeVerifier(verifier: string) {
    this.#verifier = verifier;
  }
  codeVerifier() {
    return this.#verifier;
  }
  saveDiscoveryState(state: OAuthDiscoveryState) {
    this.#discovery = state;
  }
  discoveryState() {
    return this.#discovery;
  }
}

/**
 * Plays the user's browser: follows redirects with a cookie jar, "signs in" at
 * the fake Ravelry, and clicks Allow or Deny on the consent page. Returns the
 * final redirect to the MCP client.
 */
async function browse(start: URL, choice: 'confirm' | 'abort'): Promise<URL> {
  const cookies = new Map<string, string>();
  let url = start;
  let method = 'GET';
  for (let hop = 0; hop < 20; hop++) {
    if (url.href.startsWith(REDIRECT_URI)) return url;
    if (url.origin === 'https://www.ravelry.com') {
      // Ravelry's login + approval, then back to our callback.
      const back = new URL(url.searchParams.get('redirect_uri') ?? '');
      back.searchParams.set('code', 'ravelry-code');
      back.searchParams.set('state', url.searchParams.get('state') ?? '');
      url = back;
      method = 'GET';
      continue;
    }

    const response = await fetch(url, {
      method,
      redirect: 'manual',
      headers: { cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') },
    });
    for (const header of response.headers.getSetCookie()) {
      const [pair] = header.split(';');
      const [name, ...value] = (pair ?? '').split('=');
      if (name) cookies.set(name.trim(), value.join('='));
    }

    const location = response.headers.get('location');
    if (location) {
      url = new URL(location, url);
      method = 'GET';
      continue;
    }
    const html = await response.text();
    const action = new RegExp(`action="([^"]+/${choice})"`).exec(html)?.[1];
    if (!action) throw new Error(`Unexpected page (${response.status}): ${html.slice(0, 300)}`);
    expect(html).toContain('Test MCP Client');
    expect(html).toContain('knitter');
    url = new URL(action, url);
    method = 'POST';
  }
  throw new Error('Too many redirects');
}

describe('Sign in with Ravelry', () => {
  let ravelry: ReturnType<typeof fakeRavelry>;
  let base: string;
  let close: () => Promise<void>;

  beforeEach(async () => {
    ravelry = fakeRavelry();
    const port = await freePort();
    base = `http://127.0.0.1:${port}`;
    const publicRavelry = new RavelryClient({ username: 'app', password: 'key', fetch: ravelry });
    const accounts = setupAccounts({
      config: {
        clientId: 'cid',
        clientSecret: 'csecret',
        publicUrl: base,
        authSecret: 'test-secret-that-is-at-least-32-chars-long',
        dataDir: '.',
      },
      publicRavelry,
      trustProxy: false,
      requestTimeoutMs: 5_000,
      userAgent: 'test',
      fetch: ravelry,
      databasePath: ':memory:',
    });
    const http = await serveHttp(() => createServer(publicRavelry), {
      host: '127.0.0.1',
      port,
      account: accounts,
    });
    close = async () => {
      await http.close();
      accounts.close();
    };
  });

  afterEach(async () => {
    await close();
  });

  async function connect(provider: TestOAuthProvider) {
    const client = new Client(
      { name: 'test', version: '1.0.0' },
      { versionNegotiation: { mode: 'auto' } },
    );
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${base}/account/mcp`), { authProvider: provider }),
    );
    return client;
  }

  it('advertises where to sign in', async () => {
    const challenge = await fetch(`${base}/account/mcp`, { method: 'POST' });
    expect(challenge.status).toBe(401);
    expect(challenge.headers.get('www-authenticate')).toContain(
      `resource_metadata="${base}/.well-known/oauth-protected-resource/account/mcp"`,
    );

    const resource = (await (
      await fetch(`${base}/.well-known/oauth-protected-resource/account/mcp`)
    ).json()) as Record<string, unknown>;
    expect(resource).toMatchObject({
      resource: `${base}/account/mcp`,
      authorization_servers: [base],
      scopes_supported: ['ravelry:read', 'ravelry:write'],
    });

    const metadata = (await (
      await fetch(`${base}/.well-known/oauth-authorization-server`)
    ).json()) as Record<string, unknown>;
    expect(metadata).toMatchObject({
      issuer: base,
      authorization_endpoint: `${base}/oauth/authorize`,
      token_endpoint: `${base}/oauth/token`,
      registration_endpoint: `${base}/oauth/register`,
      code_challenge_methods_supported: ['S256'],
    });
  });

  it('signs in through Ravelry, asks for consent, then serves the personal tools', async () => {
    const provider = new TestOAuthProvider();
    await expect(connect(provider)).rejects.toBeInstanceOf(UnauthorizedError);
    expect(provider.authorizationUrl).toBeDefined();

    const callback = await browse(provider.authorizationUrl!, 'confirm');
    expect(callback.searchParams.get('state')).toBe(provider.state());
    const transport = new StreamableHTTPClientTransport(new URL(`${base}/account/mcp`), {
      authProvider: provider,
    });
    await transport.finishAuth(callback.searchParams);
    expect(provider.tokens()?.refresh_token).toBeDefined();

    const client = await connect(provider);
    const { tools } = await client.listTools();
    expect(tools.map(tool => tool.name)).toEqual(
      expect.arrayContaining([
        'search_patterns',
        'get_my_stash',
        'pick_from_my_queue',
        'get_my_crafting_profile',
      ]),
    );

    const result = await client.callTool({ name: 'get_my_stash', arguments: {} });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({
      stash: [
        { id: 1, yarn: 'Malabrigo Yarn Rios', weight: 'worsted', yards: 420, colorway: 'Teal' },
        { id: 2, yarn: 'Mystery DK', weight: 'dk', yards: 219 },
      ],
      yards_by_weight: { worsted: 420, dk: 219 },
      total_entries: 2,
    });

    const picks = await client.callTool({ name: 'pick_from_my_queue', arguments: {} });
    expect((picks.structuredContent as { candidates: unknown[] }).candidates).toMatchObject([
      { pattern: 'Worsted Hat', verdict: 'planned_yarn_in_stash', yards_needed: '180–220' },
      { pattern: 'Big Sweater', verdict: 'need_yarn', shortfall_yards: 780 },
    ]);

    // Adding from a receipt: the Teal Rios is already stashed, the hand-dyed skein is new.
    const added = await client.callTool({
      name: 'add_to_my_stash',
      arguments: {
        entries: [
          { yarn_id: 7, colorway: 'teal', skeins: 2 },
          {
            yarn_name: 'Indie Sock',
            weight: 'fingering',
            colorway: 'Moss',
            skeins: 1,
            total_length: 400,
            length_units: 'meters',
            price_paid: 24.5,
            currency: 'EUR',
            purchased_date: '2026-10-01',
          },
        ],
      },
    });
    expect(added.isError).toBeFalsy();
    expect(added.structuredContent).toMatchObject({
      added: [
        {
          stash_id: 900,
          yarn: 'Indie Sock',
          colorway: 'Moss',
          url: 'https://www.ravelry.com/people/knitter/stash/new-yarn',
        },
      ],
      skipped_duplicates: [{ index: 0, existing_stash_id: 1 }],
      failed: [],
    });
    const createCall = ravelry.mock.calls.find(([input]) =>
      (input as string).endsWith('/stash/create.json'),
    );
    expect(createCall?.[1]?.method).toBe('POST');
    expect(JSON.parse(createCall?.[1]?.body as string)).toEqual({
      stash_status_id: 1,
      pack: {
        personal_name: 'Indie Sock',
        personal_yarn_weight_id: 5,
        colorway: 'Moss',
        skeins: '1',
        total_length: '400',
        length_units: 'meters',
        purchased_date: '2026-10-01',
        total_paid: '24.5',
        total_paid_currency: 'EUR',
      },
    });

    const queued = await client.callTool({
      name: 'add_to_my_queue',
      arguments: { items: [{ pattern_id: 501 }, { pattern_id: 502, notes: 'Gift for mum' }] },
    });
    expect(queued.structuredContent).toMatchObject({
      added: [{ queued_id: 700, pattern_id: 502, pattern: 'New Cowl' }],
      skipped_already_queued: [{ pattern_id: 501 }],
    });

    // Personal calls went out with the user's token; the app key was never used for them.
    const personalCalls = ravelry.mock.calls.filter(([input]) =>
      new URL(input as string).pathname.startsWith('/people/'),
    );
    expect(personalCalls.length).toBeGreaterThan(0);
    for (const [, init] of personalCalls) {
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer user-token');
    }
    await client.close();
  });

  it('returns access_denied when the user clicks Deny', async () => {
    const provider = new TestOAuthProvider();
    await expect(connect(provider)).rejects.toBeInstanceOf(UnauthorizedError);

    const callback = await browse(provider.authorizationUrl!, 'abort');
    expect(callback.searchParams.get('error')).toBe('access_denied');
    expect(callback.searchParams.has('code')).toBe(false);
  });

  it('rejects tokens that were not issued by this server', async () => {
    const response = await fetch(`${base}/account/mcp`, {
      method: 'POST',
      headers: { Authorization: 'Bearer not-a-real-token', 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toContain('invalid_token');
  });
});
