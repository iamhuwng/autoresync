"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readTerminalOperationResult = exports.inferCreatedFromResult = exports.createSaveDraftResult = exports.cloneOperationRecord = exports.createFailedOperationRecord = exports.createSucceededOperationRecord = exports.deriveAssetIds = exports.createOperationScopeKey = void 0;
const constants_1 = require("./constants");
const repository_shared_1 = require("./repository.shared");
const createOperationScopeKey = (input) => `${input.ownerId}::${input.operationType}::${input.targetId}::${input.idempotencyKeyHash}`;
exports.createOperationScopeKey = createOperationScopeKey;
const deriveAssetIds = (document) => {
    const assetIds = {};
    for (const section of document.audioSections) {
        const assetId = section.assetId;
        if (typeof assetId === 'string' && assetId.length > 0) {
            assetIds[assetId] = true;
        }
    }
    return assetIds;
};
exports.deriveAssetIds = deriveAssetIds;
const createSucceededOperationRecord = (input) => ({
    schemaVersion: constants_1.LISTENING_AUTHORING_SCHEMA_VERSION,
    operationId: input.operationId,
    operationType: input.operationType,
    targetType: input.targetType,
    ownerId: input.ownerId,
    targetId: input.targetId,
    idempotencyKeyHash: input.idempotencyKeyHash,
    requestHash: input.requestHash,
    expectedConflictToken: input.expectedConflictToken,
    status: 'succeeded',
    result: (0, repository_shared_1.cloneRecord)(input.result),
    createdAt: input.completedAt,
    completedAt: input.completedAt,
    expiresAt: input.completedAt + constants_1.LISTENING_AUTHORING_OPERATION_TTL_MS,
});
exports.createSucceededOperationRecord = createSucceededOperationRecord;
const createFailedOperationRecord = (input) => ({
    schemaVersion: constants_1.LISTENING_AUTHORING_SCHEMA_VERSION,
    operationId: input.operationId,
    operationType: input.operationType,
    targetType: input.targetType,
    ownerId: input.ownerId,
    targetId: input.targetId,
    idempotencyKeyHash: input.idempotencyKeyHash,
    requestHash: input.requestHash,
    expectedConflictToken: input.expectedConflictToken,
    status: 'failed',
    result: (0, repository_shared_1.cloneRecord)(input.result),
    errorCode: input.errorCode,
    createdAt: input.completedAt,
    completedAt: input.completedAt,
    expiresAt: input.completedAt + constants_1.LISTENING_AUTHORING_OPERATION_TTL_MS,
});
exports.createFailedOperationRecord = createFailedOperationRecord;
const cloneOperationRecord = (record) => (0, repository_shared_1.cloneRecord)(record);
exports.cloneOperationRecord = cloneOperationRecord;
const createSaveDraftResult = (draftId, conflictToken) => ({
    draftId,
    conflictToken,
});
exports.createSaveDraftResult = createSaveDraftResult;
const inferCreatedFromResult = (result) => result.conflictToken === 1;
exports.inferCreatedFromResult = inferCreatedFromResult;
const readTerminalOperationResult = (operation) => {
    if (operation.completedAt === undefined ||
        operation.result === undefined ||
        typeof operation.result.draftId !== 'string' ||
        operation.result.draftId.length === 0 ||
        typeof operation.result.conflictToken !== 'number' ||
        !Number.isInteger(operation.result.conflictToken) ||
        operation.result.conflictToken <= 0) {
        throw new Error(`malformed or incomplete operation ${operation.operationId}.`);
    }
    return {
        draftId: operation.result.draftId,
        conflictToken: operation.result.conflictToken,
    };
};
exports.readTerminalOperationResult = readTerminalOperationResult;
//# sourceMappingURL=repository.operationRecords.js.map