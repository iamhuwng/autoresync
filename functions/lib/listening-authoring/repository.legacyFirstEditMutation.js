"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runLegacyFirstEditMutation = exports.normalizeLegacyListeningTest = void 0;
const canonical_1 = require("./canonical");
const constants_1 = require("./constants");
const repository_operationRecords_1 = require("./repository.operationRecords");
const repository_shared_1 = require("./repository.shared");
const validation_document_1 = require("./validation.document");
const documentFieldNames = [
    'title',
    'type',
    'skill',
    'duration',
    'difficulty',
    'questionCount',
    'isPublic',
    'isComplete',
    'missingAnswerCount',
    'displayMode',
    'metadata',
    'audioSections',
    'questionImages',
    'questions',
    'settings',
    'statistics',
];
const requireFiniteNumber = (value, fieldName) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`${fieldName} must be a finite number.`);
    }
    return value;
};
const requireNonEmptyString = (value, fieldName) => {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`${fieldName} must be a non-empty string.`);
    }
    return value;
};
const readLegacyDocument = (value) => {
    if (!(0, repository_shared_1.isPlainObject)(value)) {
        throw new Error('legacy listening document must be a plain object.');
    }
    const documentInput = Object.fromEntries(documentFieldNames
        .filter((fieldName) => Object.prototype.hasOwnProperty.call(value, fieldName))
        .map((fieldName) => [fieldName, value[fieldName]]));
    (0, validation_document_1.parseDocument)(documentInput);
    return (0, repository_shared_1.cloneRecord)(documentInput);
};
const normalizeLegacyListeningTest = (value, expectedTestId) => {
    if (!(0, repository_shared_1.isPlainObject)(value)) {
        throw new Error(`legacy test ${expectedTestId} must be a plain object.`);
    }
    const id = requireNonEmptyString(value.id, `legacy test ${expectedTestId}.id`);
    if (id !== expectedTestId) {
        throw new Error(`legacy test path/id mismatch for ${expectedTestId}.`);
    }
    requireNonEmptyString(value.ownerId, `legacy test ${expectedTestId}.ownerId`);
    requireNonEmptyString(value.createdBy, `legacy test ${expectedTestId}.createdBy`);
    if (value.isPublished !== true) {
        throw new Error(`legacy test ${expectedTestId} must be published.`);
    }
    readLegacyDocument(value);
    requireFiniteNumber(value.createdAt, `legacy test ${expectedTestId}.createdAt`);
    requireFiniteNumber(value.updatedAt, `legacy test ${expectedTestId}.updatedAt`);
    const normalized = (0, repository_shared_1.cloneRecord)(value);
    if (value.authoringVersioning !== undefined) {
        if (!(0, repository_shared_1.isPlainObject)(value.authoringVersioning)) {
            throw new Error(`legacy test ${expectedTestId}.authoringVersioning must be a record.`);
        }
        const metadata = value.authoringVersioning;
        if (metadata.frozen !== true ||
            metadata.versionNumber !== 1 ||
            metadata.decisionRef !== constants_1.LISTENING_LEGACY_FREEZE_DECISION_REF) {
            throw new Error(`legacy test ${expectedTestId} has malformed freeze metadata.`);
        }
        requireNonEmptyString(metadata.versionId, `legacy test ${expectedTestId}.authoringVersioning.versionId`);
        requireFiniteNumber(metadata.frozenAt, `legacy test ${expectedTestId}.authoringVersioning.frozenAt`);
        requireNonEmptyString(metadata.frozenBy, `legacy test ${expectedTestId}.authoringVersioning.frozenBy`);
    }
    return normalized;
};
exports.normalizeLegacyListeningTest = normalizeLegacyListeningTest;
const readPublishedResult = (operation) => {
    const result = operation.result;
    if (operation.completedAt === undefined ||
        result === undefined ||
        typeof result.draftId !== 'string' ||
        typeof result.versionId !== 'string' ||
        typeof result.versionNumber !== 'number' ||
        typeof result.conflictToken !== 'number') {
        throw new Error(`malformed legacy publish operation ${operation.operationId}.`);
    }
    return {
        draftId: result.draftId,
        versionId: result.versionId,
        versionNumber: result.versionNumber,
        conflictToken: result.conflictToken,
    };
};
const findRevisionDraft = (state, legacyTestId, versionId) => [...state.drafts.values()].find((draft) => (draft.recordType === 'revision-draft'
    && draft.testId === legacyTestId
    && draft.createdFromVersionId === versionId));
const freezeLegacyFromVersion = (state, input, version) => {
    const legacy = state.legacyTests.get(input.legacyTestId);
    if (legacy === undefined || legacy.ownerId !== input.ownerId || legacy.authoringVersioning) {
        return;
    }
    state.legacyTests.set(input.legacyTestId, Object.assign(Object.assign({}, (0, repository_shared_1.cloneRecord)(legacy)), { authoringVersioning: {
            frozen: true,
            versionId: version.versionId,
            versionNumber: 1,
            frozenAt: version.publishedAt,
            frozenBy: version.publishedBy,
            decisionRef: constants_1.LISTENING_LEGACY_FREEZE_DECISION_REF,
        } }));
};
const runLegacyFirstEditMutation = (state, input) => {
    const scopeKey = (0, repository_operationRecords_1.createOperationScopeKey)({
        ownerId: input.ownerId,
        operationType: 'publish',
        targetId: input.legacyTestId,
        idempotencyKeyHash: input.idempotencyKeyHash,
    });
    const existingOperationId = state.operationIdsByLookupKey.get(scopeKey);
    if (existingOperationId !== undefined) {
        const existingOperation = state.operationsById.get(existingOperationId);
        if (existingOperation === undefined) {
            throw new Error(`operation ${existingOperationId} missing for legacy publish.`);
        }
        if (existingOperation.requestHash !== input.requestHash) {
            return {
                kind: 'idempotency-conflict',
                draftId: input.revisionDraftId,
                operationId: existingOperation.operationId,
            };
        }
        if (existingOperation.status !== 'succeeded') {
            throw new Error(`malformed legacy publish operation ${existingOperation.operationId}.`);
        }
        const result = readPublishedResult(existingOperation);
        const version = state.versions.get(result.versionId);
        const revision = state.drafts.get(result.draftId);
        if (version !== undefined &&
            revision !== undefined &&
            version.versionNumber === 1 &&
            version.sourceDraftPath === 'legacy_tests' &&
            version.sourceLegacyTestId === input.legacyTestId) {
            freezeLegacyFromVersion(state, input, version);
        }
        return { kind: 'replayed', result };
    }
    if (state.operationsById.has(input.operationId)) {
        throw new Error(`operation ${input.operationId} already exists.`);
    }
    const legacy = state.legacyTests.get(input.legacyTestId);
    if (legacy === undefined || legacy.ownerId !== input.ownerId) {
        return { kind: 'not-found', draftId: input.revisionDraftId };
    }
    const existingFreeze = legacy.authoringVersioning;
    if (existingFreeze !== undefined) {
        const version = state.versions.get(existingFreeze.versionId);
        const revision = [...state.drafts.values()].find((draft) => (draft.recordType === 'revision-draft'
            && draft.testId === input.legacyTestId
            && draft.createdFromVersionId === existingFreeze.versionId));
        if (version === undefined ||
            revision === undefined ||
            version.versionNumber !== 1 ||
            version.sourceDraftPath !== 'legacy_tests' ||
            version.sourceLegacyTestId !== input.legacyTestId) {
            throw new Error(`legacy test ${input.legacyTestId} freeze links are incomplete.`);
        }
        const result = {
            draftId: revision.draftId,
            versionId: version.versionId,
            versionNumber: version.versionNumber,
            conflictToken: revision.conflictToken,
        };
        const operation = (0, repository_operationRecords_1.createSucceededOperationRecord)({
            operationId: input.operationId,
            operationType: 'publish',
            targetType: 'legacy-test',
            ownerId: input.ownerId,
            targetId: input.legacyTestId,
            idempotencyKeyHash: input.idempotencyKeyHash,
            requestHash: input.requestHash,
            result,
            completedAt: input.publishedAt,
        });
        state.operationsById.set(operation.operationId, operation);
        state.operationIdsByLookupKey.set(scopeKey, operation.operationId);
        return { kind: 'replayed', result };
    }
    const duplicateLegacyVersion = [...state.versions.values()].find((version) => (version.sourceDraftPath === 'legacy_tests'
        && version.sourceLegacyTestId === input.legacyTestId));
    if (duplicateLegacyVersion !== undefined) {
        const revision = findRevisionDraft(state, input.legacyTestId, duplicateLegacyVersion.versionId);
        if (revision === undefined ||
            duplicateLegacyVersion.versionNumber !== 1 ||
            duplicateLegacyVersion.ownerId !== input.ownerId ||
            duplicateLegacyVersion.publishOperationId === undefined) {
            throw new Error(`legacy test ${input.legacyTestId} has conflicting versioning state.`);
        }
        const result = {
            draftId: revision.draftId,
            versionId: duplicateLegacyVersion.versionId,
            versionNumber: duplicateLegacyVersion.versionNumber,
            conflictToken: revision.conflictToken,
        };
        const operation = (0, repository_operationRecords_1.createSucceededOperationRecord)({
            operationId: input.operationId,
            operationType: 'publish',
            targetType: 'legacy-test',
            ownerId: input.ownerId,
            targetId: input.legacyTestId,
            idempotencyKeyHash: input.idempotencyKeyHash,
            requestHash: input.requestHash,
            result,
            completedAt: input.publishedAt,
        });
        state.operationsById.set(operation.operationId, operation);
        state.operationIdsByLookupKey.set(scopeKey, operation.operationId);
        freezeLegacyFromVersion(state, input, duplicateLegacyVersion);
        return { kind: 'replayed', result };
    }
    if (state.versions.has(input.versionId) ||
        state.drafts.has(input.revisionDraftId)) {
        throw new Error(`legacy test ${input.legacyTestId} has conflicting versioning state.`);
    }
    const document = readLegacyDocument(legacy);
    const assetIds = (0, repository_operationRecords_1.deriveAssetIds)(document);
    const version = (0, repository_shared_1.normalizeVersionRecord)({
        schemaVersion: constants_1.LISTENING_AUTHORING_SCHEMA_VERSION,
        recordType: 'published-version',
        versionId: input.versionId,
        versionNumber: 1,
        testId: input.legacyTestId,
        ownerId: input.ownerId,
        sourceDraftPath: 'legacy_tests',
        sourceLegacyTestId: input.legacyTestId,
        document: (0, repository_shared_1.cloneRecord)(document),
        assetIds,
        publishedAt: input.publishedAt,
        publishedBy: input.ownerId,
        publishOperationId: input.operationId,
        documentHash: (0, canonical_1.requestHash)(document),
        archive: { state: 'active' },
        compatibility: {
            legacyTestPath: `tests/${input.legacyTestId}`,
            frozenLegacyVersion1: true,
        },
    });
    const revision = (0, repository_shared_1.normalizeDraftRecord)({
        schemaVersion: constants_1.LISTENING_AUTHORING_SCHEMA_VERSION,
        recordType: 'revision-draft',
        draftId: input.revisionDraftId,
        testId: input.legacyTestId,
        ownerId: input.ownerId,
        state: 'active',
        conflictToken: 1,
        createdFromVersionId: version.versionId,
        createdFromVersionNumber: 1,
        document: (0, repository_shared_1.cloneRecord)(document),
        assetIds,
        createdAt: input.publishedAt,
        createdBy: input.ownerId,
        updatedAt: input.publishedAt,
        updatedBy: input.ownerId,
        lastOperationId: input.operationId,
    });
    const result = {
        draftId: revision.draftId,
        versionId: version.versionId,
        versionNumber: 1,
        conflictToken: 1,
    };
    const operation = (0, repository_operationRecords_1.createSucceededOperationRecord)({
        operationId: input.operationId,
        operationType: 'publish',
        targetType: 'legacy-test',
        ownerId: input.ownerId,
        targetId: input.legacyTestId,
        idempotencyKeyHash: input.idempotencyKeyHash,
        requestHash: input.requestHash,
        result,
        completedAt: input.publishedAt,
    });
    state.legacyTests.set(input.legacyTestId, Object.assign(Object.assign({}, (0, repository_shared_1.cloneRecord)(legacy)), { authoringVersioning: {
            frozen: true,
            versionId: version.versionId,
            versionNumber: 1,
            frozenAt: input.publishedAt,
            frozenBy: input.ownerId,
            decisionRef: constants_1.LISTENING_LEGACY_FREEZE_DECISION_REF,
        } }));
    state.versions.set(version.versionId, (0, repository_shared_1.cloneVersionRecord)(version));
    state.drafts.set(revision.draftId, (0, repository_shared_1.cloneDraftRecord)(revision));
    state.operationsById.set(operation.operationId, operation);
    state.operationIdsByLookupKey.set(scopeKey, operation.operationId);
    return { kind: 'published', result };
};
exports.runLegacyFirstEditMutation = runLegacyFirstEditMutation;
//# sourceMappingURL=repository.legacyFirstEditMutation.js.map