import { expect, test } from '@playwright/test';
import { jsPDF } from 'jspdf';

const PDF_REQUEST = /\/v1\/book-delivery\/document\/smoke-viewer$/u;
const ETag = `"${'c'.repeat(64)}"`;

test('book viewer smoke uses authenticated transport and keeps controls responsive', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const requestSummaries: Array<{ readonly method: string; readonly range?: string; readonly authorization?: string }> = [];
  const pdfBytes = createPdf(2);
  let forcedHeadRetryIssued = false;

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route(PDF_REQUEST, async (route) => {
    const request = route.request();
    requestSummaries.push({
      method: request.method(),
      range: request.headers().range,
      authorization: request.headers().authorization,
    });

    const headers = {
      'accept-ranges': 'bytes',
      'content-type': 'application/pdf',
      etag: ETag,
    };

    if (request.method() === 'HEAD') {
      if (!forcedHeadRetryIssued) {
        forcedHeadRetryIssued = true;
        await route.fulfill({
          status: 401,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ code: 'unauthorized' }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        headers: {
          ...headers,
          'content-length': String(pdfBytes.byteLength),
        },
      });
      return;
    }

    const range = request.headers().range;
    if (range) {
      const match = /^bytes=(\d+)-(\d+)?$/u.exec(range);
      if (!match) throw new Error(`Unexpected range request: ${range}`);
      const start = Number(match[1]);
      const end = match[2] ? Number(match[2]) : pdfBytes.byteLength - 1;
      const slice = pdfBytes.slice(start, end + 1);
      await route.fulfill({
        status: 206,
        headers: {
          ...headers,
          'content-length': String(slice.byteLength),
          'content-range': `bytes ${start}-${end}/${pdfBytes.byteLength}`,
        },
        body: slice,
      });
      return;
    }

    await route.fulfill({
      status: 200,
      headers: {
        ...headers,
        'content-length': String(pdfBytes.byteLength),
      },
      body: pdfBytes,
    });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Show dev quick login' }).click();
  await page.locator('#dev-login-teacher').click();
  await expect(page).toHaveURL(/\/lobby$/u, { timeout: 30_000 });

  await page.goto('/__smoke/book-viewer', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Book PDF viewer smoke' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Smoke PDF' })).toBeVisible();
  await expect(page.getByText('Signed in as', { exact: false })).toBeVisible();
  try {
    await expect(page.getByText('Page 1 of 2 rendered at Fit width.')).toBeVisible({ timeout: 30_000 });
  } catch {
    throw new Error(JSON.stringify({
      body: await page.locator('body').innerText(),
      consoleErrors,
      pageErrors,
      requestSummaries,
    }, null, 2));
  }
  await expect(page.getByRole('button', { name: 'Previous page' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Next page' })).toBeEnabled();
  await expect(page.getByLabel('Zoom level')).toHaveText('Fit width');
  await expect(page.locator('canvas')).toBeVisible();

  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByLabel('Page 2 of 2')).toBeVisible();

  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(page.getByLabel('Zoom level')).toHaveText('110%');

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 375, height: 780 },
    { width: 320, height: 740 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole('button', { name: 'Next page' })).toBeVisible();
    await expect(page.locator('canvas')).toBeVisible();
    await expect.poll(async () => page.evaluate(() =>
      document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    )).toBe(true);
  }

  await page.evaluate(() => {
    document.documentElement.style.zoom = '2';
  });
  await expect(page.getByRole('button', { name: 'Zoom in' })).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.style.zoom = '';
  });

  const methods = requestSummaries.map((entry) => entry.method);
  expect(forcedHeadRetryIssued).toBe(true);
  expect(methods).toContain('HEAD');
  expect(methods).toContain('GET');
  expect(requestSummaries.filter((entry) => entry.method === 'HEAD')).toHaveLength(2);
  expect(requestSummaries.some((entry) => Boolean(entry.authorization?.startsWith('Bearer ')))).toBe(true);
  expect(requestSummaries.some((entry) => Boolean(entry.range))).toBe(true);
  const leakedSensitiveViewerState = await page.evaluate(() => {
    const storageText = [
      ...Object.entries(localStorage),
      ...Object.entries(sessionStorage),
    ].map(([key, value]) => `${key}:${value}`).join('\n');
    const domText = document.documentElement.outerHTML;
    return domText.includes('smoke-viewer')
      || domText.includes('smoke-viewer-token')
      || storageText.includes('smoke-viewer')
      || storageText.includes('smoke-viewer-token');
  });
  expect(leakedSensitiveViewerState).toBe(false);
  const unexpectedConsoleErrors = consoleErrors.filter(
    (message) => !(
      message.includes('@firebase/analytics')
      && message.includes('Failed to fetch')
    ) && !message.includes('Failed to load resource: the server responded with a status of 401 (Unauthorized)'),
  );
  expect(unexpectedConsoleErrors).toEqual([]);
});

function createPdf(pageCount: number): Buffer {
  const doc = new jsPDF({ format: 'letter', unit: 'pt', compress: false });
  for (let index = 0; index < pageCount; index += 1) {
    if (index > 0) doc.addPage();
    doc.setFontSize(18);
    doc.text(`Page ${index + 1}`, 72, 96);
  }
  return Buffer.from(new Uint8Array(doc.output('arraybuffer')));
}
