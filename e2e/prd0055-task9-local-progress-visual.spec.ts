import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const TEACHER_ORIGIN = 'http://localhost:5173';
const DEFAULT_PROOF_PATH = 'output/prd0055-task9-live-readback/prd0055-final-live-private-1782847865572.json';
const PROOF_PATH = process.env.PRD0055_FINAL_LIVE_PROOF || DEFAULT_PROOF_PATH;
const PROOF = JSON.parse(fs.readFileSync(path.resolve(PROOF_PATH), 'utf8')) as {
  proofId: string;
  fixture: {
    sessionCode: string;
    testId: string;
    assetIds: [string, string];
  };
};
const ARTIFACT_DIR = path.resolve('output/prd0055-task9-live-readback', `${PROOF.proofId}-local-progress-visual`);
const LOCAL_AUDIO_DIR = path.resolve('output/prd0055-task9-live-readback', PROOF.proofId);

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

async function readBrowserAuth(page: Page): Promise<{ uid: string; token: string }> {
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

async function quickLoginTeacher(page: Page): Promise<{ uid: string; token: string }> {
  await page.goto(`${TEACHER_ORIGIN}/login`);
  await page.getByRole('button', { name: /show dev quick login/i }).click();
  await page.locator('#dev-login-teacher').click();
  await expect(page).toHaveURL(/\/lobby/, { timeout: 60_000 });
  return await readBrowserAuth(page);
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

async function routeLocalDelivery(page: Page) {
  await page.route('http://localhost:8787/listening-delivery/live', async (route) => {
    const body = route.request().postDataJSON() as { sectionNumber?: number; assetId?: string };
    const sectionNumber = body.sectionNumber === 2 ? 2 : 1;
    const issuedAt = Date.now();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        assetId: body.assetId ?? PROOF.fixture.assetIds[sectionNumber - 1],
        url: `http://localhost:8787/listening-delivery/content?token=local-section-${sectionNumber}`,
        tokenId: `local-section-${sectionNumber}`,
        issuedAt,
        expiresAt: issuedAt + 3_600_000,
        refreshAfter: issuedAt + 3_000_000,
        ttlMs: 3_600_000,
        deliveryReady: true,
        range: {
          requestRange: 'bytes=0-15',
          status: 206,
          acceptRanges: 'bytes',
          contentLength: 16,
        },
      }),
    });
  });

  await page.route('http://localhost:8787/listening-delivery/content?**', async (route) => {
    const requestUrl = new URL(route.request().url());
    const sectionNumber = requestUrl.searchParams.get('token') === 'local-section-2' ? 2 : 1;
    const audioBytes = fs.readFileSync(path.join(LOCAL_AUDIO_DIR, `section-${sectionNumber}.wav`));
    await route.fulfill({
      status: 206,
      headers: {
        'accept-ranges': 'bytes',
        'content-range': `bytes 0-${audioBytes.length - 1}/${audioBytes.length}`,
        'content-length': String(audioBytes.length),
        'content-type': 'audio/wav',
      },
      body: audioBytes,
    });
  });
}

test('localhost teacher monitor progress bar hydrates canonical live position after reload', async ({ page }) => {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  await routeLocalDelivery(page);
  const deliveryEvents: unknown[] = [];
  page.on('response', (response) => {
    const url = response.url();
    if (!url.includes('/listening-delivery/')) return;
    deliveryEvents.push({
      type: 'response',
      method: response.request().method(),
      status: response.status(),
      url: redactUrl(url),
    });
  });
  page.on('requestfailed', (request) => {
    const url = request.url();
    if (!url.includes('/listening-delivery/')) return;
    deliveryEvents.push({
      type: 'requestfailed',
      method: request.method(),
      url: redactUrl(url),
      failure: request.failure()?.errorText,
    });
  });

  const teacherAuth = await quickLoginTeacher(page);
  await page.goto(`${TEACHER_ORIGIN}/teacher-test/${PROOF.fixture.sessionCode}`);
  await expect(page.getByText('Audio Control Panel')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(`Session: ${PROOF.fixture.sessionCode}`)).toBeVisible({ timeout: 60_000 });
  await expectPrivateAudioReady(page);

  await page.getByRole('button', { name: 'Next Section' }).click();
  await expect.poll(async () => {
    const session = await readSessionViaBrowser(page, teacherAuth.token);
    return session?.masterAudioState?.section;
  }, { timeout: 15_000 }).toBe(2);

  await page.getByRole('button', { name: /Edit current audio time/i }).click();
  await page.getByLabel('Set current audio time').fill('0:04');
  await page.getByLabel('Set current audio time').press('Enter');
  await expect.poll(async () => {
    const session = await readSessionViaBrowser(page, teacherAuth.token);
    return {
      lastAction: session?.masterAudioState?.lastAction,
      section: session?.masterAudioState?.section,
      position: session?.masterAudioState?.position,
    };
  }, { timeout: 15_000 }).toEqual({
    lastAction: 'seek',
    section: 2,
    position: 4,
  });

  await page.reload();
  await expect(page.getByText('Audio Control Panel')).toBeVisible({ timeout: 60_000 });
  await expectPrivateAudioReady(page);
  await expect(page.getByRole('button', { name: /Edit current audio time/i })).toContainText('0:04 / 0:08', { timeout: 30_000 });
  const fillWidth = await page.getByTestId('audio-section-progress-fill-2').evaluate((element) => (element as HTMLElement).style.width);
  expect(fillWidth).toBe('50%');

  const audioState = await readAudioState(page);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'teacher-local-progress-visual.png'), fullPage: true });
  fs.writeFileSync(
    path.join(ARTIFACT_DIR, 'teacher-local-progress-visual-proof.json'),
    `${JSON.stringify({
      createdAt: new Date().toISOString(),
      proofPath: PROOF_PATH,
      proofId: PROOF.proofId,
      origin: TEACHER_ORIGIN,
      sessionCode: PROOF.fixture.sessionCode,
      testId: PROOF.fixture.testId,
      localDeliveryRouteMock: true,
      timeText: await page.getByRole('button', { name: /Edit current audio time/i }).textContent(),
      fillWidth,
      audioState,
      deliveryEvents,
      finalSession: await readSessionViaBrowser(page, teacherAuth.token),
    }, null, 2)}\n`,
    'utf8',
  );
});
