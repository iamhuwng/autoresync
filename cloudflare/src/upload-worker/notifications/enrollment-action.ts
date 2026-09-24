import { buildRoute } from '../../../../src/constants/routes.ts';
import type { NotificationCommandRepository } from './repository.ts';

const ID = /^[A-Za-z0-9_-]{1,128}$/u;
const RETRY_DELAY_MS = 60 * 60 * 1000;
export const ENROLLMENT_INTENT_DONE_DUE_AT = 8_640_000_000_000_000;

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue | null => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as RecordValue
    : null
);

export interface EnrollmentActionCommand {
  readonly schemaVersion: 1;
  readonly actionId: string;
}

export interface CourseRequestNotificationIntent {
  readonly schemaVersion: 1;
  readonly actionId: string;
  readonly kind: 'course-request-decision';
  readonly occurredAt: number;
  readonly dueAt: number;
  readonly attempts: 0 | 1 | 2;
  readonly state: 'pending' | 'sending' | 'retry_due' | 'retrying' | 'done' | 'failed';
}

export interface CourseRequestNotificationStorage {
  read(path: string): Promise<unknown>;
  updateIntent(requestId: string, intent: CourseRequestNotificationIntent): Promise<void>;
  claimImmediate(requestId: string, now: number): Promise<CourseRequestNotificationIntent | null>;
  dueRequests(now: number, limit?: number): Promise<Array<{
    readonly requestId: string;
    readonly intent: CourseRequestNotificationIntent;
  }>>;
  claimRetry(requestId: string, now: number): Promise<CourseRequestNotificationIntent | null>;
  notificationExists(requestId: string, intent: CourseRequestNotificationIntent): Promise<boolean>;
  reportFailure(requestId: string, intent: CourseRequestNotificationIntent): Promise<void>;
}

export const parseEnrollmentAction = async (request: Request): Promise<EnrollmentActionCommand> => {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new Error('enrollment_action_content_type_required');
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 1024) throw new Error('enrollment_action_body_too_large');
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error('enrollment_action_invalid_json'); }
  const value = record(parsed);
  if (!value || Object.keys(value).sort().join(',') !== 'actionId,schemaVersion'
    || value.schemaVersion !== 1 || typeof value.actionId !== 'string'
    || !ID.test(value.actionId) || request.headers.get('Idempotency-Key') !== value.actionId) {
    throw new Error('enrollment_action_invalid');
  }
  return value as unknown as EnrollmentActionCommand;
};

const hash32 = (value: string, seed: number): number => {
  let hash = (2166136261 ^ seed) >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619) >>> 0;
  }
  return hash;
};

export const courseRequestNotificationId = (actionId: string, recipientId: string): string => {
  const value = `${actionId}:${recipientId}`;
  const hex = [0, 1, 2, 3]
    .map((seed) => hash32(`${value}:${seed}`, seed).toString(16).padStart(8, '0'))
    .join('');
  const versioned = `${hex.slice(0, 12)}5${hex.slice(13, 16)}8${hex.slice(17)}`;
  return `${versioned.slice(0, 8)}-${versioned.slice(8, 12)}-${versioned.slice(12, 16)}-${versioned.slice(16, 20)}-${versioned.slice(20)}`;
};

const validIntent = (
  request: RecordValue,
  requestId: string,
): CourseRequestNotificationIntent | null => {
  const intent = record(request.notificationIntent);
  if (!intent || intent.schemaVersion !== 1 || intent.actionId !== requestId
    || intent.kind !== 'course-request-decision' || intent.occurredAt !== request.processedAt
    || typeof intent.dueAt !== 'number'
    || typeof intent.attempts !== 'number' || ![0, 1, 2].includes(intent.attempts)
    || !['pending', 'sending', 'retry_due', 'retrying', 'done', 'failed'].includes(String(intent.state))) return null;
  if (intent.attempts === 0 && (intent.state !== 'pending'
    || intent.dueAt !== Number(request.processedAt) + RETRY_DELAY_MS)) return null;
  if (intent.attempts > 0 && intent.dueAt < Number(request.processedAt) + RETRY_DELAY_MS) return null;
  return intent as unknown as CourseRequestNotificationIntent;
};

const noticeFor = (
  request: RecordValue,
  course: RecordValue,
  intent: CourseRequestNotificationIntent,
) => {
  if (typeof request.studentId !== 'string' || !ID.test(request.studentId)
    || (request.type !== 'join' && request.type !== 'unenroll')
    || (request.status !== 'approved' && request.status !== 'denied')
    || typeof course.name !== 'string' || !course.name.trim()) return null;
  const approved = request.status === 'approved';
  const verb = request.type === 'join' ? 'join' : 'leave';
  const title = approved ? 'Course Request Approved' : 'Course Request Declined';
  const message = `Your request to ${verb} "${course.name.trim().slice(0, 120)}" was ${approved ? 'approved' : 'declined'}.`;
  return {
    operationId: courseRequestNotificationId(intent.actionId, request.studentId),
    recipientId: request.studentId,
    notification: {
      type: (approved ? 'success' : 'info') as const,
      title,
      message,
      link: buildRoute('STUDENT_COURSES'),
    },
  };
};

export const deliverCourseRequestIntent = async (
  request: RecordValue,
  course: RecordValue,
  intent: CourseRequestNotificationIntent,
  repository: NotificationCommandRepository,
): Promise<'delivered' | 'conflict' | 'unavailable' | 'invalid'> => {
  const notice = noticeFor(request, course, intent);
  if (!notice) return 'invalid';
  try {
    const result = await repository.create({ ...notice, now: intent.occurredAt });
    return result.status === 'idempotency-conflict' ? 'conflict' : 'delivered';
  } catch {
    return 'unavailable';
  }
};

export const performEnrollmentAction = async (input: {
  readonly command: EnrollmentActionCommand;
  readonly actorUid: string;
  readonly storage: CourseRequestNotificationStorage;
  readonly repository: () => NotificationCommandRepository;
  readonly now?: () => number;
}): Promise<{ status: number; body: Record<string, unknown> }> => {
  const request = record(await input.storage.read(`course_requests/${input.command.actionId}`));
  if (!request) return { status: 404, body: { code: 'course_request_not_found' } };
  const intent = validIntent(request, input.command.actionId);
  const courseId = request.courseId;
  if (request.id !== input.command.actionId || !intent || typeof courseId !== 'string' || !ID.test(courseId)
    || typeof request.studentId !== 'string' || !ID.test(request.studentId)
    || typeof request.expiresAt !== 'number' || typeof request.processedAt !== 'number'
    || request.processedAt > request.expiresAt
    || request.processedAt > (input.now ?? Date.now)()
    || typeof request.teacherId !== 'string' || typeof request.processedBy !== 'string'
    || (request.status !== 'approved' && request.status !== 'denied')) {
    return { status: 409, body: { code: 'course_request_action_not_committed' } };
  }
  if (request.processedBy !== input.actorUid) {
    return { status: 403, body: { code: 'course_request_actor_forbidden' } };
  }
  const [course, actor, student] = await Promise.all([
    input.storage.read(`courses/${courseId}`).then(record),
    input.storage.read(`users/${input.actorUid}`).then(record),
    input.storage.read(`users/${request.studentId}`).then(record),
  ]);
  if (!course || !actor || course.ownerId !== request.teacherId
    || !student || student.role !== 'student'
    || (input.actorUid !== course.ownerId && actor.role !== 'super_admin')) {
    return { status: 403, body: { code: 'course_request_owner_forbidden' } };
  }
  if (intent.state === 'done') {
    return { status: 200, body: { status: 'replayed', actionId: intent.actionId, notificationStatus: 'delivered' } };
  }
  if (intent.state !== 'pending' || intent.attempts !== 0) {
    return { status: 200, body: { status: 'replayed', actionId: intent.actionId, notificationStatus: intent.state } };
  }
  const claimed = await input.storage.claimImmediate(input.command.actionId, (input.now ?? Date.now)());
  if (!claimed) {
    return { status: 200, body: { status: 'replayed', actionId: intent.actionId, notificationStatus: 'sending' } };
  }
  let delivery: 'delivered' | 'conflict' | 'unavailable' | 'invalid' = 'unavailable';
  try {
    delivery = await deliverCourseRequestIntent(request, course, claimed, input.repository());
  } catch {
    // Keep the saved action successful; the intent is already due for the later pass.
  }
  try {
    await input.storage.updateIntent(input.command.actionId, {
      ...claimed,
      state: delivery === 'delivered' ? 'done' : 'retry_due',
      dueAt: delivery === 'delivered' ? ENROLLMENT_INTENT_DONE_DUE_AT : (input.now ?? Date.now)() + RETRY_DELAY_MS,
    });
  } catch {
    // Stable inbox identity keeps a scheduled replay safe after a lost acknowledgement.
  }
  return {
    status: 200,
    body: { status: 'committed', actionId: intent.actionId, notificationStatus: delivery === 'delivered' ? 'delivered' : 'retry_due' },
  };
};

export const retryDueCourseRequestNotifications = async (
  storage: CourseRequestNotificationStorage,
  repository: NotificationCommandRepository,
  now = Date.now(),
): Promise<void> => {
  for (const row of await storage.dueRequests(now)) {
    if (row.intent.state === 'retrying' && row.intent.attempts === 2) {
      const delivered = await storage.notificationExists(row.requestId, row.intent);
      if (!delivered) await storage.reportFailure(row.requestId, row.intent);
      await storage.updateIntent(row.requestId, { ...row.intent,
        state: delivered ? 'done' : 'failed', dueAt: ENROLLMENT_INTENT_DONE_DUE_AT });
      continue;
    }
    const claimed = await storage.claimRetry(row.requestId, now);
    if (!claimed) continue;
    const request = record(await storage.read(`course_requests/${row.requestId}`));
    const courseId = request?.courseId;
    const course = typeof courseId === 'string' ? record(await storage.read(`courses/${courseId}`)) : null;
    const studentId = request?.studentId;
    const student = typeof studentId === 'string' ? record(await storage.read(`users/${studentId}`)) : null;
    let delivery: 'delivered' | 'conflict' | 'unavailable' | 'invalid' = 'invalid';
    if (request && request.id === row.requestId && course && student?.role === 'student'
      && course.ownerId === request.teacherId && typeof request.processedAt === 'number'
      && typeof request.expiresAt === 'number' && request.processedAt <= request.expiresAt
      && typeof request.processedBy === 'string' && validIntent(request, row.requestId)) {
      delivery = await deliverCourseRequestIntent(request, course, claimed, repository);
    }
    const delivered = delivery === 'delivered';
    if (!delivered && claimed.attempts === 2) await storage.reportFailure(row.requestId, claimed);
    await storage.updateIntent(row.requestId, {
      ...claimed,
      state: delivered ? 'done' : claimed.attempts === 1 ? 'retry_due' : 'failed',
      dueAt: delivered || claimed.attempts === 2
        ? ENROLLMENT_INTENT_DONE_DUE_AT
        : now + RETRY_DELAY_MS,
    });
    if (delivery === 'unavailable') break;
  }
};
