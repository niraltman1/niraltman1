import { type Page, expect } from '@playwright/test';

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

  // Wait for CaseForm's useClients(1,100) fetch to finish: at least one non-disabled option
  // must appear before we can select a client.
  const clientSelect = page.locator('select').filter({ hasText: 'בחר לקוח' });
  await expect(clientSelect.locator('option:not([disabled])')).not.toHaveCount(0, { timeout: 15_000 });

  // Use keyboard navigation to select the first real client. Playwright's selectOption
  // and evaluate-based event dispatch don't reliably trigger React 18's synthetic
  // onChange in headless Chrome. Keyboard input is the most fundamental interaction
  // path and is guaranteed to fire the native change event that React delegates.
  //
  // Two ArrowDown presses: covers both Chrome behaviours — (a) skips the disabled
  // placeholder on the first press and lands on the first enabled option, then the
  // second press is a no-op (stays on the only option); or (b) lands on the disabled
  // placeholder first, then the second press moves to the first enabled option.
  await clientSelect.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');

  // Wait for React to reflect the selection (button becomes enabled once clientId !== '').
  // CasesPage uses NewCaseWizard whose step-1 footer button is 'המשך', not 'שמור תיק'.
  const submitBtn = page.getByRole('button', { name: 'המשך' });
  await expect(submitBtn).toBeEnabled({ timeout: 5_000 });
  await submitBtn.click();

  // After 'המשך' is clicked, the wizard calls createCase.mutateAsync then moves to
  // step 2 (template).  waitForLoadState('networkidle') covers both the POST /cases
  // call and the subsequent GET /templates/by-caseType fetch before we navigate away.
  await page.waitForLoadState('networkidle');
}
