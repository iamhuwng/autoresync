import { createHomeworkSubmissionNotificationWorker } from './src/upload-worker/notifications/homework-submission-worker.ts';
import { retryDueClassNotifications } from './src/upload-worker/notifications/class-retry.ts';
import { retryDueHomeworkNotifications } from './src/upload-worker/notifications/homework-retry.ts';
import {
  createResultReviewNotificationWorker,
  retryDueResultReviewNotifications,
} from './src/upload-worker/notifications/result-review-action.ts';
import { retryDueCourseTypeDecisionNotifications } from './src/upload-worker/notifications/course-type-decision-worker.ts';
import { createFeedbackNotificationWorker } from './src/upload-worker/notifications/feedback-notification-action.ts';
import { retryDueFeedbackNotifications } from './src/upload-worker/notifications/feedback-notification-retry.ts';
import { retryDueDeadlineNotifications } from './src/upload-worker/notifications/deadline-notification-worker.ts';
import { retryDueCourseRequestNotifications } from './src/upload-worker/notifications/enrollment-action.ts';
import { FirebaseCourseRequestNotificationStorage } from './src/upload-worker/notifications/enrollment-action-store.ts';
import { retryDueAssignmentNotifications } from './src/upload-worker/notifications/assignment-action.ts';
import { FirebaseAssignmentNotificationStorage } from './src/upload-worker/notifications/assignment-action-store.ts';
import { FirebaseRestNotificationCommandRepository } from './src/upload-worker/notifications/repository.ts';
import {
  createCourseAnnouncementNotificationWorker,
  retryDueCourseAnnouncementNotifications,
} from './src/upload-worker/notifications/course-announcement-action.ts';
import {
  createHomeworkResetNotificationWorker,
  retryDueHomeworkResetNotifications,
} from './src/upload-worker/notifications/homework-reset-notification-worker.ts';
import {
  createThcsNotificationWorker,
  retryDueThcsNotificationsForEnv,
} from './src/upload-worker/notifications/thcs-notification-worker.ts';
import { createSessionNotificationActionWorker } from './src/upload-worker/notifications/session-notification-action.ts';
import { retryDueSessionNotifications } from './src/upload-worker/notifications/session-notification-retry.ts';
import {
  createWritingNotificationWorker,
  retryDueWritingNotificationsForEnv,
} from './src/upload-worker/notifications/writing-grade-notification-worker.ts';
import {
  createTestCompleteNotificationWorker,
  retryDueTestCompleteNotificationsForEnv,
} from './src/upload-worker/notifications/test-complete-notification-worker.ts';
import {
  createGradeNotificationWorker,
  retryDueGradeNotificationsForEnv,
} from './src/upload-worker/notifications/grade-notification-worker.ts';

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
const retryRepository = (env) => new FirebaseRestNotificationCommandRepository({ env });
const bulkRetryFamilies = [
  retryDueCourseAnnouncementNotifications,
  retryDueThcsNotificationsForEnv,
  retryDueSessionNotifications,
];
const smallRetryFamilies = [
  retryDueClassNotifications,
  retryDueHomeworkNotifications,
  retryDueResultReviewNotifications,
  retryDueCourseTypeDecisionNotifications,
  retryDueClassNotifications,
  retryDueHomeworkNotifications,
  retryDueFeedbackNotifications,
  retryDueDeadlineNotifications,
  (env) => retryDueCourseRequestNotifications(
    new FirebaseCourseRequestNotificationStorage(env), retryRepository(env)),
  (env) => retryDueAssignmentNotifications(
    new FirebaseAssignmentNotificationStorage(env), retryRepository(env)),
  retryDueHomeworkResetNotifications,
  retryDueWritingNotificationsForEnv,
  retryDueTestCompleteNotificationsForEnv,
  retryDueGradeNotificationsForEnv,
];
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
    const bulk = event.cron === '* * * * *';
    // The first cutover runs only the two proven small retry families.
    // An unknown value fails closed instead of activating every producer.
    const batch = env.NOTIFICATION_RETRY_BATCH;
    if (batch !== 'class-homework' && batch !== 'all') return;
    if (batch === 'class-homework' && bulk) return;
    const activeSmallFamilies = batch === 'class-homework'
      ? [retryDueClassNotifications, retryDueHomeworkNotifications]
      : smallRetryFamilies;
    const families = bulk ? bulkRetryFamilies : activeSmallFamilies;
    const minute = Math.floor(event.scheduledTime / 60_000);
    const slot = Math.floor(minute / (bulk ? 1 : 2)) % families.length;
    context.waitUntil(families[slot](env));
  },
};
