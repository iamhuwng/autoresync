import { describe, expect, it, vi } from 'vitest';
import type {
  BookAssemblyBookAuthority,
  BookAssemblyCandidateRecord,
} from './unitAssembly.types';
import type {
  BookAssemblyManifestCandidate,
  BookAssemblyPreviewApprovalReference,
} from '../../types/bookAssembly.types';
import {
  createBookAssemblyPublicationService,
  type PublishBookAssemblyInput,
} from './publicationTransaction.service';
import { InMemoryBookAssemblyPublicationRepository } from './publicationRepository';
import {
  createFullPdfPublicationCommand,
  FullPdfPublicationCommandError,
} from './fullPdfPublication.command';

const operationId = '00000000-0000-4000-8000-000000000165';
const now = '2026-07-27T13:00:00.000Z';

const manifest = (): BookAssemblyManifestCandidate => ({
  bookId: 'book-1',
  sourceSet: {
    sourceStrategy: 'full_pdf',
    sources: [{ sourceKey: 'full', sourceVersionId: 'source-v1', sourceOrder: 1 }],
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
        sourceKey: 'full',
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
    getSourceVersion: (sourceVersionId) => sourceVersionId === 'source-v1'
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

describe('full-PDF publication command boundary', () => {
  it('allocates trusted operation and record IDs before calling the #64 primitive', async () => {
    const repository = new InMemoryBookAssemblyPublicationRepository();
    const service = createBookAssemblyPublicationService(repository);
    const ids = idAllocator();
    const publish = vi.fn((input: PublishBookAssemblyInput) => service.publish(input));
    const command = createFullPdfPublicationCommand({
      readAuthority: vi.fn(async () => authority()),
      readCandidate: vi.fn(async () => candidate()),
      publish,
      allocateOperationId: () => operationId,
      allocateId: ids.allocateId,
      now: () => now,
    });

    const receipt = await command(request());

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
    }));
    await expect(repository.readScope('book-1')).resolves.toMatchObject({
      current: { publicationId: 'publication:candidate-1' },
      deliveryPlans: {
        'delivery-plan:unit-1': { deliveryPlanId: 'delivery-plan:unit-1' },
      },
    });
  });

  it('fails closed when client context is stale, unauthorized, expired, or ID allocation fails', async () => {
    const basePorts = {
      readAuthority: vi.fn(async () => authority()),
      readCandidate: vi.fn(async () => candidate()),
      publish: vi.fn(async () => ({ status: 'published' as const })),
      allocateOperationId: () => operationId,
      allocateId: (kind: string, key: string) => `${kind}:${key}`,
      now: () => now,
    };

    await expect(createFullPdfPublicationCommand(basePorts)({
      ...request(),
      expectedCandidateRevision: 3,
    })).rejects.toThrow('full_pdf_revision_conflict');

    await expect(createFullPdfPublicationCommand({
      ...basePorts,
      readAuthority: vi.fn(async () => ({ ...authority(), ownerId: 'teacher-2' })),
    })(request())).rejects.toThrow('full_pdf_publication_forbidden');

    await expect(createFullPdfPublicationCommand(basePorts)({
      ...request(),
      previewApproval: approval('2026-07-27T12:59:59.000Z'),
    })).rejects.toThrow('full_pdf_preview_approval_expired');

    await expect(createFullPdfPublicationCommand({
      ...basePorts,
      allocateOperationId: () => 'not-a-uuid',
    })(request())).rejects.toThrow(new FullPdfPublicationCommandError('trusted_operation_id_failed', 503));
  });

  it('preserves idempotent replay and rejects conflicting replay through #64', async () => {
    const repository = new InMemoryBookAssemblyPublicationRepository();
    const service = createBookAssemblyPublicationService(repository);
    const firstAllocator = idAllocator();
    const ports = {
      readAuthority: vi.fn(async () => authority()),
      readCandidate: vi.fn(async () => candidate()),
      publish: (input: PublishBookAssemblyInput) => service.publish(input),
      allocateOperationId: () => operationId,
      allocateId: firstAllocator.allocateId,
      now: () => now,
    };
    const command = createFullPdfPublicationCommand(ports);

    await expect(command(request())).resolves.toMatchObject({ result: { status: 'published' } });
    await expect(command(request())).resolves.toMatchObject({ result: { status: 'replayed' } });

    const conflictCommand = createFullPdfPublicationCommand({
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
});
