"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.firebasePublishDraftTransaction = void 0;
const repository_shared_1 = require("./repository.shared");
const repository_operationRecords_1 = require("./repository.operationRecords");
const repository_publishMutation_1 = require("./repository.publishMutation");
const cloneRootState = (value) => (0, repository_shared_1.cloneRecord)(value);
const firebasePublishDraftTransaction = async (db, input) => {
    const rootRef = db.ref(repository_shared_1.LISTENING_AUTHORING_ROOT);
    let outcome = null;
    const transaction = await rootRef.transaction((currentValue) => {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        const current = currentValue !== null ? cloneRootState(currentValue) : {};
        const drafts = new Map([
            ...Object.entries((_a = current.drafts) !== null && _a !== void 0 ? _a : {}),
            ...Object.entries((_b = current.revision_drafts) !== null && _b !== void 0 ? _b : {}),
        ]);
        const versions = new Map(Object.entries((_c = current.versions) !== null && _c !== void 0 ? _c : {}));
        const operationsById = new Map(Object.entries((_d = current.operations) !== null && _d !== void 0 ? _d : {}));
        const operationIdsByLookupKey = new Map();
        for (const operation of operationsById.values()) {
            operationIdsByLookupKey.set((0, repository_operationRecords_1.createOperationScopeKey)(operation), operation.operationId);
        }
        outcome = (0, repository_publishMutation_1.runPublishDraftMutation)({ drafts, versions, operationsById, operationIdsByLookupKey }, input);
        if (outcome.kind !== 'published' && outcome.kind !== 'blocked' && outcome.kind !== 'conflict') {
            return undefined;
        }
        current.drafts = (_e = current.drafts) !== null && _e !== void 0 ? _e : {};
        current.revision_drafts = (_f = current.revision_drafts) !== null && _f !== void 0 ? _f : {};
        current.versions = (_g = current.versions) !== null && _g !== void 0 ? _g : {};
        current.operations = (_h = current.operations) !== null && _h !== void 0 ? _h : {};
        const savedDraft = drafts.get(input.draftId);
        if (savedDraft !== undefined) {
            if (savedDraft.recordType === 'draft') {
                current.drafts[input.draftId] = (0, repository_shared_1.cloneDraftRecord)(savedDraft);
            }
            else {
                current.revision_drafts[input.draftId] = (0, repository_shared_1.cloneDraftRecord)(savedDraft);
            }
        }
        const savedVersion = versions.get(input.versionId);
        if (savedVersion !== undefined) {
            current.versions[input.versionId] = (0, repository_shared_1.cloneVersionRecord)(savedVersion);
        }
        const savedOperation = operationsById.get(input.operationId);
        if (savedOperation === undefined) {
            throw new Error(`operation ${input.operationId} missing after publish transaction.`);
        }
        current.operations[input.operationId] = (0, repository_operationRecords_1.cloneOperationRecord)(savedOperation);
        return current;
    }, undefined, false);
    if (outcome !== null) {
        return outcome;
    }
    if (!transaction.committed) {
        throw new Error(`publish transaction failed for ${input.draftId}.`);
    }
    throw new Error(`publish transaction missing outcome for ${input.draftId}.`);
};
exports.firebasePublishDraftTransaction = firebasePublishDraftTransaction;
//# sourceMappingURL=repository.firebasePublish.js.map