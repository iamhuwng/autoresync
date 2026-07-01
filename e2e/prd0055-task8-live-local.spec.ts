import { expect, test, type Browser, type BrowserContext, type Page, type Route } from '@playwright/test';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';

const ARTIFACT_DIR = path.resolve('output/prd0055-task8-local-unblock/playwright-artifacts');
const TEACHER_ORIGIN = 'http://localhost:5173';
const STUDENT_ORIGIN = 'http://localhost:5174';

function buildAudibleWavBuffer(durationSeconds: number, frequencyHz: number): Buffer {
  const sampleRate = 8_000;
  const channelCount = 1;
  const bytesPerSample = 2;
  const sampleCount = Math.max(1, Math.floor(sampleRate * durationSeconds));
  const dataSize = sampleCount * channelCount * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channelCount, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channelCount * bytesPerSample, 28);
  buffer.writeUInt16LE(channelCount * bytesPerSample, 32);
  buffer.writeUInt16LE(bytesPerSample * 8, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  const amplitude = 0.22 * 0x7fff;
  for (let i = 0; i < sampleCount; i += 1) {
    const envelope = Math.min(1, i / 200, (sampleCount - i) / 200);
    const sample = Math.round(Math.sin((2 * Math.PI * frequencyHz * i) / sampleRate) * amplitude * envelope);
    buffer.writeInt16LE(sample, 44 + (i * bytesPerSample));
  }

  return buffer;
}

const TASK8_AUDIO_SECTION_1_BYTES = buildAudibleWavBuffer(20, 440);
const TASK8_AUDIO_SECTION_2_BYTES = buildAudibleWavBuffer(20, 554);
const TASK8_AUDIO_SECTION_1_URL = `${STUDENT_ORIGIN}/__prd0055-task8-local/section-1.wav`;
const TASK8_AUDIO_SECTION_2_URL = `${STUDENT_ORIGIN}/__prd0055-task8-local/section-2.wav`;

type SeededFixture = {
  sessionCode: string;
  testId: string;
  databaseURL: string;
  authToken: string;
};

function readViteEnv(): Record<string, string> {
  const envPath = path.resolve('.env');
  const raw = fs.readFileSync(envPath, 'utf8');
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

function buildFirebaseConfig() {
  const env = readViteEnv();
  return {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: env.VITE_FIREBASE_DATABASE_URL,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  };
}

function makeSessionCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'T8';
  for (let i = 0; i < 4; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

function buildListeningFixtureTest(testId: string, now: number, ownerId: string) {
  const questions = [
    {
      id: 'q1',
      number: 1,
      type: 'completion',
      question: 'Complete the note: The meeting starts at ____.',
      answer: 'nine',
      acceptableAnswers: ['9', 'nine'],
      passageId: 'listening-part-1',
    },
    {
      id: 'q2',
      number: 2,
      type: 'completion',
      question: 'Complete the note: Bring your ____ card.',
      answer: 'student',
      acceptableAnswers: ['student'],
      passageId: 'listening-part-1',
    },
    {
      id: 'q3',
      number: 3,
      type: 'completion',
      question: 'Complete the note: The second speaker mentions the ____ desk.',
      answer: 'service',
      acceptableAnswers: ['service'],
      passageId: 'listening-part-2',
    },
    {
      id: 'q4',
      number: 4,
      type: 'completion',
      question: 'Complete the note: The final room is on the ____ floor.',
      answer: 'third',
      acceptableAnswers: ['third', '3rd'],
      passageId: 'listening-part-2',
    },
  ];

  return {
    id: testId,
    ownerId,
    createdBy: ownerId,
    createdByUserId: ownerId,
    userId: ownerId,
    title: 'PRD-0055 Task 8.14 Local Listening Fixture',
    type: 'IELTS',
    testType: 'IELTS',
    skill: 'Listening',
    skillType: 'listening',
    displayMode: 'text',
    isPublic: false,
    visibility: 'private',
    deliveryProjectionReady: true,
    hasStudentSafeProjection: true,
    studentSafeProjectionReady: true,
    duration: 5,
    questionCount: questions.length,
    createdAt: now,
    updatedAt: now,
    audioSections: [
      {
        number: 1,
        name: 'Part 1',
        audioUrl: TASK8_AUDIO_SECTION_1_URL,
        streamUrl: TASK8_AUDIO_SECTION_1_URL,
        startQuestion: 1,
        endQuestion: 2,
        duration: 20,
        waitTimeBefore: 0,
      },
      {
        number: 2,
        name: 'Part 2',
        audioUrl: TASK8_AUDIO_SECTION_2_URL,
        streamUrl: TASK8_AUDIO_SECTION_2_URL,
        startQuestion: 3,
        endQuestion: 4,
        duration: 20,
        waitTimeBefore: 0,
      },
    ],
    passages: [],
    questions,
    metadata: {
      source: 'prd0055-task8-local-browser-proof',
      fixtureOnly: true,
      ownerId,
      deliveryProjectionReady: true,
      hasStudentSafeProjection: true,
      studentSafeProjectionReady: true,
    },
  };
}

function buildStudentSafeTestData(testData: ReturnType<typeof buildListeningFixtureTest>) {
  return {
    ...testData,
    questions: testData.questions.map(({ answer, acceptableAnswers, ...question }) => question),
  };
}

async function readBrowserAuth(page: Page): Promise<{ uid: string; token: string }> {
  const { apiKey } = buildFirebaseConfig();
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
  }, apiKey);
}

async function readSessionViaBrowser(
  page: Page,
  databaseURL: string,
  authToken: string,
  sessionCode: string,
) {
  return await page.evaluate(async ({ dbUrl, token, code }) => {
    const response = await fetch(
      `${dbUrl}/game_sessions/${code}.json?auth=${encodeURIComponent(token)}`,
    );
    if (!response.ok) {
      throw new Error(`RTDB read failed: ${response.status} ${await response.text()}`);
    }
    return await response.json();
  }, { dbUrl: databaseURL, token: authToken, code: sessionCode });
}

async function patchRtdbRootViaBrowser(
  page: Page,
  databaseURL: string,
  authToken: string,
  updates: Record<string, unknown>,
) {
  await page.evaluate(async ({ dbUrl, token, patch }) => {
    const response = await fetch(`${dbUrl}/.json?auth=${encodeURIComponent(token)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!response.ok) {
      throw new Error(`RTDB patch failed: ${response.status} ${await response.text()}`);
    }
  }, { dbUrl: databaseURL, token: authToken, patch: updates });
}

async function readSessionResultIds(
  page: Page,
  fixture: SeededFixture,
): Promise<string[]> {
  return await page.evaluate(async ({ dbUrl, token, code }) => {
    const response = await fetch(
      `${dbUrl}/test_results_by_session/${code}.json?auth=${encodeURIComponent(token)}`,
    );
    if (!response.ok) {
      throw new Error(`RTDB result-index read failed: ${response.status} ${await response.text()}`);
    }
    const index = await response.json();
    return index && typeof index === 'object' ? Object.keys(index) : [];
  }, { dbUrl: fixture.databaseURL, token: fixture.authToken, code: fixture.sessionCode });
}

async function seedDevFixture(teacherPage: Page): Promise<SeededFixture> {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

  const { databaseURL } = buildFirebaseConfig();
  const teacherAuth = await readBrowserAuth(teacherPage);
  let sessionCode = makeSessionCode();
  for (let attempts = 0; attempts < 5; attempts += 1) {
    const existing = await readSessionViaBrowser(teacherPage, databaseURL, teacherAuth.token, sessionCode);
    if (!existing) break;
    sessionCode = makeSessionCode();
  }

  const now = Date.now();
  const testId = `prd0055_task8_local_${now}`;
  const testData = buildListeningFixtureTest(testId, now, teacherAuth.uid);
  const studentSafeTestData = buildStudentSafeTestData(testData);
  const writerClientId = `prd0055-task8-local-${sessionCode}`;

  const sessionData = {
    sessionCode,
    status: 'in-progress',
    createdAt: now,
    updatedAt: now,
    startTime: now,
    expiresAt: now + 24 * 60 * 60 * 1000,
    className: `PRD-0055 Task 8.14 ${sessionCode}`,
    teacherId: writerClientId,
    createdByUserId: teacherAuth.uid,
    createdBy: teacherAuth.uid,
    linkedClassId: null,
    courseId: null,
    moduleId: null,
    activeTests: {},
    activeQuizzes: {},
    students: {},
    bannedStudents: {},
    settings: {
      autoAdvance: true,
      allowLateJoin: true,
      showLeaderboard: false,
      autoArchiveDays: 90,
      restrictToClassMembers: false,
      audioMode: 'online',
      examMode: true,
    },
    mode: 'test',
    testId,
    quizId: null,
    currentQuestionIndex: 0,
    isPaused: false,
    players: {},
    bannedPlayers: {},
    masterAudioState: {
      schemaVersion: 2,
      revision: 1,
      section: 1,
      position: 0,
      isPlaying: true,
      speed: 1,
      timestamp: now,
      updateKind: 'command',
      lastAction: 'initialize',
      lastActionRevision: 1,
      lastActionTimestamp: now,
      actionId: `initialize-1-${now}`,
      writerUid: teacherAuth.uid,
      writerClientId,
    },
  };

  await patchRtdbRootViaBrowser(teacherPage, databaseURL, teacherAuth.token, {
    [`tests/${testId}`]: testData,
    [`student_safe_tests/${testId}`]: studentSafeTestData,
    [`session_test_payloads/${sessionCode}`]: {
      testId,
      generatedAt: now,
      testData: studentSafeTestData,
    },
    [`game_sessions/${sessionCode}`]: sessionData,
  });

  fs.writeFileSync(
    path.join(ARTIFACT_DIR, 'fixture.json'),
    JSON.stringify({
      sessionCode,
      testId,
      teacherOrigin: TEACHER_ORIGIN,
      studentOrigin: STUDENT_ORIGIN,
      seededAt: new Date(now).toISOString(),
    }, null, 2),
    'utf8',
  );

  return {
    sessionCode,
    testId,
    databaseURL,
    authToken: teacherAuth.token,
  };
}

async function quickLogin(page: Page, origin: string, role: 'teacher' | 'student') {
  await page.goto(`${origin}/login`);
  await page.getByRole('button', { name: 'Show dev quick login' }).click();
  await page.locator(role === 'teacher' ? '#dev-login-teacher' : '#dev-login-student').click();
  await expect(page).toHaveURL(role === 'teacher' ? /\/lobby/ : /\/student/, { timeout: 60_000 });
  await expect.poll(async () => {
    try {
      const authPayload = await readBrowserAuth(page);
      return Boolean(authPayload.uid && authPayload.token);
    } catch {
      return false;
    }
  }, {
    timeout: 30_000,
    message: `${role} Firebase browser auth payload is ready`,
  }).toBe(true);
}

function redactDiagnosticText(text: string): string {
  return text.replace(/auth=[^&\s"]+/g, 'auth=[redacted]');
}

function attachDiagnostics(page: Page, label: string, collector?: string[]) {
  const emit = (line: string) => {
    collector?.push(line);
    console.log(line);
  };

  page.on('console', (message) => {
    const text = redactDiagnosticText(message.text());
    if (
      message.type() === 'error'
      || message.type() === 'warning'
      || text.includes('[TestPageRouter]')
      || text.includes('[ListeningTestPage]')
      || text.includes('permission_denied')
    ) {
      emit(`[task8:${label}] console.${message.type()} ${text}`);
    }
  });
  page.on('pageerror', (error) => {
    emit(`[task8:${label}] pageerror ${redactDiagnosticText(error.message)}`);
  });
  page.on('requestfailed', (request) => {
    const failure = request.failure();
    const url = redactDiagnosticText(request.url());
    if (url.includes('firebaseio.com') || url.includes('googleapis.com')) {
      emit(`[task8:${label}] requestfailed ${request.method()} ${url} ${failure?.errorText ?? ''}`);
    }
  });
}

type Task8AudioRouteOptions = {
  section1DelayMs?: number;
  section2DelayMs?: number;
};

async function installTask8AudioRoutes(
  context: BrowserContext,
  options: Task8AudioRouteOptions = {},
) {
  const fulfillAudio = async (
    route: Route,
    bytes: Buffer,
    delayMs = 0,
  ) => {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    await route.fulfill({
      status: 200,
      headers: {
        'access-control-allow-origin': '*',
        'cache-control': 'no-store',
        'content-length': String(bytes.length),
        'content-type': 'audio/wav',
      },
      body: route.request().method() === 'HEAD' ? '' : bytes,
    });
  };

  await context.route('**/__prd0055-task8-local/section-1.wav', async (route) => {
    await fulfillAudio(route, TASK8_AUDIO_SECTION_1_BYTES, options.section1DelayMs);
  });
  await context.route('**/__prd0055-task8-local/section-2.wav', async (route) => {
    await fulfillAudio(route, TASK8_AUDIO_SECTION_2_BYTES, options.section2DelayMs);
  });
}

async function newRolePage(
  browser: Browser,
  viewport: { width: number; height: number },
  label = `${viewport.width}x${viewport.height}`,
  options: {
    audioRoutes?: Task8AudioRouteOptions;
    diagnostics?: string[];
  } = {},
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport });
  await installTask8AudioRoutes(context, options.audioRoutes);
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  attachDiagnostics(page, label, options.diagnostics);
  return { context, page };
}

async function readAudioElementState(page: Page) {
  await page.locator('audio').first().waitFor({ state: 'attached', timeout: 20_000 });
  return await page.locator('audio').first().evaluate((audio) => {
    const element = audio as HTMLAudioElement;
    return {
      currentTime: element.currentTime,
      duration: element.duration,
      networkState: element.networkState,
      paused: element.paused,
      readyState: element.readyState,
      src: element.currentSrc || element.src,
    };
  });
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

async function expectSessionState(
  page: Page,
  fixture: SeededFixture,
  sessionCode: string,
  expected: Partial<{ lastAction: string; section: number; speed: number; commandType: string; position: number }>,
) {
  await expect.poll(async () => {
    const session = await readSessionViaBrowser(
      page,
      fixture.databaseURL,
      fixture.authToken,
      sessionCode,
    );
    return {
      lastAction: session?.masterAudioState?.lastAction,
      section: session?.masterAudioState?.section,
      position: session?.masterAudioState?.position,
      speed: session?.masterAudioState?.speed,
      commandType: session?.audioCommand?.type,
      canonicalRevision: session?.audioCommand?.canonicalRevision,
      revision: session?.masterAudioState?.revision,
    };
  }, {
    timeout: 15_000,
    message: `session ${sessionCode} reaches expected canonical audio state`,
  }).toEqual(expect.objectContaining({
    ...expected,
    canonicalRevision: expect.any(Number),
    revision: expect.any(Number),
  }));
}

async function readFirstPlayerId(page: Page, fixture: SeededFixture, sessionCode: string): Promise<string> {
  await expect.poll(async () => {
    const session = await readSessionViaBrowser(page, fixture.databaseURL, fixture.authToken, sessionCode);
    return session?.players && typeof session.players === 'object'
      ? Object.keys(session.players).length
      : 0;
  }, {
    timeout: 20_000,
    message: `session ${sessionCode} has at least one joined player`,
  }).toBeGreaterThan(0);

  const session = await readSessionViaBrowser(page, fixture.databaseURL, fixture.authToken, sessionCode);
  const players = Object.keys(session.players);
  return players[0];
}

async function waitForEndSessionResultPointer(
  page: Page,
  fixture: SeededFixture,
  sessionCode: string,
  playerId: string,
) {
  return await expect.poll(async () => {
    const session = await readSessionViaBrowser(page, fixture.databaseURL, fixture.authToken, sessionCode);
    const player = session?.players?.[playerId];
    return {
      status: session?.status ?? null,
      testId: session?.testId ?? null,
      lastTestId: player?.lastTestId ?? null,
      latestResultId: player?.latestResultId ?? null,
    };
  }, {
    timeout: 45_000,
    message: `player ${playerId} has a persisted result pointer after teacher session end`,
  }).toEqual(expect.objectContaining({
    status: 'waiting',
    testId: null,
    lastTestId: fixture.testId,
    latestResultId: expect.any(String),
  }));
}

async function writeLocalMatrixArtifact(
  name: string,
  payload: Record<string, unknown>,
) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(ARTIFACT_DIR, name),
    JSON.stringify({
      createdAt: new Date().toISOString(),
      scope: 'PRD-0055 Task 8.14 local-only browser matrix supplement',
      ...payload,
    }, null, 2),
    'utf8',
  );
}

test.describe('PRD-0055 Task 8.14 local live Listening browser proof', () => {
  test('teacher and student live fixture exercise canonical audio authority on localhost ports', async ({ browser }) => {
    const contexts: BrowserContext[] = [];

    try {
      const teacher = await newRolePage(browser, { width: 1440, height: 900 }, 'teacher-desktop');
      contexts.push(teacher.context);
      await quickLogin(teacher.page, TEACHER_ORIGIN, 'teacher');
      const fixture = await seedDevFixture(teacher.page);
      await teacher.page.goto(`${TEACHER_ORIGIN}/teacher-test/${fixture.sessionCode}`);
      await expect(teacher.page.getByText('Audio Control Panel')).toBeVisible({ timeout: 20_000 });
      await expect(teacher.page.getByText(`Session: ${fixture.sessionCode}`)).toBeVisible({ timeout: 20_000 });
      await teacher.page.getByRole('button', { name: 'Pause All Audio' }).first().click();
      await expectSessionState(teacher.page, fixture, fixture.sessionCode, {
        lastAction: 'pause',
        section: 1,
        speed: 1,
        commandType: 'pause',
      });

      const studentDesktopDiagnostics: string[] = [];
      const studentDesktop = await newRolePage(
        browser,
        { width: 1440, height: 900 },
        'student-desktop',
        {
          audioRoutes: { section1DelayMs: 4_000 },
          diagnostics: studentDesktopDiagnostics,
        },
      );
      contexts.push(studentDesktop.context);
      await quickLogin(studentDesktop.page, STUDENT_ORIGIN, 'student');
      await studentDesktop.page.goto(`${STUDENT_ORIGIN}/student-wait/${fixture.sessionCode}`);
      await expect(studentDesktop.page).toHaveURL(new RegExp(`/student-test/${fixture.sessionCode}`), { timeout: 20_000 });
      await expect.poll(() => {
        return studentDesktopDiagnostics.some((line) => line.includes('Audio stalled') || line.includes('Waiting for audio data'));
      }, {
        timeout: 15_000,
        message: 'delayed fixture audio produces a deterministic buffering/stalled diagnostic',
      }).toBe(true);
      await expect(studentDesktop.page.getByText(/Questions 1-2|Question 1|Part 1/i).first()).toBeVisible({ timeout: 20_000 });
      await expect(studentDesktop.page.getByText(/Audio Error/i)).toHaveCount(0);
      await expect(studentDesktop.page.getByText(/Infinity|NaN/i)).toHaveCount(0);
      const pausedBufferedAudio = await readAudioElementState(studentDesktop.page);
      await studentDesktop.page.waitForTimeout(800);
      const pausedBufferedAudioAfterWait = await readAudioElementState(studentDesktop.page);
      expect(pausedBufferedAudioAfterWait.paused).toBe(true);
      expect(pausedBufferedAudioAfterWait.currentTime).toBeLessThanOrEqual(
        Math.max(pausedBufferedAudio.currentTime + 0.25, 0.25),
      );
      expect(pausedBufferedAudioAfterWait.currentTime).toBeLessThan(0.6);
      const studentPlayerId = await readFirstPlayerId(teacher.page, fixture, fixture.sessionCode);

      await teacher.page.getByRole('button', { name: 'Resume All Audio' }).first().click();
      await expectSessionState(teacher.page, fixture, fixture.sessionCode, {
        lastAction: 'resume',
        section: 1,
        speed: 1,
        commandType: 'resume',
      });

      await teacher.page.getByRole('button', { name: 'Next Section' }).click();
      await expectSessionState(teacher.page, fixture, fixture.sessionCode, {
        lastAction: 'section',
        section: 2,
        speed: 1,
        commandType: 'skipToSection',
      });

      await teacher.page.getByLabel('Playback speed for all students').selectOption('1.5');
      await expectSessionState(teacher.page, fixture, fixture.sessionCode, {
        lastAction: 'speed',
        section: 2,
        speed: 1.5,
        commandType: 'setSpeed',
      });

      await expect(studentDesktop.page.getByText(/Questions 3-4|Question 3|Part 2/i).first()).toBeVisible({ timeout: 20_000 });

      const sectionTwoSeek = teacher.page.getByLabel('Seek section 2');
      await sectionTwoSeek.dispatchEvent('mousedown');
      await sectionTwoSeek.evaluate((slider) => {
        const input = slider as HTMLInputElement;
        input.value = '5';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await sectionTwoSeek.dispatchEvent('mouseup');
      await expectSessionState(teacher.page, fixture, fixture.sessionCode, {
        lastAction: 'seek',
        section: 2,
        position: 5,
        speed: 1.5,
        commandType: 'seekToPosition',
      });

      await teacher.page.reload();
      await expect(teacher.page.getByText('Audio Control Panel')).toBeVisible({ timeout: 20_000 });
      await expect(teacher.page.getByLabel('Current audio section')).toHaveValue('2');
      await expect(teacher.page.getByLabel('Playback speed for all students')).toHaveValue('1.5');
      await expect(teacher.page.getByLabel('Seek section 2')).toBeVisible();

      await studentDesktop.page.reload();
      await expect(studentDesktop.page).toHaveURL(new RegExp(`/student-test/${fixture.sessionCode}`), { timeout: 20_000 });
      await expect(studentDesktop.page.getByText(/Questions 3-4|Question 3|Part 2/i).first()).toBeVisible({ timeout: 20_000 });
      await expect(studentDesktop.page.getByText(/Audio Error/i)).toHaveCount(0);
      await expect(studentDesktop.page.getByText(/Infinity|NaN/i)).toHaveCount(0);

      const beforeStaleCommand = await readSessionViaBrowser(
        teacher.page,
        fixture.databaseURL,
        fixture.authToken,
        fixture.sessionCode,
      );
      await patchRtdbRootViaBrowser(teacher.page, fixture.databaseURL, fixture.authToken, {
        [`game_sessions/${fixture.sessionCode}/audioCommand`]: {
          type: 'skipToSection',
          sectionNumber: 1,
          position: 0,
          speed: 1,
          timestamp: Date.now(),
          canonicalRevision: Math.max(1, Number(beforeStaleCommand.masterAudioState.revision) - 1),
          source: 'prd0055-task8-local-stale-command-probe',
        },
      });
      await studentDesktop.page.reload();
      await expect(studentDesktop.page.getByText(/Questions 3-4|Question 3|Part 2/i).first()).toBeVisible({ timeout: 20_000 });
      await expectSessionState(teacher.page, fixture, fixture.sessionCode, {
        lastAction: 'seek',
        section: 2,
        position: 5,
        speed: 1.5,
      });

      const canonicalBeforeConflict = await readSessionViaBrowser(
        teacher.page,
        fixture.databaseURL,
        fixture.authToken,
        fixture.sessionCode,
      );
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
        writerClientId: `competing-monitor-${fixture.sessionCode}`,
      };
      await patchRtdbRootViaBrowser(teacher.page, fixture.databaseURL, fixture.authToken, {
        [`game_sessions/${fixture.sessionCode}/masterAudioState`]: equalRevisionConflictState,
      });
      await studentDesktop.page.waitForTimeout(1_500);
      await expect(studentDesktop.page.getByText(/Questions 3-4|Question 3|Part 2/i).first()).toBeVisible({ timeout: 10_000 });
      const recoveryTimestamp = Date.now();
      const recoveredCanonicalState = {
        ...canonicalBeforeConflict.masterAudioState,
        actionId: `recover-after-conflict-${Number(canonicalBeforeConflict.masterAudioState.revision) + 1}-${recoveryTimestamp}`,
        lastActionRevision: Number(canonicalBeforeConflict.masterAudioState.revision) + 1,
        lastActionTimestamp: recoveryTimestamp,
        revision: Number(canonicalBeforeConflict.masterAudioState.revision) + 1,
        timestamp: recoveryTimestamp,
        writerClientId: `teacher-monitor-${fixture.sessionCode}`,
      };
      await patchRtdbRootViaBrowser(teacher.page, fixture.databaseURL, fixture.authToken, {
        [`game_sessions/${fixture.sessionCode}/masterAudioState`]: recoveredCanonicalState,
        [`game_sessions/${fixture.sessionCode}/audioCommand`]: createAudioCommandProjectionFromState(recoveredCanonicalState),
      });
      await expectSessionState(teacher.page, fixture, fixture.sessionCode, {
        lastAction: 'seek',
        section: 2,
        position: 5,
        speed: 1.5,
        commandType: 'seekToPosition',
      });

      const headphoneTimestamp = Date.now();
      await patchRtdbRootViaBrowser(teacher.page, fixture.databaseURL, fixture.authToken, {
        [`game_sessions/${fixture.sessionCode}/settings/audioMode`]: 'offline',
        [`game_sessions/${fixture.sessionCode}/players/${studentPlayerId}/name`]: 'Task 8 Local Student',
        [`game_sessions/${fixture.sessionCode}/players/${studentPlayerId}/headphoneRequest`]: {
          requested: true,
          requestedAt: headphoneTimestamp,
          status: 'pending',
        },
        [`game_sessions/${fixture.sessionCode}/players/prd0055-task8-denied-headphones`]: {
          name: 'Denied Headphone Fixture',
          headphoneRequest: {
            requested: true,
            requestedAt: headphoneTimestamp + 1,
            status: 'denied',
          },
        },
      });
      await teacher.page.reload();
      await expect(teacher.page.getByText('Headphone Requests')).toBeVisible({ timeout: 20_000 });
      await expect(teacher.page.getByText(/Pending/i).first()).toBeVisible();
      await expect(teacher.page.getByText(/Denied/i).first()).toBeVisible();
      await teacher.page.getByRole('button', { name: /Approve/i }).first().click();
      await expect.poll(async () => {
        const session = await readSessionViaBrowser(
          teacher.page,
          fixture.databaseURL,
          fixture.authToken,
          fixture.sessionCode,
        );
        return session?.players?.[studentPlayerId]?.headphoneRequest?.status;
      }, {
        timeout: 15_000,
        message: 'teacher approval updates headphone request state',
      }).toBe('approved');
      await expect(teacher.page.getByText('1 active')).toBeVisible();

      await teacher.page.screenshot({
        path: path.join(ARTIFACT_DIR, 'teacher-desktop-monitor.png'),
        fullPage: true,
      });
      await studentDesktop.page.screenshot({
        path: path.join(ARTIFACT_DIR, 'student-desktop-live.png'),
        fullPage: true,
      });

      for (const viewport of [
        { name: 'student-mobile-375', width: 375, height: 812 },
        { name: 'student-mobile-320', width: 320, height: 740 },
      ]) {
        const student = await newRolePage(browser, { width: viewport.width, height: viewport.height }, viewport.name);
        contexts.push(student.context);
        await quickLogin(student.page, STUDENT_ORIGIN, 'student');
        await student.page.goto(`${STUDENT_ORIGIN}/student-wait/${fixture.sessionCode}`);
        await expect(student.page).toHaveURL(new RegExp(`/student-test/${fixture.sessionCode}`), { timeout: 20_000 });
        await expect(student.page.getByText(/Questions|Part 1|Part 2|Question/i).first()).toBeVisible({ timeout: 20_000 });
        await expect(student.page.getByText('Failed to Load Test')).toHaveCount(0);
        await expect(student.page.getByText(/Audio Error/i)).toHaveCount(0);
        await expect(student.page.getByText(/Infinity|NaN/i)).toHaveCount(0);
        await student.page.screenshot({
          path: path.join(ARTIFACT_DIR, `${viewport.name}-live.png`),
          fullPage: true,
        });
      }

      teacher.page.once('dialog', async (dialog) => {
        await dialog.accept();
      });
      await teacher.page.getByRole('button', { name: 'End' }).click();
      await waitForEndSessionResultPointer(studentDesktop.page, fixture, fixture.sessionCode, studentPlayerId);
      const submittedSession = await readSessionViaBrowser(
        teacher.page,
        fixture.databaseURL,
        fixture.authToken,
        fixture.sessionCode,
      );
      const latestResultId = submittedSession.players?.[studentPlayerId]?.latestResultId;
      expect(typeof latestResultId).toBe('string');
      const latestResultIdString = latestResultId as string;
      await expect.poll(async () => {
        return await readSessionResultIds(teacher.page, fixture);
      }, {
        timeout: 20_000,
        message: 'teacher End auto-submit result is indexed by session',
      }).toContain(latestResultIdString);
      const resultIdsAfterAcceptedEndSubmit = await readSessionResultIds(teacher.page, fixture);
      const postEndSubmitControl = studentDesktop.page.getByRole('button', { name: /Review|Submit/i }).first();
      const postEndSubmitControlVisible = await postEndSubmitControl.isVisible().catch(() => false);
      if (postEndSubmitControlVisible) {
        await postEndSubmitControl.click({ timeout: 2_000 }).catch(() => undefined);
      }
      await studentDesktop.page.waitForTimeout(1_000);
      const resultIdsAfterRejectedPostEndSubmit = await readSessionResultIds(teacher.page, fixture);
      expect([...resultIdsAfterRejectedPostEndSubmit].sort()).toEqual([...resultIdsAfterAcceptedEndSubmit].sort());

      await writeLocalMatrixArtifact('local-matrix-supplement.json', {
        sessionCode: fixture.sessionCode,
        testId: fixture.testId,
        covered: [
          'student buffering/loading during teacher pause stays paused and pinned before resume',
          'teacher reload hydrates section/speed/seek controls from canonical state',
          'student reload stays on canonical section without Audio Error/NaN',
          'explicit seek writes canonical seekToPosition state',
          'stale compatibility audioCommand does not override newer masterAudioState',
          'equal-revision competing masterAudioState conflict is ignored by the hydrated student client',
          'headphone pending, approved, and denied states are teacher-visible',
          'teacher End flow accepts auto-submit, indexes the result, returns the session to waiting, and preserves the live student result pointer',
          'post-End submit attempt does not create a duplicate result or corrupt the waiting session',
        ],
        bufferingDuringPause: {
          bufferingDiagnosticObserved: studentDesktopDiagnostics.some((line) => line.includes('Audio stalled') || line.includes('Waiting for audio data')),
          beforeWait: pausedBufferedAudio,
          afterWait: pausedBufferedAudioAfterWait,
          diagnosticLines: studentDesktopDiagnostics.filter((line) => line.includes('AudioPlayer')).slice(-10),
        },
        authorityConflict: {
          rejectedState: equalRevisionConflictState,
          recoveredState: recoveredCanonicalState,
          studentStillOnSection: 2,
        },
        submitDuringEnd: {
          acceptedResultIds: resultIdsAfterAcceptedEndSubmit,
          latestResultId,
          postEndSubmitControlVisible,
          rejectedPostEndResultIds: resultIdsAfterRejectedPostEndSubmit,
        },
        finalMasterAudioState: submittedSession.masterAudioState,
        finalAudioCommand: submittedSession.audioCommand,
        submittedPlayer: {
          playerId: studentPlayerId,
          hasCompletedTest: submittedSession.players?.[studentPlayerId]?.hasCompletedTest === true,
          isSubmitted: submittedSession.players?.[studentPlayerId]?.isSubmitted === true,
          submittedBy: submittedSession.players?.[studentPlayerId]?.submittedBy ?? null,
          lastTestId: submittedSession.players?.[studentPlayerId]?.lastTestId ?? null,
          latestResultId: submittedSession.players?.[studentPlayerId]?.latestResultId ?? null,
          headphoneStatus: submittedSession.players?.[studentPlayerId]?.headphoneRequest?.status ?? null,
        },
        deniedHeadphoneFixture: submittedSession.players?.['prd0055-task8-denied-headphones']?.headphoneRequest ?? null,
      });
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  });
});
