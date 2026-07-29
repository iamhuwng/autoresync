import { describe, expect, it, vi } from 'vitest';
import {
  createNotificationCommandWorkerHandlers,
} from '../src/upload-worker/notifications/worker.ts';
import {
  FirebaseRestNotificationCommandRepository,
  InMemoryNotificationCommandRepository,
} from '../src/upload-worker/notifications/repository.ts';
import {
  notificationCommandRouteDescriptor,
} from '../src/upload-worker/notifications/route.ts';
import { canonicalBookRouteManifest } from '../src/upload-worker/book-routes/manifest.ts';

const operationId = '00000000-0000-4000-8000-000000000094';
const body = (override: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  commandType: 'create-notification',
  operationId,
  producerFamily: 'assignment',
  recipientId: 'student-1',
  authority: { kind: 'assignment', recordId: 'assignment-1' },
  notification: {
    type: 'info',
    title: 'Homework assigned',
    message: 'A new assignment is ready.',
    link: '/student/homework/homework-1',
    metadata: {
      schemaVersion: 1,
      kind: 'book',
      contextType: 'book-homework',
      contextId: 'homework-1',
      updateActionId: 'assignment-1',
      checkpointAvailable: false,
      deadlineClass: 'upcoming',
      actionClass: 'due',
    },
  },
  ...override,
});
const request = (value: unknown, key = operationId) => new Request(
  'https://worker.test/book-notifications/commands',
  {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'Idempotency-Key': key,
    },
    body: JSON.stringify(value),
  },
);
const parse = async (result: {
  body: Record<string, unknown>;
  init: ResponseInit;
}) => ({ status: result.init.status, body: result.body });

describe('Ticket 38B1 trusted notification command seam', () => {
  it('matches the canonical disabled #59 route reservation without composing a handler', () => {
    const canonical = canonicalBookRouteManifest.find((route) => route.id === 'book.notifications.command');
    expect(canonical).toMatchObject({
      pathTemplate: notificationCommandRouteDescriptor.path,
      methods: [notificationCommandRouteDescriptor.method],
      handler: `futureSeam.${notificationCommandRouteDescriptor.handler}`,
      gateEnv: 'BOOK_NOTIFICATIONS_ROUTES_ENABLED',
      gateDefault: 'disabled',
    });
  });

  it('derives recipient authority and creates one notification', async () => {
    const repository = new InMemoryNotificationCommandRepository();
    const resolveRecipientAuthority = vi.fn(async () => 'student-1');
    const handlers = createNotificationCommandWorkerHandlers({
      repository,
      resolveRecipientAuthority,
      now: () => 1_722_220_000_000,
    });

    await expect(parse(await handlers.command({
      request: request(body()),
      env: {},
      uid: 'teacher-1',
    }))).resolves.toEqual({
      status: 200,
      body: {
        status: 'created',
        operationId,
        notificationId: operationId,
      },
    });
    expect(resolveRecipientAuthority).toHaveBeenCalledWith({
      actorUid: 'teacher-1',
      producerFamily: 'assignment',
      authority: { kind: 'assignment', recordId: 'assignment-1' },
      requestedRecipientId: 'student-1',
      env: {},
    });
    expect(repository.snapshot()).toEqual({
      [`notifications/student-1/${operationId}`]: expect.objectContaining({
        id: operationId,
        read: false,
        createdAt: 1_722_220_000_000,
        metadata: expect.objectContaining({ kind: 'book', contextId: 'homework-1' }),
      }),
    });
  });

  it('replays identical commands and rejects operation reuse with changed content', async () => {
    const repository = new InMemoryNotificationCommandRepository();
    const handlers = createNotificationCommandWorkerHandlers({
      repository,
      resolveRecipientAuthority: async () => 'student-1',
      now: () => 1_722_220_000_000,
    });
    const input = { env: {}, uid: 'teacher-1' };
    await handlers.command({ ...input, request: request(body()) });
    await expect(parse(await handlers.command({
      ...input,
      request: request(body()),
    }))).resolves.toMatchObject({ status: 200, body: { status: 'replayed' } });
    await expect(parse(await handlers.command({
      ...input,
      request: request(body({
        notification: {
          type: 'info',
          title: 'Changed',
          message: 'A new assignment is ready.',
        },
      })),
    }))).resolves.toMatchObject({
      status: 409,
      body: { status: 'idempotency-conflict' },
    });
    expect(Object.keys(repository.snapshot())).toHaveLength(1);
  });

  it('fails before persistence for malformed, unauthorized, and unavailable commands', async () => {
    const repository = new InMemoryNotificationCommandRepository();
    const denied = createNotificationCommandWorkerHandlers({
      repository,
      resolveRecipientAuthority: async () => null,
    });
    await expect(parse(await denied.command({
      request: request(body({ extra: true })),
      env: {},
      uid: 'teacher-1',
    }))).resolves.toMatchObject({
      status: 400,
      body: { code: 'notification_command_unknown_field' },
    });
    await expect(parse(await denied.command({
      request: request(body()),
      env: {},
      uid: 'teacher-1',
    }))).resolves.toMatchObject({
      status: 403,
      body: { code: 'notification_command_recipient_forbidden' },
    });
    await expect(parse(await createNotificationCommandWorkerHandlers().command({
      request: request(body()),
      env: {},
      uid: 'teacher-1',
    }))).resolves.toMatchObject({
      status: 503,
      body: { code: 'notification_command_unavailable' },
    });
    await expect(parse(await denied.command({
      request: request(body()),
      env: {},
      uid: '',
    }))).resolves.toMatchObject({
      status: 401,
      body: { code: 'notification_command_unauthenticated' },
    });
    expect(repository.snapshot()).toEqual({});
  });

  it('rejects legacy metadata, arbitrary URLs, and mismatched idempotency headers', async () => {
    const handlers = createNotificationCommandWorkerHandlers({
      repository: new InMemoryNotificationCommandRepository(),
      resolveRecipientAuthority: async () => 'student-1',
    });
    for (const [value, key, code] of [
      [body({ notification: { type: 'info', title: 'Title', message: 'Message', metadata: { answer: 'secret' } } }), operationId, 'notification_command_invalid_metadata'],
      [body({ notification: { type: 'info', title: 'Title', message: 'Message', link: 'https://evil.example' } }), operationId, 'notification_command_invalid_link'],
      [body(), '00000000-0000-4000-8000-000000000095', 'notification_command_idempotency_mismatch'],
    ] as const) {
      await expect(parse(await handlers.command({
        request: request(value, key),
        env: {},
        uid: 'teacher-1',
      }))).resolves.toMatchObject({ status: 400, body: { code } });
    }
  });

  it('uses conditional Firebase persistence and replays without a second write', async () => {
    const stored = {
      id: operationId,
      type: 'info',
      title: 'Homework assigned',
      message: 'A new assignment is ready.',
      link: '/student/homework/homework-1',
      metadata: body().notification.metadata,
      read: true,
      createdAt: 1_722_220_000_000,
    };
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('null', {
        status: 200,
        headers: { etag: '"null"' },
      }))
      .mockResolvedValueOnce(new Response('', { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(stored), {
        status: 200,
        headers: { etag: '"existing"' },
      }));
    const repository = new FirebaseRestNotificationCommandRepository({
      env: {
        FIREBASE_DB_URL: 'https://example.firebaseio.com',
        NOTIFICATION_COMMAND_SERVICE_IDENTITY: 'notification@example.iam.gserviceaccount.com',
      },
      fetchImpl,
      getAccessToken: async () => 'token',
    });
    const input = {
      operationId,
      recipientId: 'student-1',
      notification: body().notification,
      now: 1_722_220_000_000,
    };
    await expect(repository.create(input)).resolves.toMatchObject({ status: 'created' });
    await expect(repository.create(input)).resolves.toMatchObject({ status: 'replayed' });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls[1]?.[1]).toMatchObject({
      method: 'PUT',
      headers: expect.objectContaining({ 'if-match': '"null"' }),
    });
  });
});
