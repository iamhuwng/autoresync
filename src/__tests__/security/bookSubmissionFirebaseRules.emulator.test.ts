import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { captureSubmissionPublication } from '../../../cloudflare/test/fixtures/book-submission-writes';
import { bookId, fingerprint, operationId, ownerId, env as workerEnv } from '../../../cloudflare/test/fixtures/book-submission-publication';

if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST) throw new Error('isolated_database_emulator_required');
const [host, port] = process.env.FIREBASE_DATABASE_EMULATOR_HOST.split(':');
const operationPath = `book_submission_operations/${ownerId}/operations/${operationId}`;
const bookPath = `material_catalog/books/${bookId}`;
const creationFencePath = `material_catalog/book_creation_fences/${bookId}`;
const publicationPath = `book_assembly_publications/books/${bookId}`;
const rules = readFileSync(new URL('../../../database.rules.json', import.meta.url), 'utf8');
let env: RulesTestEnvironment;
let payload: Awaited<ReturnType<typeof captureSubmissionPublication>>;
const claims = (overrides: Record<string, unknown> = {}) => ({
  book_submission_service: true, book_submission_ownerId: ownerId, book_submission_bookId: bookId,
  book_submission_operationId: operationId, book_submission_fingerprint: fingerprint,
  book_submission_leaseId: payload.operation.commitLeaseId, ...overrides,
});
const service = (overrides: Record<string, unknown> = {}, uid = workerEnv.BOOK_SUBMISSION_SERVICE_IDENTITY) => env.authenticatedContext(uid, claims(overrides)).database();
const seed = async (changes: Record<string, unknown> = {}) => env.withSecurityRulesDisabled(async (context) => {
  await context.database().ref().update({
    [`users/${ownerId}`]: { role: 'teacher', status: 'active' },
    [operationPath]: payload.operation, ...changes,
  });
});

describe('Book submission atomic publication rules', () => {
  beforeAll(async () => {
    env = await initializeTestEnvironment({ projectId: 'demo-pdf-submission-rules', database: { host, port: Number(port), rules } });
  });
  afterAll(async () => { await env?.cleanup(); });
  beforeEach(async () => {
    await env.clearDatabase();
    payload = await captureSubmissionPublication('full_pdf');
    await seed();
  });

  it.each(['full_pdf', 'component_pdfs'] as const)('accepts the complete real two-Unit %s finalizer PATCH once', async (strategy) => {
    payload = await captureSubmissionPublication(strategy, true);
    await seed();
    await assertSucceeds(service().ref().update(payload.writes));
    await env.withSecurityRulesDisabled(async (context) => {
      expect((await context.database().ref(`${operationPath}/state`).once('value')).val()).toBe('committed');
      expect((await context.database().ref(`${bookPath}/visibility`).once('value')).val()).toBe('private');
    });
    await assertFails(service().ref().update(payload.writes));
    await assertFails(service().ref(bookPath).remove());
    if (strategy === 'component_pdfs') await assertFails(service().ref(`${bookPath}/studentDocument/byteSize`).set(21));
  });

  it.each([
    { book_submission_ownerId: 'teacher-2' }, { book_submission_bookId: 'book-2' },
    { book_submission_operationId: 'other-operation' }, { book_submission_fingerprint: 'b'.repeat(64) },
    { book_submission_leaseId: 'other-lease' }, { book_submission_service: false },
  ])('rejects a mismatched service capability %j', async (override) => {
    await assertFails(service(override).ref().update(payload.writes));
  });

  it.each([
    { state: 'preparing' }, { state: 'canceled' }, { state: 'committed' },
    { commitLeaseExpiresAt: Date.now() - 1 }, { commitLeaseId: '' },
  ])('rejects inactive or expired operation authority %j', async (changes) => {
    await seed({ [operationPath]: { ...payload.operation, ...changes } });
    await assertFails(service().ref().update(payload.writes));
  });

  it.each([{ status: 'inactive' }, { disabled: true }, { forceReauth: true }, { role: 'student' }])('rejects an unavailable teacher %j', async (change) => {
    await seed({ [`users/${ownerId}`]: { role: 'teacher', status: 'active', ...change } });
    await assertFails(service().ref().update(payload.writes));
  });

  it.each([bookPath, `${publicationPath}/current`, operationPath])('rejects a commit missing %s', async (missing) => {
    const writes = { ...payload.writes };
    delete writes[missing];
    await assertFails(service().ref().update(writes));
  });

  it('rejects an existing Book and immutable Activity overwrite', async () => {
    await seed({ [bookPath]: { bookId, ownerId, title: 'Existing book' } });
    await assertFails(service().ref().update(payload.writes));
    await env.withSecurityRulesDisabled(async (context) => { await context.database().ref(bookPath).remove(); });
    const path = Object.keys(payload.writes).find((key) => key.startsWith('book_activity/versions/'))!;
    await seed({ [path]: { existing: true } });
    await assertFails(service().ref().update(payload.writes));
  });

  it('blocks a fenced Book for browser creation and a current scoped publication lease', async () => {
    const browser = env.authenticatedContext(ownerId).database();
    const book = { bookId, ownerId, title: 'Unpublished book', testTypeIds: ['reading'],
      visibility: 'private', status: 'draft-empty', createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(), createdBy: ownerId, updatedBy: ownerId };
    await assertSucceeds(browser.ref(bookPath).set(book));
    await env.withSecurityRulesDisabled(async (context) => { await context.database().ref(bookPath).remove(); });
    await seed({ [creationFencePath]: { bookId, ownerId, submissionOperationId: operationId, inputFingerprint: fingerprint } });
    await assertFails(browser.ref(bookPath).set(book));
    await assertFails(browser.ref().update({ [bookPath]: book }));
    await assertFails(service().ref().update(payload.writes));
    await env.withSecurityRulesDisabled(async (context) => { await context.database().ref(bookPath).set(book); });
    await assertSucceeds(browser.ref(`${bookPath}/title`).set('Existing book update'));
  });

  it('denies browser mutations of permanent creation fences through direct and ancestor paths', async () => {
    const fence = { bookId, ownerId, submissionOperationId: operationId, inputFingerprint: fingerprint };
    await seed({ 'users/admin-1': { role: 'super_admin' } });
    for (const uid of [ownerId, 'admin-1']) {
      const browser = env.authenticatedContext(uid).database();
      await assertFails(browser.ref(creationFencePath).set(fence));
      await assertFails(browser.ref('material_catalog').update({ [`book_creation_fences/${bookId}`]: fence }));
    }
    await seed({ [creationFencePath]: fence });
    for (const uid of [ownerId, 'admin-1']) {
      const browser = env.authenticatedContext(uid).database();
      await assertFails(browser.ref(`${creationFencePath}/inputFingerprint`).set('b'.repeat(64)));
      await assertFails(browser.ref(creationFencePath).remove());
      await assertFails(browser.ref().update({ [creationFencePath]: null, [bookPath]: payload.writes[bookPath] }));
      await assertFails(browser.ref('material_catalog').set({ book_creation_fences: { [bookId]: { ...fence, ownerId: 'other' } } }));
    }
    await assertFails(env.authenticatedContext(ownerId).database().ref(creationFencePath).once('value'));
  });

  it('rejects unrelated paths, public visibility and changed operation identity', async () => {
    await seed({ 'results/victim': { ownerId: 'teacher-2', score: 100 } });
    for (const extra of [
      { 'users/teacher-2/role': 'super_admin' },
      { 'results/victim': null },
      { 'audit_logs/unrelated': { actor: ownerId, action: 'forged' } },
      { 'results/victim/score': 0 },
      { 'book_submission_operations/teacher-2/operations/other': payload.operation },
      { 'book_assembly/books/book-2/units/unit-1': {} },
      { [bookPath]: { ...payload.writes[bookPath] as object, visibility: 'public-library-published' } },
      { [operationPath]: { ...payload.writes[operationPath] as object, idempotencyKey: 'changed' } },
    ]) await assertFails(service().ref().update({ ...payload.writes, ...extra }));
  });

  it('rejects an incomplete or mismatched publication identity', async () => {
    const versionPath = Object.keys(payload.writes).find((path) => path.startsWith(`${publicationPath}/versions/`))!;
    const currentPath = `${publicationPath}/current`;
    const pointer = { ...payload.writes[currentPath] as Record<string, unknown> };
    const version = { ...payload.writes[versionPath] as Record<string, unknown> };
    delete pointer.publicationId;
    delete version.publicationId;
    await assertFails(service().ref().update({ ...payload.writes, [currentPath]: pointer, [versionPath]: version }));
    await assertFails(service().ref().update({ ...payload.writes, [versionPath]: { ...version, publicationId: 'other-publication' } }));
  });

  it('rejects a Book descriptor that differs from its publication descriptor', async () => {
    payload = await captureSubmissionPublication('component_pdfs');
    await seed();
    for (const mutate of [
      (book: any) => { book.studentDocument.byteSize += 1; },
      (book: any) => { book.studentDocument.components[0].combinedEndPage += 1; },
    ]) {
      const book = structuredClone(payload.writes[bookPath]);
      mutate(book);
      await assertFails(service().ref().update({ ...payload.writes, [bookPath]: book }));
    }
  });

  it('denies appending to or targeting another Activity namespace', async () => {
    await seed({ 'book_activity/versions/foreign-activity/existing-version': { ownerId: 'teacher-2' } });
    const versionPath = Object.keys(payload.writes).find((path) => path.startsWith('book_activity/versions/'))!;
    const authoringPath = Object.keys(payload.writes).find((path) => path.includes('/activities/activity-'))!;
    const candidatePath = Object.keys(payload.writes).find((path) => path.includes('/candidates/activity-candidate-'))!;
    for (const extra of [
      { 'book_activity/versions/foreign-activity/new-version': { ...payload.writes[versionPath] as object, activityId: 'foreign-activity', activityVersionId: 'new-version' } },
      { [`book_activity_authoring/owners/${ownerId}/activities/foreign-activity`]: { ...payload.writes[authoringPath] as object, activityId: 'foreign-activity' } },
      { [candidatePath]: { ...payload.writes[candidatePath] as object, targetActivityId: 'foreign-activity' } },
    ]) await assertFails(service().ref().update({ ...payload.writes, ...extra }));
  });

  it('rejects binding seeds with foreign scope or immutable publication fields', async () => {
    const bindingPath = Object.keys(payload.writes).find(path => path.startsWith('book_assembly_activity_bindings/'))!;
    for (const change of [{ ownerId: 'teacher-2' }, { bookId: 'book-2' }, { unitKey: 'unit-2' },
      { activityVersionId: 'forged-version' }, { manifestVersionId: 'forged-manifest' }]) {
      await assertFails(service().ref().update({ ...payload.writes, [bindingPath]: { ...payload.writes[bindingPath] as object, ...change } }));
    }
    await seed({ [bindingPath]: payload.writes[bindingPath] });
    await assertFails(service().ref().update({ ...payload.writes, [bindingPath]: { ...payload.writes[bindingPath] as object, candidateRevision: 2 } }));
  });

  it('denies browser finalization, owner-shaped service identity and ancestor operation writes', async () => {
    await assertFails(env.authenticatedContext(ownerId).database().ref().update(payload.writes));
    await assertFails(service({}, ownerId).ref().update(payload.writes));
    const browser = env.authenticatedContext(ownerId).database();
    await assertFails(browser.ref(`book_submission_operations/${ownerId}`).set({ operations: { [operationId]: payload.writes[operationPath] } }));
    await assertFails(browser.ref('book_submission_operations').set({ [ownerId]: { operations: { [operationId]: payload.writes[operationPath] } } }));
    await assertFails(service().ref(`book_submission_operations/${ownerId}`).once('value'));
    await assertFails(service().ref(`users/${ownerId}`).once('value'));
    await assertFails(browser.ref(operationPath).remove());
  });
});
