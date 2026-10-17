export const BOOK_REMOVAL_HISTORICAL_PROJECTION_SCHEMA_VERSION = 1 as const;

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,159}$/u;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const MAX_REASON_LENGTH = 256;

export type BookRemovalHistoricalLifecycle =
  | 'not-started'
  | 'in-progress'
  | 'submitted'
  | 'completed';

export type BookRemovalFeedbackRelease = 'hidden' | 'released';

export interface BookRemovalHistoricalSource {
  readonly kind: 'none' | 'draft' | 'submission';
  readonly terminalId?: string;
  readonly attemptId?: string;
  readonly resultId?: string;
  readonly completionId?: string;
  readonly draftId?: string;
}

export interface BookRemovalHistoricalProjectionInput {
  readonly actionId: string;
  readonly ownerId: string;
  readonly bookId: string;
  /** Colon-delimited context keys are valid; slash-delimited keys are not. */
  readonly contextKey: string;
  readonly contextId: string;
  readonly studentId: string;
  readonly placementId: string;
  readonly activityId: string;
  readonly activityVersionId: string;
  readonly lifecycle: BookRemovalHistoricalLifecycle;
  readonly feedbackRelease: BookRemovalFeedbackRelease;
  readonly source?: BookRemovalHistoricalSource;
  readonly reason: string;
  readonly at: string;
}

export interface BookRemovalHistoricalProjection {
  readonly schemaVersion: typeof BOOK_REMOVAL_HISTORICAL_PROJECTION_SCHEMA_VERSION;
  readonly actionId: string;
  readonly ownerId: string;
  readonly bookId: string;
  readonly contextKey: string;
  readonly contextId: string;
  readonly studentId: string;
  readonly placementId: string;
  readonly activityId: string;
  readonly activityVersionId: string;
  readonly lifecycle: BookRemovalHistoricalLifecycle;
  readonly status: 'historical-excluded';
  readonly currentRequired: false;
  readonly feedbackRelease: BookRemovalFeedbackRelease;
  /** Source references are immutable pointers; answers/results are never copied or changed. */
  readonly source: BookRemovalHistoricalSource;
  readonly reason: string;
  readonly at: string;
}

export type BookRemovalHistoricalProjectionResult =
  | { readonly status: 'projected'; readonly projection: BookRemovalHistoricalProjection }
  | { readonly status: 'none' }
  | { readonly status: 'invalid'; readonly code: string };

const clone = <T>(value: T): T => structuredClone(value);

const validId = (value: unknown): value is string => typeof value === 'string' && ID.test(value);

const validIso = (value: unknown): value is string => (
  typeof value === 'string'
  && ISO.test(value)
  && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString() === value
);

const validSource = (value: BookRemovalHistoricalSource): boolean => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  if (!['none', 'draft', 'submission'].includes(value.kind)) return false;
  const ids = [value.terminalId, value.attemptId, value.resultId, value.completionId, value.draftId];
  if (ids.some((id) => id !== undefined && !validId(id))) return false;
  if (value.kind === 'none' && ids.some((id) => id !== undefined)) return false;
  if (value.kind === 'draft' && value.draftId === undefined) return false;
  if (value.kind === 'submission' && value.draftId !== undefined) return false;
  return true;
};

const validInput = (input: BookRemovalHistoricalProjectionInput): boolean => (
  input !== null
  && typeof input === 'object'
  && validId(input.actionId)
  && validId(input.ownerId)
  && validId(input.bookId)
  && validId(input.contextKey)
  && validId(input.contextId)
  && validId(input.studentId)
  && validId(input.placementId)
  && validId(input.activityId)
  && validId(input.activityVersionId)
  && ['not-started', 'in-progress', 'submitted', 'completed'].includes(input.lifecycle)
  && (input.feedbackRelease === 'hidden' || input.feedbackRelease === 'released')
  && validSource(input.source ?? { kind: 'none' })
  && typeof input.reason === 'string'
  && input.reason.trim() === input.reason
  && input.reason.length > 0
  && input.reason.length <= MAX_REASON_LENGTH
  && validIso(input.at)
);

/**
 * Build a read-only historical pointer for a removed placement.  The
 * not-started case has no historical row to surface; the current exclusion
 * fact is still applied by the removal completion projection.
 */
export const projectBookRemovalHistoricalProjection = (
  input: BookRemovalHistoricalProjectionInput,
): BookRemovalHistoricalProjectionResult => {
  if (!validInput(input)) return { status: 'invalid', code: 'historical-input-invalid' };
  if (input.lifecycle === 'not-started') {
    return { status: 'none' };
  }
  const projection: BookRemovalHistoricalProjection = {
    schemaVersion: BOOK_REMOVAL_HISTORICAL_PROJECTION_SCHEMA_VERSION,
    actionId: input.actionId,
    ownerId: input.ownerId,
    bookId: input.bookId,
    contextKey: input.contextKey,
    contextId: input.contextId,
    studentId: input.studentId,
    placementId: input.placementId,
    activityId: input.activityId,
    activityVersionId: input.activityVersionId,
    lifecycle: input.lifecycle,
    status: 'historical-excluded',
    currentRequired: false,
    feedbackRelease: input.feedbackRelease,
    source: clone(input.source ?? { kind: 'none' }),
    reason: input.reason,
    at: input.at,
  };
  return { status: 'projected', projection: clone(projection) };
};

export const createBookRemovalHistoricalProjection = projectBookRemovalHistoricalProjection;
export const projectBookRemovalHistoricalRow = projectBookRemovalHistoricalProjection;
