import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BookRuntimeAttemptRecord } from '../../src/services/book-activity/activityRuntimeAttempt.types.ts';
import {
  createTrustedBookActivityEvaluationService,
} from '../../src/services/book-activity/activityEvaluation.service.ts';
import type {
  BookActivityEvaluationDependencies,
  BookActivityEvaluationTarget,
} from '../../src/services/book-activity/activityEvaluation.types.ts';
import {
  InMemoryBookActivityEvaluationRepository,
  FirebaseRestBookActivityEvaluationRepository,
} from '../src/upload-worker/book-activity-grading/repository.ts';
import {
  createDefaultBookActivityEvaluationProductionHandlers,
  createBookActivityEvaluationProductionHandlers,
} from '../src/upload-worker/book-activity-grading/production-composition.ts';
import { FirebaseRestBookDeliveryRepository } from '../src/upload-worker/book-delivery/repository.ts';
import { FirebaseRestBookRuntimeRepository } from '../src/upload-worker/book-runtime/repository.ts';
import * as resultComposition from '../src/upload-worker/book-results/production-composition.ts';
import * as firebaseTokens from '../src/upload-worker/book-activity-authoring/firebase-token.ts';
import { createBookRouteHandlers } from '../src/upload-worker/book-route-handlers.ts';
import { createBookRouter } from '../src/upload-worker/book-router.ts';

const target: BookActivityEvaluationTarget = {
  attemptId: 'attempt-1',
  resultId: 'attempt-1:result',
  recipientId: 'student-1',
  bindingId: 'binding-1',
  bindingRevision: 1,
  contextKind: 'homework',
  contextId: 'homework-1',
  placementId: 'placement-1',
  activityId: 'activity-1',
  activityVersion: 1,
  interactionId: 'interaction-1',
  activityVersionId: 'activity-version-1',
  attemptNumber: 1,
  pageGroupKeys: ['page-group-1'],
  sourceProvenance: [{ sourceKey: 'source-1', sourceVersionId: 'source-version-1', pages: [1] }],
};

const attempt: BookRuntimeAttemptRecord = {
  schemaVersion: 1,
  attemptId: target.attemptId,
  bindingId: target.bindingId,
  bindingRevision: target.bindingRevision,
  recipientId: target.recipientId,
  contextId: target.contextId,
  placementId: target.placementId,
  activityId: target.activityId,
  activityVersion: target.activityVersion,
  interactionId: target.interactionId,
  activityVersionId: target.activityVersionId,
  acknowledgedDraftRevision: 1,
  attemptNumber: 1,
  pageGroupKeys: target.pageGroupKeys,
  sourceProvenance: target.sourceProvenance,
  feedbackRelease: 'pending',
  response: { text: 'A complete explanation.' },
  createdByOperationId: 'submit-1',
  createdAt: '2026-08-01T00:00:00.000Z',
  submissionScope: 'activity',
  requiredInteractionIds: [target.interactionId],
  submittedInteractionIds: [target.interactionId],
};

const makeRepository = async () => {
  const repository = new InMemoryBookActivityEvaluationRepository();
  const dependencies: BookActivityEvaluationDependencies = {
    repository,
    trustedScorerIdentity: 'test-scorer',
    now: () => '2026-08-02T00:00:00.000Z',
    resolveAttempt: async () => null,
    resolveTeacherAuthority: async () => null,
  };
  const service = createTrustedBookActivityEvaluationService({
    ...dependencies,
    resolveAttempt: async () => ({
      attempt,
      contextKind: 'homework',
      activity: {
        schemaVersion: 1,
        title: 'Essay',
        taskProfile: null,
        presentationMode: 'structured',
        contextRequirement: { mode: 'required', acceptedKinds: ['pdf-page'] },
        instructions: [{ text: 'Explain.' }],
        stimulus: null,
        assetRefs: [],
        interaction: { family: 'long-response', variant: 'essay' },
        answerRule: { defaultPoints: 2, normalization: 'exact' },
        interactions: [{
          family: 'long-response',
          interactionId: target.interactionId,
          prompt: 'Explain.',
          itemIdentities: { family: 'long-response', itemIds: [] },
          answerKey: { family: 'long-response', rubric: { criteria: ['Relevant'] } },
        }],
        scoring: { mode: 'review-required' },
      },
      submission: [{ interactionId: target.interactionId, answer: 'A complete explanation.' }],
    }),
    resolveTeacherAuthority: async ({ target: requested }) => ({
      ownerId: 'teacher-1',
      recipientId: requested.recipientId,
      bindingId: requested.bindingId,
      bindingRevision: requested.bindingRevision,
      contextKind: requested.contextKind,
      contextId: requested.contextId,
      placementId: requested.placementId,
      activityId: requested.activityId,
      activityVersion: requested.activityVersion,
      activityVersionId: requested.activityVersionId,
    }),
  });
  await service.applyEvaluationCommand({
    schemaVersion: 1,
    scorerVersion: 1,
    operationId: 'grade-1',
    kind: 'teacher_evaluation',
    expectedEvaluationRevision: 0,
    target,
    evaluation: { earnedScore: 1, maximumScore: 2, feedback: 'Good work.' },
  }, { kind: 'teacher', uid: 'teacher-1' });
  return repository;
};

const historyInput = (uid = 'student-1') => ({
  request: new Request(`https://worker.test/book-evaluation/history/book-1/student-1?${new URLSearchParams({
    view: uid === 'student-1' ? 'student' : 'teacher', contextKind: target.contextKind,
    contextId: target.contextId, placementId: target.placementId, activityId: target.activityId,
    activityVersionId: target.activityVersionId, attemptId: target.attemptId,
  })}`),
  env: {},
  uid,
  bookId: 'book-1',
  studentId: 'student-1',
});

describe('Book Activity evaluation production composition', () => {
  afterEach(() => vi.restoreAllMocks());
  it.each(['teacher-1', 'student-1'])('rejects public objective commands for authenticated uid %s before writes', async (uid) => {
    const repository = new InMemoryBookActivityEvaluationRepository();
    const createDependencies = vi.fn(() => ({ repository } as never));
    const resolveActor = vi.fn(async () => ({ kind: 'teacher' as const, uid }));
    const evaluationHandlers = createBookActivityEvaluationProductionHandlers({
      createDependencies,
      resolveActor,
      resolveHistoryAttempt: async () => null,
    });
    const worker = createBookRouter({
      handlers: createBookRouteHandlers({ evaluationHandlers }),
      firebaseVerifier: {
        verifyAuthorizationHeader: async (authorization) => ({
          valid: true,
          uid: authorization?.endsWith('student-token') ? 'student-1' : 'teacher-1',
        }),
      },
    });

    for (const kind of ['evaluate_objective', 'regrade_objective'] as const) {
      const response = await worker.fetch(new Request('https://worker.test/book-evaluation/commands', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${uid === 'student-1' ? 'student-token' : 'teacher-token'}`,
            origin: 'http://localhost:5173',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            actor: { kind: 'trusted_scorer', serviceIdentity: 'forged-scorer' },
            command: { kind, actor: { uid: 'teacher-1' } },
          }),
        }), {
          BOOK_EVALUATION_HISTORY_ROUTES_ENABLED: 'enabled',
          BOOK_ACTIVITY_EVALUATION_SERVICE_IDENTITY: 'test-scorer@example.test',
          BOOK_ACTIVITY_EVALUATION_GOOGLE_SA_KEY: JSON.stringify({ client_email: 'test-scorer@example.test', private_key: 'test-key' }),
          BOOK_ROUTE_RATE_LIMITER: { limit: async () => ({ success: true }) },
        });
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({ code: 'evaluation_trusted_scorer_required' });
    }
    expect(createDependencies).not.toHaveBeenCalled();
    expect(resolveActor).not.toHaveBeenCalled();
    expect(repository.snapshot()).toEqual({ scopes: {} });
  });

  it('withholds every student history field until the shared Results release check succeeds', async () => {
    const repository = await makeRepository();
    const makeHandlers = (feedbackReleased: boolean) => createBookActivityEvaluationProductionHandlers({
      createDependencies: () => ({ repository } as never),
      resolveActor: async () => null,
      resolveHistoryAttempt: async () => ({ target, response: attempt.response, access: { role: 'student', feedbackReleased } }),
    });

    const withheld = await makeHandlers(false).history(historyInput());
    expect(withheld).toMatchObject({ init: { status: 200 }, body: { result: { attemptId: target.attemptId, status: 'hidden' } } });
    expect(JSON.stringify(withheld.body)).not.toMatch(/revision|evaluatedAt|graded|pending_review/u);

    const released = await makeHandlers(true).history(historyInput());
    expect(released).toMatchObject({
      init: { status: 200 },
      body: { result: { status: 'graded', score: { earnedScore: 1, maximumScore: 2 }, feedback: 'Good work.' } },
    });
    expect(released.body).not.toHaveProperty('history');
  });

  it('returns no current evaluation for a successful missing read and 503 for a failed authority read', async () => {
    const repository = new InMemoryBookActivityEvaluationRepository();
    const handlers = createBookActivityEvaluationProductionHandlers({
      createDependencies: () => ({ repository } as never),
      resolveActor: async () => null,
      resolveHistoryAttempt: async () => ({ target, response: attempt.response, access: { role: 'student', feedbackReleased: true } }),
    });
    await expect(handlers.history(historyInput())).resolves.toMatchObject({
      init: { status: 200 }, body: { result: { attemptId: target.attemptId, status: 'pending_review' } },
    });

    const failed = createBookActivityEvaluationProductionHandlers({
      createDependencies: () => { throw new Error('authority read failed'); },
      resolveActor: async () => null,
      resolveHistoryAttempt: async () => { throw new Error('authority read failed'); },
    });
    await expect(failed.history(historyInput())).resolves.toMatchObject({
      init: { status: 503 }, body: { code: 'evaluation_history_read_failed' },
    });
  });

  it('denies direct history when exact current authorization cannot be proven', async () => {
    const repository = await makeRepository();
    const handlers = createBookActivityEvaluationProductionHandlers({
      createDependencies: () => ({ repository } as never),
      resolveActor: async () => null,
      resolveHistoryAttempt: async () => null,
    });
    const result = await handlers.history(historyInput('former-teacher'));
    expect(result).toMatchObject({ init: { status: 403 }, body: { code: 'evaluation_actor_unauthorized' } });
    expect(JSON.stringify(result.body)).not.toMatch(/revision|evaluatedAt|graded|feedback/u);
  });

  it('does not use a revoked historical issuer as current non-Homework history authority', async () => {
    const resolveCurrent = vi.spyOn(FirebaseRestBookDeliveryRepository.prototype, 'resolveCurrent')
      .mockResolvedValue(null);
    const readBinding = vi.spyOn(FirebaseRestBookDeliveryRepository.prototype, 'readBinding')
      .mockResolvedValue({
        binding: { issuer: { ownerId: 'teacher-1' }, revision: target.bindingRevision,
          recipient: { recipientId: target.recipientId }, context: { contextId: target.contextId } } as never,
        status: 'revoked', recordRevision: 1, createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-02T00:00:00.000Z',
      });
    const handlers = createDefaultBookActivityEvaluationProductionHandlers();
    const soloTarget = { ...target, contextKind: 'solo' as const };
    const result = await handlers.history({
      ...historyInput('teacher-1'),
      env: {
        FIREBASE_DB_URL: 'https://firebase.test',
        FIREBASE_PROJECT_ID: 'project-1',
        FIREBASE_WEB_API_KEY: 'web-key',
        BOOK_DELIVERY_SERVICE_IDENTITY: 'delivery@example.test',
        BOOK_DELIVERY_GOOGLE_SA_KEY: JSON.stringify({ client_email: 'delivery@example.test', private_key: 'unused-by-mocked-read' }),
      },
      request: new Request(`https://worker.test/book-evaluation/history/book-1/student-1?target=${encodeURIComponent(JSON.stringify(soloTarget))}`),
    });
    expect(resolveCurrent).not.toHaveBeenCalled();
    expect(readBinding).not.toHaveBeenCalled();
    expect(result).toMatchObject({ init: { status: 404 }, body: { code: 'evaluation_attempt_not_found' } });
    resolveCurrent.mockRestore();
    readBinding.mockRestore();
  });

  it('keeps complete teacher history visible when student policy still withholds it', async () => {
    const repository = await makeRepository();
    const handlers = createBookActivityEvaluationProductionHandlers({
      createDependencies: () => ({ repository } as never),
      resolveActor: async () => null,
      resolveHistoryAttempt: async () => ({ target, response: attempt.response, access: { role: 'teacher', feedbackReleased: false } }),
    });
    const result = await handlers.history(historyInput('teacher-1'));
    expect(result).toMatchObject({ init: { status: 200 }, body: { target, submission: { response: attempt.response }, history: [{ revision: 1 }] } });
    expect(Object.keys(result.body!)).toEqual(['target', 'submission', 'history']);
  });

  const productionFixture = async () => {
    const repository = await makeRepository();
    const history = await repository.listHistory({ target, limit: 50 });
    const detail = vi.fn().mockResolvedValue({
      body: { detail: { ...target, ownerId: 'teacher-1', studentFeedbackRelease: 'withheld' } },
      init: { status: 200 },
    });
    vi.spyOn(resultComposition, 'createBookResultReadProductionHandlers').mockReturnValue({ resultDetail: detail } as never);
    const tuples = vi.spyOn(FirebaseRestBookRuntimeRepository.prototype, 'listTerminalTuples').mockResolvedValue([{
      attempt, result: { resultId: target.resultId }, completion: { completionId: `${target.attemptId}:completion` }, index: {},
    }] as never);
    vi.spyOn(FirebaseRestBookActivityEvaluationRepository.prototype, 'listHistory').mockResolvedValue(history);
    const input = {
      ...historyInput('teacher-1'),
      env: {
        FIREBASE_DB_URL: 'https://firebase.test', FIREBASE_PROJECT_ID: 'project-1', FIREBASE_WEB_API_KEY: 'key',
        BOOK_DELIVERY_SERVICE_IDENTITY: 'delivery@example.test',
        BOOK_DELIVERY_GOOGLE_SA_KEY: JSON.stringify({ client_email: 'delivery@example.test', private_key: 'unused-by-mock' }),
        BOOK_RUNTIME_SERVICE_IDENTITY: 'runtime@example.test',
        BOOK_RUNTIME_GOOGLE_SA_KEY: JSON.stringify({ client_email: 'runtime@example.test', private_key: 'unused-by-mock' }),
        BOOK_ACTIVITY_EVALUATION_SERVICE_IDENTITY: 'evaluation@example.test',
        BOOK_ACTIVITY_EVALUATION_GOOGLE_SA_KEY: JSON.stringify({ client_email: 'evaluation@example.test', private_key: 'unused-by-mock' }),
      },
    };
    return { input, detail, tuples, handlers: createDefaultBookActivityEvaluationProductionHandlers() };
  };

  it('reads the bound canonical Activity with scoped Firebase claims and no generic credential', async () => {
    const { input, handlers } = await productionFixture();
    const token = vi.fn().mockResolvedValue('scoped-reader-token');
    const provider = vi.spyOn(firebaseTokens, 'createFirebaseClaimTokenProvider').mockReturnValue(token);
    vi.spyOn(FirebaseRestBookActivityEvaluationRepository.prototype, 'readOperation').mockResolvedValue(null);
    vi.spyOn(FirebaseRestBookDeliveryRepository.prototype, 'resolveCurrent').mockResolvedValue({ record: { binding: {
      bindingId: target.bindingId, revision: target.bindingRevision,
      issuer: { ownerId: 'teacher-1' }, context: { kind: target.contextKind },
      book: { bookId: 'book-1', manifestVersionId: 'manifest-1' },
      placements: [{ placementId: target.placementId, activityId: target.activityId,
        activityVersionId: target.activityVersionId, activityVersion: target.activityVersion }],
    } } } as never);
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('null'));
    const assemblyKey = JSON.stringify({ client_email: 'assembly@example.test', private_key: 'unused-by-mock' });
    const result = await handlers.command({
      ...input,
      env: { ...input.env, BOOK_ASSEMBLY_SERVICE_IDENTITY: 'assembly@example.test', BOOK_ASSEMBLY_GOOGLE_SA_KEY: assemblyKey },
      request: new Request('https://worker.test/book-evaluation/commands', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ command: {
          schemaVersion: 1, scorerVersion: 1, operationId: 'grade-1', kind: 'teacher_evaluation',
          expectedEvaluationRevision: 0, target,
          evaluation: { earnedScore: 1, maximumScore: 2, feedback: 'Good work.' },
        } }),
      }),
    });
    expect(provider).toHaveBeenCalledWith(expect.objectContaining({
      serviceIdentity: 'assembly@example.test', serviceAccountJson: assemblyKey,
    }));
    expect(token).toHaveBeenCalledWith({
      service: 'book_activity_runtime_reader', ownerId: 'teacher-1', bookId: 'book-1',
      manifestVersionId: 'manifest-1', activityId: target.activityId, activityVersionId: target.activityVersionId,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = fetch.mock.calls[0]!;
    expect(String(url)).toBe('https://firebase.test/book_activity/versions/activity-1/activity-version-1.json?auth=scoped-reader-token');
    expect(options?.headers).not.toHaveProperty('Authorization');
    expect(result).toMatchObject({ body: { status: 'rejected', code: 'evaluation_attempt_not_found' } });
  });

  it('resolves the browser locator from the authorized Results detail and exact submitted terminal', async () => {
    const { input, detail, tuples, handlers } = await productionFixture();
    const result = await handlers.history(input);
    expect(result).toMatchObject({ init: { status: 200 }, body: { target, submission: { response: attempt.response }, history: [{ revision: 1 }] } });
    expect(detail).toHaveBeenCalledWith(expect.objectContaining({ bookId: 'book-1', studentId: 'student-1', homeworkId: 'homework-1', resultId: target.resultId, uid: 'teacher-1' }));
    expect(tuples).toHaveBeenCalledWith(expect.objectContaining({ bindingId: target.bindingId, bindingRevision: target.bindingRevision, limit: 50 }));
    const query = new URL(input.request.url);
    query.searchParams.delete('attemptId');
    query.searchParams.set('terminalId', `${target.attemptId}:completion`);
    expect(await handlers.history({ ...input, request: new Request(query) })).toMatchObject({ init: { status: 200 }, body: { target } });
  });

  it('serves the actual browser locator through canonical router and production history composition', async () => {
    const { input, handlers } = await productionFixture();
    const router = createBookRouter({
      handlers: createBookRouteHandlers({ evaluationHandlers: handlers }),
      firebaseVerifier: { verifyAuthorizationHeader: async () => ({ valid: true, uid: input.uid }) },
    });
    const response = await router.fetch(new Request(input.request, { headers: {
      Origin: 'http://localhost:5173', Authorization: 'Bearer teacher-token',
    } }), { ...input.env, BOOK_EVALUATION_HISTORY_ROUTES_ENABLED: 'enabled',
      BOOK_ROUTE_RATE_LIMITER: { limit: async () => ({ success: true }) } });
    expect(response?.status).toBe(200);
    expect(await response?.json()).toMatchObject({ target, submission: { response: attempt.response }, history: [{ revision: 1 }] });
  });

  it.each(['ownerId', 'contextId', 'placementId', 'activityVersionId'])('denies Results %s drift before reading submission', async (key) => {
    const { input, detail, tuples, handlers } = await productionFixture();
    detail.mockResolvedValue({ body: { detail: { ...target, ownerId: 'teacher-1', [key]: 'wrong' } }, init: { status: 200 } });
    expect(await handlers.history(input)).toMatchObject({ init: { status: 403 } });
    expect(tuples).not.toHaveBeenCalled();
  });

  it('denies terminal provenance drift and missing exact attempts', async () => {
    const { input, tuples, handlers } = await productionFixture();
    tuples.mockResolvedValue([{ attempt: { ...attempt, sourceProvenance: [] }, result: { resultId: target.resultId } }] as never);
    expect(await handlers.history(input)).toMatchObject({ init: { status: 403 } });
    tuples.mockResolvedValue([]);
    expect(await handlers.history(input)).toMatchObject({ init: { status: 403 } });
  });

  it('enforces requested viewer role and preserves shared student feedback release privacy', async () => {
    const { input, detail, handlers } = await productionFixture();
    const query = new URL(input.request.url);
    const student = { ...input, uid: 'student-1', request: new Request(query) };
    expect(await handlers.history(student)).toMatchObject({ init: { status: 403 } });
    query.searchParams.set('view', 'student');
    student.request = new Request(query);
    const withheld = await handlers.history(student);
    expect(withheld.body).toEqual({ result: { attemptId: target.attemptId, status: 'hidden' } });
    detail.mockResolvedValue({ body: { detail: { ...target, ownerId: 'teacher-1', studentFeedbackRelease: 'released' } }, init: { status: 200 } });
    expect(await handlers.history(student)).toMatchObject({ body: { result: { status: 'graded', feedback: 'Good work.' } } });
  });

  it('resolves an omitted attempt identity from the exact current binding and latest matching terminal', async () => {
    const { input, tuples, handlers } = await productionFixture();
    vi.spyOn(FirebaseRestBookDeliveryRepository.prototype, 'resolveCurrent').mockResolvedValue({
      record: { binding: {
        bindingId: target.bindingId, revision: target.bindingRevision,
        book: { bookId: input.bookId }, context: { kind: 'homework', contextId: target.contextId, recipientId: target.recipientId },
        placements: [{ placementId: target.placementId, activityId: target.activityId, activityVersion: target.activityVersion, activityVersionId: target.activityVersionId }],
      } },
    } as never);
    const row = { attempt, result: { resultId: target.resultId }, completion: {}, index: {} };
    tuples.mockResolvedValue([{
      ...row, attempt: { ...attempt, attemptId: 'other-version-attempt', activityVersionId: 'other-version', attemptNumber: 2 },
    }, row] as never);
    const query = new URL(input.request.url);
    query.searchParams.delete('attemptId');
    expect(await handlers.history({ ...input, request: new Request(query) })).toMatchObject({ init: { status: 200 }, body: { target } });
    tuples.mockResolvedValue(Array.from({ length: 50 }, () => row) as never);
    expect(await handlers.history({ ...input, request: new Request(query) })).toMatchObject({ init: { status: 503 } });
  });

  it.each(['duplicate', 'unknown', 'unsafe-id', 'conflicting-terminal'])('rejects malformed locator %s without exposing submission', async (mutation) => {
    const { input, handlers } = await productionFixture();
    const query = new URL(input.request.url);
    if (mutation === 'duplicate') query.searchParams.append('contextId', target.contextId);
    if (mutation === 'unknown') query.searchParams.set('target', JSON.stringify(target));
    if (mutation === 'unsafe-id') query.searchParams.set('contextId', 'homework/other');
    if (mutation === 'conflicting-terminal') query.searchParams.set('terminalId', 'other-attempt:completion');
    const result = await handlers.history({ ...input, request: new Request(query) });
    expect(result.init?.status).toBe(mutation === 'conflicting-terminal' ? 403 : 404);
    expect(result.body).not.toHaveProperty('submission');
  });

  it('rejects invalid terminal target grammar and unavailable Results authority', async () => {
    const { input, detail, tuples, handlers } = await productionFixture();
    tuples.mockResolvedValue([{ attempt: { ...attempt, interactionId: 'unsafe/path' }, result: { resultId: target.resultId } }] as never);
    expect(await handlers.history(input)).toMatchObject({ init: { status: 403 } });
    detail.mockResolvedValue({ init: { status: 503 } });
    expect(await handlers.history(input)).toMatchObject({ init: { status: 503 } });
  });

  it('exposes a regrade correction only when the shared Results release exposes the same immutable fact', async () => {
    const { input, detail, handlers } = await productionFixture();
    const repository = await makeRepository();
    const first = (await repository.listHistory({ target, limit: 50 }))[0]!;
    const second = {
      ...first, revision: 2, previousRevision: 1, commandKind: 'regrade' as const,
      facts: { ...first.facts, earnedScore: 2, displayScore: '2.00 / 2.00',
        correctionFacts: [{ interactionId: target.interactionId, outcome: 'not_applicable' as const, note: 'The evidence supports full credit.' }] },
    };
    vi.spyOn(FirebaseRestBookActivityEvaluationRepository.prototype, 'listHistory').mockResolvedValue([first, second]);
    const url = new URL(input.request.url);
    url.searchParams.set('view', 'student');
    const student = { ...input, uid: 'student-1', request: new Request(url) };
    const releasedDetail = { ...target, ownerId: 'teacher-1', studentFeedbackRelease: 'released' };
    detail.mockResolvedValue({ body: { detail: releasedDetail }, init: { status: 200 } });
    expect((await handlers.history(student)).body).not.toHaveProperty('result.correction');
    detail.mockResolvedValue({ body: { detail: { ...releasedDetail,
      feedback: { release: 'released', correctionNote: 'The evidence supports full credit.' },
    } }, init: { status: 200 } });
    expect(await handlers.history(student)).toMatchObject({ body: { result: {
      correction: { note: 'The evidence supports full credit.', revision: 2, previousRevision: 1 },
    } } });
    detail.mockResolvedValue({ body: { detail: { ...releasedDetail, studentFeedbackRelease: 'withheld',
      feedback: { release: 'withheld', correctionNote: 'The evidence supports full credit.' },
    } }, init: { status: 200 } });
    expect((await handlers.history(student)).body).toEqual({ result: { attemptId: target.attemptId, status: 'hidden' } });
  });
});
