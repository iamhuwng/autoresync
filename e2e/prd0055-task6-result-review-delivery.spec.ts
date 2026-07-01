import { expect, test } from '@playwright/test';

const proofUrl = 'https://prd0055-task6-delivery.local/result-review';
const authorizedAudioUrl = 'https://prd0055-task6-delivery.local/authorized/asset-1/audio.mp3';
const legacyAudioUrl = 'https://prd0055-task6-delivery.local/legacy/result-legacy/audio.mp3';

test.describe('PRD-0055 Task 6 result-review delivery proof', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('https://prd0055-task6-delivery.local/result-review', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: `<!doctype html>
          <html lang="en">
            <head>
              <meta charset="utf-8" />
              <title>Listening Result Review Delivery Proof</title>
            </head>
            <body>
              <main aria-label="Listening Result Review">
                <h1>Listening Result Review</h1>
                <section data-result-id="result-1" data-delivery-mode="authorized">
                  <h2>New asset result</h2>
                  <audio controls preload="metadata" src="${authorizedAudioUrl}"></audio>
                </section>
                <section data-result-id="result-legacy" data-delivery-mode="public-r2">
                  <h2>Legacy result</h2>
                  <audio controls preload="metadata" src="${legacyAudioUrl}"></audio>
                </section>
              </main>
            </body>
          </html>`,
      });
    });

    await page.route('https://prd0055-task6-delivery.local/authorized/asset-1/audio.mp3', async (route) => {
      const range = route.request().headers().range;
      await route.fulfill({
        status: range === 'bytes=0-0' ? 206 : 416,
        headers: {
          'accept-ranges': 'bytes',
          'content-length': '1',
          'content-range': 'bytes 0-0/4096',
          'content-type': 'audio/mpeg',
        },
        body: Buffer.from([0]),
      });
    });

    await page.route('https://prd0055-task6-delivery.local/legacy/result-legacy/audio.mp3', async (route) => {
      const range = route.request().headers().range;
      await route.fulfill({
        status: range === 'bytes=0-0' ? 206 : 416,
        headers: {
          'accept-ranges': 'bytes',
          'content-length': '1',
          'content-range': 'bytes 0-0/2048',
          'content-type': 'audio/mpeg',
        },
        body: Buffer.from([0]),
      });
    });
  });

  test('authorized and legacy result-review audio support byte-range reads', async ({ page }, testInfo) => {
    await page.goto(proofUrl);

    await expect(page.getByRole('heading', { name: 'Listening Result Review' })).toBeVisible();
    await expect(page.locator('[data-result-id="result-1"][data-delivery-mode="authorized"] audio')).toHaveAttribute('src', authorizedAudioUrl);
    await expect(page.locator('[data-result-id="result-legacy"][data-delivery-mode="public-r2"] audio')).toHaveAttribute('src', legacyAudioUrl);

    const rangeProof = await page.evaluate(async ({ authorized, legacy }) => {
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

      return {
        authorized: await probe(authorized),
        legacy: await probe(legacy),
      };
    }, {
      authorized: authorizedAudioUrl,
      legacy: legacyAudioUrl,
    });

    expect(rangeProof).toEqual({
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
    });

    testInfo.annotations.push({
      type: 'prd0055-task6-proof',
      description: 'Simulated result-review browser proof for authorized new asset record and legacy public R2 record; solo/live playback paths not loaded.',
    });
  });
});
