import type { DatabaseSync } from 'node:sqlite';

import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';

import { decrypt, encrypt, hashId } from '../auth/crypto.ts';
import { RavelryApiError } from '../ravelry/client.ts';
import { VIEW_META, widgetResult } from '../view.ts';
import type { UserContext } from './context.ts';

const MAX_COUNTERS = 6;
const MAX_PROJECTS = 100;
const DEFAULT_COUNTER = 'Rows';

interface StoredCounter {
  name: string;
  value: number;
  target: number | null;
  /** Rows per pattern repeat, to show "row 3 of 8". */
  repeat: number | null;
}

interface StoredProject {
  name: string;
  url: string | null;
  counters: StoredCounter[];
}

/** Row counters, one encrypted record per user and project, in the sign-in database. */
export class CounterStore {
  readonly #db: DatabaseSync;
  readonly #key: Buffer;

  constructor(db: DatabaseSync, key: Buffer) {
    this.#db = db;
    this.#key = key;
  }

  #owner(username: string): string {
    return hashId(`row-counter:${username.toLowerCase()}`);
  }

  get(username: string, projectId: number): StoredProject | undefined {
    const row = this.#db
      .prepare('SELECT data FROM row_counters WHERE owner = ? AND project_id = ?')
      .get(this.#owner(username), projectId) as { data: string } | undefined;
    return row ? (JSON.parse(decrypt(this.#key, row.data)) as StoredProject) : undefined;
  }

  list(username: string): { projectId: number; project: StoredProject; updatedAt: number }[] {
    const rows = this.#db
      .prepare(
        'SELECT project_id, data, updated_at FROM row_counters WHERE owner = ? ORDER BY updated_at DESC',
      )
      .all(this.#owner(username)) as { project_id: number; data: string; updated_at: number }[];
    return rows.map(row => ({
      projectId: row.project_id,
      project: JSON.parse(decrypt(this.#key, row.data)) as StoredProject,
      updatedAt: row.updated_at,
    }));
  }

  count(username: string): number {
    const row = this.#db
      .prepare('SELECT COUNT(*) AS n FROM row_counters WHERE owner = ?')
      .get(this.#owner(username)) as { n: number };
    return row.n;
  }

  save(username: string, projectId: number, project: StoredProject): void {
    if (project.counters.length === 0) {
      this.#db
        .prepare('DELETE FROM row_counters WHERE owner = ? AND project_id = ?')
        .run(this.#owner(username), projectId);
      return;
    }
    this.#db
      .prepare(
        `INSERT INTO row_counters (owner, project_id, data, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (owner, project_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      )
      .run(
        this.#owner(username),
        projectId,
        encrypt(this.#key, JSON.stringify(project)),
        Date.now(),
      );
  }
}

const counterSchema = z.object({
  name: z.string(),
  value: z.number(),
  target: z.number().nullable(),
  repeat: z.number().nullable().describe('Rows per pattern repeat.'),
  row_in_repeat: z.number().nullable().describe('e.g. 3 for "row 3 of 8".'),
  repeats_done: z.number().nullable(),
  remaining: z.number().nullable(),
});

const outputSchema = z.object({
  project: z
    .object({
      id: z
        .number()
        .nullable()
        .describe('Ravelry project id, or a negative id for a counter without a Ravelry project.'),
      name: z.string(),
      url: z.string().nullable(),
    })
    .nullable(),
  counters: z.array(counterSchema),
  other_projects: z
    .array(z.object({ id: z.number(), name: z.string(), summary: z.string() }))
    .describe('Other projects with counters, most recent first.'),
});

type Output = z.infer<typeof outputSchema>;

function view(counter: StoredCounter): z.infer<typeof counterSchema> {
  const { value, target, repeat } = counter;
  return {
    ...counter,
    row_in_repeat: repeat && value > 0 ? ((value - 1) % repeat) + 1 : null,
    repeats_done: repeat ? Math.floor(value / repeat) : null,
    remaining: target !== null ? Math.max(0, target - value) : null,
  };
}

const summary = (project: StoredProject) =>
  project.counters.map(c => `${c.name} ${c.value}${c.target ? `/${c.target}` : ''}`).join(', ');

const COUNTER_NOTE =
  'The user sees this counter as an interactive widget with + / − buttons and taps it ' +
  'themselves. Do not repeat the numbers; reply with one short sentence at most.';

const projectRef = {
  project_id: z
    .number()
    .int()
    .refine(id => id !== 0, 'project_id cannot be 0')
    .optional()
    .describe('A Ravelry project (from get_my_projects), or a negative id from this tool.'),
  project_name: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .optional()
    .describe('For a counter not linked to a Ravelry project, e.g. "Onigiri Pouch".'),
};

export function registerCounterTools(server: McpServer, user: UserContext): void {
  const store = user.counters;
  if (!store) return;

  const output = (
    id: number | null,
    project: StoredProject | { name: string; url: string | null; counters: StoredCounter[] } | null,
  ): Output => {
    const all = store.list(user.username);
    return {
      project: project ? { id, name: project.name, url: project.url } : null,
      counters: project ? project.counters.map(view) : [],
      other_projects: all
        .filter(p => p.projectId !== id)
        .slice(0, 10)
        .map(p => ({ id: p.projectId, name: p.project.name, summary: summary(p.project) })),
    };
  };

  /** A counter without a Ravelry project is stored under a negative id, found by its name. */
  const findByName = (name: string) =>
    store
      .list(user.username)
      .find(p => p.projectId < 0 && p.project.name.toLowerCase() === name.toLowerCase());

  const newLocalId = () => Math.min(0, ...store.list(user.username).map(p => p.projectId)) - 1;

  server.registerTool(
    'get_row_counter',
    {
      title: 'Row counter',
      description:
        'Shows row counters as an interactive widget the user taps while crafting (+ / −), or ' +
        "lists every counter. A counter belongs to one of the signed-in user's Ravelry projects " +
        '(project_id) or to any name (project_name) for things not on Ravelry. Counters live on ' +
        'this server. Use it when the user asks "where am I?" or wants to count rows.',
      inputSchema: z.object(projectRef),
      outputSchema,
      _meta: VIEW_META,
      // Reads the project name from Ravelry the first time.
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ project_id, project_name }, ctx) => {
      let result: Output;
      if (project_id) {
        const stored = store.get(user.username, project_id);
        if (stored) result = output(project_id, stored);
        else if (project_id < 0) throw new RavelryApiError(`No counter with id ${project_id}.`);
        else {
          // An empty card for the project, ready to start counting.
          const { project } = await user.ravelry.getProject(
            user.username,
            project_id,
            ctx.mcpReq.signal,
          );
          result = output(project.id, {
            name: project.name,
            url: project.links?.self?.href ?? null,
            counters: [],
          });
        }
      } else if (project_name) {
        const found = findByName(project_name);
        result = found
          ? output(found.projectId, found.project)
          : output(null, { name: project_name, url: null, counters: [] });
      } else {
        result = output(null, null);
      }
      return widgetResult(server, result, COUNTER_NOTE);
    },
  );

  server.registerTool(
    'update_row_counter',
    {
      title: 'Update row counter',
      description:
        'Changes a row counter: add or subtract rows (default 1), set a value, reset to 0, ' +
        'remove the counter, or configure a target ("48 rows") and a pattern repeat ("8-row ' +
        'repeat"). Each project can have several named counters, e.g. "Rows", "Repeats", ' +
        '"Decreases". Use project_id for a Ravelry project or project_name for anything else; ' +
        'the first change creates the counter. Stored on this server only; use ' +
        'log_project_progress to note the position on Ravelry.',
      inputSchema: z
        .object({
          ...projectRef,
          counter: z.string().trim().min(1).max(40).default(DEFAULT_COUNTER),
          action: z.enum(['add', 'subtract', 'set', 'reset', 'configure', 'remove']).default('add'),
          amount: z.number().int().min(1).max(1000).default(1).describe('For add / subtract.'),
          value: z.number().int().min(0).max(100_000).optional().describe('For set.'),
          target: z.number().int().min(1).max(100_000).nullable().optional(),
          repeat: z.number().int().min(1).max(1000).nullable().optional(),
        })
        .refine(input => input.project_id !== undefined || input.project_name !== undefined, {
          message: 'Give project_id or project_name',
          path: ['project_id'],
        }),
      outputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input, ctx) => {
      let id: number;
      let project: StoredProject | undefined;
      if (input.project_id) {
        id = input.project_id;
        project = store.get(user.username, id);
        if (!project && id < 0) throw new RavelryApiError(`No counter with id ${id}.`);
      } else {
        const found = findByName(input.project_name ?? '');
        id = found?.projectId ?? newLocalId();
        project = found?.project;
      }

      if (!project) {
        if (input.action === 'remove')
          return widgetResult(server, output(null, null), COUNTER_NOTE);
        if (store.count(user.username) >= MAX_PROJECTS) {
          throw new RavelryApiError(
            `You have counters on ${MAX_PROJECTS} projects; remove some old ones first.`,
          );
        }
        if (id > 0) {
          const { project: found } = await user.ravelry.getProject(
            user.username,
            id,
            ctx.mcpReq.signal,
          );
          project = { name: found.name, url: found.links?.self?.href ?? null, counters: [] };
        } else {
          project = { name: input.project_name ?? 'Counter', url: null, counters: [] };
        }
      }

      const key = input.counter.toLowerCase();
      let counter = project.counters.find(c => c.name.toLowerCase() === key);
      if (input.action === 'remove') {
        project.counters = project.counters.filter(c => c !== counter);
      } else {
        if (!counter) {
          if (project.counters.length >= MAX_COUNTERS) {
            throw new RavelryApiError(`A project can have up to ${MAX_COUNTERS} counters.`);
          }
          counter = { name: input.counter, value: 0, target: null, repeat: null };
          project.counters.push(counter);
        }
        switch (input.action) {
          case 'add':
            counter.value += input.amount;
            break;
          case 'subtract':
            counter.value = Math.max(0, counter.value - input.amount);
            break;
          case 'set':
            if (input.value === undefined) throw new RavelryApiError('Give a value to set.');
            counter.value = input.value;
            break;
          case 'reset':
            counter.value = 0;
            break;
          case 'configure':
            break;
        }
        if (input.target !== undefined) counter.target = input.target;
        if (input.repeat !== undefined) counter.repeat = input.repeat;
      }
      store.save(user.username, id, project);
      return widgetResult(server, output(id, project), COUNTER_NOTE);
    },
  );
}
