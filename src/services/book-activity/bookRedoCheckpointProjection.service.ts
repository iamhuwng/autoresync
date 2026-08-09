export const BOOK_REDO_CHECKPOINT_SCHEMA_VERSION = 1 as const;

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

export type BookRedoStudentLifecycle =
  | 'not-started'
  | 'in-progress'
  | 'submitted'
  | 'completed';

export type BookRedoFeedbackRelease = 'hidden' | 'released';

export interface BookRedoVisiblePriorResult {
  readonly status: 'pending_review' | 'submitted' | 'graded';
  readonly score?: {
    readonly earnedScore: number;
    readonly maximumScore: number;
    readonly displayScore: string;
  };
  readonly feedback?: string;
  readonly correctionNote?: string;
}

export interface BookRedoCheckpointActivityInput {
  readonly contextKey: string;
  readonly placementId: string;
  readonly activityId: string;
  readonly oldActivityVersionId: string;
  readonly oldSourceVersionIds: readonly string[];
  readonly lifecycle: BookRedoStudentLifecycle;
  readonly priorAnswer: unknown;
  readonly priorResult?: BookRedoVisiblePriorResult;
  readonly feedbackRelease: BookRedoFeedbackRelease;
  readonly changed: boolean;
  readonly removalOnly?: boolean;
}

export interface BookRedoCheckpointActivity {
  readonly placementId: string;
  readonly activityId: string;
  readonly oldActivityVersionId: string;
  /** Historical source links only; no document authority is stored here. */
  readonly oldSourceVersionIds: readonly string[];
  readonly priorStatus: Exclude<BookRedoStudentLifecycle, 'not-started'>;
  /** The student's own previous answer remains visible in every release mode. */
  readonly priorAnswer: unknown;
  readonly feedbackRelease: BookRedoFeedbackRelease;
  /** Score/feedback are omitted when the original release policy withheld them. */
  readonly priorResult?: BookRedoVisiblePriorResult;
}

export interface BookRedoCheckpoint {
  readonly schemaVersion: typeof BOOK_REDO_CHECKPOINT_SCHEMA_VERSION;
  readonly checkpointId: string;
  readonly actionId: string;
  readonly ownerId: string;
  readonly bookId: string;
  readonly contextKey: string;
  readonly contextId: string;
  readonly studentId: string;
  readonly oldBindingId: string;
  readonly oldBindingRevision: number;
  readonly status: 'review-only';
  readonly reason: string;
  readonly activities: readonly BookRedoCheckpointActivity[];
  readonly auditContext: {
    readonly actionId: string;
    readonly contextKey: string;
    readonly contextId: string;
    readonly studentId: string;
    readonly oldBindingId: string;
    readonly oldBindingRevision: number;
    readonly reason: string;
  };
  readonly createdAt: string;
}

export interface BookRedoCheckpointInput {
  readonly actionId: string;
  readonly ownerId: string;
  readonly bookId: string;
  readonly contextKey: string;
  readonly contextId: string;
  readonly studentId: string;
  readonly oldBindingId: string;
  readonly oldBindingRevision: number;
  readonly reason: string;
  readonly createdAt: string;
  readonly activities: readonly BookRedoCheckpointActivityInput[];
}

export type BookRedoCheckpointProjectionResult =
  | { readonly status: 'checkpoint'; readonly checkpoint: BookRedoCheckpoint }
  | { readonly status: 'none' }
  | { readonly status: 'invalid'; readonly code: string };

const clone = <T>(value: T): T => structuredClone(value);

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Reflect.ownKeys(value).forEach((key) => {
      deepFreeze((value as Record<PropertyKey, unknown>)[key]);
    });
  }
  return value;
};

const validIso = (value: unknown): value is string => (
  typeof value === 'string'
  && ISO.test(value)
  && Number.isFinite(Date.parse(value))
  && new Date(Date.parse(value)).toISOString() === value
);

const validId = (value: unknown): value is string => typeof value === 'string' && ID.test(value);

const validPriorResult = (value: unknown): value is BookRedoVisiblePriorResult => {
  if (value === undefined) return true;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  if (!['pending_review', 'submitted', 'graded'].includes(String(result.status))) return false;
  if (result.score !== undefined) {
    if (result.score === null || typeof result.score !== 'object' || Array.isArray(result.score)) return false;
    const score = result.score as Record<string, unknown>;
    if (typeof score.earnedScore !== 'number'
      || !Number.isFinite(score.earnedScore)
      || typeof score.maximumScore !== 'number'
      || !Number.isFinite(score.maximumScore)
      || score.earnedScore < 0
      || score.maximumScore < score.earnedScore
      || typeof score.displayScore !== 'string') return false;
  }
  return (result.feedback === undefined || typeof result.feedback === 'string')
    && (result.correctionNote === undefined || typeof result.correctionNote === 'string');
};

const checkpointIdFor = (actionId: string, contextKey: string, studentId: string): string => (
  `${actionId}:${contextKey}:${studentId}`
);

export const bookRedoCheckpointId = checkpointIdFor;

const validActivity = (value: BookRedoCheckpointActivityInput): boolean => (
  value !== null
  && typeof value === 'object'
  && validId(value.contextKey)
  && validId(value.placementId)
  && validId(value.activityId)
  && validId(value.oldActivityVersionId)
  && Array.isArray(value.oldSourceVersionIds)
  && value.oldSourceVersionIds.every(validId)
  && new Set(value.oldSourceVersionIds).size === value.oldSourceVersionIds.length
  && ['not-started', 'in-progress', 'submitted', 'completed'].includes(value.lifecycle)
  && (value.feedbackRelease === 'hidden' || value.feedbackRelease === 'released')
  && Object.hasOwn(value, 'priorAnswer')
  && typeof value.changed === 'boolean'
  && (value.removalOnly === undefined || typeof value.removalOnly === 'boolean')
  && validPriorResult(value.priorResult)
);

const validProjectedActivity = (value: unknown): value is BookRedoCheckpointActivity => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const activity = value as Record<string, unknown>;
  if (!validId(activity.placementId)
    || !validId(activity.activityId)
    || !validId(activity.oldActivityVersionId)
    || !Array.isArray(activity.oldSourceVersionIds)
    || !activity.oldSourceVersionIds.every(validId)
    || new Set(activity.oldSourceVersionIds).size !== activity.oldSourceVersionIds.length
    || !['in-progress', 'submitted', 'completed'].includes(String(activity.priorStatus))
    || (activity.feedbackRelease !== 'hidden' && activity.feedbackRelease !== 'released')
    || !Object.hasOwn(activity, 'priorAnswer')
    || (activity.feedbackRelease === 'hidden' && activity.priorResult !== undefined)
    || !validPriorResult(activity.priorResult)
    || Object.hasOwn(activity, 'completion')
    || Object.hasOwn(activity, 'currentGrade')
    || Object.hasOwn(activity, 'pdfAuthority')
    || Object.hasOwn(activity, 'documentRequest')) return false;
  return true;
};

/**
 * Builds the immutable, student-specific previous-version projection for one
 * redo action. Not-started and removal-only work is deliberately filtered out.
 */
export const createBookRedoCheckpointProjection = (
  input: BookRedoCheckpointInput,
): BookRedoCheckpointProjectionResult => {
  if (!validId(input.actionId)
    || !validId(input.ownerId)
    || !validId(input.bookId)
    || !validId(input.contextKey)
    || !validId(input.contextId)
    || !validId(input.studentId)
    || !validId(input.oldBindingId)
    || !Number.isSafeInteger(input.oldBindingRevision)
    || input.oldBindingRevision < 1
    || typeof input.reason !== 'string'
    || input.reason.trim() !== input.reason
    || input.reason.length === 0
    || input.reason.length > 500
    || !validIso(input.createdAt)
    || !Array.isArray(input.activities)
    || input.activities.length === 0
    || input.activities.some((activity) => !validActivity(activity)
      || activity.contextKey !== input.contextKey)) {
    return { status: 'invalid', code: 'checkpoint-input-invalid' };
  }
  const selected = input.activities
    .filter((activity) => activity.changed
      && activity.removalOnly !== true
      && activity.lifecycle !== 'not-started')
    .map((activity): BookRedoCheckpointActivity => ({
      placementId: activity.placementId,
      activityId: activity.activityId,
      oldActivityVersionId: activity.oldActivityVersionId,
      oldSourceVersionIds: [...activity.oldSourceVersionIds].sort(),
      priorStatus: activity.lifecycle as Exclude<BookRedoStudentLifecycle, 'not-started'>,
      priorAnswer: clone(activity.priorAnswer),
      feedbackRelease: activity.feedbackRelease,
      ...(activity.feedbackRelease === 'released' && activity.priorResult !== undefined
        ? { priorResult: clone(activity.priorResult) }
        : {}),
    }));
  if (selected.length === 0) return { status: 'none' };
  const duplicatePlacement = new Set(selected.map((activity) => activity.placementId)).size !== selected.length;
  if (duplicatePlacement) return { status: 'invalid', code: 'checkpoint-duplicate-placement' };
  const checkpointId = checkpointIdFor(input.actionId, input.contextKey, input.studentId);
  if (!validId(checkpointId)) return { status: 'invalid', code: 'checkpoint-identity-invalid' };
  selected.sort((left, right) => left.placementId.localeCompare(right.placementId));
  const checkpoint: BookRedoCheckpoint = {
    schemaVersion: BOOK_REDO_CHECKPOINT_SCHEMA_VERSION,
    checkpointId,
    actionId: input.actionId,
    ownerId: input.ownerId,
    bookId: input.bookId,
    contextKey: input.contextKey,
    contextId: input.contextId,
    studentId: input.studentId,
    oldBindingId: input.oldBindingId,
    oldBindingRevision: input.oldBindingRevision,
    status: 'review-only',
    reason: input.reason,
    activities: selected,
    auditContext: {
      actionId: input.actionId,
      contextKey: input.contextKey,
      contextId: input.contextId,
      studentId: input.studentId,
      oldBindingId: input.oldBindingId,
      oldBindingRevision: input.oldBindingRevision,
      reason: input.reason,
    },
    createdAt: input.createdAt,
  };
  return { status: 'checkpoint', checkpoint: deepFreeze(checkpoint) };
};

export const projectBookRedoCheckpoint = createBookRedoCheckpointProjection;

export const isBookRedoCheckpoint = (value: unknown): value is BookRedoCheckpoint => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const checkpoint = value as Record<string, unknown>;
  if (checkpoint.schemaVersion !== BOOK_REDO_CHECKPOINT_SCHEMA_VERSION
    || checkpoint.status !== 'review-only'
    || !validId(checkpoint.checkpointId)
    || !validId(checkpoint.actionId)
    || !validId(checkpoint.ownerId)
    || !validId(checkpoint.bookId)
    || !validId(checkpoint.contextKey)
    || !validId(checkpoint.contextId)
    || !validId(checkpoint.studentId)
    || !validId(checkpoint.oldBindingId)
    || !Number.isSafeInteger(checkpoint.oldBindingRevision)
    || (checkpoint.oldBindingRevision as number) < 1
    || !validIso(checkpoint.createdAt)
    || typeof checkpoint.reason !== 'string'
    || checkpoint.reason.trim() !== checkpoint.reason
    || checkpoint.reason.length === 0
    || checkpoint.reason.length > 500
    || !Array.isArray(checkpoint.activities)
    || checkpoint.activities.length === 0
    || checkpoint.activities.some((activity) => !validProjectedActivity(activity))) return false;
  const audit = checkpoint.auditContext;
  if (audit === null || typeof audit !== 'object' || Array.isArray(audit)) return false;
  const auditRecord = audit as Record<string, unknown>;
  if (auditRecord.actionId !== checkpoint.actionId
    || auditRecord.contextKey !== checkpoint.contextKey
    || auditRecord.contextId !== checkpoint.contextId
    || auditRecord.studentId !== checkpoint.studentId
    || auditRecord.oldBindingId !== checkpoint.oldBindingId
    || auditRecord.oldBindingRevision !== checkpoint.oldBindingRevision
    || auditRecord.reason !== checkpoint.reason) return false;
  return checkpoint.checkpointId === checkpointIdFor(
    checkpoint.actionId,
    checkpoint.contextKey,
    checkpoint.studentId,
  )
    && !Object.hasOwn(checkpoint, 'completion')
    && !Object.hasOwn(checkpoint, 'currentGrade')
    && !Object.hasOwn(checkpoint, 'pdfAuthority')
    && !Object.hasOwn(checkpoint, 'documentRequest');
};
