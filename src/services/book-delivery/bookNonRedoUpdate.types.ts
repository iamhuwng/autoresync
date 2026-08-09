import type { BookActivityEvaluationTarget } from '../book-activity/activityEvaluation.types';
import type { BookImpactSnapshotChoice } from './bookImpactSnapshot.types';

export type BookNonRedoContextKind = 'solo' | 'homework' | 'course' | 'class';
export type BookNonRedoLifecycle = 'not-started' | 'in-progress' | 'submitted' | 'completed';

interface BookNonRedoUpdateOperationBase {
  readonly contextKey: string;
  readonly contextKind: BookNonRedoContextKind;
  readonly lifecycle: BookNonRedoLifecycle;
  readonly placementId: string;
  readonly activityId: string;
  readonly oldActivityVersionId: string;
  readonly newActivityVersionId: string;
  readonly choice: BookImpactSnapshotChoice;
}

export type BookNonRedoUpdateOperation =
  | (BookNonRedoUpdateOperationBase & {
      readonly kind: 'display-only';
      readonly displayFingerprint: string;
      readonly studentVisibleChange: boolean;
    })
  | (BookNonRedoUpdateOperationBase & {
      readonly kind: 'reorder';
      readonly order: number;
    })
  | (BookNonRedoUpdateOperationBase & {
      readonly kind: 'regrade-objective';
      readonly evaluationTarget: BookActivityEvaluationTarget;
      readonly expectedEvaluationRevision: number;
    })
  | (BookNonRedoUpdateOperationBase & {
      readonly kind: 'regrade-rubric-review';
      readonly evaluationTarget: BookActivityEvaluationTarget;
      readonly expectedEvaluationRevision: number;
    })
  | (BookNonRedoUpdateOperationBase & {
      readonly kind: 'move-retained';
      readonly parentRef: string;
      readonly order: number;
      readonly scheduleFingerprint: string;
    })
  | (BookNonRedoUpdateOperationBase & {
      readonly kind: 'move-out';
    })
  | (BookNonRedoUpdateOperationBase & {
      readonly kind: 'move-in';
    });

export interface BookNonRedoUpdateProjectionPort {
  apply(input: {
    readonly operationId: string;
    readonly actionId: string;
    readonly operation: Exclude<BookNonRedoUpdateOperation,
      { readonly kind: 'regrade-objective' | 'regrade-rubric-review' | 'move-out' | 'move-in' }>;
  }): Promise<{ readonly status: 'applied' | 'replayed' | 'conflict' }>;
}

export interface BookNonRedoUpdateGradingPort {
  regradeObjective(input: {
    readonly operationId: string;
    readonly operation: Extract<BookNonRedoUpdateOperation, { readonly kind: 'regrade-objective' }>;
  }): Promise<{ readonly status: 'applied' | 'replayed' | 'unsupported' | 'stale' }>;
  queueRubricReview(input: {
    readonly operationId: string;
    readonly operation: Extract<BookNonRedoUpdateOperation, { readonly kind: 'regrade-rubric-review' }>;
  }): Promise<{ readonly status: 'queued' | 'replayed' | 'stale' }>;
}
