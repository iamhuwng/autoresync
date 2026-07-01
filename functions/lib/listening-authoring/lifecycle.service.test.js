"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const repository_1 = require("./repository");
const service_1 = require("./service");
const auth = { uid: 'teacher-1', role: 'teacher' };
const completeDocument = {
    title: 'Lifecycle',
    type: 'IELTS',
    skill: 'Listening',
    duration: 1800,
    difficulty: 'Intermediate',
    questionCount: 1,
    isPublic: false,
    isComplete: true,
    displayMode: 'text',
    metadata: {
        description: 'Lifecycle proof',
        instructions: 'Answer every question.',
        tags: [],
    },
    audioSections: [{
            number: 1,
            name: 'Section 1',
            assetId: 'asset-1',
            audioUrl: 'r2://asset-1',
            startQuestion: 1,
            endQuestion: 1,
        }],
    questions: [{
            number: 1,
            type: 'short-answer',
            question: 'Question 1',
            answer: 'A',
            sectionNumber: 1,
            points: 1,
        }],
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
const draftOnlyDocument = Object.assign(Object.assign({}, completeDocument), { audioSections: [], questions: [] });
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
const saveDraft = async (repo, document = draftOnlyDocument) => {
    const result = await (0, service_1.saveListeningDraftCore)({
        auth,
        body: { idempotencyKey: 'save', document },
        repo,
        idempotencySecret: 'secret',
    });
    if (result.status !== 'saved') {
        throw new Error(`expected saved draft, got ${result.status}`);
    }
    return result;
};
(0, vitest_1.afterEach)(() => {
    vitest_1.vi.useRealTimers();
});
(0, vitest_1.describe)('mutateListeningAuthoringLifecycleCore', () => {
    (0, vitest_1.it)('soft-deletes and restores the same draft through trusted idempotent operations', async () => {
        vitest_1.vi.useFakeTimers();
        vitest_1.vi.setSystemTime(1700000000000);
        const repo = (0, repository_1.createInMemoryListeningAuthoringRepository)({
            now: createNow(1700000000000, 1700000000500, 1700000001000),
        });
        const saved = await saveDraft(repo);
        const deleted = await (0, service_1.mutateListeningAuthoringLifecycleCore)({
            auth,
            body: {
                operation: 'soft-delete',
                targetId: saved.draftId,
                expectedConflictToken: saved.conflictToken,
                idempotencyKey: 'delete',
                reasonCode: 'teacher-request',
            },
            repo,
            idempotencySecret: 'secret',
        });
        const deleteRetry = await (0, service_1.mutateListeningAuthoringLifecycleCore)({
            auth,
            body: {
                operation: 'soft-delete',
                targetId: saved.draftId,
                expectedConflictToken: saved.conflictToken,
                idempotencyKey: 'delete',
                reasonCode: 'teacher-request',
            },
            repo,
            idempotencySecret: 'secret',
        });
        const restored = await (0, service_1.mutateListeningAuthoringLifecycleCore)({
            auth,
            body: {
                operation: 'restore',
                targetId: saved.draftId,
                expectedConflictToken: 2,
                idempotencyKey: 'restore',
            },
            repo,
            idempotencySecret: 'secret',
        });
        (0, vitest_1.expect)(deleteRetry).toEqual(deleted);
        (0, vitest_1.expect)(deleted).toEqual({
            status: 'soft-deleted',
            draftId: saved.draftId,
            conflictToken: 2,
        });
        (0, vitest_1.expect)(restored).toEqual({
            status: 'restored',
            draftId: saved.draftId,
            conflictToken: 3,
        });
        (0, vitest_1.expect)(await repo.getDraft(saved.draftId)).toEqual(vitest_1.expect.objectContaining({
            state: 'active',
            conflictToken: 3,
            softDelete: vitest_1.expect.objectContaining({
                deletedAt: 1700000000000,
                deletedBy: 'teacher-1',
                reasonCode: 'teacher-request',
                priorConflictToken: 1,
                restoredAt: 1700000000000,
                restoredBy: 'teacher-1',
                restoreCount: 1,
            }),
        }));
    });
    (0, vitest_1.it)('returns recoverable conflict and idempotency conflict without changing draft state', async () => {
        const repo = (0, repository_1.createInMemoryListeningAuthoringRepository)({
            now: createNow(1700000000000),
        });
        const saved = await saveDraft(repo);
        const stale = await (0, service_1.mutateListeningAuthoringLifecycleCore)({
            auth,
            body: {
                operation: 'soft-delete',
                targetId: saved.draftId,
                expectedConflictToken: 2,
                idempotencyKey: 'delete',
            },
            repo,
            idempotencySecret: 'secret',
        });
        const changed = await (0, service_1.mutateListeningAuthoringLifecycleCore)({
            auth,
            body: {
                operation: 'soft-delete',
                targetId: saved.draftId,
                expectedConflictToken: saved.conflictToken,
                idempotencyKey: 'delete',
            },
            repo,
            idempotencySecret: 'secret',
        });
        (0, vitest_1.expect)(stale).toEqual({
            status: 'conflict',
            recoverable: true,
            targetId: saved.draftId,
            expectedConflictToken: 2,
            currentConflictToken: 1,
        });
        (0, vitest_1.expect)(changed).toEqual({
            status: 'idempotency-conflict',
            recoverable: false,
            targetId: saved.draftId,
            operationId: 'operation-2',
        });
        (0, vitest_1.expect)(await repo.getDraft(saved.draftId)).toEqual(vitest_1.expect.objectContaining({
            state: 'active',
            conflictToken: 1,
        }));
    });
    (0, vitest_1.it)('fails closed for cross-owner lifecycle mutation', async () => {
        const repo = (0, repository_1.createInMemoryListeningAuthoringRepository)({
            now: createNow(1700000000000),
        });
        const saved = await saveDraft(repo);
        const result = await (0, service_1.mutateListeningAuthoringLifecycleCore)({
            auth: { uid: 'teacher-2', role: 'teacher' },
            body: {
                operation: 'soft-delete',
                targetId: saved.draftId,
                expectedConflictToken: saved.conflictToken,
                idempotencyKey: 'delete',
            },
            repo,
            idempotencySecret: 'secret',
        });
        (0, vitest_1.expect)(result).toEqual({
            status: 'not-found',
            recoverable: false,
            targetId: saved.draftId,
        });
        (0, vitest_1.expect)(await repo.getDraft(saved.draftId)).toEqual(vitest_1.expect.objectContaining({
            state: 'active',
            conflictToken: 1,
        }));
    });
    (0, vitest_1.it)('archives a published version by metadata only and replays the archive result', async () => {
        const repo = (0, repository_1.createInMemoryListeningAuthoringRepository)({
            now: createNow(1700000000000, 1700000000500),
        });
        const saved = await saveDraft(repo, completeDocument);
        const published = await (0, service_1.publishListeningDraftCore)({
            auth,
            body: {
                draftId: saved.draftId,
                expectedConflictToken: saved.conflictToken,
                idempotencyKey: 'publish',
            },
            repo,
            idempotencySecret: 'secret',
        });
        if (published.status !== 'published') {
            throw new Error(`expected published, got ${published.status}`);
        }
        const before = repo.listVersions()[0];
        const archived = await (0, service_1.mutateListeningAuthoringLifecycleCore)({
            auth,
            body: {
                operation: 'archive',
                targetId: published.versionId,
                expectedConflictToken: published.versionNumber,
                idempotencyKey: 'archive',
                reasonCode: 'teacher-archive',
            },
            repo,
            idempotencySecret: 'secret',
        });
        const replay = await (0, service_1.mutateListeningAuthoringLifecycleCore)({
            auth,
            body: {
                operation: 'archive',
                targetId: published.versionId,
                expectedConflictToken: published.versionNumber,
                idempotencyKey: 'archive',
                reasonCode: 'teacher-archive',
            },
            repo,
            idempotencySecret: 'secret',
        });
        (0, vitest_1.expect)(replay).toEqual(archived);
        (0, vitest_1.expect)(archived).toEqual({
            status: 'archived',
            versionId: published.versionId,
            versionNumber: 1,
        });
        (0, vitest_1.expect)(repo.listVersions()[0]).toEqual(Object.assign(Object.assign({}, before), { archive: {
                state: 'archived',
                archivedAt: vitest_1.expect.any(Number),
                archivedBy: 'teacher-1',
                reasonCode: 'teacher-archive',
            } }));
        (0, vitest_1.expect)(repo.listVersions()[0]).toEqual(vitest_1.expect.objectContaining({
            versionId: before.versionId,
            versionNumber: before.versionNumber,
            testId: before.testId,
            ownerId: before.ownerId,
            sourceDraftPath: before.sourceDraftPath,
            sourceDraftId: before.sourceDraftId,
            document: before.document,
            assetIds: before.assetIds,
            publishedAt: before.publishedAt,
            publishedBy: before.publishedBy,
            publishOperationId: before.publishOperationId,
            documentHash: before.documentHash,
            compatibility: before.compatibility,
        }));
    });
    (0, vitest_1.it)('restores soft-deleted drafts after 30 days until retention governance allows final removal', async () => {
        vitest_1.vi.useFakeTimers();
        vitest_1.vi.setSystemTime(1700000000000);
        const repo = (0, repository_1.createInMemoryListeningAuthoringRepository)({
            now: createNow(1700000000000),
        });
        const saved = await saveDraft(repo);
        await (0, service_1.mutateListeningAuthoringLifecycleCore)({
            auth,
            body: {
                operation: 'soft-delete',
                targetId: saved.draftId,
                expectedConflictToken: saved.conflictToken,
                idempotencyKey: 'delete',
            },
            repo,
            idempotencySecret: 'secret',
        });
        vitest_1.vi.setSystemTime(1700000000000 + (30 * 24 * 60 * 60 * 1000) + 1);
        const restored = await (0, service_1.mutateListeningAuthoringLifecycleCore)({
            auth,
            body: {
                operation: 'restore',
                targetId: saved.draftId,
                expectedConflictToken: 2,
                idempotencyKey: 'restore',
            },
            repo,
            idempotencySecret: 'secret',
        });
        (0, vitest_1.expect)(restored).toEqual({
            status: 'restored',
            draftId: saved.draftId,
            conflictToken: 3,
        });
        (0, vitest_1.expect)(await repo.getDraft(saved.draftId)).toEqual(vitest_1.expect.objectContaining({
            state: 'active',
            conflictToken: 3,
        }));
        (0, vitest_1.expect)(repo.listOperationClaims()).toContainEqual(vitest_1.expect.objectContaining({
            operationType: 'restore',
            targetId: saved.draftId,
            status: 'succeeded',
            result: {
                draftId: saved.draftId,
                conflictToken: 3,
            },
        }));
    });
    (0, vitest_1.it)('records failed operation evidence when archive is not an allowed state transition', async () => {
        const repo = (0, repository_1.createInMemoryListeningAuthoringRepository)({
            now: createNow(1700000000000, 1700000000500),
        });
        const saved = await saveDraft(repo, completeDocument);
        const published = await (0, service_1.publishListeningDraftCore)({
            auth,
            body: {
                draftId: saved.draftId,
                expectedConflictToken: saved.conflictToken,
                idempotencyKey: 'publish',
            },
            repo,
            idempotencySecret: 'secret',
        });
        if (published.status !== 'published') {
            throw new Error(`expected published, got ${published.status}`);
        }
        await (0, service_1.mutateListeningAuthoringLifecycleCore)({
            auth,
            body: {
                operation: 'archive',
                targetId: published.versionId,
                expectedConflictToken: published.versionNumber,
                idempotencyKey: 'archive',
            },
            repo,
            idempotencySecret: 'secret',
        });
        const invalid = await (0, service_1.mutateListeningAuthoringLifecycleCore)({
            auth,
            body: {
                operation: 'archive',
                targetId: published.versionId,
                expectedConflictToken: published.versionNumber,
                idempotencyKey: 'archive-again',
            },
            repo,
            idempotencySecret: 'secret',
        });
        (0, vitest_1.expect)(invalid).toEqual({
            status: 'invalid-state',
            recoverable: false,
            targetId: published.versionId,
        });
        (0, vitest_1.expect)(repo.listOperationClaims()).toContainEqual(vitest_1.expect.objectContaining({
            operationType: 'archive',
            targetId: published.versionId,
            status: 'failed',
            errorCode: 'invalid-state',
            result: {
                versionId: published.versionId,
                versionNumber: published.versionNumber,
            },
        }));
    });
    (0, vitest_1.it)('discard marks a draft soft-deleted without hard deleting it', async () => {
        const repo = (0, repository_1.createInMemoryListeningAuthoringRepository)({
            now: createNow(1700000000000),
        });
        const saved = await saveDraft(repo);
        const result = await (0, service_1.mutateListeningAuthoringLifecycleCore)({
            auth,
            body: {
                operation: 'discard',
                targetId: saved.draftId,
                expectedConflictToken: saved.conflictToken,
                idempotencyKey: 'discard',
            },
            repo,
            idempotencySecret: 'secret',
        });
        (0, vitest_1.expect)(result).toEqual({
            status: 'discarded',
            draftId: saved.draftId,
            conflictToken: 2,
        });
        (0, vitest_1.expect)(await repo.getDraft(saved.draftId)).toEqual(vitest_1.expect.objectContaining({
            state: 'soft-deleted',
            conflictToken: 2,
            softDelete: vitest_1.expect.objectContaining({
                reasonCode: 'discard',
            }),
        }));
    });
});
//# sourceMappingURL=lifecycle.service.test.js.map