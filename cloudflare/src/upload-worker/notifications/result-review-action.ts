import { createFirebaseVerifier } from '../firebase-verification.js';
import { buildRoute } from '../../../../src/constants/routes.ts';
import { FirebaseRtdbRestClient } from '../listening-authoring/rtdb.ts';
import {
  FirebaseRestNotificationCommandRepository,
  type NotificationCommandRepository,
  type NotificationCommandRepositoryEnv,
} from './repository.ts';
import {
  FirebaseResultReviewActionStorage,
  type ResultReviewActionStorage as ActionStorage,
} from './result-review-action-store.ts';
import { retryDueResultReviewNotifications } from './result-review-retry.ts';

const ACTION_PATH = '/result-notifications/reviewed';
const ALLOWED_ORIGINS = new Set([
  'https://kahut1.web.app',
  'http://localhost:5173',
  'http://localhost:5174',
]);
const ID = /^[A-Za-z0-9_-]{1,128}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const RETRY_DELAY_MS = 60 * 60 * 1000;
const DONE_DUE_AT = 8_640_000_000_000_000;

export interface ResultReviewCommand {
  readonly schemaVersion: 1;
  readonly actionType: 'result-reviewed';
  readonly eventId: string;
  readonly resultId: string;
}

export interface ResultReviewIntent {
  readonly schemaVersion: 1;
  readonly eventId: string;
  readonly kind: 'result-reviewed';
  readonly resultId: string;
  readonly actorUid: string;
  readonly studentId: string;
  readonly occurredAt: number;
  readonly dueAt: number;
  readonly attempts: number;
  readonly state: 'retry_due' | 'retrying' | 'done' | 'failed';
}

type WorkerEnv = Readonly<Record<string, unknown>>;
type FirebaseVerifier = ReturnType<typeof createFirebaseVerifier>;
type RateLimiter = { limit(input: { key: string }): Promise<{ success: boolean }> | { success: boolean } };

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

const requiredBinding = (env: WorkerEnv, name: string): string => {
  const value = env[name];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`missing_${name.toLowerCase()}`);
  return value.trim();
};

const response = (request: Request, body: Record<string, unknown>, status: number): Response => {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    Vary: 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers',
  });
  const origin = request.headers.get('Origin');
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Idempotency-Key');
  }
  return new Response(JSON.stringify(body), { status, headers });
};

export const parseResultReviewAction = async (request: Request): Promise<ResultReviewCommand> => {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new Error('content_type_required');
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 2048) throw new Error('result_review_body_too_large');
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error('result_review_invalid_json'); }
  const value = record(parsed);
  if (!value || Object.keys(value).sort().join(',') !== 'actionType,eventId,resultId,schemaVersion'
    || value.schemaVersion !== 1 || value.actionType !== 'result-reviewed'
    || typeof value.eventId !== 'string' || !UUID.test(value.eventId)
    || request.headers.get('Idempotency-Key') !== value.eventId
    || typeof value.resultId !== 'string' || !ID.test(value.resultId)) {
    throw new Error('result_review_invalid');
  }
  return value as unknown as ResultReviewCommand;
};

const trustedReviewAuthority = (
  resultValue: unknown,
  actorValue: unknown,
  command: ResultReviewCommand,
  actorUid: string,
): { result: Record<string, unknown>; actor: Record<string, unknown> } | null => {
  const result = record(resultValue);
  const actor = record(actorValue);
  const visibility = record(result?.visibility);
  const actorRole = actor?.role;
  if (!result || !actor || result.resultId !== command.resultId
    || !ID.test(String(result.studentId ?? ''))
    || !['teacher', 'super_admin'].includes(String(actorRole))) return null;
  if (actorRole !== 'super_admin') {
    const courseId = typeof result.courseId === 'string' ? result.courseId : '';
    const course = record((resultValue as Record<string, unknown>).__courseAuthority);
    const authorized = visibility
      ? visibility.ownershipResolved === true && visibility.visibilityOwnerTeacherId === actorUid
      : result.teacherId === actorUid || course?.createdBy === actorUid;
    if (!authorized) return null;
  }
  return { result, actor };
};

export const resultReviewNotification = (result: Record<string, unknown>) => {
  return {
    recipientId: String(result.studentId),
    notification: {
      type: 'success' as const,
      title: 'Result Reviewed',
      message: 'Your test result has been reviewed. View your score.',
      link: buildRoute('RESULT_DETAIL', { resultId: String(result.resultId) }),
    },
  };
};

export const performResultReviewAction = async (input: {
  readonly command: ResultReviewCommand;
  readonly actorUid: string;
  readonly storage: ActionStorage;
  readonly repository: NotificationCommandRepository;
  readonly now?: () => number;
}): Promise<{ status: number; body: Record<string, unknown> }> => {
  const { command, actorUid, storage } = input;
  const existing = record(await storage.read(`result_review_notification_intents/${command.eventId}`));
  if (existing) {
    if (existing.eventId !== command.eventId || existing.resultId !== command.resultId
      || existing.actorUid !== actorUid || existing.kind !== 'result-reviewed') {
      return { status: 409, body: { code: 'result_review_event_conflict' } };
    }
    return { status: 200, body: { status: 'replayed', eventId: command.eventId, notificationStatus: existing.state } };
  }

  const rawResult = record(await storage.read(`test_results/${command.resultId}`));
  const actor = record(await storage.read(`users/${actorUid}`));
  const courseId = typeof rawResult?.courseId === 'string' ? rawResult.courseId : '';
  const course = courseId ? record(await storage.read(`courses/${courseId}`)) : null;
  const authoritative = rawResult && actor
    ? trustedReviewAuthority({ ...rawResult, __courseAuthority: course }, actor, command, actorUid)
    : null;
  if (!authoritative) return { status: 403, body: { code: 'result_review_forbidden' } };
  if (authoritative.result.markingStatus !== 'pending-review') {
    return { status: 409, body: { code: 'result_review_stale' } };
  }

  const now = input.now ?? Date.now;
  const occurredAt = now();
  const intent: ResultReviewIntent = {
    schemaVersion: 1,
    eventId: command.eventId,
    kind: 'result-reviewed',
    resultId: command.resultId,
    actorUid,
    studentId: String(authoritative.result.studentId),
    occurredAt,
    dueAt: occurredAt + RETRY_DELAY_MS,
    attempts: 1,
    state: 'retry_due',
  };
  try {
    await storage.commit({ command, actorUid, intent });
  } catch {
    const committed = record(await storage.read(`result_review_notification_intents/${command.eventId}`));
    if (!committed || committed.resultId !== command.resultId || committed.actorUid !== actorUid) {
      return { status: 409, body: { code: 'result_review_commit_failed' } };
    }
  }

  let notificationStatus: string = 'retry_due';
  try {
    const result = await input.repository.create({
      operationId: command.eventId,
      recipientId: intent.studentId,
      notification: resultReviewNotification(authoritative.result).notification,
      now: occurredAt,
    });
    if (result.status !== 'idempotency-conflict') {
      await storage.updateIntent({ ...intent, state: 'done', dueAt: DONE_DUE_AT });
      notificationStatus = 'delivered';
    } else {
      notificationStatus = 'retry_due';
    }
  } catch {
    // The committed result review succeeds; the durable intent gets one later attempt.
  }
  return { status: 200, body: { status: 'committed', eventId: command.eventId, notificationStatus } };
};

export interface ResultReviewNotificationWorkerOptions {
  readonly firebaseVerifier?: FirebaseVerifier;
  readonly repositoryFactory?: (env: WorkerEnv) => NotificationCommandRepository;
  readonly actionStorageFactory?: (env: WorkerEnv) => ActionStorage;
  readonly now?: () => number;
}

export const createResultReviewNotificationWorker = (
  options: ResultReviewNotificationWorkerOptions = {},
) => {
  const firebaseVerifier = options.firebaseVerifier ?? createFirebaseVerifier();
  const repositoryFactory = options.repositoryFactory ?? ((env) => new FirebaseRestNotificationCommandRepository({
    env: {
      FIREBASE_DB_URL: requiredBinding(env, 'FIREBASE_DB_URL'),
      FIREBASE_PROJECT_ID: requiredBinding(env, 'FIREBASE_PROJECT_ID'),
      NOTIFICATION_COMMAND_SERVICE_IDENTITY: requiredBinding(env, 'NOTIFICATION_COMMAND_SERVICE_IDENTITY'),
      NOTIFICATION_COMMAND_GOOGLE_SA_KEY: requiredBinding(env, 'NOTIFICATION_COMMAND_GOOGLE_SA_KEY'),
    } as NotificationCommandRepositoryEnv,
  }));
  const actionStorageFactory = options.actionStorageFactory ?? ((env) => new FirebaseResultReviewActionStorage(env));
  const now = options.now ?? Date.now;
  return {
    async fetch(request: Request, env: WorkerEnv): Promise<Response> {
      const url = new URL(request.url);
      if (url.pathname !== ACTION_PATH || url.search || url.hash) {
        return response(request, { code: 'result_review_not_found' }, 404);
      }
      const origin = request.headers.get('Origin');
      if (origin && !ALLOWED_ORIGINS.has(origin)) return response(request, { code: 'cors_origin_denied' }, 403);
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: response(request, {}, 200).headers });
      }
      if (request.method !== 'POST') return response(request, { code: 'method_not_allowed' }, 405);
      const auth = await firebaseVerifier.verifyAuthorizationHeader(request.headers.get('Authorization'), env);
      if (!auth.valid || typeof auth.uid !== 'string' || !auth.uid) {
        return response(request, { code: 'result_review_unauthenticated' }, 401);
      }
      const limiterValue = env.NOTIFICATION_RATE_LIMITER as RateLimiter | undefined;
      if (!limiterValue || typeof limiterValue.limit !== 'function') {
        return response(request, { code: 'notification_command_unavailable' }, 503);
      }
      const limited = await limiterValue.limit({ key: `result-review:${auth.uid}` });
      if (!limited.success) return response(request, { code: 'rate_limited' }, 429);
      try {
        const command = await parseResultReviewAction(request);
        const result = await performResultReviewAction({
          command,
          actorUid: auth.uid,
          storage: actionStorageFactory(env),
          repository: repositoryFactory(env),
          now,
        });
        return response(request, result.body, result.status);
      } catch (error) {
        if (error instanceof Error && (error.message === 'content_type_required' || error.message.startsWith('result_review_'))) {
          return response(request, { code: error.message }, 400);
        }
        return response(request, { code: 'result_review_failed' }, 500);
      }
    },
  };
};

export { retryDueResultReviewNotifications };
