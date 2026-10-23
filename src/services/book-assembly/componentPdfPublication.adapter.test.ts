import { describe, expect, it } from 'vitest';
import type {
  BookAssemblyBookAuthority,
  BookAssemblyCandidateRecord,
} from './unitAssembly.types';
import type {
  BookAssemblyManifestCandidate,
  BookAssemblyPreviewApprovalReference,
  BookSourceVersionAuthority,
  TrustedBookSourceVersionProjection,
} from '../../types/bookAssembly.types';
import type { NormalizedActivity } from '../../types/bookActivity.types';
import { normalizeActivity } from '../book-activity/activityCanonical.service';
import { createCanonicalBookAssemblyPublicationService } from './canonicalPublication.service';
import { InMemoryCanonicalActivityVersionRepository } from './canonicalPublicationRepository';
import { InMemoryBookAssemblyPublicationRepository } from './publicationRepository';
import {
  aggregateComponentPdfPublications,
  buildComponentPdfPublication,
  createComponentPdfPublicationAdapter,
  createComponentPdfPublicationAdapterPlan,
  createComponentPdfPublicationCommandPlan,
  createComponentPdfMultiUnitPublicationOutput,
  ComponentPdfPublicationAdapterError,
  type ComponentPdfPublicationIds,
} from './componentPdfPublication.adapter';

const operationId = '00000000-0000-4000-8000-000000000066';
const now = '2026-07-27T13:00:00.000Z';

const activity = (interactionId: string): NormalizedActivity => ({
  schemaVersion: 1,
  title: `Component activity ${interactionId}`,
  taskProfile: null,
  presentationMode: 'source-assisted',
  contextRequirement: { mode: 'required', acceptedKinds: ['book-pages'] },
  instructions: [{ text: 'Read the pinned component page.' }],
  interaction: { family: 'choice', variant: 'v1' },
  answerRule: { defaultPoints: 1, normalization: 'exact', requiredSelectionCount: 1 },
  stimulus: null,
  assetRefs: [],
  interactions: [{
    family: 'choice',
    interactionId,
    prompt: `Choose for ${interactionId}`,
    options: ['A', 'B'],
    sourceAssisted: {
      questionLabel: interactionId,
      sourceExerciseLabel: 'Component exercise',
      accessiblePrompt: 'Choose one answer.',
      responseShape: 'single-choice',
    },
    itemIdentities: { family: 'choice', optionIds: [`${interactionId}-a`, `${interactionId}-b`] },
    answerKey: { family: 'choice', acceptedOptionItemIds: [`${interactionId}-a`] },
  }],
  scoring: { mode: 'auto-where-possible' },
});

const longResponseActivity = (): NormalizedActivity => normalizeActivity({
  schemaVersion: 1,
  title: 'Explain the source evidence',
  taskProfile: null,
  presentationMode: 'source-assisted',
  contextRequirement: { mode: 'required', acceptedKinds: ['book-pages'] },
  instructions: [{ text: 'Explain using the pinned component page.' }],
  stimulus: null,
  assetRefs: [],
  interaction: { family: 'long-response', variant: 'essay' },
  answerRule: { defaultPoints: 2, normalization: 'exact' },
  interactions: [{
    prompt: 'Explain the evidence.',
    rubric: { criteria: ['Evidence'] },
    sourceAssisted: {
      questionLabel: 'Question 1',
      sourceExerciseLabel: 'Exercise 1',
      accessiblePrompt: 'Explain the evidence in the source.',
      responseShape: 'long-response',
    },
  }],
  scoring: { mode: 'review-required' },
} as const, undefined, undefined, { mappedBookPageRefs: ['source:component-a:page:1'] });

const trustedProjection = (
  sourceVersionId: string,
  physicalPageCount: number,
  verifiedUsable: boolean,
): TrustedBookSourceVersionProjection => ({
  sourceKey: sourceVersionId === 'source-a-v1' ? 'component-a' : 'component-b',
  sourceVersionId,
  bookId: 'book-1',
  checksum: { algorithm: 'sha-256', value: 'a'.repeat(64) },
  purpose: 'book-source',
  studentSafeStatus: 'ready',
  studentSafeDecision: {
    decidedBy: 'teacher-1',
    decidedAt: '2026-01-01T00:00:00.000Z',
    sourceVersionId,
    sha256Hex: 'a'.repeat(64),
    reasonCode: 'teacher-reviewed',
  },
  physicalPageCount,
  verifiedUsable,
});

const sourceVersionAuthority = (usable = true): BookSourceVersionAuthority => ({
  getSourceVersion: (sourceVersionId) => {
    const pages: Record<string, number> = {
      'source-a-v1': 12,
      'source-b-v1': 14,
    };
    return sourceVersionId in pages
      ? trustedProjection(sourceVersionId, pages[sourceVersionId] ?? 1, usable)
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
    activitiesByKey: {
      'slot-a': {
        activityKey: 'slot-a',
        ownerId: 'teacher-1',
        revision: 1,
        lifecycle: 'draft' as const,
        activity: activity('component-choice-a'),
      },
      'slot-b': {
        activityKey: 'slot-b',
        ownerId: 'teacher-1',
        revision: 1,
        lifecycle: 'draft' as const,
        activity: activity('component-choice-b'),
      },
    },
    ...overrides,
  };
};

describe('component-PDF publication adapter', () => {
  it.each(['valid', 'source', 'topology', 'shared title', 'coverage'] as const)(
    'combines exact approved Unit plans without stale sibling copies (%s)', (change) => {
      const original = manifest();
      const edited = { ...original, nodes: original.nodes.map((node) => node.nodeKey === 'unit-1'
        ? { ...node, title: 'Growing up — reviewed' } : node), units: original.units.map((unit) => unit.unitKey === 'unit-1'
        ? { ...unit, pageGroups: unit.pageGroups.map((group) => ({ ...group, pages: [1, 2], defaultPhysicalPageNumber: 2 })) } : unit) };
      let sibling = structuredClone(original);
      if (change === 'source' && sibling.sourceSet.sourceStrategy === 'component_pdfs') sibling = { ...sibling, sourceSet: {
        sourceStrategy: 'component_pdfs', sources: [
          { ...sibling.sourceSet.sources[0], sourceVersionId: 'replacement' }, ...sibling.sourceSet.sources.slice(1),
        ],
      } };
      if (change === 'topology') sibling = { ...sibling, nodes: sibling.nodes.map((node) => node.nodeKey === 'unit-1'
        ? { ...node, order: 3 } : node) };
      if (change === 'shared title') sibling = { ...sibling, nodes: sibling.nodes.map((node) => node.nodeKey === 'section-root'
        ? { ...node, title: 'Conflicting shared section' } : node) };
      if (change === 'coverage') sibling = { ...sibling, units: sibling.units.slice(1) };
      const units = [edited, sibling].map((body, index) => {
        const unitKey = index === 0 ? 'unit-1' : 'unit-2';
        const { ids: _ids, ...unit } = adapterInput({ candidate: { ...candidate(body), candidateId: `candidate-${index + 1}`, unitKey }, unitKey, ...(index === 1 ? { activitiesByKey: {} } : {}) });
        return { ...unit, allocateId: (kind: string, key: string) => ['publication', 'plan', 'manifest-version'].includes(kind)
          ? `${kind}:shared` : `${kind}:${key}` };
      });
      const before = JSON.stringify(units);
      const publish = () => createComponentPdfMultiUnitPublicationOutput({ aggregateCandidateId: 'combined', previewApproval: approval(), units });
      if (change !== 'valid') expect(publish).toThrow('component_pdfs_manifest_mismatch');
      else {
        const output = publish();
        expect(output.plan.manifest.nodes.find((node) => node.nodeKey === 'unit-1')?.title).toBe('Growing up — reviewed');
        expect(output.plan.manifest.units).toEqual([edited.units[0], original.units[1]]);
        expect(output.plan.studentSafeProjection.units).toEqual([edited.units[0], original.units[1]]);
        expect(output.canonicalActivityVersions.map((entry) => entry.activity.title)).toEqual(
          [activity('component-choice-a').title, activity('component-choice-b').title]);
      }
      expect(JSON.stringify(units)).toBe(before);
    },
  );

  it('publishes the normalized source-assisted long-response answer key', () => {
    const input = adapterInput({ activitiesByKey: {
      'slot-a': {
        activityKey: 'slot-a', ownerId: 'teacher-1', revision: 1, lifecycle: 'draft', activity: longResponseActivity(),
      },
      'slot-b': {
        activityKey: 'slot-b', ownerId: 'teacher-1', revision: 1, lifecycle: 'draft', activity: activity('component-choice-b'),
      },
    } });

    const output = createComponentPdfPublicationAdapter(input);
    const published = output.canonicalActivityVersions.find((entry) => entry.activity.interaction.family === 'long-response');
    expect(published?.activity.interactions[0]).not.toHaveProperty('rubric');
    expect(published?.activity.interactions[0]?.answerKey).toEqual({ family: 'long-response', rubric: { criteria: ['Evidence'] } });
  });

  it('publishes a valid one-Unit activation without requiring a second Unit', () => {
    const { ids: _ids, ...unit } = adapterInput();
    const output = createComponentPdfMultiUnitPublicationOutput({
      aggregateCandidateId: 'activation-candidate-1',
      previewApproval: approval(),
      units: [{ ...unit, allocateId: (kind, key) => `${kind}:${key}` }],
    });

    expect(output.plan.candidateId).toBe('activation-candidate-1');
    expect(output.plan.studentSafeProjection.units).toEqual([manifest().units[0]]);
    expect(output.plan.atomicWrites.unitProjections).toHaveLength(1);
  });

  it('supplies #64 with component-owned records and source-local page identity for the selected Unit only', async () => {
    const output = createComponentPdfPublicationAdapter(adapterInput());
    const { plan } = output;
    const repository = new InMemoryBookAssemblyPublicationRepository();
    const activityVersions = new InMemoryCanonicalActivityVersionRepository();
    const service = createCanonicalBookAssemblyPublicationService(repository, activityVersions);

    await expect(service.publish({
      operationId,
      expectedCurrentPublicationId: null,
      manifestVersionId: 'manifest-66',
      publicationId: 'publication-66',
      publicationRevision: 1,
      plan,
      canonicalActivityVersions: output.canonicalActivityVersions,
      now,
    })).resolves.toMatchObject({
      status: 'published',
      pointer: { publicationId: 'publication-66', manifestVersionId: 'manifest-66' },
    });

    const scope = await repository.readScope('book-1');
    expect(scope.current).toMatchObject({
      manifestVersionId: 'manifest-66',
      publicationId: 'publication-66',
      publicationRevision: 1,
      updatedByCommandId: operationId,
    });
    expect(scope.versions?.['manifest-66']).toMatchObject({
      ownerId: 'teacher-1',
      bookId: 'book-1',
      manifestVersionId: 'manifest-66',
      publicationId: 'publication-66',
      publicationRevision: 1,
      strategy: 'component_pdfs',
      lifecycle: 'published',
    });
    expect(plan.strategy).toBe('component_pdfs');
    expect(plan.adapterTicket).toBe('17');
    expect(plan.sourceSet.sources.map((source) => source.sourceKey)).toEqual(['component-a', 'component-b']);
    expect(plan.sourceSet.sources.map((source) => source.sourceOrder)).toEqual([1, 2]);
    expect(plan.manifest.units.map((unit) => unit.unitKey)).toEqual(['unit-1']);
    expect(plan.studentSafeProjection.units.map((unit) => unit.unitKey)).toEqual(['unit-1']);
    const activityMetadata = Object.values(scope.activityVersions ?? {});
    expect(activityMetadata).toContainEqual(expect.objectContaining({
      activityId: 'activity-slot-a',
      activityVersionId: 'activity-slot-a-v1',
      activityVersion: 1,
      ownerId: 'teacher-1',
      manifestVersionId: 'manifest-66',
      publicationId: 'publication-66',
      publicationRevision: 1,
      safeProjectionId: 'projection-slot-a',
      canonicalOriginManifestVersionId: 'manifest-66',
      canonicalOriginPublicationId: 'publication-66',
      canonicalOriginOperationId: operationId,
      canonicalPayloadFingerprint: output.canonicalActivityVersions[0]?.payloadFingerprint,
      sourcePages: [{ sourceKey: 'component-a', sourceVersionId: 'source-a-v1', physicalPageNumber: 1 }],
    }));
    expect(activityMetadata).toContainEqual(expect.objectContaining({
      activityId: 'activity-slot-b',
      activityVersionId: 'activity-slot-b-v1',
      activityVersion: 1,
      ownerId: 'teacher-1',
      manifestVersionId: 'manifest-66',
      publicationId: 'publication-66',
      publicationRevision: 1,
      safeProjectionId: 'projection-slot-b',
      canonicalOriginManifestVersionId: 'manifest-66',
      canonicalOriginPublicationId: 'publication-66',
      canonicalOriginOperationId: operationId,
      canonicalPayloadFingerprint: output.canonicalActivityVersions[1]?.payloadFingerprint,
      sourcePages: [{ sourceKey: 'component-b', sourceVersionId: 'source-b-v1', physicalPageNumber: 1 }],
    }));
    expect(scope.placements?.['placement-slot-a']).toMatchObject({
      ownerId: 'teacher-1',
      manifestVersionId: 'manifest-66',
      publicationId: 'publication-66',
      activityId: 'activity-slot-a',
      activityVersionId: 'activity-slot-a-v1',
      order: 1,
      pageGroupKeys: ['pages-a'],
      sourcePages: [{ sourceKey: 'component-a', sourceVersionId: 'source-a-v1', physicalPageNumber: 1 }],
    });
    expect(scope.placements?.['placement-slot-b']).toMatchObject({
      ownerId: 'teacher-1',
      manifestVersionId: 'manifest-66',
      publicationId: 'publication-66',
      activityId: 'activity-slot-b',
      activityVersionId: 'activity-slot-b-v1',
      order: 2,
      pageGroupKeys: ['pages-b'],
      sourcePages: [{ sourceKey: 'component-b', sourceVersionId: 'source-b-v1', physicalPageNumber: 1 }],
    });
    expect(scope.unitProjections?.['unit-projection-66']).toMatchObject({
      unitKey: 'unit-1',
      placementIds: ['placement-slot-a', 'placement-slot-b'],
    });
    expect(scope.deliveryPlans?.['delivery-plan-66']).toMatchObject({
      sourceStrategy: 'component_pdfs',
      manifestVersionId: 'manifest-66',
      publicationId: 'publication-66',
      sourceSet: {
        sources: [
          {
            sourceKey: 'component-a',
            sourceVersionId: 'source-a-v1',
            sourceOrder: 1,
            ownerNodeKey: 'section-root',
          },
          {
            sourceKey: 'component-b',
            sourceVersionId: 'source-b-v1',
            sourceOrder: 2,
            ownerNodeKey: 'section-root',
          },
        ],
      },
      placementIds: ['placement-slot-a', 'placement-slot-b'],
      unitProjectionIds: ['unit-projection-66'],
    });
    expect(output.canonicalActivityVersions).toEqual([
      expect.objectContaining({
        activityId: 'activity-slot-a',
        activityVersionId: 'activity-slot-a-v1',
        activityVersion: 1,
        ownerId: 'teacher-1',
        placementIds: ['placement-slot-a'],
        createdByOperationId: operationId,
        activity: expect.objectContaining({
          interactions: [expect.objectContaining({ interactionId: 'component-choice-a' })],
        }),
        projection: expect.objectContaining({
          interactions: [expect.objectContaining({ interactionId: 'component-choice-a' })],
        }),
        provenance: {
          kind: 'initial-book-publication',
          bookId: 'book-1',
          manifestVersionId: 'manifest-66',
          publicationId: 'publication-66',
          publicationRevision: 1,
          unitKey: 'unit-1',
          activityKey: 'slot-a',
          sourcePages: [{
            sourceKey: 'component-a',
            sourceVersionId: 'source-a-v1',
            physicalPageNumber: 1,
          }],
        },
      }),
      expect.objectContaining({
        activityId: 'activity-slot-b',
        activityVersionId: 'activity-slot-b-v1',
        activityVersion: 1,
        ownerId: 'teacher-1',
        placementIds: ['placement-slot-b'],
        createdByOperationId: operationId,
        activity: expect.objectContaining({
          interactions: [expect.objectContaining({ interactionId: 'component-choice-b' })],
        }),
        projection: expect.objectContaining({
          interactions: [expect.objectContaining({ interactionId: 'component-choice-b' })],
        }),
        provenance: {
          kind: 'initial-book-publication',
          bookId: 'book-1',
          manifestVersionId: 'manifest-66',
          publicationId: 'publication-66',
          publicationRevision: 1,
          unitKey: 'unit-1',
          activityKey: 'slot-b',
          sourcePages: [{
            sourceKey: 'component-b',
            sourceVersionId: 'source-b-v1',
            physicalPageNumber: 1,
          }],
        },
      }),
    ]);
    await expect(activityVersions.readPrepared({
      activityId: 'activity-slot-a',
      activityVersionId: 'activity-slot-a-v1',
      activityVersion: 1,
      canonicalPayloadFingerprint: output.canonicalActivityVersions[0]!.payloadFingerprint,
    })).resolves.toMatchObject({
      activity: { interactions: [{ interactionId: 'component-choice-a' }] },
      projection: { interactions: [{ interactionId: 'component-choice-a' }] },
      provenance: {
        sourcePages: [{
          sourceKey: 'component-a',
          sourceVersionId: 'source-a-v1',
          physicalPageNumber: 1,
        }],
      },
    });
    await expect(activityVersions.readPrepared({
      activityId: 'activity-slot-b',
      activityVersionId: 'activity-slot-b-v1',
      activityVersion: 1,
      canonicalPayloadFingerprint: output.canonicalActivityVersions[1]!.payloadFingerprint,
    })).resolves.toMatchObject({
      activity: { interactions: [{ interactionId: 'component-choice-b' }] },
      projection: { interactions: [{ interactionId: 'component-choice-b' }] },
      provenance: {
        sourcePages: [{
          sourceKey: 'component-b',
          sourceVersionId: 'source-b-v1',
          physicalPageNumber: 1,
        }],
      },
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

  it('fails before publication when initial payload is paired with later lineage', () => {
    expect(() => createComponentPdfPublicationCommandPlan({
      ...adapterInput(),
      existingLineageByActivityKey: {
        'slot-a': {
          activityId: 'activity-existing',
          lastActivityVersionId: 'activity-existing-v4',
          lastActivityVersion: 4,
        },
      },
      allocateId: (kind, key) => `${kind}:${key}`,
    })).toThrow('component_pdfs_activity_payload_invalid');
  });

  it('rejects component arrays whose submitted order is not dense', () => {
    const base = manifest();
    const unsorted: BookAssemblyManifestCandidate = {
      ...base,
      sourceSet: {
        sourceStrategy: 'component_pdfs',
        sources: [...base.sourceSet.sources].reverse(),
      },
    };
    expect(() => createComponentPdfPublicationAdapterPlan(adapterInput({
      candidate: candidate(unsorted),
      authority: authority(unsorted),
    }))).toThrow('component_pdfs_manifest_invalid');
  });

  it('rejects missing, mis-keyed, and cross-component Activity payloads', () => {
    const valid = adapterInput().activitiesByKey;
    expect(() => createComponentPdfPublicationAdapterPlan(adapterInput({
      activitiesByKey: { 'slot-a': valid['slot-a']! },
    }))).toThrow('component_pdfs_activity_payload_missing');
    expect(() => createComponentPdfPublicationAdapterPlan(adapterInput({
      activitiesByKey: {
        ...valid,
        'slot-a': { ...valid['slot-a']!, activityKey: 'slot-b' },
      },
    }))).toThrow('component_pdfs_activity_payload_mismatch');
    expect(() => createComponentPdfPublicationAdapterPlan(adapterInput({
      activitiesByKey: {
        ...valid,
        'slot-other': { ...valid['slot-a']!, activityKey: 'slot-other' },
      },
    }))).toThrow('component_pdfs_activity_payload_mismatch');
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
      authority: { ...authority(), bookMode: 'materials' as never },
    }))).toThrow('component_pdfs_revision_conflict');
    expect(() => createComponentPdfPublicationAdapterPlan(adapterInput({
      previewApproval: approval('2026-07-27T12:59:59.000Z'),
    }))).toThrow('component_pdfs_preview_approval_expired');
    expect(() => createComponentPdfPublicationAdapterPlan(adapterInput({
      previewApproval: undefined as never,
    }))).toThrow('component_pdfs_preview_approval_expired');
    const body = manifest();
    expect(() => createComponentPdfPublicationAdapterPlan(adapterInput({
      candidate: candidate(body),
      authority: authority(body, false),
    }))).toThrow('component_pdfs_manifest_invalid');
  });

  it('builds approval-free Unit output and aggregates only exact manifest Units', () => {
    const { previewApproval: _approval, ...input } = adapterInput();
    const output = buildComponentPdfPublication(input);
    expect(output.plan).not.toHaveProperty('previewApproval');
    const aggregate = aggregateComponentPdfPublications({
      aggregateCandidateId: 'activation-candidate-1',
      manifest: manifest(),
      outputs: [output],
    });
    expect(aggregate.plan.candidateId).toBe('activation-candidate-1');
    expect(aggregate.plan.manifest.units).toEqual([manifest().units[0]]);
    expect(() => buildComponentPdfPublication({ ...input, authority: authority(manifest(), false) }))
      .toThrow('component_pdfs_manifest_invalid');
    expect(() => aggregateComponentPdfPublications({
      aggregateCandidateId: 'activation-candidate-1',
      manifest: { ...manifest(), units: [] },
      outputs: [output],
    })).toThrow('component_pdfs_unit_coverage_invalid');
  });
});
