"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mutateListeningAuthoringLifecycleCore = exports.publishListeningDraftCore = exports.saveListeningDraftCore = void 0;
const canonical_1 = require("./canonical");
const validation_1 = require("./validation");
const createDraftId = (ownerId, secret, idempotencyKey) => `draft-${(0, canonical_1.hmacSha256Hex)(secret, `${ownerId}:save-draft:create:${idempotencyKey}`).slice(0, 32)}`;
const createVersionId = (ownerId, secret, draftId, idempotencyKey) => `version-${(0, canonical_1.hmacSha256Hex)(secret, `${ownerId}:publish:${draftId}:version:${idempotencyKey}`).slice(0, 32)}`;
const createLegacyVersionId = (ownerId, secret, legacyTestId) => `version-${(0, canonical_1.hmacSha256Hex)(secret, `${ownerId}:legacy-first-edit:${legacyTestId}:version`).slice(0, 32)}`;
const createLegacyRevisionDraftId = (ownerId, secret, legacyTestId) => `draft-${(0, canonical_1.hmacSha256Hex)(secret, `${ownerId}:legacy-first-edit:${legacyTestId}:revision`).slice(0, 32)}`;
const toSavedResult = (draftId, conflictToken, warnings) => ({
    status: 'saved',
    draftId,
    conflictToken,
    warnings,
    blockers: [],
});
const saveListeningDraftCore = async ({ auth, body, repo, idempotencySecret, }) => {
    var _a;
    const request = (0, validation_1.parseSaveDraftRequest)(body);
    const ownerId = auth.uid;
    const draftId = (_a = request.draftId) !== null && _a !== void 0 ? _a : createDraftId(ownerId, idempotencySecret, request.idempotencyKey);
    const idempotencyKeyHash = (0, canonical_1.hmacSha256Hex)(idempotencySecret, `${ownerId}:save-draft:${draftId}:${request.idempotencyKey}`);
    const operationId = repo.allocateId('operation');
    const safeRequestHash = (0, canonical_1.requestHash)({
        ownerId,
        operationType: 'save-draft',
        targetId: draftId,
        expectedConflictToken: request.expectedConflictToken,
        document: request.document,
        trigger: request.trigger,
    });
    const transactionResult = await repo.saveDraftTransaction({
        ownerId,
        draftId,
        operationId,
        idempotencyKeyHash,
        requestHash: safeRequestHash,
        expectedConflictToken: request.expectedConflictToken,
        document: request.document,
        allowCreate: request.draftId === undefined,
    });
    switch (transactionResult.kind) {
        case 'saved':
        case 'replayed':
            return toSavedResult(transactionResult.result.draftId, transactionResult.result.conflictToken, request.warnings);
        case 'conflict':
            return {
                status: 'conflict',
                recoverable: true,
                draftId: transactionResult.draftId,
                expectedConflictToken: transactionResult.expectedConflictToken,
                currentConflictToken: transactionResult.currentConflictToken,
            };
        case 'idempotency-conflict':
            return {
                status: 'idempotency-conflict',
                recoverable: false,
                draftId: transactionResult.draftId,
                operationId: transactionResult.operationId,
            };
        case 'not-found':
            return {
                status: 'not-found',
                recoverable: false,
                draftId: transactionResult.draftId,
            };
    }
};
exports.saveListeningDraftCore = saveListeningDraftCore;
const toPublishedResult = (result) => ({
    status: 'published',
    draftId: result.draftId,
    versionId: result.versionId,
    versionNumber: result.versionNumber,
    conflictToken: result.conflictToken,
    warnings: [],
});
const publishListeningDraftCore = async ({ auth, body, repo, idempotencySecret, }) => {
    const request = (0, validation_1.parsePublishDraftRequest)(body);
    const ownerId = auth.uid;
    if ('legacyTestId' in request) {
        const idempotencyKeyHash = (0, canonical_1.hmacSha256Hex)(idempotencySecret, `${ownerId}:publish:${request.legacyTestId}:${request.idempotencyKey}`);
        const operationId = repo.allocateId('operation');
        const versionId = createLegacyVersionId(ownerId, idempotencySecret, request.legacyTestId);
        const revisionDraftId = createLegacyRevisionDraftId(ownerId, idempotencySecret, request.legacyTestId);
        const safeRequestHash = (0, canonical_1.requestHash)({
            ownerId,
            operationType: 'publish',
            targetType: 'legacy-test',
            targetId: request.legacyTestId,
        });
        const transactionResult = await repo.legacyFirstEditTransaction({
            ownerId,
            legacyTestId: request.legacyTestId,
            operationId,
            versionId,
            revisionDraftId,
            idempotencyKeyHash,
            requestHash: safeRequestHash,
            publishedAt: Date.now(),
        });
        switch (transactionResult.kind) {
            case 'published':
            case 'replayed':
                return toPublishedResult(transactionResult.result);
            case 'idempotency-conflict':
                return {
                    status: 'idempotency-conflict',
                    recoverable: false,
                    draftId: transactionResult.draftId,
                    operationId: transactionResult.operationId,
                };
            case 'not-found':
                return {
                    status: 'not-found',
                    recoverable: false,
                    draftId: request.legacyTestId,
                };
        }
    }
    const idempotencyKeyHash = (0, canonical_1.hmacSha256Hex)(idempotencySecret, `${ownerId}:publish:${request.draftId}:${request.idempotencyKey}`);
    const operationId = repo.allocateId('operation');
    const versionId = createVersionId(ownerId, idempotencySecret, request.draftId, request.idempotencyKey);
    const safeRequestHash = (0, canonical_1.requestHash)({
        ownerId,
        operationType: 'publish',
        targetId: request.draftId,
        expectedConflictToken: request.expectedConflictToken,
        retainedPins: request.retainedPins,
    });
    const transactionResult = await repo.publishDraftTransaction({
        ownerId,
        draftId: request.draftId,
        operationId,
        versionId,
        idempotencyKeyHash,
        requestHash: safeRequestHash,
        expectedConflictToken: request.expectedConflictToken,
        publishedAt: Date.now(),
    });
    switch (transactionResult.kind) {
        case 'published':
        case 'replayed':
            return toPublishedResult(transactionResult.result);
        case 'blocked':
            return {
                status: 'blocked',
                draftId: transactionResult.draftId,
                conflictToken: transactionResult.conflictToken,
                blockers: transactionResult.blockers,
                warnings: [],
            };
        case 'conflict':
            return {
                status: 'conflict',
                recoverable: true,
                draftId: transactionResult.draftId,
                expectedConflictToken: transactionResult.expectedConflictToken,
                currentConflictToken: transactionResult.currentConflictToken,
            };
        case 'idempotency-conflict':
            return {
                status: 'idempotency-conflict',
                recoverable: false,
                draftId: transactionResult.draftId,
                operationId: transactionResult.operationId,
            };
        case 'not-found':
            return {
                status: 'not-found',
                recoverable: false,
                draftId: transactionResult.draftId,
            };
    }
};
exports.publishListeningDraftCore = publishListeningDraftCore;
const toLifecycleResult = (result) => {
    switch (result.kind) {
        case 'soft-deleted':
        case 'restored':
        case 'discarded':
            return {
                status: result.kind,
                draftId: result.result.draftId,
                conflictToken: result.result.conflictToken,
            };
        case 'archived':
            return {
                status: 'archived',
                versionId: result.result.versionId,
                versionNumber: result.result.versionNumber,
            };
        case 'conflict':
            return {
                status: 'conflict',
                recoverable: true,
                targetId: result.targetId,
                expectedConflictToken: result.expectedConflictToken,
                currentConflictToken: result.currentConflictToken,
            };
        case 'idempotency-conflict':
            return {
                status: 'idempotency-conflict',
                recoverable: false,
                targetId: result.targetId,
                operationId: result.operationId,
            };
        case 'invalid-state':
        case 'not-found':
            return {
                status: result.kind,
                recoverable: false,
                targetId: result.targetId,
            };
    }
};
const mutateListeningAuthoringLifecycleCore = async ({ auth, body, repo, idempotencySecret, }) => {
    const request = (0, validation_1.parseLifecycleRequest)(body);
    if (request.expectedConflictToken === undefined) {
        throw new Error('expectedConflictToken is required for lifecycle operations.');
    }
    const ownerId = auth.uid;
    const idempotencyKeyHash = (0, canonical_1.hmacSha256Hex)(idempotencySecret, `${ownerId}:${request.operation}:${request.targetId}:${request.idempotencyKey}`);
    const operationId = repo.allocateId('operation');
    const safeRequestHash = (0, canonical_1.requestHash)({
        ownerId,
        operationType: request.operation,
        targetId: request.targetId,
        expectedConflictToken: request.expectedConflictToken,
        reasonCode: request.reasonCode,
    });
    return toLifecycleResult(await repo.lifecycleTransaction({
        ownerId,
        operationId,
        operationType: request.operation,
        targetId: request.targetId,
        idempotencyKeyHash,
        requestHash: safeRequestHash,
        expectedConflictToken: request.expectedConflictToken,
        completedAt: Date.now(),
        reasonCode: request.reasonCode,
    }));
};
exports.mutateListeningAuthoringLifecycleCore = mutateListeningAuthoringLifecycleCore;
//# sourceMappingURL=service.js.map