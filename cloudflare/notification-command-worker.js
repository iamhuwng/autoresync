import { createHomeworkSubmissionNotificationWorker } from './src/upload-worker/notifications/homework-submission-worker.ts';
import { createResultReviewNotificationWorker } from './src/upload-worker/notifications/result-review-action.ts';
import { createFeedbackNotificationWorker } from './src/upload-worker/notifications/feedback-notification-action.ts';
import { createCourseAnnouncementNotificationWorker } from './src/upload-worker/notifications/course-announcement-action.ts';
import { createHomeworkResetNotificationWorker } from './src/upload-worker/notifications/homework-reset-notification-worker.ts';
import { createThcsNotificationWorker } from './src/upload-worker/notifications/thcs-notification-worker.ts';
import { createSessionNotificationActionWorker } from './src/upload-worker/notifications/session-notification-action.ts';
import { createWritingNotificationWorker } from './src/upload-worker/notifications/writing-grade-notification-worker.ts';
import { createTestCompleteNotificationWorker } from './src/upload-worker/notifications/test-complete-notification-worker.ts';
import { createGradeNotificationWorker } from './src/upload-worker/notifications/grade-notification-worker.ts';
export { NotificationRetryExecutor } from './src/upload-worker/notifications/notification-retry-executor.js';

const worker = createHomeworkSubmissionNotificationWorker();
const resultReviewWorker = createResultReviewNotificationWorker();
const feedbackWorker = createFeedbackNotificationWorker();
const courseAnnouncementWorker = createCourseAnnouncementNotificationWorker();
const homeworkResetWorker = createHomeworkResetNotificationWorker();
const thcsWorker = createThcsNotificationWorker();
const sessionWorker = createSessionNotificationActionWorker();
const writingWorker = createWritingNotificationWorker();
const testCompleteWorker = createTestCompleteNotificationWorker();
const gradeWorker = createGradeNotificationWorker();
const notificationActionPaths = new Set([
  '/book-notifications/commands',
  '/class-notifications/actions',
  '/notifications/course-type-decisions/dispatch',
  '/deadline-notifications/actions',
  '/enrollment-notifications/actions',
  '/assignment-notifications/actions',
  '/result-notifications/reviewed',
  '/feedback-notifications/actions',
  '/course-announcements/actions',
  '/homework-reset-notifications/actions',
  '/thcs-notifications/actions',
  '/session-notifications/action',
  '/writing-notifications/actions',
  '/test-complete-notifications/actions',
  '/grading-notifications/manual',
]);
const firstBatchActionPaths = new Set([
  '/book-notifications/commands',
  '/class-notifications/actions',
  '/deadline-notifications/actions',
  '/homework-reset-notifications/actions',
]);
const allowedOrigins = new Set([
  'https://kahut1.web.app',
  'https://hocthem.net',
  'http://localhost:5173',
  'http://localhost:5174',
]);

const gatedActionResponse = (request) => {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    Vary: 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers',
  });
  const origin = request.headers.get('Origin');
  if (origin && allowedOrigins.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Idempotency-Key');
  }
  return new Response(JSON.stringify({ code: 'notification_action_batch_inactive' }), { status: 503, headers });
};

export default {
  fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (request.method !== 'OPTIONS' && notificationActionPaths.has(path)) {
      const batch = env.NOTIFICATION_RETRY_BATCH;
      if (batch !== 'all' && !(batch === 'class-homework' && firstBatchActionPaths.has(path))) {
        return gatedActionResponse(request);
      }
    }
    if (path === '/result-notifications/reviewed') {
      return resultReviewWorker.fetch(request, env);
    }
    if (path === '/feedback-notifications/actions') {
      return feedbackWorker.fetch(request, env);
    }
    if (path === '/course-announcements/actions') {
      return courseAnnouncementWorker.fetch(request, env);
    }
    if (path === '/homework-reset-notifications/actions') {
      return homeworkResetWorker.fetch(request, env);
    }
    if (path === '/thcs-notifications/actions') {
      return thcsWorker.fetch(request, env);
    }
    if (path === '/session-notifications/action') {
      return sessionWorker.fetch(request, env);
    }
    if (path === '/writing-notifications/actions') {
      return writingWorker.fetch(request, env);
    }
    if (path === '/test-complete-notifications/actions') {
      return testCompleteWorker.fetch(request, env);
    }
    if (path === '/grading-notifications/manual') {
      return gradeWorker.fetch(request, env);
    }
    return worker.fetch(request, env);
  },
  scheduled(event, env, context) {
    if (event.cron !== '*/2 * * * *' || env.NOTIFICATION_RETRY_BATCH !== 'class-homework') return;
    if (!env.NOTIFICATION_RETRY_EXECUTOR) throw new Error('notification_retry_executor_missing');
    const executor = env.NOTIFICATION_RETRY_EXECUTOR.getByName('first-batch');
    const rotating = ['homework-submission', 'manual-reminder', 'homework-reset'];
    const slot = Math.floor(event.scheduledTime / 120_000) % rotating.length;
    context.waitUntil((async () => {
      const failures = [];
      for (const family of ['class-membership', rotating[slot]]) {
        try { await executor.retry(family); } catch (error) { failures.push(error); }
      }
      if (failures.length) throw new AggregateError(failures, 'notification_retry_failed');
    })());
  },
};
