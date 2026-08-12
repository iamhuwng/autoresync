import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createPrd0062StudentAccessibilityDeviceFixture } from './prd0062-student-accessibility-device.fixture.mjs';

const origin = 'http://localhost:5174';
const fixtureUrl = '/__smoke/book-runtime?bookId=book-runtime-fixture&unitKey=unit-fixture&strategy=components';

const loginStudent = async (page: Page) => {
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 120_000 });
  if (!/\/student(?:\/|$)/u.test(page.url())) {
    await expect(page.getByRole('button', { name: 'Show dev quick login' })).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: 'Show dev quick login' }).click();
    await page.locator('#dev-login-student').click();
  }
  await expect(page).toHaveURL(/\/student(?:\/|$)/u, { timeout: 60_000 });
};

test('AC-AD-001 keeps Book runtime keyboard, touch, focus, zoom, and overflow contracts', async ({ page }, testInfo) => {
  const fixture = createPrd0062StudentAccessibilityDeviceFixture();
  await loginStudent(page);
  await page.goto(`${origin}${fixtureUrl}&pageGroup=group-1&activity=activity-choice`, {
    waitUntil: 'networkidle',
    timeout: 120_000,
  });
  await expect(page.getByTestId('book-runtime-shell')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('reference-only-pdf')).toBeVisible();
  await page.getByRole('tab', { name: 'Activity' }).click();
  await expect(page.getByRole('heading', { name: 'Main claim', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Collapse page navigator' }).focus();
  await expect(page.getByRole('button', { name: 'Collapse page navigator' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('book-runtime-shell')).toHaveAttribute('data-navigator-collapsed', 'true');
  await page.getByRole('button', { name: 'Expand page navigator' }).click();
  await page.getByRole('button', { name: 'Page Group 2' }).click();
  await expect(page.getByRole('heading', { name: 'Written response', exact: true })).toBeVisible();

  const controls = page.getByTestId('book-runtime-shell').getByRole('button');
  const sizes = await controls.evaluateAll((buttons) => buttons.map((button) => {
    const box = button.getBoundingClientRect();
    return { width: box.width, height: box.height };
  }));
  expect(sizes.every(({ width, height }) => width >= fixture.expected.minimumTouchTargetPx && height >= fixture.expected.minimumTouchTargetPx)).toBe(true);

  await page.getByRole('tab', { name: 'Activity' }).click();
  await expect(page.getByRole('tab', { name: 'Activity' })).toHaveAttribute('aria-selected', 'true');
  const mobileLayout = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(mobileLayout.documentWidth).toBeLessThanOrEqual(mobileLayout.viewportWidth);
  expect(mobileLayout.bodyWidth).toBeLessThanOrEqual(mobileLayout.viewportWidth);

  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  const zoomLayout = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(zoomLayout.documentWidth).toBeLessThanOrEqual(zoomLayout.viewportWidth);
  await page.evaluate(() => { document.documentElement.style.zoom = '1'; });
  await expect(page.locator('body')).not.toContainText(/answerKey|providerObjectKey|privateBucketId/iu);

  const executionId = process.env.PRD0062_EXECUTION_ID ?? 'local';
  const directory = path.resolve(`artifacts/prd0062-acceptance/AC-AD-001/${executionId}`);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'result.json'), JSON.stringify({
    caseId: 'AC-AD-001',
    project: testInfo.project.name,
    status: 'PASS_LOCAL_SMOKE_ASSERTIONS',
    proof: ['student quick-login on localhost:5174', 'keyboard focus and Enter navigation', '44px controls', 'mobile and 200% zoom overflow checks'],
    activation: 'not claimed; #126 is engineering-proof-only and gates remain disabled',
  }, null, 2));
});
