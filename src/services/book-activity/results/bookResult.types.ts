import type {
  BookDeliveryContextKind,
} from '../../book-delivery/bookDelivery.types';
import type {
  BookRuntimeAttemptIndexRecord,
  BookRuntimeAttemptRecord,
  BookRuntimeCompletionRecord,
  BookRuntimeResultRecord,
  BookRuntimeScore,
  BookRuntimeSourceProvenance,
} from '../activityRuntimeAttempt.types';

/** The schema is deliberately independent from legacy academic result rows. */
export const BOOK_RESULT_PROJECTION_SCHEMA_VERSION = 1 as const;
export type BookResultProjectionSchemaVersion = typeof BOOK_RESULT_PROJECTION_SCHEMA_VERSION;

/** Canonical opaque handle used by projections, indexes, and browser routes. */
export const bookResultGroupKey = (studentId: string, activityId: string): string => {
  const bytes = new TextEncoder().encode(JSON.stringify([studentId, activityId]));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  if (typeof btoa !== 'function') throw new Error('book_result_group_encoding_unavailable');
  return `g_${btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '')}`;
};

export type BookResultSourceAvailability =
  | 'available'
  | 'missing'
  | 'deleted'
  | 'replaced'
  | 'invalidated'
  | 'not-required';

export type BookResultSurface = 'solo' | 'homework' | 'unknown';

export type BookResultEvaluationStatus = 'pending_review' | 'submitted' | 'graded';

export type BookResultFeedbackRelease =
  | 'pending'
  | 'released'
  | 'withheld'
  | 'not-applicable';

export type BookResultCompletionStatus = 'completed' | 'not-completed';

/**
 * A source reference is historical display metadata only.  It intentionally
 * has no URL, provider key, signed token, or PDF/document authority.
 */
export interface BookResultSourceProjection {
  readonly sourceKey: string;
  readonly componentId: string;
  readonly sourceVersionId: string;
  readonly pages: readonly number[];
  readonly availability: BookResultSourceAvailability;
  readonly available: boolean;
  readonly displayOnly: boolean;
}

export interface BookResultSourceAvailabilityInput {
  readonly sourceKey: string;
  readonly sourceVersionId?: string;
  readonly componentId?: string;
  readonly pages?: readonly number[];
  readonly availability: BookResultSourceAvailability;
}

export type BookResultSourceAvailabilityMap = Readonly<Record<
  string,
  BookResultSourceAvailability
  | {
    readonly sourceVersionId?: string;
    readonly availability: BookResultSourceAvailability;
  }
>>;

export interface BookResultEvaluation {
  readonly status: BookResultEvaluationStatus;
  readonly score?: BookResultScore;
  readonly earnedScore?: number;
  readonly maximumScore?: number;
  readonly displayScore?: string;
  readonly evaluatedAt?: string;
  readonly revision?: number;
  readonly correctionNote?: string;
}

export interface BookResultScore {
  readonly earnedScore: number;
  readonly maximumScore: number;
  readonly displayScore: string;
}

export interface BookResultFeedbackInput {
  readonly release?: BookResultFeedbackRelease;
  readonly text?: string;
  readonly correctionNote?: string;
  readonly releasedAt?: string;
}

export interface BookResultFeedback {
  readonly release: BookResultFeedbackRelease;
  readonly available: boolean;
  readonly text?: string;
  readonly correctionNote?: string;
  readonly releasedAt?: string;
}

export interface BookResultAttemptPolicy {
  readonly maxAttempts: number | null;
}

export interface BookResultContextPolicy extends BookResultAttemptPolicy {
  readonly contextId: string;
  readonly placementId: string;
}

/** Optional facts supplied by the trusted context/feedback reader. */
export interface BookResultProjectionContext {
  readonly kind?: Exclude<BookDeliveryContextKind, 'preview' | 'course' | 'class' | 'future_live'>;
  readonly contextId?: string;
  /** Exact delivery/binding context identity; never inferred from a bare book ID. */
  readonly deliveryId?: string;
  readonly ownerId?: string;
  /** Homework owner/assignment snapshot, present only for Homework context. */
  readonly homeworkId?: string;
}

/**
 * The four immutable terminal rows emitted by #76.  The projection service
 * never creates or repairs these rows; it only verifies their relationship.
 */
export interface BookResultTerminalRecords {
  readonly attempt: BookRuntimeAttemptRecord;
  readonly result: BookRuntimeResultRecord;
  readonly completion: BookRuntimeCompletionRecord;
  readonly index: BookRuntimeAttemptIndexRecord;
}

export interface BookResultProjectionInput extends BookResultTerminalRecords {
  readonly context?: BookResultProjectionContext;
  /** Alias accepted for callers that already use the Delivery surface name. */
  readonly surface?: Exclude<BookDeliveryContextKind, 'preview' | 'course' | 'class' | 'future_live'>;
  /** Submission time is distinct from the terminal-row creation time when supplied by the writer. */
  readonly submittedAt?: string;
  readonly attemptPolicy?: BookResultAttemptPolicy;
  readonly evaluation?: BookResultEvaluation | null;
  readonly feedback?: BookResultFeedbackInput | null;
  readonly sourceAvailability?: BookResultSourceAvailabilityMap | readonly BookResultSourceAvailabilityInput[];
  /** Alias for integrations that call source metadata `sources`. */
  readonly sources?: readonly BookResultSourceAvailabilityInput[];
}

export interface BookResultAttemptIdentity {
  readonly attemptId: string;
  readonly resultId: string;
  readonly completionId: string;
  readonly recipientId: string;
  readonly activityId: string;
  readonly contextId: string;
  readonly placementId: string;
  readonly bindingId: string;
  readonly bindingRevision: number;
  readonly activityVersionId: string;
  readonly activityVersion: number;
  readonly interactionId: string;
  readonly attemptNumber: number;
}

export interface BookResultAttemptSummary extends BookResultAttemptIdentity {
  readonly schemaVersion: BookResultProjectionSchemaVersion;
  readonly studentId: string;
  readonly surface: BookResultSurface;
  readonly deliveryContextId: string;
  readonly deliveryId: string;
  readonly ownerId: string | null;
  readonly homeworkId: string | null;
  readonly pageGroupKeys: readonly string[];
  readonly sourceProvenance: readonly BookRuntimeSourceProvenance[];
  readonly sources: readonly BookResultSourceProjection[];
  readonly sourceAvailability: BookResultSourceAvailability;
  readonly sourceAvailable: boolean;
  readonly createdAt: string;
  readonly submittedAt: string;
  readonly completedAt: string;
  readonly resultStatus: BookRuntimeResultRecord['status'];
  readonly evaluationStatus: BookResultEvaluationStatus;
  readonly completionStatus: BookResultCompletionStatus;
  readonly completion: BookResultCompletionSnapshot;
  readonly evaluation: BookResultEvaluation;
  readonly feedback: BookResultFeedback;
  readonly attemptLimit: number | null;
  readonly attemptsUsed: number;
  readonly attemptsRemaining: number | null;
}

export interface BookResultCompletionSnapshot {
  readonly completionId: string;
  readonly attemptId: string;
  readonly resultId: string;
  readonly status: 'completed';
  readonly contextId: string;
  readonly placementId: string;
  readonly activityVersionId: string;
  readonly activityVersion: number;
  readonly createdAt: string;
}

export interface BookResultAttemptDetail extends BookResultAttemptSummary {
  /** Student response content is retained as opaque submitted data. */
  readonly response: unknown;
}

export interface BookResultProjection {
  readonly schemaVersion: BookResultProjectionSchemaVersion;
  readonly summary: BookResultAttemptSummary;
  readonly detail: BookResultAttemptDetail;
}

export interface BookResultContextSummary {
  readonly contextId: string;
  readonly placementId: string;
  readonly surface: BookResultSurface;
  readonly attemptLimit: number | null;
  readonly attemptsUsed: number;
  readonly attemptsRemaining: number | null;
  readonly completionStatus: BookResultCompletionStatus;
  readonly latestAttemptId: string;
  readonly attemptIds: readonly string[];
}

export interface BookResultGroupSummary {
  /** Stable viewer/query key; it is not an attempt or completion identity. */
  readonly groupKey: string;
  readonly recipientId: string;
  readonly studentId: string;
  readonly activityId: string;
  readonly attemptCount: number;
  readonly attempts: readonly BookResultAttemptSummary[];
  readonly contexts: readonly BookResultContextSummary[];
  readonly latestAttemptId: string;
}

export interface BookResultGroupingOptions {
  readonly attemptPolicy?: BookResultAttemptPolicy;
  readonly contextPolicies?: readonly BookResultContextPolicy[];
  readonly maxAttemptsByContext?: Readonly<Record<string, number | null>>;
}

export interface BookResultProjectionValidationError {
  readonly code:
    | 'invalid-record'
    | 'unknown-field'
    | 'missing-field'
    | 'invalid-value'
    | 'identity-mismatch'
    | 'provenance-mismatch'
    | 'duplicate-id'
    | 'unsupported-context';
  readonly path: string;
  readonly message: string;
}

export interface BookResultProjectionValidationResult {
  readonly valid: boolean;
  readonly errors: readonly BookResultProjectionValidationError[];
}

export type BookResultProjectionInputLike = BookResultProjectionInput | BookResultProjection;
