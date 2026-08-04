import type { BookHomeworkManifest } from '../../types/homework.types';

/**
 * The progress projection is deliberately independent from legacy homework
 * grades.  It describes completion and Activity-level grading only.
 */
export const BOOK_HOMEWORK_PROGRESS_SCHEMA_VERSION = 1 as const;

export type BookHomeworkProgressGradingState =
  | 'ungraded'
  | 'scored'
  | 'review_required';

export interface BookHomeworkProgressScore {
  readonly earnedScore: number;
  readonly maximumScore: number;
  readonly displayScore?: string;
}

/**
 * Terminal result facts are the small, trusted input needed by the pure
 * aggregation service.  The optional aliases let callers pass the shape
 * emitted by the Book Runtime (`status`/`score`) or a normalized projection
 * (`gradingState`) without making the service depend on a repository record.
 */
export interface BookHomeworkTerminalResultFact {
  readonly status?: 'pending_review' | 'submitted';
  readonly gradingState?: BookHomeworkProgressGradingState | 'graded' | 'pending_review' | 'submitted';
  readonly state?: BookHomeworkProgressGradingState | 'graded' | 'pending_review' | 'submitted';
  readonly score?:
    | BookHomeworkProgressScore
    | { readonly status: 'scored'; readonly earnedScore: number; readonly maximumScore: number; readonly displayScore: string }
    | { readonly status: 'review_required' };
}

export interface BookHomeworkTerminalFact {
  /** One or more immutable terminal identifiers, when supplied by Runtime. */
  readonly terminalId?: string;
  readonly attemptId?: string;
  readonly resultId?: string;
  readonly completionId?: string;
  readonly attemptNumber?: number;
  readonly createdAt?: string;

  /** Exact identity dimensions required for Homework aggregation. */
  readonly recipientId: string;
  readonly contextId: string;
  readonly bindingId: string;
  readonly bindingRevision: number;
  readonly placementId: string;
  readonly activityId: string;
  readonly activityVersion: number;
  readonly activityVersionId: string;
  /** Trusted Activity-level terminal boundary; interaction-only rows are not valid facts. */
  readonly submissionScope: 'activity';
  readonly requiredInteractionIds: readonly string[];
  readonly submittedInteractionIds: readonly string[];

  /** Canonical normalized result, or the equivalent top-level aliases. */
  readonly result?: BookHomeworkTerminalResultFact;
  readonly status?: 'pending_review' | 'submitted';
  readonly gradingState?: BookHomeworkProgressGradingState | 'graded' | 'pending_review' | 'submitted';
  readonly score?: BookHomeworkTerminalResultFact['score'];
}

export interface BookHomeworkProgressInput {
  readonly manifest: BookHomeworkManifest;
  /** Delivery-level binding identity carried by trusted Runtime terminal rows. */
  readonly deliveryBindingId: string;
  readonly terminalFacts?: readonly BookHomeworkTerminalFact[];
  /** Alias for adapters that call terminal facts simply `facts`. */
  readonly facts?: readonly BookHomeworkTerminalFact[];
}

export interface BookHomeworkProgressCompletion {
  readonly submittedCount: number;
  readonly requiredCount: number;
  readonly status: 'not_started' | 'in_progress' | 'completed';
  readonly isComplete: boolean;
}

export interface BookHomeworkProgressGrading {
  readonly scoredCount: number;
  readonly pendingReviewCount: number;
  readonly ungradedSubmittedCount: number;
}

export interface BookHomeworkProgressActivity {
  readonly bindingId: string;
  readonly placementId: string;
  readonly activityId: string;
  readonly activityVersion: number;
  readonly activityVersionId: string;
  readonly order: number;
  readonly contextMode: 'none' | 'optional' | 'required';
  readonly submitted: boolean;
  readonly gradingState: BookHomeworkProgressGradingState;
  readonly score?: BookHomeworkProgressScore;
  readonly terminalId?: string;
}

export type BookHomeworkProgressHistoricalReason =
  | 'excluded-binding'
  | 'removed-binding'
  | 'context-mismatch'
  | 'binding-mismatch'
  | 'binding-revision-mismatch'
  | 'activity-mismatch'
  | 'activity-version-mismatch'
  | 'activity-version-id-mismatch'
  | 'duplicate';

/**
 * Historical rows are retained for audit/result navigation, but are never
 * included in current completion or grading counts.
 */
export interface BookHomeworkProgressHistoricalRow {
  readonly reason: BookHomeworkProgressHistoricalReason;
  readonly source: 'manifest-binding' | 'terminal-fact';
  /** Delivery binding identity from a terminal fact, when present. */
  readonly deliveryBindingId?: string;
  /** Activity binding identity from the current/previous manifest, when present. */
  readonly activityBindingId?: string;
  readonly placementId: string;
  readonly activityId?: string;
  readonly activityVersion?: number;
  readonly activityVersionId?: string;
  readonly bindingRevision?: number;
  readonly recipientId?: string;
  readonly contextId?: string;
  readonly terminalId?: string;
  readonly gradingState?: BookHomeworkProgressGradingState;
  readonly score?: BookHomeworkProgressScore;
}

export interface BookHomeworkProgressProjection {
  readonly schemaVersion: typeof BOOK_HOMEWORK_PROGRESS_SCHEMA_VERSION;
  readonly manifestVersionId: string;
  readonly recipientId: string;
  readonly contextId: string;
  readonly deliveryBindingId: string;
  readonly bindingRevision: number;
  readonly completion: BookHomeworkProgressCompletion;
  readonly grading: BookHomeworkProgressGrading;
  readonly activities: readonly BookHomeworkProgressActivity[];
  readonly excludedHistoricalRows: readonly BookHomeworkProgressHistoricalRow[];
}

export interface BookHomeworkProgressValidationError {
  readonly path: string;
  readonly message: string;
}

export interface BookHomeworkProgressValidationResult {
  readonly valid: boolean;
  readonly errors: readonly BookHomeworkProgressValidationError[];
}
