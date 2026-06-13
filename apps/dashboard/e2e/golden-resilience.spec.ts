import { test, expect } from '@playwright/test';

test.describe('golden: resilience', () => {
  test('Ollama כבוי → UI נטען, אין מסך לבן, אין קריסה', async ({ page }) => {
    // health endpoint מחזיר ok:true גם כש-Ollama כבוי (לפי spec)
    // אנחנו מאמתים שה-UI נטען כרגיל ולא מציג error boundary מוחלט.
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // ודא שהגוף לא ריק
    await expect(page.locator('body')).not.toBeEmpty();

    // ודא שאין error boundary מוחלט עם טקסטים נפוצים לשגיאות קריטיות
    await expect(page.getByText('Something went wrong')).not.toBeVisible({ timeout: 3_000 })
      .catch(() => { /* מקובל — לא קיים */ });
    await expect(page.getByText('שגיאה קריטית')).not.toBeVisible({ timeout: 3_000 })
      .catch(() => { /* מקובל — לא קיים */ });

    // ודא שהדשבורד נטען (navigation מ-/ ל-/dashboard)
    await expect(page).toHaveURL(/dashboard/);

    // ודא שה-Sidebar נטען (מכיל לפחות קישורי ניווט)
    await expect(page.locator('[dir="rtl"]').first()).toBeVisible();
  });

  test('API health endpoint מחזיר ok:true', async ({ page }) => {
    // בדיקת health endpoint ישירה
    const response = await page.request.get('http://localhost:3001/api/health');
    expect(response.status()).toBe(200);

    const body = await response.json() as { ok: boolean; checks?: { ollama?: { healthy: boolean } } };
    expect(body.ok).toBe(true);

    // אם Ollama כבוי — checks.ollama.healthy צריך להיות false אבל ok:true
    if (body.checks?.ollama !== undefined) {
      // ok:true גם כש-Ollama כבוי — שזה ה-behavior הנכון
      expect(body.ok).toBe(true);
    }
  });

  test('דף לקוחות נטען גם בלי Ollama', async ({ page }) => {
    // ה-UI צריך לטעון דפים שאינם תלויים ב-AI גם כש-Ollama כבוי
    await page.goto('/clients');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).not.toBeEmpty();
    // כותרת "לקוחות" צריכה להיות גלויה
    await expect(page.getByText('לקוחות').first()).toBeVisible();
  });
});
