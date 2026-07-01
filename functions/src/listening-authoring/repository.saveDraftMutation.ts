import { LISTENING_AUTHORING_SCHEMA_VERSION } from './constants';
import {
  createFailedOperationRecord,
  createOperationScopeKey,
  createSaveDraftResult,
  createSucceededOperationRecord,
  deriveAssetIds,
  inferCreatedFromResult,
  readTerminalOperationResult,
} from './repository.operationRecords';
import {
  cloneDraftRecord,
  cloneRecord,
  normalizeDraftRecord,
  type ListeningAuthoringDraftRecord,
  type ListeningAuthoringOperationRecord,
  type ListeningDraftRecord,
  type SaveDraftTransactionInput,
  type SaveDraftTransactionResult,
} from './repository.shared';

export interface SaveDraftMutationState {
  drafts: Map<string, ListeningAuthoringDraftRecord>;
  operationsById: Map<string, ListeningAuthoringOperationRecord>;
  operationIdsByLookupKey: Map<string, string>;
}

export const runSaveDraftMutation = (
  state: SaveDraftMutationState,
  input: SaveDraftTransactionInput,
  completedAt: number,
): SaveDraftTransactionResult => {
    const scopeKey = createOperationScopeKey({
      ownerId: input.ownerId,
      operationType: 'save-draft',
      targetId: input.draftId,
      idempotencyKeyHash: input.idempotencyKeyHash,
    });
    const existingOperationId = state.operationIdsByLookupKey.get(scopeKey);
    if (existingOperationId !== undefined) {
      const existingOperation = state.operationsById.get(existingOperationId);
      if (existingOperation === undefined) {
        throw new Error(`operation ${existingOperationId} missing for saveDraftTransaction.`);
      }

      if (existingOperation.requestHash !== input.requestHash) {
        return {
          kind: 'idempotency-conflict',
          draftId: input.draftId,
          operationId: existingOperation.operationId,
        };
      }

      if (existingOperation.status === 'succeeded') {
        const result = readTerminalOperationResult(existingOperation);
        return {
          kind: 'replayed',
          created: inferCreatedFromResult(result),
          result,
        };
      }

      if (
        existingOperation.status === 'failed' &&
        (existingOperation.errorCode === 'conflict' ||
          existingOperation.errorCode === 'invalid-state')
      ) {
        const result = readTerminalOperationResult(existingOperation);
        return {
          kind: 'conflict',
          draftId: result.draftId,
          expectedConflictToken: existingOperation.expectedConflictToken,
          currentConflictToken: result.conflictToken,
        };
      }

      throw new Error(`malformed or incomplete operation ${existingOperation.operationId}.`);
    }

    if (state.operationsById.has(input.operationId)) {
      throw new Error(`operation ${input.operationId} already exists.`);
    }

    const currentDraft = state.drafts.get(input.draftId);
    if (input.allowCreate) {
      if (currentDraft !== undefined) {
        return {
          kind: 'idempotency-conflict',
          draftId: input.draftId,
          operationId: currentDraft.lastOperationId,
        };
      }

      const createdDraft: ListeningDraftRecord = {
        schemaVersion: LISTENING_AUTHORING_SCHEMA_VERSION,
        recordType: 'draft',
        draftId: input.draftId,
        testId: input.draftId,
        ownerId: input.ownerId,
        state: 'active',
        conflictToken: 1,
        document: cloneRecord(input.document),
        assetIds: deriveAssetIds(input.document),
        createdAt: completedAt,
        createdBy: input.ownerId,
        updatedAt: completedAt,
        updatedBy: input.ownerId,
        lastOperationId: input.operationId,
      };

      const result = createSaveDraftResult(createdDraft.draftId, createdDraft.conflictToken);
      const operation = createSucceededOperationRecord({
        operationId: input.operationId,
        operationType: 'save-draft',
        targetType: 'draft',
        ownerId: input.ownerId,
        targetId: input.draftId,
        idempotencyKeyHash: input.idempotencyKeyHash,
        requestHash: input.requestHash,
        result,
        completedAt,
      });

      state.drafts.set(createdDraft.draftId, createdDraft);
      state.operationsById.set(operation.operationId, operation);
      state.operationIdsByLookupKey.set(scopeKey, operation.operationId);

      return { kind: 'saved', created: true, result };
    }

    if (currentDraft === undefined || currentDraft.ownerId !== input.ownerId) {
      return { kind: 'not-found', draftId: input.draftId };
    }

    if (currentDraft.state === 'soft-deleted') {
      const result = createSaveDraftResult(currentDraft.draftId, currentDraft.conflictToken);
      const operation = createFailedOperationRecord({
        operationId: input.operationId,
        operationType: 'save-draft',
        targetType: currentDraft.recordType,
        ownerId: input.ownerId,
        targetId: input.draftId,
        idempotencyKeyHash: input.idempotencyKeyHash,
        requestHash: input.requestHash,
        expectedConflictToken: input.expectedConflictToken,
        errorCode: 'invalid-state',
        result,
        completedAt,
      });
      state.operationsById.set(operation.operationId, operation);
      state.operationIdsByLookupKey.set(scopeKey, operation.operationId);
      return {
        kind: 'conflict',
        draftId: input.draftId,
        expectedConflictToken: input.expectedConflictToken,
        currentConflictToken: currentDraft.conflictToken,
      };
    }

    if (input.expectedConflictToken === undefined) {
      const result = createSaveDraftResult(currentDraft.draftId, currentDraft.conflictToken);
      const operation = createFailedOperationRecord({
        operationId: input.operationId,
        operationType: 'save-draft',
        targetType: currentDraft.recordType,
        ownerId: input.ownerId,
        targetId: input.draftId,
        idempotencyKeyHash: input.idempotencyKeyHash,
        requestHash: input.requestHash,
        errorCode: 'conflict',
        result,
        completedAt,
      });
      state.operationsById.set(operation.operationId, operation);
      state.operationIdsByLookupKey.set(scopeKey, operation.operationId);
      return {
        kind: 'conflict',
        draftId: input.draftId,
        expectedConflictToken: undefined,
        currentConflictToken: currentDraft.conflictToken,
      };
    }

    if (currentDraft.conflictToken !== input.expectedConflictToken) {
      const result = createSaveDraftResult(currentDraft.draftId, currentDraft.conflictToken);
      const operation = createFailedOperationRecord({
        operationId: input.operationId,
        operationType: 'save-draft',
        targetType: currentDraft.recordType,
        ownerId: input.ownerId,
        targetId: input.draftId,
        idempotencyKeyHash: input.idempotencyKeyHash,
        requestHash: input.requestHash,
        expectedConflictToken: input.expectedConflictToken,
        errorCode: 'conflict',
        result,
        completedAt,
      });
      state.operationsById.set(operation.operationId, operation);
      state.operationIdsByLookupKey.set(scopeKey, operation.operationId);
      return {
        kind: 'conflict',
        draftId: input.draftId,
        expectedConflictToken: input.expectedConflictToken,
        currentConflictToken: currentDraft.conflictToken,
      };
    }

    const updatedDraft: ListeningAuthoringDraftRecord = normalizeDraftRecord({
      ...cloneDraftRecord(currentDraft),
      state: 'active',
      conflictToken: currentDraft.conflictToken + 1,
      document: cloneRecord(input.document),
      assetIds: deriveAssetIds(input.document),
      updatedAt: completedAt,
      updatedBy: input.ownerId,
      lastOperationId: input.operationId,
    });

    const result = createSaveDraftResult(updatedDraft.draftId, updatedDraft.conflictToken);
    const operation = createSucceededOperationRecord({
      operationId: input.operationId,
      operationType: 'save-draft',
      targetType: updatedDraft.recordType,
      ownerId: input.ownerId,
      targetId: input.draftId,
      idempotencyKeyHash: input.idempotencyKeyHash,
      requestHash: input.requestHash,
      expectedConflictToken: input.expectedConflictToken,
      result,
      completedAt,
    });

    state.drafts.set(updatedDraft.draftId, updatedDraft);
    state.operationsById.set(operation.operationId, operation);
    state.operationIdsByLookupKey.set(scopeKey, operation.operationId);

    return { kind: 'saved', created: false, result };
};
