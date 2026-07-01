import { expect, test, type Page, type Route } from '@playwright/test';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';

const TEACHER_ORIGIN = 'http://localhost:5173';
const WORKER_ORIGIN = 'http://localhost:8787';
const ARTIFACT_DIR = path.resolve('output/prd0055-task9-local-readiness/reg79-local-private-webkit');
const HOUR_MS = 60 * 60 * 1000;
const REFRESH_THRESHOLD_MS = 10 * 60 * 1000;

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

const AUDIO_BYTES_BY_SECTION: Record<number, Buffer> = {
  1: buildAudibleWavBuffer(8, 440),
  2: buildAudibleWavBuffer(8, 554),
};

type BrowserAuth = { uid: string; token: string };

type DeliveryEvent = {
  type: 'issue' | 'content';
  sectionNumber: number;
  tokenId?: string;
  hasPrevious?: boolean;
  resourceType?: string;
  range?: string | null;
  status?: number;
  contentRange?: string;
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

function makeSessionCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'R79';
  for (let i = 0; i < 3; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

const redactUrl = (url: string): string => url
  .replace(/token=[^&\s"]+/g, 'token=[redacted]')
  .replace(/auth=[^&\s"]+/g, 'auth=[redacted]');

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

async function quickLoginTeacher(page: Page): Promise<BrowserAuth> {
  await page.goto(`${TEACHER_ORIGIN}/login`);
  await page.getByRole('button', { name: /show dev quick login/i }).click();
  await page.locator('#dev-login-teacher').click();
  await expect(page).toHaveURL(/\/lobby/, { timeout: 60_000 });
  return await readBrowserAuth(page);
}

async function patchRtdb(page: Page, token: string, patch: Record<string, unknown>) {
  await page.evaluate(async ({ dbUrl, authToken, updates }) => {
    const response = await fetch(`${dbUrl}/.json?auth=${encodeURIComponent(authToken)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!response.ok) {
      throw new Error(`RTDB patch failed: ${response.status} ${await response.text()}`);
    }
  }, { dbUrl: DATABASE_URL, authToken: token, updates: patch });
}

async function readSession(page: Page, token: string, sessionCode: string) {
  return await page.evaluate(async ({ dbUrl, authToken, code }) => {
    const response = await fetch(`${dbUrl}/game_sessions/${code}.json?auth=${encodeURIComponent(authToken)}`);
    if (!response.ok) {
      throw new Error(`RTDB read failed: ${response.status} ${await response.text()}`);
    }
    return await response.json();
  }, { dbUrl: DATABASE_URL, authToken: token, code: sessionCode });
}

async function seedPrivateLiveFixture(page: Page, auth: BrowserAuth) {
  const now = Date.now();
  const sessionCode = makeSessionCode();
  const proofId = `reg79-local-private-webkit-${now}`;
  const testId = `${proofId}-test`;
  const versionId = `${proofId}-version`;
  const writerClientId = `${proofId}-writer`;
  const assetIds = [`${proofId}-asset-s1`, `${proofId}-asset-s2`] as const;
  const questions = [
    { id: 'q1', number: 1, type: 'completion', question: 'Speaker one says ____.', answer: 'alpha', passageId: 'listening-part-1' },
    { id: 'q2', number: 2, type: 'completion', question: 'Speaker two says ____.', answer: 'beta', passageId: 'listening-part-2' },
  ];
  const testData = {
    id: testId,
    ownerId: auth.uid,
    createdBy: auth.uid,
    createdByUserId: auth.uid,
    title: 'PRD-0055 REG-79 Local Private Delivery WebKit Fixture',
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
    latestPublishedVersionId: versionId,
    publishedVersionId: versionId,
    authoringVersioning: { versionId },
    audioSections: [
      {
        number: 1,
        name: 'Part 1',
        audioUrl: '',
        streamUrl: '',
        assetId: assetIds[0],
        versionId,
        startQuestion: 1,
        endQuestion: 1,
        duration: 8,
        waitTimeBefore: 0,
      },
      {
        number: 2,
        name: 'Part 2',
        audioUrl: '',
        streamUrl: '',
        assetId: assetIds[1],
        versionId,
        startQuestion: 2,
        endQuestion: 2,
        duration: 8,
        waitTimeBefore: 0,
      },
    ],
    passages: [],
    questions,
    metadata: {
      source: 'prd0055-reg79-local-private-webkit',
      fixtureOnly: true,
      proofId,
      versionId,
    },
  };
  const studentSafeTestData = {
    ...testData,
    questions: questions.map(({ answer, ...question }) => question),
  };

  await patchRtdb(page, auth.token, {
    [`tests/${testId}`]: testData,
    [`student_safe_tests/${testId}`]: studentSafeTestData,
    [`session_test_payloads/${sessionCode}`]: {
      testId,
      generatedAt: now,
      testData: studentSafeTestData,
    },
    [`game_sessions/${sessionCode}`]: {
      sessionCode,
      status: 'in-progress',
      createdAt: now,
      updatedAt: now,
      startTime: now,
      expiresAt: now + 24 * HOUR_MS,
      className: `PRD-0055 REG-79 ${sessionCode}`,
      teacherId: writerClientId,
      createdByUserId: auth.uid,
      createdBy: auth.uid,
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
        writerUid: auth.uid,
        writerClientId,
      },
    },
  });

  return { proofId, sessionCode, testId, versionId, assetIds };
}

function parseRange(rangeHeader: string | null, size: number) {
  if (!rangeHeader) return { start: 0, end: size - 1 };
  const match = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader);
  if (!match) return { start: 0, end: Math.min(15, size - 1) };
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : size - 1;
  return {
    start: Math.min(Math.max(0, start), size - 1),
    end: Math.min(Math.max(start, end), size - 1),
  };
}

async function fulfillAudioRange(route: Route, sectionNumber: number, events: DeliveryEvent[]) {
  const bytes = AUDIO_BYTES_BY_SECTION[sectionNumber];
  const rangeHeader = route.request().headers().range ?? null;
  const resourceType = route.request().resourceType();
  const { start, end } = resourceType === 'media'
    ? { start: 0, end: bytes.length - 1 }
    : parseRange(rangeHeader, bytes.length);
  const body = bytes.subarray(start, end + 1);
  const contentRange = `bytes ${start}-${end}/${bytes.length}`;
  events.push({
    type: 'content',
    sectionNumber,
    resourceType,
    range: rangeHeader,
    status: 206,
    contentRange,
  });
  await route.fulfill({
    status: 206,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization,content-type,range',
      'access-control-expose-headers': 'accept-ranges,content-length,content-range,content-type',
      'accept-ranges': 'bytes',
      'content-range': contentRange,
      'content-length': String(body.length),
      'content-type': 'audio/wav',
    },
    body,
  });
}

async function routeLocalPrivateDelivery(page: Page, events: DeliveryEvent[]) {
  await page.route(`${WORKER_ORIGIN}/listening-delivery/live`, async (route) => {
    const body = route.request().postDataJSON() as {
      assetId?: string;
      previous?: unknown;
      sectionNumber?: number;
    };
    const sectionNumber = body.sectionNumber === 2 ? 2 : 1;
    const hasPrevious = Boolean(body.previous);
    const issuedAt = Date.now();
    const tokenId = `local-section-${sectionNumber}${hasPrevious ? '-refresh' : ''}`;
    events.push({
      type: 'issue',
      sectionNumber,
      tokenId,
      hasPrevious,
    });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        assetId: body.assetId,
        url: `${WORKER_ORIGIN}/listening-delivery/content?token=${tokenId}`,
        tokenId,
        issuedAt,
        expiresAt: issuedAt + HOUR_MS,
        refreshAfter: hasPrevious || sectionNumber !== 1
          ? issuedAt + HOUR_MS - REFRESH_THRESHOLD_MS
          : issuedAt - 1,
        ttlMs: HOUR_MS,
        previousUrlValidUntil: hasPrevious ? issuedAt + HOUR_MS : undefined,
        deliveryReady: true,
        range: {
          requestRange: 'bytes=0-15',
          status: 206,
          acceptRanges: 'bytes',
          contentLength: 16,
          contentRange: `bytes 0-15/${AUDIO_BYTES_BY_SECTION[sectionNumber].length}`,
        },
      }),
    });
  });

  await page.route(`${WORKER_ORIGIN}/listening-delivery/content?**`, async (route) => {
    const requestUrl = new URL(route.request().url());
    const sectionNumber = requestUrl.searchParams.get('token')?.includes('section-2') ? 2 : 1;
    await fulfillAudioRange(route, sectionNumber, events);
  });
}

async function readAudioState(page: Page) {
  await page.locator('audio').first().waitFor({ state: 'attached', timeout: 30_000 });
  return await page.locator('audio').first().evaluate((audio) => {
    const element = audio as HTMLAudioElement;
    return {
      currentTime: Number(element.currentTime.toFixed(3)),
      duration: Number.isFinite(element.duration) ? Number(element.duration.toFixed(3)) : null,
      error: element.error?.message ?? null,
      networkState: element.networkState,
      paused: element.paused,
      readyState: element.readyState,
      src: element.currentSrc || element.src,
    };
  });
}

async function expectPrivateAudioSource(page: Page) {
  await expect.poll(async () => {
    const state = await readAudioState(page);
    return {
      hasPrivateContentUrl: state.src.includes('/listening-delivery/content?token='),
    };
  }, { timeout: 45_000 }).toEqual({
    hasPrivateContentUrl: true,
  });
}

test('REG-79 localhost iOS Safari live private delivery supports byte range, seek, and refresh', async ({ page }, testInfo) => {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const deliveryEvents: DeliveryEvent[] = [];
  await routeLocalPrivateDelivery(page, deliveryEvents);
  const teacherAuth = await quickLoginTeacher(page);
  const fixture = await seedPrivateLiveFixture(page, teacherAuth);

  await page.goto(`${TEACHER_ORIGIN}/teacher-test/${fixture.sessionCode}`);
  await expect(page.getByText('Audio Control Panel')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(`Session: ${fixture.sessionCode}`)).toBeVisible({ timeout: 60_000 });
  await expectPrivateAudioSource(page);

  await expect.poll(() => deliveryEvents.some((event) => (
    event.type === 'issue'
    && event.sectionNumber === 1
    && event.hasPrevious === true
  )), { timeout: 45_000 }).toBe(true);
  await expect.poll(async () => {
    const state = await readAudioState(page);
    return {
      hasRefreshedUrl: state.src.includes('local-section-1-refresh'),
    };
  }, { timeout: 45_000 }).toEqual({
    hasRefreshedUrl: true,
  });
  await expect(page.getByText(/Private audio refresh needs attention/i)).toBeHidden({ timeout: 15_000 });

  const rangeProbe = await page.evaluate(async () => {
    const audio = document.querySelector('audio') as HTMLAudioElement | null;
    if (!audio) throw new Error('audio element missing');
    const url = audio.currentSrc || audio.src;
    const response = await fetch(url, { headers: { Range: 'bytes=0-15' } });
    const bytes = Array.from(new Uint8Array(await response.arrayBuffer()).slice(0, 4));
    return {
      status: response.status,
      acceptRanges: response.headers.get('accept-ranges'),
      contentLength: response.headers.get('content-length'),
      contentRange: response.headers.get('content-range'),
      riff: String.fromCharCode(...bytes),
    };
  });
  expect(rangeProbe).toEqual({
    status: 206,
    acceptRanges: 'bytes',
    contentLength: '16',
    contentRange: `bytes 0-15/${AUDIO_BYTES_BY_SECTION[1].length}`,
    riff: 'RIFF',
  });

  await page.getByRole('button', { name: /Edit current audio time/i }).click();
  await page.getByLabel('Set current audio time').fill('0:04');
  await page.getByLabel('Set current audio time').press('Enter');
  await expect.poll(async () => {
    const session = await readSession(page, teacherAuth.token, fixture.sessionCode);
    return {
      lastAction: session?.masterAudioState?.lastAction,
      section: session?.masterAudioState?.section,
      position: session?.masterAudioState?.position,
    };
  }, { timeout: 15_000 }).toEqual({
    lastAction: 'seek',
    section: 1,
    position: 4,
  });

  await page.screenshot({
    path: path.join(ARTIFACT_DIR, 'reg79-local-private-webkit.png'),
    fullPage: true,
  });
  const audioState = await readAudioState(page);
  fs.writeFileSync(
    path.join(ARTIFACT_DIR, 'reg79-local-private-webkit-proof.json'),
    `${JSON.stringify({
      createdAt: new Date().toISOString(),
      projectName: testInfo.project.name,
      origin: TEACHER_ORIGIN,
      localWorkerOrigin: WORKER_ORIGIN,
      localRouteMock: true,
      firebaseFixtureWrite: 'internal live-session fixture only',
      fixture,
      rangeProbe,
      audioState: { ...audioState, src: redactUrl(audioState.src) },
      deliveryEvents: deliveryEvents.map((event) => ({
        ...event,
        tokenId: event.tokenId ? '[redacted-local-token]' : undefined,
      })),
      finalSession: await readSession(page, teacherAuth.token, fixture.sessionCode),
    }, null, 2)}\n`,
    'utf8',
  );
});
