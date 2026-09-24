import { createFirebaseVerifier } from '../firebase-verification.js';
import {
  FirebaseRestNotificationCommandRepository,
  type NotificationCommandRepository,
  type NotificationCommandRepositoryEnv,
} from './repository.ts';
import {
  parseTestCompleteNotificationAction,
  performTestCompleteNotificationAction,
  retryDueTestCompleteNotifications,
  type TestCompleteNotificationStorage,
} from './test-complete-notification-action.ts';
import { FirebaseTestCompleteNotificationStorage } from './test-complete-notification-store.ts';

const ACTION_PATH = '/test-complete-notifications/actions';
const ALLOWED_ORIGINS = new Set(['https://kahut1.web.app', 'http://localhost:5173', 'http://localhost:5174']);
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

export interface TestCompleteNotificationWorkerOptions {
  readonly firebaseVerifier?: ReturnType<typeof createFirebaseVerifier>;
  readonly repositoryFactory?: (env: Env) => NotificationCommandRepository;
  readonly storageFactory?: (env: Env) => TestCompleteNotificationStorage;
  readonly now?: () => number;
}

const repositoryForEnv = (env: Env): NotificationCommandRepository => new FirebaseRestNotificationCommandRepository({
  env: {
    FIREBASE_DB_URL: required(env, 'FIREBASE_DB_URL'),
    FIREBASE_PROJECT_ID: required(env, 'FIREBASE_PROJECT_ID'),
    NOTIFICATION_COMMAND_SERVICE_IDENTITY: required(env, 'NOTIFICATION_COMMAND_SERVICE_IDENTITY'),
    NOTIFICATION_COMMAND_GOOGLE_SA_KEY: required(env, 'NOTIFICATION_COMMAND_GOOGLE_SA_KEY'),
  } as NotificationCommandRepositoryEnv,
});

export const createTestCompleteNotificationWorker = (options: TestCompleteNotificationWorkerOptions = {}) => {
  const verifier = options.firebaseVerifier ?? createFirebaseVerifier();
  const storageFactory = options.storageFactory ?? ((env) => new FirebaseTestCompleteNotificationStorage(env));
  const repositoryFactory = options.repositoryFactory ?? repositoryForEnv;
  const now = options.now ?? Date.now;
  return {
    async fetch(request: Request, env: Env): Promise<Response> {
      const url = new URL(request.url);
      if (url.pathname !== ACTION_PATH || url.search || url.hash) return response(request, { code: 'test_complete_not_found' }, 404);
      const origin = request.headers.get('Origin');
      if (origin && !ALLOWED_ORIGINS.has(origin)) return response(request, { code: 'cors_origin_denied' }, 403);
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: response(request, {}, 200).headers });
      if (request.method !== 'POST') return response(request, { code: 'method_not_allowed' }, 405);
      const auth = await verifier.verifyAuthorizationHeader(request.headers.get('Authorization'), env);
      if (!auth.valid || typeof auth.uid !== 'string' || !auth.uid) return response(request, { code: 'test_complete_unauthenticated' }, 401);
      const limiter = env.NOTIFICATION_RATE_LIMITER as RateLimiter | undefined;
      if (!limiter || typeof limiter.limit !== 'function') return response(request, { code: 'notification_command_unavailable' }, 503);
      if (!(await limiter.limit({ key: `test-complete:${auth.uid}` })).success) return response(request, { code: 'rate_limited' }, 429);
      try {
        const command = await parseTestCompleteNotificationAction(request);
        const result = await performTestCompleteNotificationAction({ resultId: command.resultId, actorUid: auth.uid,
          storage: storageFactory(env), repository: repositoryFactory(env), now });
        return response(request, result.body, result.status);
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('test_complete_')) return response(request, { code: error.message }, 400);
        return response(request, { code: 'test_complete_failed' }, 500);
      }
    },
  };
};

export const retryDueTestCompleteNotificationsForEnv = async (env: Env, now: () => number = Date.now): Promise<void> => {
  await retryDueTestCompleteNotifications({ storage: new FirebaseTestCompleteNotificationStorage(env),
    repository: repositoryForEnv(env), now });
};
