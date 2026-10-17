import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ORIGIN = 'http://localhost:5173';
const ARTIFACT_DIR = path.resolve('artifacts/prd0062-ticket-66/browser');

const loginTeacher = async (page: Page) => {
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

test('teacher explicitly approves both activated component-PDF Units before publishing', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('@firebase/analytics')) {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await loginTeacher(page);
  await page.goto(`${ORIGIN}/__smoke/book-assembly?fixture=ticket66-component-pdf`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });

  await expect(page.getByRole('heading', { name: 'Component-PDF publication fixture' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('ticket66-component-order')).toContainText('component-a, component-b');
  await expect(page.getByTestId('ticket66-current-publication')).toContainText('none');
  await page.getByRole('button', { name: /Check & preview/iu }).click();
  await page.getByRole('button', { name: 'Preview as a student' }).click();
  await page.getByRole('button', { name: 'Approve this preview' }).click();
  await expect(page.getByRole('button', { name: /5 Publish/iu })).toBeDisabled();
  await page.getByRole('button', { name: 'Preview as a student' }).click();
  await page.getByRole('button', { name: 'Approve this preview' }).click();
  await page.getByRole('button', { name: /5 Publish/iu }).click();
  await page.getByRole('button', { name: 'Publish Book' }).click();
  await page.getByRole('dialog', { name: 'Publish Unit 1?' })
    .getByRole('button', { name: 'Publish Unit 1' }).click();

  await expect(page.getByRole('heading', { name: 'Unit 1 is published' }).last()).toBeVisible();
  await expect(page.getByTestId('ticket66-current-publication')).toContainText('ticket66-flow-component-publication');
  await expect(page.getByTestId('ticket66-version-count')).toContainText('1');
  await expect(page.getByTestId('ticket66-publication-message')).toContainText('Mock component-PDF publication completed.');
  expect(consoleErrors).toEqual([]);

  await mkdir(ARTIFACT_DIR, { recursive: true });
  await page.screenshot({ fullPage: true, path: path.join(ARTIFACT_DIR, `${testInfo.project.name}.png`) });
  await writeFile(path.join(ARTIFACT_DIR, `${testInfo.project.name}.json`), JSON.stringify({
    project: testInfo.project.name,
    route: `${ORIGIN}/__smoke/book-assembly?fixture=ticket66-component-pdf`,
    proof: [
      'teacher quick-login local fixture',
      'two activated component-PDF Units require separate preview and approval actions',
      'publication remains disabled after the first Unit approval',
      'one correlated component activation publishes only after both approvals',
      'current publication readback matches the returned publication receipt',
    ],
    consoleErrors,
  }, null, 2));
});
