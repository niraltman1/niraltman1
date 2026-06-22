import { test as setup, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const AUTH_FILE = 'e2e/.auth/state.json';

setup('authenticate as admin', async ({ page }) => {
  await mkdir('e2e/.auth', { recursive: true });

  // Log in via the API (Vite proxies /api → localhost:3001)
  const res = await page.request.post('/api/auth/login', {
    data: { username: 'admin', password: 'e2e-test-password' },
  });
  expect(res.status()).toBe(200);
  const body = await res.json() as { success: boolean; data: { token: string } };
  expect(body.success).toBe(true);

  // Inject the token into localStorage before saving state
  await page.goto('/');
  await page.evaluate((token: string) => {
    localStorage.setItem('factum_il_token', token);
  }, body.data.token);

  await page.context().storageState({ path: AUTH_FILE });
});
