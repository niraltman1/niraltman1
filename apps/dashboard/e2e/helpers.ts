import { type Page } from '@playwright/test';

/**
 * Wait for the dashboard app to fully load (network idle).
 */
export async function waitForApp(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
}

/**
 * Create a new client via the UI form at /clients.
 * Uses the "לקוח חדש" button and fills the slide-over form.
 * Returns after submission completes.
 */
export async function createClient(
  page: Page,
  nameHe: string,
  idNumber?: string,
): Promise<void> {
  await page.goto('/clients');
  await page.waitForLoadState('networkidle');

  // Click "לקוח חדש" button
  await page.getByRole('button', { name: 'לקוח חדש' }).click();

  // Fill the Hebrew name field (placeholder: ישראל ישראלי)
  await page.getByPlaceholder('ישראל ישראלי').fill(nameHe);

  // Fill ID number if provided
  if (idNumber) {
    await page.getByPlaceholder('000000000').fill(idNumber);
  }

  // Submit — button text is "שמור לקוח"
  await page.getByRole('button', { name: 'שמור לקוח' }).click();

  // Wait for form to close and navigation/query to settle
  await page.waitForLoadState('networkidle');
}

/**
 * Create a new case via the UI at /cases.
 * Requires at least one client to already exist in the DB.
 * Selects the first available client automatically.
 */
export async function createCase(
  page: Page,
  caseNumber: string,
  titleHe: string,
): Promise<void> {
  await page.goto('/cases');
  await page.waitForLoadState('networkidle');

  // Click "תיק חדש" button
  await page.getByRole('button', { name: 'תיק חדש' }).click();

  // Fill case number (placeholder: 2024/1234)
  await page.getByPlaceholder('2024/1234').fill(caseNumber);

  // Fill Hebrew title (placeholder: תיאור קצר)
  await page.getByPlaceholder('תיאור קצר').fill(titleHe);

  // Select the first available client from the <select size=4> list
  await page.locator('select').filter({ hasText: 'בחר לקוח' }).selectOption({ index: 1 });

  // Submit — button text is "שמור תיק"
  await page.getByRole('button', { name: 'שמור תיק' }).click();

  await page.waitForLoadState('networkidle');
}
