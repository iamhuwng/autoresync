"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findOperationByScopeKey = exports.findDraftLocation = exports.pathForDraftRecord = exports.pathForPrefix = void 0;
const constants_1 = require("./constants");
const repository_operationRecords_1 = require("./repository.operationRecords");
const repository_shared_1 = require("./repository.shared");
const pathForPrefix = (prefix) => {
    switch (prefix) {
        case 'draft':
            return constants_1.LISTENING_AUTHORING_PATHS.drafts;
        case 'version':
            return constants_1.LISTENING_AUTHORING_PATHS.versions;
        case 'operation':
            return constants_1.LISTENING_AUTHORING_PATHS.operations;
    }
};
exports.pathForPrefix = pathForPrefix;
const pathForDraftRecord = (record) => record.recordType === 'draft'
    ? constants_1.LISTENING_AUTHORING_PATHS.drafts
    : constants_1.LISTENING_AUTHORING_PATHS.revisionDrafts;
exports.pathForDraftRecord = pathForDraftRecord;
const findDraftLocation = async (db, draftId) => {
    const draftRef = db.ref(`${constants_1.LISTENING_AUTHORING_PATHS.drafts}/${draftId}`);
    const draftSnapshot = await draftRef.once('value');
    if (draftSnapshot.exists()) {
        return {
            ref: draftRef,
            record: (0, repository_shared_1.normalizeDraftRecord)(draftSnapshot.val()),
        };
    }
    const revisionDraftRef = db.ref(`${constants_1.LISTENING_AUTHORING_PATHS.revisionDrafts}/${draftId}`);
    const revisionDraftSnapshot = await revisionDraftRef.once('value');
    if (revisionDraftSnapshot.exists()) {
        return {
            ref: revisionDraftRef,
            record: (0, repository_shared_1.normalizeDraftRecord)(revisionDraftSnapshot.val()),
        };
    }
    return null;
};
exports.findDraftLocation = findDraftLocation;
const findOperationByScopeKey = async (db, scopeKey) => {
    var _a;
    const scopeParts = scopeKey.split('::');
    const idempotencyKeyHash = (_a = scopeParts[scopeParts.length - 1]) !== null && _a !== void 0 ? _a : '';
    const snapshot = await db
        .ref(constants_1.LISTENING_AUTHORING_PATHS.operations)
        .orderByChild('idempotencyKeyHash')
        .equalTo(idempotencyKeyHash)
        .once('value');
    if (!snapshot.exists()) {
        return null;
    }
    const records = Object.values(snapshot.val());
    const matchedRecord = records.find((record) => (0, repository_operationRecords_1.createOperationScopeKey)(record) === scopeKey);
    return matchedRecord === undefined ? null : (0, repository_operationRecords_1.cloneOperationRecord)(matchedRecord);
};
exports.findOperationByScopeKey = findOperationByScopeKey;
//# sourceMappingURL=repository.firebaseSupport.js.map