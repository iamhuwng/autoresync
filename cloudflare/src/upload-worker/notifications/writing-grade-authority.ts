import { buildRoute } from '../../../../src/constants/routes.ts';
import type { NotificationCommandRepository } from './repository.ts';

const ID = /^[A-Za-z0-9_-]{1,128}$/u;
const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

export interface WritingGradeNotificationIntent {
  readonly schemaVersion: 1;
  readonly eventId: string;
  readonly kind: 'writing-graded' | 'writing-submitted-student' | 'writing-submitted-teacher';
  readonly authorityRecordId: string;
  readonly occurrenceId: string;
  readonly actorUid: string;
  readonly auditVersion?: number;
  readonly occurredAt: number;
  readonly dueAt: number;
  readonly attempts: number;
  readonly state: 'retry_due' | 'retrying' | 'done' | 'failed';
}

export interface WritingGradeSubmission {
  readonly id: string;
  readonly studentId: string;
  readonly studentName?: string;
  readonly submittedAt?: number;
  readonly testMeta?: { readonly testTitle?: string };
  readonly context?: {
    readonly type?: string;
    readonly sessionCode?: string;
    readonly assigningTeacherId?: string;
    readonly selectedTeacherId?: string;
  };
  readonly auditTrail?: readonly {
    readonly version?: number;
    readonly gradedAt?: number;
    readonly teacherId?: string;
    readonly action?: string;
  }[];
}

export interface WritingGradeNotificationStorage {
  readIntent(eventId: string): Promise<unknown>;
  readSubmission(submissionId: string): Promise<unknown>;
  updateIntent(intent: WritingGradeNotificationIntent): Promise<void>;
  dueIntents(now: number, limit: number): Promise<readonly WritingGradeNotificationIntent[]>;
  claimRetry(eventId: string, now: number): Promise<WritingGradeNotificationIntent | null>;
  readTeacherLink(teacherId: string, studentId: string): Promise<boolean>;
  readSessionSubmissionProof(sessionCode: string, studentId: string, resultId: string, actorUid: string): Promise<boolean>;
  readInbox(path: string): Promise<unknown>;
  reportFailure(intent: WritingGradeNotificationIntent, now: number): Promise<void>;
}

export interface WritingGradeNotificationAction {
  readonly schemaVersion: 1;
  readonly actionType: 'writing-notification';
  readonly eventId: string;
  readonly submissionId: string;
}

export const readWritingGradeNotificationAction = async (request: Request): Promise<WritingGradeNotificationAction> => {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new Error('writing_notification_content_type_required');
  }
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > 2048) throw new Error('writing_notification_body_too_large');
  let value: unknown;
  try { value = JSON.parse(body); } catch { throw new Error('writing_notification_invalid_json'); }
  const action = record(value);
  if (!action || Object.keys(action).sort().join(',') !== 'actionType,eventId,schemaVersion,submissionId'
    || action.schemaVersion !== 1 || action.actionType !== 'writing-notification'
    || typeof action.eventId !== 'string' || !ID.test(action.eventId)
    || request.headers.get('Idempotency-Key') !== action.eventId
    || typeof action.submissionId !== 'string' || !ID.test(action.submissionId)) {
    throw new Error('writing_notification_invalid_action');
  }
  return action as unknown as WritingGradeNotificationAction;
};

const done = (intent: WritingGradeNotificationIntent): WritingGradeNotificationIntent => ({
  ...intent, state: 'done', dueAt: 8_640_000_000_000_000,
});
const failed = (intent: WritingGradeNotificationIntent): WritingGradeNotificationIntent => ({
  ...intent, state: 'failed', dueAt: 8_640_000_000_000_000,
});

const gradeSourceAuthorized = async (
  intent: WritingGradeNotificationIntent,
  source: Record<string, unknown> | null,
  storage: WritingGradeNotificationStorage,
): Promise<boolean> => {
  if (intent.kind !== 'writing-graded' || !source) return true;
  const context = record(source.context);
  const studentId = typeof source.studentId === 'string' ? source.studentId : '';
  if (!ID.test(studentId)) return false;
  if (context?.type === 'live-session') {
    const sessionCode = typeof context.sessionCode === 'string' ? context.sessionCode : '';
    const assigningTeacherId = typeof context.assigningTeacherId === 'string' ? context.assigningTeacherId : '';
    if (!ID.test(sessionCode) || !ID.test(assigningTeacherId)
      || !await storage.readSessionSubmissionProof(sessionCode, studentId, intent.authorityRecordId, assigningTeacherId)) return false;
    return intent.actorUid === assigningTeacherId || storage.readTeacherLink(intent.actorUid, studentId);
  }
  return storage.readTeacherLink(intent.actorUid, studentId);
};

export const deliverWritingGradeNotification = async (input: {
  readonly eventId: string;
  readonly submissionId: string;
  readonly actorUid: string;
  readonly storage: WritingGradeNotificationStorage;
  readonly repository: NotificationCommandRepository;
  readonly now?: () => number;
}): Promise<'delivered' | 'retry_due' | 'forbidden' | 'not_found'> => {
  const rawIntent = record(await input.storage.readIntent(input.eventId));
  if (!rawIntent) return 'not_found';
  const intent = rawIntent as unknown as WritingGradeNotificationIntent;
  if (intent.eventId !== input.eventId || intent.authorityRecordId !== input.submissionId
    || intent.actorUid !== input.actorUid) return 'forbidden';
  if (intent.state === 'done') return 'delivered';
  if (intent.state !== 'retry_due' || intent.attempts !== 1) return 'forbidden';
  const source = await input.storage.readSubmission(input.submissionId);
  const sourceRecord = record(source);
  const sourceContext = record(sourceRecord?.context);
  if (!await gradeSourceAuthorized(intent, sourceRecord, input.storage)) return 'forbidden';
  if (intent.kind === 'writing-submitted-student' && sourceContext?.type === 'live-session'
    && (typeof sourceContext.sessionCode !== 'string'
      || typeof sourceRecord?.studentId !== 'string'
      || !await input.storage.readSessionSubmissionProof(sourceContext.sessionCode, sourceRecord.studentId, input.submissionId, intent.actorUid))) {
    return 'forbidden';
  }
  const teacherLink = intent.kind === 'writing-submitted-teacher'
    && typeof sourceContext?.selectedTeacherId === 'string' && typeof sourceRecord?.studentId === 'string'
    ? await input.storage.readTeacherLink(sourceContext.selectedTeacherId, sourceRecord.studentId)
    : false;
  const notification = writingGradeNotification(intent, source, teacherLink);
  if (!notification) return 'forbidden';
  try {
    const result = await input.repository.create({
      operationId: intent.eventId,
      recipientId: notification.recipientId,
      notification: notification.notification,
      now: input.now?.() ?? Date.now(),
    });
    if (result.status === 'idempotency-conflict') return 'retry_due';
    await input.storage.updateIntent(done(intent));
    return 'delivered';
  } catch {
    return 'retry_due';
  }
};

export const retryDueWritingGradeNotifications = async (input: {
  readonly storage: WritingGradeNotificationStorage;
  readonly repository: NotificationCommandRepository;
  readonly now?: number;
  readonly readInbox: (path: string) => Promise<unknown>;
  readonly reportFailure: (intent: WritingGradeNotificationIntent, now: number) => Promise<void>;
}): Promise<void> => {
  const now = input.now ?? Date.now();
  for (const intent of await input.storage.dueIntents(now, 2)) {
    if (intent.state === 'retrying' && intent.attempts === 2) {
      const source = record(await input.storage.readSubmission(intent.authorityRecordId));
      const sourceRecord = record(source);
      const sourceContext = record(sourceRecord?.context);
      if (!await gradeSourceAuthorized(intent, sourceRecord, input.storage)) {
        await input.storage.updateIntent(failed(intent));
        await input.reportFailure(intent, now);
        continue;
      }
      if (intent.kind === 'writing-submitted-student' && sourceContext?.type === 'live-session'
        && (typeof sourceContext.sessionCode !== 'string'
          || typeof sourceRecord?.studentId !== 'string'
          || !await input.storage.readSessionSubmissionProof(sourceContext.sessionCode, sourceRecord.studentId, intent.authorityRecordId, intent.actorUid))) {
        await input.storage.updateIntent(failed(intent));
        await input.reportFailure(intent, now);
        continue;
      }
      const teacherId = String(record(sourceRecord?.context)?.selectedTeacherId ?? '');
      const teacherLink = intent.kind === 'writing-submitted-teacher'
        && typeof sourceRecord?.studentId === 'string'
        ? await input.storage.readTeacherLink(teacherId, sourceRecord.studentId)
        : false;
      const notice = writingGradeNotification(intent, source, teacherLink);
      if (notice) {
        const existing = record(await input.readInbox(`notifications/${notice.recipientId}/${intent.eventId}`));
        if (existing?.id === intent.eventId && existing.title === notice.notification.title
          && existing.message === notice.notification.message && existing.link === notice.notification.link) {
          await input.storage.updateIntent(done(intent));
          continue;
        }
      }
      await input.storage.updateIntent(failed(intent));
      await input.reportFailure(intent, now);
      continue;
    }
    if (intent.state !== 'retry_due' || intent.attempts !== 1 || intent.dueAt > now) continue;
    const claimed = await input.storage.claimRetry(intent.eventId, now);
    if (!claimed) continue;
    const source = await input.storage.readSubmission(claimed.authorityRecordId);
    const sourceRecord = record(source);
    const sourceContext = record(sourceRecord?.context);
    const sourceAuthorized = await gradeSourceAuthorized(claimed, sourceRecord, input.storage);
    const sessionProof = claimed.kind === 'writing-submitted-student' && sourceContext?.type === 'live-session'
      ? typeof sourceContext.sessionCode === 'string' && typeof sourceRecord?.studentId === 'string'
        && await input.storage.readSessionSubmissionProof(sourceContext.sessionCode, sourceRecord.studentId, claimed.authorityRecordId, claimed.actorUid)
      : true;
    const teacherId = String(record(sourceRecord?.context)?.selectedTeacherId ?? '');
    const teacherLink = claimed.kind === 'writing-submitted-teacher'
      && typeof sourceRecord?.studentId === 'string'
      ? await input.storage.readTeacherLink(teacherId, sourceRecord.studentId)
      : false;
    const notification = writingGradeNotification(claimed, source, teacherLink);
    let delivered = false;
    if (notification && sessionProof && sourceAuthorized) {
      try {
        const result = await input.repository.create({
          operationId: claimed.eventId,
          recipientId: notification.recipientId,
          notification: notification.notification,
          now,
        });
        delivered = result.status !== 'idempotency-conflict';
      } catch {
        delivered = false;
      }
    }
    await input.storage.updateIntent(delivered ? done(claimed) : failed(claimed));
    if (!delivered) await input.reportFailure(claimed, now);
  }
};

export const writingGradeNotification = (
  intentValue: unknown,
  submissionValue: unknown,
  teacherLinkVerified = false,
): { readonly recipientId: string; readonly notification: {
  readonly type: 'success' | 'info'; readonly title: string; readonly message: string; readonly link: string;
} } | null => {
  const rawIntent = record(intentValue);
  const rawSubmission = record(submissionValue);
  if (!rawIntent || !rawSubmission) return null;
  const intent = rawIntent as unknown as WritingGradeNotificationIntent;
  const submission = rawSubmission as unknown as WritingGradeSubmission;
  if (intent.schemaVersion !== 1
    || !ID.test(intent.authorityRecordId) || !ID.test(intent.actorUid) || !ID.test(intent.eventId)
    || !ID.test(submission.id) || intent.authorityRecordId !== submission.id || intent.occurrenceId !== intent.eventId
    || !Number.isSafeInteger(intent.occurredAt) || intent.dueAt !== intent.occurredAt + 3_600_000
    || !ID.test(submission.studentId)) return null;

  if (intent.kind === 'writing-graded') {
    const context = record(submission.context);
    if (intent.eventId !== `writing-${submission.id}-graded-${intent.auditVersion}`
      || !Number.isSafeInteger(intent.auditVersion) || (intent.auditVersion ?? 0) < 1
      || (context?.assigningTeacherId !== intent.actorUid && context?.selectedTeacherId !== intent.actorUid)
      || !Array.isArray(submission.auditTrail)) return null;
    const audit = submission.auditTrail.find((candidate) => {
      const entry = record(candidate);
      return entry?.version === intent.auditVersion && entry.gradedAt === intent.occurredAt
        && entry.teacherId === intent.actorUid && (entry.action === 'published' || entry.action === 'regraded');
    });
    return audit ? {
      recipientId: submission.studentId,
      notification: {
        type: 'success',
        title: 'Writing graded',
        message: 'Your writing submission has been graded. View your academic record.',
        link: buildRoute('STUDENT_ACADEMIC_RECORD'),
      },
    } : null;
  }

  if (!Number.isSafeInteger(submission.submittedAt) || intent.occurredAt !== submission.submittedAt
    || intent.auditVersion !== undefined) return null;
  const context = record(submission.context);
  if (intent.kind === 'writing-submitted-student') {
    if (intent.eventId !== `writing-${submission.id}-submitted-student`
      || (intent.actorUid !== submission.studentId && intent.actorUid !== context?.assigningTeacherId)) return null;
    return {
      recipientId: submission.studentId,
      notification: {
        type: 'success', title: 'Writing submitted',
        message: 'Your writing submission has been received for review.',
        link: buildRoute('STUDENT_ACADEMIC_RECORD'),
      },
    };
  }

  const teacherId = context?.selectedTeacherId;
  if (intent.kind !== 'writing-submitted-teacher' || context?.type !== 'solo-practice'
    || intent.eventId !== `writing-${submission.id}-submitted-teacher`
    || intent.actorUid !== submission.studentId || typeof teacherId !== 'string'
    || !ID.test(teacherId) || !teacherLinkVerified) return null;
  return {
    recipientId: teacherId,
    notification: {
      type: 'info', title: 'New writing submission',
      message: 'A student submitted writing for review.',
      link: buildRoute('TEACHER_GRADING_DETAIL', { submissionId: submission.id }),
    },
  };
};
