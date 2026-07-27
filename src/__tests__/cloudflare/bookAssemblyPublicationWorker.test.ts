import { describe, expect, it } from 'vitest';
import type {
  BookAssemblyManifestCandidate,
  BookAssemblyPublicationAdapterPlan,
} from '../../types/bookAssembly.types';
import { InMemoryBookAssemblyPublicationRepository } from '../../services/book-assembly/publicationRepository';
import { createBookAssemblyPublicationWorkerHandlers } from '../../../cloudflare/src/upload-worker/book-assembly/publication-worker';

const op = (suffix: string): string => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;
const request = (body: unknown): Request => new Request('https://worker.test/book-assembly/publications', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

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

const plan = (
  publicationId = 'publication-1',
  publicationRevision = 1,
  operationId = op('1'),
): BookAssemblyPublicationAdapterPlan => {
  const body = manifest();
  return {
    strategy: 'full_pdf',
    planId: `plan-${publicationRevision}`,
    adapterTicket: 'fixture',
    ownerId: 'teacher-1',
    bookId: 'book-1',
    candidateId: 'candidate-1',
    candidateRevision: 3,
    bookRevision: 4,
    sourceSetRevision: 2,
    sourceSet: body.sourceSet,
    manifest: body,
    studentSafeProjection: {
      schemaVersion: 1,
      bookId: 'book-1',
      publicationId,
      publicationRevision,
      sourceStrategy: 'full_pdf',
      sourceSet: body.sourceSet,
      units: body.units,
    },
    atomicWrites: atomicWrites(body, publicationId, publicationRevision, operationId),
  };
};

const env = {
  BOOK_ASSEMBLY_PUBLICATION_ENABLED: 'true',
  readDatabaseValue: async () => ({ role: 'teacher' }),
};

describe('PRD0062 ticket 16A Assembly publication Worker boundary', () => {
  it('publishes and rolls back through trusted owner commands without route integration claims', async () => {
    const repository = new InMemoryBookAssemblyPublicationRepository();
    const handlers = createBookAssemblyPublicationWorkerHandlers({
      repository,
      now: () => '2026-07-27T00:00:00.000Z',
    });

    const published = await handlers.publish({
      env,
      uid: 'teacher-1',
      request: request({
        operationId: op('1'),
        expectedCurrentPublicationId: null,
        manifestVersionId: 'manifest-v1',
        publicationId: 'publication-1',
        publicationRevision: 1,
        plan: plan('publication-1', 1, op('1')),
      }),
    });
    expect(published.init.status).toBe(200);
    expect(published.body).toMatchObject({ status: 'published', pointer: { publicationId: 'publication-1' } });

    const second = await handlers.publish({
      env,
      uid: 'teacher-1',
      request: request({
        operationId: op('2'),
        expectedCurrentPublicationId: 'publication-1',
        manifestVersionId: 'manifest-v2',
        publicationId: 'publication-2',
        publicationRevision: 2,
        plan: plan('publication-2', 2, op('2')),
      }),
    });
    expect(second.init.status).toBe(200);

    const rollback = await handlers.rollback({
      env,
      uid: 'teacher-1',
      request: request({
        operationId: op('3'),
        ownerId: 'teacher-1',
        bookId: 'book-1',
        expectedCurrentPublicationId: 'publication-2',
        targetPublicationId: 'publication-1',
      }),
    });
    expect(rollback.init.status).toBe(200);
    expect(rollback.body).toMatchObject({ status: 'rolled-back', pointer: { publicationId: 'publication-1' } });
    await expect(repository.readScope('book-1')).resolves.toMatchObject({
      current: { publicationId: 'publication-1' },
      activityVersions: {
        'publication-1:activity-1:v1': { activityVersionId: 'publication-1:activity-1:v1' },
        'publication-2:activity-1:v2': { activityVersionId: 'publication-2:activity-1:v2' },
      },
      deliveryPlans: {
        'publication-1:delivery': { deliveryPlanId: 'publication-1:delivery' },
        'publication-2:delivery': { deliveryPlanId: 'publication-2:delivery' },
      },
    });
  });

  it('denies disabled publication, cross-owner command, stale CAS, and sensitive payload', async () => {
    const repository = new InMemoryBookAssemblyPublicationRepository();
    const handlers = createBookAssemblyPublicationWorkerHandlers({ repository });

    const disabled = await handlers.publish({
      env: { ...env, BOOK_ASSEMBLY_PUBLICATION_ENABLED: 'false' },
      uid: 'teacher-1',
      request: request({
        operationId: op('4'),
        expectedCurrentPublicationId: null,
        manifestVersionId: 'manifest-v1',
        publicationId: 'publication-1',
        publicationRevision: 1,
        plan: plan('publication-1', 1, op('4')),
      }),
    });
    expect(disabled).toEqual({
      body: { code: 'book_assembly_publication_disabled' },
      init: { status: 503 },
    });

    const crossOwner = await handlers.publish({
      env,
      uid: 'teacher-2',
      request: request({
        operationId: op('5'),
        expectedCurrentPublicationId: null,
        manifestVersionId: 'manifest-v1',
        publicationId: 'publication-1',
        publicationRevision: 1,
        plan: plan('publication-1', 1, op('5')),
      }),
    });
    expect(crossOwner.init.status).toBe(403);

    await handlers.publish({
      env,
      uid: 'teacher-1',
      request: request({
        operationId: op('6'),
        expectedCurrentPublicationId: null,
        manifestVersionId: 'manifest-v1',
        publicationId: 'publication-1',
        publicationRevision: 1,
        plan: plan('publication-1', 1, op('6')),
      }),
    });
    const stale = await handlers.publish({
      env,
      uid: 'teacher-1',
      request: request({
        operationId: op('7'),
        expectedCurrentPublicationId: null,
        manifestVersionId: 'manifest-v2',
        publicationId: 'publication-2',
        publicationRevision: 2,
        plan: plan('publication-2', 2, op('7')),
      }),
    });
    expect(stale).toMatchObject({
      body: { status: 'conflict', failureCode: 'stale-current-pointer' },
      init: { status: 409 },
    });

    const sensitive = await handlers.publish({
      env,
      uid: 'teacher-1',
      request: request({
        operationId: op('8'),
        expectedCurrentPublicationId: 'publication-1',
        manifestVersionId: 'manifest-v2',
        publicationId: 'publication-2',
        publicationRevision: 2,
        plan: { ...plan('publication-2', 2, op('8')), answerKey: 'leak' },
      }),
    });
    expect(sensitive).toMatchObject({
      body: { status: 'invalid', failureCode: 'sensitive-payload' },
      init: { status: 422 },
    });
  });
});
