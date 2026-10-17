import { expect, test } from '@playwright/test';
import { jsPDF } from 'jspdf';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createBookDraft, createMaterialBooksRepository } from '../src/services/materialCatalog/materialBooks.service';
import { materialCatalogIds } from '../src/types/materialCatalog.types';
import { DEFAULT_MATERIAL_TEST_TYPES } from '../src/services/materialCatalog/testTypeConfig.service';
import { bookScopedActivityTargetId } from '../src/services/book-assembly/unitActivityImport.service';
import { previewInputFingerprint } from '../src/services/book-assembly/unitPreview.service';

const ORIGIN = 'http://localhost:5173';
const UNIT_01_PDF = resolve(process.cwd(), 'artifacts/prd0062-real-materials/cuts/unit-01-growing-up.pdf');
const UNIT_02_PDF = resolve(process.cwd(), 'artifacts/prd0062-real-materials/cuts/unit-02-mental-and-physical-development.pdf');

test('first Component direct chain creates trusted uploads, sealed Activity, A0 and publication', async ({ request }) => {
  test.setTimeout(120_000);
  const origin = 'http://localhost:8791';
  const initial = await (await request.get(`${origin}/__first-component/diagnostics`)).json();
  expect(initial.objectCount).toBe(0);
  expect(initial.sourceUpload).toMatchObject({ revision: 0, operations: {}, capacity: {
    trackedAccountBytes: 0, temporaryBytes: 0, providerReconciliation: { status: 'healthy', totalBytes: 0, objectCount: 0 },
  } });
  expect(Object.keys(initial.sourceUpload.assemblyBooks ?? {})).toHaveLength(0);
  expect(Object.keys(initial.sourceUpload.lifecycleAuditEvents ?? {})).toHaveLength(0);
  const storage = async (method: string, fields: Record<string, unknown>) => {
    const response = await request.post(`${origin}/__first-component/storage`, { data: { method, ...fields } });
    expect(response.ok()).toBe(true);
    return response.json();
  };
  const repository = createMaterialBooksRepository({
    read: (path) => storage('read', { path }),
    write: async (path, value) => { await storage('write', { path, value }); },
    remove: async (path) => { await storage('remove', { path }); },
    update: async (payload) => { await storage('update', { payload }); },
  });
  const bookId = `direct-${randomUUID().slice(0, 8)}`;
  const book = await createBookDraft({ bookId: materialCatalogIds.bookId(bookId), bookMode: 'pdf', ownerId: 'teacher-1',
    title: 'First Component direct proof', testTypeIds: [materialCatalogIds.testTypeId('ielts')], visibility: 'private' },
  repository, { actorId: 'teacher-1', actorRole: 'teacher', testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES });
  expect(book).toMatchObject({ bookRevision: 0, sourceSetRevision: 0 });
  expect(book.sourceSet).toBeUndefined();
  const auth = await (await request.get(`${origin}/__first-component/auth-response`)).json();
  const invoke = async (path: string, data?: Record<string, unknown>, operationId?: string) => {
    const idempotencyKey = operationId ?? data?.operationId;
    const response = await request.fetch(`${origin}${path}`, {
      method: data ? 'POST' : 'GET', data,
      headers: { Authorization: `Bearer ${auth.idToken}`, Origin: ORIGIN,
        ...(typeof idempotencyKey === 'string' ? { 'Idempotency-Key': idempotencyKey } : {}) },
    });
    const body = await response.json();
    expect(response.status(), JSON.stringify(body)).toBe(200);
    return body;
  };
  const upload = async (sourceKey: string, pages: number, purpose = 'book-source') => {
    const pdf = new jsPDF();
    for (let page = 1; page < pages; page++) pdf.addPage();
    const bytes = Buffer.from(pdf.output('arraybuffer'));
    const operationId = randomUUID();
    const root = `/v1/book-source/books/${bookId}/upload`;
    const begin = await invoke(`${root}/begin`, { operationId, sourceKey, kind: 'initial', purpose,
      inspection: { schemaVersion: 1, trust: 'browser-supplied-untrusted', state: 'complete', displayFilename: `${sourceKey}.pdf`,
        exactByteSize: bytes.length, sha256Hex: createHash('sha256').update(bytes).digest('hex'), physicalPageCount: pages,
        pdfType: 'application/pdf', readability: 'readable' } }, operationId);
    const target = new URL(begin.upload.url);
    const put = await request.put(`${origin}${target.pathname}${target.search}`, { data: bytes, headers: begin.upload.requiredHeaders });
    expect(put.status()).toBe(200);
    await invoke(`${root}/${begin.reservationId}/complete`, { operationId }, operationId);
    if (purpose === 'book-source') await invoke(`${root}/${begin.reservationId}/student-safe/decide`, {
      operationId, studentSafeStatus: 'ready', reasonCode: 'teacher-reviewed',
    });
    return { ...begin, operationId };
  };
  const a = await upload('part-a', 1);
  const b = await upload('part-b', 1);
  const document = await upload('student-document', 2, 'student-document');
  const sourceSet = { sourceStrategy: 'component_pdfs', sources: [
    { sourceKey: 'part-a', sourceVersionId: a.sourceVersionId, sourceOrder: 1, ownerNodeKey: 'unit-1' },
    { sourceKey: 'part-b', sourceVersionId: b.sourceVersionId, sourceOrder: 2, ownerNodeKey: 'unit-1' },
  ] };
  const manifest = { bookId, sourceSet, nodes: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1 }], units: [{
    unitKey: 'unit-1', activitySlots: [{ activityKey: 'slot-1', order: 1, contextRequirement: 'required', pageGroupKeys: ['pages-a'] }],
    pageGroups: [{ pageGroupKey: 'pages-a', sourceKey: 'part-a', pages: [1], activityKeys: ['slot-1'], mode: 'activity' }],
  }] };
  const candidates = `/book-assembly/books/${bookId}/units/unit-1/candidates`;
  const draft = await invoke(candidates, { operationId: randomUUID(), bookId, unitKey: 'unit-1', expectedBookRevision: 0,
    expectedSourceSetRevision: 0, manifest });
  await invoke(`${candidates}/${draft.candidate.candidateId}/validate`, { operationId: randomUUID(), bookId, unitKey: 'unit-1',
    candidateId: draft.candidate.candidateId, expectedCandidateRevision: 1 });
  const discovered = await invoke(`/book-assembly/books/${bookId}/drafts`);
  expect(JSON.stringify(discovered)).toContain(draft.candidate.candidateId);
  const unitActivityBinding = { unitKey: 'unit-1', activityKey: 'slot-1' };
  const content = { schemaVersion: 1, title: 'Choice', taskProfile: null, presentationMode: 'source-assisted',
    contextRequirement: { mode: 'required', acceptedKinds: ['book-pages'] }, instructions: [{ text: 'Choose.' }],
    stimulus: null, assetRefs: [], interaction: { family: 'choice', variant: 'v1' },
    answerRule: { defaultPoints: 1, normalization: 'exact', requiredSelectionCount: 1 },
    interactions: [{ prompt: 'Choose A', options: ['A', 'B'], acceptedOptionIndexes: [0], sourceAssisted: {
      questionLabel: '1', sourceExerciseLabel: 'Exercise 1', accessiblePrompt: 'Choose one answer.', responseShape: 'single-choice' } }],
    scoring: { mode: 'auto-where-possible' } };
  const staged = await invoke('/book-activity-authoring/stage', { operationId: randomUUID(), bookId, expectedRevision: 0,
    targetActivityId: bookScopedActivityTargetId(bookId, unitActivityBinding.activityKey), unitActivityBinding, content });
  await invoke('/book-activity-authoring/validate', { operationId: randomUUID(), candidateId: staged.candidateId, expectedRevision: 1, unitActivityBinding });
  const saved = await invoke('/book-activity-authoring/save-draft', { operationId: randomUUID(), candidateId: staged.candidateId,
    expectedRevision: 2, unitActivityBinding });
  expect(staged.candidateId).not.toBe(draft.candidate.candidateId);
  const activationCommand = { operationId: randomUUID(), expectedBookRevision: 0, expectedSourceSetRevision: 0, sourceSet, manifest,
    preparation: { componentReservationIds: [a.reservationId, b.reservationId], studentDocumentReservationId: document.reservationId }, activatedAt: new Date().toISOString() };
  const unreviewed = await request.post(`${origin}/book-assembly/books/${bookId}/component-pdf-activation`, {
    data: activationCommand, headers: { Authorization: `Bearer ${auth.idToken}`, Origin: ORIGIN },
  });
  expect(unreviewed.status()).toBe(409);
  expect(await unreviewed.json()).toEqual({ code: 'component_pdf_staging_completion_invalid' });
  expect(await repository.readBook(materialCatalogIds.bookId(bookId))).toMatchObject({ bookRevision: 0, sourceSetRevision: 0 });
  const diagnostics = async () => (await request.get(`${origin}/__first-component/diagnostics`)).json();
  const savedNormalizedDraft = (await diagnostics()).activity.owners['teacher-1'].activities[saved.activityId].draft;
  expect((await diagnostics()).publication?.books?.[bookId]?.current).toBeUndefined();
  const decisionPath = `/v1/book-source/books/${bookId}/upload/${document.reservationId}/student-safe/decide`;
  const decision = { operationId: document.operationId, studentSafeStatus: 'ready', reasonCode: 'teacher-reviewed' };
  // Lose the successful response after persistence, then retry the identical request.
  await invoke(decisionPath, decision);
  const decidedAccount = (await diagnostics()).sourceUpload;
  expect(await invoke(decisionPath, decision)).toMatchObject({ purpose: 'student-document', studentSafeStatus: 'ready' });
  expect((await diagnostics()).sourceUpload).toEqual(decidedAccount);
  const activated = await invoke(`/book-assembly/books/${bookId}/component-pdf-activation`, activationCommand);
  expect(JSON.stringify(activated)).toContain(saved.activityId);
  expect(await invoke(`/book-assembly/books/${bookId}/component-pdf-activation`, activationCommand)).toEqual(activated);
  expect((await diagnostics()).activity.owners['teacher-1'].activities[saved.activityId].draft).toEqual(savedNormalizedDraft);
  const reloaded = await repository.readBook(materialCatalogIds.bookId(bookId));
  expect(reloaded).toMatchObject({ bookRevision: 1, sourceSetRevision: 1, sourceSet });
  const pinnedCandidate = activated.receipt.unitCandidates[0];
  const previewPath = `${candidates}/${pinnedCandidate.candidateId}/preview`;
  const preview = await invoke(previewPath, { expectedCandidateRevision: pinnedCandidate.candidateRevision });
  const approved = await invoke(`${candidates}/${pinnedCandidate.candidateId}/approve`, {
    expectedCandidateRevision: pinnedCandidate.candidateRevision, expectedUnitInputFingerprint: previewInputFingerprint(preview.preview),
    expectedWholeActivationFingerprint: preview.qualification.wholeActivationFingerprint,
  });
  const { approvalId, approvalRevision, approvedAt, expiresAt } = approved.approval;
  const publication = { bookId, expectedCurrentPublicationId: null, expectedBookRevision: 1, expectedSourceSetRevision: 1,
    unitApprovals: [{ unitKey: 'unit-1', candidateId: pinnedCandidate.candidateId, candidateRevision: pinnedCandidate.candidateRevision,
      approvalId, approvalRevision, approvedAt, expiresAt }] };
  const publicationOperation = randomUUID();
  const beforeInvalidCoverage = (await diagnostics()).publication;
  for (const unitApprovals of [[], [...publication.unitApprovals, ...publication.unitApprovals],
    [...publication.unitApprovals, { ...publication.unitApprovals[0], unitKey: 'extra-unit' }]]) {
    const denied = await request.post(`${origin}/book-assembly/component-pdf-publications`, {
      data: { ...publication, unitApprovals },
      headers: { Authorization: `Bearer ${auth.idToken}`, Origin: ORIGIN, 'Idempotency-Key': randomUUID() },
    });
    expect(denied.status()).toBeGreaterThanOrEqual(400);
    expect(denied.status()).toBeLessThan(500);
    expect((await diagnostics()).publication).toEqual(beforeInvalidCoverage);
  }
  const published = await invoke('/book-assembly/component-pdf-publications', publication, publicationOperation);
  expect(published.result.status).toBe('published');
  expect((await diagnostics()).activity.owners['teacher-1'].activities[saved.activityId].draft).toEqual(savedNormalizedDraft);
  const publicationBeforeReplay = (await diagnostics()).publication;
  const replayed = await invoke('/book-assembly/component-pdf-publications', publication, publicationOperation);
  expect(replayed).toMatchObject({ publicationId: published.publicationId, result: { status: 'replayed' } });
  expect((await diagnostics()).publication).toEqual(publicationBeforeReplay);
  const changedReplay = await request.post(`${origin}/book-assembly/component-pdf-publications`, {
    data: { ...publication, expectedBookRevision: 2 },
    headers: { Authorization: `Bearer ${auth.idToken}`, Origin: ORIGIN, 'Idempotency-Key': publicationOperation },
  });
  expect(changedReplay.status()).toBe(409);
  expect(await changedReplay.json()).toEqual({ code: 'idempotency_conflict' });
  expect((await diagnostics()).publication).toEqual(publicationBeforeReplay);
  await storage('write', { path: 'users/teacher-1', value: { role: 'teacher', status: 'active', disabled: true } });
  const revokedReplay = await request.post(`${origin}/book-assembly/component-pdf-publications`, {
    data: publication, headers: { Authorization: `Bearer ${auth.idToken}`, Origin: ORIGIN, 'Idempotency-Key': publicationOperation },
  });
  expect(revokedReplay.status()).toBe(403);
  expect((await diagnostics()).publication).toEqual(publicationBeforeReplay);
  await storage('write', { path: 'users/teacher-1', value: { role: 'teacher', status: 'active' } });
});

test('first Component PDF authoring uses production authority from a new 0/0 Book', async ({ page }) => {
  test.setTimeout(240_000);
  const failures: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') failures.push(message.text()); });
  page.on('pageerror', (error) => failures.push(error.message));
  await page.goto(`${ORIGIN}/__smoke/book-assembly?fixture=first-component-authoring`);
  await expect(page.getByRole('heading', { name: 'How will this Book use PDFs?' })).toBeVisible({ timeout: 60_000 });
  expect(JSON.parse(await page.getByTestId('first-component-initial-authority').textContent() ?? '{}')).toEqual({
    bookRevision: 0, sourceSetRevision: 0, sourceSet: null, setupActivations: null,
  });
  await page.getByRole('button', { name: /Several component PDFs/ }).click();
  await page.getByLabel('Choose PDFs to combine').setInputFiles([UNIT_01_PDF, UNIT_02_PDF]);
  await expect(page.getByRole('button', { name: 'Combine and preview' })).toBeEnabled({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Combine and preview' }).click();
  await expect(page.getByRole('heading', { name: 'Combined PDF preview' })).toBeVisible({ timeout: 75_000 });
  await page.getByRole('button', { name: 'Use these PDFs' }).click();
  for (const name of ['PDF 1', 'PDF 2']) {
    const card = page.getByRole('region', { name, exact: true });
    await card.getByRole('button', { name: 'Upload PDF' }).click();
    await expect.poll(async () => await card.getByText('Your PDF is ready').isVisible()
      || await card.getByText('Upload needs attention').isVisible(), { timeout: 60_000 }).toBe(true);
    expect(await card.getByText('Your PDF is ready').isVisible(), failures.join('\n')).toBe(true);
  }
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeEnabled({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Give each PDF a place', level: 2 })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Add structure', exact: true }).first().click();
  const unitKey = await page.getByLabel('Unit for PDF 1', { exact: true }).inputValue();
  await page.getByLabel('Unit for PDF 2', { exact: true }).selectOption(unitKey);
  await expect(page.getByRole('button', { name: 'Add structure', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Add Unit content', exact: true }).click();
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ORIGIN });
  await page.getByRole('button', { name: 'Copy instructions', exact: true }).click();
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  const contract = JSON.parse(prompt.slice(prompt.indexOf('{'), prompt.lastIndexOf('}') + 1));
  expect(contract.unit.unitKey).toBe(unitKey);
  const bundle = contract.outputBundleShape;
  for (const slot of bundle.slots) {
    slot.content.presentationMode = 'source-assisted';
    slot.content.interaction.variant = 'v1';
    slot.content.interactions[0].sourceAssisted = {
      questionLabel: '1', sourceExerciseLabel: 'Exercise 1',
      accessiblePrompt: 'Choose one answer.', responseShape: 'single-choice',
    };
  }
  await page.getByLabel('Paste the returned Unit content').fill(JSON.stringify(bundle));
  await page.getByRole('region', { name: 'Add Unit content', exact: true })
    .getByRole('button', { name: 'Add Unit content', exact: true }).click();
  await expect(page.getByText('Unit content is ready', { exact: true })).toBeVisible({ timeout: 60_000 });
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'PDF Book progress' })).toBeVisible({ timeout: 60_000 });
  const draftAuthority = JSON.parse(await page.getByTestId('first-component-initial-authority').textContent() ?? '{}');
  expect(draftAuthority).toMatchObject({ bookRevision: 0, sourceSetRevision: 0, sourceSet: null, setupActivations: null });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByText('Unit content is ready', { exact: true })).toBeVisible({ timeout: 60_000 });
  expect(await page.getByLabel('Unit for PDF 2', { exact: true }).inputValue()).toBe(unitKey);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByText('Pages are connected', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  const bookId = await page.getByTestId('first-component-book-id').textContent();
  const diagnostics = async () => (await page.request.get('http://localhost:8791/__first-component/diagnostics')).json();
  const beforeSave = (await diagnostics()).assembly[bookId!];
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saving…', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Prepare Book preview after saving Activities' })).toBeEnabled({ timeout: 60_000 });
  expect((await diagnostics()).assembly[bookId!]).toEqual(beforeSave);
  const activationResponse = page.waitForResponse((response) => response.url().endsWith('/component-pdf-activation')
    && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Prepare Book preview after saving Activities' }).click();
  await expect(page.getByRole('button', { name: /Prepar(?:e Book preview after saving Activities|ing Book preview…)/ })).toHaveCount(0, { timeout: 60_000 });
  const activated = await activationResponse;
  expect(activated.status()).toBe(200);
  const activationRequest = activated.request();
  const activatedBook = (await diagnostics()).books[bookId!];
  const activationReplay = await page.request.post(activationRequest.url(), {
    headers: await activationRequest.allHeaders(), data: activationRequest.postDataJSON(),
  });
  expect(activationReplay.status()).toBe(200);
  expect((await diagnostics()).books[bookId!]).toEqual(activatedBook);
  await expect(page.getByRole('button', { name: 'Preview as a student', exact: true })).toBeEnabled({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Preview as a student', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Approve this preview', exact: true })).toBeEnabled({ timeout: 60_000 });
  await expect(page.locator('.book-pdf-viewer__canvas-host'), failures.join('\n')).toHaveAttribute('data-render-state', 'ready', { timeout: 60_000 });
  await page.screenshot({ path: 'artifacts/prd0062-acceptance/first-component-student-preview.png', fullPage: true });
  await page.getByRole('button', { name: 'Approve this preview', exact: true }).click();
  await page.locator('footer').getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Publish Book', exact: true })).toBeEnabled({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Publish Book', exact: true }).click();
  const publicationResponse = page.waitForResponse((response) => response.url().endsWith('/book-assembly/component-pdf-publications')
    && response.request().method() === 'POST');
  await page.getByRole('dialog', { name: 'Publish 1 approved Units?' })
    .getByRole('button', { name: 'Publish approved Units', exact: true }).click();
  const published = await publicationResponse;
  expect(published.status(), `${await published.text()}\n${failures.join('\n')}`).toBe(200);
  expect((await published.json()).result.status).toBe('published');
  const originalRequest = published.request();
  const replay = await page.request.post(originalRequest.url(), {
    headers: await originalRequest.allHeaders(), data: originalRequest.postDataJSON(),
  });
  expect(replay.status()).toBe(200);
  expect((await replay.json()).result.status).toBe('replayed');
  await page.reload();
  await expect.poll(async () => JSON.parse(await page.getByTestId('first-component-initial-authority').textContent() ?? '{}').bookRevision).toBe(1);
  const reloaded = JSON.parse(await page.getByTestId('first-component-initial-authority').textContent() ?? '{}');
  expect(reloaded.sourceSetRevision).toBe(1);
  expect(reloaded.sourceSet.sources.map((source: { ownerNodeKey: string }) => source.ownerNodeKey)).toEqual([unitKey, unitKey]);
  await expect(page.getByRole('navigation', { name: 'PDF Book progress' })).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: 'artifacts/prd0062-acceptance/first-component-preparation.png', fullPage: true });
});

const expectSelectedOrder = async (page: import('@playwright/test').Page, names: readonly string[]) => {
  const rows = page.getByRole('list', { name: 'Selected PDFs' }).getByRole('listitem');
  await expect(rows).toHaveCount(names.length);
  for (const [index, name] of names.entries()) {
    await expect(rows.nth(index)).toContainText(name);
    await expect(rows.nth(index)).toContainText('4 pages');
  }
};

test('PDF Book upload flow inspects a selected PDF locally before authorizing the mock upload', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('@firebase/analytics')) consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.goto(`${ORIGIN}/__smoke/book-assembly?fixture=pdf-upload`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.getByRole('button', { name: 'One complete PDF' }).click();
  await expect(page.getByRole('heading', { name: 'Start with one PDF' })).toBeVisible({ timeout: 60_000 });

  const pdfBytes = Buffer.from(new jsPDF({ unit: 'pt', format: 'a4' }).output('arraybuffer'));
  await page.locator('input[type="file"]').setInputFiles({
    name: 'mock-book.pdf',
    mimeType: 'application/pdf',
    buffer: pdfBytes,
  });
  await expect(page.getByText('Checking your PDF')).toBeVisible();
  await expect(page.getByText('mock-book.pdf')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Ready to upload')).toBeVisible();
  await expect(page.getByText('Complete on this device')).not.toBeVisible();

  await expect(page.getByRole('button', { name: 'Upload PDF' })).toBeEnabled();
  await page.getByRole('button', { name: 'Upload PDF' }).click();
  await expect(page.getByText('Your PDF is ready')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('region', { name: 'Book PDF' }).getByText('Ready', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Build the Book structure' })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test('PDF Book chooser switches to the separate component-PDF interface', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('@firebase/analytics')) consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.goto(`${ORIGIN}/__smoke/book-assembly?fixture=none`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await expect(page.getByRole('heading', { name: 'How will this Book use PDFs?' })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Several component PDFs' }).click();
  await expect(page.getByRole('heading', { name: 'Combine your PDF sections' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add PDFs' })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test('PDF Book component flow keeps local files ordered through invalid-file recovery and preview mapping', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('@firebase/analytics')) consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  test.setTimeout(120_000);
  await page.goto(`${ORIGIN}/__smoke/book-assembly?fixture=none`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await expect(page.getByRole('heading', { name: 'How will this Book use PDFs?' })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Several component PDFs' }).click();
  await expect(page.getByRole('heading', { name: 'Combine your PDF sections' })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Add PDFs' }).click();
  const input = page.getByLabel('Choose PDFs to combine');
  await input.setInputFiles([UNIT_01_PDF, UNIT_02_PDF]);
  await expectSelectedOrder(page, ['unit-01-growing-up.pdf', 'unit-02-mental-and-physical-development.pdf']);

  const thirdPdf = {
    name: 'unit-03-growing-up-copy.pdf',
    mimeType: 'application/pdf',
    buffer: readFileSync(UNIT_01_PDF),
  };
  await page.getByRole('button', { name: 'Add PDFs' }).click();
  await input.setInputFiles(thirdPdf);
  await expectSelectedOrder(page, [
    'unit-01-growing-up.pdf',
    'unit-02-mental-and-physical-development.pdf',
    'unit-03-growing-up-copy.pdf',
  ]);
  await page.getByRole('button', { name: 'Keep both' }).click();

  const invalidPdf = {
    name: 'invalid.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('This is not a PDF.'),
  };
  await page.getByRole('button', { name: 'Add PDFs' }).click();
  await input.setInputFiles(invalidPdf);
  const rows = page.getByRole('list', { name: 'Selected PDFs' }).getByRole('listitem');
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0)).toContainText('4 pages');
  await expect(rows.nth(1)).toContainText('4 pages');
  await expect(rows.nth(2)).toContainText('4 pages');
  await expect(rows.nth(3)).toContainText(/failed|not readable|couldn.t check|invalid/i);

  const invalidRow = rows.nth(3);
  await invalidRow.getByRole('button', { name: 'Remove invalid.pdf' }).click();
  await expectSelectedOrder(page, [
    'unit-01-growing-up.pdf',
    'unit-02-mental-and-physical-development.pdf',
    'unit-03-growing-up-copy.pdf',
  ]);

  await page.getByRole('button', { name: 'Combine and preview' }).click();
  await expect(page.getByRole('heading', { name: 'Combined PDF preview' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTitle('Combined PDF preview')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Combined PDF component ranges' })).toContainText('unit-01-growing-up.pdf: pages 1–4');
  await expect(page.getByRole('list', { name: 'Combined PDF component ranges' })).toContainText('unit-02-mental-and-physical-development.pdf: pages 5–8');
  await expect(page.getByRole('list', { name: 'Combined PDF component ranges' })).toContainText('unit-03-growing-up-copy.pdf: pages 9–12');
  await expect(page.getByRole('button', { name: 'Use these PDFs' })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test('PDF Book component preview invalidates after reorder, remove, and changed selection', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('@firebase/analytics')) consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  test.setTimeout(120_000);
  await page.goto(`${ORIGIN}/__smoke/book-assembly?fixture=none`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.getByRole('button', { name: 'Several component PDFs' }).click();
  await page.getByRole('button', { name: 'Add PDFs' }).click();
  const input = page.getByLabel('Choose PDFs to combine');
  await input.setInputFiles([UNIT_01_PDF, UNIT_02_PDF]);
  await expectSelectedOrder(page, ['unit-01-growing-up.pdf', 'unit-02-mental-and-physical-development.pdf']);

  const combine = page.getByRole('button', { name: 'Combine and preview' });
  await combine.click();
  await expect(page.getByRole('heading', { name: 'Combined PDF preview' })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Back to files' }).click();

  await page.getByRole('button', { name: 'Move unit-02-mental-and-physical-development.pdf up' }).click();
  await expectSelectedOrder(page, ['unit-02-mental-and-physical-development.pdf', 'unit-01-growing-up.pdf']);
  await expect(page.getByRole('heading', { name: 'Combined PDF preview' })).not.toBeVisible();

  await combine.click();
  await expect(page.getByRole('heading', { name: 'Combined PDF preview' })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Back to files' }).click();
  await page.getByRole('button', { name: 'Remove unit-01-growing-up.pdf' }).click();
  await expectSelectedOrder(page, ['unit-02-mental-and-physical-development.pdf']);
  await expect(page.getByRole('heading', { name: 'Combined PDF preview' })).not.toBeVisible();
  await expect(combine).toBeDisabled();

  await page.getByRole('button', { name: 'Add PDFs' }).click();
  await input.setInputFiles(UNIT_01_PDF);
  await expectSelectedOrder(page, ['unit-02-mental-and-physical-development.pdf', 'unit-01-growing-up.pdf']);
  await expect(page.getByRole('heading', { name: 'Combined PDF preview' })).not.toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test('PDF Book full-PDF workflow keeps its single-source structure and publishes through the same final gates', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('@firebase/analytics')) consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.goto(`${ORIGIN}/__smoke/book-assembly?fixture=ticket65-full-pdf`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await expect(page.getByRole('heading', { name: 'Start with one PDF' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('region', { name: 'Book PDF' })).toContainText('already part of the saved Book draft');
  await page.getByRole('button', { name: '2 Build your Book' }).click();
  await expect(page.getByRole('heading', { name: 'Build the Book structure' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('row', { name: 'activity-ticket65 Complete Book PDF 2, 3 2' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Preview as a student' }).click();
  await page.getByRole('button', { name: 'Approve this preview' }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: 'Ready to share Unit 1?' })).toBeVisible();
  await page.getByRole('button', { name: 'Publish Unit 1', exact: true }).click();
  await page.getByRole('dialog', { name: 'Publish Unit 1?' }).getByRole('button', { name: 'Publish Unit 1', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Unit 1 is published' }).last()).toBeVisible();
  expect(consoleErrors).toEqual([]);
});
