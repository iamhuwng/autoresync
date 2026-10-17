import { describe, expect, it, vi } from 'vitest';
import {
  InMemoryBookResultReadRepository,
  FirebaseBookResultReadRepository,
  bookResultAttemptsPath,
  bookResultDetailPath,
  bookResultGroupsPath,
} from '../src/upload-worker/book-results/repository.ts';
import { createBookResultReadWorkerHandlers } from '../src/upload-worker/book-results/worker.ts';
import { bookResultReadRouteDescriptors } from '../src/upload-worker/book-results/route.ts';
import { FirebaseRtdbRestClient } from '../src/upload-worker/listening-authoring/rtdb.ts';
import {
  bookResultGroupKey,
  type BookResultAttemptSummary,
  type BookResultDetail,
  type BookResultGroupSummary,
} from '../src/upload-worker/book-results/types.ts';
import {
  validateBookResultAttemptDetail,
  validateBookResultGroupSummary,
} from '../../src/services/book-activity/results/bookResultProjection.service.ts';

const summary = (overrides: Partial<BookResultAttemptSummary> = {}): BookResultAttemptSummary => ({
  schemaVersion: 1,
  attemptId: 'attempt-1',
  resultId: 'result-1',
  completionId: 'completion-1',
  recipientId: 'student-1',
  studentId: 'student-1',
  activityId: 'activity-1',
  contextId: 'context-1',
  placementId: 'placement-1',
  bindingId: 'binding-1',
  bindingRevision: 1,
  activityVersionId: 'activity-version-1',
  activityVersion: 1,
  interactionId: 'interaction-1',
  attemptNumber: 1,
  surface: 'solo',
  deliveryContextId: 'context-1',
  deliveryId: 'delivery-1',
  ownerId: null,
  homeworkId: null,
  pageGroupKeys: ['page-group-1'],
  sourceProvenance: [{ sourceKey: 'source-1', sourceVersionId: 'source-version-1', pages: [1] }],
  sources: [{
    sourceKey: 'source-1',
    componentId: 'source-1',
    sourceVersionId: 'source-version-1',
    pages: [1],
    availability: 'available',
    available: true,
    displayOnly: false,
  }],
  sourceAvailability: 'available',
  sourceAvailable: true,
  attemptSourceContext: {
    schemaVersion: 1,
    state: 'historical_source_unavailable',
    reason: 'missing_context',
    metadata: null,
    documentResource: null,
  },
  createdAt: '2026-07-31T00:00:00.000Z',
  submittedAt: '2026-07-31T00:00:01.000Z',
  completedAt: '2026-07-31T00:00:02.000Z',
  resultStatus: 'submitted',
  evaluationStatus: 'submitted',
  completionStatus: 'completed',
  completion: {
    completionId: 'completion-1',
    attemptId: 'attempt-1',
    resultId: 'result-1',
    status: 'completed',
    contextId: 'context-1',
    placementId: 'placement-1',
    activityVersionId: 'activity-version-1',
    activityVersion: 1,
    createdAt: '2026-07-31T00:00:02.000Z',
  },
  evaluation: { status: 'submitted' },
  feedback: { release: 'pending', available: false },
  attemptLimit: 3,
  attemptsUsed: 1,
  attemptsRemaining: 2,
  bookId: 'book-1',
  ...overrides,
});

const detail = (overrides: Partial<BookResultDetail> = {}): BookResultDetail => ({
  ...summary(),
  response: { answer: 'submitted', answerKey: 'secret', provider: 'secret' },
  ...overrides,
});

type ProjectionFixture = {
  readonly schemaVersion: 1;
  readonly bookId: string;
  readonly summary: BookResultAttemptSummary;
  readonly detail: BookResultDetail;
};

const projection = (overrides: Partial<BookResultAttemptSummary> = {}): ProjectionFixture => {
  const current = summary(overrides);
  return {
    schemaVersion: 1,
    bookId: 'book-1',
    summary: current,
    detail: detail({ ...current, ...overrides }),
  };
};

const readRepository = (projections: readonly ProjectionFixture[]): InMemoryBookResultReadRepository => {
  const grouped = new Map<string, BookResultAttemptSummary[]>();
  projections.forEach(({ summary: row }) => {
    const key = `${row.bookId}|${row.homeworkId ?? ''}|${bookResultGroupKey(row.studentId, row.activityId)}`;
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  });
  const groups = Object.fromEntries([...grouped.entries()].map(([key, rows]) => {
    const ordered = [...rows].sort((left, right) => (
      left.attemptNumber - right.attemptNumber || left.submittedAt.localeCompare(right.submittedAt)
    ));
    const latest = ordered[ordered.length - 1]!;
    const contexts = new Map<string, BookResultGroupSummary['contexts'][number]>();
    ordered.forEach((row) => {
      const contextKey = `${row.deliveryContextId}|${row.deliveryId}`;
      const current = contexts.get(contextKey);
      contexts.set(contextKey, current
        ? { ...current, attemptCount: current.attemptCount + 1 }
        : {
          contextId: row.deliveryContextId,
          deliveryId: row.deliveryId,
          surface: row.surface,
          attemptCount: 1,
        });
    });
    return [key, {
      schemaVersion: 1,
      groupKey: bookResultGroupKey(latest.studentId, latest.activityId),
      studentId: latest.studentId,
      recipientId: latest.recipientId,
      activityId: latest.activityId,
      homeworkId: latest.homeworkId ?? undefined,
      bookId: latest.bookId,
      attemptCount: ordered.length,
      latestAttemptId: latest.attemptId,
      latestResultId: latest.resultId,
      latestAttemptNumber: latest.attemptNumber,
      latestSubmittedAt: latest.submittedAt,
      latestCreatedAt: latest.createdAt,
      latestEvaluationStatus: latest.evaluationStatus,
      latestFeedbackRelease: latest.feedback.release,
      contexts: [...contexts.values()],
    } satisfies BookResultGroupSummary];
  }));
  return new InMemoryBookResultReadRepository({
    groups,
    attempts: Object.fromEntries(projections.map(({ summary: row }) => [row.resultId, row])),
    details: Object.fromEntries(projections.map(({ detail: row }) => [row.resultId, row])),
  });
};

const request = () => new Request('https://worker.test/v1/book-evaluation/results/book-1/student-1');

describe('Ticket #77 Book result read model', () => {
  it.each(['course', 'class'] as const)('isolates exact %s results and preserves teacher ownership and student release', async (contextKind) => {
    const contextId = `${contextKind}:placement-1`;
    const row = projection({ surface: contextKind, contextId, deliveryContextId: contextId,
      ownerId: 'teacher-1', evaluation: { status: 'graded', earnedScore: 3, maximumScore: 5, displayScore: '3.00 / 5.00' } });
    const repository = readRepository([row]);
    let current = true;
    const handlers = createBookResultReadWorkerHandlers({ repository,
      resolveViewerRole: ({ uid }) => uid.startsWith('teacher') ? 'teacher' : 'student',
      resolveHomeworkAuthorities: async () => ({}),
      resolveContextAuthority: async () => current ? { contextKind, contextId, studentId: 'student-1', bookId: 'book-1', ownerId: 'teacher-1' } : null,
    });
    const input = { request: request(), env: {}, bookId: 'book-1', studentId: 'student-1', contextKind, contextId, resultId: row.detail.resultId };
    expect(bookResultGroupsPath(input)).toContain(`/contexts/${contextKind}/${contextId}/`);
    const student = await handlers.resultDetail({ ...input, uid: 'student-1' });
    expect(student).toMatchObject({ body: { detail: { studentFeedbackRelease: 'withheld', evaluation: { status: 'graded' } } } });
    expect((student.body as { detail: BookResultDetail }).detail.evaluation.earnedScore).toBeUndefined();
    expect(await handlers.resultDetail({ ...input, uid: 'teacher-1' })).toMatchObject({ body: { detail: { evaluation: { earnedScore: 3 } } } });
    for (const uid of ['student-other', 'teacher-other']) expect(await handlers.resultDetail({ ...input, uid })).toMatchObject({ init: { status: 403 } });
    expect(await handlers.resultDetail({ ...input, uid: 'student-1', contextId: 'crossed-context' })).toMatchObject({ init: { status: 403 } });
    current = false;
    expect(await handlers.resultDetail({ ...input, uid: 'student-1' })).toMatchObject({ init: { status: 403 } });
  });
  it('publishes contributor descriptors without mutating the canonical manifest', () => {
    expect(bookResultReadRouteDescriptors).toHaveLength(10);
    expect(bookResultReadRouteDescriptors.map((route) => route.handler)).toEqual([
      'bookResultRead.resultSummary',
      'bookResultRead.groupedAttempt',
      'bookResultRead.resultDetail',
      'bookResultRead.resultSummary',
      'bookResultRead.groupedAttempt',
      'bookResultRead.resultDetail',
      'bookResultRead.resultSummary',
      'bookResultRead.groupedAttempt',
      'bookResultRead.resultDetail',
      'bookResultRead.releaseFeedback',
    ]);
    for (const route of bookResultReadRouteDescriptors) {
      expect(route.domain).toBe('evaluation-history');
      expect(route.owner).toBe('#77');
      expect(route.gateEnv).toBe('BOOK_RESULT_READ_ROUTES_ENABLED');
      expect(route.gateDefault).toBe('disabled');
      expect(route.source).toBe('contributor');
    }
    const homeworkRoutes = bookResultReadRouteDescriptors.filter((route) =>
      route.id.includes('homework'));
    expect(homeworkRoutes).toHaveLength(3);
    expect(homeworkRoutes.every((route) =>
      route.pathTemplate.includes('/:homeworkId')
      && !route.pathTemplate.includes('?'))).toBe(true);
  });

  it('accepts canonical group keys produced from maximum-length projection identities', async () => {
    const studentId = `s${'x'.repeat(159)}`;
    const activityId = `a${'y'.repeat(159)}`;
    const key = bookResultGroupKey(studentId, activityId);
    expect(key.length).toBeGreaterThan(256);
    expect(() => bookResultAttemptsPath({
      bookId: 'book-1',
      studentId,
      groupKey: key,
    })).not.toThrow();
  });

  it('keeps identical student-plus-activity groups isolated between books', async () => {
    const repository = readRepository([
      projection(),
      projection({
        bookId: 'book-2',
        resultId: 'result-book-2',
        attemptId: 'attempt-book-2',
        completionId: 'completion-book-2',
      }),
    ]);

    const firstBook = await repository.listGroupSummaries({
      bookId: 'book-1',
      studentId: 'student-1',
    });
    const secondBook = await repository.listGroupSummaries({
      bookId: 'book-2',
      studentId: 'student-1',
    });

    expect(firstBook).toHaveLength(1);
    expect(firstBook[0]).toMatchObject({ bookId: 'book-1', attemptCount: 1 });
    expect(secondBook).toHaveLength(1);
    expect(secondBook[0]).toMatchObject({ bookId: 'book-2', attemptCount: 1 });
  });

  it('rejects malformed paths and unbounded query limits before any read', async () => {
    const repository = new InMemoryBookResultReadRepository();
    await expect(repository.listGroupSummaries({ bookId: '../root', studentId: 'student-1' })).rejects.toThrow('book_result_book_id_invalid');
    await expect(repository.listGroupSummaries({ bookId: 'book-1', studentId: 'student-1', limit: 26 })).rejects.toThrow('book_result_groups_query_unbounded');
    await expect(repository.listAttemptSummaries({
      bookId: 'book-1',
      studentId: 'student-1',
      groupKey: 'not-a-group',
    })).rejects.toThrow('book_result_group_key_invalid');
  });

  it('uses one scoped Firebase REST read per index query and never reads the root', async () => {
    const reads: { path: string; query: unknown }[] = [];
    const groupsPath = bookResultGroupsPath({ bookId: 'book-1', studentId: 'student-1' });
    const repository = new FirebaseBookResultReadRepository({
      env: {
        FIREBASE_DB_URL: 'https://database.example.test',
        readDatabaseValue: async (path, query) => {
          reads.push({ path, query });
          return path === groupsPath ? {} : null;
        },
      },
    });
    await repository.listGroupSummaries({ bookId: 'book-1', studentId: 'student-1' });
    expect(reads).toEqual([{
      path: groupsPath,
      query: { orderBy: 'latestSubmittedAt', limitToLast: 25 },
    }]);
    expect(reads.some(({ path }) => path === '' || path === '/')).toBe(false);
  });

  it('serializes Firebase REST order and limit constraints on the server request', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    const client = new FirebaseRtdbRestClient({
      env: { FIREBASE_DB_URL: 'https://database.example.test' },
      fetchImpl: fetchImpl as typeof fetch,
      getAccessToken: async () => 'token',
    });

    await client.readValue('book_result_read_models/students/student-1', {
      orderBy: 'latestSubmittedAt',
      limitToLast: 25,
    });

    const requestUrl = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe('/book_result_read_models/students/student-1.json');
    expect(requestUrl.searchParams.get('orderBy')).toBe('"latestSubmittedAt"');
    expect(requestUrl.searchParams.get('limitToLast')).toBe('25');
  });

  it('encodes canonical result IDs exactly once at the Firebase transport boundary', () => {
    expect(bookResultDetailPath('attempt-1:result')).toBe('book_result_read_models/details/attempt-1:result');
  });

  it('uses a server-side attempt cap and rejects an over-cap indexed response', async () => {
    const groupKey = bookResultGroupKey('student-1', 'activity-1');
    const reads: { path: string; query: unknown }[] = [];
    const rows = Object.fromEntries(Array.from({ length: 51 }, (_, index) => {
      const suffix = String(index + 1);
      return [`result-${suffix}`, summary({
        resultId: `result-${suffix}`,
        attemptId: `attempt-${suffix}`,
        completionId: `completion-${suffix}`,
        attemptNumber: index + 1,
      })];
    }));
    const repository = new FirebaseBookResultReadRepository({
      env: {
        FIREBASE_DB_URL: 'https://database.example.test',
        readDatabaseValue: async (path, query) => {
          reads.push({ path, query });
          return rows;
        },
      },
    });

    await expect(repository.listAttemptSummaries({
      bookId: 'book-1',
      studentId: 'student-1',
      groupKey,
    })).rejects.toThrow('book_result_attempts_query_unbounded');
    expect(reads).toEqual([{
      path: bookResultAttemptsPath({ bookId: 'book-1', studentId: 'student-1', groupKey }),
      query: { orderBy: '$key', limitToFirst: 51 },
    }]);
  });

  it('allows a student only their own result and strips withheld feedback/sensitive detail fields', async () => {
    const repository = readRepository([projection()]);
    const handlers = createBookResultReadWorkerHandlers({
      repository,
      resolveViewerRole: vi.fn(() => 'student'),
      resolveHomeworkAuthorities: vi.fn(async () => ({})),
    });
    const result = await handlers.resultDetail({
      request: request(),
      env: {},
      uid: 'student-1',
      bookId: 'book-1',
      studentId: 'student-1',
      resultId: 'result-1',
    });
    expect(result).toMatchObject({ init: { status: 200 } });
    expect((result.body as { detail: BookResultDetail }).detail.response).toEqual({ answer: 'submitted' });
    expect(JSON.stringify(result.body)).not.toMatch(/answerKey|provider|storage|pdfBytes/iu);
    expect(validateBookResultAttemptDetail(
      (result.body as { detail: BookResultDetail }).detail,
    )).toMatchObject({ valid: true, errors: [] });

    const groupKey = bookResultGroupKey('student-1', 'activity-1');
    const grouped = await handlers.groupedAttempt({
      request: request(),
      env: {},
      uid: 'student-1',
      bookId: 'book-1',
      studentId: 'student-1',
      groupKey,
    });
    expect(grouped).toMatchObject({ init: { status: 200 } });
    const groupBody = (grouped.body as { group: Record<string, unknown> }).group;
    expect(validateBookResultGroupSummary(groupBody)).toMatchObject({ valid: true, errors: [] });
    expect(JSON.stringify(groupBody)).not.toMatch(/"bookId"/u);

    const summary = await handlers.resultSummary({
      request: request(),
      env: {},
      uid: 'student-1',
      bookId: 'book-1',
      studentId: 'student-1',
    });
    expect(summary).toMatchObject({ init: { status: 200 }, body: { groups: expect.any(Array) } });

    const denied = await handlers.resultSummary({
      request: request(), env: {}, uid: 'student-2', bookId: 'book-1', studentId: 'student-1',
    });
    expect(denied).toMatchObject({ init: { status: 403 }, body: { code: 'book_result_student_owner_required' } });
  });

  it('release-gates student evaluation fields while retaining an owning teacher view', async () => {
    const projected = projection({
        surface: 'homework',
        contextId: 'homework-1',
        deliveryContextId: 'homework-1',
        ownerId: 'teacher-1',
        homeworkId: 'homework-1',
        evaluationStatus: 'evaluated',
        evaluation: {
          status: 'evaluated',
          earnedScore: 8,
          maximumScore: 10,
          displayScore: '8/10',
          evaluatedAt: '2026-07-31T00:00:03.000Z',
        },
        feedback: { release: 'pending', available: false },
      });
    const repository = readRepository([projected]);
    const authority = {
      'homework-1': {
        homeworkId: 'homework-1',
        bookId: 'book-1',
        ownerId: 'teacher-1',
        status: 'current' as const,
        studentIds: ['student-1'],
      },
    };
    const teacherHandlers = createBookResultReadWorkerHandlers({
      repository,
      resolveViewerRole: vi.fn(() => 'teacher'),
      resolveHomeworkAuthorities: vi.fn(async () => authority),
    });
    const studentHandlers = createBookResultReadWorkerHandlers({
      repository,
      resolveViewerRole: vi.fn(() => 'student'),
      resolveHomeworkAuthorities: vi.fn(async () => ({})),
    });

    const teacher = await teacherHandlers.resultDetail({
      request: request(),
      env: {},
      uid: 'teacher-1',
      bookId: 'book-1',
      studentId: 'student-1',
      homeworkId: 'homework-1',
      contextKind: 'homework',
      resultId: 'result-1',
    });
    const student = await studentHandlers.resultDetail({
      request: request(),
      env: {},
      uid: 'student-1',
      bookId: 'book-1',
      studentId: 'student-1',
      resultId: 'result-1',
    });

    expect((teacher.body as { detail: BookResultDetail }).detail.evaluation)
      .toMatchObject({ displayScore: '8/10', earnedScore: 8, maximumScore: 10 });
    expect((student.body as { detail: BookResultDetail }).detail.evaluation)
      .not.toHaveProperty('displayScore');
    expect((student.body as { detail: BookResultDetail }).detail.feedback)
      .toEqual({ release: 'withheld', available: false });
  });

  it('keeps Public results private and ungraded even when stored grading fields are present', async () => {
    const repository = readRepository([projection({ surface: 'public', ownerId: 'teacher-1',
      evaluationStatus: 'graded', evaluation: { status: 'graded',
        score: { earnedScore: 1, maximumScore: 1, displayScore: '1 / 1' }, revision: 3 },
      feedback: { release: 'released', available: true }, studentFeedbackRelease: 'released' })]);
    const input = { request: request(), env: {}, uid: 'student-1', bookId: 'book-1',
      studentId: 'student-1', resultId: 'result-1', contextKind: 'public' as const, contextId: 'context-1' };
    const handlers = createBookResultReadWorkerHandlers({ repository, resolveViewerRole: () => 'student',
      resolveHomeworkAuthorities: async () => ({}), resolveContextAuthority: async () => ({
        contextKind: 'public', contextId: 'context-1', bookId: 'book-1', studentId: 'student-1', ownerId: 'teacher-1' }) });
    const result = await handlers.resultDetail(input);
    expect(result.init.status).toBe(200);
    const visible = (result.body as { detail: BookResultDetail }).detail;
    expect(visible.evaluationStatus).toBe('submitted');
    expect(visible.evaluation).toEqual({ status: 'submitted' });
    expect(visible.feedback).toEqual({ release: 'not-applicable', available: false });
    expect(visible).not.toHaveProperty('studentFeedbackRelease');
    const storedGroups = await repository.listGroupSummaries({ bookId: 'book-1', studentId: 'student-1' });
    const summaryHandlers = createBookResultReadWorkerHandlers({ repository: {
      listGroupSummaries: async () => storedGroups.map((group) => ({ ...group,
        score: 99, correction: 'private correction', feedback: { text: 'private feedback' },
        contexts: group.contexts.map((row) => ({ ...row, earnedScore: 99 })) })),
      listAttemptSummaries: async () => [], readResultDetail: async () => null,
    }, resolveViewerRole: () => 'student', resolveHomeworkAuthorities: async () => ({}),
    resolveContextAuthority: async () => ({ contextKind: 'public', contextId: 'context-1',
      bookId: 'book-1', studentId: 'student-1', ownerId: 'teacher-1' }) });
    const publicGroups = await summaryHandlers.resultSummary(input);
    expect(publicGroups.init.status).toBe(200);
    const group = (publicGroups.body as { groups: BookResultGroupSummary[] }).groups[0];
    expect(group.latestEvaluationStatus).toBe('submitted');
    expect(group.latestFeedbackRelease).toBe('not-applicable');
    expect(group).not.toHaveProperty('score');
    expect(group).not.toHaveProperty('correction');
    expect(group).not.toHaveProperty('feedback');
    expect(group.contexts[0]).not.toHaveProperty('earnedScore');
    const teacher = createBookResultReadWorkerHandlers({ repository, resolveViewerRole: () => 'teacher',
      resolveHomeworkAuthorities: async () => ({}) });
    await expect(teacher.resultDetail({ ...input, uid: 'teacher-1' })).resolves.toMatchObject({ init: { status: 403 } });
  });

  it('rejects a student result whose homework identity differs from the requested scope', async () => {
    const repository = {
      listGroupSummaries: async () => [],
      listAttemptSummaries: async () => [],
      readResultDetail: async () => detail({
        surface: 'homework',
        contextId: 'homework-1',
        deliveryContextId: 'homework-1',
        homeworkId: 'homework-1',
      }),
    };
    const handlers = createBookResultReadWorkerHandlers({
      repository,
      resolveViewerRole: vi.fn(() => 'student'),
      resolveHomeworkAuthorities: vi.fn(async () => ({
        'homework-2': {
          homeworkId: 'homework-2',
          bookId: 'book-1',
          ownerId: 'teacher-1',
          status: 'current' as const,
          studentIds: ['student-1'],
        },
      })),
    });

    const result = await handlers.resultDetail({
      request: request(),
      env: {},
      uid: 'student-1',
      bookId: 'book-1',
      studentId: 'student-1',
      homeworkId: 'homework-2',
      contextKind: 'homework',
      resultId: 'result-1',
    });

    expect(result).toMatchObject({ init: { status: 403 }, body: { code: 'book_result_visibility_unresolved' } });
  });

  it('denies private Solo to teachers and unresolved/non-current Homework authority', async () => {
    const repository = new InMemoryBookResultReadRepository();
    const resolveHomeworkAuthorities = vi.fn(async ({ homeworkIds }: { homeworkIds: readonly string[] }) => (
      Object.fromEntries(homeworkIds.map((id) => [id, {
        homeworkId: id,
        bookId: 'book-1',
        ownerId: 'teacher-1',
        status: id === 'hw-current' ? 'current' : 'unresolved',
        studentIds: ['student-1'],
      }]))
    ));
    const handlers = createBookResultReadWorkerHandlers({
      repository,
      resolveViewerRole: vi.fn(() => 'teacher'),
      resolveHomeworkAuthorities,
    });
    const privateSolo = await handlers.resultSummary({
      request: request(), env: {}, uid: 'teacher-1', bookId: 'book-1', studentId: 'student-1', contextKind: 'solo',
    });
    expect(privateSolo).toMatchObject({ init: { status: 403 }, body: { code: 'book_result_teacher_homework_required' } });
    const unresolved = await handlers.resultSummary({
      request: request(), env: {}, uid: 'teacher-1', bookId: 'book-1', studentId: 'student-1', homeworkId: 'hw-unresolved', contextKind: 'homework',
    });
    expect(unresolved).toMatchObject({ init: { status: 403 }, body: { code: 'book_result_homework_not_current_or_owned' } });
    expect(resolveHomeworkAuthorities).toHaveBeenCalledTimes(2);
    expect(resolveHomeworkAuthorities).toHaveBeenNthCalledWith(2, expect.objectContaining({ homeworkIds: ['hw-unresolved'] }));
  });
});
