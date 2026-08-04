import { describe, expect, it, vi } from 'vitest';
import {
  InMemoryBookResultReadRepository,
  FirebaseBookResultReadRepository,
  bookResultAttemptsPath,
  bookResultGroupsPath,
} from '../src/upload-worker/book-results/repository.ts';
import { createBookResultReadWorkerHandlers } from '../src/upload-worker/book-results/worker.ts';
import { bookResultReadRouteDescriptors } from '../src/upload-worker/book-results/route.ts';
import { FirebaseRtdbRestClient } from '../src/upload-worker/listening-authoring/rtdb.ts';
import {
  bookResultGroupKey,
  type BookResultAttemptSummary,
  type BookResultDetail,
  type BookResultReadProjection,
} from '../src/upload-worker/book-results/types.ts';
import {
  groupBookResultAttempts,
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

const projection = (overrides: Partial<BookResultAttemptSummary> = {}): BookResultReadProjection => {
  const current = summary(overrides);
  return {
    schemaVersion: 1,
    bookId: 'book-1',
    summary: current,
    detail: detail({ ...current, ...overrides }),
  };
};

const request = () => new Request('https://worker.test/v1/book-evaluation/results/book-1/student-1');

const memoryRtdb = () => {
  const rows = new Map<string, unknown>();
  return {
    write: async (path: string, value: unknown) => {
      rows.set(path, structuredClone(value));
    },
    read: async (path: string) => {
      const direct = rows.get(path);
      if (direct !== undefined) return structuredClone(direct);
      const prefix = `${path}/`;
      const descendants = [...rows.entries()]
        .filter(([candidate]) => candidate.startsWith(prefix));
      if (descendants.length === 0) return null;
      const root: Record<string, unknown> = {};
      for (const [candidate, value] of descendants) {
        const parts = candidate.slice(prefix.length).split('/');
        let cursor = root;
        parts.forEach((part, index) => {
          if (index === parts.length - 1) {
            cursor[part] = structuredClone(value);
          } else {
            cursor[part] ??= {};
            cursor = cursor[part] as Record<string, unknown>;
          }
        });
      }
      return root;
    },
    rows,
  };
};

describe('Ticket #77 Book result read model', () => {
  it('publishes contributor descriptors without mutating the canonical manifest', () => {
    expect(bookResultReadRouteDescriptors).toHaveLength(6);
    expect(bookResultReadRouteDescriptors.map((route) => route.handler)).toEqual([
      'bookResultRead.resultSummary',
      'bookResultRead.groupedAttempt',
      'bookResultRead.resultDetail',
      'bookResultRead.resultSummary',
      'bookResultRead.groupedAttempt',
      'bookResultRead.resultDetail',
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

  it('persists grouped summaries, ordered attempt summaries, and detail idempotently', async () => {
    const repository = new InMemoryBookResultReadRepository();
    const projected = projection();
    const { bookId: summaryBookId, ...pureSummary } = projected.summary;
    const { bookId: detailBookId, ...pureDetail } = projected.detail;
    expect(summaryBookId).toBe(detailBookId);
    const canonicalGroup = groupBookResultAttempts([{
      schemaVersion: projected.schemaVersion,
      summary: pureSummary,
      detail: pureDetail,
    }])[0]!;
    await repository.persistProjection?.({ projection: projected });
    await repository.persistProjection?.({ projection: projected });
    const groups = await repository.listGroupSummaries({ bookId: 'book-1', studentId: 'student-1' });
    expect(groups).toHaveLength(1);
    expect(groups[0]?.groupKey).toBe(canonicalGroup.groupKey);
    expect(canonicalGroup.groupKey).toBe(bookResultGroupKey('student-1', 'activity-1'));
    expect(groups[0]?.attemptCount).toBe(1);
    const attempts = await repository.listAttemptSummaries({
      bookId: 'book-1',
      studentId: 'student-1',
      groupKey: canonicalGroup.groupKey,
    });
    expect(attempts.map((entry) => entry.attemptNumber)).toEqual([1]);
    const read = await repository.readResultDetail({ bookId: 'book-1', studentId: 'student-1', resultId: 'result-1' });
    expect(read?.response).toEqual({ answer: 'submitted' });
    expect(repository.queryMetrics()).toMatchObject({ groups: 1, attempts: 1, details: 1, persists: 2 });
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
    const repository = new InMemoryBookResultReadRepository();
    await repository.persistProjection?.({ projection: projection() });
    await repository.persistProjection?.({
      projection: {
        ...projection({
          bookId: 'book-2',
          resultId: 'result-book-2',
          attemptId: 'attempt-book-2',
          completionId: 'completion-book-2',
        }),
        bookId: 'book-2',
      },
    });

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
      getAccessToken: async () => 'token',
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
      getAccessToken: async () => 'token',
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

  it('dual-projects Homework attempts into the student aggregate and scoped Homework index', async () => {
    const database = memoryRtdb();
    const repository = new FirebaseBookResultReadRepository({
      env: {
        FIREBASE_DB_URL: 'https://database.example.test',
        readDatabaseValue: database.read,
        writeDatabaseValue: database.write,
      },
      getAccessToken: async () => 'token',
    });
    await repository.persistProjection({
      projection: projection({
        resultId: 'result-solo',
        attemptId: 'attempt-solo',
        completionId: 'completion-solo',
      }),
    });
    await repository.persistProjection({
      projection: projection({
        resultId: 'result-homework',
        attemptId: 'attempt-homework',
        completionId: 'completion-homework',
        attemptNumber: 2,
        surface: 'homework',
        contextId: 'homework-1',
        deliveryContextId: 'homework-1',
        ownerId: 'teacher-1',
        homeworkId: 'homework-1',
      }),
    });

    const groupKey = bookResultGroupKey('student-1', 'activity-1');
    const studentAttempts = await repository.listAttemptSummaries({
      bookId: 'book-1',
      studentId: 'student-1',
      groupKey,
    });
    const homeworkAttempts = await repository.listAttemptSummaries({
      bookId: 'book-1',
      studentId: 'student-1',
      homeworkId: 'homework-1',
      groupKey,
    });
    const studentGroups = await repository.listGroupSummaries({
      bookId: 'book-1',
      studentId: 'student-1',
    });
    const homeworkGroups = await repository.listGroupSummaries({
      bookId: 'book-1',
      studentId: 'student-1',
      homeworkId: 'homework-1',
    });

    expect(studentAttempts.map((entry) => entry.attemptId))
      .toEqual(['attempt-solo', 'attempt-homework']);
    expect(homeworkAttempts.map((entry) => entry.attemptId))
      .toEqual(['attempt-homework']);
    expect(studentGroups[0]).toMatchObject({ attemptCount: 2 });
    expect(homeworkGroups[0]).toMatchObject({ attemptCount: 1, homeworkId: 'homework-1' });
    const studentScope = {
      bookId: 'book-1',
      studentId: 'student-1',
      groupKey,
    };
    expect(bookResultAttemptsPath(studentScope))
      .not.toContain(bookResultGroupsPath(studentScope));
    const summaryRows = await database.read(bookResultGroupsPath(studentScope));
    expect(Object.values(summaryRows as Record<string, unknown>).every((row) =>
      row !== null
      && typeof row === 'object'
      && !Object.prototype.hasOwnProperty.call(row, 'attempts'))).toBe(true);
    expect([...database.rows.keys()].some((path) => path === '' || path === '/')).toBe(false);
  });

  it('allows a student only their own result and strips withheld feedback/sensitive detail fields', async () => {
    const repository = new InMemoryBookResultReadRepository();
    await repository.persistProjection?.({ projection: projection() });
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

    const denied = await handlers.resultSummary({
      request: request(), env: {}, uid: 'student-2', bookId: 'book-1', studentId: 'student-1',
    });
    expect(denied).toMatchObject({ init: { status: 403 }, body: { code: 'book_result_student_owner_required' } });
  });

  it('release-gates student evaluation fields while retaining an owning teacher view', async () => {
    const repository = new InMemoryBookResultReadRepository();
    await repository.persistProjection?.({
      projection: projection({
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
      }),
    });
    const authority = {
      'homework-1': {
        homeworkId: 'homework-1',
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
      .toEqual({ release: 'pending', available: false });
  });

  it('denies private Solo to teachers and unresolved/non-current Homework authority', async () => {
    const repository = new InMemoryBookResultReadRepository();
    const resolveHomeworkAuthorities = vi.fn(async ({ homeworkIds }: { homeworkIds: readonly string[] }) => (
      Object.fromEntries(homeworkIds.map((id) => [id, {
        homeworkId: id,
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
