"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.firebaseCompleteOperation = exports.firebaseClaimOperation = void 0;
const constants_1 = require("./constants");
const repository_operationRecords_1 = require("./repository.operationRecords");
const repository_firebaseSupport_1 = require("./repository.firebaseSupport");
const repository_shared_1 = require("./repository.shared");
const firebaseClaimOperation = async (db, input, now) => {
    const lookupKey = (0, repository_operationRecords_1.createOperationScopeKey)(input);
    const operationsRef = db.ref(constants_1.LISTENING_AUTHORING_PATHS.operations);
    let transactionOutcome = null;
    const transaction = await operationsRef.transaction((currentValue) => {
        const current = currentValue !== null
            ? currentValue
            : {};
        const existing = Object.values(current).find((record) => record.idempotencyKeyHash === input.idempotencyKeyHash &&
            record.ownerId === input.ownerId &&
            record.operationType === input.operationType &&
            record.targetId === input.targetId);
        if (existing !== undefined) {
            transactionOutcome =
                existing.requestHash === input.requestHash
                    ? { kind: 'existing', record: (0, repository_operationRecords_1.cloneOperationRecord)(existing) }
                    : { kind: 'conflict', record: (0, repository_operationRecords_1.cloneOperationRecord)(existing) };
            return undefined;
        }
        if (current[input.operationId] !== undefined) {
            throw new Error(`operation ${input.operationId} already exists.`);
        }
        const createdAt = now();
        const record = {
            schemaVersion: constants_1.LISTENING_AUTHORING_SCHEMA_VERSION,
            operationId: input.operationId,
            operationType: input.operationType,
            targetType: input.targetType,
            ownerId: input.ownerId,
            targetId: input.targetId,
            idempotencyKeyHash: input.idempotencyKeyHash,
            requestHash: input.requestHash,
            expectedConflictToken: input.expectedConflictToken,
            status: 'pending',
            createdAt,
            expiresAt: createdAt + constants_1.LISTENING_AUTHORING_OPERATION_TTL_MS,
        };
        transactionOutcome = { kind: 'claimed', record: (0, repository_operationRecords_1.cloneOperationRecord)(record) };
        return Object.assign(Object.assign({}, current), { [record.operationId]: (0, repository_operationRecords_1.cloneOperationRecord)(record) });
    }, undefined, false);
    if (transactionOutcome !== null) {
        return transactionOutcome;
    }
    if (transaction.committed) {
        throw new Error('operations transaction committed without outcome.');
    }
    const existing = await (0, repository_firebaseSupport_1.findOperationByScopeKey)(db, lookupKey);
    if (existing !== null) {
        return existing.requestHash === input.requestHash
            ? { kind: 'existing', record: existing }
            : { kind: 'conflict', record: existing };
    }
    throw new Error(`operation lookup ${lookupKey} missing after transaction.`);
};
exports.firebaseClaimOperation = firebaseClaimOperation;
const firebaseCompleteOperation = async (db, operationId, result, now) => {
    const operationRef = db.ref(`${constants_1.LISTENING_AUTHORING_PATHS.operations}/${operationId}`);
    const clonedResult = (0, repository_shared_1.cloneRecord)(result);
    const completedAt = now();
    const state = { outcome: 'missing' };
    const transaction = await operationRef.transaction((currentValue) => {
        if (currentValue === null) {
            state.outcome = 'missing';
            return undefined;
        }
        const current = currentValue;
        if (current.status === 'succeeded') {
            state.outcome = 'already-succeeded';
            return undefined;
        }
        if (current.status === 'failed') {
            state.outcome = 'already-failed';
            return undefined;
        }
        state.outcome = 'updated';
        return Object.assign(Object.assign({}, current), { status: 'succeeded', result: clonedResult, completedAt, expiresAt: completedAt + constants_1.LISTENING_AUTHORING_OPERATION_TTL_MS });
    }, undefined, false);
    if (state.outcome === 'updated' || state.outcome === 'already-succeeded') {
        return;
    }
    if (state.outcome === 'already-failed') {
        throw new Error(`operation ${operationId} already failed.`);
    }
    if (!transaction.committed || state.outcome === 'missing') {
        throw new Error(`operation ${operationId} not found.`);
    }
};
exports.firebaseCompleteOperation = firebaseCompleteOperation;
//# sourceMappingURL=repository.firebaseOperations.js.map