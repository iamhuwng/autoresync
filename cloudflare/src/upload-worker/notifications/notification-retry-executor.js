import { DurableObject } from 'cloudflare:workers';
import { retryDueClassNotifications } from './class-retry.ts';
import { retryDueHomeworkNotifications } from './homework-retry.ts';
import { createDeadlineNotificationHandlers } from './deadline-action.ts';
import { FirebaseDeadlineNotificationStorage } from './deadline-action-store.ts';
import { createHomeworkResetNotificationHandlers } from './homework-reset-action.ts';
import { FirebaseHomeworkResetNotificationStorage } from './homework-reset-action-store.ts';
import { FirebaseRestNotificationCommandRepository } from './repository.ts';

export class NotificationRetryExecutor extends DurableObject {
  async retry(family) {
    if (!['class-membership', 'homework-submission', 'manual-reminder', 'homework-reset'].includes(family)) {
      throw new Error('notification_retry_family_invalid');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('notification_retry_deadline')), 20_000);
    const fetchImpl = (input, init) => globalThis.fetch(input, {
      ...init, redirect: 'error', signal: controller.signal,
    });
    try {
      const repository = new FirebaseRestNotificationCommandRepository({ env: this.env, fetchImpl, maxRetries: 4 });
      if (family === 'class-membership') {
        await retryDueClassNotifications(this.env, Date.now(), { fetchImpl, repository });
      } else if (family === 'homework-submission') {
        await retryDueHomeworkNotifications(this.env, Date.now(), { fetchImpl, repository });
      } else if (family === 'manual-reminder') {
        await createDeadlineNotificationHandlers({
          storage: new FirebaseDeadlineNotificationStorage(this.env, fetchImpl), repository,
        }).retryDue();
      } else {
        await createHomeworkResetNotificationHandlers({
          storage: new FirebaseHomeworkResetNotificationStorage(this.env, fetchImpl), repository,
        }).retryDue();
      }
      controller.signal.throwIfAborted();
    } finally {
      clearTimeout(timer);
    }
  }
}
