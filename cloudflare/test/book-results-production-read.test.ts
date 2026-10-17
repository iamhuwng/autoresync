import { exportPKCS8, generateKeyPair } from 'jose';
import { describe, expect, it, vi } from 'vitest';
import {
  FirebaseBookResultReadRepository,
  bookResultGroupsPath,
} from '../src/upload-worker/book-results/repository.ts';
import { createBookResultReadProductionHandlers } from '../src/upload-worker/book-results/production-composition.ts';
import * as publicBookProduction from '../src/upload-worker/book-public/production.ts';
import { createBookResultReadWorkerHandlers } from '../src/upload-worker/book-results/worker.ts';
import { validateBookResultAttemptDetail } from '../../src/services/book-activity/results/bookResultProjection.service.ts';
import { bookResultGroupKey, type BookResultAttemptSummary } from '../src/upload-worker/book-results/types.ts';
import type { BookHomeworkAuthorityRecord } from '../../src/services/book-homework/bookHomeworkAuthority.types.ts';
import type { BookHomeworkSagaRecord } from '../../src/services/book-homework/bookHomeworkSaga.types.ts';
import type { BookDeliveryBinding } from '../../src/services/book-delivery/bookDelivery.types.ts';
import { createComponentStudentDocument } from '../../src/services/book-assembly/componentStudentDocument.types.ts';

const decodePayload = (token: string): Record<string, unknown> => {
  const encoded = token.split('.')[1]!;
  const padded = encoded.replace(/-/gu, '+').replace(/_/gu, '/').padEnd(Math.ceil(encoded.length / 4) * 4, '=');
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(padded), (value) => value.charCodeAt(0)))) as Record<string, unknown>;
};

describe('Book result production read wiring', () => {
  it('mints exact Course and Class credentials for bounded indexes and global detail reads', async () => {
    const { privateKey } = await generateKeyPair('RS256', { extractable: true });
    const claims: Record<string, unknown>[] = [];
    const repository = new FirebaseBookResultReadRepository({ env: {
      FIREBASE_DB_URL: 'https://database.example.test', FIREBASE_PROJECT_ID: 'project-1', FIREBASE_WEB_API_KEY: 'web-key',
      BOOK_RESULT_READ_SERVICE_IDENTITY: 'results@project-1.iam.gserviceaccount.com',
      BOOK_RESULT_READ_GOOGLE_SA_KEY: JSON.stringify({ client_email: 'results@project-1.iam.gserviceaccount.com', private_key: await exportPKCS8(privateKey) }),
    }, fetchImpl: async (input, init) => {
      if (String(input).includes('identitytoolkit.googleapis.com')) {
        claims.push(decodePayload(JSON.parse(String(init?.body)).token).claims as Record<string, unknown>);
        return Response.json({ idToken: `tuple-${claims.length}`, expiresIn: '3600' });
      }
      return Response.json(null);
    } });
    for (const contextKind of ['course', 'class'] as const) {
      const scope = { bookId: 'book-1', studentId: 'student-1', contextKind, contextId: `${contextKind}:placement-1` };
      await repository.listGroupSummaries(scope);
      await repository.listAttemptSummaries({ ...scope, groupKey: bookResultGroupKey('student-1', 'activity-1') });
      await repository.readResultDetail({ ...scope, resultId: 'attempt-1:result' });
    }
    expect(claims).toHaveLength(6);
    for (let index = 0; index < claims.length; index += 1) {
      const kind = index < 3 ? 'course' : 'class';
      expect(claims[index]).toMatchObject({ book_result_read_service: true, book_result_read_contextKind: kind,
        book_result_read_contextId: `${kind}:placement-1`, book_result_read_studentId: 'student-1', book_result_read_bookId: 'book-1' });
      expect(claims[index].book_result_read_homeworkId).toBeUndefined();
    }
    expect(claims[2].book_result_read_resultId).toBe('attempt-1:result');
    expect(claims[5].book_result_read_resultId).toBe('attempt-1:result');
  });
  it('keeps unscoped Solo and aggregate routes fail-closed until trusted context exists', async () => {
    const handlers = createBookResultReadProductionHandlers();
    const input = {
      request: new Request('https://worker.test/'),
      env: {},
      uid: 'student-1',
      bookId: 'book-1',
      studentId: 'student-1',
      contextKind: 'solo' as const,
    };

    await expect(handlers.resultSummary(input)).resolves.toMatchObject({
      init: { status: 503 },
      body: { code: 'book_result_context_unavailable' },
    });
    await expect(handlers.groupedAttempt({ ...input, groupKey: 'g_invalid' })).resolves.toMatchObject({
      init: { status: 503 },
      body: { code: 'book_result_context_unavailable' },
    });
    await expect(handlers.resultDetail({ ...input, resultId: 'result-1' })).resolves.toMatchObject({
      init: { status: 503 },
      body: { code: 'book_result_context_unavailable' },
    });
  });

  it('uses exact custom claims for every bounded Firebase result path and never OAuth', async () => {
    const { privateKey } = await generateKeyPair('RS256', { extractable: true });
    const claims: Record<string, unknown>[] = [];
    const oauthCalls: string[] = [];
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.includes('identitytoolkit.googleapis.com')) {
        const body = JSON.parse(String(init?.body)) as { token: string };
        claims.push(decodePayload(body.token).claims as Record<string, unknown>);
        return new Response(JSON.stringify({ idToken: 'firebase-id-token', expiresIn: '3600' }), { status: 200 });
      }
      if (url.includes('oauth2.googleapis.com')) oauthCalls.push(url);
      return new Response('{}', { status: 200 });
    });
    const groupKey = bookResultGroupKey('student-1', 'activity-1');
    const repository = new FirebaseBookResultReadRepository({
      env: {
        FIREBASE_DB_URL: 'https://database.example.test',
        FIREBASE_PROJECT_ID: 'project-1',
        FIREBASE_WEB_API_KEY: 'web-key',
        BOOK_RESULT_READ_SERVICE_IDENTITY: 'results@project-1.iam.gserviceaccount.com',
        BOOK_RESULT_READ_GOOGLE_SA_KEY: JSON.stringify({
          client_email: 'results@project-1.iam.gserviceaccount.com',
          private_key: await exportPKCS8(privateKey),
        }),
      },
      fetchImpl,
    });

    await repository.listGroupSummaries({ bookId: 'book-1', studentId: 'student-1' });
    await repository.listAttemptSummaries({ bookId: 'book-1', studentId: 'student-1', groupKey });
    await repository.listGroupSummaries({ bookId: 'book-1', studentId: 'student-1', homeworkId: 'homework-1' });
    await repository.listAttemptSummaries({
      bookId: 'book-1', studentId: 'student-1', homeworkId: 'homework-1', groupKey,
    });
    await repository.readResultDetail({ bookId: 'book-1', studentId: 'student-1', resultId: 'result-1' });

    expect(claims).toEqual([
      { book_result_read_service: true, book_result_read_studentId: 'student-1', book_result_read_bookId: 'book-1' },
      { book_result_read_service: true, book_result_read_studentId: 'student-1', book_result_read_bookId: 'book-1', book_result_read_groupKey: groupKey },
      { book_result_read_service: true, book_result_read_homeworkId: 'homework-1', book_result_read_studentId: 'student-1', book_result_read_bookId: 'book-1' },
      { book_result_read_service: true, book_result_read_homeworkId: 'homework-1', book_result_read_studentId: 'student-1', book_result_read_bookId: 'book-1', book_result_read_groupKey: groupKey },
      { book_result_read_service: true, book_result_read_resultId: 'result-1' },
    ]);
    expect(oauthCalls).toEqual([]);
    expect(fetchImpl.mock.calls.some(([input]) => String(input) === 'https://oauth2.googleapis.com/token')).toBe(false);
  });

  it('passes the requested book, student, homework, and context to authority resolution', async () => {
    const resolveHomeworkAuthorities = vi.fn(async () => ({}));
    const handlers = createBookResultReadWorkerHandlers({
      repository: new FirebaseBookResultReadRepository({
        env: {
          FIREBASE_DB_URL: 'https://database.example.test',
          readDatabaseValue: async (path) => path === bookResultGroupsPath({ bookId: 'book-1', studentId: 'student-1' }) ? {} : null,
        },
      }),
      resolveViewerRole: () => 'student',
      resolveHomeworkAuthorities,
    });

    await handlers.resultSummary({
      request: new Request('https://worker.test/'),
      env: {},
      uid: 'student-1',
      bookId: 'book-1',
      studentId: 'student-1',
      homeworkId: 'homework-1',
      contextKind: 'homework',
    });

    expect(resolveHomeworkAuthorities).toHaveBeenCalledWith(expect.objectContaining({
      viewerUid: 'student-1',
      bookId: 'book-1',
      studentId: 'student-1',
      homeworkId: 'homework-1',
      contextKind: 'homework',
      homeworkIds: ['homework-1'],
    }));
  });

  it('keeps current and historical result rows behind the current homework authority', async () => {
    const homeworkId = 'homework-1';
    const studentId = 'student-1';
    const bookId = 'book-1';
    const ownerId = 'teacher-1';
    const placementId = 'placement-1';
    const bindingId = `${homeworkId}--${studentId}--delivery`;
    const authorityId = `${homeworkId}--${studentId}--authority`;
    let binding: BookDeliveryBinding = {
      schemaVersion: 3,
      bindingId,
      revision: 1,
      status: 'active',
      recipient: { recipientId: studentId, recipientKind: 'student' },
      issuer: { ownerId, authorityBoundary: 'book-owner' },
      book: {
        bookId,
        bookMode: 'pdf',
        bookRevision: 1,
        manifestVersionId: 'manifest-1',
        publicationId: 'publication-1',
        publicationRevision: 1,
        publicationStatus: 'published',
      },
      scope: { kind: 'subtree', nodeKeys: ['unit-1'], placementIds: [] },
      outline: [{ nodeKey: 'unit-1', parentNodeKey: null, nodeType: 'unit', order: 1 }],
      context: {
        kind: 'homework',
        contextId: homeworkId,
        ownerId,
        recipientId: studentId,
        entitlementBasis: 'assignment',
      },
      sourceSet: {
        strategy: 'full_pdf',
        sources: [{
          sourceKey: 'full',
          sourceVersionId: 'source-v1',
          lifecycle: 'verified-usable',
          localPageScope: { kind: 'pages', pages: [1] },
        }],
      },
      placements: [{
        placementId,
        activityId: 'activity-1',
        activityVersionId: 'activity-v1',
        activityVersion: 1,
        nodeKey: 'unit-1',
        order: 1,
        contextMode: 'required',
        pageGroupKeys: ['page-group-1'],
        sourcePageScopes: [{ sourceKey: 'full', pages: [1] }],
      }],
      schedulePolicy: { policyId: 'policy-1', policyRevision: 1, basis: 'immutable-reference' },
      createdAt: '2026-09-01T00:00:00.000Z',
    };
    let authority: BookHomeworkAuthorityRecord = {
      assignmentId: authorityId,
      assignmentKind: 'book_activity_bundle',
      schemaVersion: 1,
      ownerId,
      bookManifest: {
        schemaVersion: 1,
        assignmentKind: 'book_activity_bundle',
        manifestVersionId: 'manifest-1',
        ownerId,
        createdByCommandId: 'command-1',
        createdAt: '2026-09-01T00:00:00.000Z',
        bindingRevision: 1,
        book: binding.book,
        context: {
          contextId: homeworkId,
          recipientId: studentId,
          kind: 'homework',
          entitlementBasis: 'assignment',
        },
        selectedTarget: { kind: 'unit', bookId, nodeKey: 'unit-1' },
        outline: binding.outline,
        scheduleRules: [],
        bindings: [{
          bindingId: placementId,
          placementId,
          activityId: 'activity-1',
          activityVersionId: 'activity-v1',
          activityVersion: 1,
          nodeKey: 'unit-1',
          order: 1,
          contextMode: 'required',
          pageGroupKeys: ['page-group-1'],
          sourceReadiness: 'ready',
          sourceContext: [{ sourceKey: 'full', sourceVersionId: 'source-v1', physicalPageNumbers: [1] }],
          state: 'required',
        }],
        completion: {
          aggregation: 'required-activities-submitted-over-required-activities',
          requiredBindingCount: 1,
          excludedBindingCount: 0,
          legacyScoreFields: 'untouched',
        },
      },
      schedule: {
        schemaVersion: 1,
        resolverVersion: 1,
        finalDueAt: '2026-09-30T00:00:00.000Z',
        scheduleRules: [],
      },
      activityPolicies: {
        [placementId]: {
          schemaVersion: 1,
          policyId: 'policy-1',
          policyRevision: 1,
          placementId,
          activityId: 'activity-1',
          activityVersionId: 'activity-v1',
          activityVersion: 1,
          lateSubmissionAllowed: false,
          maxAttempts: null,
        },
      },
      studentExtensions: {},
      saga: { sagaId: homeworkId, state: 'committed', lastCommandId: 'command-1' },
      visibility: {
        status: 'committed',
        pointerId: 'manifest-1',
        manifestVersionId: 'manifest-1',
        revision: 2,
      },
      revision: 2,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    };
    const saga: BookHomeworkSagaRecord = {
      schemaVersion: 1,
      assignmentId: homeworkId,
      operationId: '00000000-0000-4000-8000-000000000001',
      idempotencyKey: 'idempotency-1',
      ownerId,
      manifestVersionId: 'manifest-1',
      publicationId: 'publication-1',
      publicationRevision: 1,
      contextId: homeworkId,
      presentation: { title: 'Homework' },
      fingerprint: 'fingerprint-1',
      requestFingerprint: 'request-fingerprint-1',
      state: 'committed',
      visibility: 'committed',
      recipients: [{
        recipientId: studentId,
        authorityId,
        bindingId,
        state: 'committed',
        authorityRevision: 2,
        bindingRevision: 1,
      }],
      recipientCount: 1,
      committedRecipientCount: 1,
      revision: 1,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    };
    const summary: BookResultAttemptSummary = {
      schemaVersion: 1,
      attemptId: 'attempt-1',
      resultId: 'attempt-1:result',
      completionId: 'attempt-1:completion',
      recipientId: studentId,
      studentId,
      activityId: 'activity-1',
      contextId: homeworkId,
      placementId,
      bindingId,
      bindingRevision: 1,
      activityVersionId: 'activity-v1',
      activityVersion: 1,
      interactionId: 'interaction-1',
      attemptNumber: 1,
      surface: 'homework',
      deliveryContextId: homeworkId,
      deliveryId: bindingId,
      ownerId,
      homeworkId,
      pageGroupKeys: ['page-group-1'],
      sourceProvenance: [{ pages: [1], sourceKey: 'full', sourceVersionId: 'source-v1' }],
      sources: [{ sourceKey: 'full', componentId: 'full', sourceVersionId: 'source-v1', pages: [1], availability: 'available', available: true, displayOnly: false }],
      sourceAvailability: 'available',
      sourceAvailable: true,
      attemptSourceContext: {
        schemaVersion: 1,
        state: 'historical_source_unavailable',
        reason: 'missing_context',
        metadata: null,
        documentResource: null,
      },
      createdAt: '2026-09-01T00:00:00.000Z',
      submittedAt: '2026-09-01T00:00:00.000Z',
      completedAt: '2026-09-01T00:00:00.000Z',
      resultStatus: 'submitted',
      evaluationStatus: 'graded',
      completionStatus: 'completed',
      completion: {
        completionId: 'attempt-1:completion',
        attemptId: 'attempt-1',
        resultId: 'attempt-1:result',
        status: 'completed',
        contextId: homeworkId,
        placementId,
        activityVersionId: 'activity-v1',
        activityVersion: 1,
        createdAt: '2026-09-01T00:00:00.000Z',
      },
      evaluation: { status: 'graded', score: { earnedScore: 1, maximumScore: 1, displayScore: '1 / 1' } },
      feedback: { release: 'pending', available: false },
      attemptLimit: null,
      attemptsUsed: 1,
      attemptsRemaining: null,
      bookId,
    };
    let policy: BookResultAttemptSummary['feedbackPolicy'] = 'immediate';
    let now = '2026-09-22T00:00:00.000Z';
    let releaseEvidence: unknown = null;
    let resultDetail = {
      ...summary,
      feedbackPolicy: policy,
      terminalLate: {
        effectiveDeadline: { source: 'assignment', at: '2026-09-22T00:00:00.000Z' },
        policyRevision: 1,
        authorityRevision: 2,
        evaluatedAt: '2026-09-01T00:00:00.000Z',
        late: false,
      },
      feedback: { release: 'released' as const, available: true, text: 'Teacher feedback' },
      evaluation: { status: 'graded' as const, score: { earnedScore: 1, maximumScore: 1, displayScore: '1 / 1' } },
      response: { answer: 'student response' },
    };
    const policyHandlers = createBookResultReadWorkerHandlers({
      repository: {
        listGroupSummaries: async () => [],
        listAttemptSummaries: async () => [resultDetail],
        readResultDetail: async () => resultDetail,
      },
      resolveViewerRole: ({ uid }) => uid === ownerId ? 'teacher' : 'student',
      resolveHomeworkAuthorities: () => ({
        [homeworkId]: { homeworkId, bookId, ownerId, status: 'current', studentIds: [studentId] },
      }),
      resolveManualFeedbackRelease: () => releaseEvidence as never,
      now: () => now,
    });
    const studentResultInput = {
      request: new Request('https://worker.test/results'),
      env: {},
      uid: studentId,
      bookId,
      studentId,
      homeworkId,
      contextKind: 'homework' as const,
      resultId: summary.resultId,
    };
    const readStudentDetail = async () => (await policyHandlers.resultDetail(studentResultInput)).body as { detail: Record<string, unknown> };
    for (const nextPolicy of ['immediate', 'after_completion'] as const) {
      policy = nextPolicy;
      resultDetail = { ...resultDetail, feedbackPolicy: policy };
      const output = await readStudentDetail();
      expect(output.detail.feedback).toMatchObject({ release: 'released', text: 'Teacher feedback' });
      expect(validateBookResultAttemptDetail(output.detail).valid).toBe(true);
    }
    policy = 'after_deadline';
    resultDetail = { ...resultDetail, feedbackPolicy: policy };
    now = '2026-09-21T23:59:59.999Z';
    expect((await readStudentDetail()).detail.feedback).toMatchObject({ release: 'withheld', available: false });
    now = '2026-09-22T00:00:00.000Z';
    expect((await readStudentDetail()).detail.feedback).toMatchObject({ release: 'withheld', available: false });
    now = '2026-09-22T00:00:00.001Z';
    expect((await readStudentDetail()).detail.feedback).toMatchObject({ release: 'released', text: 'Teacher feedback' });
    resultDetail = { ...resultDetail, terminalLate: { ...resultDetail.terminalLate, effectiveDeadline: { source: 'assignment', at: null } } };
    expect((await readStudentDetail()).detail.feedback).toMatchObject({ release: 'withheld', available: false });
    resultDetail = { ...resultDetail, terminalLate: { ...resultDetail.terminalLate, effectiveDeadline: { source: 'assignment', at: '2026-09-22T00:00:00.000Z' } } };
    policy = 'never';
    resultDetail = { ...resultDetail, feedbackPolicy: policy };
    expect((await readStudentDetail()).detail.feedback).toMatchObject({ release: 'withheld', available: false });
    policy = 'manual';
    resultDetail = { ...resultDetail, feedbackPolicy: policy };
    expect((await readStudentDetail()).detail.feedback).toMatchObject({ release: 'withheld', available: false });
    releaseEvidence = {
      resultId: 'stale-result',
      attemptId: summary.attemptId,
      recipientId: studentId,
      contextId: homeworkId,
      bindingId,
      bindingRevision: 1,
      placementId,
      activityId: summary.activityId,
      activityVersionId: summary.activityVersionId,
      activityVersion: 1,
    };
    expect((await readStudentDetail()).detail.feedback).toMatchObject({ release: 'withheld', available: false });
    releaseEvidence = {
      resultId: summary.resultId,
      attemptId: summary.attemptId,
      recipientId: studentId,
      contextId: homeworkId,
      bindingId,
      bindingRevision: 1,
      placementId,
      activityId: summary.activityId,
      activityVersionId: summary.activityVersionId,
      activityVersion: 1,
    };
    const released = await readStudentDetail();
    expect(released.detail.feedback).toMatchObject({ release: 'released', text: 'Teacher feedback' });
    expect(validateBookResultAttemptDetail(released.detail).valid).toBe(true);
    const studentGroup = await policyHandlers.groupedAttempt({
      ...studentResultInput,
      groupKey: bookResultGroupKey(studentId, summary.activityId),
    });
    expect(studentGroup).toMatchObject({ init: { status: 200 }, body: { group: expect.any(Object) } });
    releaseEvidence = null;
    const teacherDetail = await policyHandlers.resultDetail({ ...studentResultInput, uid: ownerId });
    expect((teacherDetail.body as { detail: { feedback: unknown; evaluation: unknown; studentFeedbackRelease: string } }).detail).toMatchObject({
      feedback: { release: 'released', available: true, text: 'Teacher feedback' },
      studentFeedbackRelease: 'withheld',
      evaluation: { score: { earnedScore: 1 } },
    });
    const manualAuthority: BookHomeworkAuthorityRecord = {
      ...authority,
      activityPolicies: {
        [placementId]: { ...authority.activityPolicies![placementId]!, feedbackRelease: 'manual' },
      },
    };
    const manualDetail = {
      ...resultDetail,
      feedbackPolicy: 'manual' as const,
      terminalLate: resultDetail.terminalLate,
    };
    const runtimeCommon = {
      schemaVersion: 1 as const,
      submissionScope: 'activity' as const,
      requiredInteractionIds: ['interaction-1'],
      submittedInteractionIds: ['interaction-1'],
      bindingId,
      bindingRevision: 1,
      recipientId: studentId,
      contextId: homeworkId,
      placementId,
      activityId: summary.activityId,
      activityVersion: 1,
      interactionId: 'interaction-1',
      activityVersionId: summary.activityVersionId,
      acknowledgedDraftRevision: 0,
      attemptNumber: 1,
      pageGroupKeys: ['page-group-1'],
      sourceProvenance: [{ sourceKey: 'full', sourceVersionId: 'source-v1', pages: [1] }],
      feedbackPolicy: 'manual' as const,
      terminalLate: resultDetail.terminalLate,
      createdByOperationId: 'runtime-operation-1',
      createdAt: '2026-09-01T00:00:00.000Z',
    };
    const runtimeRepository = new (await import('../src/upload-worker/book-runtime/repository.ts')).InMemoryBookRuntimeRepository({
      attempts: {
        [summary.attemptId]: { ...runtimeCommon, attemptId: summary.attemptId, feedbackRelease: 'pending' as const, response: { answer: 'student response' } },
      },
      results: {
        [summary.resultId]: { ...runtimeCommon, resultId: summary.resultId, attemptId: summary.attemptId, feedbackRelease: 'pending' as const, status: 'submitted' as const },
      },
      completions: {
        [summary.completionId]: { ...runtimeCommon, completionId: summary.completionId, attemptId: summary.attemptId, resultId: summary.resultId, status: 'completed' as const },
      },
      indexes: {
        [summary.attemptId]: { ...runtimeCommon, attemptId: summary.attemptId, resultId: summary.resultId },
      },
      operations: {
        'runtime-operation-1': { operationId: 'runtime-operation-1', fingerprint: 'runtime-fingerprint-1', status: 'accepted' as const, bindingId, attemptId: summary.attemptId, attemptNumber: 1, createdAt: '2026-09-01T00:00:00.000Z' },
      },
    });
    let terminalAvailable = true;    let authorityReleaseStatus: 'released' | 'replayed' = 'released';
    const releaseManualFeedback = vi.fn(async () => ({
      status: authorityReleaseStatus,
      resultId: summary.resultId,
      releasedAt: '2026-09-22T00:00:00.000Z',
      revision: 3,
    }));
    const makeActionHandlers = (options: { current?: boolean; policy?: string } = {}) => createBookResultReadProductionHandlers({
      createDeliveryRepository: () => ({
        resolveCurrent: async () => options.current === false ? null : ({
          record: { binding, recordRevision: 1, status: 'active', createdAt: binding.createdAt, updatedAt: binding.createdAt },
          pointer: {
            bindingId,
            bindingRevision: 1,
            recipientId: studentId,
            contextId: homeworkId,
            contextKind: 'homework',
            status: 'active',
            updatedAt: binding.createdAt,
          },
        }),
        readBinding: async () => null,
      }),
      createHomeworkSagaRepository: () => ({ read: async () => saga }),
      createHomeworkAuthorityReader: () => ({ read: async () => ({
        value: options.policy === 'never'
          ? { ...manualAuthority, activityPolicies: { [placementId]: { ...manualAuthority.activityPolicies![placementId]!, feedbackRelease: 'never' } } }
          : manualAuthority,
        updateTime: '2026-09-01T00:00:00.000Z',
      }) }),
      createResultRepository: () => ({
        listGroupSummaries: async () => [],
        listAttemptSummaries: async () => [],
        readResultDetail: async () => options.policy === 'never'
          ? { ...manualDetail, feedbackPolicy: 'never' }
          : manualDetail,
      }),
      createEvaluationRepository: () => ({ listHistory: async () => [] }),
      createRuntimeRepository: () => ({ listTerminalTuples: (input) => terminalAvailable ? runtimeRepository.listTerminalTuples(input) : [] }),
      createHomeworkAuthorityRepository: () => ({ releaseManualFeedback }),
      readUser: async () => ({ role: 'teacher', status: 'active' }),
      now: () => '2026-09-22T00:00:00.000Z',
    });
    const actionInput = (uid = ownerId) => ({
      request: new Request('https://worker.test/results', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
      env: {}, uid, bookId, studentId, homeworkId,
      contextKind: 'homework' as const, resultId: summary.resultId,
    });
    const actionHandlers = makeActionHandlers();
    await expect(actionHandlers.releaseFeedback(actionInput())).resolves.toMatchObject({
      init: { status: 200 },
      body: { status: 'released', resultId: summary.resultId },
    });
    authorityReleaseStatus = 'replayed';
    await expect(actionHandlers.releaseFeedback(actionInput())).resolves.toMatchObject({
      init: { status: 200 },
      body: { status: 'replayed', resultId: summary.resultId },
    });
    await expect(actionHandlers.releaseFeedback(actionInput('teacher-other'))).resolves.toMatchObject({
      init: { status: 403 },
    });
    const releaseCount = releaseManualFeedback.mock.calls.length;
    terminalAvailable = false;
    await expect(makeActionHandlers().releaseFeedback(actionInput())).resolves.toMatchObject({ init: { status: 409 } });
    expect(releaseManualFeedback).toHaveBeenCalledTimes(releaseCount);
    terminalAvailable = true;
    await expect(makeActionHandlers({ policy: 'never' }).releaseFeedback(actionInput())).resolves.toMatchObject({ init: { status: 409 } });
    await expect(makeActionHandlers({ current: false }).releaseFeedback(actionInput())).resolves.toMatchObject({ init: { status: 503 } });
    let publicationScope: any;
    const handlers = createBookResultReadProductionHandlers({
      createPublicationRepository: () => ({ readScope: async () => publicationScope }),
      createDeliveryRepository: () => ({
        resolveCurrent: async () => ({
          record: { binding, recordRevision: 1, status: 'active', createdAt: binding.createdAt, updatedAt: binding.createdAt },
          pointer: {
            bindingId,
            bindingRevision: 1,
            recipientId: studentId,
            contextId: homeworkId,
            contextKind: 'homework',
            status: 'active',
            updatedAt: binding.createdAt,
          },
        }),
        readBinding: async () => null,
      }),
      createHomeworkSagaRepository: () => ({ read: async () => saga }),
      createHomeworkAuthorityReader: () => ({ read: async () => ({ value: authority, updateTime: '2026-09-01T00:00:00.000Z' }) }),
      createResultRepository: () => ({
        listGroupSummaries: async () => [],
        listAttemptSummaries: async () => [summary],
        readResultDetail: async () => null,
      }),
      createEvaluationRepository: () => ({ listHistory: async () => [] }),
      readUser: async () => ({ role: 'student', status: 'active' }),
    });

    await expect(handlers.resultSummary({
      request: new Request('https://worker.test/results'),
      env: {},
      uid: studentId,
      bookId,
      studentId,
      homeworkId,
      contextKind: 'homework',
    })).resolves.toMatchObject({ init: { status: 200 }, body: { groups: [] } });
    await expect(handlers.groupedAttempt({
      request: new Request('https://worker.test/results'),
      env: {},
      uid: studentId,
      bookId,
      studentId,
      homeworkId,
      contextKind: 'homework',
      groupKey: bookResultGroupKey(studentId, 'activity-1'),
    })).resolves.toMatchObject({ init: { status: 200 }, body: { group: { attemptCount: 1 } } });

    // The Public authority is covered by its production tests and the browser flow;
    // this block fences the shared result index against that authorized binding.
    const publicAuthorization = vi.spyOn(publicBookProduction, 'authorizePublicBookBinding').mockResolvedValue(true);
    try {
      const publicBinding: BookDeliveryBinding = { ...binding,
        context: { ...binding.context, kind: 'public', entitlementBasis: 'public-library' } };
      let publicAttempt: BookResultAttemptSummary = { ...summary, surface: 'public', homeworkId: null,
        evaluationStatus: 'submitted', evaluation: { status: 'submitted' },
        feedback: { release: 'not-applicable', available: false } };
      const publicHandlers = createBookResultReadProductionHandlers({
        createDeliveryRepository: () => ({ resolveCurrent: async () => ({
          record: { binding: publicBinding, recordRevision: 1, status: 'active', createdAt: binding.createdAt, updatedAt: binding.createdAt },
          pointer: { bindingId, bindingRevision: 1, recipientId: studentId, contextId: homeworkId,
            contextKind: 'public', status: 'active', updatedAt: binding.createdAt },
        }), readBinding: async () => null }),
        createResultRepository: () => ({ listGroupSummaries: async () => [{ schemaVersion: 1,
          groupKey: bookResultGroupKey(studentId, 'activity-1'), studentId, recipientId: studentId,
          activityId: 'activity-1', bookId, attemptCount: 1, latestAttemptId: summary.attemptId,
          latestResultId: summary.resultId, latestAttemptNumber: 1, latestSubmittedAt: summary.submittedAt,
          latestCreatedAt: summary.createdAt, latestEvaluationStatus: 'submitted', latestFeedbackRelease: 'not-applicable',
          contexts: [{ contextId: homeworkId, deliveryId: bindingId, surface: 'public', attemptCount: 1 }] }],
          listAttemptSummaries: async () => [publicAttempt], readResultDetail: async () => null }),
        createEvaluationRepository: () => ({ listHistory: async () => { throw new Error('public_must_not_read_grades'); } }),
        readUser: async () => ({ role: 'student', status: 'active' }),
      });
      const publicInput = { request: new Request('https://worker.test/results'), env: {}, uid: studentId,
        bookId, studentId, contextKind: 'public' as const, contextId: homeworkId,
        groupKey: bookResultGroupKey(studentId, 'activity-1') };
      await expect(publicHandlers.resultSummary(publicInput)).resolves.toMatchObject({ init: { status: 200 },
        body: { groups: [{ contexts: [{ surface: 'public', contextId: homeworkId }] }] } });
      await expect(publicHandlers.groupedAttempt(publicInput)).resolves.toMatchObject({ init: { status: 200 },
        body: { group: { attemptCount: 1, attempts: [{ surface: 'public', evaluation: { status: 'submitted' },
          feedback: { release: 'not-applicable', available: false } }] } } });
      publicAttempt = { ...publicAttempt, ownerId: 'wrong-owner' };
      await expect(publicHandlers.groupedAttempt(publicInput)).resolves.toMatchObject({ init: { status: 500 } });
      publicAttempt = { ...publicAttempt, ownerId, contextId: 'wrong-context' };
      await expect(publicHandlers.groupedAttempt(publicInput)).resolves.toMatchObject({ init: { status: 500 } });
    } finally { publicAuthorization.mockRestore(); }

    const fullBinding = binding;
    const fullAuthority = authority;
    const document = createComponentStudentDocument({
      sourceVersionId: 'combined-v1', descriptorRevision: 1, sha256Hex: 'a'.repeat(64),
      byteSize: 1024, physicalPageCount: 3, compositionFingerprint: 'composition-1',
      components: [
        { sourceKey: 'intro', sourceVersionId: 'intro-v1', sourceOrder: 1, ownerNodeKey: 'unit-1', localPageCount: 2, combinedStartPage: 1, combinedEndPage: 2 },
        { sourceKey: 'full', sourceVersionId: 'source-v1', sourceOrder: 2, ownerNodeKey: 'unit-1', localPageCount: 1, combinedStartPage: 3, combinedEndPage: 3 },
      ],
    });
    binding = { ...binding, sourceSet: { strategy: 'component_pdfs', sources: document.components.map((component) => ({
      sourceKey: component.sourceKey, sourceVersionId: component.sourceVersionId, lifecycle: 'verified-usable',
      sourceOrder: component.sourceOrder, ownerNodeKey: component.ownerNodeKey, localPageScope: { kind: 'all', pages: [] },
    })) } };
    authority = { ...authority, bookManifest: { ...authority.bookManifest,
      studentDocument: { sourceVersionId: document.sourceVersionId, descriptorRevision: document.descriptorRevision, sha256Hex: document.sha256Hex },
      targetPreview: { fingerprint: 'preview-1', includedCount: 1, excludedCount: 0, excludedReasonCounts: {}, rows: [{ placementId, activityId: 'activity-1', nodeKey: 'unit-1', state: 'included' }] },
      bindings: authority.bookManifest.bindings.map((entry) => ({ ...entry, sourceContext: [{ sourceKey: 'student-document', sourceVersionId: document.sourceVersionId, physicalPageNumbers: [3] }] })),
    } };
    const successorDocument = createComponentStudentDocument({
      ...document, sourceVersionId: 'combined-v2', descriptorRevision: 2,
    });
    publicationScope = { versions: { 'manifest-1': { strategy: 'component_pdfs', manifest: { sourceSet: binding.sourceSet } } },
      studentDocuments: { [document.sourceVersionId]: document, [successorDocument.sourceVersionId]: successorDocument } };
    const componentInput = { request: new Request('https://worker.test/results'), env: {}, uid: studentId, bookId, studentId,
      homeworkId, contextKind: 'homework' as const, groupKey: bookResultGroupKey(studentId, 'activity-1') };
    await expect(handlers.groupedAttempt(componentInput)).resolves.toMatchObject({ init: { status: 200 }, body: { group: { attemptCount: 1 } } });
    const completeSourceSet = binding.sourceSet;
    binding = { ...binding, sourceSet: { ...binding.sourceSet, sources: binding.sourceSet.sources.filter((source) => source.sourceKey === 'full') } };
    await expect(handlers.groupedAttempt(componentInput)).resolves.toMatchObject({ init: { status: 200 }, body: { group: { attemptCount: 1 } } });
    binding = { ...binding, sourceSet: { ...binding.sourceSet, sources: binding.sourceSet.sources.map((source) => ({ ...source, sourceVersionId: 'unpublished-source' })) } };
    await expect(handlers.groupedAttempt(componentInput)).resolves.toMatchObject({ init: { status: 403 } });
    binding = { ...binding, sourceSet: completeSourceSet };
    const componentAuthority = authority;
    authority = { ...authority, bookManifest: { ...authority.bookManifest, studentDocument: { ...authority.bookManifest.studentDocument!, descriptorRevision: 2 } } };
    await expect(handlers.groupedAttempt(componentInput)).resolves.toMatchObject({ init: { status: 403 } });
    authority = componentAuthority;
    binding = { ...binding, placements: binding.placements.map((placement) => ({ ...placement, sourcePageScopes: [{ sourceKey: 'full', pages: [2] }] })) };
    await expect(handlers.groupedAttempt(componentInput)).resolves.toMatchObject({ init: { status: 403 } });
    binding = fullBinding;
    authority = fullAuthority;
    const historicalBinding: BookDeliveryBinding = {
      ...binding,
      bindingId: 'binding-old',
      status: 'revoked',
      sourceSet: {
        ...binding.sourceSet,
        sources: binding.sourceSet.sources.map((source) => ({ ...source, sourceVersionId: 'source-v0' })),
      },
    };
    const historicalSummary: BookResultAttemptSummary = {
      ...summary,
      bindingId: historicalBinding.bindingId,
      deliveryId: historicalBinding.bindingId,
      sourceProvenance: [{ pages: [1], sourceKey: 'full', sourceVersionId: 'source-v0' }],
    };
    const historicalGroup = {
      schemaVersion: 1 as const,
      groupKey: bookResultGroupKey(studentId, 'activity-1'),
      studentId,
      recipientId: studentId,
      activityId: 'activity-1',
      homeworkId,
      bookId,
      attemptCount: 1,
      latestAttemptId: historicalSummary.attemptId,
      latestResultId: historicalSummary.resultId,
      latestAttemptNumber: historicalSummary.attemptNumber,
      latestSubmittedAt: historicalSummary.submittedAt,
      latestCreatedAt: historicalSummary.createdAt,
      latestEvaluationStatus: historicalSummary.evaluationStatus,
      latestFeedbackRelease: historicalSummary.feedback.release,
      contexts: [{
        contextId: homeworkId,
        deliveryId: historicalBinding.bindingId,
        surface: 'homework' as const,
        attemptCount: 1,
      }],
    };
    let historicalAttempt = historicalSummary;
    let evaluationRows: readonly any[] = [];
    let evaluationReadFails = false;
    const historicalHandlers = createBookResultReadProductionHandlers({
      createDeliveryRepository: () => ({
        resolveCurrent: async () => ({
          record: { binding, recordRevision: 1, status: 'active', createdAt: binding.createdAt, updatedAt: binding.createdAt },
          pointer: {
            bindingId,
            bindingRevision: 1,
            recipientId: studentId,
            contextId: homeworkId,
            contextKind: 'homework',
            status: 'active',
            updatedAt: binding.createdAt,
          },
        }),
        readBinding: async (bindingId: string) => bindingId === historicalBinding.bindingId
          ? {
            binding: historicalBinding,
            recordRevision: 1,
            status: 'revoked' as const,
            createdAt: historicalBinding.createdAt,
            updatedAt: historicalBinding.createdAt,
          }
          : null,
      }),
      createHomeworkSagaRepository: () => ({ read: async () => saga }),
      createHomeworkAuthorityReader: () => ({ read: async () => ({ value: authority, updateTime: '2026-09-01T00:00:00.000Z' }) }),
      createResultRepository: () => ({
        listGroupSummaries: async () => [historicalGroup],
        listAttemptSummaries: async () => [historicalAttempt],
        readResultDetail: async () => ({ ...historicalSummary, response: {} }),
      }),
      createEvaluationRepository: () => ({ listHistory: async ({ limit }) => {
        if (evaluationReadFails) throw new Error('evaluation read failed');
        return evaluationRows.slice(-limit);
      } }),
      readUser: async () => ({ role: 'teacher', status: 'active' }),
    });
    const historicalInput = {
      request: new Request('https://worker.test/results'),
      env: {},
      uid: ownerId,
      bookId,
      studentId,
      homeworkId,
      contextKind: 'homework' as const,
    };
    const evaluationTarget = {
      attemptId: historicalSummary.attemptId, resultId: historicalSummary.resultId,
      recipientId: studentId, bindingId: historicalSummary.bindingId, bindingRevision: 1,
      contextKind: 'homework' as const, contextId: homeworkId, placementId,
      activityId: historicalSummary.activityId, activityVersion: 1,
      interactionId: historicalSummary.interactionId, activityVersionId: historicalSummary.activityVersionId,
      attemptNumber: 1, pageGroupKeys: historicalSummary.pageGroupKeys,
      sourceProvenance: historicalSummary.sourceProvenance,
    };
    evaluationRows = [{
      schemaVersion: 1, revision: 1, previousRevision: 0, operationId: 'grade-1',
      commandKind: 'teacher_evaluation', commandFingerprint: 'grade-1', scorerVersion: 1,
      activitySchemaVersion: 1, target: evaluationTarget,
      facts: { status: 'scored', earnedScore: 7, maximumScore: 10, displayScore: '7.00 / 10.00', feedback: 'First', correctionFacts: [] },
      evaluatedBy: { kind: 'teacher', uid: ownerId }, evaluatedAt: '2026-09-20T00:00:00.000Z',
    }];
    await expect(historicalHandlers.resultDetail({
      ...historicalInput, resultId: historicalSummary.resultId,
    })).resolves.toMatchObject({ body: { detail: {
      evaluation: { revision: 1, score: { earnedScore: 7 } }, feedback: { text: 'First' },
    } } });
    const frozenR1 = structuredClone(evaluationRows[0]);
    evaluationRows = [...evaluationRows, {
      ...evaluationRows[0], revision: 2, previousRevision: 1, operationId: 'regrade-2',
      commandKind: 'regrade', commandFingerprint: 'regrade-2',
      facts: { status: 'scored', earnedScore: 9, maximumScore: 10, displayScore: '9.00 / 10.00', feedback: 'Corrected', correctionFacts: [{ interactionId: 'interaction-1', outcome: 'correct', note: 'Rechecked.' }] },
      evaluatedAt: '2026-09-21T00:00:00.000Z',
    }];
    await expect(historicalHandlers.resultDetail({
      ...historicalInput, resultId: historicalSummary.resultId,
    })).resolves.toMatchObject({ body: { detail: {
      evaluation: { revision: 2, score: { earnedScore: 9 }, correctionNote: 'Rechecked.' },
      feedback: { text: 'Corrected', correctionNote: 'Rechecked.' },
    } } });
    expect(evaluationRows[0]).toEqual(frozenR1);
    evaluationReadFails = true;
    await expect(historicalHandlers.resultDetail({
      ...historicalInput, resultId: historicalSummary.resultId,
    })).resolves.toMatchObject({ init: { status: 500 }, body: { code: 'book_result_detail_read_failed' } });
    evaluationReadFails = false;
    await expect(historicalHandlers.resultSummary(historicalInput)).resolves.toMatchObject({
      init: { status: 200 },
      body: { groups: [expect.objectContaining({
        contexts: [expect.objectContaining({ deliveryId: 'binding-old' })],
      })] },
    });
    await expect(historicalHandlers.groupedAttempt({
      ...historicalInput,
      groupKey: bookResultGroupKey(studentId, 'activity-1'),
    })).resolves.toMatchObject({ init: { status: 200 }, body: { group: { attemptCount: 1 } } });
    await expect(historicalHandlers.resultDetail({
      ...historicalInput,
      resultId: historicalSummary.resultId,
    })).resolves.toMatchObject({ init: { status: 200 }, body: { detail: { attemptId: historicalSummary.attemptId } } });
    historicalAttempt = {
      ...historicalSummary,
      sourceProvenance: [{ pages: [1], sourceKey: 'full', sourceVersionId: 'source-v1' }],
    };
    await expect(historicalHandlers.groupedAttempt({
      ...historicalInput,
      groupKey: bookResultGroupKey(studentId, 'activity-1'),
    })).resolves.toMatchObject({
      init: { status: 500 }, body: { code: 'book_result_grouped_attempt_read_failed' },
    });
  });
});
