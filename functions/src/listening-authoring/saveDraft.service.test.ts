import { describe, expect, it } from 'vitest';

import type { ListeningAuthoringDocumentV1 } from './contracts';
import { hmacSha256Hex, requestHash } from './canonical';
import { createInMemoryListeningAuthoringRepository } from './repository';
import { saveListeningDraftCore } from './service';
import type { ListeningDraftRecord } from './repository';

const baseDocument: ListeningAuthoringDocumentV1 = {
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
    description: 'Draft description',
    instructions: 'Answer every question.',
    tags: [],
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
      question: 'Q1',
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

const createNow = (...values: number[]): (() => number) => {
  let index = 0;
  const last = values[values.length - 1] ?? 0;
  return () => {
    const current = values[index] ?? last;
    index += 1;
    return current;
  };
};

const createDraftRecord = (
  overrides: Partial<ListeningDraftRecord> = {},
): ListeningDraftRecord => ({
  schemaVersion: 1,
  recordType: 'draft',
  draftId: 'draft-existing',
  testId: 'test-existing',
  ownerId: 'teacher-1',
  state: 'active',
  conflictToken: 4,
  latestPublishedVersionId: 'version-1',
  document: {
    ...baseDocument,
    title: 'Seed draft',
  },
  assetIds: {
    'asset-1': true,
    'asset-2': true,
  },
  createdAt: 1_700_000_000_000,
  createdBy: 'teacher-1',
  updatedAt: 1_700_000_000_100,
  updatedBy: 'teacher-1',
  lastOperationId: 'operation-seed',
  ...overrides,
});

describe('saveListeningDraftCore', () => {
  it('persists incomplete teacher work as a draft with warnings instead of publish blockers', async () => {
    const repo = createInMemoryListeningAuthoringRepository({
      now: createNow(1_700_000_000_000),
    });

    const result = await saveListeningDraftCore({
      auth: {
        uid: 'teacher-1',
        role: 'teacher' as const,
      },
      body: {
        idempotencyKey: 'save-incomplete-draft',
        document: {
          title: 'Incomplete WIP',
          type: 'IELTS',
          skill: 'Listening',
          duration: 0,
          difficulty: 'Intermediate',
          questionCount: 1,
          isPublic: false,
          isComplete: false,
          displayMode: 'text',
          metadata: {
            tags: [],
          },
          questions: [{
            number: 1,
            type: 'short-answer',
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
        },
      },
      repo,
      idempotencySecret: 'test-secret',
    });

    expect(result).toEqual({
      status: 'saved',
      draftId: `draft-${hmacSha256Hex(
        'test-secret',
        'teacher-1:save-draft:create:save-incomplete-draft',
      ).slice(0, 32)}`,
      conflictToken: 1,
      warnings: expect.arrayContaining([
        'document.metadata.description is missing.',
        'document.metadata.instructions is missing.',
        'document.audioSections is missing.',
        'document.questions[0].question is missing.',
        'document.questions[0].answer is missing.',
      ]),
      blockers: [],
    });
    expect(result.status === 'saved' ? result.warnings : []).toHaveLength(5);

    const draft = result.status === 'saved' ? await repo.getDraft(result.draftId) : null;
    expect(draft).toEqual(expect.objectContaining({
      state: 'active',
      document: expect.objectContaining({
        title: 'Incomplete WIP',
        isComplete: false,
        metadata: {
          description: '',
          instructions: '',
          tags: [],
        },
        audioSections: [],
        questions: [expect.objectContaining({
          question: '',
          answer: '',
        })],
      }),
      assetIds: {},
    }));
  });

  it('warns when draft audio or question arrays are intentionally empty', async () => {
    const repo = createInMemoryListeningAuthoringRepository({
      now: createNow(1_700_000_000_000),
    });

    const result = await saveListeningDraftCore({
      auth: {
        uid: 'teacher-1',
        role: 'teacher' as const,
      },
      body: {
        idempotencyKey: 'save-empty-draft-arrays',
        document: {
          ...baseDocument,
          questionCount: 0,
          isComplete: false,
          audioSections: [],
          questions: [],
        },
      },
      repo,
      idempotencySecret: 'test-secret',
    });

    expect(result).toEqual(expect.objectContaining({
      status: 'saved',
      warnings: [
        'document.audioSections is empty.',
        'document.questions is empty.',
      ],
      blockers: [],
    }));
  });

  it('creates first draft once, stores exact atomic operation result, and exact retry returns same narrow response', async () => {
    const repo = createInMemoryListeningAuthoringRepository({
      now: createNow(1_700_000_000_000),
    });

    const input = {
      auth: {
        uid: 'teacher-1',
        role: 'teacher' as const,
      },
      body: {
        idempotencyKey: 'save-key-1',
        document: baseDocument,
      },
      repo,
      idempotencySecret: 'test-secret',
    };

    const first = await saveListeningDraftCore(input);
    const retry = await saveListeningDraftCore(input);

    const expectedDraftId = `draft-${hmacSha256Hex(
      'test-secret',
      'teacher-1:save-draft:create:save-key-1',
    ).slice(0, 32)}`;

    expect(first).toEqual({
      status: 'saved',
      draftId: expectedDraftId,
      conflictToken: 1,
      warnings: [],
      blockers: [],
    });
    expect(retry).toEqual(first);

    expect(await repo.getDraft(expectedDraftId)).toEqual({
      schemaVersion: 1,
      recordType: 'draft',
      draftId: expectedDraftId,
      testId: expectedDraftId,
      ownerId: 'teacher-1',
      state: 'active',
      conflictToken: 1,
      document: baseDocument,
      assetIds: {
        'asset-1': true,
        'asset-2': true,
      },
      createdAt: 1_700_000_000_000,
      createdBy: 'teacher-1',
      updatedAt: 1_700_000_000_000,
      updatedBy: 'teacher-1',
      lastOperationId: 'operation-1',
    });
    expect(repo.listOperationClaims()).toEqual([
      {
        schemaVersion: 1,
        operationId: 'operation-1',
        operationType: 'save-draft',
        targetType: 'draft',
        ownerId: 'teacher-1',
        targetId: expectedDraftId,
        idempotencyKeyHash: hmacSha256Hex(
          'test-secret',
          'teacher-1:save-draft:draft-' +
            hmacSha256Hex('test-secret', 'teacher-1:save-draft:create:save-key-1').slice(0, 32) +
            ':save-key-1',
        ),
        requestHash: expect.any(String),
        status: 'succeeded',
        result: {
          draftId: expectedDraftId,
          conflictToken: 1,
        },
        createdAt: 1_700_000_000_000,
        completedAt: 1_700_000_000_000,
        expiresAt: 1_700_000_000_000 + 30 * 24 * 60 * 60 * 1000,
      },
    ]);
    expect(repo.listVersions()).toEqual([]);
    expect(JSON.stringify(repo.listOperationClaims())).not.toContain('save-key-1');
  });

  it('fails closed on same create scope with changed request and preserves original draft', async () => {
    const repo = createInMemoryListeningAuthoringRepository({
      now: createNow(1_700_000_000_000),
    });

    await saveListeningDraftCore({
      auth: {
        uid: 'teacher-1',
        role: 'teacher',
      },
      body: {
        idempotencyKey: 'save-key-1',
        document: baseDocument,
      },
      repo,
      idempotencySecret: 'test-secret',
    });

    const changed = await saveListeningDraftCore({
      auth: {
        uid: 'teacher-1',
        role: 'teacher',
      },
      body: {
        idempotencyKey: 'save-key-1',
        document: {
          ...baseDocument,
          title: 'Changed title',
        },
      },
      repo,
      idempotencySecret: 'test-secret',
    });

    const expectedDraftId = `draft-${hmacSha256Hex(
      'test-secret',
      'teacher-1:save-draft:create:save-key-1',
    ).slice(0, 32)}`;

    expect(changed).toEqual({
      status: 'idempotency-conflict',
      recoverable: false,
      draftId: expectedDraftId,
      operationId: 'operation-1',
    });
    expect((await repo.getDraft(expectedDraftId))?.document.title).toBe('Listening draft');
    expect(repo.listVersions()).toEqual([]);
  });

  it('request draftId on missing draft fails closed and does not create', async () => {
    const repo = createInMemoryListeningAuthoringRepository({
      now: createNow(1_700_000_000_000),
    });

    const result = await saveListeningDraftCore({
      auth: {
        uid: 'teacher-1',
        role: 'teacher',
      },
      body: {
        draftId: 'draft-missing',
        expectedConflictToken: 1,
        idempotencyKey: 'save-key-missing',
        document: baseDocument,
      },
      repo,
      idempotencySecret: 'test-secret',
    });

    expect(result).toEqual({
      status: 'not-found',
      recoverable: false,
      draftId: 'draft-missing',
    });
    expect(await repo.getDraft('draft-missing')).toBeNull();
    expect(repo.listOperationClaims()).toEqual([]);
  });

  it('updates owned draft once, returns exact conflict details for missing and stale tokens, and stores narrow operation result only', async () => {
    const repo = createInMemoryListeningAuthoringRepository({
      now: createNow(1_700_000_001_100),
      seed: {
        drafts: [createDraftRecord()],
      },
    });

    const missingToken = await saveListeningDraftCore({
      auth: {
        uid: 'teacher-1',
        role: 'teacher',
      },
      body: {
        draftId: 'draft-existing',
        idempotencyKey: 'update-key-missing',
        document: {
          ...baseDocument,
          title: 'Missing token attempt',
        },
      },
      repo,
      idempotencySecret: 'test-secret',
    });

    const staleToken = await saveListeningDraftCore({
      auth: {
        uid: 'teacher-1',
        role: 'teacher',
      },
      body: {
        draftId: 'draft-existing',
        expectedConflictToken: 3,
        idempotencyKey: 'update-key-stale',
        document: {
          ...baseDocument,
          title: 'Stale token attempt',
        },
      },
      repo,
      idempotencySecret: 'test-secret',
    });

    const saved = await saveListeningDraftCore({
      auth: {
        uid: 'teacher-1',
        role: 'teacher',
      },
      body: {
        draftId: 'draft-existing',
        expectedConflictToken: 4,
        idempotencyKey: 'update-key-ok',
        document: {
          ...baseDocument,
          title: 'Updated draft',
        },
      },
      repo,
      idempotencySecret: 'test-secret',
    });

    expect(missingToken).toEqual({
      status: 'conflict',
      recoverable: true,
      draftId: 'draft-existing',
      expectedConflictToken: undefined,
      currentConflictToken: 4,
    });
    expect(staleToken).toEqual({
      status: 'conflict',
      recoverable: true,
      draftId: 'draft-existing',
      expectedConflictToken: 3,
      currentConflictToken: 4,
    });
    expect(saved).toEqual({
      status: 'saved',
      draftId: 'draft-existing',
      conflictToken: 5,
      warnings: [],
      blockers: [],
    });

    expect(await repo.getDraft('draft-existing')).toEqual({
      ...createDraftRecord(),
      conflictToken: 5,
      document: {
        ...baseDocument,
        title: 'Updated draft',
      },
      updatedAt: 1_700_000_001_100,
      updatedBy: 'teacher-1',
      lastOperationId: 'operation-3',
    });
    expect(repo.listOperationClaims()).toContainEqual({
      schemaVersion: 1,
      operationId: 'operation-3',
      operationType: 'save-draft',
      targetType: 'draft',
      ownerId: 'teacher-1',
      targetId: 'draft-existing',
      idempotencyKeyHash: hmacSha256Hex(
        'test-secret',
        'teacher-1:save-draft:draft-existing:update-key-ok',
      ),
      requestHash: expect.any(String),
      expectedConflictToken: 4,
      status: 'succeeded',
      result: {
        draftId: 'draft-existing',
        conflictToken: 5,
      },
      createdAt: 1_700_000_001_100,
      completedAt: 1_700_000_001_100,
      expiresAt: 1_700_000_001_100 + 30 * 24 * 60 * 60 * 1000,
    });
    expect(JSON.stringify(repo.listOperationClaims())).not.toContain('Updated draft');
    expect(repo.listVersions()).toEqual([]);
  });

  it('does not reactivate soft-deleted drafts, replays failed conflict exactly, and changed request is denied on same scope', async () => {
    const repo = createInMemoryListeningAuthoringRepository({
      now: createNow(1_700_000_000_700),
      seed: {
        drafts: [
          createDraftRecord({
            draftId: 'draft-soft',
            state: 'soft-deleted',
            conflictToken: 9,
            document: {
              ...baseDocument,
              title: 'Soft deleted seed',
            },
          }),
        ],
      },
    });

    const first = await saveListeningDraftCore({
      auth: {
        uid: 'teacher-1',
        role: 'teacher',
      },
      body: {
        draftId: 'draft-soft',
        expectedConflictToken: 9,
        idempotencyKey: 'soft-key-1',
        document: {
          ...baseDocument,
          title: 'Should not restore',
        },
      },
      repo,
      idempotencySecret: 'test-secret',
    });
    const replay = await saveListeningDraftCore({
      auth: {
        uid: 'teacher-1',
        role: 'teacher',
      },
      body: {
        draftId: 'draft-soft',
        expectedConflictToken: 9,
        idempotencyKey: 'soft-key-1',
        document: {
          ...baseDocument,
          title: 'Should not restore',
        },
      },
      repo,
      idempotencySecret: 'test-secret',
    });
    const changed = await saveListeningDraftCore({
      auth: {
        uid: 'teacher-1',
        role: 'teacher',
      },
      body: {
        draftId: 'draft-soft',
        expectedConflictToken: 9,
        idempotencyKey: 'soft-key-1',
        document: {
          ...baseDocument,
          title: 'Changed payload',
        },
      },
      repo,
      idempotencySecret: 'test-secret',
    });

    expect(first).toEqual({
      status: 'conflict',
      recoverable: true,
      draftId: 'draft-soft',
      expectedConflictToken: 9,
      currentConflictToken: 9,
    });
    expect(replay).toEqual(first);
    expect(changed).toEqual({
      status: 'idempotency-conflict',
      recoverable: false,
      draftId: 'draft-soft',
      operationId: 'operation-1',
    });
    expect(await repo.getDraft('draft-soft')).toEqual(
      createDraftRecord({
        draftId: 'draft-soft',
        state: 'soft-deleted',
        conflictToken: 9,
        document: {
          ...baseDocument,
          title: 'Soft deleted seed',
        },
      }),
    );
    expect(repo.listOperationClaims()).toEqual([
      {
        schemaVersion: 1,
        operationId: 'operation-1',
        operationType: 'save-draft',
        targetType: 'draft',
        ownerId: 'teacher-1',
        targetId: 'draft-soft',
        idempotencyKeyHash: hmacSha256Hex(
          'test-secret',
          'teacher-1:save-draft:draft-soft:soft-key-1',
        ),
        requestHash: expect.any(String),
        expectedConflictToken: 9,
        status: 'failed',
        result: {
          draftId: 'draft-soft',
          conflictToken: 9,
        },
        errorCode: 'invalid-state',
        createdAt: 1_700_000_000_700,
        completedAt: 1_700_000_000_700,
        expiresAt: 1_700_000_000_700 + 30 * 24 * 60 * 60 * 1000,
      },
    ]);
  });

  it('fails closed for cross-owner update without mutation or ownership disclosure', async () => {
    const repo = createInMemoryListeningAuthoringRepository({
      now: createNow(1_700_000_000_000),
      seed: {
        drafts: [createDraftRecord()],
      },
    });

    const result = await saveListeningDraftCore({
      auth: {
        uid: 'teacher-2',
        role: 'teacher',
      },
      body: {
        draftId: 'draft-existing',
        expectedConflictToken: 4,
        idempotencyKey: 'cross-owner-key',
        document: {
          ...baseDocument,
          title: 'Forbidden update',
        },
      },
      repo,
      idempotencySecret: 'test-secret',
    });

    expect(result).toEqual({
      status: 'not-found',
      recoverable: false,
      draftId: 'draft-existing',
    });
    expect(await repo.getDraft('draft-existing')).toEqual(createDraftRecord());
    expect(repo.listOperationClaims()).toEqual([]);
    expect(repo.listVersions()).toEqual([]);
  });

  it('fails closed on malformed stored operation replay', async () => {
    const badRequestHash = requestHash({
      ownerId: 'teacher-1',
      operationType: 'save-draft',
      targetId: 'draft-bad',
      expectedConflictToken: 1,
      document: baseDocument,
      trigger: 'explicit',
    });

    const repo = createInMemoryListeningAuthoringRepository({
      now: createNow(1_700_000_000_000),
      seed: {
        operations: [
          {
            schemaVersion: 1,
            operationId: 'operation-bad',
            operationType: 'save-draft',
            targetType: 'draft',
            ownerId: 'teacher-1',
            targetId: 'draft-bad',
            idempotencyKeyHash: hmacSha256Hex(
              'test-secret',
              'teacher-1:save-draft:draft-bad:bad-key',
            ),
            requestHash: badRequestHash,
            expectedConflictToken: 1,
            status: 'failed',
            result: {
              draftId: 'draft-bad',
            },
            errorCode: 'conflict',
            createdAt: 1_700_000_000_000,
            completedAt: 1_700_000_000_000,
            expiresAt: 1_700_000_000_000 + 30 * 24 * 60 * 60 * 1000,
          },
        ],
      },
    });

    await expect(
      saveListeningDraftCore({
        auth: {
          uid: 'teacher-1',
          role: 'teacher',
        },
        body: {
          draftId: 'draft-bad',
          expectedConflictToken: 1,
          idempotencyKey: 'bad-key',
          document: baseDocument,
        },
        repo,
        idempotencySecret: 'test-secret',
      }),
    ).rejects.toThrow(/incomplete|malformed/i);
  });

  it('rejects browser ownerId before mutation', async () => {
    const repo = createInMemoryListeningAuthoringRepository({
      now: createNow(1_700_000_000_000),
    });

    await expect(
      saveListeningDraftCore({
        auth: {
          uid: 'teacher-1',
          role: 'teacher',
        },
        body: {
          ownerId: 'teacher-2',
          idempotencyKey: 'save-key-1',
          document: baseDocument,
        },
        repo,
        idempotencySecret: 'test-secret',
      }),
    ).rejects.toThrow('ownerId is server-derived');

    expect(repo.listOperationClaims()).toEqual([]);
    expect(repo.listVersions()).toEqual([]);
  });
});
