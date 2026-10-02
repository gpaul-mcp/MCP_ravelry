import type { DatabaseSync } from 'node:sqlite';

import { RavelryApiError } from '../ravelry/client.ts';
import { decrypt, encrypt } from './crypto.ts';
import type { RavelryOAuth, RavelryTokens } from './ravelry-oauth.ts';

const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export interface Account {
  accountId: string;
  username: string;
}

export class AccountExpiredError extends RavelryApiError {
  constructor() {
    super(
      'Your Ravelry sign-in has expired or was revoked. Disconnect and reconnect the Ravelry ' +
        'connector to sign in again.',
      401,
    );
  }
}

/** Ravelry accounts that signed in, and their tokens (encrypted at rest). */
export class AccountStore {
  readonly #db: DatabaseSync;
  readonly #key: Buffer;
  readonly #oauth: RavelryOAuth;
  readonly #refreshing = new Map<string, Promise<string>>();

  constructor(db: DatabaseSync, key: Buffer, oauth: RavelryOAuth) {
    this.#db = db;
    this.#key = key;
    this.#oauth = oauth;
  }

  save(account: Account, tokens: RavelryTokens): void {
    this.#db
      .prepare(
        `INSERT INTO ravelry_accounts (account_id, username, tokens, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (account_id) DO UPDATE SET
           username = excluded.username, tokens = excluded.tokens, updated_at = excluded.updated_at`,
      )
      .run(
        account.accountId,
        account.username,
        encrypt(this.#key, JSON.stringify(tokens)),
        Date.now(),
      );
  }

  find(accountId: string): Account | undefined {
    const row = this.#db
      .prepare('SELECT account_id, username FROM ravelry_accounts WHERE account_id = ?')
      .get(accountId) as { account_id: string; username: string } | undefined;
    return row && { accountId: row.account_id, username: row.username };
  }

  /** A valid Ravelry access token for the account, refreshed when close to expiry. */
  async accessToken(accountId: string): Promise<string> {
    const tokens = this.#tokens(accountId);
    if (tokens.expiresAt - REFRESH_MARGIN_MS > Date.now()) return tokens.accessToken;

    // One refresh per account at a time: Ravelry may rotate refresh tokens.
    let pending = this.#refreshing.get(accountId);
    if (!pending) {
      pending = this.#refresh(accountId, tokens).finally(() => this.#refreshing.delete(accountId));
      this.#refreshing.set(accountId, pending);
    }
    return pending;
  }

  async #refresh(accountId: string, tokens: RavelryTokens): Promise<string> {
    if (!tokens.refreshToken) throw new AccountExpiredError();
    let refreshed: RavelryTokens;
    try {
      refreshed = await this.#oauth.refresh(tokens.refreshToken);
    } catch {
      throw new AccountExpiredError();
    }
    const account = this.find(accountId);
    if (!account) throw new AccountExpiredError();
    this.save(account, {
      ...refreshed,
      refreshToken: refreshed.refreshToken ?? tokens.refreshToken,
    });
    return refreshed.accessToken;
  }

  #tokens(accountId: string): RavelryTokens {
    const row = this.#db
      .prepare('SELECT tokens FROM ravelry_accounts WHERE account_id = ?')
      .get(accountId) as { tokens: string } | undefined;
    if (!row) throw new AccountExpiredError();
    return JSON.parse(decrypt(this.#key, row.tokens)) as RavelryTokens;
  }
}
