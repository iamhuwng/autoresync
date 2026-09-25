import { buildRoute } from '../../../../src/constants/routes.ts';
import type { NotificationCommandRepository } from './repository.ts';

const ID = /^[A-Za-z0-9_-]{1,128}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const RETRY_DELAY_MS = 60 * 60 * 1000;
export const CLASS_INTENT_DONE_DUE_AT = 8_640_000_000_000_000;
const ACTIONS = ['join-pending', 'direct-add', 'approve', 'reject'] as const;

export type ClassActionKind = typeof ACTIONS[number];

export interface ClassActionCommand {
  readonly schemaVersion: 1;
  readonly actionType: 'class-membership-transition';
  readonly actionId: string;
  readonly kind: ClassActionKind;
  readonly classId: string;
  readonly studentId: string;
}

export interface ClassNotificationIntent {
  readonly actionId: string;
  readonly kind: ClassActionKind;
  readonly classId: string;
  readonly studentId: string;
  readonly actorUid: string;
  readonly teacherId: string;
  readonly occurredAt: number;
  readonly className: string;
  readonly studentName: string;
  readonly dueAt: number;
  readonly attempts: number;
  readonly state: 'retry_due' | 'retrying' | 'done' | 'failed';
}

export interface ClassActionStorage {
  read(path: string): Promise<unknown>;
  commit(input: {
    command: ClassActionCommand;
    actorUid: string;
    updates: readonly { path: string; value: unknown }[];
  }): Promise<void>;
  updateIntent(intent: ClassNotificationIntent): Promise<void>;
  recordSuccess?(at: number): Promise<void>;
  retrySuppressed?(): Promise<boolean>;
  reportFailure?(intent: ClassNotificationIntent, failedRecipientCount: number): Promise<void>;
}

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
const text = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : fallback;

export const parseClassAction = async (request: Request): Promise<ClassActionCommand> => {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new Error('content_type_required');
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 2048) throw new Error('class_action_body_too_large');
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error('class_action_invalid_json'); }
  const value = record(parsed);
  if (!value || Object.keys(value).sort().join(',') !==
      ['actionId', 'actionType', 'classId', 'kind', 'schemaVersion', 'studentId'].join(',')
    || value.schemaVersion !== 1 || value.actionType !== 'class-membership-transition'
    || typeof value.actionId !== 'string' || !UUID.test(value.actionId)
    || request.headers.get('Idempotency-Key') !== value.actionId
    || typeof value.kind !== 'string' || !ACTIONS.includes(value.kind as ClassActionKind)
    || typeof value.classId !== 'string' || !ID.test(value.classId)
    || typeof value.studentId !== 'string' || !ID.test(value.studentId)) {
    throw new Error('class_action_invalid');
  }
  return value as unknown as ClassActionCommand;
};

const hash32 = (value: string, seed: number): number => {
  let hash = (2166136261 ^ seed) >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619) >>> 0;
  }
  return hash;
};

const notificationId = (actionId: string, recipientId: string): string => {
  const key = `${actionId}:${recipientId}`;
  const hex = [0, 1, 2, 3]
    .map((seed) => hash32(`${key}:${seed}`, seed).toString(16).padStart(8, '0'))
    .join('');
  const versioned = `${hex.slice(0, 12)}5${hex.slice(13, 16)}8${hex.slice(17)}`;
  return `${versioned.slice(0, 8)}-${versioned.slice(8, 12)}-${versioned.slice(12, 16)}-${versioned.slice(16, 20)}-${versioned.slice(20)}`;
};

const noticesFor = (intent: ClassNotificationIntent) => {
  const dashboard = buildRoute('STUDENT_DASHBOARD');
  const classDetail = buildRoute('TEACHER_CLASS_DETAIL', { classId: intent.classId });
  switch (intent.kind) {
    case 'join-pending':
      return [
        { recipientId: intent.studentId, type: 'info' as const,
          title: '🏫 Joined Class — Pending Approval',
          message: `You've requested to join ${intent.className}. Waiting for teacher approval.`, link: dashboard },
        { recipientId: intent.teacherId, type: 'info' as const,
          title: '👋 New Student Request',
          message: `${intent.studentName} wants to join your class "${intent.className}". Review in class management.`, link: classDetail },
      ];
    case 'direct-add':
      return [{ recipientId: intent.studentId, type: 'success' as const,
        title: '✅ Added to Class', message: `You've been added to ${intent.className}.`, link: dashboard }];
    case 'approve':
      return [{ recipientId: intent.studentId, type: 'success' as const,
        title: '✅ Approved!', message: `You've been approved to join ${intent.className}.`, link: dashboard }];
    case 'reject':
      return [{ recipientId: intent.studentId, type: 'info' as const,
        title: '❌ Request Declined', message: `Your request to join ${intent.className} was not approved.`, link: dashboard }];
  }
};

/** Read-only recovery after a claimed retry was interrupted. */
export const missingClassIntentRecipients = async (
  intent: ClassNotificationIntent,
  read: (path: string) => Promise<unknown>,
): Promise<number> => {
  let missing = 0;
  for (const { recipientId, ...notification } of noticesFor(intent)) {
    const id = notificationId(intent.actionId, recipientId);
    const row = record(await read(`notifications/${recipientId}/${id}`));
    if (!row || row.id !== id || row.type !== notification.type
      || row.title !== notification.title || row.message !== notification.message
      || row.link !== notification.link) missing += 1;
  }
  return missing;
};

export const deliverClassIntent = async (
  intent: ClassNotificationIntent,
  repository: NotificationCommandRepository,
): Promise<{ delivered: boolean; failedRecipientCount: number; backendFailure: boolean; fresh: boolean }> => {
  const notices = noticesFor(intent);
  let fresh = false;
  for (const [index, { recipientId, ...notification }] of notices.entries()) {
    try {
      const result = await repository.create({
        operationId: notificationId(intent.actionId, recipientId),
        recipientId,
        notification,
        now: intent.occurredAt,
      });
      if (result.status === 'idempotency-conflict') {
        return { delivered: false, failedRecipientCount: notices.length - index, backendFailure: false, fresh };
      }
      if (result.status === 'created') fresh = true;
    } catch {
      // Stop on a shared backend failure; a later retry resumes via stable IDs.
      return { delivered: false, failedRecipientCount: notices.length - index, backendFailure: true, fresh };
    }
  }
  return { delivered: true, failedRecipientCount: 0, backendFailure: false, fresh };
};

export const performClassAction = async (input: {
  readonly command: ClassActionCommand;
  readonly actorUid: string;
  readonly storage: ClassActionStorage;
  readonly repository: () => NotificationCommandRepository;
  readonly now?: () => number;
}): Promise<{ status: number; body: Record<string, unknown> }> => {
  const { command, actorUid, storage } = input;
  const existing = record(await storage.read(`notification_intents/${command.actionId}`));
  if (existing) {
    return existing.actorUid === actorUid && existing.classId === command.classId
      && existing.studentId === command.studentId && existing.kind === command.kind
      ? { status: 200, body: { status: 'replayed', actionId: command.actionId } }
      : { status: 409, body: { code: 'class_action_id_conflict' } };
  }

  const classData = record(await storage.read(`classes/${command.classId}`));
  const actor = record(await storage.read(`users/${actorUid}`));
  if (!classData || classData.status !== 'active' || !actor) {
    return { status: 403, body: { code: 'class_action_forbidden' } };
  }
  const teacherId = classData.createdBy;
  if (typeof teacherId !== 'string' || !ID.test(teacherId)) {
    return { status: 403, body: { code: 'class_action_forbidden' } };
  }
  const isOwner = actorUid === teacherId || actor.role === 'super_admin';
  if (command.kind === 'join-pending' ? actorUid !== command.studentId || actor.role !== 'student' : !isOwner) {
    return { status: 403, body: { code: 'class_action_forbidden' } };
  }
  const students = record(classData.students) ?? {};
  const currentStudent = record(students[command.studentId]);
  if (command.kind === 'join-pending' || command.kind === 'direct-add') {
    if (currentStudent || Object.values(students).some((value) => record(value)?.uid === command.studentId)) {
      return { status: 409, body: { code: 'class_action_membership_exists' } };
    }
    const max = record(classData.settings)?.maxStudents;
    if (typeof max === 'number' && Object.keys(students).length >= max) {
      return { status: 409, body: { code: 'class_action_class_full' } };
    }
  } else if (!currentStudent || currentStudent.status !== 'pending_approval') {
    return { status: 409, body: { code: 'class_action_stale' } };
  }

  const studentProfile = command.kind === 'join-pending' || command.kind === 'direct-add'
    ? record(await storage.read(`users/${command.studentId}`)) : null;
  if ((command.kind === 'join-pending' || command.kind === 'direct-add')
    && (!studentProfile || studentProfile.role !== 'student')) {
    return { status: 403, body: { code: 'class_action_student_invalid' } };
  }
  const at = input.now?.() ?? Date.now();
  const status = command.kind === 'join-pending' ? 'pending_approval' : 'active';
  const joinedAt = typeof currentStudent?.joinedAt === 'number' ? currentStudent.joinedAt : at;
  const studentName = text(currentStudent?.name ?? studentProfile?.displayName, 'Student');
  const className = text(classData.name, command.classId);
  const studentRow = command.kind === 'join-pending' || command.kind === 'direct-add'
    ? { id: command.studentId, uid: command.studentId, name: studentName,
      ...(typeof studentProfile?.email === 'string' ? { email: studentProfile.email } : {}),
      status, joinedAt, lastActiveAt: at, isOnline: true, assignments: {} }
    : null;
  const intent: ClassNotificationIntent = {
    actionId: command.actionId, kind: command.kind, classId: command.classId,
    studentId: command.studentId, actorUid, teacherId, occurredAt: at,
    className, studentName, dueAt: at + RETRY_DELAY_MS,
    attempts: 1, state: 'retry_due',
  };
  const updates = [
    { path: `classes/${command.classId}/students/${command.studentId}`,
      value: command.kind === 'reject' ? null
        : command.kind === 'approve' ? { ...currentStudent, status: 'active' } : studentRow },
    { path: `student_classes/${command.studentId}/${command.classId}`,
      value: command.kind === 'reject' ? null : { joinedAt, status } },
    { path: `notification_intents/${command.actionId}`, value: intent },
  ];
  try {
    await storage.commit({ command, actorUid, updates });
  } catch {
    return { status: 409, body: { code: 'class_action_commit_failed' } };
  }

  let delivery: { delivered: boolean; failedRecipientCount: number; backendFailure: boolean; fresh: boolean };
  try {
    delivery = await deliverClassIntent(intent, input.repository());
  } catch {
    delivery = { delivered: false, failedRecipientCount: command.kind === 'join-pending' ? 2 : 1, backendFailure: true, fresh: false };
  }
  let suppressedFailure = false;
  if (delivery.delivered) {
    if (delivery.fresh) {
      try { await storage.recordSuccess?.(Date.now()); } catch { /* Delivery already succeeded. */ }
    }
    try {
      await storage.updateIntent({ ...intent, state: 'done', dueAt: CLASS_INTENT_DONE_DUE_AT });
    } catch {
      // Idempotent replay on the scheduled pass leaves existing read flags intact.
    }
  } else {
    try {
      if (storage.reportFailure && await storage.retrySuppressed?.()) {
        await storage.reportFailure(intent, delivery.failedRecipientCount);
        await storage.updateIntent({ ...intent, state: 'failed', dueAt: CLASS_INTENT_DONE_DUE_AT });
        suppressedFailure = true;
      }
    } catch {
      // A failed gate/report read leaves the durable intent inspectable.
    }
  }
  return { status: 200, body: {
    status: 'committed', actionId: command.actionId,
    notificationStatus: delivery.delivered ? 'delivered' : suppressedFailure ? 'failed' : 'retry_due',
  } };
};
