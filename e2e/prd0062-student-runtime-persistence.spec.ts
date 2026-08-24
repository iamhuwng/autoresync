import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createPrd0062StudentRuntimePersistenceFixture } from './prd0062-student-runtime-persistence.fixture.mjs';

const saveAcceptanceArtifact = async (proof: string[]) => {
  const executionId = process.env.PRD0062_EXECUTION_ID ?? 'local';
  const directory = path.resolve(`artifacts/prd0062-acceptance/AC-SR-001/${executionId}`);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'result.json'), JSON.stringify({
    caseId: 'AC-SR-001',
    status: 'PASS_LOCAL_SMOKE_ASSERTIONS',
    proof,
    activation: 'not claimed; this local fixture neither authorizes nor proves production activation',
  }, null, 2));
};

test('51C1 fixture is deterministic and retains normal-use student runtime IDs', () => {
  const first = createPrd0062StudentRuntimePersistenceFixture('AC-SR-001');
  const second = createPrd0062StudentRuntimePersistenceFixture('AC-SR-001');

  expect(first).toEqual(second);
  expect(first).toMatchObject({
    caseId: 'AC-SR-001',
    seed: 'prd0062-51a:AC-SR-001:student-runtime-persistence:v1',
    activityId: 'activity-ac-sr-001',
    activityVersionId: 'activity-ac-sr-001_v1',
    placementId: 'placement-ac-sr-001',
    entitlementId: 'entitlement-ac-sr-001',
    launch: {
      url: '/student/practice/activity-ac-sr-001?entitlement=entitlement-ac-sr-001',
      role: 'student',
    },
    response: { interactionId: 'interaction-1', value: 'deterministic-response' },
    submission: { attemptId: 'attempt-ac-sr-001-v1', revision: 1 },
    schedule: { placementId: 'placement-ac-sr-001', startsAt: '2026-08-12T00:00:00.000Z' },
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
  await saveAcceptanceArtifact([
    'response state persists across reload',
    'transient failure retries without losing local input',
    'stale conflict preserves local input until explicit resolution',
    'server state is restored after explicit local discard',
  ]);
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
