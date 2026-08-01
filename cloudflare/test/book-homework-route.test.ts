import { describe, expect, it, vi } from 'vitest';
import {
  createBookHomeworkWorkerHandlers,
  type BookHomeworkWorkerEnv,
} from '../src/upload-worker/book-homework/worker.ts';
import { createBookRouteHandlers } from '../src/upload-worker/book-route-handlers.ts';
import { createBookRouter } from '../src/upload-worker/book-router.ts';
import type { BookHomeworkSagaCommand, BookHomeworkSagaRecord } from '../../src/services/book-homework/bookHomeworkSaga.types.ts';

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
  selectedRecipientIds: ['student-1'],
  expectedManifestFingerprint: 'manifest-fingerprint-1',
  expectedPublicationFingerprint: 'publication-fingerprint-1',
  expectedExposureApprovalFingerprint: 'exposure-fingerprint-1',
  expectedPolicyFingerprint: 'policy-fingerprint-1',
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

describe('Ticket 33E canonical Book Homework route', () => {
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

  it('rejects path/body, idempotency, and extra-mode mismatches before saga mutation', async () => {
    const saga = makeSaga();
    const router = makeRouter(saga);

    const pathMismatch = await router.fetch(requestFor(command(), '/book-homework/assignments/other-assignment/commands'), env());
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

  it('fails closed when saga wiring is absent and when route gate is disabled', async () => {
    const unavailable = await createBookRouter({
      handlers: createBookRouteHandlers(),
      firebaseVerifier: { verifyAuthorizationHeader: async () => ({ valid: true, uid: 'teacher-1' }) },
    }).fetch(requestFor(command()), env());
    expect(unavailable.status).toBe(503);
    await expect(unavailable.json()).resolves.toEqual({ code: 'saga_unavailable' });

    const saga = makeSaga();
    const disabled = await makeRouter(saga).fetch(requestFor(command()), env({
      BOOK_HOMEWORK_ROUTES_ENABLED: 'disabled',
    }));
    expect(disabled.status).toBe(503);
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
});
