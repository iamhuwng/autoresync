import { describe, expect, it } from 'vitest';
import { normalizeActivity } from '../../src/services/book-activity/activityCanonical.service';
import { projectStudentActivity } from '../../src/services/book-activity/activityProjection.service';
import {
  createCanonicalActivityVersionFingerprint,
  type CanonicalPublishedActivityVersionRecord,
} from '../../src/services/book-assembly/canonicalActivityVersion.service';
import type { EditableActivity, NormalizedActivity } from '../../src/types/bookActivity.types';
import type { MaterialBookMetadata, MaterialBookNode } from '../../src/types/materialCatalog.types';
import type {
  PublicBookReferenceForkStore,
  PublicBookSelectionSnapshot,
} from '../../src/services/materialCatalog/publicBookReferenceFork.types';
import { createPublicBookCanonicalForkWriter } from '../src/upload-worker/public-book-reference-fork/writer';
import { FirebaseRestPublicBookReferenceForkRepository } from '../src/upload-worker/public-book-reference-fork/repository';
import type {
  PublicBookCanonicalForkArtifacts,
  PublicBookCanonicalForkRepository,
  PublicBookCanonicalForkSource,
} from '../src/upload-worker/public-book-reference-fork/writer';
import { createPublicBookReferenceForkWorkerHandlers } from '../src/upload-worker/public-book-reference-fork/worker';
import fragment16A from '../src/upload-worker/book-rules/fragments/16A.json';
import fragment20A from '../src/upload-worker/book-rules/fragments/20A.json';
import fragment44 from '../src/upload-worker/book-rules/fragments/44.json';

const NOW = '2026-08-09T00:00:00.000Z';
const NEXT = '2026-08-09T00:01:00.000Z';
const sourcePage = { sourceKey: 'full', sourceVersionId: 'source-pdf-1', physicalPageNumber: 4 } as const;

const sourceActivity = (): NormalizedActivity => {
  const editable: EditableActivity = {
    schemaVersion: 1,
    title: 'Choose the correct answer',
    taskProfile: null,
    presentationMode: 'structured',
    contextRequirement: { mode: 'optional', acceptedKinds: ['book-pages'] },
    instructions: [{ text: 'Choose one answer.' }],
    stimulus: null,
    assetRefs: [],
    interaction: { family: 'choice', variant: 'single-choice' },
    interactions: [{ prompt: 'Which answer is correct?', options: ['A', 'B'], acceptedOptionIndexes: [0] }],
    answerRule: { defaultPoints: 1, normalization: 'exact', requiredSelectionCount: 1 },
    scoring: { mode: 'auto-where-possible' },
  };
  let identity = 0;
  return normalizeActivity(editable, { createId: () => `hidden-${++identity}` });
};

const sourceRecord = (): CanonicalPublishedActivityVersionRecord => {
  const activity = sourceActivity();
  const withoutFingerprint = {
    schemaVersion: 1 as const,
    lifecycle: 'published' as const,
    activityId: 'source-activity',
    activityVersionId: 'source-version-1',
    activityVersion: 1,
    ownerId: 'source-owner',
    activity,
    projection: projectStudentActivity(activity),
    placementIds: ['source-placement'],
    evidenceRefs: ['import:source-activity'],
    sourceContextFingerprint: null,
    createdByOperationId: 'source-operation',
    publishedAt: NOW,
    provenance: {
      kind: 'initial-book-publication' as const,
      bookId: 'source-book',
      manifestVersionId: 'manifest-source',
      publicationId: 'publication-source',
      publicationRevision: 2,
      unitKey: 'unit-1',
      activityKey: 'activity-1',
      sourcePages: [sourcePage],
    },
  };
  return { ...withoutFingerprint, payloadFingerprint: createCanonicalActivityVersionFingerprint(withoutFingerprint) };
};

const source = (): PublicBookSelectionSnapshot => {
  const canonical = sourceRecord();
  return {
    bookId: 'source-book',
    title: 'Source Book',
    publicTree: true,
    publication: {
      publicationId: 'publication-source',
      revision: 2,
      status: 'trusted',
      publishedAt: NOW,
      updatedAt: NOW,
    },
    source: {
      sourceVersionId: 'source-pdf-1',
      lifecycleState: 'ready',
      studentSafeStatus: 'ready',
      documentDeliveryStatus: 'ready',
    },
    nodes: [{ nodeId: 'unit-1', nodeKind: 'unit', title: 'Unit 1', order: 0, selectionPath: ['unit-1'] }],
    activities: [{
      activityId: canonical.activityId,
      versionId: canonical.activityVersionId,
      title: canonical.activity.title,
      order: 0,
      selectionPath: ['unit-1'],
      projection: canonical.projection,
    }],
  };
};

const targetMetadata = (): MaterialBookMetadata => ({
  bookId: 'target-book' as MaterialBookMetadata['bookId'],
  bookMode: 'materials',
  ownerId: 'teacher-target',
  title: 'Target Book',
  authors: ['Teacher'],
  primaryTestTypeId: 'ielts' as MaterialBookMetadata['primaryTestTypeId'],
  testTypeIds: ['ielts' as MaterialBookMetadata['testTypeIds'][number]],
  tags: [],
  visibility: 'private',
  status: 'draft-empty',
  createdAt: NOW,
  updatedAt: NOW,
  createdBy: 'teacher-target',
  updatedBy: 'teacher-target',
});

const targetNode = (): MaterialBookNode => ({
  nodeId: 'target-node' as MaterialBookNode['nodeId'],
  bookId: 'target-book' as MaterialBookNode['bookId'],
  parentNodeId: null,
  type: 'section',
  title: 'Section 1',
  order: 0,
  materialRefs: [],
  createdAt: NOW,
  updatedAt: NOW,
});

const command = () => ({
  actorId: 'teacher-target',
  operationId: '00000000-0000-4000-8000-000000000106',
  target: { bookId: 'target-book', nodeId: 'target-node', placementId: 'placement-target' },
  selection: {
    sourceBookId: 'source-book',
    publicationId: 'publication-source',
    publicationRevision: 2,
    kind: 'activity' as const,
    selectionPath: ['unit-1'],
    activities: [{ activityId: 'source-activity', activityVersionId: 'source-version-1', order: 0 }],
  },
  context: { mode: 'none' as const },
});

interface ForkState {
  metadata: MaterialBookMetadata;
  nodes: MaterialBookNode[];
  artifacts: { canonical?: unknown; safeProjection?: unknown };
  receipt: unknown | null;
  repositoryCalls: number;
  repositoryCallKinds: string[];
  patchCalls: number;
  patchAttempts: number;
  collisionObservedNoProducts: boolean;
  lastUpdatePaths: string[];
  lastUpdates: readonly { path: string; value: unknown }[];
  lastClaims: Record<string, unknown> | null;
  patchMode: 'normal' | 'always-fail' | 'lost-ack' | 'deferred-concurrent' | 'book-collision';
}

const createRepository = () => {
  const canonical = sourceRecord();
  const publicBook = source();
  const state: ForkState = {
    metadata: targetMetadata(),
    nodes: [targetNode(), {
      ...targetNode(),
      nodeId: 'unrelated-node' as MaterialBookNode['nodeId'],
      title: 'Unrelated section',
      order: 1,
    }],
    artifacts: {},
    receipt: null,
    repositoryCalls: 0,
    repositoryCallKinds: [],
    patchCalls: 0,
    patchAttempts: 0,
    collisionObservedNoProducts: false,
    lastUpdatePaths: [],
    lastUpdates: [],
    lastClaims: null,
    patchMode: 'normal',
  };
  const recordRepositoryCall = (kind: string): void => {
    state.repositoryCalls += 1;
    state.repositoryCallKinds.push(kind);
  };
  const canonicalRecord = canonical as unknown as Record<string, unknown>;
  const sourceValue: PublicBookCanonicalForkSource = {
    canonical: canonicalRecord,
    safeProjection: {
      schemaVersion: 1,
      projectionKind: 'student-safe',
      activityId: canonical.activityId,
      activityVersionId: canonical.activityVersionId,
      ownerId: canonical.ownerId,
      content: canonical.projection,
      payloadFingerprint: canonical.payloadFingerprint,
      createdByOperationId: canonical.createdByOperationId,
      publishedAt: canonical.publishedAt,
    },
    sourceBookId: 'source-book',
    sourceOwnerId: 'source-owner',
    sourceVersionId: 'source-pdf-1',
    manifestVersionId: 'manifest-source',
    publicationId: 'publication-source',
    publicationRevision: 2,
    sourcePlacementIds: ['source-placement'],
    sourcePages: [sourcePage],
    pageGroupIds: ['group-1'],
    sourcePlacement: {
      placementId: 'source-placement',
      nodeId: 'unit-1',
      unitKey: 'unit-1',
      activityKey: 'activity-1',
      order: 0,
      pageGroupIds: ['group-1'],
      sourcePages: [sourcePage],
    },
  };
  const apply = (updates: readonly { path: string; value: unknown }[]) => {
    updates.forEach(({ path, value }) => {
      if (path === 'material_catalog/books/target-book') {
        state.metadata = value as MaterialBookMetadata;
      } else if (path.startsWith('material_catalog/book_nodes/target-book/')) {
        const nodeId = path.split('/').at(-1)!;
        state.nodes = value === null
          ? state.nodes.filter((node) => node.nodeId !== nodeId)
          : [...state.nodes.filter((node) => node.nodeId !== nodeId), value as MaterialBookNode];
      } else if (path.startsWith('book_activity/versions/')) {
        state.artifacts.canonical = value;
      } else if (path.startsWith('book_activity/student_safe_projections/')) {
        state.artifacts.safeProjection = value;
      } else if (path.startsWith('book_activity/canonical_fork_operations/')) {
        const storedReceipt = structuredClone(value) as {
          source?: Record<string, unknown>;
        };
        if (state.patchMode === 'lost-ack'
          && storedReceipt.source?.contextFingerprint === null) {
          delete storedReceipt.source.contextFingerprint;
        }
        state.receipt = storedReceipt;
      }
    });
  };
  const repository: PublicBookCanonicalForkRepository = {
    readPublicBook: async () => { recordRepositoryCall('public-book'); return publicBook; },
    readCanonicalForkTargetBook: async () => { recordRepositoryCall('target-book'); return state.metadata; },
    listCanonicalForkTargetBookNodes: async () => { recordRepositoryCall('target-nodes'); return state.nodes; },
    readCanonicalForkSource: async () => { recordRepositoryCall('source'); return sourceValue; },
    readCanonicalForkReceipt: async () => { recordRepositoryCall('receipt'); return state.receipt; },
    readCanonicalForkArtifacts: async (): Promise<PublicBookCanonicalForkArtifacts> => {
      recordRepositoryCall('artifacts');
      return state.artifacts;
    },
    patchCanonicalFork: async ({ updates, claims }) => {
      state.patchAttempts += 1;
      state.lastUpdates = structuredClone(updates);
      state.lastClaims = structuredClone(claims);
      if (state.patchMode === 'deferred-concurrent') {
        await new Promise<void>((resolve) => {
          deferredResolvers.push(resolve);
          if (deferredResolvers.length === 2) deferredResolvers.splice(0).forEach((release) => release());
        });
        if (state.receipt !== null) throw new Error('deferred_duplicate_after_commit');
      }
      if (state.patchMode === 'book-collision' && !collisionInjected) {
        collisionInjected = true;
        state.metadata = { ...state.metadata, updatedAt: '2026-08-09T00:00:30.000Z' };
        state.collisionObservedNoProducts = state.receipt === null
          && state.artifacts.canonical === undefined
          && state.artifacts.safeProjection === undefined;
        throw new Error('book_revision_conflict');
      }
      state.patchCalls += 1;
      state.lastUpdatePaths = updates.map(({ path }) => path);
      if (state.patchMode === 'always-fail') throw new Error('injected patch failure');
      apply(updates);
      if (state.patchMode === 'lost-ack') throw new Error('injected lost acknowledgement');
    },
  };
  const deferredResolvers: Array<() => void> = [];
  let collisionInjected = false;
  return { repository, state, canonical };
};

const writerFor = (repository: PublicBookCanonicalForkRepository) =>
  createPublicBookCanonicalForkWriter({ repository, now: () => NEXT });

const exactUpdateValue = (
  updates: readonly { path: string; value: unknown }[],
  path: string,
): unknown => {
  const matches = updates.filter((entry) => entry.path === path);
  expect(matches).toHaveLength(1);
  return matches[0]!.value;
};

describe('canonical public Book fork Worker writer contract', () => {
  it('rejects a path-unsafe ID before any repository access', async () => {
    const { repository, state } = createRepository();
    for (const unsafeId of ['target.book', 'target:book']) {
      const unsafe = {
        ...command(),
        target: { ...command().target, bookId: unsafeId },
      };
      await expect(writerFor(repository).fork(unsafe)).rejects.toMatchObject({
        code: 'request-invalid',
        statusCode: 400,
      });
    }
    expect(state.repositoryCalls).toBe(0);
    expect(state.patchAttempts).toBe(0);
  });

  it('builds one mirror-complete atomic update and preserves private answers', async () => {
    const { repository, state, canonical } = createRepository();
    const result = await writerFor(repository).fork(command());
    const destination = state.artifacts.canonical as Record<string, any>;
    const safe = state.artifacts.safeProjection as Record<string, any>;
    expect(result).toMatchObject({ status: 'created', activityVersion: 1, placement: { state: 'present' } });
    expect(state.patchCalls).toBe(1);
    expect(state.patchAttempts).toBe(1);
    expect(state.lastUpdates).toHaveLength(13);
    expect(state.lastUpdates.map(({ path }) => path)).toEqual(state.lastUpdatePaths);
    expect(exactUpdateValue(
      state.lastUpdates,
      `book_activity/versions/${destination.activityId}/${destination.activityVersionId}`,
    )).toEqual(destination);
    expect(exactUpdateValue(
      state.lastUpdates,
      `book_activity/student_safe_projections/${destination.activityId}/${destination.activityVersionId}`,
    )).toEqual(safe);
    expect(exactUpdateValue(
      state.lastUpdates,
      `book_activity/canonical_fork_operations/${command().actorId}/${command().operationId}`,
    )).toEqual(state.receipt);
    expect(state.lastClaims).toMatchObject({
      operation: 'public-book-canonical-fork-v1',
      actorId: command().actorId,
      operationId: command().operationId,
      planFingerprint: (state.receipt as { planFingerprint: string }).planFingerprint,
      targetAppendOrder: 1,
      targetRefIndex: 0,
    });
    expect(JSON.stringify(state.lastClaims)).not.toMatch(/"(?:rt|selp|pg|bm)"/u);
    expect(state.repositoryCallKinds[0]).toBe('receipt');
    expect(destination.activityId).not.toBe(canonical.activityId);
    expect(destination.activityVersion).toBe(1);
    expect(destination.activity.interactions[0].answerKey).toBeDefined();
    expect(destination.projection).toEqual(safe.content);
    expect(JSON.stringify(safe)).not.toMatch(/answerKey|teacherNotes|privateObjectKey|provider/i);
    expect(JSON.stringify(state.receipt)).not.toMatch(/answerKey|teacherNotes|privateObjectKey|provider/i);
    expect(state.metadata.updatedAt).toBe(NEXT);
    expect(state.lastUpdatePaths.some((path) => path === 'book_activity/versions/' + destination.activityId + '/' + destination.activityVersionId)).toBe(true);
    expect(state.lastUpdatePaths.some((path) => path === 'book_activity/student_safe_projections/' + destination.activityId + '/' + destination.activityVersionId)).toBe(true);
    expect(state.lastUpdatePaths.some((path) => path.startsWith('book_activity/canonical_fork_operations/'))).toBe(true);
    expect(state.lastUpdatePaths).toContain('material_catalog/books/target-book');
    expect(state.lastUpdatePaths).toContain('material_catalog/book_nodes/target-book/target-node');
    expect(state.lastUpdatePaths.some((path) => path === 'material_catalog/book_nodes/target-book/unrelated-node')).toBe(false);
    expect(state.lastUpdatePaths.some((path) => path.startsWith('material_catalog/book_indexes/'))).toBe(true);
    expect(state.lastUpdatePaths.some((path) => path.startsWith('material_catalog/material_summary_indexes/v1/'))).toBe(true);
  });

  it('serializes concurrent identical operations to one physical patch and replays the loser', async () => {
    const { repository, state } = createRepository();
    state.patchMode = 'deferred-concurrent';
    const [left, right] = await Promise.all([
      writerFor(repository).fork(command()),
      writerFor(repository).fork(command()),
    ]);
    expect(new Set([left.status, right.status])).toEqual(new Set(['created', 'replayed']));
    expect(state.patchAttempts).toBe(2);
    expect(state.patchCalls).toBe(1);
    expect(state.receipt).not.toBeNull();
  });

  it('replans after a Book revision collision without leaving partial products', async () => {
    const { repository, state } = createRepository();
    state.patchMode = 'book-collision';
    await expect(writerFor(repository).fork(command())).resolves.toMatchObject({ status: 'created' });
    expect(state.collisionObservedNoProducts).toBe(true);
    expect(state.patchAttempts).toBe(2);
    expect(state.patchCalls).toBe(1);
    expect(state.artifacts.canonical).toBeDefined();
    expect(state.artifacts.safeProjection).toBeDefined();
    expect(state.receipt).not.toBeNull();
  });

  it('binds a selected component placement to its non-first manifest source version', async () => {
    const canonical = sourceRecord();
    const selectedSource = source();
    const sourceSnapshot: PublicBookSelectionSnapshot = {
      ...selectedSource,
      source: { ...selectedSource.source, sourceVersionId: 'component-pdf-2' },
    };
    const repository = new FirebaseRestPublicBookReferenceForkRepository({
      env: {
        readDatabaseValue: async (path) => {
          if (path === 'book_assembly_publications/books/source-book/current') {
            return {
              manifestVersionId: 'manifest-source',
              publicationId: 'publication-source',
              publicationRevision: 2,
            };
          }
          if (path === 'book_assembly_publications/books/source-book/versions/manifest-source') {
            return {
              schemaVersion: 1,
              lifecycle: 'published',
              bookId: 'source-book',
              manifestVersionId: 'manifest-source',
              publicationId: 'publication-source',
              publicationRevision: 2,
              ownerId: 'source-owner',
              manifest: {
                sourceSet: {
                  sources: [
                    { sourceKey: 'full', sourceVersionId: 'source-pdf-1' },
                    { sourceKey: 'component', sourceVersionId: 'component-pdf-2' },
                  ],
                },
              },
            };
          }
          if (path.includes('/activity_versions/')) {
            return {
              schemaVersion: 1,
              bookId: 'source-book',
              manifestVersionId: 'manifest-source',
              publicationId: 'publication-source',
              publicationRevision: 2,
              activityId: canonical.activityId,
              activityVersionId: canonical.activityVersionId,
              activityVersion: 1,
              safeProjectionId: 'safe-1',
              canonicalPayloadFingerprint: canonical.payloadFingerprint,
            };
          }
          if (path === 'book_assembly_publications/books/source-book/activity_safe_projections/safe-1') {
            return {
              schemaVersion: 1,
              bookId: 'source-book',
              manifestVersionId: 'manifest-source',
              publicationId: 'publication-source',
              publicationRevision: 2,
              activityId: canonical.activityId,
              activityVersionId: canonical.activityVersionId,
              placementIds: ['source-placement'],
            };
          }
          if (path === 'book_assembly_publications/books/source-book/placements') {
            return {
              'source-placement': {
                placementId: 'source-placement',
                bookId: 'source-book',
                manifestVersionId: 'manifest-source',
                publicationId: 'publication-source',
                publicationRevision: 2,
                activityId: canonical.activityId,
                activityVersionId: canonical.activityVersionId,
                nodeKey: 'unit-1',
                unitKey: 'unit-1',
                activityKey: 'activity-1',
                order: 0,
                pageGroupKeys: ['group-1'],
                sourcePages: [{ sourceKey: 'component', sourceVersionId: 'component-pdf-2', physicalPageNumber: 4 }],
              },
            };
          }
          if (path === `book_activity/student_safe_projections/${canonical.activityId}/${canonical.activityVersionId}`) {
            return { projectionKind: 'student-safe', activityId: canonical.activityId };
          }
          return null;
        },
      },
      canonicalForkExactReader: { readExact: async () => canonical },
    });

    const result = await repository.readCanonicalForkSource({
      source: sourceSnapshot,
      activityId: canonical.activityId,
      activityVersionId: canonical.activityVersionId,
    });

    expect(result?.sourceVersionId).toBe('component-pdf-2');
    expect(result?.sourcePages).toEqual([{
      sourceKey: 'component',
      sourceVersionId: 'component-pdf-2',
      physicalPageNumber: 4,
    }]);
  });

  it('preserves RTDB-empty target nodes and computes their first canonical placement index', async () => {
    const rawNodes = {
      'target-node': {
        nodeId: 'target-node',
        bookId: 'target-book',
        parentNodeId: null,
        type: 'section',
        title: 'Section 1',
        order: 0,
        createdAt: NOW,
        updatedAt: NOW,
      },
      'null-node': {
        nodeId: 'null-node',
        bookId: 'target-book',
        parentNodeId: null,
        type: 'section',
        title: 'Section 2',
        order: 1,
        materialRefs: null,
        createdAt: NOW,
        updatedAt: NOW,
      },
      'malformed-node': {
        nodeId: 'malformed-node',
        bookId: 'target-book',
        parentNodeId: null,
        type: 'section',
        title: 'Malformed section',
        order: 2,
        materialRefs: { malformed: true },
        createdAt: NOW,
        updatedAt: NOW,
      },
    };
    const productionRepository = new FirebaseRestPublicBookReferenceForkRepository({
      env: {
        readDatabaseValue: async (path) => {
          if (path === 'material_catalog/books/target-book') return targetMetadata();
          if (path === 'material_catalog/book_nodes/target-book') return rawNodes;
          return null;
        },
      },
    });
    const parsedNodes = await productionRepository.listCanonicalForkTargetBookNodes('target-book');
    expect(parsedNodes.map((node) => node.nodeId)).toEqual(['target-node', 'null-node']);
    expect(parsedNodes.map((node) => node.materialRefs)).toEqual([[], []]);

    const accepted = createRepository();
    const repository: PublicBookCanonicalForkRepository = {
      ...accepted.repository,
      readCanonicalForkTargetBook: (bookId) => productionRepository.readCanonicalForkTargetBook(bookId),
      listCanonicalForkTargetBookNodes: (bookId) => productionRepository.listCanonicalForkTargetBookNodes(bookId),
    };
    await expect(writerFor(repository).fork(command())).resolves.toMatchObject({ status: 'created' });
    expect(accepted.state.lastClaims).toMatchObject({ targetRefIndex: 0, targetAppendOrder: 1 });
  });

  it('binds accepted context to the authoritative placement page groups before writing', async () => {
    const accepted = createRepository();
    const acceptedCommand = {
      ...command(),
      context: {
        mode: 'book-source-reference' as const,
        sourceBookId: 'source-book',
        sourceVersionId: 'source-pdf-1',
        selectionPath: ['unit-1'],
        pageGroupIds: ['group-1'],
      },
    };
    await expect(writerFor(accepted.repository).fork(acceptedCommand)).resolves.toMatchObject({
      status: 'created',
    });
    expect(accepted.state.patchCalls).toBe(1);
    expect(accepted.state.lastClaims?.sourceContextFingerprint).toMatch(/^sha256:/u);

    for (const pageGroupIds of [['wrong-group'], ['group-1', 'extra-group']]) {
      const denied = createRepository();
      await expect(writerFor(denied.repository).fork({
        ...acceptedCommand,
        operationId: pageGroupIds.length === 1
          ? '00000000-0000-4000-8000-000000000109'
          : '00000000-0000-4000-8000-000000000110',
        context: { ...acceptedCommand.context, pageGroupIds },
      })).rejects.toMatchObject({ code: 'source-context-invalid', statusCode: 403 });
      expect(denied.state.patchAttempts).toBe(0);
      expect(denied.state.lastClaims).toBeNull();
    }
  });

  it('replays without writing after lost acknowledgement and reports moved or removed placement', async () => {
    const { repository, state } = createRepository();
    state.patchMode = 'lost-ack';
    const first = await writerFor(repository).fork(command());
    expect(first.status).toBe('replayed');
    expect(state.patchCalls).toBe(1);
    expect((state.receipt as { source: Record<string, unknown> }).source)
      .not.toHaveProperty('contextFingerprint');
    const createdActivity = structuredClone(state.artifacts.canonical);

    const second = await writerFor(repository).fork(command());
    expect(second).toEqual(first);
    expect(state.patchCalls).toBe(1);
    expect(state.artifacts.canonical).toEqual(createdActivity);

    const targetNodeId = targetNode().nodeId;
    const original = state.nodes.find((node) => node.nodeId === targetNodeId)!;
    state.nodes = [
      { ...original, materialRefs: [], updatedAt: NEXT },
      { ...original, nodeId: 'other-node' as MaterialBookNode['nodeId'], materialRefs: [...original.materialRefs], updatedAt: NEXT },
    ];
    await expect(writerFor(repository).fork(command())).resolves.toMatchObject({
      status: 'replayed',
      placement: { state: 'moved', currentNodeId: 'other-node' },
    });

    state.nodes = state.nodes.map((node) => ({ ...node, materialRefs: [] }));
    await expect(writerFor(repository).fork(command())).resolves.toMatchObject({
      status: 'replayed',
      placement: { state: 'removed' },
    });
    expect(state.patchCalls).toBe(1);
  });

  it('rejects unknown receipt fields and divergent non-null context fingerprints', async () => {
    const unknown = createRepository();
    await writerFor(unknown.repository).fork(command());
    const unknownReceipt = structuredClone(unknown.state.receipt) as Record<string, unknown>;
    unknown.state.receipt = { ...unknownReceipt, unexpected: true };
    await expect(writerFor(unknown.repository).fork(command())).rejects.toMatchObject({
      code: 'fork-state-inconsistent',
    });
    expect(unknown.state.patchCalls).toBe(1);

    const divergent = createRepository();
    await writerFor(divergent.repository).fork(command());
    const divergentReceipt = structuredClone(divergent.state.receipt) as {
      source: Record<string, unknown>;
    };
    divergentReceipt.source.contextFingerprint = `sha256:${'c'.repeat(43)}`;
    divergent.state.receipt = divergentReceipt;
    await expect(writerFor(divergent.repository).fork(command())).rejects.toMatchObject({
      code: 'fork-state-inconsistent',
    });
    expect(divergent.state.patchCalls).toBe(1);
  });

  it('leaves every durable product untouched when the single patch fails', async () => {
    const { repository, state } = createRepository();
    state.patchMode = 'always-fail';
    const before = structuredClone(state);
    await expect(writerFor(repository).fork(command())).rejects.toMatchObject({ code: 'fork-commit-failed' });
    expect(state.patchCalls).toBe(2);
    expect(state.metadata).toEqual(before.metadata);
    expect(state.nodes).toEqual(before.nodes);
    expect(state.artifacts).toEqual(before.artifacts);
    expect(state.receipt).toBe(before.receipt);
  });

  it('does not create a second deterministic product for a duplicate or divergent operation', async () => {
    const { repository, state } = createRepository();
    await writerFor(repository).fork(command());
    state.repositoryCallKinds = [];
    await expect(writerFor(repository).fork(command())).resolves.toMatchObject({ status: 'replayed' });
    expect(state.repositoryCallKinds[0]).toBe('receipt');
    await expect(writerFor(repository).fork({ ...command(), target: { ...command().target, placementId: 'different-placement' } }))
      .rejects.toMatchObject({ code: 'operation-conflict' });
    expect(state.patchCalls).toBe(1);
  });
});

describe('canonical fork rule composition', () => {
  const effectiveOperation = (
    operations: readonly { path: string; rule: string; merge?: string; expression: string }[],
    path: string,
    rule: string,
    merge: string,
  ) => {
    const matches = operations.filter((entry) =>
      entry.path === path
      && entry.rule === rule
      && entry.merge === merge);
    if (matches.length !== 1) {
      throw new Error(`Expected one operation for ${path} ${rule} with ${merge}`);
    }
    return matches[0]!;
  };

  const canonicalCapabilityOperation = (
    operations: readonly { path: string; rule: string; merge?: string; expression: string }[],
    path: string,
    rule: string,
  ) => effectiveOperation(
    operations,
    path,
    rule,
    'conjoin-existing-authorization-canonical-fork-scalar-pinned-server-capability',
  );

  it('keeps #44 inactive, removes retired persistence, and denies ancestor writes/deletes', () => {
    expect(fragment44.status).toBe('inactive');
    expect(fragment44.activation).toBe('deny-only-until-118-composition');
    const serialized = JSON.stringify(fragment44);
    expect(serialized).not.toMatch(/public_reference_placements|fork_history|BookActivity|fork material|candidate|draft persistence/i);
    expect(serialized).not.toContain('auth.token.public_book_canonical_fork_');
    expect(serialized).toContain('auth.token.pbcf.s');
    expect(fragment44.operations.filter((entry) => entry.expression === 'false').map((entry) => entry.path)).toEqual(expect.arrayContaining([
      'book_activity/canonical_fork_operations',
      'material_catalog/books',
      'material_catalog/book_nodes',
      'material_catalog/book_indexes',
      'material_catalog/material_summary_indexes/v1',
    ]));
    const receipt = canonicalCapabilityOperation(
      fragment44.operations,
      'book_activity/canonical_fork_operations/$actorId/$operationId',
      '.write',
    );
    expect(receipt?.expression).toContain("!data.exists()");
    expect(receipt?.expression).toContain("newData.child('canonicalFingerprint').val() == auth.token.pbcf.cf");
    expect(receipt.expression).toContain("newData.child('source/sourcePages').hasChildren()");
    expect(receipt.expression).toContain("newData.child('source/placementIds').hasChildren()");
    expect(receipt.expression).toContain("newData.child('source/pageGroupKeys').hasChildren()");
    expect(receipt.expression).toContain('auth.token.pbcf.dl >= now');
    const node = canonicalCapabilityOperation(
      fragment44.operations,
      'material_catalog/book_nodes/$bookId/$nodeId',
      '.write',
    );
    expect(node.expression).toContain("newData.child('materialRefs').child('' + auth.token.pbcf.ri).child('refId').val() == auth.token.pbcf.tp");
    expect(node.expression).toContain("newData.child('materialRefs').child('' + auth.token.pbcf.ri).child('materialKind').val() == 'interactive-activity'");
    expect(node?.expression).toContain("newData.child('title').val() == data.child('title').val()");
    expect(node?.expression).toContain("newData.child('createdAt').val() == data.child('createdAt').val()");
    const nodeRef = effectiveOperation(
      fragment44.operations,
      'material_catalog/book_nodes/$bookId/$nodeId/materialRefs/$refIndex',
      '.validate',
      'replace-scalar-immutable-existing-or-server-capability-append',
    );
    expect(nodeRef.expression).toContain("newData.child('testTypeIdsSnapshot').hasChildren()");
    expect(nodeRef.expression).toContain("!newData.child('testTypeIdsSnapshot').exists()");
    expect(nodeRef.expression).not.toContain('testTypeIdsSnapshot/0');
    expect(nodeRef.expression).toContain("$refIndex == '' + auth.token.pbcf.ri");
    const book = canonicalCapabilityOperation(fragment44.operations, 'material_catalog/books/$bookId', '.write');
    expect(book?.expression).toContain("newData.child('title').val() == data.child('title').val()");
    expect(book.expression).not.toContain("newData.child('testTypeIds')");
    expect(book?.expression).toContain("newData.child('updatedAt').val() == auth.token.pbcf.ct");
    expect(book?.expression).toContain("newData.child('status').val() == auth.token.pbcf.bs");
    const summary = canonicalCapabilityOperation(
      fragment44.operations,
      'material_catalog/material_summary_indexes/v1/by_id/$materialId',
      '.write',
    );
    expect(summary?.expression).toContain('pbcf.tb == $materialId');
    expect(summary?.expression).toContain("newData.child('materialKind').val() == 'book'");
    expect(summary?.expression).toContain("newData.child('producerId').val() == 'material-book'");
    expect(summary?.expression).toContain("newData.child('surfaceFamily').val() == 'book'");
    expect(summary?.expression).toContain("newData.child('visibility').val() == 'private'");
    expect(summary.expression).not.toContain("child('testTypeMembership')");
    expect(summary.expression).not.toContain("child('testTypeIds')");
    expect(summary.expression).not.toContain("child('tags')");
    expect(summary.expression).toContain("data.exists() && newData.exists()");
  });

  it('selects scalar-pinned server-capability operations without composite exactness claims', () => {
    const canonical = canonicalCapabilityOperation(
      fragment16A.operations,
      'book_activity/versions/$activityId/$versionId',
      '.write',
    );
    const safe = canonicalCapabilityOperation(
      fragment16A.operations,
      'book_activity/student_safe_projections/$activityId/$versionId',
      '.write',
    );
    const canonicalRead = effectiveOperation(
      fragment16A.operations,
      'book_activity/versions/$activityId/$versionId',
      '.read',
      'replace-exact-deny',
    );
    expect(canonicalRead.expression).not.toContain('newData');
    expect(canonicalRead.expression).not.toContain('!data.exists()');
    expect(canonical.expression).toContain("!data.exists()");
    expect(canonical.expression).toContain("newData.hasChildren(['schemaVersion', 'lifecycle', 'activityId'");
    expect(canonical.expression).toContain("newData.child('activityVersion').val() == 1");
    expect(canonical.expression).not.toContain("newData.child('activity').val()");
    expect(canonical.expression).toContain("newData.child('provenance/sourcePlacementIds').hasChildren()");
    expect(canonical.expression).toContain("newData.child('provenance/selectionPath').hasChildren()");
    expect(canonical.expression).not.toContain('sourcePlacementIds/0');
    expect(canonical.expression).not.toContain('selectionPath/0');
    expect(canonical.expression).toContain('auth.token.pbcf.dl >= now');
    expect(safe.expression).toContain("!data.exists()");
    expect(safe.expression).toContain("newData.hasChildren(['schemaVersion', 'projectionKind', 'activityId'");
    expect(safe.expression).toContain("newData.child('projectionKind').val() == 'student-safe'");
    expect(safe.expression).not.toContain("newData.child('content').val()");
    expect(safe.expression).toContain("newData.child('publishedAt').val() == auth.token.pbcf.ct");
    expect(fragment16A.operations.map((entry) => entry.path)).toEqual(expect.arrayContaining([
      'book_activity/versions/$activityId/$versionId/$other',
      'book_activity/versions/$activityId/$versionId/provenance/$other',
      'book_activity/student_safe_projections/$activityId/$versionId/$other',
    ]));
    expect(fragment44.operations.map((entry) => entry.path)).toEqual(expect.arrayContaining([
      'book_activity/canonical_fork_operations/$actorId/$operationId/$other',
      'material_catalog/books/$bookId/$other',
      'material_catalog/book_nodes/$bookId/$nodeId/$other',
    ]));
    for (const fragment of [fragment16A, fragment20A, fragment44]) {
      expect(fragment.operations.every((entry) => !entry.expression.includes('numChildren'))).toBe(true);
    }
    const targetNodeWrite = effectiveOperation(
      fragment44.operations,
      'material_catalog/book_nodes/$bookId/$nodeId',
      '.write',
      'conjoin-existing-authorization-canonical-fork-scalar-pinned-server-capability',
    );
    const appendedRefValidation = effectiveOperation(
      fragment44.operations,
      'material_catalog/book_nodes/$bookId/$nodeId/materialRefs/$refIndex',
      '.validate',
      'replace-scalar-immutable-existing-or-server-capability-append',
    );
    expect(targetNodeWrite.expression).toContain("auth.token.pbcf.ri");
    expect(targetNodeWrite.expression).not.toContain("data.child('updatedAt').val() == auth.token.pbcf.eu");
    expect(appendedRefValidation.expression).toContain("$refIndex == '' + auth.token.pbcf.ri");
    expect(appendedRefValidation.expression).not.toContain("$refIndex == '' + auth.token.pbcf.ao");
    const capabilityWrites = [fragment16A, fragment44].flatMap((fragment) =>
      fragment.operations.filter((entry) =>
        entry.rule === '.write' && entry.expression.includes('auth.token.pbcf.s == true')));
    expect(capabilityWrites.length).toBeGreaterThan(0);
    expect(capabilityWrites.every((entry) =>
      entry.expression.includes('auth.token.pbcf.dl >= now'))).toBe(true);
    expect(JSON.stringify([fragment16A, fragment44])).not.toMatch(/primitive-safe|auth\.token\.pbcf\.(rt|selp|pg|bm)/u);
  });

  it('excludes the fork claim from the ordinary Book ancestor grant', () => {
    const ordinaryBookWrite = effectiveOperation(
      fragment20A.operations,
      'material_catalog/books/$bookId',
      '.write',
      'conjoin-existing-authorization',
    );
    expect(ordinaryBookWrite.expression).toContain(
       'auth.token.pbcf.s != true',
    );
  });
});

describe('canonical fork Worker gate', () => {
  const request = (body: Record<string, unknown>) => new Request(
    'https://worker.test/v1/public-book-reference-fork',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  );

  const body = {
    action: 'fork',
    operationId: '00000000-0000-4000-8000-000000000107',
    target: { bookId: 'target-book', nodeId: 'target-node', placementId: 'placement-target' },
    selection: command().selection,
  };

  it('returns 503 before authoritative role, service, token, or storage construction while disabled', async () => {
    let roleLookups = 0;
    let serviceLookups = 0;
    let storeLookups = 0;
    const options = {
      enabled: true,
      canonicalForkEnabled: false,
      canonicalForkMutationsEnabled: true,
      resolveCanonicalForkRole: async () => {
        roleLookups += 1;
        return 'teacher' as const;
      },
    };
    Object.defineProperty(options, 'service', {
      get: () => {
        serviceLookups += 1;
        throw new Error('service should not be constructed');
      },
    });
    Object.defineProperty(options, 'store', {
      get: () => {
        storeLookups += 1;
        throw new Error('storage should not be constructed');
      },
    });
    const handlers = createPublicBookReferenceForkWorkerHandlers(options);
    const result = await handlers.handle({
      request: request(body),
      env: {},
      uid: 'teacher-target',
      role: 'student',
    });
    expect(result.init.status).toBe(503);
    expect(result.body).toEqual({ code: 'fork-disabled' });
    expect(roleLookups).toBe(0);
    expect(serviceLookups).toBe(0);
    expect(storeLookups).toBe(0);
  });

  it('uses server-derived role authority before constructing the canonical service', async () => {
    let storeLookups = 0;
    const options = {
      enabled: true,
      canonicalForkEnabled: true,
      canonicalForkMutationsEnabled: true,
      resolveCanonicalForkRole: async () => 'student' as const,
    };
    Object.defineProperty(options, 'store', {
      get: () => {
        storeLookups += 1;
        throw new Error('storage should not be constructed for a denied actor');
      },
    });
    const handlers = createPublicBookReferenceForkWorkerHandlers(options);
    const result = await handlers.handle({
      request: request(body),
      env: {},
      uid: 'teacher-target',
      role: 'teacher',
    });
    expect(result.init.status).toBe(403);
    expect(result.body).toEqual({ code: 'role-denied' });
    expect(storeLookups).toBe(0);
  });

  it('keeps compatibility mutations default-off even when rollout is enabled', async () => {
    const handlers = createPublicBookReferenceForkWorkerHandlers({
      enabled: true,
      store: {} as PublicBookReferenceForkStore,
    });
    const result = await handlers.handle({
      request: request({
        action: 'reference',
        operationId: '00000000-0000-4000-8000-000000000108',
        target: body.target,
        selection: body.selection,
        context: { mode: 'none' },
      }),
      env: { PUBLIC_BOOK_REFERENCE_FORK_ENABLED: 'true' },
      uid: 'teacher-target',
      role: 'teacher',
    });
    expect(result.init.status).toBe(503);
    expect(result.body).toEqual({ code: 'feature-disabled' });
  });
});
