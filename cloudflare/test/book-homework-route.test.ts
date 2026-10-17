import { describe, expect, it, vi } from 'vitest';
import {
  createBookHomeworkWorkerHandlers,
  type BookHomeworkWorkerEnv,
} from '../src/upload-worker/book-homework/worker.ts';
import { createBookHomeworkCanonicalResolver } from '../src/upload-worker/book-homework/canonical-resolver.ts';
import { createBookRouteHandlers } from '../src/upload-worker/book-route-handlers.ts';
import { createBookRouter } from '../src/upload-worker/book-router.ts';
import type { BookHomeworkSagaCommand, BookHomeworkSagaRecord } from '../../src/services/book-homework/bookHomeworkSaga.types.ts';
import { makeBookAssemblyPublicationScope } from './book-delivery.fixture.ts';
import type { BookHomeworkResolvedContext } from '../src/upload-worker/book-homework/context-resolver.ts';

const ORIGIN = 'http://localhost:5173';
const SERVICE_KEY = JSON.stringify({
  client_email: 'book-homework@example.test',
  private_key: 'private-key',
});
const operationId = '00000000-0000-4000-8000-000000000086';

const command = (): Omit<BookHomeworkSagaCommand, 'ownerId' | 'createdAt'> => ({
  assignmentId: 'assignment-1',
  operationId,
  idempotencyKey: 'idempotency-1',
  manifestVersionId: 'manifest-1',
  intent: {
    bookId: 'book-1',
    target: { kind: 'unit', bookId: 'book-1', nodeKey: 'unit-1', classId: 'class-1' },
    schedule: { finalDueAt: '2026-08-30T00:00:00.000Z', nodeOverrides: [] },
    policy: {
      intent: 'practice',
      integrityCapture: false,
      integrityOverride: false,
      activityPolicies: [{
        placementId: 'placement-1',
        maxAttempts: 2,
        feedbackRelease: 'immediate',
        lateSubmissionAllowed: false,
      }],
    },
    expectedPublication: { publicationId: 'publication-1', publicationRevision: 1, manifestVersionId: 'manifest-1' },
    presentation: { title: 'Book Homework' },
  },
  selectedRecipientIds: ['student-1'],
});

const record = (): BookHomeworkSagaRecord => ({
  schemaVersion: 1,
  assignmentId: 'assignment-1',
  operationId,
  idempotencyKey: 'idempotency-1',
  ownerId: 'teacher-1',
  manifestVersionId: 'manifest-1',
  publicationId: 'publication-1',
  publicationRevision: 1,
  contextId: 'assignment-1',
  presentation: { title: 'Book Homework' },
  fingerprint: 'root-fingerprint-1',
  requestFingerprint: 'request-fingerprint-1',
  state: 'committed',
  visibility: 'committed',
  recipients: [{
    recipientId: 'student-1',
    authorityId: 'assignment-1--student-1--authority',
    bindingId: 'assignment-1--student-1--delivery',
    state: 'committed',
  }],
  recipientCount: 1,
  committedRecipientCount: 1,
  revision: 5,
  createdAt: '2026-07-29T00:00:00.000Z',
  updatedAt: '2026-07-29T00:00:01.000Z',
});

const env = (overrides: Partial<BookHomeworkWorkerEnv> = {}): BookHomeworkWorkerEnv => ({
  BOOK_HOMEWORK_ROUTES_ENABLED: 'enabled',
  BOOK_HOMEWORK_READ_ROUTES_ENABLED: 'enabled',
  BOOK_HOMEWORK_SERVICE_IDENTITY: 'book-homework@example.test',
  BOOK_HOMEWORK_GOOGLE_SA_KEY: SERVICE_KEY,
  BOOK_ROUTE_RATE_LIMITER: { limit: async () => ({ success: true }) },
  readDatabaseValue: async () => ({ role: 'teacher', status: 'active' }),
  ...overrides,
});

const requestFor = (
  body: unknown,
  path = '/book-homework/assignments/assignment-1/commands',
  headers: Record<string, string> = {},
): Request => new Request(`https://worker.example.test${path}`, {
  method: 'POST',
  headers: {
    Origin: ORIGIN,
    Authorization: 'Bearer teacher-token',
    'Content-Type': 'application/json',
    'Idempotency-Key': 'idempotency-1',
    ...headers,
  },
  body: JSON.stringify(body),
});

const teacherProjectionRequest = (): Request => new Request(
  'https://worker.example.test/book-homework/assignments/assignment-1/teacher-projection',
  { headers: { Origin: ORIGIN, Authorization: 'Bearer teacher-token' } },
);

const completionAuthority = () => ({
  assignmentId: 'assignment-1',
  manifest: { manifestVersionId: 'manifest-1' },
});

const makeSaga = () => ({
  execute: vi.fn(async (_input: BookHomeworkSagaCommand) => ({
    status: 'committed' as const,
    record: record(),
  })),
  resolveStudentProjection: vi.fn(async () => ({
    authority: { manifestVersionId: 'manifest-1' },
    completionAuthority: completionAuthority(),
    delivery: {
      record: {
        binding: {
          bindingId: 'assignment-1--student-1--delivery',
          revision: 1,
          context: { contextId: 'assignment-1', recipientId: 'student-1' },
          recipient: { recipientId: 'student-1' },
          issuer: { ownerId: 'teacher-1' },
        },
      },
    },
  })),
  resolveTeacherProjections: vi.fn(async () => [{
    studentId: 'student-1',
    authority: { manifestVersionId: 'manifest-1' },
    completionAuthority: completionAuthority(),
    delivery: {
      record: {
        binding: {
          bindingId: 'assignment-1--student-1--delivery',
          revision: 1,
          context: { contextId: 'assignment-1', recipientId: 'student-1' },
          recipient: { recipientId: 'student-1' },
          issuer: { ownerId: 'teacher-1' },
        },
      },
    },
  }]),
});

const makeRouter = (saga = makeSaga(), uid = 'teacher-1') => createBookRouter({
  handlers: createBookRouteHandlers({
    homeworkHandlers: createBookHomeworkWorkerHandlers({
      saga,
      now: () => '2026-07-29T00:00:00.000Z',
    }),
  }),
  firebaseVerifier: { verifyAuthorizationHeader: async () => ({ valid: true, uid }) },
});

const previewRequestFor = (body: unknown): Request => new Request(
  'https://worker.example.test/book-homework/preview-source',
  {
    method: 'POST',
    headers: {
      Origin: ORIGIN,
      Authorization: 'Bearer teacher-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  },
);

const makePreviewRouter = (
  options: Parameters<typeof createBookHomeworkWorkerHandlers>[0] = {},
  uid = 'teacher-1',
) => createBookRouter({
  handlers: createBookRouteHandlers({
    homeworkHandlers: createBookHomeworkWorkerHandlers(options),
  }),
  firebaseVerifier: { verifyAuthorizationHeader: async () => ({ valid: true, uid }) },
});

describe('Ticket 33E canonical Book Homework route', () => {
  it.each([
    ['same immutable version', {}, 200],
    ['conflicting version ID', { activityVersionId: 'other-version' }, 403],
    ['conflicting version number', { activityVersion: 2 }, 403],
  ] as const)('hydrates repeated placements safely: %s', async (_label, repeatedOverride, status) => {
    const context: BookHomeworkResolvedContext = {
      assignmentId: 'assignment-1', actorUid: 'student-1', ownerId: 'teacher-1', recipientId: 'student-1',
      authorityId: 'authority-1', authorityRevision: 1, bindingId: 'binding-1', bindingRevision: 1,
      deliveryRecordRevision: 1, bookId: 'book-1', manifestVersionId: 'manifest-1', publicationId: 'publication-1',
      publicationRevision: 1, placementId: 'placement-1', activityId: 'activity-1', activityVersionId: 'version-1',
      activityVersion: 1, trustedBookProjection: { title: 'One' } as BookHomeworkResolvedContext['trustedBookProjection'],
    };
    const resolve = vi.fn(async ({ action }: { action: { placementId: string } }) => ({ ...context,
      placementId: action.placementId,
      ...(action.placementId === 'placement-repeat' ? repeatedOverride : {}),
      ...(action.placementId === 'placement-other' ? { activityId: 'activity-2', activityVersionId: 'version-2' } : {}),
    }));
    const handlers = createBookHomeworkWorkerHandlers({ contextResolver: { resolve } });
    const result = await handlers.homeworkStudentLaunch({ request: requestFor({ placementIds: ['placement-1', 'placement-repeat', 'placement-other'] }), assignmentId: 'assignment-1', uid: 'student-1' });
    expect(result.init.status).toBe(status);
    expect(resolve.mock.calls.map(([input]) => input.action.placementId)).toEqual(['placement-1', 'placement-repeat', 'placement-other']);
    if (status === 200) expect(result.body.activities).toEqual([
      { activityId: 'activity-1', activityVersionId: 'version-1', projection: context.trustedBookProjection },
      { activityId: 'activity-2', activityVersionId: 'version-2', projection: context.trustedBookProjection },
    ]);
    else expect(result.body).toEqual({ code: 'book_homework_launch_denied' });
  });
  it('binds owner and creation time to authenticated Worker context', async () => {
    const saga = makeSaga();
    const router = makeRouter(saga);
    const response = await router.fetch(requestFor(command()), env());

    expect(response.status).toBe(200);
    const responseBody = await response.json();
    expect(responseBody).toEqual({
      status: 'committed',
      assignmentId: 'assignment-1',
      operationId,
      state: 'committed',
      visibility: 'committed',
      recipientCount: 1,
      committedRecipientCount: 1,
      revision: 5,
    });
    expect(saga.execute).toHaveBeenCalledWith({
      ...command(),
      ownerId: 'teacher-1',
      createdAt: '2026-07-29T00:00:00.000Z',
    });
    expect(JSON.stringify(responseBody)).not.toContain('private-key');
  });

  it('keeps projection diagnostics out of the 202 body and emits only bounded structured fields', async () => {
    const saga = makeSaga();
    saga.execute.mockResolvedValue({
      status: 'committed_projection_pending',
      record: record(),
      projectionDiagnostic: {
        stage: 'firestore_patch',
        errorClass: 'firestore-write',
      },
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await makeRouter(saga).fetch(requestFor(command()), env());

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      status: 'committed_projection_pending',
      assignmentId: 'assignment-1',
      operationId,
      state: 'committed',
      visibility: 'committed',
      recipientCount: 1,
      committedRecipientCount: 1,
      revision: 5,
    });
    expect(error).toHaveBeenCalledWith('book_homework_committed_projection_pending', {
      assignmentId: 'assignment-1',
      operationId,
      stage: 'firestore_patch',
      errorClass: 'firestore-write',
    });
    error.mockRestore();
  });

  it('rejects path/body, idempotency, and extra-mode mismatches before saga mutation', async () => {
    const saga = makeSaga();
    const router = makeRouter(saga);

    const pathMismatch = await router.fetch(
      requestFor(command(), '/book-homework/assignments/other-assignment/commands'),
      env(),
    );
    expect(pathMismatch.status).toBe(409);

    const idempotencyMismatch = await router.fetch(
      requestFor(command(), '/book-homework/assignments/assignment-1/commands', { 'Idempotency-Key': 'different-key' }),
      env(),
    );
    expect(idempotencyMismatch.status).toBe(409);

    const modeMismatch = await router.fetch(requestFor({ ...command(), mode: 'legacy' }), env());
    expect(modeMismatch.status).toBe(400);
    expect(saga.execute).not.toHaveBeenCalled();
  });

  it('rejects non-teacher actors before saga mutation', async () => {
    const saga = makeSaga();
    const router = makeRouter(saga);
    const response = await router.fetch(requestFor(command()), env({
      readDatabaseValue: async () => ({ role: 'student', status: 'active' }),
    }));

    expect(response.status).toBe(403);
    expect(saga.execute).not.toHaveBeenCalled();
  });

  it.each([
    ['teacher', { role: 'teacher', status: 'active' }],
    ['super_admin', { role: 'super_admin', status: 'active' }],
    ['teacher with null revocation', { role: 'teacher', status: 'active', privilegedAuthorityRevokedAt: null }],
  ])('allows an active %s through the registered homework teacher path', async (_label, profile) => {
    const saga = makeSaga();
    const readPaths: string[] = [];
    const response = await makeRouter(saga).fetch(teacherProjectionRequest(), env({
      readDatabaseValue: async (path) => {
        readPaths.push(path);
        return profile;
      },
    }));

    expect(response.status).toBe(200);
    expect(saga.resolveTeacherProjections).toHaveBeenCalledWith('assignment-1', 'teacher-1');
    expect(readPaths).toEqual(['users/teacher-1']);
  });

  it.each([
    ['missing status', { role: 'teacher' }],
    ['unknown status', { role: 'teacher', status: 'unknown' }],
    ['pending status', { role: 'teacher', status: 'pending' }],
    ['disabled', { role: 'teacher', status: 'active', disabled: true }],
    ['force reauth', { role: 'teacher', status: 'active', forceReauth: true }],
    ['revoked authority', { role: 'teacher', status: 'active', privilegedAuthorityRevokedAt: '2026-09-15T00:00:00.000Z' }],
    ['wrong role', { role: 'student', status: 'active' }],
    ['malformed profile', null],
    ['malformed status', { role: 'teacher', status: {} }],
  ])('denies %s before homework Book, candidate, source, or provider reads', async (_label, profile) => {
    const saga = makeSaga();
    const readPaths: string[] = [];
    const response = await makeRouter(saga).fetch(teacherProjectionRequest(), env({
      readDatabaseValue: async (path) => {
        readPaths.push(path);
        return profile;
      },
    }));

    expect(response.status).toBe(403);
    expect(saga.resolveTeacherProjections).not.toHaveBeenCalled();
    expect(saga.execute).not.toHaveBeenCalled();
    expect(readPaths).toEqual(['users/teacher-1']);
  });

  it('fails closed when saga wiring is absent and when route gate is disabled', async () => {
    const unavailable = await createBookRouter({
      handlers: createBookRouteHandlers(),
      firebaseVerifier: { verifyAuthorizationHeader: async () => ({ valid: true, uid: 'teacher-1' }) },
    }).fetch(requestFor(command()), env());
    expect(unavailable.status).toBe(503);
    await expect(unavailable.json()).resolves.toEqual({
      code: 'book_homework_runtime_dependencies_unavailable',
    });

    const saga = makeSaga();
    const disabled = await makeRouter(saga).fetch(requestFor(command()), env({
      BOOK_HOMEWORK_ROUTES_ENABLED: 'disabled',
    }));
    expect(disabled.status).toBe(503);
    expect(saga.execute).not.toHaveBeenCalled();
  });

  it('authenticates teachers, parses the exact preview request, and returns resolver output without saga execution', async () => {
    const saga = makeSaga();
    const resolvePreviewSource = vi.fn(async (input) => ({
      identity: { ownerId: input.ownerId, manifestVersionId: 'manifest-1' },
      initialTarget: { kind: 'unit', bookId: input.bookId, nodeKey: input.unitKey },
      classId: input.classId,
      selectedRecipientIds: input.selectedRecipientIds,
      contextId: input.contextId,
    }));
    const router = makePreviewRouter({
      saga,
      resolvePreviewSource,
      now: () => '2026-07-29T00:00:00.000Z',
    });
    const requestBody = {
      bookId: 'book-1',
      unitKey: 'unit-1',
      classId: 'class-1',
      selectedRecipientIds: ['student-1'],
      title: '  Book Homework  ',
    };

    const response = await router.fetch(previewRequestFor(requestBody), env());

    expect(response.status, JSON.stringify(await response.clone().json())).toBe(200);
    const body = await response.json() as { contextId: string };
    expect(body).toMatchObject({
      identity: { ownerId: 'teacher-1', manifestVersionId: 'manifest-1' },
      initialTarget: { kind: 'unit', bookId: 'book-1', nodeKey: 'unit-1' },
      classId: 'class-1',
      selectedRecipientIds: ['student-1'],
    });
    expect(body.contextId).toMatch(/^[0-9a-f-]{36}$/iu);
    expect(resolvePreviewSource).toHaveBeenCalledWith({
      ownerId: 'teacher-1',
      bookId: 'book-1',
      unitKey: 'unit-1',
      classId: 'class-1',
      selectedRecipientIds: ['student-1'],
      contextId: body.contextId,
      createdAt: '2026-07-29T00:00:00.000Z',
      title: 'Book Homework',
    });
    expect(saga.execute).not.toHaveBeenCalled();
  });

  it('invokes a canonical resolver returned by the factory with its receiver intact', async () => {
    const resolver = createBookHomeworkCanonicalResolver({
      classReader: async () => ({
        classId: 'class-1',
        ownerId: 'teacher-1',
        status: 'active',
        students: [{ studentId: 'student-1', status: 'active' }],
      }),
      readPublicationScope: async () => makeBookAssemblyPublicationScope(),
    });
    const response = await makePreviewRouter({
      previewSourceResolverFactory: async () => resolver,
      now: () => '2026-07-29T00:00:00.000Z',
    }).fetch(previewRequestFor({
      bookId: 'book-pdf-1',
      unitKey: 'unit-1',
      classId: 'class-1',
      selectedRecipientIds: ['student-1'],
      title: ' Unit 1 Preview ',
    }), env());

    expect(response.status, JSON.stringify(await response.clone().json())).toBe(200);
    expect(await response.json()).toMatchObject({
      identity: { ownerId: 'teacher-1', manifestVersionId: 'manifest-1' },
      initialTarget: { kind: 'unit', bookId: 'book-pdf-1', nodeKey: 'unit-1' },
      classId: 'class-1',
      selectedRecipientIds: ['student-1'],
      bookTitle: 'Unit 1 Preview',
      delivery: {
        context: { contextId: expect.any(String), kind: 'homework' },
        book: { publicationId: 'publication-1', publicationStatus: 'published' },
      },
    });
  });

  it('rejects preview request fields outside the exact contract before resolving or mutating', async () => {
    const resolvePreviewSource = vi.fn(async () => ({}) as never);
    const saga = makeSaga();
    const response = await makePreviewRouter({ saga, resolvePreviewSource }).fetch(
      previewRequestFor({
        bookId: 'book-1',
        unitKey: 'unit-1',
        classId: 'class-1',
        selectedRecipientIds: ['student-1'],
        unexpected: true,
      }),
      env(),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ code: 'invalid_request' });
    expect(resolvePreviewSource).not.toHaveBeenCalled();
    expect(saga.execute).not.toHaveBeenCalled();
  });

  it('rejects non-teachers and fails closed when the read-only resolver is absent', async () => {
    const nonTeacherResolver = vi.fn(async () => ({}) as never);
    const nonTeacher = await makePreviewRouter({ resolvePreviewSource: nonTeacherResolver }).fetch(
      previewRequestFor({
        bookId: 'book-1', unitKey: 'unit-1', classId: 'class-1', selectedRecipientIds: ['student-1'],
      }),
      env({ readDatabaseValue: async () => ({ role: 'student', status: 'active' }) }),
    );
    expect(nonTeacher.status).toBe(403);
    await expect(nonTeacher.json()).resolves.toEqual({ code: 'teacher_required' });
    expect(nonTeacherResolver).not.toHaveBeenCalled();

    const saga = makeSaga();
    const unavailable = await makePreviewRouter({ saga }).fetch(
      previewRequestFor({
        bookId: 'book-1', unitKey: 'unit-1', classId: 'class-1', selectedRecipientIds: ['student-1'],
      }),
      env(),
    );
    expect(unavailable.status).toBe(503);
    await expect(unavailable.json()).resolves.toEqual({ code: 'preview_source_unavailable' });
    expect(saga.execute).not.toHaveBeenCalled();
  });

  it('returns only the authenticated student projection and fails closed when unavailable', async () => {
    const saga = makeSaga();
    const router = makeRouter(saga, 'student-1');
    const request = new Request(
      'https://worker.example.test/book-homework/assignments/assignment-1/student-projection',
      { headers: { Origin: 'http://localhost:5174', Authorization: 'Bearer student-token' } },
    );
    const response = await router.fetch(request, env({
      BOOK_HOMEWORK_ROUTES_ENABLED: 'disabled',
    }));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ code: 'book_homework_completion_unavailable' });
    expect(saga.resolveStudentProjection).toHaveBeenCalledWith('assignment-1', 'student-1');

    saga.resolveStudentProjection.mockResolvedValueOnce(null as never);
    const missing = await router.fetch(request, env());
    expect(missing.status).toBe(404);
  });

  it('serves committed component homework progress without exposing component source selection', async () => {
    const saga = makeSaga();
    saga.resolveStudentProjection.mockResolvedValueOnce({
      authority: { manifestVersionId: 'manifest-1' },
      completionAuthority: completionAuthority(),
      delivery: {
        record: {
          binding: {
            bindingId: 'assignment-1--student-1--delivery',
            revision: 1,
            context: { contextId: 'assignment-1', recipientId: 'student-1' },
            recipient: { recipientId: 'student-1' },
            issuer: { ownerId: 'teacher-1' },
            sourceSet: { strategy: 'component_pdfs' },
          },
        },
      },
    } as never);
    const resolveCompletionProjection = vi.fn(async () => ({
      schemaVersion: 1,
      contextId: 'assignment-1',
      recipientId: 'student-1',
      deliveryBindingId: 'assignment-1--student-1--delivery',
      bindingRevision: 1,
    }));
    const router = createBookRouter({
      handlers: createBookRouteHandlers({
        homeworkHandlers: createBookHomeworkWorkerHandlers({
          saga,
          resolveCompletionProjection,
        }),
      }),
      firebaseVerifier: {
        verifyAuthorizationHeader: async () => ({ valid: true, uid: 'student-1' }),
      },
    });

    const response = await router.fetch(new Request(
      'https://worker.example.test/book-homework/assignments/assignment-1/student-projection',
      { headers: { Origin: 'http://localhost:5174', Authorization: 'Bearer student-token' } },
    ), env());
    const body = await response.clone().json();
    const serialized = await response.text();

    expect(response.status, JSON.stringify(body)).toBe(200);
    expect(body).toMatchObject({
      assignmentId: 'assignment-1',
      authority: { manifestVersionId: 'manifest-1' },
      completion: { contextId: 'assignment-1', recipientId: 'student-1' },
    });
    expect(resolveCompletionProjection).toHaveBeenCalledTimes(1);
    expect(saga.resolveStudentProjection).toHaveBeenCalledWith('assignment-1', 'student-1');
    for (const field of ['sourceSet', 'documentRequests', 'sourceKey', 'sourceVersionId']) {
      expect(serialized).not.toContain(field);
    }
  });

  it('derives current progress from persisted facts without a write-on-read', async () => {
    const saga = makeSaga();
    const resolveCurrentProjection = vi.fn(async () => ({
        schemaVersion: 1 as const,
        manifestVersionId: 'manifest-1',
        recipientId: 'student-1',
        contextId: 'assignment-1',
        deliveryBindingId: 'assignment-1--student-1--delivery',
        bindingRevision: 1,
        completion: {
          submittedCount: 1,
          requiredCount: 2,
          status: 'in_progress' as const,
          isComplete: false,
        },
        grading: { pendingReviewCount: 1, scoredCount: 0, ungradedSubmittedCount: 0 },
        activities: [],
        excludedHistoricalRows: [],
    }));
    const router = createBookRouter({
      handlers: createBookRouteHandlers({
        homeworkHandlers: createBookHomeworkWorkerHandlers({
          saga,
          completionRepositoryFactory: () => ({ resolveCurrentProjection }),
        }),
      }),
      firebaseVerifier: {
        verifyAuthorizationHeader: async () => ({ valid: true, uid: 'student-1' }),
      },
    });

    const response = await router.fetch(new Request(
      'https://worker.example.test/book-homework/assignments/assignment-1/student-projection',
      { headers: { Origin: 'http://localhost:5174', Authorization: 'Bearer student-token' } },
    ), env({ BOOK_HOMEWORK_COMPLETION_PROJECTION_ENABLED: 'enabled' }));

    expect(response.status, JSON.stringify(await response.clone().json())).toBe(200);
    expect(resolveCurrentProjection).toHaveBeenCalledWith(expect.objectContaining({
      authority: expect.objectContaining({
        assignmentId: 'assignment-1',
        manifest: expect.objectContaining({ manifestVersionId: 'manifest-1' }),
      }),
      binding: expect.objectContaining({ bindingId: 'assignment-1--student-1--delivery' }),
    }));
    await expect(response.json()).resolves.toMatchObject({
      completion: {
        contextId: 'assignment-1',
        recipientId: 'student-1',
        completion: { submittedCount: 1, requiredCount: 2, isComplete: false },
      },
    });
  });

  it('allows only the owning teacher to request one exact student completion projection', async () => {
    const saga = makeSaga();
    const resolveCompletionProjection = vi.fn(async () => ({
      schemaVersion: 1,
      contextId: 'assignment-1',
      recipientId: 'student-1',
      deliveryBindingId: 'assignment-1--student-1--delivery',
      bindingRevision: 1,
      completion: { submittedCount: 1, requiredCount: 2, isComplete: false },
      grading: { pendingReviewCount: 1, scoredCount: 0, ungradedSubmittedCount: 0 },
    }));
    const router = createBookRouter({
      handlers: createBookRouteHandlers({
        homeworkHandlers: createBookHomeworkWorkerHandlers({
          saga,
          resolveCompletionProjection,
        }),
      }),
      firebaseVerifier: {
        verifyAuthorizationHeader: async () => ({ valid: true, uid: 'teacher-1' }),
      },
    });
    const request = new Request(
      'https://worker.example.test/book-homework/assignments/assignment-1/students/student-1/projection',
      { headers: { Origin: 'http://localhost:5173', Authorization: 'Bearer teacher-token' } },
    );

    const response = await router.fetch(request, env());

    expect(response.status, JSON.stringify(await response.clone().json())).toBe(200);
    expect(saga.resolveStudentProjection).toHaveBeenCalledWith('assignment-1', 'student-1');
    expect(resolveCompletionProjection).toHaveBeenCalledWith(expect.objectContaining({
      assignmentId: 'assignment-1',
      studentId: 'student-1',
    }));
    await expect(response.json()).resolves.toMatchObject({
      completion: {
        completion: { submittedCount: 1, requiredCount: 2, isComplete: false },
        grading: { pendingReviewCount: 1 },
      },
    });

    saga.resolveStudentProjection.mockResolvedValueOnce({
      authority: { manifestVersionId: 'manifest-1' },
      completionAuthority: completionAuthority(),
      delivery: {
        record: {
          binding: {
            bindingId: 'assignment-1--student-1--delivery',
            issuer: { ownerId: 'another-teacher' },
          },
        },
      },
    } as never);
    const forbidden = await router.fetch(request, env());
    expect(forbidden.status).toBe(403);
    expect(resolveCompletionProjection).toHaveBeenCalledTimes(1);
  });

  it('returns all teacher-owned student completion rows through one bounded route', async () => {
    const saga = makeSaga();
    const resolveCompletionProjection = vi.fn(async ({ studentId }: { studentId: string }) => ({
      schemaVersion: 1,
      recipientId: studentId,
      contextId: 'assignment-1',
      deliveryBindingId: 'assignment-1--student-1--delivery',
      bindingRevision: 1,
      completion: { submittedCount: 1, requiredCount: 1, isComplete: true },
    }));
    const router = createBookRouter({
      handlers: createBookRouteHandlers({
        homeworkHandlers: createBookHomeworkWorkerHandlers({
          saga,
          resolveCompletionProjection,
        }),
      }),
      firebaseVerifier: {
        verifyAuthorizationHeader: async () => ({ valid: true, uid: 'teacher-1' }),
      },
    });
    const response = await router.fetch(new Request(
      'https://worker.example.test/book-homework/assignments/assignment-1/teacher-projection',
      { headers: { Origin: 'http://localhost:5173', Authorization: 'Bearer teacher-token' } },
    ), env());

    expect(response.status).toBe(200);
    expect(saga.resolveTeacherProjections).toHaveBeenCalledWith('assignment-1', 'teacher-1');
    expect(resolveCompletionProjection).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toEqual({
      assignmentId: 'assignment-1',
      students: [{
        studentId: 'student-1',
        completion: {
          schemaVersion: 1,
          recipientId: 'student-1',
          contextId: 'assignment-1',
          deliveryBindingId: 'assignment-1--student-1--delivery',
          bindingRevision: 1,
          completion: { submittedCount: 1, requiredCount: 1, isComplete: true },
        },
      }],
    });
  });

  it('preserves committed recipient identity when completion enrichment is unavailable', async () => {
    const saga = makeSaga();
    const resolveCompletionProjection = vi.fn(async () => null);
    const router = createBookRouter({
      handlers: createBookRouteHandlers({
        homeworkHandlers: createBookHomeworkWorkerHandlers({
          saga,
          resolveCompletionProjection,
        }),
      }),
      firebaseVerifier: {
        verifyAuthorizationHeader: async () => ({ valid: true, uid: 'teacher-1' }),
      },
    });

    const response = await router.fetch(new Request(
      'https://worker.example.test/book-homework/assignments/assignment-1/teacher-projection',
      { headers: { Origin: 'http://localhost:5173', Authorization: 'Bearer teacher-token' } },
    ), env());

    expect(response.status, JSON.stringify(await response.clone().json())).toBe(200);
    await expect(response.json()).resolves.toEqual({
      assignmentId: 'assignment-1',
      students: [{ studentId: 'student-1', completion: null }],
    });
    expect(resolveCompletionProjection).toHaveBeenCalledTimes(1);
  });
});
