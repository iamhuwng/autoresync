"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.firebaseLegacyFirstEditTransaction = void 0;
const repository_operationRecords_1 = require("./repository.operationRecords");
const repository_legacyFirstEditMutation_1 = require("./repository.legacyFirstEditMutation");
const repository_shared_1 = require("./repository.shared");
const firebaseLegacyFirstEditTransaction = async (db, input) => {
    const rootRef = db.ref();
    let outcome = null;
    const transaction = await rootRef.transaction((currentValue) => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
        const current = currentValue !== null ? (0, repository_shared_1.cloneRecord)(currentValue) : {};
        const authoring = (_a = current.listening_authoring) !== null && _a !== void 0 ? _a : {};
        const rawLegacyTests = (_b = current.tests) !== null && _b !== void 0 ? _b : {};
        const legacyTests = new Map();
        for (const [testId, value] of Object.entries(rawLegacyTests)) {
            if (testId === input.legacyTestId) {
                legacyTests.set(testId, (0, repository_legacyFirstEditMutation_1.normalizeLegacyListeningTest)(value, testId));
            }
        }
        const drafts = new Map([
            ...Object.entries((_c = authoring.drafts) !== null && _c !== void 0 ? _c : {}),
            ...Object.entries((_d = authoring.revision_drafts) !== null && _d !== void 0 ? _d : {}),
        ]);
        const versions = new Map(Object.entries((_e = authoring.versions) !== null && _e !== void 0 ? _e : {}));
        const operationsById = new Map(Object.entries((_f = authoring.operations) !== null && _f !== void 0 ? _f : {}));
        const operationIdsByLookupKey = new Map();
        for (const operation of operationsById.values()) {
            operationIdsByLookupKey.set((0, repository_operationRecords_1.createOperationScopeKey)(operation), operation.operationId);
        }
        outcome = (0, repository_legacyFirstEditMutation_1.runLegacyFirstEditMutation)({ legacyTests, drafts, versions, operationsById, operationIdsByLookupKey }, input);
        const savedOperation = operationsById.get(input.operationId);
        if (savedOperation === undefined) {
            return undefined;
        }
        const savedLegacyTest = legacyTests.get(input.legacyTestId);
        const savedDraft = drafts.get(input.revisionDraftId);
        const savedVersion = versions.get(input.versionId);
        if (savedLegacyTest === undefined ||
            savedDraft === undefined ||
            savedVersion === undefined) {
            throw new Error(`legacy first-edit transaction incomplete for ${input.legacyTestId}.`);
        }
        current.tests = Object.assign(Object.assign({}, rawLegacyTests), { [input.legacyTestId]: (0, repository_shared_1.cloneRecord)(savedLegacyTest) });
        current.listening_authoring = Object.assign(Object.assign({}, authoring), { drafts: (_g = authoring.drafts) !== null && _g !== void 0 ? _g : {}, revision_drafts: Object.assign(Object.assign({}, ((_h = authoring.revision_drafts) !== null && _h !== void 0 ? _h : {})), { [savedDraft.draftId]: (0, repository_shared_1.cloneDraftRecord)(savedDraft) }), versions: Object.assign(Object.assign({}, ((_j = authoring.versions) !== null && _j !== void 0 ? _j : {})), { [savedVersion.versionId]: (0, repository_shared_1.cloneVersionRecord)(savedVersion) }), operations: Object.assign(Object.assign({}, ((_k = authoring.operations) !== null && _k !== void 0 ? _k : {})), { [savedOperation.operationId]: (0, repository_operationRecords_1.cloneOperationRecord)(savedOperation) }) });
        return current;
    }, undefined, false);
    if (outcome !== null) {
        return outcome;
    }
    if (!transaction.committed) {
        throw new Error(`legacy first-edit transaction failed for ${input.legacyTestId}.`);
    }
    throw new Error(`legacy first-edit transaction missing outcome for ${input.legacyTestId}.`);
};
exports.firebaseLegacyFirstEditTransaction = firebaseLegacyFirstEditTransaction;
//# sourceMappingURL=repository.firebaseLegacyFirstEdit.js.map