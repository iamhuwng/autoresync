import { describe, expect, it, vi } from 'vitest';
import type {
  BookHomeworkSagaRecord,
} from '../../src/services/book-homework/bookHomeworkSaga.types.ts';
import {
  resolveCommittedBookHomeworkNotificationAction,
} from '../src/upload-worker/book-homework/notification.ts';
import {
  InMemoryBookHomeworkSagaRepository,
} from '../src/upload-worker/book-homework/sagaRepository.ts';
import {
  createBookHomeworkWorkerHandlers,
} from '../src/upload-worker/book-homework/worker.ts';
import {
  InMemoryNotificationCommandRepository,
} from '../src/upload-worker/notifications/repository.ts';

const operationId = '00000000-0000-4000-8000-000000000100';
const assignmentId = 'assignment-1';
const committedAt = '2026-08-03T12:00:00.000Z';

const record = (
  state: BookHomeworkSagaRecord['state'] = 'committed',
): BookHomeworkSagaRecord => {
  const committed = state === 'committed';
  return {
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
    state,
    visibility: committed ? 'committed' : 'hidden',
    recipients: ['student-2', 'student-1'].map((recipientId) => ({
      recipientId,
      authorityId: `${assignmentId}--${recipientId}--authority`,
      bindingId: `${assignmentId}--${recipientId}--delivery`,
      state: committed ? 'committed' as const : 'pending' as const,
      ...(committed ? { authorityRevision: 1, bindingRevision: 1 } : {}),
    })),
    recipientCount: 2,
    committedRecipientCount: committed ? 2 : 0,
    revision: committed ? 2 : 1,
    createdAt: '2026-08-03T11:59:00.000Z',
    updatedAt: committedAt,
  };
};

const identity = {
  actionId: operationId,
  authority: {
    kind: 'book-homework-assignment' as const,
    recordId: assignmentId,
  },
};

const request = () => new Request(
  `https://worker.example/book-homework/${assignmentId}/assignment`,
  {
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
      selectedRecipientIds: ['student-1', 'student-2'],
      expectedManifestFingerprint: 'manifest-fingerprint',
      expectedPublicationFingerprint: 'publication-fingerprint',
      expectedExposureApprovalFingerprint: 'exposure-fingerprint',
      expectedPolicyFingerprint: 'policy-fingerprint',
    }),
  },
);

const env = (enabled: boolean) => ({
  BOOK_NOTIFICATIONS_EMISSION_ENABLED: enabled,
  readDatabaseValue: vi.fn(async () => ({
    role: 'teacher',
    status: 'active',
    forceReauth: false,
  })),
});

describe('Book Homework committed notification integration', () => {
  it('maps only the durable committed root and its frozen recipients', async () => {
    const repository = new InMemoryBookHomeworkSagaRepository();
    await repository.create(record());

    await expect(resolveCommittedBookHomeworkNotificationAction(
      repository,
      identity,
    )).resolves.toEqual(expect.objectContaining({
      actionId: operationId,
      authority: identity.authority,
      committedAt,
      commitState: 'committed',
      affectedRecipientBoundary: {
        source: 'committed-action',
        recipientIds: ['student-2', 'student-1'],
      },
      notification: expect.objectContaining({
        title: 'New Book homework',
        message: 'A Book homework assignment is ready.',
        link: `/student/homework/${assignmentId}`,
        metadata: expect.objectContaining({
          contextType: 'book-homework',
          contextId: assignmentId,
          updateActionId: operationId,
        }),
      }),
    }));

    await expect(resolveCommittedBookHomeworkNotificationAction(repository, {
      ...identity,
      actionId: '00000000-0000-4000-8000-000000000101',
    })).resolves.toBeNull();
  });

  it('rejects prepared or missing roots without deriving a later roster', async () => {
    const repository = new InMemoryBookHomeworkSagaRepository();
    await repository.create(record('prepared'));

    await expect(resolveCommittedBookHomeworkNotificationAction(
      repository,
      identity,
    )).resolves.toBeNull();
    await expect(resolveCommittedBookHomeworkNotificationAction(repository, {
      ...identity,
      authority: { ...identity.authority, recordId: 'missing-assignment' },
    })).resolves.toBeNull();
  });

  it('emits after the trusted saga returns its committed record', async () => {
    const sagaRepository = new InMemoryBookHomeworkSagaRepository();
    await sagaRepository.create(record());
    const notifications = new InMemoryNotificationCommandRepository();
    const execute = vi.fn(async () => ({ status: 'committed' as const, record: record() }));
    const handlers = createBookHomeworkWorkerHandlers({
      saga: {
        execute,
        readCommittedAssignment: (rootAssignmentId) =>
          sagaRepository.read(rootAssignmentId),
      },
      notificationRepositoryFactory: () => notifications,
      now: () => committedAt,
    });

    const result = await handlers.homeworkAssignmentCommand({
      request: request(),
      env: env(true),
      uid: 'teacher-1',
      assignmentId,
    });

    expect(result.init.status).toBe(200);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(Object.keys(notifications.snapshot())).toHaveLength(2);
    expect(JSON.stringify(notifications.snapshot())).not.toContain('teacher-1');
    expect(JSON.stringify(notifications.snapshot())).not.toContain(
      'manifest-fingerprint',
    );
  });

  it('does not emit for non-terminal results or construct authority when disabled', async () => {
    const notificationRepositoryFactory = vi.fn(
      () => new InMemoryNotificationCommandRepository(),
    );
    const prepared = record('prepared');
    const source = vi.fn(async () => null);
    const enabledHandlers = createBookHomeworkWorkerHandlers({
      saga: {
        execute: vi.fn(async () => ({ status: 'prepared' as const, record: prepared })),
        readCommittedAssignment: source,
      },
      notificationRepositoryFactory,
      now: () => committedAt,
    });
    const preparedResult = await enabledHandlers.homeworkAssignmentCommand({
      request: request(),
      env: env(true),
      uid: 'teacher-1',
      assignmentId,
    });
    expect(preparedResult.init.status).toBe(202);
    expect(source).not.toHaveBeenCalled();
    expect(notificationRepositoryFactory).not.toHaveBeenCalled();

    const disabledExecute = vi.fn(async () => ({
      status: 'committed' as const,
      record: record(),
    }));
    const disabledHandlers = createBookHomeworkWorkerHandlers({
      saga: {
        execute: disabledExecute,
        readCommittedAssignment: source,
      },
      notificationRepositoryFactory,
      now: () => committedAt,
    });
    const disabledResult = await disabledHandlers.homeworkAssignmentCommand({
      request: request(),
      env: env(false),
      uid: 'teacher-1',
      assignmentId,
    });
    expect(disabledResult.init.status).toBe(200);
    expect(disabledExecute).toHaveBeenCalledTimes(1);
    expect(source).not.toHaveBeenCalled();
    expect(notificationRepositoryFactory).not.toHaveBeenCalled();
  });
});
