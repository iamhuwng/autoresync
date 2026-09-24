import { createFirebaseVerifier } from '../firebase-verification.js';
import { createHomeworkResetNotificationHandlers, type HomeworkResetNotificationStorage } from './homework-reset-action.ts';
import { FirebaseHomeworkResetNotificationStorage } from './homework-reset-action-store.ts';
import { FirebaseRestNotificationCommandRepository, type NotificationCommandRepository, type NotificationCommandRepositoryEnv } from './repository.ts';

const ACTION_PATH = '/homework-reset-notifications/actions';
const ALLOWED_ORIGINS = new Set(['https://kahut1.web.app', 'http://localhost:5173', 'http://localhost:5174']);

type Env = Readonly<Record<string, unknown>>;
type FirebaseVerifier = ReturnType<typeof createFirebaseVerifier>;
type RateLimiter = { limit(input: { key: string }): Promise<{ success: boolean }> | { success: boolean } };

const required = (env: Env, name: string): string => {
  const value = env[name];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`missing_${name.toLowerCase()}`);
  return value.trim();
};

const headers = (request: Request): Headers => {
  const value = new Headers({ 'Cache-Control': 'no-store', Vary: 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers' });
  const origin = request.headers.get('Origin');
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    value.set('Access-Control-Allow-Origin', origin);
    value.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    value.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Idempotency-Key');
  }
  return value;
};
const response = (request: Request, body: Record<string, unknown>, status: number): Response => {
  const value = headers(request);
  value.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(body), { status, headers: value });
};

export interface HomeworkResetNotificationWorkerOptions {
  readonly firebaseVerifier?: FirebaseVerifier;
  readonly repositoryFactory?: (env: Env) => NotificationCommandRepository;
  readonly storageFactory?: (env: Env) => HomeworkResetNotificationStorage;
  readonly now?: () => number;
}

const createHandlers = (env: Env, options: HomeworkResetNotificationWorkerOptions = {}) => createHomeworkResetNotificationHandlers({
  storage: (options.storageFactory ?? ((bindings) => new FirebaseHomeworkResetNotificationStorage(bindings)))(env),
  repository: (options.repositoryFactory ?? ((bindings) => new FirebaseRestNotificationCommandRepository({ env: {
    FIREBASE_DB_URL: required(bindings, 'FIREBASE_DB_URL'),
    FIREBASE_PROJECT_ID: required(bindings, 'FIREBASE_PROJECT_ID'),
    NOTIFICATION_COMMAND_SERVICE_IDENTITY: required(bindings, 'NOTIFICATION_COMMAND_SERVICE_IDENTITY'),
    NOTIFICATION_COMMAND_GOOGLE_SA_KEY: required(bindings, 'NOTIFICATION_COMMAND_GOOGLE_SA_KEY'),
  } as NotificationCommandRepositoryEnv })))(env),
  now: options.now,
});

export const createHomeworkResetNotificationWorker = (options: HomeworkResetNotificationWorkerOptions = {}) => {
  const verifier = options.firebaseVerifier ?? createFirebaseVerifier();
  return {
    async fetch(request: Request, env: Env): Promise<Response> {
      const url = new URL(request.url);
      if (url.pathname !== ACTION_PATH || url.search || url.hash) return response(request, { code: 'homework_reset_action_not_found' }, 404);
      const origin = request.headers.get('Origin');
      if (origin && !ALLOWED_ORIGINS.has(origin)) return response(request, { code: 'cors_origin_denied' }, 403);
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(request) });
      if (request.method !== 'POST') return response(request, { code: 'method_not_allowed' }, 405);
      const auth = await verifier.verifyAuthorizationHeader(request.headers.get('Authorization'), env);
      if (!auth.valid || typeof auth.uid !== 'string' || !auth.uid) return response(request, { code: 'homework_reset_unauthenticated' }, 401);
      const limiter = env.NOTIFICATION_RATE_LIMITER as RateLimiter | undefined;
      if (!limiter || typeof limiter.limit !== 'function') return response(request, { code: 'notification_command_unavailable' }, 503);
      if (!(await limiter.limit({ key: `homework-reset:${auth.uid}` })).success) return response(request, { code: 'rate_limited' }, 429);
      try {
        const result = await createHandlers(env, options).action({ request, uid: auth.uid });
        return response(request, result.body, result.status);
      } catch {
        return response(request, { code: 'homework_reset_action_unavailable' }, 503);
      }
    },
  };
};

/** Reads and processes at most 25 due records from the homework-reset family. */
export const retryDueHomeworkResetNotifications = async (env: Env): Promise<void> => {
  await createHandlers(env).retryDue();
};
