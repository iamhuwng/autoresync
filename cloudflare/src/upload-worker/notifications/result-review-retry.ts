import { FirebaseRtdbRestClient } from '../listening-authoring/rtdb.ts';
import {
  FirebaseRestNotificationCommandRepository,
  type NotificationCommandRepository,
  type NotificationCommandRepositoryEnv,
} from './repository.ts';
import {
  FirebaseResultReviewActionStorage,
  type ResultReviewActionStorage,
} from './result-review-action-store.ts';
import { resultReviewNotification } from './result-review-action.ts';

type Env = Readonly<Record<string, unknown>>;
const DONE_DUE_AT = 8_640_000_000_000_000;
const required = (env: Env, name: string): string => {
  const value = env[name];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`missing_${name.toLowerCase()}`);
  return value.trim();
};
const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

const trustedReview = async (
  intent: Awaited<ReturnType<ResultReviewActionStorage['dueIntents']>>[number],
  read: (path: string) => Promise<unknown>,
): Promise<{ result: Record<string, unknown>; actor: Record<string, unknown> } | null> => {
  const result = record(await read(`test_results/${intent.resultId}`));
  const actor = record(await read(`users/${intent.actorUid}`));
  if (!result || !actor || result.resultId !== intent.resultId || result.studentId !== intent.studentId
    || result.markingStatus !== 'reviewed' || result.reviewedAt !== intent.occurredAt
    || result.reviewedBy !== intent.actorUid || !['teacher', 'super_admin'].includes(String(actor.role))) return null;
  const visibility = record(result.visibility);
  const courseId = typeof result.courseId === 'string' ? result.courseId : '';
  const course = courseId ? record(await read(`courses/${courseId}`)) : null;
  const authorized = actor.role === 'super_admin' || (visibility
    ? visibility.ownershipResolved === true && visibility.visibilityOwnerTeacherId === intent.actorUid
    : result.teacherId === intent.actorUid || course?.createdBy === intent.actorUid);
  return authorized ? { result, actor } : null;
};

const reportFailure = async (env: Env, intent: Parameters<ResultReviewActionStorage['updateIntent']>[0], now: number): Promise<void> => {
  const admin = new FirebaseRtdbRestClient({
    env: {
      FIREBASE_DB_URL: required(env, 'FIREBASE_DB_URL'),
      FIREBASE_PROJECT_ID: required(env, 'FIREBASE_PROJECT_ID'),
      GOOGLE_SA_KEY: required(env, 'NOTIFICATION_COMMAND_GOOGLE_SA_KEY'),
    },
  });
  const date = new Date(now).toISOString().slice(0, 10);
  const path = `reports/errors/${date}/result-notification-${intent.eventId}`;
  const existing = await admin.readWithEtag<unknown>(path);
  if (existing.data !== null) return;
  await admin.writeIfMatch(path, {
    id: `result-notification-${intent.eventId}`,
    timestamp: now,
    feature: 'results',
    severity: 'error',
    message: 'Reviewed result notification delivery failed after its retry.',
    userId: intent.actorUid,
    userName: 'Notification Worker',
    userRole: 'service',
    duplicateCount: 1,
    contextData: { eventId: intent.eventId, resultId: intent.resultId, failedRecipientCount: 1 },
  }, existing.etag);
};

/** One bounded retry pass for committed result-review actions. */
export const retryDueResultReviewNotifications = async (
  env: Env,
  now = Date.now(),
  dependencies: {
    readonly storage?: ResultReviewActionStorage;
    readonly repository?: NotificationCommandRepository;
    readonly read?: (path: string) => Promise<unknown>;
  } = {},
): Promise<void> => {
  const storage = dependencies.storage ?? new FirebaseResultReviewActionStorage(env);
  const repository = dependencies.repository ?? new FirebaseRestNotificationCommandRepository({
    env: {
      FIREBASE_DB_URL: required(env, 'FIREBASE_DB_URL'),
      FIREBASE_PROJECT_ID: required(env, 'FIREBASE_PROJECT_ID'),
      NOTIFICATION_COMMAND_SERVICE_IDENTITY: required(env, 'NOTIFICATION_COMMAND_SERVICE_IDENTITY'),
      NOTIFICATION_COMMAND_GOOGLE_SA_KEY: required(env, 'NOTIFICATION_COMMAND_GOOGLE_SA_KEY'),
    } as NotificationCommandRepositoryEnv,
  });
  const read = dependencies.read ?? ((path: string) => storage.read(path));

  for (const intent of await storage.dueIntents(now, 2)) {
    if (intent.state === 'retrying') {
      let savedValue: unknown;
      try {
        savedValue = await read(`notifications/${intent.studentId}/${intent.eventId}`);
      } catch {
        break;
      }
      const saved = record(savedValue);
      const expected = resultReviewNotification({ resultId: intent.resultId, studentId: intent.studentId }).notification;
      const delivered = Boolean(expected && saved?.id === intent.eventId
        && saved.type === expected.type && saved.title === expected.title
        && saved.message === expected.message && saved.link === expected.link
        && typeof saved.read === 'boolean' && saved.createdAt === intent.occurredAt);
      if (!delivered) await reportFailure(env, intent, now);
      await storage.updateIntent({ ...intent, state: delivered ? 'done' : 'failed', attempts: 2, dueAt: DONE_DUE_AT });
      continue;
    }
    const claimed = await storage.claimRetry(intent.eventId, now);
    if (!claimed) continue;
    let delivered = false;
    let backendFailure = false;
    try {
      const source = await trustedReview(claimed, read);
      if (source) {
        const notice = resultReviewNotification(source.result);
        const result = await repository.create({
          operationId: claimed.eventId,
          recipientId: claimed.studentId,
          notification: notice.notification,
          now: claimed.occurredAt,
        });
        delivered = result.status !== 'idempotency-conflict';
      }
    } catch {
      // A read failure leaves the claimed intent for read-only recovery on the next pass.
      break;
    }
    if (!delivered) await reportFailure(env, claimed, now);
    await storage.updateIntent({ ...claimed, state: delivered ? 'done' : 'failed', attempts: 2, dueAt: DONE_DUE_AT });
    if (backendFailure) break;
  }
};
