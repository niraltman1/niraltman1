import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      'better-sqlite3': resolve(
        __dirname,
        '../database/node_modules/better-sqlite3',
      ),
      // Force xlsx to CJS build — the ESM build (xlsx.mjs) doesn't auto-initialise
      // _fs, so XLSX.writeFile / readFile throw "cannot save file" in Node.js.
      'xlsx': resolve(__dirname, 'node_modules/xlsx/xlsx.js'),
    },
  },
  test: {
    environment:  'node',
    include:      ['src/**/*.test.ts'],
    setupFiles:   ['./vitest.setup.ts'],
    testTimeout:  30_000,
    deps: {
      external:       ['better-sqlite3'],
      interopDefault: true,
    },
  },
});
