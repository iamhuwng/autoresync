import { describe, expect, it, vi } from 'vitest';
import type {
  BookAssemblyBookAuthority,
  BookAssemblyCandidateRecord,
} from './unitAssembly.types';
import type {
  BookAssemblyManifestCandidate,
  BookAssemblyPreviewApprovalReference,
  TrustedBookSourceVersionProjection,
} from '../../types/bookAssembly.types';
import type { NormalizedActivity } from '../../types/bookActivity.types';
import {
  createCanonicalBookAssemblyPublicationService,
  type CanonicalPublishBookAssemblyInput,
} from './canonicalPublication.service';
import { InMemoryCanonicalActivityVersionRepository } from './canonicalPublicationRepository';
import { InMemoryBookAssemblyPublicationRepository } from './publicationRepository';
import {
  createComponentPdfPublicationCommand,
  ComponentPdfPublicationCommandError,
} from './componentPdfPublication.command';
import {
  createCandidateUnitPreview,
  createPreviewApproval,
  wholeActivationApprovalFingerprint,
} from './unitPreview.service';
import { createComponentStudentDocument } from './componentStudentDocument.types';

const operationId = '00000000-0000-4000-8000-000000000166';
const now = '2026-07-27T13:00:00.000Z';

const trustedProjection = (
  sourceVersionId: string,
  sourceKey: 'component-a' | 'component-b',
): TrustedBookSourceVersionProjection => ({
  sourceKey,
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
  physicalPageCount: 10,
  verifiedUsable: true,
});

const activity = (): NormalizedActivity => ({
  schemaVersion: 1,
  title: 'Choose from a component',
  taskProfile: null,
  presentationMode: 'source-assisted',
  contextRequirement: { mode: 'required', acceptedKinds: ['book-pages'] },
  instructions: [{ text: 'Read the component page.' }],
  interaction: { family: 'choice', variant: 'v1' },
  answerRule: { defaultPoints: 1, normalization: 'exact', requiredSelectionCount: 1 },
  stimulus: null,
  assetRefs: [],
  interactions: [{
    family: 'choice',
    interactionId: 'component-choice-1',
    prompt: 'Choose A',
    options: ['A', 'B'],
    sourceAssisted: {
      questionLabel: '1',
      sourceExerciseLabel: 'Component exercise',
      accessiblePrompt: 'Choose one answer.',
      responseShape: 'single-choice',
    },
    itemIdentities: { family: 'choice', optionIds: ['option-a', 'option-b'] },
    answerKey: { family: 'choice', acceptedOptionItemIds: ['option-a'] },
  }],
  scoring: { mode: 'auto-where-possible' },
});

const readActivities = vi.fn(async (input: { readonly activityKeys: readonly string[] }) => Object.fromEntries(
  input.activityKeys.map((activityKey) => [activityKey, {
    activityKey, ownerId: 'teacher-1', revision: 1, lifecycle: 'draft' as const, activity: activity(),
  }]),
));

const manifest = (): BookAssemblyManifestCandidate => ({
  bookId: 'book-1',
  sourceSet: {
    sourceStrategy: 'component_pdfs',
    sources: [
      { sourceKey: 'component-a', sourceVersionId: 'source-a-v1', sourceOrder: 1, ownerNodeKey: 'root' },
      { sourceKey: 'component-b', sourceVersionId: 'source-b-v1', sourceOrder: 2, ownerNodeKey: 'root' },
    ],
  },
  nodes: [
    { nodeKey: 'root', parentNodeKey: null, nodeType: 'section', order: 1 },
    { nodeKey: 'unit-1', parentNodeKey: 'root', nodeType: 'unit', order: 1 },
    { nodeKey: 'unit-2', parentNodeKey: 'root', nodeType: 'unit', order: 2 },
  ],
  units: [
    {
      unitKey: 'unit-1',
      activitySlots: [{
        activityKey: 'slot-a',
        order: 1,
        contextRequirement: 'required',
        pageGroupKeys: ['pages-a'],
      }],
      pageGroups: [{
        pageGroupKey: 'pages-a',
        sourceKey: 'component-a',
        pages: [1],
        activityKeys: ['slot-a'],
        mode: 'activity',
      }],
    },
    {
      unitKey: 'unit-2',
      activitySlots: [{ activityKey: 'slot-b', order: 1, contextRequirement: 'required', pageGroupKeys: ['pages-b'] }],
      pageGroups: [{ pageGroupKey: 'pages-b', sourceKey: 'component-b', pages: [1], activityKeys: ['slot-b'], mode: 'activity' }],
    },
  ],
});

const authority = (): BookAssemblyBookAuthority => ({
  bookId: 'book-1',
  ownerId: 'teacher-1',
  bookMode: 'pdf',
  bookRevision: 5,
  sourceSetRevision: 2,
  sourceSet: manifest().sourceSet,
  sourceVersionAuthority: {
    getSourceVersion: (sourceVersionId) => ['source-a-v1', 'source-b-v1'].includes(sourceVersionId)
      ? trustedProjection(sourceVersionId, sourceVersionId === 'source-a-v1' ? 'component-a' : 'component-b')
      : undefined,
  },
});

const candidate = (unitKey = 'unit-1'): BookAssemblyCandidateRecord => ({
  candidateId: unitKey === 'unit-1' ? 'candidate-1' : 'candidate-2',
  ownerId: 'teacher-1',
  bookId: 'book-1',
  bookRevision: 5,
  sourceSetRevision: 2,
  unitKey,
  revision: unitKey === 'unit-1' ? 4 : 5,
  lifecycle: 'validated',
  manifest: manifest(),
  validation: { valid: true, errors: [] },
  updatedAt: now,
});

const approval = (
  unitKey = 'unit-1', expiresAt = '2026-07-27T14:00:00.000Z',
): BookAssemblyPreviewApprovalReference => ({
  approvalId: unitKey === 'unit-1' ? 'approval-1' : 'approval-2',
  approvalRevision: 1,
  approvedAt: '2026-07-27T12:30:00.000Z',
  expiresAt,
});

const studentDocument = createComponentStudentDocument({
  sourceVersionId: 'student-v1', descriptorRevision: 2, sha256Hex: 'a'.repeat(64), byteSize: 20,
  physicalPageCount: 20, compositionFingerprint: 'composition-1', components: [
    { sourceKey: 'component-a', sourceVersionId: 'source-a-v1', sourceOrder: 1, ownerNodeKey: 'root', localPageCount: 10, combinedStartPage: 1, combinedEndPage: 10 },
    { sourceKey: 'component-b', sourceVersionId: 'source-b-v1', sourceOrder: 2, ownerNodeKey: 'root', localPageCount: 10, combinedStartPage: 11, combinedEndPage: 20 },
  ],
});

const wholeInput = () => ({
  ownerId: 'teacher-1', bookId: 'book-1', bookRevision: 5, sourceSetRevision: 2,
  sourceSet: manifest().sourceSet,
  activationReceipt: {
    schemaVersion: 1 as const, operationId: 'activation-1', inputFingerprint: 'fnv1a64:1111111111111111',
    ownerId: 'teacher-1', bookId: 'book-1' as never, bookRevision: 5, sourceSetRevision: 2,
    sourceSet: manifest().sourceSet,
    unitCandidates: [
      { unitKey: 'unit-1', candidateId: 'candidate-1', candidateRevision: 4, manifestFingerprint: 'fnv1a64:2222222222222222' },
      { unitKey: 'unit-2', candidateId: 'candidate-2', candidateRevision: 5, manifestFingerprint: 'fnv1a64:2222222222222222' },
    ],
    studentDocument: { sourceVersionId: 'student-v1', descriptorRevision: 2, descriptorFingerprint: 'fnv1a64:3333333333333333' },
    activities: [
      { unitKey: 'unit-1', activityKey: 'slot-a', activityId: 'activity-a', activityCandidateId: 'activity-candidate-a', activityCandidateRevision: 1, activityPayloadFingerprint: 'fnv1a64:4444444444444444' },
      { unitKey: 'unit-2', activityKey: 'slot-b', activityId: 'activity-b', activityCandidateId: 'activity-candidate-b', activityCandidateRevision: 1, activityPayloadFingerprint: 'fnv1a64:4444444444444444' },
    ],
    activatedAt: now,
  },
  units: [
    { unitKey: 'unit-1', candidateId: 'candidate-1', candidateRevision: 4, manifestFingerprint: 'fnv1a64:2222222222222222', manifest: manifest() },
    { unitKey: 'unit-2', candidateId: 'candidate-2', candidateRevision: 5, manifestFingerprint: 'fnv1a64:2222222222222222', manifest: manifest() },
  ],
  studentDocument, registryVersion: 'registry-1',
  activities: [
    { unitKey: 'unit-1', activityKey: 'slot-a', activityId: 'activity-a', activityCandidateId: 'activity-candidate-a', activityCandidateRevision: 1, activityPayloadFingerprint: 'fnv1a64:4444444444444444' },
    { unitKey: 'unit-2', activityKey: 'slot-b', activityId: 'activity-b', activityCandidateId: 'activity-candidate-b', activityCandidateRevision: 1, activityPayloadFingerprint: 'fnv1a64:4444444444444444' },
  ],
});

const currentApproval = (unitKey = 'unit-1') => createPreviewApproval({
  approvalId: unitKey === 'unit-1' ? 'approval-1' : 'approval-2',
  approvalRevision: 1,
  actorId: 'teacher-1',
  approvedAt: '2026-07-27T12:30:00.000Z',
  expiresAt: '2026-07-27T14:00:00.000Z',
  preview: createCandidateUnitPreview({
    candidate: candidate(unitKey),
    sourceVersions: [
      trustedProjection('source-a-v1', 'component-a'),
      trustedProjection('source-b-v1', 'component-b'),
    ],
    sourceIsPreviewReady: () => true,
    activitiesByKey: { [unitKey === 'unit-1' ? 'slot-a' : 'slot-b']: activity() },
    registryVersion: 'registry-1',
    studentDocument: { descriptor: studentDocument, request: { opaqueRouteKey: 'doc', expectedByteLength: 20, expectedEtag: 'etag' } },
  }),
  canonicalActivitiesByKey: { [unitKey === 'unit-1' ? 'slot-a' : 'slot-b']: activity() },
  wholeActivationFingerprint: wholeActivationApprovalFingerprint(wholeInput()),
});

const approvalPorts = {
  readPreviewApproval: vi.fn(async (input: { readonly unitKey: string }) => currentApproval(input.unitKey)),
  sourceIsPreviewReady: vi.fn(async () => true),
};

const request = () => ({
  ownerId: 'teacher-1',
  bookId: 'book-1',
  expectedCurrentPublicationId: null,
  expectedBookRevision: 5,
  expectedSourceSetRevision: 2,
  unitApprovals: [
    { ...approval('unit-1'), unitKey: 'unit-1', candidateId: 'candidate-1', candidateRevision: 4 },
    { ...approval('unit-2'), unitKey: 'unit-2', candidateId: 'candidate-2', candidateRevision: 5 },
  ],
});

const idAllocator = () => {
  const used: string[] = [];
  return {
    used,
    allocateId: (kind: string, key: string) => {
      const id = `${kind}:${key}`;
      used.push(id);
      return id;
    },
  };
};

describe('component-PDF publication command boundary', () => {
  it('rejects incomplete, duplicate, mixed, revoked, or lost final approval coverage before publish', async () => {
    const publish = vi.fn(async () => ({ status: 'published' as const }));
    const basePorts = {
      readAuthority: vi.fn(async () => authority()),
      readWholeActivationApprovalInput: vi.fn(async () => wholeInput()),
      readCandidate: vi.fn(async (_bookId: string, unitKey: string) => candidate(unitKey)),
      readActivities, sourceIsPreviewReady: vi.fn(async () => true), publish,
      allocateOperationId: () => operationId, allocateId: (kind: string, key: string) => `${kind}:${key}`,
      now: () => now,
    };
    for (const unitApprovals of [
      request().unitApprovals.slice(0, 1),
      [request().unitApprovals[0]!, request().unitApprovals[0]!],
      [...request().unitApprovals, { ...request().unitApprovals[1]!, unitKey: 'unit-extra' }],
    ]) await expect(createComponentPdfPublicationCommand({ ...basePorts,
      readPreviewApproval: approvalPorts.readPreviewApproval })(
      { ...request(), unitApprovals },
    )).rejects.toThrow('component_pdfs_approval_coverage_invalid');

    await expect(createComponentPdfPublicationCommand({ ...basePorts,
      readPreviewApproval: vi.fn(async (input) => ({ ...currentApproval(input.unitKey),
        ...(input.unitKey === 'unit-2' ? { wholeActivationFingerprint: 'fnv1a64:aaaaaaaaaaaaaaaa' } : {}) }))
    })(request())).rejects.toThrow('component_pdfs_preview_approval_invalid');
    await expect(createComponentPdfPublicationCommand({ ...basePorts,
      readPreviewApproval: vi.fn(async (input) => ({ ...currentApproval(input.unitKey), revoked: input.unitKey === 'unit-2' }))
    })(request())).rejects.toThrow('component_pdfs_preview_approval_invalid');

    let reads = 0;
    await expect(createComponentPdfPublicationCommand({ ...basePorts,
      readPreviewApproval: vi.fn(async (input) => (++reads > 2 ? null : currentApproval(input.unitKey))),
    })(request())).rejects.toThrow('component_pdfs_preview_approval_invalid');
    let wholeReads = 0;
    await expect(createComponentPdfPublicationCommand({ ...basePorts,
      readWholeActivationApprovalInput: vi.fn(async () => (++wholeReads === 1 ? wholeInput() : {
        ...wholeInput(), registryVersion: 'registry-changed',
      })),
      readPreviewApproval: approvalPorts.readPreviewApproval,
    })(request())).rejects.toThrow('component_pdfs_revision_conflict');
    expect(publish).not.toHaveBeenCalled();
  });

  it('allocates trusted operation and record IDs before calling the #64 primitive', async () => {
    const repository = new InMemoryBookAssemblyPublicationRepository();
    const activityVersions = new InMemoryCanonicalActivityVersionRepository();
    const service = createCanonicalBookAssemblyPublicationService(repository, activityVersions);
    const ids = idAllocator();
    const publish = vi.fn((input: CanonicalPublishBookAssemblyInput) => service.publish(input));
    const command = createComponentPdfPublicationCommand({
      readAuthority: vi.fn(async () => authority()),
      readCandidate: vi.fn(async (_bookId, unitKey) => candidate(unitKey)),
      readWholeActivationApprovalInput: vi.fn(async () => wholeInput()),
      readActivities,
      ...approvalPorts,
      publish,
      allocateOperationId: () => operationId,
      allocateId: ids.allocateId,
      now: () => now,
    });

    const receipt = await command(request());

    expect(approvalPorts.readPreviewApproval).toHaveBeenCalledWith({
      bookId: 'book-1',
      unitKey: 'unit-1',
      approvalId: 'approval-1',
    });

    expect(receipt).toMatchObject({
      operationId,
      manifestVersionId: 'manifest-version:activation-1',
      publicationId: 'publication:activation-1',
      publicationRevision: 1,
      result: { status: 'published' },
    });
    expect(ids.used).toEqual([
      'publication:activation-1', 'plan:activation-1', 'manifest-version:activation-1',
      'unit-projection:unit-1:unit-1', 'delivery-plan:unit-1:unit-1',
      'activity:unit-1:slot-a', 'activity-version:unit-1:slot-a',
      'activity-projection:unit-1:slot-a', 'placement:unit-1:slot-a',
      'unit-projection:unit-2:unit-2', 'delivery-plan:unit-2:unit-2',
      'activity:unit-2:slot-b', 'activity-version:unit-2:slot-b',
      'activity-projection:unit-2:slot-b', 'placement:unit-2:slot-b',
    ]);
    expect(publish.mock.calls[0]?.[0]).toMatchObject({
      operationId, manifestVersionId: 'manifest-version:activation-1',
      publicationId: 'publication:activation-1', publicationRevision: 1,
      expectedCurrentPublicationId: null,
    });
    expect(publish.mock.calls[0]?.[0].canonicalActivityVersions).toHaveLength(2);
    await expect(repository.readScope('book-1')).resolves.toMatchObject({
      current: { publicationId: 'publication:activation-1' },
      deliveryPlans: {
        'delivery-plan:unit-1:unit-1': {
          deliveryPlanId: 'delivery-plan:unit-1:unit-1',
          sourceSet: {
            sources: [
              { sourceKey: 'component-a', sourceOrder: 1, ownerNodeKey: 'root' },
              { sourceKey: 'component-b', sourceOrder: 2, ownerNodeKey: 'root' },
            ],
          },
        },
      },
    });
  });

  it('fails closed when client context is stale, unauthorized, expired, or ID allocation fails', async () => {
    const basePorts = {
      readAuthority: vi.fn(async () => authority()),
      readCandidate: vi.fn(async (_bookId, unitKey) => candidate(unitKey)),
      readWholeActivationApprovalInput: vi.fn(async () => wholeInput()),
      readActivities,
      ...approvalPorts,
      publish: vi.fn(async () => ({ status: 'published' as const })),
      allocateOperationId: () => operationId,
      allocateId: (kind: string, key: string) => `${kind}:${key}`,
      now: () => now,
    };

    await expect(createComponentPdfPublicationCommand(basePorts)({
      ...request(),
      unitApprovals: request().unitApprovals.map((item, index) => index ? item : { ...item, candidateRevision: 3 }),
    })).rejects.toThrow('component_pdfs_approval_coverage_invalid');

    await expect(createComponentPdfPublicationCommand({
      ...basePorts,
      readAuthority: vi.fn(async () => ({ ...authority(), ownerId: 'teacher-2' })),
    })(request())).rejects.toThrow('component_pdfs_publication_forbidden');

    await expect(createComponentPdfPublicationCommand(basePorts)({
      ...request(),
      unitApprovals: request().unitApprovals.map((item, index) => index ? item : { ...item, expiresAt: '2026-07-27T12:59:59.000Z' }),
    })).rejects.toThrow('component_pdfs_preview_approval_invalid');

    await expect(createComponentPdfPublicationCommand({
      ...basePorts,
      readPreviewApproval: vi.fn(async () => ({ ...currentApproval(), bookRevision: 6 })),
    })(request())).rejects.toThrow('component_pdfs_preview_approval_invalid');

    await expect(createComponentPdfPublicationCommand({
      ...basePorts,
      readPreviewApproval: vi.fn(async () => ({ ...currentApproval(), unitKey: 'unit-2' })),
    })(request())).rejects.toThrow('component_pdfs_preview_approval_invalid');

    await expect(createComponentPdfPublicationCommand({
      ...basePorts,
      allocateOperationId: () => 'not-a-uuid',
    })(request())).rejects.toThrow(new ComponentPdfPublicationCommandError('trusted_operation_id_failed', 503));
  });

  it('preserves idempotent replay and rejects conflicting replay through #64', async () => {
    const repository = new InMemoryBookAssemblyPublicationRepository();
    const activityVersions = new InMemoryCanonicalActivityVersionRepository();
    const service = createCanonicalBookAssemblyPublicationService(repository, activityVersions);
    const firstAllocator = idAllocator();
    const ports = {
      readAuthority: vi.fn(async () => authority()),
      readCandidate: vi.fn(async (_bookId, unitKey) => candidate(unitKey)),
      readWholeActivationApprovalInput: vi.fn(async () => wholeInput()),
      readActivities,
      ...approvalPorts,
      publish: (input: CanonicalPublishBookAssemblyInput) => service.publish(input),
      allocateOperationId: () => operationId,
      allocateId: firstAllocator.allocateId,
      now: () => now,
    };
    const command = createComponentPdfPublicationCommand(ports);

    await expect(command(request())).resolves.toMatchObject({ result: { status: 'published' } });
    await expect(command(request())).resolves.toMatchObject({ result: { status: 'replayed' } });

    const conflictCommand = createComponentPdfPublicationCommand({
      ...ports,
      allocateId: (kind, key) => `changed:${kind}:${key}`,
    });
    await expect(conflictCommand(request())).resolves.toMatchObject({
      result: {
        status: 'idempotency-conflict',
        failureCode: 'idempotency-conflict',
      },
    });
  });

  it('rejects missing or post-preview Activity payloads before pointer visibility', async () => {
    const repository = new InMemoryBookAssemblyPublicationRepository();
    const activityVersions = new InMemoryCanonicalActivityVersionRepository();
    const service = createCanonicalBookAssemblyPublicationService(repository, activityVersions);
    const basePorts = {
      readAuthority: vi.fn(async () => authority()),
      readCandidate: vi.fn(async (_bookId, unitKey) => candidate(unitKey)),
      readWholeActivationApprovalInput: vi.fn(async () => wholeInput()),
      ...approvalPorts,
      publish: (input: CanonicalPublishBookAssemblyInput) => service.publish(input),
      allocateOperationId: () => operationId,
      allocateId: (kind: string, key: string) => `${kind}:${key}`,
      now: () => now,
    };

    await expect(createComponentPdfPublicationCommand({
      ...basePorts,
      readActivities: vi.fn(async () => ({})),
    })(request())).rejects.toThrow('component_pdfs_activity_payload_missing');

    const changed = activity();
    const changedAnswer: NormalizedActivity = {
      ...changed,
      interactions: changed.interactions.map((interaction) => (
        interaction.family === 'choice'
          ? {
              ...interaction,
              answerKey: { family: 'choice' as const, acceptedOptionItemIds: ['option-b'] },
            }
          : interaction
      )),
    };
    await expect(createComponentPdfPublicationCommand({
      ...basePorts,
      readActivities: vi.fn(async () => ({
        'slot-a': {
          activityKey: 'slot-a',
          ownerId: 'teacher-1',
          revision: 2,
          lifecycle: 'draft' as const,
          activity: changedAnswer,
        },
      })),
    })(request())).rejects.toThrow('component_pdfs_preview_approval_invalid');

    await expect(repository.readScope('book-1')).resolves.toEqual({});
    await expect(activityVersions.readPrepared({
      activityId: 'activity:slot-a',
      activityVersionId: 'activity-version:slot-a',
      activityVersion: 1,
    })).resolves.toBeNull();
  });
});
