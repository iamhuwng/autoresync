import { createFirebaseVerifier } from '../firebase-verification.js';
import {
  FirebaseRestNotificationCommandRepository,
  type NotificationCommandRepository,
  type NotificationCommandRepositoryEnv,
} from './repository.ts';
import {
  parseThcsNotificationAction,
  performThcsNotificationAction,
  retryDueThcsNotifications,
  type ThcsNotificationStorage,
} from './thcs-notification-action.ts';
import { FirebaseThcsNotificationStorage } from './thcs-notification-store.ts';

const ACTION_PATH = '/thcs-notifications/actions';
const ALLOWED_ORIGINS = new Set([
  'https://kahut1.web.app',
  'http://localhost:5173',
  'http://localhost:5174',
]);
type WorkerEnv = Readonly<Record<string, unknown>>;
type FirebaseVerifier = ReturnType<typeof createFirebaseVerifier>;
type RateLimiter = { limit(input: { key: string }): Promise<{ success: boolean }> | { success: boolean } };
const binding = (env: WorkerEnv, name: string): string => {
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

export interface ThcsNotificationWorkerOptions {
  readonly firebaseVerifier?: FirebaseVerifier;
  readonly repositoryFactory?: (env: WorkerEnv) => NotificationCommandRepository;
  readonly storageFactory?: (env: WorkerEnv) => ThcsNotificationStorage;
  readonly now?: () => number;
}

const repositoryForEnv = (env: WorkerEnv): NotificationCommandRepository => new FirebaseRestNotificationCommandRepository({
  env: {
    FIREBASE_DB_URL: binding(env, 'FIREBASE_DB_URL'),
    FIREBASE_PROJECT_ID: binding(env, 'FIREBASE_PROJECT_ID'),
    NOTIFICATION_COMMAND_SERVICE_IDENTITY: binding(env, 'NOTIFICATION_COMMAND_SERVICE_IDENTITY'),
    NOTIFICATION_COMMAND_GOOGLE_SA_KEY: binding(env, 'NOTIFICATION_COMMAND_GOOGLE_SA_KEY'),
  } as NotificationCommandRepositoryEnv,
});

export const createThcsNotificationWorker = (options: ThcsNotificationWorkerOptions = {}) => {
  const firebaseVerifier = options.firebaseVerifier ?? createFirebaseVerifier();
  const repositoryFactory = options.repositoryFactory ?? repositoryForEnv;
  const storageFactory = options.storageFactory ?? ((env) => new FirebaseThcsNotificationStorage(env));
  const now = options.now ?? Date.now;
  return {
    async fetch(request: Request, env: WorkerEnv): Promise<Response> {
      const url = new URL(request.url);
      if (url.pathname !== ACTION_PATH || url.search || url.hash) return response(request, { code: 'thcs_notification_not_found' }, 404);
      const origin = request.headers.get('Origin');
      if (origin && !ALLOWED_ORIGINS.has(origin)) return response(request, { code: 'cors_origin_denied' }, 403);
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: response(request, {}, 200).headers });
      if (request.method !== 'POST') return response(request, { code: 'method_not_allowed' }, 405);
      const auth = await firebaseVerifier.verifyAuthorizationHeader(request.headers.get('Authorization'), env);
      if (!auth.valid || typeof auth.uid !== 'string' || !auth.uid) return response(request, { code: 'notification_command_unauthenticated' }, 401);
      const limiter = env.NOTIFICATION_RATE_LIMITER as RateLimiter | undefined;
      if (!limiter || typeof limiter.limit !== 'function') return response(request, { code: 'notification_command_unavailable' }, 503);
      if (!(await limiter.limit({ key: `thcs-notification:${auth.uid}` })).success) return response(request, { code: 'rate_limited' }, 429);
      try {
        const command = await parseThcsNotificationAction(request);
        const result = await performThcsNotificationAction({
          command, actorUid: auth.uid, storage: storageFactory(env), repository: repositoryFactory(env), now,
        });
        return response(request, result.body, result.status);
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('thcs_notification_')) {
          return response(request, { code: error.message }, 400);
        }
        return response(request, { code: 'thcs_notification_failed' }, 500);
      }
    },
  };
};

export const retryDueThcsNotificationsForEnv = (env: WorkerEnv, now: () => number = Date.now): Promise<void> =>
  retryDueThcsNotifications({
    storage: new FirebaseThcsNotificationStorage(env),
    repository: repositoryForEnv(env),
    now,
  });
