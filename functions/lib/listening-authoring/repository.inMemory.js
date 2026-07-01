"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInMemoryListeningAuthoringRepository = void 0;
const constants_1 = require("./constants");
const repository_operationRecords_1 = require("./repository.operationRecords");
const repository_lifecycleMutation_1 = require("./repository.lifecycleMutation");
const repository_legacyFirstEditMutation_1 = require("./repository.legacyFirstEditMutation");
const repository_publishMutation_1 = require("./repository.publishMutation");
const repository_saveDraftMutation_1 = require("./repository.saveDraftMutation");
const repository_shared_1 = require("./repository.shared");
class InMemoryListeningAuthoringRepositoryImpl {
    constructor(options = {}) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        this.drafts = new Map();
        this.legacyTests = new Map();
        this.versions = new Map();
        this.operationsById = new Map();
        this.operationIdsByLookupKey = new Map();
        this.sequences = {
            draft: 1,
            version: 1,
            operation: 1,
        };
        this.eventLog = [];
        this.now = (_a = options.now) !== null && _a !== void 0 ? _a : Date.now;
        for (const legacyTest of (_c = (_b = options.seed) === null || _b === void 0 ? void 0 : _b.legacyTests) !== null && _c !== void 0 ? _c : []) {
            this.legacyTests.set(legacyTest.id, (0, repository_legacyFirstEditMutation_1.normalizeLegacyListeningTest)(legacyTest, legacyTest.id));
        }
        for (const draft of (_e = (_d = options.seed) === null || _d === void 0 ? void 0 : _d.drafts) !== null && _e !== void 0 ? _e : []) {
            this.drafts.set(draft.draftId, (0, repository_shared_1.normalizeDraftRecord)(draft));
            this.bumpSequence('draft', draft.draftId);
        }
        for (const version of (_g = (_f = options.seed) === null || _f === void 0 ? void 0 : _f.versions) !== null && _g !== void 0 ? _g : []) {
            const normalized = (0, repository_shared_1.normalizeVersionRecord)(version);
            this.versions.set(version.versionId, normalized);
            this.bumpSequence('version', version.versionId);
        }
        for (const operation of (_j = (_h = options.seed) === null || _h === void 0 ? void 0 : _h.operations) !== null && _j !== void 0 ? _j : []) {
            const normalized = (0, repository_operationRecords_1.cloneOperationRecord)(operation);
            this.operationsById.set(normalized.operationId, normalized);
            this.operationIdsByLookupKey.set((0, repository_operationRecords_1.createOperationScopeKey)(normalized), normalized.operationId);
            this.bumpSequence('operation', normalized.operationId);
        }
    }
    allocateId(prefix) {
        const sequence = this.sequences[prefix];
        this.sequences[prefix] += 1;
        return `${prefix}-${sequence}`;
    }
    async getDraft(draftId) {
        const draft = this.drafts.get(draftId);
        return draft === undefined ? null : (0, repository_shared_1.cloneDraftRecord)(draft);
    }
    async getLegacyTest(testId) {
        const legacyTest = this.legacyTests.get(testId);
        return legacyTest === undefined ? null : (0, repository_shared_1.cloneRecord)(legacyTest);
    }
    async writeDraft(record) {
        this.drafts.set(record.draftId, (0, repository_shared_1.normalizeDraftRecord)(record));
        this.bumpSequence('draft', record.draftId);
    }
    async updateDraftTransaction(draftId, expectedConflictToken, updateFn) {
        const current = this.drafts.get(draftId);
        if (current === undefined) {
            return { kind: 'missing' };
        }
        if (current.conflictToken !== expectedConflictToken) {
            return { kind: 'conflict', currentConflictToken: current.conflictToken };
        }
        const next = (0, repository_shared_1.normalizeDraftRecord)(updateFn((0, repository_shared_1.cloneDraftRecord)(current)));
        if (next.draftId !== draftId) {
            throw new Error(`draft transaction cannot change draftId from ${draftId}.`);
        }
        if (next.recordType !== current.recordType) {
            throw new Error(`draft transaction cannot change recordType from ${current.recordType}.`);
        }
        const stored = (0, repository_shared_1.normalizeDraftRecord)(Object.assign(Object.assign({}, next), { updatedAt: this.now() }));
        this.drafts.set(draftId, stored);
        return {
            kind: 'updated',
            conflictToken: stored.conflictToken,
        };
    }
    async claimOperation(input) {
        const lookupKey = (0, repository_operationRecords_1.createOperationScopeKey)(input);
        const existingOperationId = this.operationIdsByLookupKey.get(lookupKey);
        if (existingOperationId !== undefined) {
            const existing = this.operationsById.get(existingOperationId);
            if (existing === undefined) {
                throw new Error(`operation ${existingOperationId} missing for lookup key ${lookupKey}.`);
            }
            const clonedExisting = (0, repository_operationRecords_1.cloneOperationRecord)(existing);
            return existing.requestHash === input.requestHash
                ? { kind: 'existing', record: clonedExisting }
                : { kind: 'conflict', record: clonedExisting };
        }
        if (this.operationsById.has(input.operationId)) {
            throw new Error(`operation ${input.operationId} already exists.`);
        }
        const createdAt = this.now();
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
        this.operationsById.set(record.operationId, (0, repository_operationRecords_1.cloneOperationRecord)(record));
        this.operationIdsByLookupKey.set(lookupKey, record.operationId);
        this.bumpSequence('operation', record.operationId);
        this.eventLog.push(`claim:${record.operationId}`);
        return { kind: 'claimed', record: (0, repository_operationRecords_1.cloneOperationRecord)(record) };
    }
    async completeOperation(operationId, result) {
        const current = this.operationsById.get(operationId);
        if (current === undefined) {
            throw new Error(`operation ${operationId} not found.`);
        }
        if (current.status === 'succeeded') {
            return;
        }
        if (current.status === 'failed') {
            throw new Error(`operation ${operationId} already failed.`);
        }
        const completedAt = this.now();
        const updated = Object.assign(Object.assign({}, (0, repository_operationRecords_1.cloneOperationRecord)(current)), { status: 'succeeded', result: (0, repository_shared_1.cloneRecord)(result), completedAt, expiresAt: completedAt + constants_1.LISTENING_AUTHORING_OPERATION_TTL_MS });
        this.operationsById.set(operationId, (0, repository_operationRecords_1.cloneOperationRecord)(updated));
    }
    async saveDraftTransaction(input) {
        const result = (0, repository_saveDraftMutation_1.runSaveDraftMutation)({
            drafts: this.drafts,
            operationsById: this.operationsById,
            operationIdsByLookupKey: this.operationIdsByLookupKey,
        }, input, this.now());
        if (this.operationsById.has(input.operationId)) {
            this.bumpSequence('operation', input.operationId);
        }
        return result;
    }
    async publishDraftTransaction(input) {
        const result = (0, repository_publishMutation_1.runPublishDraftMutation)({
            drafts: this.drafts,
            versions: this.versions,
            operationsById: this.operationsById,
            operationIdsByLookupKey: this.operationIdsByLookupKey,
        }, input);
        if (this.operationsById.has(input.operationId)) {
            this.bumpSequence('operation', input.operationId);
        }
        if (this.versions.has(input.versionId)) {
            this.bumpSequence('version', input.versionId);
        }
        return result;
    }
    async legacyFirstEditTransaction(input) {
        const result = (0, repository_legacyFirstEditMutation_1.runLegacyFirstEditMutation)({
            legacyTests: this.legacyTests,
            drafts: this.drafts,
            versions: this.versions,
            operationsById: this.operationsById,
            operationIdsByLookupKey: this.operationIdsByLookupKey,
        }, input);
        if (this.operationsById.has(input.operationId)) {
            this.bumpSequence('operation', input.operationId);
        }
        if (this.versions.has(input.versionId)) {
            this.bumpSequence('version', input.versionId);
        }
        if (this.drafts.has(input.revisionDraftId)) {
            this.bumpSequence('draft', input.revisionDraftId);
        }
        return result;
    }
    async lifecycleTransaction(input) {
        const result = (0, repository_lifecycleMutation_1.runLifecycleMutation)({
            drafts: this.drafts,
            versions: this.versions,
            operationsById: this.operationsById,
            operationIdsByLookupKey: this.operationIdsByLookupKey,
        }, input);
        if (this.operationsById.has(input.operationId)) {
            this.bumpSequence('operation', input.operationId);
        }
        return result;
    }
    async createVersionTransaction(input) {
        const existingById = this.versions.get(input.versionId);
        if (existingById !== undefined) {
            return { kind: 'exists', record: (0, repository_shared_1.cloneVersionRecord)(existingById) };
        }
        const versionNumber = [...this.versions.values()]
            .filter((existing) => existing.testId === input.testId)
            .reduce((max, existing) => Math.max(max, existing.versionNumber), 0) + 1;
        const created = (0, repository_shared_1.normalizeVersionRecord)(Object.assign(Object.assign({}, input), { schemaVersion: constants_1.LISTENING_AUTHORING_SCHEMA_VERSION, versionNumber }));
        this.versions.set(created.versionId, created);
        this.bumpSequence('version', created.versionId);
        return { kind: 'created', record: (0, repository_shared_1.cloneVersionRecord)(created) };
    }
    async nextVersionNumberTransaction(testId) {
        return ([...this.versions.values()]
            .filter((existing) => existing.testId === testId)
            .reduce((max, existing) => Math.max(max, existing.versionNumber), 0) + 1);
    }
    events() {
        return [...this.eventLog];
    }
    listOperationClaims() {
        return [...this.operationsById.values()].map((record) => (0, repository_operationRecords_1.cloneOperationRecord)(record));
    }
    listVersions() {
        return [...this.versions.values()].map((record) => (0, repository_shared_1.cloneVersionRecord)(record));
    }
    bumpSequence(prefix, value) {
        const sequence = (0, repository_shared_1.extractSequence)(value, prefix);
        if (sequence !== undefined) {
            this.sequences[prefix] = Math.max(this.sequences[prefix], sequence + 1);
        }
    }
}
const createInMemoryListeningAuthoringRepository = (options = {}) => new InMemoryListeningAuthoringRepositoryImpl(options);
exports.createInMemoryListeningAuthoringRepository = createInMemoryListeningAuthoringRepository;
//# sourceMappingURL=repository.inMemory.js.map