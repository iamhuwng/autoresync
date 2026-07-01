"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const vitest_1 = require("vitest");
const canonical_1 = require("./canonical");
const constants_1 = require("./constants");
const repository_1 = require("./repository");
const baseDocument = {
    title: 'Listening draft',
    type: 'IELTS',
    skill: 'Listening',
    duration: 42,
    difficulty: 'Intermediate',
    questionCount: 1,
    isPublic: false,
    isComplete: true,
    displayMode: 'text',
    metadata: {
        description: 'Maps practice',
        instructions: 'Answer every question.',
        tags: ['maps'],
    },
    audioSections: [
        {
            number: 1,
            name: 'Section 1',
            assetId: 'asset-1',
            audioUrl: 'r2://asset-1',
            startQuestion: 1,
            endQuestion: 1,
        },
        {
            number: 2,
            name: 'Section 2',
            assetId: 'asset-1',
            audioUrl: 'r2://asset-1',
            startQuestion: 1,
            endQuestion: 1,
        },
        {
            number: 3,
            name: 'Section 3',
            assetId: 'asset-2',
            audioUrl: 'r2://asset-2',
            startQuestion: 1,
            endQuestion: 1,
        },
    ],
    questions: [
        {
            number: 1,
            type: 'short-answer',
            question: 'Question 1',
            answer: 'A',
            sectionNumber: 1,
            points: 1,
        },
    ],
    settings: {
        allowPause: true,
        showTimer: true,
        shuffleQuestions: false,
        showResults: 'after-submission',
        allowReview: true,
        passingScore: 60,
        allowReplay: true,
    },
};
const createLegacyTestRecord = (overrides = {}) => (Object.assign(Object.assign({ id: 'legacy-test-1', ownerId: 'teacher-1', createdAt: 1600000000000, createdBy: 'teacher-1', updatedAt: 1600000000500, isPublished: true }, baseDocument), overrides));
const createNow = (...values) => {
    var _a;
    let index = 0;
    const last = (_a = values[values.length - 1]) !== null && _a !== void 0 ? _a : 0;
    return () => {
        var _a;
        const current = (_a = values[index]) !== null && _a !== void 0 ? _a : last;
        index += 1;
        return current;
    };
};
const createRepository = (now = createNow(1700000000000)) => (0, repository_1.createInMemoryListeningAuthoringRepository)({ now });
const cloneValue = (value) => {
    if (value === undefined) {
        return value;
    }
    return JSON.parse(JSON.stringify(value));
};
const getPath = (store, path) => {
    const parts = path.split('/').filter(Boolean);
    let current = store;
    for (const part of parts) {
        if (current === null || typeof current !== 'object' || !(part in current)) {
            return undefined;
        }
        current = current[part];
    }
    return cloneValue(current);
};
const setPath = (store, path, value) => {
    const parts = path.split('/').filter(Boolean);
    if (parts.length === 0) {
        const replacement = cloneValue(value);
        for (const key of Object.keys(store)) {
            delete store[key];
        }
        Object.assign(store, replacement);
        return;
    }
    let current = store;
    for (const part of parts.slice(0, -1)) {
        const next = current[part];
        if (next === null || typeof next !== 'object' || Array.isArray(next)) {
            current[part] = {};
        }
        current = current[part];
    }
    current[parts[parts.length - 1]] = cloneValue(value);
};
const createSnapshot = (value) => ({
    exists: () => value !== undefined && value !== null,
    val: () => cloneValue(value),
});
const createFakeDatabase = (initial = {}) => {
    const store = cloneValue(initial);
    let pushCounter = 1;
    const createReference = (path) => ({
        push: () => ({ key: `fake-key-${pushCounter++}` }),
        set: async (value) => {
            setPath(store, path, value);
        },
        once: async () => createSnapshot(getPath(store, path)),
        transaction: async (updateFn) => {
            const current = getPath(store, path);
            const next = updateFn(current === undefined ? null : current);
            if (next === undefined) {
                return { committed: false, snapshot: createSnapshot(current) };
            }
            setPath(store, path, next);
            return { committed: true, snapshot: createSnapshot(next) };
        },
        orderByChild: (child) => ({
            equalTo: (expected) => ({
                once: async () => {
                    const collection = getPath(store, path);
                    if (collection === undefined || collection === null || typeof collection !== 'object') {
                        return createSnapshot(undefined);
                    }
                    const matched = Object.fromEntries(Object.entries(collection)
                        .filter(([, record]) => (record === null || record === void 0 ? void 0 : record[child]) === expected));
                    return createSnapshot(Object.keys(matched).length > 0 ? matched : undefined);
                },
            }),
        }),
    });
    return {
        db: {
            ref: (path = '') => createReference(path),
        },
        dump: () => cloneValue(store),
    };
};
const createDraftRecord = (overrides = {}) => (Object.assign({ schemaVersion: 1, recordType: 'draft', draftId: 'draft-1', testId: 'test-1', ownerId: 'teacher-1', state: 'active', conflictToken: 2, latestPublishedVersionId: 'version-1', document: Object.assign(Object.assign({}, baseDocument), { title: 'Seed draft' }), assetIds: {
        'asset-1': true,
        'asset-2': true,
    }, createdAt: 1000, createdBy: 'teacher-1', updatedAt: 2000, updatedBy: 'teacher-1', lastOperationId: 'operation-seed' }, overrides));
const createRevisionDraftRecord = (overrides = {}) => (Object.assign({ schemaVersion: 1, recordType: 'revision-draft', draftId: 'revision-1', testId: 'test-1', ownerId: 'teacher-1', state: 'active', conflictToken: 6, createdFromVersionId: 'version-3', createdFromVersionNumber: 3, document: Object.assign(Object.assign({}, baseDocument), { title: 'Revision draft' }), assetIds: {
        'asset-1': true,
        'asset-2': true,
    }, createdAt: 3000, createdBy: 'teacher-1', updatedAt: 4000, updatedBy: 'teacher-1', lastOperationId: 'operation-revision' }, overrides));
const createVersionRecord = (overrides = {}) => (Object.assign({ schemaVersion: 1, recordType: 'published-version', versionId: 'version-1', versionNumber: 1, testId: 'test-1', ownerId: 'teacher-1', sourceDraftId: 'draft-1', sourceDraftPath: 'drafts', document: Object.assign(Object.assign({}, baseDocument), { title: 'Published draft' }), assetIds: {
        'asset-1': true,
        'asset-2': true,
    }, publishedAt: 4000, publishedBy: 'teacher-1', publishOperationId: 'operation-publish-1', documentHash: 'document-hash-1', archive: {
        state: 'active',
    }, compatibility: {
        legacyTestPath: 'tests/test-1',
        frozenLegacyVersion1: true,
    } }, overrides));
const createVersionInput = (overrides = {}) => (Object.assign({ schemaVersion: 1, recordType: 'published-version', versionId: 'version-1', testId: 'test-1', ownerId: 'teacher-1', sourceDraftId: 'draft-1', sourceDraftPath: 'drafts', document: Object.assign(Object.assign({}, baseDocument), { title: 'Published draft' }), assetIds: {
        'asset-1': true,
        'asset-2': true,
    }, publishedAt: 4000, publishedBy: 'teacher-1', publishOperationId: 'operation-publish-1', documentHash: 'document-hash-1', archive: {
        state: 'active',
    }, compatibility: {
        legacyTestPath: 'tests/test-1',
        frozenLegacyVersion1: true,
    } }, overrides));
const createLegacyVersionInput = (overrides = {}) => (Object.assign({ schemaVersion: 1, recordType: 'published-version', versionId: 'version-legacy-1', testId: 'test-legacy', ownerId: 'teacher-1', sourceLegacyTestId: 'legacy-test-1', sourceDraftPath: 'legacy_tests', document: Object.assign(Object.assign({}, baseDocument), { title: 'Legacy published draft' }), assetIds: {
        'asset-1': true,
        'asset-2': true,
    }, publishedAt: 5000, publishedBy: 'teacher-1', publishOperationId: 'operation-publish-legacy-1', documentHash: 'document-hash-legacy-1', archive: {
        state: 'active',
    }, compatibility: {
        frozenLegacyVersion1: true,
    } }, overrides));
const createClaimInput = (overrides = {}) => (Object.assign({ operationId: 'operation-1', operationType: 'save-draft', targetType: 'draft', ownerId: 'teacher-1', targetId: 'draft-1', idempotencyKeyHash: 'key-hash', requestHash: 'request-hash', expectedConflictToken: 4 }, overrides));
(0, vitest_1.describe)('listening authoring repository', () => {
    (0, vitest_1.it)('keeps repository implementation on four approved listening_authoring roots only', () => {
        const source = (0, node_fs_1.readFileSync)((0, node_path_1.resolve)(process.cwd(), 'functions/src/listening-authoring/repository.ts'), 'utf8');
        (0, vitest_1.expect)(source).not.toContain('listening_authoring/operation_lookup');
        (0, vitest_1.expect)(source).not.toContain('listening_authoring/version_counters');
        (0, vitest_1.expect)(source).not.toContain('operationLookupKey');
    });
    (0, vitest_1.it)('claims idempotent operations with exact schema and completes them with completedAt plus expiry reset', async () => {
        const repo = createRepository(createNow(1700000000000, 1700000000500));
        const claim = await repo.claimOperation(createClaimInput());
        (0, vitest_1.expect)(claim).toEqual({
            kind: 'claimed',
            record: {
                schemaVersion: 1,
                operationId: 'operation-1',
                operationType: 'save-draft',
                targetType: 'draft',
                ownerId: 'teacher-1',
                targetId: 'draft-1',
                idempotencyKeyHash: 'key-hash',
                requestHash: 'request-hash',
                expectedConflictToken: 4,
                status: 'pending',
                createdAt: 1700000000000,
                expiresAt: 1700000000000 + constants_1.LISTENING_AUTHORING_OPERATION_TTL_MS,
            },
        });
        await repo.completeOperation('operation-1', {
            draftId: 'draft-1',
            conflictToken: 5,
        });
        (0, vitest_1.expect)(repo.listOperationClaims()).toEqual([
            {
                schemaVersion: 1,
                operationId: 'operation-1',
                operationType: 'save-draft',
                targetType: 'draft',
                ownerId: 'teacher-1',
                targetId: 'draft-1',
                idempotencyKeyHash: 'key-hash',
                requestHash: 'request-hash',
                expectedConflictToken: 4,
                status: 'succeeded',
                result: {
                    draftId: 'draft-1',
                    conflictToken: 5,
                },
                createdAt: 1700000000000,
                completedAt: 1700000000500,
                expiresAt: 1700000000500 + constants_1.LISTENING_AUTHORING_OPERATION_TTL_MS,
            },
        ]);
        (0, vitest_1.expect)('updatedAt' in repo.listOperationClaims()[0]).toBe(false);
    });
    (0, vitest_1.it)('does not overwrite terminal operations and rejects failed operation completion', async () => {
        const repo = createRepository(createNow(1700000000000, 1700000000500, 1700000001000));
        await repo.claimOperation(createClaimInput());
        await repo.completeOperation('operation-1', {
            draftId: 'draft-1',
            conflictToken: 5,
        });
        const completed = repo.listOperationClaims()[0];
        await repo.completeOperation('operation-1', {
            versionId: 'version-overwrite',
            versionNumber: 99,
        });
        (0, vitest_1.expect)(repo.listOperationClaims()[0]).toEqual(completed);
        const failedRepo = (0, repository_1.createInMemoryListeningAuthoringRepository)({
            now: createNow(1700000000000),
            seed: {
                operations: [
                    {
                        schemaVersion: 1,
                        operationId: 'operation-failed',
                        operationType: 'save-draft',
                        targetType: 'draft',
                        ownerId: 'teacher-1',
                        targetId: 'draft-1',
                        idempotencyKeyHash: 'failed-hash',
                        requestHash: 'failed-request',
                        status: 'failed',
                        errorCode: 'conflict',
                        result: {
                            draftId: 'draft-1',
                            conflictToken: 4,
                        },
                        createdAt: 1700000000000,
                        completedAt: 1700000000000,
                        expiresAt: 1700000000000 + constants_1.LISTENING_AUTHORING_OPERATION_TTL_MS,
                    },
                ],
            },
        });
        await (0, vitest_1.expect)(failedRepo.completeOperation('operation-failed', {
            draftId: 'draft-1',
            conflictToken: 5,
        })).rejects.toThrow(/already failed/);
    });
    (0, vitest_1.it)('writes exact draft and revision-draft schemas, rejects stale transactions, applies successful updates, and returns clones', async () => {
        var _a;
        const repo = createRepository(createNow(2000000000000));
        const input = createDraftRecord();
        await repo.writeDraft(input);
        await repo.writeDraft(createRevisionDraftRecord());
        await (0, vitest_1.expect)(repo.getDraft('missing-draft')).resolves.toBeNull();
        await (0, vitest_1.expect)(repo.updateDraftTransaction('missing-draft', 1, (draft) => (Object.assign(Object.assign({}, draft), { conflictToken: draft.conflictToken + 1 })))).resolves.toEqual({ kind: 'missing' });
        await (0, vitest_1.expect)(repo.updateDraftTransaction('draft-1', 1, (draft) => (Object.assign(Object.assign({}, draft), { conflictToken: draft.conflictToken + 1 })))).resolves.toEqual({
            kind: 'conflict',
            currentConflictToken: 2,
        });
        await (0, vitest_1.expect)(repo.updateDraftTransaction('draft-1', 2, (draft) => (Object.assign(Object.assign({}, draft), { conflictToken: draft.conflictToken + 1, updatedBy: 'teacher-2', lastOperationId: 'operation-accepted' })))).resolves.toEqual({
            kind: 'updated',
            conflictToken: 3,
        });
        const storedDraft = await repo.getDraft('draft-1');
        (0, vitest_1.expect)(storedDraft).toEqual(Object.assign(Object.assign({}, createDraftRecord()), { conflictToken: 3, updatedAt: 2000000000000, updatedBy: 'teacher-2', lastOperationId: 'operation-accepted' }));
        const revision = await repo.getDraft('revision-1');
        (0, vitest_1.expect)(revision).toEqual(createRevisionDraftRecord());
        if (storedDraft !== null) {
            storedDraft.lastOperationId = 'mutated-after-read';
        }
        (0, vitest_1.expect)((_a = (await repo.getDraft('draft-1'))) === null || _a === void 0 ? void 0 : _a.lastOperationId).toBe('operation-accepted');
    });
    (0, vitest_1.it)('allocates prefixed ids, creates immutable versions with authoritative version numbers by testId, and returns clone reads', async () => {
        const repo = (0, repository_1.createInMemoryListeningAuthoringRepository)({
            now: createNow(1700000000000),
            seed: {
                versions: [
                    createVersionRecord({
                        versionId: 'version-seed-1',
                        versionNumber: 1,
                        documentHash: 'seed-hash-1',
                    }),
                ],
            },
        });
        (0, vitest_1.expect)(repo.allocateId('draft')).toMatch(/^draft-/);
        (0, vitest_1.expect)(repo.allocateId('version')).toMatch(/^version-/);
        (0, vitest_1.expect)(repo.allocateId('operation')).toMatch(/^operation-/);
        await (0, vitest_1.expect)(repo.nextVersionNumberTransaction('test-1')).resolves.toBe(2);
        await (0, vitest_1.expect)(repo.nextVersionNumberTransaction('test-2')).resolves.toBe(1);
        const created = await repo.createVersionTransaction(createVersionInput({
            versionId: 'version-2',
            sourceDraftId: 'draft-2',
            documentHash: 'document-hash-2',
            publishOperationId: 'operation-publish-2',
        }));
        (0, vitest_1.expect)(created).toEqual({
            kind: 'created',
            record: createVersionRecord({
                versionId: 'version-2',
                sourceDraftId: 'draft-2',
                versionNumber: 2,
                documentHash: 'document-hash-2',
                publishOperationId: 'operation-publish-2',
            }),
        });
        const duplicate = await repo.createVersionTransaction(createVersionInput({
            versionId: 'version-2',
            sourceDraftId: 'draft-overwrite',
            documentHash: 'overwrite-hash',
        }));
        (0, vitest_1.expect)(duplicate).toEqual({
            kind: 'exists',
            record: createVersionRecord({
                versionId: 'version-2',
                sourceDraftId: 'draft-2',
                versionNumber: 2,
                documentHash: 'document-hash-2',
                publishOperationId: 'operation-publish-2',
            }),
        });
        const legacyCreated = await repo.createVersionTransaction(createLegacyVersionInput());
        (0, vitest_1.expect)(legacyCreated).toEqual({
            kind: 'created',
            record: {
                schemaVersion: 1,
                recordType: 'published-version',
                versionId: 'version-legacy-1',
                versionNumber: 1,
                testId: 'test-legacy',
                ownerId: 'teacher-1',
                sourceLegacyTestId: 'legacy-test-1',
                sourceDraftPath: 'legacy_tests',
                document: Object.assign(Object.assign({}, baseDocument), { title: 'Legacy published draft' }),
                assetIds: {
                    'asset-1': true,
                    'asset-2': true,
                },
                publishedAt: 5000,
                publishedBy: 'teacher-1',
                publishOperationId: 'operation-publish-legacy-1',
                documentHash: 'document-hash-legacy-1',
                archive: {
                    state: 'active',
                },
                compatibility: {
                    frozenLegacyVersion1: true,
                },
            },
        });
    });
    (0, vitest_1.it)('rejects published-version records with missing contradictory or empty source ids at create and seed boundaries for every source path', async () => {
        const repo = createRepository(createNow(1700000000000));
        await (0, vitest_1.expect)(repo.createVersionTransaction(Object.assign(Object.assign({}, createVersionInput()), { versionId: 'version-missing-draft', sourceDraftPath: 'drafts', sourceDraftId: undefined }))).rejects.toThrow(/sourceDraftId/i);
        await (0, vitest_1.expect)(repo.createVersionTransaction(Object.assign(Object.assign({}, createVersionInput()), { versionId: 'version-empty-draft', sourceDraftPath: 'drafts', sourceDraftId: '' }))).rejects.toThrow(/sourceDraftId/i);
        await (0, vitest_1.expect)(repo.createVersionTransaction(Object.assign(Object.assign({}, createVersionInput()), { versionId: 'version-contradict-draft', sourceDraftPath: 'drafts', sourceDraftId: 'draft-1', sourceLegacyTestId: 'legacy-1' }))).rejects.toThrow(/sourceLegacyTestId/i);
        await (0, vitest_1.expect)(repo.createVersionTransaction(Object.assign(Object.assign({}, createVersionInput()), { versionId: 'version-missing-revision', sourceDraftPath: 'revision_drafts', sourceDraftId: undefined }))).rejects.toThrow(/sourceDraftId/i);
        await (0, vitest_1.expect)(repo.createVersionTransaction(Object.assign(Object.assign({}, createVersionInput()), { versionId: 'version-empty-revision', sourceDraftPath: 'revision_drafts', sourceDraftId: '   ' }))).rejects.toThrow(/sourceDraftId/i);
        await (0, vitest_1.expect)(repo.createVersionTransaction(Object.assign(Object.assign({}, createVersionInput()), { versionId: 'version-contradict-revision', sourceDraftPath: 'revision_drafts', sourceDraftId: 'revision-1', sourceLegacyTestId: 'legacy-1' }))).rejects.toThrow(/sourceLegacyTestId/i);
        await (0, vitest_1.expect)(repo.createVersionTransaction(Object.assign(Object.assign({}, createLegacyVersionInput()), { versionId: 'version-missing-legacy', sourceLegacyTestId: undefined }))).rejects.toThrow(/sourceLegacyTestId/i);
        await (0, vitest_1.expect)(repo.createVersionTransaction(Object.assign(Object.assign({}, createLegacyVersionInput()), { versionId: 'version-empty-legacy', sourceLegacyTestId: '' }))).rejects.toThrow(/sourceLegacyTestId/i);
        await (0, vitest_1.expect)(repo.createVersionTransaction(Object.assign(Object.assign({}, createLegacyVersionInput()), { versionId: 'version-contradict-legacy', sourceDraftId: 'draft-legacy-1', sourceLegacyTestId: 'legacy-test-1' }))).rejects.toThrow(/sourceDraftId/i);
        (0, vitest_1.expect)(() => (0, repository_1.createInMemoryListeningAuthoringRepository)({
            now: createNow(1700000000000),
            seed: {
                versions: [
                    Object.assign(Object.assign({}, createVersionRecord()), { versionId: 'seed-missing-draft', sourceDraftPath: 'drafts', sourceDraftId: undefined }),
                ],
            },
        })).toThrow(/sourceDraftId/i);
        (0, vitest_1.expect)(() => (0, repository_1.createInMemoryListeningAuthoringRepository)({
            now: createNow(1700000000000),
            seed: {
                versions: [
                    Object.assign(Object.assign({}, createVersionRecord()), { versionId: 'seed-empty-revision', sourceDraftPath: 'revision_drafts', sourceDraftId: '' }),
                ],
            },
        })).toThrow(/sourceDraftId/i);
        (0, vitest_1.expect)(() => (0, repository_1.createInMemoryListeningAuthoringRepository)({
            now: createNow(1700000000000),
            seed: {
                versions: [
                    Object.assign(Object.assign({}, createLegacyVersionInput()), { versionNumber: 1, versionId: 'seed-contradict-legacy', sourceDraftId: 'draft-legacy-1', sourceLegacyTestId: 'legacy-test-1' }),
                ],
            },
        })).toThrow(/sourceDraftId/i);
    });
    (0, vitest_1.it)('atomically creates exact initial draft, stores narrow operation result, and exact retry returns same terminal result', async () => {
        const repo = createRepository(createNow(1700000000000));
        const first = await repo.saveDraftTransaction({
            ownerId: 'teacher-1',
            draftId: 'draft-atomic',
            operationId: 'operation-atomic-1',
            idempotencyKeyHash: 'save-hash',
            requestHash: 'request-hash-1',
            document: baseDocument,
            allowCreate: true,
        });
        const retry = await repo.saveDraftTransaction({
            ownerId: 'teacher-1',
            draftId: 'draft-atomic',
            operationId: 'operation-atomic-2',
            idempotencyKeyHash: 'save-hash',
            requestHash: 'request-hash-1',
            document: baseDocument,
            allowCreate: true,
        });
        (0, vitest_1.expect)(first).toEqual({
            kind: 'saved',
            created: true,
            result: {
                draftId: 'draft-atomic',
                conflictToken: 1,
            },
        });
        (0, vitest_1.expect)(retry).toEqual({
            kind: 'replayed',
            created: true,
            result: {
                draftId: 'draft-atomic',
                conflictToken: 1,
            },
        });
        (0, vitest_1.expect)(await repo.getDraft('draft-atomic')).toEqual({
            schemaVersion: 1,
            recordType: 'draft',
            draftId: 'draft-atomic',
            testId: 'draft-atomic',
            ownerId: 'teacher-1',
            state: 'active',
            conflictToken: 1,
            document: baseDocument,
            assetIds: {
                'asset-1': true,
                'asset-2': true,
            },
            createdAt: 1700000000000,
            createdBy: 'teacher-1',
            updatedAt: 1700000000000,
            updatedBy: 'teacher-1',
            lastOperationId: 'operation-atomic-1',
        });
        (0, vitest_1.expect)(repo.listOperationClaims()).toEqual([
            {
                schemaVersion: 1,
                operationId: 'operation-atomic-1',
                operationType: 'save-draft',
                targetType: 'draft',
                ownerId: 'teacher-1',
                targetId: 'draft-atomic',
                idempotencyKeyHash: 'save-hash',
                requestHash: 'request-hash-1',
                status: 'succeeded',
                result: {
                    draftId: 'draft-atomic',
                    conflictToken: 1,
                },
                createdAt: 1700000000000,
                completedAt: 1700000000000,
                expiresAt: 1700000000000 + constants_1.LISTENING_AUTHORING_OPERATION_TTL_MS,
            },
        ]);
    });
    (0, vitest_1.it)('atomically fails changed-request reuse without mutation and supports concurrent exact retry on same scope', async () => {
        var _a;
        const repo = createRepository(createNow(1700000000000));
        const [first, replay] = await Promise.all([
            repo.saveDraftTransaction({
                ownerId: 'teacher-1',
                draftId: 'draft-atomic',
                operationId: 'operation-atomic-1',
                idempotencyKeyHash: 'save-hash',
                requestHash: 'request-hash-1',
                document: baseDocument,
                allowCreate: true,
            }),
            repo.saveDraftTransaction({
                ownerId: 'teacher-1',
                draftId: 'draft-atomic',
                operationId: 'operation-atomic-2',
                idempotencyKeyHash: 'save-hash',
                requestHash: 'request-hash-1',
                document: baseDocument,
                allowCreate: true,
            }),
        ]);
        const conflict = await repo.saveDraftTransaction({
            ownerId: 'teacher-1',
            draftId: 'draft-atomic',
            operationId: 'operation-atomic-3',
            idempotencyKeyHash: 'save-hash',
            requestHash: 'request-hash-2',
            document: Object.assign(Object.assign({}, baseDocument), { title: 'Changed title' }),
            allowCreate: true,
        });
        (0, vitest_1.expect)([first, replay]).toEqual([
            {
                kind: 'saved',
                created: true,
                result: {
                    draftId: 'draft-atomic',
                    conflictToken: 1,
                },
            },
            {
                kind: 'replayed',
                created: true,
                result: {
                    draftId: 'draft-atomic',
                    conflictToken: 1,
                },
            },
        ]);
        (0, vitest_1.expect)(conflict).toEqual({
            kind: 'idempotency-conflict',
            draftId: 'draft-atomic',
            operationId: 'operation-atomic-1',
        });
        (0, vitest_1.expect)(repo.listOperationClaims()).toHaveLength(1);
        (0, vitest_1.expect)((_a = (await repo.getDraft('draft-atomic'))) === null || _a === void 0 ? void 0 : _a.document.title).toBe('Listening draft');
    });
    (0, vitest_1.it)('atomically updates owned draft, requires expected token, and fails closed for missing or cross-owner updates', async () => {
        const repo = (0, repository_1.createInMemoryListeningAuthoringRepository)({
            now: createNow(1700000000500),
            seed: {
                drafts: [createDraftRecord()],
            },
        });
        const missing = await repo.saveDraftTransaction({
            ownerId: 'teacher-1',
            draftId: 'missing-draft',
            operationId: 'operation-missing',
            idempotencyKeyHash: 'save-hash-missing',
            requestHash: 'request-hash-missing',
            document: baseDocument,
            allowCreate: false,
        });
        const stale = await repo.saveDraftTransaction({
            ownerId: 'teacher-1',
            draftId: 'draft-1',
            operationId: 'operation-stale',
            idempotencyKeyHash: 'save-hash-stale',
            requestHash: 'request-hash-stale',
            expectedConflictToken: 1,
            document: baseDocument,
            allowCreate: false,
        });
        const crossOwner = await repo.saveDraftTransaction({
            ownerId: 'teacher-2',
            draftId: 'draft-1',
            operationId: 'operation-cross-owner',
            idempotencyKeyHash: 'save-hash-cross',
            requestHash: 'request-hash-cross',
            expectedConflictToken: 2,
            document: baseDocument,
            allowCreate: false,
        });
        const saved = await repo.saveDraftTransaction({
            ownerId: 'teacher-1',
            draftId: 'draft-1',
            operationId: 'operation-ok',
            idempotencyKeyHash: 'save-hash-ok',
            requestHash: 'request-hash-ok',
            expectedConflictToken: 2,
            document: Object.assign(Object.assign({}, baseDocument), { title: 'Updated title' }),
            allowCreate: false,
        });
        (0, vitest_1.expect)(missing).toEqual({
            kind: 'not-found',
            draftId: 'missing-draft',
        });
        (0, vitest_1.expect)(stale).toEqual({
            kind: 'conflict',
            draftId: 'draft-1',
            expectedConflictToken: 1,
            currentConflictToken: 2,
        });
        (0, vitest_1.expect)(crossOwner).toEqual({
            kind: 'not-found',
            draftId: 'draft-1',
        });
        (0, vitest_1.expect)(saved).toEqual({
            kind: 'saved',
            created: false,
            result: {
                draftId: 'draft-1',
                conflictToken: 3,
            },
        });
        (0, vitest_1.expect)(await repo.getDraft('draft-1')).toEqual(Object.assign(Object.assign({}, createDraftRecord()), { conflictToken: 3, document: Object.assign(Object.assign({}, baseDocument), { title: 'Updated title' }), updatedAt: 1700000000500, updatedBy: 'teacher-1', lastOperationId: 'operation-ok' }));
        (0, vitest_1.expect)(repo.listOperationClaims()).toEqual([
            {
                schemaVersion: 1,
                operationId: 'operation-stale',
                operationType: 'save-draft',
                targetType: 'draft',
                ownerId: 'teacher-1',
                targetId: 'draft-1',
                idempotencyKeyHash: 'save-hash-stale',
                requestHash: 'request-hash-stale',
                expectedConflictToken: 1,
                status: 'failed',
                result: {
                    draftId: 'draft-1',
                    conflictToken: 2,
                },
                errorCode: 'conflict',
                createdAt: 1700000000500,
                completedAt: 1700000000500,
                expiresAt: 1700000000500 + constants_1.LISTENING_AUTHORING_OPERATION_TTL_MS,
            },
            {
                schemaVersion: 1,
                operationId: 'operation-ok',
                operationType: 'save-draft',
                targetType: 'draft',
                ownerId: 'teacher-1',
                targetId: 'draft-1',
                idempotencyKeyHash: 'save-hash-ok',
                requestHash: 'request-hash-ok',
                expectedConflictToken: 2,
                status: 'succeeded',
                result: {
                    draftId: 'draft-1',
                    conflictToken: 3,
                },
                createdAt: 1700000000500,
                completedAt: 1700000000500,
                expiresAt: 1700000000500 + constants_1.LISTENING_AUTHORING_OPERATION_TTL_MS,
            },
        ]);
    });
    (0, vitest_1.it)('atomically persists failed operations for soft-deleted and missing-token conflicts, replays exact retry, and denies changed request on same scope', async () => {
        const repo = (0, repository_1.createInMemoryListeningAuthoringRepository)({
            now: createNow(1700000000700),
            seed: {
                drafts: [
                    createDraftRecord({
                        draftId: 'draft-soft',
                        state: 'soft-deleted',
                        conflictToken: 9,
                        document: Object.assign(Object.assign({}, baseDocument), { title: 'Soft deleted seed' }),
                    }),
                    createDraftRecord({
                        draftId: 'draft-missing-token',
                        conflictToken: 4,
                    }),
                ],
            },
        });
        const softDeleted = await repo.saveDraftTransaction({
            ownerId: 'teacher-1',
            draftId: 'draft-soft',
            operationId: 'operation-soft-1',
            idempotencyKeyHash: 'soft-hash',
            requestHash: 'soft-request-1',
            expectedConflictToken: 9,
            document: Object.assign(Object.assign({}, baseDocument), { title: 'Should not restore' }),
            allowCreate: false,
        });
        const softDeletedReplay = await repo.saveDraftTransaction({
            ownerId: 'teacher-1',
            draftId: 'draft-soft',
            operationId: 'operation-soft-2',
            idempotencyKeyHash: 'soft-hash',
            requestHash: 'soft-request-1',
            expectedConflictToken: 9,
            document: Object.assign(Object.assign({}, baseDocument), { title: 'Should not restore' }),
            allowCreate: false,
        });
        const softDeletedChanged = await repo.saveDraftTransaction({
            ownerId: 'teacher-1',
            draftId: 'draft-soft',
            operationId: 'operation-soft-3',
            idempotencyKeyHash: 'soft-hash',
            requestHash: 'soft-request-2',
            expectedConflictToken: 9,
            document: Object.assign(Object.assign({}, baseDocument), { title: 'Changed payload' }),
            allowCreate: false,
        });
        const missingToken = await repo.saveDraftTransaction({
            ownerId: 'teacher-1',
            draftId: 'draft-missing-token',
            operationId: 'operation-missing-token-1',
            idempotencyKeyHash: 'missing-hash',
            requestHash: 'missing-request-1',
            document: Object.assign(Object.assign({}, baseDocument), { title: 'Missing token write' }),
            allowCreate: false,
        });
        const missingTokenReplay = await repo.saveDraftTransaction({
            ownerId: 'teacher-1',
            draftId: 'draft-missing-token',
            operationId: 'operation-missing-token-2',
            idempotencyKeyHash: 'missing-hash',
            requestHash: 'missing-request-1',
            document: Object.assign(Object.assign({}, baseDocument), { title: 'Missing token write' }),
            allowCreate: false,
        });
        const missingTokenChanged = await repo.saveDraftTransaction({
            ownerId: 'teacher-1',
            draftId: 'draft-missing-token',
            operationId: 'operation-missing-token-3',
            idempotencyKeyHash: 'missing-hash',
            requestHash: 'missing-request-2',
            document: Object.assign(Object.assign({}, baseDocument), { title: 'Changed payload' }),
            allowCreate: false,
        });
        (0, vitest_1.expect)(softDeleted).toEqual({
            kind: 'conflict',
            draftId: 'draft-soft',
            expectedConflictToken: 9,
            currentConflictToken: 9,
        });
        (0, vitest_1.expect)(softDeletedReplay).toEqual(softDeleted);
        (0, vitest_1.expect)(softDeletedChanged).toEqual({
            kind: 'idempotency-conflict',
            draftId: 'draft-soft',
            operationId: 'operation-soft-1',
        });
        (0, vitest_1.expect)(missingToken).toEqual({
            kind: 'conflict',
            draftId: 'draft-missing-token',
            expectedConflictToken: undefined,
            currentConflictToken: 4,
        });
        (0, vitest_1.expect)(missingTokenReplay).toEqual(missingToken);
        (0, vitest_1.expect)(missingTokenChanged).toEqual({
            kind: 'idempotency-conflict',
            draftId: 'draft-missing-token',
            operationId: 'operation-missing-token-1',
        });
        (0, vitest_1.expect)(await repo.getDraft('draft-soft')).toEqual(createDraftRecord({
            draftId: 'draft-soft',
            state: 'soft-deleted',
            conflictToken: 9,
            document: Object.assign(Object.assign({}, baseDocument), { title: 'Soft deleted seed' }),
        }));
        (0, vitest_1.expect)(await repo.getDraft('draft-missing-token')).toEqual(createDraftRecord({
            draftId: 'draft-missing-token',
            conflictToken: 4,
        }));
        (0, vitest_1.expect)(repo.listOperationClaims()).toEqual([
            {
                schemaVersion: 1,
                operationId: 'operation-soft-1',
                operationType: 'save-draft',
                targetType: 'draft',
                ownerId: 'teacher-1',
                targetId: 'draft-soft',
                idempotencyKeyHash: 'soft-hash',
                requestHash: 'soft-request-1',
                expectedConflictToken: 9,
                status: 'failed',
                result: {
                    draftId: 'draft-soft',
                    conflictToken: 9,
                },
                errorCode: 'invalid-state',
                createdAt: 1700000000700,
                completedAt: 1700000000700,
                expiresAt: 1700000000700 + constants_1.LISTENING_AUTHORING_OPERATION_TTL_MS,
            },
            {
                schemaVersion: 1,
                operationId: 'operation-missing-token-1',
                operationType: 'save-draft',
                targetType: 'draft',
                ownerId: 'teacher-1',
                targetId: 'draft-missing-token',
                idempotencyKeyHash: 'missing-hash',
                requestHash: 'missing-request-1',
                status: 'failed',
                result: {
                    draftId: 'draft-missing-token',
                    conflictToken: 4,
                },
                errorCode: 'conflict',
                createdAt: 1700000000700,
                completedAt: 1700000000700,
                expiresAt: 1700000000700 + constants_1.LISTENING_AUTHORING_OPERATION_TTL_MS,
            },
        ]);
    });
    (0, vitest_1.it)('fails closed on malformed stored operations and guards atomic operationId collisions', async () => {
        const repo = (0, repository_1.createInMemoryListeningAuthoringRepository)({
            now: createNow(1700000000900),
            seed: {
                operations: [
                    {
                        schemaVersion: 1,
                        operationId: 'operation-malformed',
                        operationType: 'save-draft',
                        targetType: 'draft',
                        ownerId: 'teacher-1',
                        targetId: 'draft-bad',
                        idempotencyKeyHash: 'bad-hash',
                        requestHash: 'bad-request',
                        status: 'failed',
                        result: {
                            draftId: 'draft-bad',
                        },
                        errorCode: 'conflict',
                        createdAt: 1700000000000,
                        completedAt: 1700000000000,
                        expiresAt: 1700000000000 + constants_1.LISTENING_AUTHORING_OPERATION_TTL_MS,
                    },
                    {
                        schemaVersion: 1,
                        operationId: 'operation-collision',
                        operationType: 'publish',
                        targetType: 'version',
                        ownerId: 'teacher-9',
                        targetId: 'version-9',
                        idempotencyKeyHash: 'collision-hash-existing',
                        requestHash: 'collision-request-existing',
                        status: 'succeeded',
                        result: {
                            versionId: 'version-9',
                            versionNumber: 9,
                        },
                        createdAt: 1700000000000,
                        completedAt: 1700000000000,
                        expiresAt: 1700000000000 + constants_1.LISTENING_AUTHORING_OPERATION_TTL_MS,
                    },
                ],
            },
        });
        await (0, vitest_1.expect)(repo.saveDraftTransaction({
            ownerId: 'teacher-1',
            draftId: 'draft-bad',
            operationId: 'operation-new',
            idempotencyKeyHash: 'bad-hash',
            requestHash: 'bad-request',
            expectedConflictToken: 1,
            document: baseDocument,
            allowCreate: false,
        })).rejects.toThrow(/incomplete|malformed/i);
        await (0, vitest_1.expect)(repo.saveDraftTransaction({
            ownerId: 'teacher-1',
            draftId: 'draft-collision',
            operationId: 'operation-collision',
            idempotencyKeyHash: 'collision-hash-new',
            requestHash: 'collision-request-new',
            document: baseDocument,
            allowCreate: true,
        })).rejects.toThrow(/already exists/i);
    });
    (0, vitest_1.it)('runs Firebase repository transaction paths for save replay conflicts malformed operations and terminal completion guards', async () => {
        const badOperation = {
            schemaVersion: 1,
            operationId: 'operation-bad',
            operationType: 'save-draft',
            targetType: 'draft',
            ownerId: 'teacher-1',
            targetId: 'draft-bad',
            idempotencyKeyHash: 'bad-hash',
            requestHash: 'bad-request',
            expectedConflictToken: 1,
            status: 'failed',
            result: {
                draftId: 'draft-bad',
            },
            errorCode: 'conflict',
            createdAt: 1700000000000,
            completedAt: 1700000000000,
            expiresAt: 1700000000000 + constants_1.LISTENING_AUTHORING_OPERATION_TTL_MS,
        };
        const failedOperation = {
            schemaVersion: 1,
            operationId: 'operation-failed',
            operationType: 'save-draft',
            targetType: 'draft',
            ownerId: 'teacher-1',
            targetId: 'draft-1',
            idempotencyKeyHash: 'failed-hash',
            requestHash: 'failed-request',
            status: 'failed',
            errorCode: 'conflict',
            result: {
                draftId: 'draft-1',
                conflictToken: 4,
            },
            createdAt: 1700000000000,
            completedAt: 1700000000000,
            expiresAt: 1700000000000 + constants_1.LISTENING_AUTHORING_OPERATION_TTL_MS,
        };
        const { db, dump } = createFakeDatabase({
            listening_authoring: {
                drafts: {
                    'draft-1': createDraftRecord(),
                },
                operations: {
                    'operation-bad': badOperation,
                    'operation-failed': failedOperation,
                },
            },
        });
        const repo = (0, repository_1.createFirebaseListeningAuthoringRepository)(db, { now: createNow(1700000000500, 1700000001000) });
        const created = await repo.saveDraftTransaction({
            ownerId: 'teacher-1',
            draftId: 'draft-firebase',
            operationId: 'operation-create',
            idempotencyKeyHash: 'create-hash',
            requestHash: 'create-request',
            document: baseDocument,
            allowCreate: true,
        });
        const replay = await repo.saveDraftTransaction({
            ownerId: 'teacher-1',
            draftId: 'draft-firebase',
            operationId: 'operation-create-retry',
            idempotencyKeyHash: 'create-hash',
            requestHash: 'create-request',
            document: baseDocument,
            allowCreate: true,
        });
        const stale = await repo.saveDraftTransaction({
            ownerId: 'teacher-1',
            draftId: 'draft-1',
            operationId: 'operation-stale-firebase',
            idempotencyKeyHash: 'stale-hash',
            requestHash: 'stale-request',
            expectedConflictToken: 1,
            document: baseDocument,
            allowCreate: false,
        });
        (0, vitest_1.expect)(created).toEqual({
            kind: 'saved',
            created: true,
            result: {
                draftId: 'draft-firebase',
                conflictToken: 1,
            },
        });
        (0, vitest_1.expect)(replay).toEqual({
            kind: 'replayed',
            created: true,
            result: {
                draftId: 'draft-firebase',
                conflictToken: 1,
            },
        });
        (0, vitest_1.expect)(stale).toEqual({
            kind: 'conflict',
            draftId: 'draft-1',
            expectedConflictToken: 1,
            currentConflictToken: 2,
        });
        await (0, vitest_1.expect)(repo.saveDraftTransaction({
            ownerId: 'teacher-1',
            draftId: 'draft-bad',
            operationId: 'operation-bad-replay',
            idempotencyKeyHash: 'bad-hash',
            requestHash: 'bad-request',
            expectedConflictToken: 1,
            document: baseDocument,
            allowCreate: false,
        })).rejects.toThrow(/incomplete|malformed/i);
        await repo.claimOperation(createClaimInput({
            operationId: 'operation-complete',
            idempotencyKeyHash: 'complete-hash',
            requestHash: 'complete-request',
        }));
        await repo.completeOperation('operation-complete', {
            draftId: 'draft-1',
            conflictToken: 5,
        });
        const completed = dump().listening_authoring.operations['operation-complete'];
        await repo.completeOperation('operation-complete', {
            versionId: 'version-overwrite',
            versionNumber: 99,
        });
        (0, vitest_1.expect)(dump().listening_authoring.operations['operation-complete']).toEqual(completed);
        await (0, vitest_1.expect)(repo.completeOperation('operation-failed', {
            draftId: 'draft-1',
            conflictToken: 5,
        })).rejects.toThrow(/already failed/);
        const operations = dump().listening_authoring.operations;
        (0, vitest_1.expect)(operations['operation-stale-firebase'].status).toBe('failed');
    });
    (0, vitest_1.it)('runs Firebase publish transaction paths for publish replay conflict and blocked outcomes', async () => {
        const { db, dump } = createFakeDatabase({
            listening_authoring: {
                drafts: {
                    'draft-1': createDraftRecord(),
                    'draft-blocked': createDraftRecord({
                        draftId: 'draft-blocked',
                        testId: 'test-blocked',
                        conflictToken: 4,
                        latestPublishedVersionId: undefined,
                        document: Object.assign(Object.assign({}, baseDocument), { audioSections: [
                                {
                                    number: 1,
                                    name: 'Section 1',
                                    audioUrl: 'https://example.test/temp.mp3',
                                    startQuestion: 1,
                                    endQuestion: 1,
                                },
                            ] }),
                        assetIds: {},
                    }),
                },
                versions: {
                    'version-1': createVersionRecord(),
                },
            },
        });
        const repo = (0, repository_1.createFirebaseListeningAuthoringRepository)(db, { now: createNow(1700000000500) });
        const published = await repo.publishDraftTransaction({
            ownerId: 'teacher-1',
            draftId: 'draft-1',
            operationId: 'operation-publish-firebase',
            versionId: 'version-firebase-2',
            idempotencyKeyHash: 'publish-hash',
            requestHash: 'publish-request',
            expectedConflictToken: 2,
            publishedAt: 4500,
        });
        const replay = await repo.publishDraftTransaction({
            ownerId: 'teacher-1',
            draftId: 'draft-1',
            operationId: 'operation-publish-firebase-retry',
            versionId: 'version-firebase-2',
            idempotencyKeyHash: 'publish-hash',
            requestHash: 'publish-request',
            expectedConflictToken: 2,
            publishedAt: 4600,
        });
        const conflict = await repo.publishDraftTransaction({
            ownerId: 'teacher-1',
            draftId: 'draft-1',
            operationId: 'operation-publish-stale-firebase',
            versionId: 'version-firebase-stale',
            idempotencyKeyHash: 'publish-stale-hash',
            requestHash: 'publish-stale-request',
            expectedConflictToken: 2,
            publishedAt: 4700,
        });
        const blocked = await repo.publishDraftTransaction({
            ownerId: 'teacher-1',
            draftId: 'draft-blocked',
            operationId: 'operation-publish-blocked-firebase',
            versionId: 'version-firebase-blocked',
            idempotencyKeyHash: 'publish-blocked-hash',
            requestHash: 'publish-blocked-request',
            expectedConflictToken: 4,
            publishedAt: 4800,
        });
        const expectedPublishedResult = {
            draftId: 'draft-1',
            versionId: 'version-firebase-2',
            versionNumber: 2,
            conflictToken: 3,
        };
        (0, vitest_1.expect)(published).toEqual({
            kind: 'published',
            result: expectedPublishedResult,
        });
        (0, vitest_1.expect)(replay).toEqual({
            kind: 'replayed',
            result: expectedPublishedResult,
        });
        (0, vitest_1.expect)(conflict).toEqual({
            kind: 'conflict',
            draftId: 'draft-1',
            expectedConflictToken: 2,
            currentConflictToken: 3,
        });
        (0, vitest_1.expect)(blocked).toEqual({
            kind: 'blocked',
            draftId: 'draft-blocked',
            conflictToken: 4,
            blockers: [{
                    field: 'audioSections[0].assetId',
                    severity: 'blocker',
                    guidance: 'Publish requires canonical assetId for every audio section.',
                }],
        });
        const root = dump().listening_authoring;
        (0, vitest_1.expect)(root.drafts['draft-1']).toEqual(vitest_1.expect.objectContaining({
            conflictToken: 3,
            latestPublishedVersionId: 'version-firebase-2',
            lastOperationId: 'operation-publish-firebase',
        }));
        (0, vitest_1.expect)(root.versions['version-firebase-2']).toEqual(vitest_1.expect.objectContaining({
            versionId: 'version-firebase-2',
            versionNumber: 2,
            sourceDraftPath: 'drafts',
            sourceDraftId: 'draft-1',
            publishOperationId: 'operation-publish-firebase',
            archive: { state: 'active' },
            compatibility: { frozenLegacyVersion1: false },
        }));
        (0, vitest_1.expect)(root.versions['version-firebase-blocked']).toBeUndefined();
        (0, vitest_1.expect)(root.operations['operation-publish-firebase']).toEqual(vitest_1.expect.objectContaining({
            status: 'succeeded',
            result: expectedPublishedResult,
        }));
        (0, vitest_1.expect)(root.operations['operation-publish-firebase-retry']).toBeUndefined();
        (0, vitest_1.expect)(root.operations['operation-publish-stale-firebase']).toEqual(vitest_1.expect.objectContaining({
            status: 'failed',
            errorCode: 'conflict',
            result: {
                draftId: 'draft-1',
                conflictToken: 3,
            },
        }));
        (0, vitest_1.expect)(root.operations['operation-publish-blocked-firebase']).toEqual(vitest_1.expect.objectContaining({
            status: 'failed',
            errorCode: 'publish-blocked',
            result: {
                draftId: 'draft-blocked',
                conflictToken: 4,
            },
        }));
    });
    (0, vitest_1.it)('runs Firebase legacy first-edit as one root transaction without changing legacy content fields', async () => {
        const legacyTest = createLegacyTestRecord();
        const { db, dump } = createFakeDatabase({
            tests: {
                [legacyTest.id]: legacyTest,
            },
            unrelated_root: {
                preserved: true,
            },
        });
        const repo = (0, repository_1.createFirebaseListeningAuthoringRepository)(db);
        const input = {
            ownerId: 'teacher-1',
            legacyTestId: legacyTest.id,
            operationId: 'operation-legacy-freeze',
            versionId: 'version-legacy-freeze',
            revisionDraftId: 'draft-legacy-revision',
            idempotencyKeyHash: 'legacy-key-hash',
            requestHash: 'legacy-request-hash',
            publishedAt: 1700000000000,
        };
        const first = await repo.legacyFirstEditTransaction(input);
        const retry = await repo.legacyFirstEditTransaction(Object.assign(Object.assign({}, input), { operationId: 'operation-legacy-retry' }));
        (0, vitest_1.expect)(first).toEqual({
            kind: 'published',
            result: {
                draftId: input.revisionDraftId,
                versionId: input.versionId,
                versionNumber: 1,
                conflictToken: 1,
            },
        });
        if (first.kind !== 'published') {
            throw new Error(`expected legacy publish, got ${first.kind}`);
        }
        (0, vitest_1.expect)(retry).toEqual({
            kind: 'replayed',
            result: first.result,
        });
        const root = dump();
        (0, vitest_1.expect)(root.unrelated_root).toEqual({ preserved: true });
        (0, vitest_1.expect)(root.tests[legacyTest.id]).toEqual(Object.assign(Object.assign({}, legacyTest), { authoringVersioning: {
                frozen: true,
                versionId: input.versionId,
                versionNumber: 1,
                frozenAt: input.publishedAt,
                frozenBy: input.ownerId,
                decisionRef: 'PRD-0055-PACKET-1J-B1-B2-APPROVAL-2026-06-20',
            } }));
        (0, vitest_1.expect)(root.listening_authoring).toEqual(vitest_1.expect.objectContaining({
            revision_drafts: {
                [input.revisionDraftId]: vitest_1.expect.objectContaining({
                    recordType: 'revision-draft',
                    createdFromVersionId: input.versionId,
                    createdFromVersionNumber: 1,
                }),
            },
            versions: {
                [input.versionId]: vitest_1.expect.objectContaining({
                    sourceDraftPath: 'legacy_tests',
                    sourceLegacyTestId: legacyTest.id,
                    documentHash: (0, canonical_1.requestHash)(baseDocument),
                }),
            },
            operations: {
                [input.operationId]: vitest_1.expect.objectContaining({
                    operationType: 'publish',
                    targetType: 'legacy-test',
                    status: 'succeeded',
                }),
            },
        }));
    });
    (0, vitest_1.it)('runs Firebase lifecycle transaction paths for draft and version metadata mutations', async () => {
        const { db, dump } = createFakeDatabase({
            listening_authoring: {
                drafts: {
                    'draft-1': createDraftRecord(),
                },
                versions: {
                    'version-1': createVersionRecord(),
                },
            },
        });
        const repo = (0, repository_1.createFirebaseListeningAuthoringRepository)(db, { now: createNow(1700000001000) });
        const deleted = await repo.lifecycleTransaction({
            ownerId: 'teacher-1',
            operationId: 'operation-delete-firebase',
            operationType: 'soft-delete',
            targetId: 'draft-1',
            idempotencyKeyHash: 'delete-hash',
            requestHash: 'delete-request',
            expectedConflictToken: 2,
            completedAt: 6000,
            reasonCode: 'teacher-request',
        });
        const replay = await repo.lifecycleTransaction({
            ownerId: 'teacher-1',
            operationId: 'operation-delete-firebase-retry',
            operationType: 'soft-delete',
            targetId: 'draft-1',
            idempotencyKeyHash: 'delete-hash',
            requestHash: 'delete-request',
            expectedConflictToken: 2,
            completedAt: 6100,
            reasonCode: 'teacher-request',
        });
        const restored = await repo.lifecycleTransaction({
            ownerId: 'teacher-1',
            operationId: 'operation-restore-firebase',
            operationType: 'restore',
            targetId: 'draft-1',
            idempotencyKeyHash: 'restore-hash',
            requestHash: 'restore-request',
            expectedConflictToken: 3,
            completedAt: 7000,
        });
        const archived = await repo.lifecycleTransaction({
            ownerId: 'teacher-1',
            operationId: 'operation-archive-firebase',
            operationType: 'archive',
            targetId: 'version-1',
            idempotencyKeyHash: 'archive-hash',
            requestHash: 'archive-request',
            expectedConflictToken: 1,
            completedAt: 8000,
            reasonCode: 'teacher-archive',
        });
        (0, vitest_1.expect)(deleted).toEqual({
            kind: 'soft-deleted',
            result: {
                draftId: 'draft-1',
                conflictToken: 3,
            },
        });
        (0, vitest_1.expect)(replay).toEqual(deleted);
        (0, vitest_1.expect)(restored).toEqual({
            kind: 'restored',
            result: {
                draftId: 'draft-1',
                conflictToken: 4,
            },
        });
        (0, vitest_1.expect)(archived).toEqual({
            kind: 'archived',
            result: {
                versionId: 'version-1',
                versionNumber: 1,
            },
        });
        const root = dump().listening_authoring;
        (0, vitest_1.expect)(root.drafts['draft-1']).toEqual(vitest_1.expect.objectContaining({
            state: 'active',
            conflictToken: 4,
            lastOperationId: 'operation-restore-firebase',
            softDelete: vitest_1.expect.objectContaining({
                deletedAt: 6000,
                deletedBy: 'teacher-1',
                reasonCode: 'teacher-request',
                restoredAt: 7000,
                restoredBy: 'teacher-1',
                restoreCount: 1,
            }),
        }));
        (0, vitest_1.expect)(root.versions['version-1']).toEqual(vitest_1.expect.objectContaining({
            versionId: 'version-1',
            documentHash: 'document-hash-1',
            archive: {
                state: 'archived',
                archivedAt: 8000,
                archivedBy: 'teacher-1',
                reasonCode: 'teacher-archive',
            },
        }));
        (0, vitest_1.expect)(root.operations['operation-delete-firebase']).toEqual(vitest_1.expect.objectContaining({
            status: 'succeeded',
            result: {
                draftId: 'draft-1',
                conflictToken: 3,
            },
        }));
        (0, vitest_1.expect)(root.operations['operation-delete-firebase-retry']).toBeUndefined();
        (0, vitest_1.expect)(root.operations['operation-restore-firebase']).toEqual(vitest_1.expect.objectContaining({
            status: 'succeeded',
            result: {
                draftId: 'draft-1',
                conflictToken: 4,
            },
        }));
        (0, vitest_1.expect)(root.operations['operation-archive-firebase']).toEqual(vitest_1.expect.objectContaining({
            status: 'succeeded',
            result: {
                versionId: 'version-1',
                versionNumber: 1,
            },
        }));
    });
    (0, vitest_1.it)('runs Firebase lifecycle conflict and invalid-state failed-operation paths', async () => {
        const { db, dump } = createFakeDatabase({
            listening_authoring: {
                drafts: {
                    'draft-1': createDraftRecord(),
                },
                versions: {
                    'version-1': createVersionRecord({
                        archive: {
                            state: 'archived',
                            archivedAt: 4500,
                            archivedBy: 'teacher-1',
                            reasonCode: 'already-archived',
                        },
                    }),
                },
            },
        });
        const repo = (0, repository_1.createFirebaseListeningAuthoringRepository)(db, { now: createNow(1700000001000) });
        const conflict = await repo.lifecycleTransaction({
            ownerId: 'teacher-1',
            operationId: 'operation-delete-stale-firebase',
            operationType: 'soft-delete',
            targetId: 'draft-1',
            idempotencyKeyHash: 'delete-stale-hash',
            requestHash: 'delete-stale-request',
            expectedConflictToken: 1,
            completedAt: 6000,
        });
        const invalidArchive = await repo.lifecycleTransaction({
            ownerId: 'teacher-1',
            operationId: 'operation-archive-invalid-firebase',
            operationType: 'archive',
            targetId: 'version-1',
            idempotencyKeyHash: 'archive-invalid-hash',
            requestHash: 'archive-invalid-request',
            expectedConflictToken: 1,
            completedAt: 7000,
        });
        (0, vitest_1.expect)(conflict).toEqual({
            kind: 'conflict',
            targetId: 'draft-1',
            expectedConflictToken: 1,
            currentConflictToken: 2,
        });
        (0, vitest_1.expect)(invalidArchive).toEqual({
            kind: 'invalid-state',
            targetId: 'version-1',
        });
        const root = dump().listening_authoring;
        (0, vitest_1.expect)(root.drafts['draft-1']).toEqual(createDraftRecord());
        (0, vitest_1.expect)(root.versions['version-1']).toEqual(createVersionRecord({
            archive: {
                state: 'archived',
                archivedAt: 4500,
                archivedBy: 'teacher-1',
                reasonCode: 'already-archived',
            },
        }));
        (0, vitest_1.expect)(root.operations['operation-delete-stale-firebase']).toEqual(vitest_1.expect.objectContaining({
            status: 'failed',
            errorCode: 'conflict',
            result: {
                draftId: 'draft-1',
                conflictToken: 2,
            },
        }));
        (0, vitest_1.expect)(root.operations['operation-archive-invalid-firebase']).toEqual(vitest_1.expect.objectContaining({
            status: 'failed',
            errorCode: 'invalid-state',
            result: {
                versionId: 'version-1',
                versionNumber: 1,
            },
        }));
    });
});
//# sourceMappingURL=repository.test.js.map