import { generateKeyPairSync, randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';

import { type AuthInfo, OAuthError, OAuthErrorCode } from '@modelcontextprotocol/server';
import Provider, { type Configuration, errors, type JWK } from 'oidc-provider';

import type { AccountStore } from './accounts.ts';
import { createAdapterClass } from './adapter.ts';
import { type AuthKeys, decrypt, encrypt, hashId } from './crypto.ts';
import { consentPage, errorPage } from './pages.ts';
import type { RavelryOAuth } from './ravelry-oauth.ts';

export const ACCOUNT_SCOPE = 'ravelry:read';

const LOGIN_TTL_MS = 10 * 60 * 1000;
const DAY = 24 * 60 * 60;

export interface AuthServerOptions {
  /** Public origin, e.g. https://ravelry-mcp.example.com. Also the OAuth issuer. */
  publicUrl: string;
  /** The protected MCP endpoint, e.g. https://ravelry-mcp.example.com/account/mcp. */
  resourceUrl: string;
  db: DatabaseSync;
  keys: AuthKeys;
  accounts: AccountStore;
  ravelryOAuth: RavelryOAuth;
  trustProxy: boolean;
}

/**
 * The OAuth 2.1 authorization server MCP clients sign in through.
 *
 * oidc-provider handles client registration, PKCE, codes and tokens. Its
 * "login" step is delegated to Ravelry's own OAuth, and a consent page asks
 * the user to approve each client before any token is issued (MCP spec
 * requirement for servers that sit in front of a third-party login).
 */
export class AuthServer {
  readonly provider: Provider;
  readonly #options: AuthServerOptions;
  readonly #callback: (req: IncomingMessage, res: ServerResponse) => Promise<void> | void;

  constructor(options: AuthServerOptions) {
    this.#options = options;
    this.provider = new Provider(options.publicUrl, this.#configuration());
    this.provider.proxy = options.trustProxy;
    this.#callback = this.provider.callback();
  }

  /** Whether a request path belongs to the authorization server. */
  handles(pathname: string): boolean {
    return (
      pathname.startsWith('/oauth/') ||
      pathname === '/.well-known/oauth-authorization-server' ||
      pathname === '/.well-known/openid-configuration'
    );
  }

  async handle(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void> {
    try {
      if (pathname === '/oauth/ravelry/callback' && req.method === 'GET') {
        await this.#ravelryCallback(req, res);
        return;
      }
      const interaction = /^\/oauth\/interaction\/([\w-]+)(?:\/(login|confirm|abort))?$/.exec(
        pathname,
      );
      if (interaction?.[1]) {
        await this.#interaction(req, res, interaction[1], interaction[2]);
        return;
      }
      await this.#callback(req, res);
    } catch (error) {
      const expired =
        error instanceof errors.SessionNotFound || error instanceof errors.InvalidRequest;
      sendHtml(
        res,
        expired ? 400 : 500,
        errorPage(
          expired
            ? 'This sign-in attempt has expired or was already used.'
            : 'Signing in failed. Please try again.',
        ),
      );
      if (!expired) console.error('[ravelry] sign-in error:', error);
    }
  }

  /** Validates an access token for the protected MCP endpoint. */
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const accessToken = await this.provider.AccessToken.find(token);
    if (!accessToken?.accountId || !accessToken.clientId || !accessToken.exp) {
      throw new OAuthError(OAuthErrorCode.InvalidToken, 'Invalid or expired access token');
    }
    const audiences = [accessToken.aud ?? []].flat();
    if (!audiences.includes(this.#options.resourceUrl)) {
      throw new OAuthError(OAuthErrorCode.InvalidToken, 'Access token is not for this server');
    }
    // A token whose Ravelry account is gone makes the client sign in again.
    if (!this.#options.accounts.find(accessToken.accountId)) {
      throw new OAuthError(OAuthErrorCode.InvalidToken, 'Ravelry account is not connected');
    }
    return {
      token,
      clientId: accessToken.clientId,
      scopes: accessToken.scope?.split(' ').filter(Boolean) ?? [],
      expiresAt: accessToken.exp,
      resource: new URL(this.#options.resourceUrl),
      extra: { accountId: accessToken.accountId },
    };
  }

  async #interaction(
    req: IncomingMessage,
    res: ServerResponse,
    uid: string,
    step: string | undefined,
  ): Promise<void> {
    const details = await this.provider.interactionDetails(req, res);
    if (details.uid !== uid) throw new errors.SessionNotFound('interaction mismatch');

    // Back from Ravelry: finish the login prompt.
    if (step === 'login' && req.method === 'GET') {
      const state = new URL(req.url ?? '', this.#options.publicUrl).searchParams.get('state') ?? '';
      const login = this.#takeLogin(state);
      if (login?.uid !== uid) throw new errors.SessionNotFound('unknown login state');
      const result = login.accountId
        ? { login: { accountId: login.accountId } }
        : { error: 'access_denied', error_description: 'Ravelry sign-in was cancelled' };
      await this.provider.interactionFinished(req, res, result, { mergeWithLastSubmission: false });
      return;
    }

    if (step === 'abort' && req.method === 'POST') {
      await this.provider.interactionFinished(
        req,
        res,
        { error: 'access_denied', error_description: 'Access was denied' },
        { mergeWithLastSubmission: false },
      );
      return;
    }

    if (step === 'confirm' && req.method === 'POST') {
      await this.#grantConsent(req, res, details);
      return;
    }

    if (step === undefined && req.method === 'GET') {
      if (details.prompt.name === 'login') {
        const state = randomBytes(24).toString('base64url');
        this.#options.db
          .prepare('INSERT INTO ravelry_logins (state, uid, expires_at) VALUES (?, ?, ?)')
          .run(hashId(state), uid, Date.now() + LOGIN_TTL_MS);
        res.writeHead(303, { Location: this.#options.ravelryOAuth.authorizeUrl(state) }).end();
        return;
      }

      const client = await this.provider.Client.find(String(details.params.client_id));
      const accountId = details.session?.accountId;
      const account = accountId ? this.#options.accounts.find(accountId) : undefined;
      if (!client || !account) throw new errors.SessionNotFound('missing client or account');
      const { redirect_uri: redirect } = details.params;
      const redirectUri = typeof redirect === 'string' ? redirect : '';
      sendHtml(
        res,
        200,
        consentPage({
          uid,
          clientName: client.clientName ?? 'An MCP client',
          redirectHost: URL.parse(redirectUri)?.host ?? redirectUri,
          username: account.username,
        }),
      );
      return;
    }

    sendHtml(res, 405, errorPage('Unsupported request.'));
  }

  async #grantConsent(
    req: IncomingMessage,
    res: ServerResponse,
    details: Awaited<ReturnType<Provider['interactionDetails']>>,
  ): Promise<void> {
    const accountId = details.session?.accountId;
    if (details.prompt.name !== 'consent' || !accountId) {
      throw new errors.SessionNotFound('no consent pending');
    }

    const { Grant } = this.provider;
    const grant = details.grantId
      ? await Grant.find(details.grantId)
      : new Grant({ accountId, clientId: String(details.params.client_id) });
    if (!grant) throw new errors.SessionNotFound('grant not found');

    const missing = details.prompt.details as {
      missingOIDCScope?: string[];
      missingResourceScopes?: Record<string, string[]>;
    };
    if (missing.missingOIDCScope) grant.addOIDCScope(missing.missingOIDCScope.join(' '));
    for (const [resource, scopes] of Object.entries(missing.missingResourceScopes ?? {})) {
      grant.addResourceScope(resource, scopes.join(' '));
    }
    const grantId = await grant.save();

    await this.provider.interactionFinished(
      req,
      res,
      { consent: details.grantId ? {} : { grantId } },
      { mergeWithLastSubmission: true },
    );
  }

  async #ravelryCallback(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const params = new URL(req.url ?? '', this.#options.publicUrl).searchParams;
    const state = params.get('state') ?? '';
    const row = this.#options.db
      .prepare('SELECT uid FROM ravelry_logins WHERE state = ? AND expires_at > ?')
      .get(hashId(state), Date.now()) as { uid: string } | undefined;
    if (!row) throw new errors.SessionNotFound('unknown login state');

    const code = params.get('code');
    // An empty account id records a cancelled Ravelry sign-in.
    let accountId = '';
    if (code && !params.get('error')) {
      const { ravelryOAuth, accounts } = this.#options;
      const tokens = await ravelryOAuth.exchangeCode(code);
      const user = await ravelryOAuth.currentUser(tokens.accessToken);
      accountId = String(user.id);
      accounts.save({ accountId, username: user.username }, tokens);
    }

    this.#options.db
      .prepare('UPDATE ravelry_logins SET account_id = ? WHERE state = ?')
      .run(accountId, hashId(state));
    const next = `/oauth/interaction/${row.uid}/login?state=${encodeURIComponent(state)}`;
    res.writeHead(303, { Location: next }).end();
  }

  /** Reads and deletes a pending Ravelry login (single use). */
  #takeLogin(state: string): { uid: string; accountId: string } | undefined {
    const { db } = this.#options;
    const row = db
      .prepare(
        'SELECT uid, account_id FROM ravelry_logins WHERE state = ? AND expires_at > ? AND account_id IS NOT NULL',
      )
      .get(hashId(state), Date.now()) as { uid: string; account_id: string } | undefined;
    db.prepare('DELETE FROM ravelry_logins WHERE state = ?').run(hashId(state));
    return row && { uid: row.uid, accountId: row.account_id };
  }

  #configuration(): Configuration {
    const { db, keys, resourceUrl } = this.#options;
    return {
      adapter: createAdapterClass(db, keys.storage),
      clients: [],
      jwks: { keys: [signingKey(db, keys.storage)] },
      cookies: { keys: keys.cookies },
      findAccount: (_ctx, id) => ({ accountId: id, claims: () => ({ sub: id }) }),
      // Listed here too: MCP clients send the resource scope when they register.
      scopes: ['offline_access', ACCOUNT_SCOPE],
      responseTypes: ['code'],
      pkce: { required: () => true },
      clientBasedCORS: () => true,
      issueRefreshToken: (_ctx, client) => client.grantTypeAllowed('refresh_token'),
      features: {
        devInteractions: { enabled: false },
        registration: { enabled: true, issueRegistrationAccessToken: false },
        revocation: { enabled: true },
        userinfo: { enabled: false },
        resourceIndicators: {
          enabled: true,
          defaultResource: () => resourceUrl,
          useGrantedResource: () => true,
          getResourceServerInfo: (_ctx, indicator) => {
            if (indicator.replace(/\/+$/, '') !== resourceUrl) throw new errors.InvalidTarget();
            return { scope: ACCOUNT_SCOPE, accessTokenFormat: 'opaque', accessTokenTTL: 60 * 60 };
          },
        },
      },
      ttl: {
        AccessToken: 60 * 60,
        AuthorizationCode: 60,
        Grant: 90 * DAY,
        IdToken: 60 * 60,
        Interaction: 15 * 60,
        RefreshToken: 90 * DAY,
        Session: 30 * DAY,
      },
      routes: {
        authorization: '/oauth/authorize',
        token: '/oauth/token',
        registration: '/oauth/register',
        revocation: '/oauth/revoke',
        jwks: '/oauth/jwks',
        end_session: '/oauth/logout',
        userinfo: '/oauth/userinfo',
        introspection: '/oauth/introspect',
        pushed_authorization_request: '/oauth/par',
        code_verification: '/oauth/device',
        device_authorization: '/oauth/device/auth',
        backchannel_authentication: '/oauth/backchannel',
      },
      interactions: { url: (_ctx, interaction) => `/oauth/interaction/${interaction.uid}` },
      renderError: (ctx, out) => {
        ctx.type = 'html';
        ctx.body = errorPage(
          typeof out.error_description === 'string' ? out.error_description : 'Invalid request.',
        );
      },
    };
  }
}

/** The provider's RSA signing key, generated once and kept encrypted in the database. */
function signingKey(db: DatabaseSync, key: Buffer): JWK {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'jwk'").get() as
    { value: string } | undefined;
  if (row) return JSON.parse(decrypt(key, row.value)) as JWK;

  const jwk = {
    ...generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ format: 'jwk' }),
    kid: randomBytes(8).toString('hex'),
    use: 'sig',
  } as JWK;
  db.prepare("INSERT INTO settings (key, value) VALUES ('jwk', ?)").run(
    encrypt(key, JSON.stringify(jwk)),
  );
  return jwk;
}

function sendHtml(res: ServerResponse, status: number, html: string): void {
  if (res.headersSent) return;
  res
    .writeHead(status, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy':
        "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
    })
    .end(html);
}
