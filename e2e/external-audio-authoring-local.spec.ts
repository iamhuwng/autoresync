import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { wave } from './fixtures/external-audio-media.mjs';

const teacher = 'http://localhost:5173';
const student = 'http://localhost:5174';
const disabledTeacher = 'http://localhost:5175';
const worker = 'http://localhost:8787';
const uid = 'local-teacher';
const project = 'demo-luyentap-local';
const admin = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const first = 'teacher/First take.wav';
const second = 'teacher/Second take.wav';
const realProvider = process.env.EXTERNAL_AUDIO_PUBLIC_REAL_QA === '1' || process.env.EXTERNAL_AUDIO_THCS_REAL_QA === '1'
  || process.env.EXTERNAL_AUDIO_COURSE_REAL_QA === '1';
const providerBucket = realProvider ? process.env.REAL_B2_BUCKET : 'fixture-private-audio';
const providerPrefix = realProvider ? process.env.REAL_B2_PREFIX : 'teacher/';
const providerKeyId = realProvider ? process.env.REAL_B2_KEY_ID : 'fixture-key-id';
const providerKey = realProvider ? process.env.REAL_B2_KEY_SECRET : 'fixture-key-secret';
if (!providerBucket || !providerPrefix || !providerKeyId || !providerKey) {
  throw new Error('Real-provider QA requires the approved private bucket, prefix, and scoped application key.');
}

async function appData(path: string, method = 'GET', value?: unknown) {
  const result = await fetch(`http://localhost:9000/${path}.json?ns=${project}`, {
    method, headers: admin, ...(value === undefined ? {} : { body: JSON.stringify(value) }),
  });
  expect(result.ok).toBeTruthy();
  return result.json();
}

async function setFirstVersionMissing(missing: boolean) {
  const response = await fetch(`${worker}/fixture/missing`, {
    method: 'POST', body: JSON.stringify({ version: 'fixture-first', missing }),
  });
  expect(response.ok).toBeTruthy();
}

async function setPublicFixture(options: { enabled?: boolean; rateLimited?: boolean }) {
  const response = await fetch(`${worker}/fixture/public-listening`, { method: 'POST', body: JSON.stringify(options) });
  expect(response.ok).toBeTruthy();
}

function postWorker(route: string, body: unknown, authorization?: string, origin = student) {
  return fetch(`${worker}${route}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, ...(authorization ? { Authorization: authorization } : {}) },
    body: JSON.stringify(body),
  });
}

test.beforeEach(async () => {
  await setPublicFixture({});
  await setFirstVersionMissing(false);
  await fetch(`${worker}/fixture/missing`, { method: 'POST', body: JSON.stringify({ version: 'fixture-second', missing: false }) });
  await fetch(`${worker}/fixture/newer-version`, { method: 'POST', body: JSON.stringify({ enabled: false }) });
});

async function isolate(context: BrowserContext) {
  const deliveries: Array<{ version: string; partial: boolean; rangedFrom: number; origin: string | undefined }> = [];
  await context.routeWebSocket((url) => url.hostname !== 'localhost', (socket) => socket.close());
  await context.route((url) => url.hostname !== 'localhost', async (route) => {
    const url = new URL(route.request().url());
    const version = url.searchParams.get('versionId');
    if (realProvider) {
      if (url.protocol !== 'https:' || !/^s3\.[a-z0-9-]+\.backblazeb2\.com$/u.test(url.hostname)
        || !version || !url.searchParams.has('X-Amz-Signature')) return route.abort();
      const range = /^bytes=(\d+)-/u.exec(route.request().headers().range ?? '');
      deliveries.push({ version, partial: !!range, rangedFrom: Number(range?.[1] ?? 0), origin: route.request().headers().origin });
      return route.continue();
    }
    if (url.hostname !== 's3.us-west-004.backblazeb2.com' || !url.searchParams.has('X-Amz-Signature')
      || !['fixture-first', 'fixture-second'].includes(version ?? '')) return route.abort();
    const body = wave(24, version === 'fixture-first' ? 440 : 660);
    const origin = route.request().headers().origin;
    if (route.request().resourceType() === 'fetch') {
      const date = url.searchParams.get('X-Amz-Date')?.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/u, '$1-$2-$3T$4:$5:$6Z');
      if (Date.parse(date ?? '') + Number(url.searchParams.get('X-Amz-Expires')) * 1000 <= Date.now()) {
        return route.fulfill({ status: 403, headers: { 'Access-Control-Allow-Origin': origin ?? teacher } });
      }
    }
    const range = /^bytes=(\d+)-(\d*)$/u.exec(route.request().headers().range ?? '');
    const from = range ? Number(range[1]) : 0;
    const requestedEnd = range?.[2] ? Number(range[2]) : body.length - 1;
    const to = origin === student && range ? Math.min(requestedEnd, from + 65_535) : requestedEnd;
    deliveries.push({ version: version!, partial: Boolean(range), rangedFrom: from, origin });
    return route.fulfill({
      status: range ? 206 : 200, contentType: 'audio/wav', body: body.subarray(from, to + 1),
      headers: { 'Access-Control-Allow-Origin': origin ?? teacher, 'Access-Control-Expose-Headers': 'Content-Range',
        'Accept-Ranges': 'bytes',
        ...(range ? { 'Content-Range': `bytes ${from}-${to}/${body.length}` } : {}) },
    });
  });
  return deliveries;
}

async function login(page: Page, origin = teacher, role: 'Teacher' | 'Teacher 2' | 'Student' = 'Teacher') {
  await page.goto(`${origin}/login`, { waitUntil: 'domcontentloaded' });
  const quickLogin = page.getByRole('button', { name: 'Show dev quick login' });
  try {
    await quickLogin.waitFor({ timeout: 12_000 });
  } catch {
    // The first Vite dependency optimization can invalidate the initial module request.
    await page.reload({ waitUntil: 'domcontentloaded' });
  }
  await quickLogin.click({ timeout: 25_000 });
  await page.getByRole('button', { name: role, exact: true }).click();
  await page.waitForURL((current) => current.pathname !== '/login');
}

async function ensureConnection(page: Page) {
  await page.goto(`${teacher}/profile`, { waitUntil: 'commit' });
  await page.getByRole('tab', { name: 'External audio storage' }).click();
  const panel = page.getByRole('region', { name: 'External audio storage' });
  const activeCard = panel.getByTestId('b2-account-active');
  const addButton = panel.getByRole('button', { name: /^Add( another)? B2 account$/u });
  await expect(activeCard.or(addButton).first()).toBeVisible();
  if (!(await activeCard.isVisible())) {
    const useRetained = panel.getByRole('button', { name: 'Use for authoring' }).first();
    if (await useRetained.isVisible()) {
      await useRetained.click();
    } else {
      await addButton.click();
      await page.getByLabel('Bucket name').fill(providerBucket!);
      await page.getByLabel(/Folder prefix/u).fill(providerPrefix!);
      await page.getByLabel('Application key ID', { exact: true }).fill(providerKeyId!);
      await page.getByLabel('Application key', { exact: true }).fill(providerKey!);
      await page.getByRole('button', { name: 'Connect storage' }).click();
    }
  }
  await expect(activeCard).toContainText(providerBucket!);
}

async function choose(page: Page, name: string, replacing = false, index = 0) {
  await page.getByRole('button', { name: replacing ? /^Replace (external )?audio$/u : 'Choose external audio' }).nth(index).click();
  const dialog = page.getByRole('dialog', { name: 'Choose audio' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: `Inspect ${name}` }).click();
  await dialog.getByRole('button', { name: /Use this version in draft|Replace with this version/u }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Preview draft audio' }).first()).toBeVisible();
}

async function play(page: Page, label: string) {
  const audio = page.getByLabel(label);
  await expect(audio).toBeVisible();
  await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.readyState)).toBeGreaterThan(0);
  await audio.evaluate(async (element: HTMLAudioElement) => { await element.play(); });
  await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime)).toBeGreaterThan(0);
}

function assertOpaque(value: unknown) {
  const serialized = JSON.stringify(value);
  for (const forbidden of [first, second, 'fixture-first', 'fixture-second', 'fixture-key', 'X-Amz-Signature',
    'objectKey', 'providerVersionId', 'connectionId']) expect(serialized).not.toContain(forbidden);
}

test('new IELTS Listening text test connects and chooses audio before saving a draft', async ({ page, context }, testInfo) => {
  await isolate(context);
  await login(page, teacher, 'Teacher 2');
  const title = `IELTS external audio walkthrough ${crypto.randomUUID().slice(0, 5)}`;
  await page.getByRole('button', { name: 'Create New Test' }).click();
  await page.getByText('International English Language Testing System', { exact: true }).click();
  await page.locator('p').getByText('Listening', { exact: true }).click();
  await page.getByPlaceholder('IELTS Listening Test', { exact: true }).fill(title);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: /Create using Text/u }).click();
  const saves: string[] = [];
  page.on('request', request => {
    if (request.url().endsWith('/listening-authoring/save-draft')) saves.push(request.method());
  });
  await page.getByRole('button', { name: 'Choose external audio' }).click();
  const noAccountDialog = page.getByRole('dialog', { name: 'Connect audio storage' });
  const chooser = page.getByRole('dialog', { name: 'Choose audio' });
  const file = chooser.getByRole('button', { name: `Inspect ${first}` });
  await expect(noAccountDialog.or(file)).toBeVisible();
  if (await noAccountDialog.isVisible()) {
    await page.screenshot({ path: testInfo.outputPath('01-no-account-modal.png') });
    await noAccountDialog.getByRole('button', { name: 'Open Profile storage settings' }).click();
    await page.waitForURL((current) => current.pathname === '/profile');
    await expect(page.getByRole('tab', { name: 'External audio storage' })).toHaveAttribute('aria-selected', 'true');
    const panel = page.getByRole('region', { name: 'External audio storage' });
    await panel.getByRole('button', { name: 'Add B2 account', exact: true }).click();
    await page.getByLabel('Bucket name').fill(providerBucket!);
    await page.getByLabel(/Folder prefix/u).fill(providerPrefix!);
    await page.getByLabel('Application key ID', { exact: true }).fill(providerKeyId!);
    await page.getByLabel('Application key', { exact: true }).fill(providerKey!);
    await page.getByRole('button', { name: 'Connect storage' }).click();
    await expect(panel.getByTestId('b2-account-active')).toContainText(providerBucket!);
    await page.goto(`${teacher}/lobby`, { waitUntil: 'commit' });
    await page.getByRole('button', { name: 'Create New Test' }).click();
    await page.getByText('International English Language Testing System', { exact: true }).click();
    await page.locator('p').getByText('Listening', { exact: true }).click();
    await page.getByPlaceholder('IELTS Listening Test', { exact: true }).fill(title);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: /Create using Text/u }).click();
    await page.getByRole('button', { name: 'Choose external audio' }).click();
  }
  await chooser.getByRole('searchbox', { name: 'Filename starts with' }).fill('First');
  await chooser.getByRole('button', { name: 'Browse folder' }).click();
  await expect(chooser.getByRole('button', { name: `Inspect ${second}` })).toHaveCount(0);
  await file.click();
  await chooser.getByRole('button', { name: 'Preview audio' }).click();
  await play(page, 'Audio preview');
  expect(saves).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('02-ielts-picker.png') });
  const previousSize = page.viewportSize()!;
  for (const width of [375, 320]) {
    await page.setViewportSize({ width, height: 720 });
    await expect(chooser.getByRole('button', { name: 'Use this version in draft' })).toBeInViewport();
    expect(await chooser.evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`03-narrow-picker-${width}.png`) });
  }
  await page.setViewportSize(previousSize);
  await chooser.getByRole('button', { name: 'Close' }).press('Escape');
  await expect(chooser).not.toBeVisible();
  const trigger = page.getByRole('button', { name: 'Choose external audio' });
  await expect(trigger).toBeFocused();
  await trigger.click();
  await file.click();
  await chooser.getByRole('button', { name: 'Use this version in draft' }).click();
  await expect(page.getByText('1/1 audio sections configured')).toBeVisible();
  expect(saves).toEqual(['POST']);
  await page.getByRole('button', { name: /Next/u }).click();
  await page.getByRole('button', { name: 'Add manually' }).click();
  await page.getByRole('button', { name: '+ Add Question' }).click();
  await page.getByPlaceholder('Question text...').fill('What color does the speaker mention?');
  await page.getByPlaceholder('Answer...').fill('Blue');
  await page.getByRole('button', { name: /Next/u }).click();
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('04-ielts-published.png') });
});

test('new THCS test chooses section audio before saving a draft', async ({ page, context }, testInfo) => {
  await isolate(context);
  await login(page);
  await ensureConnection(page);
  await page.goto(`${teacher}/lobby`, { waitUntil: 'commit' });
  await page.getByRole('button', { name: 'Create New Test' }).click();
  await page.getByText('Vietnamese National High School Exam', { exact: true }).click();
  await page.getByLabel('Test Title').fill('THCS external audio walkthrough');
  await page.getByLabel('Grade Level').selectOption('9');
  await page.getByLabel('Exam Type').selectOption('unit 1');
  await page.getByRole('button', { name: /Start Blank/u }).click();
  await choose(page, second);
  await playAfterPreview(page);
  await page.getByRole('button', { name: '+ Add Question', exact: true }).click();
  await page.getByRole('textbox', { name: 'Question', exact: true }).fill('What is the color of the sky?');
  for (const [label, option] of [['A', 'Blue'], ['B', 'Green'], ['C', 'Yellow'], ['D', 'Red']]) {
    await page.getByLabel(`Option ${label}`).fill(option);
  }
  await page.locator('input[type="radio"][name^="correct-"]').first().check();
  await page.getByRole('group', { name: 'Section audio playback' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('05-thcs-section.png') });
  await thcsReview(page);
  await publishThcs(page, true);
  await page.screenshot({ path: testInfo.outputPath('06-thcs-published.png') });
});

test('Listening authoring keeps R2 audio and saves, reloads, previews, repairs and replaces an opaque attachment', async ({ page, context }) => {
  const versions = await isolate(context);
  await login(page);
  await ensureConnection(page);
  await page.goto(`${teacher}/create-test?skill=Listening`, { waitUntil: 'commit' });
  await page.getByRole('button', { name: 'IELTS Text Format' }).click();
  await page.getByRole('button', { name: /Next/u }).click();
  const title = `R2 Listening replacement ${crypto.randomUUID().slice(0, 8)}`;
  await page.getByLabel('Draft title').fill(title);
  const initialAttach = page.waitForRequest((request) => request.url().endsWith('/external-audio/attach-draft'));
  await choose(page, first);
  await expect(page.getByText('1/1 audio sections configured')).toBeVisible();
  const { draftId } = (await initialAttach).postDataJSON();
  const reopen = page.getByRole('link', { name: 'Reopen saved draft' });
  await expect(reopen).toBeHidden();
  const path = `listening_authoring/drafts/${draftId}`;
  const draft = await appData(path);
  const assetId = 'fixture-r2-recording';
  const uploadSessionId = 'fixture-r2-session';
  const durableKey = `assessment-assets/listening/${uid}/${assetId}/fixture-r2.wav`;
  const health = await (await fetch(`${worker}/health`)).json();
  await appData(`media_assets/${assetId}`, 'PUT', {
    assetId, canonicalAssetId: assetId, state: 'committed', ownerId: uid, createdBy: uid, uploadSessionId,
    durableKey, tempKey: `temp/listening/${uid}/${uploadSessionId}/${assetId}-fixture-r2.wav`,
    contentType: 'audio/wav', sizeBytes: health.r2Size, checksum: health.r2Checksum,
    publicUrl: `${worker}/${durableKey}`,
  });
  const { externalAudio: _, ...draftSection } = draft.document.audioSections[0];
  const originalAudio = { ...draftSection, endQuestion: 1, assetId, audioUrl: `${worker}/${durableKey}` };
  await appData(path, 'PATCH', { assetIds: { [assetId]: true }, document: {
    ...draft.document, title, audioSections: [originalAudio], questionCount: 1,
    questions: [{ number: 1, type: 'short-answer', question: 'What color?', answer: 'Blue', sectionNumber: 1, points: 1 }],
  } });
  await page.goto(`${teacher}/create-test?skill=Listening&draft=${draftId}`, { waitUntil: 'commit' });
  await expect(page).toHaveURL(new RegExp(`draft=${draftId}`, 'u'));
  await play(page, 'Section 1 audio preview');
  const initialPublish = page.waitForResponse(response => response.url().endsWith('/listening-authoring/publish') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  const initialVersion = await initialPublish;
  expect(initialVersion.ok(), await initialVersion.text()).toBe(true);
  const { versionId: initialVersionId } = await initialVersion.json();
  const { testId } = await appData(`listening_authoring/versions/${initialVersionId}`);
  await page.goto(`${teacher}/create-test?skill=Listening&draft=${draftId}`, { waitUntil: 'commit' });
  await play(page, 'Section 1 audio preview');

  const attachedRequest = page.waitForRequest((request) => request.url().endsWith('/external-audio/attach-draft') && request.method() === 'POST');
  await choose(page, first, true);
  const authorization = (await (await attachedRequest).allHeaders()).authorization;
  await playAfterPreview(page);
  expect(versions.map(({ version }) => version)).toContain('fixture-first');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect.poll(async () => (await appData(path)).document.audioSections[0].externalAudio?.scope).toBe('section');
  const saved = await appData(path);
  const oldRef = saved.document.audioSections[0].externalAudio;
  expect(saved.document.audioSections[0].assetId).toBe(assetId);
  assertOpaque(saved.document);

  const direct = (action: string, body: unknown) => fetch(`${worker}/listening-authoring/${action}`, {
    method: 'POST', headers: { Authorization: authorization, Origin: teacher, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const forged = structuredClone(saved.document);
  forged.audioSections[0].externalAudio.assetId = '53f947d9-2484-4e83-bc3a-6ec82e0e5c81';
  const rejected = await direct('save-draft', {
    draftId, expectedConflictToken: saved.conflictToken, trigger: 'explicit', idempotencyKey: 'fixture-forged', document: forged,
  });
  expect(rejected.status).toBe(422);
  expect((await appData(path)).document.audioSections[0].externalAudio).toEqual(oldRef);
  await setFirstVersionMissing(true);
  const publish = await direct('publish', { draftId, expectedConflictToken: saved.conflictToken, idempotencyKey: 'fixture-publish' });
  expect(publish.status).toBe(422);
  expect(await publish.json()).toMatchObject({ status: 'blocked', blockers: expect.arrayContaining([
    expect.objectContaining({ field: 'audioSections[0].externalAudio', guidance: expect.stringContaining('Restore the selected recording version') }),
  ]) });

  await page.reload({ waitUntil: 'commit' });
  await expect(page.getByRole('button', { name: 'Replace external audio' })).toBeVisible();
  await page.getByRole('button', { name: 'Preview draft audio' }).click();
  await expect(page.getByText(/Restore this version in B2.*Recheck the connection under/u)).toBeVisible();
  await choose(page, second, true);
  await playAfterPreview(page);
  expect(versions.map(({ version }) => version)).toContain('fixture-second');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect.poll(async () => (await appData(path)).document.audioSections[0].externalAudio?.assetId).not.toBe(oldRef.assetId);
  await page.reload({ waitUntil: 'commit' });
  await page.getByRole('button', { name: 'Remove external audio' }).click();
  await play(page, 'Section 1 audio preview');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Reopen saved draft' })).toBeVisible();
  await page.goto(`${teacher}/lobby`, { waitUntil: 'commit' });
  const material = page.getByTestId(`material-list-row-${testId}`);
  const openEditor = async () => {
    await material.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('button', { name: /Context & Resources/u }).click();
    await expect(page.getByText('Audio Resource Editor', { exact: true })).toBeVisible();
  };
  await openEditor();
  await play(page, 'Audio preview');
  await page.getByRole('button', { name: /^Replace (external )?audio$/u }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  expect((await appData(`tests/${testId}`)).versionId).toBe(initialVersionId);

  await choose(page, second, true);
  await fetch(`${worker}/fixture/missing`, { method: 'POST', body: JSON.stringify({ version: 'fixture-second' }) });
  await page.getByRole('button', { name: 'Save Test', exact: true }).click();
  await expect(page.getByText(/Verify the external audio connection or choose a replacement before saving/u)).toBeVisible();
  expect((await appData(`tests/${testId}`)).audioSections[0].assetId).toBe(assetId);
  await page.goto(`${teacher}/lobby`, { waitUntil: 'commit' });
  await openEditor();
  await play(page, 'Audio preview');
  await fetch(`${worker}/fixture/missing`, { method: 'POST', body: JSON.stringify({ version: 'fixture-second', missing: false }) });
  await choose(page, second, true);
  await playAfterPreview(page);
  const published = page.waitForResponse(response => response.url().endsWith('/listening-authoring/publish') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Save Test', exact: true }).click();
  expect((await published).ok()).toBe(true);
  await expect.poll(async () => (await appData(`tests/${testId}`)).versionId).not.toBe(initialVersionId);
});

async function playAfterPreview(page: Page) {
  await page.getByRole('button', { name: 'Preview draft audio' }).click();
  await play(page, 'Draft audio preview');
}

async function loginUnassignedStudent(page: Page) {
  const email = 'unassigned-audio@example.test';
  const password = 'fixture-unassigned-only';
  const endpoint = 'http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts';
  const payload = JSON.stringify({ email, password, returnSecureToken: true });
  const init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload };
  let response = await fetch(`${endpoint}:signUp?key=local-dev-key`, init);
  if (!response.ok) response = await fetch(`${endpoint}:signInWithPassword?key=local-dev-key`, init);
  expect(response.ok).toBeTruthy();
  const { localId, idToken } = await response.json();
  const verified = await fetch(`${endpoint}:update?key=local-dev-key`, {
    method: 'POST', headers: admin, body: JSON.stringify({ localId, emailVerified: true }),
  });
  expect(verified.ok).toBeTruthy();
  await appData(`users/${localId}`, 'PUT', { uid: localId, email, displayName: 'Unassigned fixture', role: 'student', status: 'active' });
  await page.goto(`${student}/login`, { waitUntil: 'commit' });
  await page.getByLabel('Email or Student ID').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL((current) => current.pathname !== '/login');
  return `Bearer ${idToken}`;
}

test('assigned student seeks and refreshes the exact private IELTS homework recording', async ({ page, context, browser }) => {
  const title = `Private IELTS recording fixture ${crypto.randomUUID().slice(0, 8)}`;
  await isolate(context);
  await login(page);
  await ensureConnection(page);
  await appData('classes/external-audio-fixture', 'PUT', {
    id: 'external-audio-fixture', name: 'Private audio fixture class', teacherId: uid, createdBy: uid, status: 'active',
    createdAt: Date.now(), students: { 'local-student': { uid: 'local-student', name: 'Fixture Student', status: 'active' } },
  });
  await page.goto(`${teacher}/create-test?skill=Listening`, { waitUntil: 'commit' });
  await page.getByRole('button', { name: 'IELTS Text Format' }).click();
  await page.getByRole('button', { name: /Next/u }).click();
  await page.getByLabel('Draft title').fill(title);
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  const reopen = page.getByRole('link', { name: 'Reopen saved draft' });
  await expect(reopen).toBeVisible();
  const draftId = new URL((await reopen.getAttribute('href'))!, teacher).searchParams.get('draft')!;
  const path = `listening_authoring/drafts/${draftId}`;
  const draft = await appData(path);
  await appData(`${path}/document`, 'PATCH', {
    title, audioSections: [
      { ...draft.document.audioSections[0], endQuestion: 1 },
      { ...draft.document.audioSections[0], number: 2, startQuestion: 2, endQuestion: 2 },
    ],
    questionCount: 2, questions: [
      { number: 1, type: 'short-answer', question: 'What color?', answer: 'Blue', sectionNumber: 1, points: 1 },
      { number: 2, type: 'short-answer', question: 'What season?', answer: 'Winter', sectionNumber: 2, points: 1 },
    ],
    settings: { ...draft.document.settings, audioControls: {
      ...draft.document.settings.audioControls, showPlayPause: true, showProgressBar: true, showSeekControl: true,
    } },
  });
  await reopen.click();
  await choose(page, first);
  await choose(page, second, false, 0);
  await expect(page.getByText('2/2 audio sections configured')).toBeVisible();
  await page.getByRole('button', { name: 'Preview draft audio' }).first().click();
  await play(page, 'Draft audio preview');
  const saving = page.waitForResponse((response) => response.url().endsWith('/listening-authoring/save-draft') &&
    response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  const saveResponse = await saving;
  expect(saveResponse.ok()).toBeTruthy();
  const teacherAuthorization = (await saveResponse.request().allHeaders()).authorization;
  await expect.poll(async () => (await appData(path)).document.audioSections[0].externalAudio?.scope).toBe('section');
  const publishInput = await appData(path);
  const mutate = (action: string, body: unknown) => fetch(`${worker}/listening-authoring/${action}`, {
    method: 'POST', headers: { Authorization: teacherAuthorization, Origin: teacher, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const updateVisibility = async (isPublic: boolean, conflictToken: number) => {
    const response = await mutate('save-draft', { draftId, expectedConflictToken: conflictToken, trigger: 'explicit',
      document: { ...publishInput.document, isPublic }, idempotencyKey: `fixture-visibility-${isPublic}` });
    expect(response.ok).toBeTruthy();
    return (await response.json()).conflictToken;
  };
  const publicToken = await updateVisibility(true, publishInput.conflictToken);
  await setPublicFixture({ enabled: false });
  const refused = await mutate('publish', { draftId, expectedConflictToken: publicToken, idempotencyKey: 'fixture-public-rejection' });
  expect(refused.status).toBe(422);
  expect(await refused.json()).toMatchObject({ status: 'blocked', blockers: expect.arrayContaining([
    expect.objectContaining({ guidance: expect.stringContaining('Publish this test privately') }),
  ]) });
  await setPublicFixture({});
  await updateVisibility(false, publicToken);
  const newer = await fetch(`${worker}/fixture/newer-version`, { method: 'POST' });
  expect(newer.ok).toBeTruthy();
  await page.reload({ waitUntil: 'commit' });
  await expect(page.getByRole('button', { name: 'Replace external audio' })).toHaveCount(2);
  const published = page.waitForResponse((response) => response.url().endsWith('/listening-authoring/publish') &&
    response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  const publishResult = await published;
  expect(publishResult.status()).toBe(200);
  const { versionId } = await publishResult.json();
  const version = await appData(`listening_authoring/versions/${versionId}`);
  const testId = version.testId;
  expect(version.document.isPublic).toBe(false);
  const runtime = await appData(`tests/${testId}`);
  const [assetId, secondAssetId] = version.document.audioSections.map((section: { externalAudio: { assetId: string } }) => section.externalAudio.assetId);
  expect(assetId).not.toBe(secondAssetId);
  expect(runtime.audioSections[0]).toMatchObject({ assetId, audioUrl: '' });
  expect(runtime.audioSections[1]).toMatchObject({ assetId: secondAssetId, audioUrl: '' });
  assertOpaque(runtime);
  expect(await appData(`student_safe_tests/${testId}`)).toEqual({ id: testId, questionCount: 2, updatedAt: version.publishedAt });

  await page.goto(`${teacher}/teacher/homework`, { waitUntil: 'commit' });
  await page.getByRole('button', { name: /Create Homework|New Homework/u }).first().click();
  const modal = page.locator('.homework-create-modal');
  await modal.getByPlaceholder(/Search materials/u).fill(title);
  await modal.getByText(title, { exact: true }).click();
  await modal.getByRole('button', { name: /^Next/u }).click();
  await modal.getByRole('button', { name: /Assign to Students/u }).click();
  await modal.getByRole('button', { name: /Select Students/u }).click();
  await page.getByRole('checkbox', { name: 'Fixture Student' }).check();
  await page.getByRole('button', { name: 'Apply Selection (1)' }).click();
  await modal.getByRole('button', { name: /^Next/u }).click();
  await modal.getByLabel('Due Date', { exact: true }).fill(new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 16));
  await modal.getByRole('button', { name: /Anti-Cheat Settings/u }).click();
  await modal.getByRole('combobox', { name: 'Preset' }).selectOption({ label: 'None' });
  await modal.getByRole('button', { name: /^Next/u }).click();
  const assignment = page.waitForResponse((response) => response.url().endsWith('/api/homework/assignments') &&
    response.request().method() === 'POST');
  await modal.getByRole('button', { name: /Create Homework/u }).click();
  const assignmentResponse = await assignment;
  expect(assignmentResponse.status()).toBe(201);
  const { assignmentId, totalAssigned } = await assignmentResponse.json();
  expect(totalAssigned).toBe(1);

  const studentContext = await browser.newContext();
  const unassignedContext = await browser.newContext();
  try {
    const versions = await isolate(studentContext);
    const studentPage = await studentContext.newPage();
    await login(studentPage, student, 'Student');
    await studentPage.goto(`${student}/student/homework`, { waitUntil: 'commit' });
    await expect(studentPage.getByText(title, { exact: true }).first()).toBeVisible();
    await studentPage.goto(`${student}/student/homework/${assignmentId}`, { waitUntil: 'commit' });
    await studentPage.getByRole('button', { name: 'Start Homework', exact: true }).first().click();
    const issuePromise = studentPage.waitForResponse((response) => response.url().endsWith('/listening-delivery/solo') &&
      response.request().method() === 'POST' && !response.request().postDataJSON()?.refreshHandle && response.request().postDataJSON()?.assetId === assetId);
    const secondIssue = studentPage.waitForResponse((response) => publicDeliveryResponse(response, false)
      && response.request().postDataJSON()?.assetId === secondAssetId);
    await studentPage.getByRole('button', { name: 'Start Now' }).click();
    const issued = await issuePromise;
    expect(issued.status()).toBe(200);
    const scope = issued.request().postDataJSON();
    const firstGrant = await issued.json();
    const audio = studentPage.locator('audio').first();
    await expect.poll(() => audio.evaluate((element) => element.readyState)).toBeGreaterThan(0);
    await studentPage.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(() => audio.evaluate((element) => element.currentTime)).toBeGreaterThan(0);
    const progress = studentPage.getByRole('slider', { name: 'Audio progress' });
    await expect(progress).toBeVisible();
    const track = await progress.boundingBox();
    expect(track).toBeTruthy();
    await progress.click({ position: { x: track!.width * 0.58, y: track!.height / 2 } });
    await expect.poll(() => audio.evaluate((element) => element.currentTime)).toBeGreaterThan(12);
    const refresh = await studentPage.waitForResponse((response) => response.url().endsWith('/listening-delivery/solo') &&
      response.request().method() === 'POST' && Boolean(response.request().postDataJSON()?.refreshHandle) && response.request().postDataJSON()?.assetId === assetId);
    expect(refresh.status()).toBe(200);
    const renewed = await refresh.json();
    expect(renewed.expiresAt).toBeGreaterThan(firstGrant.expiresAt);
    expect(refresh.request().postDataJSON()).not.toHaveProperty('previous');
    const renewedAt = new URL(renewed.url).searchParams.get('X-Amz-Date');
    await expect.poll(() => audio.evaluate((element) => new URL(element.currentSrc).searchParams.get('X-Amz-Date'))).toBe(renewedAt);
    await expect.poll(() => Date.now()).toBeGreaterThan(firstGrant.expiresAt);
    expect(await audio.evaluate((element) => element.paused)).toBe(false);
    expect(versions.length).toBeGreaterThan(1);
    const secondGranted = await secondIssue;
    expect(secondGranted.status()).toBe(200);
    expect(new URL((await secondGranted.json()).url).searchParams.get('versionId')).toBe('fixture-second');
    await expect.poll(() => audio.evaluate((element) => new URL(element.currentSrc).searchParams.get('versionId')), { timeout: 22_000 }).toBe('fixture-second');
    await expect.poll(() => audio.evaluate((element) => element.currentTime)).toBeGreaterThan(0);
    expect([...new Set(versions.map(({ version }) => version))]).toEqual(['fixture-first', 'fixture-second']);
    expect(versions.some(({ partial, rangedFrom, origin }) => partial && rangedFrom > 0 && origin === student)).toBeTruthy();
    assertOpaque(await studentContext.storageState({ indexedDB: true }));

    const authHeader = (await issued.request().allHeaders()).authorization;
    const playback = (body: unknown, authorization?: string) => fetch(`${worker}/listening-delivery/solo`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: student, ...(authorization ? { Authorization: authorization } : {}) },
      body: JSON.stringify(body),
    });
    await isolate(unassignedContext);
    const unassignedPage = await unassignedContext.newPage();
    const assignmentUrl = `${student}/student/homework/${assignmentId}`;
    await unassignedPage.goto(`${student}/login`, { waitUntil: 'commit' });
    await unassignedPage.goto(assignmentUrl, { waitUntil: 'commit' });
    await expect(unassignedPage).toHaveURL((url) => url.pathname === '/' || url.pathname === '/login');
    await expect(unassignedPage.getByRole('button', { name: 'Start Homework' })).toHaveCount(0);
    const unassignedAuthorization = await loginUnassignedStudent(unassignedPage);
    await unassignedPage.goto(assignmentUrl, { waitUntil: 'commit' });
    await expect(unassignedPage.getByRole('button', { name: 'Back to Homework List' })).toBeVisible();
    await expect(unassignedPage.getByRole('button', { name: 'Start Homework' })).toHaveCount(0);
    const privateAssignmentDocument = `http://localhost:8080/v1/projects/${project}/databases/(default)/documents/homework_assignments/${assignmentId}`;
    const assignmentDenied = await fetch(privateAssignmentDocument, { headers: { Authorization: unassignedAuthorization } });
    expect(assignmentDenied.status).toBe(403);
    const forgedVisibility = await fetch(`${privateAssignmentDocument}?updateMask.fieldPaths=privateListeningPlayback`, {
      method: 'PATCH', headers: { Authorization: teacherAuthorization, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { privateListeningPlayback: { booleanValue: false } } }),
    });
    expect(forgedVisibility.status).toBe(403);
    for (const response of await Promise.all([
      playback(scope),
      playback(scope, unassignedAuthorization),
      playback({ ...scope, refreshHandle: renewed.refreshHandle }, unassignedAuthorization),
      playback({ ...scope, assetId: '53f947d9-2484-4e83-bc3a-6ec82e0e5c81' }, authHeader),
      playback({ ...scope, versionId: 'foreign-version' }, authHeader),
    ])) {
      expect(response.ok).toBe(false);
      expect(await response.json()).not.toHaveProperty('url');
    }
    await appData(`homework_test_access/${testId}/local-student/${assignmentId}`, 'DELETE');
    const revoked = await playback({ ...scope, refreshHandle: renewed.refreshHandle }, authHeader);
    expect(revoked.status).toBe(403);
    expect(await revoked.json()).not.toHaveProperty('url');
  } finally {
    await studentContext.close();
    await unassignedContext.close();
  }
});

function publicDeliveryResponse(response: import('@playwright/test').Response, refresh: boolean) {
  return response.url().endsWith('/listening-delivery/solo') && response.request().method() === 'POST' &&
    Boolean(response.request().postDataJSON()?.refreshHandle) === refresh;
}

async function playPublicJourney(page: Page, launch: () => Promise<void>, mode: 'self_study' | 'homework', pin: string) {
  const issuance = page.waitForResponse((res) => publicDeliveryResponse(res, false));
  const refreshing = page.waitForResponse((res) => publicDeliveryResponse(res, true));
  await launch();
  const issued = await issuance;
  expect(issued.status()).toBe(200);
  const authorization = (await issued.request().allHeaders()).authorization;
  const scope = issued.request().postDataJSON();
  expect(scope.mode).toBe(mode);
  const firstGrant = await issued.json();
  expect(new URL(firstGrant.url).searchParams.get('versionId') === pin).toBe(true);
  const audio = page.locator('audio').first();
  await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.readyState)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime)).toBeGreaterThan(0);
  const progress = page.getByRole('slider', { name: 'Audio progress' });
  const track = await progress.boundingBox();
  expect(track).toBeTruthy();
  await progress.click({ position: { x: track!.width * 0.58, y: track!.height / 2 } });
  await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime)).toBeGreaterThan(12);
  const refresh = await refreshing;
  expect(refresh.status()).toBe(200);
  expect(refresh.request().postDataJSON()).not.toHaveProperty('previous');
  const renewed = await refresh.json();
  expect(renewed.expiresAt).toBeGreaterThan(firstGrant.expiresAt);
  expect(new URL(renewed.url).searchParams.get('versionId') === pin).toBe(true);
  await expect.poll(() => audio.evaluate((element: HTMLAudioElement, url: string) => element.currentSrc === url, renewed.url)).toBe(true);
  const range = await page.evaluate(async () => {
    const url = document.querySelector('audio')!.currentSrc;
    const response = await fetch(url, { headers: { Range: 'bytes=1024-1033' }, cache: 'no-store' });
    const contentRange = response.headers.get('Content-Range');
    return { status: response.status, contentRange, size: (await response.arrayBuffer()).byteLength };
  });
  expect(range).toMatchObject({ status: 206, size: 10, contentRange: expect.stringMatching(/^bytes 1024-1033\/[1-9]\d*$/u) });
  await expect.poll(() => Date.now()).toBeGreaterThan(firstGrant.expiresAt);
  expect(await audio.evaluate((element: HTMLAudioElement) => element.paused)).toBe(false);
  return { authorization, scope, firstGrant, renewed };
}

test('public IELTS audio plays and refreshes from Library and cross-teacher Homework', async ({ page, context, browser }) => {
  const title = `Public IELTS recording fixture ${crypto.randomUUID().slice(0, 8)}`;
  const teacherMedia = await isolate(context);
  await login(page);
  await ensureConnection(page);
  await page.goto(`${teacher}/create-test?skill=Listening`, { waitUntil: 'commit' });
  await page.getByRole('button', { name: 'IELTS Text Format' }).click();
  await page.getByRole('button', { name: /Next/u }).click();
  await page.getByLabel('Draft title').fill(title);
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  const reopen = page.getByRole('link', { name: 'Reopen saved draft' });
  await expect(reopen).toBeVisible();
  const draftId = new URL((await reopen.getAttribute('href'))!, teacher).searchParams.get('draft')!;
  const path = `listening_authoring/drafts/${draftId}`;
  const draft = await appData(path);
  await appData(`${path}/document`, 'PATCH', {
    title, isPublic: true, audioSections: [{ ...draft.document.audioSections[0], endQuestion: 1 }],
    questionCount: 1, questions: [{ number: 1, type: 'short-answer', question: 'What color?', answer: 'Blue', sectionNumber: 1, points: 1 }],
    settings: { ...draft.document.settings, audioControls: {
      ...draft.document.settings.audioControls, showPlayPause: true, showProgressBar: true, showSeekControl: true,
    } },
  });
  await reopen.click();
  await choose(page, `${providerPrefix}First take.wav`);
  await playAfterPreview(page);
  const pin = teacherMedia[0]?.version;
  expect(Boolean(pin)).toBe(true);
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect.poll(async () => (await appData(path)).document.audioSections[0].externalAudio?.scope).toBe('section');
  if (!realProvider) {
    expect((await fetch(`${worker}/fixture/newer-version`, { method: 'POST' })).ok).toBeTruthy();
  }
  await page.reload({ waitUntil: 'commit' });
  await expect(page.getByRole('button', { name: 'Replace external audio' })).toBeVisible();
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  const warning = page.getByRole('dialog', { name: 'Publish with external audio?' });
  await expect(warning).toContainText('depends on the selected recording version and your Backblaze connection');
  await expect(warning).toContainText('uses your Backblaze bandwidth and may incur charges');
  await warning.getByRole('button', { name: 'Keep editing' }).click();
  await expect(warning).not.toBeVisible();
  const published = page.waitForResponse((response) => response.url().endsWith('/listening-authoring/publish') &&
    response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await warning.getByRole('button', { name: 'Publish public test' }).click();
  const publishResult = await published;
  expect(publishResult.status()).toBe(200);
  const teacherAuthorization = (await publishResult.request().allHeaders()).authorization;
  const { versionId } = await publishResult.json();
  const versionPath = `listening_authoring/versions/${versionId}`;
  const version = await appData(versionPath);
  const { testId } = version;
  expect(version.ownerId).toBe(uid);
  expect(version.document.isPublic).toBe(true);
  const assetId = version.document.audioSections[0].externalAudio.assetId;
  const projection = await appData(`student_safe_tests/${testId}`);
  expect(projection.audioSections[0]).toMatchObject({ assetId, audioUrl: '' });
  expect(projection.questions[0]).not.toHaveProperty('answer');
  assertOpaque(projection);

  const assignerContext = await browser.newContext();
  const viewerContext = await browser.newContext();
  const unassignedContext = await browser.newContext();
  let cleanupAssigner: (() => Promise<Response>) | undefined;
  try {
    const deliveries = await isolate(viewerContext);
    const viewerPage = await viewerContext.newPage();
    await login(viewerPage, student, 'Student');
    await viewerPage.goto(`${student}/student/library`, { waitUntil: 'commit' });
    await viewerPage.getByRole('button', { name: 'Public Library', exact: true }).click();
    await viewerPage.getByPlaceholder('Search materials...').fill(title);
    const card = viewerPage.getByRole('heading', { name: title, exact: true }).locator('../../..');
    await expect(card).toBeVisible();
    const solo = await playPublicJourney(viewerPage, () => card.getByRole('button', { name: 'Start Practice' }).click(), 'self_study', pin!);

    await isolate(assignerContext);
    const assignerPage = await assignerContext.newPage();
    await login(assignerPage, teacher, 'Teacher 2');
    await appData('classes/public-audio-fixture', 'PUT', {
      id: 'public-audio-fixture', name: 'Public audio fixture class', teacherId: 'local-teacher2', createdBy: 'local-teacher2',
      status: 'active', createdAt: Date.now(),
      students: { 'local-student': { uid: 'local-student', name: 'Fixture Student', status: 'active' } },
    });
    await assignerPage.goto(`${teacher}/lobby`, { waitUntil: 'commit' });
    await assignerPage.getByRole('tab', { name: 'Public Library', exact: true }).click();
    await assignerPage.getByPlaceholder('Search by title or keyword...').fill(title);
    await assignerPage.getByTestId(`material-list-row-${testId}`).getByRole('button', { name: 'Assign HW' }).click();
    const modal = assignerPage.locator('.homework-create-modal');
    await modal.getByRole('button', { name: /Assign to Students/u }).click();
    await modal.getByRole('button', { name: /Select Students/u }).click();
    await assignerPage.getByRole('checkbox', { name: 'Fixture Student' }).check();
    await assignerPage.getByRole('button', { name: 'Apply Selection (1)' }).click();
    await modal.getByRole('button', { name: /^Next/u }).click();
    await modal.getByLabel('Due Date', { exact: true }).fill(new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 16));
    await modal.getByRole('button', { name: /Anti-Cheat Settings/u }).click();
    await modal.getByRole('combobox', { name: 'Preset' }).selectOption({ label: 'None' });
    await modal.getByRole('button', { name: /^Next/u }).click();
    const assignment = assignerPage.waitForResponse((response) => response.url().endsWith('/api/homework/assignments') &&
      response.request().method() === 'POST');
    await modal.getByRole('button', { name: /Create Homework/u }).click();
    const assigned = await assignment;
    expect(assigned.status()).toBe(201);
    const { assignmentId, totalAssigned } = await assigned.json();
    expect(totalAssigned).toBe(1);
    const assignerAuthorization = (await assigned.request().allHeaders()).authorization;
    expect((await appData(`homework_test_access/${testId}/local-student/${assignmentId}`)).teacherId).toBe('local-teacher2');
    expect((await appData(`media_assets/${assetId}`)).ownerId).toBe(uid);
    const assignerSummary = await postWorker('/external-audio/connections', {}, assignerAuthorization, teacher);
    expect(assignerSummary.ok).toBe(true);
    const assignerAudio = await assignerSummary.json();
    if (!realProvider) {
      const previousId = assignerAudio.activeConnectionId;
      const connected = await postWorker(previousId ? '/external-audio/switch' : '/external-audio/connect', {
        ...(previousId ? { connectionId: previousId } : {}),
        generation: assignerAudio.generation, bucketName: providerBucket, prefix: 'other-teacher/',
        applicationKeyId: 'fixture-other-key-id', applicationKey: 'fixture-other-key-secret',
      }, assignerAuthorization, teacher);
      expect(connected.ok).toBe(true);
      const { activeConnectionId, generation } = await connected.json();
      cleanupAssigner = () => postWorker('/external-audio/revoke', {
        connectionId: activeConnectionId, generation,
      }, assignerAuthorization, teacher);
    }

    const assignmentUrl = `${student}/student/homework/${assignmentId}`;
    await viewerPage.goto(`${student}/student/homework`, { waitUntil: 'commit' });
    const homeworkCard = viewerPage.getByRole('article').filter({ has: viewerPage.getByRole('heading', { name: title, exact: true }) });
    await expect(homeworkCard).toBeVisible();
    const homework = await playPublicJourney(viewerPage,
      () => homeworkCard.getByRole('button', { name: 'Start Homework', exact: true }).click(), 'homework', pin!);
    expect(deliveries.every(({ version: delivered }) => delivered === pin)).toBe(true);
    expect(deliveries.some(({ partial, rangedFrom, origin }) => partial && rangedFrom > 0 && origin === student)).toBeTruthy();
    assertOpaque(await viewerContext.storageState({ indexedDB: true }));

    const post = postWorker;
    const playback = (body: unknown, authorization?: string) => post('/listening-delivery/solo', body, authorization);
    const deny = async (response: Response, status?: number) => {
      expect(response.ok).toBe(false);
      if (status) expect(response.status).toBe(status);
      expect(await response.json()).not.toHaveProperty('url');
    };
    const soloRefresh = { ...solo.scope, refreshHandle: solo.renewed.refreshHandle };
    const homeworkRefresh = { ...homework.scope, refreshHandle: homework.renewed.refreshHandle };
    await isolate(unassignedContext);
    const unassignedPage = await unassignedContext.newPage();
    await unassignedPage.goto(`${student}/login`, { waitUntil: 'commit' });
    await unassignedPage.goto(`${student}/student/practice/${testId}`, { waitUntil: 'commit' });
    await expect(unassignedPage).toHaveURL((url) => url.pathname === '/' || url.pathname === '/login');
    await expect(unassignedPage.locator('audio')).toHaveCount(0);
    await deny(await playback(solo.scope), 401);
    await deny(await playback(soloRefresh), 401);
    const unassignedAuthorization = await loginUnassignedStudent(unassignedPage);
    await unassignedPage.goto(assignmentUrl, { waitUntil: 'commit' });
    await expect(unassignedPage.getByRole('button', { name: 'Back to Homework List' })).toBeVisible();
    await expect(unassignedPage.getByRole('button', { name: 'Start Homework' })).toHaveCount(0);
    await deny(await playback(homework.scope, unassignedAuthorization), 403);
    await deny(await playback(homeworkRefresh, unassignedAuthorization), 403);
    await deny(await playback(soloRefresh, unassignedAuthorization), 403);
    await deny(await playback({ ...solo.scope, versionId: 'other-version' }, solo.authorization), 403);
    await deny(await playback({ ...homework.scope, refreshHandle: solo.renewed.refreshHandle }, homework.authorization), 403);

    const summary = await post('/external-audio/connections', {}, teacherAuthorization, teacher);
    expect(summary.ok).toBe(true);
    const { activeConnectionId, generation } = await summary.json();
    await deny(await post('/external-audio/list', { connectionId: activeConnectionId }, assignerAuthorization, teacher), 404);
    await deny(await post('/external-audio/revoke', { connectionId: activeConnectionId, generation }, assignerAuthorization, teacher));
    await deny(await post('/external-audio/connections', {}, solo.authorization), 403);
    if (!realProvider) {
      await setPublicFixture({ rateLimited: true });
      await deny(await playback(solo.scope, solo.authorization), 429);
      await deny(await playback(homeworkRefresh, homework.authorization), 429);
      await setPublicFixture({ enabled: false });
      await deny(await playback(solo.scope, solo.authorization));
      await deny(await post('/api/homework/assignments', assigned.request().postDataJSON(), assignerAuthorization, teacher), 400);
      await setPublicFixture({});
    }
    await appData(`${versionPath}/document/isPublic`, 'PUT', false);
    await deny(await post('/api/homework/assignments', assigned.request().postDataJSON(), assignerAuthorization, teacher), 403);
    await deny(await playback(solo.scope, solo.authorization), 403);
    await appData(`${versionPath}/document/isPublic`, 'PUT', true);
    await appData(`tests/${testId}/isPublic`, 'PUT', false);
    await deny(await playback(soloRefresh, solo.authorization), 403);
    await appData(`tests/${testId}/isPublic`, 'PUT', true);
    await appData(`homework_test_access/${testId}/local-student/${assignmentId}`, 'DELETE');
    await deny(await playback(homework.scope, homework.authorization), 403);
    await deny(await playback(homeworkRefresh, homework.authorization), 403);
    const revoked = await post('/external-audio/revoke', { connectionId: activeConnectionId, generation }, teacherAuthorization, teacher);
    expect(revoked.ok).toBe(true);
    await deny(await playback(solo.scope, solo.authorization), 422);
    await deny(await playback(soloRefresh, solo.authorization), 422);
    const oldUrlExpired = await viewerPage.evaluate(async (url) => {
      try {
        const response = await fetch(url, { headers: { Range: 'bytes=0-0' }, cache: 'no-store' });
        return !response.ok;
      } catch { return true; }
    }, homework.firstGrant.url);
    expect(oldUrlExpired).toBe(true);
  } finally {
    await cleanupAssigner?.();
    await assignerContext.close();
    await viewerContext.close();
    await unassignedContext.close();
  }
});

const fsString = (stringValue: string) => ({ stringValue });
const fsInt = (value: number) => ({ integerValue: String(value) });
const thcsId = 'fixture-thcs-audio';
const firestoreDraft = (id: string) => `http://localhost:8080/v1/projects/${project}/databases/(default)/documents/thcs_drafts/${id}`;

async function seedThcsDraft(id = thcsId, title = 'THCS audio fixture', imageKeys: string[] = []) {
  const questions = (imageKeys.length ? imageKeys : [undefined]).map((imageKey, index) => ({ mapValue: { fields: {
    id: fsString(index ? `question-fixture-${index}` : 'question-fixture'), questionNumber: fsInt(index + 1), type: fsString('mcq-grammar'),
    questionText: fsString('What color?'), options: { arrayValue: { values: ['Blue', 'Gold', 'Pink', 'Gray'].map(fsString) } },
    correctAnswer: fsString('A'), points: fsInt(1),
    ...(imageKey ? { _imageKey: fsString(imageKey), imageUrl: fsString(`${worker}/${imageKey}`) } : {}),
  } } }));
  const fields = {
    userId: fsString(uid), status: fsString('editing'), testType: fsString('THCS-THPT'),
    metadata: { mapValue: { fields: { title: fsString(title), examType: fsString('Quiz'),
      gradeLevel: fsInt(9), duration: fsInt(45), province: fsString('Hà Nội') } } },
    sections: { arrayValue: { values: [{
      mapValue: { fields: {
        id: fsString('section-fixture'), name: fsString('Listening section'), order: fsInt(0), totalPoints: fsInt(questions.length),
        layout: fsString('single-column'), instructionText: fsString('Choose the answer'),
        questions: { arrayValue: { values: questions } },
      } },
    }] } },
  };
  const seeded = await fetch(firestoreDraft(id), { method: 'PATCH', headers: admin, body: JSON.stringify({ fields }) });
  expect(seeded.ok).toBeTruthy();
}

async function openThcsSection(page: Page, origin = teacher, id = thcsId) {
  await page.goto(`${origin}/teacher/thcs-test/edit/${id}`, { waitUntil: 'commit' });
  await page.getByRole('button', { name: /Next: Build Test/u }).click();
  await expect(page.getByRole('button', { name: 'Save Draft', exact: true })).toBeVisible();
}

async function readThcsSection(id: string) {
  const { fields } = await (await fetch(firestoreDraft(id), { headers: admin })).json();
  return fields.sections.arrayValue.values[0].mapValue.fields;
}

async function seedAudioCourse(testId: string) {
  const courseId = `audio-course-${crypto.randomUUID()}`;
  const moduleId = `${courseId}-module`;
  const enrollmentId = `${courseId}-enrollment`;
  const placementId = `${courseId}-placement`;
  const now = Date.now();
  await appData('', 'PATCH', {
    [`courses/${courseId}`]: { id: courseId, name: 'Recording review course', code: courseId, type: 'THCS',
      ownerId: 'local-teacher2', visibility: 'public', duration: { value: 30, unit: 'days' }, createdAt: now },
    [`course_modules/${moduleId}`]: { id: moduleId, courseId, name: 'Recording activity', order: 0, accessType: 'open' },
    [`course_materials/${placementId}`]: { id: placementId, courseId, moduleId, materialId: testId, order: 0, isCopy: false },
    [`course_enrollments/${enrollmentId}`]: { id: enrollmentId, courseId, studentId: 'local-student',
      enrollmentType: 'individual', status: 'active', enrolledAt: now, expiresAt: 0 },
    [`student_teacher_assignments/${courseId}`]: { id: courseId, studentId: 'local-student', teacherId: 'local-teacher2', status: 'active', assignedAt: now },
  });
  return { courseId, moduleId, enrollmentId, placementId };
}

async function launchAudioCourse(page: Page, courseId: string) {
  await page.goto(`${student}/student/courses/${courseId}`, { waitUntil: 'commit' });
  await page.getByRole('button', { name: /^Start/u }).click();
}

async function openSavedAudioReview(page: Page, origin: string, resultId: string) {
  await page.goto(`${origin}/result/${resultId}`, { waitUntil: 'commit' });
  if (origin === student) await page.getByRole('button', { name: 'Review Mistakes' }).click();
}

async function thcsReview(page: Page) {
  await page.getByRole('button', { name: /Next: Answer Key/u }).click();
  await page.getByRole('button', { name: /Next: Review/u }).click();
}

async function publishThcs(page: Page, isPublic: boolean) {
  if (isPublic) {
    // The existing switch uses a visually hidden checkbox and a clickable label.
    await page.getByText('Share in Public Library', { exact: true }).locator('..').locator('label').click();
  }
  const result = page.waitForResponse((response) => response.url().endsWith('/external-audio/publish-thcs') &&
    response.request().method() === 'POST');
  await page.getByRole('button', { name: /Publish Test/u }).click();
  const dialog = page.getByRole('dialog', { name: 'Publish with Warnings?' });
  await expect(dialog).toBeVisible();
  if (isPublic) {
    await expect(dialog).toContainText('depends on your selected recordings and Backblaze connection');
    await expect(dialog).toContainText('uses your Backblaze bandwidth and may incur charges');
  }
  await dialog.getByRole('button', { name: 'Proceed Anyway' }).click();
  const published = await result;
  expect(published.status()).toBe(200);
  await expect(page.getByText(/Published test\. It is now available/u)).toBeVisible();
  return { ...(await published.json()), authorization: (await published.request().allHeaders()).authorization };
}

test('IELTS course-to-result renews and grades the open version after republish', async ({ page, context, browser }) => {
  test.setTimeout(150_000);
  const media = await isolate(context);
  const title = `IELTS retained recording ${crypto.randomUUID().slice(0, 8)}`;
  await login(page);
  await ensureConnection(page);
  await page.goto(`${teacher}/create-test?skill=Listening`, { waitUntil: 'commit' });
  await page.getByRole('button', { name: 'IELTS Text Format' }).click();
  await page.getByRole('button', { name: /Next/u }).click();
  await page.getByLabel('Draft title').fill(title);
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  const reopen = page.getByRole('link', { name: 'Reopen saved draft' });
  await expect(reopen).toBeVisible();
  const draftId = new URL((await reopen.getAttribute('href'))!, teacher).searchParams.get('draft')!;
  const path = `listening_authoring/drafts/${draftId}`;
  const draft = await appData(path);
  await appData(`${path}/document`, 'PATCH', {
    title, isPublic: true, audioSections: [{ ...draft.document.audioSections[0], endQuestion: 1 }],
    questionCount: 1, questions: [{ number: 1, type: 'short-answer', question: 'What color?', answer: 'Blue', sectionNumber: 1, points: 1 }],
    settings: { ...draft.document.settings, audioControls: {
      ...draft.document.settings.audioControls, showPlayPause: true, showProgressBar: true, showSeekControl: true,
    } },
  });
  await reopen.click();
  await choose(page, `${providerPrefix}First take.wav`);
  await playAfterPreview(page);
  const pinned = media.at(-1)?.version;
  const saved = page.waitForResponse(response => response.url().endsWith('/listening-authoring/save-draft') &&
    response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  const teacherAuth = (await (await saved).request().allHeaders()).authorization;
  const savedDraft = await appData(path);
  const mutate = (action: string, body: unknown) => postWorker(`/listening-authoring/${action}`, body, teacherAuth, teacher);
  const publish = (token: number) => mutate('publish', { draftId, expectedConflictToken: token, idempotencyKey: crypto.randomUUID() });
  const firstPublication = await publish(savedDraft.conflictToken);
  expect(firstPublication.status).toBe(200);
  const { versionId } = await firstPublication.json();
  const { testId } = await appData(`listening_authoring/versions/${versionId}`);
  const course = await seedAudioCourse(testId);
  const learnerContext = await browser.newContext();
  const reviewerContext = await browser.newContext();
  try {
    await isolate(learnerContext);
    const learner = await learnerContext.newPage();
    await login(learner, student, 'Student');
    const grants = learner.waitForResponse(response => response.url().endsWith('/listening-delivery/solo') &&
      response.request().method() === 'POST' && !response.request().postDataJSON().refreshHandle);
    void grants.catch(() => undefined);
    await launchAudioCourse(learner, course.courseId);
    const grantResponse = await grants;
    expect(grantResponse.status()).toBe(200);
    const auth = (await grantResponse.request().allHeaders()).authorization;
    const scope = grantResponse.request().postDataJSON();
    expect(scope.courseAttemptHandle).toBeTruthy();
    const grant = await grantResponse.json();
    expect(new URL(grant.url).searchParams.get('versionId')).toBe(pinned);
    await learner.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(() => learner.locator('audio').evaluate((audio: HTMLAudioElement) => audio.currentTime)).toBeGreaterThan(0);
    const latest = await appData(path);
    const revision = await mutate('save-draft', { draftId, expectedConflictToken: latest.conflictToken, trigger: 'explicit',
      document: { ...latest.document, questions: [{ ...latest.document.questions[0], answer: 'Gold' }] },
      idempotencyKey: crypto.randomUUID(),
    });
    expect(revision.status).toBe(200);
    const newer = await publish((await revision.json()).conflictToken);
    expect(newer.status).toBe(200);
    expect((await newer.json()).versionId).not.toBe(versionId);
    const renewed = await postWorker('/listening-delivery/solo', { ...scope, refreshHandle: grant.refreshHandle }, auth);
    expect(renewed.status).toBe(200);
    expect(new URL((await renewed.json()).url).searchParams.get('versionId')).toBe(pinned);
    const oldStart = await postWorker('/listening-delivery/course-open', {
      testId, versionId, courseId: course.courseId, moduleId: course.moduleId, operationId: 'fresh-old-attempt',
    }, auth);
    expect(oldStart.status).toBe(403);
    expect(await oldStart.json()).not.toHaveProperty('attemptHandle');
    const submit = learner.waitForResponse(response => response.url().endsWith('/listening-delivery/submit') &&
      response.request().method() === 'POST');
    void submit.catch(() => undefined);
    await learner.getByRole('textbox').first().fill('Blue');
    await learner.getByRole('button', { name: 'Review answers' }).click();
    const submitted = await submit;
    expect(submitted.status()).toBe(200);
    const { resultId, percentage } = await submitted.json();
    expect(percentage).toBe(100);
    const retained = await appData(`test_results/${resultId}`);
    expect(retained.materialVersionId).toBe(versionId);
    assertOpaque(retained);
    await appData(`course_materials/${course.placementId}`, 'DELETE');
    const resultDelivery = learner.waitForResponse(response => response.url().endsWith('/listening-delivery/result-review') &&
      response.request().method() === 'POST');
    void resultDelivery.catch(() => undefined);
    await openSavedAudioReview(learner, student, resultId);
    const resultGrant = await resultDelivery;
    expect(resultGrant.status()).toBe(200);
    const retainedGrant = await resultGrant.json();
    expect(new URL(retainedGrant.url).searchParams.get('versionId')).toBe(pinned);
    const resultScope = resultGrant.request().postDataJSON();
    const resultRoute = '/listening-delivery/result-review';
    expect((await postWorker(resultRoute, resultScope, teacherAuth, teacher)).status).toBe(403);
    await learner.getByLabel('Section 1 recording', { exact: true }).getByRole('button', { name: 'Play', exact: true }).click();
    const savedRefresh = await postWorker(resultRoute, { ...resultScope, refreshHandle: retainedGrant.refreshHandle }, auth);
    expect(savedRefresh.status).toBe(200);
    expect(new URL((await savedRefresh.json()).url).searchParams.get('versionId')).toBe(pinned);
    await isolate(reviewerContext);
    const reviewer = await reviewerContext.newPage();
    await login(reviewer, teacher, 'Teacher 2');
    await openSavedAudioReview(reviewer, teacher, resultId);
    await expect(reviewer.getByLabel('Section 1 recording', { exact: true }).getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  } finally {
    await learnerContext.close();
    await reviewerContext.close();
  }
});

test('THCS course-to-result keeps the open version and isolates unavailable recordings', async ({ page, context, browser }) => {
  test.setTimeout(180_000);
  const publisherMedia = await isolate(context);
  const id = `thcs-course-${crypto.randomUUID()}`;
  await seedThcsDraft(id, 'THCS retained recordings');
  const draftResponse = await fetch(firestoreDraft(id), { headers: admin });
  const { fields } = await draftResponse.json();
  const sections = fields.sections.arrayValue.values;
  const secondSection = structuredClone(sections[0]);
  secondSection.mapValue.fields.id = fsString('section-second');
  secondSection.mapValue.fields.name = fsString('Second recording');
  secondSection.mapValue.fields.questions.arrayValue.values[0].mapValue.fields.id = fsString('question-second');
  secondSection.mapValue.fields.questions.arrayValue.values[0].mapValue.fields.questionText = fsString('What shape?');
  sections.push(secondSection);
  expect((await fetch(`${firestoreDraft(id)}?updateMask.fieldPaths=sections`, {
    method: 'PATCH', headers: admin, body: JSON.stringify({ fields: { sections: fields.sections } }),
  })).ok).toBeTruthy();
  await login(page);
  await ensureConnection(page);
  await openThcsSection(page, teacher, id);
  await choose(page, `${providerPrefix}First take.wav`);
  await playAfterPreview(page);
  const firstPin = publisherMedia.at(-1)?.version;
  await page.getByRole('button', { name: /^2 Second recording/u }).click();
  await choose(page, `${providerPrefix}Second take.wav`);
  await page.getByRole('button', { name: 'Save Draft', exact: true }).click();
  await expect(page.getByText('Saved draft.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Preview/u }).filter({ hasNotText: 'draft audio' }).click();
  await page.getByLabel('Section 1 recording', { exact: true }).getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => page.locator('audio').evaluate((audio: HTMLAudioElement) => audio.currentTime)).toBeGreaterThan(0);
  await page.getByRole('button', { name: /Close Preview/u }).click();
  await thcsReview(page);
  const published = await publishThcs(page, true);
  const original = await appData(`tests/${published.testId}`);
  expect(original.sections.map((section: { externalAudio?: unknown }) => !!section.externalAudio)).toEqual([true, true]);
  const course = await seedAudioCourse(published.testId);
  const studentContext = await browser.newContext();
  const otherContext = await browser.newContext();
  const reviewerContext = await browser.newContext();
  try {
    const media = await isolate(studentContext);
    const learner = await studentContext.newPage();
    await login(learner, student, 'Student');
    if (!realProvider) await fetch(`${worker}/fixture/missing`, { method: 'POST', body: JSON.stringify({ version: 'fixture-second' }) });
    let firstGrantResponse;
    const initial = learner.waitForResponse(response => response.url().endsWith('/external-audio/play-thcs') &&
      response.request().method() === 'POST');
    void initial.catch(() => undefined);
    try {
      await launchAudioCourse(learner, course.courseId);
      firstGrantResponse = await initial;
    } catch (error) {
      await test.info().attach('learner state', { body: await learner.locator('body').innerText(), contentType: 'text/plain' });
      throw error;
    }
    expect(firstGrantResponse.status()).toBe(200);
    const initialScope = firstGrantResponse.request().postDataJSON();
    const studentAuth = (await firstGrantResponse.request().allHeaders()).authorization;
    const firstGrant = await firstGrantResponse.json();
    expect(new URL(firstGrant.url).searchParams.get('versionId')).toBe(firstPin);
    expect(initialScope.attemptHandle).toBeTruthy();
    await learner.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(() => learner.locator('audio').evaluate((audio: HTMLAudioElement) => audio.currentTime)).toBeGreaterThan(0);
    await learner.getByRole('button', { name: /Second recording/u }).click();
    if (!realProvider) {
      await expect(learner.getByRole('alert').filter({ hasText: 'The recording is unavailable.' })).toBeVisible();
      await fetch(`${worker}/fixture/missing`, { method: 'POST', body: JSON.stringify({ version: 'fixture-second', missing: false }) });
    }
    await expect(learner.getByText('What shape?', { exact: true })).toBeVisible();

    await openThcsSection(page, teacher, id);
    await page.getByRole('textbox', { name: 'Question', exact: true }).fill('Revision question');
    await choose(page, `${providerPrefix}Second take.wav`, true);
    await thcsReview(page);
    await publishThcs(page, false);
    const revised = await appData(`tests/${published.testId}`);
    expect(revised.externalAudioVersionId).not.toBe(original.externalAudioVersionId);
    expect(revised.sections[0].externalAudio.assetId).not.toBe(original.sections[0].externalAudio.assetId);
    const route = '/external-audio/play-thcs';
    const oldVersionRenewal = await postWorker(route, { ...initialScope, refreshHandle: firstGrant.refreshHandle }, studentAuth);
    expect(oldVersionRenewal.status).toBe(200);
    expect(new URL((await oldVersionRenewal.json()).url).searchParams.get('versionId')).toBe(firstPin);
    const { attemptHandle: _attemptHandle, ...freshRequest } = initialScope;
    for (const denied of [
      await postWorker(route, freshRequest, studentAuth),
      await postWorker('/external-audio/read-thcs', { testId: published.testId,
        versionId: original.externalAudioVersionId, courseId: course.courseId, moduleId: course.moduleId }, studentAuth),
    ]) {
      expect(denied.status).toBe(403);
      expect(await denied.json()).not.toHaveProperty('url');
    }
    await learner.getByRole('button', { name: /Listening section/u }).click();
    await expect(learner.getByText('What color?', { exact: true })).toBeVisible();
    const retained = learner.waitForResponse(response => response.url().endsWith('/external-audio/submit-thcs-course') &&
      response.request().method() === 'POST');
    void retained.catch(() => undefined);
    const submissionErrors: string[] = [];
    learner.on('console', (message) => {
      if (message.type() === 'error' && /Submission failed|PERMISSION_DENIED|Failed to save result/u.test(message.text())) {
        submissionErrors.push(message.text().split('\n')[0]!);
      }
    });
    await learner.getByRole('button', { name: /Submit/u }).click();
    await learner.getByRole('button', { name: 'Submit Anyway' }).click();
    const retainedResponse = await retained.catch(async (error: unknown) => {
      await test.info().attach('submission diagnostics', { body: [...submissionErrors, await learner.locator('body').innerText()].join('\n'),
        contentType: 'text/plain' });
      throw error;
    });
    expect(retainedResponse.status()).toBe(200);
    const { resultId } = await retainedResponse.json();
    const saved = await appData(`test_results/${resultId}`);
    expect(saved.materialVersionId).toBe(original.externalAudioVersionId);
    expect(saved.questionResults[0].correctAnswer).toBe('A');
    assertOpaque(saved);
    await learner.waitForURL(url => url.pathname === '/student/academic-record');
    await appData(`course_materials/${course.placementId}`, 'DELETE');
    await appData(`tests/${published.testId}/isPublic`, 'PUT', false);
    expect((await postWorker(route, { ...initialScope, refreshHandle: firstGrant.refreshHandle }, studentAuth)).status).toBe(403);
    if (!realProvider) await fetch(`${worker}/fixture/missing`, { method: 'POST', body: JSON.stringify({ version: 'fixture-second' }) });
    const reviewGrant = learner.waitForResponse(response => response.url().endsWith(route) &&
      response.request().method() === 'POST' && response.request().postDataJSON().sectionId === 'section-fixture');
    void reviewGrant.catch(() => undefined);
    await openSavedAudioReview(learner, student, resultId);
    const review = await reviewGrant;
    expect(review.status()).toBe(200);
    const reviewScope = review.request().postDataJSON();
    expect(reviewScope.versionId).toBe(original.externalAudioVersionId);
    const savedGrant = await review.json();
    expect(new URL(savedGrant.url).searchParams.get('versionId')).toBe(firstPin);
    if (!realProvider) await expect(learner.getByLabel('Section 2 recording', { exact: true }).getByRole('alert')).toBeVisible();
    await learner.getByLabel('Section 1 recording', { exact: true }).getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(() => media.some(delivery => delivery.version === firstPin)).toBe(true);
    assertOpaque(await studentContext.storageState({ indexedDB: true }));

    await isolate(otherContext);
    const unrelated = await otherContext.newPage();
    const unrelatedAuth = await loginUnassignedStudent(unrelated);
    await unrelated.goto(`${student}/student/courses/${course.courseId}`, { waitUntil: 'commit' });
    await expect(unrelated.getByText('You are not enrolled in this course')).toBeVisible();
    expect((await postWorker('/external-audio/read-thcs', {
      testId: published.testId, courseId: course.courseId, moduleId: course.moduleId,
    }, unrelatedAuth)).status).toBe(403);
    const denied = await postWorker(route, reviewScope, unrelatedAuth);
    expect(denied.status).toBe(403);
    expect(await denied.json()).not.toHaveProperty('url');
    expect((await postWorker(route, { ...reviewScope, refreshHandle: savedGrant.refreshHandle }, unrelatedAuth)).status).toBe(403);
    await unrelated.goto(`${student}/result/${resultId}`, { waitUntil: 'commit' });
    await expect(unrelated.locator('audio')).toHaveCount(0);
    await isolate(reviewerContext);
    const reviewer = await reviewerContext.newPage();
    await login(reviewer, teacher, 'Teacher 2');
    await openSavedAudioReview(reviewer, teacher, resultId);
    await expect(reviewer.getByLabel('Section 1 recording', { exact: true }).getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    const publisherDenied = await postWorker(route, reviewScope, published.authorization, teacher);
    expect(publisherDenied.status).toBe(403);
    expect(await publisherDenied.json()).not.toHaveProperty('url');
  } finally {
    await studentContext.close();
    await otherContext.close();
    await reviewerContext.close();
  }
});

test('course-to-result qualification also reopens an existing R2 saved result', async ({ page, context }) => {
  await isolate(context);
  const resultId = `legacy-r2-${crypto.randomUUID()}`;
  const path = `test_results/${resultId}`;
  const stamp = Date.now() - 60_000;
  const saved = { resultId, sessionCode: resultId, studentId: 'local-student', studentName: 'Student',
    testId: 'legacy-r2-listening', testType: 'IELTS', testSkill: 'Listening', testTitle: 'Existing R2 saved recording',
    totalScore: 1, maxScore: 1, percentage: 100, bandScore: 9, correct: 1, totalQuestions: 1,
    createdAt: stamp, submittedAt: stamp, isGuest: false,
    questionResults: [{ questionNumber: 1, questionType: 'completion', studentAnswer: 'Blue', correctAnswer: 'Blue',
      isCorrect: true, score: 1, maxScore: 1 }],
    listeningResultReviewAudio: { audioUrl: `${worker}/legacy-r2-fixture.wav` } };
  await appData('', 'PATCH', { [path]: saved,
    [`test_results_by_student/local-student/${resultId}`]: { resultId, testId: saved.testId, sessionCode: resultId, percentage: 100, submittedAt: stamp } });
  await login(page, student, 'Student');
  await openSavedAudioReview(page, student, resultId);
  const recording = page.getByLabel('Result review audio');
  await expect(recording).toHaveAttribute('data-delivery-mode', 'public-r2');
  await play(page, 'Result review audio');
  expect(await appData(path)).toMatchObject(saved);
});

test('THCS mixed-media publish preserves images through pin, copy, and publication failures', async ({ page, context }) => {
  await isolate(context);
  const id = `thcs-mixed-${crypto.randomUUID()}`;
  const keys = [1, 2].map((n) => `temp/images/${uid}/${crypto.randomUUID().replaceAll('-', '')}-question-${n}.png`);
  const durable = keys.map((key) => key.slice('temp/'.length));
  const tempUrls = keys.map((key) => `${worker}/${key}`);
  const permanentUrls = durable.map((key) => `${worker}/${key}`);
  const promotions: string[] = [];
  let moves = 0;
  page.on('request', (request) => {
    if (request.method() !== 'POST') return;
    if (request.url() === `${worker}/thcs/draft-images/promote`) promotions.push(request.postDataJSON().sourceKey);
    if (request.url() === `${worker}/move`) moves++;
  });
  async function imageState(options: { seed?: boolean; failCopy?: string } = {}) {
    const response = await postWorker('/fixture/thcs-images', { keys: [...keys, ...durable], ...options });
    expect(response.ok).toBeTruthy();
    return response.json();
  }
  const imageExists = (exists: boolean, copies = 0) => ({ exists, copies });
  const readSavedImages = async () => (await readThcsSection(id)).questions.arrayValue.values
    .map(({ mapValue }: { mapValue: { fields: { imageUrl: { stringValue: string } } } }) => mapValue.fields.imageUrl.stringValue);
  async function expectImage(url: string) {
    await expect.poll(() => page.locator(`img[src="${url}"]`).evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  }
  async function tryPublish() {
    await page.getByRole('button', { name: /Publish Test/u }).click();
    await page.getByRole('dialog', { name: 'Publish with Warnings?' })
      .getByRole('button', { name: 'Proceed Anyway' }).click();
  }
  const expectRepair = () => expect(page.getByRole('alert').filter({
    hasText: 'Could not publish test: Restore this version in B2 or select another file',
  })).toBeVisible();
  await imageState({ seed: true });
  await seedThcsDraft(id, 'THCS mixed-media fixture', keys);
  await login(page);
  await ensureConnection(page);
  await openThcsSection(page, teacher, id);
  await choose(page, first);
  await page.getByRole('button', { name: 'Save Draft', exact: true }).click();
  await expect(page.getByText('Saved draft.', { exact: true })).toBeVisible();
  const assetId = (await readThcsSection(id)).externalAudio.mapValue.fields.assetId.stringValue;
  await expectImage(tempUrls[0]!);
  await expectImage(tempUrls[1]!);

  await thcsReview(page);
  await setFirstVersionMissing(true);
  try {
    await tryPublish();
    await expectRepair();
    expect(await readSavedImages()).toEqual(tempUrls);
    expect(promotions).toEqual([]);
    expect(await imageState()).toEqual([imageExists(true), imageExists(true), imageExists(false), imageExists(false)]);
    await openThcsSection(page, teacher, id);
    await expectImage(tempUrls[0]!);
    await expectImage(tempUrls[1]!);
  } finally {
    await setFirstVersionMissing(false);
  }

  await imageState({ failCopy: durable[1] });
  await thcsReview(page);
  await tryPublish();
  await expect(page.getByRole('alert').filter({ hasText: 'Could not prepare a question image for publishing' })).toBeVisible();
  expect(await readSavedImages()).toEqual([permanentUrls[0], tempUrls[1]]);
  expect(await imageState()).toEqual([imageExists(true), imageExists(true), imageExists(true, 1), imageExists(false)]);
  await openThcsSection(page, teacher, id);
  await expectImage(permanentUrls[0]!);
  await expectImage(tempUrls[1]!);

  await thcsReview(page);
  const publishRoute = '**/external-audio/publish-thcs';
  // Invalidate the real Worker's B2 pin check only after the draft save has finished.
  await page.route(publishRoute, async (route) => {
    if (route.request().method() === 'POST') await setFirstVersionMissing(true);
    await route.continue();
  });
  try {
    const rejection = page.waitForResponse((response) => response.url().endsWith('/external-audio/publish-thcs') &&
      response.request().method() === 'POST');
    await tryPublish();
    expect(await (await rejection).json()).toEqual({ error: 'object_missing' });
    await expectRepair();
    expect(await readSavedImages()).toEqual(permanentUrls);
    expect(await appData(`tests/thcs-test-${id}`)).toBeNull();
    await page.getByRole('button', { name: /Back: Answer Key/u }).click();
    await page.getByRole('button', { name: /Back: Build Test/u }).click();
    await expectImage(permanentUrls[0]!);
    await expectImage(permanentUrls[1]!);
  } finally {
    await page.unroute(publishRoute);
    await setFirstVersionMissing(false);
  }

  await openThcsSection(page, teacher, id);
  await expectImage(permanentUrls[0]!);
  await expectImage(permanentUrls[1]!);
  await thcsReview(page);
  const published = await publishThcs(page, true);
  const runtime = await appData(`tests/${published.testId}`);
  expect(runtime.sections[0].questions.map(({ imageUrl }: { imageUrl: string }) => imageUrl)).toEqual(permanentUrls);
  expect(runtime.sections[0].externalAudio.assetId).toBe(assetId);
  const grant = await postWorker('/external-audio/play-thcs', {
    testId: published.testId, versionId: runtime.externalAudioVersionId, sectionId: 'section-fixture', assetId,
  }, published.authorization, teacher);
  expect(grant.status).toBe(200);
  expect(new URL((await grant.json()).url).searchParams.get('versionId')).toBe('fixture-first');
  expect(promotions).toEqual([keys[0], keys[1], keys[1]]);
  expect(moves).toBe(0);
  expect(await imageState()).toEqual([imageExists(true), imageExists(true), imageExists(true, 1), imageExists(true, 1)]);
});

test('THCS without external audio publishes images uploaded through the ordinary editor', async ({ page, context }) => {
  await isolate(context);
  const id = `thcs-plain-${crypto.randomUUID()}`;
  await seedThcsDraft(id, 'THCS plain image upload fixture');
  await login(page);
  await openThcsSection(page, teacher, id);
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jPlsAAAAASUVORK5CYII=', 'base64');
  const move = page.waitForResponse((response) => response.url() === `${worker}/move` && response.request().method() === 'POST');
  await page.locator('input[type="file"]').setInputFiles({ name: 'plain.png', mimeType: 'image/png', buffer: image });
  const moved = await move;
  expect(moved.status()).toBe(200);
  const { newUrl } = await moved.json();
  await expect.poll(() => page.locator(`img[src="${newUrl}"]`).evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Save Draft', exact: true }).click();
  await expect(page.getByText('Saved draft.', { exact: true })).toBeVisible();
  await openThcsSection(page, teacher, id);
  await expect(page.locator(`img[src="${newUrl}"]`)).toBeVisible();
  await thcsReview(page);
  await page.getByRole('button', { name: /Publish Test/u }).click();
  await page.getByRole('dialog', { name: 'Publish with Warnings?' }).getByRole('button', { name: 'Proceed Anyway' }).click();
  await expect(page.getByText(/Published test\. It is now available/u)).toBeVisible();
  const { fields } = await (await fetch(firestoreDraft(id), { headers: admin })).json();
  const runtime = await appData(`tests/${fields.publishedTestId.stringValue}`);
  expect(runtime.sections[0].questions[0].imageUrl).toBe(newUrl);
  expect(runtime.sections[0].externalAudio).toBeUndefined();
});

async function playThcsJourney(page: Page, launch: () => Promise<void>, pin: string, privateHomework: boolean) {
  const match = (response: import('@playwright/test').Response, refresh: boolean) =>
    response.url().endsWith('/external-audio/play-thcs') && response.request().method() === 'POST' &&
    Boolean(response.request().postDataJSON()?.refreshHandle) === refresh;
  const issued = page.waitForResponse((response) => match(response, false));
  const refreshed = page.waitForResponse((response) => match(response, true));
  await launch();
  await expect(page.getByRole('status').filter({ hasText: 'Section audio begins after a 2-second delay.' })).toBeVisible();
  const response = await issued;
  expect(response.status()).toBe(200);
  const scope = response.request().postDataJSON();
  expect(Boolean(scope.homeworkId && scope.submissionId)).toBe(privateHomework);
  const firstGrant = await response.json();
  expect(new URL(firstGrant.url).searchParams.get('versionId') === pin).toBe(true);
  const audio = page.locator('audio').first();
  await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.readyState)).toBeGreaterThan(0);
  await expect(page.getByText('What color?', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  const progress = page.getByRole('slider', { name: 'Audio progress' });
  const track = await progress.boundingBox();
  expect(track).toBeTruthy();
  await progress.click({ position: { x: track!.width * 0.58, y: track!.height / 2 } });
  await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime)).toBeGreaterThan(12);
  const refresh = await refreshed;
  expect(refresh.status()).toBe(200);
  const renewal = await refresh.json();
  expect(refresh.request().postDataJSON().refreshHandle === firstGrant.refreshHandle).toBe(true);
  expect(new URL(renewal.url).searchParams.get('versionId') === pin).toBe(true);
  await expect.poll(() => audio.evaluate((element: HTMLAudioElement, url: string) => element.currentSrc === url, renewal.url)).toBe(true);
  const range = await page.evaluate(async () => {
    const url = document.querySelector('audio')!.currentSrc;
    const response = await fetch(url, { headers: { Range: 'bytes=1024-1033' }, cache: 'no-store' });
    return { status: response.status, contentRange: response.headers.get('Content-Range'), size: (await response.arrayBuffer()).byteLength };
  });
  expect(range).toMatchObject({ status: 206, size: 10, contentRange: expect.stringMatching(/^bytes 1024-1033\/[1-9]\d*$/u) });
  await expect.poll(() => Date.now()).toBeGreaterThan(firstGrant.expiresAt);
  await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => !element.paused && element.currentTime > 12)).toBe(true);
  await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => {
    if (!Number.isFinite(element.duration) || element.paused) return false;
    element.currentTime = element.duration - 0.15;
    return true;
  })).toBe(true);
  await expect(page.getByText('Section audio playback limit reached.')).toBeVisible();
  return { scope, refreshHandle: renewal.refreshHandle, authorization: (await response.request().allHeaders()).authorization };
}

test('THCS section publishes an exact recording for private Homework and public practice and clones without the pin', async ({ page, context, browser }) => {
  test.setTimeout(150_000);
  const versions = await isolate(context);
  const suffix = crypto.randomUUID().slice(0, 8);
  const privateId = `thcs-audio-private-${suffix}`;
  const publicId = `thcs-audio-public-${suffix}`;
  const privateTitle = `Private THCS audio ${suffix}`;
  const publicTitle = `Public THCS audio ${suffix}`;
  await seedThcsDraft(privateId, privateTitle);
  await seedThcsDraft(publicId, publicTitle);
  await login(page);
  await ensureConnection(page);
  await openThcsSection(page, teacher, privateId);
  await choose(page, `${providerPrefix}First take.wav`);
  await playAfterPreview(page);
  const pin = versions.find(({ version }) => Boolean(version))?.version;
  expect(Boolean(pin)).toBe(true);
  await page.getByLabel('Start delay (seconds)').fill('2');
  await page.getByLabel('Allowed replays').fill('0');
  await page.getByRole('button', { name: 'Save Draft', exact: true }).click();
  await expect(page.getByText('Saved draft.', { exact: true })).toBeVisible();
  const firstSection = await readThcsSection(privateId);
  expect(firstSection.externalAudio.mapValue.fields.scope.stringValue).toBe('section');
  const oldAsset = firstSection.externalAudio.mapValue.fields.assetId.stringValue;
  assertOpaque(firstSection);
  await openThcsSection(page, teacher, privateId);
  await expect(page.getByLabel('Start delay (seconds)')).toHaveValue('2');
  await expect(page.getByLabel('Allowed replays')).toHaveValue('0');
  await playAfterPreview(page);
  if (!realProvider) {
    await page.getByRole('button', { name: 'Replace external audio' }).click();
    await page.getByRole('dialog', { name: 'Choose audio' }).press('Escape');
    expect((await readThcsSection(privateId)).externalAudio.mapValue.fields.assetId.stringValue).toBe(oldAsset);
    await choose(page, second, true);
    await fetch(`${worker}/fixture/missing`, { method: 'POST', body: JSON.stringify({ version: 'fixture-second' }) });
    await page.getByRole('button', { name: 'Save Draft', exact: true }).click();
    await expect(page.getByText(/^Save error: Restore this version in B2 or select another file/u)).toBeVisible();
    expect((await readThcsSection(privateId)).externalAudio.mapValue.fields.assetId.stringValue).toBe(oldAsset);
    await fetch(`${worker}/fixture/missing`, { method: 'POST', body: JSON.stringify({ version: 'fixture-second', missing: false }) });
    await page.getByRole('button', { name: 'Save Draft', exact: true }).click();
    await expect.poll(async () => (await readThcsSection(privateId)).externalAudio.mapValue.fields.assetId.stringValue).not.toBe(oldAsset);
    await choose(page, first, true);
  }
  await thcsReview(page);
  const privateTest = await publishThcs(page, false);
  const privateRuntime = await appData(`tests/${privateTest.testId}`);
  expect(privateRuntime.sections[0].audioPlayback).toEqual({ allowSeek: true, delaySeconds: 2, maxReplays: 0 });
  expect(privateRuntime.sections[0].questions[0].id).toBe('question-fixture');
  assertOpaque(privateRuntime);
  if (!realProvider) {
    await setFirstVersionMissing(true);
    const missing = await postWorker('/external-audio/publish-thcs', { draftId: privateId }, privateTest.authorization, teacher);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: 'object_missing' });
    await setFirstVersionMissing(false);
  }

  await openThcsSection(page, teacher, publicId);
  await choose(page, `${providerPrefix}First take.wav`);
  await page.getByLabel('Start delay (seconds)').fill('2');
  await page.getByLabel('Allowed replays').fill('0');
  await thcsReview(page);
  const publicTest = await publishThcs(page, true);
  const publicRuntime = await appData(`tests/${publicTest.testId}`);
  expect(publicRuntime.sections[0].externalAudio.scope).toBe('section');
  assertOpaque(publicRuntime);

  await appData('classes/thcs-audio-fixture', 'PUT', {
    id: 'thcs-audio-fixture', name: 'THCS audio fixture class', teacherId: uid, createdBy: uid, status: 'active',
    createdAt: Date.now(), students: { 'local-student': { uid: 'local-student', name: 'Fixture Student', status: 'active' } },
  });
  await page.goto(`${teacher}/lobby`, { waitUntil: 'commit' });
  await page.getByPlaceholder('Search by title or keyword...').fill(privateTitle);
  await page.getByTestId(`material-list-row-${privateTest.testId}`).getByRole('button', { name: 'Assign HW' }).click();
  await page.getByRole('button', { name: 'Individual Students' }).click();
  await page.getByRole('checkbox', { name: /Fixture Student/u }).check();
  const dueDate = page.getByText('Due Date *', { exact: true }).locator('..');
  await dueDate.getByText('Select date & time...', { exact: true }).click();
  await dueDate.getByRole('button', { name: '›', exact: true }).click();
  await dueDate.getByRole('button', { name: '1', exact: true }).click();
  await page.getByText('Schedule', { exact: true }).click();
  const assigned = page.waitForResponse((response) => response.url().endsWith('/api/homework/assignments') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Assign Homework', exact: true }).click();
  const assignmentResponse = await assigned;
  expect(assignmentResponse.status()).toBe(201);
  const { assignmentId } = await assignmentResponse.json();
  await openThcsSection(page, teacher, privateId);
  await page.getByRole('textbox', { name: 'Question', exact: true }).fill('Revised THCS prompt');
  if (!realProvider) await choose(page, second, true);
  await thcsReview(page);
  const republished = await publishThcs(page, false);
  expect(republished.testId).toBe(privateTest.testId);
  expect((await appData(`tests/${privateTest.testId}`)).externalAudioVersionId).not.toBe(privateRuntime.externalAudioVersionId);

  const studentContext = await browser.newContext();
  const otherContext = await browser.newContext();
  const teacherContext = await browser.newContext();
  try {
    const deliveries = await isolate(studentContext);
    const studentPage = await studentContext.newPage();
    await login(studentPage, student, 'Student');
    await studentPage.goto(`${student}/student/homework`, { waitUntil: 'commit' });
    const privateCard = studentPage.getByRole('article').filter({ hasText: privateTitle });
    await expect(privateCard).toBeVisible();
    const homework = await playThcsJourney(studentPage, () => privateCard.getByRole('button', { name: 'Start Homework' }).click(), pin!, true);
    expect(homework.scope.homeworkId).toBe(assignmentId);
    expect(homework.scope.versionId).toBe(privateRuntime.externalAudioVersionId);
    await studentPage.goto(`${student}/student/library`, { waitUntil: 'commit' });
    await studentPage.getByRole('button', { name: 'Public Library', exact: true }).click();
    await studentPage.getByPlaceholder('Search materials...').fill(publicTitle);
    const card = studentPage.getByRole('heading', { name: publicTitle, exact: true }).locator('../../..');
    await expect(card).toBeVisible();
    const solo = await playThcsJourney(studentPage, () => card.getByRole('button', { name: 'Start Practice' }).click(), pin!, false);
    expect(deliveries.every(({ version }) => version === pin)).toBe(true);
    assertOpaque(await studentContext.storageState({ indexedDB: true }));

    const denied = async (response: Response, status: number) => {
      expect(response.status).toBe(status);
      expect(await response.json()).not.toHaveProperty('url');
    };
    const playback = (scope: unknown, authorization?: string) => postWorker('/external-audio/play-thcs', scope, authorization);
    await isolate(otherContext);
    const otherPage = await otherContext.newPage();
    await otherPage.goto(`${student}/login`, { waitUntil: 'commit' });
    await otherPage.goto(`${student}/student/practice/${publicTest.testId}`, { waitUntil: 'commit' });
    await expect(otherPage).toHaveURL((url) => url.pathname === '/' || url.pathname === '/login');
    await expect(otherPage.locator('audio')).toHaveCount(0);
    await denied(await playback(solo.scope), 401);
    await denied(await playback({ ...solo.scope, refreshHandle: solo.refreshHandle }), 401);
    const unassigned = await loginUnassignedStudent(otherPage);
    await otherPage.goto(`${student}/student/practice/${privateTest.testId}`, { waitUntil: 'commit' });
    await expect(otherPage.getByText('Failed to load test information', { exact: true })).toBeVisible();
    await expect(otherPage.locator('audio')).toHaveCount(0);
    await denied(await playback(homework.scope, unassigned), 403);
    await denied(await playback({ ...homework.scope, refreshHandle: homework.refreshHandle }, unassigned), 403);
    await denied(await playback({ ...solo.scope, refreshHandle: solo.refreshHandle }, unassigned), 403);
    await denied(await playback({ ...solo.scope, sectionId: 'forged-section', refreshHandle: solo.refreshHandle }, solo.authorization), 403);
    await denied(await playback({ ...homework.scope, refreshHandle: solo.refreshHandle }, homework.authorization), 403);
    await appData(`homework_test_access/${privateTest.testId}/local-student/${assignmentId}`, 'DELETE');
    await denied(await playback({ ...homework.scope, refreshHandle: homework.refreshHandle }, homework.authorization), 403);
    await appData(`tests/${publicTest.testId}/isPublic`, 'PUT', false);
    await denied(await playback({ ...solo.scope, refreshHandle: solo.refreshHandle }, solo.authorization), 403);
    await appData(`tests/${publicTest.testId}/isPublic`, 'PUT', true);

    await isolate(teacherContext);
    const otherTeacher = await teacherContext.newPage();
    await login(otherTeacher, teacher, 'Teacher 2');
    const tokenResponse = await fetch('http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local-dev-key', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'teacher2@test.com', password: 'password123', returnSecureToken: true }),
    });
    expect(tokenResponse.ok).toBe(true);
    const otherAuthorization = `Bearer ${(await tokenResponse.json()).idToken}`;
    await otherTeacher.goto(`${teacher}/teacher/thcs-test/edit/${publicId}`, { waitUntil: 'commit' });
    await expect(otherTeacher.getByRole('alert').filter({ hasText: 'Error Loading Draft' })).toBeVisible();
    await expect(otherTeacher.getByRole('button', { name: 'Save Draft', exact: true })).toHaveCount(0);
    await denied(await playback(homework.scope, otherAuthorization), 403);
    await denied(await playback({ ...homework.scope, refreshHandle: homework.refreshHandle }, otherAuthorization), 403);
    await denied(await postWorker('/external-audio/publish-thcs', { draftId: publicId }, otherAuthorization, teacher), 404);
    await denied(await postWorker('/external-audio/preview-draft', {
      testType: 'thcs-thpt', draftId: publicId, sectionId: 'section-fixture', assetId: publicRuntime.sections[0].externalAudio.assetId,
    }, otherAuthorization, teacher), 404);

    await otherTeacher.goto(`${teacher}/lobby`, { waitUntil: 'commit' });
    await otherTeacher.getByRole('tab', { name: 'Public Library', exact: true }).click();
    await otherTeacher.getByPlaceholder('Search by title or keyword...').fill(publicTitle);
    await otherTeacher.getByTestId(`material-list-row-${publicTest.testId}`).getByRole('button', { name: 'Clone', exact: true }).click();
    await expect(otherTeacher).toHaveURL(/\/teacher\/thcs-test\/edit\//u);
    const cloneId = new URL(otherTeacher.url()).pathname.split('/').at(-1)!;
    const cloneSection = await readThcsSection(cloneId);
    expect(cloneSection).not.toHaveProperty('externalAudio');
    expect(cloneSection.externalAudioRequired.booleanValue).toBe(true);
    expect(cloneSection.questions.arrayValue.values[0].mapValue.fields.questionText.stringValue).toBe('What color?');
    await otherTeacher.getByRole('button', { name: /Next: Build Test/u }).click();
    await expect(otherTeacher.getByText('Choose your own recording for this section before publishing.')).toBeVisible();
    await denied(await postWorker('/external-audio/publish-thcs', { draftId: cloneId }, otherAuthorization, teacher), 422);
    const cloneDoc = await (await fetch(firestoreDraft(cloneId), { headers: admin })).json();
    cloneDoc.fields.sections.arrayValue.values[0].mapValue.fields.externalAudio = {
      mapValue: { fields: { assetId: fsString(publicRuntime.sections[0].externalAudio.assetId), scope: fsString('section') } },
    };
    const forged = await fetch(`${firestoreDraft(cloneId)}?updateMask.fieldPaths=sections`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: otherAuthorization },
      body: JSON.stringify({ fields: { sections: cloneDoc.fields.sections } }),
    });
    expect(forged.ok).toBe(true);
    await denied(await postWorker('/external-audio/publish-thcs', { draftId: cloneId }, otherAuthorization, teacher), 404);
  } finally {
    await studentContext.close();
    await otherContext.close();
    await teacherContext.close();
  }
});

test('disabled local teacher has no external audio controls or authoring requests', async ({ page, context }) => {
  await isolate(context);
  await seedThcsDraft();
  const external = [];
  page.on('request', (request) => {
    if (request.url().startsWith(`${worker}/external-audio/`)) external.push(request.method());
  });
  await login(page, disabledTeacher);
  await openThcsSection(page, disabledTeacher);
  await expect(page.getByRole('button', { name: /external audio/u })).toHaveCount(0);
  expect(external).toEqual([]);
});

test('admin reviews external audio health in Settings', async ({ page, context }, testInfo) => {
  await isolate(context);
  await login(page);
  await ensureConnection(page);
  const profilePath = 'users/local-teacher';
  const profile = await appData(profilePath);
  await appData(profilePath, 'PATCH', { role: 'super_admin' });
  try {
    await page.goto(`${teacher}/admin/settings`, { waitUntil: 'commit' });
    await page.getByRole('button', { name: 'Show external audio settings section', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'External audio source health' })).toBeVisible();
    await expect(page.getByText(/fixture-private-audio.*teacher\//u).first()).toBeVisible();
    await page.getByRole('button', { name: 'Recheck sources' }).click();
    await expect(page.getByText(/fixture-private-audio.*teacher\//u).first()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('admin-audio-health.png') });
  } finally {
    await appData(profilePath, 'PATCH', { role: profile.role });
  }
});
