import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  runBookMutationWithPostCommitNotification,
} from '../src/upload-worker/notifications/post-commit.ts';
import type {
  BookNotificationActionIdentity,
} from '../src/upload-worker/notifications/book-emitter.ts';
import { BookNotificationEmissionError } from '../src/upload-worker/notifications/book-emitter.ts';
import { reportBookNotificationFailure } from '../src/upload-worker/notifications/book-reporting.ts';
import type { NotificationFailureReport } from '../../src/services/reportingService.ts';
import { FEATURE_IDS } from '../../src/config/featureRegistry.ts';

const identity: BookNotificationActionIdentity = {
  actionId: '00000000-0000-5000-8000-000000000100',
  authority: {
    kind: 'book-homework-assignment',
    recordId: 'homework-1',
  },
};
afterEach(() => vi.restoreAllMocks());

describe('Book mutation post-commit notification seam', () => {
  it('reports partial delivery once through the existing admin schema without changing product success', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = { body: { state: 'committed', operationId: identity.actionId, recipientCount: 3 }, init: { status: 200 } };
    const tasks: Promise<void>[] = [];
    const fetchImpl = vi.fn().mockResolvedValueOnce(Response.json({ mode: 'errors-only', categories: { errors: true } }))
      .mockResolvedValueOnce(new Response('', { status: 200 }));
    expect(await runBookMutationWithPostCommitNotification({
      env: { BOOK_NOTIFICATIONS_EMISSION_ENABLED: true }, commit: async () => result,
      resolveActionIdentity: () => identity,
      emitter: { emit: async () => { throw new BookNotificationEmissionError('book_notification_write_unknown', {
        status: 'unknown', delivered: 1, failed: 0, unknown: 1, unattempted: 1 }); } },
      waitUntil: (task) => { tasks.push(task); },
      reportFailure: (report) => reportBookNotificationFailure({ env: { FIREBASE_DB_URL: 'https://example.firebaseio.com' },
        actorId: 'teacher-1', token: 'actor-token', report, fetchImpl }),
    })).toBe(result);
    await tasks[0];
    expect(fetchImpl.mock.calls.map((call) => call[1]?.method)).toEqual(['GET', 'PUT']);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://example.firebaseio.com/reports/config.json?auth=actor-token');
    const [url, init] = fetchImpl.mock.calls[1];
    expect(String(url)).toMatch(/\/reports\/errors\/\d{4}-\d{2}-\d{2}\/[a-f0-9-]{36}\.json\?auth=actor-token$/u);
    expect(init.headers).toMatchObject({ 'if-match': 'null_etag' });
    expect(JSON.parse(init.body)).toMatchObject({ feature: FEATURE_IDS.homework, severity: 'warning', userId: 'teacher-1',
      contextData: { action: 'assignHomework', eventId: identity.actionId, recipientCount: 3, delivered: 1, failed: 0, unknown: 1, unattempted: 1 } });
  });

  it.each([{ mode: 'off' }, { categories: { errors: false } }])('honors existing reporting opt-out %j', async (config) => {
    const fetchImpl = vi.fn().mockResolvedValue(Response.json(config));
    await reportBookNotificationFailure({ env: { FIREBASE_DB_URL: 'https://example.firebaseio.com' },
      actorId: 'teacher-1', token: 'actor-token', report: {} as NotificationFailureReport, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('classifies report insertion collision as a failed attempt without another write', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(Response.json(null))
      .mockResolvedValueOnce(new Response('', { status: 412 }));
    const report: NotificationFailureReport = { eventId: identity.actionId, feature: FEATURE_IDS.homework, action: 'assignHomework',
      route: 'rtdb', status: 'unknown', code: 'book_notification_write_unknown', occurredAt: 1, attemptedAt: 1,
      recipientCount: 1, delivered: 0, failed: 0, unknown: 1, unattempted: 0 };
    await expect(reportBookNotificationFailure({ env: { FIREBASE_DB_URL: 'https://example.firebaseio.com' },
      actorId: 'teacher-1', token: 'actor-token', report, fetchImpl })).rejects.toThrow('book_notification_report_conflict');
    expect(fetchImpl.mock.calls.map((call) => call[1]?.method)).toEqual(['GET', 'PUT']);
  });

  it('catches a failed report without retrying or changing the exact product result', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const tasks: Promise<void>[] = [];
    const reportFailure = vi.fn().mockRejectedValue(new Error('private-report-error'));
    const result = { body: { state: 'committed', operationId: identity.actionId, recipientCount: 2 } };
    expect(await runBookMutationWithPostCommitNotification({ env: { BOOK_NOTIFICATIONS_EMISSION_ENABLED: true },
      commit: async () => result, reportFailure, waitUntil: (task) => { tasks.push(task); } })).toBe(result);
    await expect(tasks[0]).resolves.toBeUndefined();
    expect(reportFailure).toHaveBeenCalledTimes(1);
    expect(reportFailure).toHaveBeenCalledWith(expect.objectContaining({ status: 'unknown', delivered: 0,
      unknown: 0, failed: 0, unattempted: 2, code: 'book_notification_misconfigured' }));
  });
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

  it('keeps an enabled half-wired notice independent from the committed Book mutation', async () => {
    const diagnostic = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const commit = vi.fn(async () => ({
      body: { state: 'committed' },
      init: { status: 200 },
    }));
    await expect(runBookMutationWithPostCommitNotification({
      env: { BOOK_NOTIFICATIONS_EMISSION_ENABLED: true },
      commit,
      emitter: { emit: vi.fn(async () => undefined) },
    })).resolves.toEqual(await commit.mock.results[0].value);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(diagnostic).toHaveBeenCalledWith('book_notification_post_commit', { deliveryState: 'skipped_misconfigured' });
  });

  it('leaves a committed action intact when emission fails and explicit replay uses the same emitter identity', async () => {
    const diagnostic = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const tasks: Promise<void>[] = [];
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
      waitUntil: (task: Promise<void>) => { tasks.push(task); },
    };
    await expect(runBookMutationWithPostCommitNotification(options))
      .resolves.toMatchObject({ body: { state: 'committed', operationId: identity.actionId } });
    await tasks[0];
    expect(diagnostic).toHaveBeenCalledWith('book_notification_post_commit', { deliveryState: 'failed' });
    await expect(runBookMutationWithPostCommitNotification(options))
      .resolves.toMatchObject({
        body: { state: 'committed', operationId: identity.actionId },
      });
    await tasks[1];
    expect(commit).toHaveBeenCalledTimes(2);
    expect(emitter.emit).toHaveBeenCalledTimes(2);
  });

  it.each([false, true])('returns the exact committed result before delivery settles (execution context=%s)', async (retainLifetime) => {
    const diagnostic = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let rejectDelivery!: (error: Error) => void;
    const pending = new Promise<void>((_resolve, reject) => { rejectDelivery = reject; });
    const result = { body: { state: 'committed' }, init: { status: 200 } };
    const tasks: Promise<void>[] = [];
    const emitter = { emit: vi.fn(() => pending) };
    expect(await runBookMutationWithPostCommitNotification({
      env: { BOOK_NOTIFICATIONS_EMISSION_ENABLED: true }, commit: async () => result,
      resolveActionIdentity: async () => identity, emitter,
      ...(retainLifetime ? { waitUntil: (task: Promise<void>) => { tasks.push(task); } } : {}),
    })).toBe(result);
    expect(emitter.emit).toHaveBeenCalledTimes(1);
    expect(tasks).toHaveLength(retainLifetime ? 1 : 0);
    rejectDelivery(new Error('private-provider-secret'));
    if (retainLifetime) await expect(tasks[0]).resolves.toBeUndefined();
    else await new Promise((resolve) => setTimeout(resolve, 0));
    expect(diagnostic).toHaveBeenCalledWith('book_notification_post_commit', { deliveryState: 'failed' });
    expect(JSON.stringify(diagnostic.mock.calls)).not.toContain('private-provider-secret');
  });

  it('does not misreport product success when lifetime or diagnostic reporting fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => { throw new Error('report-unavailable'); });
    const result = { body: { state: 'committed' }, init: { status: 200 } };
    expect(await runBookMutationWithPostCommitNotification({
      env: { BOOK_NOTIFICATIONS_EMISSION_ENABLED: true }, commit: async () => result,
      resolveActionIdentity: async () => identity, emitter: { emit: async () => { throw new Error('failed'); } },
      waitUntil: () => { throw new Error('context-unavailable'); },
    })).toBe(result);
  });
});
