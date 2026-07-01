import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { requestHash } from './canonical';
import { LISTENING_AUTHORING_OPERATION_TTL_MS } from './constants';
import type { ListeningAuthoringDocumentV1 } from './contracts';
import type {
  ClaimOperationInput,
  CreateListeningPublishedVersionInput,
  LegacyListeningTestRecord,
  ListeningDraftRecord,
  ListeningPublishedVersionRecord,
  ListeningRevisionDraftRecord,
} from './repository';
import {
  createFirebaseListeningAuthoringRepository,
  createInMemoryListeningAuthoringRepository,
} from './repository';

type DraftBackedPublishedVersionRecord = Extract<
  ListeningPublishedVersionRecord,
  { sourceDraftId: string }
>;
type DraftBackedCreateListeningPublishedVersionInput = Extract<
  CreateListeningPublishedVersionInput,
  { sourceDraftId: string }
>;
type LegacyCreateListeningPublishedVersionInput = Extract<
  CreateListeningPublishedVersionInput,
  { sourceLegacyTestId: string }
>;

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

const createLegacyTestRecord = (
  overrides: Partial<LegacyListeningTestRecord> = {},
): LegacyListeningTestRecord => ({
  id: 'legacy-test-1',
  ownerId: 'teacher-1',
  createdAt: 1_600_000_000_000,
  createdBy: 'teacher-1',
  updatedAt: 1_600_000_000_500,
  isPublished: true,
  ...baseDocument,
  ...overrides,
});

const createNow = (...values: number[]): (() => number) => {
  let index = 0;
  const last = values[values.length - 1] ?? 0;
  return () => {
    const current = values[index] ?? last;
    index += 1;
    return current;
  };
};

const createRepository = (now = createNow(1_700_000_000_000)) =>
  createInMemoryListeningAuthoringRepository({ now });

const cloneValue = <T>(value: T): T => {
  if (value === undefined) {
    return value;
  }

  return JSON.parse(JSON.stringify(value)) as T;
};

const getPath = (store: Record<string, unknown>, path: string): unknown => {
  const parts = path.split('/').filter(Boolean);
  let current: unknown = store;
  for (const part of parts) {
    if (current === null || typeof current !== 'object' || !(part in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return cloneValue(current);
};

const setPath = (store: Record<string, unknown>, path: string, value: unknown): void => {
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) {
    const replacement = cloneValue(value) as Record<string, unknown>;
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
    current = current[part] as Record<string, unknown>;
  }

  current[parts[parts.length - 1]!] = cloneValue(value);
};

const createSnapshot = (value: unknown) => ({
  exists: () => value !== undefined && value !== null,
  val: () => cloneValue(value),
});

const createFakeDatabase = (initial: Record<string, unknown> = {}) => {
  const store = cloneValue(initial);
  let pushCounter = 1;

  const createReference = (path: string): Record<string, unknown> => ({
    push: () => ({ key: `fake-key-${pushCounter++}` }),
    set: async (value: unknown) => {
      setPath(store, path, value);
    },
    once: async () => createSnapshot(getPath(store, path)),
    transaction: async (updateFn: (currentValue: unknown) => unknown) => {
      const current = getPath(store, path);
      const next = updateFn(current === undefined ? null : current);
      if (next === undefined) {
        return { committed: false, snapshot: createSnapshot(current) };
      }

      setPath(store, path, next);
      return { committed: true, snapshot: createSnapshot(next) };
    },
    orderByChild: (child: string) => ({
      equalTo: (expected: unknown) => ({
        once: async () => {
          const collection = getPath(store, path);
          if (collection === undefined || collection === null || typeof collection !== 'object') {
            return createSnapshot(undefined);
          }

          const matched = Object.fromEntries(
            Object.entries(collection as Record<string, Record<string, unknown>>)
              .filter(([, record]) => record?.[child] === expected),
          );
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

const createDraftRecord = (overrides: Partial<ListeningDraftRecord> = {}): ListeningDraftRecord => ({
  schemaVersion: 1,
  recordType: 'draft',
  draftId: 'draft-1',
  testId: 'test-1',
  ownerId: 'teacher-1',
  state: 'active',
  conflictToken: 2,
  latestPublishedVersionId: 'version-1',
  document: {
    ...baseDocument,
    title: 'Seed draft',
  },
  assetIds: {
    'asset-1': true,
    'asset-2': true,
  },
  createdAt: 1_000,
  createdBy: 'teacher-1',
  updatedAt: 2_000,
  updatedBy: 'teacher-1',
  lastOperationId: 'operation-seed',
  ...overrides,
});

const createRevisionDraftRecord = (
  overrides: Partial<ListeningRevisionDraftRecord> = {},
): ListeningRevisionDraftRecord => ({
  schemaVersion: 1,
  recordType: 'revision-draft',
  draftId: 'revision-1',
  testId: 'test-1',
  ownerId: 'teacher-1',
  state: 'active',
  conflictToken: 6,
  createdFromVersionId: 'version-3',
  createdFromVersionNumber: 3,
  document: {
    ...baseDocument,
    title: 'Revision draft',
  },
  assetIds: {
    'asset-1': true,
    'asset-2': true,
  },
  createdAt: 3_000,
  createdBy: 'teacher-1',
  updatedAt: 4_000,
  updatedBy: 'teacher-1',
  lastOperationId: 'operation-revision',
  ...overrides,
});

const createVersionRecord = (
  overrides: Partial<DraftBackedPublishedVersionRecord> = {},
): DraftBackedPublishedVersionRecord => ({
  schemaVersion: 1,
  recordType: 'published-version',
  versionId: 'version-1',
  versionNumber: 1,
  testId: 'test-1',
  ownerId: 'teacher-1',
  sourceDraftId: 'draft-1',
  sourceDraftPath: 'drafts',
  document: {
    ...baseDocument,
    title: 'Published draft',
  },
  assetIds: {
    'asset-1': true,
    'asset-2': true,
  },
  publishedAt: 4_000,
  publishedBy: 'teacher-1',
  publishOperationId: 'operation-publish-1',
  documentHash: 'document-hash-1',
  archive: {
    state: 'active',
  },
  compatibility: {
    legacyTestPath: 'tests/test-1',
    frozenLegacyVersion1: true,
  },
  ...overrides,
});

const createVersionInput = (
  overrides: Partial<DraftBackedCreateListeningPublishedVersionInput> = {},
): DraftBackedCreateListeningPublishedVersionInput => ({
  schemaVersion: 1,
  recordType: 'published-version',
  versionId: 'version-1',
  testId: 'test-1',
  ownerId: 'teacher-1',
  sourceDraftId: 'draft-1',
  sourceDraftPath: 'drafts',
  document: {
    ...baseDocument,
    title: 'Published draft',
  },
  assetIds: {
    'asset-1': true,
    'asset-2': true,
  },
  publishedAt: 4_000,
  publishedBy: 'teacher-1',
  publishOperationId: 'operation-publish-1',
  documentHash: 'document-hash-1',
  archive: {
    state: 'active',
  },
  compatibility: {
    legacyTestPath: 'tests/test-1',
    frozenLegacyVersion1: true,
  },
  ...overrides,
});

const createLegacyVersionInput = (
  overrides: Partial<LegacyCreateListeningPublishedVersionInput> = {},
): LegacyCreateListeningPublishedVersionInput => ({
  schemaVersion: 1,
  recordType: 'published-version',
  versionId: 'version-legacy-1',
  testId: 'test-legacy',
  ownerId: 'teacher-1',
  sourceLegacyTestId: 'legacy-test-1',
  sourceDraftPath: 'legacy_tests',
  document: {
    ...baseDocument,
    title: 'Legacy published draft',
  },
  assetIds: {
    'asset-1': true,
    'asset-2': true,
  },
  publishedAt: 5_000,
  publishedBy: 'teacher-1',
  publishOperationId: 'operation-publish-legacy-1',
  documentHash: 'document-hash-legacy-1',
  archive: {
    state: 'active',
  },
  compatibility: {
    frozenLegacyVersion1: true,
  },
  ...overrides,
});

const createClaimInput = (overrides: Partial<ClaimOperationInput> = {}): ClaimOperationInput => ({
  operationId: 'operation-1',
  operationType: 'save-draft',
  targetType: 'draft',
  ownerId: 'teacher-1',
  targetId: 'draft-1',
  idempotencyKeyHash: 'key-hash',
  requestHash: 'request-hash',
  expectedConflictToken: 4,
  ...overrides,
});

describe('listening authoring repository', () => {
  it('keeps repository implementation on four approved listening_authoring roots only', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'functions/src/listening-authoring/repository.ts'),
      'utf8',
    );

    expect(source).not.toContain('listening_authoring/operation_lookup');
    expect(source).not.toContain('listening_authoring/version_counters');
    expect(source).not.toContain('operationLookupKey');
  });

  it('claims idempotent operations with exact schema and completes them with completedAt plus expiry reset', async () => {
    const repo = createRepository(createNow(1_700_000_000_000, 1_700_000_000_500));

    const claim = await repo.claimOperation(createClaimInput());
    expect(claim).toEqual({
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
        createdAt: 1_700_000_000_000,
        expiresAt: 1_700_000_000_000 + LISTENING_AUTHORING_OPERATION_TTL_MS,
      },
    });

    await repo.completeOperation('operation-1', {
      draftId: 'draft-1',
      conflictToken: 5,
    });

    expect(repo.listOperationClaims()).toEqual([
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
        createdAt: 1_700_000_000_000,
        completedAt: 1_700_000_000_500,
        expiresAt: 1_700_000_000_500 + LISTENING_AUTHORING_OPERATION_TTL_MS,
      },
    ]);
    expect('updatedAt' in repo.listOperationClaims()[0]!).toBe(false);
  });

  it('does not overwrite terminal operations and rejects failed operation completion', async () => {
    const repo = createRepository(createNow(
      1_700_000_000_000,
      1_700_000_000_500,
      1_700_000_001_000,
    ));

    await repo.claimOperation(createClaimInput());
    await repo.completeOperation('operation-1', {
      draftId: 'draft-1',
      conflictToken: 5,
    });
    const completed = repo.listOperationClaims()[0]!;

    await repo.completeOperation('operation-1', {
      versionId: 'version-overwrite',
      versionNumber: 99,
    });

    expect(repo.listOperationClaims()[0]).toEqual(completed);

    const failedRepo = createInMemoryListeningAuthoringRepository({
      now: createNow(1_700_000_000_000),
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
            createdAt: 1_700_000_000_000,
            completedAt: 1_700_000_000_000,
            expiresAt: 1_700_000_000_000 + LISTENING_AUTHORING_OPERATION_TTL_MS,
          },
        ],
      },
    });

    await expect(
      failedRepo.completeOperation('operation-failed', {
        draftId: 'draft-1',
        conflictToken: 5,
      }),
    ).rejects.toThrow(/already failed/);
  });

  it('writes exact draft and revision-draft schemas, rejects stale transactions, applies successful updates, and returns clones', async () => {
    const repo = createRepository(createNow(2_000_000_000_000));

    const input = createDraftRecord();
    await repo.writeDraft(input);
    await repo.writeDraft(createRevisionDraftRecord());

    await expect(repo.getDraft('missing-draft')).resolves.toBeNull();
    await expect(repo.updateDraftTransaction(
      'missing-draft',
      1,
      (draft) => ({
        ...draft,
        conflictToken: draft.conflictToken + 1,
      }),
    )).resolves.toEqual({ kind: 'missing' });

    await expect(repo.updateDraftTransaction(
      'draft-1',
      1,
      (draft) => ({
        ...draft,
        conflictToken: draft.conflictToken + 1,
      }),
    )).resolves.toEqual({
      kind: 'conflict',
      currentConflictToken: 2,
    });

    await expect(repo.updateDraftTransaction(
      'draft-1',
      2,
      (draft) => ({
        ...draft,
        conflictToken: draft.conflictToken + 1,
        updatedBy: 'teacher-2',
        lastOperationId: 'operation-accepted',
      }),
    )).resolves.toEqual({
      kind: 'updated',
      conflictToken: 3,
    });

    const storedDraft = await repo.getDraft('draft-1');
    expect(storedDraft).toEqual({
      ...createDraftRecord(),
      conflictToken: 3,
      updatedAt: 2_000_000_000_000,
      updatedBy: 'teacher-2',
      lastOperationId: 'operation-accepted',
    });

    const revision = await repo.getDraft('revision-1');
    expect(revision).toEqual(createRevisionDraftRecord());

    if (storedDraft !== null) {
      storedDraft.lastOperationId = 'mutated-after-read';
    }
    expect((await repo.getDraft('draft-1'))?.lastOperationId).toBe('operation-accepted');
  });

  it('allocates prefixed ids, creates immutable versions with authoritative version numbers by testId, and returns clone reads', async () => {
    const repo = createInMemoryListeningAuthoringRepository({
      now: createNow(1_700_000_000_000),
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

    expect(repo.allocateId('draft')).toMatch(/^draft-/);
    expect(repo.allocateId('version')).toMatch(/^version-/);
    expect(repo.allocateId('operation')).toMatch(/^operation-/);

    await expect(repo.nextVersionNumberTransaction('test-1')).resolves.toBe(2);
    await expect(repo.nextVersionNumberTransaction('test-2')).resolves.toBe(1);

    const created = await repo.createVersionTransaction(createVersionInput({
      versionId: 'version-2',
      sourceDraftId: 'draft-2',
      documentHash: 'document-hash-2',
      publishOperationId: 'operation-publish-2',
    }));

    expect(created).toEqual({
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
    expect(duplicate).toEqual({
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
    expect(legacyCreated).toEqual({
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
        document: {
          ...baseDocument,
          title: 'Legacy published draft',
        },
        assetIds: {
          'asset-1': true,
          'asset-2': true,
        },
        publishedAt: 5_000,
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

  it('rejects published-version records with missing contradictory or empty source ids at create and seed boundaries for every source path', async () => {
    const repo = createRepository(createNow(1_700_000_000_000));

    await expect(
      repo.createVersionTransaction({
        ...createVersionInput(),
        versionId: 'version-missing-draft',
        sourceDraftPath: 'drafts',
        sourceDraftId: undefined,
      } as unknown as CreateListeningPublishedVersionInput),
    ).rejects.toThrow(/sourceDraftId/i);
    await expect(
      repo.createVersionTransaction({
        ...createVersionInput(),
        versionId: 'version-empty-draft',
        sourceDraftPath: 'drafts',
        sourceDraftId: '',
      } as unknown as CreateListeningPublishedVersionInput),
    ).rejects.toThrow(/sourceDraftId/i);
    await expect(
      repo.createVersionTransaction({
        ...createVersionInput(),
        versionId: 'version-contradict-draft',
        sourceDraftPath: 'drafts',
        sourceDraftId: 'draft-1',
        sourceLegacyTestId: 'legacy-1',
      } as unknown as CreateListeningPublishedVersionInput),
    ).rejects.toThrow(/sourceLegacyTestId/i);

    await expect(
      repo.createVersionTransaction({
        ...createVersionInput(),
        versionId: 'version-missing-revision',
        sourceDraftPath: 'revision_drafts',
        sourceDraftId: undefined,
      } as unknown as CreateListeningPublishedVersionInput),
    ).rejects.toThrow(/sourceDraftId/i);
    await expect(
      repo.createVersionTransaction({
        ...createVersionInput(),
        versionId: 'version-empty-revision',
        sourceDraftPath: 'revision_drafts',
        sourceDraftId: '   ',
      } as unknown as CreateListeningPublishedVersionInput),
    ).rejects.toThrow(/sourceDraftId/i);
    await expect(
      repo.createVersionTransaction({
        ...createVersionInput(),
        versionId: 'version-contradict-revision',
        sourceDraftPath: 'revision_drafts',
        sourceDraftId: 'revision-1',
        sourceLegacyTestId: 'legacy-1',
      } as unknown as CreateListeningPublishedVersionInput),
    ).rejects.toThrow(/sourceLegacyTestId/i);

    await expect(
      repo.createVersionTransaction({
        ...createLegacyVersionInput(),
        versionId: 'version-missing-legacy',
        sourceLegacyTestId: undefined,
      } as unknown as CreateListeningPublishedVersionInput),
    ).rejects.toThrow(/sourceLegacyTestId/i);
    await expect(
      repo.createVersionTransaction({
        ...createLegacyVersionInput(),
        versionId: 'version-empty-legacy',
        sourceLegacyTestId: '',
      } as unknown as CreateListeningPublishedVersionInput),
    ).rejects.toThrow(/sourceLegacyTestId/i);
    await expect(
      repo.createVersionTransaction({
        ...createLegacyVersionInput(),
        versionId: 'version-contradict-legacy',
        sourceDraftId: 'draft-legacy-1',
        sourceLegacyTestId: 'legacy-test-1',
      } as unknown as CreateListeningPublishedVersionInput),
    ).rejects.toThrow(/sourceDraftId/i);

    expect(() =>
      createInMemoryListeningAuthoringRepository({
        now: createNow(1_700_000_000_000),
        seed: {
          versions: [
            {
              ...createVersionRecord(),
              versionId: 'seed-missing-draft',
              sourceDraftPath: 'drafts',
              sourceDraftId: undefined,
            } as unknown as ListeningPublishedVersionRecord,
          ],
        },
      }),
    ).toThrow(/sourceDraftId/i);
    expect(() =>
      createInMemoryListeningAuthoringRepository({
        now: createNow(1_700_000_000_000),
        seed: {
          versions: [
            {
              ...createVersionRecord(),
              versionId: 'seed-empty-revision',
              sourceDraftPath: 'revision_drafts',
              sourceDraftId: '',
            } as unknown as ListeningPublishedVersionRecord,
          ],
        },
      }),
    ).toThrow(/sourceDraftId/i);
    expect(() =>
      createInMemoryListeningAuthoringRepository({
        now: createNow(1_700_000_000_000),
        seed: {
          versions: [
            {
              ...createLegacyVersionInput(),
              versionNumber: 1,
              versionId: 'seed-contradict-legacy',
              sourceDraftId: 'draft-legacy-1',
              sourceLegacyTestId: 'legacy-test-1',
            } as unknown as ListeningPublishedVersionRecord,
          ],
        },
      }),
    ).toThrow(/sourceDraftId/i);
  });

  it('atomically creates exact initial draft, stores narrow operation result, and exact retry returns same terminal result', async () => {
    const repo = createRepository(createNow(1_700_000_000_000));

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

    expect(first).toEqual({
      kind: 'saved',
      created: true,
      result: {
        draftId: 'draft-atomic',
        conflictToken: 1,
      },
    });
    expect(retry).toEqual({
      kind: 'replayed',
      created: true,
      result: {
        draftId: 'draft-atomic',
        conflictToken: 1,
      },
    });
    expect(await repo.getDraft('draft-atomic')).toEqual({
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
      createdAt: 1_700_000_000_000,
      createdBy: 'teacher-1',
      updatedAt: 1_700_000_000_000,
      updatedBy: 'teacher-1',
      lastOperationId: 'operation-atomic-1',
    });
    expect(repo.listOperationClaims()).toEqual([
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
        createdAt: 1_700_000_000_000,
        completedAt: 1_700_000_000_000,
        expiresAt: 1_700_000_000_000 + LISTENING_AUTHORING_OPERATION_TTL_MS,
      },
    ]);
  });

  it('atomically fails changed-request reuse without mutation and supports concurrent exact retry on same scope', async () => {
    const repo = createRepository(createNow(1_700_000_000_000));

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
      document: {
        ...baseDocument,
        title: 'Changed title',
      },
      allowCreate: true,
    });

    expect([first, replay]).toEqual([
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
    expect(conflict).toEqual({
      kind: 'idempotency-conflict',
      draftId: 'draft-atomic',
      operationId: 'operation-atomic-1',
    });
    expect(repo.listOperationClaims()).toHaveLength(1);
    expect((await repo.getDraft('draft-atomic'))?.document.title).toBe('Listening draft');
  });

  it('atomically updates owned draft, requires expected token, and fails closed for missing or cross-owner updates', async () => {
    const repo = createInMemoryListeningAuthoringRepository({
      now: createNow(1_700_000_000_500),
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
      document: {
        ...baseDocument,
        title: 'Updated title',
      },
      allowCreate: false,
    });

    expect(missing).toEqual({
      kind: 'not-found',
      draftId: 'missing-draft',
    });
    expect(stale).toEqual({
      kind: 'conflict',
      draftId: 'draft-1',
      expectedConflictToken: 1,
      currentConflictToken: 2,
    });
    expect(crossOwner).toEqual({
      kind: 'not-found',
      draftId: 'draft-1',
    });
    expect(saved).toEqual({
      kind: 'saved',
      created: false,
      result: {
        draftId: 'draft-1',
        conflictToken: 3,
      },
    });
    expect(await repo.getDraft('draft-1')).toEqual({
      ...createDraftRecord(),
      conflictToken: 3,
      document: {
        ...baseDocument,
        title: 'Updated title',
      },
      updatedAt: 1_700_000_000_500,
      updatedBy: 'teacher-1',
      lastOperationId: 'operation-ok',
    });
    expect(repo.listOperationClaims()).toEqual([
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
        createdAt: 1_700_000_000_500,
        completedAt: 1_700_000_000_500,
        expiresAt: 1_700_000_000_500 + LISTENING_AUTHORING_OPERATION_TTL_MS,
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
        createdAt: 1_700_000_000_500,
        completedAt: 1_700_000_000_500,
        expiresAt: 1_700_000_000_500 + LISTENING_AUTHORING_OPERATION_TTL_MS,
      },
    ]);
  });

  it('atomically persists failed operations for soft-deleted and missing-token conflicts, replays exact retry, and denies changed request on same scope', async () => {
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
      document: {
        ...baseDocument,
        title: 'Should not restore',
      },
      allowCreate: false,
    });
    const softDeletedReplay = await repo.saveDraftTransaction({
      ownerId: 'teacher-1',
      draftId: 'draft-soft',
      operationId: 'operation-soft-2',
      idempotencyKeyHash: 'soft-hash',
      requestHash: 'soft-request-1',
      expectedConflictToken: 9,
      document: {
        ...baseDocument,
        title: 'Should not restore',
      },
      allowCreate: false,
    });
    const softDeletedChanged = await repo.saveDraftTransaction({
      ownerId: 'teacher-1',
      draftId: 'draft-soft',
      operationId: 'operation-soft-3',
      idempotencyKeyHash: 'soft-hash',
      requestHash: 'soft-request-2',
      expectedConflictToken: 9,
      document: {
        ...baseDocument,
        title: 'Changed payload',
      },
      allowCreate: false,
    });
    const missingToken = await repo.saveDraftTransaction({
      ownerId: 'teacher-1',
      draftId: 'draft-missing-token',
      operationId: 'operation-missing-token-1',
      idempotencyKeyHash: 'missing-hash',
      requestHash: 'missing-request-1',
      document: {
        ...baseDocument,
        title: 'Missing token write',
      },
      allowCreate: false,
    });
    const missingTokenReplay = await repo.saveDraftTransaction({
      ownerId: 'teacher-1',
      draftId: 'draft-missing-token',
      operationId: 'operation-missing-token-2',
      idempotencyKeyHash: 'missing-hash',
      requestHash: 'missing-request-1',
      document: {
        ...baseDocument,
        title: 'Missing token write',
      },
      allowCreate: false,
    });
    const missingTokenChanged = await repo.saveDraftTransaction({
      ownerId: 'teacher-1',
      draftId: 'draft-missing-token',
      operationId: 'operation-missing-token-3',
      idempotencyKeyHash: 'missing-hash',
      requestHash: 'missing-request-2',
      document: {
        ...baseDocument,
        title: 'Changed payload',
      },
      allowCreate: false,
    });

    expect(softDeleted).toEqual({
      kind: 'conflict',
      draftId: 'draft-soft',
      expectedConflictToken: 9,
      currentConflictToken: 9,
    });
    expect(softDeletedReplay).toEqual(softDeleted);
    expect(softDeletedChanged).toEqual({
      kind: 'idempotency-conflict',
      draftId: 'draft-soft',
      operationId: 'operation-soft-1',
    });
    expect(missingToken).toEqual({
      kind: 'conflict',
      draftId: 'draft-missing-token',
      expectedConflictToken: undefined,
      currentConflictToken: 4,
    });
    expect(missingTokenReplay).toEqual(missingToken);
    expect(missingTokenChanged).toEqual({
      kind: 'idempotency-conflict',
      draftId: 'draft-missing-token',
      operationId: 'operation-missing-token-1',
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
    expect(await repo.getDraft('draft-missing-token')).toEqual(
      createDraftRecord({
        draftId: 'draft-missing-token',
        conflictToken: 4,
      }),
    );
    expect(repo.listOperationClaims()).toEqual([
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
        createdAt: 1_700_000_000_700,
        completedAt: 1_700_000_000_700,
        expiresAt: 1_700_000_000_700 + LISTENING_AUTHORING_OPERATION_TTL_MS,
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
        createdAt: 1_700_000_000_700,
        completedAt: 1_700_000_000_700,
        expiresAt: 1_700_000_000_700 + LISTENING_AUTHORING_OPERATION_TTL_MS,
      },
    ]);
  });

  it('fails closed on malformed stored operations and guards atomic operationId collisions', async () => {
    const repo = createInMemoryListeningAuthoringRepository({
      now: createNow(1_700_000_000_900),
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
            createdAt: 1_700_000_000_000,
            completedAt: 1_700_000_000_000,
            expiresAt: 1_700_000_000_000 + LISTENING_AUTHORING_OPERATION_TTL_MS,
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
            createdAt: 1_700_000_000_000,
            completedAt: 1_700_000_000_000,
            expiresAt: 1_700_000_000_000 + LISTENING_AUTHORING_OPERATION_TTL_MS,
          },
        ],
      },
    });

    await expect(
      repo.saveDraftTransaction({
        ownerId: 'teacher-1',
        draftId: 'draft-bad',
        operationId: 'operation-new',
        idempotencyKeyHash: 'bad-hash',
        requestHash: 'bad-request',
        expectedConflictToken: 1,
        document: baseDocument,
        allowCreate: false,
      }),
    ).rejects.toThrow(/incomplete|malformed/i);

    await expect(
      repo.saveDraftTransaction({
        ownerId: 'teacher-1',
        draftId: 'draft-collision',
        operationId: 'operation-collision',
        idempotencyKeyHash: 'collision-hash-new',
        requestHash: 'collision-request-new',
        document: baseDocument,
        allowCreate: true,
      }),
    ).rejects.toThrow(/already exists/i);
  });

  it('runs Firebase repository transaction paths for save replay conflicts malformed operations and terminal completion guards', async () => {
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
      createdAt: 1_700_000_000_000,
      completedAt: 1_700_000_000_000,
      expiresAt: 1_700_000_000_000 + LISTENING_AUTHORING_OPERATION_TTL_MS,
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
      createdAt: 1_700_000_000_000,
      completedAt: 1_700_000_000_000,
      expiresAt: 1_700_000_000_000 + LISTENING_AUTHORING_OPERATION_TTL_MS,
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
    const repo = createFirebaseListeningAuthoringRepository(
      db as never,
      { now: createNow(1_700_000_000_500, 1_700_000_001_000) },
    );

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

    expect(created).toEqual({
      kind: 'saved',
      created: true,
      result: {
        draftId: 'draft-firebase',
        conflictToken: 1,
      },
    });
    expect(replay).toEqual({
      kind: 'replayed',
      created: true,
      result: {
        draftId: 'draft-firebase',
        conflictToken: 1,
      },
    });
    expect(stale).toEqual({
      kind: 'conflict',
      draftId: 'draft-1',
      expectedConflictToken: 1,
      currentConflictToken: 2,
    });

    await expect(
      repo.saveDraftTransaction({
        ownerId: 'teacher-1',
        draftId: 'draft-bad',
        operationId: 'operation-bad-replay',
        idempotencyKeyHash: 'bad-hash',
        requestHash: 'bad-request',
        expectedConflictToken: 1,
        document: baseDocument,
        allowCreate: false,
      }),
    ).rejects.toThrow(/incomplete|malformed/i);

    await repo.claimOperation(createClaimInput({
      operationId: 'operation-complete',
      idempotencyKeyHash: 'complete-hash',
      requestHash: 'complete-request',
    }));
    await repo.completeOperation('operation-complete', {
      draftId: 'draft-1',
      conflictToken: 5,
    });
    const completed = (
      dump().listening_authoring as Record<string, Record<string, unknown>>
    ).operations['operation-complete'];

    await repo.completeOperation('operation-complete', {
      versionId: 'version-overwrite',
      versionNumber: 99,
    });
    expect((
      dump().listening_authoring as Record<string, Record<string, unknown>>
    ).operations['operation-complete']).toEqual(completed);

    await expect(
      repo.completeOperation('operation-failed', {
        draftId: 'draft-1',
        conflictToken: 5,
      }),
    ).rejects.toThrow(/already failed/);

    const operations = (
      dump().listening_authoring as Record<string, Record<string, unknown>>
    ).operations;
    expect((operations['operation-stale-firebase'] as Record<string, unknown>).status).toBe('failed');
  });

  it('runs Firebase publish transaction paths for publish replay conflict and blocked outcomes', async () => {
    const { db, dump } = createFakeDatabase({
      listening_authoring: {
        drafts: {
          'draft-1': createDraftRecord(),
          'draft-blocked': createDraftRecord({
            draftId: 'draft-blocked',
            testId: 'test-blocked',
            conflictToken: 4,
            latestPublishedVersionId: undefined,
            document: {
              ...baseDocument,
              audioSections: [
                {
                  number: 1,
                  name: 'Section 1',
                  audioUrl: 'https://example.test/temp.mp3',
                  startQuestion: 1,
                  endQuestion: 1,
                },
              ],
            },
            assetIds: {},
          }),
        },
        versions: {
          'version-1': createVersionRecord(),
        },
      },
    });
    const repo = createFirebaseListeningAuthoringRepository(
      db as never,
      { now: createNow(1_700_000_000_500) },
    );

    const published = await repo.publishDraftTransaction({
      ownerId: 'teacher-1',
      draftId: 'draft-1',
      operationId: 'operation-publish-firebase',
      versionId: 'version-firebase-2',
      idempotencyKeyHash: 'publish-hash',
      requestHash: 'publish-request',
      expectedConflictToken: 2,
      publishedAt: 4_500,
    });
    const replay = await repo.publishDraftTransaction({
      ownerId: 'teacher-1',
      draftId: 'draft-1',
      operationId: 'operation-publish-firebase-retry',
      versionId: 'version-firebase-2',
      idempotencyKeyHash: 'publish-hash',
      requestHash: 'publish-request',
      expectedConflictToken: 2,
      publishedAt: 4_600,
    });
    const conflict = await repo.publishDraftTransaction({
      ownerId: 'teacher-1',
      draftId: 'draft-1',
      operationId: 'operation-publish-stale-firebase',
      versionId: 'version-firebase-stale',
      idempotencyKeyHash: 'publish-stale-hash',
      requestHash: 'publish-stale-request',
      expectedConflictToken: 2,
      publishedAt: 4_700,
    });
    const blocked = await repo.publishDraftTransaction({
      ownerId: 'teacher-1',
      draftId: 'draft-blocked',
      operationId: 'operation-publish-blocked-firebase',
      versionId: 'version-firebase-blocked',
      idempotencyKeyHash: 'publish-blocked-hash',
      requestHash: 'publish-blocked-request',
      expectedConflictToken: 4,
      publishedAt: 4_800,
    });
    const expectedPublishedResult = {
      draftId: 'draft-1',
      versionId: 'version-firebase-2',
      versionNumber: 2,
      conflictToken: 3,
    };

    expect(published).toEqual({
      kind: 'published',
      result: expectedPublishedResult,
    });
    expect(replay).toEqual({
      kind: 'replayed',
      result: expectedPublishedResult,
    });
    expect(conflict).toEqual({
      kind: 'conflict',
      draftId: 'draft-1',
      expectedConflictToken: 2,
      currentConflictToken: 3,
    });
    expect(blocked).toEqual({
      kind: 'blocked',
      draftId: 'draft-blocked',
      conflictToken: 4,
      blockers: [{
        field: 'audioSections[0].assetId',
        severity: 'blocker',
        guidance: 'Publish requires canonical assetId for every audio section.',
      }],
    });

    const root = dump().listening_authoring as Record<string, Record<string, unknown>>;
    expect(root.drafts['draft-1']).toEqual(expect.objectContaining({
      conflictToken: 3,
      latestPublishedVersionId: 'version-firebase-2',
      lastOperationId: 'operation-publish-firebase',
    }));
    expect(root.versions['version-firebase-2']).toEqual(expect.objectContaining({
      versionId: 'version-firebase-2',
      versionNumber: 2,
      sourceDraftPath: 'drafts',
      sourceDraftId: 'draft-1',
      publishOperationId: 'operation-publish-firebase',
      archive: { state: 'active' },
      compatibility: { frozenLegacyVersion1: false },
    }));
    expect(root.versions['version-firebase-blocked']).toBeUndefined();
    expect(root.operations['operation-publish-firebase']).toEqual(expect.objectContaining({
      status: 'succeeded',
      result: expectedPublishedResult,
    }));
    expect(root.operations['operation-publish-firebase-retry']).toBeUndefined();
    expect(root.operations['operation-publish-stale-firebase']).toEqual(expect.objectContaining({
      status: 'failed',
      errorCode: 'conflict',
      result: {
        draftId: 'draft-1',
        conflictToken: 3,
      },
    }));
    expect(root.operations['operation-publish-blocked-firebase']).toEqual(expect.objectContaining({
      status: 'failed',
      errorCode: 'publish-blocked',
      result: {
        draftId: 'draft-blocked',
        conflictToken: 4,
      },
    }));
  });

  it('runs Firebase legacy first-edit as one root transaction without changing legacy content fields', async () => {
    const legacyTest = createLegacyTestRecord();
    const { db, dump } = createFakeDatabase({
      tests: {
        [legacyTest.id]: legacyTest,
      },
      unrelated_root: {
        preserved: true,
      },
    });
    const repo = createFirebaseListeningAuthoringRepository(db as never);
    const input = {
      ownerId: 'teacher-1',
      legacyTestId: legacyTest.id,
      operationId: 'operation-legacy-freeze',
      versionId: 'version-legacy-freeze',
      revisionDraftId: 'draft-legacy-revision',
      idempotencyKeyHash: 'legacy-key-hash',
      requestHash: 'legacy-request-hash',
      publishedAt: 1_700_000_000_000,
    };

    const first = await repo.legacyFirstEditTransaction(input);
    const retry = await repo.legacyFirstEditTransaction({
      ...input,
      operationId: 'operation-legacy-retry',
    });

    expect(first).toEqual({
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
    expect(retry).toEqual({
      kind: 'replayed',
      result: first.result,
    });
    const root = dump();
    expect(root.unrelated_root).toEqual({ preserved: true });
    expect((root.tests as Record<string, unknown>)[legacyTest.id]).toEqual({
      ...legacyTest,
      authoringVersioning: {
        frozen: true,
        versionId: input.versionId,
        versionNumber: 1,
        frozenAt: input.publishedAt,
        frozenBy: input.ownerId,
        decisionRef: 'PRD-0055-PACKET-1J-B1-B2-APPROVAL-2026-06-20',
      },
    });
    expect(root.listening_authoring).toEqual(expect.objectContaining({
      revision_drafts: {
        [input.revisionDraftId]: expect.objectContaining({
          recordType: 'revision-draft',
          createdFromVersionId: input.versionId,
          createdFromVersionNumber: 1,
        }),
      },
      versions: {
        [input.versionId]: expect.objectContaining({
          sourceDraftPath: 'legacy_tests',
          sourceLegacyTestId: legacyTest.id,
          documentHash: requestHash(baseDocument),
        }),
      },
      operations: {
        [input.operationId]: expect.objectContaining({
          operationType: 'publish',
          targetType: 'legacy-test',
          status: 'succeeded',
        }),
      },
    }));
  });

  it('runs Firebase lifecycle transaction paths for draft and version metadata mutations', async () => {
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
    const repo = createFirebaseListeningAuthoringRepository(
      db as never,
      { now: createNow(1_700_000_001_000) },
    );

    const deleted = await repo.lifecycleTransaction({
      ownerId: 'teacher-1',
      operationId: 'operation-delete-firebase',
      operationType: 'soft-delete',
      targetId: 'draft-1',
      idempotencyKeyHash: 'delete-hash',
      requestHash: 'delete-request',
      expectedConflictToken: 2,
      completedAt: 6_000,
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
      completedAt: 6_100,
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
      completedAt: 7_000,
    });
    const archived = await repo.lifecycleTransaction({
      ownerId: 'teacher-1',
      operationId: 'operation-archive-firebase',
      operationType: 'archive',
      targetId: 'version-1',
      idempotencyKeyHash: 'archive-hash',
      requestHash: 'archive-request',
      expectedConflictToken: 1,
      completedAt: 8_000,
      reasonCode: 'teacher-archive',
    });

    expect(deleted).toEqual({
      kind: 'soft-deleted',
      result: {
        draftId: 'draft-1',
        conflictToken: 3,
      },
    });
    expect(replay).toEqual(deleted);
    expect(restored).toEqual({
      kind: 'restored',
      result: {
        draftId: 'draft-1',
        conflictToken: 4,
      },
    });
    expect(archived).toEqual({
      kind: 'archived',
      result: {
        versionId: 'version-1',
        versionNumber: 1,
      },
    });

    const root = dump().listening_authoring as Record<string, Record<string, unknown>>;
    expect(root.drafts['draft-1']).toEqual(expect.objectContaining({
      state: 'active',
      conflictToken: 4,
      lastOperationId: 'operation-restore-firebase',
      softDelete: expect.objectContaining({
        deletedAt: 6_000,
        deletedBy: 'teacher-1',
        reasonCode: 'teacher-request',
        restoredAt: 7_000,
        restoredBy: 'teacher-1',
        restoreCount: 1,
      }),
    }));
    expect(root.versions['version-1']).toEqual(expect.objectContaining({
      versionId: 'version-1',
      documentHash: 'document-hash-1',
      archive: {
        state: 'archived',
        archivedAt: 8_000,
        archivedBy: 'teacher-1',
        reasonCode: 'teacher-archive',
      },
    }));
    expect(root.operations['operation-delete-firebase']).toEqual(expect.objectContaining({
      status: 'succeeded',
      result: {
        draftId: 'draft-1',
        conflictToken: 3,
      },
    }));
    expect(root.operations['operation-delete-firebase-retry']).toBeUndefined();
    expect(root.operations['operation-restore-firebase']).toEqual(expect.objectContaining({
      status: 'succeeded',
      result: {
        draftId: 'draft-1',
        conflictToken: 4,
      },
    }));
    expect(root.operations['operation-archive-firebase']).toEqual(expect.objectContaining({
      status: 'succeeded',
      result: {
        versionId: 'version-1',
        versionNumber: 1,
      },
    }));
  });

  it('runs Firebase lifecycle conflict and invalid-state failed-operation paths', async () => {
    const { db, dump } = createFakeDatabase({
      listening_authoring: {
        drafts: {
          'draft-1': createDraftRecord(),
        },
        versions: {
          'version-1': createVersionRecord({
            archive: {
              state: 'archived',
              archivedAt: 4_500,
              archivedBy: 'teacher-1',
              reasonCode: 'already-archived',
            },
          }),
        },
      },
    });
    const repo = createFirebaseListeningAuthoringRepository(
      db as never,
      { now: createNow(1_700_000_001_000) },
    );

    const conflict = await repo.lifecycleTransaction({
      ownerId: 'teacher-1',
      operationId: 'operation-delete-stale-firebase',
      operationType: 'soft-delete',
      targetId: 'draft-1',
      idempotencyKeyHash: 'delete-stale-hash',
      requestHash: 'delete-stale-request',
      expectedConflictToken: 1,
      completedAt: 6_000,
    });
    const invalidArchive = await repo.lifecycleTransaction({
      ownerId: 'teacher-1',
      operationId: 'operation-archive-invalid-firebase',
      operationType: 'archive',
      targetId: 'version-1',
      idempotencyKeyHash: 'archive-invalid-hash',
      requestHash: 'archive-invalid-request',
      expectedConflictToken: 1,
      completedAt: 7_000,
    });

    expect(conflict).toEqual({
      kind: 'conflict',
      targetId: 'draft-1',
      expectedConflictToken: 1,
      currentConflictToken: 2,
    });
    expect(invalidArchive).toEqual({
      kind: 'invalid-state',
      targetId: 'version-1',
    });

    const root = dump().listening_authoring as Record<string, Record<string, unknown>>;
    expect(root.drafts['draft-1']).toEqual(createDraftRecord());
    expect(root.versions['version-1']).toEqual(createVersionRecord({
      archive: {
        state: 'archived',
        archivedAt: 4_500,
        archivedBy: 'teacher-1',
        reasonCode: 'already-archived',
      },
    }));
    expect(root.operations['operation-delete-stale-firebase']).toEqual(expect.objectContaining({
      status: 'failed',
      errorCode: 'conflict',
      result: {
        draftId: 'draft-1',
        conflictToken: 2,
      },
    }));
    expect(root.operations['operation-archive-invalid-firebase']).toEqual(expect.objectContaining({
      status: 'failed',
      errorCode: 'invalid-state',
      result: {
        versionId: 'version-1',
        versionNumber: 1,
      },
    }));
  });
});
