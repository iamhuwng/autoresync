import { buildRoute } from '../../../../src/constants/routes.ts';
import type { NotificationCommandRepository } from './repository.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ID = /^[A-Za-z0-9_-]{1,128}$/u;
const RETRY_DELAY_MS = 60 * 60 * 1000;
const LIMIT = 1;
export const HOMEWORK_RESET_INTENT_DONE_DUE_AT = 8_640_000_000_000_000;

export interface HomeworkResetIntent {
  readonly schemaVersion: 1;
  readonly eventId: string;
  readonly homeworkId: string;
  readonly studentId: string;
  readonly sourceSubmissionId: string;
  readonly actorUid: string;
  readonly occurredAt: number;
  readonly state: 'retry_due' | 'sending' | 'retrying' | 'done' | 'failed';
  readonly attempts: 0 | 1 | 2;
  readonly dueAt: number;
}

export interface HomeworkResetNotificationStorage {
  readIntent(eventId: string): Promise<{ readonly intent: HomeworkResetIntent; readonly version: string } | null>;
  readHomework(homeworkId: string, studentId: string): Promise<Record<string, unknown> | null>;
  updateIntent(eventId: string, intent: HomeworkResetIntent, version: string): Promise<string | null>;
  dueIntents(now: number, limit?: number): Promise<Array<{ readonly intent: HomeworkResetIntent; readonly version: string }>>;
  notificationExists(intent: HomeworkResetIntent): Promise<boolean>;
  reportFailure(intent: HomeworkResetIntent, now: number): Promise<void>;
  retrySuppressed?(): Promise<boolean>;
  recordSuccess?(at: number): Promise<void>;
}

const record = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : null;

export const parseHomeworkResetAction = async (request: Request): Promise<{ eventId: string }> => {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) throw new Error('homework_reset_content_type_required');
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 512) throw new Error('homework_reset_body_too_large');
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error('homework_reset_invalid_json'); }
  const value = record(parsed);
  if (!value || Object.keys(value).sort().join(',') !== 'eventId' || typeof value.eventId !== 'string'
    || !UUID.test(value.eventId) || request.headers.get('Idempotency-Key') !== value.eventId) throw new Error('homework_reset_invalid');
  return { eventId: value.eventId };
};

export const homeworkResetNotificationId = (intent: HomeworkResetIntent): string => {
  const text = `${intent.eventId}:${intent.studentId}`;
  const hash = (seed: number) => {
    let value = (2166136261 ^ seed) >>> 0;
    for (let index = 0; index < text.length; index += 1) value = Math.imul(value ^ text.charCodeAt(index), 16777619) >>> 0;
    return value.toString(16).padStart(8, '0');
  };
  const hex = [0, 1, 2, 3].map(hash).join('');
  const versioned = `${hex.slice(0, 12)}5${hex.slice(13, 16)}8${hex.slice(17)}`;
  return `${versioned.slice(0, 8)}-${versioned.slice(8, 12)}-${versioned.slice(12, 16)}-${versioned.slice(16, 20)}-${versioned.slice(20)}`;
};

const trustedSource = (intent: HomeworkResetIntent, homework: Record<string, unknown> | null) => {
  if (!homework || homework.id !== intent.homeworkId || homework.createdBy !== intent.actorUid) return null;
  const target = record(homework.target);
  let assigned = false;
  if (target?.type === 'students' || target?.type === 'group') {
    assigned = Array.isArray(target.studentIds) && target.studentIds.includes(intent.studentId);
  } else if (target?.type === 'class') {
    assigned = Object.hasOwn(record(homework.classStudents) ?? {}, intent.studentId);
  } else if (target?.type === 'course') {
    assigned = Array.isArray(homework.courseEnrollments) && homework.courseEnrollments.some((item) => {
      const enrollment = record(item);
      return enrollment?.courseId === target.courseId && enrollment.studentId === intent.studentId
        && enrollment.status === 'active'
        && (enrollment.expiresAt === 0 || (typeof enrollment.expiresAt === 'number' && enrollment.expiresAt > intent.occurredAt));
    });
  }
  if (!assigned) return null;
  return { link: buildRoute('STUDENT_HOMEWORK_DETAIL', { homeworkId: intent.homeworkId }) };
};

export const createHomeworkResetNotificationHandlers = (options: {
  readonly storage: HomeworkResetNotificationStorage;
  readonly repository: NotificationCommandRepository;
  readonly now?: () => number;
}) => {
  const now = options.now ?? Date.now;
  const deliver = async (intent: HomeworkResetIntent): Promise<{ delivered: boolean; fresh: boolean }> => {
    const source = trustedSource(intent, await options.storage.readHomework(intent.homeworkId, intent.studentId));
    if (!source) return { delivered: false, fresh: false };
    const result = await options.repository.create({
      operationId: homeworkResetNotificationId(intent), recipientId: intent.studentId,
      notification: {
        type: 'warning', title: '🔄 Homework Reset',
        message: 'Your teacher reset your homework. You can now retake it.',
        link: source.link,
      },
      now: intent.occurredAt,
    });
    return { delivered: result.status !== 'idempotency-conflict' || await options.storage.notificationExists(intent),
      fresh: result.status === 'created' };
  };

  const attempt = async (intent: HomeworkResetIntent, version: string, retry: boolean) => {
    if (retry && await options.storage.retrySuppressed?.()) return;
    const attempts = retry ? 2 as const : 1 as const;
    const claimed = { ...intent, state: retry ? 'retrying' as const : 'sending' as const, attempts, dueAt: now() + RETRY_DELAY_MS };
    const claimVersion = await options.storage.updateIntent(intent.eventId, claimed, version);
    if (!claimVersion) return;
    let outcome = { delivered: false, fresh: false };
    try { outcome = await deliver(claimed); } catch { /* one later attempt remains */ }
    if (outcome.fresh) {
      try { await options.storage.recordSuccess?.(now()); } catch { /* Delivery remains authoritative. */ }
    }
    let failedWithoutRetry = false;
    if (!outcome.delivered && (retry || await options.storage.retrySuppressed?.())) {
      try {
        await options.storage.reportFailure(claimed, now());
        failedWithoutRetry = true;
      } catch { /* Keep a durable retry intent if reporting failed. */ }
    }
    const next: HomeworkResetIntent = {
      ...claimed,
      state: outcome.delivered ? 'done' : failedWithoutRetry ? 'failed' : retry ? 'retrying' : 'retry_due',
      dueAt: outcome.delivered || failedWithoutRetry ? HOMEWORK_RESET_INTENT_DONE_DUE_AT : claimed.dueAt,
    };
    await options.storage.updateIntent(intent.eventId, next, claimVersion);
  };

  return {
    action: async (input: { readonly request: Request; readonly uid: string }) => {
      if (!input.uid) return { body: { code: 'homework_reset_unauthenticated' }, status: 401 };
      try {
        const { eventId } = await parseHomeworkResetAction(input.request);
        const saved = await options.storage.readIntent(eventId);
        const intent = saved?.intent;
        if (!saved || !isTrustedHomeworkResetIntent(intent, eventId) || intent.actorUid !== input.uid) {
          return { body: { code: 'homework_reset_forbidden' }, status: 403 };
        }
        if (intent.state === 'done') return { body: { status: 'replayed', eventId }, status: 200 };
        if (intent.state !== 'retry_due' || intent.attempts !== 0) return { body: { status: 'retry_scheduled', eventId }, status: 200 };
        await attempt(intent, saved.version, false);
        const latest = await options.storage.readIntent(eventId);
        return { body: { status: latest?.intent.state === 'done' ? 'delivered' : latest?.intent.state === 'failed' ? 'failed' : 'retry_scheduled', eventId }, status: 200 };
      } catch {
        return { body: { code: 'homework_reset_action_failed' }, status: 500 };
      }
    },
    retryDue: async () => {
      for (const due of await options.storage.dueIntents(now(), LIMIT)) {
        if (due.intent.state === 'retry_due' && due.intent.attempts === 0) await attempt(due.intent, due.version, false);
        else if (['retry_due', 'sending'].includes(due.intent.state) && due.intent.attempts === 1) await attempt(due.intent, due.version, true);
        else if (due.intent.state === 'retrying' && due.intent.attempts === 2) {
          const delivered = await options.storage.notificationExists(due.intent);
          if (!delivered) await options.storage.reportFailure(due.intent, now());
          await options.storage.updateIntent(due.intent.eventId, {
            ...due.intent, state: delivered ? 'done' : 'failed', dueAt: HOMEWORK_RESET_INTENT_DONE_DUE_AT,
          }, due.version);
        }
      }
    },
  };
};

export const isTrustedHomeworkResetIntent = (value: unknown, eventId: string): value is HomeworkResetIntent => {
  const intent = record(value);
  return Boolean(intent && intent.schemaVersion === 1 && intent.eventId === eventId && UUID.test(eventId)
    && typeof intent.homeworkId === 'string' && ID.test(intent.homeworkId)
    && typeof intent.studentId === 'string' && ID.test(intent.studentId)
    && typeof intent.sourceSubmissionId === 'string' && ID.test(intent.sourceSubmissionId)
    && typeof intent.actorUid === 'string' && ID.test(intent.actorUid)
    && Number.isSafeInteger(intent.occurredAt) && Number.isSafeInteger(intent.dueAt)
    && ['retry_due', 'sending', 'retrying', 'done', 'failed'].includes(String(intent.state))
    && [0, 1, 2].includes(Number(intent.attempts)));
};
