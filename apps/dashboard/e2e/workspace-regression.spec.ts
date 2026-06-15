import { test, expect } from '@playwright/test';
import { waitForApp } from './helpers.js';

/**
 * Workspace Regression Suite (PRE-5)
 *
 * Verifies the existing workspace golden path still works after each phase.
 * Run after every phase to catch regressions in the workspace, agents,
 * and admin routes that must remain functional throughout the RC cycle.
 */

test.describe('Workspace golden path regression', () => {
  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
  });

  test('/workspace renders without crash', async ({ page }) => {
    await page.goto('/workspace');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
    await expect(page.getByText('Unhandled Runtime Error')).not.toBeVisible();
  });

  test('/agents renders without crash', async ({ page }) => {
    await page.goto('/agents');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
    await expect(page.getByText('Unhandled Runtime Error')).not.toBeVisible();
  });

  test('/support renders without crash', async ({ page }) => {
    await page.goto('/support');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });

  test('/data-migration renders without crash', async ({ page }) => {
    await page.goto('/data-migration');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });

  test('/entities renders without crash', async ({ page }) => {
    await page.goto('/entities');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });

  test('/admin renders without crash', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });

  test('/admin/updates renders without crash', async ({ page }) => {
    await page.goto('/admin/updates');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
    await expect(page.getByText('Unhandled Runtime Error')).not.toBeVisible();
  });

  test('8 agent POST endpoints are reachable (403 without auth, not 404)', async ({ request }) => {
    const agentEndpoints = [
      '/api/agents/case-summary/run',
      '/api/agents/document-analysis/run',
      '/api/agents/risk-assessment/run',
      '/api/agents/deadline-monitor/run',
      '/api/agents/citation-finder/run',
      '/api/agents/legal-research/run',
      '/api/agents/template-generator/run',
      '/api/agents/hearing-prep/run',
    ];

    for (const endpoint of agentEndpoints) {
      const response = await request.post(endpoint, {
        data:             { caseId: 1 },
        headers:          { 'Content-Type': 'application/json' },
        failOnStatusCode: false,
      });
      // Must not be 404 — endpoint must exist
      expect(response.status(), `${endpoint} returned 404`).not.toBe(404);
    }
  });

  test('root / redirects to /workspace', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/workspace/);
  });
});
