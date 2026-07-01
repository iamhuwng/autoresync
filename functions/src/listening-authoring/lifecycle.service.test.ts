import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ListeningAuthoringDocumentV1 } from './contracts';
import {
  createInMemoryListeningAuthoringRepository,
  type InMemoryListeningAuthoringRepository,
} from './repository';
import {
  mutateListeningAuthoringLifecycleCore,
  publishListeningDraftCore,
  saveListeningDraftCore,
  type SaveListeningDraftCoreResult,
} from './service';

const auth = { uid: 'teacher-1', role: 'teacher' as const };

const completeDocument: ListeningAuthoringDocumentV1 = {
  title: 'Lifecycle',
  type: 'IELTS',
  skill: 'Listening',
  duration: 1800,
  difficulty: 'Intermediate',
  questionCount: 1,
  isPublic: false,
  isComplete: true,
  displayMode: 'text',
  metadata: {
    description: 'Lifecycle proof',
    instructions: 'Answer every question.',
    tags: [],
  },
  audioSections: [{
    number: 1,
    name: 'Section 1',
    assetId: 'asset-1',
    audioUrl: 'r2://asset-1',
    startQuestion: 1,
    endQuestion: 1,
  }],
  questions: [{
    number: 1,
    type: 'short-answer',
    question: 'Question 1',
    answer: 'A',
    sectionNumber: 1,
    points: 1,
  }],
  settings: {
    allowPause: true,
    showTimer: true,
    shuffleQuestions: false,
    showResults: 'after-submission',
    allowReview: true,
    passingScore: 60,
    allowReplay: true,
  },
};

const draftOnlyDocument: ListeningAuthoringDocumentV1 = {
  ...completeDocument,
  audioSections: [],
  questions: [],
};

const createNow = (...values: number[]): (() => number) => {
  let index = 0;
  const last = values[values.length - 1] ?? 0;
  return () => {
    const current = values[index] ?? last;
    index += 1;
    return current;
  };
};

type SavedDraftResult = Extract<SaveListeningDraftCoreResult, { status: 'saved' }>;

const saveDraft = async (
  repo: InMemoryListeningAuthoringRepository,
  document: ListeningAuthoringDocumentV1 = draftOnlyDocument,
): Promise<SavedDraftResult> => {
  const result = await saveListeningDraftCore({
    auth,
    body: { idempotencyKey: 'save', document },
    repo,
    idempotencySecret: 'secret',
  });
  if (result.status !== 'saved') {
    throw new Error(`expected saved draft, got ${result.status}`);
  }

  return result;
};

afterEach(() => {
  vi.useRealTimers();
});

describe('mutateListeningAuthoringLifecycleCore', () => {
  it('soft-deletes and restores the same draft through trusted idempotent operations', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    const repo = createInMemoryListeningAuthoringRepository({
      now: createNow(
        1_700_000_000_000,
        1_700_000_000_500,
        1_700_000_001_000,
      ),
    });
    const saved = await saveDraft(repo);

    const deleted = await mutateListeningAuthoringLifecycleCore({
      auth,
      body: {
        operation: 'soft-delete',
        targetId: saved.draftId,
        expectedConflictToken: saved.conflictToken,
        idempotencyKey: 'delete',
        reasonCode: 'teacher-request',
      },
      repo,
      idempotencySecret: 'secret',
    });
    const deleteRetry = await mutateListeningAuthoringLifecycleCore({
      auth,
      body: {
        operation: 'soft-delete',
        targetId: saved.draftId,
        expectedConflictToken: saved.conflictToken,
        idempotencyKey: 'delete',
        reasonCode: 'teacher-request',
      },
      repo,
      idempotencySecret: 'secret',
    });
    const restored = await mutateListeningAuthoringLifecycleCore({
      auth,
      body: {
        operation: 'restore',
        targetId: saved.draftId,
        expectedConflictToken: 2,
        idempotencyKey: 'restore',
      },
      repo,
      idempotencySecret: 'secret',
    });

    expect(deleteRetry).toEqual(deleted);
    expect(deleted).toEqual({
      status: 'soft-deleted',
      draftId: saved.draftId,
      conflictToken: 2,
    });
    expect(restored).toEqual({
      status: 'restored',
      draftId: saved.draftId,
      conflictToken: 3,
    });
    expect(await repo.getDraft(saved.draftId)).toEqual(expect.objectContaining({
      state: 'active',
      conflictToken: 3,
      softDelete: expect.objectContaining({
        deletedAt: 1_700_000_000_000,
        deletedBy: 'teacher-1',
        reasonCode: 'teacher-request',
        priorConflictToken: 1,
        restoredAt: 1_700_000_000_000,
        restoredBy: 'teacher-1',
        restoreCount: 1,
      }),
    }));
  });

  it('returns recoverable conflict and idempotency conflict without changing draft state', async () => {
    const repo = createInMemoryListeningAuthoringRepository({
      now: createNow(1_700_000_000_000),
    });
    const saved = await saveDraft(repo);

    const stale = await mutateListeningAuthoringLifecycleCore({
      auth,
      body: {
        operation: 'soft-delete',
        targetId: saved.draftId,
        expectedConflictToken: 2,
        idempotencyKey: 'delete',
      },
      repo,
      idempotencySecret: 'secret',
    });
    const changed = await mutateListeningAuthoringLifecycleCore({
      auth,
      body: {
        operation: 'soft-delete',
        targetId: saved.draftId,
        expectedConflictToken: saved.conflictToken,
        idempotencyKey: 'delete',
      },
      repo,
      idempotencySecret: 'secret',
    });

    expect(stale).toEqual({
      status: 'conflict',
      recoverable: true,
      targetId: saved.draftId,
      expectedConflictToken: 2,
      currentConflictToken: 1,
    });
    expect(changed).toEqual({
      status: 'idempotency-conflict',
      recoverable: false,
      targetId: saved.draftId,
      operationId: 'operation-2',
    });
    expect(await repo.getDraft(saved.draftId)).toEqual(expect.objectContaining({
      state: 'active',
      conflictToken: 1,
    }));
  });

  it('fails closed for cross-owner lifecycle mutation', async () => {
    const repo = createInMemoryListeningAuthoringRepository({
      now: createNow(1_700_000_000_000),
    });
    const saved = await saveDraft(repo);

    const result = await mutateListeningAuthoringLifecycleCore({
      auth: { uid: 'teacher-2', role: 'teacher' },
      body: {
        operation: 'soft-delete',
        targetId: saved.draftId,
        expectedConflictToken: saved.conflictToken,
        idempotencyKey: 'delete',
      },
      repo,
      idempotencySecret: 'secret',
    });

    expect(result).toEqual({
      status: 'not-found',
      recoverable: false,
      targetId: saved.draftId,
    });
    expect(await repo.getDraft(saved.draftId)).toEqual(expect.objectContaining({
      state: 'active',
      conflictToken: 1,
    }));
  });

  it('archives a published version by metadata only and replays the archive result', async () => {
    const repo = createInMemoryListeningAuthoringRepository({
      now: createNow(1_700_000_000_000, 1_700_000_000_500),
    });
    const saved = await saveDraft(repo, completeDocument);
    const published = await publishListeningDraftCore({
      auth,
      body: {
        draftId: saved.draftId,
        expectedConflictToken: saved.conflictToken,
        idempotencyKey: 'publish',
      },
      repo,
      idempotencySecret: 'secret',
    });
    if (published.status !== 'published') {
      throw new Error(`expected published, got ${published.status}`);
    }
    const before = repo.listVersions()[0]!;

    const archived = await mutateListeningAuthoringLifecycleCore({
      auth,
      body: {
        operation: 'archive',
        targetId: published.versionId,
        expectedConflictToken: published.versionNumber,
        idempotencyKey: 'archive',
        reasonCode: 'teacher-archive',
      },
      repo,
      idempotencySecret: 'secret',
    });
    const replay = await mutateListeningAuthoringLifecycleCore({
      auth,
      body: {
        operation: 'archive',
        targetId: published.versionId,
        expectedConflictToken: published.versionNumber,
        idempotencyKey: 'archive',
        reasonCode: 'teacher-archive',
      },
      repo,
      idempotencySecret: 'secret',
    });

    expect(replay).toEqual(archived);
    expect(archived).toEqual({
      status: 'archived',
      versionId: published.versionId,
      versionNumber: 1,
    });
    expect(repo.listVersions()[0]).toEqual({
      ...before,
      archive: {
        state: 'archived',
        archivedAt: expect.any(Number),
        archivedBy: 'teacher-1',
        reasonCode: 'teacher-archive',
      },
    });
    expect(repo.listVersions()[0]).toEqual(expect.objectContaining({
      versionId: before.versionId,
      versionNumber: before.versionNumber,
      testId: before.testId,
      ownerId: before.ownerId,
      sourceDraftPath: before.sourceDraftPath,
      sourceDraftId: before.sourceDraftId,
      document: before.document,
      assetIds: before.assetIds,
      publishedAt: before.publishedAt,
      publishedBy: before.publishedBy,
      publishOperationId: before.publishOperationId,
      documentHash: before.documentHash,
      compatibility: before.compatibility,
    }));
  });

  it('restores soft-deleted drafts after 30 days until retention governance allows final removal', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    const repo = createInMemoryListeningAuthoringRepository({
      now: createNow(1_700_000_000_000),
    });
    const saved = await saveDraft(repo);
    await mutateListeningAuthoringLifecycleCore({
      auth,
      body: {
        operation: 'soft-delete',
        targetId: saved.draftId,
        expectedConflictToken: saved.conflictToken,
        idempotencyKey: 'delete',
      },
      repo,
      idempotencySecret: 'secret',
    });
    vi.setSystemTime(1_700_000_000_000 + (30 * 24 * 60 * 60 * 1000) + 1);

    const restored = await mutateListeningAuthoringLifecycleCore({
      auth,
      body: {
        operation: 'restore',
        targetId: saved.draftId,
        expectedConflictToken: 2,
        idempotencyKey: 'restore',
      },
      repo,
      idempotencySecret: 'secret',
    });

    expect(restored).toEqual({
      status: 'restored',
      draftId: saved.draftId,
      conflictToken: 3,
    });
    expect(await repo.getDraft(saved.draftId)).toEqual(expect.objectContaining({
      state: 'active',
      conflictToken: 3,
    }));
    expect(repo.listOperationClaims()).toContainEqual(expect.objectContaining({
      operationType: 'restore',
      targetId: saved.draftId,
      status: 'succeeded',
      result: {
        draftId: saved.draftId,
        conflictToken: 3,
      },
    }));
  });

  it('records failed operation evidence when archive is not an allowed state transition', async () => {
    const repo = createInMemoryListeningAuthoringRepository({
      now: createNow(1_700_000_000_000, 1_700_000_000_500),
    });
    const saved = await saveDraft(repo, completeDocument);
    const published = await publishListeningDraftCore({
      auth,
      body: {
        draftId: saved.draftId,
        expectedConflictToken: saved.conflictToken,
        idempotencyKey: 'publish',
      },
      repo,
      idempotencySecret: 'secret',
    });
    if (published.status !== 'published') {
      throw new Error(`expected published, got ${published.status}`);
    }
    await mutateListeningAuthoringLifecycleCore({
      auth,
      body: {
        operation: 'archive',
        targetId: published.versionId,
        expectedConflictToken: published.versionNumber,
        idempotencyKey: 'archive',
      },
      repo,
      idempotencySecret: 'secret',
    });

    const invalid = await mutateListeningAuthoringLifecycleCore({
      auth,
      body: {
        operation: 'archive',
        targetId: published.versionId,
        expectedConflictToken: published.versionNumber,
        idempotencyKey: 'archive-again',
      },
      repo,
      idempotencySecret: 'secret',
    });

    expect(invalid).toEqual({
      status: 'invalid-state',
      recoverable: false,
      targetId: published.versionId,
    });
    expect(repo.listOperationClaims()).toContainEqual(expect.objectContaining({
      operationType: 'archive',
      targetId: published.versionId,
      status: 'failed',
      errorCode: 'invalid-state',
      result: {
        versionId: published.versionId,
        versionNumber: published.versionNumber,
      },
    }));
  });

  it('discard marks a draft soft-deleted without hard deleting it', async () => {
    const repo = createInMemoryListeningAuthoringRepository({
      now: createNow(1_700_000_000_000),
    });
    const saved = await saveDraft(repo);

    const result = await mutateListeningAuthoringLifecycleCore({
      auth,
      body: {
        operation: 'discard',
        targetId: saved.draftId,
        expectedConflictToken: saved.conflictToken,
        idempotencyKey: 'discard',
      },
      repo,
      idempotencySecret: 'secret',
    });

    expect(result).toEqual({
      status: 'discarded',
      draftId: saved.draftId,
      conflictToken: 2,
    });
    expect(await repo.getDraft(saved.draftId)).toEqual(expect.objectContaining({
      state: 'soft-deleted',
      conflictToken: 2,
      softDelete: expect.objectContaining({
        reasonCode: 'discard',
      }),
    }));
  });
});
