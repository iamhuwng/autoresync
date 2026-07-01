import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  LISTENING_AUTHORING_IDEMPOTENCY_SECRET_NAME,
  LISTENING_AUTHORING_OPERATION_TYPES,
  LISTENING_AUTHORING_OPERATION_TTL_MS,
  LISTENING_AUTHORING_PATHS,
  LISTENING_AUTHORING_RESTORE_IN_PROGRESS_FLAG_PATH,
  LISTENING_AUTHORING_SCHEMA_VERSION,
  LISTENING_AUTHORING_WRITES_ENABLED_FLAG_PATH,
} from './constants';
import { canonicalJson, hmacSha256Hex, requestHash } from './canonical';
import type {
  ListeningAuthoringDocumentV1,
  ListeningAuthoringOperationRecord,
  PublishListeningDraftRequest,
  SaveListeningDraftRequest,
  ListeningLifecycleRequest,
} from './contracts';
import type {
  CreateListeningPublishedVersionInput,
  ListeningPublishedVersionRecord,
} from './repository';
import {
  parseLifecycleRequest,
  parsePublishDraftRequest,
  parseSaveDraftRequest,
} from './validation';

const document: ListeningAuthoringDocumentV1 = {
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
  schemaVersion: 1 as const,
  recordType: 'published-version' as const,
  versionId: 'version-1',
  versionNumber: 1,
  testId: 'test-1',
  ownerId: 'teacher-1',
  document,
  assetIds: { 'asset-1': true as const },
  publishedAt: 1_700_000_000_000,
  publishedBy: 'teacher-1',
  publishOperationId: 'operation-publish-1',
  documentHash: 'document-hash-1',
  archive: { state: 'active' as const },
  compatibility: { frozenLegacyVersion1: true },
};

const createPublishedVersionCommon = {
  schemaVersion: 1 as const,
  recordType: 'published-version' as const,
  versionId: 'version-1',
  testId: 'test-1',
  ownerId: 'teacher-1',
  document,
  assetIds: { 'asset-1': true as const },
  publishedAt: 1_700_000_000_000,
  publishedBy: 'teacher-1',
  publishOperationId: 'operation-publish-1',
  documentHash: 'document-hash-1',
  archive: { state: 'active' as const },
  compatibility: { frozenLegacyVersion1: true },
};

const publishedFromDrafts: ListeningPublishedVersionRecord = {
  ...publishedVersionCommon,
  sourceDraftPath: 'drafts',
  sourceDraftId: 'draft-1',
};

const publishedFromRevisionDrafts: ListeningPublishedVersionRecord = {
  ...publishedVersionCommon,
  versionId: 'version-2',
  sourceDraftPath: 'revision_drafts',
  sourceDraftId: 'revision-1',
};

const publishedFromLegacyTests: ListeningPublishedVersionRecord = {
  ...publishedVersionCommon,
  versionId: 'version-3',
  sourceDraftPath: 'legacy_tests',
  sourceLegacyTestId: 'legacy-test-1',
};

const createFromDrafts: CreateListeningPublishedVersionInput = {
  ...createPublishedVersionCommon,
  sourceDraftPath: 'drafts',
  sourceDraftId: 'draft-1',
};

const createFromRevisionDrafts: CreateListeningPublishedVersionInput = {
  ...createPublishedVersionCommon,
  versionId: 'version-2',
  sourceDraftPath: 'revision_drafts',
  sourceDraftId: 'revision-1',
};

const createFromLegacyTests: CreateListeningPublishedVersionInput = {
  ...createPublishedVersionCommon,
  versionId: 'version-3',
  sourceDraftPath: 'legacy_tests',
  sourceLegacyTestId: 'legacy-test-1',
};

// @ts-expect-error drafts source requires sourceDraftId
const invalidMissingDraftSourceId: CreateListeningPublishedVersionInput = {
  ...createPublishedVersionCommon,
  versionId: 'version-4',
  sourceDraftPath: 'drafts',
};

// @ts-expect-error revision_drafts source requires sourceDraftId
const invalidMissingRevisionSourceId: CreateListeningPublishedVersionInput = {
  ...createPublishedVersionCommon,
  versionId: 'version-5',
  sourceDraftPath: 'revision_drafts',
};

// @ts-expect-error legacy_tests source requires sourceLegacyTestId
const invalidMissingLegacySourceId: CreateListeningPublishedVersionInput = {
  ...createPublishedVersionCommon,
  versionId: 'version-6',
  sourceDraftPath: 'legacy_tests',
};

// @ts-expect-error drafts source forbids sourceLegacyTestId
const invalidContradictoryDraftSource: CreateListeningPublishedVersionInput = {
  ...createPublishedVersionCommon,
  versionId: 'version-7',
  sourceDraftPath: 'drafts',
  sourceDraftId: 'draft-7',
  sourceLegacyTestId: 'legacy-test-7',
};

// @ts-expect-error legacy_tests source forbids sourceDraftId
const invalidContradictoryLegacySource: CreateListeningPublishedVersionInput = {
  ...createPublishedVersionCommon,
  versionId: 'version-8',
  sourceDraftPath: 'legacy_tests',
  sourceDraftId: 'draft-8',
  sourceLegacyTestId: 'legacy-test-8',
};

describe('Listening authoring B2 backend contract', () => {
  it('keeps exact constants, paths, names, and TTL', () => {
    expect(LISTENING_AUTHORING_SCHEMA_VERSION).toBe(1);
    expect(LISTENING_AUTHORING_PATHS).toEqual({
      drafts: 'listening_authoring/drafts',
      revisionDrafts: 'listening_authoring/revision_drafts',
      versions: 'listening_authoring/versions',
      operations: 'listening_authoring/operations',
    });
    expect(LISTENING_AUTHORING_OPERATION_TYPES).toEqual([
      'save-draft',
      'publish',
      'soft-delete',
      'restore',
      'archive',
      'discard',
    ]);
    expect(LISTENING_AUTHORING_OPERATION_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
    expect(LISTENING_AUTHORING_IDEMPOTENCY_SECRET_NAME).toBe('LISTENING_AUTHORING_IDEMPOTENCY_SECRET');
    expect(LISTENING_AUTHORING_WRITES_ENABLED_FLAG_PATH).toBe('system_flags/listening_authoring_writes_enabled');
    expect(LISTENING_AUTHORING_RESTORE_IN_PROGRESS_FLAG_PATH).toBe('system_flags/restore_in_progress');
  });

  it('canonicalizes json and hashes requests deterministically', () => {
    expect(canonicalJson({ b: 2, a: 1, omitted: undefined })).toBe('{"a":1,"b":2}');
    expect(canonicalJson({ nested: { z: null, a: ['x', 'y'] } })).toBe('{"nested":{"a":["x","y"],"z":null}}');
    expect(canonicalJson({ items: ['x', undefined, 'y'] })).toBe('{"items":["x",null,"y"]}');
    expect(requestHash({ b: 2, a: 1 })).toBe('43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777');
    expect(requestHash({ items: ['x', undefined, 'y'] })).toBe('d8a60c02d6c9c23bd58eccc5ccadee4a09013040900db93b8bfb85106f75b93b');
  });

  it('rejects non-JSON canonical inputs', () => {
    class CustomValue {
      value = 'custom';
    }

    expect(() => canonicalJson({ value: NaN })).toThrow();
    expect(() => canonicalJson({ value: Infinity })).toThrow();
    expect(() => canonicalJson({ value: -Infinity })).toThrow();
    expect(() => canonicalJson({ when: new Date('2026-06-27T00:00:00.000Z') })).toThrow();
    expect(() => canonicalJson({ custom: new CustomValue() })).toThrow();
  });

  it('uses exact composite HMAC payload for idempotency keys', () => {
    expect(hmacSha256Hex('secret', 'teacher-1:save-draft:draft-1:key-1')).toBe(
      'aa819243b9a5343f0398969f477a13abce81328eb123beb5b1c90d10bc5d19fd',
    );
  });

  it('keeps published-version source fields as exact discriminated unions and distributive create input', () => {
    expect(publishedFromDrafts.sourceDraftId).toBe('draft-1');
    expect(publishedFromRevisionDrafts.sourceDraftId).toBe('revision-1');
    expect(publishedFromLegacyTests.sourceLegacyTestId).toBe('legacy-test-1');

    expect(createFromDrafts.sourceDraftPath).toBe('drafts');
    expect(createFromRevisionDrafts.sourceDraftPath).toBe('revision_drafts');
    expect(createFromLegacyTests.sourceDraftPath).toBe('legacy_tests');

    expectTypeOf(publishedFromDrafts).toMatchTypeOf<ListeningPublishedVersionRecord>();
    expectTypeOf(publishedFromRevisionDrafts).toMatchTypeOf<ListeningPublishedVersionRecord>();
    expectTypeOf(publishedFromLegacyTests).toMatchTypeOf<ListeningPublishedVersionRecord>();
    expectTypeOf(createFromDrafts).toMatchTypeOf<CreateListeningPublishedVersionInput>();
    expectTypeOf(createFromRevisionDrafts).toMatchTypeOf<CreateListeningPublishedVersionInput>();
    expectTypeOf(createFromLegacyTests).toMatchTypeOf<CreateListeningPublishedVersionInput>();
  });

  it('defines exact operation record shape with target type completedAt and narrow terminal result only', () => {
    const record: ListeningAuthoringOperationRecord<{
      draftId?: string;
      versionId?: string;
      versionNumber?: number;
      conflictToken?: number;
    }> = {
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
      createdAt: 1_700_000_000_000,
      completedAt: 1_700_000_000_100,
      expiresAt: 1_700_000_000_100 + 30 * 24 * 60 * 60 * 1000,
    };

    expect(record).toEqual({
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
      createdAt: 1_700_000_000_000,
      completedAt: 1_700_000_000_100,
      expiresAt: 1_700_000_000_100 + 30 * 24 * 60 * 60 * 1000,
    });
    expect('updatedAt' in record).toBe(false);
    expect(JSON.stringify(record)).not.toContain('key-1');
  });

  it('parses save draft requests with default explicit trigger and optional autosave', () => {
    const parsedDefault = parseSaveDraftRequest({
      idempotencyKey: 'save-1',
      document,
    });

    const parsedAutosave = parseSaveDraftRequest({
      idempotencyKey: 'save-2',
      draftId: 'draft-2',
      expectedConflictToken: 3,
      trigger: 'autosave',
      document,
    });

    const expectedDefault: SaveListeningDraftRequest & { warnings: readonly string[] } = {
      idempotencyKey: 'save-1',
      document,
      trigger: 'explicit',
      warnings: [],
    };
    const expectedAutosave: SaveListeningDraftRequest & { warnings: readonly string[] } = {
      idempotencyKey: 'save-2',
      draftId: 'draft-2',
      expectedConflictToken: 3,
      trigger: 'autosave',
      document,
      warnings: [],
    };

    expect(parsedDefault).toEqual(expectedDefault);
    expect(parsedAutosave).toEqual(expectedAutosave);
  });

  it('rejects null metadata instead of replacing required B2 fields', () => {
    expect(() => parseSaveDraftRequest({
      idempotencyKey: 'save-4',
      document: {
        ...document,
        metadata: null,
      },
    })).toThrow(/document\.metadata/);
  });

  it('normalizes missing draft fields with warnings while still rejecting zero conflict tokens', () => {
    const missingDifficulty = { ...document } as Record<string, unknown>;
    delete missingDifficulty.difficulty;
    const missingAudioSection = { ...document.audioSections[0] } as Record<string, unknown>;
    delete missingAudioSection.name;
    const missingQuestion = { ...document.questions[0] } as Record<string, unknown>;
    delete missingQuestion.answer;
    const missingSettings = { ...document.settings } as Record<string, unknown>;
    delete missingSettings.allowPause;

    expect(parseSaveDraftRequest({
      idempotencyKey: 'missing-difficulty',
      document: missingDifficulty,
    })).toEqual(expect.objectContaining({
      warnings: ['document.difficulty is missing.'],
      document: expect.objectContaining({
        difficulty: 'Intermediate',
      }),
    }));
    expect(parseSaveDraftRequest({
      idempotencyKey: 'missing-instructions',
      document: {
        ...document,
        metadata: {
          description: document.metadata.description,
          tags: document.metadata.tags,
        },
      },
    })).toEqual(expect.objectContaining({
      warnings: ['document.metadata.instructions is missing.'],
      document: expect.objectContaining({
        metadata: expect.objectContaining({
          instructions: '',
        }),
      }),
    }));
    expect(parseSaveDraftRequest({
      idempotencyKey: 'missing-audio-name',
      document: {
        ...document,
        audioSections: [missingAudioSection],
      },
    })).toEqual(expect.objectContaining({
      warnings: ['document.audioSections[0].name is missing.'],
      document: expect.objectContaining({
        audioSections: [expect.objectContaining({ name: '' })],
      }),
    }));
    expect(parseSaveDraftRequest({
      idempotencyKey: 'missing-answer',
      document: {
        ...document,
        questions: [missingQuestion],
      },
    })).toEqual(expect.objectContaining({
      warnings: ['document.questions[0].answer is missing.'],
      document: expect.objectContaining({
        questions: [expect.objectContaining({ answer: '' })],
      }),
    }));
    expect(parseSaveDraftRequest({
      idempotencyKey: 'missing-setting',
      document: {
        ...document,
        settings: missingSettings,
      },
    })).toEqual(expect.objectContaining({
      warnings: ['document.settings.allowPause is missing.'],
      document: expect.objectContaining({
        settings: expect.objectContaining({ allowPause: true }),
      }),
    }));
    expect(() => parsePublishDraftRequest({
      draftId: 'draft-1',
      expectedConflictToken: 0,
      idempotencyKey: 'zero-publish-token',
    })).toThrow(/positive integer/);
    expect(() => parseLifecycleRequest({
      operation: 'restore',
      targetId: 'draft-1',
      expectedConflictToken: 0,
      idempotencyKey: 'zero-lifecycle-token',
    })).toThrow(/positive integer/);
  });

  it('rejects non-string optional draftId and reasonCode values', () => {
    expect(() => parseSaveDraftRequest({
      idempotencyKey: 'save-5',
      draftId: 123,
      document,
    })).toThrow();

    expect(() => parseLifecycleRequest({
      operation: 'discard',
      targetId: 'draft-1',
      idempotencyKey: 'lifecycle-2',
      reasonCode: 123,
    })).toThrow();
  });

  it('rejects invalid document enums and unapproved nested fields', () => {
    expect(() => parseSaveDraftRequest({
      idempotencyKey: 'save-enum-1',
      document: {
        ...document,
        type: 'single-select',
      },
    })).toThrow(/document\.type/);

    expect(() => parseSaveDraftRequest({
      idempotencyKey: 'save-enum-2',
      document: {
        ...document,
        displayMode: 'standard',
      },
    })).toThrow(/document\.displayMode/);

    expect(() => parseSaveDraftRequest({
      idempotencyKey: 'save-enum-3',
      document: {
        ...document,
        settings: {
          ...document.settings,
          showResults: 'later',
        },
      },
    })).toThrow(/showResults/);

    expect(() => parseSaveDraftRequest({
      idempotencyKey: 'save-enum-4',
      document: {
        ...document,
        audioSections: [{ number: 1, id: 'not-approved' }],
      },
    })).toThrow(/not an approved field/);
  });

  it('rejects non-record entries in audio sections and questions', () => {
    expect(() => parseSaveDraftRequest({
      idempotencyKey: 'save-6',
      document: {
        ...document,
        audioSections: ['bad'],
      },
    })).toThrow();

    expect(() => parseSaveDraftRequest({
      idempotencyKey: 'save-7',
      document: {
        ...document,
        questions: [null],
      },
    })).toThrow();
  });

  it('detaches parsed document data from caller input', () => {
    const originalMetadata = {
      description: 'maps',
      instructions: 'Answer every question.',
      tags: ['maps'],
    };
    const originalSettings = {
      allowPause: true,
      showTimer: true,
      shuffleQuestions: false,
      showResults: 'after-submission' as const,
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

    const parsed = parseSaveDraftRequest({
      idempotencyKey: 'save-8',
      document: {
        ...document,
        metadata: originalMetadata,
        settings: originalSettings,
        audioSections: originalAudioSections,
        questions: originalQuestions,
      },
    });

    originalMetadata.description = 'changed';
    originalMetadata.tags[0] = 'changed';
    originalSettings.allowReview = false;
    originalSettings.audioControls.showPlayPause = false;
    originalAudioSections[0].name = 'changed';
    originalQuestions[0].context.sectionHeading = 'changed';
    originalQuestions[0].context.contextLines[0] = 'changed';

    expect(parsed.document.metadata).toEqual({
      description: 'maps',
      instructions: 'Answer every question.',
      tags: ['maps'],
    });
    expect(parsed.document.settings).toEqual({
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
    expect(parsed.document.audioSections).toEqual([{
      number: 1,
      name: 'Section 1',
      assetId: 'asset-1',
      audioUrl: 'r2://asset-1',
      startQuestion: 1,
      endQuestion: 1,
    }]);
    expect(parsed.document.questions).toEqual([{
      number: 1,
      type: 'short-answer',
      question: 'Q1',
      answer: 'A',
      sectionNumber: 1,
      points: 1,
      context: { sectionHeading: 'A', contextLines: ['line 1'] },
    }]);
  });

  it('rejects nested non-JSON document values in metadata settings audio sections and questions', () => {
    class CustomValue {
      value = 'custom';
    }

    expect(() => parseSaveDraftRequest({
      idempotencyKey: 'save-9',
      document: {
        ...document,
        metadata: { description: 'maps', transcript: new Date('2026-06-27T00:00:00.000Z') },
      },
    })).toThrow();

    expect(() => parseSaveDraftRequest({
      idempotencyKey: 'save-10',
      document: {
        ...document,
        settings: { allowReview: true, audioControls: new CustomValue() },
      },
    })).toThrow();

    expect(() => parseSaveDraftRequest({
      idempotencyKey: 'save-11',
      document: {
        ...document,
        audioSections: [{ number: 1, audioUrl: new Date('2026-06-27T00:00:00.000Z') }],
      },
    })).toThrow();

    expect(() => parseSaveDraftRequest({
      idempotencyKey: 'save-12',
      document: {
        ...document,
        questions: [{ number: 1, context: new CustomValue() }],
      },
    })).toThrow();
  });

  it('rejects malformed top-level document containers instead of erasing them', () => {
    class CustomValue {
      value = 'custom';
    }

    expect(() => parseSaveDraftRequest({
      idempotencyKey: 'save-13',
      document: {
        ...document,
        metadata: new Date('2026-06-27T00:00:00.000Z'),
      },
    })).toThrow();

    expect(() => parseSaveDraftRequest({
      idempotencyKey: 'save-14',
      document: {
        ...document,
        settings: new CustomValue(),
      },
    })).toThrow();

    expect(() => parseSaveDraftRequest({
      idempotencyKey: 'save-15',
      document: {
        ...document,
        audioSections: new Date('2026-06-27T00:00:00.000Z'),
      },
    })).toThrow();

    expect(() => parseSaveDraftRequest({
      idempotencyKey: 'save-16',
      document: {
        ...document,
        questions: new CustomValue(),
      },
    })).toThrow();
  });

  it('rejects invalid save draft trigger values', () => {
    expect(() => parseSaveDraftRequest({
      idempotencyKey: 'save-3',
      trigger: 'manual',
      document,
    })).toThrow(/trigger must be explicit or autosave/);
  });

  it('rejects unknown top-level fields from save publish and lifecycle requests', () => {
    expect(() => parseSaveDraftRequest({
      idempotencyKey: 'save-extra',
      document,
      extraAuthority: true,
    })).toThrow(/save draft request\.extraAuthority/);

    expect(() => parsePublishDraftRequest({
      draftId: 'draft-1',
      expectedConflictToken: 7,
      idempotencyKey: 'publish-extra',
      extraAuthority: true,
    })).toThrow(/publish draft request\.extraAuthority/);

    expect(() => parsePublishDraftRequest({
      legacyTestId: 'legacy-test-1',
      idempotencyKey: 'legacy-extra',
      document,
    })).toThrow(/publish draft request\.document/);

    expect(() => parseLifecycleRequest({
      operation: 'restore',
      targetId: 'draft-1',
      idempotencyKey: 'lifecycle-extra',
      extraAuthority: true,
    })).toThrow(/lifecycle request\.extraAuthority/);
  });

  it('parses publish draft requests with retained pins', () => {
    const parsed = parsePublishDraftRequest({
      draftId: 'draft-1',
      expectedConflictToken: 7,
      idempotencyKey: 'publish-1',
      retainedPins: {
        intro: ['pin-a', 'pin-b'],
      },
    });

    const expected: PublishListeningDraftRequest = {
      draftId: 'draft-1',
      expectedConflictToken: 7,
      idempotencyKey: 'publish-1',
      retainedPins: {
        intro: ['pin-a', 'pin-b'],
      },
    };

    expect(parsed).toEqual(expected);
  });

  it('rejects malformed retained pins containers instead of erasing them', () => {
    class CustomValue {
      intro = ['pin-a'];
    }

    expect(() => parsePublishDraftRequest({
      draftId: 'draft-1',
      expectedConflictToken: 7,
      idempotencyKey: 'publish-2',
      retainedPins: new Date('2026-06-27T00:00:00.000Z'),
    })).toThrow();

    expect(() => parsePublishDraftRequest({
      draftId: 'draft-1',
      expectedConflictToken: 7,
      idempotencyKey: 'publish-3',
      retainedPins: new CustomValue(),
    })).toThrow();
  });

  it('parses lifecycle requests for allowed operations', () => {
    const parsed: ListeningLifecycleRequest = parseLifecycleRequest({
      operation: 'restore',
      targetId: 'draft-1',
      expectedConflictToken: 8,
      idempotencyKey: 'lifecycle-1',
      reasonCode: 'user-requested',
    });

    expect(parsed).toEqual({
      operation: 'restore',
      targetId: 'draft-1',
      expectedConflictToken: 8,
      idempotencyKey: 'lifecycle-1',
      reasonCode: 'user-requested',
    });
  });

  it('rejects browser-supplied ownerId from all request parsers', () => {
    expect(() => parseSaveDraftRequest({
      ownerId: 'teacher-1',
      idempotencyKey: 'save-1',
      document,
    })).toThrow('ownerId is server-derived');

    expect(() => parsePublishDraftRequest({
      ownerId: 'teacher-1',
      draftId: 'draft-1',
      expectedConflictToken: 1,
      idempotencyKey: 'publish-1',
    })).toThrow('ownerId is server-derived');

    expect(() => parseLifecycleRequest({
      ownerId: 'teacher-1',
      operation: 'soft-delete',
      targetId: 'draft-1',
      idempotencyKey: 'lifecycle-1',
    })).toThrow('ownerId is server-derived');
  });
});
