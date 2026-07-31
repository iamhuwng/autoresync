import { expect, test, type Page } from '@playwright/test';

const studentHandle = 'br_WyJib29rLWJyb3dzZXItcHJvb2YiLCJ4M2hEZmpZVk43Y0p0U2J3cTBDaElqbDFCazYyIiwiZ19XeUo0TTJoRVptcFpWazQzWTBwMFUySjNjVEJEYUVscWJERkNhell5SWl3aVlXTjBhWFpwZEhrdFluSnZkM05sY2kxd2NtOXZaaUpkIl0';
const teacherHandle = 'br_WyJib29rLWJyb3dzZXItcHJvb2YiLCJ4M2hEZmpZVk43Y0p0U2J3cTBDaElqbDFCazYyIiwiZ19XeUo0TTJoRVptcFpWazQzWTBwMFUySjNjVEJEYUVscWJERkNhell5SWl3aVlXTjBhWFpwZEhrdFluSnZkM05sY2kxd2NtOXZaaUpkIiwiaG9tZXdvcmstYnJvd3Nlci1wcm9vZiJd';
const rollbackOnly = process.env.TICKET77_EXPECT_DISABLED === '1';
const remoteHistoricalProofUrl = process.env.TICKET80_REMOTE_PROOF_URL?.replace(/\/+$/u, '');
const remoteHistoricalDisabled = process.env.TICKET80_EXPECT_HISTORICAL_DISABLED === '1';

const quickLogin = async (page: Page, role: 'student' | 'teacher') => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Show dev quick login' }).click();
  await page.locator(`#dev-login-${role}`).click();
  await expect(page).toHaveURL(
    role === 'student' ? /\/student\/?$/u : /\/lobby$/u,
    { timeout: 60_000 },
  );
};

test('Student reviews grouped Solo and Homework attempts with exact gated fields', async ({ page }) => {
  test.skip(rollbackOnly, 'positive preview is intentionally disabled during rollback proof');
  const pageErrors: string[] = [];
  const documentRequests: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => {
    if (request.url().includes('/v1/book-delivery/historical-document/')) {
      documentRequests.push(request.url());
    }
  });

  await quickLogin(page, 'student');
  await page.goto(`/result/${studentHandle}`, { waitUntil: 'networkidle' });

  await expect(page.getByRole('heading', { name: 'Review Activity attempts' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText('2 attempts for Activity activity-browser-proof')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Attempt 2' })).toBeVisible();
  await expect(page.getByText('Homework response visible to its current teacher')).toBeVisible();
  await expect(page.getByText('Your explanation used the evidence well.')).toBeVisible();
  const pagePill = page.getByRole('button', {
    name: 'Component component-homework-browser-proof · page 3',
  });
  await expect(pagePill).toBeVisible();
  await pagePill.click();
  const historicalReview = page.getByTestId('book-attempt-source-review');
  await expect(historicalReview.getByText('source-version-homework-exact', { exact: true })).toBeVisible();
  await expect(historicalReview.getByText('page-group-homework', { exact: true })).toBeVisible();
  await expect(historicalReview.getByText('source-assisted', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Historical source document' })).toBeVisible();
  await expect(page.getByLabel('Page number')).toHaveValue('3');
  await expect.poll(() => documentRequests).toContain(
    `http://localhost:8799/v1/book-delivery/historical-document/book-browser-proof`
      + `/x3hDfjYVN7cJtSbwq0ChIjl1Bk62/result-homework-1`
      + `/bd_${'8'.repeat(40)}-4-component-homework-browser-proof-source-version-homework-exact`,
  );

  const selector = page.getByRole('button', { name: 'Select result attempt. Attempt 2 of 2' });
  await selector.click();
  await page.getByRole('option', {
    name: 'Attempt 1, Solo, Pending Review, 30 Jul 2026',
  }).click();

  await expect(page.getByText('Private Solo')).toBeVisible();
  await expect(page.getByText('Deleted', { exact: true })).toBeVisible();
  await expect(page.getByText('Solo response retained after source deletion')).toBeVisible();
  await page.getByRole('button', {
    name: 'Component component-solo-browser-proof · page 3',
  }).click();
  const unavailableReview = page.getByTestId('book-attempt-source-review');
  await expect(unavailableReview.getByText('Historical PDF unavailable')).toBeVisible();
  await expect(unavailableReview.getByText('component-solo-browser-proof', { exact: true })).toBeVisible();
  await expect(unavailableReview.getByText('source-version-deleted', { exact: true })).toBeVisible();
  await expect(unavailableReview.getByText('reference-only', { exact: true })).toBeVisible();
  await page.getByRole('button', {
    name: 'activity-browser-proof · interaction-browser-proof-solo',
  }).click();
  await expect(page.locator(
    '[data-book-interaction-id="interaction-browser-proof-solo"]',
  )).toBeFocused();
  await expect(page.getByText('Feedback is withheld.')).toBeVisible();
  await expect(page.getByText('Your explanation used the evidence well.')).toHaveCount(0);
  await expect(page.getByRole('link')).toHaveCount(0);
  await page.waitForTimeout(500);
  expect(documentRequests).toEqual(
    documentRequests.filter((url) => (
      url.endsWith(
        `/bd_${'8'.repeat(40)}-4-component-homework-browser-proof-source-version-homework-exact`,
      )
    )),
  );

  await page.setViewportSize({ width: 768, height: 900 });
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  const zoomLayout = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    selectorVisible: Boolean(document.querySelector('.ah-trigger')?.getClientRects().length),
  }));
  expect(zoomLayout.documentWidth).toBeLessThanOrEqual(zoomLayout.viewportWidth);
  expect(zoomLayout.selectorVisible).toBe(true);
  await page.evaluate(() => { document.documentElement.style.zoom = '1'; });

  expect(pageErrors).toEqual([]);
});

test('Teacher sees only currently owned Homework attempts and private Solo fails closed', async ({ browser }) => {
  test.skip(rollbackOnly, 'positive preview is intentionally disabled during rollback proof');
  const teacherPage = await browser.newPage({ baseURL: 'http://localhost:5173' });
  const pageErrors: string[] = [];
  teacherPage.on('pageerror', (error) => pageErrors.push(error.message));

  await quickLogin(teacherPage, 'teacher');
  await teacherPage.goto(`/result/${teacherHandle}`, { waitUntil: 'networkidle' });

  await expect(teacherPage.getByRole('heading', { name: 'Result Detail' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(teacherPage.getByText('1 attempt for Activity activity-browser-proof')).toBeVisible();
  await expect(teacherPage.getByText('Homework response visible to its current teacher')).toBeVisible();
  const teacherHistoricalReview = teacherPage.getByTestId('book-attempt-source-review');
  await expect(teacherHistoricalReview.getByText('source-version-homework-exact', { exact: true })).toBeVisible();
  await expect(teacherHistoricalReview.getByText('source-assisted', { exact: true })).toBeVisible();
  await expect(teacherPage.getByText('Private Solo')).toHaveCount(0);
  await expect(teacherPage.getByRole('button', { name: /Select result attempt/u })).toHaveCount(0);

  await teacherPage.goto(`/result/${studentHandle}`, { waitUntil: 'networkidle' });
  await expect(teacherPage.getByRole('alert')).toContainText('do not have access');
  await expect(teacherPage.getByText('Solo response retained after source deletion')).toHaveCount(0);

  expect(pageErrors).toEqual([]);
  await teacherPage.close();
});

test('Rollback hides the Book result adapter behind the disabled route gate', async ({ page }) => {
  test.skip(!rollbackOnly, 'rollback-only assertion');
  await quickLogin(page, 'student');
  await page.goto(`/result/${studentHandle}`, { waitUntil: 'networkidle' });
  await expect(page.getByRole('alert')).toContainText(
    'Activity results are temporarily unavailable.',
    { timeout: 30_000 },
  );
  await expect(page.getByText('Solo response retained after source deletion')).toHaveCount(0);
  await expect(page.getByText('Homework response visible to its current teacher')).toHaveCount(0);
});

test('Production-equivalent preview enforces exact historical authorization and role visibility', async ({
  browser,
  page,
}) => {
  test.skip(!remoteHistoricalProofUrl, 'remote historical proof URL not supplied');
  let studentAuthorization = '';
  page.on('request', (request) => {
    if (request.url().includes('/v1/book-evaluation/results/')) {
      studentAuthorization ||= request.headers().authorization ?? '';
    }
  });
  await quickLogin(page, 'student');
  await page.goto(`/result/${studentHandle}`, { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Review Activity attempts' })).toBeVisible({
    timeout: 30_000,
  });
  expect(studentAuthorization).toMatch(/^Bearer /u);

  const historicalKey = `bd_${'8'.repeat(40)}-4-component-historical-source-version-historical`;
  const currentKey = `bd_${'8'.repeat(40)}-4-component-current-source-version-current`;
  const proof = async (
    resultId: string,
    routeKey: string,
    authorization: string,
  ) => {
    const response = await page.request.get(
      `${remoteHistoricalProofUrl}/v1/book-delivery/historical-document`
        + `/book-browser-proof/x3hDfjYVN7cJtSbwq0ChIjl1Bk62/${resultId}/${routeKey}`,
      { headers: { authorization } },
    );
    const contentType = response.headers()['content-type'] ?? '';
    return {
      status: response.status(),
      contentType,
      body: contentType.startsWith('application/pdf')
        ? Buffer.from(await response.body()).subarray(0, 8).toString('utf8')
        : await response.json() as Record<string, unknown>,
    };
  };
  if (remoteHistoricalDisabled) {
    expect(await proof(
      'result-exact-historical',
      historicalKey,
      studentAuthorization,
    )).toEqual({
      status: 503,
      contentType: 'application/json; charset=utf-8',
      body: { code: 'book_route_disabled' },
    });
    return;
  }
  expect(await proof('result-exact-historical', historicalKey, studentAuthorization)).toEqual({
    status: 200,
    contentType: 'application/pdf',
    body: '%PDF-1.4',
  });
  expect(await proof('result-deleted', historicalKey, studentAuthorization)).toEqual({
    status: 404,
    contentType: 'application/json; charset=utf-8',
    body: { code: 'historical_source_unavailable' },
  });
  expect(await proof('result-copied-resource', historicalKey, studentAuthorization)).toEqual({
    status: 403,
    contentType: 'application/json; charset=utf-8',
    body: { code: 'forbidden' },
  });

  const teacherPage = await browser.newPage({ baseURL: 'http://localhost:5173' });
  let teacherAuthorization = '';
  teacherPage.on('request', (request) => {
    if (request.url().includes('/v1/book-evaluation/results/')) {
      teacherAuthorization ||= request.headers().authorization ?? '';
    }
  });
  await quickLogin(teacherPage, 'teacher');
  await teacherPage.goto(`/result/${teacherHandle}`, { waitUntil: 'networkidle' });
  await expect(teacherPage.getByRole('heading', { name: 'Result Detail' })).toBeVisible({
    timeout: 30_000,
  });
  expect(teacherAuthorization).toMatch(/^Bearer /u);
  expect(await proof('result-exact-current', currentKey, teacherAuthorization)).toEqual({
    status: 200,
    contentType: 'application/pdf',
    body: '%PDF-1.4',
  });
  expect(await proof('result-private-solo', historicalKey, teacherAuthorization)).toEqual({
    status: 403,
    contentType: 'application/json; charset=utf-8',
    body: { code: 'forbidden' },
  });
  await teacherPage.close();
});
