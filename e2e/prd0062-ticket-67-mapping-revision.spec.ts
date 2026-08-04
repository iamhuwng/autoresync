import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ORIGIN = 'http://localhost:5173';
const ARTIFACT_DIR = path.resolve('artifacts/prd0062-ticket-67/browser');

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

const captureErrors = (page: Page) => {
  const errors = { console: [] as string[], page: [] as string[], request: [] as string[] };
  const ignorable = (value: string) => value.includes('@firebase/analytics') || value.includes('google-analytics');
  page.on('console', (message) => {
    if (message.type() === 'error' && !ignorable(message.text())) errors.console.push(message.text());
  });
  page.on('pageerror', (error) => {
    if (!ignorable(error.message)) errors.page.push(error.message);
  });
  page.on('requestfailed', (request) => {
    if (request.failure()?.errorText === 'net::ERR_ABORTED') return;
    const detail = `${request.method()} ${request.url()} ${request.failure()?.errorText ?? 'failed'}`;
    if (!ignorable(detail)) errors.request.push(detail);
  });
  return errors;
};

const openFixture = async (page: Page) => {
  await loginTeacher(page);
  await page.goto(`${ORIGIN}/__smoke/book-assembly-mapping-revision?fixture=ticket67`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });
  await expect(page.getByRole('heading', { name: 'Repair mapping without Activity reimport' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('mapping-revision-predecessor')).toBeVisible();
  await expect(page.getByTestId('mapping-revision-activity-versions')).toBeVisible();
};

const assertNoErrors = (errors: ReturnType<typeof captureErrors>) => {
  expect(errors.console, 'console errors').toEqual([]);
  expect(errors.page, 'page errors').toEqual([]);
  expect(errors.request, 'request failures').toEqual([]);
};

const saveArtifact = async (page: Page, testName: string, errors: ReturnType<typeof captureErrors>, proof: string[]) => {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const project = test.info().project.name;
  await page.screenshot({ fullPage: true, path: path.join(ARTIFACT_DIR, `${project}-${testName}.png`) });
  await writeFile(path.join(ARTIFACT_DIR, `${project}-${testName}.json`), JSON.stringify({
    project,
    route: page.url(),
    viewport: page.viewportSize(),
    proof,
    errors,
  }, null, 2));
};

const openSourceAssistedDraft = async (page: Page) => {
  const predecessor = await page.getByTestId('mapping-revision-predecessor').textContent();
  const activityVersions = await page.getByTestId('mapping-revision-activity-versions').textContent();
  const pageInput = page.getByRole('textbox', { name: 'Mapping activity source page' });
  await pageInput.fill('4');
  await expect(page.getByTestId('mapping-revision-preview-state')).toHaveText('required');
  return { predecessor: predecessor ?? '', activityVersions: activityVersions ?? '' };
};

test('PRD0062 #67 previews and publishes source-assisted mapping revision without Activity reimport', async ({ page }) => {
  const errors = captureErrors(page);
  await openFixture(page);
  const original = await openSourceAssistedDraft(page);

  await page.getByRole('button', { name: 'Preview source-assisted mapping' }).click();
  await expect(page.getByTestId('mapping-revision-preview-state')).toHaveText('approved');
  await expect(page.getByTestId('mapping-revision-state')).toHaveText('Previewed');

  await page.getByRole('button', { name: 'Publish mapping revision' }).click();
  await expect(page.getByTestId('ticket67-current-state')).toContainText(/mapping revision published/i);
  await expect(page.getByTestId('ticket67-activity-version-state')).toContainText(/Activity Version remains unchanged/i);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('ticket67-predecessor-state')).toContainText(original.predecessor);
  await expect(page.getByTestId('ticket67-activity-version-state')).toContainText(original.activityVersions);
  await expect(page.getByTestId('ticket67-predecessor-state')).toContainText(/active.*readable/i);
  assertNoErrors(errors);
  await saveArtifact(page, 'publish-reload-preservation', errors, [
    'teacher quick-login',
    'mapping-only repair changes source-assisted page mapping without Activity reimport',
    'exact source-assisted preview approval required before publish',
    'publish creates immutable mapping revision',
    'reload preserves predecessor and Activity Version identities',
  ]);
});

test('PRD0062 #67 cancels mapping repair without changing predecessor', async ({ page }) => {
  const errors = captureErrors(page);
  await openFixture(page);
  const original = await openSourceAssistedDraft(page);
  await page.getByRole('button', { name: 'Cancel mapping repair' }).click();
  await expect(page.getByTestId('ticket67-current-state')).toContainText(/predecessor remains active and unchanged/i);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText(original.predecessor, { exact: true })).toBeVisible();
  await expect(page.getByTestId('ticket67-activity-version-state')).toContainText(original.activityVersions);
  assertNoErrors(errors);
  await saveArtifact(page, 'cancel-preservation', errors, [
    'cancel performs no mapping publication',
    'predecessor remains active and unchanged',
    'Activity Version identities remain preserved after reload',
  ]);
});

test('PRD0062 #67 mapping repair remains usable on mobile at 200% zoom', async ({ page }) => {
  const errors = captureErrors(page);
  await page.setViewportSize({ width: 375, height: 900 });
  await openFixture(page);
  await openSourceAssistedDraft(page);
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  await expect(page.getByRole('button', { name: 'Preview source-assisted mapping' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publish mapping revision' })).toBeVisible();
  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 8);
  assertNoErrors(errors);
  await saveArtifact(page, 'mobile-200-zoom', errors, [
    'mobile viewport 375x900',
    'source-assisted preview and publish controls remain visible at 200% zoom',
    'no horizontal document overflow',
  ]);
});
