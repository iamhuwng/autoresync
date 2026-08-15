import { describe, expect, it, vi } from 'vitest';
import type {
  BookAssemblyBookAuthority,
  BookAssemblyCandidateRecord,
} from './unitAssembly.types';
import type {
  BookAssemblyManifestCandidate,
  BookAssemblyPreviewApprovalReference,
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
} from './unitPreview.service';

const operationId = '00000000-0000-4000-8000-000000000166';
const now = '2026-07-27T13:00:00.000Z';

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

const readActivities = vi.fn(async () => ({
  'slot-a': {
    activityKey: 'slot-a',
    ownerId: 'teacher-1',
    revision: 1,
    lifecycle: 'draft' as const,
    activity: activity(),
  },
}));

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
      activitySlots: [],
      pageGroups: [],
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
      ? {
          sourceVersionId,
          bookId: 'book-1',
          physicalPageCount: 10,
          verifiedUsable: true,
        }
      : undefined,
  },
});

const candidate = (): BookAssemblyCandidateRecord => ({
  candidateId: 'candidate-1',
  ownerId: 'teacher-1',
  bookId: 'book-1',
  bookRevision: 5,
  sourceSetRevision: 2,
  unitKey: 'unit-1',
  revision: 4,
  lifecycle: 'validated',
  manifest: manifest(),
  validation: { valid: true, errors: [] },
  updatedAt: now,
});

const approval = (
  expiresAt = '2026-07-27T14:00:00.000Z',
): BookAssemblyPreviewApprovalReference => ({
  approvalId: 'approval-1',
  approvalRevision: 1,
  approvedAt: '2026-07-27T12:30:00.000Z',
  expiresAt,
});

const currentApproval = () => createPreviewApproval({
  approvalId: 'approval-1',
  approvalRevision: 1,
  actorId: 'teacher-1',
  approvedAt: '2026-07-27T12:30:00.000Z',
  expiresAt: '2026-07-27T14:00:00.000Z',
  preview: createCandidateUnitPreview({
    candidate: candidate(),
    sourceVersions: [
      {
        sourceVersionId: 'source-a-v1',
        bookId: 'book-1',
        physicalPageCount: 10,
        verifiedUsable: true,
      },
      {
        sourceVersionId: 'source-b-v1',
        bookId: 'book-1',
        physicalPageCount: 10,
        verifiedUsable: true,
      },
    ],
    sourceIsPreviewReady: () => true,
    activitiesByKey: { 'slot-a': activity() },
    registryVersion: 'registry-1',
  }),
  canonicalActivitiesByKey: { 'slot-a': activity() },
});

const approvalPorts = {
  readPreviewApproval: vi.fn(async () => currentApproval()),
  sourceIsPreviewReady: vi.fn(async () => true),
};

const request = () => ({
  ownerId: 'teacher-1',
  bookId: 'book-1',
  unitKey: 'unit-1',
  candidateId: 'candidate-1',
  expectedCandidateRevision: 4,
  expectedCurrentPublicationId: null,
  expectedBookRevision: 5,
  expectedSourceSetRevision: 2,
  previewApproval: approval(),
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
  it('allocates trusted operation and record IDs before calling the #64 primitive', async () => {
    const repository = new InMemoryBookAssemblyPublicationRepository();
    const activityVersions = new InMemoryCanonicalActivityVersionRepository();
    const service = createCanonicalBookAssemblyPublicationService(repository, activityVersions);
    const ids = idAllocator();
    const publish = vi.fn((input: CanonicalPublishBookAssemblyInput) => service.publish(input));
    const command = createComponentPdfPublicationCommand({
      readAuthority: vi.fn(async () => authority()),
      readCandidate: vi.fn(async () => candidate()),
      readActivities,
      ...approvalPorts,
      publish,
      allocateOperationId: () => operationId,
      allocateId: ids.allocateId,
      now: () => now,
    });

    const receipt = await command(request());

    expect(approvalPorts.readPreviewApproval).toHaveBeenLastCalledWith({
      bookId: 'book-1',
      unitKey: 'unit-1',
      approvalId: 'approval-1',
    });

    expect(receipt).toMatchObject({
      operationId,
      manifestVersionId: 'manifest-version:candidate-1',
      publicationId: 'publication:candidate-1',
      publicationRevision: 1,
      result: { status: 'published' },
    });
    expect(ids.used).toEqual([
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
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({
      operationId,
      manifestVersionId: 'manifest-version:candidate-1',
      publicationId: 'publication:candidate-1',
      publicationRevision: 1,
      expectedCurrentPublicationId: null,
      canonicalActivityVersions: [
        expect.objectContaining({
          activity: expect.objectContaining({
            interactions: [expect.objectContaining({ interactionId: 'component-choice-1' })],
          }),
        }),
      ],
    }));
    await expect(repository.readScope('book-1')).resolves.toMatchObject({
      current: { publicationId: 'publication:candidate-1' },
      deliveryPlans: {
        'delivery-plan:unit-1': {
          deliveryPlanId: 'delivery-plan:unit-1',
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
      readCandidate: vi.fn(async () => candidate()),
      readActivities,
      ...approvalPorts,
      publish: vi.fn(async () => ({ status: 'published' as const })),
      allocateOperationId: () => operationId,
      allocateId: (kind: string, key: string) => `${kind}:${key}`,
      now: () => now,
    };

    await expect(createComponentPdfPublicationCommand(basePorts)({
      ...request(),
      expectedCandidateRevision: 3,
    })).rejects.toThrow('component_pdfs_revision_conflict');

    await expect(createComponentPdfPublicationCommand({
      ...basePorts,
      readAuthority: vi.fn(async () => ({ ...authority(), ownerId: 'teacher-2' })),
    })(request())).rejects.toThrow('component_pdfs_publication_forbidden');

    await expect(createComponentPdfPublicationCommand(basePorts)({
      ...request(),
      previewApproval: approval('2026-07-27T12:59:59.000Z'),
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
      readCandidate: vi.fn(async () => candidate()),
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
      readCandidate: vi.fn(async () => candidate()),
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
