import { describe, expect, it, vi } from 'vitest';
import { normalizeActivity } from '../book-activity/activityCanonical.service';
import { projectStudentActivity } from '../book-activity/activityProjection.service';
import { createInMemoryPublicBookReferenceForkStore } from './publicBookReferenceFork.repository';
import {
  createPublicBookReferenceForkService,
  PublicBookReferenceForkError,
} from './publicBookReferenceFork.service';
import type { EditableActivity, NormalizedActivity } from '../../types/bookActivity.types';
import type {
  PublicBookReferenceForkStore,
  PublicBookSelectionRequest,
  PublicBookSelectionSnapshot,
} from './publicBookReferenceFork.types';

const now = '2026-08-05T00:00:00.000Z';

const editable = (contextMode: 'none' | 'optional' | 'required' = 'none'): EditableActivity => ({
  schemaVersion: 1,
  title: 'Source activity',
  taskProfile: null,
  presentationMode: 'structured' as const,
  contextRequirement: {
    mode: contextMode,
    acceptedKinds: contextMode === 'none' ? [] : ['book-pages'],
  },
  instructions: [{ text: 'Choose the best answer.' }],
  stimulus: null,
  assetRefs: [],
  interaction: { family: 'choice', variant: 'single-choice' },
  interactions: [{
    prompt: 'Which answer is correct?',
    options: ['A', 'B'],
    acceptedOptionIndexes: [0],
  }],
  answerRule: {
    defaultPoints: 1,
    normalization: 'exact',
    requiredSelectionCount: 1,
  },
  scoring: { mode: 'auto-where-possible' },
});

const sourceActivity = (
  contextRequirement: 'none' | 'optional' | 'required' = 'none',
): NormalizedActivity => {
  let next = 0;
  return normalizeActivity(editable(contextRequirement), { createId: () => 'hidden-' + (++next) });
};

const publicActivity = (
  activity: NormalizedActivity,
  activityId: string,
  versionId: string,
  order: number,
  selectionPath: readonly string[],
): PublicBookSelectionSnapshot['activities'][number] => ({
  activityId,
  versionId,
  title: activity.title,
  order,
  selectionPath,
  projection: projectStudentActivity(activity),
});

const sourceBook = (overrides: Partial<PublicBookSelectionSnapshot> = {}): PublicBookSelectionSnapshot => {
  const activity = sourceActivity();
  return {
    bookId: 'source-book',
    title: 'Public source Book',
    publicTree: true,
    publication: {
      publicationId: 'publication-1',
      revision: 1,
      status: 'trusted',
      publishedAt: now,
      updatedAt: now,
    },
    source: {
      sourceVersionId: 'source-pdf-1',
      lifecycleState: 'ready',
      studentSafeStatus: 'ready',
      documentDeliveryStatus: 'ready',
    },
    nodes: [{
      nodeId: 'unit-1',
      nodeKind: 'unit',
      title: 'Unit 1',
      order: 0,
      selectionPath: ['unit-1'],
    }],
    activities: [publicActivity(activity, 'source-activity', 'source-version-1', 0, ['unit-1'])],
    ...overrides,
  };
};

const targetBook = {
  bookId: 'target-book',
  ownerId: 'teacher-1',
  revision: 1,
  status: 'draft' as const,
};

const activitySelection = (versionId = 'source-version-1'): PublicBookSelectionRequest => ({
  sourceBookId: 'source-book',
  publicationId: 'publication-1',
  publicationRevision: 1,
  kind: 'activity',
  selectionPath: ['unit-1'],
  activities: [{ activityId: 'source-activity', activityVersionId: versionId, order: 0 }],
});

const mutationInput = (selection = activitySelection()) => ({
  actorId: 'teacher-1',
  target: { bookId: 'target-book', nodeId: 'target-unit', placementId: 'target-placement' },
  selection,
});

const setup = (source = sourceBook()) => {
  const store = createInMemoryPublicBookReferenceForkStore({
    publicBooks: { [source.bookId]: source },
    targetBooks: { [targetBook.bookId]: targetBook },
    entitlements: {
      'student-1:entitlement-1': {
        entitlementId: 'entitlement-1',
        studentId: 'student-1',
        bookId: source.bookId,
        sourceVersionId: source.source.sourceVersionId,
        publicationId: source.publication.publicationId,
        publicationRevision: source.publication.revision,
        status: 'active',
        contextId: 'library-1',
        authorizedSelectionPaths: [['unit-1']],
      },
    },
  });
  const service = createPublicBookReferenceForkService({
    store,
    now: () => now,
    mutationsEnabled: true,
    createId: (() => {
      const counters = new Map<string, number>();
      return (kind: string) => {
        const next = (counters.get(kind) ?? 0) + 1;
        counters.set(kind, next);
        return kind + '-' + next;
      };
    })(),
    documentIssuer: {
      issue: async () => ({
        resourcePath: '/v1/book-delivery/documents/document-1',
        expiresAt: '2026-08-05T00:05:00.000Z',
        byteSize: 120,
        contentType: 'application/pdf' as const,
      }),
    },
  });
  return { store, service };
};

describe('public Book reference/fork vertical', () => {
  it('classifies metadata-only, runtime-blocked, and playable states deterministically', async () => {
    const metadata = setup(sourceBook({ publicTree: false })).service;
    await expect(metadata.resolve({
      actorId: 'student-1',
      role: 'student',
      selection: activitySelection(),
      entitlementId: 'entitlement-1',
    })).resolves.toMatchObject({ publicState: 'metadata-only' });

    const blocked = setup(sourceBook({
      source: {
        sourceVersionId: 'source-pdf-1',
        lifecycleState: 'blocked',
        studentSafeStatus: 'ready',
        documentDeliveryStatus: 'ready',
      },
    })).service;
    await expect(blocked.resolve({
      actorId: 'student-1',
      role: 'student',
      selection: activitySelection(),
      entitlementId: 'entitlement-1',
    })).resolves.toMatchObject({ publicState: 'tree-public-runtime-blocked' });

    const { service } = setup();
    await expect(service.browse({
      actorId: 'teacher-1',
      role: 'teacher',
      bookId: 'source-book',
    })).resolves.toMatchObject({ publicState: 'tree-public-runtime-blocked' });
    await expect(service.browse({
      actorId: 'student-1',
      role: 'student',
      bookId: 'source-book',
    })).rejects.toMatchObject({ code: 'teacher-catalog-only' });
    await expect(service.resolve({
      actorId: 'student-1',
      role: 'student',
      selection: activitySelection(),
      entitlementId: 'entitlement-1',
    })).resolves.toMatchObject({ publicState: 'playable' });
  });

  it('denies wrong publication/version, owner, entitlement, and unsafe source context', async () => {
    const { service } = setup();
    await expect(service.resolve({
      actorId: 'student-1',
      role: 'student',
      selection: activitySelection('source-version-old'),
    })).rejects.toMatchObject({ code: 'selection-version-mismatch' });
    await expect(service.prepareRuntime({
      actorId: 'student-2',
      role: 'student',
      selection: activitySelection(),
      entitlementId: 'entitlement-1',
    })).rejects.toMatchObject({ code: 'entitlement-invalid' });
    await expect(service.reference({
      ...mutationInput(),
      actorId: 'teacher-2',
    })).rejects.toMatchObject({ code: 'target-owner-denied' });
    await expect(service.fork(mutationInput())).rejects.toMatchObject({
      code: 'fork-disabled',
      statusCode: 503,
    });
  });

  it('prepares an opaque document only for an entitled student-safe runtime', async () => {
    const { service } = setup();
    const runtime = await service.prepareRuntime({
      actorId: 'student-1',
      role: 'student',
      selection: activitySelection(),
      entitlementId: 'entitlement-1',
    });
    expect(runtime).toMatchObject({
      bookId: 'source-book',
      sourceVersionId: 'source-pdf-1',
      document: { resourcePath: '/v1/book-delivery/documents/document-1' },
    });
    expect(JSON.stringify(runtime)).not.toMatch(/objectKey|provider|privateAsset|bucket|answerKey|teacherNotes/i);
  });

  it('creates a pinned reference without creating a teacher-owned fork', async () => {
    const { service, store } = setup();
    const reference = await service.reference(mutationInput());
    expect(reference).toMatchObject({
      recordKind: 'public-book-reference',
      revision: 1,
      source: {
        bookId: 'source-book',
        publicationId: 'publication-1',
        publicationRevision: 1,
        activities: [{ activityId: 'source-activity', activityVersionId: 'source-version-1' }],
      },
    });
    expect(JSON.stringify(reference)).not.toMatch(/objectKey|provider|answerKey|teacherNotes/i);

    expect(store.snapshot().currentReferences?.[reference.referenceId]?.revision).toBe(1);
  });

  it('requires an explicit identity-preserving legacy migration and rejects bare material IDs', async () => {
    const { service, store } = setup();
    const migrated = await service.migrateLegacyReference({
      actorId: 'teacher-1',
      operationId: 'migration-1',
      legacyReferenceId: 'legacy-reference-1',
      target: mutationInput().target,
      selection: activitySelection(),
      migratedAt: now,
    });
    expect(migrated.reference).toMatchObject({
      origin: 'legacy-migration',
      legacyReferenceId: 'legacy-reference-1',
      source: { publicationRevision: 1 },
    });
    expect(migrated.receipt).toMatchObject({
      mode: 'explicit-public-book-reference',
      referenceId: migrated.reference.referenceId,
    });
    expect(store.snapshot().currentReferences?.[migrated.reference.referenceId]).toBeDefined();
    await expect(service.migrateLegacyReference({
      actorId: 'teacher-1',
      operationId: 'migration-2',
      legacyReferenceId: 'legacy-reference-2',
      target: mutationInput().target,
      selection: activitySelection(),
      migratedAt: now,
      materialId: 'bare-material-id',
    } as never)).rejects.toMatchObject({ code: 'legacy-material-id-forbidden' });
  });

  it('requires accepted source context for required Activities while preserving optional none', async () => {
    const requiredVersion = sourceActivity('required');
    const source = sourceBook({
      activities: [publicActivity(requiredVersion, 'source-activity', 'source-version-1', 0, ['unit-1'])],
    });
    const { service } = setup(source);
    await expect(service.reference(mutationInput(activitySelection()))).rejects.toMatchObject({
      code: 'source-context-required',
    });
    await expect(service.reference({
      ...mutationInput(activitySelection()),
      context: {
        mode: 'book-source-reference',
        sourceBookId: 'source-book',
        sourceVersionId: 'source-pdf-1',
        selectionPath: ['unit-1'],
        pageGroupIds: ['page-1'],
      },
    })).resolves.toMatchObject({ recordKind: 'public-book-reference' });

    const incompatibleProjection = publicActivity(
      requiredVersion,
      'source-activity',
      'source-version-1',
      0,
      ['unit-1'],
    );
    const incompatible = setup(sourceBook({
      activities: [{
        ...incompatibleProjection,
        projection: {
          ...incompatibleProjection.projection,
          contextRequirement: { mode: 'required', acceptedKinds: ['reading-passage'] },
        },
      }],
    })).service;
    await expect(incompatible.reference({
      ...mutationInput(activitySelection()),
      context: {
        mode: 'book-source-reference',
        sourceBookId: 'source-book',
        sourceVersionId: 'source-pdf-1',
        selectionPath: ['unit-1'],
        pageGroupIds: ['page-1'],
      },
    })).rejects.toMatchObject({ code: 'source-context-invalid' });
  });

  it('detects newer upstream versions and rolls an adoption back without deleting history', async () => {
    const { service, store } = setup();
    const reference = await service.reference(mutationInput());
    const newerVersion = sourceActivity();
    store.replacePublicBook(sourceBook({
      publication: {
        publicationId: 'publication-1',
        revision: 2,
        status: 'trusted',
        publishedAt: now,
        updatedAt: now,
      },
      activities: [publicActivity(newerVersion, 'source-activity', 'source-version-2', 0, ['unit-1'])],
    }));
    await expect(service.status({ actorId: 'teacher-1', referenceId: reference.referenceId }))
      .resolves.toBe('newer-version-available');
    const adopted = await service.adopt({
      actorId: 'teacher-1',
      referenceId: reference.referenceId,
      expectedRevision: 1,
    });
    expect(adopted).toMatchObject({ revision: 2, operation: 'adopt', source: { publicationRevision: 2 } });
    const rolledBack = await service.rollback({
      actorId: 'teacher-1',
      referenceId: reference.referenceId,
      expectedRevision: 2,
    });
    expect(rolledBack).toMatchObject({ revision: 3, operation: 'rollback', source: { publicationRevision: 1 } });
    expect(store.snapshot().referenceRevisions?.[reference.referenceId]?.['1']?.source.publicationRevision).toBe(1);
    expect(store.snapshot().referenceRevisions?.[reference.referenceId]?.['2']?.source.publicationRevision).toBe(2);
    expect(store.snapshot().currentReferences?.[reference.referenceId]?.revision).toBe(3);
  });

  it('keeps mutation composition disabled by default', async () => {
    const { store } = setup();
    const disabled = createPublicBookReferenceForkService({ store });
    await expect(disabled.reference(mutationInput())).rejects.toMatchObject({
      code: 'feature-disabled',
    });
    await expect(disabled.fork(mutationInput())).rejects.toMatchObject({ code: 'fork-disabled' });
    const rollback = createPublicBookReferenceForkService({
      store,
      mutationsEnabled: true,
      rollbackEnabled: true,
    });
    await expect(rollback.reference(mutationInput())).rejects.toMatchObject({
      code: 'feature-rollback',
    });
  });

  it('rejects fork before any source, target, or mutation store access', async () => {
    let storeReadsOrWrites = 0;
    const store: PublicBookReferenceForkStore = {
      readPublicBook: async () => { storeReadsOrWrites += 1; return null; },
      readTargetBook: async () => { storeReadsOrWrites += 1; return null; },
      readEntitlement: async () => { storeReadsOrWrites += 1; return null; },
      readCurrentReference: async () => { storeReadsOrWrites += 1; return null; },
      readReferenceRevision: async () => { storeReadsOrWrites += 1; return null; },
      writeReferenceMutation: async () => { storeReadsOrWrites += 1; },
    };
    const service = createPublicBookReferenceForkService({ store, mutationsEnabled: true });

    await expect(service.fork(mutationInput())).rejects.toMatchObject({
      code: 'fork-disabled',
      statusCode: 503,
    });
    expect(storeReadsOrWrites).toBe(0);
  });

  it('rejects fork path IDs before any store or writer access', async () => {
    let storeReadsOrWrites = 0;
    const store: PublicBookReferenceForkStore = {
      readPublicBook: async () => { storeReadsOrWrites += 1; return null; },
      readTargetBook: async () => { storeReadsOrWrites += 1; return null; },
      readEntitlement: async () => { storeReadsOrWrites += 1; return null; },
      readCurrentReference: async () => { storeReadsOrWrites += 1; return null; },
      readReferenceRevision: async () => { storeReadsOrWrites += 1; return null; },
      writeReferenceMutation: async () => { storeReadsOrWrites += 1; },
    };
    const writer = { fork: vi.fn(async () => { throw new Error('writer must not be called'); }) };
    const service = createPublicBookReferenceForkService({
      store,
      canonicalForkEnabled: true,
      canonicalForkMutationsEnabled: true,
      canonicalForkWriter: writer,
    });

    for (const unsafeId of ['target.book', 'target:book']) {
      await expect(service.fork({
        ...mutationInput(),
        operationId: '00000000-0000-4000-8000-000000000001',
        target: { ...mutationInput().target, bookId: unsafeId },
      })).rejects.toMatchObject({ code: 'request-invalid', statusCode: 400 });
    }
    expect(storeReadsOrWrites).toBe(0);
    expect(writer.fork).not.toHaveBeenCalled();
  });

  it('delegates canonical authorization to the receipt-first writer', async () => {
    const { store } = setup();
    const writer = {
      fork: vi.fn(async (input) => {
        if (input.actorId === 'teacher-2') {
          throw new PublicBookReferenceForkError('target-owner-denied', 'Target Book ownership is invalid.', 403);
        }
        return {
          status: 'created' as const,
          operationId: input.operationId,
          activityId: 'fork-activity',
          activityVersionId: 'fork-version',
          activityVersion: 1 as const,
          placement: {
            state: 'present' as const,
            bookId: input.target.bookId,
            originalNodeId: input.target.nodeId,
            refId: input.target.placementId,
          },
        };
      }),
    };
    const service = createPublicBookReferenceForkService({
      store,
      mutationsEnabled: true,
      canonicalForkEnabled: true,
      canonicalForkMutationsEnabled: true,
      canonicalForkWriter: writer,
    });

    await expect(service.fork({
      ...mutationInput(),
      operationId: '00000000-0000-4000-8000-000000000001',
    })).resolves.toMatchObject({
      status: 'created',
      activityVersion: 1,
    });
    expect(writer.fork).toHaveBeenCalledWith(expect.objectContaining({
      actorId: 'teacher-1',
      operationId: '00000000-0000-4000-8000-000000000001',
      context: { mode: 'none' },
    }));

    await expect(service.fork({
      ...mutationInput(),
      actorId: 'teacher-2',
      operationId: '00000000-0000-4000-8000-000000000002',
    })).rejects.toMatchObject({ code: 'target-owner-denied' });
    expect(writer.fork).toHaveBeenCalledTimes(2);
  });
});
