import { expect, test, type Page } from '@playwright/test';

const loginAs = async (page: Page, email: string, password: string, expectedPath: RegExp) => {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in with email' }).click();
  await expect(page).toHaveURL(expectedPath, { timeout: 60_000 });
};

test('generated teacher and student accounts complete the authenticated release flow', async ({ browser }) => {
  test.setTimeout(180_000);
  const password = process.env.RELEASE_BROWSER_PASSWORD;
  const teacherEmail = process.env.RELEASE_BROWSER_TEACHER_EMAIL;
  const studentEmail = process.env.RELEASE_BROWSER_STUDENT_EMAIL;
  if (!password || !teacherEmail || !studentEmail) throw new Error('Generated browser credentials were not provided');
  const qualificationDatabase = process.env.RELEASE_BROWSER_DATABASE_URL;
  const qualificationApiKey = process.env.RELEASE_BROWSER_API_KEY;
  if (!qualificationDatabase || !qualificationApiKey) throw new Error('Qualification Firebase bindings were not provided');
  const firebaseRequests: string[] = [];
  const teacherContext = await browser.newContext();
  const teacherPage = await teacherContext.newPage();
  observeFirebaseRequests(teacherPage, firebaseRequests);
  await loginAs(teacherPage, teacherEmail, password, /\/lobby(?:\/|$)/u);
  await expect(teacherPage.getByText(/Teacher|Lobby|Dashboard/iu).first()).toBeVisible();
  await teacherContext.close();

  const studentContext = await browser.newContext();
  const studentPage = await studentContext.newPage();
  observeFirebaseRequests(studentPage, firebaseRequests);
  await loginAs(studentPage, studentEmail, password, /\/student(?:\/|$)/u);
  await expect(studentPage.getByText(/Student|Dashboard/iu).first()).toBeVisible();
  expect(firebaseRequests.some(url => url.includes(new URL(qualificationDatabase).host))).toBe(true);
  expect(firebaseRequests.some(url => url.includes(`key=${encodeURIComponent(qualificationApiKey)}`))).toBe(true);
  expect(firebaseRequests.every(url => !url.includes('temp-a1437'))).toBe(true);
  await studentContext.close();
});

const observeFirebaseRequests = (page: Page, requests: string[]) => {
  page.on('request', request => {
    const url = request.url();
    if (/firebase|googleapis|google\.com/iu.test(url)) requests.push(url);
  });
};
