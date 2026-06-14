import { test, expect } from '@playwright/test';
import { waitForApp } from './helpers.js';

/**
 * Phase 4 — Patch Workflow E2E
 *
 * Tests the admin patch center: history, health, and rollback views.
 * Actual patch application requires a signed .factumpatch file and admin role;
 * these tests verify the UI renders correctly and shows appropriate states.
 */

test.describe('Patch Center — Update Center page', () => {
  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
  });

  test('navigates to /admin/updates and renders page sections', async ({ page }) => {
    await page.goto('/admin/updates');
    await page.waitForLoadState('networkidle');

    // Page heading must be visible
    await expect(page.getByText('מרכז עדכונים')).toBeVisible();

    // All main sections must be present
    await expect(page.getByText('מצב המערכת')).toBeVisible();
    await expect(page.getByText('בריאות המערכת לאחר עדכון')).toBeVisible();
    await expect(page.getByText('נקודות שחזור')).toBeVisible();
    await expect(page.getByText('היסטוריית עדכונים')).toBeVisible();
  });

  test('patch history shows empty state when no patches applied', async ({ page }) => {
    await page.goto('/admin/updates');
    await page.waitForLoadState('networkidle');

    // Either a table or the empty-state message — both are valid
    const emptyMsg = page.getByText('אין היסטוריית עדכונים.');
    const table    = page.locator('table');
    await expect(emptyMsg.or(table)).toBeVisible({ timeout: 10_000 });
  });

  test('recovery points shows empty state when no snapshots exist', async ({ page }) => {
    await page.goto('/admin/updates');
    await page.waitForLoadState('networkidle');

    const emptyMsg   = page.getByText('אין נקודות שחזור.');
    const firstPoint = page.locator('[data-testid="recovery-point"]').first();
    await expect(emptyMsg.or(firstPoint)).toBeVisible({ timeout: 10_000 });
  });

  test('page is RTL', async ({ page }) => {
    await page.goto('/admin/updates');
    await page.waitForLoadState('networkidle');

    const dir = await page.locator('div[dir="rtl"]').first().getAttribute('dir');
    expect(dir).toBe('rtl');
  });

  test('nav entry "מרכז עדכונים" links to /admin/updates', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // System nav group may need to be opened
    const systemGroup = page.getByText('מערכת');
    if (await systemGroup.isVisible()) {
      await systemGroup.click();
    }

    const navLink = page.getByRole('link', { name: 'מרכז עדכונים' });
    await expect(navLink).toBeVisible({ timeout: 5_000 });
    await navLink.click();
    await page.waitForURL('**/admin/updates');
    await expect(page.getByText('מרכז עדכונים')).toBeVisible();
  });
});
