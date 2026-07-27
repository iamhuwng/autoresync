import { describe, expect, it, vi } from 'vitest';
import type {
  BookAssemblyBookAuthority,
  BookAssemblyCandidateRecord,
} from '../../services/book-assembly/unitAssembly.types';
import type {
  BookAssemblyManifestCandidate,
} from '../../types/bookAssembly.types';
import { InMemoryBookAssemblyPublicationRepository } from '../../services/book-assembly/publicationRepository';
import { createFullPdfPublicationWorkerHandlers } from '../../../cloudflare/src/upload-worker/book-assembly/full-pdf-publication-worker';

const operationId = '00000000-0000-4000-8000-000000000265';
const now = '2026-07-27T13:00:00.000Z';

const request = (body: unknown): Request => new Request('https://worker.test/book-assembly/full-pdf-publications', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

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
  bookRevision: 9,
  sourceSetRevision: 3,
  sourceSet: manifest().sourceSet,
  sourceVersionAuthority: {
    getSourceVersion: (sourceVersionId) => sourceVersionId === 'source-v1'
      ? {
          sourceVersionId,
          bookId: 'book-1',
          physicalPageCount: 12,
          verifiedUsable: true,
        }
      : undefined,
  },
});

const candidate = (): BookAssemblyCandidateRecord => ({
  candidateId: 'candidate-1',
  ownerId: 'teacher-1',
  bookId: 'book-1',
  bookRevision: 9,
  sourceSetRevision: 3,
  unitKey: 'unit-1',
  revision: 6,
  lifecycle: 'validated',
  manifest: manifest(),
  validation: { valid: true, errors: [] },
  updatedAt: now,
});

const body = () => ({
  bookId: 'book-1',
  unitKey: 'unit-1',
  candidateId: 'candidate-1',
  expectedCandidateRevision: 6,
  expectedCurrentPublicationId: null,
  expectedBookRevision: 9,
  expectedSourceSetRevision: 3,
  previewApproval: {
    approvalId: 'approval-1',
    approvalRevision: 1,
    approvedAt: '2026-07-27T12:00:00.000Z',
    expiresAt: '2026-07-27T14:00:00.000Z',
  },
});

const env = {
  BOOK_FULL_PDF_PUBLICATION_ENABLED: 'true',
  readDatabaseValue: async () => ({ role: 'teacher' }),
};

const worker = () => {
  const repository = new InMemoryBookAssemblyPublicationRepository();
  const readAuthority = vi.fn(async () => authority());
  const readCandidate = vi.fn(async () => candidate());
  const handlers = createFullPdfPublicationWorkerHandlers({
    repository,
    readAuthority,
    readCandidate,
    allocateOperationId: () => operationId,
    allocateId: (kind, key) => `${kind}:${key}`,
    now: () => now,
  });
  return { repository, readAuthority, readCandidate, handlers };
};

describe('PRD0062 ticket 16 full-PDF publication Worker boundary', () => {
  it('publishes through trusted ID allocation without accepting client plan or IDs', async () => {
    const fixture = worker();
    const published = await fixture.handlers.publish({
      env,
      uid: 'teacher-1',
      request: request(body()),
    });

    expect(published.init.status).toBe(200);
    expect(published.body).toMatchObject({
      operationId,
      manifestVersionId: 'manifest-version:candidate-1',
      publicationId: 'publication:candidate-1',
      result: { status: 'published' },
    });
    await expect(fixture.repository.readScope('book-1')).resolves.toMatchObject({
      current: { publicationId: 'publication:candidate-1' },
      activityVersions: {
        'activity-version:slot-a': { activityId: 'activity:slot-a' },
      },
      placements: {
        'placement:slot-a': { unitKey: 'unit-1' },
      },
      unitProjections: {
        'unit-projection:unit-1': { unitKey: 'unit-1' },
      },
      deliveryPlans: {
        'delivery-plan:unit-1': { sourceStrategy: 'full_pdf' },
      },
    });

    const injected = await fixture.handlers.publish({
      env,
      uid: 'teacher-1',
      request: request({
        ...body(),
        operationId: '00000000-0000-4000-8000-000000000999',
        publicationId: 'client-publication',
        plan: {},
      }),
    });
    expect(injected).toEqual({
      body: { code: 'invalid_request' },
      init: { status: 400 },
    });
  });

  it('fails closed on disabled gate, unauthorized actor, stale revision, and expired approval', async () => {
    const fixture = worker();

    await expect(fixture.handlers.publish({
      env: { ...env, BOOK_FULL_PDF_PUBLICATION_ENABLED: 'false' },
      uid: 'teacher-1',
      request: request(body()),
    })).resolves.toEqual({
      body: { code: 'book_full_pdf_publication_disabled' },
      init: { status: 503 },
    });

    await expect(fixture.handlers.publish({
      env,
      uid: 'teacher-2',
      request: request(body()),
    })).resolves.toEqual({
      body: { code: 'full_pdf_publication_forbidden' },
      init: { status: 403 },
    });

    await expect(fixture.handlers.publish({
      env,
      uid: 'teacher-1',
      request: request({ ...body(), expectedCandidateRevision: 5 }),
    })).resolves.toEqual({
      body: { code: 'full_pdf_revision_conflict' },
      init: { status: 422 },
    });

    await expect(fixture.handlers.publish({
      env,
      uid: 'teacher-1',
      request: request({
        ...body(),
        previewApproval: {
          ...body().previewApproval,
          expiresAt: '2026-07-27T12:59:59.000Z',
        },
      }),
    })).resolves.toEqual({
      body: { code: 'full_pdf_preview_approval_expired' },
      init: { status: 422 },
    });
  });
});
