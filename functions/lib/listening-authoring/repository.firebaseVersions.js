"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nextFirebaseVersionNumber = exports.createFirebaseVersionTransaction = void 0;
const constants_1 = require("./constants");
const repository_shared_1 = require("./repository.shared");
const repository_operationRecords_1 = require("./repository.operationRecords");
const createFirebaseVersionTransaction = async (db, input) => {
    const versionsRef = db.ref(repository_shared_1.LISTENING_AUTHORING_ROOT);
    let outcome = null;
    const transaction = await versionsRef.transaction((currentValue) => {
        var _a;
        const root = currentValue !== null
            ? (0, repository_shared_1.cloneRecord)(currentValue)
            : {};
        (0, repository_shared_1.assertNoActiveListeningTempCleanupLease)(root, Date.now());
        (0, repository_shared_1.assertNoDeletedListeningTempAssets)(root, input.assetIds);
        (0, repository_shared_1.assertNoDeletedListeningTempAssets)(root, (0, repository_operationRecords_1.deriveAssetIds)(input.document));
        const current = (0, repository_shared_1.normalizeVersionMap)((_a = root.versions) !== null && _a !== void 0 ? _a : {});
        const existingById = current[input.versionId];
        if (existingById !== undefined) {
            outcome = { kind: 'exists', record: (0, repository_shared_1.cloneVersionRecord)(existingById) };
            return undefined;
        }
        const versionNumber = Object.values(current)
            .filter((existing) => existing.testId === input.testId)
            .reduce((max, existing) => Math.max(max, existing.versionNumber), 0) + 1;
        const created = (0, repository_shared_1.normalizeVersionRecord)(Object.assign(Object.assign({}, input), { schemaVersion: constants_1.LISTENING_AUTHORING_SCHEMA_VERSION, versionNumber }));
        outcome = { kind: 'created', record: (0, repository_shared_1.cloneVersionRecord)(created) };
        return Object.assign(Object.assign({}, root), { versions: Object.assign(Object.assign({}, current), { [created.versionId]: created }) });
    }, undefined, false);
    if (outcome !== null) {
        return outcome;
    }
    if (!transaction.committed) {
        throw new Error(`version transaction failed for ${input.versionId}.`);
    }
    throw new Error(`version transaction missing outcome for ${input.versionId}.`);
};
exports.createFirebaseVersionTransaction = createFirebaseVersionTransaction;
const nextFirebaseVersionNumber = async (db, testId) => {
    const snapshot = await db
        .ref(constants_1.LISTENING_AUTHORING_PATHS.versions)
        .orderByChild('testId')
        .equalTo(testId)
        .once('value');
    if (!snapshot.exists()) {
        return 1;
    }
    const versions = Object.values((0, repository_shared_1.normalizeVersionMap)(snapshot.val()));
    const maxVersionNumber = versions.reduce((max, version) => Math.max(max, version.versionNumber), 0);
    return maxVersionNumber + 1;
};
exports.nextFirebaseVersionNumber = nextFirebaseVersionNumber;
//# sourceMappingURL=repository.firebaseVersions.js.map