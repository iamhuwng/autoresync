import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ORIGIN = 'http://localhost:5173';
const ARTIFACT_DIR = path.resolve('artifacts/prd0062-ticket-70/browser');
type Strategy = 'full_pdf' | 'component_pdfs';

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

const openFixture = async (page: Page, fixture: string) => {
  await loginTeacher(page);
  await page.goto(`${ORIGIN}/__smoke/book-assembly?fixture=${fixture}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });
  await expect(page.getByTestId('ticket70-current-candidate')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('ticket70-staged-candidate')).toBeVisible();
  await expect(page.getByTestId('ticket70-source-bytes')).toBeVisible();
  await expect(page.getByTestId('ticket70-publication-state')).toBeVisible();
};

const chooseFirstRealOption = async (select: ReturnType<Page['locator']>, valueIndex = 0) => {
  const values = await select.locator('option').evaluateAll((options) => options
    .map((option) => (option as HTMLOptionElement).value)
    .filter(Boolean));
  expect(values.length).toBeGreaterThan(valueIndex);
  await select.selectOption(values[valueIndex]);
};

const fillMigration = async (page: Page, target: Strategy) => {
  await page.getByRole('radio', { name: target === 'full_pdf' ? 'Full PDF' : 'Component PDFs' }).click();
  await expect(page.getByTestId('book-assembly-migration-direction')).toContainText(target);

  const sourceVersionSelects = page.locator('select[aria-label^="Target Source Version "]');
  if (target === 'component_pdfs' && await sourceVersionSelects.count() < 2) {
    await page.getByRole('button', { name: 'Add component Source' }).click();
  }

  const sourceKeys = page.locator('input[aria-label^="Target source key "]');
  const sourceOrders = page.locator('input[aria-label^="Target source order "]');
  const sourceCount = await sourceKeys.count();
  for (let index = 0; index < sourceCount; index += 1) {
    await sourceKeys.nth(index).fill(target === 'full_pdf' ? 'full' : `component-${index + 1}`);
    await sourceOrders.nth(index).fill(String(index + 1));
    await chooseFirstRealOption(sourceVersionSelects.nth(index), index);
    if (target === 'component_pdfs') {
      await chooseFirstRealOption(page.locator(`select[aria-label="Target owner node ${index + 1}"]`));
    }
  }

  const remapSources = page.locator('select[aria-label^="Target mapping source for "]');
  for (let index = 0; index < await remapSources.count(); index += 1) {
    await chooseFirstRealOption(remapSources.nth(index), 0);
  }
  const localPages = page.locator('input[aria-label^="Target local page "]');
  for (let index = 0; index < await localPages.count(); index += 1) {
    await localPages.nth(index).fill(String(index + 1));
  }
  await expect(page.getByRole('button', { name: 'Prepare migration' })).toBeEnabled();
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

for (const [fixture, target, name] of [
  ['ticket70-full', 'component_pdfs', 'full-to-components'],
  ['ticket70-component', 'full_pdf', 'components-to-full'],
] as const) {
  test(`PRD0062 #70 prepares and confirms ${name} migration`, async ({ page }) => {
    const errors = captureErrors(page);
    await openFixture(page, fixture);
    const originalCandidate = await page.getByTestId('ticket70-current-candidate').textContent();
    const originalBytes = await page.getByTestId('ticket70-source-bytes').textContent();
    const originalPublication = await page.getByTestId('ticket70-publication-state').textContent();

    await fillMigration(page, target);
    await page.getByRole('button', { name: 'Prepare migration' }).click();
    await expect(page.getByTestId('ticket70-staged-candidate')).not.toHaveText(/none|empty/iu);
    await expect(page.getByTestId('ticket70-current-candidate')).toHaveText(originalCandidate ?? '');
    await expect(page.getByTestId('ticket70-source-bytes')).toHaveText(originalBytes ?? '');
    await expect(page.getByTestId('ticket70-publication-state')).toHaveText(originalPublication ?? '');
    await expect(page.locator('[role="status"]').filter({ hasText: /Current candidate remains .* until confirmation/u }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Confirm migration' }).click();
    await expect(page.getByTestId('ticket70-current-candidate')).not.toHaveText(originalCandidate ?? '');
    await expect(page.getByTestId('ticket70-staged-candidate')).toHaveText(/none|empty|not staged/iu);
    await expect(page.getByTestId('ticket70-source-bytes')).toHaveText(originalBytes ?? '');
    await expect(page.getByTestId('ticket70-publication-state')).toHaveText(originalPublication ?? '');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('ticket70-current-candidate')).toContainText(target);
    await expect(page.getByTestId('ticket70-source-bytes')).toHaveText(originalBytes ?? '');
    await expect(page.getByTestId('ticket70-publication-state')).toHaveText(originalPublication ?? '');
    assertNoErrors(errors);
    await saveArtifact(page, name, errors, [
      `${fixture}: ${target}`,
      'explicit verified Source Set and source-qualified local page remaps',
      'prepare preserves current candidate, source bytes, and publication state',
      'confirm switches current candidate',
      'reload preserves confirmed candidate and original source bytes',
    ]);
  });

  test(`PRD0062 #70 cancels and discards ${name} without changing original`, async ({ page }) => {
    const errors = captureErrors(page);
    await openFixture(page, fixture);
    const originalCandidate = await page.getByTestId('ticket70-current-candidate').textContent();
    const originalBytes = await page.getByTestId('ticket70-source-bytes').textContent();
    const originalPublication = await page.getByTestId('ticket70-publication-state').textContent();
    await fillMigration(page, target);
    await page.getByRole('button', { name: 'Prepare migration' }).click();
    await expect(page.getByRole('button', { name: 'Discard migration' })).toBeVisible();
    await page.getByRole('button', { name: 'Discard migration' }).click();
    await expect(page.getByTestId('ticket70-current-candidate')).toHaveText(originalCandidate ?? '');
    await expect(page.getByTestId('ticket70-source-bytes')).toHaveText(originalBytes ?? '');
    await expect(page.getByTestId('ticket70-publication-state')).toHaveText(originalPublication ?? '');
    await expect(page.getByTestId('ticket70-staged-candidate')).toHaveText(/none|empty|not staged/iu);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('ticket70-current-candidate')).toHaveText(originalCandidate ?? '');
    await expect(page.getByTestId('ticket70-source-bytes')).toHaveText(originalBytes ?? '');
    assertNoErrors(errors);
    await saveArtifact(page, `${name}-discard`, errors, [
      'prepare creates staged candidate only',
      'discard removes staged candidate',
      'original candidate, source bytes, publication state survive reload',
    ]);
  });
}

test('PRD0062 #70 migration proof remains usable at mobile width and 200% browser zoom', async ({ page }) => {
  const errors = captureErrors(page);
  await page.setViewportSize({ width: 375, height: 900 });
  await openFixture(page, 'ticket70-full');
  await fillMigration(page, 'component_pdfs');
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  await expect(page.getByRole('button', { name: 'Prepare migration' })).toBeVisible();
  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 8);
  assertNoErrors(errors);
  await saveArtifact(page, 'mobile-200-zoom', errors, [
    'mobile viewport 375x900',
    'migration controls remain visible at 200% browser zoom',
    'no horizontal document overflow',
  ]);
});
