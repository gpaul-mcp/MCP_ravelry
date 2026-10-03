import type { DatabaseSync } from 'node:sqlite';

import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';

import { decrypt, encrypt, hashId } from '../auth/crypto.ts';
import type { UserContext } from './context.ts';

export const UNITS = ['metric', 'imperial'] as const;
export type Units = (typeof UNITS)[number];

export interface Preferences {
  units?: Units;
}

/** Small per-user settings, one encrypted record per user in the sign-in database. */
export class PreferenceStore {
  readonly #db: DatabaseSync;
  readonly #key: Buffer;

  constructor(db: DatabaseSync, key: Buffer) {
    this.#db = db;
    this.#key = key;
  }

  #owner(username: string): string {
    return hashId(`preferences:${username.toLowerCase()}`);
  }

  get(username: string): Preferences {
    const row = this.#db
      .prepare('SELECT data FROM preferences WHERE owner = ?')
      .get(this.#owner(username)) as { data: string } | undefined;
    return row ? (JSON.parse(decrypt(this.#key, row.data)) as Preferences) : {};
  }

  set(username: string, changes: Preferences): Preferences {
    const next = { ...this.get(username), ...changes };
    this.#db
      .prepare(
        `INSERT INTO preferences (owner, data, updated_at) VALUES (?, ?, ?)
         ON CONFLICT (owner) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      )
      .run(this.#owner(username), encrypt(this.#key, JSON.stringify(next)), Date.now());
    return next;
  }
}

/** How the model should present lengths, for the server instructions. */
export function unitsInstruction(units: Units | undefined): string {
  if (units === 'metric') {
    return (
      '\nThe user works in METRIC: give lengths in meters, sizes in cm, weights in grams, gauge ' +
      'per 10 cm and needles in mm. Use the meters fields of tool results; never show yards ' +
      'unless asked.'
    );
  }
  if (units === 'imperial') {
    return '\nThe user works in IMPERIAL units: give lengths in yards, sizes in inches, gauge per 4 in.';
  }
  return (
    '\nThe user has not chosen units yet: when they mention meters/grams or yards/ounces, save ' +
    'it with set_my_preferences and answer in those units.'
  );
}

export function registerPreferenceTools(server: McpServer, user: UserContext): void {
  const store = user.preferences;
  if (!store) return;
  server.registerTool(
    'set_my_preferences',
    {
      title: 'Set my preferences',
      description:
        "Saves the signed-in user's preferences on this server, e.g. units: metric (meters, " +
        'grams, cm) or imperial (yards, ounces, inches). Results and widgets then use them.',
      inputSchema: z.object({
        units: z.enum(UNITS).optional(),
      }),
      outputSchema: z.object({ units: z.enum(UNITS).nullable() }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    ({ units }) => {
      const saved = store.set(user.username, units ? { units } : {});
      const output = { units: saved.units ?? null };
      return {
        content: [{ type: 'text', text: JSON.stringify(output) }],
        structuredContent: output,
      };
    },
  );
}
