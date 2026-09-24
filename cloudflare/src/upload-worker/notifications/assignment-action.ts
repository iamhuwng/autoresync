import { buildRoute } from '../../../../src/constants/routes.ts';
import type { NotificationCommandRepository } from './repository.ts';

const ID = /^[A-Za-z0-9_-]{1,128}$/u;
const RETRY_DELAY_MS = 60 * 60 * 1000;
export const ASSIGNMENT_INTENT_DONE_DUE_AT = 8_640_000_000_000_000;
type Row = Record<string, unknown>;
const row = (value: unknown): Row | null => value && typeof value === 'object' && !Array.isArray(value)
  ? value as Row : null;

export interface AssignmentActionCommand { readonly schemaVersion: 1; readonly actionId: string }
export interface AssignmentNotificationIntent {
  readonly schemaVersion: 1;
  readonly actionId: string;
  readonly kind: 'assignment-request-approved';
  readonly occurredAt: number;
  readonly dueAt: number;
  readonly attempts: 0 | 1 | 2;
  readonly state: 'pending' | 'sending' | 'retry_due' | 'retrying' | 'done' | 'failed';
}
export interface AssignmentNotificationStorage {
  read(path: string): Promise<unknown>;
  updateIntent(id: string, intent: AssignmentNotificationIntent): Promise<void>;
  claimImmediate(id: string, now: number): Promise<AssignmentNotificationIntent | null>;
  dueRequests(now: number, limit?: number): Promise<Array<{ requestId: string; intent: AssignmentNotificationIntent }>>;
  claimRetry(id: string, now: number): Promise<AssignmentNotificationIntent | null>;
  notificationsExist(requestId: string, intent: AssignmentNotificationIntent): Promise<boolean>;
  reportFailure(requestId: string, intent: AssignmentNotificationIntent): Promise<void>;
}

export const parseAssignmentAction = async (request: Request): Promise<AssignmentActionCommand> => {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) throw new Error('assignment_action_content_type_required');
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > 1024) throw new Error('assignment_action_body_too_large');
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error('assignment_action_invalid_json'); }
  const value = row(parsed);
  if (!value || Object.keys(value).sort().join(',') !== 'actionId,schemaVersion'
    || value.schemaVersion !== 1 || typeof value.actionId !== 'string' || !ID.test(value.actionId)
    || request.headers.get('Idempotency-Key') !== value.actionId) throw new Error('assignment_action_invalid');
  return value as unknown as AssignmentActionCommand;
};

const hash32 = (value: string, seed: number): number => {
  let hash = (2166136261 ^ seed) >>> 0;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619) >>> 0;
  return hash;
};
export const assignmentNotificationId = (actionId: string, recipientId: string): string => {
  const value = `${actionId}:${recipientId}`;
  const hex = [0, 1, 2, 3].map(seed => hash32(`${value}:${seed}`, seed).toString(16).padStart(8, '0')).join('');
  const v = `${hex.slice(0, 12)}5${hex.slice(13, 16)}8${hex.slice(17)}`;
  return `${v.slice(0, 8)}-${v.slice(8, 12)}-${v.slice(12, 16)}-${v.slice(16, 20)}-${v.slice(20)}`;
};

const validIntent = (request: Row, id: string): AssignmentNotificationIntent | null => {
  const intent = row(request.notificationIntent);
  if (!intent || intent.schemaVersion !== 1 || intent.actionId !== id || intent.kind !== 'assignment-request-approved'
    || intent.occurredAt !== request.reviewedAt || typeof intent.dueAt !== 'number'
    || ![0, 1, 2].includes(Number(intent.attempts))
    || !['pending', 'sending', 'retry_due', 'retrying', 'done', 'failed'].includes(String(intent.state))) return null;
  if (intent.attempts === 0 && (intent.state !== 'pending' || intent.dueAt !== Number(request.reviewedAt) + RETRY_DELAY_MS)) return null;
  if (intent.attempts > 0 && intent.dueAt < Number(request.reviewedAt) + RETRY_DELAY_MS) return null;
  return intent as unknown as AssignmentNotificationIntent;
};

const noticesFor = (request: Row, student: Row, teacher: Row, intent: AssignmentNotificationIntent) => {
  if (request.status !== 'approved' || typeof request.studentId !== 'string' || typeof request.teacherId !== 'string'
    || !ID.test(request.studentId) || !ID.test(request.teacherId)) return null;
  const studentName = (typeof student.displayName === 'string' && student.displayName.trim())
    || (typeof student.email === 'string' && student.email.trim()) || 'student';
  const teacherName = (typeof teacher.displayName === 'string' && teacher.displayName.trim())
    || (typeof teacher.email === 'string' && teacher.email.trim()) || 'your teacher';
  return [
    { recipientId: request.teacherId, type: 'success' as const, title: 'Student Request Approved',
      message: `Your request for student ${studentName.slice(0, 100)} has been approved.`, link: buildRoute('TEACHER_STUDENTS') },
    { recipientId: request.studentId, type: 'info' as const, title: 'New Teacher Assigned',
      message: `You have been assigned to ${teacherName.slice(0, 100)}.`, link: buildRoute('STUDENT_DASHBOARD') },
  ].map(({ recipientId, ...notification }) => ({
    recipientId,
    operationId: assignmentNotificationId(intent.actionId, recipientId),
    notification,
  }));
};

const deliver = async (request: Row, student: Row, teacher: Row, intent: AssignmentNotificationIntent,
  repository: NotificationCommandRepository): Promise<'delivered' | 'conflict' | 'unavailable' | 'invalid'> => {
  const notices = noticesFor(request, student, teacher, intent);
  if (!notices) return 'invalid';
  try {
    for (const notice of notices) {
      const result = await repository.create({ ...notice, now: intent.occurredAt });
      if (result.status === 'idempotency-conflict') return 'conflict';
    }
    return 'delivered';
  } catch { return 'unavailable'; }
};

export const performAssignmentAction = async (input: {
  command: AssignmentActionCommand; actorUid: string; storage: AssignmentNotificationStorage;
  repository: () => NotificationCommandRepository; now?: () => number;
}): Promise<{ status: number; body: Row }> => {
  const id = input.command.actionId;
  const request = row(await input.storage.read(`student_requests/${id}`));
  const intent = request && validIntent(request, id);
  if (!request || !intent || request.id !== id || request.status !== 'approved'
    || request.reviewedBy !== input.actorUid || typeof request.studentId !== 'string'
    || typeof request.assignmentId !== 'string' || typeof request.reviewedAt !== 'number'
    || request.reviewedAt > (input.now ?? Date.now)()) return { status: 409, body: { code: 'assignment_action_not_committed' } };
  const [actor, assignment, student, teacher] = await Promise.all([
    input.storage.read(`users/${input.actorUid}`).then(row),
    input.storage.read(`student_teacher_assignments/${request.assignmentId}`).then(row),
    input.storage.read(`users/${request.studentId}`).then(row),
    input.storage.read(`users/${request.teacherId}`).then(row),
  ]);
  if (actor?.role !== 'super_admin' || !assignment || assignment.id !== request.assignmentId
    || assignment.status !== 'active' || assignment.studentId !== request.studentId
    || assignment.teacherId !== request.teacherId || student?.role !== 'student' || teacher?.role !== 'teacher') {
    return { status: 403, body: { code: 'assignment_action_authority_invalid' } };
  }
  if (intent.state === 'done') return { status: 200, body: { status: 'replayed', notificationStatus: 'delivered' } };
  if (intent.state !== 'pending' || intent.attempts !== 0) return { status: 200, body: { status: 'replayed', notificationStatus: intent.state } };
  const claimed = await input.storage.claimImmediate(id, (input.now ?? Date.now)());
  if (!claimed) return { status: 200, body: { status: 'replayed', notificationStatus: 'sending' } };
  let result: 'delivered' | 'conflict' | 'unavailable' | 'invalid' = 'unavailable';
  try { result = await deliver(request, student, teacher, claimed, input.repository()); } catch { /* source action stays committed */ }
  try {
    await input.storage.updateIntent(id, { ...claimed, state: result === 'delivered' ? 'done' : 'retry_due',
      dueAt: result === 'delivered' ? ASSIGNMENT_INTENT_DONE_DUE_AT : (input.now ?? Date.now)() + RETRY_DELAY_MS });
  } catch { /* scheduled scan replays the stable inbox IDs */ }
  return { status: 200, body: { status: 'committed', notificationStatus: result === 'delivered' ? 'delivered' : 'retry_due' } };
};

export const retryDueAssignmentNotifications = async (storage: AssignmentNotificationStorage,
  repository: NotificationCommandRepository, now = Date.now): Promise<void> => {
  for (const item of await storage.dueRequests(now())) {
    if (item.intent.state === 'retrying' && item.intent.attempts === 2) {
      const delivered = await storage.notificationsExist(item.requestId, item.intent);
      if (!delivered) await storage.reportFailure(item.requestId, item.intent);
      await storage.updateIntent(item.requestId, { ...item.intent, state: delivered ? 'done' : 'failed', dueAt: ASSIGNMENT_INTENT_DONE_DUE_AT });
      continue;
    }
    const claimed = await storage.claimRetry(item.requestId, now());
    if (!claimed) continue;
    const request = row(await storage.read(`student_requests/${item.requestId}`));
    const [assignment, student, teacher] = await Promise.all([
      typeof request?.assignmentId === 'string' ? storage.read(`student_teacher_assignments/${request.assignmentId}`).then(row) : null,
      typeof request?.studentId === 'string' ? storage.read(`users/${request.studentId}`).then(row) : null,
      typeof request?.teacherId === 'string' ? storage.read(`users/${request.teacherId}`).then(row) : null,
    ]);
    let result: 'delivered' | 'conflict' | 'unavailable' | 'invalid' = 'invalid';
    if (request && request.id === item.requestId && request.status === 'approved' && validIntent(request, item.requestId)
      && assignment?.status === 'active' && assignment.studentId === request.studentId && assignment.teacherId === request.teacherId
      && student?.role === 'student' && teacher?.role === 'teacher') result = await deliver(request, student, teacher, claimed, repository);
    const delivered = result === 'delivered';
    if (!delivered && claimed.attempts === 2) await storage.reportFailure(item.requestId, claimed);
    await storage.updateIntent(item.requestId, { ...claimed, state: delivered ? 'done' : claimed.attempts === 1 ? 'retry_due' : 'failed',
      dueAt: delivered || claimed.attempts === 2 ? ASSIGNMENT_INTENT_DONE_DUE_AT : now() + RETRY_DELAY_MS });
    if (result === 'unavailable') break;
  }
};
