import { describe, expect, it, vi } from 'vitest';

import { AccountExpiredError, AccountStore } from '../src/auth/accounts.ts';
import { createAdapterClass } from '../src/auth/adapter.ts';
import { decrypt, deriveKeys, encrypt } from '../src/auth/crypto.ts';
import { openDatabase } from '../src/auth/db.ts';
import type { RavelryOAuth } from '../src/auth/ravelry-oauth.ts';

const keys = deriveKeys('test-secret-that-is-at-least-32-chars-long');

describe('encryption', () => {
  it('round-trips and never repeats ciphertext', () => {
    const a = encrypt(keys.storage, 'hello');
    const b = encrypt(keys.storage, 'hello');
    expect(a).not.toBe(b);
    expect(decrypt(keys.storage, a)).toBe('hello');
  });

  it('rejects tampered data and other keys', () => {
    const sealed = encrypt(keys.storage, 'hello');
    const other = deriveKeys('another-secret-that-is-at-least-32-chars');
    expect(() => decrypt(other.storage, sealed)).toThrow();
    expect(() => decrypt(keys.storage, `${sealed.slice(0, -2)}AA`)).toThrow();
  });
});

describe('oidc-provider adapter', () => {
  it('stores hashed ids and encrypted payloads', async () => {
    const db = openDatabase(':memory:');
    const Adapter = createAdapterClass(db, keys.storage);
    const tokens = new Adapter('AccessToken');

    await tokens.upsert(
      'raw-token-id',
      { jti: 'raw-token-id', grantId: 'g1', accountId: 'secret-account' },
      60,
    );
    expect(await tokens.find('raw-token-id')).toMatchObject({ accountId: 'secret-account' });

    const raw = JSON.stringify(db.prepare('SELECT * FROM oauth_models').all());
    expect(raw).not.toContain('raw-token-id');
    expect(raw).not.toContain('secret-account');
  });

  it('marks consumed codes, revokes by grant and expires rows', async () => {
    const db = openDatabase(':memory:');
    const Adapter = createAdapterClass(db, keys.storage);
    const codes = new Adapter('AuthorizationCode');

    await codes.upsert('code-1', { grantId: 'grant-1' }, 60);
    await codes.consume('code-1');
    expect((await codes.find('code-1'))?.consumed).toBeTypeOf('number');

    await codes.revokeByGrantId('grant-1');
    expect(await codes.find('code-1')).toBeUndefined();

    await codes.upsert('code-2', {}, -1);
    expect(await codes.find('code-2')).toBeUndefined();
  });
});

describe('AccountStore', () => {
  const account = { accountId: '42', username: 'knitter' };

  it('returns the stored token while it is fresh', async () => {
    const refresh = vi.fn();
    const oauth = { refresh } as unknown as RavelryOAuth;
    const store = new AccountStore(openDatabase(':memory:'), keys.storage, oauth);
    store.save(account, {
      accessToken: 'a1',
      refreshToken: 'r1',
      expiresAt: Date.now() + 3_600_000,
    });

    expect(await store.accessToken('42')).toBe('a1');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('refreshes an expiring token once, even with concurrent callers', async () => {
    const refresh = vi.fn().mockResolvedValue({
      accessToken: 'a2',
      refreshToken: undefined,
      expiresAt: Date.now() + 86_400_000,
    });
    const store = new AccountStore(openDatabase(':memory:'), keys.storage, {
      refresh,
    } as unknown as RavelryOAuth);
    store.save(account, { accessToken: 'a1', refreshToken: 'r1', expiresAt: Date.now() + 1_000 });

    const results = await Promise.all([store.accessToken('42'), store.accessToken('42')]);
    expect(results).toEqual(['a2', 'a2']);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith('r1');
    // The old refresh token is kept when Ravelry does not rotate it.
    refresh.mockClear();
    expect(await store.accessToken('42')).toBe('a2');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('asks the user to reconnect when the refresh fails', async () => {
    const refresh = vi.fn().mockRejectedValue(new Error('revoked'));
    const store = new AccountStore(openDatabase(':memory:'), keys.storage, {
      refresh,
    } as unknown as RavelryOAuth);
    store.save(account, { accessToken: 'a1', refreshToken: 'r1', expiresAt: Date.now() - 1 });

    await expect(store.accessToken('42')).rejects.toBeInstanceOf(AccountExpiredError);
    await expect(store.accessToken('unknown')).rejects.toBeInstanceOf(AccountExpiredError);
  });
});
