import { buildRoute } from '../../../../src/constants/routes.ts';
import type { NotificationCommandRepository } from './repository.ts';
import type { NotificationFailureReason } from './retry-family-gate.ts';

const ID = /^[A-Za-z0-9_-]{1,128}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
export const DEADLINE_INTENT_DONE_DUE_AT = 8_640_000_000_000_000;
const RETRY_DELAY_MS = 60 * 60 * 1000;
const LIMIT = 1;

export interface ManualHomeworkReminderIntent {
  readonly eventId: string;
  readonly homeworkId: string;
  readonly studentId: string;
  readonly actorUid: string;
  readonly occurredAt: number;
  readonly state: 'pending' | 'sending' | 'retry_due' | 'retrying' | 'done' | 'failed';
  readonly attempts: 0 | 1 | 2;
  readonly dueAt: number;
}

export interface DeadlineNotificationStorage {
  readIntent(eventId: string): Promise<{ readonly intent: ManualHomeworkReminderIntent; readonly version: string } | null>;
  readHomework(homeworkId: string, studentId: string): Promise<Record<string, unknown> | null>;
  updateIntent(eventId: string, intent: ManualHomeworkReminderIntent, version: string): Promise<string | null>;
  dueIntents(now: number, limit?: number): Promise<Array<{ readonly intent: ManualHomeworkReminderIntent; readonly version: string }>>;
  notificationExists(intent: ManualHomeworkReminderIntent): Promise<boolean>;
  reportFailure(intent: ManualHomeworkReminderIntent, now: number, reasonCode: NotificationFailureReason): Promise<void>;
  retrySuppressed?(): Promise<boolean>;
  recordSuccess?(at: number): Promise<void>;
}

export const parseDeadlineAction = async (request: Request): Promise<{ eventId: string }> => {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) throw new Error('deadline_action_content_type_required');
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 512) throw new Error('deadline_action_body_too_large');
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error('deadline_action_invalid_json'); }
  const value = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  if (!value || Object.keys(value).sort().join(',') !== 'eventId' || typeof value.eventId !== 'string'
    || !UUID.test(value.eventId) || request.headers.get('Idempotency-Key') !== value.eventId) {
    throw new Error('deadline_action_invalid');
  }
  return { eventId: value.eventId };
};

const record = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : null;

export const deadlineNotificationId = (eventId: string, recipientId: string): string => {
  const value = `${eventId}:${recipientId}`;
  const hash = (text: string, seed: number) => {
    let result = (2166136261 ^ seed) >>> 0;
    for (let index = 0; index < text.length; index += 1) result = Math.imul(result ^ text.charCodeAt(index), 16777619) >>> 0;
    return result;
  };
  const hex = [0, 1, 2, 3].map((seed) => hash(`${value}:${seed}`, seed).toString(16).padStart(8, '0')).join('');
  const versioned = `${hex.slice(0, 12)}5${hex.slice(13, 16)}8${hex.slice(17)}`;
  return `${versioned.slice(0, 8)}-${versioned.slice(8, 12)}-${versioned.slice(12, 16)}-${versioned.slice(16, 20)}-${versioned.slice(20)}`;
};

const trustedHomework = (intent: ManualHomeworkReminderIntent, homework: Record<string, unknown> | null): { link: string } | null => {
  if (!homework || homework.id !== intent.homeworkId || homework.createdBy !== intent.actorUid) return null;
  const overrides = record(homework.studentOverrides);
  const override = record(overrides?.[intent.studentId]);
  if (typeof override?.lastRemindedAt !== 'number' || override.lastRemindedAt < intent.occurredAt
    || typeof override.reminderCount !== 'number' || override.reminderCount < 1) return null;
  const target = record(homework.target);
  let assigned = false;
  if (target?.type === 'students' || target?.type === 'group') {
    assigned = Array.isArray(target.studentIds) && target.studentIds.includes(intent.studentId);
  } else if (target?.type === 'class') {
    const classStudents = record(homework.classStudents);
    assigned = Boolean(classStudents && Object.hasOwn(classStudents, intent.studentId));
  } else if (target?.type === 'course') {
    const courseEnrollments = homework.courseEnrollments;
    assigned = Array.isArray(courseEnrollments) && courseEnrollments.some((entry) => {
      const enrollment = record(entry);
      return enrollment?.courseId === target.courseId && enrollment.studentId === intent.studentId
        && enrollment.status === 'active'
        && (enrollment.expiresAt === 0 || (typeof enrollment.expiresAt === 'number' && enrollment.expiresAt > intent.occurredAt));
    });
  }
  if (!assigned) return null;
  return { link: buildRoute('STUDENT_HOMEWORK_DETAIL', { homeworkId: intent.homeworkId }) };
};

export const createDeadlineNotificationHandlers = (options: {
  readonly storage: DeadlineNotificationStorage;
  readonly repository: NotificationCommandRepository;
  readonly now?: () => number;
}) => {
  const now = options.now ?? Date.now;
  type Outcome = { delivered: boolean; fresh: boolean; reasonCode: NotificationFailureReason };
  const deliver = async (intent: ManualHomeworkReminderIntent): Promise<Outcome> => {
    const homework = await options.storage.readHomework(intent.homeworkId, intent.studentId);
    const source = trustedHomework(intent, homework);
    if (!source) return { delivered: false, fresh: false, reasonCode: 'source_unavailable' };
    const result = await options.repository.create({
      operationId: deadlineNotificationId(intent.eventId, intent.studentId),
      recipientId: intent.studentId,
      notification: {
        type: 'homework_reminder', title: '⚡ Homework Reminder',
        message: 'Your teacher sent you a homework reminder.', link: source.link,
      },
      now: intent.occurredAt,
    });
    return { delivered: result.status !== 'idempotency-conflict', fresh: result.status === 'created',
      reasonCode: result.status === 'idempotency-conflict' ? 'inbox_conflict' : 'delivery_unconfirmed' };
  };

  const recordSuccess = async () => {
    try { await options.storage.recordSuccess?.(now()); } catch { /* Delivery remains authoritative. */ }
  };
  const initialState = async (intent: ManualHomeworkReminderIntent, outcome: Outcome) => {
    const { delivered, fresh, reasonCode } = outcome;
    if (delivered) {
      if (fresh) await recordSuccess();
      return { state: 'done' as const, dueAt: DEADLINE_INTENT_DONE_DUE_AT };
    }
    try {
      if (await options.storage.retrySuppressed?.()) {
        await options.storage.reportFailure(intent, now(), reasonCode);
        return { state: 'failed' as const, dueAt: DEADLINE_INTENT_DONE_DUE_AT };
      }
    } catch { /* Retain the durable intent for operator inspection. */ }
    return { state: 'retry_due' as const, dueAt: intent.dueAt };
  };

  const action = async (input: { readonly request: Request; readonly uid: string }) => {
    if (!input.uid) return { body: { code: 'deadline_action_unauthenticated' }, init: { status: 401 } satisfies ResponseInit };
    try {
      const { eventId } = await parseDeadlineAction(input.request);
      const saved = await options.storage.readIntent(eventId);
      if (!saved || !isTrustedManualReminderIntent(saved.intent, eventId) || saved.intent.actorUid !== input.uid) {
        return { body: { code: 'deadline_action_forbidden' }, init: { status: 403 } satisfies ResponseInit };
      }
      const intent = saved.intent;
      if (intent.state === 'done') return { body: { status: 'replayed', eventId }, init: { status: 200 } satisfies ResponseInit };
      if (intent.state !== 'pending' || intent.attempts !== 0) {
        return { body: { code: 'deadline_action_already_claimed' }, init: { status: 409 } satisfies ResponseInit };
      }
      const claimed = { ...intent, state: 'sending' as const, attempts: 1 as const, dueAt: now() + RETRY_DELAY_MS };
      const version = await options.storage.updateIntent(eventId, claimed, saved.version);
      if (!version) return { body: { code: 'deadline_action_already_claimed' }, init: { status: 409 } satisfies ResponseInit };
      let outcome: Outcome = { delivered: false, fresh: false, reasonCode: 'delivery_backend_error' };
      try { outcome = await deliver(claimed); } catch { /* retain the one scheduled retry */ }
      const completed: ManualHomeworkReminderIntent = { ...claimed, ...await initialState(claimed, outcome) };
      await options.storage.updateIntent(eventId, completed, version);
      return { body: { status: outcome.delivered ? 'delivered' : completed.state === 'failed' ? 'failed' : 'retry_scheduled', eventId }, init: { status: 200 } satisfies ResponseInit };
    } catch {
      return { body: { code: 'deadline_action_failed' }, init: { status: 500 } satisfies ResponseInit };
    }
  };

  return { action, retryDue: async () => {
    for (const due of await options.storage.dueIntents(now(), LIMIT)) {
      const intent = due.intent;
      if (intent.state === 'retrying') {
        const delivered = await options.storage.notificationExists(intent);
        if (!delivered) await options.storage.reportFailure(intent, now(), 'inbox_missing_after_claim');
        await options.storage.updateIntent(intent.eventId, {
          ...intent, state: delivered ? 'done' : 'failed', attempts: 2, dueAt: DEADLINE_INTENT_DONE_DUE_AT,
        }, due.version);
        continue;
      }
      if (intent.state === 'pending' && intent.attempts === 0) {
        const claimed = { ...intent, state: 'sending' as const, attempts: 1 as const, dueAt: now() + RETRY_DELAY_MS };
        const version = await options.storage.updateIntent(intent.eventId, claimed, due.version);
        if (!version) continue;
        let outcome: Outcome = { delivered: false, fresh: false, reasonCode: 'delivery_backend_error' };
        try { outcome = await deliver(claimed); } catch { /* one later retry remains */ }
        await options.storage.updateIntent(intent.eventId, { ...claimed, ...await initialState(claimed, outcome) }, version);
        continue;
      }
      if (intent.state !== 'retry_due' || intent.attempts !== 1) continue;
      if (await options.storage.retrySuppressed?.()) continue;
      const claimed = { ...intent, state: 'retrying' as const, attempts: 2 as const, dueAt: now() + RETRY_DELAY_MS };
      const version = await options.storage.updateIntent(intent.eventId, claimed, due.version);
      if (!version) continue;
      let outcome: Outcome = { delivered: false, fresh: false, reasonCode: 'delivery_backend_error' };
      try { outcome = await deliver(claimed); } catch { /* report below */ }
      if (!outcome.delivered) await options.storage.reportFailure(claimed, now(), outcome.reasonCode);
      else if (outcome.fresh) await recordSuccess();
      await options.storage.updateIntent(intent.eventId, {
        ...claimed, state: outcome.delivered ? 'done' : 'failed', dueAt: DEADLINE_INTENT_DONE_DUE_AT,
      }, version);
    }
  } };
};

export const isTrustedManualReminderIntent = (value: unknown, eventId: string): value is ManualHomeworkReminderIntent => {
  const intent = record(value);
  return Boolean(intent && intent.eventId === eventId && UUID.test(eventId)
    && typeof intent.homeworkId === 'string' && ID.test(intent.homeworkId)
    && typeof intent.studentId === 'string' && ID.test(intent.studentId)
    && typeof intent.actorUid === 'string' && ID.test(intent.actorUid)
    && Number.isSafeInteger(intent.occurredAt)
    && Number.isSafeInteger(intent.dueAt)
    && ['pending', 'sending', 'retry_due', 'retrying', 'done', 'failed'].includes(String(intent.state))
    && [0, 1, 2].includes(Number(intent.attempts)));
};
