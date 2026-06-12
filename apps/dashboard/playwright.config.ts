import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'os';
import { join } from 'path';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false, // שמור על סדר — DB משותף
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',

  use: {
    baseURL: 'http://localhost:5173',
    locale: 'he-IL',
    trace: 'on-first-retry',
  },

  webServer: [
    {
      command: `pnpm exec tsx ../../packages/api/src/start.ts`,
      url: 'http://localhost:3001/api/health',
      reuseExistingServer: !process.env['CI'],
      timeout: 30_000,
      env: {
        NODE_ENV: 'development',
        FACTUM_IL_DB_PATH: join(tmpdir(), 'factum-il-e2e-test.db'),
        PORT: '3001',
        FACTUM_IL_SAFE_MODE: '1',
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
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
