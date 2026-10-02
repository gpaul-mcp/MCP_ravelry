import { join } from 'node:path';

import type { McpServerFactory } from '@modelcontextprotocol/server';

import { AccountStore } from '../auth/accounts.ts';
import { deriveKeys } from '../auth/crypto.ts';
import { openDatabase, pruneExpired } from '../auth/db.ts';
import { RavelryOAuth } from '../auth/ravelry-oauth.ts';
import { AuthServer } from '../auth/server.ts';
import type { AccountConfig } from '../config.ts';
import { ACCOUNT_PATH } from '../http.ts';
import { RavelryClient } from '../ravelry/client.ts';
import { createServer } from '../server.ts';

export interface AccountSetupOptions {
  config: AccountConfig;
  publicRavelry: RavelryClient;
  trustProxy: boolean;
  requestTimeoutMs: number;
  userAgent: string;
  /** Injected for tests. */
  fetch?: typeof fetch;
  databasePath?: string;
}

/** Wires "Sign in with Ravelry": storage, OAuth server and the per-user MCP server. */
export function setupAccounts(options: AccountSetupOptions) {
  const { config, publicRavelry } = options;
  const db = openDatabase(options.databasePath ?? join(config.dataDir, 'ravelry-mcp.db'));
  const keys = deriveKeys(config.authSecret);
  const ravelryOAuth = new RavelryOAuth({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: `${config.publicUrl}/oauth/ravelry/callback`,
    fetch: options.fetch,
  });
  const accounts = new AccountStore(db, keys.storage, ravelryOAuth);
  const resourceUrl = `${config.publicUrl}${ACCOUNT_PATH}`;
  const auth = new AuthServer({
    publicUrl: config.publicUrl,
    resourceUrl,
    db,
    keys,
    accounts,
    ravelryOAuth,
    trustProxy: options.trustProxy,
  });

  const factory: McpServerFactory = ({ authInfo }) => {
    const accountId = String(authInfo?.extra?.accountId);
    const account = accounts.find(accountId);
    if (!account) throw new Error('Unknown account');
    const ravelry = new RavelryClient({
      authorization: async () => `Bearer ${await accounts.accessToken(accountId)}`,
      timeoutMs: options.requestTimeoutMs,
      userAgent: options.userAgent,
      fetch: options.fetch,
    });
    return createServer(publicRavelry, { username: account.username, ravelry, publicRavelry });
  };

  const pruning = setInterval(
    () => {
      pruneExpired(db);
    },
    60 * 60 * 1000,
  );
  pruning.unref();

  return {
    auth,
    factory,
    resourceUrl,
    close: () => {
      clearInterval(pruning);
      db.close();
    },
  };
}
