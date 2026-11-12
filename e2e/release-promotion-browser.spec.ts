import { expect, test, type Page } from '@playwright/test';

const loginAs = async (page: Page, role: 'teacher' | 'student') => {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Show dev quick login' }).click();
  await page.getByRole('button', { name: role === 'teacher' ? 'Teacher' : 'Student', exact: true }).click();
  await expect(page).toHaveURL(role === 'teacher' ? /\/lobby(?:\/|$)/u : /\/student(?:\/|$)/u, { timeout: 60_000 });
};

test('generated teacher and student accounts complete the authenticated release flow', async ({ browser }) => {
  test.setTimeout(180_000);
  const teacherContext = await browser.newContext();
  const teacherPage = await teacherContext.newPage();
  await loginAs(teacherPage, 'teacher');
  await expect(teacherPage.getByText(/Teacher|Lobby|Dashboard/iu).first()).toBeVisible();
  await teacherContext.close();

  const studentContext = await browser.newContext();
  const studentPage = await studentContext.newPage();
  await loginAs(studentPage, 'student');
  await expect(studentPage.getByText(/Student|Dashboard/iu).first()).toBeVisible();
  await studentContext.close();
});
