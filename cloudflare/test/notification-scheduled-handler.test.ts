import { describe, expect, it, vi } from 'vitest';

const { retryClass, retryAnnouncement } = vi.hoisted(() => ({
  retryClass: vi.fn(async () => {}),
  retryAnnouncement: vi.fn(async () => {}),
}));
vi.mock('../src/upload-worker/notifications/class-retry.ts', () => ({ retryDueClassNotifications: retryClass }));
vi.mock('../src/upload-worker/notifications/course-announcement-action.ts', () => ({
  createCourseAnnouncementNotificationWorker: () => ({ fetch: vi.fn() }),
  retryDueCourseAnnouncementNotifications: retryAnnouncement,
}));

import worker from '../notification-command-worker.js';

describe('composed notification Worker scheduled handler', () => {
  it('dispatches the selected bounded family through waitUntil', async () => {
    let pending: Promise<unknown> | undefined;
    worker.scheduled({ cron: '*/2 * * * *', scheduledTime: 0 }, { NOTIFICATION_RETRY_BATCH: 'class-homework' }, { waitUntil: (promise: Promise<unknown>) => { pending = promise; } });
    await pending;
    expect(retryClass).toHaveBeenCalledOnce();
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
});
