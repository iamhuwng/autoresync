export interface BookNonRedoProjectionState {
  readonly contextId: string;
  readonly placementId: string;
  readonly activityId: string;
  readonly activityVersionId: string;
  readonly bindingId: string;
  readonly bindingRevision: number;
  readonly parentRef: string;
  readonly order: number;
  readonly displayFingerprint: string;
  readonly scheduleFingerprint: string;
  readonly answerState: unknown;
  readonly evaluationRevision: number;
  readonly earnedScore: number | null;
  readonly maximumScore: number | null;
  readonly correctionNote: string | null;
  readonly feedbackRelease: 'hidden' | 'released';
  readonly completionStatus: 'not-started' | 'active' | 'submitted' | 'completed';
  readonly attemptCount: number;
  readonly attemptEligibility: 'eligible' | 'exhausted' | 'closed';
  readonly teacherReviewQueued: boolean;
}

const clone = <T>(value: T): T => structuredClone(value);

const assertFiniteScore = (value: number): void => {
  if (!Number.isFinite(value) || value < 0 || value > 10_000) {
    throw new Error('book_non_redo_score_invalid');
  }
};

export const applyBookDisplayProjection = (
  state: BookNonRedoProjectionState,
  input: { readonly activityVersionId: string; readonly displayFingerprint: string },
): BookNonRedoProjectionState => clone({
  ...state,
  activityVersionId: input.activityVersionId,
  displayFingerprint: input.displayFingerprint,
});

export const applyBookReorderProjection = (
  state: BookNonRedoProjectionState,
  input: { readonly activityVersionId: string; readonly order: number },
): BookNonRedoProjectionState => {
  if (!Number.isSafeInteger(input.order) || input.order < 0) throw new Error('book_non_redo_order_invalid');
  return clone({ ...state, activityVersionId: input.activityVersionId, order: input.order });
};

export const applyBookRetainedMoveProjection = (
  state: BookNonRedoProjectionState,
  input: {
    readonly activityVersionId: string;
    readonly parentRef: string;
    readonly order: number;
    readonly scheduleFingerprint: string;
  },
): BookNonRedoProjectionState => {
  if (!Number.isSafeInteger(input.order) || input.order < 0) throw new Error('book_non_redo_order_invalid');
  return clone({
    ...state,
    activityVersionId: input.activityVersionId,
    parentRef: input.parentRef,
    order: input.order,
    scheduleFingerprint: input.scheduleFingerprint,
  });
};

export const applyBookObjectiveRegradeProjection = (
  state: BookNonRedoProjectionState,
  input: {
    readonly activityVersionId: string;
    readonly evaluationRevision: number;
    readonly earnedScore: number;
    readonly maximumScore: number;
    readonly correctionNote?: string;
  },
): BookNonRedoProjectionState => {
  assertFiniteScore(input.earnedScore);
  assertFiniteScore(input.maximumScore);
  if (input.earnedScore > input.maximumScore
    || !Number.isSafeInteger(input.evaluationRevision)
    || input.evaluationRevision <= state.evaluationRevision) {
    throw new Error('book_non_redo_regrade_invalid');
  }
  return clone({
    ...state,
    activityVersionId: input.activityVersionId,
    evaluationRevision: input.evaluationRevision,
    earnedScore: input.earnedScore,
    maximumScore: input.maximumScore,
    correctionNote: input.correctionNote ?? null,
  });
};

export const queueBookRubricReviewProjection = (
  state: BookNonRedoProjectionState,
  input: { readonly activityVersionId: string },
): BookNonRedoProjectionState => clone({
  ...state,
  activityVersionId: input.activityVersionId,
  teacherReviewQueued: true,
});
