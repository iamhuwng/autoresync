import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BookActivityEvaluationBrowserError,
  createBookActivityEvaluationBrowserClient,
} from '../../src/services/book-activity/activityEvaluation.browser';
import preview, {
  resetTicket90PreviewForTests,
} from '../src/upload-worker/book-activity-grading/ticket90-preview-worker';
import rollback from '../src/upload-worker/book-activity-grading/ticket90-preview-rollback-worker';

const locator = {
  bookId: 'book-1',
  studentId: 'student-1',
  contextKind: 'homework' as const,
  contextId: 'homework-1',
  placementId: 'placement-1',
  activityId: 'activity-1',
  activityVersionId: 'activity-version-1',
  attemptId: 'attempt-1',
};

const workerFetch: typeof fetch = async (input, init) => {
  const request = input instanceof Request
    ? new Request(input, init)
    : new Request(input, init);
  return preview.fetch(request);
};

const client = (operationIds: readonly string[]) => {
  let index = 0;
  return createBookActivityEvaluationBrowserClient({
    baseUrl: 'https://preview.test',
    env: { VITE_BOOK_ACTIVITY_EVALUATION_PRESENTATION: 'enabled' },
    fetchImpl: workerFetch,
    getIdToken: vi.fn(async () => 'teacher-token'),
    createOperationId: () => operationIds[index++]!,
  });
};

describe('Ticket #90 production-equivalent preview contract', () => {
  beforeEach(() => {
    resetTicket90PreviewForTests();
  });

  it('exercises #89 trusted grade/regrade and indexed immutable history through the browser adapter', async () => {
    const adapter = client(['preview-grade-1', 'preview-regrade-1']);

    const graded = await adapter.grade({
      locator,
      expectedRevision: 0,
      earnedScore: 1,
      maximumScore: 2,
      feedback: 'Initial feedback',
    });
    const regraded = await adapter.regrade({
      locator,
      expectedRevision: 1,
      earnedScore: 2,
      maximumScore: 2,
      feedback: 'Corrected feedback',
      correctionNote: 'Corrected after review.',
    });

    expect(graded.current?.revision).toBe(1);
    expect(regraded.current?.revision).toBe(2);
    expect(regraded.priorRevisions.map((entry) => entry.revision)).toEqual([1]);
    expect(regraded.current?.facts.correctionFacts[0]?.note).toBe(
      'Corrected after review.',
    );

    const response = await preview.fetch(new Request('https://preview.test/proof'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      proofKind: 'prd0062-ticket90-production-equivalent',
      pass: true,
      productionRepository: {
        kind: 'firebase-rest-cas',
        protectedRoot: 'book_activity_evaluations',
      },
      presentationHistory: { indexedHistoryReads: 1 },
      deniedProjection: { attemptId: 'attempt-1', status: 'hidden' },
      deniedFieldsAbsent: true,
    });
  });

  it('returns policy-filtered student correction and exact hidden denial through the adapter', async () => {
    const teacher = client(['preview-grade-1', 'preview-regrade-1']);
    await teacher.grade({
      locator,
      expectedRevision: 0,
      earnedScore: 1,
      maximumScore: 2,
      feedback: 'Initial feedback',
    });
    await teacher.regrade({
      locator,
      expectedRevision: 1,
      earnedScore: 2,
      maximumScore: 2,
      feedback: 'Corrected feedback',
      correctionNote: 'Corrected after review.',
    });
    const student = createBookActivityEvaluationBrowserClient({
      baseUrl: 'https://preview.test',
      env: { VITE_BOOK_ACTIVITY_EVALUATION_PRESENTATION: 'enabled' },
      fetchImpl: workerFetch,
      getIdToken: vi.fn(async () => 'student-token'),
    });

    await expect(student.readStudentResult(locator)).resolves.toMatchObject({
      attemptId: 'attempt-1',
      status: 'graded',
      score: { earnedScore: 2, maximumScore: 2 },
      feedback: 'Corrected feedback',
      correction: {
        note: 'Corrected after review.',
        revision: 2,
        previousRevision: 1,
      },
    });
    const denied = await student.readStudentResult({
      ...locator,
      studentId: 'student-denied',
    });
    expect(denied).toEqual({ attemptId: 'attempt-1', status: 'hidden' });
    expect(JSON.stringify(denied)).not.toMatch(
      /answerKey|correctness|score|feedback|correction/iu,
    );
  });

  it('surfaces stale conflict and proves rollback is hidden and non-writing', async () => {
    const first = client(['preview-grade-1', 'preview-regrade-a']);
    const second = client(['preview-regrade-b']);
    await first.grade({
      locator,
      expectedRevision: 0,
      earnedScore: 1,
      maximumScore: 2,
    });
    await second.regrade({
      locator,
      expectedRevision: 1,
      earnedScore: 1.5,
      maximumScore: 2,
      correctionNote: 'Second writer.',
    });

    await expect(first.regrade({
      locator,
      expectedRevision: 1,
      earnedScore: 2,
      maximumScore: 2,
      correctionNote: 'Stale writer.',
    })).rejects.toEqual(expect.objectContaining({
      code: 'stale_conflict',
      currentRevision: 2,
    }) satisfies Partial<BookActivityEvaluationBrowserError>);

    const response = await rollback.fetch(new Request('https://preview.test/proof'));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      code: 'ticket90_preview_rollback_hidden',
      teacherPresentation: 'hidden',
      studentEvaluation: { status: 'hidden' },
      evaluationHistory: 'preserved',
      submissions: 'preserved',
      writable: false,
      boundDataStores: 0,
    });
  });

  it('supports credential-free browser preflight and fails closed outside owned routes', async () => {
    const preflight = await preview.fetch(new Request(
      'https://preview.test/book-evaluation/commands',
      { method: 'OPTIONS' },
    ));
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-methods')).toBe(
      'GET, POST, OPTIONS',
    );
    expect((await preview.fetch(new Request('https://preview.test/other'))).status).toBe(503);
  });
});
