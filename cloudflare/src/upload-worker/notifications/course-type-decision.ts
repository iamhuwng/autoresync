import { buildRoute } from '../../../../src/constants/routes.ts';
import type { NotificationCommandRepository } from './repository.ts';

export interface CourseTypeDecisionRecord {
  readonly id?: unknown;
  readonly teacherId?: unknown;
  readonly typeName?: unknown;
  readonly status?: unknown;
  readonly approvedBy?: unknown;
  readonly approvedAt?: unknown;
  readonly handledBy?: unknown;
  readonly handledAt?: unknown;
  readonly rejectionReason?: unknown;
  readonly notificationIntent?: unknown;
}

export interface CourseTypeDecisionNotice {
  readonly operationId: string;
  readonly recipientId: string;
  readonly occurredAt: number;
  readonly notification: {
    readonly type: 'success' | 'error';
    readonly title: string;
    readonly message: string;
    readonly link: string;
  };
}

const record = (value: unknown): Record<string, unknown> | null => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null
);

const hash32 = (value: string, seed: number): number => {
  let hash = (2166136261 ^ seed) >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619) >>> 0;
  }
  return hash;
};

const operationId = (requestId: string, status: 'approved' | 'rejected', recipientId: string): string => {
  const key = `course-type-${status}:${requestId}:${recipientId}`;
  const hex = [0, 1, 2, 3]
    .map((seed) => hash32(`${key}:${seed}`, seed).toString(16).padStart(8, '0'))
    .join('');
  const versioned = `${hex.slice(0, 12)}5${hex.slice(13, 16)}8${hex.slice(17)}`;
  return `${versioned.slice(0, 8)}-${versioned.slice(8, 12)}-${versioned.slice(12, 16)}-${versioned.slice(16, 20)}-${versioned.slice(20)}`;
};

export const resolveCourseTypeDecisionNotice = (
  requestId: string,
  value: CourseTypeDecisionRecord,
): CourseTypeDecisionNotice | null => {
  const status = value.status;
  if (value.id !== requestId || typeof value.teacherId !== 'string' || !value.teacherId
    || typeof value.typeName !== 'string' || !value.typeName.trim()
    || (status !== 'approved' && status !== 'rejected')) return null;

  const intent = record(value.notificationIntent);
  const occurredAt = status === 'approved' ? value.approvedAt : value.handledAt;
  const actor = status === 'approved' ? value.approvedBy : value.handledBy;
  const retryShape = (intent?.state === 'due' && intent.attempts === 0)
    || (intent?.state === 'sending' && intent.attempts === 1)
    || (intent?.state === 'retry_due' && intent.attempts === 1)
    || (intent?.state === 'retrying' && intent.attempts === 2);
  if (!intent || intent.eventKind !== `course-type-${status}`
    || intent.authorityRecordId !== requestId
    || intent.occurrenceId !== `${requestId}_${status}`
    || intent.occurredAt !== occurredAt || typeof occurredAt !== 'number'
    || typeof intent.dueAt !== 'number' || !retryShape
    || typeof actor !== 'string' || !actor
    || Object.keys(intent).sort().join(',') !==
      ['attempts', 'authorityRecordId', 'dueAt', 'eventKind', 'occurredAt', 'occurrenceId', 'state'].sort().join(',')) return null;

  const typeName = value.typeName.trim().slice(0, 120);
  const rejectedReason = typeof value.rejectionReason === 'string'
    ? value.rejectionReason.trim().slice(0, 300) : '';
  return {
    operationId: operationId(requestId, status, value.teacherId),
    recipientId: value.teacherId,
    occurredAt,
    notification: status === 'approved'
      ? {
        type: 'success',
        title: 'Course Type Approved',
        message: `Your request for course type "${typeName}" has been approved. You can now use it when creating courses.`,
        link: buildRoute('TEACHER_COURSES'),
      }
      : {
        type: 'error',
        title: 'Course Type Rejected',
        message: `Your request for course type "${typeName}" was rejected${rejectedReason ? `: ${rejectedReason}` : '.'}`,
        link: buildRoute('TEACHER_COURSES'),
      },
  };
};

export const deliverCourseTypeDecisionNotice = async (
  requestId: string,
  value: CourseTypeDecisionRecord,
  repository: NotificationCommandRepository,
): Promise<boolean> => {
  const notice = resolveCourseTypeDecisionNotice(requestId, value);
  if (!notice) return false;
  const result = await repository.create({
    operationId: notice.operationId,
    recipientId: notice.recipientId,
    notification: notice.notification,
    now: notice.occurredAt,
  });
  return result.status !== 'idempotency-conflict';
};
