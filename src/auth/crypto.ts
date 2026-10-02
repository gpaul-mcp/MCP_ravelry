import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';

/** Keys derived from the single AUTH_SECRET, each for one purpose. */
export interface AuthKeys {
  /** AES-256-GCM key for everything stored at rest. */
  storage: Buffer;
  /** Keys oidc-provider signs its cookies with. */
  cookies: string[];
}

export function deriveKeys(secret: string): AuthKeys {
  const derive = (info: string) => Buffer.from(hkdfSync('sha256', secret, 'ravelry-mcp', info, 32));
  return {
    storage: derive('storage-encryption'),
    cookies: [derive('cookie-signing').toString('base64url')],
  };
}

/** Encrypts with AES-256-GCM; output is `iv.tag.ciphertext`, base64url. */
export function encrypt(key: Buffer, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map(part => part.toString('base64url')).join('.');
}

export function decrypt(key: Buffer, sealed: string): string {
  const [iv, tag, ciphertext] = sealed.split('.').map(part => Buffer.from(part, 'base64url'));
  if (!iv || !tag || !ciphertext) throw new Error('Malformed encrypted value');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/** Storage keys are hashes, so a leaked database does not reveal usable token ids. */
export function hashId(id: string): string {
  return createHash('sha256').update(id).digest('base64url');
}
