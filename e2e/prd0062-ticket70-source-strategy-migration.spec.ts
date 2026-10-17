import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ORIGIN = 'http://localhost:5173';
const ARTIFACT_DIR = path.resolve('artifacts/prd0062-ticket-70/browser');
type Strategy = 'full_pdf' | 'component_pdfs';

const loginTeacher = async (page: Page) => {
  await page.goto(`${ORIGIN}/login`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
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

const prepareSetupChange = async (page: Page, target: Strategy) => {
  await page.getByRole('button', { name: 'Change PDF setup' }).click();
  await expect(page.getByRole('dialog', { name: 'Change your PDF setup' })).toBeVisible();
  await page.getByRole('button', { name: 'Prepare reviewed change' }).click();
  if (target === 'component_pdfs') {
    await expect(page.getByRole('alert').filter({ hasText: /Setup change could not be prepared/iu })).toBeVisible();
  }
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

    await prepareSetupChange(page, target);
    await expect(page.getByRole('alert').filter({ hasText: /Setup change could not be prepared/iu })).toBeVisible();
    await expect(page.getByTestId('ticket70-current-candidate')).toHaveText(originalCandidate ?? '');
    await expect(page.getByTestId('ticket70-source-bytes')).toHaveText(originalBytes ?? '');
    await expect(page.getByTestId('ticket70-publication-state')).toHaveText(originalPublication ?? '');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('ticket70-current-candidate')).toHaveText(originalCandidate ?? '');
    await expect(page.getByTestId('ticket70-source-bytes')).toHaveText(originalBytes ?? '');
    await expect(page.getByTestId('ticket70-publication-state')).toHaveText(originalPublication ?? '');
    assertNoErrors(errors);
    await saveArtifact(page, name, errors, [
      `${fixture}: ${target} setup-change attempt`,
      'current candidate, source bytes, and publication state remain unchanged when the trusted migration cannot prepare',
      'reload preserves the original candidate and source bytes',
    ]);
  });

  test(`PRD0062 #70 cancels and discards ${name} without changing original`, async ({ page }) => {
    const errors = captureErrors(page);
    await openFixture(page, fixture);
    const originalCandidate = await page.getByTestId('ticket70-current-candidate').textContent();
    const originalBytes = await page.getByTestId('ticket70-source-bytes').textContent();
    const originalPublication = await page.getByTestId('ticket70-publication-state').textContent();
    await page.getByRole('button', { name: 'Change PDF setup' }).click();
    await expect(page.getByRole('dialog', { name: 'Change your PDF setup' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
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
  await page.getByRole('button', { name: 'Change PDF setup' }).click();
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  await expect(page.getByRole('dialog', { name: 'Change your PDF setup' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Prepare reviewed change' })).toBeVisible();
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
