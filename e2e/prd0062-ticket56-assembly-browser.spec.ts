import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const TEACHER_ORIGIN = 'http://localhost:5173';
const ARTIFACT_DIR = path.resolve('artifacts/prd0062-ticket-56/browser');

const loginTeacher = async (page: Page) => {
  await page.goto(`${TEACHER_ORIGIN}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await expect(async () => {
    if (/\/lobby/u.test(page.url())) return;
    await expect(page.getByRole('button', { name: /dev quick login/iu })).toBeVisible({ timeout: 2_000 });
  }).toPass({ intervals: [1_000, 2_000], timeout: 60_000 });
  if (/\/lobby/u.test(page.url())) return;
  const toggle = page.getByRole('button', { name: /dev quick login/iu });
  await toggle.click();
  const teacher = page.locator('#dev-login-teacher');
  await expect(teacher).toBeVisible({ timeout: 10_000 });
  await teacher.click();
  await expect(page).toHaveURL(/\/lobby/u, { timeout: 60_000 });
};

const bindFirstAvailable = async (page: Page, index: number) => {
  await page.getByRole('button', { name: 'Bind' }).nth(index).click();
};

test.describe('PRD0062 Ticket 56 Assembly Workspace browser proof', () => {
  test('teacher edits full and component Assembly candidates with reload and conflict recovery', async ({ page }, testInfo) => {
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') {
        const text = message.text();
        if (!text.includes('@firebase/analytics: TypeError: Failed to fetch')) {
          consoleErrors.push(text);
        }
      }
    });
    page.on('pageerror', (error) => {
      consoleErrors.push(error.message);
    });

    await loginTeacher(page);
    await page.goto(`${TEACHER_ORIGIN}/__smoke/book-assembly?fixture=ticket56`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    await expect(page.getByRole('heading', { name: 'Assembly workspace browser proof' })).toBeVisible();
    await expect(page.getByText(/Signed in:/u)).toContainText(/teacher|super_admin|user/iu);
    await expect(page.getByRole('heading', { name: 'Verified Source Versions' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Full PDF' })).toBeChecked();
    await expect(page.getByRole('button', { name: 'Bind' }).nth(3)).toBeDisabled();

    await bindFirstAvailable(page, 0);
    await page.getByRole('button', { name: 'Add section' }).click();
    await page.getByRole('button', { name: 'Add unit' }).click();
    await expect(page.getByRole('treeitem').nth(1)).toHaveAttribute('aria-level', '2');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Assembly draft saved.')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('ticket56-dirty-state')).toContainText('no');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: 'Bound' }).first()).toBeVisible();
    await expect(page.getByTestId('ticket56-dirty-state')).toContainText('no');

    await page.getByRole('button', { name: /^unit: unit-/u }).click();
    await page.getByRole('radio', { name: 'Component PDFs' }).click();
    await bindFirstAvailable(page, 1);
    await bindFirstAvailable(page, 1);
    await expect(page.getByRole('list', { name: 'Component source order' })).toContainText('1. source-source-component-a');
    await expect(page.getByRole('list', { name: 'Component source order' })).toContainText('2. source-source-component-b');
    await page.getByRole('button', { name: 'Move source-source-component-b up' }).click();
    await expect(
      page.getByRole('list', { name: 'Component source order' }).getByRole('listitem').first(),
    ).toContainText('1. source-source-component-b');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Assembly draft saved.')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Simulate remote conflict' }).click();
    await page.getByRole('button', { name: 'Add test' }).click();
    await page.getByRole('button', { name: /^unit: unit-/u }).click();
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Current candidate changed. Choose an action.')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Retry local' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Discard local' })).toBeVisible();
    await page.getByRole('button', { name: 'Reload current' }).click();
    await expect(page.getByText('Assembly draft reloaded.')).toBeVisible({ timeout: 10_000 });

    await page.locator('.book-assembly-workspace').evaluate((element) => {
      (element as HTMLElement).style.zoom = '2';
    });
    await expect(page.getByRole('button', { name: 'Save draft' })).toBeVisible();
    await expect(page.getByRole('tree', { name: 'Assembly hierarchy tree' })).toBeVisible();

    const overflow = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 4);
    expect(consoleErrors).toEqual([]);

    await mkdir(ARTIFACT_DIR, { recursive: true });
    await page.screenshot({
      fullPage: true,
      path: path.join(ARTIFACT_DIR, `${testInfo.project.name}.png`),
    });
    await writeFile(
      path.join(ARTIFACT_DIR, `${testInfo.project.name}.json`),
      JSON.stringify({
        project: testInfo.project.name,
        route: `${TEACHER_ORIGIN}/__smoke/book-assembly?fixture=ticket56`,
        viewport: testInfo.project.use.viewport,
        consoleErrors,
        overflow,
        proof: [
          'teacher quick-login',
          'full_pdf candidate save and reload',
          'component_pdfs ownership/order',
          'stale CAS conflict reload/retry/discard choices',
          '200% zoom visible controls',
        ],
      }, null, 2),
    );
  });
});
