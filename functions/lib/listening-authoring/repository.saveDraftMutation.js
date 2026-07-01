"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runSaveDraftMutation = void 0;
const constants_1 = require("./constants");
const repository_operationRecords_1 = require("./repository.operationRecords");
const repository_shared_1 = require("./repository.shared");
const runSaveDraftMutation = (state, input, completedAt) => {
    const scopeKey = (0, repository_operationRecords_1.createOperationScopeKey)({
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
            const result = (0, repository_operationRecords_1.readTerminalOperationResult)(existingOperation);
            return {
                kind: 'replayed',
                created: (0, repository_operationRecords_1.inferCreatedFromResult)(result),
                result,
            };
        }
        if (existingOperation.status === 'failed' &&
            (existingOperation.errorCode === 'conflict' ||
                existingOperation.errorCode === 'invalid-state')) {
            const result = (0, repository_operationRecords_1.readTerminalOperationResult)(existingOperation);
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
        const createdDraft = {
            schemaVersion: constants_1.LISTENING_AUTHORING_SCHEMA_VERSION,
            recordType: 'draft',
            draftId: input.draftId,
            testId: input.draftId,
            ownerId: input.ownerId,
            state: 'active',
            conflictToken: 1,
            document: (0, repository_shared_1.cloneRecord)(input.document),
            assetIds: (0, repository_operationRecords_1.deriveAssetIds)(input.document),
            createdAt: completedAt,
            createdBy: input.ownerId,
            updatedAt: completedAt,
            updatedBy: input.ownerId,
            lastOperationId: input.operationId,
        };
        const result = (0, repository_operationRecords_1.createSaveDraftResult)(createdDraft.draftId, createdDraft.conflictToken);
        const operation = (0, repository_operationRecords_1.createSucceededOperationRecord)({
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
        const result = (0, repository_operationRecords_1.createSaveDraftResult)(currentDraft.draftId, currentDraft.conflictToken);
        const operation = (0, repository_operationRecords_1.createFailedOperationRecord)({
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
        const result = (0, repository_operationRecords_1.createSaveDraftResult)(currentDraft.draftId, currentDraft.conflictToken);
        const operation = (0, repository_operationRecords_1.createFailedOperationRecord)({
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
        const result = (0, repository_operationRecords_1.createSaveDraftResult)(currentDraft.draftId, currentDraft.conflictToken);
        const operation = (0, repository_operationRecords_1.createFailedOperationRecord)({
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
    const updatedDraft = (0, repository_shared_1.normalizeDraftRecord)(Object.assign(Object.assign({}, (0, repository_shared_1.cloneDraftRecord)(currentDraft)), { state: 'active', conflictToken: currentDraft.conflictToken + 1, document: (0, repository_shared_1.cloneRecord)(input.document), assetIds: (0, repository_operationRecords_1.deriveAssetIds)(input.document), updatedAt: completedAt, updatedBy: input.ownerId, lastOperationId: input.operationId }));
    const result = (0, repository_operationRecords_1.createSaveDraftResult)(updatedDraft.draftId, updatedDraft.conflictToken);
    const operation = (0, repository_operationRecords_1.createSucceededOperationRecord)({
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
exports.runSaveDraftMutation = runSaveDraftMutation;
//# sourceMappingURL=repository.saveDraftMutation.js.map