import { createFirebaseVerifier } from '../firebase-verification.js';
import {
  FirebaseRestNotificationCommandRepository,
  type NotificationCommandRepository,
  type NotificationCommandRepositoryEnv,
} from './repository.ts';
import {
  parseManualGradeCommand,
  performManualGradeAction,
  retryDueGradeNotifications,
  type GradeNotificationStorage,
} from './grade-notification-action.ts';
import { FirebaseGradeNotificationStorage } from './grade-notification-action-store.ts';

const ACTION_PATH = '/grading-notifications/manual';
const ALLOWED_ORIGINS = new Set(['https://kahut1.web.app', 'http://localhost:5173', 'http://localhost:5174']);
type WorkerEnv = Readonly<Record<string, unknown>>;
type FirebaseVerifier = ReturnType<typeof createFirebaseVerifier>;
type RateLimiter = { limit(input: { key: string }): Promise<{ success: boolean }> | { success: boolean } };

const required = (env: WorkerEnv, key: string): string => {
  const value = env[key];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`missing_${key.toLowerCase()}`);
  return value.trim();
};
const response = (request: Request, body: Record<string, unknown>, status: number): Response => {
  const headers = new Headers({
    'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8',
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
const repositoryForEnv = (env: WorkerEnv): NotificationCommandRepository => new FirebaseRestNotificationCommandRepository({
  env: {
    FIREBASE_DB_URL: required(env, 'FIREBASE_DB_URL'),
    FIREBASE_PROJECT_ID: required(env, 'FIREBASE_PROJECT_ID'),
    NOTIFICATION_COMMAND_SERVICE_IDENTITY: required(env, 'NOTIFICATION_COMMAND_SERVICE_IDENTITY'),
    NOTIFICATION_COMMAND_GOOGLE_SA_KEY: required(env, 'NOTIFICATION_COMMAND_GOOGLE_SA_KEY'),
  } as NotificationCommandRepositoryEnv,
});

export interface GradeNotificationWorkerOptions {
  readonly firebaseVerifier?: FirebaseVerifier;
  readonly repositoryFactory?: (env: WorkerEnv) => NotificationCommandRepository;
  readonly storageFactory?: (env: WorkerEnv) => GradeNotificationStorage;
  readonly now?: () => number;
}

export const createGradeNotificationWorker = (options: GradeNotificationWorkerOptions = {}) => {
  const verifier = options.firebaseVerifier ?? createFirebaseVerifier();
  const repositoryFactory = options.repositoryFactory ?? repositoryForEnv;
  const storageFactory = options.storageFactory ?? (env => new FirebaseGradeNotificationStorage(env));
  const now = options.now ?? Date.now;
  return {
    async fetch(request: Request, env: WorkerEnv): Promise<Response> {
      const url = new URL(request.url);
      if (url.pathname !== ACTION_PATH || url.search || url.hash) return response(request, { code: 'grade_notification_not_found' }, 404);
      const origin = request.headers.get('Origin');
      if (origin && !ALLOWED_ORIGINS.has(origin)) return response(request, { code: 'cors_origin_denied' }, 403);
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: response(request, {}, 200).headers });
      if (request.method !== 'POST') return response(request, { code: 'method_not_allowed' }, 405);
      const auth = await verifier.verifyAuthorizationHeader(request.headers.get('Authorization'), env);
      if (!auth.valid || typeof auth.uid !== 'string' || !auth.uid) return response(request, { code: 'grade_notification_unauthenticated' }, 401);
      const limiter = env.NOTIFICATION_RATE_LIMITER as RateLimiter | undefined;
      if (!limiter || typeof limiter.limit !== 'function') return response(request, { code: 'notification_command_unavailable' }, 503);
      if (!(await limiter.limit({ key: `manual-grade:${auth.uid}` })).success) return response(request, { code: 'rate_limited' }, 429);
      try {
        const command = await parseManualGradeCommand(request);
        const result = await performManualGradeAction({
          command, actorUid: auth.uid, storage: storageFactory(env), repository: repositoryFactory(env), now,
        });
        return response(request, result.body, result.status);
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('grade_notification_')) {
          return response(request, { code: error.message }, 400);
        }
        return response(request, { code: 'grade_notification_failed' }, 500);
      }
    },
  };
};

export const retryDueGradeNotificationsForEnv = (env: WorkerEnv, now: () => number = Date.now): Promise<void> =>
  retryDueGradeNotifications({
    storage: new FirebaseGradeNotificationStorage(env), repository: repositoryForEnv(env), now,
  });
