import { describe, expect, it } from 'vitest';
import type {
  BookAssemblyBookAuthority,
} from './unitAssembly.types';
import type { BookAssemblyPublicationScope } from './publicationRepository';
import type {
  BookAssemblyImmutableManifestVersion,
  BookAssemblyManifestCandidate,
  BookSourceVersionAuthority,
  SourceSetCandidate,
} from '../../types/bookAssembly.types';
import {
  createSourceStrategySuccessorPublicationPlan,
  type SourceStrategySuccessorPublicationIds,
} from './sourceStrategySuccessor.service';

const NOW = '2026-07-28T00:00:00.000Z';
const OPERATION = '00000000-0000-4000-8000-000000000071';

const authority: BookSourceVersionAuthority = {
  getSourceVersion: (sourceVersionId) => ({
    sourceVersionId,
    bookId: 'book-1',
    physicalPageCount: sourceVersionId === 'full-v1' ? 12 : 8,
    verifiedUsable: true,
  }),
};

const fullSources: SourceSetCandidate = {
  sourceStrategy: 'full_pdf',
  sources: [{ sourceKey: 'full', sourceVersionId: 'full-v1', sourceOrder: 1 }],
};

const componentSources: SourceSetCandidate = {
  sourceStrategy: 'component_pdfs',
  sources: [
    { sourceKey: 'component-a', sourceVersionId: 'component-a-v1', sourceOrder: 1, ownerNodeKey: 'section-root' },
    { sourceKey: 'component-b', sourceVersionId: 'component-b-v1', sourceOrder: 2, ownerNodeKey: 'section-root' },
  ],
};

const manifest = (sourceSet: SourceSetCandidate = fullSources): BookAssemblyManifestCandidate => ({
  bookId: 'book-1',
  sourceSet,
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
  createdByCommandId: '00000000-0000-4000-8000-000000000065',
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

const bookAuthority = (sourceSet: SourceSetCandidate = fullSources): BookAssemblyBookAuthority => ({
  bookId: 'book-1',
  ownerId: 'teacher-1',
  bookMode: 'pdf',
  bookRevision: 7,
  sourceSetRevision: 4,
  sourceSet,
  sourceVersionAuthority: authority,
});

const ids = (): SourceStrategySuccessorPublicationIds => ({
  planId: 'plan-71',
  manifestVersionId: 'manifest-71',
  publicationId: 'publication-71',
  publicationRevision: 2,
  unitProjectionIds: { 'unit-1': 'unit-projection-71' },
  deliveryPlanIds: { 'unit-1': 'delivery-plan-71' },
  activitiesByKey: {
    'unit-1:activity-1': {
      activityId: 'activity-1',
      activityVersionId: 'activity-1-v2',
      activityVersion: 2,
      projectionId: 'projection-71',
      placementId: 'placement-71',
    },
  },
});

const remaps = [
  {
    pageGroupKey: 'activity-pages',
    pages: [{ from: { sourceKey: 'full', physicalPageNumber: 2 }, to: { sourceKey: 'component-a', physicalPageNumber: 1 } }],
  },
  {
    pageGroupKey: 'reference-pages',
    pages: [{ from: { sourceKey: 'full', physicalPageNumber: 3 }, to: { sourceKey: 'component-b', physicalPageNumber: 1 } }],
  },
] as const;

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
      createdByCommandId: '00000000-0000-4000-8000-000000000065',
      createdAt: NOW,
      sourcePages: [{ sourceKey: 'full', sourceVersionId: 'full-v1', physicalPageNumber: 2 }],
      payloadFingerprint: 'fnv1a64:activity-1',
    },
  },
};

const input = (target: SourceSetCandidate = componentSources) => ({
  operationId: OPERATION,
  now: NOW,
  ownerId: 'teacher-1',
  authority: bookAuthority(),
  predecessor: predecessor(),
  predecessorScope: scope,
  target: { sourceSetRevision: 5, sourceSet: target },
  remaps,
  ids: ids(),
});

describe('source-strategy successor publication plan', () => {
  it('creates a new immutable component successor with stable Activity identity and fresh version', () => {
    const result = createSourceStrategySuccessorPublicationPlan(input());

    expect(result.plan.adapterTicket).toBe('20C');
    expect(result.plan.successorLineage).toMatchObject({
      kind: 'source-strategy-successor',
      predecessorPublicationId: 'publication-1',
      successorStrategy: 'component_pdfs',
    });
    expect(result.plan.manifest.sourceSet).toEqual(componentSources);
    expect(result.plan.atomicWrites.activityVersions[0]).toMatchObject({
      activityId: 'activity-1',
      activityVersionId: 'activity-1-v2',
      activityVersion: 2,
      sourcePages: [{ sourceKey: 'component-a', sourceVersionId: 'component-a-v1', physicalPageNumber: 1 }],
    });
    expect(result.plan.atomicWrites.placements[0]).toMatchObject({
      unitKey: 'unit-1',
      nodeKey: 'unit-1',
      pageGroupKeys: ['activity-pages'],
    });
    expect(result.impact.contextAdapterInput).toEqual({
      predecessorPublicationId: 'publication-1',
      successorPublicationId: 'publication-71',
      affectedUnitKeys: ['unit-1'],
    });
  });

  it('supports the reverse direction only with explicit remaps and clears component ownership', () => {
    const current = predecessor();
    const componentManifest: BookAssemblyManifestCandidate = {
      ...manifest(componentSources),
      units: manifest(componentSources).units.map((unit) => ({
        ...unit,
        pageGroups: unit.pageGroups.map((group) => ({
          ...group,
          sourceKey: group.pageGroupKey === 'activity-pages' ? 'component-a' : 'component-b',
          pages: [1],
        })),
      })),
    };
    const componentPredecessor: BookAssemblyImmutableManifestVersion = {
      ...current,
      manifest: componentManifest,
      strategy: 'component_pdfs',
      sourceSetRevision: 5,
      studentSafeProjection: {
        ...current.studentSafeProjection,
        sourceStrategy: 'component_pdfs',
        sourceSet: componentSources,
      },
    };
    const result = createSourceStrategySuccessorPublicationPlan({
      ...input(fullSources),
      predecessor: componentPredecessor,
      authority: { ...bookAuthority(componentSources), sourceSetRevision: 5 },
      target: { sourceSetRevision: 6, sourceSet: fullSources },
      remaps: remaps.map((entry) => ({
        ...entry,
        pages: entry.pages.map((page) => ({
          from: { sourceKey: page.to.sourceKey, physicalPageNumber: page.to.physicalPageNumber },
          to: { sourceKey: 'full', physicalPageNumber: page.from.physicalPageNumber },
        })),
      })),
    });

    expect(result.plan.strategy).toBe('full_pdf');
    expect(result.plan.manifest.sourceSet).toEqual(fullSources);
    expect(result.plan.successorLineage?.predecessorStrategy).toBe('component_pdfs');
  });

  it('rejects a strategy change when a Page Group remap is missing', () => {
    expect(() => createSourceStrategySuccessorPublicationPlan({
      ...input(),
      remaps: remaps.slice(0, 1),
    })).toThrow('successor-plan-invalid');
  });

  it('rejects an in-place same-strategy mutation', () => {
    expect(() => createSourceStrategySuccessorPublicationPlan({
      ...input(fullSources),
      target: { sourceSetRevision: 5, sourceSet: fullSources },
      remaps: [],
    })).toThrow('strategy-unchanged');
  });
});
