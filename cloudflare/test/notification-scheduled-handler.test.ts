import { describe, expect, it, vi } from 'vitest';

const { homeworkFetch, classHomeworkFetch, feedbackFetch } = vi.hoisted(() => ({
  homeworkFetch: vi.fn(async () => new Response('homework')),
  classHomeworkFetch: vi.fn(async () => new Response('class')),
  feedbackFetch: vi.fn(async () => new Response('feedback')),
}));
vi.mock('../src/upload-worker/notifications/homework-submission-worker.ts', () => ({
  createHomeworkSubmissionNotificationWorker: () => ({ fetch: classHomeworkFetch }),
}));
vi.mock('../src/upload-worker/notifications/homework-reset-notification-worker.ts', () => ({
  createHomeworkResetNotificationWorker: () => ({ fetch: homeworkFetch }),
}));
vi.mock('../src/upload-worker/notifications/feedback-notification-action.ts', () => ({
  createFeedbackNotificationWorker: () => ({ fetch: feedbackFetch }),
}));
vi.mock('../src/upload-worker/notifications/course-announcement-action.ts', () => ({
  createCourseAnnouncementNotificationWorker: () => ({ fetch: vi.fn() }),
}));

import worker from '../notification-command-worker.js';

describe('composed notification Worker scheduled handler', () => {
  it('runs two serial RPCs, rotates the secondary family and collects failures', async () => {
    const calls: string[] = [];
    let active = false;
    const failure = new Error('class failed');
    const retry = vi.fn(async (family: string) => {
      expect(active).toBe(false);
      active = true;
      await Promise.resolve();
      calls.push(family);
      active = false;
      if (family === 'class-membership') throw failure;
    });
    const getByName = vi.fn(() => ({ retry }));
    for (const scheduledTime of [0, 120_000, 240_000]) {
      let pending: Promise<unknown> | undefined;
      worker.scheduled({ cron: '*/2 * * * *', scheduledTime }, {
        NOTIFICATION_RETRY_BATCH: 'class-homework', NOTIFICATION_RETRY_EXECUTOR: { getByName },
      }, { waitUntil: (promise: Promise<unknown>) => { pending = promise; } });
      await expect(pending).rejects.toMatchObject({ errors: [failure] });
    }
    expect(calls).toEqual(['class-membership', 'homework-submission',
      'class-membership', 'manual-reminder', 'class-membership', 'homework-reset']);
    expect(getByName.mock.calls).toEqual([['first-batch'], ['first-batch'], ['first-batch']]);
  });

  it('fails closed for unknown batches, other Crons and a missing executor', () => {
    const waitUntil = vi.fn();
    for (const batch of ['all', 'unknown', undefined]) {
      worker.scheduled({ cron: '*/2 * * * *', scheduledTime: 0 }, { NOTIFICATION_RETRY_BATCH: batch }, { waitUntil });
    }
    worker.scheduled({ cron: '* * * * *', scheduledTime: 0 }, { NOTIFICATION_RETRY_BATCH: 'class-homework' }, { waitUntil });
    expect(waitUntil).not.toHaveBeenCalled();
    expect(() => worker.scheduled({ cron: '*/2 * * * *', scheduledTime: 0 },
      { NOTIFICATION_RETRY_BATCH: 'class-homework' }, { waitUntil })).toThrow('notification_retry_executor_missing');
  });

  it('gates non-class/homework actions while forwarding first-batch actions and preflight', async () => {
    const env = { NOTIFICATION_RETRY_BATCH: 'class-homework' };
    const post = (path: string, origin?: string) => new Request(`https://worker.test${path}`, {
      method: 'POST',
      headers: origin ? { Origin: origin } : {},
    });
    const blocked = await worker.fetch(post('/feedback-notifications/actions', 'http://localhost:5173'), env);
    expect(blocked.status).toBe(503);
    expect(await blocked.json()).toEqual({ code: 'notification_action_batch_inactive' });
    expect(blocked.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    expect(blocked.headers.get('Cache-Control')).toBe('no-store');
    expect(blocked.headers.get('Vary')).toBe('Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
    expect(feedbackFetch).not.toHaveBeenCalled();

    const customDomain = await worker.fetch(post('/feedback-notifications/actions', 'https://hocthem.net'), env);
    expect(customDomain.status).toBe(503);
    expect(customDomain.headers.get('Access-Control-Allow-Origin')).toBe('https://hocthem.net');

    const disallowed = await worker.fetch(post('/feedback-notifications/actions', 'https://evil.example'), env);
    expect(disallowed.status).toBe(503);
    expect(disallowed.headers.has('Access-Control-Allow-Origin')).toBe(false);

    await worker.fetch(post('/class-notifications/actions'), env);
    await worker.fetch(post('/book-notifications/commands'), env);
    await worker.fetch(post('/deadline-notifications/actions'), env);
    await worker.fetch(post('/homework-reset-notifications/actions'), env);
    expect(classHomeworkFetch).toHaveBeenCalledTimes(3);
    expect(homeworkFetch).toHaveBeenCalledOnce();

    for (const path of [
      '/notifications/course-type-decisions/dispatch',
      '/enrollment-notifications/actions',
      '/assignment-notifications/actions',
      '/result-notifications/reviewed',
      '/course-announcements/actions',
      '/thcs-notifications/actions',
      '/session-notifications/action',
      '/writing-notifications/actions',
      '/test-complete-notifications/actions',
      '/grading-notifications/manual',
    ]) {
      expect((await worker.fetch(post(path), env)).status, path).toBe(503);
    }

    const preflight = await worker.fetch(new Request('https://worker.test/feedback-notifications/actions', { method: 'OPTIONS' }), env);
    expect(preflight.status).toBe(200);
    expect(feedbackFetch).toHaveBeenCalledOnce();
  });
});
