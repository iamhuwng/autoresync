import { buildRoute } from '../../../../src/constants/routes.ts';
import { FirebaseRtdbRestClient } from '../listening-authoring/rtdb.ts';
import {
  FirebaseRestNotificationCommandRepository,
  type NotificationCommandRepository,
  type NotificationCommandRepositoryEnv,
} from './repository.ts';
import {
  FirebaseFeedbackActionStorage,
  type FeedbackActionStorage,
} from './feedback-notification-action-store.ts';
import { FEEDBACK_INTENT_DONE_DUE_AT, type FeedbackNotificationIntent } from './feedback-notification-action.ts';

type Env = Readonly<Record<string, unknown>>;
const ID = /^[A-Za-z0-9_-]{1,128}$/u;
const required = (env: Env, name: string): string => {
  const value = env[name];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`missing_${name.toLowerCase()}`);
  return value.trim();
};
const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

const trustedFeedbackSource = async (
  intent: FeedbackNotificationIntent,
  read: (path: string) => Promise<unknown>,
): Promise<{ result: Record<string, unknown>; actor: Record<string, unknown> } | null> => {
  if (!ID.test(intent.resultId) || !ID.test(intent.studentId) || !ID.test(intent.actorUid)
    || !['feedback-question', 'feedback-overall'].includes(intent.kind)) return null;
  const result = record(await read(`test_results/${intent.resultId}`));
  const actor = record(await read(`users/${intent.actorUid}`));
  const history = result ? record(record(result.feedbackHistory)?.[intent.eventId]) : null;
  const questionFeedback = intent.questionId && result ? record(record(result.questionFeedback)?.[intent.questionId]) : null;
  const expectedType = intent.kind === 'feedback-question' ? 'question' : 'overall';
  if (!result || !actor || result.resultId !== intent.resultId || result.studentId !== intent.studentId
    || !['teacher', 'super_admin'].includes(String(actor.role))
    || !history || history.eventId !== intent.eventId || history.teacherId !== intent.actorUid
    || history.timestamp !== intent.occurredAt || history.type !== expectedType
    || (intent.questionId && (history.questionId !== intent.questionId || !questionFeedback
      || questionFeedback.eventId !== intent.eventId || questionFeedback.updatedById !== intent.actorUid
      || questionFeedback.updatedAt !== intent.occurredAt))) return null;
  if (actor.role !== 'super_admin') {
    const visibility = record(result.visibility);
    const courseId = typeof result.courseId === 'string' ? result.courseId : '';
    const course = courseId ? record(await read(`courses/${courseId}`)) : null;
    if (!(visibility?.ownershipResolved === true && visibility.visibilityOwnerTeacherId === intent.actorUid)
      && result.teacherId !== intent.actorUid && course?.createdBy !== intent.actorUid) return null;
  }
  return { result, actor };
};

const reportFailure = async (env: Env, intent: FeedbackNotificationIntent, now: number): Promise<void> => {
  const admin = new FirebaseRtdbRestClient({ env: {
    FIREBASE_DB_URL: required(env, 'FIREBASE_DB_URL'), FIREBASE_PROJECT_ID: required(env, 'FIREBASE_PROJECT_ID'),
    GOOGLE_SA_KEY: required(env, 'NOTIFICATION_COMMAND_GOOGLE_SA_KEY'),
  } });
  const issueId = `feedback-notification-${intent.eventId}`;
  const path = `reports/errors/${new Date(now).toISOString().slice(0, 10)}/${issueId}`;
  const existing = await admin.readWithEtag<unknown>(path);
  if (existing.data !== null) return;
  await admin.writeIfMatch(path, {
    id: issueId, timestamp: now, feature: 'results', severity: 'error',
    message: 'Feedback notification delivery failed after its retry.',
    userId: intent.actorUid, userName: 'Notification Worker', userRole: 'service', duplicateCount: 1,
    contextData: { eventId: intent.eventId, resultId: intent.resultId, failedRecipientCount: 1 },
  }, existing.etag);
};

/** One bounded pass gives each committed feedback event at most one later delivery attempt. */
export const retryDueFeedbackNotifications = async (
  env: Env,
  now = Date.now(),
  dependencies: {
    readonly storage?: FeedbackActionStorage;
    readonly repository?: NotificationCommandRepository;
    readonly read?: (path: string) => Promise<unknown>;
  } = {},
): Promise<void> => {
  const storage = dependencies.storage ?? new FirebaseFeedbackActionStorage(env);
  const repository = dependencies.repository ?? new FirebaseRestNotificationCommandRepository({ env: {
    FIREBASE_DB_URL: required(env, 'FIREBASE_DB_URL'), FIREBASE_PROJECT_ID: required(env, 'FIREBASE_PROJECT_ID'),
    NOTIFICATION_COMMAND_SERVICE_IDENTITY: required(env, 'NOTIFICATION_COMMAND_SERVICE_IDENTITY'),
    NOTIFICATION_COMMAND_GOOGLE_SA_KEY: required(env, 'NOTIFICATION_COMMAND_GOOGLE_SA_KEY'),
  } as NotificationCommandRepositoryEnv });
  const read = dependencies.read ?? ((path: string) => storage.read(path));
  for (const intent of await storage.dueIntents(now, 2)) {
    const wasRetrying = intent.state === 'retrying';
    const claimed = wasRetrying ? intent : await storage.claimRetry(intent.eventId, now);
    if (!claimed) continue;
    let delivered = false;
    let backendFailure = false;
    try {
      if (wasRetrying) {
        const row = record(await read(`notifications/${claimed.studentId}/${claimed.eventId}`));
        delivered = row?.id === claimed.eventId && row.type === 'feedback'
          && row.link === buildRoute('RESULT_DETAIL', { resultId: claimed.resultId });
      } else {
        const source = await trustedFeedbackSource(claimed, read);
        if (source) {
          const notice = {
            type: 'feedback' as const, title: 'New Feedback Available',
            message: 'Your teacher added feedback to your test result.',
            link: buildRoute('RESULT_DETAIL', { resultId: claimed.resultId }),
          };
          const sent = await repository.create({ operationId: claimed.eventId, recipientId: claimed.studentId, notification: notice, now: claimed.occurredAt });
          delivered = sent.status !== 'idempotency-conflict';
        }
      }
    } catch {
      backendFailure = true;
    }
    if (backendFailure) break;
    if (!delivered) await reportFailure(env, claimed, now);
    await storage.updateIntent({ ...claimed, state: delivered ? 'done' : 'failed', attempts: 2, dueAt: FEEDBACK_INTENT_DONE_DUE_AT });
  }
};
