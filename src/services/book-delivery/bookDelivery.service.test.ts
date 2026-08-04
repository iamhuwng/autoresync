import { describe, expect, it } from 'vitest';
import { createBookDeliveryBinding } from './bookDelivery.entitlementFactory';
import { InMemoryBookDeliveryRepository } from './bookDelivery.entitlementRepository';
import {
  createBookDeliveryProjectionResolver,
  BookDeliveryProjectionError,
} from './bookDelivery.service';
import type { BookDeliveryRepository } from './bookDelivery.entitlement';

const operation = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const now = '2026-07-27T00:00:00.000Z';

const publication = (strategy: 'full_pdf' | 'component_pdfs' = 'full_pdf') => ({
  bookId: 'book-pdf-1',
  bookMode: 'pdf' as const,
  bookRevision: 3,
  publicationId: strategy === 'full_pdf' ? 'publication-full' : 'publication-component',
  publicationRevision: 4,
  publicationStatus: 'published' as const,
  ownerId: 'teacher-1',
  scope: { kind: 'subtree' as const, nodeKeys: ['unit-1'], placementIds: [] },
  outline: [
    { nodeKey: 'section-1', parentNodeKey: null, nodeType: 'section' as const, order: 1, titleSnapshot: 'Section 1' },
    { nodeKey: 'unit-1', parentNodeKey: 'section-1', nodeType: 'unit' as const, order: 1, titleSnapshot: 'Unit 1' },
  ],
  sourceSet: {
    strategy,
    sources: strategy === 'full_pdf'
      ? [{
        sourceKey: 'full',
        sourceVersionId: 'source-full-v1',
        lifecycle: 'verified-usable' as const,
        localPageScope: { kind: 'all' as const, pages: [] },
      }]
      : [
        {
          sourceKey: 'component-a',
          sourceVersionId: 'source-a-v1',
          lifecycle: 'verified-usable' as const,
          ownerNodeKey: 'section-1',
          sourceOrder: 1,
          localPageScope: { kind: 'pages' as const, pages: [1, 2] },
        },
        {
          sourceKey: 'component-b',
          sourceVersionId: 'source-b-v1',
          lifecycle: 'verified-usable' as const,
          ownerNodeKey: 'section-1',
          sourceOrder: 2,
          localPageScope: { kind: 'pages' as const, pages: [1] },
        },
      ],
  },
  placements: strategy === 'full_pdf'
    ? [{
      placementId: 'placement-1',
      activityId: 'activity-1',
      activityVersionId: 'activity-1-v2',
      activityVersion: 2,
      nodeKey: 'unit-1',
      order: 1,
      contextMode: 'required' as const,
      pageGroupKeys: ['group-1'],
      sourcePageScopes: [{ sourceKey: 'full', pages: [1] }],
    }]
    : [
      {
        placementId: 'placement-a',
        activityId: 'activity-a',
        activityVersionId: 'activity-a-v1',
        activityVersion: 1,
        nodeKey: 'unit-1',
        order: 1,
        contextMode: 'required' as const,
        pageGroupKeys: ['group-a'],
        sourcePageScopes: [{ sourceKey: 'component-a', pages: [1] }],
      },
      {
        placementId: 'placement-b',
        activityId: 'activity-b',
        activityVersionId: 'activity-b-v1',
        activityVersion: 1,
        nodeKey: 'unit-1',
        order: 2,
        contextMode: 'required' as const,
        pageGroupKeys: ['group-b'],
        sourcePageScopes: [{ sourceKey: 'component-b', pages: [1] }],
      },
    ],
  schedulePolicy: { policyId: 'schedule-1', policyRevision: 1, basis: 'immutable-reference' as const },
});

const draftBinding = (strategy: 'full_pdf' | 'component_pdfs' = 'full_pdf') => createBookDeliveryBinding({
  bindingId: `binding-${strategy}`,
  revision: 1,
  status: 'draft',
  recipient: { recipientId: 'student-1', recipientKind: 'student' },
  issuer: { ownerId: 'teacher-1', authorityBoundary: 'book-owner' },
  context: { kind: 'homework', contextId: 'homework-1', recipientId: 'student-1', ownerId: 'teacher-1', entitlementBasis: 'assignment' },
  publication: publication(strategy),
  createdAt: now,
});

const activatedRepository = async (strategy: 'full_pdf' | 'component_pdfs' = 'full_pdf') => {
  const repository = new InMemoryBookDeliveryRepository();
  const binding = draftBinding(strategy);
  await repository.createDraft({ binding, operationId: operation(strategy === 'full_pdf' ? 1 : 3), now });
  await repository.activate({
    bindingId: binding.bindingId,
    expectedRecordRevision: 0,
    operationId: operation(strategy === 'full_pdf' ? 2 : 4),
    now,
  });
  return repository;
};

describe('Book Delivery projection resolver', () => {
  it('resolves a bounded full-PDF runtime projection from the active current binding', async () => {
    const repository = await activatedRepository('full_pdf');
    const projection = await createBookDeliveryProjectionResolver({ repository }).resolve({
      recipientId: 'student-1',
      contextId: 'homework-1',
      actor: { uid: 'student-1' },
    });

    expect(projection).toMatchObject({
      schemaVersion: 1,
      projectionKind: 'book-runtime-delivery',
      bindingId: 'binding-full_pdf',
      recipientId: 'student-1',
      book: {
        publicationId: 'publication-full',
        publicationRevision: 4,
        publicationStatus: 'published',
      },
      actionFlags: { canAutosave: true, canSubmit: true, canReview: false },
      provenance: {
        publicationId: 'publication-full',
        publicationRevision: 4,
        bindingId: 'binding-full_pdf',
        bindingRevision: 1,
      },
    });
    expect(projection.documentRequests).toEqual([{
      sourceKey: 'full',
      sourceVersionId: 'source-full-v1',
      opaqueRouteKey: 'binding-full_pdf-1-full-source-full-v1',
      localPageScope: { kind: 'all', pages: [] },
    }]);
    expect(projection.outline).toEqual([
      { nodeKey: 'section-1', parentNodeKey: null, nodeType: 'section', order: 1, titleSnapshot: 'Section 1' },
      { nodeKey: 'unit-1', parentNodeKey: 'section-1', nodeType: 'unit', order: 1, titleSnapshot: 'Unit 1' },
    ]);
    expect(projection.activities).toEqual([
      expect.objectContaining({
        placementId: 'placement-1',
        activityId: 'activity-1',
        activityVersion: 2,
        activityVersionId: 'activity-1-v2',
        sourceContext: expect.objectContaining({ pageGroupKeys: ['group-1'] }),
      }),
    ]);
    expect(JSON.stringify(projection)).not.toMatch(/answerKey|teacher|objectKey|credential|private|providerAuthority|storage/iu);
  });

  it('preserves component order, owner, and source-local page identity without collisions', async () => {
    const repository = await activatedRepository('component_pdfs');
    const projection = await createBookDeliveryProjectionResolver({ repository }).resolve({
      recipientId: 'student-1',
      contextId: 'homework-1',
      actor: { uid: 'student-1' },
    });

    expect(projection.sourceSet).toMatchObject({
      strategy: 'component_pdfs',
      sources: [
        { sourceKey: 'component-a', sourceVersionId: 'source-a-v1', ownerNodeKey: 'section-1', sourceOrder: 1 },
        { sourceKey: 'component-b', sourceVersionId: 'source-b-v1', ownerNodeKey: 'section-1', sourceOrder: 2 },
      ],
    });
    expect(projection.documentRequests.map((request) => request.opaqueRouteKey)).toEqual([
      'binding-component_pdfs-1-component-a-source-a-v1',
      'binding-component_pdfs-1-component-b-source-b-v1',
    ]);
    expect(projection.activities.map((activity) => activity.sourceContext.sourcePageScopes)).toEqual([
      [{ sourceKey: 'component-a', pages: [1] }],
      [{ sourceKey: 'component-b', pages: [1] }],
    ]);
    expect(projection.activities.map((activity) => activity.activityVersionId)).toEqual([
      'activity-a-v1',
      'activity-b-v1',
    ]);
    expect(projection.activities.map((activity) => activity.sourceContext.pageGroupKeys)).toEqual([
      ['group-a'],
      ['group-b'],
    ]);
    expect(projection.activities[0]?.sourceContext.description).toContain('component component-a pages 1 owned by section-1');
    expect(projection.activities[1]?.sourceContext.description).toContain('component component-b pages 1 owned by section-1');
  });

  it('fails closed for cross-user, missing, stale, or unpublished current state', async () => {
    const repository = await activatedRepository('full_pdf');
    const resolver = createBookDeliveryProjectionResolver({ repository });

    await expect(resolver.resolve({
      recipientId: 'student-1',
      contextId: 'homework-1',
      actor: { uid: 'student-2' },
    })).rejects.toThrow(new BookDeliveryProjectionError('book-delivery-forbidden', 403));

    await expect(resolver.resolve({
      recipientId: 'student-1',
      contextId: 'missing-context',
      actor: { uid: 'student-1' },
    })).rejects.toThrow(new BookDeliveryProjectionError('book-delivery-not-found', 404));

    const staleRepository = Object.create(repository) as BookDeliveryRepository;
    staleRepository.resolveCurrent = async () => {
        const current = await repository.resolveCurrent('student-1', 'homework-1');
        if (!current) return null;
        return {
          record: {
            ...current.record,
            binding: {
              ...current.record.binding,
              book: { ...current.record.binding.book, publicationStatus: 'draft' as never },
            },
          },
          pointer: current.pointer,
        };
    };
    await expect(createBookDeliveryProjectionResolver({ repository: staleRepository }).resolve({
      recipientId: 'student-1',
      contextId: 'homework-1',
      actor: { uid: 'student-1' },
    })).rejects.toThrow(new BookDeliveryProjectionError('book-delivery-stale-binding', 409));

    const courseBinding = createBookDeliveryBinding({
      bindingId: 'binding-course',
      revision: 1,
      status: 'active',
      recipient: { recipientId: 'student-1', recipientKind: 'student' },
      issuer: { ownerId: 'teacher-1', authorityBoundary: 'book-owner' },
      context: {
        kind: 'course',
        contextId: 'course-1',
        recipientId: 'student-1',
        ownerId: 'teacher-1',
        entitlementBasis: 'enrollment',
      },
      publication: publication(),
      createdAt: now,
    });
    const courseRepository = Object.create(repository) as BookDeliveryRepository;
    courseRepository.resolveCurrent = async () => ({
      record: {
        binding: courseBinding,
        recordRevision: 1,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
      pointer: {
        bindingId: courseBinding.bindingId,
        bindingRevision: courseBinding.revision,
        recipientId: 'student-1',
        contextId: 'course-1',
        contextKind: 'course',
        status: 'active',
        updatedAt: now,
      },
    });
    await expect(createBookDeliveryProjectionResolver({ repository: courseRepository }).resolve({
      recipientId: 'student-1',
      contextId: 'course-1',
      actor: { uid: 'student-1' },
    })).rejects.toThrow(new BookDeliveryProjectionError('book-delivery-unsupported-context', 422));
    await expect(createBookDeliveryProjectionResolver({
      repository: courseRepository,
      allowedAdapterContexts: ['course'],
    }).resolve({
      recipientId: 'student-1',
      contextId: 'course-1',
      actor: { uid: 'student-1' },
    })).resolves.toMatchObject({
      recipientId: 'student-1',
      context: { kind: 'course', contextId: 'course-1' },
    });
  });
});
