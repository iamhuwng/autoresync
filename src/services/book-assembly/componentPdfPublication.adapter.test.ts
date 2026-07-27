import { describe, expect, it } from 'vitest';
import type {
  BookAssemblyBookAuthority,
  BookAssemblyCandidateRecord,
} from './unitAssembly.types';
import type {
  BookAssemblyManifestCandidate,
  BookAssemblyPreviewApprovalReference,
  BookSourceVersionAuthority,
} from '../../types/bookAssembly.types';
import { createBookAssemblyPublicationService } from './publicationTransaction.service';
import { InMemoryBookAssemblyPublicationRepository } from './publicationRepository';
import {
  createComponentPdfPublicationAdapterPlan,
  createComponentPdfPublicationCommandPlan,
  ComponentPdfPublicationAdapterError,
  type ComponentPdfPublicationIds,
} from './componentPdfPublication.adapter';

const operationId = '00000000-0000-4000-8000-000000000066';
const now = '2026-07-27T13:00:00.000Z';

const sourceVersionAuthority = (usable = true): BookSourceVersionAuthority => ({
  getSourceVersion: (sourceVersionId) => {
    const pages: Record<string, number> = {
      'source-a-v1': 12,
      'source-b-v1': 14,
    };
    return sourceVersionId in pages
      ? {
          sourceVersionId,
          bookId: 'book-1',
          physicalPageCount: pages[sourceVersionId] ?? 1,
          verifiedUsable: usable,
        }
      : undefined;
  },
});

const componentSourceSet = (): BookAssemblyManifestCandidate['sourceSet'] => ({
  sourceStrategy: 'component_pdfs',
  sources: [
    { sourceKey: 'component-a', sourceVersionId: 'source-a-v1', sourceOrder: 1, ownerNodeKey: 'section-root' },
    { sourceKey: 'component-b', sourceVersionId: 'source-b-v1', sourceOrder: 2, ownerNodeKey: 'section-root' },
  ],
});

const manifest = (
  sourceSet: BookAssemblyManifestCandidate['sourceSet'] = componentSourceSet(),
): BookAssemblyManifestCandidate => ({
  bookId: 'book-1',
  sourceSet,
  nodes: [
    { nodeKey: 'section-root', parentNodeKey: null, nodeType: 'section', order: 1 },
    { nodeKey: 'unit-1', parentNodeKey: 'section-root', nodeType: 'unit', order: 1 },
    { nodeKey: 'unit-2', parentNodeKey: 'section-root', nodeType: 'unit', order: 2 },
    { nodeKey: 'section-other', parentNodeKey: null, nodeType: 'section', order: 2 },
  ],
  units: [
    {
      unitKey: 'unit-1',
      activitySlots: [
        {
          activityKey: 'slot-a',
          order: 1,
          contextRequirement: 'required',
          pageGroupKeys: ['pages-a'],
        },
        {
          activityKey: 'slot-b',
          order: 2,
          contextRequirement: 'optional',
          pageGroupKeys: ['pages-b'],
        },
      ],
      pageGroups: [
        {
          pageGroupKey: 'pages-a',
          sourceKey: 'component-a',
          pages: [1],
          defaultPhysicalPageNumber: 1,
          activityKeys: ['slot-a'],
          mode: 'activity',
        },
        {
          pageGroupKey: 'pages-b',
          sourceKey: 'component-b',
          pages: [1],
          defaultPhysicalPageNumber: 1,
          activityKeys: ['slot-b'],
          mode: 'activity',
        },
      ],
    },
    {
      unitKey: 'unit-2',
      activitySlots: [],
      pageGroups: [],
    },
  ],
});

const authority = (
  body = manifest(),
  usable = true,
): BookAssemblyBookAuthority => ({
  bookId: 'book-1',
  ownerId: 'teacher-1',
  bookMode: 'pdf',
  bookRevision: 7,
  sourceSetRevision: 4,
  sourceSet: body.sourceSet,
  sourceVersionAuthority: sourceVersionAuthority(usable),
});

const candidate = (
  body = manifest(),
): BookAssemblyCandidateRecord => ({
  candidateId: 'candidate-1',
  ownerId: 'teacher-1',
  bookId: 'book-1',
  bookRevision: 7,
  sourceSetRevision: 4,
  unitKey: 'unit-1',
  revision: 3,
  lifecycle: 'validated',
  manifest: body,
  validation: { valid: true, errors: [] },
  updatedAt: now,
});

const approval = (
  expiresAt = '2026-07-27T14:00:00.000Z',
): BookAssemblyPreviewApprovalReference => ({
  approvalId: 'approval-1',
  approvalRevision: 2,
  approvedAt: '2026-07-27T12:00:00.000Z',
  expiresAt,
});

const ids = (): ComponentPdfPublicationIds => ({
  planId: 'plan-66',
  manifestVersionId: 'manifest-66',
  publicationId: 'publication-66',
  publicationRevision: 1,
  unitProjectionId: 'unit-projection-66',
  deliveryPlanId: 'delivery-plan-66',
  activitiesByKey: {
    'slot-a': {
      activityId: 'activity-slot-a',
      activityVersionId: 'activity-slot-a-v1',
      activityVersion: 1,
      projectionId: 'projection-slot-a',
      placementId: 'placement-slot-a',
    },
    'slot-b': {
      activityId: 'activity-slot-b',
      activityVersionId: 'activity-slot-b-v1',
      activityVersion: 1,
      projectionId: 'projection-slot-b',
      placementId: 'placement-slot-b',
    },
  },
});

const adapterInput = (
  overrides: Partial<Parameters<typeof createComponentPdfPublicationAdapterPlan>[0]> = {},
) => {
  const body = manifest();
  return {
    operationId,
    now,
    ownerId: 'teacher-1',
    unitKey: 'unit-1',
    candidate: candidate(body),
    authority: authority(body),
    expectedCandidateRevision: 3,
    expectedBookRevision: 7,
    expectedSourceSetRevision: 4,
    ids: ids(),
    previewApproval: approval(),
    ...overrides,
  };
};

describe('component-PDF publication adapter', () => {
  it('supplies #64 with component-owned records and source-local page identity for the selected Unit only', async () => {
    const plan = createComponentPdfPublicationAdapterPlan(adapterInput());
    const repository = new InMemoryBookAssemblyPublicationRepository();
    const service = createBookAssemblyPublicationService(repository);

    await expect(service.publish({
      operationId,
      expectedCurrentPublicationId: null,
      manifestVersionId: 'manifest-66',
      publicationId: 'publication-66',
      publicationRevision: 1,
      plan,
      now,
    })).resolves.toMatchObject({
      status: 'published',
      pointer: { publicationId: 'publication-66', manifestVersionId: 'manifest-66' },
    });

    const scope = await repository.readScope('book-1');
    expect(plan.strategy).toBe('component_pdfs');
    expect(plan.adapterTicket).toBe('17');
    expect(plan.sourceSet.sources.map((source) => source.sourceKey)).toEqual(['component-a', 'component-b']);
    expect(plan.sourceSet.sources.map((source) => source.sourceOrder)).toEqual([1, 2]);
    expect(plan.manifest.units.map((unit) => unit.unitKey)).toEqual(['unit-1']);
    expect(plan.studentSafeProjection.units.map((unit) => unit.unitKey)).toEqual(['unit-1']);
    expect(scope.activityVersions?.['activity-slot-a-v1']).toMatchObject({
      activityId: 'activity-slot-a',
      sourcePages: [{ sourceKey: 'component-a', sourceVersionId: 'source-a-v1', physicalPageNumber: 1 }],
    });
    expect(scope.activityVersions?.['activity-slot-b-v1']).toMatchObject({
      activityId: 'activity-slot-b',
      sourcePages: [{ sourceKey: 'component-b', sourceVersionId: 'source-b-v1', physicalPageNumber: 1 }],
    });
    expect(scope.placements?.['placement-slot-a']).toMatchObject({
      activityVersionId: 'activity-slot-a-v1',
      pageGroupKeys: ['pages-a'],
    });
    expect(scope.unitProjections?.['unit-projection-66']).toMatchObject({
      unitKey: 'unit-1',
      placementIds: ['placement-slot-a', 'placement-slot-b'],
    });
    expect(scope.deliveryPlans?.['delivery-plan-66']).toMatchObject({
      sourceStrategy: 'component_pdfs',
      placementIds: ['placement-slot-a', 'placement-slot-b'],
      unitProjectionIds: ['unit-projection-66'],
    });
  });

  it('allocates all publication IDs in the command layer before invoking the adapter', () => {
    const allocated: string[] = [];
    const plan = createComponentPdfPublicationCommandPlan({
      ...adapterInput(),
      allocateId: (kind, key) => {
        const value = `${kind}:${key}`;
        allocated.push(value);
        return value;
      },
    });

    expect(allocated).toEqual([
      'publication:candidate-1',
      'plan:candidate-1',
      'manifest-version:candidate-1',
      'unit-projection:unit-1',
      'delivery-plan:unit-1',
      'activity:slot-a',
      'activity-version:slot-a',
      'activity-projection:slot-a',
      'placement:slot-a',
      'activity:slot-b',
      'activity-version:slot-b',
      'activity-projection:slot-b',
      'placement:slot-b',
    ]);
    expect(plan.publicationId).toBeUndefined();
    expect(plan.studentSafeProjection.publicationId).toBe('publication:candidate-1');
    expect(plan.atomicWrites.activityVersions[0]?.activityVersionId).toBe('activity-version:slot-a');
    expect(plan.atomicWrites.placements[1]?.placementId).toBe('placement:slot-b');
  });

  it('reuses stable Activity IDs from exact slot lineage and creates fresh versions', () => {
    const plan = createComponentPdfPublicationCommandPlan({
      ...adapterInput(),
      existingLineageByActivityKey: {
        'slot-a': {
          activityId: 'activity-existing',
          lastActivityVersionId: 'activity-existing-v4',
          lastActivityVersion: 4,
        },
      },
      allocateId: (kind, key) => `${kind}:${key}`,
    });

    expect(plan.atomicWrites.activityVersions[0]).toMatchObject({
      activityId: 'activity-existing',
      activityVersionId: 'activity-version:slot-a',
      activityVersion: 5,
    });
    expect(plan.atomicWrites.activityVersions[1]).toMatchObject({
      activityId: 'activity:slot-b',
      activityVersion: 1,
    });
  });

  it('fails closed on mixed strategy, unrelated branch, stale revision, expired approval, and unusable source', () => {
    const fullManifest = manifest({
      sourceStrategy: 'full_pdf',
      sources: [{ sourceKey: 'full', sourceVersionId: 'source-a-v1', sourceOrder: 1 }],
    });
    const unrelatedBranch = manifest({
      sourceStrategy: 'component_pdfs',
      sources: [
        { sourceKey: 'component-a', sourceVersionId: 'source-a-v1', sourceOrder: 1, ownerNodeKey: 'section-other' },
      ],
    });

    expect(() => createComponentPdfPublicationAdapterPlan(adapterInput({
      candidate: candidate(fullManifest),
      authority: authority(fullManifest),
    }))).toThrow(ComponentPdfPublicationAdapterError);
    expect(() => createComponentPdfPublicationAdapterPlan(adapterInput({
      candidate: candidate(unrelatedBranch),
      authority: authority(unrelatedBranch),
    }))).toThrow('component_pdfs_manifest_invalid');
    expect(() => createComponentPdfPublicationAdapterPlan(adapterInput({
      expectedCandidateRevision: 2,
    }))).toThrow('component_pdfs_revision_conflict');
    expect(() => createComponentPdfPublicationAdapterPlan(adapterInput({
      previewApproval: approval('2026-07-27T12:59:59.000Z'),
    }))).toThrow('component_pdfs_preview_approval_expired');
    const body = manifest();
    expect(() => createComponentPdfPublicationAdapterPlan(adapterInput({
      candidate: candidate(body),
      authority: authority(body, false),
    }))).toThrow('component_pdfs_manifest_invalid');
  });
});
