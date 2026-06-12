import { test, expect } from '@playwright/test';
import { waitForApp, createClient, createCase } from './helpers.js';

test.describe('golden: לקוח ותיק', () => {
  test('יצירת לקוח → תיק → מופיע ברשימות', async ({ page }) => {
    // 1. טען את האפליקציה
    await waitForApp(page);

    // 2. צור לקוח עברי חדש (ת.ז. תקינה)
    await createClient(page, 'ישראל כהן', '025364527');

    // 3. ודא שהלקוח מופיע ברשימת הלקוחות
    await page.goto('/clients');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('ישראל כהן')).toBeVisible();

    // 4. צור תיק עם מספר בפורמט ישראלי (תא-YYYY-NNN)
    await createCase(page, 'תא-2024-001', 'תביעה אזרחית לפיצויים');

    // 5. ודא שהתיק מופיע ברשימת תיקים
    await page.goto('/cases');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('תא-2024-001')).toBeVisible();

    // 6. ודא כותרת התיק מוצגת
    await expect(page.getByText('תביעה אזרחית לפיצויים')).toBeVisible();
  });
});
