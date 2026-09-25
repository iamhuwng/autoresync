import { createFirebaseVerifier } from '../firebase-verification.js';
import { FirebaseRtdbRestClient } from '../listening-authoring/rtdb.ts';
import { NotificationCommandSchemaError } from './command-schema.ts';
import {
  FirebaseRestNotificationCommandRepository,
  type NotificationCommandRepository,
} from './repository.ts';
import { parseClassAction, performClassAction, type ClassActionStorage } from './class-action.ts';
import { FirebaseClassActionStorage } from './class-action-store.ts';
import { hasCommittedHomeworkNotification, markHomeworkNotificationDelivered } from './homework-retry.ts';
import { buildRoute } from '../../../../src/constants/routes.ts';
import {
  createCourseTypeDecisionHandlers,
  readCourseTypeDecisionDispatchRequest,
} from './course-type-decision-delivery.ts';
import { FirebaseCourseTypeDecisionStorage } from './course-type-decision-store.ts';
import { handleDeadlineNotificationAction } from './deadline-notification-worker.ts';
import { parseEnrollmentAction, performEnrollmentAction } from './enrollment-action.ts';
import { FirebaseCourseRequestNotificationStorage } from './enrollment-action-store.ts';
import { parseAssignmentAction, performAssignmentAction } from './assignment-action.ts';
import { FirebaseAssignmentNotificationStorage } from './assignment-action-store.ts';

const COMMAND_PATH = '/book-notifications/commands';
const CLASS_ACTION_PATH = '/class-notifications/actions';
const COURSE_TYPE_PATH = '/notifications/course-type-decisions/dispatch';
const DEADLINE_ACTION_PATH = '/deadline-notifications/actions';
const ENROLLMENT_ACTION_PATH = '/enrollment-notifications/actions';
const ASSIGNMENT_ACTION_PATH = '/assignment-notifications/actions';
const ALLOWED_ORIGINS = new Set([
  'https://kahut1.web.app',
  'http://localhost:5173',
  'http://localhost:5174',
]);
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/u;

type WorkerEnv = Readonly<Record<string, unknown>>;
type FirebaseVerifier = ReturnType<typeof createFirebaseVerifier>;
type RateLimiter = {
  limit(input: { key: string }): Promise<{ success: boolean }> | { success: boolean };
};

export interface HomeworkSubmissionNotificationWorkerOptions {
  readonly firebaseVerifier?: FirebaseVerifier;
  readonly repositoryFactory?: (env: WorkerEnv) => NotificationCommandRepository;
  readonly readDatabaseValue?: (env: WorkerEnv, path: string) => Promise<unknown>;
  readonly classStorageFactory?: (env: WorkerEnv) => ClassActionStorage;
  readonly hasCommittedIntent?: typeof hasCommittedHomeworkNotification;
  readonly markDelivered?: typeof markHomeworkNotificationDelivered;
  readonly now?: () => number;
}

const stringBinding = (env: WorkerEnv, name: string): string | null => {
  const value = env[name];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
};

const corsHeaders = (request: Request): Headers => {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    Vary: 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers',
  });
  const origin = request.headers.get('Origin');
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set(
      'Access-Control-Allow-Headers',
      'Authorization, Content-Type, Idempotency-Key',
    );
  }
  return headers;
};

const json = (
  request: Request,
  body: Record<string, unknown>,
  status: number,
): Response => {
  const headers = corsHeaders(request);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(body), { status, headers });
};

const hash32 = (value: string, seed: number): number => {
  let hash = (2166136261 ^ seed) >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619) >>> 0;
  }
  return hash;
};

const notificationOperationId = (operationKey: string): string => {
  const hex = [0, 1, 2, 3]
    .map((seed) => hash32(`${operationKey}:${seed}`, seed).toString(16).padStart(8, '0'))
    .join('');
  const versioned = `${hex.slice(0, 12)}5${hex.slice(13, 16)}8${hex.slice(17)}`;
  return `${versioned.slice(0, 8)}-${versioned.slice(8, 12)}-${versioned.slice(12, 16)}-${versioned.slice(16, 20)}-${versioned.slice(20)}`;
};

const defaultRepositoryFactory = (env: WorkerEnv): NotificationCommandRepository => {
  const databaseUrl = stringBinding(env, 'FIREBASE_DB_URL');
  const projectId = stringBinding(env, 'FIREBASE_PROJECT_ID');
  const serviceIdentity = stringBinding(env, 'NOTIFICATION_COMMAND_SERVICE_IDENTITY');
  const serviceKey = stringBinding(env, 'NOTIFICATION_COMMAND_GOOGLE_SA_KEY');
  if (!databaseUrl || !projectId || !serviceIdentity || !serviceKey) {
    throw new Error('notification_command_runtime_unavailable');
  }
  return new FirebaseRestNotificationCommandRepository({
    env: {
      FIREBASE_DB_URL: databaseUrl,
      FIREBASE_PROJECT_ID: projectId,
      NOTIFICATION_COMMAND_SERVICE_IDENTITY: serviceIdentity,
      NOTIFICATION_COMMAND_GOOGLE_SA_KEY: serviceKey,
    },
  });
};

const defaultReadDatabaseValue = async (env: WorkerEnv, path: string): Promise<unknown> => {
  const databaseUrl = stringBinding(env, 'FIREBASE_DB_URL');
  const projectId = stringBinding(env, 'FIREBASE_PROJECT_ID');
  const serviceKey = stringBinding(env, 'NOTIFICATION_COMMAND_GOOGLE_SA_KEY');
  if (!databaseUrl || !projectId || !serviceKey) {
    throw new Error('notification_command_runtime_unavailable');
  }
  const client = new FirebaseRtdbRestClient({
    env: {
      FIREBASE_DB_URL: databaseUrl,
      FIREBASE_PROJECT_ID: projectId,
      GOOGLE_SA_KEY: serviceKey,
    },
    fetchImpl: globalThis.fetch,
  });
  return client.readValue(path);
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const trustedHomeworkSubmission = (
  result: unknown,
  input: {
    readonly resultId: string;
    readonly actorUid: string;
  },
): {
  readonly homeworkId: string;
  readonly teacherId: string;
} | null => {
  const record = asRecord(result);
  const context = asRecord(record?.context);
  const visibility = asRecord(record?.visibility);
  if (!record || !context || !visibility
    || record.resultId !== input.resultId
    || record.studentId !== input.actorUid
    || context.type !== 'homework'
    || visibility.ownershipResolved !== true
    || typeof visibility.visibilityOwnerTeacherId !== 'string'
    || !SAFE_ID.test(visibility.visibilityOwnerTeacherId)) {
    return null;
  }

  const homeworkId = visibility.homeworkId;
  if (typeof homeworkId !== 'string' || !SAFE_ID.test(homeworkId)) return null;

  return { homeworkId, teacherId: visibility.visibilityOwnerTeacherId };
};

const readCommittedEvent = async (request: Request): Promise<string> => {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new NotificationCommandSchemaError('content_type_required');
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > 1024) {
    throw new NotificationCommandSchemaError('notification_command_body_too_large', 413);
  }
  let body: unknown;
  try { body = JSON.parse(text); } catch { throw new NotificationCommandSchemaError('notification_command_invalid_json'); }
  const event = asRecord(body);
  if (!event || Object.keys(event).sort().join(',') !== 'eventKind,recordId,schemaVersion'
    || event.schemaVersion !== 1 || event.eventKind !== 'homework-submitted'
    || typeof event.recordId !== 'string' || !SAFE_ID.test(event.recordId)) {
    throw new NotificationCommandSchemaError('notification_command_invalid');
  }
  return event.recordId;
};

const limiterFrom = (env: WorkerEnv): RateLimiter | null => {
  const value = env.NOTIFICATION_RATE_LIMITER;
  if (!value || typeof value !== 'object' || !('limit' in value)) return null;
  const limit = (value as { limit?: unknown }).limit;
  return typeof limit === 'function' ? value as RateLimiter : null;
};

export const createHomeworkSubmissionNotificationWorker = (
  options: HomeworkSubmissionNotificationWorkerOptions = {},
) => {
  const firebaseVerifier = options.firebaseVerifier ?? createFirebaseVerifier();
  const repositoryFactory = options.repositoryFactory ?? defaultRepositoryFactory;
  const readDatabaseValue = options.readDatabaseValue ?? defaultReadDatabaseValue;
  const classStorageFactory = options.classStorageFactory ?? ((env: WorkerEnv) => new FirebaseClassActionStorage(env));
  const hasCommittedIntent = options.hasCommittedIntent ?? hasCommittedHomeworkNotification;
  const markDelivered = options.markDelivered ?? markHomeworkNotificationDelivered;
  const now = options.now ?? Date.now;

  return {
    async fetch(request: Request, env: WorkerEnv): Promise<Response> {
      const url = new URL(request.url);
      if ((url.pathname !== COMMAND_PATH && url.pathname !== CLASS_ACTION_PATH
        && url.pathname !== COURSE_TYPE_PATH && url.pathname !== DEADLINE_ACTION_PATH
        && url.pathname !== ENROLLMENT_ACTION_PATH && url.pathname !== ASSIGNMENT_ACTION_PATH)
        || url.search || url.hash) {
        return json(request, { code: 'notification_command_not_found' }, 404);
      }

      const origin = request.headers.get('Origin');
      if (origin && !ALLOWED_ORIGINS.has(origin)) {
        return json(request, { code: 'cors_origin_denied' }, 403);
      }
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders(request) });
      }
      if (request.method !== 'POST') {
        return json(request, { code: 'method_not_allowed' }, 405);
      }

      const auth = await firebaseVerifier.verifyAuthorizationHeader(
        request.headers.get('Authorization'),
        env,
      );
      if (!auth.valid || typeof auth.uid !== 'string' || !auth.uid) {
        return json(request, { code: 'notification_command_unauthenticated' }, 401);
      }

      const limiter = limiterFrom(env);
      if (!limiter) {
        return json(request, { code: 'notification_command_unavailable' }, 503);
      }
      const limited = await limiter.limit({
        key: `${url.pathname === CLASS_ACTION_PATH ? 'class-action'
          : url.pathname === COURSE_TYPE_PATH ? 'course-type-decision'
            : url.pathname === DEADLINE_ACTION_PATH ? 'deadline-reminder'
              : url.pathname === ENROLLMENT_ACTION_PATH ? 'enrollment-decision'
                : url.pathname === ASSIGNMENT_ACTION_PATH ? 'assignment-approval' : 'homework-submission'}:${auth.uid}`,
      });
      if (!limited.success) {
        return json(request, { code: 'rate_limited' }, 429);
      }

      try {
        if (url.pathname === ENROLLMENT_ACTION_PATH) {
          const command = await parseEnrollmentAction(request);
          const result = await performEnrollmentAction({
            command, actorUid: auth.uid,
            storage: new FirebaseCourseRequestNotificationStorage(env),
            repository: () => repositoryFactory(env), now,
          });
          return json(request, result.body, result.status);
        }
        if (url.pathname === ASSIGNMENT_ACTION_PATH) {
          const command = await parseAssignmentAction(request);
          const result = await performAssignmentAction({
            command, actorUid: auth.uid,
            storage: new FirebaseAssignmentNotificationStorage(env),
            repository: () => repositoryFactory(env), now,
          });
          return json(request, result.body, result.status);
        }
        if (url.pathname === DEADLINE_ACTION_PATH) {
          const result = await handleDeadlineNotificationAction(request, env, auth.uid);
          return json(request, result.body, result.init.status ?? 200);
        }
        if (url.pathname === COURSE_TYPE_PATH) {
          const command = await readCourseTypeDecisionDispatchRequest(request);
          const handlers = createCourseTypeDecisionHandlers({
            storage: new FirebaseCourseTypeDecisionStorage(env),
            repository: repositoryFactory(env),
            now,
          });
          const result = await handlers.dispatch({ requestId: command.requestId, actorUid: auth.uid });
          const status = result.status === 'forbidden' ? 403
            : result.status === 'not_found' ? 404
              : result.status === 'stale' ? 409 : 200;
          return json(request, result, status);
        }
        if (url.pathname === CLASS_ACTION_PATH) {
          const command = await parseClassAction(request);
          const result = await performClassAction({
            command,
            actorUid: auth.uid,
            storage: classStorageFactory(env),
            repository: () => repositoryFactory(env),
            now,
          });
          return json(request, result.body, result.status);
        }
        const recordId = await readCommittedEvent(request);
        const canonical = trustedHomeworkSubmission(
          await readDatabaseValue(env, `test_results/${recordId}`),
          {
            resultId: recordId,
            actorUid: auth.uid,
          },
        );
        if (!canonical) {
          return json(request, { code: 'notification_command_recipient_forbidden' }, 403);
        }

        if (!await hasCommittedIntent(env, {
          resultId: recordId, studentId: auth.uid,
          teacherId: canonical.teacherId, homeworkId: canonical.homeworkId,
        })) {
          return json(request, { code: 'notification_command_intent_missing' }, 403);
        }
        const operationId = notificationOperationId(`homework-submitted:teacher:${recordId}:${canonical.teacherId}`);
        const result = await repositoryFactory(env).create({
          operationId,
          recipientId: canonical.teacherId,
          notification: {
            type: 'info', title: 'Homework Submitted', message: 'A student submitted homework.',
            link: buildRoute('TEACHER_HOMEWORK_DETAIL', { homeworkId: canonical.homeworkId }),
          },
          now: now(),
        });
        if (result.status !== 'idempotency-conflict') {
          try {
            await markDelivered(env, {
              resultId: recordId,
              studentId: auth.uid,
              teacherId: canonical.teacherId,
              homeworkId: canonical.homeworkId,
            });
          } catch (error) {
            console.warn('Homework notification delivery marker deferred to retry:', error);
          }
        }
        return json(request, {
          status: result.status,
          operationId,
          notificationId: result.notificationId,
        }, result.status === 'idempotency-conflict' ? 409 : 200);
      } catch (error) {
        if (error instanceof Error && (
          error.message === 'content_type_required'
          || error.message.startsWith('class_action_')
          || error.message.startsWith('course_type_notification_')
          || error.message.startsWith('enrollment_action_')
          || error.message.startsWith('assignment_action_')
        )) {
          return json(request, { code: error.message }, 400);
        }
        if (error instanceof NotificationCommandSchemaError) {
          return json(request, { code: error.code }, error.status);
        }
        return json(request, { code: 'notification_command_failed' }, 500);
      }
    },
  };
};
