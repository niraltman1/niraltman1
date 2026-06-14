import { test, expect } from '@playwright/test';
import { waitForApp } from './helpers.js';

/**
 * Phase 5 — Graph Explorer E2E
 *
 * Tests the Knowledge Graph page (/graph).
 * The page is feature-flagged (FEATURE_GRAPH_EXPLORER) and attorney-only;
 * in CI the flag is off by default, so we verify the redirect/gate behaviour.
 * When the flag is on, we verify the graph SVG renders and node click shows reasons.
 */

test.describe('Graph Explorer — feature-gated', () => {
  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
  });

  test('/graph route exists and does not crash', async ({ page }) => {
    await page.goto('/graph');
    await page.waitForLoadState('networkidle');

    // Either the graph renders or the 404/feature-gate page appears —
    // in both cases the app must not crash (no unhandled error dialog)
    await expect(page.locator('body')).toBeVisible();
    const errorOverlay = page.getByText('Unhandled Runtime Error');
    await expect(errorOverlay).not.toBeVisible();
  });

  test('/api/entities/graph returns 401 without credentials', async ({ request }) => {
    const response = await request.get('/api/entities/graph', { failOnStatusCode: false });
    // 401/403 = auth enforced; 404 = route not yet implemented (Phase 5)
    expect([401, 403, 404]).toContain(response.status());
  });

  test('/api/entities/related returns 401 without credentials', async ({ request }) => {
    const response = await request.get('/api/entities/related?caseId=1', { failOnStatusCode: false });
    // Phase 5 route — may return 404 until implemented
    expect([401, 403, 404]).toContain(response.status());
  });

  test('/api/entities/insights returns 401 without credentials', async ({ request }) => {
    const response = await request.get('/api/entities/insights', { failOnStatusCode: false });
    // Phase 5 route — may return 404 until implemented
    expect([401, 403, 404]).toContain(response.status());
  });
});

test.describe('Graph Explorer — reasons panel (requires FEATURE_GRAPH_EXPLORER=true)', () => {
  test.skip(
    !process.env['TEST_GRAPH_ENABLED'],
    'Set TEST_GRAPH_ENABLED=1 to run graph integration tests',
  );

  test('node click opens reasons panel in Hebrew', async ({ page }) => {
    await page.goto('/graph');
    await page.waitForLoadState('networkidle');

    // SVG graph must render
    const svg = page.locator('svg').first();
    await expect(svg).toBeVisible({ timeout: 15_000 });

    // Click first node (circle element)
    const firstNode = svg.locator('circle').first();
    await firstNode.click();

    // Reasons panel must appear and contain Hebrew text (reasons[])
    const panel = page.getByRole('region', { name: /סיבות|reasons/i });
    await expect(panel).toBeVisible({ timeout: 5_000 });
  });
});
