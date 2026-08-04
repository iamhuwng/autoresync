import { describe, expect, it } from 'vitest';
import type { BookDeliveryBinding } from '../../src/services/book-delivery/bookDelivery.types.ts';
import type { BookHomeworkManifest } from '../../src/types/homework.types.ts';
import {
  BOOK_HOMEWORK_COMPLETION_ROOT,
  FirebaseRestBookHomeworkCompletionRepository,
  InMemoryBookHomeworkCompletionRepository,
  type BookHomeworkCompletionProjectInput,
} from '../src/upload-worker/book-homework/completion-repository.ts';
import type {
  BookRuntimeAttemptIndexRecord,
  BookRuntimeAttemptRecord,
  BookRuntimeCompletionRecord,
  BookRuntimeResultRecord,
} from '../../src/services/book-activity/activityRuntimeAttempt.types.ts';

const iso = (second: number) => `2026-08-01T00:00:${String(second).padStart(2, '0')}.000Z`;

const binding = (): BookDeliveryBinding => ({
  schemaVersion: 3,
  bindingId: 'delivery-binding-1',
  revision: 1,
  status: 'active',
  recipient: { recipientId: 'student-1', recipientKind: 'student' },
  issuer: { ownerId: 'teacher-1', authorityBoundary: 'book-owner' },
  book: {
    bookId: 'book-1',
    bookMode: 'pdf',
    bookRevision: 1,
    publicationId: 'publication-1',
    publicationRevision: 1,
    publicationStatus: 'published',
  },
  scope: { kind: 'placements', nodeKeys: ['unit-1'], placementIds: ['placement-1', 'placement-2'] },
  outline: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1 }],
  context: {
    contextId: 'homework-1',
    recipientId: 'student-1',
    ownerId: 'teacher-1',
    kind: 'homework',
    entitlementBasis: 'assignment',
  },
  sourceSet: {
    strategy: 'full_pdf',
    sources: [{
      sourceKey: 'source-1',
      sourceVersionId: 'source-v1',
      lifecycle: 'verified-usable',
      localPageScope: { kind: 'pages', pages: [1, 2] },
    }],
  },
  placements: [1, 2].map((number) => ({
    placementId: `placement-${number}`,
    activityId: `activity-${number}`,
    activityVersionId: `activity-version-${number}`,
    activityVersion: 1,
    nodeKey: 'unit-1',
    order: number,
    contextMode: 'required' as const,
    pageGroupKeys: [`page-group-${number}`],
    sourcePageScopes: [{ sourceKey: 'source-1', pages: [number] }],
  })),
  schedulePolicy: { policyId: 'policy-1', policyRevision: 1, basis: 'immutable-reference' },
  createdAt: iso(0),
});

const manifest = (): BookHomeworkManifest => ({
  schemaVersion: 1,
  assignmentKind: 'book_activity_bundle',
  manifestVersionId: 'manifest-1',
  ownerId: 'teacher-1',
  createdByCommandId: 'create-1',
  createdAt: iso(0),
  bindingRevision: 1,
  book: binding().book,
  context: {
    contextId: 'homework-1',
    recipientId: 'student-1',
    kind: 'homework',
    entitlementBasis: 'assignment',
  },
  selectedTarget: { kind: 'unit', bookId: 'book-1', nodeKey: 'unit-1' },
  outline: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1 }],
  scheduleRules: [{ nodeKey: 'unit-1', dueAt: iso(59) }],
  bindings: [1, 2].map((number) => ({
    bindingId: `activity-binding-${number}`,
    placementId: `placement-${number}`,
    activityId: `activity-${number}`,
    nodeKey: 'unit-1',
    order: number,
    contextMode: 'required' as const,
    pageGroupKeys: [`page-group-${number}`],
    sourceReadiness: 'ready' as const,
    state: 'required' as const,
    activityVersion: 1,
    activityVersionId: `activity-version-${number}`,
    sourceContext: [{ sourceKey: 'source-1', sourceVersionId: 'source-v1', physicalPageNumbers: [number] }],
  })),
  completion: {
    aggregation: 'required-activities-submitted-over-required-activities',
    requiredBindingCount: 2,
    excludedBindingCount: 0,
    legacyScoreFields: 'untouched',
  },
});

const terminal = (
  number: number,
  status: 'pending_review' | 'submitted' = 'pending_review',
  attemptNumber = 1,
):
  BookHomeworkCompletionProjectInput['terminal'] => {
  const attemptId = `attempt-${number}${attemptNumber === 1 ? '' : `-${attemptNumber}`}`;
  const base = {
    schemaVersion: 1 as const,
    attemptId,
    bindingId: 'delivery-binding-1',
    bindingRevision: 1,
    recipientId: 'student-1',
    contextId: 'homework-1',
    placementId: `placement-${number}`,
    activityId: `activity-${number}`,
    activityVersion: 1,
    activityVersionId: `activity-version-${number}`,
    interactionId: `interaction-${number}`,
    submissionScope: 'activity' as const,
    requiredInteractionIds: [`interaction-${number}`],
    submittedInteractionIds: [`interaction-${number}`],
    acknowledgedDraftRevision: 1,
    attemptNumber,
    pageGroupKeys: [`page-group-${number}`],
    sourceProvenance: [{ sourceKey: 'source-1', sourceVersionId: 'source-v1', pages: [number] }],
    createdByOperationId: `operation-${number}-${attemptNumber}`,
    createdAt: iso(number),
  } as const;
  const resultId = `${attemptId}:result`;
  const attempt: BookRuntimeAttemptRecord = {
    ...base,
    response: { answer: `secret-${number}` },
    feedbackRelease: 'pending',
  };
  const result: BookRuntimeResultRecord = {
    ...base,
    resultId,
    attemptId,
    feedbackRelease: 'pending',
    status,
    ...(status === 'submitted' ? {
      score: { status: 'scored' as const, earnedScore: 1, maximumScore: 1, displayScore: '1 / 1' },
    } : {}),
  };
  const completion: BookRuntimeCompletionRecord = {
    ...base,
    completionId: `${attemptId}:completion`,
    attemptId,
    resultId,
    status: 'completed',
  };
  const index: BookRuntimeAttemptIndexRecord = { ...base, resultId, attemptId };
  return { attempt, result, completion, index };
};

const input = (number: number, overrides: Partial<BookHomeworkCompletionProjectInput> = {}): BookHomeworkCompletionProjectInput => ({
  authority: { assignmentId: 'homework-1', manifest: manifest() },
  binding: binding(),
  terminal: terminal(number),
  now: iso(number),
  ...overrides,
});

describe('Ticket 88 context-scoped Book Homework completion repository', () => {
  it('dedupes terminal replay, keeps pending review distinct, and returns immutable readback', async () => {
    const repository = new InMemoryBookHomeworkCompletionRepository();
    const first = await repository.project(input(1));
    const replay = await repository.project(input(1, { now: iso(55) }));

    expect(first.status).toBe('accepted');
    expect(first.projection).toMatchObject({
      completion: { requiredCount: 2, submittedCount: 1, status: 'in_progress' },
      grading: { pendingReviewCount: 1, scoredCount: 0 },
    });
    expect(replay.status).toBe('replayed');
    expect(replay.projection).toEqual(first.projection);
    expect((replay.fact as Record<string, unknown>).response).toBeUndefined();
    const readback = await repository.readProjection({ recipientId: 'student-1', contextId: 'homework-1' });
    expect(readback).toEqual(first.projection);
    const snapshot = repository.snapshot();
    expect(Object.keys(snapshot.scopes?.['student-1/homework-1']?.facts ?? {})).toEqual(['attempt-1:completion']);
  });

  it('merges concurrent different submissions and completes all required activities', async () => {
    const repository = new InMemoryBookHomeworkCompletionRepository();
    const [first, second] = await Promise.all([repository.project(input(1)), repository.project(input(2, {
      terminal: terminal(2, 'submitted'),
    }))]);

    expect(first.status).toBe('accepted');
    expect(second.status).toBe('accepted');
    expect((await repository.readProjection('student-1', 'homework-1'))).toMatchObject({
      completion: { requiredCount: 2, submittedCount: 2, status: 'completed' },
      grading: { pendingReviewCount: 1, scoredCount: 1 },
    });
  });

  it('compacts repeated attempts per Activity without exhausting completion history', async () => {
    const repository = new InMemoryBookHomeworkCompletionRepository();
    for (let attemptNumber = 1; attemptNumber <= 50; attemptNumber += 1) {
      await repository.project(input(1, {
        terminal: terminal(1, 'pending_review', attemptNumber),
      }));
    }

    const scope = repository.snapshot().scopes?.['student-1/homework-1'];
    expect(Object.keys(scope?.facts ?? {})).toEqual(['attempt-1-50:completion']);
    expect(scope?.projection).toMatchObject({
      completion: { requiredCount: 2, submittedCount: 1, status: 'in_progress' },
      grading: { pendingReviewCount: 1 },
    });

    const oldReplay = await repository.project(input(1, {
      terminal: terminal(1, 'pending_review', 1),
    }));
    expect(oldReplay.status).toBe('replayed');
    expect(Object.keys(repository.snapshot().scopes?.['student-1/homework-1']?.facts ?? {}))
      .toEqual(['attempt-1-50:completion']);
  });

  it('retains removed/excluded terminal rows outside current completion', async () => {
    const repository = new InMemoryBookHomeworkCompletionRepository();
    await repository.project(input(1));
    await repository.project(input(2, { terminal: terminal(2, 'submitted') }));
    const current = manifest();
    const changedManifest: BookHomeworkManifest = {
      ...current,
      manifestVersionId: 'manifest-2',
      bindings: current.bindings.map((entry) => entry.placementId === 'placement-2'
        ? {
          bindingId: entry.bindingId,
          placementId: entry.placementId,
          activityId: entry.activityId,
          nodeKey: entry.nodeKey,
          order: entry.order,
          contextMode: entry.contextMode,
          pageGroupKeys: [],
          sourceReadiness: 'unavailable' as const,
          state: 'excluded' as const,
          exclusionReason: 'unsupported-activity' as const,
        }
        : entry),
      completion: {
        ...current.completion,
        requiredBindingCount: 1,
        excludedBindingCount: 1,
      },
    };
    const recalculated = await repository.project(input(1, {
      authority: { assignmentId: 'homework-1', manifest: changedManifest },
    }));
    expect(recalculated.projection.completion).toMatchObject({
      requiredCount: 1,
      submittedCount: 1,
      status: 'completed',
    });
    expect(recalculated.projection.excludedHistoricalRows).toEqual([
      expect.objectContaining({ reason: 'excluded-binding', placementId: 'placement-2' }),
    ]);
  });

  it('reprojects persisted facts when required bindings are removed and added', async () => {
    const repository = new InMemoryBookHomeworkCompletionRepository();
    await repository.project(input(1));
    await repository.project(input(2, { terminal: terminal(2, 'submitted') }));
    const before = repository.snapshot().scopes?.['student-1/homework-1']?.facts;
    const current = manifest();
    const nextManifest: BookHomeworkManifest = {
      ...current,
      manifestVersionId: 'manifest-3',
      bindings: [
        {
          bindingId: 'activity-binding-1',
          placementId: 'placement-1',
          activityId: 'activity-1',
          nodeKey: 'unit-1',
          order: 1,
          contextMode: 'required',
          pageGroupKeys: [],
          sourceReadiness: 'unavailable',
          state: 'excluded',
          exclusionReason: 'unsupported-activity',
        },
        {
          bindingId: 'activity-binding-3',
          placementId: 'placement-3',
          activityId: 'activity-3',
          nodeKey: 'unit-1',
          order: 3,
          contextMode: 'required',
          pageGroupKeys: ['page-group-3'],
          sourceReadiness: 'ready',
          state: 'required',
          activityVersion: 1,
          activityVersionId: 'activity-version-3',
          sourceContext: [{ sourceKey: 'source-1', sourceVersionId: 'source-v1', physicalPageNumbers: [1] }],
        },
      ],
      completion: {
        ...current.completion,
        requiredBindingCount: 1,
        excludedBindingCount: 1,
      },
    };
    const nextBinding: BookDeliveryBinding = {
      ...binding(),
      scope: { ...binding().scope, placementIds: ['placement-1', 'placement-3'] },
      placements: [
        binding().placements[0]!,
        {
          ...binding().placements[1]!,
          placementId: 'placement-3',
          activityId: 'activity-3',
          activityVersionId: 'activity-version-3',
          order: 3,
          pageGroupKeys: ['page-group-3'],
          sourcePageScopes: [{ sourceKey: 'source-1', pages: [1] }],
        },
      ],
    };
    const currentProjection = await repository.resolveCurrentProjection({
      authority: { assignmentId: 'homework-1', manifest: nextManifest },
      binding: nextBinding,
    });
    expect(currentProjection.completion).toEqual({
      requiredCount: 1,
      submittedCount: 0,
      status: 'not_started',
      isComplete: false,
    });
    expect(repository.snapshot().scopes?.['student-1/homework-1']?.facts).toEqual(before);

    const result = await repository.reproject({
      authority: { assignmentId: 'homework-1', manifest: nextManifest },
      binding: nextBinding,
    });

    expect(result.status).toBe('reprojected');
    expect(result.projection.completion).toEqual({
      requiredCount: 1,
      submittedCount: 0,
      status: 'not_started',
      isComplete: false,
    });
    expect(result.projection.excludedHistoricalRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: 'excluded-binding', placementId: 'placement-1' }),
      expect.objectContaining({ reason: 'removed-binding', placementId: 'placement-2' }),
    ]));
    expect(repository.snapshot().scopes?.['student-1/homework-1']?.facts).toEqual(before);
  });

  it('fails closed for context and pinned-version mismatches', async () => {
    const repository = new InMemoryBookHomeworkCompletionRepository();
    await expect(repository.project(input(1, {
      authority: { assignmentId: 'other-homework', manifest: manifest() },
    }))).rejects.toMatchObject({ code: 'homework_completion_assignment_context_mismatch' });
    await expect(repository.project(input(1, {
      binding: { ...binding(), context: { ...binding().context, contextId: 'other-homework' } },
    }))).rejects.toMatchObject({ code: 'homework_completion_manifest_context_mismatch' });
    const mismatch = terminal(1);
    await expect(repository.project(input(1, {
      terminal: {
        ...mismatch!,
        attempt: { ...mismatch!.attempt, activityVersion: 2 },
      },
    }))).rejects.toMatchObject({ code: 'homework_completion_terminal_sequence_invalid' });
    await expect(repository.project(input(1, {
      terminal: {
        ...mismatch!,
        result: {
          ...mismatch!.result,
          score: { status: 'scored', earnedScore: 1, maximumScore: 1, displayScore: '1 / 1' },
        },
      },
    }))).rejects.toMatchObject({ code: 'homework_completion_result_grading_mismatch' });
  });

  it('uses the saga root as canonical context for recipient child authority records', async () => {
    const repository = new InMemoryBookHomeworkCompletionRepository();
    const result = await repository.project(input(1, {
      authority: {
        assignmentId: 'homework-1--student-1--authority',
        saga: { sagaId: 'homework-1' },
        bookManifest: manifest(),
      } as never,
    }));
    expect(result.projection).toMatchObject({
      contextId: 'homework-1',
      recipientId: 'student-1',
      completion: { submittedCount: 1 },
    });
  });

  it('uses the protected book_runtime/homework_completion path and CAS readback', async () => {
    let value: unknown = null;
    let etag = '0';
    const calls: string[] = [];
    const repository = new FirebaseRestBookHomeworkCompletionRepository({
      env: {
        FIREBASE_DB_URL: 'https://database.example.test',
        BOOK_RUNTIME_SERVICE_IDENTITY: 'runtime@example.test',
      },
      getAccessToken: async () => 'token',
      fetchImpl: async (request, init) => {
        const url = String(request);
        calls.push(`${init?.method ?? 'GET'}:${url}`);
        if (init?.method === 'PUT') {
          if (init.headers && String((init.headers as Record<string, string>)['if-match']) !== etag) {
            return new Response('', { status: 412 });
          }
          value = JSON.parse(String(init.body));
          etag = String(Number(etag) + 1);
          return new Response('', { status: 200 });
        }
        return new Response(JSON.stringify(value), { status: 200, headers: { etag } });
      },
    });
    await repository.project(input(1));
    await expect(repository.readProjection('student-1', 'homework-1')).resolves.toMatchObject({
      completion: { submittedCount: 1 },
    });
    const writesBeforeRead = calls.filter((call) => call.startsWith('PUT:')).length;
    await expect(repository.resolveCurrentProjection({
      authority: { assignmentId: 'homework-1', manifest: manifest() },
      binding: binding(),
    })).resolves.toMatchObject({ completion: { submittedCount: 1 } });
    expect(calls.filter((call) => call.startsWith('PUT:'))).toHaveLength(writesBeforeRead);
    expect(calls.some((call) => call.includes(`${BOOK_HOMEWORK_COMPLETION_ROOT}/student-1/homework-1.json`))).toBe(true);
  });
});
