import { createFirebaseVerifier } from '../firebase-verification.js';
import { buildRoute } from '../../../../src/constants/routes.ts';
import {
  FirebaseRestNotificationCommandRepository,
  type NotificationCommandRepository,
  type NotificationCommandRepositoryEnv,
} from './repository.ts';
import {
  FirebaseFeedbackActionStorage,
  type FeedbackActionStorage,
} from './feedback-notification-action-store.ts';
import { retryDueFeedbackNotifications } from './feedback-notification-retry.ts';

const ACTION_PATH = '/feedback-notifications/actions';
const ALLOWED_ORIGINS = new Set(['https://kahut1.web.app', 'http://localhost:5173', 'http://localhost:5174']);
const ID = /^[A-Za-z0-9_-]{1,128}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const RETRY_DELAY_MS = 60 * 60 * 1000;
export const FEEDBACK_INTENT_DONE_DUE_AT = 8_640_000_000_000_000;

export interface FeedbackActionCommand {
  readonly schemaVersion: 1;
  readonly actionType: 'save-feedback';
  readonly eventId: string;
  readonly resultId: string;
  readonly feedbackKind: 'question' | 'overall';
  readonly questionId?: string;
  readonly feedback: string;
}

export interface FeedbackNotificationIntent {
  readonly schemaVersion: 1;
  readonly eventId: string;
  readonly kind: 'feedback-question' | 'feedback-overall';
  readonly resultId: string;
  readonly actorUid: string;
  readonly studentId: string;
  readonly questionId?: string;
  readonly occurredAt: number;
  readonly dueAt: number;
  readonly attempts: number;
  readonly state: 'retry_due' | 'retrying' | 'done' | 'failed';
}

type Env = Readonly<Record<string, unknown>>;
type FirebaseVerifier = ReturnType<typeof createFirebaseVerifier>;
type RateLimiter = { limit(input: { key: string }): Promise<{ success: boolean }> | { success: boolean } };

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const required = (env: Env, name: string): string => {
  const value = env[name];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`missing_${name.toLowerCase()}`);
  return value.trim();
};
const response = (request: Request, body: Record<string, unknown>, status: number): Response => {
  const headers = new Headers({ 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8', Vary: 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers' });
  const origin = request.headers.get('Origin');
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Idempotency-Key');
  }
  return new Response(JSON.stringify(body), { status, headers });
};

export const parseFeedbackAction = async (request: Request): Promise<FeedbackActionCommand> => {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) throw new Error('content_type_required');
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 12_000) throw new Error('feedback_action_body_too_large');
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error('feedback_action_invalid_json'); }
  const value = record(parsed);
  const expected = value?.feedbackKind === 'question'
    ? ['actionType', 'eventId', 'feedback', 'feedbackKind', 'questionId', 'resultId', 'schemaVersion']
    : ['actionType', 'eventId', 'feedback', 'feedbackKind', 'resultId', 'schemaVersion'];
  if (!value || Object.keys(value).sort().join(',') !== expected.join(',')
    || value.schemaVersion !== 1 || value.actionType !== 'save-feedback'
    || typeof value.eventId !== 'string' || !UUID.test(value.eventId)
    || request.headers.get('Idempotency-Key') !== value.eventId
    || typeof value.resultId !== 'string' || !ID.test(value.resultId)
    || !['question', 'overall'].includes(String(value.feedbackKind))
    || (value.feedbackKind === 'question' && (typeof value.questionId !== 'string' || !ID.test(value.questionId)))
    || typeof value.feedback !== 'string' || value.feedback.length > 5000) throw new Error('feedback_action_invalid');
  return value as unknown as FeedbackActionCommand;
};

const feedbackNotification = (result: Record<string, unknown>) => ({
    type: 'feedback' as const,
    title: 'New Feedback Available',
    message: 'Your teacher added feedback to your test result.',
    link: buildRoute('RESULT_DETAIL', { resultId: String(result.resultId) }),
});

const trustedFeedbackActor = async (
  storage: FeedbackActionStorage,
  result: Record<string, unknown>,
  actorUid: string,
): Promise<Record<string, unknown> | null> => {
  const actor = record(await storage.read(`users/${actorUid}`));
  if (!actor || !['teacher', 'super_admin'].includes(String(actor.role))) return null;
  if (actor.role === 'super_admin') return actor;
  const visibility = record(result.visibility);
  const visibilityOwner = visibility?.ownershipResolved === true && visibility.visibilityOwnerTeacherId === actorUid;
  const directOwner = result.teacherId === actorUid;
  const courseId = typeof result.courseId === 'string' ? result.courseId : '';
  const course = courseId ? record(await storage.read(`courses/${courseId}`)) : null;
  return visibilityOwner || directOwner || course?.createdBy === actorUid ? actor : null;
};

export const performFeedbackAction = async (input: {
  readonly command: FeedbackActionCommand;
  readonly actorUid: string;
  readonly storage: FeedbackActionStorage;
  readonly repository: NotificationCommandRepository;
  readonly now?: () => number;
}): Promise<{ status: number; body: Record<string, unknown> }> => {
  const { command, actorUid, storage } = input;
  const existing = record(await storage.read(`feedback_notification_intents/${command.eventId}`));
  if (existing) {
    if (existing.eventId !== command.eventId || existing.resultId !== command.resultId || existing.actorUid !== actorUid
      || existing.kind !== `feedback-${command.feedbackKind}` || (existing.questionId ?? null) !== (command.questionId ?? null)) {
      return { status: 409, body: { code: 'feedback_action_event_conflict' } };
    }
    return { status: 200, body: { status: 'replayed', eventId: command.eventId, notificationStatus: existing.state } };
  }
  const result = record(await storage.read(`test_results/${command.resultId}`));
  if (!result || result.resultId !== command.resultId || typeof result.studentId !== 'string' || !ID.test(result.studentId)) {
    return { status: 404, body: { code: 'feedback_result_not_found' } };
  }
  const actor = await trustedFeedbackActor(storage, result, actorUid);
  if (!actor) return { status: 403, body: { code: 'feedback_action_forbidden' } };
  if (command.feedbackKind === 'question') {
    const questions = Array.isArray(result.questionResults) ? result.questionResults : [];
    const questionExists = questions.some((item) => {
      const question = record(item);
      return question && (question.questionId === command.questionId || String(question.questionNumber ?? '') === command.questionId);
    });
    if (!questionExists) return { status: 409, body: { code: 'feedback_question_not_found' } };
  }
  const occurredAt = (input.now ?? Date.now)();
  const intent: FeedbackNotificationIntent = {
    schemaVersion: 1,
    eventId: command.eventId,
    kind: `feedback-${command.feedbackKind}`,
    resultId: command.resultId,
    actorUid,
    studentId: result.studentId,
    ...(command.questionId === undefined ? {} : { questionId: command.questionId }),
    occurredAt,
    dueAt: occurredAt + RETRY_DELAY_MS,
    attempts: 1,
    state: 'retry_due',
  };
  try {
    await storage.commit({ command, actorUid, actor, intent, result });
  } catch {
    const committed = record(await storage.read(`feedback_notification_intents/${command.eventId}`));
    if (!committed || committed.resultId !== command.resultId || committed.actorUid !== actorUid) {
      return { status: 409, body: { code: 'feedback_action_commit_failed' } };
    }
  }
  let notificationStatus = 'retry_due';
  try {
    const sent = await input.repository.create({
      operationId: command.eventId,
      recipientId: intent.studentId,
      notification: feedbackNotification(result),
      now: occurredAt,
    });
    if (sent.status !== 'idempotency-conflict') {
      await storage.updateIntent({ ...intent, state: 'done', dueAt: FEEDBACK_INTENT_DONE_DUE_AT });
      notificationStatus = 'delivered';
    }
  } catch {
    // The feedback save is committed; the durable intent gets one later attempt.
  }
  return { status: 200, body: { status: 'committed', eventId: command.eventId, notificationStatus } };
};

export interface FeedbackNotificationWorkerOptions {
  readonly firebaseVerifier?: FirebaseVerifier;
  readonly repositoryFactory?: (env: Env) => NotificationCommandRepository;
  readonly actionStorageFactory?: (env: Env) => FeedbackActionStorage;
  readonly now?: () => number;
}

export const createFeedbackNotificationWorker = (options: FeedbackNotificationWorkerOptions = {}) => {
  const verifier = options.firebaseVerifier ?? createFirebaseVerifier();
  const repositoryFactory = options.repositoryFactory ?? ((env) => new FirebaseRestNotificationCommandRepository({
    env: {
      FIREBASE_DB_URL: required(env, 'FIREBASE_DB_URL'),
      FIREBASE_PROJECT_ID: required(env, 'FIREBASE_PROJECT_ID'),
      NOTIFICATION_COMMAND_SERVICE_IDENTITY: required(env, 'NOTIFICATION_COMMAND_SERVICE_IDENTITY'),
      NOTIFICATION_COMMAND_GOOGLE_SA_KEY: required(env, 'NOTIFICATION_COMMAND_GOOGLE_SA_KEY'),
    } as NotificationCommandRepositoryEnv,
  }));
  const storageFactory = options.actionStorageFactory ?? ((env) => new FirebaseFeedbackActionStorage(env));
  return {
    async fetch(request: Request, env: Env): Promise<Response> {
      const url = new URL(request.url);
      if (url.pathname !== ACTION_PATH || url.search || url.hash) return response(request, { code: 'feedback_action_not_found' }, 404);
      const origin = request.headers.get('Origin');
      if (origin && !ALLOWED_ORIGINS.has(origin)) return response(request, { code: 'cors_origin_denied' }, 403);
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: response(request, {}, 200).headers });
      if (request.method !== 'POST') return response(request, { code: 'method_not_allowed' }, 405);
      const auth = await verifier.verifyAuthorizationHeader(request.headers.get('Authorization'), env);
      if (!auth.valid || typeof auth.uid !== 'string' || !auth.uid) return response(request, { code: 'feedback_action_unauthenticated' }, 401);
      const limiter = env.NOTIFICATION_RATE_LIMITER as RateLimiter | undefined;
      if (!limiter || typeof limiter.limit !== 'function') return response(request, { code: 'notification_command_unavailable' }, 503);
      if (!(await limiter.limit({ key: `feedback:${auth.uid}` })).success) return response(request, { code: 'rate_limited' }, 429);
      try {
        const command = await parseFeedbackAction(request);
        const result = await performFeedbackAction({ command, actorUid: auth.uid, storage: storageFactory(env), repository: repositoryFactory(env), now: options.now });
        return response(request, result.body, result.status);
      } catch (error) {
        if (error instanceof Error && (error.message === 'content_type_required' || error.message.startsWith('feedback_action_'))) {
          return response(request, { code: error.message }, 400);
        }
        return response(request, { code: 'feedback_action_failed' }, 500);
      }
    },
  };
};

export { retryDueFeedbackNotifications };
