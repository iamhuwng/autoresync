import { createFirebaseVerifier } from '../firebase-verification.js';
import { FirebaseRtdbRestClient } from '../listening-authoring/rtdb.ts';
import {
  NotificationCommandSchemaError,
  readNotificationCommand,
} from './command-schema.ts';
import {
  FirebaseRestNotificationCommandRepository,
  type NotificationCommandRepository,
} from './repository.ts';

const COMMAND_PATH = '/book-notifications/commands';
const ALLOWED_ORIGINS = new Set([
  'https://kahut1.web.app',
  'https://hocthem.net',
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
    readonly requestedRecipientId: string;
  },
): {
  readonly homeworkId: string;
  readonly studentName: string;
  readonly sourceTitle: string;
} | null => {
  const record = asRecord(result);
  const context = asRecord(record?.context);
  const visibility = asRecord(record?.visibility);
  if (!record || !context || !visibility
    || record.resultId !== input.resultId
    || record.studentId !== input.actorUid
    || context.type !== 'homework'
    || visibility.ownershipResolved !== true
    || visibility.visibilityOwnerTeacherId !== input.requestedRecipientId) {
    return null;
  }

  const homeworkId = visibility.homeworkId;
  if (typeof homeworkId !== 'string' || !SAFE_ID.test(homeworkId)) return null;

  const studentName = typeof record.studentName === 'string' && record.studentName.trim()
    ? record.studentName.trim()
    : 'A student';
  const sourceTitle = typeof record.testTitle === 'string' && record.testTitle.trim()
    ? record.testTitle.trim()
    : typeof visibility.sourceNameSnapshot === 'string' && visibility.sourceNameSnapshot.trim()
      ? visibility.sourceNameSnapshot.trim()
      : 'Homework';

  return { homeworkId, studentName, sourceTitle };
};

const trustedClassJoin = (
  value: unknown,
  input: { readonly actorUid: string; readonly requestedRecipientId: string },
): { readonly className: string; readonly studentName: string } | null => {
  const classRecord = asRecord(value);
  const student = asRecord(asRecord(classRecord?.students)?.[input.actorUid]);
  if (!classRecord || !student
    || classRecord.status !== 'active'
    || (classRecord.createdBy !== input.requestedRecipientId && input.actorUid !== input.requestedRecipientId)
    || student.uid !== input.actorUid
    || student.status !== 'pending_approval') return null;
  return {
    className: typeof classRecord.name === 'string' && classRecord.name ? classRecord.name : String(classRecord.classCode || classRecord.id),
    studentName: typeof student.name === 'string' && student.name ? student.name : 'Student',
  };
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
  const now = options.now ?? Date.now;

  return {
    async fetch(request: Request, env: WorkerEnv): Promise<Response> {
      const url = new URL(request.url);
      if (url.pathname !== COMMAND_PATH || url.search || url.hash) {
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
        key: `homework-submission:${auth.uid}`,
      });
      if (!limited.success) {
        return json(request, { code: 'rate_limited' }, 429);
      }

      try {
        const command = await readNotificationCommand(request);
        if (command.producerFamily !== 'homework' && command.producerFamily !== 'class') {
          return json(request, { code: 'notification_command_recipient_forbidden' }, 403);
        }
        if (command.producerFamily === 'class') {
          const canonical = trustedClassJoin(
            await readDatabaseValue(env, `classes/${command.authority.recordId}`),
            { actorUid: auth.uid, requestedRecipientId: command.recipientId },
          );
          if (!canonical) return json(request, { code: 'notification_command_recipient_forbidden' }, 403);
          const studentRecipient = command.recipientId === auth.uid;
          const expectedOperationId = studentRecipient
            ? notificationOperationId(`class-join-pending:student:${command.authority.recordId}:${auth.uid}:${auth.uid}`)
            : notificationOperationId(`class-join-pending:teacher:${command.authority.recordId}:${auth.uid}:${command.recipientId}`);
          const expectedTitle = studentRecipient ? '🏫 Joined Class — Pending Approval' : '👋 New Student Request';
          const expectedMessage = studentRecipient
            ? `You've requested to join ${canonical.className}. Waiting for teacher approval.`
            : `${canonical.studentName} wants to join your class "${canonical.className}". Review in class management.`;
          const expectedLink = studentRecipient ? '/student/dashboard' : `/teacher/classes/${command.authority.recordId}`;
          if (command.operationId !== expectedOperationId
            || command.notification.type !== 'info'
            || command.notification.title !== expectedTitle
            || command.notification.message !== expectedMessage
            || command.notification.link !== expectedLink) {
            return json(request, { code: 'notification_command_content_forbidden' }, 403);
          }
        } else {
          const canonical = trustedHomeworkSubmission(
            await readDatabaseValue(env, `test_results/${command.authority.recordId}`),
            {
              resultId: command.authority.recordId,
              actorUid: auth.uid,
              requestedRecipientId: command.recipientId,
            },
          );
          if (!canonical) return json(request, { code: 'notification_command_recipient_forbidden' }, 403);
          if (command.operationId !== notificationOperationId(
            `homework-submitted:teacher:${command.authority.recordId}:${command.recipientId}`,
          ) || command.notification.type !== 'info'
            || command.notification.title !== 'Homework Submitted'
            || command.notification.message !== `${canonical.studentName} submitted "${canonical.sourceTitle}".`
            || command.notification.link !== `/teacher/homework/${canonical.homeworkId}`) {
            return json(request, { code: 'notification_command_content_forbidden' }, 403);
          }
        }

        const result = await repositoryFactory(env).create({
          operationId: command.operationId,
          recipientId: command.recipientId,
          notification: command.notification,
          now: now(),
        });
        return json(request, {
          status: result.status,
          operationId: command.operationId,
          notificationId: result.notificationId,
        }, result.status === 'idempotency-conflict' ? 409 : 200);
      } catch (error) {
        if (error instanceof NotificationCommandSchemaError) {
          return json(request, { code: error.code }, error.status);
        }
        return json(request, { code: 'notification_command_failed' }, 500);
      }
    },
  };
};
