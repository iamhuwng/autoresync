import { describe, expect, it, vi } from 'vitest';
import type {
  BookResultAttemptDetail,
  BookResultAttemptSummary,
  BookResultGroupSummary,
} from './book-activity/results/bookResult.types';
import {
  BookResultBrowserError,
  createBookResultBrowserClient,
  createBookResultRouteHandle,
  parseBookResultRouteHandle,
} from './bookResult.browser';
import { bookResultGroupKey } from './book-activity/results/bookResult.types';

const address = {
  bookId: 'book-1',
  studentId: 'student-1',
  groupKey: bookResultGroupKey('student-1', 'activity-1'),
} as const;

const summary = {
  schemaVersion: 1,
  attemptId: 'attempt-1',
  resultId: 'result-1',
  completionId: 'completion-1',
  recipientId: 'student-1',
  studentId: 'student-1',
  activityId: 'activity-1',
  contextId: 'homework-1',
  placementId: 'placement-1',
  bindingId: 'binding-1',
  bindingRevision: 2,
  activityVersionId: 'activity-1@4',
  activityVersion: 4,
  interactionId: 'interaction-1',
  attemptNumber: 1,
  surface: 'homework',
  deliveryContextId: 'homework-1',
  deliveryId: 'delivery-1',
  ownerId: 'teacher-1',
  homeworkId: 'homework-1',
  pageGroupKeys: [],
  sourceProvenance: [],
  sources: [],
  sourceAvailability: 'not-required',
  sourceAvailable: false,
  createdAt: '2026-07-31T00:00:00.000Z',
  submittedAt: '2026-07-31T00:00:00.000Z',
  completedAt: '2026-07-31T00:00:00.000Z',
  resultStatus: 'submitted',
  evaluationStatus: 'pending_review',
  completionStatus: 'completed',
  completion: {
    completionId: 'completion-1',
    attemptId: 'attempt-1',
    resultId: 'result-1',
    status: 'completed',
    contextId: 'homework-1',
    placementId: 'placement-1',
    activityVersionId: 'activity-1@4',
    activityVersion: 4,
    createdAt: '2026-07-31T00:00:00.000Z',
  },
  evaluation: { status: 'pending_review' },
  feedback: { release: 'withheld', available: false },
  attemptLimit: 2,
  attemptsUsed: 1,
  attemptsRemaining: 1,
} satisfies BookResultAttemptSummary;

const group = {
  groupKey: address.groupKey,
  recipientId: address.studentId,
  studentId: address.studentId,
  activityId: 'activity-1',
  attemptCount: 1,
  attempts: [summary],
  contexts: [{
    contextId: 'homework-1',
    placementId: 'placement-1',
    surface: 'homework',
    attemptLimit: 2,
    attemptsUsed: 1,
    attemptsRemaining: 1,
    completionStatus: 'completed',
    latestAttemptId: 'attempt-1',
    attemptIds: ['attempt-1'],
  }],
  latestAttemptId: 'attempt-1',
} satisfies BookResultGroupSummary;

const detail = {
  ...summary,
  response: { selected: 'A' },
} satisfies BookResultAttemptDetail;

describe('bookResult.browser', () => {
  it('round-trips an opaque route handle without delimiter inference', () => {
    const handle = createBookResultRouteHandle(address);
    expect(handle).toMatch(/^br_[A-Za-z0-9_-]+$/u);
    expect(handle).not.toContain(address.studentId);
    expect(parseBookResultRouteHandle(handle)).toEqual(address);
    expect(parseBookResultRouteHandle('br_not-json')).toBeNull();
  });

  it('performs one bounded group request through the authenticated Worker route', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ group }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    const client = createBookResultBrowserClient({
      baseUrl: 'https://book-results.example.test',
      fetchImpl,
      getIdToken: async () => 'id-token',
    });

    await expect(client.readGroup(address)).resolves.toEqual(group);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      `https://book-results.example.test/v1/book-evaluation/results/book-1/student-1/groups/${address.groupKey}`,
    );
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({
      method: 'GET',
      cache: 'no-store',
      credentials: 'omit',
      headers: expect.objectContaining({ authorization: 'Bearer id-token' }),
    });
  });

  it('reads only the selected result detail', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ detail }), { status: 200 }));
    const client = createBookResultBrowserClient({
      baseUrl: 'https://book-results.example.test',
      fetchImpl,
      getIdToken: async () => 'id-token',
    });

    await expect(client.readDetail(address, 'result-1')).resolves.toEqual(detail);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toContain('/details/result-1');
  });

  it('uses a canonical path locator for teacher Homework reads without query authority', async () => {
    const homeworkAddress = { ...address, homeworkId: 'homework-1' } as const;
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ group }), {
      status: 200,
    }));
    const client = createBookResultBrowserClient({
      baseUrl: 'https://book-results.example.test',
      fetchImpl,
      getIdToken: async () => 'id-token',
    });

    await expect(client.readGroup(homeworkAddress)).resolves.toEqual(group);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      `https://book-results.example.test/v1/book-evaluation/results/book-1/student-1`
        + `/homework/homework-1/groups/${address.groupKey}`,
    );
    expect(fetchImpl.mock.calls[0]?.[0]).not.toContain('?');
  });

  it('rejects malformed, cross-student, and over-budget responses', async () => {
    const malformed = createBookResultBrowserClient({
      baseUrl: 'https://book-results.example.test',
      getIdToken: async () => 'id-token',
      fetchImpl: async () => new Response(JSON.stringify({
        group: { ...group, studentId: 'student-2' },
      }), { status: 200 }),
    });
    await expect(malformed.readGroup(address)).rejects.toMatchObject({
      code: 'invalid_response',
    } satisfies Partial<BookResultBrowserError>);

    const oversized = createBookResultBrowserClient({
      baseUrl: 'https://book-results.example.test',
      getIdToken: async () => 'id-token',
      fetchImpl: async () => new Response('{}', {
        status: 200,
        headers: { 'content-length': String(300 * 1024) },
      }),
    });
    await expect(oversized.readGroup(address)).rejects.toMatchObject({
      code: 'invalid_response',
    } satisfies Partial<BookResultBrowserError>);
  });

  it('maps server visibility denial without falling back to database reads', async () => {
    const fetchImpl = vi.fn(async () => new Response(
      JSON.stringify({ code: 'book_result_forbidden' }),
      { status: 403 },
    ));
    const client = createBookResultBrowserClient({
      baseUrl: 'https://book-results.example.test',
      fetchImpl,
      getIdToken: async () => 'id-token',
    });

    await expect(client.readGroup(address)).rejects.toMatchObject({
      code: 'forbidden',
      status: 403,
    } satisfies Partial<BookResultBrowserError>);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
