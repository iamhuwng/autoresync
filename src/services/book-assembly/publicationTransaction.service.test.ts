import { describe, expect, it } from 'vitest';

import type {
  BookAssemblyManifestCandidate,
  BookAssemblyPublicationAdapterPlan,
} from '../../types/bookAssembly.types';
import {
  bookAssemblyActivityVersionScopeKey,
  createBookAssemblyPublicationService,
} from './publicationTransaction.service';
import { InMemoryBookAssemblyPublicationRepository } from './publicationRepository';

const op = (suffix: string): string => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

const manifest = (): BookAssemblyManifestCandidate => ({
  bookId: 'book-1',
  sourceSet: {
    sourceStrategy: 'full_pdf',
    sources: [{ sourceKey: 'full', sourceVersionId: 'source-1', sourceOrder: 1 }],
  },
  nodes: [
    { nodeKey: 'root', parentNodeKey: null, nodeType: 'section', order: 1 },
    { nodeKey: 'unit-1', parentNodeKey: 'root', nodeType: 'unit', order: 1 },
  ],
  units: [{
    unitKey: 'unit-1',
    activitySlots: [{
      activityKey: 'activity-1',
      order: 1,
      contextRequirement: 'required',
      pageGroupKeys: ['pages-1'],
    }],
    pageGroups: [{
      pageGroupKey: 'pages-1',
      sourceKey: 'full',
      pages: [1],
      activityKeys: ['activity-1'],
      mode: 'activity',
    }],
  }],
});

const atomicWrites = (
  body: BookAssemblyManifestCandidate,
  publicationId: string,
  publicationRevision: number,
  operationId: string,
) => ({
  activityVersions: [{
    schemaVersion: 1 as const,
    activityId: 'activity-1',
    activityVersionId: `${publicationId}:activity-1:v${publicationRevision}`,
    activityVersion: publicationRevision,
    ownerId: 'teacher-1',
    bookId: body.bookId,
    manifestVersionId: `manifest-v${publicationRevision}`,
    publicationId,
    publicationRevision,
    unitKey: 'unit-1',
    activityKey: 'activity-1',
    createdByCommandId: operationId,
    createdAt: '2026-07-27T00:00:00.000Z',
    sourcePages: [{ sourceKey: 'full', sourceVersionId: 'source-1', physicalPageNumber: 1 }],
    payloadFingerprint: `fnv1a64:activity000${publicationRevision}`,
  }],
  activitySafeProjections: [{
    schemaVersion: 1 as const,
    projectionId: `${publicationId}:activity-1:safe`,
    activityId: 'activity-1',
    activityVersionId: `${publicationId}:activity-1:v${publicationRevision}`,
    ownerId: 'teacher-1',
    bookId: body.bookId,
    manifestVersionId: `manifest-v${publicationRevision}`,
    publicationId,
    publicationRevision,
    placementIds: [`${publicationId}:placement-1`],
    sourcePages: [{ sourceKey: 'full', sourceVersionId: 'source-1', physicalPageNumber: 1 }],
    payloadFingerprint: `fnv1a64:safe0000000${publicationRevision}`,
  }],
  placements: [{
    schemaVersion: 1 as const,
    placementId: `${publicationId}:placement-1`,
    ownerId: 'teacher-1',
    bookId: body.bookId,
    manifestVersionId: `manifest-v${publicationRevision}`,
    publicationId,
    publicationRevision,
    unitKey: 'unit-1',
    nodeKey: 'unit-1',
    activityKey: 'activity-1',
    activityId: 'activity-1',
    activityVersionId: `${publicationId}:activity-1:v${publicationRevision}`,
    order: 1,
    pageGroupKeys: ['pages-1'],
    sourcePages: [{ sourceKey: 'full', sourceVersionId: 'source-1', physicalPageNumber: 1 }],
  }],
  unitProjections: [{
    schemaVersion: 1 as const,
    unitProjectionId: `${publicationId}:unit-1`,
    ownerId: 'teacher-1',
    bookId: body.bookId,
    manifestVersionId: `manifest-v${publicationRevision}`,
    publicationId,
    publicationRevision,
    unitKey: 'unit-1',
    placementIds: [`${publicationId}:placement-1`],
    sourcePages: [{ sourceKey: 'full', sourceVersionId: 'source-1', physicalPageNumber: 1 }],
    createdByCommandId: operationId,
    createdAt: '2026-07-27T00:00:00.000Z',
  }],
  deliveryPlans: [{
    schemaVersion: 1 as const,
    deliveryPlanId: `${publicationId}:delivery`,
    ownerId: 'teacher-1',
    bookId: body.bookId,
    manifestVersionId: `manifest-v${publicationRevision}`,
    publicationId,
    publicationRevision,
    sourceStrategy: 'full_pdf' as const,
    sourceSet: body.sourceSet,
    placementIds: [`${publicationId}:placement-1`],
    unitProjectionIds: [`${publicationId}:unit-1`],
    createdByCommandId: operationId,
    createdAt: '2026-07-27T00:00:00.000Z',
  }],
});

const adapterPlan = (
  overrides: Partial<BookAssemblyPublicationAdapterPlan> = {},
  options: { readonly operationId?: string; readonly publicationId?: string; readonly publicationRevision?: number } = {},
): BookAssemblyPublicationAdapterPlan => {
  const baseManifest = manifest();
  const publicationId = options.publicationId ?? 'publication-1';
  const publicationRevision = options.publicationRevision ?? 1;
  const operationId = options.operationId ?? op('1');
  return {
    strategy: 'full_pdf',
    planId: 'plan-1',
    adapterTicket: 'fixture',
    ownerId: 'teacher-1',
    bookId: 'book-1',
    candidateId: 'candidate-1',
    candidateRevision: 3,
    bookRevision: 4,
    sourceSetRevision: 2,
    sourceSet: baseManifest.sourceSet,
    manifest: baseManifest,
    studentSafeProjection: {
      schemaVersion: 1,
      bookId: 'book-1',
      publicationId,
      publicationRevision,
      sourceStrategy: 'full_pdf',
      sourceSet: baseManifest.sourceSet,
      units: baseManifest.units,
    },
    atomicWrites: atomicWrites(baseManifest, publicationId, publicationRevision, operationId),
    ...overrides,
  };
};

describe('Book Assembly publication transaction service', () => {
  it('atomically creates immutable manifest version, current pointer, operation, and bounded audit', async () => {
    const repository = new InMemoryBookAssemblyPublicationRepository();
    const service = createBookAssemblyPublicationService(repository);

    const result = await service.publish({
      operationId: op('1'),
      expectedCurrentPublicationId: null,
      manifestVersionId: 'manifest-v1',
      publicationId: 'publication-1',
      publicationRevision: 1,
      plan: adapterPlan(),
      now: '2026-07-27T00:00:00.000Z',
    });

    expect(result).toMatchObject({
      status: 'published',
      pointer: {
        publicationId: 'publication-1',
        publicationRevision: 1,
        manifestVersionId: 'manifest-v1',
        bookRevision: 4,
        sourceSetRevision: 2,
      },
      version: {
        lifecycle: 'published',
        candidateId: 'candidate-1',
        candidateRevision: 3,
        adapterTicket: 'fixture',
      },
      audit: {
        action: 'publish',
        status: 'committed',
        ownerId: 'teacher-1',
        bookId: 'book-1',
      },
    });
    const scope = await repository.readScope('book-1');
    expect(Object.keys(scope.versions ?? {})).toEqual(['manifest-v1']);
    expect(Object.keys(scope.activityVersions ?? {})).toEqual([
      bookAssemblyActivityVersionScopeKey('manifest-v1', 'publication-1:activity-1:v1'),
    ]);
    expect(Object.keys(scope.activitySafeProjections ?? {})).toEqual(['publication-1:activity-1:safe']);
    expect(Object.keys(scope.placements ?? {})).toEqual(['publication-1:placement-1']);
    expect(Object.keys(scope.unitProjections ?? {})).toEqual(['publication-1:unit-1']);
    expect(Object.keys(scope.deliveryPlans ?? {})).toEqual(['publication-1:delivery']);
    expect(scope.current?.publicationId).toBe('publication-1');
    expect(Object.keys(scope.operations ?? {})).toEqual([op('1')]);
    expect(JSON.stringify(scope.audits)).not.toMatch(/answer|credential|private_key|pdfBytes/iu);
  });

  it('uses a deterministic length-prefixed Activity Version reference key when IDs contain colons', () => {
    const first = bookAssemblyActivityVersionScopeKey('manifest:a', 'activity');
    const second = bookAssemblyActivityVersionScopeKey('manifest', 'a:activity');

    expect(first).toBe('m10:manifest:aa8:activity');
    expect(second).toBe('m8:manifesta10:a:activity');
    expect(first).not.toBe(second);
  });

  it('rejects adapter plans that do not carry the complete atomic write set', async () => {
    const repository = new InMemoryBookAssemblyPublicationRepository();
    const service = createBookAssemblyPublicationService(repository);
    const incomplete = adapterPlan({
      atomicWrites: {
        ...adapterPlan().atomicWrites,
        deliveryPlans: [],
      },
    });

    await expect(service.publish({
      operationId: op('10'),
      expectedCurrentPublicationId: null,
      manifestVersionId: 'manifest-v1',
      publicationId: 'publication-1',
      publicationRevision: 1,
      plan: incomplete,
      now: '2026-07-27T00:00:00.000Z',
    })).resolves.toMatchObject({
      status: 'invalid',
      failureCode: 'invalid-publication-plan',
    });
    await expect(repository.readScope('book-1')).resolves.toEqual({});
  });

  it('replays exact publish commands and rejects conflicting idempotency payloads', async () => {
    const repository = new InMemoryBookAssemblyPublicationRepository();
    const service = createBookAssemblyPublicationService(repository);
    const input = {
      operationId: op('2'),
      expectedCurrentPublicationId: null,
      manifestVersionId: 'manifest-v1',
      publicationId: 'publication-1',
      publicationRevision: 1,
      plan: adapterPlan({}, { operationId: op('2') }),
      now: '2026-07-27T00:00:00.000Z',
    };

    await expect(service.publish(input)).resolves.toMatchObject({ status: 'published' });
    await expect(service.publish(input)).resolves.toMatchObject({ status: 'replayed' });
    await expect(service.publish({
      ...input,
      publicationId: 'publication-conflict',
      plan: adapterPlan({}, { operationId: op('2'), publicationId: 'publication-conflict' }),
    })).resolves.toMatchObject({
      status: 'idempotency-conflict',
      failureCode: 'idempotency-conflict',
    });
    const scope = await repository.readScope('book-1');
    expect(Object.keys(scope.versions ?? {})).toEqual(['manifest-v1']);
  });

  it('fails closed on stale pointer, mixed strategy claims, and sensitive payload keys', async () => {
    const repository = new InMemoryBookAssemblyPublicationRepository();
    const service = createBookAssemblyPublicationService(repository);
    await service.publish({
      operationId: op('3'),
      expectedCurrentPublicationId: null,
      manifestVersionId: 'manifest-v1',
      publicationId: 'publication-1',
      publicationRevision: 1,
      plan: adapterPlan({}, { operationId: op('3') }),
      now: '2026-07-27T00:00:00.000Z',
    });

    await expect(service.publish({
      operationId: op('4'),
      expectedCurrentPublicationId: null,
      manifestVersionId: 'manifest-v2',
      publicationId: 'publication-2',
      publicationRevision: 2,
      plan: adapterPlan({
        studentSafeProjection: {
          ...adapterPlan().studentSafeProjection,
          publicationId: 'publication-2',
          publicationRevision: 2,
        },
      }, { operationId: op('4'), publicationId: 'publication-2', publicationRevision: 2 }),
      now: '2026-07-27T00:01:00.000Z',
    })).resolves.toMatchObject({
      status: 'conflict',
      failureCode: 'stale-current-pointer',
    });

    const mixedStrategy = adapterPlan({
      strategy: 'component_pdfs',
      studentSafeProjection: {
        ...adapterPlan().studentSafeProjection,
        sourceStrategy: 'component_pdfs',
      },
    });
    await expect(service.publish({
      operationId: op('5'),
      expectedCurrentPublicationId: 'publication-1',
      manifestVersionId: 'manifest-v2',
      publicationId: 'publication-2',
      publicationRevision: 2,
      plan: {
        ...mixedStrategy,
        atomicWrites: atomicWrites(manifest(), 'publication-2', 2, op('5')),
      },
      now: '2026-07-27T00:02:00.000Z',
    })).resolves.toMatchObject({
      status: 'invalid',
      failureCode: 'invalid-publication-plan',
    });

    await expect(service.publish({
      operationId: op('6'),
      expectedCurrentPublicationId: 'publication-1',
      manifestVersionId: 'manifest-v2',
      publicationId: 'publication-2',
      publicationRevision: 2,
      plan: {
        ...adapterPlan({
          studentSafeProjection: {
            ...adapterPlan().studentSafeProjection,
            publicationId: 'publication-2',
            publicationRevision: 2,
          },
        }, { operationId: op('6'), publicationId: 'publication-2', publicationRevision: 2 }),
        answerKey: 'do-not-store',
      } as unknown as BookAssemblyPublicationAdapterPlan,
      now: '2026-07-27T00:03:00.000Z',
    })).resolves.toMatchObject({
      status: 'invalid',
      failureCode: 'sensitive-payload',
    });
  });

  it('rolls current pointer back only to an existing immutable version without deleting versions', async () => {
    const repository = new InMemoryBookAssemblyPublicationRepository();
    const service = createBookAssemblyPublicationService(repository);
    await service.publish({
      operationId: op('7'),
      expectedCurrentPublicationId: null,
      manifestVersionId: 'manifest-v1',
      publicationId: 'publication-1',
      publicationRevision: 1,
      plan: adapterPlan({}, { operationId: op('7') }),
      now: '2026-07-27T00:00:00.000Z',
    });
    await service.publish({
      operationId: op('8'),
      expectedCurrentPublicationId: 'publication-1',
      manifestVersionId: 'manifest-v2',
      publicationId: 'publication-2',
      publicationRevision: 2,
      plan: adapterPlan({
        studentSafeProjection: {
          ...adapterPlan().studentSafeProjection,
          publicationId: 'publication-2',
          publicationRevision: 2,
        },
      }, { operationId: op('8'), publicationId: 'publication-2', publicationRevision: 2 }),
      now: '2026-07-27T00:01:00.000Z',
    });

    const rollbackInput = {
      operationId: op('9'),
      ownerId: 'teacher-1',
      bookId: 'book-1',
      expectedCurrentPublicationId: 'publication-2',
      targetPublicationId: 'publication-1',
      now: '2026-07-27T00:02:00.000Z',
    };
    const rolledBack = await service.rollback(rollbackInput);

    expect(rolledBack).toMatchObject({
      status: 'rolled-back',
      pointer: { publicationId: 'publication-1', manifestVersionId: 'manifest-v1' },
      audit: { action: 'rollback', status: 'committed' },
    });
    await expect(service.rollback({
      ...rollbackInput,
      now: '2026-07-27T00:03:00.000Z',
    })).resolves.toMatchObject({
      status: 'replayed',
      pointer: { publicationId: 'publication-1', manifestVersionId: 'manifest-v1' },
    });
    const scope = await repository.readScope('book-1');
    expect(Object.keys(scope.versions ?? {}).sort()).toEqual(['manifest-v1', 'manifest-v2']);
    expect(Object.keys(scope.activityVersions ?? {}).sort()).toEqual([
      bookAssemblyActivityVersionScopeKey('manifest-v1', 'publication-1:activity-1:v1'),
      bookAssemblyActivityVersionScopeKey('manifest-v2', 'publication-2:activity-1:v2'),
    ]);
    expect(Object.keys(scope.deliveryPlans ?? {}).sort()).toEqual([
      'publication-1:delivery',
      'publication-2:delivery',
    ]);
  });

  it('does not roll back to a prepared version without its committed originating operation', async () => {
    const sourceRepository = new InMemoryBookAssemblyPublicationRepository();
    const sourceService = createBookAssemblyPublicationService(sourceRepository);
    await sourceService.publish({
      operationId: op('10'),
      expectedCurrentPublicationId: null,
      manifestVersionId: 'manifest-v1',
      publicationId: 'publication-1',
      publicationRevision: 1,
      plan: adapterPlan({}, { operationId: op('10') }),
      now: '2026-07-27T00:00:00.000Z',
    });
    await sourceService.publish({
      operationId: op('11'),
      expectedCurrentPublicationId: 'publication-1',
      manifestVersionId: 'manifest-v2',
      publicationId: 'publication-2',
      publicationRevision: 2,
      plan: adapterPlan({
        studentSafeProjection: {
          ...adapterPlan().studentSafeProjection,
          publicationId: 'publication-2',
          publicationRevision: 2,
        },
      }, { operationId: op('11'), publicationId: 'publication-2', publicationRevision: 2 }),
      now: '2026-07-27T00:01:00.000Z',
    });

    const preparedScope = await sourceRepository.readScope('book-1');
    const repository = new InMemoryBookAssemblyPublicationRepository({
      'book-1': {
        ...preparedScope,
        operations: Object.fromEntries(
          Object.entries(preparedScope.operations ?? {}).filter(([operationId]) => operationId !== op('10')),
        ),
      },
    });
    const service = createBookAssemblyPublicationService(repository);

    await expect(service.rollback({
      operationId: op('12'),
      ownerId: 'teacher-1',
      bookId: 'book-1',
      expectedCurrentPublicationId: 'publication-2',
      targetPublicationId: 'publication-1',
      now: '2026-07-27T00:02:00.000Z',
    })).resolves.toMatchObject({
      status: 'not-found',
      failureCode: 'unknown-version',
    });

    await expect(repository.readScope('book-1')).resolves.toMatchObject({
      current: preparedScope.current,
    });
  });
});
