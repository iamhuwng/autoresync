import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  BookNotificationEmissionError,
  createBookNotificationEmitter,
  deterministicBookNotificationId,
  type BookCommittedNotificationAction,
} from '../src/upload-worker/notifications/book-emitter.ts';
import { InMemoryNotificationCommandRepository } from '../src/upload-worker/notifications/repository.ts';

const metadata = {
  schemaVersion: 1 as const,
  kind: 'book' as const,
  contextType: 'book-activity' as const,
  contextId: 'book-1',
  updateActionId: 'publish-001',
  checkpointAvailable: true,
  deadlineClass: 'none' as const,
  actionClass: 'open' as const,
};

const action = (recipientIds: readonly string[] = ['student-1']): BookCommittedNotificationAction => ({
  schemaVersion: 1,
  actionId: 'publish-001',
  committedAt: '2026-08-03T00:00:00.000Z',
  commitState: 'committed',
  authority: { kind: 'book', recordId: 'book-1' },
  affectedRecipientBoundary: { source: 'committed-action', recipientIds },
  notification: {
    type: 'info',
    title: 'Book updated',
    message: 'A new Book activity is ready.',
    link: '/student/practice/book-1',
    metadata,
  },
});

const enabledEmitter = (repository: InMemoryNotificationCommandRepository) =>
  createBookNotificationEmitter({
    repository,
    enabled: true,
    verifyCommittedAction: async () => true,
    resolveDestination: async ({ action }) => action.notification.link ?? null,
    now: () => 1_754_185_600_000,
  });

describe('Book notification emission', () => {
  it('handles zero, one, and multiple trusted recipients', async () => {
    const zeroRepository = new InMemoryNotificationCommandRepository();
    await expect(enabledEmitter(zeroRepository).emit(action([]))).resolves.toMatchObject({
      status: 'empty', created: 0, replayed: 0,
    });
    expect(zeroRepository.snapshot()).toEqual({});

    const oneRepository = new InMemoryNotificationCommandRepository();
    await expect(enabledEmitter(oneRepository).emit(action(['student-1']))).resolves.toMatchObject({
      status: 'emitted', created: 1, replayed: 0,
    });
    expect(Object.keys(oneRepository.snapshot())).toHaveLength(1);

    const manyRepository = new InMemoryNotificationCommandRepository();
    await expect(enabledEmitter(manyRepository).emit(action(['student-3', 'student-1', 'student-2']))).resolves.toMatchObject({
      status: 'emitted', created: 3, replayed: 0,
    });
    expect(Object.keys(manyRepository.snapshot())).toHaveLength(3);
  });

  it('uses deterministic per-recipient identity and replays duplicate delivery/lost acknowledgement', async () => {
    const repository = new InMemoryNotificationCommandRepository();
    const emitter = enabledEmitter(repository);
    const first = await emitter.emit(action(['student-1', 'student-2']));
    const second = await emitter.emit(action(['student-1', 'student-2']));
    expect(first).toMatchObject({ created: 2, replayed: 0 });
    expect(second).toMatchObject({ created: 0, replayed: 2 });
    expect(new Set(first.notificationIds).size).toBe(2);
    const studentOneId = await deterministicBookNotificationId({ actionId: 'publish-001', recipientId: 'student-1' });
    expect(first.notificationIds).toContain(studentOneId);
    expect(Object.keys(repository.snapshot())).toHaveLength(2);
  });

  it('recovers from crash before emission and partial fan-out without duplicating completed recipients', async () => {
    const repository = new InMemoryNotificationCommandRepository();
    const emitter = enabledEmitter(repository);
    // No call represents a crash after the Book commit and before emission.
    expect(Object.keys(repository.snapshot())).toHaveLength(0);
    await expect(emitter.emit(action(['student-1']))).resolves.toMatchObject({ created: 1 });

    let fail = true;
    const partialRepository = {
      create: vi.fn(async (input: Parameters<InMemoryNotificationCommandRepository['create']>[0]) => {
        if (fail && input.recipientId === 'student-2') {
          fail = false;
          throw new Error('simulated-notification-outage');
        }
        return partial.create(input);
      }),
    };
    const partial = new InMemoryNotificationCommandRepository();
    const partialEmitter = createBookNotificationEmitter({ repository: partialRepository, enabled: true, verifyCommittedAction: async () => true, resolveDestination: async ({ action }) => action.notification.link ?? null, now: () => 1 });
    await expect(partialEmitter.emit(action(['student-1', 'student-2', 'student-3']))).rejects.toThrow('simulated-notification-outage');
    await expect(partialEmitter.emit(action(['student-1', 'student-2', 'student-3']))).resolves.toMatchObject({
      created: 2, replayed: 1,
    });
    expect(Object.keys(partial.snapshot())).toHaveLength(3);
  });

  it('retries the original committed recipient boundary even when surrounding authority changes', async () => {
    const original = ['student-1', 'student-2'];
    const committedAction = action(original);
    const repository = new InMemoryNotificationCommandRepository();
    const verifyCommittedAction = vi.fn(async (candidate: BookCommittedNotificationAction) => {
      const committedBoundary = committedAction.affectedRecipientBoundary.recipientIds;
      return candidate.authority.recordId === committedAction.authority.recordId
        && candidate.affectedRecipientBoundary.source === 'committed-action'
        && candidate.affectedRecipientBoundary.recipientIds.length === committedBoundary.length
        && candidate.affectedRecipientBoundary.recipientIds.every((id, index) => id === committedBoundary[index]);
    });
    const emitter = createBookNotificationEmitter({
      repository,
      enabled: true,
      verifyCommittedAction,
      resolveDestination: async ({ action }) => action.notification.link ?? null,
    });
    await emitter.emit(committedAction);
    const surroundingAuthority = [...original, 'student-3', 'student-4'];
    // A retry reuses the committed action boundary; it never re-resolves this
    // later authority set, which is intentionally not part of the action.
    await emitter.emit(committedAction);
    expect(surroundingAuthority).toEqual(['student-1', 'student-2', 'student-3', 'student-4']);
    expect(Object.keys(repository.snapshot()).some((path) => path.includes('student-3'))).toBe(false);
    expect(Object.keys(repository.snapshot()).some((path) => path.includes('student-4'))).toBe(false);

    const changedBoundary = {
      ...committedAction,
      affectedRecipientBoundary: {
        source: 'committed-action' as const,
        recipientIds: [...original, 'student-3'],
      },
    };
    await expect(emitter.emit(changedBoundary)).rejects.toMatchObject({
      code: 'book_notification_action_stale',
    });
    expect(Object.keys(repository.snapshot()).some((path) => path.includes('student-3'))).toBe(false);
  });

  it('rejects stale/uncommitted actions, malformed or browser-supplied recipients, and unsafe destinations before writing', async () => {
    const repository = new InMemoryNotificationCommandRepository();
    const emitter = enabledEmitter(repository);
    const staleEmitter = createBookNotificationEmitter({
      repository,
      enabled: true,
      verifyCommittedAction: async () => false,
      resolveDestination: async ({ action }) => action.notification.link ?? null,
    });
    await expect(staleEmitter.emit(action())).rejects.toMatchObject({
      code: 'book_notification_action_stale',
    });
    await expect(emitter.emit({ ...action(), commitState: 'prepared' } as never)).rejects.toMatchObject({
      code: 'book_notification_action_not_committed',
    });
    await expect(emitter.emit({ ...action(), committedAt: 'not-a-time' } as never)).rejects.toBeInstanceOf(BookNotificationEmissionError);
    await expect(emitter.emit({ ...action(), affectedRecipientBoundary: { source: 'browser', recipientIds: ['student-1'] } } as never)).rejects.toMatchObject({
      code: 'book_notification_recipient_boundary_untrusted',
    });
    await expect(emitter.emit(action(['student/forged']))).rejects.toMatchObject({
      code: 'book_notification_recipient_invalid',
    });
    await expect(emitter.emit({ ...action(), notification: { ...action().notification, link: 'https://attacker.example' } })).rejects.toMatchObject({
      code: 'book_notification_destination_invalid',
    });
    expect(repository.snapshot()).toEqual({});
  });

  it('enforces metadata privacy bounds, safe resolver output, and conflicting identity reuse', async () => {
    const repository = new InMemoryNotificationCommandRepository();
    const emitter = enabledEmitter(repository);
    await expect(emitter.emit({
      ...action(),
      notification: {
        ...action().notification,
        metadata: { ...metadata, answerKey: 'secret' },
      },
    } as never)).rejects.toMatchObject({ code: 'book_notification_metadata_invalid' });
    const resolvedEmitter = createBookNotificationEmitter({
      repository,
      enabled: true,
      verifyCommittedAction: async () => true,
      resolveDestination: async () => null,
    });
    await expect(resolvedEmitter.emit({ ...action(), notification: { ...action().notification, link: undefined } }))
      .rejects.toMatchObject({ code: 'book_notification_destination_invalid' });

    await expect(emitter.emit({
      ...action(),
      notification: { ...action().notification, title: { answerKey: 'secret' } },
    } as never)).rejects.toMatchObject({ code: 'book_notification_content_invalid' });
    await expect(emitter.emit({
      ...action(),
      notification: { ...action().notification, privateDiff: 'must-not-persist' },
    } as never)).rejects.toMatchObject({ code: 'book_notification_type_invalid' });

    await emitter.emit(action());
    const id = await deterministicBookNotificationId({ actionId: 'publish-001', recipientId: 'student-1' });
    await expect(repository.create({
      operationId: id,
      recipientId: 'student-1',
      notification: { ...action().notification, message: 'changed' },
      now: 1,
    })).resolves.toMatchObject({ status: 'idempotency-conflict' });
  });

  it('disables emission without changing committed actions or existing notification rows', async () => {
    const repository = new InMemoryNotificationCommandRepository();
    await enabledEmitter(repository).emit(action());
    const before = repository.snapshot();
    const emitter = createBookNotificationEmitter({ repository, enabled: false, verifyCommittedAction: async () => true, resolveDestination: async ({ action }) => action.notification.link ?? null, now: () => 1 });
    await expect(emitter.emit(action())).resolves.toMatchObject({ status: 'disabled' });
    expect(repository.snapshot()).toEqual(before);
  });

  it('lets an explicit rollback flag override an enabled emitter', async () => {
    const repository = new InMemoryNotificationCommandRepository();
    const emitter = createBookNotificationEmitter({
      repository,
      enabled: true,
      verifyCommittedAction: async () => true,
      resolveDestination: async ({ action }) => action.notification.link ?? null,
    });
    await expect(emitter.emit(action(), {
      env: { BOOK_NOTIFICATIONS_EMISSION_ENABLED: 'false' },
    })).resolves.toMatchObject({ status: 'disabled' });
    expect(repository.snapshot()).toEqual({});
  });

  it('keeps Book-specific code on the existing command repository and out of forbidden producer shapes', () => {
    const directory = new URL('../src/upload-worker/notifications/', import.meta.url);
    const sourceFiles = readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => readFileSync(new URL(entry.name, directory), 'utf8'));
    const source = sourceFiles.join('\n');
    expect(source).toContain('NotificationCommandRepository');
    expect(source).toContain('notifications/${recipientId}/${operationId}');
    expect(source).not.toMatch(/book[-_ ]notification[-_ ](?:service|queue|outbox|consumer|fan[-_ ]out|ledger|worker)|notifications\/book(?:\/|$)|book_notifications/u);
  });
});
