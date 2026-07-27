import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ORIGIN = 'http://localhost:5173';
const ARTIFACT_DIR = path.resolve('artifacts/prd0062-ticket-71/browser');

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
  await page.goto(`${ORIGIN}/__smoke/book-assembly-successor?fixture=${fixture}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });
  await expect(page.getByTestId('book-assembly-successor-direction')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('book-assembly-successor-predecessor')).toBeVisible();
};

const chooseFirstRealOption = async (select: ReturnType<Page['locator']>) => {
  const values = await select.locator('option').evaluateAll((options) => options
    .map((option) => (option as HTMLOptionElement).value)
    .filter(Boolean));
  expect(values.length).toBeGreaterThan(0);
  await select.selectOption(values[0]!);
};

const fillSuccessor = async (page: Page, target: 'component_pdfs' | 'full_pdf') => {
  await chooseFirstRealOption(page.getByRole('combobox', { name: 'Successor Source Version 1' }));
  if (target === 'component_pdfs') {
    await chooseFirstRealOption(page.getByRole('combobox', { name: 'Successor owner node 1' }));
  }
  await chooseFirstRealOption(page.getByRole('combobox', { name: 'Successor mapping source for pages-1' }));
  await page.getByRole('textbox', { name: 'Successor local page pages-1 1' }).fill('1');
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
  ['ticket71-full', 'component_pdfs', 'full-to-components'],
  ['ticket71-component', 'full_pdf', 'components-to-full'],
] as const) {
  test(`PRD0062 #71 publishes ${name} successor and preserves predecessor`, async ({ page }) => {
    const errors = captureErrors(page);
    await openFixture(page, fixture);
    const predecessor = await page.getByTestId('book-assembly-successor-predecessor').textContent();
    await fillSuccessor(page, target);
    await page.getByRole('button', { name: 'Publish successor' }).click();
    await expect(page.getByTestId('ticket71-current-state')).toContainText('successor');
    await expect(page.getByTestId('ticket71-predecessor-state')).toContainText(predecessor ?? 'publication-before');
    await expect(page.getByTestId('ticket71-successor-strategy')).toContainText(target);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('ticket71-current-state')).toContainText('successor');
    await expect(page.getByTestId('ticket71-predecessor-state')).toContainText(predecessor ?? 'publication-before');
    assertNoErrors(errors);
    await saveArtifact(page, name, errors, [
      `${fixture}: ${target}`,
      'teacher successor review requires explicit Source Version and local-page remap',
      'publish creates a separately identified successor',
      'predecessor remains active, immutable, and readable',
      'reload preserves successor state and predecessor proof',
    ]);
  });

  test(`PRD0062 #71 cancels ${name} without changing predecessor`, async ({ page }) => {
    const errors = captureErrors(page);
    await openFixture(page, fixture);
    const predecessor = await page.getByTestId('book-assembly-successor-predecessor').textContent();
    await page.getByRole('button', { name: 'Cancel successor' }).click();
    await expect(page.getByTestId('ticket71-current-state')).toContainText('Predecessor remains active and unchanged');
    await expect(page.getByRole('button', { name: 'Reopen successor review' })).toBeVisible();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('ticket71-current-state')).toContainText('Predecessor remains active and unchanged');
    await expect(page.getByTestId('book-assembly-successor-predecessor')).not.toBeVisible();
    expect(predecessor).toContain('publication-before');
    assertNoErrors(errors);
    await saveArtifact(page, `${name}-cancel`, errors, [
      'cancel performs no publication request',
      'predecessor remains active and unchanged',
      'reload preserves canceled state',
    ]);
  });
}

test('PRD0062 #71 successor review remains usable on mobile at 200% zoom', async ({ page }) => {
  const errors = captureErrors(page);
  await page.setViewportSize({ width: 375, height: 900 });
  await openFixture(page, 'ticket71-full');
  await fillSuccessor(page, 'component_pdfs');
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  await expect(page.getByRole('button', { name: 'Publish successor' })).toBeVisible();
  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 8);
  assertNoErrors(errors);
  await saveArtifact(page, 'mobile-200-zoom', errors, [
    'mobile viewport 375x900',
    'successor controls remain visible at 200% browser zoom',
    'no horizontal document overflow',
  ]);
});
