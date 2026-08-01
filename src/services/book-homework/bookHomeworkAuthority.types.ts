import type {
  BookHomeworkManifest,
  BookHomeworkScheduleRule,
  BookHomeworkStudentSafeProjection,
} from '../../types/homework.types';

export const BOOK_HOMEWORK_AUTHORITY_SCHEMA_VERSION = 1 as const;
export const BOOK_HOMEWORK_SCHEDULE_RESOLVER_VERSION = 1 as const;

export type BookHomeworkSagaState = 'prepared' | 'committed' | 'compensating';
export type BookHomeworkStudentState = 'not-started' | 'in-progress' | 'submitted';

export interface BookHomeworkActivityPolicySnapshot {
  readonly schemaVersion: 1;
  readonly policyId: string;
  readonly policyRevision: number;
  readonly placementId: string;
  readonly activityId: string;
  readonly activityVersionId: string;
  readonly activityVersion: number;
  readonly lateSubmissionAllowed: boolean;
  readonly maxAttempts: number | null;
}

export interface BookHomeworkAuthoritySchedule {
  readonly schemaVersion: typeof BOOK_HOMEWORK_AUTHORITY_SCHEMA_VERSION;
  readonly resolverVersion: typeof BOOK_HOMEWORK_SCHEDULE_RESOLVER_VERSION;
  readonly availableFrom?: string;
  readonly finalDueAt: string;
  readonly scheduleRules: readonly BookHomeworkScheduleRule[];
}

export interface BookHomeworkStudentExtension {
  readonly nodeKey: string;
  readonly dueAt: string;
  readonly grantedBy: string;
  readonly commandId: string;
  readonly updatedAt: string;
}

export interface BookHomeworkVisibilityPointer {
  readonly status: BookHomeworkSagaState;
  readonly pointerId: string;
  readonly manifestVersionId: string;
  readonly revision: number;
}

export interface BookHomeworkSagaRecord {
  readonly sagaId: string;
  readonly state: BookHomeworkSagaState;
  readonly lastCommandId: string;
}

export interface BookHomeworkAuthorityMutationResult {
  readonly status: 'created' | 'updated' | 'replayed' | 'committed' | 'compensating' | 'recovered';
  readonly assignmentId: string;
  readonly revision: number;
  readonly visibility: BookHomeworkSagaState;
}

export interface BookHomeworkOperationRecord {
  readonly fingerprint: string;
  readonly result: BookHomeworkAuthorityMutationResult;
  readonly createdAt: string;
}

export interface BookHomeworkAuthorityRecord {
  readonly assignmentId: string;
  readonly assignmentKind: 'book_activity_bundle';
  readonly schemaVersion: typeof BOOK_HOMEWORK_AUTHORITY_SCHEMA_VERSION;
  readonly ownerId: string;
  readonly bookManifest: BookHomeworkManifest;
  readonly schedule: BookHomeworkAuthoritySchedule;
  /** Frozen assignment policy. Older records may omit it and fail closed at trusted runtime use. */
  readonly activityPolicies?: Readonly<Record<string, BookHomeworkActivityPolicySnapshot>>;
  readonly studentExtensions: Readonly<Record<string, Readonly<Record<string, BookHomeworkStudentExtension>>>>;
  readonly saga: BookHomeworkSagaRecord;
  readonly visibility: BookHomeworkVisibilityPointer;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly operations?: Readonly<Record<string, BookHomeworkOperationRecord>>;
}

export interface BookHomeworkCreateCommand {
  readonly assignmentId: string;
  readonly ownerId: string;
  readonly manifest: BookHomeworkManifest;
  readonly schedule: BookHomeworkAuthoritySchedule;
  readonly activityPolicies: Readonly<Record<string, BookHomeworkActivityPolicySnapshot>>;
  readonly sagaId: string;
  readonly commandId: string;
  readonly idempotencyKey: string;
  readonly expectedRevision: 0;
  readonly createdAt: string;
}

export interface BookHomeworkScheduleCommand {
  readonly assignmentId: string;
  readonly ownerId: string;
  readonly schedule: BookHomeworkAuthoritySchedule;
  readonly changedNodeKey: string;
  readonly commandId: string;
  readonly idempotencyKey: string;
  readonly expectedRevision: number;
  readonly updatedAt: string;
}

export interface BookHomeworkStudentExtensionCommand {
  readonly assignmentId: string;
  readonly ownerId: string;
  readonly studentId: string;
  readonly nodeKey: string;
  readonly dueAt: string;
  readonly commandId: string;
  readonly idempotencyKey: string;
  readonly expectedRevision: number;
  readonly updatedAt: string;
}

export interface BookHomeworkVisibilityCommand {
  readonly assignmentId: string;
  readonly ownerId: string;
  readonly state: Extract<BookHomeworkSagaState, 'committed' | 'compensating'>;
  readonly commandId: string;
  readonly idempotencyKey: string;
  readonly expectedRevision: number;
  readonly updatedAt: string;
}

export interface BookHomeworkRecoveryCommand {
  readonly assignmentId: string;
  readonly ownerId: string;
  readonly state: Extract<BookHomeworkSagaState, 'committed' | 'compensating'>;
  readonly commandId: string;
  readonly idempotencyKey: string;
  readonly expectedRevision: number;
  readonly updatedAt: string;
}

export interface BookHomeworkStudentProjection {
  readonly assignmentId: string;
  readonly schemaVersion: typeof BOOK_HOMEWORK_AUTHORITY_SCHEMA_VERSION;
  readonly assignmentKind: 'book_activity_bundle';
  readonly manifestVersionId: string;
  readonly bookManifest: BookHomeworkStudentSafeProjection;
  readonly schedule: BookHomeworkAuthoritySchedule;
  readonly studentExtensions: Readonly<Record<string, BookHomeworkStudentExtension>>;
}
