import type {
  BookRuntimeAttemptIndexRecord,
  BookRuntimeAttemptRecord,
  BookRuntimeCompletionRecord,
  BookRuntimeResultRecord,
} from '../../../../src/services/book-activity/activityRuntimeAttempt.types.ts';
import type { BookDeliveryBinding } from '../../../../src/services/book-delivery/bookDelivery.types.ts';
import type { BookHomeworkManifest } from '../../../../src/types/homework.types.ts';
import {
  BOOK_HOMEWORK_COMPLETION_ROOT,
  FirebaseRestBookHomeworkCompletionRepository,
  type BookHomeworkCompletionProjectInput,
} from './completion-repository.ts';

const createdAt = (second: number) =>
  `2026-08-01T00:00:${String(second).padStart(2, '0')}.000Z`;

const binding = (): BookDeliveryBinding => ({
  schemaVersion: 3,
  bindingId: 'ticket88-delivery',
  revision: 2,
  status: 'active',
  recipient: { recipientId: 'ticket88-student', recipientKind: 'student' },
  issuer: { ownerId: 'ticket88-teacher', authorityBoundary: 'book-owner' },
  book: {
    bookId: 'ticket88-book',
    bookMode: 'pdf',
    bookRevision: 1,
    publicationId: 'ticket88-publication',
    publicationRevision: 1,
    publicationStatus: 'published',
  },
  scope: {
    kind: 'placements',
    nodeKeys: ['ticket88-unit'],
    placementIds: ['ticket88-placement-1', 'ticket88-placement-2'],
  },
  outline: [{
    nodeKey: 'ticket88-unit',
    parentNodeKey: null,
    nodeType: 'unit',
    order: 1,
  }],
  context: {
    contextId: 'ticket88-homework',
    recipientId: 'ticket88-student',
    ownerId: 'ticket88-teacher',
    kind: 'homework',
    entitlementBasis: 'assignment',
  },
  sourceSet: {
    strategy: 'full_pdf',
    sources: [{
      sourceKey: 'ticket88-source',
      sourceVersionId: 'ticket88-source-v1',
      lifecycle: 'verified-usable',
      localPageScope: { kind: 'pages', pages: [1, 2] },
    }],
  },
  placements: [1, 2].map((number) => ({
    placementId: `ticket88-placement-${number}`,
    activityId: `ticket88-activity-${number}`,
    activityVersionId: `ticket88-activity-${number}-v1`,
    activityVersion: 1,
    nodeKey: 'ticket88-unit',
    order: number,
    contextMode: 'required' as const,
    pageGroupKeys: [`ticket88-page-group-${number}`],
    sourcePageScopes: [{ sourceKey: 'ticket88-source', pages: [number] }],
  })),
  schedulePolicy: {
    policyId: 'ticket88-policy',
    policyRevision: 1,
    basis: 'immutable-reference',
  },
  createdAt: createdAt(0),
});

const manifest = (): BookHomeworkManifest => ({
  schemaVersion: 1,
  assignmentKind: 'book_activity_bundle',
  manifestVersionId: 'ticket88-manifest-1',
  ownerId: 'ticket88-teacher',
  createdByCommandId: 'ticket88-create',
  createdAt: createdAt(0),
  bindingRevision: 2,
  book: binding().book,
  context: {
    contextId: 'ticket88-homework',
    recipientId: 'ticket88-student',
    kind: 'homework',
    entitlementBasis: 'assignment',
  },
  selectedTarget: {
    kind: 'unit',
    bookId: 'ticket88-book',
    nodeKey: 'ticket88-unit',
  },
  outline: binding().outline,
  scheduleRules: [{ nodeKey: 'ticket88-unit', dueAt: createdAt(59) }],
  bindings: [1, 2].map((number) => ({
    bindingId: `ticket88-activity-binding-${number}`,
    placementId: `ticket88-placement-${number}`,
    activityId: `ticket88-activity-${number}`,
    activityVersionId: `ticket88-activity-${number}-v1`,
    activityVersion: 1,
    nodeKey: 'ticket88-unit',
    order: number,
    contextMode: 'required' as const,
    pageGroupKeys: [`ticket88-page-group-${number}`],
    sourceReadiness: 'ready' as const,
    sourceContext: [{
      sourceKey: 'ticket88-source',
      sourceVersionId: 'ticket88-source-v1',
      physicalPageNumbers: [number],
    }],
    state: 'required' as const,
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
  status: 'pending_review' | 'submitted',
): NonNullable<BookHomeworkCompletionProjectInput['terminal']> => {
  const attemptId = `ticket88-attempt-${number}`;
  const resultId = `${attemptId}:result`;
  const base = {
    schemaVersion: 1 as const,
    attemptId,
    bindingId: 'ticket88-delivery',
    bindingRevision: 2,
    recipientId: 'ticket88-student',
    contextId: 'ticket88-homework',
    placementId: `ticket88-placement-${number}`,
    activityId: `ticket88-activity-${number}`,
    activityVersion: 1,
    activityVersionId: `ticket88-activity-${number}-v1`,
    interactionId: `ticket88-interaction-${number}`,
    submissionScope: 'activity',
    requiredInteractionIds: [`ticket88-interaction-${number}`],
    submittedInteractionIds: [`ticket88-interaction-${number}`],
    acknowledgedDraftRevision: 1,
    attemptNumber: 1,
    pageGroupKeys: [`ticket88-page-group-${number}`],
    sourceProvenance: [{
      sourceKey: 'ticket88-source',
      sourceVersionId: 'ticket88-source-v1',
      pages: [number],
    }],
    createdByOperationId: `ticket88-operation-${number}`,
    createdAt: createdAt(number),
  } as const;
  const attempt: BookRuntimeAttemptRecord = {
    ...base,
    response: { answer: 'not-retained-in-aggregate' },
    feedbackRelease: 'pending',
  };
  const result: BookRuntimeResultRecord = {
    ...base,
    resultId,
    feedbackRelease: 'pending',
    status,
    ...(status === 'submitted'
      ? {
        score: {
          status: 'scored' as const,
          earnedScore: 1,
          maximumScore: 1,
          displayScore: '1 / 1',
        },
      }
      : {}),
  };
  const completion: BookRuntimeCompletionRecord = {
    ...base,
    completionId: `${attemptId}:completion`,
    resultId,
    status: 'completed',
  };
  const index: BookRuntimeAttemptIndexRecord = { ...base, resultId };
  return { attempt, result, completion, index };
};

const proof = async () => {
  let storedScope: unknown = null;
  let etag = '0';
  const repositoryCalls: string[] = [];
  const repository = new FirebaseRestBookHomeworkCompletionRepository({
    env: {
      FIREBASE_DB_URL: 'https://ticket88-production-equivalent.invalid',
      BOOK_HOMEWORK_COMPLETION_SERVICE_IDENTITY: 'ticket88-preview@example.invalid',
    },
    getAccessToken: async () => 'ticket88-disposable-preview-token',
    fetchImpl: async (request, init) => {
      const method = init?.method ?? 'GET';
      repositoryCalls.push(`${method}:${String(request)}`);
      if (method === 'PUT') {
        if (new Headers(init.headers).get('if-match') !== etag) {
          return new Response('', { status: 412 });
        }
        storedScope = JSON.parse(String(init.body));
        etag = String(Number(etag) + 1);
        return new Response('', { status: 200 });
      }
      return new Response(JSON.stringify(storedScope), {
        status: 200,
        headers: { etag },
      });
    },
  });
  const authority = { assignmentId: 'ticket88-homework', manifest: manifest() };
  const first = await repository.project({
    authority,
    binding: binding(),
    terminal: terminal(1, 'pending_review'),
  });
  const replay = await repository.project({
    authority,
    binding: binding(),
    terminal: terminal(1, 'pending_review'),
  });
  const second = await repository.project({
    authority,
    binding: binding(),
    terminal: terminal(2, 'submitted'),
  });
  const readback = await repository.readProjection('ticket88-student', 'ticket88-homework');
  const factsBeforeManifestChange = (await repository.readScope(
    'ticket88-student',
    'ticket88-homework',
  ))?.facts ?? {};

  const nextManifest: BookHomeworkManifest = {
    ...manifest(),
    manifestVersionId: 'ticket88-manifest-2',
    bindings: [
      manifest().bindings[0]!,
      {
        ...manifest().bindings[1]!,
        bindingId: 'ticket88-activity-binding-3',
        placementId: 'ticket88-placement-3',
        activityId: 'ticket88-activity-3',
        activityVersionId: 'ticket88-activity-3-v1',
        order: 3,
      },
    ],
  };
  const nextBinding: BookDeliveryBinding = {
    ...binding(),
    scope: {
      ...binding().scope,
      placementIds: ['ticket88-placement-1', 'ticket88-placement-3'],
    },
    placements: [
      binding().placements[0]!,
      {
        ...binding().placements[1]!,
        placementId: 'ticket88-placement-3',
        activityId: 'ticket88-activity-3',
        activityVersionId: 'ticket88-activity-3-v1',
        order: 3,
      },
    ],
  };
  const current = await repository.resolveCurrentProjection({
    authority: { assignmentId: 'ticket88-homework', manifest: nextManifest },
    binding: nextBinding,
  });
  const factsAfterManifestChange = (await repository.readScope(
    'ticket88-student',
    'ticket88-homework',
  ))?.facts ?? {};
  let crossContextCode: string | null = null;
  try {
    await repository.project({
      authority,
      binding: {
        ...binding(),
        context: { ...binding().context, contextId: 'ticket88-other-homework' },
      },
      terminal: terminal(1, 'pending_review'),
    });
  } catch (error) {
    crossContextCode = error && typeof error === 'object' && 'code' in error
      ? String(error.code)
      : 'unknown';
  }

  const pass = first.projection.completion.submittedCount === 1
    && first.projection.grading.pendingReviewCount === 1
    && replay.status === 'replayed'
    && second.projection.completion.isComplete
    && second.projection.grading.pendingReviewCount === 1
    && second.projection.grading.scoredCount === 1
    && Object.keys(factsBeforeManifestChange).length === 2
    && readback?.completion.isComplete === true
    && current.completion.requiredCount === 2
    && current.completion.submittedCount === 1
    && current.excludedHistoricalRows.some((row) => row.reason === 'removed-binding')
    && JSON.stringify(factsBeforeManifestChange) === JSON.stringify(factsAfterManifestChange)
    && crossContextCode === 'homework_completion_manifest_context_mismatch'
    && repositoryCalls.some((call) => call.startsWith(
      `PUT:https://ticket88-production-equivalent.invalid/${BOOK_HOMEWORK_COMPLETION_ROOT}/ticket88-student/ticket88-homework.json`,
    ))
    && repositoryCalls.filter((call) => call.startsWith('PUT:')).length === 2
    && !JSON.stringify(second.projection).match(/percentage|bandScore|aggregateGrade/u);

  return {
    proofKind: 'prd0062-ticket88-production-equivalent',
    pass,
    indexedScope: 'ticket88-student/ticket88-homework',
    productionRepository: {
      kind: 'firebase-rest-cas',
      protectedRoot: BOOK_HOMEWORK_COMPLETION_ROOT,
      conditionalWriteCount: repositoryCalls.filter((call) => call.startsWith('PUT:')).length,
      readCount: repositoryCalls.filter((call) => call.startsWith('GET:')).length,
    },
    first: {
      status: first.status,
      completion: first.projection.completion,
      grading: first.projection.grading,
    },
    duplicate: {
      status: replay.status,
      factCount: Object.keys(factsBeforeManifestChange).length,
    },
    second: {
      status: second.status,
      completion: second.projection.completion,
      grading: second.projection.grading,
      legacyAggregateFieldsPresent: false,
    },
    readback,
    manifestChange: {
      completion: current.completion,
      historicalReasons: current.excludedHistoricalRows.map((row) => row.reason),
      factsPreserved: JSON.stringify(factsBeforeManifestChange) === JSON.stringify(factsAfterManifestChange),
    },
    crossContext: { code: crossContextCode },
  };
};

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'GET' || new URL(request.url).pathname !== '/proof') {
      return new Response(JSON.stringify({
        code: 'ticket88_preview_fail_closed',
        writable: false,
      }), {
        status: 503,
        headers: { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' },
      });
    }
    try {
      const result = await proof();
      return new Response(JSON.stringify(result), {
        status: result.pass ? 200 : 500,
        headers: { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' },
      });
    } catch {
      return new Response(JSON.stringify({ code: 'ticket88_preview_proof_failed' }), {
        status: 500,
        headers: { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' },
      });
    }
  },
} satisfies ExportedHandler;
