import { describe, expect, it, vi } from 'vitest';
import {
  runBookMutationWithPostCommitNotification,
} from '../src/upload-worker/notifications/post-commit.ts';
import type {
  BookNotificationActionIdentity,
} from '../src/upload-worker/notifications/book-emitter.ts';

const identity: BookNotificationActionIdentity = {
  actionId: '00000000-0000-5000-8000-000000000100',
  authority: {
    kind: 'book-homework-assignment',
    recordId: 'homework-1',
  },
};

describe('Book mutation post-commit notification seam', () => {
  it('resolves durable identity and emits only after a successful commit', async () => {
    const calls: string[] = [];
    const commit = vi.fn(async () => {
      calls.push('commit');
      return {
        body: { state: 'committed', operationId: identity.actionId },
        init: { status: 200 },
      };
    });
    const resolveActionIdentity = vi.fn(async () => {
      calls.push('resolve');
      return identity;
    });
    const emitter = {
      emit: vi.fn(async () => {
        calls.push('emit');
        return { status: 'emitted' };
      }),
    };
    const result = await runBookMutationWithPostCommitNotification({
      env: { BOOK_NOTIFICATIONS_EMISSION_ENABLED: 'true' },
      commit,
      resolveActionIdentity,
      emitter,
    });
    expect(result.init?.status).toBe(200);
    expect(calls).toEqual(['commit', 'resolve', 'emit']);
    expect(emitter.emit).toHaveBeenCalledWith(
      identity,
      expect.objectContaining({ env: expect.any(Object) }),
    );
  });

  it('does not resolve or emit for non-success or non-terminal actions', async () => {
    const emitter = { emit: vi.fn(async () => undefined) };
    const resolveActionIdentity = vi.fn(async () => null);
    await runBookMutationWithPostCommitNotification({
      env: { BOOK_NOTIFICATIONS_EMISSION_ENABLED: true },
      commit: async () => ({ body: { state: 'failed' }, init: { status: 409 } }),
      resolveActionIdentity,
      emitter,
    });
    expect(resolveActionIdentity).not.toHaveBeenCalled();

    for (const status of [200, 202]) {
      await runBookMutationWithPostCommitNotification({
        env: { BOOK_NOTIFICATIONS_EMISSION_ENABLED: true },
        commit: async () => ({ body: { state: 'prepared' }, init: { status } }),
        resolveActionIdentity,
        emitter,
      });
    }
    expect(resolveActionIdentity).not.toHaveBeenCalled();
    expect(emitter.emit).not.toHaveBeenCalled();
  });

  it('keeps disabled rollback default-deny without resolving or emitting', async () => {
    for (const env of [
      {},
      { BOOK_NOTIFICATIONS_EMISSION_ENABLED: false },
      { BOOK_NOTIFICATIONS_EMISSION_ENABLED: 'false' },
    ]) {
      const commit = vi.fn(async () => ({
        body: { state: 'committed' },
        init: { status: 200 },
      }));
      const resolveActionIdentity = vi.fn(async () => identity);
      const emitter = { emit: vi.fn(async () => undefined) };
      await runBookMutationWithPostCommitNotification({
        env,
        commit,
        resolveActionIdentity,
        emitter,
      });
      expect(commit).toHaveBeenCalledTimes(1);
      expect(resolveActionIdentity).not.toHaveBeenCalled();
      expect(emitter.emit).not.toHaveBeenCalled();
    }
  });

  it('rejects enabled half-wiring before committing the Book mutation', async () => {
    const commit = vi.fn(async () => ({
      body: { state: 'committed' },
      init: { status: 200 },
    }));
    await expect(runBookMutationWithPostCommitNotification({
      env: { BOOK_NOTIFICATIONS_EMISSION_ENABLED: true },
      commit,
      emitter: { emit: vi.fn(async () => undefined) },
    })).rejects.toThrow('book_notification_emission_misconfigured');
    expect(commit).not.toHaveBeenCalled();
  });

  it('leaves a committed action intact when emission fails so replay can retry', async () => {
    const commit = vi.fn(async () => ({
      body: { state: 'committed', operationId: identity.actionId },
      init: { status: 200 },
    }));
    const emitter = {
      emit: vi.fn()
        .mockRejectedValueOnce(new Error('notification_write_failed'))
        .mockResolvedValueOnce({ status: 'emitted' }),
    };
    const options = {
      env: { BOOK_NOTIFICATIONS_EMISSION_ENABLED: true },
      commit,
      resolveActionIdentity: async () => identity,
      emitter,
    };
    await expect(runBookMutationWithPostCommitNotification(options))
      .rejects.toThrow('notification_write_failed');
    await expect(runBookMutationWithPostCommitNotification(options))
      .resolves.toMatchObject({
        body: { state: 'committed', operationId: identity.actionId },
      });
    expect(commit).toHaveBeenCalledTimes(2);
    expect(emitter.emit).toHaveBeenCalledTimes(2);
  });
});
