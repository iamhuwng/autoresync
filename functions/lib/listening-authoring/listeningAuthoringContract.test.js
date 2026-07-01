"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const constants_1 = require("./constants");
const canonical_1 = require("./canonical");
const validation_1 = require("./validation");
const document = {
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
        targetBand: '7.0',
        estimatedScore: '30',
    },
    audioSections: [
        {
            number: 1,
            name: 'Section 1',
            assetId: 'asset-1',
            audioUrl: 'r2://asset-1',
            startQuestion: 1,
            endQuestion: 10,
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
        allowReview: true,
        showResults: 'after-submission',
        passingScore: 60,
        allowReplay: true,
        audioControls: {
            showPlayPause: true,
            showProgressBar: true,
            showSeekControl: true,
            showSpeedControl: true,
            showSkipSection: false,
            showVolumeControl: true,
        },
    },
};
const publishedVersionCommon = {
    schemaVersion: 1,
    recordType: 'published-version',
    versionId: 'version-1',
    versionNumber: 1,
    testId: 'test-1',
    ownerId: 'teacher-1',
    document,
    assetIds: { 'asset-1': true },
    publishedAt: 1700000000000,
    publishedBy: 'teacher-1',
    publishOperationId: 'operation-publish-1',
    documentHash: 'document-hash-1',
    archive: { state: 'active' },
    compatibility: { frozenLegacyVersion1: true },
};
const createPublishedVersionCommon = {
    schemaVersion: 1,
    recordType: 'published-version',
    versionId: 'version-1',
    testId: 'test-1',
    ownerId: 'teacher-1',
    document,
    assetIds: { 'asset-1': true },
    publishedAt: 1700000000000,
    publishedBy: 'teacher-1',
    publishOperationId: 'operation-publish-1',
    documentHash: 'document-hash-1',
    archive: { state: 'active' },
    compatibility: { frozenLegacyVersion1: true },
};
const publishedFromDrafts = Object.assign(Object.assign({}, publishedVersionCommon), { sourceDraftPath: 'drafts', sourceDraftId: 'draft-1' });
const publishedFromRevisionDrafts = Object.assign(Object.assign({}, publishedVersionCommon), { versionId: 'version-2', sourceDraftPath: 'revision_drafts', sourceDraftId: 'revision-1' });
const publishedFromLegacyTests = Object.assign(Object.assign({}, publishedVersionCommon), { versionId: 'version-3', sourceDraftPath: 'legacy_tests', sourceLegacyTestId: 'legacy-test-1' });
const createFromDrafts = Object.assign(Object.assign({}, createPublishedVersionCommon), { sourceDraftPath: 'drafts', sourceDraftId: 'draft-1' });
const createFromRevisionDrafts = Object.assign(Object.assign({}, createPublishedVersionCommon), { versionId: 'version-2', sourceDraftPath: 'revision_drafts', sourceDraftId: 'revision-1' });
const createFromLegacyTests = Object.assign(Object.assign({}, createPublishedVersionCommon), { versionId: 'version-3', sourceDraftPath: 'legacy_tests', sourceLegacyTestId: 'legacy-test-1' });
// @ts-expect-error drafts source requires sourceDraftId
const invalidMissingDraftSourceId = Object.assign(Object.assign({}, createPublishedVersionCommon), { versionId: 'version-4', sourceDraftPath: 'drafts' });
// @ts-expect-error revision_drafts source requires sourceDraftId
const invalidMissingRevisionSourceId = Object.assign(Object.assign({}, createPublishedVersionCommon), { versionId: 'version-5', sourceDraftPath: 'revision_drafts' });
// @ts-expect-error legacy_tests source requires sourceLegacyTestId
const invalidMissingLegacySourceId = Object.assign(Object.assign({}, createPublishedVersionCommon), { versionId: 'version-6', sourceDraftPath: 'legacy_tests' });
// @ts-expect-error drafts source forbids sourceLegacyTestId
const invalidContradictoryDraftSource = Object.assign(Object.assign({}, createPublishedVersionCommon), { versionId: 'version-7', sourceDraftPath: 'drafts', sourceDraftId: 'draft-7', sourceLegacyTestId: 'legacy-test-7' });
// @ts-expect-error legacy_tests source forbids sourceDraftId
const invalidContradictoryLegacySource = Object.assign(Object.assign({}, createPublishedVersionCommon), { versionId: 'version-8', sourceDraftPath: 'legacy_tests', sourceDraftId: 'draft-8', sourceLegacyTestId: 'legacy-test-8' });
(0, vitest_1.describe)('Listening authoring B2 backend contract', () => {
    (0, vitest_1.it)('keeps exact constants, paths, names, and TTL', () => {
        (0, vitest_1.expect)(constants_1.LISTENING_AUTHORING_SCHEMA_VERSION).toBe(1);
        (0, vitest_1.expect)(constants_1.LISTENING_AUTHORING_PATHS).toEqual({
            drafts: 'listening_authoring/drafts',
            revisionDrafts: 'listening_authoring/revision_drafts',
            versions: 'listening_authoring/versions',
            operations: 'listening_authoring/operations',
        });
        (0, vitest_1.expect)(constants_1.LISTENING_AUTHORING_OPERATION_TYPES).toEqual([
            'save-draft',
            'publish',
            'soft-delete',
            'restore',
            'archive',
            'discard',
        ]);
        (0, vitest_1.expect)(constants_1.LISTENING_AUTHORING_OPERATION_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
        (0, vitest_1.expect)(constants_1.LISTENING_AUTHORING_IDEMPOTENCY_SECRET_NAME).toBe('LISTENING_AUTHORING_IDEMPOTENCY_SECRET');
        (0, vitest_1.expect)(constants_1.LISTENING_AUTHORING_WRITES_ENABLED_FLAG_PATH).toBe('system_flags/listening_authoring_writes_enabled');
        (0, vitest_1.expect)(constants_1.LISTENING_AUTHORING_RESTORE_IN_PROGRESS_FLAG_PATH).toBe('system_flags/restore_in_progress');
    });
    (0, vitest_1.it)('canonicalizes json and hashes requests deterministically', () => {
        (0, vitest_1.expect)((0, canonical_1.canonicalJson)({ b: 2, a: 1, omitted: undefined })).toBe('{"a":1,"b":2}');
        (0, vitest_1.expect)((0, canonical_1.canonicalJson)({ nested: { z: null, a: ['x', 'y'] } })).toBe('{"nested":{"a":["x","y"],"z":null}}');
        (0, vitest_1.expect)((0, canonical_1.canonicalJson)({ items: ['x', undefined, 'y'] })).toBe('{"items":["x",null,"y"]}');
        (0, vitest_1.expect)((0, canonical_1.requestHash)({ b: 2, a: 1 })).toBe('43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777');
        (0, vitest_1.expect)((0, canonical_1.requestHash)({ items: ['x', undefined, 'y'] })).toBe('d8a60c02d6c9c23bd58eccc5ccadee4a09013040900db93b8bfb85106f75b93b');
    });
    (0, vitest_1.it)('rejects non-JSON canonical inputs', () => {
        class CustomValue {
            constructor() {
                this.value = 'custom';
            }
        }
        (0, vitest_1.expect)(() => (0, canonical_1.canonicalJson)({ value: NaN })).toThrow();
        (0, vitest_1.expect)(() => (0, canonical_1.canonicalJson)({ value: Infinity })).toThrow();
        (0, vitest_1.expect)(() => (0, canonical_1.canonicalJson)({ value: -Infinity })).toThrow();
        (0, vitest_1.expect)(() => (0, canonical_1.canonicalJson)({ when: new Date('2026-06-27T00:00:00.000Z') })).toThrow();
        (0, vitest_1.expect)(() => (0, canonical_1.canonicalJson)({ custom: new CustomValue() })).toThrow();
    });
    (0, vitest_1.it)('uses exact composite HMAC payload for idempotency keys', () => {
        (0, vitest_1.expect)((0, canonical_1.hmacSha256Hex)('secret', 'teacher-1:save-draft:draft-1:key-1')).toBe('aa819243b9a5343f0398969f477a13abce81328eb123beb5b1c90d10bc5d19fd');
    });
    (0, vitest_1.it)('keeps published-version source fields as exact discriminated unions and distributive create input', () => {
        (0, vitest_1.expect)(publishedFromDrafts.sourceDraftId).toBe('draft-1');
        (0, vitest_1.expect)(publishedFromRevisionDrafts.sourceDraftId).toBe('revision-1');
        (0, vitest_1.expect)(publishedFromLegacyTests.sourceLegacyTestId).toBe('legacy-test-1');
        (0, vitest_1.expect)(createFromDrafts.sourceDraftPath).toBe('drafts');
        (0, vitest_1.expect)(createFromRevisionDrafts.sourceDraftPath).toBe('revision_drafts');
        (0, vitest_1.expect)(createFromLegacyTests.sourceDraftPath).toBe('legacy_tests');
        (0, vitest_1.expectTypeOf)(publishedFromDrafts).toMatchTypeOf();
        (0, vitest_1.expectTypeOf)(publishedFromRevisionDrafts).toMatchTypeOf();
        (0, vitest_1.expectTypeOf)(publishedFromLegacyTests).toMatchTypeOf();
        (0, vitest_1.expectTypeOf)(createFromDrafts).toMatchTypeOf();
        (0, vitest_1.expectTypeOf)(createFromRevisionDrafts).toMatchTypeOf();
        (0, vitest_1.expectTypeOf)(createFromLegacyTests).toMatchTypeOf();
    });
    (0, vitest_1.it)('defines exact operation record shape with target type completedAt and narrow terminal result only', () => {
        const record = {
            schemaVersion: 1,
            operationId: 'operation-1',
            operationType: 'save-draft',
            targetType: 'draft',
            targetId: 'draft-1',
            ownerId: 'teacher-1',
            idempotencyKeyHash: 'key-hash',
            requestHash: 'request-hash',
            expectedConflictToken: 4,
            status: 'succeeded',
            result: {
                draftId: 'draft-1',
                conflictToken: 5,
            },
            createdAt: 1700000000000,
            completedAt: 1700000000100,
            expiresAt: 1700000000100 + 30 * 24 * 60 * 60 * 1000,
        };
        (0, vitest_1.expect)(record).toEqual({
            schemaVersion: 1,
            operationId: 'operation-1',
            operationType: 'save-draft',
            targetType: 'draft',
            targetId: 'draft-1',
            ownerId: 'teacher-1',
            idempotencyKeyHash: 'key-hash',
            requestHash: 'request-hash',
            expectedConflictToken: 4,
            status: 'succeeded',
            result: {
                draftId: 'draft-1',
                conflictToken: 5,
            },
            createdAt: 1700000000000,
            completedAt: 1700000000100,
            expiresAt: 1700000000100 + 30 * 24 * 60 * 60 * 1000,
        });
        (0, vitest_1.expect)('updatedAt' in record).toBe(false);
        (0, vitest_1.expect)(JSON.stringify(record)).not.toContain('key-1');
    });
    (0, vitest_1.it)('parses save draft requests with default explicit trigger and optional autosave', () => {
        const parsedDefault = (0, validation_1.parseSaveDraftRequest)({
            idempotencyKey: 'save-1',
            document,
        });
        const parsedAutosave = (0, validation_1.parseSaveDraftRequest)({
            idempotencyKey: 'save-2',
            draftId: 'draft-2',
            expectedConflictToken: 3,
            trigger: 'autosave',
            document,
        });
        const expectedDefault = {
            idempotencyKey: 'save-1',
            document,
            trigger: 'explicit',
            warnings: [],
        };
        const expectedAutosave = {
            idempotencyKey: 'save-2',
            draftId: 'draft-2',
            expectedConflictToken: 3,
            trigger: 'autosave',
            document,
            warnings: [],
        };
        (0, vitest_1.expect)(parsedDefault).toEqual(expectedDefault);
        (0, vitest_1.expect)(parsedAutosave).toEqual(expectedAutosave);
    });
    (0, vitest_1.it)('rejects null metadata instead of replacing required B2 fields', () => {
        (0, vitest_1.expect)(() => (0, validation_1.parseSaveDraftRequest)({
            idempotencyKey: 'save-4',
            document: Object.assign(Object.assign({}, document), { metadata: null }),
        })).toThrow(/document\.metadata/);
    });
    (0, vitest_1.it)('normalizes missing draft fields with warnings while still rejecting zero conflict tokens', () => {
        const missingDifficulty = Object.assign({}, document);
        delete missingDifficulty.difficulty;
        const missingAudioSection = Object.assign({}, document.audioSections[0]);
        delete missingAudioSection.name;
        const missingQuestion = Object.assign({}, document.questions[0]);
        delete missingQuestion.answer;
        const missingSettings = Object.assign({}, document.settings);
        delete missingSettings.allowPause;
        (0, vitest_1.expect)((0, validation_1.parseSaveDraftRequest)({
            idempotencyKey: 'missing-difficulty',
            document: missingDifficulty,
        })).toEqual(vitest_1.expect.objectContaining({
            warnings: ['document.difficulty is missing.'],
            document: vitest_1.expect.objectContaining({
                difficulty: 'Intermediate',
            }),
        }));
        (0, vitest_1.expect)((0, validation_1.parseSaveDraftRequest)({
            idempotencyKey: 'missing-instructions',
            document: Object.assign(Object.assign({}, document), { metadata: {
                    description: document.metadata.description,
                    tags: document.metadata.tags,
                } }),
        })).toEqual(vitest_1.expect.objectContaining({
            warnings: ['document.metadata.instructions is missing.'],
            document: vitest_1.expect.objectContaining({
                metadata: vitest_1.expect.objectContaining({
                    instructions: '',
                }),
            }),
        }));
        (0, vitest_1.expect)((0, validation_1.parseSaveDraftRequest)({
            idempotencyKey: 'missing-audio-name',
            document: Object.assign(Object.assign({}, document), { audioSections: [missingAudioSection] }),
        })).toEqual(vitest_1.expect.objectContaining({
            warnings: ['document.audioSections[0].name is missing.'],
            document: vitest_1.expect.objectContaining({
                audioSections: [vitest_1.expect.objectContaining({ name: '' })],
            }),
        }));
        (0, vitest_1.expect)((0, validation_1.parseSaveDraftRequest)({
            idempotencyKey: 'missing-answer',
            document: Object.assign(Object.assign({}, document), { questions: [missingQuestion] }),
        })).toEqual(vitest_1.expect.objectContaining({
            warnings: ['document.questions[0].answer is missing.'],
            document: vitest_1.expect.objectContaining({
                questions: [vitest_1.expect.objectContaining({ answer: '' })],
            }),
        }));
        (0, vitest_1.expect)((0, validation_1.parseSaveDraftRequest)({
            idempotencyKey: 'missing-setting',
            document: Object.assign(Object.assign({}, document), { settings: missingSettings }),
        })).toEqual(vitest_1.expect.objectContaining({
            warnings: ['document.settings.allowPause is missing.'],
            document: vitest_1.expect.objectContaining({
                settings: vitest_1.expect.objectContaining({ allowPause: true }),
            }),
        }));
        (0, vitest_1.expect)(() => (0, validation_1.parsePublishDraftRequest)({
            draftId: 'draft-1',
            expectedConflictToken: 0,
            idempotencyKey: 'zero-publish-token',
        })).toThrow(/positive integer/);
        (0, vitest_1.expect)(() => (0, validation_1.parseLifecycleRequest)({
            operation: 'restore',
            targetId: 'draft-1',
            expectedConflictToken: 0,
            idempotencyKey: 'zero-lifecycle-token',
        })).toThrow(/positive integer/);
    });
    (0, vitest_1.it)('rejects non-string optional draftId and reasonCode values', () => {
        (0, vitest_1.expect)(() => (0, validation_1.parseSaveDraftRequest)({
            idempotencyKey: 'save-5',
            draftId: 123,
            document,
        })).toThrow();
        (0, vitest_1.expect)(() => (0, validation_1.parseLifecycleRequest)({
            operation: 'discard',
            targetId: 'draft-1',
            idempotencyKey: 'lifecycle-2',
            reasonCode: 123,
        })).toThrow();
    });
    (0, vitest_1.it)('rejects invalid document enums and unapproved nested fields', () => {
        (0, vitest_1.expect)(() => (0, validation_1.parseSaveDraftRequest)({
            idempotencyKey: 'save-enum-1',
            document: Object.assign(Object.assign({}, document), { type: 'single-select' }),
        })).toThrow(/document\.type/);
        (0, vitest_1.expect)(() => (0, validation_1.parseSaveDraftRequest)({
            idempotencyKey: 'save-enum-2',
            document: Object.assign(Object.assign({}, document), { displayMode: 'standard' }),
        })).toThrow(/document\.displayMode/);
        (0, vitest_1.expect)(() => (0, validation_1.parseSaveDraftRequest)({
            idempotencyKey: 'save-enum-3',
            document: Object.assign(Object.assign({}, document), { settings: Object.assign(Object.assign({}, document.settings), { showResults: 'later' }) }),
        })).toThrow(/showResults/);
        (0, vitest_1.expect)(() => (0, validation_1.parseSaveDraftRequest)({
            idempotencyKey: 'save-enum-4',
            document: Object.assign(Object.assign({}, document), { audioSections: [{ number: 1, id: 'not-approved' }] }),
        })).toThrow(/not an approved field/);
    });
    (0, vitest_1.it)('rejects non-record entries in audio sections and questions', () => {
        (0, vitest_1.expect)(() => (0, validation_1.parseSaveDraftRequest)({
            idempotencyKey: 'save-6',
            document: Object.assign(Object.assign({}, document), { audioSections: ['bad'] }),
        })).toThrow();
        (0, vitest_1.expect)(() => (0, validation_1.parseSaveDraftRequest)({
            idempotencyKey: 'save-7',
            document: Object.assign(Object.assign({}, document), { questions: [null] }),
        })).toThrow();
    });
    (0, vitest_1.it)('detaches parsed document data from caller input', () => {
        const originalMetadata = {
            description: 'maps',
            instructions: 'Answer every question.',
            tags: ['maps'],
        };
        const originalSettings = {
            allowPause: true,
            showTimer: true,
            shuffleQuestions: false,
            showResults: 'after-submission',
            allowReview: true,
            passingScore: 60,
            allowReplay: true,
            audioControls: {
                showPlayPause: true,
                showProgressBar: true,
                showSeekControl: true,
                showSpeedControl: true,
                showSkipSection: false,
                showVolumeControl: true,
            },
        };
        const originalAudioSections = [{
                number: 1,
                name: 'Section 1',
                assetId: 'asset-1',
                audioUrl: 'r2://asset-1',
                startQuestion: 1,
                endQuestion: 1,
            }];
        const originalQuestions = [{
                number: 1,
                type: 'short-answer',
                question: 'Q1',
                answer: 'A',
                sectionNumber: 1,
                points: 1,
                context: { sectionHeading: 'A', contextLines: ['line 1'] },
            }];
        const parsed = (0, validation_1.parseSaveDraftRequest)({
            idempotencyKey: 'save-8',
            document: Object.assign(Object.assign({}, document), { metadata: originalMetadata, settings: originalSettings, audioSections: originalAudioSections, questions: originalQuestions }),
        });
        originalMetadata.description = 'changed';
        originalMetadata.tags[0] = 'changed';
        originalSettings.allowReview = false;
        originalSettings.audioControls.showPlayPause = false;
        originalAudioSections[0].name = 'changed';
        originalQuestions[0].context.sectionHeading = 'changed';
        originalQuestions[0].context.contextLines[0] = 'changed';
        (0, vitest_1.expect)(parsed.document.metadata).toEqual({
            description: 'maps',
            instructions: 'Answer every question.',
            tags: ['maps'],
        });
        (0, vitest_1.expect)(parsed.document.settings).toEqual({
            allowPause: true,
            showTimer: true,
            shuffleQuestions: false,
            showResults: 'after-submission',
            allowReview: true,
            passingScore: 60,
            allowReplay: true,
            audioControls: {
                showPlayPause: true,
                showProgressBar: true,
                showSeekControl: true,
                showSpeedControl: true,
                showSkipSection: false,
                showVolumeControl: true,
            },
        });
        (0, vitest_1.expect)(parsed.document.audioSections).toEqual([{
                number: 1,
                name: 'Section 1',
                assetId: 'asset-1',
                audioUrl: 'r2://asset-1',
                startQuestion: 1,
                endQuestion: 1,
            }]);
        (0, vitest_1.expect)(parsed.document.questions).toEqual([{
                number: 1,
                type: 'short-answer',
                question: 'Q1',
                answer: 'A',
                sectionNumber: 1,
                points: 1,
                context: { sectionHeading: 'A', contextLines: ['line 1'] },
            }]);
    });
    (0, vitest_1.it)('rejects nested non-JSON document values in metadata settings audio sections and questions', () => {
        class CustomValue {
            constructor() {
                this.value = 'custom';
            }
        }
        (0, vitest_1.expect)(() => (0, validation_1.parseSaveDraftRequest)({
            idempotencyKey: 'save-9',
            document: Object.assign(Object.assign({}, document), { metadata: { description: 'maps', transcript: new Date('2026-06-27T00:00:00.000Z') } }),
        })).toThrow();
        (0, vitest_1.expect)(() => (0, validation_1.parseSaveDraftRequest)({
            idempotencyKey: 'save-10',
            document: Object.assign(Object.assign({}, document), { settings: { allowReview: true, audioControls: new CustomValue() } }),
        })).toThrow();
        (0, vitest_1.expect)(() => (0, validation_1.parseSaveDraftRequest)({
            idempotencyKey: 'save-11',
            document: Object.assign(Object.assign({}, document), { audioSections: [{ number: 1, audioUrl: new Date('2026-06-27T00:00:00.000Z') }] }),
        })).toThrow();
        (0, vitest_1.expect)(() => (0, validation_1.parseSaveDraftRequest)({
            idempotencyKey: 'save-12',
            document: Object.assign(Object.assign({}, document), { questions: [{ number: 1, context: new CustomValue() }] }),
        })).toThrow();
    });
    (0, vitest_1.it)('rejects malformed top-level document containers instead of erasing them', () => {
        class CustomValue {
            constructor() {
                this.value = 'custom';
            }
        }
        (0, vitest_1.expect)(() => (0, validation_1.parseSaveDraftRequest)({
            idempotencyKey: 'save-13',
            document: Object.assign(Object.assign({}, document), { metadata: new Date('2026-06-27T00:00:00.000Z') }),
        })).toThrow();
        (0, vitest_1.expect)(() => (0, validation_1.parseSaveDraftRequest)({
            idempotencyKey: 'save-14',
            document: Object.assign(Object.assign({}, document), { settings: new CustomValue() }),
        })).toThrow();
        (0, vitest_1.expect)(() => (0, validation_1.parseSaveDraftRequest)({
            idempotencyKey: 'save-15',
            document: Object.assign(Object.assign({}, document), { audioSections: new Date('2026-06-27T00:00:00.000Z') }),
        })).toThrow();
        (0, vitest_1.expect)(() => (0, validation_1.parseSaveDraftRequest)({
            idempotencyKey: 'save-16',
            document: Object.assign(Object.assign({}, document), { questions: new CustomValue() }),
        })).toThrow();
    });
    (0, vitest_1.it)('rejects invalid save draft trigger values', () => {
        (0, vitest_1.expect)(() => (0, validation_1.parseSaveDraftRequest)({
            idempotencyKey: 'save-3',
            trigger: 'manual',
            document,
        })).toThrow(/trigger must be explicit or autosave/);
    });
    (0, vitest_1.it)('rejects unknown top-level fields from save publish and lifecycle requests', () => {
        (0, vitest_1.expect)(() => (0, validation_1.parseSaveDraftRequest)({
            idempotencyKey: 'save-extra',
            document,
            extraAuthority: true,
        })).toThrow(/save draft request\.extraAuthority/);
        (0, vitest_1.expect)(() => (0, validation_1.parsePublishDraftRequest)({
            draftId: 'draft-1',
            expectedConflictToken: 7,
            idempotencyKey: 'publish-extra',
            extraAuthority: true,
        })).toThrow(/publish draft request\.extraAuthority/);
        (0, vitest_1.expect)(() => (0, validation_1.parsePublishDraftRequest)({
            legacyTestId: 'legacy-test-1',
            idempotencyKey: 'legacy-extra',
            document,
        })).toThrow(/publish draft request\.document/);
        (0, vitest_1.expect)(() => (0, validation_1.parseLifecycleRequest)({
            operation: 'restore',
            targetId: 'draft-1',
            idempotencyKey: 'lifecycle-extra',
            extraAuthority: true,
        })).toThrow(/lifecycle request\.extraAuthority/);
    });
    (0, vitest_1.it)('parses publish draft requests with retained pins', () => {
        const parsed = (0, validation_1.parsePublishDraftRequest)({
            draftId: 'draft-1',
            expectedConflictToken: 7,
            idempotencyKey: 'publish-1',
            retainedPins: {
                intro: ['pin-a', 'pin-b'],
            },
        });
        const expected = {
            draftId: 'draft-1',
            expectedConflictToken: 7,
            idempotencyKey: 'publish-1',
            retainedPins: {
                intro: ['pin-a', 'pin-b'],
            },
        };
        (0, vitest_1.expect)(parsed).toEqual(expected);
    });
    (0, vitest_1.it)('rejects malformed retained pins containers instead of erasing them', () => {
        class CustomValue {
            constructor() {
                this.intro = ['pin-a'];
            }
        }
        (0, vitest_1.expect)(() => (0, validation_1.parsePublishDraftRequest)({
            draftId: 'draft-1',
            expectedConflictToken: 7,
            idempotencyKey: 'publish-2',
            retainedPins: new Date('2026-06-27T00:00:00.000Z'),
        })).toThrow();
        (0, vitest_1.expect)(() => (0, validation_1.parsePublishDraftRequest)({
            draftId: 'draft-1',
            expectedConflictToken: 7,
            idempotencyKey: 'publish-3',
            retainedPins: new CustomValue(),
        })).toThrow();
    });
    (0, vitest_1.it)('parses lifecycle requests for allowed operations', () => {
        const parsed = (0, validation_1.parseLifecycleRequest)({
            operation: 'restore',
            targetId: 'draft-1',
            expectedConflictToken: 8,
            idempotencyKey: 'lifecycle-1',
            reasonCode: 'user-requested',
        });
        (0, vitest_1.expect)(parsed).toEqual({
            operation: 'restore',
            targetId: 'draft-1',
            expectedConflictToken: 8,
            idempotencyKey: 'lifecycle-1',
            reasonCode: 'user-requested',
        });
    });
    (0, vitest_1.it)('rejects browser-supplied ownerId from all request parsers', () => {
        (0, vitest_1.expect)(() => (0, validation_1.parseSaveDraftRequest)({
            ownerId: 'teacher-1',
            idempotencyKey: 'save-1',
            document,
        })).toThrow('ownerId is server-derived');
        (0, vitest_1.expect)(() => (0, validation_1.parsePublishDraftRequest)({
            ownerId: 'teacher-1',
            draftId: 'draft-1',
            expectedConflictToken: 1,
            idempotencyKey: 'publish-1',
        })).toThrow('ownerId is server-derived');
        (0, vitest_1.expect)(() => (0, validation_1.parseLifecycleRequest)({
            ownerId: 'teacher-1',
            operation: 'soft-delete',
            targetId: 'draft-1',
            idempotencyKey: 'lifecycle-1',
        })).toThrow('ownerId is server-derived');
    });
});
//# sourceMappingURL=listeningAuthoringContract.test.js.map