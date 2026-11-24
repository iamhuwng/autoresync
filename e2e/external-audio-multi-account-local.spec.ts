import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { wave } from './fixtures/external-audio-media.mjs';

const teacher = 'http://localhost:5173';
const student = 'http://localhost:5174';
const authEmulator = 'http://localhost:9099';
const privateRtdb = 'http://localhost:9015';
const privateProject = 'demo-fixture-audio-local';

const uxDir = resolve(process.cwd(), 'tmp/external-audio-ux-review');
const namedDir = resolve(process.cwd(), 'tmp/external-audio-evidence-named');

const accountA = {
  label: 'Alice Account A',
  bucket: 'fixture-private-audio',
  prefix: 'teacher/',
  keyId: 'fixture-key-id',
  keySecret: 'fixture-key-secret',
  file: 'teacher/First take.wav',
};

const accountB = {
  label: 'Alice Account B',
  bucket: 'fixture-account-b-bucket',
  prefix: '',
  keyId: 'fixture-account-b-key-id',
  keySecret: 'fixture-account-b-secret',
  file: 'Account B recording.wav',
};

const sampleAudio = wave(24, 440);
const accountBAudio = wave(24, 523);

async function isolateB2Media(context: BrowserContext) {
  await context.route((url) => url.hostname !== 'localhost', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== 's3.us-west-004.backblazeb2.com') return route.abort();
    const version = url.searchParams.get('versionId');
    const origin = route.request().headers().origin ?? teacher;
    const body = version === 'fixture-account-b-first' ? accountBAudio : sampleAudio;
    const range = /^bytes=(\d+)-(\d*)$/u.exec(route.request().headers().range ?? '');
    const from = range ? Number(range[1]) : 0;
    const to = range?.[2] ? Number(range[2]) : body.length - 1;
    return route.fulfill({
      status: range ? 206 : 200,
      contentType: 'audio/wav',
      body: body.subarray(from, to + 1),
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Expose-Headers': 'Content-Range',
        'Accept-Ranges': 'bytes',
        ...(range ? { 'Content-Range': `bytes ${from}-${to}/${body.length}` } : {}),
      },
    });
  });
}

async function resetTeacher2Connections() {
  const signIn = await fetch(`${authEmulator}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local-dev-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'teacher2@test.com', password: 'password123', returnSecureToken: true }),
  });
  if (!signIn.ok) throw new Error(`Could not sign in teacher2@test.com: ${signIn.status}`);
  const { localId } = await signIn.json() as { localId: string };
  const cleared = await fetch(`${privateRtdb}/external_audio_connections/${localId}.json?ns=${privateProject}`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer owner' },
  });
  if (!cleared.ok) throw new Error(`Could not clear teacher2 connections: ${cleared.status}`);
}

async function login(page: Page, origin: string, role: 'Teacher' | 'Teacher 2' | 'Student') {
  await page.goto(`${origin}/login`, { waitUntil: 'domcontentloaded' });
  const quickLogin = page.getByRole('button', { name: 'Show dev quick login' });
  try {
    await quickLogin.waitFor({ timeout: 12_000 });
  } catch {
    await page.reload({ waitUntil: 'domcontentloaded' });
  }
  await quickLogin.click({ timeout: 25_000 });
  await page.getByRole('button', { name: role, exact: true }).click();
  await page.waitForURL((current) => current.pathname !== '/login');
}

async function saveVideo(page: Page, destination: string) {
  const video = page.video();
  await page.context().close();
  if (!video) return;
  const source = await video.path();
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

async function playAudio(page: Page, ariaLabel: string) {
  const audio = page.locator(`audio[aria-label="${ariaLabel}"]`);
  await expect(audio).toBeVisible();
  await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.readyState)).toBeGreaterThan(0);
  await audio.evaluate(async (el: HTMLAudioElement) => { await el.play(); });
  await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentTime)).toBeGreaterThan(0);
}

test.describe('multi-account BYO external audio and no-active-account modal', () => {
  test.beforeAll(async () => {
    await mkdir(uxDir, { recursive: true });
    await mkdir(namedDir, { recursive: true });
  });

  test('shows no-active-account modal in IELTS and THCS, restores focus on Escape, and routes to Profile storage tab', async ({ browser }) => {
    await resetTeacher2Connections();
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      serviceWorkers: 'block',
      recordVideo: { dir: resolve(process.cwd(), 'tmp/multi-account-videos'), size: { width: 1280, height: 800 } },
    });
    await isolateB2Media(context);
    const page = await context.newPage();

    await login(page, teacher, 'Teacher 2');

    // 1. Dedicated Teacher Profile Account tab + empty External audio storage tab under TeacherHeader
    await page.goto(`${teacher}/profile`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('profile-teacher-shell')).toBeVisible();
    await expect(page.getByText(/Active Scholar|Total Homework/i)).toHaveCount(0);
    await page.screenshot({ path: resolve(uxDir, 'multi-00-teacher-profile-account.png') });
    await page.getByRole('tab', { name: 'External audio storage' }).click();
    await expect(page.getByRole('button', { name: 'Add B2 account', exact: true })).toBeVisible();
    await expect(page.getByText(/No Backblaze B2 account connected/i)).toBeVisible();
    await page.screenshot({ path: resolve(uxDir, 'multi-01-profile-empty.png') });

    // 2. IELTS authoring no-active-account modal + Escape focus return
    await page.goto(`${teacher}/lobby`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Create New Test' }).click();
    await page.getByText('International English Language Testing System', { exact: true }).click();
    await page.locator('p').getByText('Listening', { exact: true }).click();
    await page.getByPlaceholder('IELTS Listening Test', { exact: true }).fill('IELTS No-Account Check');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: /Create using Text/u }).click();

    const ieltsTrigger = page.getByRole('button', { name: 'Choose external audio' });
    await ieltsTrigger.click();
    const ieltsModal = page.getByRole('dialog', { name: 'Connect audio storage' });
    await expect(ieltsModal).toBeVisible();
    await expect(ieltsModal.getByTestId('no-active-b2-modal')).toBeVisible();
    await expect(ieltsModal.getByLabel(/Application key/i)).toHaveCount(0);
    await expect(ieltsModal.getByText(/listBuckets|listFiles|readFiles/i)).toHaveCount(0);
    await page.screenshot({ path: resolve(uxDir, 'multi-02-ielts-no-account-modal.png') });

    await page.keyboard.press('Escape');
    await expect(ieltsModal).not.toBeVisible();
    await expect(ieltsTrigger).toBeFocused();

    // 3. THCS authoring no-active-account modal + Open Profile storage settings redirect
    await page.goto(`${teacher}/lobby`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Create New Test' }).click();
    await page.getByText('Vietnamese National High School Exam', { exact: true }).click();
    await page.getByLabel('Test Title').fill('THCS No-Account Check');
    await page.getByLabel('Grade Level').selectOption('9');
    await page.getByLabel('Exam Type').selectOption('unit 1');
    await page.getByRole('button', { name: /Start Blank/u }).click();

    const thcsTrigger = page.getByRole('button', { name: 'Choose external audio' });
    await thcsTrigger.click();
    const thcsModal = page.getByRole('dialog', { name: 'Connect audio storage' });
    await expect(thcsModal).toBeVisible();
    await expect(thcsModal.getByTestId('no-active-b2-modal')).toBeVisible();
    await page.screenshot({ path: resolve(uxDir, 'multi-03-thcs-no-account-modal.png') });

    await thcsModal.getByRole('button', { name: 'Open Profile storage settings' }).click();
    await page.waitForURL((current) => current.pathname === '/profile');
    await expect(page.getByTestId('profile-teacher-shell')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'External audio storage' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('button', { name: 'Add B2 account', exact: true })).toBeVisible();

    await saveVideo(page, resolve(namedDir, '14-no-active-account-modals-ielts-thcs.webm'));
  });

  test('retains Account A when adding Account B, switches accounts without credentials, plays public Test 1 via A, and isolates revoke impact', async ({ browser }) => {
    await resetTeacher2Connections();
    const teacherContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      serviceWorkers: 'block',
      recordVideo: { dir: resolve(process.cwd(), 'tmp/multi-account-videos'), size: { width: 1280, height: 800 } },
    });
    await isolateB2Media(teacherContext);
    const page = await teacherContext.newPage();

    await login(page, teacher, 'Teacher 2');
    await page.goto(`${teacher}/profile`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: 'External audio storage' }).click();

    // 1. Connect Account A
    await page.getByRole('button', { name: 'Add B2 account', exact: true }).click();
    await page.getByLabel('Account label (optional)').fill(accountA.label);
    await page.getByLabel('Bucket name').fill(accountA.bucket);
    await page.getByLabel(/Folder prefix/u).fill(accountA.prefix);
    await page.getByLabel('Application key ID', { exact: true }).fill(accountA.keyId);
    await page.getByLabel('Application key', { exact: true }).fill(accountA.keySecret);
    await page.getByRole('button', { name: 'Connect storage' }).click();
    await expect(page.getByTestId('b2-account-active')).toContainText(accountA.label);
    await expect(page.getByRole('button', { name: /Browse/i })).toHaveCount(0);
    await page.screenshot({ path: resolve(uxDir, 'multi-04-profile-account-a.png') });

    // 2. Publish Public Test 1 using Account A
    const publicTestTitle = `Public Multi-Account Test 1 ${crypto.randomUUID().slice(0, 5)}`;
    await page.goto(`${teacher}/lobby`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Create New Test' }).click();
    await page.getByText('International English Language Testing System', { exact: true }).click();
    await page.locator('p').getByText('Listening', { exact: true }).click();
    await page.getByPlaceholder('IELTS Listening Test', { exact: true }).fill(publicTestTitle);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: /Create using Text/u }).click();

    await page.getByRole('button', { name: 'Choose external audio' }).click();
    const chooserA = page.getByRole('dialog', { name: 'Choose audio' });
    await chooserA.getByRole('button', { name: `Inspect ${accountA.file}` }).click();
    await chooserA.getByRole('button', { name: 'Use this version in draft' }).click();
    await expect(page.getByText('1/1 audio sections configured')).toBeVisible();
    await page.getByRole('button', { name: /Next/u }).click();
    await page.getByRole('button', { name: 'Add manually' }).click();
    await page.getByRole('button', { name: '+ Add Question' }).click();
    await page.getByPlaceholder('Question text...').fill('What color is mentioned in Test 1?');
    await page.getByPlaceholder('Answer...').fill('Blue');
    await page.getByRole('button', { name: /Next/u }).click();
    await page.getByRole('checkbox', { name: /Make Publicly Available/i }).check();
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    const publicWarning = page.getByRole('dialog', { name: 'Publish with external audio?' });
    await expect(publicWarning).toBeVisible();
    await publicWarning.getByRole('button', { name: 'Publish public test' }).click();
    await page.getByPlaceholder('Search by title or keyword...').fill(publicTestTitle);
    await expect(page.getByText(publicTestTitle, { exact: true }).first()).toBeVisible({ timeout: 15_000 });

    // 3. Add Account B (empty prefix!) while retaining Account A
    await page.goto(`${teacher}/profile?tab=external-audio`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('tab', { name: 'External audio storage' })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('button', { name: 'Add another B2 account' }).click();
    await page.getByLabel('Account label (optional)').fill(accountB.label);
    await page.getByLabel('Bucket name').fill(accountB.bucket);
    await page.getByLabel(/Folder prefix/u).fill(accountB.prefix);
    await page.getByLabel('Application key ID', { exact: true }).fill(accountB.keyId);
    await page.getByLabel('Application key', { exact: true }).fill(accountB.keySecret);
    await page.getByRole('button', { name: 'Connect storage' }).click();

    await expect(page.getByTestId('b2-account-active')).toContainText(accountB.label);
    await expect(page.getByTestId('b2-account-archived')).toContainText(accountA.label);
    await page.screenshot({ path: resolve(uxDir, 'multi-05-profile-b-selected-a-retained.png') });

    // 4. Mobile Profile at 375px and 320px with zero horizontal overflow
    for (const [width, filename] of [[375, 'multi-06-profile-mobile-375.png'], [320, 'multi-07-profile-mobile-320.png']] as const) {
      await page.setViewportSize({ width, height: 812 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await page.screenshot({ path: resolve(uxDir, filename), fullPage: true });
    }
    await page.setViewportSize({ width: 1280, height: 800 });

    // 5. Open chooser with Account B selected -> inspect/preview B file -> switch to A inside chooser -> inspect/preview A file -> Escape focus return
    await page.goto(`${teacher}/lobby`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Create New Test' }).click();
    await page.getByText('International English Language Testing System', { exact: true }).click();
    await page.locator('p').getByText('Listening', { exact: true }).click();
    await page.getByPlaceholder('IELTS Listening Test', { exact: true }).fill('Multi-Account Chooser Check');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: /Create using Text/u }).click();

    const trigger = page.getByRole('button', { name: 'Choose external audio' });
    await trigger.click();
    const chooser = page.getByRole('dialog', { name: 'Choose audio' });
    const accountSelect = chooser.getByLabel('Authoring account');
    await expect(accountSelect).toBeVisible();
    await chooser.getByRole('button', { name: `Inspect ${accountB.file}` }).click();
    await chooser.getByRole('button', { name: 'Preview audio' }).click();
    await playAudio(page, 'Audio preview');
    await page.screenshot({ path: resolve(uxDir, 'multi-08-chooser-account-b.png') });

    // Switch to Account A inside chooser without re-entering credentials
    const optionA = await accountSelect.locator('option', { hasText: accountA.label }).getAttribute('value');
    await accountSelect.selectOption(optionA!);
    await chooser.getByRole('button', { name: `Inspect ${accountA.file}` }).click();
    await chooser.getByRole('button', { name: 'Preview audio' }).click();
    await playAudio(page, 'Audio preview');
    await page.screenshot({ path: resolve(uxDir, 'multi-10-chooser-account-a.png') });

    // Escape returns focus to trigger
    await page.keyboard.press('Escape');
    await expect(chooser).not.toBeVisible();
    await expect(trigger).toBeFocused();

    // 6. Switch back to B in Profile so B is active and A is archived, then Student plays Public Test 1 via archived A
    await page.goto(`${teacher}/profile?tab=external-audio`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('b2-account-archived').getByRole('button', { name: 'Use for authoring' }).click();
    await expect(page.getByTestId('b2-account-active')).toContainText(accountB.label);

    const studentContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      serviceWorkers: 'block',
      recordVideo: { dir: resolve(process.cwd(), 'tmp/multi-account-videos'), size: { width: 1280, height: 800 } },
    });
    await isolateB2Media(studentContext);
    const studentPage = await studentContext.newPage();
    await login(studentPage, student, 'Student');
    await studentPage.goto(`${student}/student/library`, { waitUntil: 'domcontentloaded' });
    await studentPage.getByRole('button', { name: 'Public Library', exact: true }).click();
    await studentPage.getByPlaceholder('Search materials...').fill(publicTestTitle);
    const card = studentPage.getByRole('heading', { name: publicTestTitle, exact: true }).locator('../../..');
    await expect(card).toBeVisible({ timeout: 20_000 });
    await card.getByRole('button', { name: 'Start Practice' }).click();
    const studentAudio = studentPage.locator('audio').first();
    await expect(studentAudio).toBeAttached({ timeout: 20_000 });
    const studentPlayBtn = studentPage.getByRole('button', { name: /Play/i }).first();
    if (await studentPlayBtn.isVisible({ timeout: 4_000 }).catch(() => false)) {
      await studentPlayBtn.click();
    } else {
      await studentAudio.evaluate(async (el: HTMLAudioElement) => { await el.play(); });
    }
    await expect.poll(() => studentAudio.evaluate((el: HTMLAudioElement) => el.currentTime), { timeout: 15_000 }).toBeGreaterThan(0);
    await studentPage.screenshot({ path: resolve(uxDir, 'multi-11-public-test1-playback-after-switch.png') });
    await saveVideo(studentPage, resolve(namedDir, '15-public-playback-after-account-switch.webm'));

    // 7. Reactivate A in Profile without credentials -> B becomes retained
    await page.getByTestId('b2-account-archived').getByRole('button', { name: 'Use for authoring' }).click();
    await expect(page.getByTestId('b2-account-active')).toContainText(accountA.label);
    await expect(page.getByTestId('b2-account-archived')).toContainText(accountB.label);
    await page.screenshot({ path: resolve(uxDir, 'multi-09-profile-a-reactivated.png') });

    // 8. Revoke impact on B shows ONLY B's dependencies (0 linked files / 0 published tests)
    await page.getByTestId('b2-account-archived').getByRole('button', { name: 'Revoke', exact: true }).click();
    const revokeDialog = page.getByRole('dialog', { name: `Revoke ${accountB.label}?` });
    await expect(revokeDialog).toBeVisible();
    await expect(revokeDialog.locator('dl')).toContainText('Linked files0');
    await expect(revokeDialog.locator('dl')).toContainText('Published tests0');
    await page.screenshot({ path: resolve(uxDir, 'multi-12-revoke-impact-isolated.png') });
    await revokeDialog.getByRole('button', { name: 'Confirm revoke' }).click();
    await expect(page.getByText('Revoked (1)')).toBeVisible();
    await expect(page.getByTestId('b2-account-active')).toContainText(accountA.label);

    await saveVideo(page, resolve(namedDir, '13-multi-account-profile-and-chooser.webm'));
  });
});
