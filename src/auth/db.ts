import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/** Opens (and migrates) the SQLite database that backs sign-in. */
export function openDatabase(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;

    -- oidc-provider models (clients, grants, sessions, codes, tokens...).
    -- Ids are hashed and payloads encrypted.
    CREATE TABLE IF NOT EXISTS oauth_models (
      model       TEXT NOT NULL,
      id          TEXT NOT NULL,
      payload     TEXT NOT NULL,
      grant_id    TEXT,
      uid         TEXT,
      user_code   TEXT,
      expires_at  INTEGER,
      consumed_at INTEGER,
      PRIMARY KEY (model, id)
    );
    CREATE INDEX IF NOT EXISTS oauth_models_grant ON oauth_models (grant_id);
    CREATE INDEX IF NOT EXISTS oauth_models_uid ON oauth_models (uid);
    CREATE INDEX IF NOT EXISTS oauth_models_expiry ON oauth_models (expires_at);

    -- Ravelry accounts that signed in, with their encrypted Ravelry tokens.
    CREATE TABLE IF NOT EXISTS ravelry_accounts (
      account_id  TEXT PRIMARY KEY,
      username    TEXT NOT NULL,
      tokens      TEXT NOT NULL,
      updated_at  INTEGER NOT NULL
    );

    -- In-flight "Sign in with Ravelry" redirects: OAuth state -> interaction.
    CREATE TABLE IF NOT EXISTS ravelry_logins (
      state       TEXT PRIMARY KEY,
      uid         TEXT NOT NULL,
      account_id  TEXT,
      expires_at  INTEGER NOT NULL
    );

    -- Row counters per Ravelry user and project. Owner is a hash, data encrypted.
    CREATE TABLE IF NOT EXISTS row_counters (
      owner       TEXT NOT NULL,
      project_id  INTEGER NOT NULL,
      data        TEXT NOT NULL,
      updated_at  INTEGER NOT NULL,
      PRIMARY KEY (owner, project_id)
    );

    -- Per-user preferences (e.g. units). Owner is a hash, data encrypted.
    CREATE TABLE IF NOT EXISTS preferences (
      owner       TEXT PRIMARY KEY,
      data        TEXT NOT NULL,
      updated_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  return db;
}

/** Deletes expired rows; cheap enough to run on an interval. */
export function pruneExpired(db: DatabaseSync, now = Date.now()): void {
  db.prepare('DELETE FROM oauth_models WHERE expires_at IS NOT NULL AND expires_at < ?').run(now);
  db.prepare('DELETE FROM ravelry_logins WHERE expires_at < ?').run(now);
}
