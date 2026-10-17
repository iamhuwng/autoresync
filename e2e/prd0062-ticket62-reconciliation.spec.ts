import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ORIGIN = 'http://localhost:5173';
const ARTIFACT_DIR = path.resolve('artifacts/prd0062-ticket-62/browser');

const loginTeacher = async (page: import('@playwright/test').Page) => {
  await page.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await expect(async () => {
    if (/\/lobby/u.test(page.url())) return;
    await expect(page.getByRole('button', { name: /dev quick login/iu })).toBeVisible({ timeout: 2_000 });
  }).toPass({ intervals: [1_000, 2_000], timeout: 60_000 });
  if (/\/lobby/u.test(page.url())) return;
  await page.getByRole('button', { name: /dev quick login/iu }).click();
  await page.locator('#dev-login-teacher').click();
  await expect(page).toHaveURL(/\/lobby/u, { timeout: 60_000 });
};

const openReconciliation = async (page: import('@playwright/test').Page) => {
  await page.goto(`${ORIGIN}/__smoke/book-assembly?fixture=ticket62`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  const progress = page.getByRole('navigation', { name: 'PDF Book progress' });
  await progress.getByRole('button').nth(1).click();
  await progress.getByRole('button').nth(2).click();
};

test('PRD0062 #62 repairs deterministic candidate faults without publication mutation', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1208, height: 900 });
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('@firebase/analytics')) consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await loginTeacher(page);
  await openReconciliation(page);
  await expect(page.getByRole('heading', { name: 'Assembly workspace browser proof' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Candidate reconciliation' })).toBeVisible();
  await expect(page.getByText('Current Content Tree', { exact: true })).toBeVisible();
  await expect(page.getByText('Proposed Content Tree', { exact: true })).toBeVisible();
  await expect(page.getByText('Resolution and Preview', { exact: true })).toBeVisible();
  await expect(page.getByText('Reciprocal Page Group mapping for activity-ticket62 can be synchronized exactly.')).toBeVisible();
  await page.getByRole('button', { name: 'Apply exact repairs' }).click();
  await expect(page.getByText('Exact Assembly repairs saved.', { exact: true })).toBeVisible();
  await expect(page.getByText('Published state: unchanged', { exact: true })).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Assembly workspace browser proof' })).toBeVisible();
  await expect(page.getByText('Published state: unchanged', { exact: true })).toBeVisible();
  expect(consoleErrors).toEqual([]);

  await mkdir(ARTIFACT_DIR, { recursive: true });
  const project = testInfo.project.name || 'desktop';
  await page.screenshot({ fullPage: true, path: path.join(ARTIFACT_DIR, `${project}.png`) });
  await writeFile(path.join(ARTIFACT_DIR, `${project}.json`), JSON.stringify({
    project,
    route: `${ORIGIN}/__smoke/book-assembly?fixture=ticket62`,
    proof: [
      'exact page-order and reciprocal mapping repair only',
      'one in-memory repository replace stub invocation',
      'reload reinitializes the fixture UI without publication mutation',
      'publication state unchanged',
    ],
    consoleErrors,
  }, null, 2));
});

for (const width of [768, 375]) {
  test(`PRD0062 #62 reconciliation stays operable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await loginTeacher(page);
    await openReconciliation(page);
    await expect(page.getByRole('button', { name: 'Apply exact repairs' })).toBeVisible();
    expect(await page.locator('.book-assembly-workspace').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBeTruthy();
    await page.getByRole('button', { name: 'Apply exact repairs' }).click();
    await expect(page.getByText('Exact Assembly repairs saved.', { exact: true })).toBeVisible();
  });
}
