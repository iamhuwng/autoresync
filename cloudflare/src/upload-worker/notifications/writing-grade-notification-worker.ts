import { createFirebaseVerifier } from '../firebase-verification.js';
import {
  deliverWritingGradeNotification,
  readWritingGradeNotificationAction,
  retryDueWritingGradeNotifications,
  type WritingGradeNotificationStorage,
} from './writing-grade-authority.ts';
import { FirebaseWritingGradeNotificationStorage } from './writing-grade-store.ts';
import {
  FirebaseRestNotificationCommandRepository,
  type NotificationCommandRepository,
  type NotificationCommandRepositoryEnv,
} from './repository.ts';

const ACTION_PATH = '/writing-notifications/actions';
const ALLOWED_ORIGINS = new Set(['https://kahut1.web.app', 'http://localhost:5173', 'http://localhost:5174']);
type Env = Readonly<Record<string, unknown>>;
type RateLimiter = { limit(input: { key: string }): Promise<{ success: boolean }> | { success: boolean } };
type FirebaseVerifier = ReturnType<typeof createFirebaseVerifier>;

const required = (env: Env, key: string): string => {
  const value = env[key];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`missing_${key.toLowerCase()}`);
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

export interface WritingNotificationWorkerOptions {
  readonly firebaseVerifier?: FirebaseVerifier;
  readonly repositoryFactory?: (env: Env) => NotificationCommandRepository;
  readonly storageFactory?: (env: Env) => WritingGradeNotificationStorage;
  readonly now?: () => number;
}

const repositoryForEnv = (env: Env): NotificationCommandRepository =>
  new FirebaseRestNotificationCommandRepository({ env: {
    FIREBASE_DB_URL: required(env, 'FIREBASE_DB_URL'),
    FIREBASE_PROJECT_ID: required(env, 'FIREBASE_PROJECT_ID'),
    NOTIFICATION_COMMAND_SERVICE_IDENTITY: required(env, 'NOTIFICATION_COMMAND_SERVICE_IDENTITY'),
    NOTIFICATION_COMMAND_GOOGLE_SA_KEY: required(env, 'NOTIFICATION_COMMAND_GOOGLE_SA_KEY'),
  } as NotificationCommandRepositoryEnv });

export const createWritingNotificationWorker = (options: WritingNotificationWorkerOptions = {}) => {
  const verifier = options.firebaseVerifier ?? createFirebaseVerifier();
  const now = options.now ?? Date.now;
  const repositoryFactory = options.repositoryFactory ?? repositoryForEnv;
  const storageFactory = options.storageFactory ?? ((env) => new FirebaseWritingGradeNotificationStorage(env));
  return {
    async fetch(request: Request, env: Env): Promise<Response> {
      const url = new URL(request.url);
      if (url.pathname !== ACTION_PATH || url.search || url.hash) return response(request, { code: 'writing_notification_not_found' }, 404);
      const origin = request.headers.get('Origin');
      if (origin && !ALLOWED_ORIGINS.has(origin)) return response(request, { code: 'cors_origin_denied' }, 403);
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: response(request, {}, 200).headers });
      if (request.method !== 'POST') return response(request, { code: 'method_not_allowed' }, 405);
      const auth = await verifier.verifyAuthorizationHeader(request.headers.get('Authorization'), env);
      if (!auth.valid || typeof auth.uid !== 'string' || !auth.uid) return response(request, { code: 'writing_notification_unauthenticated' }, 401);
      const limiter = env.NOTIFICATION_RATE_LIMITER as RateLimiter | undefined;
      if (!limiter || typeof limiter.limit !== 'function') return response(request, { code: 'writing_notification_unavailable' }, 503);
      if (!(await limiter.limit({ key: `writing-notification:${auth.uid}` })).success) return response(request, { code: 'rate_limited' }, 429);
      try {
        const action = await readWritingGradeNotificationAction(request);
        const result = await deliverWritingGradeNotification({
          eventId: action.eventId, submissionId: action.submissionId, actorUid: auth.uid,
          storage: storageFactory(env), repository: repositoryFactory(env), now,
        });
        const status = result === 'delivered' ? 200 : result === 'not_found' ? 404 : result === 'forbidden' ? 403 : 503;
        return response(request, { status: result }, status);
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('writing_notification_')) {
          return response(request, { code: error.message }, 400);
        }
        return response(request, { code: 'writing_notification_failed' }, 503);
      }
    },
  };
};

export const retryDueWritingNotificationsForEnv = async (env: Env, now: () => number = Date.now): Promise<void> => {
  const storage = new FirebaseWritingGradeNotificationStorage(env);
  await retryDueWritingGradeNotifications({
    storage,
    repository: repositoryForEnv(env),
    now: now(),
    readInbox: (path) => storage.readInbox(path),
    reportFailure: (intent, at) => storage.reportFailure(intent, at),
  });
};
