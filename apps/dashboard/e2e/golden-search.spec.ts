import { test, expect } from '@playwright/test';
import { waitForApp, createClient } from './helpers.js';

test.describe('golden: חיפוש עברי', () => {
  test('חיפוש בעברית מחזיר את הרשומה', async ({ page }) => {
    // 1. טען אפליקציה וצור לקוח ייחודי לחיפוש
    await waitForApp(page);
    await createClient(page, 'שרה לוי-ביטון', '034771540');

    // 2. נווט לדף חיפוש גלובלי
    await page.goto('/search');
    await page.waitForLoadState('networkidle');

    // 3. הקלד חיפוש בעברית — תיבת חיפוש
    const searchInput = page.locator(
      'input[type="search"], input[placeholder*="חיפוש"], input[placeholder*="search"]',
    ).first();
    await searchInput.fill('שרה לוי');
    await page.waitForTimeout(600); // המתן לדיבאונס

    // 4. המתן לסיום טעינה
    await page.waitForLoadState('networkidle');

    // 5. ודא שהרשומה מופיעה בתוצאות
    await expect(page.getByText('שרה לוי-ביטון')).toBeVisible({ timeout: 10_000 });
  });

  test('חיפוש בסרגל הלקוחות עובד עם עברית', async ({ page }) => {
    // צור לקוח ייחודי לחיפוש ב-/clients
    await waitForApp(page);
    await createClient(page, 'דוד מזרחי-שלום', '047337855');

    // חיפוש בדף לקוחות — input[type="search"]
    await page.goto('/clients');
    await page.waitForLoadState('networkidle');

    const searchInput = page.locator('input[type="search"]').first();
    await searchInput.fill('מזרחי');

    // ודא שהלקוח מסונן ומופיע (חיפוש מקומי ב-client-side)
    await expect(page.getByText('דוד מזרחי-שלום')).toBeVisible({ timeout: 5_000 });
  });
});
