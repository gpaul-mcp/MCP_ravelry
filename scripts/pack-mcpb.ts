// Packs the built server into ravelry-mcp.mcpb, a one-click Claude Desktop bundle.
// Stages only what the bundle needs (dist + production node_modules) so dev
// dependencies never end up inside it.
//
//   npm run pack:mcpb
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';

const STAGING = '.mcpb-build';
const OUTPUT = 'ravelry-mcp.mcpb';

if (!existsSync('dist/index.js')) {
  throw new Error('dist/index.js is missing: run `npm run build` first.');
}

rmSync(STAGING, { recursive: true, force: true });
mkdirSync(STAGING);
for (const file of ['manifest.json', 'package.json', 'package-lock.json', 'LICENSE', 'README.md']) {
  cpSync(file, `${STAGING}/${file}`);
}
cpSync('dist', `${STAGING}/dist`, {
  recursive: true,
  filter: source => !source.endsWith('.map'),
});

const run = (command: string, cwd = '.') => {
  execSync(command, { cwd, stdio: 'inherit' });
};
run('npm ci --omit=dev --ignore-scripts --no-audit --no-fund', STAGING);
run('npx --yes @anthropic-ai/mcpb@2 validate manifest.json', STAGING);
run(`npx --yes @anthropic-ai/mcpb@2 pack ${STAGING} ${OUTPUT}`);

rmSync(STAGING, { recursive: true, force: true });
console.log(`Created ${OUTPUT}`);
