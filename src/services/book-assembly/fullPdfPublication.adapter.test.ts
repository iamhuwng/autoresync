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
import type { NormalizedActivity } from '../../types/bookActivity.types';
import { createCanonicalBookAssemblyPublicationService } from './canonicalPublication.service';
import { InMemoryCanonicalActivityVersionRepository } from './canonicalPublicationRepository';
import { InMemoryBookAssemblyPublicationRepository } from './publicationRepository';
import {
  createFullPdfPublicationAdapter,
  createFullPdfPublicationAdapterPlan,
  createFullPdfPublicationCommandPlan,
  FullPdfPublicationAdapterError,
  type FullPdfPublicationIds,
} from './fullPdfPublication.adapter';

const operationId = '00000000-0000-4000-8000-000000000065';
const now = '2026-07-27T13:00:00.000Z';

const activity = (): NormalizedActivity => ({
  schemaVersion: 1,
  title: 'Choose safely',
  taskProfile: null,
  presentationMode: 'source-assisted',
  contextRequirement: { mode: 'required', acceptedKinds: ['book-pages'] },
  instructions: [{ text: 'Read the pinned page.' }],
  interaction: { family: 'choice', variant: 'v1' },
  answerRule: { defaultPoints: 1, normalization: 'exact', requiredSelectionCount: 1 },
  stimulus: null,
  assetRefs: [],
  interactions: [{
    family: 'choice',
    interactionId: 'choice-1',
    prompt: 'Choose A',
    options: ['A', 'B'],
    sourceAssisted: {
      questionLabel: '1',
      sourceExerciseLabel: 'Exercise 1',
      accessiblePrompt: 'Choose one answer.',
      responseShape: 'single-choice',
    },
    itemIdentities: { family: 'choice', optionIds: ['option-a', 'option-b'] },
    answerKey: { family: 'choice', acceptedOptionItemIds: ['option-a'] },
  }],
  scoring: { mode: 'auto-where-possible' },
});

const sourceVersionAuthority = (usable = true): BookSourceVersionAuthority => ({
  getSourceVersion: (sourceVersionId) => sourceVersionId === 'source-v1'
    ? {
        sourceVersionId,
        bookId: 'book-1',
        physicalPageCount: 20,
        verifiedUsable: usable,
      }
    : undefined,
});

const manifest = (
  sourceSet: BookAssemblyManifestCandidate['sourceSet'] = {
    sourceStrategy: 'full_pdf',
    sources: [{ sourceKey: 'full', sourceVersionId: 'source-v1', sourceOrder: 1 }],
  },
): BookAssemblyManifestCandidate => ({
  bookId: 'book-1',
  sourceSet,
  nodes: [
    { nodeKey: 'root', parentNodeKey: null, nodeType: 'section', order: 1 },
    { nodeKey: 'unit-1', parentNodeKey: 'root', nodeType: 'unit', order: 1 },
    { nodeKey: 'unit-2', parentNodeKey: 'root', nodeType: 'unit', order: 2 },
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
      ],
      pageGroups: [
        {
          pageGroupKey: 'pages-a',
          sourceKey: 'full',
          pages: [2, 3],
          activityKeys: ['slot-a'],
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

const ids = (): FullPdfPublicationIds => ({
  planId: 'plan-65',
  manifestVersionId: 'manifest-65',
  publicationId: 'publication-65',
  publicationRevision: 1,
  unitProjectionId: 'unit-projection-65',
  deliveryPlanId: 'delivery-plan-65',
  activitiesByKey: {
    'slot-a': {
      activityId: 'activity-slot-a',
      activityVersionId: 'activity-slot-a-v1',
      activityVersion: 1,
      projectionId: 'projection-slot-a',
      placementId: 'placement-slot-a',
    },
  },
});

const adapterInput = (
  overrides: Partial<Parameters<typeof createFullPdfPublicationAdapterPlan>[0]> = {},
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
        activity: activity(),
      },
    },
    ...overrides,
  };
};

describe('full-PDF publication adapter', () => {
  it('supplies #64 with one-source full-PDF records for the selected Unit only', async () => {
    const output = createFullPdfPublicationAdapter(adapterInput());
    const { plan } = output;
    const repository = new InMemoryBookAssemblyPublicationRepository();
    const activityVersions = new InMemoryCanonicalActivityVersionRepository();
    const service = createCanonicalBookAssemblyPublicationService(repository, activityVersions);

    await expect(service.publish({
      operationId,
      expectedCurrentPublicationId: null,
      manifestVersionId: 'manifest-65',
      publicationId: 'publication-65',
      publicationRevision: 1,
      plan,
      canonicalActivityVersions: output.canonicalActivityVersions,
      now,
    })).resolves.toMatchObject({
      status: 'published',
      pointer: { publicationId: 'publication-65', manifestVersionId: 'manifest-65' },
    });

    const scope = await repository.readScope('book-1');
    expect(plan.strategy).toBe('full_pdf');
    expect(plan.adapterTicket).toBe('16');
    expect(plan.manifest.units.map((unit) => unit.unitKey)).toEqual(['unit-1']);
    expect(plan.studentSafeProjection.units.map((unit) => unit.unitKey)).toEqual(['unit-1']);
    expect(Object.values(scope.activityVersions ?? {})).toContainEqual(expect.objectContaining({
      activityId: 'activity-slot-a',
      canonicalPayloadFingerprint: output.canonicalActivityVersions[0]?.payloadFingerprint,
      sourcePages: [
        { sourceKey: 'full', sourceVersionId: 'source-v1', physicalPageNumber: 2 },
        { sourceKey: 'full', sourceVersionId: 'source-v1', physicalPageNumber: 3 },
      ],
    }));
    expect(scope.placements?.['placement-slot-a']).toMatchObject({
      activityVersionId: 'activity-slot-a-v1',
      pageGroupKeys: ['pages-a'],
    });
    expect(scope.unitProjections?.['unit-projection-65']).toMatchObject({
      unitKey: 'unit-1',
      placementIds: ['placement-slot-a'],
    });
    expect(scope.deliveryPlans?.['delivery-plan-65']).toMatchObject({
      sourceStrategy: 'full_pdf',
      placementIds: ['placement-slot-a'],
      unitProjectionIds: ['unit-projection-65'],
    });
    await expect(activityVersions.readPrepared({
      activityId: 'activity-slot-a',
      activityVersionId: 'activity-slot-a-v1',
      activityVersion: 1,
      canonicalPayloadFingerprint: output.canonicalActivityVersions[0]!.payloadFingerprint,
    })).resolves.toMatchObject({
      activity: { interactions: [{ interactionId: 'choice-1' }] },
      projection: { interactions: [{ interactionId: 'choice-1' }] },
    });
  });

  it('allocates all publication IDs in the command layer before invoking the adapter', () => {
    const allocated: string[] = [];
    const plan = createFullPdfPublicationCommandPlan({
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
    ]);
    expect(plan.publicationId).toBeUndefined();
    expect(plan.studentSafeProjection.publicationId).toBe('publication:candidate-1');
    expect(plan.atomicWrites.activityVersions[0]?.activityVersionId).toBe('activity-version:slot-a');
    expect(plan.atomicWrites.placements[0]?.placementId).toBe('placement:slot-a');
  });

  it('fails before publication when initial payload is paired with later lineage', () => {
    expect(() => createFullPdfPublicationCommandPlan({
      ...adapterInput(),
      existingLineageByActivityKey: {
        'slot-a': {
          activityId: 'activity-existing',
          lastActivityVersionId: 'activity-existing-v4',
          lastActivityVersion: 4,
        },
      },
      allocateId: (kind, key) => `${kind}:${key}`,
    })).toThrow('full_pdf_activity_payload_invalid');
  });

  it('fails closed on component strategy, stale revision, expired approval, and unusable source', () => {
    const componentManifest = manifest({
      sourceStrategy: 'component_pdfs',
      sources: [{
        sourceKey: 'full',
        sourceVersionId: 'source-v1',
        sourceOrder: 1,
        ownerNodeKey: 'unit-1',
      }],
    });

    expect(() => createFullPdfPublicationAdapterPlan(adapterInput({
      candidate: candidate(componentManifest),
      authority: authority(componentManifest),
    }))).toThrow(FullPdfPublicationAdapterError);
    expect(() => createFullPdfPublicationAdapterPlan(adapterInput({
      expectedCandidateRevision: 2,
    }))).toThrow('full_pdf_revision_conflict');
    expect(() => createFullPdfPublicationAdapterPlan(adapterInput({
      previewApproval: approval('2026-07-27T12:59:59.000Z'),
    }))).toThrow('full_pdf_preview_approval_expired');
    const body = manifest();
    expect(() => createFullPdfPublicationAdapterPlan(adapterInput({
      candidate: candidate(body),
      authority: authority(body, false),
    }))).toThrow('full_pdf_manifest_invalid');
  });
});
