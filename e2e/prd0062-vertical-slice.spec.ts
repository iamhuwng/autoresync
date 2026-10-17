import { createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { resolveBookScheduleWindow } from '../src/services/book-delivery/bookScheduleWindow.service';

const teacherOrigin = 'http://localhost:5173';
const studentOrigin = 'http://localhost:5174';

const login = async (page: Page, role: 'teacher' | 'student') => {
  await page.goto(role === 'teacher' ? teacherOrigin : studentOrigin, { waitUntil: 'domcontentloaded' });
  if (!new RegExp(role === 'teacher' ? '/lobby' : '/student/?$').test(page.url())) {
    await page.getByRole('button', { name: /show dev quick login|dev quick login/iu }).click();
    await page.locator(`#dev-login-${role}`).click();
  }
  await expect(page).toHaveURL(new RegExp(role === 'teacher' ? '/lobby' : '/student/?$'), { timeout: 60_000 });
};

test('one correlated component publication reaches one opaque student Runtime document', async ({ browser }) => {
  test.setTimeout(180_000);
  const teacher = await browser.newPage();
  await login(teacher, 'teacher');
  await teacher.goto(`${teacherOrigin}/__smoke/book-assembly?fixture=ticket66-component-pdf`, { waitUntil: 'domcontentloaded' });
  await teacher.getByRole('button', { name: /Check & preview/iu }).click();
  await teacher.getByRole('button', { name: 'Preview as a student' }).click();
  await teacher.getByRole('button', { name: 'Approve this preview' }).click();
  await teacher.getByRole('button', { name: 'Preview as a student' }).click();
  await teacher.getByRole('button', { name: 'Approve this preview' }).click();
  await teacher.getByRole('button', { name: /5 Publish/iu }).click();
  await teacher.getByRole('button', { name: 'Publish Book' }).click();
  await teacher.getByRole('dialog', { name: 'Publish Unit 1?' }).getByRole('button', { name: 'Publish Unit 1' }).click();
  await teacher.getByLabel('Select vertical slice component PDFs').setInputFiles([
    'artifacts/prd0062-ticket-06b/browser/upload-fixture.pdf',
    'artifacts/prd0062-ticket-06b/browser/upload-fixture.pdf',
  ]);
  await expect(teacher.getByTestId('ticket66-browser-composition-state')).toContainText('Browser composition ready', { timeout: 60_000 });
  await teacher.getByRole('button', { name: 'Preview component PDF Unit' }).click();
  await teacher.getByRole('button', { name: 'Publish component PDF Unit' }).click();
  const state = JSON.parse(await teacher.getByTestId('ticket66-vertical-slice-state').getAttribute('data-value') ?? '{}') as {
    token: string;
    projection: Record<string, any>;
    diagnostics: { bookId: string; activationId: string; candidateIds: string[]; studentDocumentId: string;
      publicationId: string; manifestVersionId: string; immutableReadback: { manifestVersionId: string; publicationId: string };
      currentReadback: { manifestVersionId: string; publicationId: string };
      artifactBase64: string;
      descriptor: { byteSize: number; physicalPageCount: number; sha256Hex: string; components: Array<{ sourceKey: string; sourceVersionId: string; sourceOrder: number; combinedStartPage: number; combinedEndPage: number; localPageCount: number }> };
      selection: { sourceSet: { sources: Array<{ sourceKey: string; sourceVersionId: string; sourceOrder: number }> };
        components: Array<{ sourceKey: string; sourceVersionId: string; sourceOrder: number }>;
        composition: { byteSize: number; sha256Hex: string; physicalPageCount: number;
          mapping: Array<{ sourceKey: string; startPage: number; endPage: number; pageCount: number }> } } };
  };
  const bytes = Buffer.from(state.diagnostics.artifactBase64, 'base64');
  expect(state.diagnostics.descriptor.components).toHaveLength(2);
  expect(state.diagnostics.descriptor.byteSize).toBe(bytes.length);
  expect(state.diagnostics.descriptor.sha256Hex).toBe(createHash('sha256').update(bytes).digest('hex'));
  expect(state.diagnostics.selection.components.map(({ sourceKey, sourceVersionId, sourceOrder }) =>
    ({ sourceKey, sourceVersionId, sourceOrder }))).toEqual(state.diagnostics.selection.sourceSet.sources.map(
    ({ sourceKey, sourceVersionId, sourceOrder }) => ({ sourceKey, sourceVersionId, sourceOrder })));
  expect(state.diagnostics.descriptor.components.map((component) => ({ sourceKey: component.sourceKey,
    sourceVersionId: component.sourceVersionId, sourceOrder: component.sourceOrder,
    startPage: component.combinedStartPage, endPage: component.combinedEndPage, pageCount: component.localPageCount })))
    .toEqual(state.diagnostics.selection.composition.mapping.map((entry, index) => ({ ...entry,
      sourceVersionId: state.diagnostics.selection.components[index]!.sourceVersionId,
      sourceOrder: state.diagnostics.selection.components[index]!.sourceOrder })));
  expect(state.projection.book).toMatchObject({ bookId: state.diagnostics.bookId,
    publicationId: state.diagnostics.publicationId, manifestVersionId: state.diagnostics.manifestVersionId });
  expect(state.projection.documentRequests).toEqual([expect.objectContaining({
    expectedByteLength: bytes.length,
    expectedEtag: `"${state.diagnostics.descriptor.sha256Hex}"`,
  })]);
  expect(state.diagnostics.immutableReadback).toMatchObject({
    manifestVersionId: state.diagnostics.currentReadback.manifestVersionId,
    publicationId: state.diagnostics.currentReadback.publicationId,
  });
  await teacher.close();

  const student = await browser.newPage();
  const pageErrors: string[] = [];
  student.on('pageerror', (error) => pageErrors.push(error.message));
  const learnerRequests: string[] = [];
  let rangeReads = 0;
  let documentReads = 0;
  await student.route(`**/__vertical-slice/${state.token}/projection`, async (route) => {
    learnerRequests.push(route.request().url());
    await route.fulfill({ json: state.projection });
  });
  const documentRequest = state.projection.documentRequests[0];
  await student.route(`**/v1/book-delivery/document/${documentRequest.opaqueRouteKey}`, async (route) => {
    learnerRequests.push(route.request().url());
    documentReads += 1;
    const headers = { 'accept-ranges': 'bytes', 'content-length': String(bytes.length),
      'content-type': 'application/pdf', etag: documentRequest.expectedEtag };
    if (route.request().method() === 'HEAD') return route.fulfill({ status: 200, headers });
    const range = route.request().headers().range?.match(/^bytes=(\d+)-(\d*)$/u);
    if (!range) return route.fulfill({ status: 200, body: bytes, headers });
    const start = Number(range[1]);
    const end = range[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1;
    rangeReads += 1;
    return route.fulfill({ status: 206, body: bytes.subarray(start, end + 1), headers: {
      ...headers, 'content-length': String(end - start + 1), 'content-range': `bytes ${start}-${end}/${bytes.length}` } });
  });
  const placement = state.projection.activities[0];
  const scheduleWindow = resolveBookScheduleWindow({ assignmentId: 'homework-fixture', recipientId: 'student-fixture',
    bindingId: state.projection.bindingId, bindingRevision: state.projection.bindingRevision,
    placementId: placement.placementId, activityId: placement.activityId, activityVersion: placement.activityVersion,
    nodeKey: placement.nodeKey, operation: 'launch', schedule: { schemaVersion: 1, resolverVersion: 1,
      availableFrom: '2026-01-01T00:00:00.000Z', finalDueAt: '2026-12-31T00:00:00.000Z', scheduleRules: [] },
    outline: state.projection.outline, studentExtensions: {}, lateSubmissionAllowed: false,
    policyRevision: 1, authorityRevision: 1, evaluatedAt: '2026-09-21T00:00:00.000Z', maxAttempts: null, attemptsUsed: 0 });
  await student.route('http://localhost:5187/v1/book-delivery/student-fixture/homework-fixture', async (route) => {
    await route.fulfill({ json: { activities: [{ placementId: placement.placementId, scheduleWindow }] } });
  });
  await login(student, 'student');
  await student.goto(`${studentOrigin}/__smoke/book-runtime?verticalSlice=${state.token}`, { waitUntil: 'domcontentloaded' });
  await expect.poll(async () => `${await student.locator('body').innerText()}\n${pageErrors.join('\n')}`, { timeout: 10_000 }).toContain('This Activity is available.');
  expect(await student.locator('body').innerText()).not.toContain('Book unavailable');
  await expect(student.getByTestId('book-runtime-shell')).toBeVisible({ timeout: 60_000 });
  const runtimeViewer = student.getByTestId('book-runtime-viewer');
  await expect(runtimeViewer.getByRole('heading', { name: 'Authorized combined Book document' })).toBeVisible({ timeout: 60_000 });
  await expect(runtimeViewer.locator('canvas[aria-label^="Page "]')).toBeVisible({ timeout: 60_000 });
  expect(documentReads).toBeGreaterThan(1);
  expect(rangeReads).toBeLessThanOrEqual(documentReads);
  expect(learnerRequests.some((url) => url.endsWith(`/v1/book-delivery/document/${documentRequest.opaqueRouteKey}`))).toBe(true);
  expect(state.projection.documentRequests).toHaveLength(1);
  expect(JSON.stringify(state.projection)).not.toMatch(/sourceKey|sourceVersionId|provider|storage|objectKey|bucket|private|sha256|components/iu);
  expect(learnerRequests.join('\n')).not.toMatch(/source|provider|storage|object|bucket|private|sha256/iu);
  expect(await student.locator('body').innerText()).not.toMatch(/source-component|provider|storage|objectKey|bucket|private|sha256/iu);
  expect(createHash('sha256').update(bytes).digest('hex')).toHaveLength(64);
  await student.close();
});
