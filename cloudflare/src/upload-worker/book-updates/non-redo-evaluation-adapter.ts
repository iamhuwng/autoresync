import type { BookActivityEvaluationActor } from '../../../../src/services/book-activity/activityEvaluation.types.ts';
import type { BookActivityEvaluationRevision } from '../../../../src/services/book-activity/activityEvaluation.types.ts';
import { createTrustedBookActivityEvaluationService } from '../../../../src/services/book-activity/activityEvaluation.service.ts';
import type { BookNonRedoUpdateGradingPort } from '../../../../src/services/book-delivery/bookNonRedoUpdate.types.ts';

export interface BookRubricReviewQueue {
  queue(input: Parameters<BookNonRedoUpdateGradingPort['queueRubricReview']>[0]): Promise<
    { readonly status: 'queued' | 'replayed' | 'stale' }
  >;
}

export interface BookObjectiveRegradeProjection {
  apply(input: {
    readonly operationId: string;
    readonly operation: Parameters<BookNonRedoUpdateGradingPort['regradeObjective']>[0]['operation'];
    readonly revision: BookActivityEvaluationRevision;
  }): Promise<{ readonly status: 'applied' | 'replayed' | 'conflict' }>;
}

export const createBookNonRedoEvaluationAdapter = (options: {
  readonly evaluations: ReturnType<typeof createTrustedBookActivityEvaluationService>;
  readonly trustedActor: Extract<BookActivityEvaluationActor, { readonly kind: 'trusted_scorer' }>;
  readonly rubricReviews: BookRubricReviewQueue;
  readonly objectiveProjection: BookObjectiveRegradeProjection;
}): BookNonRedoUpdateGradingPort => Object.freeze({
  async regradeObjective(input: Parameters<BookNonRedoUpdateGradingPort['regradeObjective']>[0]) {
    const result = await options.evaluations.applyEvaluationCommand({
      schemaVersion: 1,
      scorerVersion: 1,
      operationId: input.operationId,
      kind: 'regrade_objective',
      expectedEvaluationRevision: input.operation.expectedEvaluationRevision,
      target: input.operation.evaluationTarget,
    }, options.trustedActor);
    if (result.status === 'accepted' || result.status === 'replayed') {
      const projected = await options.objectiveProjection.apply({
        operationId: input.operationId,
        operation: input.operation,
        revision: result.revision,
      });
      if (projected.status === 'conflict') return { status: 'stale' as const };
      return { status: result.status === 'accepted' ? 'applied' as const : 'replayed' as const };
    }
    if (result.status === 'rejected'
      && (result.code === 'evaluation_command_unsupported'
      || result.code === 'evaluation_subjective_teacher_required')) return { status: 'unsupported' as const };
    return { status: 'stale' as const };
  },
  queueRubricReview: (
    input: Parameters<BookNonRedoUpdateGradingPort['queueRubricReview']>[0],
  ) => options.rubricReviews.queue(input),
});
