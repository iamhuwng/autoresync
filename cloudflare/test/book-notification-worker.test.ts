import { afterEach, describe, expect, it, vi } from 'vitest';
import { runBookMutationWithPostCommitNotification } from '../src/upload-worker/notifications/post-commit.ts';

const identity = { actionId: 'publish-001',
  authority: { kind: 'book-homework-assignment' as const, recordId: 'assignment-1' } };
afterEach(() => vi.restoreAllMocks());

describe('existing Book Worker post-commit handoff', () => {
  it('keeps disabled, pending and rejected product responses unchanged without notice attempts', async () => {
    const resolveActionIdentity = vi.fn(async () => identity);
    const emitter = { emit: vi.fn(async () => ({ status: 'emitted' })) };
    const waitUntil = vi.fn();
    for (const [enabled, state, status] of [
      [false, 'committed', 200], [undefined, 'committed', 200],
      [true, 'committed_projection_pending', 202], [true, 'rejected', 409],
    ] as const) {
      const result = { body: { state }, init: { status } };
      const commit = vi.fn(async () => result);
      expect(await runBookMutationWithPostCommitNotification({
        env: { BOOK_NOTIFICATIONS_EMISSION_ENABLED: enabled }, commit, resolveActionIdentity, emitter, waitUntil,
      })).toBe(result);
      expect(commit).toHaveBeenCalledTimes(1);
    }
    expect(resolveActionIdentity).not.toHaveBeenCalled();
    expect(emitter.emit).not.toHaveBeenCalled();
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it('reports disabled or unknown emitter outcomes separately from the committed response', async () => {
    const diagnostic = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const [delivery, deliveryState] of [
      [{ status: 'disabled' }, 'skipped_disabled'], [{ status: 'empty' }, 'skipped_empty'],
      [undefined, 'unknown'], [{ status: 'private-provider-message' }, 'unknown'],
    ] as const) {
      const tasks: Promise<void>[] = [];
      const result = { body: { state: 'committed' }, init: { status: 200 } };
      expect(await runBookMutationWithPostCommitNotification({
        env: { BOOK_NOTIFICATIONS_EMISSION_ENABLED: true }, commit: async () => result,
        resolveActionIdentity: async () => identity, emitter: { emit: async () => delivery },
        waitUntil: (task) => { tasks.push(task); },
      })).toBe(result);
      await tasks[0];
      expect(diagnostic).toHaveBeenLastCalledWith('book_notification_post_commit', { deliveryState });
    }
    expect(JSON.stringify(diagnostic.mock.calls)).not.toContain('private-provider-message');
  });
});
