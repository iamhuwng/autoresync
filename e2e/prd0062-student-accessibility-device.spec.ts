import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createPrd0062StudentAccessibilityDeviceFixture } from './prd0062-student-accessibility-device.fixture.mjs';

const origin = 'http://localhost:5174';
const fixtureUrl = '/student/practice/book-1?bookSurface=solo&contextId=solo-1';

const loginStudent = async (page: Page) => {
  await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 120_000 });
  if (!/\/student(?:\/|$)/u.test(page.url())) {
    await expect(page.getByRole('button', { name: 'Show dev quick login' })).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: 'Show dev quick login' }).click();
    await page.locator('#dev-login-student').click();
  }
  await expect(page).toHaveURL(/\/student(?:\/|$)/u, { timeout: 60_000 });
  await page.waitForTimeout(2_000);
};

const installD2FixtureRoutes = async (page: Page) => {
  const bytes = await readFile('artifacts/prd0062-ticket-06b/browser/upload-fixture.pdf');
  const etag = `"${createHash('sha256').update(bytes).digest('hex')}"`;
  const projection = {
    schemaVersion: 1, projectionKind: 'book-runtime-delivery', bindingId: 'ac-ad-binding', bindingRevision: 1,
    recipientId: 'student-test', context: { contextId: 'solo-1', kind: 'solo', entitlementBasis: 'solo' },
    book: { bookId: 'book-1', bookMode: 'pdf', bookRevision: 1, manifestVersionId: 'manifest-1', publicationId: 'publication-1', publicationRevision: 1, publicationStatus: 'published' },
    scope: { kind: 'subtree', nodeKeys: ['unit-1'], placementIds: ['placement-1', 'placement-2'] },
    sourceSet: { strategy: 'component_pdfs', sources: [] },
    outline: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1, titleSnapshot: 'Unit 1' }],
    documentRequests: [{ opaqueRouteKey: 'ac-ad-binding--solo-1--delivery-1-student-document', expectedByteLength: bytes.length, expectedEtag: etag }],
    pageGroups: [
      { pageGroupKey: 'group-1', title: 'Page Group 1', combinedPhysicalPages: [1] },
      { pageGroupKey: 'group-2', title: 'Page Group 2', combinedPhysicalPages: [1] },
    ],
    activities: [
      { placementId: 'placement-1', activityId: 'activity-1', activityVersionId: 'activity-v1', activityVersion: 1, nodeKey: 'unit-1', order: 1, contextMode: 'required', pageGroupKey: 'group-1', sourceContext: { available: true, description: 'Main claim', pageGroupKeys: ['group-1'], sourcePageScopes: [] } },
      { placementId: 'placement-2', activityId: 'activity-2', activityVersionId: 'activity-v2', activityVersion: 1, nodeKey: 'unit-1', order: 2, contextMode: 'required', pageGroupKey: 'group-2', sourceContext: { available: true, description: 'Written response', pageGroupKeys: ['group-2'], sourcePageScopes: [] } },
    ],
    actionFlags: { canAutosave: true, canSubmit: true, canReview: false },
    provenance: { publicationId: 'publication-1', publicationRevision: 1, bindingId: 'ac-ad-binding', bindingRevision: 1 },
  };
  await page.route('**/book-delivery/current/*/solo-1', (route) => {
    const recipientId = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-2) ?? '');
    return route.fulfill({ json: { ...projection, recipientId } });
  });
  await page.route('**/v1/book-runtime-launch/activities', (route) => route.fulfill({ json: { activities: projection.activities.map((activity) => ({
    activityId: activity.activityId, activityVersionId: activity.activityVersionId, label: activity.sourceContext.description,
    projection: { schemaVersion: 1, title: activity.sourceContext.description, taskProfile: null, presentationMode: 'structured', contextRequirement: { mode: 'required', acceptedKinds: ['page-group'] }, instructions: [], stimulus: null, assetRefs: [], interaction: { family: 'text-entry', variant: 'v1' }, answerRule: { defaultPoints: 1, normalization: 'exact' }, interactions: [], scoring: { mode: 'auto-where-possible', feedbackVisibility: 'none' } },
  })) } }));
  await page.route('**/v1/book-delivery/document/ac-ad-binding--solo-1--delivery-1-student-document', async (route) => {
    const headers = {
      'access-control-allow-origin': origin,
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'authorization, range',
      'access-control-allow-methods': 'GET, HEAD, OPTIONS',
      'access-control-expose-headers': 'accept-ranges, content-length, content-range, etag',
      'accept-ranges': 'bytes', 'content-type': 'application/pdf', 'content-length': String(bytes.length), etag,
    };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (route.request().method() === 'HEAD') return route.fulfill({ status: 200, headers });
    const range = route.request().headers().range?.match(/^bytes=(\d+)-(\d*)$/u);
    if (!range) return route.fulfill({ status: 200, headers, body: bytes });
    const start = Number(range[1]); const end = range[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1;
    return route.fulfill({ status: 206, headers: { ...headers, 'content-length': String(end - start + 1), 'content-range': `bytes ${start}-${end}/${bytes.length}` }, body: bytes.subarray(start, end + 1) });
  });
};

test('AC-AD-001 keeps Book runtime keyboard, touch, focus, zoom, and overflow contracts', async ({ page }, testInfo) => {
  const fixture = createPrd0062StudentAccessibilityDeviceFixture();
  await page.setViewportSize({ width: 1440, height: 900 });
  await installD2FixtureRoutes(page);
  await loginStudent(page);
  await page.goto(`${origin}${fixtureUrl}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await expect(page.getByTestId('book-runtime-shell')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('heading', { name: 'Main claim', exact: true })).toBeVisible();

  await page.getByText('Pages', { exact: true }).focus();
  await expect(page.getByText('Pages', { exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: /Page Group 1/iu })).toBeVisible();
  await page.getByRole('button', { name: 'Page Group 2' }).click();
  await expect(page.getByRole('heading', { name: 'Written response', exact: true })).toBeVisible();

  await page.setViewportSize({ width: 393, height: 727 });
  await page.getByRole('tab', { name: 'Activity' }).click();
  const controls = page.getByTestId('book-runtime-shell').getByRole('button');
  const sizes = await controls.evaluateAll((buttons) => buttons.map((button) => {
    const box = button.getBoundingClientRect();
    return { width: box.width, height: box.height };
  }));
  expect(sizes.every(({ width, height }) => width >= fixture.expected.minimumTouchTargetPx && height >= fixture.expected.minimumTouchTargetPx)).toBe(true);

  await page.getByRole('tab', { name: 'Activity' }).click();
  await expect(page.getByRole('tab', { name: 'Activity' })).toHaveAttribute('aria-selected', 'true');
  const mobileLayout = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(mobileLayout.documentWidth).toBeLessThanOrEqual(mobileLayout.viewportWidth);
  expect(mobileLayout.bodyWidth).toBeLessThanOrEqual(mobileLayout.viewportWidth);

  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  const zoomLayout = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(zoomLayout.documentWidth).toBeLessThanOrEqual(zoomLayout.viewportWidth);
  await page.evaluate(() => { document.documentElement.style.zoom = '1'; });
  await expect(page.locator('body')).not.toContainText(/answerKey|providerObjectKey|privateBucketId/iu);

  const executionId = process.env.PRD0062_EXECUTION_ID ?? 'local';
  const directory = path.resolve(`artifacts/prd0062-acceptance/AC-AD-001/${executionId}`);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'result.json'), JSON.stringify({
    caseId: 'AC-AD-001',
    project: testInfo.project.name,
    status: 'PASS_LOCAL_SMOKE_ASSERTIONS',
    proof: ['student quick-login on localhost:5174', 'keyboard focus and Enter navigation', '44px controls', 'mobile and 200% zoom overflow checks'],
    activation: 'not claimed; this local fixture neither authorizes nor proves production activation',
  }, null, 2));
});
