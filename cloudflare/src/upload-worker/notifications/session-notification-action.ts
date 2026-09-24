import { buildRoute } from '../../../../src/constants/routes.ts';
import { createFirebaseVerifier } from '../firebase-verification.js';
import {
  FirebaseRestNotificationCommandRepository,
  type NotificationCommandRepository,
  type NotificationCommandRepositoryEnv,
} from './repository.ts';
import { FirebaseSessionNotificationActionStorage } from './session-notification-action-store.ts';
import type {
  SessionNotificationActionStorage,
  SessionNotificationEvent,
  SessionNotificationQueueRecord,
} from './session-notification-action-store.ts';

const ID = /^[A-Za-z0-9_-]{1,128}$/u;
const EVENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ACTION_PATH = '/session-notifications/action';
const ALLOWED_ORIGINS = new Set(['https://kahut1.web.app', 'http://localhost:5173', 'http://localhost:5174']);
export const SESSION_INTENT_DONE_DUE_AT = 8_640_000_000_000_000;
export const SESSION_NOTIFICATION_RECIPIENTS_PER_PASS = 10;

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

const hash32 = (value: string, seed: number): number => {
  let result = (2166136261 ^ seed) >>> 0;
  for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619) >>> 0;
  return result;
};

export const sessionNotificationId = (key: string): string => {
  const hex = [0, 1, 2, 3].map((seed) => hash32(`${key}:${seed}`, seed).toString(16).padStart(8, '0')).join('');
  const versioned = `${hex.slice(0, 12)}5${hex.slice(13, 16)}8${hex.slice(17)}`;
  return `${versioned.slice(0, 8)}-${versioned.slice(8, 12)}-${versioned.slice(12, 16)}-${versioned.slice(16, 20)}-${versioned.slice(20)}`;
};

export const sessionNotificationFor = (event: SessionNotificationEvent) => {
  switch (event.kind) {
    case 'session-opened':
      return { type: 'info' as const, title: 'New Session Available',
        message: `${event.className} has a new test session ready. Join with code ${event.sessionCode}.`,
        link: buildRoute('STUDENT_WAITING', { gameSessionId: event.sessionCode }) };
    case 'test-started':
      return { type: 'info' as const, title: 'Test Started',
        message: `"${event.testName}" has started in your class. Join now if you haven't already.`,
        link: buildRoute('STUDENT_WAITING', { gameSessionId: event.sessionCode }) };
    case 'test-ended':
      return { type: 'success' as const, title: 'Test Completed',
        message: `"${event.testName}" session has ended. View your results.`,
        link: buildRoute('STUDENT_ACADEMIC_RECORD') };
  }
};

export const deliverSessionIntentBatch = async (
  intent: SessionNotificationQueueRecord,
  repository: NotificationCommandRepository,
  now: number,
): Promise<SessionNotificationQueueRecord> => {
  const event = intent.event;
  const notice = sessionNotificationFor(event);
  const recipients = Object.keys(event.recipients ?? {});
  const initial = intent.attempts === 1;
  const candidates = initial ? recipients.slice(intent.initialCursor, intent.initialCursor + SESSION_NOTIFICATION_RECIPIENTS_PER_PASS)
    : intent.retryRecipientIds.slice(intent.retryCursor, intent.retryCursor + SESSION_NOTIFICATION_RECIPIENTS_PER_PASS);
  const firstFailures = [...intent.retryRecipientIds];
  const finalFailures = [...intent.finalFailedRecipientIds];
  for (const recipientId of candidates) {
    let failed = false;
    try {
      const result = await repository.create({
        operationId: sessionNotificationId(`${event.eventId}:${recipientId}`),
        recipientId, notification: notice, now: event.occurredAt,
      });
      failed = result.status === 'idempotency-conflict';
    } catch { failed = true; }
    if (failed) (initial ? firstFailures : finalFailures).push(recipientId);
  }
  if (initial) {
    const initialCursor = intent.initialCursor + candidates.length;
    const complete = initialCursor >= recipients.length;
    const retryRecipientIds = [...new Set(firstFailures)];
    const state = !complete ? 'initial_due' : retryRecipientIds.length ? 'retry_due' : 'done';
    return { ...intent, initialCursor, retryRecipientIds, state,
      dueAt: state === 'initial_due' ? now : state === 'retry_due' ? intent.occurredAt + 3_600_000 : SESSION_INTENT_DONE_DUE_AT };
  }
  const retryCursor = intent.retryCursor + candidates.length;
  const complete = retryCursor >= intent.retryRecipientIds.length;
  const state = complete ? (finalFailures.length ? 'failed' : 'done') : 'retrying';
  return { ...intent, retryCursor, finalFailedRecipientIds: [...new Set(finalFailures)], state,
    dueAt: complete ? SESSION_INTENT_DONE_DUE_AT : now };
};

export const parseSessionNotificationAction = async (request: Request): Promise<{ eventId: string }> => {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) throw new Error('content_type_required');
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 1024) throw new Error('session_notification_body_too_large');
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error('session_notification_invalid_json'); }
  const value = record(parsed);
  if (!value || Object.keys(value).sort().join(',') !== 'actionType,eventId,schemaVersion'
    || value.schemaVersion !== 1 || value.actionType !== 'deliver-session-notification'
    || typeof value.eventId !== 'string' || !EVENT_ID.test(value.eventId)
    || request.headers.get('Idempotency-Key') !== value.eventId) throw new Error('session_notification_invalid');
  return { eventId: value.eventId };
};

export const performSessionNotificationAction = async (input: {
  readonly eventId: string;
  readonly actorUid: string;
  readonly storage: SessionNotificationActionStorage;
  readonly repository: NotificationCommandRepository;
}): Promise<{ status: number; body: Record<string, unknown> }> => {
  const { eventId, actorUid, storage } = input;
  const queue = record(await storage.read(`session_notification_intents/${eventId}`));
  if (!queue || queue.eventId !== eventId || queue.actorUid !== actorUid || typeof queue.sessionCode !== 'string') {
    return { status: 403, body: { code: 'session_notification_forbidden' } };
  }
  const session = record(await storage.read(`game_sessions/${queue.sessionCode}`));
  const events = record(session?.notificationEvents);
  const savedEvent = record(events?.[eventId]);
  const event = record(queue.event) as unknown as SessionNotificationEvent | null;
  const recipients = record(event?.recipients) ?? {};
  const savedRecipients = record(savedEvent?.recipients) ?? {};
  const sameSnapshot = Boolean(savedEvent && event
    && ['eventId', 'kind', 'sessionCode', 'actorUid', 'classId', 'className', 'testId', 'testName', 'occurredAt', 'recipientCount']
      .every((key) => (savedEvent[key] ?? null) === ((event as unknown as Record<string, unknown>)[key] ?? null))
    && Object.keys(recipients).sort().join(',') === Object.keys(savedRecipients).sort().join(','));
  if (!event || !sameSnapshot || event.eventId !== eventId || event.actorUid !== actorUid
    || event.sessionCode !== queue.sessionCode || event.classId !== queue.classId
    || event.occurredAt !== queue.occurredAt || event.recipientCount !== queue.recipientCount
    || Object.keys(recipients).length !== queue.recipientCount
    || !['session-opened', 'test-started', 'test-ended'].includes(event.kind)
    || Object.keys(recipients).some((id) => !ID.test(id))) {
    return { status: 409, body: { code: 'session_notification_event_invalid' } };
  }
  if (queue.state === 'done') return { status: 200, body: { status: 'replayed', eventId, notificationStatus: 'delivered' } };
  const claimed = await storage.claimInitial(eventId, Date.now());
  if (!claimed) return { status: 200, body: { status: 'committed', eventId, notificationStatus: 'in_progress' } };
  const progress = await deliverSessionIntentBatch(claimed, input.repository, Date.now());
  await storage.updateIntent(progress);
  return { status: 200, body: { status: 'committed', eventId,
    notificationStatus: progress.state === 'done' ? 'delivered' : progress.state === 'failed' ? 'failed' : 'in_progress' } };
};

type Env = Readonly<Record<string, unknown>>;
type RateLimiter = { limit(input: { key: string }): Promise<{ success: boolean }> | { success: boolean } };
const required = (env: Env, name: string): string => {
  const value = env[name];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`missing_${name.toLowerCase()}`);
  return value.trim();
};
const response = (request: Request, body: Record<string, unknown>, status: number): Response => {
  const headers = new Headers({ 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8',
    Vary: 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers' });
  const origin = request.headers.get('Origin');
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Idempotency-Key');
  }
  return new Response(JSON.stringify(body), { status, headers });
};

export const createSessionNotificationActionWorker = (options: {
  readonly firebaseVerifier?: ReturnType<typeof createFirebaseVerifier>;
  readonly storageFactory?: (env: Env) => SessionNotificationActionStorage;
  readonly repositoryFactory?: (env: Env) => NotificationCommandRepository;
} = {}) => {
  const verifier = options.firebaseVerifier ?? createFirebaseVerifier();
  const storageFactory = options.storageFactory ?? ((env) => new FirebaseSessionNotificationActionStorage(env));
  const repositoryFactory = options.repositoryFactory ?? ((env) => new FirebaseRestNotificationCommandRepository({
    env: {
      FIREBASE_DB_URL: required(env, 'FIREBASE_DB_URL'),
      FIREBASE_PROJECT_ID: required(env, 'FIREBASE_PROJECT_ID'),
      NOTIFICATION_COMMAND_SERVICE_IDENTITY: required(env, 'NOTIFICATION_COMMAND_SERVICE_IDENTITY'),
      NOTIFICATION_COMMAND_GOOGLE_SA_KEY: required(env, 'NOTIFICATION_COMMAND_GOOGLE_SA_KEY'),
    } as NotificationCommandRepositoryEnv,
  }));
  return {
    async fetch(request: Request, env: Env): Promise<Response> {
      const url = new URL(request.url);
      if (url.pathname !== ACTION_PATH || url.search || url.hash) return response(request, { code: 'session_notification_not_found' }, 404);
      const origin = request.headers.get('Origin');
      if (origin && !ALLOWED_ORIGINS.has(origin)) return response(request, { code: 'cors_origin_denied' }, 403);
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: response(request, {}, 200).headers });
      if (request.method !== 'POST') return response(request, { code: 'method_not_allowed' }, 405);
      const auth = await verifier.verifyAuthorizationHeader(request.headers.get('Authorization'), env);
      if (!auth.valid || typeof auth.uid !== 'string' || !auth.uid) return response(request, { code: 'session_notification_unauthenticated' }, 401);
      const limiter = env.NOTIFICATION_RATE_LIMITER as RateLimiter | undefined;
      if (!limiter || typeof limiter.limit !== 'function') return response(request, { code: 'notification_command_unavailable' }, 503);
      if (!(await limiter.limit({ key: `session-notification:${auth.uid}` })).success) return response(request, { code: 'rate_limited' }, 429);
      try {
        const command = await parseSessionNotificationAction(request);
        const result = await performSessionNotificationAction({ ...command, actorUid: auth.uid,
          storage: storageFactory(env), repository: repositoryFactory(env) });
        return response(request, result.body, result.status);
      } catch (error) {
        if (error instanceof Error && (error.message === 'content_type_required' || error.message.startsWith('session_notification_'))) {
          return response(request, { code: error.message }, 400);
        }
        return response(request, { code: 'session_notification_failed' }, 500);
      }
    },
  };
};
