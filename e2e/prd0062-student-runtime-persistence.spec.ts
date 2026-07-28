import { expect, test } from '@playwright/test';
import {
  buildStudentRuntimeFixturePlan,
  STUDENT_RUNTIME_CASES,
  STUDENT_RUNTIME_CONTRACTS,
  STUDENT_RUNTIME_METRIC_IDS,
} from './prd0062-student-runtime-persistence-fixtures.mjs';

const EXPECTED_CANONICAL_SOURCES = [
  {
    sourceName: 'IELTS Grammar for Bands 6.5 and Above',
    fixtureId: 'canonical-grammar-structured-full',
    interactionNotes: [
      'Listening note-completion must be inspected when present; title alone never proves support.',
      'Reading matching must be inspected when present; title alone never proves support.',
      'Reading Yes/No/Not Given must be inspected when present; title alone never proves support.',
    ],
  },
  {
    sourceName: 'IELTS Vocabulary up to Band 6.0',
    fixtureId: 'canonical-vocab-under6-source-assisted-components',
    interactionNotes: [
      'Listening note-completion is an explicit inspection target; do not infer it from the source title.',
      'Reading matching is an explicit inspection target; do not infer it from the source title.',
      'Reading Yes/No/Not Given is an explicit inspection target; do not infer it from the source title.',
    ],
  },
  {
    sourceName: 'IELTS Vocabulary for Bands 6.5 and Above',
    fixtureId: 'canonical-vocab-high-reference-pages',
    interactionNotes: [
      'Inspect the supplied Listening note-completion practice explicitly; title inference is prohibited.',
      'Inspect the supplied Reading matching practice explicitly; title inference is prohibited.',
      'Inspect the supplied Reading Yes/No/Not Given practice explicitly; title inference is prohibited.',
    ],
  },
] as const;

test('51C1 fixture plan is deterministic and retains student runtime contracts', () => {
  const first = buildStudentRuntimeFixturePlan();
  const second = buildStudentRuntimeFixturePlan();

  expect(first).toEqual(second);
  expect(first.caseIds).toEqual(STUDENT_RUNTIME_CASES.map(({ id }) => id));
  expect(first.caseIds).toEqual([
    'student-desktop-runtime',
    'student-mobile-runtime',
    'student-autosave-resume',
    'student-submit-results',
    'cross-feature-launch-results',
  ]);
  expect(first.contracts).toEqual(STUDENT_RUNTIME_CONTRACTS);
  expect(first.canonicalSources).toEqual(EXPECTED_CANONICAL_SOURCES);
  expect(first.interactionNotes).toEqual(EXPECTED_CANONICAL_SOURCES.flatMap(
    ({ sourceName, interactionNotes }) => interactionNotes.map((note) => ({ sourceName, note })),
  ));
  expect(first.metricIds).toEqual(STUDENT_RUNTIME_METRIC_IDS);
  expect(first.metricIds).toEqual(expect.arrayContaining([
    'correction-rate',
    'unsupported-interaction-patterns',
    'import-errors',
    'runtime-issues',
    'teacher-effort',
    'upload-latency',
    'stream-start-latency',
    'pdf-range-payload',
    'autosave-write-ack',
    'worker-b2-operations',
    'cache-behavior',
  ]));
  expect(first.retryContract.replayCount).toBe(2);
  expect(first.fixtures.every(({ cleanup }) => (
    cleanup.every((target) => target.startsWith('prd0062-51a/'))
  ))).toBe(true);
  expect(first.rollout).toEqual({
    mode2: 'disabled-by-default',
    mutation: 'denied',
    proof: 'safe-preflight-only',
  });
});

test('51C1 student preflight records the safe 50A deny boundary', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Show dev quick login' }).click();
  await page.locator('#dev-login-student').click();
  await expect(page).toHaveURL(/\/student\/?$/u, { timeout: 60_000 });

  const dashboardHeading = page.getByRole('heading', { name: 'Dashboard', exact: true });
  await expect(dashboardHeading).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/Book Mode 2|PDF source/iu)).toHaveCount(0);
  await dashboardHeading.screenshot({
    path: 'artifacts/prd0062-ticket-51c1/browser/50a-deny-preflight.png',
  });

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('28B student runtime saves, resumes, retries, and preserves conflicts', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const quickLogin = page.getByRole('button', { name: 'Show dev quick login' });
  await expect(quickLogin).toBeVisible({ timeout: 60_000 });
  await quickLogin.click();
  await page.locator('#dev-login-student').click();
  await expect(page).toHaveURL(/\/student\/?$/u, { timeout: 60_000 });
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible({ timeout: 60_000 });
  await page.evaluate(() => {
    localStorage.removeItem('prd0062-book-runtime-worker-fixture-v1');
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('book-runtime-draft:v1:')) localStorage.removeItem(key);
    }
  });

  await page.goto(
    '/__smoke/book-runtime?bookId=book-runtime-fixture&unitKey=unit-fixture',
    { waitUntil: 'domcontentloaded' },
  );
  const persistence = page.getByTestId('book-runtime-persistence');
  await expect(page.getByRole('heading', { name: 'Main claim', exact: true })).toBeVisible();
  await expect(persistence).toHaveAttribute('data-status', 'saved', { timeout: 10_000 });

  await page.getByRole('radio', { name: 'Statement A' }).check();
  await expect(persistence).toHaveAttribute('data-status', 'saved', { timeout: 10_000 });

  await page.getByRole('button', { name: 'Next Activity' }).click();
  await expect(page.getByRole('heading', { name: 'Source detail', exact: true })).toBeVisible();
  await expect(page.getByText('Book Page 3 · Exercise 1.', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Enter the missing phrase.' }).fill('the missing phrase');
  await expect(persistence).toHaveAttribute('data-status', 'saved', { timeout: 10_000 });

  await page.getByRole('button', { name: 'Next Activity' }).click();
  await expect(page.getByRole('heading', { name: 'Written response', exact: true })).toBeVisible();
  const longResponse = page.locator('textarea').first();
  await longResponse.fill('The author supports the claim with the source evidence.');
  await expect(page.getByRole('status', { name: 'Activity save status' })).toHaveText(/saved|response saved/iu, { timeout: 10_000 });
  await expect(page.getByText('Pending review', { exact: false })).toBeVisible();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Written response', exact: true })).toBeVisible();
  await expect(page.locator('textarea').first()).toHaveValue('the author supports the claim with the source evidence.');
  await expect(persistence).toHaveAttribute('data-status', 'saved', { timeout: 10_000 });

  await page.getByRole('button', { name: 'Force next Worker failure' }).click();
  await page.locator('textarea').first().fill('The revised response remains locally recoverable.');
  await expect(persistence).toHaveAttribute('data-status', /retrying|saved/u, { timeout: 10_000 });
  await expect(persistence).toHaveAttribute('data-status', 'saved', { timeout: 10_000 });

  await page.getByRole('button', { name: 'Force stale conflict' }).click();
  await page.locator('textarea').first().fill('Local response must remain visible after conflict.');
  await expect(persistence).toHaveAttribute('data-status', 'conflict', { timeout: 10_000 });
  await expect(persistence).toContainText('Local response retained.');
  await expect(page.getByRole('button', { name: 'Reload current' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Discard local' })).toBeVisible();
  await page.getByRole('button', { name: 'Discard local' }).click();
  await expect(persistence).toHaveAttribute('data-status', 'saved', { timeout: 10_000 });
  await expect(page.locator('textarea').first()).toHaveValue('server version changed');

  await page.screenshot({
    path: 'artifacts/prd0062-ticket-75/browser/student-runtime-persistence.png',
    fullPage: true,
  });
});

test('30 personal timer stays local, accessible, and isolated from runtime', async ({ page }) => {
  const commandRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/book-runtime/commands')) commandRequests.push(request.url());
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Show dev quick login' }).click();
  await page.locator('#dev-login-student').click();
  await expect(page).toHaveURL(/\/student\/?$/u, { timeout: 60_000 });
  await page.goto(
    '/__smoke/book-runtime?bookId=book-runtime-fixture&unitKey=unit-fixture',
    { waitUntil: 'domcontentloaded' },
  );

  const timer = page.getByTestId('personal-timer');
  await expect(timer).toBeVisible();
  await expect(page.getByTestId('personal-timer-elapsed')).toHaveText('00:00');
  await page.getByTestId('personal-timer-start').click();
  await expect(page.getByTestId('personal-timer-elapsed')).not.toHaveText('00:00', { timeout: 3_000 });
  await page.getByTestId('personal-timer-pause').click();
  const pausedElapsed = await page.getByTestId('personal-timer-elapsed').textContent();
  await page.getByRole('button', { name: 'Collapse page navigator' }).click();
  await expect(page.getByTestId('book-runtime-shell')).toHaveAttribute('data-navigator-collapsed', 'true');

  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('tab', { name: 'Activity' }).click();
  await page.getByRole('tab', { name: 'Book Page' }).click();
  await page.getByTestId('personal-timer-hide').click();
  await page.getByTestId('personal-timer-show').click();
  await expect(page.getByTestId('personal-timer-elapsed')).toHaveText(pausedElapsed ?? '00:00');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('personal-timer-elapsed')).toHaveText(pausedElapsed ?? '00:00');
  await expect(timer.getByRole('status')).toContainText('Paused');

  await page.setViewportSize({ width: 320, height: 812 });
  await expect.poll(async () => page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))).toEqual({ scrollWidth: 320, clientWidth: 320 });
  const buttonSizes = await page.getByTestId('personal-timer').getByRole('button').evaluateAll((buttons) => (
    buttons.map((button) => {
      const box = button.getBoundingClientRect();
      return { width: box.width, height: box.height };
    })
  ));
  expect(buttonSizes.every(({ width, height }) => width >= 44 && height >= 44)).toBe(true);
  expect(commandRequests).toEqual([]);
  await page.screenshot({ path: 'artifacts/prd0062-ticket-78/browser/personal-timer.png', fullPage: true });
});
