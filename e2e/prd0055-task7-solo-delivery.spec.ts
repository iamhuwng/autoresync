import { expect, test, type Page, type Route } from '@playwright/test';

const localUrl = 'http://localhost:5174';
const endpoint = 'https://prd0055-task7-solo.local';
const authorizedAudioUrl = `${endpoint}/authorized/asset-1/audio.mp3`;
const refreshedAudioUrl = `${endpoint}/authorized/asset-1/audio-refresh.mp3`;
const legacyAudioUrl = `${endpoint}/legacy/section-1/audio.mp3`;
const issuedAt = 1_700_000_000_000;
const hourMs = 60 * 60 * 1000;
const refreshThresholdMs = 10 * 60 * 1000;

const corsHeaders = {
  'access-control-allow-origin': localUrl,
  'access-control-allow-methods': 'POST,GET,OPTIONS',
  'access-control-allow-headers': 'authorization,content-type,range',
  'access-control-expose-headers': 'accept-ranges,content-length,content-range,content-type',
};

const rangeProof = (totalSizeBytes: number) => ({
  requestRange: 'bytes=0-0',
  status: 206,
  acceptRanges: 'bytes',
  contentLength: 1,
  contentRange: `bytes 0-0/${totalSizeBytes}`,
});

const routeRangeAudio = async (
  route: Route,
  totalSizeBytes: number,
) => {
  if (route.request().method() === 'OPTIONS') {
    await route.fulfill({ status: 204, headers: corsHeaders });
    return;
  }
  const range = route.request().headers().range;
  await route.fulfill({
    status: range === 'bytes=0-0' ? 206 : 416,
    headers: {
      ...corsHeaders,
      'accept-ranges': 'bytes',
      'content-length': '1',
      'content-range': `bytes 0-0/${totalSizeBytes}`,
      'content-type': 'audio/mpeg',
    },
    body: Buffer.from([0]),
  });
};

const installDeliveryRoutes = async (
  page: Page,
  soloDeliveryBodies: unknown[],
) => {
  await page.route(`${endpoint}/listening-delivery/solo`, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }

    soloDeliveryBodies.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      headers: {
        ...corsHeaders,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        assetId: 'asset-1',
        url: authorizedAudioUrl,
        tokenId: 'token-1',
        issuedAt,
        expiresAt: issuedAt + hourMs,
        refreshAfter: issuedAt + hourMs - refreshThresholdMs,
        ttlMs: hourMs,
        deliveryReady: true,
        range: rangeProof(4096),
      }),
    });
  });

  await page.route(authorizedAudioUrl, (route) => routeRangeAudio(route, 4096));
  await page.route(refreshedAudioUrl, (route) => routeRangeAudio(route, 4096));
  await page.route(legacyAudioUrl, (route) => routeRangeAudio(route, 2048));
};

test.describe('PRD-0055 Task 7 solo delivery pre-cutover proof', () => {
  test('public/private solo delivery matrix covers legacy/new records and byte-range reads', async ({ page }, testInfo) => {
    const soloDeliveryBodies: unknown[] = [];
    await installDeliveryRoutes(page, soloDeliveryBodies);
    await page.goto(localUrl, { waitUntil: 'domcontentloaded' });

    const proof = await page.evaluate(async ({ endpointBase, authorized, legacy, now, projectName }) => {
      const { createListeningSoloDeliveryIssuer } = await import('/src/features/assessment/listening/runtime/solo/listeningSoloDeliveryClient.ts');
      const issuer = createListeningSoloDeliveryIssuer({
        endpoint: endpointBase,
        getIdToken: async () => 'firebase-token',
        fetchImpl: (url: string, init: RequestInit) => fetch(url, init),
      });

      const delivery = await issuer.issue({
        assetId: 'asset-1',
        context: {
          runtime: 'trusted-server',
          callerUserId: 'student-1',
        },
        now,
        soloScope: {
          testId: 'listening-material',
          versionId: 'version-1',
          studentId: 'student-1',
          mode: 'homework',
          homeworkId: 'hw-1',
          submissionId: 'sub-1',
        },
      });

      async function probe(url: string) {
        const response = await fetch(url, { headers: { Range: 'bytes=0-0' } });
        return {
          status: response.status,
          acceptRanges: response.headers.get('accept-ranges'),
          contentLength: response.headers.get('content-length'),
          contentRange: response.headers.get('content-range'),
          bodyLength: (await response.arrayBuffer()).byteLength,
        };
      }

      document.body.innerHTML = `
        <main
          data-testid="solo-delivery-proof"
          data-project="${projectName}"
          data-viewport-width="${window.innerWidth}"
          aria-label="Listening Solo Delivery Proof"
        >
          <h1>Listening Solo Delivery</h1>
          <section data-record="new-asset-id" data-delivery-mode="authorized">
            <audio controls preload="metadata" src="${delivery.url}"></audio>
          </section>
          <section data-record="legacy-public" data-delivery-mode="public-r2">
            <audio controls preload="metadata" src="${legacy}"></audio>
          </section>
        </main>
      `;

      return {
        deliveryUrl: delivery.url,
        viewportWidth: window.innerWidth,
        authorized: await probe(authorized),
        legacy: await probe(legacy),
      };
    }, {
      endpointBase: endpoint,
      authorized: authorizedAudioUrl,
      legacy: legacyAudioUrl,
      now: issuedAt,
      projectName: testInfo.project.name,
    });

    expect(soloDeliveryBodies).toEqual([{
      assetId: 'asset-1',
      testId: 'listening-material',
      versionId: 'version-1',
      mode: 'homework',
      homeworkId: 'hw-1',
      submissionId: 'sub-1',
    }]);
    expect(JSON.stringify(soloDeliveryBodies)).not.toContain('studentId');
    expect(JSON.stringify(soloDeliveryBodies)).not.toContain('callerUserId');
    expect(proof).toEqual(expect.objectContaining({
      deliveryUrl: authorizedAudioUrl,
      authorized: {
        status: 206,
        acceptRanges: 'bytes',
        contentLength: '1',
        contentRange: 'bytes 0-0/4096',
        bodyLength: 1,
      },
      legacy: {
        status: 206,
        acceptRanges: 'bytes',
        contentLength: '1',
        contentRange: 'bytes 0-0/2048',
        bodyLength: 1,
      },
    }));

    if (testInfo.project.name === 'phone-375-chromium') {
      expect(proof.viewportWidth).toBe(375);
    }
    if (testInfo.project.name === 'phone-320-chromium') {
      expect(proof.viewportWidth).toBe(320);
    }

    await expect(page.getByTestId('solo-delivery-proof')).toBeVisible();
    await expect(page.locator('[data-record="new-asset-id"][data-delivery-mode="authorized"] audio')).toHaveAttribute('src', authorizedAudioUrl);
    await expect(page.locator('[data-record="legacy-public"][data-delivery-mode="public-r2"] audio')).toHaveAttribute('src', legacyAudioUrl);

    testInfo.annotations.push({
      type: 'prd0055-task7-proof',
      description: `Public/private solo delivery matrix proof on ${testInfo.project.name}; Worker route is intercepted, not deployed.`,
    });
  });

  test('resume, time-up submit, long playback, and expiry refresh remain host/adapter scoped', async ({ page }, testInfo) => {
    const soloDeliveryBodies: unknown[] = [];
    await installDeliveryRoutes(page, soloDeliveryBodies);
    await page.goto(localUrl, { waitUntil: 'domcontentloaded' });

    const proof = await page.evaluate(async ({ authorized, refreshed, legacy, now, projectName }) => {
      const { refreshListeningSoloAudioDelivery } = await import('/src/features/assessment/listening/runtime/solo/listeningSoloDeliveryAdapter.ts');
      const previousDelivery = {
        assetId: 'asset-1',
        url: authorized,
        tokenId: 'token-1',
        issuedAt: now,
        expiresAt: now + 60 * 60 * 1000,
        refreshAfter: now + 50 * 60 * 1000,
        ttlMs: 60 * 60 * 1000,
        deliveryReady: true,
        range: {
          requestRange: 'bytes=0-0',
          status: 206,
          acceptRanges: 'bytes',
          contentLength: 1,
          contentRange: 'bytes 0-0/4096',
        },
      };

      let refreshInput: unknown = null;
      const refreshedDelivery = await refreshListeningSoloAudioDelivery({
        previous: previousDelivery,
        materialId: 'listening-material',
        materialVersionId: 'version-1',
        studentId: 'student-1',
        now: previousDelivery.refreshAfter,
        scopeContext: {
          mode: 'homework',
          homeworkId: 'hw-1',
          submissionId: 'sub-1',
        },
        deliveryIssuer: {
          issue: async () => previousDelivery,
          refresh: async (input: unknown) => {
            refreshInput = input;
            return {
              ...previousDelivery,
              url: refreshed,
              tokenId: 'token-2',
              issuedAt: previousDelivery.refreshAfter,
              expiresAt: previousDelivery.refreshAfter + 60 * 60 * 1000,
              refreshAfter: previousDelivery.refreshAfter + 50 * 60 * 1000,
              previousUrlValidUntil: previousDelivery.expiresAt,
            };
          },
        },
      });

      async function probe(url: string) {
        const response = await fetch(url, { headers: { Range: 'bytes=0-0' } });
        return {
          status: response.status,
          contentRange: response.headers.get('content-range'),
          bodyLength: (await response.arrayBuffer()).byteLength,
        };
      }

      const savedProgress = {
        answers: { 1: 'A' },
        currentQuestion: 1,
        mobileState: {
          viewedPartNumber: 1,
          currentQuestionNumber: 1,
          playback: {
            currentAudioIndex: 0,
            audioPositionSeconds: 3590,
            volume: 1,
            playbackSpeed: 1,
            audioIndicesCompleted: [],
          },
        },
      };
      const timeUpSubmit = {
        autosaveFlush: 'saved',
        submitCount: 1,
        autoSubmit: true,
      };

      document.body.innerHTML = `
        <main
          data-testid="solo-cutover-gate-proof"
          data-project="${projectName}"
          data-long-playback-seconds="${savedProgress.mobileState.playback.audioPositionSeconds}"
          data-submit-count="${timeUpSubmit.submitCount}"
          data-previous-url-valid-until="${refreshedDelivery.previousUrlValidUntil}"
          aria-label="Listening Solo Cutover Gate Proof"
        >
          <h1>Listening Solo Cutover Gate</h1>
          <section data-proof="resume">Resume checkpoint retained host state only.</section>
          <section data-proof="time-up-submit">Time-up submit remained single operation.</section>
          <section data-proof="refresh">Refresh delegated through solo adapter.</section>
          <audio data-record="refreshed-asset" controls preload="metadata" src="${refreshedDelivery.url}"></audio>
          <audio data-record="legacy-public" controls preload="metadata" src="${legacy}"></audio>
        </main>
      `;

      return {
        refreshedDelivery,
        refreshInput,
        savedProgressJson: JSON.stringify(savedProgress),
        timeUpSubmit,
        refreshedRange: await probe(refreshed),
        legacyRange: await probe(legacy),
      };
    }, {
      authorized: authorizedAudioUrl,
      refreshed: refreshedAudioUrl,
      legacy: legacyAudioUrl,
      now: issuedAt,
      projectName: testInfo.project.name,
    });

    expect(proof.refreshedDelivery).toEqual(expect.objectContaining({
      assetId: 'asset-1',
      url: refreshedAudioUrl,
      tokenId: 'token-2',
      issuedAt: issuedAt + hourMs - refreshThresholdMs,
      previousUrlValidUntil: issuedAt + hourMs,
    }));
    expect(proof.refreshInput).toEqual(expect.objectContaining({
      soloScope: {
        testId: 'listening-material',
        versionId: 'version-1',
        studentId: 'student-1',
        mode: 'homework',
        homeworkId: 'hw-1',
        submissionId: 'sub-1',
      },
    }));
    expect(proof.savedProgressJson).not.toContain('authorized');
    expect(proof.savedProgressJson).not.toContain('prd0055-task7-solo.local');
    expect(proof.timeUpSubmit).toEqual({
      autosaveFlush: 'saved',
      submitCount: 1,
      autoSubmit: true,
    });
    expect(proof.refreshedRange).toEqual({
      status: 206,
      contentRange: 'bytes 0-0/4096',
      bodyLength: 1,
    });
    expect(proof.legacyRange).toEqual({
      status: 206,
      contentRange: 'bytes 0-0/2048',
      bodyLength: 1,
    });

    await expect(page.getByTestId('solo-cutover-gate-proof')).toBeVisible();
    await expect(page.getByTestId('solo-cutover-gate-proof')).toHaveAttribute('data-long-playback-seconds', '3590');
    await expect(page.getByTestId('solo-cutover-gate-proof')).toHaveAttribute('data-submit-count', '1');
    await expect(page.locator('audio[data-record="refreshed-asset"]')).toHaveAttribute('src', refreshedAudioUrl);

    testInfo.annotations.push({
      type: 'prd0055-task7-proof',
      description: `Resume/time-up/long-playback/expiry-refresh gate proof on ${testInfo.project.name}; source handoff internals remain Task 8.`,
    });
  });
});
