import { describe, expect, it } from 'vitest';
import { FirebaseRestListeningAuthoringRepository } from '../src/upload-worker/listening-authoring/repository.ts';
import type { ListeningDraftRecord, PublishDraftTransactionInput } from '../../functions/src/listening-authoring/repository.shared.ts';

const makeDatabase = () => {
  const state: Record<string, any> = {
    listening_authoring: { drafts: { 'draft-1': {
      schemaVersion: 1, recordType: 'draft', draftId: 'draft-1', testId: 'test-1',
      ownerId: 'teacher-1', state: 'active', conflictToken: 1, assetIds: { 'asset-1': true },
      createdAt: 1, createdBy: 'teacher-1', updatedAt: 1, updatedBy: 'teacher-1', lastOperationId: 'save-1',
      document: {
        title: 'IELTS Cambridge 21: Test 1 - Listening', type: 'IELTS', skill: 'Listening',
        duration: 40, difficulty: 'Intermediate', questionCount: 1, isPublic: true,
        isComplete: true, displayMode: 'text', metadata: { description: '', instructions: '', tags: [] },
        audioSections: [{ number: 1, name: 'Part 1', assetId: 'asset-1', audioUrl: 'r2://asset-1', startQuestion: 1, endQuestion: 1 }],
        questions: [{ number: 1, type: 'short-answer', question: 'Name?', answer: 'Alex', sectionNumber: 1, points: 1 }],
        settings: { allowPause: true, showTimer: true, shuffleQuestions: false, showResults: 'immediate', allowReview: true, passingScore: 60, allowReplay: true },
      },
    } satisfies ListeningDraftRecord } },
  };
  const read = (path: string) => path.split('/').filter(Boolean).reduce((value, key) => value?.[key], state) ?? null;
  const write = (path: string, value: any) => {
    const keys = path.split('/');
    const parent = keys.slice(0, -1).reduce((node, key) => node[key] ??= {}, state);
    if (value === null) delete parent[keys.at(-1)!];
    else parent[keys.at(-1)!] = value;
  };
  let failPatch = false;
  let beforePatch: (() => void) | undefined;
  const fetchImpl: typeof fetch = async (input, init) => {
    const path = new URL(String(input)).pathname.replace(/^\//, '').replace(/\.json$/, '');
    if (init?.method === 'PATCH') {
      if (failPatch) return new Response('{}', { status: 503 });
      beforePatch?.();
      beforePatch = undefined;
      for (const [key, value] of Object.entries(JSON.parse(String(init.body)))) write(key, value);
    } else if (init?.method === 'PUT') {
      write(path, JSON.parse(String(init.body)));
    }
    return new Response(JSON.stringify(read(path)), { headers: { etag: '"etag-1"' } });
  };
  const repository = new FirebaseRestListeningAuthoringRepository({
    env: { FIREBASE_DB_URL: 'https://database.example.test' }, fetchImpl,
    getAccessToken: async () => 'test-token',
  });
  const publish: PublishDraftTransactionInput = {
    ownerId: 'teacher-1', draftId: 'draft-1', operationId: 'publish-1', versionId: 'version-1',
    idempotencyKeyHash: 'key-1', requestHash: 'request-1', expectedConflictToken: 1, publishedAt: 1000,
  };
  return { state, read, repository, publish, failNextPatch: () => { failPatch = true; },
    allowPatch: () => { failPatch = false; }, beforeNextPatch: (action: () => void) => { beforePatch = action; } };
};

describe('Listening published material discovery', () => {
  it('publishes a launchable test and its owner/public lobby indexes', async () => {
    const { repository, publish, read } = makeDatabase();
    expect((await repository.publishDraftTransaction(publish)).kind).toBe('published');
    expect(read('tests/test-1')).toMatchObject({ id: 'test-1', versionId: 'version-1', isPublished: true });
    const summary = read('material_catalog/material_summary_indexes/v1/by_owner_family/teacher-1/assessment/test-1');
    expect(summary).toMatchObject({ title: 'IELTS Cambridge 21: Test 1 - Listening', sourceSnapshotVersionId: 'version-1' });
    expect(read('material_catalog/material_summary_indexes/v1/by_visibility_family/public/assessment/test-1')).toEqual(summary);
    expect(summary).not.toHaveProperty('questions');
  });

  it('surfaces projection failure and repairs it on idempotent retry without another version', async () => {
    const db = makeDatabase();
    db.failNextPatch();
    await expect(db.repository.publishDraftTransaction(db.publish)).rejects.toThrow();
    expect(db.read('tests/test-1')).toBeNull();
    db.allowPatch();
    expect((await db.repository.publishDraftTransaction(db.publish)).kind).toBe('replayed');
    expect(db.read('tests/test-1')).toMatchObject({ versionId: 'version-1' });
    expect(Object.keys(db.read('listening_authoring/versions'))).toEqual(['version-1']);
  });

  it('converges to a newer publication when another writer races the projection', async () => {
    const db = makeDatabase();
    db.beforeNextPatch(() => {
      const first = db.read('listening_authoring/versions/version-1');
      db.state.listening_authoring.versions['version-2'] = { ...first, versionId: 'version-2', versionNumber: 2, publishedAt: 2000 };
    });
    await db.repository.publishDraftTransaction(db.publish);
    expect(db.read('tests/test-1')).toMatchObject({ versionId: 'version-2' });
    expect(db.read('material_catalog/material_summary_indexes/v1/by_id/test-1')).toMatchObject({ sourceSnapshotVersionId: 'version-2' });
  });

  it('archives the exposed version and does not resurrect it on publish replay', async () => {
    const db = makeDatabase();
    await db.repository.publishDraftTransaction(db.publish);
    const archived = await db.repository.lifecycleTransaction({
      ownerId: 'teacher-1', operationId: 'archive-1', operationType: 'archive',
      targetId: 'version-1', idempotencyKeyHash: 'archive-key', requestHash: 'archive-request',
      expectedConflictToken: 1, completedAt: 2000,
    });
    expect(archived.kind).toBe('archived');
    await db.repository.publishDraftTransaction(db.publish);
    expect(db.read('tests/test-1')).toMatchObject({ versionId: 'version-1', isPublished: false });
    expect(db.read('material_catalog/material_summary_indexes/v1/by_owner_family/teacher-1/assessment/test-1')).toBeNull();
  });

  it('converges when the same version is archived during its publication projection', async () => {
    const db = makeDatabase();
    db.beforeNextPatch(() => {
      db.state.listening_authoring.versions['version-1'].archive = { state: 'archived', archivedAt: 2000 };
    });
    await db.repository.publishDraftTransaction(db.publish);
    expect(db.read('tests/test-1')).toMatchObject({ isPublished: false });
    expect(db.read('material_catalog/material_summary_indexes/v1/by_visibility_family/public/assessment/test-1')).toBeNull();
  });
});
