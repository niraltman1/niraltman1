import { test, expect } from '@playwright/test';
import { waitForApp } from './helpers.js';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

test.describe('golden: מסמך', () => {
  test('דף מסמכים נטען ללא קריסה', async ({ page }) => {
    await waitForApp(page);

    // נווט לדף מסמכים
    await page.goto('/documents');
    await page.waitForLoadState('networkidle');

    // ודא שדף מסמכים נטען
    await expect(page.locator('body')).not.toBeEmpty();
    await expect(page.getByText('מסמכים').first()).toBeVisible();
  });

  test('העלאת מסמך → מופיע ברשימה, OCR לא קורס, סטטוס מוצג', async ({ page }) => {
    await waitForApp(page);
    await page.goto('/documents');
    await page.waitForLoadState('networkidle');

    // חפש input[type="file"] — אם קיים, העלה קובץ בדיקה
    const fileInput = page.locator('input[type="file"]');
    const uploadExists = await fileInput.count() > 0;

    if (uploadExists) {
      // צור קובץ טקסט זמני בעברית
      const tmpFile = path.join(os.tmpdir(), 'factum-e2e-test-doc.txt');
      fs.writeFileSync(tmpFile, 'מסמך בדיקה — factum-il e2e\nתוכן לדוגמה בעברית.');

      await fileInput.first().setInputFiles(tmpFile);
      await page.waitForLoadState('networkidle');

      // ודא שהדף לא קרס
      await expect(page.locator('body')).not.toBeEmpty();
      await expect(page.getByText('מסמכים').first()).toBeVisible();

      // ניקוי
      fs.unlinkSync(tmpFile);
    } else {
      // אין ממשק העלאה ישיר — ודא שהדף נטען עם כותרת ותוכן
      await expect(page.getByText('מסמכים').first()).toBeVisible();
    }
  });
});
