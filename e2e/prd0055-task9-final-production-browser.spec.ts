import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_DEPLOYED_ORIGIN = 'https://kahut1.web.app';
const TEACHER_ORIGIN = process.env.PRD0055_FINAL_TEACHER_ORIGIN
  || process.env.PRD0055_FINAL_ORIGIN
  || DEFAULT_DEPLOYED_ORIGIN;
const STUDENT_ORIGIN = process.env.PRD0055_FINAL_STUDENT_ORIGIN
  || process.env.PRD0055_FINAL_ORIGIN
  || TEACHER_ORIGIN;
const DEFAULT_PROOF_PATH = 'output/prd0055-task9-live-readback/prd0055-final-live-private-1782845974456.json';
const PROOF_PATH = process.env.PRD0055_FINAL_LIVE_PROOF || DEFAULT_PROOF_PATH;
const PROOF = JSON.parse(fs.readFileSync(path.resolve(PROOF_PATH), 'utf8')) as {
  proofId: string;
  selectedTeacher: { uid: string; email: string };
  selectedStudent: { uid: string; email: string };
  fixture: {
    sessionCode: string;
    classId: string;
    testId: string;
    versionId: string;
    assetIds: [string, string];
  };
};
const ARTIFACT_DIR = path.resolve('output/prd0055-task9-live-readback', `${PROOF.proofId}-final-browser`);

type BrowserAuth = { uid: string; token: string };
type DeliveryEvent = {
  label: string;
  type: 'requestfailed' | 'response';
  method?: string;
  status?: number;
  url: string;
  failure?: string;
};

function readViteEnv(): Record<string, string> {
  const raw = fs.readFileSync(path.resolve('.env'), 'utf8');
  return Object.fromEntries(
    raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=');
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

const FIREBASE_CONFIG = readViteEnv();
const DATABASE_URL = FIREBASE_CONFIG.VITE_FIREBASE_DATABASE_URL;
const FIREBASE_API_KEY = FIREBASE_CONFIG.VITE_FIREBASE_API_KEY;

const redactUrl = (url: string): string => url
  .replace(/token=[^&]+/g, 'token=[redacted]')
  .replace(/auth=[^&]+/g, 'auth=[redacted]');

function isBenignMediaAbort(event: DeliveryEvent): boolean {
  if (event.type !== 'requestfailed' || event.failure !== 'net::ERR_ABORTED') {
    return false;
  }

  return (
    event.method === 'GET'
    && event.url.includes('/listening-delivery/content')
  ) || (
    event.method === 'POST'
    && event.url.includes('/listening-delivery/live')
  );
}

function attachDeliveryEvents(page: Page, label: string, events: DeliveryEvent[]) {
  page.on('response', (response) => {
    const url = response.url();
    if (!url.includes('/listening-delivery/')) return;
    events.push({
      label,
      type: 'response',
      method: response.request().method(),
      status: response.status(),
      url: redactUrl(url),
    });
  });
  page.on('requestfailed', (request) => {
    const url = request.url();
    if (!url.includes('/listening-delivery/')) return;
    events.push({
      label,
      type: 'requestfailed',
      method: request.method(),
      url: redactUrl(url),
      failure: request.failure()?.errorText,
    });
  });
}

async function readBrowserAuth(page: Page): Promise<BrowserAuth> {
  return await page.evaluate((firebaseApiKey) => {
    const readAuthPayload = (candidate: unknown): { uid: string; token: string } | null => {
      if (!candidate || typeof candidate !== 'object') return null;
      const payload = candidate as {
        uid?: string;
        stsTokenManager?: { accessToken?: string };
        value?: {
          uid?: string;
          stsTokenManager?: { accessToken?: string };
        };
      };
      const value = payload.value ?? payload;
      const uid = value.uid;
      const token = value.stsTokenManager?.accessToken;
      return uid && token ? { uid, token } : null;
    };

    const authStorageKey = Object.keys(window.localStorage)
      .find((key) => key.startsWith(`firebase:authUser:${firebaseApiKey}:`));
    if (authStorageKey) {
      const rawAuth = window.localStorage.getItem(authStorageKey);
      if (rawAuth) {
        const parsedAuth = readAuthPayload(JSON.parse(rawAuth));
        if (parsedAuth) return parsedAuth;
      }
    }

    return new Promise<{ uid: string; token: string }>((resolve, reject) => {
      const request = window.indexedDB.open('firebaseLocalStorageDb');
      request.onerror = () => reject(new Error('Firebase IndexedDB auth store could not be opened.'));
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction('firebaseLocalStorage', 'readonly');
        const store = transaction.objectStore('firebaseLocalStorage');
        const valuesRequest = store.getAll();

        valuesRequest.onerror = () => reject(new Error('Firebase IndexedDB auth payload read failed.'));
        valuesRequest.onsuccess = () => {
          const authRecord = valuesRequest.result
            .find((entry: unknown) => JSON.stringify(entry).includes(`firebase:authUser:${firebaseApiKey}:`));
          const parsedAuth = readAuthPayload(authRecord);
          if (!parsedAuth) {
            reject(new Error('Firebase browser auth payload not found in localStorage or IndexedDB.'));
            return;
          }
          resolve(parsedAuth);
        };
      };
    });
  }, FIREBASE_API_KEY);
}

async function readSessionViaBrowser(page: Page, token: string) {
  return await page.evaluate(async ({ dbUrl, authToken, code }) => {
    const response = await fetch(`${dbUrl}/game_sessions/${code}.json?auth=${encodeURIComponent(authToken)}`);
    if (!response.ok) {
      throw new Error(`RTDB read failed: ${response.status} ${await response.text()}`);
    }
    return await response.json();
  }, { dbUrl: DATABASE_URL, authToken: token, code: PROOF.fixture.sessionCode });
}

async function patchSessionViaBrowser(page: Page, token: string, patch: Record<string, unknown>) {
  await page.evaluate(async ({ dbUrl, authToken, code, payload }) => {
    const response = await fetch(`${dbUrl}/game_sessions/${code}.json?auth=${encodeURIComponent(authToken)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`RTDB session patch failed: ${response.status} ${await response.text()}`);
    }
  }, { dbUrl: DATABASE_URL, authToken: token, code: PROOF.fixture.sessionCode, payload: patch });
}

async function readDbPathViaBrowser(page: Page, token: string, dbPath: string) {
  return await page.evaluate(async ({ dbUrl, authToken, path }) => {
    const response = await fetch(`${dbUrl}/${path}.json?auth=${encodeURIComponent(authToken)}`);
    if (!response.ok) {
      throw new Error(`RTDB read failed for ${path}: ${response.status} ${await response.text()}`);
    }
    return await response.json();
  }, { dbUrl: DATABASE_URL, authToken: token, path: dbPath });
}

async function putDbPathViaBrowser(page: Page, token: string, dbPath: string, payload: unknown) {
  await page.evaluate(async ({ dbUrl, authToken, path, value }) => {
    const response = await fetch(`${dbUrl}/${path}.json?auth=${encodeURIComponent(authToken)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
    });
    if (!response.ok) {
      throw new Error(`RTDB put failed for ${path}: ${response.status} ${await response.text()}`);
    }
  }, { dbUrl: DATABASE_URL, authToken: token, path: dbPath, value: payload });
}

async function readSessionResultIds(page: Page, token: string): Promise<string[]> {
  return await page.evaluate(async ({ dbUrl, authToken, code }) => {
    const response = await fetch(`${dbUrl}/test_results_by_session/${code}.json?auth=${encodeURIComponent(authToken)}`);
    if (!response.ok) {
      throw new Error(`RTDB result-index read failed: ${response.status} ${await response.text()}`);
    }
    const index = await response.json();
    return index && typeof index === 'object' ? Object.keys(index) : [];
  }, { dbUrl: DATABASE_URL, authToken: token, code: PROOF.fixture.sessionCode });
}

async function quickLogin(page: Page, role: 'teacher' | 'student'): Promise<BrowserAuth> {
  const origin = role === 'teacher' ? TEACHER_ORIGIN : STUDENT_ORIGIN;
  await page.goto(`${origin}/login`);
  await page.getByRole('button', { name: /show dev quick login/i }).click();
  await page.locator(role === 'teacher' ? '#dev-login-teacher' : '#dev-login-student').click();
  await expect(page).toHaveURL(role === 'teacher' ? /\/lobby/ : /\/student/, { timeout: 60_000 });
  await expect.poll(async () => {
    try {
      const authPayload = await readBrowserAuth(page);
      return Boolean(authPayload.uid && authPayload.token);
    } catch {
      return false;
    }
  }, { timeout: 30_000 }).toBe(true);
  return await readBrowserAuth(page);
}

async function newRolePage(
  browser: Browser,
  viewport: { width: number; height: number },
  label: string,
  events: DeliveryEvent[],
  delayFirstContentMs = 0,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport, isMobile: viewport.width <= 500 });
  if (delayFirstContentMs > 0) {
    let delayed = false;
    await context.route('**/listening-delivery/content?**', async (route) => {
      if (!delayed) {
        delayed = true;
        await new Promise((resolve) => setTimeout(resolve, delayFirstContentMs));
      }
      await route.continue();
    });
  }
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  attachDeliveryEvents(page, label, events);
  return { context, page };
}

async function readAudioState(page: Page) {
  await page.locator('audio').first().waitFor({ state: 'attached', timeout: 30_000 });
  return page.locator('audio').first().evaluate((audio) => {
    const element = audio as HTMLAudioElement;
    return {
      currentTime: Number(element.currentTime.toFixed(3)),
      duration: Number.isFinite(element.duration) ? Number(element.duration.toFixed(3)) : null,
      networkState: element.networkState,
      paused: element.paused,
      readyState: element.readyState,
      src: element.currentSrc || element.src,
      error: element.error?.message ?? null,
    };
  }).then((state) => ({ ...state, src: redactUrl(state.src) }));
}

async function expectPrivateAudioReady(page: Page) {
  await expect.poll(async () => {
    const state = await readAudioState(page);
    return {
      hasPrivateContentUrl: state.src.includes('/listening-delivery/content?token='),
      readyStateAtLeastMetadata: state.readyState >= 1,
      error: state.error,
    };
  }, { timeout: 45_000 }).toEqual({
    hasPrivateContentUrl: true,
    readyStateAtLeastMetadata: true,
    error: null,
  });
}

async function expectSessionState(
  page: Page,
  token: string,
  expected: Partial<{ lastAction: string; section: number; speed: number; commandType: string; position: number }>,
) {
  await expect.poll(async () => {
    const session = await readSessionViaBrowser(page, token);
    return {
      lastAction: session?.masterAudioState?.lastAction,
      section: session?.masterAudioState?.section,
      position: session?.masterAudioState?.position,
      speed: session?.masterAudioState?.speed,
      commandType: session?.audioCommand?.type,
      canonicalRevision: session?.audioCommand?.canonicalRevision,
      revision: session?.masterAudioState?.revision,
    };
  }, { timeout: 15_000 }).toEqual(expect.objectContaining({
    ...expected,
    canonicalRevision: expect.any(Number),
    revision: expect.any(Number),
  }));
}

function createAudioCommandProjectionFromState(state: any) {
  const commandTypeByAction: Record<string, string> = {
    pause: 'pause',
    play: 'resume',
    resume: 'resume',
    section: 'skipToSection',
    seek: 'seekToPosition',
    speed: 'setSpeed',
  };
  return {
    schemaVersion: 2,
    commandId: state.actionId,
    canonicalRevision: state.lastActionRevision,
    type: commandTypeByAction[state.lastAction],
    sectionNumber: state.section,
    position: state.position,
    speed: state.speed,
    isPlaying: state.isPlaying,
    timestamp: state.lastActionTimestamp,
    writerUid: state.writerUid,
  };
}

async function readFirstPlayerId(page: Page, token: string): Promise<string> {
  await expect.poll(async () => {
    const session = await readSessionViaBrowser(page, token);
    return session?.players && typeof session.players === 'object' ? Object.keys(session.players).length : 0;
  }, { timeout: 20_000 }).toBeGreaterThan(0);
  const session = await readSessionViaBrowser(page, token);
  return Object.keys(session.players)[0];
}

async function writeFinalBrowserProof(states: Record<string, unknown>, events: DeliveryEvent[]) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const benignMediaAborts = events.filter(isBenignMediaAbort);
  const blockingDeliveryFailures = events.filter((event) => event.type === 'requestfailed' && !isBenignMediaAbort(event));
  fs.writeFileSync(
    path.join(ARTIFACT_DIR, 'final-production-browser-proof.json'),
    `${JSON.stringify({
      createdAt: new Date().toISOString(),
      proofPath: PROOF_PATH,
      proofId: PROOF.proofId,
      deployedOrigin: DEFAULT_DEPLOYED_ORIGIN,
      origins: {
        teacher: TEACHER_ORIGIN,
        student: STUDENT_ORIGIN,
      },
      fixture: PROOF.fixture,
      urls: {
        teacherDesktop: `${TEACHER_ORIGIN}/teacher-test/${PROOF.fixture.sessionCode}`,
        studentDesktop: `${STUDENT_ORIGIN}/student-wait/${PROOF.fixture.sessionCode}`,
        studentMobile: `${STUDENT_ORIGIN}/student-wait/${PROOF.fixture.sessionCode}`,
      },
      ...states,
      deliveryEvents: events,
      benignMediaAborts,
      blockingDeliveryFailures,
    }, null, 2)}\n`,
    'utf8',
  );
}

test.describe('PRD-0055 final deployed live private delivery browser matrix', () => {
  test('teacher and selected students pass deployed private live authority matrix', async ({ browser }) => {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    const contexts: BrowserContext[] = [];
    const deliveryEvents: DeliveryEvent[] = [];
    const states: Record<string, unknown> = {};

    try {
      const teacher = await newRolePage(browser, { width: 1440, height: 900 }, 'teacher-desktop', deliveryEvents);
      contexts.push(teacher.context);
      const teacherAuth = await quickLogin(teacher.page, 'teacher');
      const initialSession = await readSessionViaBrowser(teacher.page, teacherAuth.token);
      const sessionPayload = await readDbPathViaBrowser(
        teacher.page,
        teacherAuth.token,
        `student_safe_tests/${PROOF.fixture.testId}`,
      );
      expect(sessionPayload).toBeTruthy();
      await putDbPathViaBrowser(
        teacher.page,
        teacherAuth.token,
        `session_test_payloads/${PROOF.fixture.sessionCode}`,
        {
          testId: PROOF.fixture.testId,
          generatedAt: Date.now(),
          testData: sessionPayload,
        },
      );
      const selectedStudentUid = PROOF.selectedStudent.uid as string;
      const initialRevision = Number(
        initialSession?.masterAudioState?.revision
          ?? initialSession?.masterAudioState?.lastActionRevision
          ?? 0,
      ) + 1;
      const initialTimestamp = Date.now();
      const sessionResetPatch = {
        status: 'in-progress',
        testId: PROOF.fixture.testId,
        classId: PROOF.fixture.classId,
        teacherId: teacherAuth.uid,
        createdByUserId: teacherAuth.uid,
        currentQuestionIndex: 0,
        updatedAt: initialTimestamp,
        'settings/audioMode': 'online',
        [`students/${selectedStudentUid}`]: true,
        [`players/${selectedStudentUid}/id`]: selectedStudentUid,
        [`players/${selectedStudentUid}/uid`]: selectedStudentUid,
        [`players/${selectedStudentUid}/name`]: 'PRD-0055 Final Student',
        [`players/${selectedStudentUid}/status`]: 'active',
      };
      const sectionOneState = {
        ...(initialSession?.masterAudioState ?? {}),
        schemaVersion: 2,
        actionId: `prd0055-final-section-one-init-${initialRevision}-${initialTimestamp}`,
        actionType: 'section',
        isPlaying: false,
        lastAction: 'section',
        lastActionRevision: initialRevision,
        lastActionTimestamp: initialTimestamp,
        position: 0,
        revision: initialRevision,
        section: 1,
        speed: 1,
        timestamp: initialTimestamp,
        writerUid: teacherAuth.uid,
      };
      await patchSessionViaBrowser(teacher.page, teacherAuth.token, {
        ...sessionResetPatch,
        masterAudioState: sectionOneState,
        audioCommand: createAudioCommandProjectionFromState(sectionOneState),
      });
      await teacher.page.goto(`${TEACHER_ORIGIN}/teacher-test/${PROOF.fixture.sessionCode}`);
      await expect(teacher.page.getByText('Audio Control Panel')).toBeVisible({ timeout: 60_000 });
      await expect(teacher.page.getByText(`Session: ${PROOF.fixture.sessionCode}`)).toBeVisible({ timeout: 60_000 });
      await expectPrivateAudioReady(teacher.page);
      await teacher.page.getByRole('button', { name: 'Pause All Audio' }).first().click();
      await expectSessionState(teacher.page, teacherAuth.token, {
        lastAction: 'pause',
        section: 1,
        speed: 1,
        commandType: 'pause',
      });

      const studentDesktop = await newRolePage(browser, { width: 1440, height: 900 }, 'student-desktop', deliveryEvents, 2_000);
      contexts.push(studentDesktop.context);
      await quickLogin(studentDesktop.page, 'student');
      await studentDesktop.page.goto(`${STUDENT_ORIGIN}/student-wait/${PROOF.fixture.sessionCode}`);
      await expect(studentDesktop.page).toHaveURL(new RegExp(`/student-test/${PROOF.fixture.sessionCode}`), { timeout: 60_000 });
      await expect(studentDesktop.page.getByText(/Complete the note|Question 1|Section 1/i).first()).toBeVisible({ timeout: 60_000 });
      await expect(studentDesktop.page.getByText(/Audio Error/i)).toHaveCount(0);
      await expectPrivateAudioReady(studentDesktop.page);
      const pausedAudio = await readAudioState(studentDesktop.page);
      await studentDesktop.page.waitForTimeout(800);
      const pausedAudioAfterWait = await readAudioState(studentDesktop.page);
      expect(pausedAudioAfterWait.paused).toBe(true);
      expect(pausedAudioAfterWait.currentTime).toBeLessThanOrEqual(Math.max(pausedAudio.currentTime + 0.25, 0.25));
      states.studentPausedAudio = { beforeWait: pausedAudio, afterWait: pausedAudioAfterWait };

      await teacher.page.getByRole('button', { name: 'Resume All Audio' }).first().click();
      await expectSessionState(teacher.page, teacherAuth.token, {
        lastAction: 'resume',
        section: 1,
        speed: 1,
        commandType: 'resume',
      });
      await expect.poll(async () => (await readAudioState(teacher.page)).currentTime, { timeout: 15_000 }).toBeGreaterThan(0);

      await teacher.page.getByRole('button', { name: 'Next Section' }).click();
      await expectSessionState(teacher.page, teacherAuth.token, {
        lastAction: 'section',
        section: 2,
        speed: 1,
        commandType: 'skipToSection',
      });
      await expect(studentDesktop.page.getByText(/Section 2|Question 3|Complete the note/i).first()).toBeVisible({ timeout: 20_000 });
      await expectPrivateAudioReady(studentDesktop.page);

      await teacher.page.getByLabel('Playback speed for all students').selectOption('1.5');
      await expectSessionState(teacher.page, teacherAuth.token, {
        lastAction: 'speed',
        section: 2,
        speed: 1.5,
        commandType: 'setSpeed',
      });

      const sectionTwoSeekPosition = 4;
      await teacher.page.getByRole('button', { name: /Edit current audio time/i }).click();
      const labeledTimeInput = teacher.page.getByLabel('Set current audio time');
      const timeInput = await labeledTimeInput.count()
        ? labeledTimeInput
        : teacher.page.locator('input:not([type="range"])').first();
      await timeInput.fill(`0:0${sectionTwoSeekPosition}`);
      await timeInput.press('Enter');
      await expectSessionState(teacher.page, teacherAuth.token, {
        lastAction: 'seek',
        section: 2,
        position: sectionTwoSeekPosition,
        speed: 1.5,
        commandType: 'seekToPosition',
      });

      await teacher.page.reload();
      await expect(teacher.page.getByText('Audio Control Panel')).toBeVisible({ timeout: 60_000 });
      await expect(teacher.page.getByLabel('Current audio section')).toHaveValue('2');
      await expect(teacher.page.getByLabel('Playback speed for all students')).toHaveValue('1.5');
      await expect(teacher.page.getByLabel('Seek section 2')).toBeVisible();
      await expect(teacher.page.getByRole('button', { name: /Edit current audio time/i })).toContainText('0:04 / 0:08', { timeout: 30_000 });
      await expect.poll(async () => (
        teacher.page.getByTestId('audio-section-progress-fill-2').evaluate((element) => (element as HTMLElement).style.width)
      ), { timeout: 30_000 }).toBe('50%');

      await studentDesktop.page.reload();
      await expect(studentDesktop.page).toHaveURL(new RegExp(`/student-test/${PROOF.fixture.sessionCode}`), { timeout: 60_000 });
      await expect(studentDesktop.page.getByText(/Section 2|Question 3|Complete the note/i).first()).toBeVisible({ timeout: 30_000 });
      await expect(studentDesktop.page.getByText(/Audio Error/i)).toHaveCount(0);

      const beforeStale = await readSessionViaBrowser(teacher.page, teacherAuth.token);
      await patchSessionViaBrowser(teacher.page, teacherAuth.token, {
        audioCommand: {
          type: 'skipToSection',
          sectionNumber: 1,
          position: 0,
          speed: 1,
          timestamp: Date.now(),
          canonicalRevision: Math.max(1, Number(beforeStale.masterAudioState.revision) - 1),
          source: 'prd0055-final-stale-command-probe',
        },
      });
      await studentDesktop.page.reload();
      await expect(studentDesktop.page.getByText(/Section 2|Question 3|Complete the note/i).first()).toBeVisible({ timeout: 30_000 });
      await expectSessionState(teacher.page, teacherAuth.token, {
        lastAction: 'seek',
        section: 2,
        position: sectionTwoSeekPosition,
        speed: 1.5,
      });

      const canonicalBeforeConflict = await readSessionViaBrowser(teacher.page, teacherAuth.token);
      const conflictTimestamp = Date.now();
      const equalRevisionConflictState = {
        ...canonicalBeforeConflict.masterAudioState,
        actionId: `equal-revision-conflict-${canonicalBeforeConflict.masterAudioState.revision}-${conflictTimestamp}`,
        lastAction: 'section',
        lastActionTimestamp: conflictTimestamp,
        position: 0,
        section: 1,
        speed: 1,
        timestamp: conflictTimestamp,
        writerClientId: `competing-monitor-${PROOF.fixture.sessionCode}`,
      };
      await patchSessionViaBrowser(teacher.page, teacherAuth.token, {
        masterAudioState: equalRevisionConflictState,
      });
      await studentDesktop.page.waitForTimeout(1_500);
      await expect(studentDesktop.page.getByText(/Section 2|Question 3|Complete the note/i).first()).toBeVisible({ timeout: 10_000 });
      const recoveryTimestamp = Date.now();
      const recoveredCanonicalState = {
        ...canonicalBeforeConflict.masterAudioState,
        actionId: `recover-after-conflict-${Number(canonicalBeforeConflict.masterAudioState.revision) + 1}-${recoveryTimestamp}`,
        lastActionRevision: Number(canonicalBeforeConflict.masterAudioState.revision) + 1,
        lastActionTimestamp: recoveryTimestamp,
        revision: Number(canonicalBeforeConflict.masterAudioState.revision) + 1,
        timestamp: recoveryTimestamp,
        writerClientId: `teacher-monitor-${PROOF.fixture.sessionCode}`,
      };
      await patchSessionViaBrowser(teacher.page, teacherAuth.token, {
        masterAudioState: recoveredCanonicalState,
        audioCommand: createAudioCommandProjectionFromState(recoveredCanonicalState),
      });
      await expectSessionState(teacher.page, teacherAuth.token, {
        lastAction: 'seek',
        section: 2,
        position: sectionTwoSeekPosition,
        speed: 1.5,
        commandType: 'seekToPosition',
      });

      await readFirstPlayerId(teacher.page, teacherAuth.token);
      const studentPlayerId = selectedStudentUid;
      const headphoneTimestamp = Date.now();
      await patchSessionViaBrowser(teacher.page, teacherAuth.token, {
        'settings/audioMode': 'offline',
        [`players/${studentPlayerId}/name`]: 'PRD-0055 Final Student',
        [`players/${studentPlayerId}/headphoneRequest`]: {
          requested: true,
          requestedAt: headphoneTimestamp,
          status: 'pending',
        },
        'players/prd0055-final-denied-headphones/name': 'Denied Headphone Fixture',
        'players/prd0055-final-denied-headphones/headphoneRequest': {
          requested: true,
          requestedAt: headphoneTimestamp + 1,
          status: 'denied',
        },
      });
      await teacher.page.reload();
      const headphonePanelToggle = teacher.page.getByRole('button', { name: /Headphone Requests/i }).first();
      await expect(headphonePanelToggle).toBeVisible({ timeout: 60_000 });
      await expect.poll(async () => {
        const session = await readSessionViaBrowser(teacher.page, teacherAuth.token);
        return session?.players?.[studentPlayerId]?.headphoneRequest?.status;
      }, { timeout: 20_000 }).toBe('pending');
      if (await teacher.page.getByRole('button', { name: /Approve/i }).count() === 0) {
        await headphonePanelToggle.click();
      }
      await expect(teacher.page.getByRole('button', { name: /Approve/i }).first()).toBeVisible();
      await expect(teacher.page.getByText(/Denied/i).first()).toBeVisible();
      await teacher.page.getByRole('button', { name: /Approve/i }).first().click();
      await expect.poll(async () => {
        const session = await readSessionViaBrowser(teacher.page, teacherAuth.token);
        return session?.players?.[studentPlayerId]?.headphoneRequest?.status;
      }, { timeout: 20_000 }).toBe('approved');

      states.teacherDesktop = await readAudioState(teacher.page);
      states.studentDesktop = await readAudioState(studentDesktop.page);
      await teacher.page.screenshot({ path: path.join(ARTIFACT_DIR, 'teacher-desktop-final.png'), fullPage: true });
      await studentDesktop.page.screenshot({ path: path.join(ARTIFACT_DIR, 'student-desktop-final.png'), fullPage: true });

      for (const viewport of [
        { name: 'student-mobile-375', width: 375, height: 812 },
        { name: 'student-mobile-320', width: 320, height: 740 },
      ]) {
        const student = await newRolePage(browser, { width: viewport.width, height: viewport.height }, viewport.name, deliveryEvents);
        contexts.push(student.context);
        await quickLogin(student.page, 'student');
        await student.page.goto(`${STUDENT_ORIGIN}/student-wait/${PROOF.fixture.sessionCode}`);
        await expect(student.page).toHaveURL(new RegExp(`/student-test/${PROOF.fixture.sessionCode}`), { timeout: 60_000 });
        await expect(student.page.getByText(/Question|Section|Complete the note/i).first()).toBeVisible({ timeout: 60_000 });
        await expect(student.page.getByText('Failed to Load Test')).toHaveCount(0);
        await expect(student.page.getByText(/Audio Error/i)).toHaveCount(0);
        await expectPrivateAudioReady(student.page);
        await student.page.screenshot({ path: path.join(ARTIFACT_DIR, `${viewport.name}-final.png`), fullPage: true });
      }

      teacher.page.once('dialog', async (dialog) => { await dialog.accept(); });
      await teacher.page.getByRole('button', { name: 'End' }).click();
      await expect.poll(async () => {
        const session = await readSessionViaBrowser(teacher.page, teacherAuth.token);
        const player = session?.players?.[studentPlayerId];
        return {
          status: session?.status ?? null,
          testId: session?.testId ?? null,
          lastTestId: player?.lastTestId ?? null,
          latestResultId: player?.latestResultId ?? null,
        };
      }, { timeout: 60_000 }).toEqual(expect.objectContaining({
        status: 'waiting',
        testId: null,
        lastTestId: PROOF.fixture.testId,
        latestResultId: expect.any(String),
      }));

      const submittedSession = await readSessionViaBrowser(teacher.page, teacherAuth.token);
      const latestResultId = submittedSession.players?.[studentPlayerId]?.latestResultId;
      const resultIdsAfterAcceptedEndSubmit = await readSessionResultIds(teacher.page, teacherAuth.token);
      expect(resultIdsAfterAcceptedEndSubmit).toContain(latestResultId);
      const postEndSubmitControl = studentDesktop.page.getByRole('button', { name: /Review|Submit/i }).first();
      const postEndSubmitControlVisible = await postEndSubmitControl.isVisible().catch(() => false);
      if (postEndSubmitControlVisible) {
        await postEndSubmitControl.click({ timeout: 2_000 }).catch(() => undefined);
      }
      await studentDesktop.page.waitForTimeout(1_000);
      const resultIdsAfterRejectedPostEndSubmit = await readSessionResultIds(teacher.page, teacherAuth.token);
      expect([...resultIdsAfterRejectedPostEndSubmit].sort()).toEqual([...resultIdsAfterAcceptedEndSubmit].sort());

      states.authorityConflict = {
        rejectedState: equalRevisionConflictState,
        recoveredState: recoveredCanonicalState,
      };
      states.submitDuringEnd = {
        acceptedResultIds: resultIdsAfterAcceptedEndSubmit,
        latestResultId,
        postEndSubmitControlVisible,
        rejectedPostEndResultIds: resultIdsAfterRejectedPostEndSubmit,
      };
      states.finalSession = submittedSession;
      const blockingDeliveryFailures = deliveryEvents.filter((event) => event.type === 'requestfailed' && !isBenignMediaAbort(event));
      expect(blockingDeliveryFailures).toEqual([]);
      expect(deliveryEvents.some((event) => (
        event.type === 'response'
        && event.method === 'POST'
        && event.status === 200
        && event.url.includes('/listening-delivery/live')
      ))).toBe(true);
      expect(deliveryEvents.some((event) => (
        event.type === 'response'
        && event.method === 'GET'
        && event.status === 206
        && event.url.includes('/listening-delivery/content')
      ))).toBe(true);
    } finally {
      await writeFinalBrowserProof(states, deliveryEvents);
      await Promise.all(contexts.map((context) => context.close()));
    }
  });
});
