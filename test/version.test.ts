import { readFileSync } from 'node:fs';

import { expect, it } from 'vitest';

import { SERVER_VERSION } from '../src/server.ts';

const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as { version: string };

it('keeps package.json, manifest.json and the server version in sync', () => {
  expect(readJson('package.json').version).toBe(SERVER_VERSION);
  expect(readJson('manifest.json').version).toBe(SERVER_VERSION);
});
