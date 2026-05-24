import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      'better-sqlite3': resolve(
        __dirname,
        '../../packages/database/node_modules/better-sqlite3',
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    deps: {
      external: ['better-sqlite3'],
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
