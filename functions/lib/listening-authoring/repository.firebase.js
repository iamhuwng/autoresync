"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createFirebaseListeningAuthoringRepository = void 0;
const repository_operationRecords_1 = require("./repository.operationRecords");
const repository_firebaseSupport_1 = require("./repository.firebaseSupport");
const repository_firebaseLifecycle_1 = require("./repository.firebaseLifecycle");
const repository_firebaseLegacyFirstEdit_1 = require("./repository.firebaseLegacyFirstEdit");
const repository_firebaseOperations_1 = require("./repository.firebaseOperations");
const repository_firebasePublish_1 = require("./repository.firebasePublish");
const repository_firebaseVersions_1 = require("./repository.firebaseVersions");
const repository_saveDraftMutation_1 = require("./repository.saveDraftMutation");
const repository_shared_1 = require("./repository.shared");
const cloneRootState = (value) => (0, repository_shared_1.cloneRecord)(value);
class FirebaseListeningAuthoringRepository {
    constructor(db, options = {}) {
        var _a;
        this.db = db;
        this.now = (_a = options.now) !== null && _a !== void 0 ? _a : Date.now;
    }
    allocateId(prefix) {
        const key = this.db.ref((0, repository_firebaseSupport_1.pathForPrefix)(prefix)).push().key;
        if (typeof key !== 'string' || key.length === 0) {
            throw new Error(`failed to allocate ${prefix} id.`);
        }
        return `${prefix}-${key}`;
    }
    async getDraft(draftId) {
        const located = await (0, repository_firebaseSupport_1.findDraftLocation)(this.db, draftId);
        return located === null ? null : (0, repository_shared_1.cloneDraftRecord)(located.record);
    }
    async writeDraft(record) {
        const normalized = (0, repository_shared_1.normalizeDraftRecord)(record);
        const transaction = await this.db.ref(repository_shared_1.LISTENING_AUTHORING_ROOT).transaction((currentValue) => {
            var _a;
            const current = currentValue !== null ? cloneRootState(currentValue) : {};
            (0, repository_shared_1.assertNoActiveListeningTempCleanupLease)(current, this.now());
            (0, repository_shared_1.assertNoDeletedListeningTempAssets)(current, normalized.assetIds);
            (0, repository_shared_1.assertNoDeletedListeningTempAssets)(current, (0, repository_operationRecords_1.deriveAssetIds)(normalized.document));
            const collection = normalized.recordType === 'draft' ? 'drafts' : 'revision_drafts';
            current[collection] = Object.assign(Object.assign({}, ((_a = current[collection]) !== null && _a !== void 0 ? _a : {})), { [normalized.draftId]: (0, repository_shared_1.cloneDraftRecord)(normalized) });
            return current;
        }, undefined, false);
        if (!transaction.committed)
            throw new Error(`write draft transaction failed for ${normalized.draftId}.`);
    }
    async updateDraftTransaction(draftId, expectedConflictToken, updateFn) {
        let transactionResult = { kind: 'missing' };
        await this.db.ref(repository_shared_1.LISTENING_AUTHORING_ROOT).transaction((currentValue) => {
            var _a, _b, _c, _d;
            const root = currentValue !== null ? cloneRootState(currentValue) : {};
            (0, repository_shared_1.assertNoActiveListeningTempCleanupLease)(root, this.now());
            const raw = (_b = (_a = root.drafts) === null || _a === void 0 ? void 0 : _a[draftId]) !== null && _b !== void 0 ? _b : (_c = root.revision_drafts) === null || _c === void 0 ? void 0 : _c[draftId];
            if (!raw) {
                transactionResult = { kind: 'missing' };
                return undefined;
            }
            const current = (0, repository_shared_1.normalizeDraftRecord)(raw);
            if (current.conflictToken !== expectedConflictToken) {
                transactionResult = {
                    kind: 'conflict',
                    currentConflictToken: current.conflictToken,
                };
                return undefined;
            }
            const next = (0, repository_shared_1.normalizeDraftRecord)(updateFn((0, repository_shared_1.cloneDraftRecord)(current)));
            if (next.draftId !== draftId) {
                throw new Error(`draft transaction cannot change draftId from ${draftId}.`);
            }
            if (next.recordType !== current.recordType) {
                throw new Error(`draft transaction cannot change recordType from ${current.recordType}.`);
            }
            const stored = (0, repository_shared_1.normalizeDraftRecord)(Object.assign(Object.assign({}, next), { updatedAt: this.now() }));
            (0, repository_shared_1.assertNoDeletedListeningTempAssets)(root, stored.assetIds);
            (0, repository_shared_1.assertNoDeletedListeningTempAssets)(root, (0, repository_operationRecords_1.deriveAssetIds)(stored.document));
            transactionResult = {
                kind: 'updated',
                conflictToken: stored.conflictToken,
            };
            const collection = stored.recordType === 'draft' ? 'drafts' : 'revision_drafts';
            root[collection] = Object.assign(Object.assign({}, ((_d = root[collection]) !== null && _d !== void 0 ? _d : {})), { [draftId]: stored });
            return root;
        }, undefined, false);
        return transactionResult;
    }
    async claimOperation(input) {
        return (0, repository_firebaseOperations_1.firebaseClaimOperation)(this.db, input, this.now);
    }
    async completeOperation(operationId, result) {
        return (0, repository_firebaseOperations_1.firebaseCompleteOperation)(this.db, operationId, result, this.now);
    }
    async saveDraftTransaction(input) {
        const rootRef = this.db.ref(repository_shared_1.LISTENING_AUTHORING_ROOT);
        let outcome = null;
        const transaction = await rootRef.transaction((currentValue) => {
            var _a, _b, _c, _d, _e, _f;
            const current = currentValue !== null ? cloneRootState(currentValue) : {};
            (0, repository_shared_1.assertNoActiveListeningTempCleanupLease)(current, this.now());
            (0, repository_shared_1.assertNoDeletedListeningTempAssets)(current, (0, repository_operationRecords_1.deriveAssetIds)(input.document));
            const drafts = new Map([
                ...Object.entries((_a = current.drafts) !== null && _a !== void 0 ? _a : {}),
                ...Object.entries((_b = current.revision_drafts) !== null && _b !== void 0 ? _b : {}),
            ]);
            const operationsById = new Map(Object.entries((_c = current.operations) !== null && _c !== void 0 ? _c : {}));
            const operationIdsByLookupKey = new Map();
            for (const operation of operationsById.values()) {
                operationIdsByLookupKey.set((0, repository_operationRecords_1.createOperationScopeKey)(operation), operation.operationId);
            }
            const completedAt = this.now();
            outcome = (0, repository_saveDraftMutation_1.runSaveDraftMutation)({ drafts, operationsById, operationIdsByLookupKey }, input, completedAt);
            if (outcome.kind !== 'saved' && outcome.kind !== 'conflict') {
                if (outcome.kind === 'replayed' || outcome.kind === 'idempotency-conflict') {
                    return undefined;
                }
                return undefined;
            }
            current.drafts = (_d = current.drafts) !== null && _d !== void 0 ? _d : {};
            current.revision_drafts = (_e = current.revision_drafts) !== null && _e !== void 0 ? _e : {};
            current.operations = (_f = current.operations) !== null && _f !== void 0 ? _f : {};
            const savedDraft = drafts.get(input.draftId);
            if (savedDraft !== undefined) {
                if (savedDraft.recordType === 'draft') {
                    current.drafts[input.draftId] = (0, repository_shared_1.cloneDraftRecord)(savedDraft);
                }
                else {
                    current.revision_drafts[input.draftId] = (0, repository_shared_1.cloneDraftRecord)(savedDraft);
                }
            }
            const savedOperation = [...operationsById.values()].find((operation) => operation.operationId === input.operationId);
            if (savedOperation === undefined) {
                throw new Error(`operation ${input.operationId} missing after atomic save.`);
            }
            current.operations[input.operationId] = (0, repository_operationRecords_1.cloneOperationRecord)(savedOperation);
            return current;
        }, undefined, false);
        if (outcome !== null) {
            return outcome;
        }
        if (!transaction.committed) {
            const existing = await (0, repository_firebaseSupport_1.findOperationByScopeKey)(this.db, (0, repository_operationRecords_1.createOperationScopeKey)({
                ownerId: input.ownerId,
                operationType: 'save-draft',
                targetId: input.draftId,
                idempotencyKeyHash: input.idempotencyKeyHash,
            }));
            if (existing !== null) {
                if (existing.requestHash !== input.requestHash) {
                    return {
                        kind: 'idempotency-conflict',
                        draftId: input.draftId,
                        operationId: existing.operationId,
                    };
                }
                if (existing.status === 'succeeded') {
                    const result = (0, repository_operationRecords_1.readTerminalOperationResult)(existing);
                    return {
                        kind: 'replayed',
                        created: (0, repository_operationRecords_1.inferCreatedFromResult)(result),
                        result,
                    };
                }
                if (existing.status === 'failed' &&
                    (existing.errorCode === 'conflict' || existing.errorCode === 'invalid-state')) {
                    const result = (0, repository_operationRecords_1.readTerminalOperationResult)(existing);
                    return {
                        kind: 'conflict',
                        draftId: result.draftId,
                        expectedConflictToken: existing.expectedConflictToken,
                        currentConflictToken: result.conflictToken,
                    };
                }
            }
        }
        throw new Error(`save draft transaction failed for ${input.draftId}.`);
    }
    async publishDraftTransaction(input) {
        return (0, repository_firebasePublish_1.firebasePublishDraftTransaction)(this.db, input);
    }
    async legacyFirstEditTransaction(input) {
        return (0, repository_firebaseLegacyFirstEdit_1.firebaseLegacyFirstEditTransaction)(this.db, input);
    }
    async lifecycleTransaction(input) {
        return (0, repository_firebaseLifecycle_1.firebaseLifecycleTransaction)(this.db, input);
    }
    async createVersionTransaction(input) {
        return (0, repository_firebaseVersions_1.createFirebaseVersionTransaction)(this.db, input);
    }
    async nextVersionNumberTransaction(testId) {
        return (0, repository_firebaseVersions_1.nextFirebaseVersionNumber)(this.db, testId);
    }
}
const createFirebaseListeningAuthoringRepository = (db, options) => new FirebaseListeningAuthoringRepository(db, options);
exports.createFirebaseListeningAuthoringRepository = createFirebaseListeningAuthoringRepository;
//# sourceMappingURL=repository.firebase.js.map