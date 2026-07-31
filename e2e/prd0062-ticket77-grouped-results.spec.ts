import { expect, test, type Page } from '@playwright/test';

const studentHandle = 'br_WyJib29rLWJyb3dzZXItcHJvb2YiLCJ4M2hEZmpZVk43Y0p0U2J3cTBDaElqbDFCazYyIiwiZ19XeUo0TTJoRVptcFpWazQzWTBwMFUySjNjVEJEYUVscWJERkNhell5SWl3aVlXTjBhWFpwZEhrdFluSnZkM05sY2kxd2NtOXZaaUpkIl0';
const teacherHandle = 'br_WyJib29rLWJyb3dzZXItcHJvb2YiLCJ4M2hEZmpZVk43Y0p0U2J3cTBDaElqbDFCazYyIiwiZ19XeUo0TTJoRVptcFpWazQzWTBwMFUySjNjVEJEYUVscWJERkNhell5SWl3aVlXTjBhWFpwZEhrdFluSnZkM05sY2kxd2NtOXZaaUpkIiwiaG9tZXdvcmstYnJvd3Nlci1wcm9vZiJd';
const rollbackOnly = process.env.TICKET77_EXPECT_DISABLED === '1';

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
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await quickLogin(page, 'student');
  await page.goto(`/result/${studentHandle}`, { waitUntil: 'networkidle' });

  await expect(page.getByRole('heading', { name: 'Review Activity attempts' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText('2 attempts for Activity activity-browser-proof')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Attempt 2' })).toBeVisible();
  await expect(page.getByText('Homework response visible to its current teacher')).toBeVisible();
  await expect(page.getByText('Your explanation used the evidence well.')).toBeVisible();

  const selector = page.getByRole('button', { name: 'Select result attempt. Attempt 2 of 2' });
  await selector.click();
  await page.getByRole('option', {
    name: 'Attempt 1, Solo, Pending Review, 30 Jul 2026',
  }).click();

  await expect(page.getByText('Private Solo')).toBeVisible();
  await expect(page.getByText('Deleted', { exact: true })).toBeVisible();
  await expect(page.getByText('Solo response retained after source deletion')).toBeVisible();
  await expect(page.getByText('Feedback is withheld.')).toBeVisible();
  await expect(page.getByText('Your explanation used the evidence well.')).toHaveCount(0);
  await expect(page.getByRole('link')).toHaveCount(0);

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
