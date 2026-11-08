import { describe, expect, it } from 'vitest';
import { readingV2Ids } from '../../types/readingV2.types';
import type { ReadingV2AuthoringContext, ReadingV2AuthoringSourceRecord } from './readingV2AuthoringQuality.service';
import { READING_V2_CANONICAL_FIXTURES } from './fixtures/readingV2CanonicalFixtures';
import {
  createFirebaseReadingV2DraftRepository,
  type ReadingV2DraftFirebaseTransport,
} from './readingV2DraftFirebaseRepository.service';

const document = () => structuredClone(READING_V2_CANONICAL_FIXTURES['sentence-completion']);

const makeTransport = () => {
  const values = new Map<string, unknown>();
  let failAfterSet = false;
  const transport: ReadingV2DraftFirebaseTransport = {
    getAuthenticatedUserId: async () => 'teacher-1',
    read: async (path) => structuredClone(values.get(path) ?? null),
    set: async (path, value) => {
      const current = values.get(path) as { revision?: number } | undefined;
      const proposed = value as { revision?: number };
      if (current && (!path.includes('/drafts/') || proposed.revision !== Number(current.revision) + 1)) {
        throw new Error('permission denied');
      }
      values.set(path, structuredClone(value));
      if (failAfterSet) {
        failAfterSet = false;
        throw new Error('ack timeout');
      }
    },
  };
  return { transport, values, failNextSet: () => { failAfterSet = true; } };
};

describe('readingV2DraftFirebaseRepository.service', () => {
  it('persists numeric revisions and restores metadata/context after reload', async () => {
    const { transport } = makeTransport();
    const repository = createFirebaseReadingV2DraftRepository(
      { actorId: 'teacher-1', role: 'teacher' },
      transport,
    );
    const draftId = readingV2Ids.draftId('durable');
    const context: ReadingV2AuthoringContext = {
      origin: { kind: 'manual' }, scope: { kind: 'supplied', requirementIds: [] },
      requirements: [], interpretations: [], unboundTargets: [],
    };
    const created = await repository.createDraft({
      draftId,
      ownerId: 'teacher-1',
      document: document(),
      operationId: 'create-operation',
      studioMetadata: { title: 'Saved metadata' },
      authoringContext: context,
      workflowOrigin: { mode: 'revise-published', sourceMaterialId: 'material-1', sourceSnapshotVersionId: 'version-1' },
    });
    const saved = await repository.saveDraft({
      draftId,
      expectedRevision: created.revision,
      operationId: 'save-operation',
      document: { ...created.document, title: 'Edited' },
      studioMetadata: { title: 'Edited metadata' },
      authoringContext: { ...context, scope: { kind: 'selected', requirementIds: [] } },
    });

    expect(saved.revision).toBe(2);
    expect(saved.lastOperationId).toBe('save-operation');
    expect((await repository.loadDraft(draftId))?.studioMetadata).toEqual({ title: 'Edited metadata' });
    expect((await repository.loadDraft(draftId))?.authoringContext?.scope.kind).toBe('selected');
    expect((await repository.loadDraft(draftId))?.workflowOrigin).toEqual(created.workflowOrigin);
  });

  it('accepts a save whose acknowledgement is lost only after exact readback', async () => {
    const { transport, failNextSet } = makeTransport();
    const repository = createFirebaseReadingV2DraftRepository(
      { actorId: 'teacher-1', role: 'teacher' },
      transport,
    );
    const draftId = readingV2Ids.draftId('readback');
    const created = await repository.createDraft({
      draftId,
      ownerId: 'teacher-1',
      document: document(),
      operationId: 'create-operation',
    });
    failNextSet();
    const saved = await repository.saveDraft({
      draftId,
      expectedRevision: created.revision,
      operationId: 'save-operation',
      document: created.document,
    });

    expect(saved.revision).toBe(2);
    expect(saved.lastOperationId).toBe('save-operation');
  });

  it('does not let a repeated operation id acknowledge changed content', async () => {
    const { transport } = makeTransport();
    const repository = createFirebaseReadingV2DraftRepository(
      { actorId: 'teacher-1', role: 'teacher' },
      transport,
    );
    const created = await repository.createDraft({
      draftId: readingV2Ids.draftId('operation'),
      ownerId: 'teacher-1',
      document: document(),
      operationId: 'create-operation',
    });
    const saved = await repository.saveDraft({
      draftId: created.draftId,
      expectedRevision: created.revision,
      operationId: 'save-operation',
      document: created.document,
    });

    await expect(repository.saveDraft({
      draftId: created.draftId,
      expectedRevision: created.revision,
      operationId: saved.lastOperationId,
      document: { ...created.document, title: 'Changed after acknowledgement' },
    })).rejects.toThrow(/reused/);
  });

  it('rejects a competing stale write and retains the complete winning content', async () => {
    const { transport } = makeTransport();
    const first = createFirebaseReadingV2DraftRepository({ actorId: 'teacher-1', role: 'teacher' }, transport);
    const second = createFirebaseReadingV2DraftRepository({ actorId: 'teacher-1', role: 'teacher' }, transport);
    const created = await first.createDraft({
      draftId: readingV2Ids.draftId('competing'), ownerId: 'teacher-1',
      document: document(), operationId: 'create-operation',
    });
    const outcomes = await Promise.allSettled([first.saveDraft({
      draftId: created.draftId, expectedRevision: 1, operationId: 'first-operation',
      document: { ...created.document, title: 'First edit' }, studioMetadata: { title: 'First metadata' },
    }), second.saveDraft({
      draftId: created.draftId, expectedRevision: 1, operationId: 'second-operation',
      document: { ...created.document, title: 'Second edit' }, studioMetadata: { title: 'Second metadata' },
    })]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.find((outcome) => outcome.status === 'rejected');
    expect(rejected?.status === 'rejected' && rejected.reason.payload.currentRevision).toBe(2);
    expect((await first.loadDraft(created.draftId))?.studioMetadata).toEqual({ title: 'First metadata' });
  });

  it('stores an immutable source once and requires owned sources for every requirement', async () => {
    const { transport, values } = makeTransport();
    let sourceWrites = 0;
    const countingTransport = { ...transport, set: async (path: string, value: unknown) => {
      if (path.includes('/provenance/')) sourceWrites += 1;
      await transport.set(path, value);
    } };
    const repository = createFirebaseReadingV2DraftRepository({ actorId: 'teacher-1', role: 'teacher' }, countingTransport);
    const source: ReadingV2AuthoringSourceRecord = {
      kind: 'reading-v2-import-source', schemaVersion: 1, sourceId: 'attempt-1', ownerId: 'teacher-1',
      createdAt: '2026-11-06T00:00:00.000Z', sourceKind: 'pasted-text', rawText: 'Original evidence', lineIndex: [],
    };
    await repository.storeSource(source);
    await repository.storeSource(source);
    await expect(repository.storeSource({ ...source, rawText: 'Changed evidence' })).rejects.toThrow(/immutable/);
    expect(sourceWrites).toBe(1);
    const context: ReadingV2AuthoringContext = {
      origin: { kind: 'published', materialId: 'material-1', snapshotVersionId: 'version-1' },
      scope: { kind: 'selected', requirementIds: ['requirement-1'] },
      requirements: [{ requirementId: 'requirement-1', kind: 'question', sourceId: source.sourceId, lineIds: [] }],
      interpretations: [], unboundTargets: [],
    };
    const created = await repository.createDraft({
      draftId: readingV2Ids.draftId('source'), ownerId: 'teacher-1', document: document(),
      operationId: 'create-operation', authoringContext: context,
    });
    expect((await repository.loadDraft(created.draftId))?.authoringContext).toEqual(context);
    const storedDraft = Array.from(values.entries()).find(([path]) => path.includes('/drafts/'))?.[1];
    expect(storedDraft).not.toHaveProperty('rawText');
    await expect(repository.saveDraft({
      draftId: created.draftId, expectedRevision: 1, operationId: 'missing-source-operation', document: created.document,
      authoringContext: { ...context, requirements: [{ ...context.requirements[0], sourceId: 'missing' }] },
    })).rejects.toThrow(/owned immutable source/);
  });

  it('preserves caller edits when an uncommitted save fails and rejects a changed auth session', async () => {
    const { transport } = makeTransport();
    let sessionId: string | null = 'teacher-1';
    let rejectWrites = false;
    const repository = createFirebaseReadingV2DraftRepository({ actorId: 'teacher-1', role: 'teacher' }, {
      ...transport, getAuthenticatedUserId: async () => sessionId,
      set: async (path, value) => {
        if (rejectWrites) throw new Error('offline');
        await transport.set(path, value);
      },
    });
    const created = await repository.createDraft({
      draftId: readingV2Ids.draftId('failure'), ownerId: 'teacher-1', document: document(), operationId: 'create-operation',
    });
    const local = { ...created.document, title: 'Unsaved local edit' };
    rejectWrites = true;
    await expect(repository.saveDraft({
      draftId: created.draftId, expectedRevision: 1, operationId: 'save-operation', document: local,
    })).rejects.toThrow('offline');
    expect(local.title).toBe('Unsaved local edit');
    expect((await repository.loadDraft(created.draftId))?.document.title).toBe(created.document.title);
    sessionId = 'teacher-2';
    await expect(repository.loadDraft(created.draftId)).rejects.toThrow(/authenticated teacher session/);
  });

  it('keeps source requirements through ordinary imported-draft saves', async () => {
    const { transport } = makeTransport();
    const repository = createFirebaseReadingV2DraftRepository({ actorId: 'teacher-1', role: 'teacher' }, transport);
    await repository.storeSource({
      kind: 'reading-v2-import-source', schemaVersion: 1, sourceId: 'imported-source', ownerId: 'teacher-1',
      createdAt: '2026-11-08T00:00:00Z', sourceKind: 'pasted-text', rawText: '1 Question', lineIndex: [],
    });
    const context: ReadingV2AuthoringContext = {
      origin: { kind: 'import', sourceId: 'imported-source' }, scope: { kind: 'supplied', requirementIds: ['q1'] },
      requirements: [{ requirementId: 'q1', sourceId: 'imported-source', kind: 'question', lineIds: [] }], interpretations: [], unboundTargets: [],
    };
    const created = await repository.createDraft({ draftId: readingV2Ids.draftId('source-preservation'), ownerId: 'teacher-1',
      document: document(), operationId: 'create', authoringContext: context });
    await expect(repository.saveDraft({ draftId: created.draftId, expectedRevision: created.revision, operationId: 'strip',
      document: created.document, authoringContext: { ...context, requirements: [] } })).rejects.toThrow(/Keep the imported source/);
    const saved = await repository.saveDraft({ draftId: created.draftId, expectedRevision: created.revision, operationId: 'edit',
      document: { ...created.document, title: 'Retained work' } });
    expect(saved.authoringContext).toEqual(context);
    expect((await repository.loadDraft(created.draftId))?.document.title).toBe('Retained work');
  });
});
