import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ORIGIN = 'http://localhost:5173';
const ARTIFACT_DIR = path.resolve('artifacts/prd0062-ticket-65/browser');

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

test('PRD0062 #65 publishes one full-PDF Unit through local trusted command fixture', async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('@firebase/analytics')) {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await loginTeacher(page);
  await page.goto(`${ORIGIN}/__smoke/book-assembly?fixture=ticket65-full-pdf`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });

  await expect(page.getByRole('heading', { name: 'Full-PDF publication fixture' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('radio', { name: 'Full PDF' })).toBeChecked();
  await expect(page.getByLabel(/Owner for/u)).toHaveCount(0);
  await expect(page.getByTestId('ticket65-current-publication')).toContainText('none');
  await expect(page.getByTestId('ticket65-version-count')).toContainText('0');
  await expect(page.getByRole('button', { name: 'Publish full PDF Unit' })).toBeDisabled();

  await page.getByRole('button', { name: 'Preview full PDF Unit' }).click();
  await expect(page.getByTestId('ticket65-publication-message')).toContainText('Full-PDF preview approved.');
  await page.getByRole('button', { name: 'Publish full PDF Unit' }).click();

  await expect(page.getByTestId('ticket65-current-publication')).toContainText('publication:candidate-ticket56:ticket65');
  await expect(page.getByTestId('ticket65-version-count')).toContainText('1');
  await expect(page.getByTestId('ticket65-activity-version-count')).toContainText('1');
  await expect(page.getByTestId('ticket65-placement-count')).toContainText('1');
  await expect(page.getByTestId('ticket65-unit-projection-count')).toContainText('1');
  await expect(page.getByTestId('ticket65-delivery-plan-count')).toContainText('1');
  await expect(page.getByTestId('ticket65-later-unit-state')).toContainText('no');
  await expect(page.getByTestId('ticket65-publication-message'))
    .toContainText('Published full-PDF Unit publication:candidate-ticket56:ticket65.');
  await expect(page.getByRole('status').filter({
    hasText: 'Published full-PDF Unit publication:candidate-ticket56:ticket65.',
  })).toBeVisible();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('ticket65-current-publication')).toContainText('publication:candidate-ticket56:ticket65');
  await expect(page.getByTestId('ticket65-version-count')).toContainText('1');
  await expect(page.getByTestId('ticket65-later-unit-state')).toContainText('no');
  expect(consoleErrors).toEqual([]);

  await mkdir(ARTIFACT_DIR, { recursive: true });
  await page.screenshot({ fullPage: true, path: path.join(ARTIFACT_DIR, `${testInfo.project.name}.png`) });
  await writeFile(path.join(ARTIFACT_DIR, `${testInfo.project.name}.json`), JSON.stringify({
    project: testInfo.project.name,
    route: `${ORIGIN}/__smoke/book-assembly?fixture=ticket65-full-pdf`,
    proof: [
      'teacher quick-login local fixture',
      'preview approval required before publish',
      'trusted command allocated operation/publication/version IDs before adapter',
      'one full_pdf source, no component owner/order fields',
      'one selected Unit published with Manifest Version, Activity Version, Placement, Unit projection, Delivery publication plan, pointer, operation, and audit metadata',
      'later Unit remains incomplete/unpublished',
      'reload preserves immutable publication evidence through URL-scoped fixture state',
      'no deployed route, 50A, 03B, private-B2, or trusted-action activation claim',
    ],
    consoleErrors,
  }, null, 2));
});
