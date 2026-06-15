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

    // Page heading must be visible (use heading role to avoid matching sidebar nav span)
    await expect(page.getByRole('heading', { name: 'מרכז עדכונים' })).toBeVisible();

    // All main sections must be present — use heading role to avoid matching paragraph text
    // that contains partial substring of section names (e.g. "אין נקודות שחזור.")
    await expect(page.getByRole('heading', { name: 'מצב המערכת' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'בריאות המערכת לאחר עדכון' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'נקודות שחזור' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'היסטוריית עדכונים' })).toBeVisible();
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
    // Navigate directly to /admin/updates — this causes the sidebar to auto-expand
    // the 'system' group (it tracks the active route) making the link visible.
    await page.goto('/admin/updates');
    await page.waitForLoadState('networkidle');

    // The active-route sidebar should show the מרכז עדכונים link
    const navLink = page.getByRole('link', { name: 'מרכז עדכונים' });
    await expect(navLink).toBeVisible({ timeout: 5_000 });
    await expect(navLink).toHaveAttribute('href', /admin\/updates/);
    await expect(page.getByRole('heading', { name: 'מרכז עדכונים' })).toBeVisible();
  });
});
