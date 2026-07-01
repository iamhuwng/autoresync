"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
const vitest_1 = require("vitest");
const repository_1 = require("./repository");
const service_1 = require("./service");
const hasDatabaseEmulator = Boolean(process.env.FIREBASE_DATABASE_EMULATOR_HOST);
const projectId = 'temp-a1437';
const appName = 'listening-authoring-repository-emulator-tests';
const auth = { uid: 'teacher-1', role: 'teacher' };
const document = {
    title: 'Concurrent test',
    type: 'IELTS',
    skill: 'Listening',
    duration: 1800,
    difficulty: 'Intermediate',
    questionCount: 1,
    isPublic: false,
    isComplete: true,
    displayMode: 'text',
    metadata: {
        description: 'Emulator transaction proof',
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
vitest_1.describe.runIf(hasDatabaseEmulator)('Firebase listening authoring transactions', () => {
    let app;
    let db;
    (0, vitest_1.beforeAll)(() => {
        app = admin.initializeApp({
            projectId,
            databaseURL: `https://${projectId}-default-rtdb.firebaseio.com`,
        }, appName);
        db = app.database();
    });
    (0, vitest_1.beforeEach)(async () => {
        await db.ref().set(null);
        vitest_1.vi.useFakeTimers();
        vitest_1.vi.setSystemTime(1700000000000);
    });
    (0, vitest_1.afterAll)(async () => {
        vitest_1.vi.useRealTimers();
        await app.delete();
    });
    (0, vitest_1.it)('converges concurrent same-key legacy first-edit requests to one atomic result', async () => {
        const legacyTest = Object.assign({ id: 'legacy-concurrent', ownerId: auth.uid, createdAt: 1600000000000, createdBy: auth.uid, updatedAt: 1600000000500, isPublished: true }, document);
        await db.ref(`tests/${legacyTest.id}`).set(legacyTest);
        const publish = () => (0, service_1.publishListeningDraftCore)({
            auth,
            body: {
                legacyTestId: legacyTest.id,
                idempotencyKey: 'same-concurrent-key',
            },
            repo: (0, repository_1.createFirebaseListeningAuthoringRepository)(db),
            idempotencySecret: 'emulator-secret',
        });
        const [first, second] = await Promise.all([publish(), publish()]);
        (0, vitest_1.expect)(first).toEqual(second);
        (0, vitest_1.expect)(first.status).toBe('published');
        const root = (await db.ref().get()).val();
        (0, vitest_1.expect)(Object.keys(root.listening_authoring.versions)).toHaveLength(1);
        (0, vitest_1.expect)(Object.keys(root.listening_authoring.revision_drafts)).toHaveLength(1);
        (0, vitest_1.expect)(Object.keys(root.listening_authoring.operations)).toHaveLength(1);
        (0, vitest_1.expect)(root.tests[legacyTest.id]).toEqual(Object.assign(Object.assign({}, legacyTest), { authoringVersioning: vitest_1.expect.objectContaining({
                frozen: true,
                versionNumber: 1,
            }) }));
    });
    (0, vitest_1.it)('allows one concurrent draft CAS update and records the loser as a conflict', async () => {
        const initial = await (0, service_1.saveListeningDraftCore)({
            auth,
            body: { idempotencyKey: 'create-draft', document },
            repo: (0, repository_1.createFirebaseListeningAuthoringRepository)(db),
            idempotencySecret: 'emulator-secret',
        });
        (0, vitest_1.expect)(initial.status).toBe('saved');
        if (initial.status !== 'saved') {
            throw new Error(`expected saved draft, got ${initial.status}`);
        }
        const update = (suffix) => (0, service_1.saveListeningDraftCore)({
            auth,
            body: {
                draftId: initial.draftId,
                expectedConflictToken: initial.conflictToken,
                idempotencyKey: `update-${suffix}`,
                document: Object.assign(Object.assign({}, document), { title: `Update ${suffix}` }),
            },
            repo: (0, repository_1.createFirebaseListeningAuthoringRepository)(db),
            idempotencySecret: 'emulator-secret',
        });
        const results = await Promise.all([update('A'), update('B')]);
        (0, vitest_1.expect)(results.map((result) => result.status).sort()).toEqual(['conflict', 'saved']);
        const storedDraft = (await db.ref(`listening_authoring/drafts/${initial.draftId}`).get()).val();
        (0, vitest_1.expect)(storedDraft.conflictToken).toBe(2);
        (0, vitest_1.expect)(['Update A', 'Update B']).toContain(storedDraft.document.title);
        const operations = (await db.ref('listening_authoring/operations').get()).val();
        (0, vitest_1.expect)(Object.keys(operations)).toHaveLength(3);
    });
});
//# sourceMappingURL=repository.firebase.emulator.test.js.map