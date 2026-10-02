import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts, whose root is the UI folder.
export default defineConfig({
  test: { include: ['test/**/*.test.ts'] },
});
