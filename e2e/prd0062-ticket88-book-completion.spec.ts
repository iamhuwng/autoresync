import { expect, test } from '@playwright/test';

const signIn = async (
  page: import('@playwright/test').Page,
  port: 5173 | 5174,
  role: 'teacher' | 'student',
) => {
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Show dev quick login' }).click();
  await page.locator(`#dev-login-${role}`).click();
  await expect(page).toHaveURL(role === 'teacher' ? /\/lobby/u : /\/student\/?$/u, {
    timeout: 60_000,
  });
};

const assertDistinctProgress = async (
  page: import('@playwright/test').Page,
  role: 'teacher' | 'student',
) => {
  await expect(page.getByText('2 of 2')).toBeVisible();
  if (role === 'student') {
    await expect(page.getByText('1 pending review')).toBeVisible();
    await expect(page.getByText('Pending review', { exact: true })).toBeVisible();
  } else {
    await expect(page.getByLabel('Book progress for Ticket 88 Student')).toContainText('Pending review');
  }
  await expect(page.getByText('Activity score: 1 / 1')).toBeVisible();
  await expect(page.getByText('Historical / excluded Activities')).toBeVisible();
  await expect(page.getByText(/Excluded from current completion: Removed Binding/u)).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/Book score|Book percentage|aggregate grade/iu);
};

test('student role sees completion, grading, pending review, score, and history as distinct concepts', async ({ page }) => {
  await signIn(page, 5174, 'student');
  const smokeResponse = await page.goto('http://localhost:5174/__smoke/book-homework-completion?role=student');
  expect(smokeResponse?.status()).toBe(200);
  await expect(page.getByRole('region', { name: 'Ticket 88 Book Homework' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText('0 of 2')).toBeVisible();
  await page.getByRole('button', { name: 'Submit subjective Activity' }).click();
  await expect(page.getByText('1 of 2')).toBeVisible();
  await expect(page.getByText('1 pending review')).toBeVisible();
  await page.getByRole('button', { name: 'Submit scored Activity' }).click();
  await assertDistinctProgress(page, 'student');
  await page.screenshot({
    path: 'artifacts/prd0062-ticket-88/browser/student-completion-distinct.png',
    fullPage: true,
  });
});

test('teacher role sees the same exact student context without an aggregate Book grade', async ({ page }) => {
  await signIn(page, 5173, 'teacher');
  await page.goto('http://localhost:5173/__smoke/book-homework-completion?role=teacher');
  await expect(page.getByRole('heading', { name: 'Activity completion' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByLabel('Book progress for Ticket 88 Student')).toBeVisible();
  await assertDistinctProgress(page, 'teacher');
  await page.screenshot({
    path: 'artifacts/prd0062-ticket-88/browser/teacher-completion-distinct.png',
    fullPage: true,
  });
});
