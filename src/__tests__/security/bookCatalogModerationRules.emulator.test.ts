import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { materialCatalogIds, type MaterialBookMetadata, type MaterialBookNode } from '../../types/materialCatalog.types';
import { approvePublicBook, buildMaterialBookIndexWrites, createMaterialBooksRepository, rejectPublicBookReview, returnPublicBookToPrivate, updateBookMetadata } from '../../services/materialCatalog/materialBooks.service';
import { createMaterialBookSummary } from '../../services/materialCatalog/materialSummaryAdapters.service';
import { buildMaterialSummaryUpdatePayload } from '../../services/materialCatalog/materialSummaryPort.service';
import { DEFAULT_MATERIAL_TEST_TYPES } from '../../services/materialCatalog/testTypeConfig.service';

const suite = process.env.FIREBASE_DATABASE_EMULATOR_HOST ? describe : describe.skip;
const now = '2026-10-19T00:00:00.000Z';
const bookPath = 'material_catalog/books/book-1';
const book: MaterialBookMetadata = {
  bookId: materialCatalogIds.bookId('book-1'), ownerId: 'teacher-1', title: 'Moderation Book',
  authors: ['Author'], tags: ['reading'], testTypeIds: [materialCatalogIds.testTypeId('ielts')],
  primaryTestTypeId: materialCatalogIds.testTypeId('ielts'), bookMode: 'materials',
  visibility: 'public-library-pending-review', status: 'ready',
  createdAt: now, updatedAt: now, createdBy: 'teacher-1', updatedBy: 'teacher-1',
};
const node: MaterialBookNode = {
  nodeId: materialCatalogIds.nodeId('node-1'), bookId: book.bookId, parentNodeId: null,
  type: 'section', title: 'Section', order: 1, materialRefs: [], createdAt: now, updatedAt: now,
};
const context = (actorId = 'admin-1', actorRole: 'super_admin' | 'teacher' = 'super_admin') => ({
  actorId, actorRole, now: () => now, testTypeConfigs: DEFAULT_MATERIAL_TEST_TYPES,
});
const indexWrites = (metadata: MaterialBookMetadata) => buildMaterialBookIndexWrites(metadata)
  .map(({ path, value }) => ({ path, value: JSON.parse(JSON.stringify(value)) }));
let env: RulesTestEnvironment;
const repository = (uid: string) => {
  const db = env.authenticatedContext(uid).database();
  return createMaterialBooksRepository({
    read: async (path) => (await db.ref(path).once('value')).val(),
    write: async (path, value) => { await db.ref(path).set(value); },
    remove: async (path) => { await db.ref(path).remove(); },
    update: async (payload) => { await db.ref().update(payload); },
  });
};

suite('Book catalog moderation authority', () => {
  beforeAll(async () => {
    const [host, port] = process.env.FIREBASE_DATABASE_EMULATOR_HOST!.split(':');
    env = await initializeTestEnvironment({ projectId: 'demo-book-catalog-moderation',
      database: { host, port: Number(port), rules: readFileSync('database.rules.json', 'utf8') } });
  });
  afterAll(async () => { await env?.cleanup(); });
  beforeEach(async () => {
    await env.clearDatabase();
    await env.withSecurityRulesDisabled(async (context) => {
      await context.database().ref().update({
        'users/teacher-1/role': 'teacher', 'users/teacher-2/role': 'teacher', 'users/admin-1/role': 'super_admin',
        [bookPath]: book, 'material_catalog/book_nodes/book-1/node-1': node,
        ...Object.fromEntries(indexWrites(book).map(({ path, value }) => [path, value])),
        ...buildMaterialSummaryUpdatePayload(createMaterialBookSummary(book)),
      });
    });
  });

  it('accepts actual service approval, rejection, and return-private atomic payloads', async () => {
    const repo = repository('admin-1');
    await approvePublicBook('book-1', repo, context(), { reason: 'Reviewed.' });
    expect((await repo.readBook('book-1'))?.publicReview?.status).toBe('approved');
    const teacher = env.authenticatedContext('teacher-1').database();
    await assertSucceeds(teacher.ref('material_catalog/public_book_projections/book-1').once('value'));
    await assertSucceeds(teacher.ref('material_catalog/book_indexes/by_visibility/public-library-published').once('value'));
    await returnPublicBookToPrivate('book-1', 'Return.', repo, context());
    await assertFails(teacher.ref(`${bookPath}/publicReview`).remove());
    await assertFails(teacher.ref(`${bookPath}/publicReview`).update({ reason: 'Changed decision' }));
    await updateBookMetadata('book-1', { visibility: 'public-library-pending-review' }, repository('teacher-1'), context('teacher-1', 'teacher'));
    await rejectPublicBookReview('book-1', 'Needs review.', repo, context());
    expect((await repo.readBook('book-1'))?.publicReview?.status).toBe('rejected');
    await returnPublicBookToPrivate('book-1', 'Return.', repo, context());
    expect((await repo.readBook('book-1'))?.visibility).toBe('private');
  });

  it('denies teacher promotion and forging admin review decisions, and closes review fields', async () => {
    const teacher = env.authenticatedContext('teacher-1').database();
    await assertFails(teacher.ref(bookPath).update({ visibility: 'public-library-published' }));
    await assertFails(teacher.ref(`${bookPath}/publicReview`).set({ status: 'approved', reason: 'Forged', reviewedBy: 'admin-1', reviewedAt: now }));
    const admin = env.authenticatedContext('admin-1').database();
    await assertFails(admin.ref(`${bookPath}/publicReview`).set({ status: 'approved', answerKey: 'unsafe' }));
    await assertSucceeds(teacher.ref(`${bookPath}/publicReview`).set({ status: 'pending-review', requestedBy: 'teacher-1', requestedAt: now }));
  });

  it('denies owner demotion of an approved Book through direct and ancestor writes', async () => {
    const approved = await approvePublicBook('book-1', repository('admin-1'), context(), { reason: 'Reviewed.' });
    const teacher = env.authenticatedContext('teacher-1').database();
    for (const visibility of ['private', 'public-library-pending-review', 'public-library-rejected']) {
      await assertFails(teacher.ref(bookPath).update({ visibility }));
      await assertFails(teacher.ref('material_catalog/books').update({ 'book-1': { ...approved, visibility } }));
    }
    expect((await repository('admin-1').readBook('book-1'))?.visibility).toBe('public-library-published');
    await assertSucceeds(teacher.ref('material_catalog/public_book_projections/book-1').once('value'));
  });

  it('denies takeover and deletion of another owner private summaries across all nine buckets', async () => {
    const writes = buildMaterialSummaryUpdatePayload(createMaterialBookSummary(book));
    expect(Object.keys(writes)).toHaveLength(9);
    const other = env.authenticatedContext('teacher-2').database();
    await env.withSecurityRulesDisabled(async (context) => {
      await context.database().ref('reading_v2/material_metadata/book-1/ownerId').set('teacher-2');
    });
    for (const [path, value] of Object.entries(writes)) {
      const takeover = { ...value as object, ownerId: 'teacher-2' };
      const parent = path.slice(0, path.lastIndexOf('/'));
      await assertFails(other.ref(path).set(takeover));
      await assertFails(other.ref(parent).update({ 'book-1': takeover }));
      await assertFails(other.ref(path).remove());
      await assertFails(other.ref(parent).update({ 'book-1': null }));
    }
    const ownBook = { ...book, bookId: materialCatalogIds.bookId('book-2'), ownerId: 'teacher-2' };
    await assertSucceeds(other.ref().update(buildMaterialSummaryUpdatePayload(createMaterialBookSummary(ownBook))));
  });

  it('permits only an active student scoped reader to read a published ready Book', async () => {
    await approvePublicBook('book-1', repository('admin-1'), context(), { reason: 'Reviewed.' });
    await env.withSecurityRulesDisabled(async (context) => {
      await context.database().ref('users/student-1').set({ role: 'student', status: 'active' });
    });
    const reader = env.authenticatedContext('reader-service', { book_public_reader_service: true,
      book_public_reader_studentId: 'student-1', book_public_reader_bookId: 'book-1' }).database();
    const projectionPath = 'material_catalog/public_book_projections/book-1';
    await assertSucceeds(reader.ref(bookPath).once('value'));
    await assertSucceeds(reader.ref(projectionPath).once('value'));
    await assertFails(env.authenticatedContext('student-1').database().ref(bookPath).once('value'));
    await returnPublicBookToPrivate('book-1', 'Return.', repository('admin-1'), context());
    await assertFails(reader.ref(bookPath).once('value'));
    await assertFails(reader.ref(projectionPath).once('value'));
  });

  it('denies public Book summary create, mutation, marker removal, and delete across all nine buckets', async () => {
    const published = { ...book, visibility: 'public-library-published' as const };
    const writes = buildMaterialSummaryUpdatePayload(createMaterialBookSummary(published));
    expect(Object.keys(writes)).toHaveLength(9);
    const teacher = env.authenticatedContext('teacher-1').database();
    for (const [path, value] of Object.entries(writes)) {
      await assertFails(teacher.ref(path).set(value));
      for (const marker of ['producerId', 'materialKind', 'surfaceFamily']) {
        await assertFails(teacher.ref(path).set({ ...value as object, [marker]: 'spoof' }));
        const singleMarker = { ...value as object, producerId: 'generic-test', materialKind: 'full-test', surfaceFamily: 'assessment' };
        singleMarker[marker as keyof typeof singleMarker] = (value as Record<string, string>)[marker];
        await assertFails(teacher.ref(path).set(singleMarker));
      }
    }
    await env.withSecurityRulesDisabled(async (context) => { await context.database().ref().update({
      ...writes, 'reading_v2/material_metadata/book-1/ownerId': 'teacher-1',
    }); });
    for (const path of Object.keys(writes)) {
      await assertFails(teacher.ref(path).update({ title: 'Changed' }));
      await assertFails(teacher.ref(path).update({ producerId: 'generic-test', materialKind: 'full-test', surfaceFamily: 'assessment', visibility: 'private', bookVisibility: 'private' }));
      await assertFails(teacher.ref(path).remove());
      const parent = path.slice(0, path.lastIndexOf('/'));
      await assertFails(teacher.ref(parent).update({ 'book-1': null }));
    }
  });

  it('enforces moderation and ownership through Book index ancestor writes', async () => {
    const published = { ...book, visibility: 'public-library-published' as const };
    const teacher = env.authenticatedContext('teacher-1').database();
    const other = env.authenticatedContext('teacher-2').database();
    const writes = indexWrites(published);
    for (const { path, value } of writes) {
      const parent = path.slice(0, path.lastIndexOf('/'));
      await assertFails(teacher.ref(parent).update({ 'book-1': value }));
      await assertFails(other.ref(parent).update({ 'book-1': value }));
    }
    await env.withSecurityRulesDisabled(async (context) => {
      await context.database().ref().update(Object.fromEntries(writes.map(({ path, value }) => [path, value])));
    });
    for (const { path } of writes) {
      const parent = path.slice(0, path.lastIndexOf('/'));
      await assertFails(teacher.ref(parent).update({ 'book-1': null }));
      await assertFails(teacher.ref(path).update({ visibility: 'private' }));
    }
    await env.withSecurityRulesDisabled(async (context) => {
      await context.database().ref().update(Object.fromEntries(writes.map(({ path }) => [path, null])));
    });
    for (const { path, value } of indexWrites(book)) {
      await assertFails(other.ref(path).set(value));
      await assertSucceeds(teacher.ref(path).set(value));
    }
  });
});
