import { expect, test, type Page } from '@playwright/test';

const quickLogin = async (page: Page, role: 'student' | 'teacher') => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Show dev quick login' }).click();
  await page.locator(`#dev-login-${role}`).click();
  await expect(page).toHaveURL(
    role === 'student' ? /\/student\/?$/u : /\/lobby$/u,
    { timeout: 60_000 },
  );
};

test('teacher grades subjective work, regrades objective work, and recovers a stale conflict', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await quickLogin(page, 'teacher');
  await page.goto('/__smoke/book-activity-evaluation?role=teacher');
  await expect(page.getByRole('heading', { name: 'Activity completion' })).toBeVisible();
  await expect(page.getByText('2 of 2')).toBeVisible();

  await page.getByRole('button', { name: 'Grade Activity' }).click();
  await expect(page.getByRole('heading', { name: 'Subjective Activity' })).toBeVisible();
  await page.getByLabel('Earned score').fill('1.5');
  await page.getByLabel('Maximum score').fill('2');
  await page.getByLabel('Feedback').fill('Clear subjective reasoning.');
  await page.getByRole('button', { name: 'Save grade' }).click();
  await expect(page.getByText('Revision 1', { exact: true })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Activity grade saved.' })).toBeVisible();

  await page.getByRole('button', { name: 'Review / regrade' }).click();
  await expect(page.getByRole('heading', { name: 'Objective Activity' })).toBeVisible();
  await expect(page.getByText('Revision 1 · Current')).toBeVisible();
  await page.getByLabel('Earned score').fill('1.5');
  await page.getByLabel('Feedback').fill('Objective score corrected.');
  await page.getByLabel(/Correction note/).fill('Objective key interpretation corrected.');
  await page.getByRole('button', { name: 'Save regrade' }).click();
  await expect(page.getByText('Revision 2 · Current')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Activity regrade saved.' })).toBeVisible();
  await expect(page.getByText('Revision 1', { exact: true })).toBeVisible();

  const injected = await page.request.post(
    'http://localhost:8790/__ticket90/inject-stale/attempt-objective',
    { headers: { authorization: 'Bearer fixture-control' } },
  );
  expect(injected.status()).toBe(200);
  await page.getByLabel('Earned score').fill('2');
  await page.getByLabel(/Correction note/).fill('Stale correction attempt.');
  await page.getByRole('button', { name: 'Save regrade' }).click();
  await expect(page.getByText('Latest saved revision: 3')).toBeVisible();
  await page.getByRole('button', { name: 'Reload latest evaluation' }).click();
  await expect(page.getByText('Revision 3 · Current')).toBeVisible();
  await expect(page.getByLabel('Earned score')).toBeFocused();
  await expect(page.getByText('Concurrent correction is now current.')).toBeVisible();

  await page.setViewportSize({ width: 375, height: 850 });
  const mobileLayout = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    submitVisible: Boolean(document.querySelector('.book-grading-panel__submit')?.getClientRects().length),
  }));
  expect(mobileLayout.documentWidth).toBeLessThanOrEqual(mobileLayout.viewportWidth);
  expect(mobileLayout.submitVisible).toBe(true);
  await page.screenshot({
    path: 'artifacts/prd0062-ticket-90/browser/teacher-grade-regrade-conflict-375.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 768, height: 900 });
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  const zoomLayout = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    submitVisible: Boolean(document.querySelector('.book-grading-panel__submit')?.getClientRects().length),
  }));
  expect(zoomLayout.documentWidth).toBeLessThanOrEqual(zoomLayout.viewportWidth);
  expect(zoomLayout.submitVisible).toBe(true);
  await page.screenshot({
    path: 'artifacts/prd0062-ticket-90/browser/teacher-grade-regrade-conflict-200.png',
    fullPage: true,
  });
  expect(pageErrors).toEqual([]);
});

test('student sees only released fields, corrections, and exact hidden denial', async ({ page }) => {
  const deniedResponses: string[] = [];
  const consoleMessages: string[] = [];
  page.on('response', async (response) => {
    if (response.url().includes('/student-denied?')) {
      deniedResponses.push(await response.text());
    }
  });
  page.on('console', (message) => consoleMessages.push(message.text()));
  await quickLogin(page, 'student');
  await page.goto('/__smoke/book-activity-evaluation?role=student');

  const objective = page.getByRole('article', { name: 'Objective Activity result' });
  await expect(objective.getByRole('heading', { name: 'Released result' })).toBeVisible();
  await expect(objective.getByText('1.75 / 2.00')).toBeVisible();
  await expect(objective.getByText('A concurrent teacher correction.')).toBeVisible();
  await expect(objective.getByText('Previously released evaluation information changed.')).toBeVisible();
  await expect(objective.getByText('Concurrent correction is now current.')).toBeVisible();

  const subjective = page.getByRole('article', { name: 'Subjective Activity result' });
  await expect(subjective.getByText('Clear subjective reasoning.')).toBeVisible();
  const denied = page.getByRole('article', { name: 'Denied student result' });
  await expect(denied.getByText('Evaluation details are not available.')).toBeVisible();
  await expect.poll(() => deniedResponses.length).toBeGreaterThan(0);
  expect(deniedResponses).toEqual(expect.arrayContaining([
    '{"result":{"attemptId":"attempt-objective","status":"hidden"}}',
  ]));
  expect(new Set(deniedResponses)).toEqual(new Set([
    '{"result":{"attemptId":"attempt-objective","status":"hidden"}}',
  ]));

  const leaks = await page.evaluate(() => ({
    dom: document.documentElement.innerHTML.includes('DENIED_SECRET'),
    route: `${location.pathname}${location.search}${location.hash}`.includes('DENIED_SECRET'),
    local: Object.values(localStorage).some((value) => value.includes('DENIED_SECRET')),
    session: Object.values(sessionStorage).some((value) => value.includes('DENIED_SECRET')),
  }));
  expect(leaks).toEqual({ dom: false, route: false, local: false, session: false });
  expect(consoleMessages.join('\n')).not.toContain('DENIED_SECRET');

  await page.setViewportSize({ width: 375, height: 850 });
  const mobileLayout = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    correctionVisible: Boolean(document.querySelector(
      '.book-evaluation-feedback__correction',
    )?.getClientRects().length),
  }));
  expect(mobileLayout.documentWidth).toBeLessThanOrEqual(mobileLayout.viewportWidth);
  expect(mobileLayout.correctionVisible).toBe(true);
  await page.screenshot({
    path: 'artifacts/prd0062-ticket-90/browser/student-policy-correction-375.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 768, height: 900 });
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  const zoomLayout = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    correctionVisible: Boolean(document.querySelector(
      '.book-evaluation-feedback__correction',
    )?.getClientRects().length),
  }));
  expect(zoomLayout.documentWidth).toBeLessThanOrEqual(zoomLayout.viewportWidth);
  expect(zoomLayout.correctionVisible).toBe(true);
  await page.screenshot({
    path: 'artifacts/prd0062-ticket-90/browser/student-policy-correction-200.png',
    fullPage: true,
  });
});
