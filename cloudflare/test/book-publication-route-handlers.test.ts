import { describe, expect, it, vi } from 'vitest';
import type {
  BookAssemblyBookAuthority,
  BookAssemblyCandidateRecord,
} from '../../src/services/book-assembly/unitAssembly.types.ts';
import type { BookAssemblyPublicationResult } from '../../src/services/book-assembly/publicationTransaction.service.ts';
import { InMemoryBookAssemblyPublicationRepository } from '../../src/services/book-assembly/publicationRepository.ts';
import type { BookAssemblyManifestCandidate } from '../../src/types/bookAssembly.types.ts';
import { createBookRouteHandlers } from '../src/upload-worker/book-route-handlers.ts';
import { createBookRouter } from '../src/upload-worker/book-router.ts';
import { createBookAssemblyPublicationRouteHandlers } from '../src/upload-worker/book-assembly/publication-route-handlers.ts';

const operationId = '00000000-0000-4000-8000-000000000265';
const now = '2026-07-27T13:00:00.000Z';

const request = (path = '/book-assembly/full-pdf-publications', body: unknown = {}) => new Request(`https://worker.test${path}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

const manifest = (strategy: 'full_pdf' | 'component_pdfs'): BookAssemblyManifestCandidate => ({
  bookId: 'book-1',
  sourceSet: {
    sourceStrategy: strategy,
    sources: strategy === 'full_pdf'
      ? [{ sourceKey: 'full', sourceVersionId: 'source-v1', sourceOrder: 1 }]
      : [
          { sourceKey: 'component-a', sourceVersionId: 'source-a-v1', sourceOrder: 1, ownerNodeKey: 'root' },
          { sourceKey: 'component-b', sourceVersionId: 'source-b-v1', sourceOrder: 2, ownerNodeKey: 'root' },
        ],
  },
  nodes: [
    { nodeKey: 'root', parentNodeKey: null, nodeType: 'section', order: 1 },
    { nodeKey: 'unit-1', parentNodeKey: 'root', nodeType: 'unit', order: 1 },
  ],
  units: [{
    unitKey: 'unit-1',
    activitySlots: [{
      activityKey: 'slot-a',
      order: 1,
      contextRequirement: 'required',
      pageGroupKeys: ['pages-a'],
    }],
    pageGroups: [{
      pageGroupKey: 'pages-a',
      sourceKey: strategy === 'full_pdf' ? 'full' : 'component-a',
      pages: [1],
      activityKeys: ['slot-a'],
      mode: 'activity',
    }],
  }],
});

const authority = (strategy: 'full_pdf' | 'component_pdfs'): BookAssemblyBookAuthority => ({
  bookId: 'book-1',
  ownerId: 'teacher-1',
  bookMode: 'pdf',
  bookRevision: 9,
  sourceSetRevision: 3,
  sourceSet: manifest(strategy).sourceSet,
  sourceVersionAuthority: {
    getSourceVersion: (sourceVersionId) => sourceVersionId.startsWith('source-')
      ? { sourceVersionId, bookId: 'book-1', physicalPageCount: 12, verifiedUsable: true }
      : undefined,
  },
});

const candidate = (strategy: 'full_pdf' | 'component_pdfs'): BookAssemblyCandidateRecord => ({
  candidateId: 'candidate-1',
  ownerId: 'teacher-1',
  bookId: 'book-1',
  bookRevision: 9,
  sourceSetRevision: 3,
  unitKey: 'unit-1',
  revision: 6,
  lifecycle: 'validated',
  manifest: manifest(strategy),
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

describe('Book publication route composition', () => {
  it('binds both publication descriptors to the canonical bookAssembly namespace', () => {
    const handlers = createBookRouteHandlers({
      assemblyPublication: {},
    });

    expect(typeof handlers['bookAssembly.fullPdfPublish']).toBe('function');
    expect(typeof handlers['bookAssembly.componentPdfPublish']).toBe('function');
  });

  it('injects the durable repository into the Full-PDF worker seam', async () => {
    const repository = {
      readScope: vi.fn(async () => ({})),
      transaction: vi.fn(),
    };
    const repositoryFactory = vi.fn(() => repository);
    const readAuthority = vi.fn(async () => null);
    const env = {
      BOOK_ASSEMBLY_SERVICE_IDENTITY: 'book-assembly@example.test',
      BOOK_ASSEMBLY_GOOGLE_SA_KEY: JSON.stringify({
        client_email: 'book-assembly@example.test',
        private_key: 'private-key',
      }),
      BOOK_FULL_PDF_PUBLICATION_ENABLED: 'false',
      readDatabaseValue: vi.fn(async () => ({ role: 'teacher' })),
    };
    const handlers = createBookAssemblyPublicationRouteHandlers({
      repositoryFactory,
      fullPdf: { readAuthority },
    });

    const result = await handlers.fullPdfPublish({ request: request(), env, uid: 'teacher-1' });

    expect(result.init.status).toBe(503);
    expect(repositoryFactory).toHaveBeenCalledWith(env);
    expect(readAuthority).not.toHaveBeenCalled();
    expect(repository.transaction).not.toHaveBeenCalled();
  });

  it.each(['full_pdf', 'component_pdfs'] as const)('publishes through the injected repository for %s', async (strategy) => {
    const repository = new InMemoryBookAssemblyPublicationRepository<BookAssemblyPublicationResult>();
    const transaction = vi.spyOn(repository, 'transaction');
    const handlers = createBookAssemblyPublicationRouteHandlers({
      repositoryFactory: vi.fn(() => repository),
      allocateOperationId: () => operationId,
      allocateId: (kind, key) => `${kind}:${key}`,
      now: () => now,
      ...(strategy === 'full_pdf' ? {
        fullPdf: {
          readAuthority: async () => authority(strategy),
          readCandidate: async () => candidate(strategy),
        },
      } : {
        componentPdf: {
          readAuthority: async () => authority(strategy),
          readCandidate: async () => candidate(strategy),
        },
      }),
    });
    const env = {
      ...(strategy === 'full_pdf'
        ? { BOOK_FULL_PDF_PUBLICATION_ENABLED: 'true' }
        : { BOOK_COMPONENT_PDF_PUBLICATION_ENABLED: 'true' }),
      readDatabaseValue: vi.fn(async () => ({ role: 'teacher' })),
    };
    const handler = strategy === 'full_pdf' ? handlers.fullPdfPublish : handlers.componentPdfPublish;
    const result = await handler({
      request: request(
        strategy === 'full_pdf'
          ? '/book-assembly/full-pdf-publications'
          : '/book-assembly/component-pdf-publications',
        body(),
      ),
      env,
      uid: 'teacher-1',
    });

    expect(result.init.status).toBe(200);
    expect(transaction).toHaveBeenCalledOnce();
    expect(transaction).toHaveBeenCalledWith('book-1', expect.any(Function));
  });

  it.each([
    ['/book-assembly/full-pdf-publications', 'BOOK_FULL_PDF_PUBLICATION_ROUTES_ENABLED', 'book_full_pdf_publication_dependencies_unavailable'],
    ['/book-assembly/component-pdf-publications', 'BOOK_COMPONENT_PDF_PUBLICATION_ROUTES_ENABLED', 'book_component_pdf_publication_dependencies_unavailable'],
  ] as const)('routes %s through canonical resolution and fails closed without ports', async (path, gate, dependencyCode) => {
    const router = createBookRouter({
      routeHandlers: { assemblyPublication: {} },
      firebaseVerifier: { verifyAuthorizationHeader: vi.fn(async () => ({ valid: true, uid: 'teacher-1' })) },
    });
    const identity = JSON.stringify({
      client_email: 'book-assembly@example.test',
      private_key: 'private-key',
    });
    const env = {
      [gate]: 'enabled',
      BOOK_ASSEMBLY_SERVICE_IDENTITY: 'book-assembly@example.test',
      BOOK_ASSEMBLY_GOOGLE_SA_KEY: identity,
      BOOK_ROUTE_RATE_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
    };
    const response = await router(new Request(`https://worker.test${path}`, {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:5173',
        Authorization: 'Bearer firebase-token',
        'Content-Type': 'application/json',
        'Content-Length': '0',
      },
    }), env);

    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toEqual({ code: dependencyCode });

    const disabledResponse = await router(new Request(`https://worker.test${path}`, {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:5173',
        Authorization: 'Bearer firebase-token',
        'Content-Type': 'application/json',
        'Content-Length': '0',
      },
    }), { ...env, [gate]: 'disabled' });
    expect(disabledResponse?.status).toBe(503);
    await expect(disabledResponse?.json()).resolves.toEqual({ code: 'book_route_disabled' });
  });

  it('enforces the declared publication control-body limit before route handlers', async () => {
    const router = createBookRouter({
      routeHandlers: { assemblyPublication: {} },
      firebaseVerifier: { verifyAuthorizationHeader: vi.fn(async () => ({ valid: true, uid: 'teacher-1' })) },
    });
    const response = await router(new Request('https://worker.test/book-assembly/full-pdf-publications', {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:5173',
        Authorization: 'Bearer firebase-token',
        'Content-Type': 'application/json',
        'Content-Length': String(256 * 1024 + 1),
      },
    }), {
      BOOK_FULL_PDF_PUBLICATION_ROUTES_ENABLED: 'enabled',
      BOOK_ASSEMBLY_SERVICE_IDENTITY: 'book-assembly@example.test',
      BOOK_ASSEMBLY_GOOGLE_SA_KEY: JSON.stringify({
        client_email: 'book-assembly@example.test',
        private_key: 'private-key',
      }),
      BOOK_ROUTE_RATE_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
    });

    expect(response?.status).toBe(413);
    await expect(response?.json()).resolves.toEqual({ code: 'body_too_large' });
  });

  it('keeps both publication handlers fail-closed until destination reader ports exist', async () => {
    const handlers = createBookAssemblyPublicationRouteHandlers();
    const env = { readDatabaseValue: vi.fn(async () => ({ role: 'teacher' })) };

    await expect(handlers.fullPdfPublish({ request: request(), env, uid: 'teacher-1' }))
      .resolves.toEqual({
        body: { code: 'book_full_pdf_publication_dependencies_unavailable' },
        init: { status: 503 },
      });
    await expect(handlers.componentPdfPublish({ request: request(), env, uid: 'teacher-1' }))
      .resolves.toEqual({
        body: { code: 'book_component_pdf_publication_dependencies_unavailable' },
        init: { status: 503 },
      });
  });
});
