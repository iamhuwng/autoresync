import type { BookUpdateActionRecord } from '../../../../src/services/book-delivery/bookUpdateAction.types.ts';
import type {
  BookNonRedoUpdateGradingPort,
  BookNonRedoUpdateOperation,
  BookNonRedoUpdateProjectionPort,
} from '../../../../src/services/book-delivery/bookNonRedoUpdate.types.ts';
import { advanceBookUpdateAction, type BookUpdateActionRepository } from './update-action.ts';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/u;
const HASH = /^[a-f0-9]{64}$/u;

export interface BookNonRedoUpdateResolver {
  resolve(action: BookUpdateActionRecord): Promise<
    | { readonly status: 'ready'; readonly operations: readonly BookNonRedoUpdateOperation[] }
    | { readonly status: 'stale' | 'denied' | 'unavailable' }
  >;
}

export type BookNonRedoUpdateResult =
  | { readonly status: 'committed' | 'replayed'; readonly action: BookUpdateActionRecord }
  | { readonly status: 'pending'; readonly action: BookUpdateActionRecord; readonly code: string }
  | { readonly status: 'blocked'; readonly code: string };

const operationId = (actionId: string, operation: BookNonRedoUpdateOperation): string => (
  `${actionId}:${operation.contextKind}:${operation.placementId}:${operation.kind}`
);

const validOperation = (action: BookUpdateActionRecord, operation: BookNonRedoUpdateOperation): boolean => {
  const expectedClassification = operation.kind === 'display-only' ? 'display-only'
    : operation.kind === 'reorder' ? 'reordered'
      : operation.kind === 'regrade-objective' || operation.kind === 'regrade-rubric-review' ? 'regrade'
        : 'moved';
  const selection = action.selections.find((candidate) => (
    candidate.contextKey === operation.contextKey
    && candidate.placementId === operation.placementId
    && candidate.choice === operation.choice
  ));
  if (!selection
    || !action.audit.classifications.includes(expectedClassification)
    || !ID.test(operation.contextKey)
    || !ID.test(operation.placementId)
    || !ID.test(operation.activityId)
    || !ID.test(operation.oldActivityVersionId)
    || !ID.test(operation.newActivityVersionId)
    || operation.oldActivityVersionId === operation.newActivityVersionId) return false;
  switch (operation.kind) {
    case 'display-only':
      return operation.choice === 'apply-without-redo' && HASH.test(operation.displayFingerprint);
    case 'reorder':
      return operation.choice === 'apply-without-redo'
        && Number.isSafeInteger(operation.order) && operation.order >= 0;
    case 'regrade-objective':
    case 'regrade-rubric-review':
      return operation.choice === 'apply-without-redo'
        && Number.isSafeInteger(operation.expectedEvaluationRevision)
        && operation.expectedEvaluationRevision > 0
        && operation.evaluationTarget.contextKind === operation.contextKind
        && operation.evaluationTarget.contextId === operation.contextKey.split(':').slice(1).join(':')
        && operation.evaluationTarget.placementId === operation.placementId
        && operation.evaluationTarget.activityId === operation.activityId;
    case 'move-retained':
      return operation.choice === 'apply-without-redo'
        && ID.test(operation.parentRef)
        && HASH.test(operation.scheduleFingerprint)
        && Number.isSafeInteger(operation.order)
        && operation.order >= 0;
    case 'move-out':
      return operation.choice === 'remove-from-current';
    case 'move-in':
      return operation.choice === 'include-required';
  }
};

export const createBookNonRedoUpdateExecutor = (options: {
  readonly actions: BookUpdateActionRepository;
  readonly resolver: BookNonRedoUpdateResolver;
  readonly projections: BookNonRedoUpdateProjectionPort;
  readonly grading: BookNonRedoUpdateGradingPort;
  readonly now?: () => Date;
}) => Object.freeze({
  async execute(input: { readonly ownerId: string; readonly actionId: string }): Promise<BookNonRedoUpdateResult> {
    let action = await options.actions.read(input.ownerId, input.actionId);
    if (!action || action.ownerId !== input.ownerId) return { status: 'blocked', code: 'action-missing' };
    if (action.state === 'committed' || action.state === 'notification-pending' || action.state === 'completed') {
      return { status: 'replayed', action };
    }
    if (action.state === 'accepted') {
      const applying = await advanceBookUpdateAction({
        repository: options.actions,
        ownerId: action.ownerId,
        actionId: action.actionId,
        expectedState: 'accepted',
        expectedRevision: action.stateRevision,
        nextState: 'applying',
        at: (options.now?.() ?? new Date()).toISOString(),
      });
      if (applying.status !== 'advanced' || !applying.action) {
        return { status: 'blocked', code: 'action-transition-conflict' };
      }
      action = applying.action;
    }
    if (action.state !== 'applying') return { status: 'blocked', code: 'action-not-applicable' };
    let resolved: Awaited<ReturnType<BookNonRedoUpdateResolver['resolve']>>;
    try {
      resolved = await options.resolver.resolve(action);
    } catch {
      return { status: 'pending', action, code: 'case-resolution-unavailable' };
    }
    if (resolved.status !== 'ready') return { status: 'pending', action, code: `case-resolution-${resolved.status}` };
    const operationIds = resolved.operations.map((operation) => operationId(action.actionId, operation));
    if (resolved.operations.length === 0
      || new Set(operationIds).size !== operationIds.length
      || resolved.operations.some((operation) => !validOperation(action, operation))) {
      return { status: 'pending', action, code: 'case-operation-invalid' };
    }
    for (const operation of resolved.operations) {
      const id = operationId(action.actionId, operation);
      if (operation.kind === 'move-out') {
        return { status: 'pending', action, code: 'delegate-removal-case' };
      }
      if (operation.kind === 'move-in') {
        return { status: 'pending', action, code: 'delegate-addition-case' };
      }
      if (operation.kind === 'regrade-objective') {
        const result = await options.grading.regradeObjective({ operationId: id, operation });
        if (result.status === 'unsupported') return { status: 'pending', action, code: 'objective-regrade-unsupported' };
        if (result.status === 'stale') return { status: 'pending', action, code: 'objective-regrade-stale' };
      } else if (operation.kind === 'regrade-rubric-review') {
        const result = await options.grading.queueRubricReview({ operationId: id, operation });
        if (result.status === 'stale') return { status: 'pending', action, code: 'rubric-review-stale' };
      } else {
        const result = await options.projections.apply({ operationId: id, actionId: action.actionId, operation });
        if (result.status === 'conflict') return { status: 'pending', action, code: 'projection-conflict' };
      }
    }
    const committed = await advanceBookUpdateAction({
      repository: options.actions,
      ownerId: action.ownerId,
      actionId: action.actionId,
      expectedState: 'applying',
      expectedRevision: action.stateRevision,
      nextState: 'committed',
      at: (options.now?.() ?? new Date()).toISOString(),
    });
    return committed.status === 'advanced' && committed.action
      ? { status: 'committed', action: committed.action }
      : { status: 'pending', action, code: 'commit-transition-conflict' };
  },
});
