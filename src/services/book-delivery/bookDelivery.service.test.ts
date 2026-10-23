import { describe, expect, it, vi } from 'vitest';
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
  manifestVersionId: 'manifest-1',
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
        sourceContext: expect.objectContaining({ pageGroupKeys: ['placement-1'] }),
      }),
    ]);
    expect(projection.pageGroups).toEqual([{ pageGroupKey: 'placement-1', combinedPhysicalPages: [1] }]);
    expect(JSON.stringify(projection)).not.toMatch(/answerKey|teacher|objectKey|credential|private|providerAuthority|storage/iu);
  });

  it('keeps full-PDF placement pages separate despite shared Unit-local group keys', async () => {
    const repository = await activatedRepository('full_pdf');
    const current = (await repository.resolveCurrent('student-1', 'homework-1'))!;
    const first = current.record.binding.placements[0]!;
    const binding = { ...current.record.binding, placements: [
      { ...first, sourcePageScopes: [{ sourceKey: 'full', pages: [1, 3] }] },
      { ...first, placementId: 'placement-2', activityId: 'activity-2', activityVersionId: 'activity-2-v1', order: 2,
        sourcePageScopes: [{ sourceKey: 'full', pages: [2] }] },
      { ...first, placementId: 'placement-3', activityId: 'activity-3', activityVersionId: 'activity-3-v1', order: 3,
        contextMode: 'none' as const, pageGroupKeys: [], sourcePageScopes: [] },
    ] };
    const before = structuredClone(binding);
    repository.resolveCurrent = vi.fn(async () => ({ ...current, record: { ...current.record, binding } }));
    const resolver = createBookDeliveryProjectionResolver({ repository });
    const input = { recipientId: 'student-1', contextId: 'homework-1', actor: { uid: 'student-1' } };
    const projection = await resolver.resolve(input);
    expect(projection.pageGroups).toEqual([
      { pageGroupKey: 'placement-1', combinedPhysicalPages: [1, 3] },
      { pageGroupKey: 'placement-2', combinedPhysicalPages: [2] },
    ]);
    expect(projection.activities.map(row => row.sourceContext.pageGroupKeys)).toEqual([['placement-1'], ['placement-2'], []]);
    expect(projection.activities.map(row => row.sourceContext.sourcePageScopes)).toEqual(binding.placements.map(row => row.sourcePageScopes));
    expect(await resolver.resolve(input)).toEqual(projection);
    expect(binding).toEqual(before);
    const configured = createBookDeliveryProjectionResolver({ repository, resolveFullPageDefaults: async () => ({ 'placement-1': 3, 'placement-2': 2 }) });
    expect((await configured.resolve(input)).pageGroups?.[0]).toEqual({ pageGroupKey: 'placement-1', combinedPhysicalPages: [1, 3], defaultCombinedPhysicalPage: 3 });
    const unauthorized = createBookDeliveryProjectionResolver({ repository, resolveFullPageDefaults: async () => ({ 'placement-1': 99, 'placement-2': 2 }) });
    await expect(unauthorized.resolve(input)).rejects.toMatchObject({ code: 'book-delivery-stale-binding' });
  });

  it.each(['missing', 'invalid', 'foreign', 'outside authorized scope'])(
    'rejects %s full-PDF placement pages before building runtime context', async kind => {
      const repository = await activatedRepository('full_pdf');
      const current = (await repository.resolveCurrent('student-1', 'homework-1'))!;
      const first = current.record.binding.placements[0]!;
      const binding = { ...current.record.binding,
        sourceSet: { ...current.record.binding.sourceSet, sources: current.record.binding.sourceSet.sources.map(source => ({
          ...source, localPageScope: { kind: 'pages' as const, pages: [1] },
        })) },
        placements: [{ ...first, sourcePageScopes: kind === 'missing' ? [] : [{
          sourceKey: kind === 'foreign' ? 'foreign' : 'full', pages: kind === 'invalid' ? [0] : [2],
        }] }],
      };
      repository.resolveCurrent = vi.fn(async () => ({ ...current, record: { ...current.record, binding } }));
      await expect(createBookDeliveryProjectionResolver({ repository }).resolve({ recipientId: 'student-1',
        contextId: 'homework-1', actor: { uid: 'student-1' } }))
        .rejects.toMatchObject({ code: 'book-delivery-stale-binding' });
    },
  );

  it('fails closed for component delivery before constructing document requests or route keys', async () => {
    const repository = await activatedRepository('component_pdfs');
    const makeOpaqueRouteKey = vi.fn();

    await expect(createBookDeliveryProjectionResolver({ repository, makeOpaqueRouteKey }).resolve({
      recipientId: 'student-1',
      contextId: 'homework-1',
      actor: { uid: 'student-1' },
    })).rejects.toMatchObject({ code: 'book-delivery-stale-binding', status: 409 });
    expect(makeOpaqueRouteKey).not.toHaveBeenCalled();
  });

  it('projects one combined student document without private component identities', async () => {
    const repository = await activatedRepository('component_pdfs');
    const projection = await createBookDeliveryProjectionResolver({
      repository,
      resolveStudentDocument: async () => ({ expectedByteLength: 1000, expectedEtag: `"${'a'.repeat(64)}"`, physicalPageCount: 3,
        pageGroups: [{ pageGroupKey: 'group-a', combinedPhysicalPages: [2] }, { pageGroupKey: 'group-b', combinedPhysicalPages: [3] }] }),
    }).resolve({ recipientId: 'student-1', contextId: 'homework-1', actor: { uid: 'student-1' } });
    expect(projection.documentRequests).toEqual([{
      opaqueRouteKey: 'binding-component_pdfs-1-student-document',
      expectedByteLength: 1000, expectedEtag: `"${'a'.repeat(64)}"`,
    }]);
    expect(projection.pageGroups).toEqual([{ pageGroupKey: 'group-a', combinedPhysicalPages: [2] }, { pageGroupKey: 'group-b', combinedPhysicalPages: [3] }]);
    expect(projection.activities.map((activity) => activity.sourceContext)).toEqual([
      { available: true, description: 'Combined student document.', pageGroupKeys: ['group-a'], sourcePageScopes: [] },
      { available: true, description: 'Combined student document.', pageGroupKeys: ['group-b'], sourcePageScopes: [] },
    ]);
    expect(JSON.stringify(projection)).not.toMatch(/component-a|component-b|source-a-v1|source-b-v1|provider|objectKey|sha256Hex/iu);
  });

  it.each([{ pageGroupKeys: [] }, { pageGroupKeys: ['group-a', 'missing-group'] }])('does not qualify required combined source context with unresolved placement groups $pageGroupKeys', async ({ pageGroupKeys }) => {
    const repository = await activatedRepository('component_pdfs');
    const resolveCurrent = repository.resolveCurrent.bind(repository);
    repository.resolveCurrent = async (recipientId, contextId) => {
      const current = await resolveCurrent(recipientId, contextId);
      if (!current) return null;
      return { ...current, record: { ...current.record, binding: { ...current.record.binding,
        placements: current.record.binding.placements.map((placement) => ({ ...placement, pageGroupKeys })) } } };
    };
    const resolution = createBookDeliveryProjectionResolver({ repository,
      resolveStudentDocument: async () => ({ expectedByteLength: 1000, expectedEtag: `"${'a'.repeat(64)}"`, physicalPageCount: 3,
        pageGroups: [{ pageGroupKey: 'group-a', combinedPhysicalPages: [2] }] }),
    }).resolve({ recipientId: 'student-1', contextId: 'homework-1', actor: { uid: 'student-1' } });
    if (pageGroupKeys.length === 0) {
      await expect(resolution).rejects.toMatchObject({ code: 'book-delivery-stale-binding' });
      return;
    }
    const projection = await resolution;
    expect(projection.activities.every((activity) => activity.sourceContext.available === false)).toBe(true);
    expect(projection.activities.every((activity) => activity.sourceContext.sourcePageScopes.length === 0)).toBe(true);
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
