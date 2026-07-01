"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const canonical_1 = require("./canonical");
const repository_1 = require("./repository");
const service_1 = require("./service");
const auth = { uid: 'teacher-1', role: 'teacher' };
(0, vitest_1.afterEach)(() => {
    vitest_1.vi.useRealTimers();
});
const completeDocument = {
    title: 'Ready',
    type: 'IELTS',
    skill: 'Listening',
    duration: 1800,
    difficulty: 'Intermediate',
    questionCount: 1,
    isPublic: false,
    isComplete: true,
    displayMode: 'text',
    metadata: {
        description: 'Ready to publish',
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
const createRepository = () => (0, repository_1.createInMemoryListeningAuthoringRepository)({
    now: createNow(1700000000000, 1700000000500),
});
const saveDraft = async (repo, document = completeDocument) => {
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
const expectedDraftId = `draft-${(0, canonical_1.hmacSha256Hex)('secret', 'teacher-1:save-draft:create:save').slice(0, 32)}`;
const expectedVersionId = `version-${(0, canonical_1.hmacSha256Hex)('secret', `${auth.uid}:publish:${expectedDraftId}:version:publish`).slice(0, 32)}`;
(0, vitest_1.describe)('publishListeningDraftCore', () => {
    (0, vitest_1.it)('preserves the exact server legacy document when freezing version 1', async () => {
        var _a, _b;
        const legacyDocument = Object.assign(Object.assign({}, completeDocument), { title: '  Ready with intentional spacing  ', metadata: Object.assign(Object.assign({}, completeDocument.metadata), { description: '  Preserve this spacing.  ' }) });
        const legacyTest = Object.assign({ id: 'legacy-test-exact-content', ownerId: auth.uid, createdAt: 1600000000000, createdBy: auth.uid, updatedAt: 1600000000500, isPublished: true }, legacyDocument);
        const repo = (0, repository_1.createInMemoryListeningAuthoringRepository)({
            now: createNow(1700000000000),
            seed: { legacyTests: [legacyTest] },
        });
        const result = await (0, service_1.publishListeningDraftCore)({
            auth,
            body: {
                legacyTestId: legacyTest.id,
                idempotencyKey: 'preserve-exact-content',
            },
            repo,
            idempotencySecret: 'secret',
        });
        (0, vitest_1.expect)(result.status).toBe('published');
        if (result.status !== 'published') {
            throw new Error(`expected published legacy freeze, got ${result.status}`);
        }
        (0, vitest_1.expect)((_a = repo.listVersions()[0]) === null || _a === void 0 ? void 0 : _a.document).toEqual(legacyDocument);
        (0, vitest_1.expect)((_b = (await repo.getDraft(result.draftId))) === null || _b === void 0 ? void 0 : _b.document).toEqual(legacyDocument);
        (0, vitest_1.expect)(await repo.getLegacyTest(legacyTest.id)).toEqual(Object.assign(Object.assign({}, legacyTest), { authoringVersioning: vitest_1.expect.objectContaining({
                frozen: true,
                versionId: result.versionId,
            }) }));
    });
    (0, vitest_1.it)('atomically freezes a server-loaded legacy test as version 1 and creates its revision draft', async () => {
        vitest_1.vi.useFakeTimers();
        vitest_1.vi.setSystemTime(1700000000000);
        const legacyTest = Object.assign({ id: 'legacy-test-1', ownerId: auth.uid, createdAt: 1600000000000, createdBy: auth.uid, updatedAt: 1600000000500, isPublished: true }, completeDocument);
        const repo = (0, repository_1.createInMemoryListeningAuthoringRepository)({
            now: createNow(1700000000000),
            seed: {
                legacyTests: [legacyTest],
            },
        });
        const first = await (0, service_1.publishListeningDraftCore)({
            auth,
            body: {
                legacyTestId: legacyTest.id,
                idempotencyKey: 'legacy-first-edit',
            },
            repo,
            idempotencySecret: 'secret',
        });
        const retry = await (0, service_1.publishListeningDraftCore)({
            auth,
            body: {
                legacyTestId: legacyTest.id,
                idempotencyKey: 'legacy-first-edit',
            },
            repo,
            idempotencySecret: 'secret',
        });
        (0, vitest_1.expect)(first).toEqual({
            status: 'published',
            draftId: vitest_1.expect.stringMatching(/^draft-/),
            versionId: vitest_1.expect.stringMatching(/^version-/),
            versionNumber: 1,
            conflictToken: 1,
            warnings: [],
        });
        (0, vitest_1.expect)(retry).toEqual(first);
        if (first.status !== 'published') {
            throw new Error(`expected published legacy freeze, got ${first.status}`);
        }
        (0, vitest_1.expect)(repo.listVersions()).toEqual([
            vitest_1.expect.objectContaining({
                versionId: first.versionId,
                versionNumber: 1,
                testId: legacyTest.id,
                ownerId: auth.uid,
                sourceDraftPath: 'legacy_tests',
                sourceLegacyTestId: legacyTest.id,
                document: completeDocument,
                documentHash: (0, canonical_1.requestHash)(completeDocument),
                compatibility: {
                    legacyTestPath: `tests/${legacyTest.id}`,
                    frozenLegacyVersion1: true,
                },
            }),
        ]);
        (0, vitest_1.expect)(await repo.getDraft(first.draftId)).toEqual(vitest_1.expect.objectContaining({
            recordType: 'revision-draft',
            testId: legacyTest.id,
            ownerId: auth.uid,
            conflictToken: 1,
            createdFromVersionId: first.versionId,
            createdFromVersionNumber: 1,
            document: completeDocument,
        }));
        (0, vitest_1.expect)(await repo.getLegacyTest(legacyTest.id)).toEqual(Object.assign(Object.assign({}, legacyTest), { authoringVersioning: {
                frozen: true,
                versionId: first.versionId,
                versionNumber: 1,
                frozenAt: 1700000000000,
                frozenBy: auth.uid,
                decisionRef: 'PRD-0055-PACKET-1J-B1-B2-APPROVAL-2026-06-20',
            } }));
        (0, vitest_1.expect)(repo.listOperationClaims()).toEqual([
            vitest_1.expect.objectContaining({
                operationType: 'publish',
                targetType: 'legacy-test',
                targetId: legacyTest.id,
                status: 'succeeded',
            }),
        ]);
    });
    (0, vitest_1.it)('replays an existing legacy freeze under a new idempotency key without duplicates', async () => {
        const legacyTest = Object.assign({ id: 'legacy-test-retry', ownerId: auth.uid, createdAt: 1600000000000, createdBy: auth.uid, updatedAt: 1600000000500, isPublished: true }, completeDocument);
        const repo = (0, repository_1.createInMemoryListeningAuthoringRepository)({
            now: createNow(1700000000000, 1700000000500),
            seed: { legacyTests: [legacyTest] },
        });
        const first = await (0, service_1.publishListeningDraftCore)({
            auth,
            body: { legacyTestId: legacyTest.id, idempotencyKey: 'first-key' },
            repo,
            idempotencySecret: 'secret',
        });
        const retry = await (0, service_1.publishListeningDraftCore)({
            auth,
            body: { legacyTestId: legacyTest.id, idempotencyKey: 'second-key' },
            repo,
            idempotencySecret: 'secret',
        });
        (0, vitest_1.expect)(retry).toEqual(first);
        if (first.status !== 'published') {
            throw new Error(`expected published legacy freeze, got ${first.status}`);
        }
        (0, vitest_1.expect)(repo.listVersions()).toHaveLength(1);
        (0, vitest_1.expect)(await repo.getDraft(first.draftId)).not.toBeNull();
        (0, vitest_1.expect)(repo.listOperationClaims()).toHaveLength(2);
    });
    (0, vitest_1.it)('hides another owner legacy test and writes no authoring records', async () => {
        const legacyTest = Object.assign({ id: 'legacy-test-other-owner', ownerId: 'teacher-2', createdAt: 1600000000000, createdBy: 'teacher-2', updatedAt: 1600000000500, isPublished: true }, completeDocument);
        const repo = (0, repository_1.createInMemoryListeningAuthoringRepository)({
            now: createNow(1700000000000),
            seed: { legacyTests: [legacyTest] },
        });
        const result = await (0, service_1.publishListeningDraftCore)({
            auth,
            body: { legacyTestId: legacyTest.id, idempotencyKey: 'cross-owner' },
            repo,
            idempotencySecret: 'secret',
        });
        (0, vitest_1.expect)(result).toEqual({
            status: 'not-found',
            recoverable: false,
            draftId: legacyTest.id,
        });
        (0, vitest_1.expect)(repo.listVersions()).toEqual([]);
        (0, vitest_1.expect)(repo.listOperationClaims()).toEqual([]);
        (0, vitest_1.expect)(await repo.getLegacyTest(legacyTest.id)).toEqual(legacyTest);
    });
    (0, vitest_1.it)('creates one immutable version and advances the source draft token atomically', async () => {
        const repo = createRepository();
        const saved = await saveDraft(repo);
        const result = await (0, service_1.publishListeningDraftCore)({
            auth,
            body: {
                draftId: saved.draftId,
                expectedConflictToken: saved.conflictToken,
                idempotencyKey: 'publish',
            },
            repo,
            idempotencySecret: 'secret',
        });
        (0, vitest_1.expect)(result).toEqual({
            status: 'published',
            draftId: expectedDraftId,
            versionId: expectedVersionId,
            versionNumber: 1,
            conflictToken: 2,
            warnings: [],
        });
        (0, vitest_1.expect)(repo.listVersions()).toEqual([
            vitest_1.expect.objectContaining({
                versionId: expectedVersionId,
                versionNumber: 1,
                testId: expectedDraftId,
                ownerId: 'teacher-1',
                sourceDraftPath: 'drafts',
                sourceDraftId: expectedDraftId,
                publishOperationId: 'operation-2',
                documentHash: (0, canonical_1.requestHash)(completeDocument),
                archive: { state: 'active' },
                compatibility: { frozenLegacyVersion1: false },
            }),
        ]);
        (0, vitest_1.expect)(await repo.getDraft(expectedDraftId)).toEqual(vitest_1.expect.objectContaining({
            conflictToken: 2,
            latestPublishedVersionId: expectedVersionId,
            lastOperationId: 'operation-2',
        }));
    });
    (0, vitest_1.it)('integrates create reload autosave conflict publish revision discard restore and archive', async () => {
        const repo = createRepository();
        const created = await saveDraft(repo);
        const reloaded = await repo.getDraft(created.draftId);
        (0, vitest_1.expect)(reloaded).toEqual(vitest_1.expect.objectContaining({
            draftId: created.draftId,
            conflictToken: created.conflictToken,
            document: completeDocument,
        }));
        const autosaved = await (0, service_1.saveListeningDraftCore)({
            auth,
            body: {
                draftId: created.draftId,
                expectedConflictToken: created.conflictToken,
                idempotencyKey: 'autosave',
                trigger: 'autosave',
                document: Object.assign(Object.assign({}, completeDocument), { title: 'Autosaved' }),
            },
            repo,
            idempotencySecret: 'secret',
        });
        (0, vitest_1.expect)(autosaved).toEqual(vitest_1.expect.objectContaining({
            status: 'saved',
            draftId: created.draftId,
            conflictToken: 2,
        }));
        if (autosaved.status !== 'saved') {
            throw new Error(`expected autosaved draft, got ${autosaved.status}`);
        }
        const stale = await (0, service_1.saveListeningDraftCore)({
            auth,
            body: {
                draftId: created.draftId,
                expectedConflictToken: created.conflictToken,
                idempotencyKey: 'stale-save',
                document: Object.assign(Object.assign({}, completeDocument), { title: 'Stale edit' }),
            },
            repo,
            idempotencySecret: 'secret',
        });
        (0, vitest_1.expect)(stale).toEqual(vitest_1.expect.objectContaining({
            status: 'conflict',
            currentConflictToken: autosaved.conflictToken,
        }));
        const firstPublished = await (0, service_1.publishListeningDraftCore)({
            auth,
            body: {
                draftId: created.draftId,
                expectedConflictToken: autosaved.conflictToken,
                idempotencyKey: 'publish-first',
            },
            repo,
            idempotencySecret: 'secret',
        });
        if (firstPublished.status !== 'published') {
            throw new Error(`expected first publish, got ${firstPublished.status}`);
        }
        const revision = await (0, service_1.saveListeningDraftCore)({
            auth,
            body: {
                draftId: created.draftId,
                expectedConflictToken: firstPublished.conflictToken,
                idempotencyKey: 'save-revision',
                document: Object.assign(Object.assign({}, completeDocument), { title: 'Revision' }),
            },
            repo,
            idempotencySecret: 'secret',
        });
        if (revision.status !== 'saved') {
            throw new Error(`expected revision save, got ${revision.status}`);
        }
        const secondPublished = await (0, service_1.publishListeningDraftCore)({
            auth,
            body: {
                draftId: created.draftId,
                expectedConflictToken: revision.conflictToken,
                idempotencyKey: 'publish-revision',
            },
            repo,
            idempotencySecret: 'secret',
        });
        if (secondPublished.status !== 'published') {
            throw new Error(`expected revision publish, got ${secondPublished.status}`);
        }
        const discarded = await (0, service_1.mutateListeningAuthoringLifecycleCore)({
            auth,
            body: {
                operation: 'discard',
                targetId: created.draftId,
                expectedConflictToken: secondPublished.conflictToken,
                idempotencyKey: 'discard-revision',
                reasonCode: 'teacher-discard',
            },
            repo,
            idempotencySecret: 'secret',
        });
        (0, vitest_1.expect)(discarded).toEqual(vitest_1.expect.objectContaining({ status: 'discarded' }));
        if (discarded.status !== 'discarded') {
            throw new Error(`expected discard, got ${discarded.status}`);
        }
        const restored = await (0, service_1.mutateListeningAuthoringLifecycleCore)({
            auth,
            body: {
                operation: 'restore',
                targetId: created.draftId,
                expectedConflictToken: discarded.conflictToken,
                idempotencyKey: 'restore-revision',
                reasonCode: 'teacher-restore',
            },
            repo,
            idempotencySecret: 'secret',
        });
        (0, vitest_1.expect)(restored).toEqual(vitest_1.expect.objectContaining({ status: 'restored' }));
        const archived = await (0, service_1.mutateListeningAuthoringLifecycleCore)({
            auth,
            body: {
                operation: 'archive',
                targetId: secondPublished.versionId,
                expectedConflictToken: secondPublished.versionNumber,
                idempotencyKey: 'archive-revision',
                reasonCode: 'teacher-archive',
            },
            repo,
            idempotencySecret: 'secret',
        });
        (0, vitest_1.expect)(archived).toEqual({
            status: 'archived',
            versionId: secondPublished.versionId,
            versionNumber: 2,
        });
        (0, vitest_1.expect)(repo.listVersions()).toHaveLength(2);
        (0, vitest_1.expect)(repo.listVersions().map((version) => version.document.title)).toEqual([
            'Autosaved',
            'Revision',
        ]);
        (0, vitest_1.expect)(await repo.getDraft(created.draftId)).toEqual(vitest_1.expect.objectContaining({
            state: 'active',
            conflictToken: vitest_1.expect.any(Number),
            latestPublishedVersionId: secondPublished.versionId,
        }));
    });
    (0, vitest_1.it)('returns same published version on exact idempotent retry without creating another version', async () => {
        const repo = createRepository();
        const saved = await saveDraft(repo);
        const first = await (0, service_1.publishListeningDraftCore)({
            auth,
            body: {
                draftId: saved.draftId,
                expectedConflictToken: saved.conflictToken,
                idempotencyKey: 'publish',
            },
            repo,
            idempotencySecret: 'secret',
        });
        const retry = await (0, service_1.publishListeningDraftCore)({
            auth,
            body: {
                draftId: saved.draftId,
                expectedConflictToken: saved.conflictToken,
                idempotencyKey: 'publish',
            },
            repo,
            idempotencySecret: 'secret',
        });
        (0, vitest_1.expect)(retry).toEqual(first);
        (0, vitest_1.expect)(repo.listVersions()).toHaveLength(1);
    });
    (0, vitest_1.it)('blocks publish when an audio section lacks canonical assetId and writes no version', async () => {
        var _a;
        const repo = createRepository();
        const saved = await saveDraft(repo, Object.assign(Object.assign({}, completeDocument), { audioSections: [{
                    number: 1,
                    name: 'Section 1',
                    audioUrl: 'https://example.test/temp.mp3',
                    startQuestion: 1,
                    endQuestion: 1,
                }] }));
        const result = await (0, service_1.publishListeningDraftCore)({
            auth,
            body: {
                draftId: saved.draftId,
                expectedConflictToken: saved.conflictToken,
                idempotencyKey: 'publish',
            },
            repo,
            idempotencySecret: 'secret',
        });
        (0, vitest_1.expect)(result).toEqual({
            status: 'blocked',
            draftId: expectedDraftId,
            conflictToken: 1,
            blockers: [{
                    field: 'audioSections[0].assetId',
                    severity: 'blocker',
                    guidance: 'Publish requires canonical assetId for every audio section.',
                }],
            warnings: [],
        });
        (0, vitest_1.expect)(repo.listVersions()).toEqual([]);
        (0, vitest_1.expect)((_a = (await repo.getDraft(expectedDraftId))) === null || _a === void 0 ? void 0 : _a.conflictToken).toBe(1);
    });
    (0, vitest_1.it)('publishes image-mode drafts when blank question prompts are covered by question images', async () => {
        const repo = createRepository();
        const saved = await saveDraft(repo, Object.assign(Object.assign({}, completeDocument), { questionCount: 2, displayMode: 'image', questionImages: [{
                    sectionNumber: 1,
                    imageUrl: 'https://cdn.example.com/listening-page.png',
                    questionRange: { start: 1, end: 2 },
                }], audioSections: [Object.assign(Object.assign({}, completeDocument.audioSections[0]), { endQuestion: 2 })], questions: [
                {
                    number: 1,
                    type: 'short-answer',
                    question: '',
                    answer: 'fish',
                    sectionNumber: 1,
                    points: 1,
                },
                {
                    number: 2,
                    type: 'short-answer',
                    question: '',
                    answer: 'roof',
                    sectionNumber: 1,
                    points: 1,
                },
            ] }));
        const result = await (0, service_1.publishListeningDraftCore)({
            auth,
            body: {
                draftId: saved.draftId,
                expectedConflictToken: saved.conflictToken,
                idempotencyKey: 'publish',
            },
            repo,
            idempotencySecret: 'secret',
        });
        (0, vitest_1.expect)(result).toEqual({
            status: 'published',
            draftId: expectedDraftId,
            versionId: expectedVersionId,
            versionNumber: 1,
            conflictToken: 2,
            warnings: [],
        });
        (0, vitest_1.expect)(repo.listVersions()[0].document.questionImages).toEqual([{
                sectionNumber: 1,
                imageUrl: 'https://cdn.example.com/listening-page.png',
                questionRange: { start: 1, end: 2 },
            }]);
    });
    vitest_1.it.each([
        [
            'missing audio',
            Object.assign(Object.assign({}, completeDocument), { audioSections: [] }),
            {
                field: 'audioSections',
                severity: 'blocker',
                guidance: 'Publish requires at least one audio section.',
            },
        ],
        [
            'empty questions',
            Object.assign(Object.assign({}, completeDocument), { questionCount: 0, questions: [] }),
            {
                field: 'questions',
                severity: 'blocker',
                guidance: 'Publish requires at least one question.',
            },
        ],
        [
            'question count mismatch',
            Object.assign(Object.assign({}, completeDocument), { questionCount: 2 }),
            {
                field: 'questionCount',
                severity: 'blocker',
                guidance: 'Publish requires questionCount to match the saved questions.',
            },
        ],
    ])('blocks publish for %s', async (_label, incompleteDocument, blocker) => {
        const repo = createRepository();
        const saved = await saveDraft(repo, incompleteDocument);
        const result = await (0, service_1.publishListeningDraftCore)({
            auth,
            body: {
                draftId: saved.draftId,
                expectedConflictToken: saved.conflictToken,
                idempotencyKey: 'publish',
            },
            repo,
            idempotencySecret: 'secret',
        });
        (0, vitest_1.expect)(result).toEqual({
            status: 'blocked',
            draftId: expectedDraftId,
            conflictToken: 1,
            blockers: [blocker],
            warnings: [],
        });
        (0, vitest_1.expect)(repo.listVersions()).toEqual([]);
    });
    vitest_1.it.each([
        ['blank string answer', ''],
        ['whitespace string answer', '   '],
        ['empty answer list', []],
        ['answer list with blank value', ['A', '  ']],
        ['empty answer map', {}],
        ['answer map with blank value', { first: 'A', second: ' ' }],
    ])('blocks publish for %s', async (_label, answer) => {
        const repo = createRepository();
        const saved = await saveDraft(repo, Object.assign(Object.assign({}, completeDocument), { questions: [Object.assign(Object.assign({}, completeDocument.questions[0]), { answer })] }));
        const result = await (0, service_1.publishListeningDraftCore)({
            auth,
            body: {
                draftId: saved.draftId,
                expectedConflictToken: saved.conflictToken,
                idempotencyKey: 'publish',
            },
            repo,
            idempotencySecret: 'secret',
        });
        (0, vitest_1.expect)(result).toEqual({
            status: 'blocked',
            draftId: expectedDraftId,
            conflictToken: 1,
            blockers: [{
                    field: 'questions[0].answer',
                    severity: 'blocker',
                    guidance: 'Publish requires a non-empty answer for every question.',
                }],
            warnings: [],
        });
        (0, vitest_1.expect)(repo.listVersions()).toEqual([]);
    });
    (0, vitest_1.it)('blocks publish when a question has no student-visible prompt', async () => {
        const repo = createRepository();
        const saved = await saveDraft(repo, Object.assign(Object.assign({}, completeDocument), { questions: [Object.assign(Object.assign({}, completeDocument.questions[0]), { question: '   ' })] }));
        const result = await (0, service_1.publishListeningDraftCore)({
            auth,
            body: {
                draftId: saved.draftId,
                expectedConflictToken: saved.conflictToken,
                idempotencyKey: 'publish',
            },
            repo,
            idempotencySecret: 'secret',
        });
        (0, vitest_1.expect)(result).toEqual({
            status: 'blocked',
            draftId: expectedDraftId,
            conflictToken: 1,
            blockers: [{
                    field: 'questions[0].question',
                    severity: 'blocker',
                    guidance: 'Publish requires question text for every question.',
                }],
            warnings: [],
        });
        (0, vitest_1.expect)(repo.listVersions()).toEqual([]);
    });
    (0, vitest_1.it)('chains revision-draft publishes to the latest immutable version', async () => {
        const legacyTest = Object.assign({ id: 'legacy-test-lineage', ownerId: auth.uid, createdAt: 1600000000000, createdBy: auth.uid, updatedAt: 1600000000500, isPublished: true }, completeDocument);
        const repo = (0, repository_1.createInMemoryListeningAuthoringRepository)({
            now: createNow(1700000000000, 1700000000500, 1700000001000, 1700000001500, 1700000002000),
            seed: { legacyTests: [legacyTest] },
        });
        const frozen = await (0, service_1.publishListeningDraftCore)({
            auth,
            body: {
                legacyTestId: legacyTest.id,
                idempotencyKey: 'freeze-legacy',
            },
            repo,
            idempotencySecret: 'secret',
        });
        (0, vitest_1.expect)(frozen.status).toBe('published');
        if (frozen.status !== 'published') {
            throw new Error(`expected legacy freeze publish, got ${frozen.status}`);
        }
        const firstRevisionPublish = await (0, service_1.publishListeningDraftCore)({
            auth,
            body: {
                draftId: frozen.draftId,
                expectedConflictToken: frozen.conflictToken,
                idempotencyKey: 'publish-revision-1',
            },
            repo,
            idempotencySecret: 'secret',
        });
        (0, vitest_1.expect)(firstRevisionPublish.status).toBe('published');
        if (firstRevisionPublish.status !== 'published') {
            throw new Error(`expected first revision publish, got ${firstRevisionPublish.status}`);
        }
        const savedSecondRevision = await (0, service_1.saveListeningDraftCore)({
            auth,
            body: {
                draftId: frozen.draftId,
                expectedConflictToken: firstRevisionPublish.conflictToken,
                idempotencyKey: 'save-revision-2',
                document: Object.assign(Object.assign({}, completeDocument), { title: 'Ready revision 2' }),
            },
            repo,
            idempotencySecret: 'secret',
        });
        (0, vitest_1.expect)(savedSecondRevision.status).toBe('saved');
        if (savedSecondRevision.status !== 'saved') {
            throw new Error(`expected second revision save, got ${savedSecondRevision.status}`);
        }
        const secondRevisionPublish = await (0, service_1.publishListeningDraftCore)({
            auth,
            body: {
                draftId: frozen.draftId,
                expectedConflictToken: savedSecondRevision.conflictToken,
                idempotencyKey: 'publish-revision-2',
            },
            repo,
            idempotencySecret: 'secret',
        });
        (0, vitest_1.expect)(secondRevisionPublish.status).toBe('published');
        if (secondRevisionPublish.status !== 'published') {
            throw new Error(`expected second revision publish, got ${secondRevisionPublish.status}`);
        }
        const versions = [...repo.listVersions()]
            .sort((left, right) => left.versionNumber - right.versionNumber);
        (0, vitest_1.expect)(versions).toHaveLength(3);
        (0, vitest_1.expect)(versions[0]).toEqual(vitest_1.expect.objectContaining({
            versionNumber: 1,
            sourceDraftPath: 'legacy_tests',
        }));
        (0, vitest_1.expect)(versions[0]).not.toHaveProperty('previousVersionId');
        (0, vitest_1.expect)(versions[1]).toEqual(vitest_1.expect.objectContaining({
            versionNumber: 2,
            previousVersionId: versions[0].versionId,
            sourceDraftPath: 'revision_drafts',
        }));
        (0, vitest_1.expect)(versions[2]).toEqual(vitest_1.expect.objectContaining({
            versionNumber: 3,
            previousVersionId: versions[1].versionId,
            sourceDraftPath: 'revision_drafts',
        }));
    });
    (0, vitest_1.it)('rejects stale tokens and changed idempotent payloads without another version', async () => {
        const repo = createRepository();
        const saved = await saveDraft(repo);
        const stale = await (0, service_1.publishListeningDraftCore)({
            auth,
            body: {
                draftId: saved.draftId,
                expectedConflictToken: 2,
                idempotencyKey: 'publish-stale',
            },
            repo,
            idempotencySecret: 'secret',
        });
        const first = await (0, service_1.publishListeningDraftCore)({
            auth,
            body: {
                draftId: saved.draftId,
                expectedConflictToken: saved.conflictToken,
                idempotencyKey: 'publish',
            },
            repo,
            idempotencySecret: 'secret',
        });
        const changed = await (0, service_1.publishListeningDraftCore)({
            auth,
            body: {
                draftId: saved.draftId,
                expectedConflictToken: 999,
                idempotencyKey: 'publish',
            },
            repo,
            idempotencySecret: 'secret',
        });
        (0, vitest_1.expect)(stale).toEqual({
            status: 'conflict',
            recoverable: true,
            draftId: expectedDraftId,
            expectedConflictToken: 2,
            currentConflictToken: 1,
        });
        (0, vitest_1.expect)(first.status).toBe('published');
        (0, vitest_1.expect)(changed).toEqual({
            status: 'idempotency-conflict',
            recoverable: false,
            draftId: expectedDraftId,
            operationId: 'operation-3',
        });
        (0, vitest_1.expect)(repo.listVersions()).toHaveLength(1);
    });
});
//# sourceMappingURL=publish.service.test.js.map