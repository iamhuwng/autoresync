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
  type NotificationCommandRepository,
} from '../src/upload-worker/notifications/repository.ts';

const operationId = '00000000-0000-4000-8000-000000000100';
const assignmentId = 'assignment-1';
const committedAt = '2026-08-03T12:00:00.000Z';

const record = (
  state: BookHomeworkSagaRecord['state'] = 'committed',
  recipientIds: readonly string[] = ['student-2', 'student-1'],
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
    presentation: { title: 'Book Homework' },
    fingerprint: 'fingerprint-1',
    requestFingerprint: 'request-fingerprint-1',
    state,
    visibility: committed ? 'committed' : 'hidden',
    recipients: recipientIds.map((recipientId) => ({
      recipientId,
      authorityId: `${assignmentId}--${recipientId}--authority`,
      bindingId: `${assignmentId}--${recipientId}--delivery`,
      state: committed ? 'committed' as const : 'pending' as const,
      ...(committed ? { authorityRevision: 1, bindingRevision: 1 } : {}),
    })),
    recipientCount: recipientIds.length,
    committedRecipientCount: committed ? recipientIds.length : 0,
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
      intent: {
        bookId: 'book-1',
        target: { kind: 'unit', bookId: 'book-1', nodeKey: 'unit-1', classId: 'class-1' },
        schedule: { finalDueAt: '2026-08-30T00:00:00.000Z', nodeOverrides: [] },
        policy: {
          intent: 'practice', integrityCapture: false, integrityOverride: false,
          activityPolicies: [{
            placementId: 'placement-1', maxAttempts: 2, feedbackRelease: 'immediate', lateSubmissionAllowed: false,
          }],
        },
        expectedPublication: {
          publicationId: 'publication-1', publicationRevision: 1, manifestVersionId: 'manifest-1',
        },
        presentation: { title: 'Book Homework' },
      },
      selectedRecipientIds: ['student-1', 'student-2'],
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

const runCommand = async (
  handlers: ReturnType<typeof createBookHomeworkWorkerHandlers>,
  input: Parameters<ReturnType<typeof createBookHomeworkWorkerHandlers>['homeworkAssignmentCommand']>[0],
) => {
  const tasks: Promise<void>[] = [];
  const result = await handlers.homeworkAssignmentCommand({ ...input,
    executionContext: { waitUntil: (task) => { tasks.push(task); } },
  });
  await Promise.all(tasks);
  return result;
};

describe('Book Homework committed notification integration', () => {
  it('persists failed best-effort delivery through the authenticated actor admin-report path', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    const previousFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    const diagnostic = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const requestValue = request();
      requestValue.headers.set('authorization', 'Bearer teacher-actor-token');
      const handlers = createBookHomeworkWorkerHandlers({
        saga: { execute: async () => ({ status: 'committed', record: record() }),
          readCommittedAssignment: async () => record() },
        notificationRepositoryFactory: () => ({ create: async () => { throw new Error('private-provider-error'); } }),
      });
      const result = await runCommand(handlers, { request: requestValue, uid: 'teacher-1', assignmentId,
        env: { ...env(true), FIREBASE_DB_URL: 'https://example.firebaseio.com' } });
      expect(result.init.status).toBe(200);
      expect(result.body).toMatchObject({ state: 'committed', operationId });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const [url, init] = fetchImpl.mock.calls[0];
      expect(String(url)).toContain('/reports/errors/');
      expect(String(url)).toContain('?auth=teacher-actor-token');
      expect(init.method).toBe('PUT');
      expect(JSON.parse(init.body)).toMatchObject({ userId: 'teacher-1', severity: 'warning',
        contextData: { eventId: operationId, recipientCount: 2, delivered: 0, failed: 0, unknown: 1, unattempted: 1 } });
      expect(init.body).not.toContain('private-provider-error');
    } finally {
      globalThis.fetch = previousFetch;
      diagnostic.mockRestore();
    }
  });
  it('maps only the durable committed root and its frozen recipients', async () => {
    const repository = new InMemoryBookHomeworkSagaRepository();
    await repository.create(record());

    await expect(resolveCommittedBookHomeworkNotificationAction(
      repository,
      identity,
      'teacher-1',
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
    }, 'teacher-1')).resolves.toBeNull();
  });

  it('rejects prepared or missing roots without deriving a later roster', async () => {
    const repository = new InMemoryBookHomeworkSagaRepository();
    await repository.create(record('prepared'));

    await expect(resolveCommittedBookHomeworkNotificationAction(
      repository,
      identity,
      'teacher-1',
    )).resolves.toBeNull();
    await expect(resolveCommittedBookHomeworkNotificationAction(repository, {
      ...identity,
      authority: { ...identity.authority, recordId: 'missing-assignment' },
    }, 'teacher-1')).resolves.toBeNull();
  });

  it('rejects a committed record returned for a different authenticated owner', async () => {
    const source = {
      readCommittedAssignment: async () => record(),
    };
    await expect(resolveCommittedBookHomeworkNotificationAction(
      source,
      identity,
      'teacher-2',
    )).resolves.toBeNull();
  });

  it('emits after the trusted saga returns its committed record', async () => {
    const sagaRepository = new InMemoryBookHomeworkSagaRepository();
    await sagaRepository.create(record());
    const notifications = new InMemoryNotificationCommandRepository();
    const execute = vi.fn(async () => ({ status: 'committed' as const, record: record() }));
    const handlers = createBookHomeworkWorkerHandlers({
      saga: {
        execute,
        readCommittedAssignment: (rootAssignmentId, ownerId) =>
          sagaRepository.read(rootAssignmentId, ownerId),
      },
      notificationRepositoryFactory: () => notifications,
      now: () => committedAt,
    });

    const result = await runCommand(handlers, {
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
    const preparedResult = await runCommand(enabledHandlers, {
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
    const disabledResult = await runCommand(disabledHandlers, {
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

  it('waits for projection success, then emits the same committed operation exactly once', async () => {
    const sagaRepository = new InMemoryBookHomeworkSagaRepository();
    await sagaRepository.create(record());
    const notifications = new InMemoryNotificationCommandRepository();
    const execute = vi.fn()
      .mockResolvedValueOnce({ status: 'committed_projection_pending' as const, record: record() })
      .mockResolvedValue({ status: 'committed' as const, record: record() });
    const handlers = createBookHomeworkWorkerHandlers({
      saga: {
        execute,
        readCommittedAssignment: (rootAssignmentId, ownerId) => sagaRepository.read(rootAssignmentId, ownerId),
      },
      notificationRepositoryFactory: () => notifications,
      now: () => committedAt,
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect((await runCommand(handlers, {
      request: request(), env: env(true), uid: 'teacher-1', assignmentId,
    })).init.status).toBe(202);
    expect(notifications.snapshot()).toEqual({});

    expect((await runCommand(handlers, {
      request: request(), env: env(true), uid: 'teacher-1', assignmentId,
    })).init.status).toBe(200);
    expect(Object.keys(notifications.snapshot())).toHaveLength(2);

    await runCommand(handlers, {
      request: request(), env: env(true), uid: 'teacher-1', assignmentId,
    });
    expect(Object.keys(notifications.snapshot())).toHaveLength(2);
    consoleError.mockRestore();
  });

  it('re-enters emission after a committed action crashes before its first write', async () => {
    const sagaRepository = new InMemoryBookHomeworkSagaRepository();
    await sagaRepository.create(record());
    const notifications = new InMemoryNotificationCommandRepository();
    const execute = vi.fn(async () => ({
      status: 'committed' as const,
      record: record(),
    }));
    let repositoryUnavailable = true;
    const handlers = createBookHomeworkWorkerHandlers({
      saga: {
        execute,
        readCommittedAssignment: (rootAssignmentId, ownerId) =>
          sagaRepository.read(rootAssignmentId, ownerId),
      },
      notificationRepositoryFactory: () => {
        if (repositoryUnavailable) {
          repositoryUnavailable = false;
          throw new Error('notification_repository_unavailable');
        }
        return notifications;
      },
      now: () => committedAt,
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const first = await runCommand(handlers, {
      request: request(),
      env: env(true),
      uid: 'teacher-1',
      assignmentId,
    });
    expect(first).toMatchObject({ body: { state: 'committed' }, init: { status: 200 } });
    expect(notifications.snapshot()).toEqual({});

    const replay = await runCommand(handlers, {
      request: request(),
      env: env(true),
      uid: 'teacher-1',
      assignmentId,
    });
    expect(replay.init.status).toBe(200);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(Object.keys(notifications.snapshot())
      .map((key) => key.split('/')[1])
      .sort()).toEqual(['student-1', 'student-2']);
    consoleError.mockRestore();
  });

  it('finishes only missing frozen recipients after lost acknowledgement', async () => {
    const sagaRepository = new InMemoryBookHomeworkSagaRepository();
    await sagaRepository.create(record());
    const durable = new InMemoryNotificationCommandRepository();
    let failAfterFirstPersistence = true;
    const notificationRepository: NotificationCommandRepository = {
      create: vi.fn(async (input) => {
        const result = await durable.create(input);
        if (failAfterFirstPersistence) {
          failAfterFirstPersistence = false;
          throw new Error('lost_acknowledgement');
        }
        return result;
      }),
    };
    const surroundingRecipients = ['student-2', 'student-1'];
    const execute = vi.fn(async () => ({
      status: 'committed' as const,
      record: record('committed', surroundingRecipients),
    }));
    const handlers = createBookHomeworkWorkerHandlers({
      saga: {
        execute,
        readCommittedAssignment: (rootAssignmentId, ownerId) =>
          sagaRepository.read(rootAssignmentId, ownerId),
      },
      notificationRepositoryFactory: () => notificationRepository,
      now: () => committedAt,
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const first = await runCommand(handlers, {
      request: request(),
      env: env(true),
      uid: 'teacher-1',
      assignmentId,
    });
    expect(first.init.status).toBe(200);
    expect(Object.keys(durable.snapshot())).toHaveLength(1);

    surroundingRecipients.push('student-3');
    const replay = await runCommand(handlers, {
      request: request(),
      env: env(true),
      uid: 'teacher-1',
      assignmentId,
    });
    expect(replay.init.status).toBe(200);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(Object.keys(durable.snapshot())
      .map((key) => key.split('/')[1])
      .sort()).toEqual(['student-1', 'student-2']);
    expect(JSON.stringify(durable.snapshot())).not.toContain('student-3');

    const duplicate = await runCommand(handlers, {
      request: request(),
      env: env(true),
      uid: 'teacher-1',
      assignmentId,
    });
    expect(duplicate.init.status).toBe(200);
    expect(Object.keys(durable.snapshot())
      .map((key) => key.split('/')[1])
      .sort()).toEqual(['student-1', 'student-2']);
    expect(notificationRepository.create).toHaveBeenCalledTimes(5);
    consoleError.mockRestore();
  });
});
