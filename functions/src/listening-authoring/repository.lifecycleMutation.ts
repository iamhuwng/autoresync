import {
  createFailedOperationRecord,
  createOperationScopeKey,
  createSucceededOperationRecord,
} from './repository.operationRecords';
import {
  cloneDraftRecord,
  cloneRecord,
  cloneVersionRecord,
  normalizeDraftRecord,
  normalizeVersionRecord,
  type LifecycleTransactionInput,
  type LifecycleTransactionResult,
  type ListeningAuthoringDraftRecord,
  type ListeningAuthoringOperationRecord,
  type ListeningPublishedVersionRecord,
} from './repository.shared';

export interface LifecycleMutationState {
  drafts: Map<string, ListeningAuthoringDraftRecord>;
  versions: Map<string, ListeningPublishedVersionRecord>;
  operationsById: Map<string, ListeningAuthoringOperationRecord>;
  operationIdsByLookupKey: Map<string, string>;
}

const readDraftResult = (
  operation: ListeningAuthoringOperationRecord,
): Required<Pick<NonNullable<ListeningAuthoringOperationRecord['result']>, 'draftId' | 'conflictToken'>> => {
  const result = operation.result;
  if (
    operation.completedAt === undefined ||
    result === undefined ||
    typeof result.draftId !== 'string' ||
    typeof result.conflictToken !== 'number'
  ) {
    throw new Error(`malformed lifecycle operation ${operation.operationId}.`);
  }

  return { draftId: result.draftId, conflictToken: result.conflictToken };
};

const readArchiveResult = (
  operation: ListeningAuthoringOperationRecord,
): Required<Pick<NonNullable<ListeningAuthoringOperationRecord['result']>, 'versionId' | 'versionNumber'>> => {
  const result = operation.result;
  if (
    operation.completedAt === undefined ||
    result === undefined ||
    typeof result.versionId !== 'string' ||
    typeof result.versionNumber !== 'number'
  ) {
    throw new Error(`malformed lifecycle operation ${operation.operationId}.`);
  }

  return { versionId: result.versionId, versionNumber: result.versionNumber };
};

const replayLifecycleOperation = (
  operation: ListeningAuthoringOperationRecord,
  input: LifecycleTransactionInput,
): LifecycleTransactionResult => {
  if (operation.requestHash !== input.requestHash) {
    return {
      kind: 'idempotency-conflict',
      targetId: input.targetId,
      operationId: operation.operationId,
    };
  }
  if (operation.status === 'succeeded') {
    if (operation.operationType === 'archive') {
      return { kind: 'archived', result: readArchiveResult(operation) };
    }
    const result = readDraftResult(operation);
    return {
      kind: operation.operationType === 'restore'
        ? 'restored'
        : operation.operationType === 'discard'
          ? 'discarded'
          : 'soft-deleted',
      result,
    };
  }
  if (operation.status === 'failed') {
    if (operation.errorCode === 'conflict') {
      const currentConflictToken = operation.operationType === 'archive'
        ? readArchiveResult(operation).versionNumber
        : readDraftResult(operation).conflictToken;
      return {
        kind: 'conflict',
        targetId: operation.targetId,
        expectedConflictToken: operation.expectedConflictToken ?? input.expectedConflictToken,
        currentConflictToken,
      };
    }
    if (operation.errorCode === 'invalid-state') {
      return { kind: 'invalid-state', targetId: operation.targetId };
    }
  }

  throw new Error(`malformed lifecycle operation ${operation.operationId}.`);
};

const writeOperation = (
  state: LifecycleMutationState,
  operation: ListeningAuthoringOperationRecord,
): void => {
  state.operationsById.set(operation.operationId, operation);
  state.operationIdsByLookupKey.set(createOperationScopeKey(operation), operation.operationId);
};

const failDraft = (
  state: LifecycleMutationState,
  input: LifecycleTransactionInput,
  draft: ListeningAuthoringDraftRecord,
  errorCode: string,
): LifecycleTransactionResult => {
  writeOperation(state, createFailedOperationRecord({
    operationId: input.operationId,
    operationType: input.operationType,
    targetType: draft.recordType,
    ownerId: input.ownerId,
    targetId: input.targetId,
    idempotencyKeyHash: input.idempotencyKeyHash,
    requestHash: input.requestHash,
    expectedConflictToken: input.expectedConflictToken,
    errorCode,
    result: { draftId: draft.draftId, conflictToken: draft.conflictToken },
    completedAt: input.completedAt,
  }));
  if (errorCode === 'conflict') {
    return {
      kind: 'conflict',
      targetId: draft.draftId,
      expectedConflictToken: input.expectedConflictToken,
      currentConflictToken: draft.conflictToken,
    };
  }

  return { kind: 'invalid-state', targetId: draft.draftId };
};

const mutateDraftLifecycle = (
  state: LifecycleMutationState,
  input: LifecycleTransactionInput,
): LifecycleTransactionResult => {
  const current = state.drafts.get(input.targetId);
  if (current === undefined || current.ownerId !== input.ownerId) {
    return { kind: 'not-found', targetId: input.targetId };
  }
  if (current.conflictToken !== input.expectedConflictToken) {
    return failDraft(state, input, current, 'conflict');
  }
  if (input.operationType === 'restore') {
    if (current.state !== 'soft-deleted' || current.softDelete === undefined) {
      return failDraft(state, input, current, 'invalid-state');
    }
  } else if (current.state !== 'active') {
    return failDraft(state, input, current, 'invalid-state');
  }

  const nextConflictToken = current.conflictToken + 1;
  const next = normalizeDraftRecord(input.operationType === 'restore'
    ? {
        ...cloneDraftRecord(current),
        state: 'active',
        conflictToken: nextConflictToken,
        updatedAt: input.completedAt,
        updatedBy: input.ownerId,
        lastOperationId: input.operationId,
        softDelete: {
          ...current.softDelete!,
          restoredAt: input.completedAt,
          restoredBy: input.ownerId,
          restoreCount: current.softDelete!.restoreCount + 1,
        },
      }
    : {
        ...cloneDraftRecord(current),
        state: 'soft-deleted',
        conflictToken: nextConflictToken,
        updatedAt: input.completedAt,
        updatedBy: input.ownerId,
        lastOperationId: input.operationId,
        softDelete: {
          deletedAt: input.completedAt,
          deletedBy: input.ownerId,
          reasonCode: input.reasonCode ?? (input.operationType === 'discard' ? 'discard' : undefined),
          priorConflictToken: current.conflictToken,
          restoreCount: current.softDelete?.restoreCount ?? 0,
        },
      });
  const result = { draftId: next.draftId, conflictToken: next.conflictToken };
  writeOperation(state, createSucceededOperationRecord({
    operationId: input.operationId,
    operationType: input.operationType,
    targetType: current.recordType,
    ownerId: input.ownerId,
    targetId: input.targetId,
    idempotencyKeyHash: input.idempotencyKeyHash,
    requestHash: input.requestHash,
    expectedConflictToken: input.expectedConflictToken,
    result,
    completedAt: input.completedAt,
  }));
  state.drafts.set(next.draftId, next);
  return {
    kind: input.operationType === 'restore'
      ? 'restored'
      : input.operationType === 'discard'
        ? 'discarded'
        : 'soft-deleted',
    result,
  };
};

const mutateArchive = (
  state: LifecycleMutationState,
  input: LifecycleTransactionInput,
): LifecycleTransactionResult => {
  const current = state.versions.get(input.targetId);
  if (current === undefined || current.ownerId !== input.ownerId) {
    return { kind: 'not-found', targetId: input.targetId };
  }

  const failArchive = (errorCode: 'conflict' | 'invalid-state'): LifecycleTransactionResult => {
    writeOperation(state, createFailedOperationRecord({
      operationId: input.operationId,
      operationType: 'archive',
      targetType: 'version',
      ownerId: input.ownerId,
      targetId: input.targetId,
      idempotencyKeyHash: input.idempotencyKeyHash,
      requestHash: input.requestHash,
      expectedConflictToken: input.expectedConflictToken,
      errorCode,
      result: { versionId: current.versionId, versionNumber: current.versionNumber },
      completedAt: input.completedAt,
    }));
    if (errorCode === 'invalid-state') {
      return { kind: 'invalid-state', targetId: current.versionId };
    }

    return {
      kind: 'conflict',
      targetId: current.versionId,
      expectedConflictToken: input.expectedConflictToken,
      currentConflictToken: current.versionNumber,
    };
  };

  if (current.versionNumber !== input.expectedConflictToken) {
    return failArchive('conflict');
  }
  if (current.archive.state === 'archived') {
    return failArchive('invalid-state');
  }

  const next = normalizeVersionRecord({
    ...cloneVersionRecord(current),
    archive: {
      state: 'archived',
      archivedAt: input.completedAt,
      archivedBy: input.ownerId,
      reasonCode: input.reasonCode,
    },
  });
  const result = { versionId: current.versionId, versionNumber: current.versionNumber };
  writeOperation(state, createSucceededOperationRecord({
    operationId: input.operationId,
    operationType: 'archive',
    targetType: 'version',
    ownerId: input.ownerId,
    targetId: input.targetId,
    idempotencyKeyHash: input.idempotencyKeyHash,
    requestHash: input.requestHash,
    expectedConflictToken: input.expectedConflictToken,
    result,
    completedAt: input.completedAt,
  }));
  state.versions.set(next.versionId, cloneRecord(next));
  return { kind: 'archived', result };
};

export const runLifecycleMutation = (
  state: LifecycleMutationState,
  input: LifecycleTransactionInput,
): LifecycleTransactionResult => {
  const scopeKey = createOperationScopeKey({
    ownerId: input.ownerId,
    operationType: input.operationType,
    targetId: input.targetId,
    idempotencyKeyHash: input.idempotencyKeyHash,
  });
  const existingOperationId = state.operationIdsByLookupKey.get(scopeKey);
  if (existingOperationId !== undefined) {
    const existing = state.operationsById.get(existingOperationId);
    if (existing === undefined) {
      throw new Error(`operation ${existingOperationId} missing for lifecycle transaction.`);
    }

    return replayLifecycleOperation(existing, input);
  }
  if (state.operationsById.has(input.operationId)) {
    throw new Error(`operation ${input.operationId} already exists.`);
  }

  return input.operationType === 'archive'
    ? mutateArchive(state, input)
    : mutateDraftLifecycle(state, input);
};
