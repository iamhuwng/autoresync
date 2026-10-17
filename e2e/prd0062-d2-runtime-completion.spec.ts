import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test, type Page } from '@playwright/test';

const studentOrigin = 'http://localhost:5174';

const loginStudent = async (page: Page) => {
  await page.goto(studentOrigin, { waitUntil: 'domcontentloaded' });
  if (!/\/student\/?$/u.test(page.url())) {
    await page.getByRole('button', { name: /show dev quick login|dev quick login/iu }).click();
    await page.locator('#dev-login-student').click();
  }
  await expect(page).toHaveURL(/\/student\/?$/u, { timeout: 60_000 });
};

test('Solo Runtime refreshes one expired opaque document without leaking component identity', async ({ page }) => {
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const documentResponses: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.url().includes('/v1/book-delivery/document/')) {
      const headers = response.headers();
      documentResponses.push(`${response.request().method()} ${response.status()} ${JSON.stringify(headers)}`);
    }
    if (response.status() >= 500) documentResponses.push(`${response.status()} ${response.url()}`);
  });
  const bytes = await readFile('artifacts/prd0062-ticket-06b/browser/upload-fixture.pdf');
  const etag = `"${createHash('sha256').update(bytes).digest('hex')}"`;
  const projection = (revision: number, recipientId: string) => ({
    schemaVersion: 1, projectionKind: 'book-runtime-delivery',
    bindingId: `solo-binding-${revision}`, bindingRevision: revision, recipientId,
    context: { contextId: 'solo-1', kind: 'solo', entitlementBasis: 'solo' },
    book: { bookId: 'book-1', bookMode: 'pdf', bookRevision: 1, manifestVersionId: 'manifest-1',
      publicationId: 'publication-1', publicationRevision: 1, publicationStatus: 'published' },
    scope: { kind: 'subtree', nodeKeys: ['unit-1'], placementIds: ['placement-1'] },
    outline: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1, titleSnapshot: 'Unit 1' }],
    sourceSet: { strategy: 'component_pdfs', sources: [] },
    documentRequests: [{ opaqueRouteKey: `solo-binding-${revision}--solo-1--delivery-${revision}-student-document`,
      expectedByteLength: bytes.length, expectedEtag: etag }],
    pageGroups: [{ pageGroupKey: 'group-1', combinedPhysicalPages: [1] }],
    activities: [{ placementId: 'placement-1', activityId: 'activity-1', activityVersionId: 'activity-v1',
      activityVersion: 1, nodeKey: 'unit-1', order: 1, contextMode: 'required',
      sourceContext: { available: true, description: 'Combined page 1', pageGroupKeys: ['group-1'], sourcePageScopes: [] } }],
    actionFlags: { canAutosave: true, canSubmit: true, canReview: false },
    provenance: { publicationId: 'publication-1', publicationRevision: 1,
      bindingId: `solo-binding-${revision}`, bindingRevision: revision },
  });
  let projectionReads = 0;
  let staleRouteRead = false;
  const documentReads: string[] = [];
  const preflightHeaders: string[] = [];
  const preflightServer = createServer((request, response) => {
    documentReads.push(`${request.method} preflight`);
    if (request.method === 'OPTIONS') {
      preflightHeaders.push([
        request.headers.origin,
        request.headers['access-control-request-method'],
        request.headers['access-control-request-headers'],
      ].join('|'));
      response.writeHead(204, {
        'Access-Control-Allow-Origin': studentOrigin,
        'Access-Control-Allow-Headers': 'authorization, range',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Private-Network': 'true',
      }).end();
      return;
    }
    response.writeHead(200, {
      'Access-Control-Allow-Origin': studentOrigin,
      'Access-Control-Expose-Headers': 'accept-ranges, content-length, content-range, etag',
      'Content-Type': 'application/pdf',
    }).end(bytes);
  });
  await new Promise<void>((resolve) => preflightServer.listen(0, '0.0.0.0', resolve));
  const preflightPort = (preflightServer.address() as AddressInfo).port;
  await page.route('**/book-delivery/current/*/solo-1', async (route) => {
    projectionReads += 1;
    const recipientId = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-2) ?? '');
    await route.fulfill({ json: projection(staleRouteRead ? 2 : 1, recipientId) });
  });
  await page.route('**/v1/book-runtime-launch/activities', async (route) => route.fulfill({ json: { activities: [{
    activityId: 'activity-1', activityVersionId: 'activity-v1', label: 'Activity 1',
    projection: { schemaVersion: 1, title: 'Activity 1', taskProfile: null, presentationMode: 'structured',
      contextRequirement: { mode: 'required', acceptedKinds: ['page-group'] }, instructions: [], stimulus: null,
      assetRefs: [], interaction: { family: 'text-entry', variant: 'v1' },
      answerRule: { defaultPoints: 1, normalization: 'exact' }, interactions: [],
      scoring: { mode: 'auto-where-possible', feedbackVisibility: 'none' } },
  }] } }));
  await page.route('**/v1/book-delivery/document/solo-binding-1--solo-1--delivery-1-student-document',
    async (route) => {
      documentReads.push(`${route.request().method()} stale`);
      if (route.request().method() === 'OPTIONS') {
        preflightHeaders.push([
          route.request().headers().origin,
          route.request().headers()['access-control-request-method'],
          route.request().headers()['access-control-request-headers'],
        ].join('|'));
        await route.fulfill({ status: 204, headers: {
          'access-control-allow-origin': studentOrigin,
          'access-control-allow-headers': 'authorization, range',
          'access-control-allow-methods': 'GET, HEAD, OPTIONS',
        } });
        return;
      }
      staleRouteRead = true;
      await route.fulfill({ status: 409, json: { code: 'stale-binding' } });
    });
  await page.route('**/v1/book-delivery/document/solo-binding-2--solo-1--delivery-2-student-document', async (route) => {
    documentReads.push(`${route.request().method()} refreshed ${route.request().headers().range ?? ''}`);
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: {
        'access-control-allow-origin': studentOrigin,
        'access-control-allow-headers': 'authorization, range',
        'access-control-allow-methods': 'GET, HEAD, OPTIONS',
      } });
      return;
    }
    const headers = { 'accept-ranges': 'bytes', 'content-length': String(bytes.length),
      'access-control-allow-origin': studentOrigin, 'access-control-allow-headers': 'authorization, range',
      'access-control-allow-methods': 'GET, HEAD, OPTIONS',
      'access-control-expose-headers': 'accept-ranges, content-length, content-range, etag',
      'content-type': 'application/pdf', etag };
    if (route.request().method() === 'HEAD') return route.fulfill({ status: 200, headers });
    const range = route.request().headers().range?.match(/^bytes=(\d+)-(\d*)$/u);
    if (!range) return route.fulfill({ status: 200, headers, body: bytes });
    const start = Number(range[1]);
    const end = range[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1;
    return route.fulfill({ status: 206, body: bytes.subarray(start, end + 1), headers: {
      ...headers, 'content-length': String(end - start + 1),
      'content-range': `bytes ${start}-${end}/${bytes.length}`,
    } });
  });

  await loginStudent(page);
  const preflight = await page.request.fetch(
    `http://localhost:${preflightPort}/v1/book-delivery/document/preflight`,
    {
      method: 'OPTIONS',
      headers: {
        'Access-Control-Request-Headers': 'authorization, range',
        'Access-Control-Request-Method': 'GET',
        Origin: studentOrigin,
      },
    },
  );
  expect(preflight.status()).toBe(204);
  await new Promise<void>((resolve, reject) => preflightServer.close((error) => error ? reject(error) : resolve()));
  await page.goto(`${studentOrigin}/student/practice/book-1?bookSurface=solo&contextId=solo-1`,
    { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('book-runtime-shell')).toBeVisible({ timeout: 60_000 });
  await expect.poll(async () => {
    if (await page.locator('canvas[aria-label^="Page "]').isVisible()) return 'canvas';
    const alert = page.getByRole('alert').last();
    return await alert.isVisible()
      ? `error:${await alert.getAttribute('data-error-code')}:${await alert.innerText()}; reads:${documentReads.join(',')}; responses:${documentResponses.join(',')}`
      : 'pending';
  }, {
    message: `document reads: ${documentReads.join(', ')}; responses: ${documentResponses.join(', ')}; page errors: ${pageErrors.join(', ')}; console: ${consoleErrors.join(', ')}`,
    timeout: 60_000,
  }).toBe('canvas');
  expect(projectionReads).toBe(2);
  expect(documentReads.filter((read) => read === 'HEAD stale')).toEqual(['HEAD stale']);
  expect(documentReads).toContain('OPTIONS preflight');
  expect(preflightHeaders).toContain(`${studentOrigin}|GET|authorization, range`);
  expect(documentReads).toContain('HEAD refreshed ');
  expect(documentReads.some((read) => read.startsWith('GET refreshed'))).toBe(true);
  expect(await page.locator('body').innerText()).not.toMatch(/sourceVersionId|sourceKey|provider|objectKey|bucket/iu);
});
