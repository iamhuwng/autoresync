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

const makeSaga = () => ({
  execute: vi.fn(async (_input: BookHomeworkSagaCommand) => ({
    status: 'committed' as const,
    record: record(),
  })),
  resolveStudentProjection: vi.fn(async () => ({
    authority: { manifestVersionId: 'manifest-1' },
    delivery: { record: { binding: { bindingId: 'assignment-1--student-1--delivery' } } },
  })),
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
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      assignmentId: 'assignment-1',
      authority: { manifestVersionId: 'manifest-1' },
      delivery: { record: { binding: { bindingId: 'assignment-1--student-1--delivery' } } },
    });
    expect(saga.resolveStudentProjection).toHaveBeenCalledWith('assignment-1', 'student-1');

    saga.resolveStudentProjection.mockResolvedValueOnce(null as never);
    const missing = await router.fetch(request, env());
    expect(missing.status).toBe(404);
  });
});
