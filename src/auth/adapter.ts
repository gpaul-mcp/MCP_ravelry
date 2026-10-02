import type { DatabaseSync } from 'node:sqlite';

import type { Adapter, AdapterPayload } from 'oidc-provider';

import { decrypt, encrypt, hashId } from './crypto.ts';

interface Row {
  payload: string;
  consumed_at: number | null;
}

/**
 * Persists oidc-provider models in SQLite. Every lookup key (id, uid, user
 * code, grant id) is hashed and every payload encrypted, so the database file
 * alone gives no usable tokens.
 */
export function createAdapterClass(db: DatabaseSync, key: Buffer) {
  const open = (row: Row | undefined): AdapterPayload | undefined => {
    if (!row) return undefined;
    const payload = JSON.parse(decrypt(key, row.payload)) as AdapterPayload;
    if (row.consumed_at) payload.consumed = Math.floor(row.consumed_at / 1000);
    return payload;
  };

  return class SqliteAdapter implements Adapter {
    readonly #model: string;

    constructor(model: string) {
      this.#model = model;
    }

    upsert(id: string, payload: AdapterPayload, expiresIn: number | undefined): Promise<void> {
      db.prepare(
        `INSERT INTO oauth_models (model, id, payload, grant_id, uid, user_code, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (model, id) DO UPDATE SET
           payload = excluded.payload, grant_id = excluded.grant_id, uid = excluded.uid,
           user_code = excluded.user_code, expires_at = excluded.expires_at`,
      ).run(
        this.#model,
        hashId(id),
        encrypt(key, JSON.stringify(payload)),
        payload.grantId ? hashId(payload.grantId) : null,
        payload.uid ? hashId(payload.uid) : null,
        payload.userCode ? hashId(payload.userCode) : null,
        expiresIn ? Date.now() + expiresIn * 1000 : null,
      );
      return Promise.resolve();
    }

    find(id: string): Promise<AdapterPayload | undefined> {
      return Promise.resolve(this.#findBy('id', id));
    }

    findByUid(uid: string): Promise<AdapterPayload | undefined> {
      return Promise.resolve(this.#findBy('uid', uid));
    }

    findByUserCode(userCode: string): Promise<AdapterPayload | undefined> {
      return Promise.resolve(this.#findBy('user_code', userCode));
    }

    consume(id: string): Promise<void> {
      db.prepare('UPDATE oauth_models SET consumed_at = ? WHERE model = ? AND id = ?').run(
        Date.now(),
        this.#model,
        hashId(id),
      );
      return Promise.resolve();
    }

    destroy(id: string): Promise<void> {
      db.prepare('DELETE FROM oauth_models WHERE model = ? AND id = ?').run(
        this.#model,
        hashId(id),
      );
      return Promise.resolve();
    }

    revokeByGrantId(grantId: string): Promise<void> {
      db.prepare('DELETE FROM oauth_models WHERE grant_id = ?').run(hashId(grantId));
      return Promise.resolve();
    }

    #findBy(column: 'id' | 'uid' | 'user_code', value: string): AdapterPayload | undefined {
      const row = db
        .prepare(
          `SELECT payload, consumed_at FROM oauth_models
           WHERE model = ? AND ${column} = ? AND (expires_at IS NULL OR expires_at > ?)`,
        )
        .get(this.#model, hashId(value), Date.now()) as Row | undefined;
      return open(row);
    }
  };
}
