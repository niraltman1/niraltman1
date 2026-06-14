import { test, expect } from '@playwright/test';

// All routes from NAV_GROUPS in nav-config.tsx — keep in sync when nav items are added/removed.
const NAV_ROUTES = [
  // home
  '/workspace', '/dashboard', '/search',
  // cases
  '/cases', '/traffic', '/cases/0/workbench',
  // clients
  '/clients', '/contacts',
  // documents
  '/documents', '/collections', '/evidence', '/media', '/queue',
  '/action-queue', '/action-plan', '/insights-review', '/canvas/0',
  // research
  '/templates', '/rules', '/stens', '/precedents', '/library',
  '/legal-corpus', '/entities', '/citations', '/insolvency',
  // ai
  '/agents', '/drafting',
  // office
  '/calendar', '/deadlines', '/tasks', '/communications',
  '/mail', '/gmail', '/ledger', '/activity', '/studies',
  // system
  '/admin', '/admin/mission-control', '/admin/journal',
  '/admin/rbac', '/admin/backup-settings', '/admin/recovery',
  '/support', '/data-migration',
] as const;

test.describe('smoke: ניווט — כל הנתיבים', () => {
  for (const path of NAV_ROUTES) {
    test(`${path} נטען ללא קריסה`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      // Assert the React ErrorBoundary was NOT triggered
      await expect(page.getByText('אירעה שגיאה בלתי צפויה')).toHaveCount(0);
      await expect(page.locator('body')).not.toBeEmpty();
    });
  }
});
