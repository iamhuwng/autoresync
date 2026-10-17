import type {
  BookHomeworkProgressActivity,
  BookHomeworkProgressCompletion,
  BookHomeworkProgressGrading,
  BookHomeworkProgressHistoricalRow,
  BookHomeworkProgressProjection,
} from './bookHomeworkProgress.types';
import {
  assertValidBookHomeworkProgressProjection,
} from './bookHomeworkProgress.service';

export const BOOK_REMOVAL_COMPLETION_PROJECTION_SCHEMA_VERSION = 1 as const;

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,159}$/u;
const MAX_REMOVALS = 512;
const MAX_REASON_LENGTH = 256;

const assertProgressProjection: (
  value: unknown,
) => asserts value is BookHomeworkProgressProjection = assertValidBookHomeworkProgressProjection;

export interface BookRemovalCompletionSelection {
  readonly actionId: string;
  readonly ownerId: string;
  readonly bookId: string;
  /** Colon-delimited context keys are valid; slash-delimited keys are not. */
  readonly contextKey: string;
  readonly contextId: string;
  readonly studentId: string;
  readonly placementId: string;
  readonly reason: string;
}

export interface BookRemovalCompletionExclusionFact extends BookRemovalCompletionSelection {
  readonly schemaVersion: typeof BOOK_REMOVAL_COMPLETION_PROJECTION_SCHEMA_VERSION;
  readonly status: 'excluded-from-current';
  readonly currentRequired: false;
}

/**
 * A removal projection can be fed back into this pure recalculation function
 * for replay or a later removal action.  Keep these additive fields optional
 * so the first removal can consume the existing progress projection shape.
 */
export type BookRemovalCompletionCurrentProjection = BookHomeworkProgressProjection & {
  readonly exclusions?: readonly BookRemovalCompletionExclusionFact[];
  readonly completionLatched?: boolean;
};

export interface BookRemovalCompletionProjection {
  readonly schemaVersion: typeof BOOK_REMOVAL_COMPLETION_PROJECTION_SCHEMA_VERSION;
  readonly manifestVersionId: string;
  readonly recipientId: string;
  readonly contextId: string;
  readonly deliveryBindingId: string;
  readonly bindingRevision: number;
  readonly completion: BookHomeworkProgressCompletion;
  readonly grading: BookHomeworkProgressGrading;
  readonly activities: readonly BookHomeworkProgressActivity[];
  readonly excludedHistoricalRows: readonly BookHomeworkProgressHistoricalRow[];
  readonly exclusions: readonly BookRemovalCompletionExclusionFact[];
  /** A completed Homework remains completed even when its active required set shrinks. */
  readonly completionLatched: boolean;
}

export interface BookRemovalCompletionProjectionInput {
  readonly current: BookRemovalCompletionCurrentProjection;
  readonly removals: readonly BookRemovalCompletionSelection[];
}

export type BookRemovalCompletionProjectionResult =
  | { readonly status: 'projected' | 'replayed'; readonly projection: BookRemovalCompletionProjection }
  | { readonly status: 'invalid'; readonly code: string };

const clone = <T>(value: T): T => structuredClone(value);

const validId = (value: unknown): value is string => typeof value === 'string' && ID.test(value);

const selectionKey = (selection: Pick<
  BookRemovalCompletionSelection,
  'contextKey' | 'contextId' | 'studentId' | 'placementId'
>): string => (
  `${selection.contextKey}\u0000${selection.contextId}\u0000${selection.studentId}\u0000${selection.placementId}`
);

const validSelection = (value: BookRemovalCompletionSelection): boolean => (
  value !== null
  && typeof value === 'object'
  && validId(value.actionId)
  && validId(value.ownerId)
  && validId(value.bookId)
  && validId(value.contextKey)
  && validId(value.contextId)
  && validId(value.studentId)
  && validId(value.placementId)
  && typeof value.reason === 'string'
  && value.reason.trim() === value.reason
  && value.reason.length > 0
  && value.reason.length <= MAX_REASON_LENGTH
);

const historicalKey = (row: BookHomeworkProgressHistoricalRow): string => (
  `${row.reason}\u0000${row.source}\u0000${row.placementId}\u0000${row.terminalId ?? ''}`
);

const historicalRowFor = (
  activity: BookHomeworkProgressActivity,
): BookHomeworkProgressHistoricalRow => ({
  reason: 'removed-binding',
  source: activity.terminalId ? 'terminal-fact' : 'manifest-binding',
  activityBindingId: activity.bindingId,
  placementId: activity.placementId,
  activityId: activity.activityId,
  activityVersion: activity.activityVersion,
  activityVersionId: activity.activityVersionId,
  ...(activity.terminalId ? { terminalId: activity.terminalId } : {}),
  ...(activity.terminalId && activity.submitted && activity.gradingState === 'scored' && activity.score
    ? { gradingState: activity.gradingState, score: activity.score }
    : activity.terminalId && activity.submitted
      ? { gradingState: activity.gradingState }
      : {}),
});

const aggregate = (
  activities: readonly BookHomeworkProgressActivity[],
  completionLatched: boolean,
): Pick<BookRemovalCompletionProjection, 'completion' | 'grading'> => {
  const submittedCount = activities.filter((activity) => activity.submitted).length;
  const status: BookHomeworkProgressCompletion['status'] = completionLatched
    ? 'completed'
    : submittedCount === 0
      ? 'not_started'
      : submittedCount === activities.length && activities.length > 0
        ? 'completed'
        : 'in_progress';
  return {
    completion: {
      submittedCount,
      requiredCount: activities.length,
      status,
      isComplete: status === 'completed',
    },
    grading: {
      scoredCount: activities.filter((activity) => activity.submitted && activity.gradingState === 'scored').length,
      pendingReviewCount: activities.filter((activity) => activity.submitted && activity.gradingState === 'review_required').length,
      ungradedSubmittedCount: activities.filter((activity) => activity.submitted && activity.gradingState === 'ungraded').length,
    },
  };
};

const validExclusionFact = (value: unknown): value is BookRemovalCompletionExclusionFact => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
  && (value as BookRemovalCompletionExclusionFact).schemaVersion === BOOK_REMOVAL_COMPLETION_PROJECTION_SCHEMA_VERSION
  && (value as BookRemovalCompletionExclusionFact).status === 'excluded-from-current'
  && (value as BookRemovalCompletionExclusionFact).currentRequired === false
  && validSelection(value as BookRemovalCompletionSelection)
);

const validCurrent = (current: BookRemovalCompletionCurrentProjection): boolean => {
  try {
    const latchedEmptyCompletion = (
      current.completionLatched === true
      && current.completion.requiredCount === 0
      && current.completion.submittedCount === 0
      && current.completion.status === 'completed'
      && current.completion.isComplete === true
    );
    assertProgressProjection({
      schemaVersion: current.schemaVersion,
      manifestVersionId: current.manifestVersionId,
      recipientId: current.recipientId,
      contextId: current.contextId,
      deliveryBindingId: current.deliveryBindingId,
      bindingRevision: current.bindingRevision,
      completion: latchedEmptyCompletion
        ? { ...current.completion, status: 'not_started', isComplete: false }
        : current.completion,
      grading: current.grading,
      activities: current.activities,
      excludedHistoricalRows: current.excludedHistoricalRows,
    });
    return (current.exclusions === undefined || (
      Array.isArray(current.exclusions)
      && current.exclusions.every(validExclusionFact)
    )) && (current.completionLatched === undefined || typeof current.completionLatched === 'boolean');
  } catch {
    return false;
  }
};

/**
 * Rebuild the current Homework aggregate after selected placements leave the
 * required set. Terminal facts and historical rows are inputs only: this
 * function never mutates or deletes an attempt, submission, or result.
 */
export const projectBookRemovalCompletion = (
  input: BookRemovalCompletionProjectionInput,
): BookRemovalCompletionProjectionResult => {
  if (!input || typeof input !== 'object'
    || !validCurrent(input.current)
    || !Array.isArray(input.removals)
    || input.removals.length === 0
    || input.removals.length > MAX_REMOVALS
    || input.removals.some((removal) => !validSelection(removal))) {
    return { status: 'invalid', code: 'completion-input-invalid' };
  }

  const removals = [...input.removals].sort((left, right) => selectionKey(left).localeCompare(selectionKey(right)));
  const removalKeys = new Set<string>();
  for (const removal of removals) {
    const key = selectionKey(removal);
    if (removalKeys.has(key)) return { status: 'invalid', code: 'completion-removal-duplicate' };
    removalKeys.add(key);
    if (removal.contextId !== input.current.contextId || removal.studentId !== input.current.recipientId) {
      return { status: 'invalid', code: 'completion-context-mismatch' };
    }
  }

  const selected = new Set(removals.map((removal) => removal.placementId));
  const active = new Map(input.current.activities.map((activity) => [activity.placementId, activity]));
  const priorExclusions = new Map(
    (input.current.exclusions ?? []).map((exclusion) => [exclusion.placementId, clone(exclusion)]),
  );
  const existingExclusions = new Set(
    input.current.excludedHistoricalRows
      .filter((row) => row.reason === 'removed-binding')
      .map((row) => row.placementId),
  );
  for (const placementId of priorExclusions.keys()) existingExclusions.add(placementId);
  for (const removal of removals) {
    if (!active.has(removal.placementId) && !existingExclusions.has(removal.placementId)) {
      return { status: 'invalid', code: 'completion-placement-missing' };
    }
  }

  const remainingActivities = input.current.activities.filter((activity) => !selected.has(activity.placementId));
  const historical = new Map<string, BookHomeworkProgressHistoricalRow>();
  input.current.excludedHistoricalRows.forEach((row) => historical.set(historicalKey(row), clone(row)));
  for (const removal of removals) {
    const activity = active.get(removal.placementId);
    if (activity) {
      const row = historicalRowFor(activity);
      historical.set(historicalKey(row), row);
    }
  }

  const exclusionByPlacement = new Map<string, BookRemovalCompletionExclusionFact>(priorExclusions);
  for (const removal of removals) {
    const fact: BookRemovalCompletionExclusionFact = {
      schemaVersion: BOOK_REMOVAL_COMPLETION_PROJECTION_SCHEMA_VERSION,
      ...clone(removal),
      status: 'excluded-from-current',
      currentRequired: false,
    };
    exclusionByPlacement.set(removal.placementId, fact);
  }
  const completionLatched = input.current.completion.isComplete
    && input.current.completion.status === 'completed';
  const aggregateResult = aggregate(remainingActivities, completionLatched);
  const projection: BookRemovalCompletionProjection = {
    schemaVersion: BOOK_REMOVAL_COMPLETION_PROJECTION_SCHEMA_VERSION,
    manifestVersionId: input.current.manifestVersionId,
    recipientId: input.current.recipientId,
    contextId: input.current.contextId,
    deliveryBindingId: input.current.deliveryBindingId,
    bindingRevision: input.current.bindingRevision,
    ...aggregateResult,
    activities: clone(remainingActivities),
    excludedHistoricalRows: [...historical.values()].sort((left, right) => (
      left.placementId.localeCompare(right.placementId) || historicalKey(left).localeCompare(historicalKey(right))
    )),
    exclusions: [...exclusionByPlacement.values()].sort((left, right) => left.placementId.localeCompare(right.placementId)),
    completionLatched,
  };
  const replayed = input.current.activities.every((activity) => !selected.has(activity.placementId))
    && removals.every((removal) => existingExclusions.has(removal.placementId));
  return { status: replayed ? 'replayed' : 'projected', projection: clone(projection) };
};

export const createBookRemovalCompletionProjection = projectBookRemovalCompletion;
export const recalculateBookRemovalCompletion = projectBookRemovalCompletion;
