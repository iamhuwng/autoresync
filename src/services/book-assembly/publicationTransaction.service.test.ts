import { describe, expect, it } from 'vitest';

import type {
  BookAssemblyManifestCandidate,
  BookAssemblyPublicationAdapterPlan,
} from '../../types/bookAssembly.types';
import { createBookAssemblyPublicationService } from './publicationTransaction.service';
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

const adapterPlan = (
  overrides: Partial<BookAssemblyPublicationAdapterPlan> = {},
): BookAssemblyPublicationAdapterPlan => {
  const baseManifest = manifest();
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
      publicationId: 'publication-1',
      publicationRevision: 1,
      sourceStrategy: 'full_pdf',
      sourceSet: baseManifest.sourceSet,
      units: baseManifest.units,
    },
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
    expect(scope.current?.publicationId).toBe('publication-1');
    expect(Object.keys(scope.operations ?? {})).toEqual([op('1')]);
    expect(JSON.stringify(scope.audits)).not.toMatch(/answer|credential|private_key|pdfBytes/iu);
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
      plan: adapterPlan(),
      now: '2026-07-27T00:00:00.000Z',
    };

    await expect(service.publish(input)).resolves.toMatchObject({ status: 'published' });
    await expect(service.publish(input)).resolves.toMatchObject({ status: 'replayed' });
    await expect(service.publish({
      ...input,
      manifestVersionId: 'manifest-v2',
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
      plan: adapterPlan(),
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
      }),
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
      plan: mixedStrategy,
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
        }),
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
      plan: adapterPlan(),
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
      }),
      now: '2026-07-27T00:01:00.000Z',
    });

    const rolledBack = await service.rollback({
      operationId: op('9'),
      ownerId: 'teacher-1',
      bookId: 'book-1',
      expectedCurrentPublicationId: 'publication-2',
      targetPublicationId: 'publication-1',
      now: '2026-07-27T00:02:00.000Z',
    });

    expect(rolledBack).toMatchObject({
      status: 'rolled-back',
      pointer: { publicationId: 'publication-1', manifestVersionId: 'manifest-v1' },
      audit: { action: 'rollback', status: 'committed' },
    });
    const scope = await repository.readScope('book-1');
    expect(Object.keys(scope.versions ?? {}).sort()).toEqual(['manifest-v1', 'manifest-v2']);
  });
});
