import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  BookNotificationEmissionError,
  createBookNotificationEmitter,
  deterministicBookNotificationId,
  type BookCommittedNotificationAction,
  type BookNotificationActionIdentity,
} from '../src/upload-worker/notifications/book-emitter.ts';
import {
  InMemoryNotificationCommandRepository,
  type NotificationCommandRepository,
} from '../src/upload-worker/notifications/repository.ts';

const identity: BookNotificationActionIdentity = {
  actionId: '00000000-0000-5000-8000-000000000100',
  authority: {
    kind: 'book-homework-assignment',
    recordId: 'homework-1',
  },
};

const action = (
  recipientIds: readonly string[] = ['student-1'],
): BookCommittedNotificationAction => ({
  ...identity,
  schemaVersion: 1,
  committedAt: '2026-08-03T00:00:00.000Z',
  commitState: 'committed',
  affectedRecipientBoundary: {
    source: 'committed-action',
    recipientIds,
  },
  notification: {
    type: 'info',
    title: 'Book Homework assigned',
    message: 'A new Book Homework assignment is ready.',
    link: '/student/homework/homework-1',
    metadata: {
      schemaVersion: 1,
      kind: 'book',
      contextType: 'book-homework',
      contextId: 'homework-1',
      updateActionId: identity.actionId,
      checkpointAvailable: false,
      deadlineClass: 'upcoming',
      actionClass: 'due',
    },
  },
});

const enabledEmitter = (
  repository: NotificationCommandRepository,
  committed: BookCommittedNotificationAction = action(),
) => createBookNotificationEmitter({
  repository,
  enabled: true,
  resolveCommittedAction: async () => committed,
  resolveDestination: async ({ action: resolved }) =>
    resolved.notification.link ?? null,
  now: () => 1,
});

describe('Book notification emitter additive seam', () => {
  it('handles zero, one, and multiple frozen recipients', async () => {
    const emptyRepository = new InMemoryNotificationCommandRepository();
    await expect(enabledEmitter(emptyRepository, action([])).emit(identity))
      .resolves.toEqual({
        status: 'empty',
        created: 0,
        replayed: 0,
        notificationIds: [],
      });

    const oneRepository = new InMemoryNotificationCommandRepository();
    await expect(enabledEmitter(oneRepository).emit(identity))
      .resolves.toMatchObject({ status: 'emitted', created: 1, replayed: 0 });
    expect(Object.keys(oneRepository.snapshot())).toHaveLength(1);

    const manyRepository = new InMemoryNotificationCommandRepository();
    await expect(enabledEmitter(
      manyRepository,
      action(['student-2', 'student-1']),
    ).emit(identity)).resolves.toMatchObject({
      status: 'emitted',
      created: 2,
      replayed: 0,
    });
    expect(Object.keys(manyRepository.snapshot())).toHaveLength(2);
  });

  it('uses assignment authority, action, and recipient for stable identity', async () => {
    const first = await deterministicBookNotificationId({
      ...identity,
      recipientId: 'student-1',
    });
    const replay = await deterministicBookNotificationId({
      ...identity,
      recipientId: 'student-1',
    });
    const otherAssignment = await deterministicBookNotificationId({
      ...identity,
      authority: { ...identity.authority, recordId: 'homework-2' },
      recipientId: 'student-1',
    });
    expect(first).toBe(replay);
    expect(otherAssignment).not.toBe(first);
    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
  });

  it('replays duplicate delivery without overwriting read state', async () => {
    const repository = new InMemoryNotificationCommandRepository();
    const emitter = enabledEmitter(repository);
    await expect(emitter.emit(identity)).resolves.toMatchObject({
      created: 1,
      replayed: 0,
    });
    await expect(emitter.emit(identity)).resolves.toMatchObject({
      created: 0,
      replayed: 1,
    });
    expect(Object.keys(repository.snapshot())).toHaveLength(1);
  });

  it('recovers after persistence with a lost acknowledgement and partial fan-out', async () => {
    const durable = new InMemoryNotificationCommandRepository();
    let failAfterFirstPersistence = true;
    const repository: NotificationCommandRepository = {
      create: vi.fn(async (input) => {
        const result = await durable.create(input);
        if (failAfterFirstPersistence) {
          failAfterFirstPersistence = false;
          throw new Error('lost_acknowledgement');
        }
        return result;
      }),
    };
    const emitter = enabledEmitter(
      repository,
      action(['student-2', 'student-1']),
    );
    await expect(emitter.emit(identity)).rejects.toThrow(
      'lost_acknowledgement',
    );
    expect(Object.keys(durable.snapshot())).toHaveLength(1);
    await expect(emitter.emit(identity)).resolves.toMatchObject({
      created: 1,
      replayed: 1,
    });
    expect(Object.keys(durable.snapshot())).toHaveLength(2);
  });

  it('uses the original committed boundary when surrounding recipients change', async () => {
    const repository = new InMemoryNotificationCommandRepository();
    const committed = action(['student-1', 'student-2']);
    let surroundingRoster = ['student-1', 'student-2'];
    const resolver = vi.fn(async () => committed);
    const emitter = createBookNotificationEmitter({
      repository,
      enabled: true,
      resolveCommittedAction: resolver,
      resolveDestination: async ({ action: resolved }) =>
        resolved.notification.link ?? null,
    });
    await emitter.emit(identity);
    surroundingRoster = [...surroundingRoster, 'student-3'];
    await emitter.emit(identity);
    expect(surroundingRoster).toContain('student-3');
    expect(Object.keys(repository.snapshot())).toHaveLength(2);
    expect(JSON.stringify(repository.snapshot())).not.toContain('student-3');
    expect(resolver).toHaveBeenCalledTimes(2);
  });

  it('rejects stale, conflicting, malformed, private, and unsafe actions', async () => {
    const repository = new InMemoryNotificationCommandRepository();
    await expect(createBookNotificationEmitter({
      repository,
      enabled: true,
      resolveCommittedAction: async () => null,
      resolveDestination: async () => '/student/homework/homework-1',
    }).emit(identity)).rejects.toMatchObject({
      code: 'book_notification_action_stale',
    });

    for (const committed of [
      { ...action(), commitState: 'prepared' },
      {
        ...action(),
        affectedRecipientBoundary: {
          source: 'browser',
          recipientIds: ['student-1'],
        },
      },
      action(['student/forged']),
      {
        ...action(),
        notification: {
          ...action().notification,
          metadata: {
            ...action().notification.metadata,
            answerKey: 'private',
          },
        },
      },
      {
        ...action(),
        notification: {
          ...action().notification,
          title: 'unsafe\u0000title',
        },
      },
      {
        ...action(),
        authority: null,
      },
      {
        ...action(),
        authority: {
          kind: 'book-homework-assignment',
          recordId: 123,
        },
      },
      action([null as unknown as string]),
    ] as unknown as BookCommittedNotificationAction[]) {
      await expect(enabledEmitter(repository, committed).emit(identity))
        .rejects.toBeInstanceOf(BookNotificationEmissionError);
    }

    for (const malformedIdentity of [
      { ...identity, actionId: 123 },
      { ...identity, authority: { ...identity.authority, recordId: null } },
      { ...identity, recipientId: false },
    ]) {
      await expect(deterministicBookNotificationId(
        malformedIdentity as unknown as Parameters<
          typeof deterministicBookNotificationId
        >[0],
      )).rejects.toBeInstanceOf(BookNotificationEmissionError);
    }

    await expect(createBookNotificationEmitter({
      repository,
      enabled: true,
      resolveCommittedAction: async () => action(),
      resolveDestination: async () => 'https://attacker.example',
    }).emit(identity)).rejects.toMatchObject({
      code: 'book_notification_destination_invalid',
    });
    expect(repository.snapshot()).toEqual({});
  });

  it('treats conflicting deterministic identity reuse as an error', async () => {
    const repository = new InMemoryNotificationCommandRepository();
    const operationId = await deterministicBookNotificationId({
      ...identity,
      recipientId: 'student-1',
    });
    await repository.create({
      operationId,
      recipientId: 'student-1',
      notification: {
        ...action().notification,
        message: 'Conflicting content',
      },
      now: 1,
    });
    await expect(enabledEmitter(repository).emit(identity)).rejects
      .toMatchObject({ code: 'book_notification_idempotency_conflict' });
    expect(Object.keys(repository.snapshot())).toHaveLength(1);
  });

  it('keeps disabled rollback default-deny and avoids durable resolution', async () => {
    const repository = new InMemoryNotificationCommandRepository();
    const resolveCommittedAction = vi.fn(async () => action());
    const emitter = createBookNotificationEmitter({
      repository,
      resolveCommittedAction,
      resolveDestination: async () => '/student/homework/homework-1',
    });
    await expect(emitter.emit(identity)).resolves.toMatchObject({
      status: 'disabled',
    });
    await expect(emitter.emit(identity, {
      env: { BOOK_NOTIFICATIONS_EMISSION_ENABLED: 'false' },
    })).resolves.toMatchObject({ status: 'disabled' });
    expect(resolveCommittedAction).not.toHaveBeenCalled();
    expect(repository.snapshot()).toEqual({});
  });

  it('rejects forbidden Book-only infrastructure and storage shapes', () => {
    const sourceRoot = new URL('../src/upload-worker/', import.meta.url);
    const sourceFiles = (directory: URL): URL[] => readdirSync(directory, {
      withFileTypes: true,
    }).flatMap((entry) => {
      const child = new URL(entry.name, directory);
      if (entry.isDirectory()) return sourceFiles(new URL(`${child.href}/`));
      return entry.isFile() && entry.name.endsWith('.ts') ? [child] : [];
    });
    const files = sourceFiles(sourceRoot);
    const paths = files.map((file) => file.pathname.toLowerCase());
    expect(paths).not.toEqual(expect.arrayContaining([
      expect.stringMatching(
        /book[-_]?notification[-_]?(?:service|queue|outbox|consumer|fan[-_]?out|ledger|worker)/u,
      ),
    ]));
    const source = files
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');
    expect(source).toContain('NotificationCommandRepository');
    expect(source).not.toMatch(
      /book_notifications|notifications\/book(?:\/|$)|self[-_ ]http/u,
    );
    expect(source).not.toMatch(
      /(?:class|function|const)\s+(?:create)?BookNotification(?:Service|Queue|Outbox|Consumer|FanOut|Ledger|Worker)\b/u,
    );
    const emitterSource = readFileSync(
      new URL('../src/upload-worker/notifications/book-emitter.ts', import.meta.url),
      'utf8',
    );
    expect(emitterSource).not.toMatch(/\bfetch\s*\(/u);
  });
});
