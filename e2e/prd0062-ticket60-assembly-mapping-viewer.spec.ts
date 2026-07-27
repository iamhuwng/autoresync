import { expect, test, type Page } from '@playwright/test';
import { jsPDF } from 'jspdf';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const TEACHER_ORIGIN = process.env.PRD0062_TEACHER_ORIGIN ?? 'http://localhost:5173';
const DOCUMENT_ROUTE = /\/v1\/book-delivery\/teacher-assembly\/[^/]+\/[^/]+\/[^/]+\/\d+\/[^/]+\/[^/]+\/\d+\/\d+$/u;
const ARTIFACT_DIR = path.resolve('artifacts/prd0062-ticket-60/browser');
const ETAG = `"${'6'.repeat(64)}"`;

const loginTeacher = async (page: Page) => {
  await page.goto(`${TEACHER_ORIGIN}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await expect(async () => {
    if (/\/lobby/u.test(page.url())) return;
    await expect(page.getByRole('button', { name: /dev quick login/iu })).toBeVisible({ timeout: 2_000 });
  }).toPass({ intervals: [1_000, 2_000], timeout: 60_000 });
  if (/\/lobby/u.test(page.url())) return;
  await page.getByRole('button', { name: /dev quick login/iu }).click();
  await page.locator('#dev-login-teacher').click();
  await expect(page).toHaveURL(/\/lobby/u, { timeout: 60_000 });
};

const createPdf = (): Buffer => {
  const document = new jsPDF({ format: 'letter', unit: 'pt', compress: false });
  document.setFontSize(18);
  document.text('PRD0062 Ticket 60 Assembly preview page 1', 72, 96);
  document.addPage();
  document.text('PRD0062 Ticket 60 Assembly preview page 2', 72, 96);
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

const mapActivity = async (page: Page, pages: string, defaultPage: string, activityKey: string) => {
  await page.getByLabel('One-based physical pages').fill(pages);
  await page.getByLabel('Default physical page').fill(defaultPage);
  await page.getByLabel('Activity key').fill(activityKey);
  await page.getByRole('button', { name: 'Add mapping' }).click();
};

const assertNoHorizontalOverflow = async (page: Page) => {
  await page.locator('.book-assembly-workspace').evaluate((element) => {
    (element as HTMLElement).style.zoom = '2';
  });
  await expect(page.getByRole('button', { name: 'Use viewer page for mapping' })).toBeVisible();
  return page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
};

test.describe('PRD0062 Ticket 60 Assembly mapping viewer browser proof', () => {
  test('teacher maps source-qualified full/component pages through the viewer host at 200% zoom', async ({
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
    await loginTeacher(page);

    await page.goto(`${TEACHER_ORIGIN}/__smoke/book-assembly?fixture=ticket58-full`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await page.getByRole('button', { name: 'unit: unit-fixture' }).click();
    await mapActivity(page, '2', '2', 'activity-ticket60-full');
    await page.getByRole('button', { exact: true, name: 'Preview full' }).click();
    await expect(page.getByText('Page 1 of 2 rendered at Fit width.')).toBeVisible({
      timeout: 30_000,
    });
    await page.getByLabel('Viewer local page').fill('2');
    await page.getByRole('button', { name: 'Use viewer page for mapping' }).click();
    await expect(page.getByLabel('Mapping source key')).toHaveValue('full');
    await expect(page.getByLabel('One-based physical pages')).toHaveValue('2');
    await expect(page.getByLabel('Default physical page')).toHaveValue('2');
    await page.getByRole('button', { name: 'Preview full page 2' }).click();
    await expect(page.getByText('Page 2 of 2 rendered at Fit width.')).toBeVisible({
      timeout: 30_000,
    });

    await page.goto(`${TEACHER_ORIGIN}/__smoke/book-assembly?fixture=ticket58-component`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await page.getByRole('button', { name: 'unit: unit-component-a' }).click();
    await mapActivity(page, '2', '2', 'activity-ticket60-component-a');
    await page.getByRole('button', { exact: true, name: 'Preview source-source-component-a' }).click();
    await expect(page.getByText('Page 1 of 2 rendered at Fit width.')).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole('button', { name: 'Preview source-source-component-a page 2' }).click();
    await expect(page.getByText('Page 2 of 2 rendered at Fit width.')).toBeVisible({
      timeout: 30_000,
    });

    const overflow = await assertNoHorizontalOverflow(page);
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 4);

    const requestCountBeforeDeniedFixtures = requests.length;
    for (const fixture of ['ticket58-stale', 'ticket58-copied', 'ticket58-discarded', 'ticket57-full']) {
      await page.goto(`${TEACHER_ORIGIN}/__smoke/book-assembly?fixture=${fixture}`, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      });
      await expect(page.getByText(/fresh authorization/u)).toBeVisible();
      await expect(page.getByRole('button', { exact: true, name: 'Preview full' })).toHaveCount(0);
      await page.getByRole('button', { name: 'unit: unit-fixture' }).click();
      await mapActivity(page, '3', '3', `activity-ticket60-${fixture}`);
      await expect(page.getByRole('list', { name: 'Page Groups' })).toContainText('full pages 3');
    }
    expect(requests).toHaveLength(requestCountBeforeDeniedFixtures);

    expect(requests.some((request) => request.method === 'HEAD')).toBe(true);
    expect(requests.some((request) => request.method === 'GET' && request.range)).toBe(true);
    expect(requests.every((request) => request.authorization?.startsWith('Bearer '))).toBe(true);
    const leakedAuthority = await page.evaluate(() => {
      const storage = [...Object.entries(localStorage), ...Object.entries(sessionStorage)]
        .map(([key, value]) => `${key}:${value}`).join('\n');
      const dom = document.documentElement.outerHTML;
      return /providerObjectKey|backblaze|B2_|smoke-viewer-token/u.test(`${dom}\n${storage}`);
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
        viewport: testInfo.project.use.viewport,
        requests: requests.map(({ method, range }) => ({ method, range })),
        overflow,
        proof: [
          'teacher quick-login',
          'full/component source-qualified mapping viewer',
          'viewer page selection updates mapping draft without save',
          'mapped page buttons request current authorized local page',
          'stale/copied/discarded/no-preview routes fail closed without document request',
          'metadata-only mapping controls remain available when viewer host has no documents',
          'authenticated HEAD/range PDF transport',
          'no browser provider authority',
          '200% zoom horizontal-overflow safety',
        ],
      }, null, 2),
    );
  });
});
