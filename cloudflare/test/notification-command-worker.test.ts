import { describe, expect, it, vi } from 'vitest';
import { createNotificationCommandWorkerHandlers } from '../src/upload-worker/notifications/worker.ts';
import {
  FirebaseRestNotificationCommandRepository,
  InMemoryNotificationCommandRepository,
} from '../src/upload-worker/notifications/repository.ts';

const operationId = '00000000-0000-5000-8000-000000000100';
const command = (override: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  commandType: 'create-notification',
  operationId,
  producerFamily: 'book',
  recipientId: 'student-1',
  authority: { kind: 'book', recordId: 'book-1' },
  notification: {
    type: 'info',
    title: 'Book updated',
    message: 'A new Book activity is ready.',
    link: '/student/practice/book-1',
    metadata: {
      schemaVersion: 1,
      kind: 'book',
      contextType: 'book-activity',
      contextId: 'book-1',
      updateActionId: 'publish-001',
      checkpointAvailable: true,
      deadlineClass: 'none',
      actionClass: 'open',
    },
  },
  ...override,
});

const request = (value: unknown, idempotencyKey = operationId) => new Request(
  'https://worker.test/book-notifications/commands',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(value),
  },
);

describe('shared notification command repository seam', () => {
  it('derives trusted recipient authority and persists one Book row', async () => {
    const repository = new InMemoryNotificationCommandRepository();
    const resolveRecipientAuthority = vi.fn(async () => 'student-1');
    const handlers = createNotificationCommandWorkerHandlers({
      repository,
      resolveRecipientAuthority,
      now: () => 1,
    });
    const result = await handlers.command({ request: request(command()), env: {}, uid: 'teacher-1' });
    expect(result).toMatchObject({
      init: { status: 200 },
      body: { status: 'created', operationId, notificationId: operationId },
    });
    expect(resolveRecipientAuthority).toHaveBeenCalledWith(expect.objectContaining({
      producerFamily: 'book',
      requestedRecipientId: 'student-1',
    }));
    expect(Object.keys(repository.snapshot())).toEqual([`notifications/student-1/${operationId}`]);
  });

  it('replays identical commands and rejects conflicting operation reuse', async () => {
    const repository = new InMemoryNotificationCommandRepository();
    const handlers = createNotificationCommandWorkerHandlers({
      repository,
      resolveRecipientAuthority: async () => 'student-1',
      now: () => 1,
    });
    await handlers.command({ request: request(command()), env: {}, uid: 'teacher-1' });
    await expect(handlers.command({ request: request(command()), env: {}, uid: 'teacher-1' })).resolves.toMatchObject({
      body: { status: 'replayed' },
    });
    await expect(handlers.command({
      request: request(command({ notification: { ...command().notification, message: 'changed' } })),
      env: {}, uid: 'teacher-1',
    })).resolves.toMatchObject({ init: { status: 409 }, body: { status: 'idempotency-conflict' } });
    expect(Object.keys(repository.snapshot())).toHaveLength(1);
  });

  it('fails closed for malformed commands, unauthorized recipients, and unsafe destinations', async () => {
    const repository = new InMemoryNotificationCommandRepository();
    const denied = createNotificationCommandWorkerHandlers({
      repository,
      resolveRecipientAuthority: async () => null,
    });
    await expect(denied.command({ request: request(command({ extra: true })), env: {}, uid: 'teacher-1' }))
      .resolves.toMatchObject({ init: { status: 400 } });
    await expect(denied.command({ request: request(command()), env: {}, uid: 'teacher-1' }))
      .resolves.toMatchObject({ init: { status: 403 }, body: { code: 'notification_command_recipient_forbidden' } });
    await expect(denied.command({
      request: request(command({ notification: { ...command().notification, link: 'https://evil.example' } })),
      env: {}, uid: 'teacher-1',
    })).resolves.toMatchObject({ init: { status: 400 }, body: { code: 'notification_command_invalid_link' } });
    expect(repository.snapshot()).toEqual({});
  });

  it('keeps the trusted repository boundary from being bypassed by direct callers', async () => {
    const repository = new InMemoryNotificationCommandRepository();
    const base = {
      operationId,
      recipientId: 'student-1',
      notification: command().notification,
      now: 1,
    };
    await expect(repository.create({
      ...base,
      notification: { ...base.notification, title: '' },
    })).rejects.toThrow('invalid_notification_title');
    await expect(repository.create({
      ...base,
      notification: { ...base.notification, link: 'https://evil.example' },
    })).rejects.toThrow('invalid_notification_link');
    await expect(repository.create({
      ...base,
      notification: {
        ...base.notification,
        metadata: { ...base.notification.metadata, answerKey: 'private' },
      } as never,
    })).rejects.toThrow('invalid_notification_metadata');
    expect(repository.snapshot()).toEqual({});
  });

  it('uses the existing Firebase REST CAS path without overwriting a stored row', async () => {
    let stored: Record<string, unknown> | null = null;
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'GET') {
        return new Response(stored === null ? 'null' : JSON.stringify(stored), {
          status: 200,
          headers: { ETag: '"notification-etag"' },
        });
      }
      stored = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response('', { status: 200 });
    });
    const repository = new FirebaseRestNotificationCommandRepository({
      env: {
        FIREBASE_DB_URL: 'https://example.firebaseio.com',
        NOTIFICATION_COMMAND_SERVICE_IDENTITY: 'notify@example.iam.gserviceaccount.com',
      },
      getAccessToken: async () => 'test-token',
      fetchImpl,
    });
    const write = {
      operationId,
      recipientId: 'student-1',
      notification: command().notification,
      now: 1,
    };
    await expect(repository.create(write)).resolves.toMatchObject({ status: 'created' });
    await expect(repository.create(write)).resolves.toMatchObject({ status: 'replayed' });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain(`/notifications/student-1/${operationId}.json`);
    expect(fetchImpl.mock.calls[1]?.[1]).toMatchObject({ method: 'PUT' });
    expect(stored).toMatchObject({ id: operationId, read: false });
  });
});
