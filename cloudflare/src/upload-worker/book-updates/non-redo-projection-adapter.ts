import {
  applyBookDisplayProjection,
  applyBookReorderProjection,
  applyBookRetainedMoveProjection,
  type BookNonRedoProjectionState,
} from '../../../../src/services/book-activity/bookNonRedoProjection.service.ts';
import type { BookNonRedoUpdateProjectionPort } from '../../../../src/services/book-delivery/bookNonRedoUpdate.types.ts';

export interface BookNonRedoProjectionRepository {
  readOperation(operationId: string): Promise<{
    readonly actionId: string;
    readonly contextId: string;
    readonly placementId: string;
    readonly activityVersionId: string;
  } | null>;
  read(input: { readonly contextKey: string; readonly placementId: string }): Promise<BookNonRedoProjectionState | null>;
  commit(input: {
    readonly operationId: string;
    readonly actionId: string;
    readonly expectedActivityVersionId: string;
    readonly state: BookNonRedoProjectionState;
  }): Promise<{ readonly status: 'applied' | 'replayed' | 'conflict' }>;
}

export const createBookNonRedoProjectionAdapter = (
  repository: BookNonRedoProjectionRepository,
): BookNonRedoUpdateProjectionPort => Object.freeze({
  async apply(input: Parameters<BookNonRedoUpdateProjectionPort['apply']>[0]) {
    const existing = await repository.readOperation(input.operationId);
    if (existing) {
      return existing.actionId === input.actionId
        && existing.contextId === input.operation.contextKey.split(':').slice(1).join(':')
        && existing.placementId === input.operation.placementId
        && existing.activityVersionId === input.operation.newActivityVersionId
        ? { status: 'replayed' as const }
        : { status: 'conflict' as const };
    }
    const current = await repository.read({
      contextKey: input.operation.contextKey,
      placementId: input.operation.placementId,
    });
    if (!current
      || current.contextId !== input.operation.contextKey.split(':').slice(1).join(':')
      || current.placementId !== input.operation.placementId
      || current.activityId !== input.operation.activityId
      || current.activityVersionId !== input.operation.oldActivityVersionId) {
      return { status: 'conflict' as const };
    }
    const next = input.operation.kind === 'display-only'
      ? applyBookDisplayProjection(current, {
        activityVersionId: input.operation.newActivityVersionId,
        displayFingerprint: input.operation.displayFingerprint,
      })
      : input.operation.kind === 'reorder'
        ? applyBookReorderProjection(current, {
          activityVersionId: input.operation.newActivityVersionId,
          order: input.operation.order,
        })
        : applyBookRetainedMoveProjection(current, {
          activityVersionId: input.operation.newActivityVersionId,
          parentRef: input.operation.parentRef,
          order: input.operation.order,
          scheduleFingerprint: input.operation.scheduleFingerprint,
        });
    return repository.commit({
      operationId: input.operationId,
      actionId: input.actionId,
      expectedActivityVersionId: input.operation.oldActivityVersionId,
      state: next,
    });
  },
});
