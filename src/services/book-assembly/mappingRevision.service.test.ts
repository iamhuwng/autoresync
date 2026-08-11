import { describe, expect, it } from 'vitest';

import type { BookAssemblyBookAuthority } from './unitAssembly.types';
import type { BookAssemblyPublicationScope } from './publicationRepository';
import {
  createMappingRevisionPublicationPlan,
  fingerprintMappingRevisionInput,
} from './mappingRevision.service';
import { createBookAssemblyPublicationService } from './publicationTransaction.service';
import { InMemoryBookAssemblyPublicationRepository } from './publicationRepository';
import type {
  BookAssemblyImmutableManifestVersion,
  BookAssemblyManifestCandidate,
  BookSourceVersionAuthority,
  SourceSetCandidate,
} from '../../types/bookAssembly.types';

const NOW = '2026-07-28T00:00:00.000Z';
const fullSources: SourceSetCandidate = {
  sourceStrategy: 'full_pdf',
  sources: [{ sourceKey: 'full', sourceVersionId: 'full-v1', sourceOrder: 1 }],
};
const authority: BookSourceVersionAuthority = {
  getSourceVersion: (sourceVersionId) => ({
    sourceVersionId,
    bookId: 'book-1',
    physicalPageCount: 10,
    verifiedUsable: true,
  }),
};
const manifest = (): BookAssemblyManifestCandidate => ({
  bookId: 'book-1',
  sourceSet: fullSources,
  nodes: [
    { nodeKey: 'section-root', parentNodeKey: null, nodeType: 'section', order: 1 },
    { nodeKey: 'unit-1', parentNodeKey: 'section-root', nodeType: 'unit', order: 1 },
  ],
  units: [{
    unitKey: 'unit-1',
    activitySlots: [{
      activityKey: 'activity-1',
      order: 1,
      contextRequirement: 'required',
      pageGroupKeys: ['activity-pages'],
    }],
    pageGroups: [
      {
        pageGroupKey: 'activity-pages',
        sourceKey: 'full',
        pages: [2],
        activityKeys: ['activity-1'],
        mode: 'activity',
      },
      {
        pageGroupKey: 'reference-pages',
        sourceKey: 'full',
        pages: [3],
        activityKeys: [],
        mode: 'reference_only',
        defaultPhysicalPageNumber: 3,
      },
    ],
  }],
});
const predecessor = (): BookAssemblyImmutableManifestVersion => ({
  schemaVersion: 1,
  manifestVersionId: 'manifest-1',
  publicationId: 'publication-1',
  publicationRevision: 1,
  lifecycle: 'published',
  ownerId: 'teacher-1',
  bookId: 'book-1',
  bookRevision: 7,
  sourceSetRevision: 4,
  candidateId: 'candidate-1',
  candidateRevision: 3,
  strategy: 'full_pdf',
  adapterTicket: '16',
  inputFingerprint: 'fnv1a64:predecessor',
  createdByCommandId: '00000000-0000-4000-8000-000000000016',
  createdAt: NOW,
  manifest: manifest(),
  studentSafeProjection: {
    schemaVersion: 1,
    bookId: 'book-1',
    publicationId: 'publication-1',
    publicationRevision: 1,
    sourceStrategy: 'full_pdf',
    sourceSet: fullSources,
    units: manifest().units,
  },
});
const scope: BookAssemblyPublicationScope = {
  activityVersions: {
    'activity-1-v1': {
      schemaVersion: 1,
      activityId: 'activity-1',
      activityVersionId: 'activity-1-v1',
      activityVersion: 1,
      ownerId: 'teacher-1',
      bookId: 'book-1',
      manifestVersionId: 'manifest-1',
      publicationId: 'publication-1',
      publicationRevision: 1,
      unitKey: 'unit-1',
      activityKey: 'activity-1',
      createdByCommandId: predecessor().createdByCommandId,
      createdAt: NOW,
      sourcePages: [{ sourceKey: 'full', sourceVersionId: 'full-v1', physicalPageNumber: 2 }],
      canonicalPayloadFingerprint: 'fnv1a64:canonical-activity-1',
      payloadFingerprint: 'activity-fingerprint',
    },
  },
  placements: {
    'placement-1': {
      schemaVersion: 1,
      placementId: 'placement-1',
      ownerId: 'teacher-1',
      bookId: 'book-1',
      manifestVersionId: 'manifest-1',
      publicationId: 'publication-1',
      publicationRevision: 1,
      unitKey: 'unit-1',
      nodeKey: 'unit-1',
      activityKey: 'activity-1',
      activityId: 'activity-1',
      activityVersionId: 'activity-1-v1',
      order: 1,
      pageGroupKeys: ['activity-pages'],
      sourcePages: [{ sourceKey: 'full', sourceVersionId: 'full-v1', physicalPageNumber: 2 }],
    },
  },
};
const bookAuthority = (): BookAssemblyBookAuthority => ({
  bookId: 'book-1',
  ownerId: 'teacher-1',
  bookMode: 'pdf',
  bookRevision: 7,
  sourceSetRevision: 4,
  sourceSet: fullSources,
  sourceVersionAuthority: authority,
});
const ids = () => ({
  planId: 'plan-18',
  manifestVersionId: 'manifest-18',
  publicationId: 'publication-18',
  publicationRevision: 2,
  unitProjectionIds: { 'unit-1': 'unit-projection-18' },
  deliveryPlanIds: { 'unit-1': 'delivery-plan-18' },
  activitiesByKey: {
    'unit-1:activity-1': { projectionId: 'projection-18', placementId: 'placement-18' },
  },
});
const input = (targetManifest: BookAssemblyManifestCandidate = manifest()) => ({
  operationId: '00000000-0000-4000-8000-000000000018',
  now: NOW,
  ownerId: 'teacher-1',
  authority: bookAuthority(),
  predecessor: predecessor(),
  predecessorScope: scope,
  targetManifest,
  ids: ids(),
});

describe('mapping revision publication plan', () => {
  it('creates an immutable mapping revision with Activity references and stable placement lineage', () => {
    const target = manifest();
    target.units[0]!.pageGroups = [...target.units[0]!.pageGroups].reverse();
    const result = createMappingRevisionPublicationPlan(input(target));

    expect(result.plan.adapterTicket).toBe('18');
    expect(result.plan.mappingRevisionLineage).toMatchObject({
      kind: 'mapping-revision',
      predecessorPublicationId: 'publication-1',
      preservedActivityIds: ['activity-1'],
      preservedActivityVersionIds: ['activity-1-v1'],
    });
    expect(result.plan.atomicWrites.activityVersions).toEqual([]);
    expect(result.plan.atomicWrites.activityVersionRefs).toEqual([{
      activityVersionId: 'activity-1-v1',
      activityId: 'activity-1',
      activityVersion: 1,
      canonicalPayloadFingerprint: 'fnv1a64:canonical-activity-1',
    }]);
    expect(result.plan.atomicWrites.placements[0]).toMatchObject({
      placementId: 'placement-18',
      predecessorPlacementId: 'placement-1',
      activityId: 'activity-1',
      activityVersionId: 'activity-1-v1',
    });
    expect(result.impact.contextAdapterInput).toEqual({
      predecessorPublicationId: 'publication-1',
      successorPublicationId: 'publication-18',
      changedPageGroupKeys: ['unit-1:activity-pages', 'unit-1:reference-pages'],
    });
  });

  it('requires fresh exact preview approval for source-assisted page changes', () => {
    const target = manifest();
    target.units[0]!.pageGroups = target.units[0]!.pageGroups.map((group) => (
      group.pageGroupKey === 'activity-pages' ? { ...group, pages: [4] } : group
    ));
    expect(() => createMappingRevisionPublicationPlan(input(target))).toThrow('preview-required');
    const approvedInputFingerprint = fingerprintMappingRevisionInput({
      predecessorManifestVersionId: 'manifest-1',
      targetManifest: target,
    });
    const result = createMappingRevisionPublicationPlan({
      ...input(target),
      previewApproval: {
        approvalId: 'approval-18',
        approvalRevision: 1,
        approvedAt: '2026-07-27T23:00:00.000Z',
        expiresAt: '2026-07-28T01:00:00.000Z',
        approvedInputFingerprint,
      },
    });
    expect(result.plan.previewApproval?.approvedInputFingerprint).toBe(approvedInputFingerprint);
    expect(() => createMappingRevisionPublicationPlan({
      ...input(target),
      previewApproval: {
        approvalId: 'approval-18',
        approvalRevision: 1,
        approvedAt: '2026-07-27T23:00:00.000Z',
        expiresAt: '2026-07-28T01:00:00.000Z',
        approvedInputFingerprint: 'wrong',
      },
    })).toThrow('preview-stale');
  });

  it('rejects Activity, Source Set, and no-op mutations', () => {
    expect(() => createMappingRevisionPublicationPlan(input())).toThrow('mapping-unchanged');
    const activityChanged = manifest();
    activityChanged.units[0]!.activitySlots = [{
      ...activityChanged.units[0]!.activitySlots[0]!,
      activityKey: 'activity-2',
    }];
    expect(() => createMappingRevisionPublicationPlan(input(activityChanged))).toThrow('activity-change');
    const sourceChanged = manifest();
    sourceChanged.sourceSet = {
      sourceStrategy: 'full_pdf',
      sources: [{ sourceKey: 'full', sourceVersionId: 'full-v2', sourceOrder: 1 }],
    };
    expect(() => createMappingRevisionPublicationPlan(input(sourceChanged))).toThrow('source-set-changed');
  });

  it('publishes through the common transaction while retaining immutable Activity records by reference', async () => {
    const target = manifest();
    target.units[0]!.pageGroups = [...target.units[0]!.pageGroups].reverse();
    const planned = createMappingRevisionPublicationPlan(input(target));
    const repository = new InMemoryBookAssemblyPublicationRepository({
      'book-1': {
        ...scope,
        versions: { 'manifest-1': predecessor() },
        current: {
          publicationId: 'publication-1',
          publicationRevision: 1,
          manifestVersionId: 'manifest-1',
          bookRevision: 7,
          sourceSetRevision: 4,
          inputFingerprint: predecessor().inputFingerprint,
          updatedAt: NOW,
          updatedByCommandId: predecessor().createdByCommandId,
        },
      },
    });
    const result = await createBookAssemblyPublicationService(repository).publish({
      operationId: input(target).operationId,
      expectedCurrentPublicationId: 'publication-1',
      manifestVersionId: 'manifest-18',
      publicationId: 'publication-18',
      publicationRevision: 2,
      plan: planned.plan,
      now: NOW,
    });
    expect(result.status).toBe('published');
    const persisted = await repository.readScope('book-1');
    expect(persisted.activityVersions?.['activity-1-v1']).toEqual(scope.activityVersions?.['activity-1-v1']);
    expect(persisted.current?.publicationId).toBe('publication-18');
    expect(Object.keys(persisted.placements ?? {})).toContain('placement-18');
    expect(Object.keys(persisted.activitySafeProjections ?? {})).toContain('projection-18');
  });
});
