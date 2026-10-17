import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const TEACHER_ORIGIN = process.env.PRD0062_TEACHER_ORIGIN ?? 'http://localhost:5173';
const ARTIFACT_DIR = path.resolve('artifacts/prd0062-ticket-57/browser');

const loginTeacher = async (page: Page) => {
  await page.goto(`${TEACHER_ORIGIN}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await expect(async () => {
    if (/\/lobby/u.test(page.url())) return;
    await expect(page.getByRole('button', { name: /dev quick login/iu })).toBeVisible({ timeout: 2_000 });
  }).toPass({ intervals: [1_000, 2_000], timeout: 60_000 });
  if (/\/lobby/u.test(page.url())) return;
  await page.getByRole('button', { name: /dev quick login/iu }).click();
  const teacher = page.locator('#dev-login-teacher');
  await expect(teacher).toBeVisible({ timeout: 10_000 });
  await teacher.click();
  await expect(page).toHaveURL(/\/lobby/u, { timeout: 60_000 });
};

const mapActivity = async (
  page: Page,
  pages: string,
  defaultPage: string,
  activityKey: string,
) => {
  await page.getByLabel('One-based physical pages').fill(pages);
  await page.getByLabel('Default physical page').fill(defaultPage);
  await page.getByLabel('Activity key').fill(activityKey);
  await page.getByRole('button', { name: 'Add mapping' }).click();
};

test.describe('PRD0062 Ticket 57 Assembly mapping browser proof', () => {
  test('teacher maps full and component PDF Units with reload, conflict recovery, zoom, and no PDF request', async ({ page }, testInfo) => {
    const consoleErrors: string[] = [];
    const pdfRequests: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') {
        const text = message.text();
        if (!text.includes('@firebase/analytics: TypeError: Failed to fetch')) consoleErrors.push(text);
      }
    });
    page.on('pageerror', (error) => consoleErrors.push(error.message));
    page.on('request', (request) => {
      const url = request.url().toLowerCase();
      if (url.includes('.pdf') || url.includes('pdf.worker') || url.includes('book-pdf') || url.includes('source-pdf')) {
        pdfRequests.push(request.url());
      }
    });

    await loginTeacher(page);
    await page.goto(`${TEACHER_ORIGIN}/__smoke/book-assembly?fixture=ticket57-full`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    await expect(page.getByText(/Signed in:/u)).toContainText(/teacher|super_admin|user/iu);
    await expect(page.getByRole('radio', { name: 'Full PDF' })).toBeChecked();
    await page.getByRole('button', { name: 'unit: unit-fixture' }).click();
    await mapActivity(page, '4,5', '4', 'activity-full-reading');
    await expect(page.getByRole('list', { name: 'Page Groups' })).toContainText('full pages 4, 5');
    await expect(page.getByRole('list', { name: 'Page Groups' })).toContainText('Default page 4');
    await expect(page.getByRole('list', { name: 'Activity slot order' })).toContainText('activity-full-reading');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Assembly draft saved.')).toBeVisible({ timeout: 10_000 });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('list', { name: 'Page Groups' })).toContainText('activity-full-reading');

    await page.getByRole('button', { name: 'Simulate remote conflict' }).click();
    await mapActivity(page, '6', '6', 'activity-conflict-local');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Current candidate changed. Choose an action.')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Reload current' }).click();
    await expect(page.getByText('Assembly draft reloaded.')).toBeVisible({ timeout: 10_000 });

    await page.goto(`${TEACHER_ORIGIN}/__smoke/book-assembly?fixture=ticket57-component`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await expect(page.getByRole('radio', { name: 'Component PDFs' })).toBeChecked();

    await page.getByRole('button', { name: 'unit: unit-component-a' }).click();
    await expect(page.getByLabel('Mapping source key')).toContainText('source-source-component-a');
    await expect(page.getByLabel('Mapping source key')).not.toContainText('source-source-component-b');
    await mapActivity(page, '2', '2', 'activity-component-a');

    await page.getByRole('button', { name: 'unit: unit-component-b' }).click();
    await expect(page.getByLabel('Mapping source key')).toContainText('source-source-component-b');
    await expect(page.getByLabel('Mapping source key')).not.toContainText('source-source-component-a');
    await mapActivity(page, '2', '2', 'activity-component-b');

    await expect(page.getByRole('list', { name: 'Page Groups' })).toContainText('source-source-component-b pages 2');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Assembly draft saved.')).toBeVisible({ timeout: 10_000 });

    await page.locator('.book-assembly-workspace').evaluate((element) => {
      (element as HTMLElement).style.zoom = '2';
    });
    await expect(page.getByRole('button', { name: 'Save draft' })).toBeVisible();
    const overflow = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 4);
    expect(pdfRequests).toEqual([]);
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
        route: `${TEACHER_ORIGIN}/__smoke/book-assembly?fixture=ticket57-component`,
        viewport: testInfo.project.use.viewport,
        consoleErrors,
        pdfRequests,
        overflow,
        proof: [
          'teacher quick-login',
          'full-PDF source/page mapping',
          'component-PDF branch-scoped source/page mapping with repeated local page numbers',
          'reload persistence',
          'stale CAS conflict recovery',
          '200% zoom and overflow safety',
          'no PDF request from #57 mapping workspace',
        ],
      }, null, 2),
    );
  });
});
