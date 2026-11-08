import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { readingV2Ids } from '../../types/readingV2.types';
import { READING_V2_CANONICAL_FIXTURES } from '../../services/reading-v2/fixtures/readingV2CanonicalFixtures';
import { createReadingV2Repository } from '../../services/reading-v2/readingV2Repository.service';
import { createFirebaseReadingV2DraftRepository, readingV2DraftContentEquals } from '../../services/reading-v2/readingV2DraftFirebaseRepository.service';
import { createReadingV2ManualAuthoringContext, type ReadingV2AuthoringSourceRecord } from '../../services/reading-v2/readingV2AuthoringQuality.service';

const PROJECT_ID = 'demo-prd0048-authoring-security';
const now = '2026-11-06T00:00:00.000Z';
const stored = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const draft = (draftId = 'draft-1', ownerId = 'teacher-1') => stored(createReadingV2Repository().createDraft({
  draftId: readingV2Ids.draftId(draftId), ownerId,
  document: READING_V2_CANONICAL_FIXTURES['short-answer'],
  authoringContext: createReadingV2ManualAuthoringContext(), operationId: `create-${draftId}`, now,
}));
const source = (sourceId = 'source-1', ownerId = 'teacher-1'): ReadingV2AuthoringSourceRecord => ({
  kind: 'reading-v2-import-source', schemaVersion: 1, sourceId, ownerId, createdAt: now,
  sourceKind: 'pasted-text', rawText: 'Question 1\nAnswer one',
  lineIndex: [{ lineId: 'line-1', lineNumber: 1, rawText: 'Question 1', normalizedText: 'Question 1' }],
});

let testEnv: RulesTestEnvironment;
const context = (uid: string) => testEnv.authenticatedContext(uid).database();
const repository = (uid: string, role: 'teacher' | 'super_admin' = 'teacher') => {
  const db = context(uid);
  return createFirebaseReadingV2DraftRepository({ actorId: uid, role }, {
    read: async (path) => (await db.ref(path).once('value')).val(),
    set: async (path, value) => { await db.ref(path).set(stored(value)); },
    getAuthenticatedUserId: async () => uid,
  });
};

describe('Reading V2 durable authoring with full Firebase rules', () => {
  beforeAll(async () => {
    if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST) throw new Error('FIREBASE_DATABASE_EMULATOR_HOST is required; this suite must execute real rules.');
    testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID, database: { rules: readFileSync('database.rules.json', 'utf8') } });
  });
  beforeEach(async () => {
    await testEnv.clearDatabase();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.database().ref('users').set({
        'teacher-1': { role: 'teacher' }, 'teacher-2': { role: 'teacher' },
        'admin-1': { role: 'super_admin' }, 'student-1': { role: 'student' },
      });
    });
  });
  afterAll(async () => { await testEnv?.cleanup(); });

  it('persists real teacher/admin drafts and permits exactly one save from a shared revision', async () => {
    const owner = repository('teacher-1');
    const input = draft();
    const created = await owner.createDraft({ ...input, operationId: input.lastOperationId, now });
    expect(created.revision).toBe(1);
    expect(await owner.loadDraft(created.draftId)).toEqual(created);
    await assertSucceeds(context('admin-1').ref('reading_v2/drafts/draft-1').once('value'));
    const results = await Promise.allSettled([owner, repository('teacher-1')].map((client, index) => client.saveDraft({
      draftId: created.draftId, expectedRevision: 1, operationId: `save-${index}`,
      document: { ...created.document, title: `Saved ${index}` }, now,
    })));
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const saved = await owner.loadDraft(created.draftId);
    expect(saved?.revision).toBe(2);
    expect(saved?.document.title).toBe(`Saved ${saved?.lastOperationId.slice(-1)}`);
    const adminSaved = await repository('admin-1', 'super_admin').saveDraft({
      draftId: created.draftId, expectedRevision: 2, operationId: 'admin-save', document: created.document, now,
    });
    expect(adminSaved.ownerId).toBe('teacher-1');
    expect(adminSaved.revision).toBe(3);
  });

  it('denies student/foreign access and owner takeover or deletion at real child, record and ancestor boundaries', async () => {
    const original = draft();
    await assertSucceeds(context('teacher-1').ref('reading_v2/drafts/draft-1').set(original));
    for (const uid of ['student-1', 'teacher-2']) {
      const db = context(uid);
      await assertFails(db.ref('reading_v2/drafts/draft-1').once('value'));
      await assertFails(db.ref('reading_v2/drafts/draft-1/ownerId').set(uid));
      const takeover = { ...original, ownerId: uid, revision: 2, lastOperationId: 'takeover' };
      await assertFails(db.ref('reading_v2/drafts/draft-1').set(takeover));
      await assertFails(db.ref('reading_v2/drafts').update({ 'draft-1': takeover }));
      await assertFails(db.ref('reading_v2').set({ drafts: { 'draft-1': takeover } }));
      await assertFails(db.ref().update({ 'reading_v2/drafts/draft-1': null }));
      await assertFails(db.ref('reading_v2/drafts').remove());
    }
    await assertFails(context('student-1').ref('reading_v2/drafts/student-draft').set(draft('student-draft', 'student-1')));
    for (const uid of ['teacher-1', 'admin-1']) {
      const db = context(uid);
      await assertFails(db.ref('reading_v2/drafts/draft-1/ownerId').set('teacher-2'));
      await assertFails(db.ref('reading_v2/drafts/draft-1').set({ ...original, ownerId: 'teacher-2', revision: 2, lastOperationId: 'transfer' }));
      await assertFails(db.ref('reading_v2/drafts/draft-1').remove());
      await assertFails(db.ref('reading_v2/drafts').set({}));
      await assertFails(db.ref('reading_v2').remove());
    }
    expect(readingV2DraftContentEquals((await context('teacher-1').ref('reading_v2/drafts/draft-1').once('value')).val(), original)).toBe(true);
  });

  it('requires valid draft identity, numeric revision and a new save operation', async () => {
    const db = context('teacher-1');
    const original = draft();
    await assertSucceeds(db.ref('reading_v2/drafts/draft-1').set(original));
    for (const change of [
      { draftId: 'wrong' }, { revision: 1 }, { revision: 2.5 }, { revision: 9007199254740992 },
      { revision: 2, lastOperationId: original.lastOperationId }, { revision: 2, createdAt: 'changed' },
      { revision: 2, document: { ...original.document, schemaVersion: 2 } },
      { revision: 2, workflowOrigin: { mode: 'forged-origin' } },
    ]) await assertFails(db.ref('reading_v2/drafts/draft-1').set({ ...original, lastOperationId: 'next-save', ...change }));
    await assertSucceeds(db.ref('reading_v2/drafts/draft-1').set({ ...original, revision: 2, lastOperationId: 'discard', state: 'discarded' }));
  });

  it('creates private immutable source records and requires an owned acknowledged source on imported drafts', async () => {
    const owner = repository('teacher-1');
    const artifact = source();
    await owner.storeSource(artifact);
    expect(await owner.loadSource('source-1')).toEqual(artifact);
    const original = draft();
    const imported = { ...original, authoringContext: { ...createReadingV2ManualAuthoringContext(), origin: { kind: 'import' as const, sourceId: 'source-1' } } };
    await assertSucceeds(context('teacher-1').ref('reading_v2/drafts/draft-1').set(stored(imported)));
    await assertSucceeds(context('admin-1').ref('reading_v2/provenance/source-1').once('value'));
    await assertSucceeds(context('admin-1').ref('reading_v2/provenance/admin-source').set(source('admin-source', 'teacher-2')));
    for (const uid of ['teacher-1', 'teacher-2', 'student-1', 'admin-1']) {
      const db = context(uid);
      if (uid === 'teacher-2' || uid === 'student-1') await assertFails(db.ref('reading_v2/provenance/source-1').once('value'));
      await assertFails(db.ref('reading_v2/provenance/source-1/ownerId').set(uid));
      await assertFails(db.ref('reading_v2/provenance/source-1').set({ ...artifact, ownerId: uid, rawText: 'changed' }));
      await assertFails(db.ref('reading_v2/provenance').update({ 'source-1': null }));
      await assertFails(db.ref('reading_v2/provenance').set({ 'source-1': { ...artifact, rawText: 'changed' } }));
    }
    await assertFails(context('student-1').ref('reading_v2/provenance/student-source').set(source('student-source', 'student-1')));
    await assertFails(context('teacher-2').ref('reading_v2/drafts/foreign-source').set(stored({ ...imported, draftId: 'foreign-source', ownerId: 'teacher-2' })));
    await assertFails(context('teacher-1').ref('reading_v2/drafts/missing-source').set(stored({ ...imported, draftId: 'missing-source', authoringContext: { ...imported.authoringContext, origin: { kind: 'import', sourceId: 'missing' } } })));
    await assertFails(context('teacher-1').ref('reading_v2/provenance/wrong-source').set(source('different-source')));
  });
});
