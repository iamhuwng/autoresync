import { describe, expect, it, vi } from 'vitest';
import { runBookMutationWithPostCommitNotification } from '../src/upload-worker/notifications/post-commit.ts';
import type { BookCommittedNotificationAction } from '../src/upload-worker/notifications/book-emitter.ts';

const committedAction: BookCommittedNotificationAction = {
  schemaVersion: 1,
  actionId: 'publish-001',
  committedAt: '2026-08-03T00:00:00.000Z',
  commitState: 'committed',
  authority: { kind: 'book', recordId: 'book-1' },
  affectedRecipientBoundary: { source: 'committed-action', recipientIds: ['student-1'] },
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
};

describe('existing Book Worker post-commit handoff', () => {
  it('runs the emitter only after a successful trusted commit and preserves the request body', async () => {
    const calls: string[] = [];
    const emitter = {
      emit: vi.fn(async () => {
        calls.push('emit');
        return { status: 'emitted', created: 1, replayed: 0, notificationIds: ['n'] };
      }),
    };
    const resolveAction = vi.fn(async ({ request }: { request: Request }) => {
      expect(await request.text()).toBe('{}');
      calls.push('resolve');
      return committedAction;
    });
    const result = await runBookMutationWithPostCommitNotification({
      route: '/book-activity-authoring/publish',
      actorUid: 'teacher-1',
      request: new Request('http://localhost:5174/book-activity-authoring/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }),
      env: { BOOK_NOTIFICATIONS_EMISSION_ENABLED: 'true' },
      commit: async () => {
        calls.push('commit');
        return { body: { status: 'published' }, init: { status: 200 } };
      },
      emitter,
      resolveAction,
    });
    expect(result.init?.status).toBe(200);
    expect(calls).toEqual(['commit', 'resolve', 'emit']);
    expect(emitter.emit).toHaveBeenCalledWith(committedAction, expect.objectContaining({ env: expect.any(Object) }));
  });

  it('does not resolve or emit during emission-disabled rollback after commit', async () => {
    const commit = vi.fn(async () => ({ body: { status: 'published' }, init: { status: 200 } }));
    const resolveAction = vi.fn(async () => committedAction);
    const emitter = { emit: vi.fn(async () => ({ status: 'emitted' })) };
    const result = await runBookMutationWithPostCommitNotification({
      route: '/book-assembly/publish',
      actorUid: 'teacher-1',
      request: new Request('http://localhost:5174/book-assembly/publish', { method: 'POST', body: '{}' }),
      env: { BOOK_NOTIFICATIONS_EMISSION_ENABLED: 'false' },
      commit,
      emitter,
      resolveAction,
    });
    expect(result.init?.status).toBe(200);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(resolveAction).not.toHaveBeenCalled();
    expect(emitter.emit).not.toHaveBeenCalled();
  });

  it('keeps emission default-deny when the rollout flag is absent', async () => {
    const commit = vi.fn(async () => ({ body: { status: 'published' }, init: { status: 200 } }));
    const resolveAction = vi.fn(async () => committedAction);
    const emitter = { emit: vi.fn(async () => ({ status: 'emitted' })) };
    const result = await runBookMutationWithPostCommitNotification({
      route: '/book-assembly/publish',
      actorUid: 'teacher-1',
      request: new Request('http://localhost:5174/book-assembly/publish', { method: 'POST', body: '{}' }),
      env: {},
      commit,
      emitter,
      resolveAction,
    });
    expect(result.init?.status).toBe(200);
    expect(resolveAction).not.toHaveBeenCalled();
    expect(emitter.emit).not.toHaveBeenCalled();
  });

  it('does not clone an already-consumed request while emission is disabled', async () => {
    const request = new Request('http://localhost:5174/book-assembly/publish', {
      method: 'POST',
      body: '{}',
    });
    await request.text();
    const commit = vi.fn(async () => ({ body: { status: 'published' }, init: { status: 200 } }));
    const resolveAction = vi.fn(async () => committedAction);
    const emitter = { emit: vi.fn(async () => ({ status: 'emitted' })) };
    await expect(runBookMutationWithPostCommitNotification({
      route: '/book-assembly/publish',
      actorUid: 'teacher-1',
      request,
      env: {},
      commit,
      emitter,
      resolveAction,
    })).resolves.toMatchObject({ init: { status: 200 } });
    expect(commit).toHaveBeenCalledTimes(1);
    expect(resolveAction).not.toHaveBeenCalled();
    expect(emitter.emit).not.toHaveBeenCalled();
  });

  it('rejects an enabled rollout with only half of the post-commit seam wired', async () => {
    const commit = vi.fn(async () => ({ body: { status: 'published' }, init: { status: 200 } }));
    await expect(runBookMutationWithPostCommitNotification({
      route: '/book-assembly/publish',
      actorUid: 'teacher-1',
      request: new Request('http://localhost:5174/book-assembly/publish', { method: 'POST', body: '{}' }),
      env: { BOOK_NOTIFICATIONS_EMISSION_ENABLED: true },
      commit,
      emitter: { emit: vi.fn(async () => ({ status: 'emitted' })) },
    })).rejects.toThrow('book_notification_emission_misconfigured');
    expect(commit).not.toHaveBeenCalled();
  });
});
