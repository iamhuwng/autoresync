import { describe, expect, it, vi } from 'vitest';

const { retryClass, retryHomework, retryDeadline, retryReset, retryAnnouncement, homeworkFetch, classHomeworkFetch, feedbackFetch } = vi.hoisted(() => ({
  retryClass: vi.fn(async () => {}),
  retryHomework: vi.fn(async () => {}),
  retryDeadline: vi.fn(async () => {}),
  retryReset: vi.fn(async () => {}),
  retryAnnouncement: vi.fn(async () => {}),
  homeworkFetch: vi.fn(async () => new Response('homework')),
  classHomeworkFetch: vi.fn(async () => new Response('class')),
  feedbackFetch: vi.fn(async () => new Response('feedback')),
}));
vi.mock('../src/upload-worker/notifications/homework-submission-worker.ts', () => ({
  createHomeworkSubmissionNotificationWorker: () => ({ fetch: classHomeworkFetch }),
}));
vi.mock('../src/upload-worker/notifications/class-retry.ts', () => ({ retryDueClassNotifications: retryClass }));
vi.mock('../src/upload-worker/notifications/homework-retry.ts', () => ({ retryDueHomeworkNotifications: retryHomework }));
vi.mock('../src/upload-worker/notifications/deadline-notification-worker.ts', () => ({ retryDueDeadlineNotifications: retryDeadline }));
vi.mock('../src/upload-worker/notifications/homework-reset-notification-worker.ts', () => ({
  createHomeworkResetNotificationWorker: () => ({ fetch: homeworkFetch }),
  retryDueHomeworkResetNotifications: retryReset,
}));
vi.mock('../src/upload-worker/notifications/feedback-notification-action.ts', () => ({
  createFeedbackNotificationWorker: () => ({ fetch: feedbackFetch }),
}));
vi.mock('../src/upload-worker/notifications/course-announcement-action.ts', () => ({
  createCourseAnnouncementNotificationWorker: () => ({ fetch: vi.fn() }),
  retryDueCourseAnnouncementNotifications: retryAnnouncement,
}));

import worker from '../notification-command-worker.js';

describe('composed notification Worker scheduled handler', () => {
  it('visits every first-batch retry family through one waitUntil per two-minute slot', async () => {
    const waitUntil = vi.fn();
    const pending: Promise<unknown>[] = [];
    for (const scheduledTime of [0, 120_000, 240_000, 360_000]) {
      worker.scheduled({ cron: '*/2 * * * *', scheduledTime }, { NOTIFICATION_RETRY_BATCH: 'class-homework' }, {
        waitUntil: (promise: Promise<unknown>) => { waitUntil(promise); pending.push(promise); },
      });
    }
    await Promise.all(pending);
    expect(waitUntil).toHaveBeenCalledTimes(4);
    expect(retryClass).toHaveBeenCalledOnce();
    expect(retryHomework).toHaveBeenCalledOnce();
    expect(retryDeadline).toHaveBeenCalledOnce();
    expect(retryReset).toHaveBeenCalledOnce();
  });

  it('gives the bulk queue its own minute trigger', async () => {
    let pending: Promise<unknown> | undefined;
    worker.scheduled({ cron: '* * * * *', scheduledTime: 0 }, { NOTIFICATION_RETRY_BATCH: 'all' }, { waitUntil: (promise: Promise<unknown>) => { pending = promise; } });
    await pending;
    expect(retryAnnouncement).toHaveBeenCalledOnce();
  });

  it('keeps bulk and unknown batches inactive during the first cutover', () => {
    const waitUntil = vi.fn();
    worker.scheduled({ cron: '* * * * *', scheduledTime: 0 }, { NOTIFICATION_RETRY_BATCH: 'class-homework' }, { waitUntil });
    worker.scheduled({ cron: '*/2 * * * *', scheduledTime: 0 }, {}, { waitUntil });
    expect(waitUntil).not.toHaveBeenCalled();
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
