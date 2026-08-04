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

test('PRD0062 #66 publishes one component-PDF Unit through local trusted command fixture', async ({ page }, testInfo) => {
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
  await expect(page.getByRole('radio', { name: 'Component PDF' })).toBeChecked();
  await expect(page.getByTestId('ticket66-component-order')).toContainText('component-a, component-b');
  await expect(page.getByTestId('ticket66-component-owners'))
    .toContainText('component-a=section-component-a, component-b=section-component-a');
  await expect(page.getByTestId('ticket66-source-pins')).toContainText('source-component-a, source-component-b');
  await expect(page.getByTestId('ticket66-current-publication')).toContainText('none');
  await expect(page.getByTestId('ticket66-version-count')).toContainText('0');
  await expect(page.getByRole('button', { name: 'Publish component PDF Unit' })).toBeDisabled();

  await page.getByRole('button', { name: 'Preview component PDF Unit' }).click();
  await expect(page.getByTestId('ticket66-publication-message')).toContainText('Component-PDF preview approved.');
  await page.getByRole('button', { name: 'Publish component PDF Unit' }).click();

  await expect(page.getByTestId('ticket66-current-publication')).toContainText('publication:candidate-ticket56:ticket66');
  await expect(page.getByTestId('ticket66-version-count')).toContainText('1');
  await expect(page.getByTestId('ticket66-activity-version-count')).toContainText('2');
  await expect(page.getByTestId('ticket66-placement-count')).toContainText('2');
  await expect(page.getByTestId('ticket66-unit-projection-count')).toContainText('1');
  await expect(page.getByTestId('ticket66-delivery-plan-count')).toContainText('1');
  await expect(page.getByTestId('ticket66-later-unit-state')).toContainText('no');
  await expect(page.getByTestId('ticket66-component-order')).toContainText('component-a, component-b');
  await expect(page.getByTestId('ticket66-component-owners'))
    .toContainText('component-a=section-component-a, component-b=section-component-a');
  await expect(page.getByTestId('ticket66-source-pins')).toContainText('source-component-a, source-component-b');
  await expect(page.getByTestId('ticket66-canonical-readbacks'))
    .toContainText('activity:activity-ticket66-a:ticket66');
  await expect(page.getByTestId('ticket66-canonical-readbacks'))
    .toContainText('activity:activity-ticket66-b:ticket66');
  await expect(page.getByTestId('ticket66-canonical-readbacks'))
    .toContainText('component-a@source-component-a:1');
  await expect(page.getByTestId('ticket66-canonical-readbacks'))
    .toContainText('component-b@source-component-b:1');
  await expect(page.getByTestId('ticket66-canonical-readbacks')).toContainText('fnv1a64:');
  await expect(page.getByTestId('ticket66-canonical-readbacks'))
    .toContainText('prd0062-ticket56-book@manifest-version:candidate-ticket56:ticket66@publication:candidate-ticket56:ticket66@1@unit-component-a@activity-ticket66-a');
  await expect(page.getByTestId('ticket66-publication-message'))
    .toContainText('Published component-PDF Unit publication:candidate-ticket56:ticket66.');
  await expect(page.getByRole('status').filter({
    hasText: 'Published component-PDF Unit publication:candidate-ticket56:ticket66.',
  })).toBeVisible();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('ticket66-current-publication')).toContainText('publication:candidate-ticket56:ticket66');
  await expect(page.getByTestId('ticket66-version-count')).toContainText('1');
  await expect(page.getByTestId('ticket66-later-unit-state')).toContainText('no');
  await expect(page.getByTestId('ticket66-component-order')).toContainText('component-a, component-b');
  await expect(page.getByTestId('ticket66-component-owners'))
    .toContainText('component-a=section-component-a, component-b=section-component-a');
  await expect(page.getByTestId('ticket66-source-pins')).toContainText('source-component-a, source-component-b');
  await expect(page.getByTestId('ticket66-canonical-readbacks'))
    .toContainText('activity:activity-ticket66-a:ticket66');
  await expect(page.getByTestId('ticket66-canonical-readbacks'))
    .toContainText('activity:activity-ticket66-b:ticket66');
  expect(consoleErrors).toEqual([]);

  await mkdir(ARTIFACT_DIR, { recursive: true });
  await page.screenshot({ fullPage: true, path: path.join(ARTIFACT_DIR, `${testInfo.project.name}.png`) });
  await writeFile(path.join(ARTIFACT_DIR, `${testInfo.project.name}.json`), JSON.stringify({
    project: testInfo.project.name,
    route: `${ORIGIN}/__smoke/book-assembly?fixture=ticket66-component-pdf`,
    proof: [
      'teacher quick-login local fixture',
      'preview approval required before publish',
      'trusted command allocated operation/publication/version IDs before adapter',
      'two component_pdfs sources with exact source version pins, shared owner, and deterministic source order',
      'one selected Unit published with Manifest Version, Activity Versions, Placements, Unit projection, Delivery publication plan, pointer, operation, and audit metadata',
      'later Unit remains incomplete/unpublished',
      'reload preserves immutable publication evidence through URL-scoped fixture state',
      'no deployed route, 50A, 03B, private-B2, or trusted-action activation claim',
    ],
    consoleErrors,
  }, null, 2));
});
