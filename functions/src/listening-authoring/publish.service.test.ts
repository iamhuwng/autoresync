import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ListeningAuthoringDocumentV1 } from './contracts';
import { hmacSha256Hex, requestHash } from './canonical';
import {
  createInMemoryListeningAuthoringRepository,
  type InMemoryListeningAuthoringRepository,
} from './repository';
import {
  type SaveListeningDraftCoreResult,
  mutateListeningAuthoringLifecycleCore,
  publishListeningDraftCore,
  saveListeningDraftCore,
} from './service';

const auth = { uid: 'teacher-1', role: 'teacher' as const };

afterEach(() => {
  vi.useRealTimers();
});

const completeDocument: ListeningAuthoringDocumentV1 = {
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

const createNow = (...values: number[]): (() => number) => {
  let index = 0;
  const last = values[values.length - 1] ?? 0;
  return () => {
    const current = values[index] ?? last;
    index += 1;
    return current;
  };
};

const createRepository = () =>
  createInMemoryListeningAuthoringRepository({
    now: createNow(1_700_000_000_000, 1_700_000_000_500),
  });

type SavedDraftResult = Extract<SaveListeningDraftCoreResult, { status: 'saved' }>;

const saveDraft = async (
  repo: InMemoryListeningAuthoringRepository,
  document: ListeningAuthoringDocumentV1 = completeDocument,
): Promise<SavedDraftResult> => {
  const result = await saveListeningDraftCore({
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

const expectedDraftId = `draft-${hmacSha256Hex(
  'secret',
  'teacher-1:save-draft:create:save',
).slice(0, 32)}`;

const expectedVersionId = `version-${hmacSha256Hex(
  'secret',
  `${auth.uid}:publish:${expectedDraftId}:version:publish`,
).slice(0, 32)}`;

describe('publishListeningDraftCore', () => {
  it('preserves the exact server legacy document when freezing version 1', async () => {
    const legacyDocument: ListeningAuthoringDocumentV1 = {
      ...completeDocument,
      title: '  Ready with intentional spacing  ',
      metadata: {
        ...completeDocument.metadata,
        description: '  Preserve this spacing.  ',
      },
    };
    const legacyTest = {
      id: 'legacy-test-exact-content',
      ownerId: auth.uid,
      createdAt: 1_600_000_000_000,
      createdBy: auth.uid,
      updatedAt: 1_600_000_000_500,
      isPublished: true,
      ...legacyDocument,
    };
    const repo = createInMemoryListeningAuthoringRepository({
      now: createNow(1_700_000_000_000),
      seed: { legacyTests: [legacyTest] },
    });

    const result = await publishListeningDraftCore({
      auth,
      body: {
        legacyTestId: legacyTest.id,
        idempotencyKey: 'preserve-exact-content',
      },
      repo,
      idempotencySecret: 'secret',
    });

    expect(result.status).toBe('published');
    if (result.status !== 'published') {
      throw new Error(`expected published legacy freeze, got ${result.status}`);
    }
    expect(repo.listVersions()[0]?.document).toEqual(legacyDocument);
    expect((await repo.getDraft(result.draftId))?.document).toEqual(legacyDocument);
    expect(await repo.getLegacyTest(legacyTest.id)).toEqual({
      ...legacyTest,
      authoringVersioning: expect.objectContaining({
        frozen: true,
        versionId: result.versionId,
      }),
    });
  });

  it('atomically freezes a server-loaded legacy test as version 1 and creates its revision draft', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
    const legacyTest = {
      id: 'legacy-test-1',
      ownerId: auth.uid,
      createdAt: 1_600_000_000_000,
      createdBy: auth.uid,
      updatedAt: 1_600_000_000_500,
      isPublished: true,
      ...completeDocument,
    };
    const repo = createInMemoryListeningAuthoringRepository({
      now: createNow(1_700_000_000_000),
      seed: {
        legacyTests: [legacyTest],
      },
    });

    const first = await publishListeningDraftCore({
      auth,
      body: {
        legacyTestId: legacyTest.id,
        idempotencyKey: 'legacy-first-edit',
      },
      repo,
      idempotencySecret: 'secret',
    });
    const retry = await publishListeningDraftCore({
      auth,
      body: {
        legacyTestId: legacyTest.id,
        idempotencyKey: 'legacy-first-edit',
      },
      repo,
      idempotencySecret: 'secret',
    });

    expect(first).toEqual({
      status: 'published',
      draftId: expect.stringMatching(/^draft-/),
      versionId: expect.stringMatching(/^version-/),
      versionNumber: 1,
      conflictToken: 1,
      warnings: [],
    });
    expect(retry).toEqual(first);
    if (first.status !== 'published') {
      throw new Error(`expected published legacy freeze, got ${first.status}`);
    }
    expect(repo.listVersions()).toEqual([
      expect.objectContaining({
        versionId: first.versionId,
        versionNumber: 1,
        testId: legacyTest.id,
        ownerId: auth.uid,
        sourceDraftPath: 'legacy_tests',
        sourceLegacyTestId: legacyTest.id,
        document: completeDocument,
        documentHash: requestHash(completeDocument),
        compatibility: {
          legacyTestPath: `tests/${legacyTest.id}`,
          frozenLegacyVersion1: true,
        },
      }),
    ]);
    expect(await repo.getDraft(first.draftId)).toEqual(expect.objectContaining({
      recordType: 'revision-draft',
      testId: legacyTest.id,
      ownerId: auth.uid,
      conflictToken: 1,
      createdFromVersionId: first.versionId,
      createdFromVersionNumber: 1,
      document: completeDocument,
    }));
    expect(await repo.getLegacyTest(legacyTest.id)).toEqual({
      ...legacyTest,
      authoringVersioning: {
        frozen: true,
        versionId: first.versionId,
        versionNumber: 1,
        frozenAt: 1_700_000_000_000,
        frozenBy: auth.uid,
        decisionRef: 'PRD-0055-PACKET-1J-B1-B2-APPROVAL-2026-06-20',
      },
    });
    expect(repo.listOperationClaims()).toEqual([
      expect.objectContaining({
        operationType: 'publish',
        targetType: 'legacy-test',
        targetId: legacyTest.id,
        status: 'succeeded',
      }),
    ]);
  });

  it('replays an existing legacy freeze under a new idempotency key without duplicates', async () => {
    const legacyTest = {
      id: 'legacy-test-retry',
      ownerId: auth.uid,
      createdAt: 1_600_000_000_000,
      createdBy: auth.uid,
      updatedAt: 1_600_000_000_500,
      isPublished: true,
      ...completeDocument,
    };
    const repo = createInMemoryListeningAuthoringRepository({
      now: createNow(1_700_000_000_000, 1_700_000_000_500),
      seed: { legacyTests: [legacyTest] },
    });

    const first = await publishListeningDraftCore({
      auth,
      body: { legacyTestId: legacyTest.id, idempotencyKey: 'first-key' },
      repo,
      idempotencySecret: 'secret',
    });
    const retry = await publishListeningDraftCore({
      auth,
      body: { legacyTestId: legacyTest.id, idempotencyKey: 'second-key' },
      repo,
      idempotencySecret: 'secret',
    });

    expect(retry).toEqual(first);
    if (first.status !== 'published') {
      throw new Error(`expected published legacy freeze, got ${first.status}`);
    }
    expect(repo.listVersions()).toHaveLength(1);
    expect(await repo.getDraft(first.draftId)).not.toBeNull();
    expect(repo.listOperationClaims()).toHaveLength(2);
  });

  it('hides another owner legacy test and writes no authoring records', async () => {
    const legacyTest = {
      id: 'legacy-test-other-owner',
      ownerId: 'teacher-2',
      createdAt: 1_600_000_000_000,
      createdBy: 'teacher-2',
      updatedAt: 1_600_000_000_500,
      isPublished: true,
      ...completeDocument,
    };
    const repo = createInMemoryListeningAuthoringRepository({
      now: createNow(1_700_000_000_000),
      seed: { legacyTests: [legacyTest] },
    });

    const result = await publishListeningDraftCore({
      auth,
      body: { legacyTestId: legacyTest.id, idempotencyKey: 'cross-owner' },
      repo,
      idempotencySecret: 'secret',
    });

    expect(result).toEqual({
      status: 'not-found',
      recoverable: false,
      draftId: legacyTest.id,
    });
    expect(repo.listVersions()).toEqual([]);
    expect(repo.listOperationClaims()).toEqual([]);
    expect(await repo.getLegacyTest(legacyTest.id)).toEqual(legacyTest);
  });

  it('creates one immutable version and advances the source draft token atomically', async () => {
    const repo = createRepository();
    const saved = await saveDraft(repo);

    const result = await publishListeningDraftCore({
      auth,
      body: {
        draftId: saved.draftId,
        expectedConflictToken: saved.conflictToken,
        idempotencyKey: 'publish',
      },
      repo,
      idempotencySecret: 'secret',
    });

    expect(result).toEqual({
      status: 'published',
      draftId: expectedDraftId,
      versionId: expectedVersionId,
      versionNumber: 1,
      conflictToken: 2,
      warnings: [],
    });
    expect(repo.listVersions()).toEqual([
      expect.objectContaining({
        versionId: expectedVersionId,
        versionNumber: 1,
        testId: expectedDraftId,
        ownerId: 'teacher-1',
        sourceDraftPath: 'drafts',
        sourceDraftId: expectedDraftId,
        publishOperationId: 'operation-2',
        documentHash: requestHash(completeDocument),
        archive: { state: 'active' },
        compatibility: { frozenLegacyVersion1: false },
      }),
    ]);
    expect(await repo.getDraft(expectedDraftId)).toEqual(
      expect.objectContaining({
        conflictToken: 2,
        latestPublishedVersionId: expectedVersionId,
        lastOperationId: 'operation-2',
      }),
    );
  });

  it('integrates create reload autosave conflict publish revision discard restore and archive', async () => {
    const repo = createRepository();
    const created = await saveDraft(repo);

    const reloaded = await repo.getDraft(created.draftId);
    expect(reloaded).toEqual(expect.objectContaining({
      draftId: created.draftId,
      conflictToken: created.conflictToken,
      document: completeDocument,
    }));

    const autosaved = await saveListeningDraftCore({
      auth,
      body: {
        draftId: created.draftId,
        expectedConflictToken: created.conflictToken,
        idempotencyKey: 'autosave',
        trigger: 'autosave',
        document: { ...completeDocument, title: 'Autosaved' },
      },
      repo,
      idempotencySecret: 'secret',
    });
    expect(autosaved).toEqual(expect.objectContaining({
      status: 'saved',
      draftId: created.draftId,
      conflictToken: 2,
    }));
    if (autosaved.status !== 'saved') {
      throw new Error(`expected autosaved draft, got ${autosaved.status}`);
    }

    const stale = await saveListeningDraftCore({
      auth,
      body: {
        draftId: created.draftId,
        expectedConflictToken: created.conflictToken,
        idempotencyKey: 'stale-save',
        document: { ...completeDocument, title: 'Stale edit' },
      },
      repo,
      idempotencySecret: 'secret',
    });
    expect(stale).toEqual(expect.objectContaining({
      status: 'conflict',
      currentConflictToken: autosaved.conflictToken,
    }));

    const firstPublished = await publishListeningDraftCore({
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

    const revision = await saveListeningDraftCore({
      auth,
      body: {
        draftId: created.draftId,
        expectedConflictToken: firstPublished.conflictToken,
        idempotencyKey: 'save-revision',
        document: { ...completeDocument, title: 'Revision' },
      },
      repo,
      idempotencySecret: 'secret',
    });
    if (revision.status !== 'saved') {
      throw new Error(`expected revision save, got ${revision.status}`);
    }

    const secondPublished = await publishListeningDraftCore({
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

    const discarded = await mutateListeningAuthoringLifecycleCore({
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
    expect(discarded).toEqual(expect.objectContaining({ status: 'discarded' }));
    if (discarded.status !== 'discarded') {
      throw new Error(`expected discard, got ${discarded.status}`);
    }

    const restored = await mutateListeningAuthoringLifecycleCore({
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
    expect(restored).toEqual(expect.objectContaining({ status: 'restored' }));

    const archived = await mutateListeningAuthoringLifecycleCore({
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

    expect(archived).toEqual({
      status: 'archived',
      versionId: secondPublished.versionId,
      versionNumber: 2,
    });
    expect(repo.listVersions()).toHaveLength(2);
    expect(repo.listVersions().map((version) => version.document.title)).toEqual([
      'Autosaved',
      'Revision',
    ]);
    expect(await repo.getDraft(created.draftId)).toEqual(expect.objectContaining({
      state: 'active',
      conflictToken: expect.any(Number),
      latestPublishedVersionId: secondPublished.versionId,
    }));
  });

  it('returns same published version on exact idempotent retry without creating another version', async () => {
    const repo = createRepository();
    const saved = await saveDraft(repo);

    const first = await publishListeningDraftCore({
      auth,
      body: {
        draftId: saved.draftId,
        expectedConflictToken: saved.conflictToken,
        idempotencyKey: 'publish',
      },
      repo,
      idempotencySecret: 'secret',
    });
    const retry = await publishListeningDraftCore({
      auth,
      body: {
        draftId: saved.draftId,
        expectedConflictToken: saved.conflictToken,
        idempotencyKey: 'publish',
      },
      repo,
      idempotencySecret: 'secret',
    });

    expect(retry).toEqual(first);
    expect(repo.listVersions()).toHaveLength(1);
  });

  it('blocks publish when an audio section lacks canonical assetId and writes no version', async () => {
    const repo = createRepository();
    const saved = await saveDraft(repo, {
      ...completeDocument,
      audioSections: [{
        number: 1,
        name: 'Section 1',
        audioUrl: 'https://example.test/temp.mp3',
        startQuestion: 1,
        endQuestion: 1,
      }],
    });

    const result = await publishListeningDraftCore({
      auth,
      body: {
        draftId: saved.draftId,
        expectedConflictToken: saved.conflictToken,
        idempotencyKey: 'publish',
      },
      repo,
      idempotencySecret: 'secret',
    });

    expect(result).toEqual({
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
    expect(repo.listVersions()).toEqual([]);
    expect((await repo.getDraft(expectedDraftId))?.conflictToken).toBe(1);
  });

  it('publishes image-mode drafts when blank question prompts are covered by question images', async () => {
    const repo = createRepository();
    const saved = await saveDraft(repo, {
      ...completeDocument,
      questionCount: 2,
      displayMode: 'image',
      questionImages: [{
        sectionNumber: 1,
        imageUrl: 'https://cdn.example.com/listening-page.png',
        questionRange: { start: 1, end: 2 },
      }],
      audioSections: [{
        ...completeDocument.audioSections[0],
        endQuestion: 2,
      }],
      questions: [
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
      ],
    });

    const result = await publishListeningDraftCore({
      auth,
      body: {
        draftId: saved.draftId,
        expectedConflictToken: saved.conflictToken,
        idempotencyKey: 'publish',
      },
      repo,
      idempotencySecret: 'secret',
    });

    expect(result).toEqual({
      status: 'published',
      draftId: expectedDraftId,
      versionId: expectedVersionId,
      versionNumber: 1,
      conflictToken: 2,
      warnings: [],
    });
    expect(repo.listVersions()[0].document.questionImages).toEqual([{
      sectionNumber: 1,
      imageUrl: 'https://cdn.example.com/listening-page.png',
      questionRange: { start: 1, end: 2 },
    }]);
  });

  it.each([
    [
      'missing audio',
      { ...completeDocument, audioSections: [] },
      {
        field: 'audioSections',
        severity: 'blocker',
        guidance: 'Publish requires at least one audio section.',
      },
    ],
    [
      'empty questions',
      { ...completeDocument, questionCount: 0, questions: [] },
      {
        field: 'questions',
        severity: 'blocker',
        guidance: 'Publish requires at least one question.',
      },
    ],
    [
      'question count mismatch',
      { ...completeDocument, questionCount: 2 },
      {
        field: 'questionCount',
        severity: 'blocker',
        guidance: 'Publish requires questionCount to match the saved questions.',
      },
    ],
  ])('blocks publish for %s', async (_label, incompleteDocument, blocker) => {
    const repo = createRepository();
    const saved = await saveDraft(repo, incompleteDocument as ListeningAuthoringDocumentV1);

    const result = await publishListeningDraftCore({
      auth,
      body: {
        draftId: saved.draftId,
        expectedConflictToken: saved.conflictToken,
        idempotencyKey: 'publish',
      },
      repo,
      idempotencySecret: 'secret',
    });

    expect(result).toEqual({
      status: 'blocked',
      draftId: expectedDraftId,
      conflictToken: 1,
      blockers: [blocker],
      warnings: [],
    });
    expect(repo.listVersions()).toEqual([]);
  });

  it.each([
    ['blank string answer', ''],
    ['whitespace string answer', '   '],
    ['empty answer list', []],
    ['answer list with blank value', ['A', '  ']],
    ['empty answer map', {}],
    ['answer map with blank value', { first: 'A', second: ' ' }],
  ])('blocks publish for %s', async (_label, answer) => {
    const repo = createRepository();
    const saved = await saveDraft(repo, {
      ...completeDocument,
      questions: [{
        ...completeDocument.questions[0]!,
        answer,
      }],
    } as ListeningAuthoringDocumentV1);

    const result = await publishListeningDraftCore({
      auth,
      body: {
        draftId: saved.draftId,
        expectedConflictToken: saved.conflictToken,
        idempotencyKey: 'publish',
      },
      repo,
      idempotencySecret: 'secret',
    });

    expect(result).toEqual({
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
    expect(repo.listVersions()).toEqual([]);
  });

  it('blocks publish when a question has no student-visible prompt', async () => {
    const repo = createRepository();
    const saved = await saveDraft(repo, {
      ...completeDocument,
      questions: [{
        ...completeDocument.questions[0]!,
        question: '   ',
      }],
    });

    const result = await publishListeningDraftCore({
      auth,
      body: {
        draftId: saved.draftId,
        expectedConflictToken: saved.conflictToken,
        idempotencyKey: 'publish',
      },
      repo,
      idempotencySecret: 'secret',
    });

    expect(result).toEqual({
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
    expect(repo.listVersions()).toEqual([]);
  });

  it('chains revision-draft publishes to the latest immutable version', async () => {
    const legacyTest = {
      id: 'legacy-test-lineage',
      ownerId: auth.uid,
      createdAt: 1_600_000_000_000,
      createdBy: auth.uid,
      updatedAt: 1_600_000_000_500,
      isPublished: true,
      ...completeDocument,
    };
    const repo = createInMemoryListeningAuthoringRepository({
      now: createNow(
        1_700_000_000_000,
        1_700_000_000_500,
        1_700_000_001_000,
        1_700_000_001_500,
        1_700_000_002_000,
      ),
      seed: { legacyTests: [legacyTest] },
    });

    const frozen = await publishListeningDraftCore({
      auth,
      body: {
        legacyTestId: legacyTest.id,
        idempotencyKey: 'freeze-legacy',
      },
      repo,
      idempotencySecret: 'secret',
    });
    expect(frozen.status).toBe('published');
    if (frozen.status !== 'published') {
      throw new Error(`expected legacy freeze publish, got ${frozen.status}`);
    }

    const firstRevisionPublish = await publishListeningDraftCore({
      auth,
      body: {
        draftId: frozen.draftId,
        expectedConflictToken: frozen.conflictToken,
        idempotencyKey: 'publish-revision-1',
      },
      repo,
      idempotencySecret: 'secret',
    });
    expect(firstRevisionPublish.status).toBe('published');
    if (firstRevisionPublish.status !== 'published') {
      throw new Error(`expected first revision publish, got ${firstRevisionPublish.status}`);
    }

    const savedSecondRevision = await saveListeningDraftCore({
      auth,
      body: {
        draftId: frozen.draftId,
        expectedConflictToken: firstRevisionPublish.conflictToken,
        idempotencyKey: 'save-revision-2',
        document: {
          ...completeDocument,
          title: 'Ready revision 2',
        },
      },
      repo,
      idempotencySecret: 'secret',
    });
    expect(savedSecondRevision.status).toBe('saved');
    if (savedSecondRevision.status !== 'saved') {
      throw new Error(`expected second revision save, got ${savedSecondRevision.status}`);
    }

    const secondRevisionPublish = await publishListeningDraftCore({
      auth,
      body: {
        draftId: frozen.draftId,
        expectedConflictToken: savedSecondRevision.conflictToken,
        idempotencyKey: 'publish-revision-2',
      },
      repo,
      idempotencySecret: 'secret',
    });
    expect(secondRevisionPublish.status).toBe('published');
    if (secondRevisionPublish.status !== 'published') {
      throw new Error(`expected second revision publish, got ${secondRevisionPublish.status}`);
    }

    const versions = [...repo.listVersions()]
      .sort((left, right) => left.versionNumber - right.versionNumber);
    expect(versions).toHaveLength(3);
    expect(versions[0]).toEqual(expect.objectContaining({
      versionNumber: 1,
      sourceDraftPath: 'legacy_tests',
    }));
    expect(versions[0]).not.toHaveProperty('previousVersionId');
    expect(versions[1]).toEqual(expect.objectContaining({
      versionNumber: 2,
      previousVersionId: versions[0]!.versionId,
      sourceDraftPath: 'revision_drafts',
    }));
    expect(versions[2]).toEqual(expect.objectContaining({
      versionNumber: 3,
      previousVersionId: versions[1]!.versionId,
      sourceDraftPath: 'revision_drafts',
    }));
  });

  it('rejects stale tokens and changed idempotent payloads without another version', async () => {
    const repo = createRepository();
    const saved = await saveDraft(repo);

    const stale = await publishListeningDraftCore({
      auth,
      body: {
        draftId: saved.draftId,
        expectedConflictToken: 2,
        idempotencyKey: 'publish-stale',
      },
      repo,
      idempotencySecret: 'secret',
    });
    const first = await publishListeningDraftCore({
      auth,
      body: {
        draftId: saved.draftId,
        expectedConflictToken: saved.conflictToken,
        idempotencyKey: 'publish',
      },
      repo,
      idempotencySecret: 'secret',
    });
    const changed = await publishListeningDraftCore({
      auth,
      body: {
        draftId: saved.draftId,
        expectedConflictToken: 999,
        idempotencyKey: 'publish',
      },
      repo,
      idempotencySecret: 'secret',
    });

    expect(stale).toEqual({
      status: 'conflict',
      recoverable: true,
      draftId: expectedDraftId,
      expectedConflictToken: 2,
      currentConflictToken: 1,
    });
    expect(first.status).toBe('published');
    expect(changed).toEqual({
      status: 'idempotency-conflict',
      recoverable: false,
      draftId: expectedDraftId,
      operationId: 'operation-3',
    });
    expect(repo.listVersions()).toHaveLength(1);
  });
});
