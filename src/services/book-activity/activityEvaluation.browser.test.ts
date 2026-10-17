import { describe, expect, it, vi } from 'vitest';
import type {
  BookActivityEvaluationRevision,
  BookActivityEvaluationTarget,
} from './activityEvaluation.types';
import {
  BookActivityEvaluationBrowserError,
  createBookActivityEvaluationBrowserClient,
  type BookActivityEvaluationLocator,
} from './activityEvaluation.browser';

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
  sourceProvenance: [{
    sourceKey: 'source-1',
    sourceVersionId: 'source-version-1',
    pages: [1],
  }],
};

const locator: BookActivityEvaluationLocator = {
  bookId: 'book-1',
  studentId: target.recipientId,
  contextKind: target.contextKind,
  contextId: target.contextId,
  placementId: target.placementId,
  activityId: target.activityId,
  activityVersionId: target.activityVersionId,
  attemptId: target.attemptId,
};

const revision = (value: number): BookActivityEvaluationRevision => ({
  schemaVersion: 1,
  revision: value,
  previousRevision: value - 1,
  operationId: `operation-${value}`,
  commandKind: value === 1 ? 'teacher_evaluation' : 'regrade',
  commandFingerprint: `fingerprint-${value}`,
  scorerVersion: 1,
  activitySchemaVersion: 1,
  target,
  facts: {
    status: 'scored',
    earnedScore: value,
    maximumScore: 2,
    displayScore: `${value.toFixed(2)} / 2.00`,
    feedback: `Feedback ${value}`,
    correctionFacts: value === 1 ? [] : [{
      interactionId: target.interactionId,
      outcome: 'correct',
      note: 'Corrected result',
    }],
  },
  evaluatedBy: { kind: 'teacher', uid: 'teacher-1' },
  evaluatedAt: `2026-08-0${value}T00:00:00.000Z`,
});

const jsonResponse = (
  body: unknown,
  status = 200,
): Response => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
});

const history = (
  revisions: readonly BookActivityEvaluationRevision[],
): Response => jsonResponse({
  target,
  submission: { response: { text: 'Student work' } },
  history: revisions,
});

const options = (fetchImpl: typeof fetch) => ({
  baseUrl: 'https://book-evaluation.example.test',
  env: { VITE_BOOK_ACTIVITY_EVALUATION_PRESENTATION: 'enabled' },
  fetchImpl,
  getIdToken: vi.fn(async () => 'firebase-token'),
  createOperationId: () => 'operation-browser-1',
});

describe('createBookActivityEvaluationBrowserClient', () => {
  it('fails closed when presentation is not explicitly enabled', () => {
    expect(() => createBookActivityEvaluationBrowserClient({
      baseUrl: 'https://book-evaluation.example.test',
      env: {},
    })).toThrowError(expect.objectContaining({ code: 'presentation_disabled' }));
  });

  it('reads immutable current and prior revisions without exposing target or actor identifiers', async () => {
    const fetchImpl = vi.fn(async () => history([revision(1), revision(2)]));
    const client = createBookActivityEvaluationBrowserClient(options(fetchImpl as typeof fetch));

    const result = await client.readTeacherEvaluation(locator);

    expect(result.current?.revision).toBe(2);
    expect(result.priorRevisions.map((entry) => entry.revision)).toEqual([1]);
    expect(result.current?.evaluatedBy).toBe('teacher');
    expect(result).not.toHaveProperty('target');
    expect(result.current).not.toHaveProperty('operationId');
    expect(result.current).not.toHaveProperty('evaluatedBy.uid');
    expect(Object.isFrozen(result)).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining('/book-evaluation/history/book-1/student-1?'),
      expect.objectContaining({
        method: 'GET',
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        headers: expect.objectContaining({
          authorization: 'Bearer firebase-token',
        }),
      }),
    );
  });

  it('grades and regrades only through #89 command envelopes', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(history([]))
      .mockResolvedValueOnce(jsonResponse({ status: 'accepted', revision: revision(1) }))
      .mockResolvedValueOnce(history([revision(1)]))
      .mockResolvedValueOnce(history([revision(1)]))
      .mockResolvedValueOnce(jsonResponse({ status: 'accepted', revision: revision(2) }))
      .mockResolvedValueOnce(history([revision(2), revision(1)]));
    const client = createBookActivityEvaluationBrowserClient(options(fetchImpl as typeof fetch));

    const graded = await client.grade({
      locator,
      expectedRevision: 0,
      earnedScore: 1,
      maximumScore: 2,
      feedback: 'Initial feedback',
    });
    const regraded = await client.regrade({
      locator,
      expectedRevision: 1,
      earnedScore: 2,
      maximumScore: 2,
      feedback: 'Corrected feedback',
      correctionNote: 'Corrected after review.',
    });

    expect(graded.current?.revision).toBe(1);
    expect(regraded.current?.revision).toBe(2);
    const gradeRequest = fetchImpl.mock.calls[1]!;
    const regradeRequest = fetchImpl.mock.calls[4]!;
    expect(gradeRequest[0]).toBe('https://book-evaluation.example.test/book-evaluation/commands');
    expect(regradeRequest[0]).toBe('https://book-evaluation.example.test/book-evaluation/commands');
    const gradeBody = JSON.parse(String((gradeRequest[1] as RequestInit).body));
    const regradeBody = JSON.parse(String((regradeRequest[1] as RequestInit).body));
    expect(gradeBody).toEqual({
      command: expect.objectContaining({
        kind: 'teacher_evaluation',
        expectedEvaluationRevision: 0,
        target,
      }),
    });
    expect(regradeBody.command).toMatchObject({
      kind: 'regrade',
      expectedEvaluationRevision: 1,
      target,
      evaluation: {
        earnedScore: 2,
        maximumScore: 2,
        feedback: 'Corrected feedback',
        correctionFacts: [{
          interactionId: target.interactionId,
          outcome: 'not_applicable',
          note: 'Corrected after review.',
        }],
      },
    });
    expect(JSON.stringify(regradeBody)).not.toMatch(
      /serviceIdentity|serviceCredential|google_sa/iu,
    );
  });

  it('detects a stale preflight and does not issue a command', async () => {
    const fetchImpl = vi.fn(async () => history([revision(2), revision(1)]));
    const client = createBookActivityEvaluationBrowserClient(options(fetchImpl as typeof fetch));

    await expect(client.regrade({
      locator,
      expectedRevision: 1,
      earnedScore: 2,
      maximumScore: 2,
      correctionNote: 'Correction',
    })).rejects.toMatchObject({
      code: 'stale_conflict',
      currentRevision: 2,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    [403, { code: 'evaluation_actor_unauthorized' }, 'forbidden'],
    [404, { code: 'evaluation_attempt_not_found' }, 'not_found'],
    [409, { code: 'evaluation_stale_revision', currentRevision: 3 }, 'stale_conflict'],
    [429, { code: 'rate_limited' }, 'retryable'],
    [503, { code: 'book_route_disabled' }, 'route_disabled'],
    [500, { code: 'internal' }, 'retryable'],
  ])('classifies HTTP %s without reflecting server detail', async (status, body, code) => {
    const client = createBookActivityEvaluationBrowserClient(options(
      vi.fn(async () => jsonResponse(body, status)) as typeof fetch,
    ));
    await expect(client.readTeacherEvaluation(locator)).rejects.toEqual(
      expect.objectContaining({ code }),
    );
  });

  it('refreshes an expired token once and then reports authorization loss', async () => {
    const getIdToken = vi.fn()
      .mockResolvedValueOnce('expired')
      .mockResolvedValueOnce('fresh');
    const successFetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 'unauthorized' }, 401))
      .mockResolvedValueOnce(history([]));
    const success = createBookActivityEvaluationBrowserClient({
      ...options(successFetch as typeof fetch),
      getIdToken,
    });
    await expect(success.readTeacherEvaluation(locator)).resolves.toMatchObject({ current: null });
    expect(getIdToken).toHaveBeenNthCalledWith(2, true);

    const denied = createBookActivityEvaluationBrowserClient({
      ...options(vi.fn(async () => jsonResponse({ code: 'unauthorized' }, 401)) as typeof fetch),
      getIdToken: vi.fn(async () => 'token'),
    });
    await expect(denied.readTeacherEvaluation(locator)).rejects.toMatchObject({
      code: 'unauthorized',
    });
  });

  it('rejects malformed history and hidden student responses carrying denied fields', async () => {
    const malformedHistory = createBookActivityEvaluationBrowserClient(options(
      vi.fn(async () => jsonResponse({
        target,
        submission: { response: 'answer' },
        history: [revision(1), revision(1)],
      })) as typeof fetch,
    ));
    await expect(malformedHistory.readTeacherEvaluation(locator)).rejects.toMatchObject({
      code: 'invalid_response',
    });

    const crossContextHistory = createBookActivityEvaluationBrowserClient(options(
      vi.fn(async () => history([{
        ...revision(1),
        target: { ...target, contextId: 'homework-2' },
      }])) as typeof fetch,
    ));
    await expect(crossContextHistory.readTeacherEvaluation(locator)).rejects.toMatchObject({
      code: 'invalid_response',
    });

    const unsafeHidden = createBookActivityEvaluationBrowserClient(options(
      vi.fn(async () => jsonResponse({
        result: {
          attemptId: target.attemptId,
          status: 'hidden',
          answerKey: 'denied',
        },
      })) as typeof fetch,
    ));
    await expect(unsafeHidden.readStudentResult(locator)).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });

  it('accepts a policy-filtered student result and rejects invalid input before fetch', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      result: {
        attemptId: target.attemptId,
        status: 'graded',
        studentResponse: 'Student response',
        score: {
          earnedScore: 1,
          maximumScore: 2,
          displayScore: '1.00 / 2.00',
        },
      },
    }));
    const client = createBookActivityEvaluationBrowserClient(options(fetchImpl as typeof fetch));
    await expect(client.readStudentResult(locator)).resolves.toEqual({
      attemptId: target.attemptId,
      status: 'graded',
      studentResponse: 'Student response',
      score: {
        earnedScore: 1,
        maximumScore: 2,
        displayScore: '1.00 / 2.00',
      },
    });
    await expect(client.regrade({
      locator,
      expectedRevision: 1,
      earnedScore: 1,
      maximumScore: 2,
    })).rejects.toBeInstanceOf(BookActivityEvaluationBrowserError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
