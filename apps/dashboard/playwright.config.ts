import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'os';
import { join } from 'path';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false, // שמור על סדר — DB משותף
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',

  use: {
    baseURL: 'http://localhost:5173',
    locale: 'he-IL',
    trace: 'on-first-retry',
    storageState: 'e2e/.auth/state.json',
  },

  webServer: [
    {
      command: `pnpm exec tsx ../../packages/api/src/start.ts`,
      url: 'http://localhost:3001/api/health/ping',
      reuseExistingServer: !process.env['CI'],
      timeout: 30_000,
      env: {
        NODE_ENV: 'development',
        FACTUM_IL_DB_PATH: join(tmpdir(), 'factum-il-e2e-test.db'),
        PORT: '3001',
        FACTUM_IL_SAFE_MODE: '1',
        FACTUM_IL_ADMIN_PASS: 'e2e-test-password',
      },
    },
    {
      command: 'pnpm --filter @factum-il/dashboard dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env['CI'],
      timeout: 30_000,
    },
  ],

  projects: [
    // Auth setup runs once before all tests and saves localStorage state to disk.
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
  ],
});
