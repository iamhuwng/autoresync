import { describe, expect, it, vi } from 'vitest';
import type {
  BookHomeworkSagaRecord,
} from '../../src/services/book-homework/bookHomeworkSaga.types.ts';
import type {
  BookHomeworkSagaDependencies,
} from '../src/upload-worker/book-homework/saga.ts';
import {
  createBookHomeworkTrustedSagaFactory,
} from '../src/upload-worker/book-homework/runtime.ts';
import {
  createCanonicalBookHomeworkHandlers,
} from '../src/upload-worker/book-routes/homework-composition.ts';
import {
  InMemoryNotificationCommandRepository,
} from '../src/upload-worker/notifications/repository.ts';

const operationId = '00000000-0000-4000-8000-000000000100';
const assignmentId = 'assignment-1';
const committedAt = '2026-08-03T12:00:00.000Z';

const record = (): BookHomeworkSagaRecord => ({
  schemaVersion: 1,
  assignmentId,
  operationId,
  idempotencyKey: 'idempotency-1',
  ownerId: 'teacher-1',
  manifestVersionId: 'manifest-1',
  publicationId: 'publication-1',
  publicationRevision: 1,
  contextId: assignmentId,
  fingerprint: 'fingerprint-1',
  requestFingerprint: 'request-fingerprint-1',
  state: 'committed',
  visibility: 'committed',
  recipients: [{
    recipientId: 'student-1',
    authorityId: `${assignmentId}--student-1--authority`,
    bindingId: `${assignmentId}--student-1--delivery`,
    state: 'committed',
    authorityRevision: 1,
    bindingRevision: 1,
  }],
  recipientCount: 1,
  committedRecipientCount: 1,
  revision: 2,
  createdAt: '2026-08-03T11:59:00.000Z',
  updatedAt: committedAt,
});

const request = () => new Request('https://worker.example/book-homework', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'idempotency-key': 'idempotency-1',
  },
  body: JSON.stringify({
    assignmentId,
    operationId,
    idempotencyKey: 'idempotency-1',
    manifestVersionId: 'manifest-1',
    selectedRecipientIds: ['student-1'],
    expectedManifestFingerprint: 'manifest-fingerprint',
    expectedPublicationFingerprint: 'publication-fingerprint',
    expectedExposureApprovalFingerprint: 'exposure-fingerprint',
    expectedPolicyFingerprint: 'policy-fingerprint',
  }),
});

const workerEnv = {
  BOOK_NOTIFICATIONS_EMISSION_ENABLED: true,
  readDatabaseValue: async () => ({
    role: 'teacher',
    status: 'active',
    forceReauth: false,
  }),
};

describe('canonical Book Homework composition', () => {
  it('injects one trusted runtime and the in-process notification adapter', async () => {
    const notifications = new InMemoryNotificationCommandRepository();
    const trustedRecord = record();
    const sagaFactory = vi.fn(async () => ({
      execute: vi.fn(async () => ({
        status: 'committed' as const,
        record: trustedRecord,
      })),
      readCommittedAssignment: vi.fn(async () => trustedRecord),
    }));
    const handlers = createCanonicalBookHomeworkHandlers({
      sagaFactory,
      notificationRepositoryFactory: () => notifications,
      now: () => committedAt,
    });

    const result = await handlers.homeworkAssignmentCommand({
      request: request(),
      env: workerEnv,
      uid: 'teacher-1',
      assignmentId,
    });

    expect(result.init.status).toBe(200);
    expect(sagaFactory).toHaveBeenCalledTimes(1);
    expect(Object.keys(notifications.snapshot())).toHaveLength(1);
  });

  it('fails enabled incomplete composition before saga mutation', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const execute = vi.fn(async () => ({
      status: 'committed' as const,
      record: record(),
    }));
    const handlers = createCanonicalBookHomeworkHandlers({
      sagaFactory: async () => ({ execute }),
      now: () => committedAt,
    });

    const result = await handlers.homeworkAssignmentCommand({
      request: request(),
      env: workerEnv,
      uid: 'teacher-1',
      assignmentId,
    });

    expect(result.init.status).toBe(500);
    expect(execute).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('rejects ambiguous static and per-request runtime composition', () => {
    expect(() => createCanonicalBookHomeworkHandlers({
      saga: { execute: vi.fn() },
      sagaFactory: vi.fn(),
    })).toThrow('book_homework_runtime_ambiguous');
  });

  it('fails closed when the trusted provider omits canonical dependencies', async () => {
    const sagaFactory = createBookHomeworkTrustedSagaFactory({
      resolveDependencies: async () => (
        {} as unknown as BookHomeworkSagaDependencies
      ),
    });

    await expect(sagaFactory({})).rejects.toThrow(
      'book_homework_runtime_dependencies_unavailable',
    );
  });
});
