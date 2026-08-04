import { expect, test, type Page } from '@playwright/test';
import { jsPDF } from 'jspdf';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const TEACHER_ORIGIN = process.env.PRD0062_TEACHER_ORIGIN ?? 'http://localhost:5173';
const DOCUMENT_ROUTE = /\/v1\/book-delivery\/teacher-assembly\/[^/]+\/[^/]+\/[^/]+\/\d+\/[^/]+\/[^/]+\/\d+\/\d+$/u;
const ARTIFACT_DIR = path.resolve('artifacts/prd0062-ticket-58/browser');
const ETAG = `"${'d'.repeat(64)}"`;

const login = async (page: Page, account: 'teacher' | 'teacher2' | 'student') => {
  await page.goto(`${TEACHER_ORIGIN}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await expect(async () => {
    if (/\/(?:lobby|student\/dashboard)/u.test(page.url())) return;
    await expect(page.getByRole('button', { name: /dev quick login/iu }))
      .toBeVisible({ timeout: 2_000 });
  }).toPass({ intervals: [1_000, 2_000], timeout: 60_000 });
  if (/\/(?:lobby|student\/dashboard)/u.test(page.url())) return;
  await page.getByRole('button', { name: /dev quick login/iu }).click();
  await page.locator(`#dev-login-${account}`).click();
  await expect(page).toHaveURL(
    account === 'student' ? /\/student(?:\/dashboard)?$/u : /\/lobby/u,
    { timeout: 60_000 },
  );
};

const createPdf = (): Buffer => {
  const document = new jsPDF({ format: 'letter', unit: 'pt', compress: false });
  document.setFontSize(18);
  document.text('PRD0062 teacher Assembly preview', 72, 96);
  document.addPage();
  document.text('Page 2', 72, 96);
  return Buffer.from(new Uint8Array(document.output('arraybuffer')));
};

const installDocumentRoute = async (
  page: Page,
  requests: Array<{
    readonly method: string;
    readonly range?: string;
    readonly authorization?: string;
  }>,
) => {
  const pdf = createPdf();
  await page.route(DOCUMENT_ROUTE, async (route) => {
    const request = route.request();
    requests.push({
      method: request.method(),
      range: request.headers().range,
      authorization: request.headers().authorization,
    });
    const headers = {
      'accept-ranges': 'bytes',
      'content-type': 'application/pdf',
      etag: ETAG,
    };
    if (request.method() === 'HEAD') {
      await route.fulfill({
        status: 200,
        headers: { ...headers, 'content-length': String(pdf.byteLength) },
      });
      return;
    }
    const range = request.headers().range;
    if (range) {
      const match = /^bytes=(\d+)-(\d+)?$/u.exec(range);
      if (!match) throw new Error(`Unexpected range: ${range}`);
      const start = Number(match[1]);
      const end = match[2] ? Number(match[2]) : pdf.byteLength - 1;
      const bytes = pdf.slice(start, end + 1);
      await route.fulfill({
        status: 206,
        headers: {
          ...headers,
          'content-length': String(bytes.byteLength),
          'content-range': `bytes ${start}-${end}/${pdf.byteLength}`,
        },
        body: bytes,
      });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: { ...headers, 'content-length': String(pdf.byteLength) },
      body: pdf,
    });
  });
};

test.describe('PRD0062 Ticket 58 teacher Assembly document preview', () => {
  test('owner maps and previews full/component sources through authenticated HEAD/range transport', async ({
    page,
  }, testInfo) => {
    const requests: Array<{
      readonly method: string;
      readonly range?: string;
      readonly authorization?: string;
    }> = [];
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' && !message.text().includes('@firebase/analytics')) {
        consoleErrors.push(message.text());
      }
    });
    page.on('pageerror', (error) => consoleErrors.push(error.message));
    await installDocumentRoute(page, requests);
    await login(page, 'teacher');

    await page.goto(`${TEACHER_ORIGIN}/__smoke/book-assembly?fixture=ticket58-full`, {
      waitUntil: 'domcontentloaded',
    });
    await page.getByRole('button', { name: 'unit: unit-fixture' }).click();
    await page.getByLabel('One-based physical pages').fill('4');
    await page.getByLabel('Default physical page').fill('4');
    await page.getByLabel('Activity key').fill('activity-ticket58-full');
    await page.getByRole('button', { name: 'Add mapping' }).click();
    await page.getByRole('button', { name: 'Preview full' }).click();
    await expect(page.getByText('Page 1 of 2 rendered at Fit width.')).toBeVisible({
      timeout: 30_000,
    });

    await page.goto(`${TEACHER_ORIGIN}/__smoke/book-assembly?fixture=ticket58-component`, {
      waitUntil: 'domcontentloaded',
    });
    await page.getByRole('button', { name: 'unit: unit-component-a' }).click();
    await page.getByLabel('One-based physical pages').fill('2');
    await page.getByLabel('Default physical page').fill('2');
    await page.getByLabel('Activity key').fill('activity-ticket58-component');
    await page.getByRole('button', { name: 'Add mapping' }).click();
    await page.getByRole('button', { name: 'Preview source-source-component-a' }).click();
    await expect(page.getByText('Page 1 of 2 rendered at Fit width.')).toBeVisible({
      timeout: 30_000,
    });

    expect(requests.some((request) => request.method === 'HEAD')).toBe(true);
    expect(requests.some((request) => request.method === 'GET' && request.range)).toBe(true);
    expect(requests.every((request) => request.authorization?.startsWith('Bearer '))).toBe(true);
    const leakedAuthority = await page.evaluate(() => {
      const storage = [...Object.entries(localStorage), ...Object.entries(sessionStorage)]
        .map(([key, value]) => `${key}:${value}`).join('\n');
      const dom = document.documentElement.outerHTML;
      return /ticket58-source-|providerObjectKey|backblaze|smoke-viewer-token/u.test(`${dom}\n${storage}`);
    });
    expect(leakedAuthority).toBe(false);
    expect(consoleErrors).toEqual([]);

    await mkdir(ARTIFACT_DIR, { recursive: true });
    await page.screenshot({
      fullPage: true,
      path: path.join(ARTIFACT_DIR, `${testInfo.project.name}.png`),
    });
    await writeFile(
      path.join(ARTIFACT_DIR, `${testInfo.project.name}.json`),
      JSON.stringify({
        project: testInfo.project.name,
        requests: requests.map(({ method, range }) => ({ method, range })),
        proof: [
          'teacher quick-login',
          'full/component mapping and preview',
          'authenticated HEAD and bounded range',
          'no browser provider authority',
        ],
      }, null, 2),
    );
  });

  for (const account of ['teacher2', 'student'] as const) {
    test(`${account} cannot obtain owner preview controls`, async ({ page }) => {
      const requests: Array<{ method: string; range?: string; authorization?: string }> = [];
      await installDocumentRoute(page, requests);
      await login(page, account);
      await page.goto(`${TEACHER_ORIGIN}/__smoke/book-assembly?fixture=ticket58-full`, {
        waitUntil: 'domcontentloaded',
      });
      await expect(page.getByRole('button', { name: 'Preview full' })).toHaveCount(0);
      await expect(page.getByText(/fresh authorization/u)).toBeVisible();
      expect(requests).toEqual([]);
    });
  }

  test('stale, copied, and discarded candidate projections fail closed before document fetch', async ({
    page,
  }) => {
    const requests: Array<{ method: string; range?: string; authorization?: string }> = [];
    await installDocumentRoute(page, requests);
    await login(page, 'teacher');
    for (const fixture of ['ticket58-stale', 'ticket58-copied', 'ticket58-discarded']) {
      await page.goto(`${TEACHER_ORIGIN}/__smoke/book-assembly?fixture=${fixture}`, {
        waitUntil: 'domcontentloaded',
      });
      await expect(page.getByRole('button', { name: /^Preview /u })).toHaveCount(0);
      await expect(page.getByText(/fresh authorization/u)).toBeVisible();
    }
    expect(requests).toEqual([]);
  });
});
