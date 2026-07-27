import { describe, expect, it, vi } from 'vitest';
import { createBookAssemblyClient } from './assemblyClient.browser';
import type { BookAssemblyManifestCandidate } from '../../types/bookAssembly.types';

const op = (suffix: string): string => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;
const manifest: BookAssemblyManifestCandidate = {
  bookId: 'book-1',
  sourceSet: {
    sourceStrategy: 'full_pdf',
    sources: [{ sourceKey: 'full', sourceVersionId: 'source-1', sourceOrder: 1 }],
  },
  nodes: [
    { nodeKey: 'root', parentNodeKey: null, nodeType: 'section', order: 1 },
    { nodeKey: 'unit-1', parentNodeKey: 'root', nodeType: 'unit', order: 1 },
  ],
  units: [{
    unitKey: 'unit-1',
    activitySlots: [],
    pageGroups: [{
      pageGroupKey: 'pages-1',
      sourceKey: 'full',
      pages: [1],
      activityKeys: [],
      mode: 'reference_only',
    }],
  }],
};
const ok = (body: unknown): Response => new Response(JSON.stringify(body), {
  status: 200,
  headers: { 'content-type': 'application/json' },
});

describe('PRD0062 ticket 13A browser client boundary', () => {
  it('binds every command to Book/Unit scope and sends metadata-only candidate commands', async () => {
    const fetchImpl = vi.fn(async () => ok({
      status: 'created',
      receipt: { operationId: op('1'), fingerprint: 'x', status: 'created', createdAt: 'now' },
    }));
    const client = createBookAssemblyClient({
      baseUrl: 'https://assembly.example',
      getIdToken: async () => 'token',
      fetchImpl,
    });
    await client.create({
      operationId: op('1'),
      bookId: 'book-1',
      expectedBookRevision: 1,
      expectedSourceSetRevision: 2,
      unitKey: 'unit-1',
      manifest,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://assembly.example/book-assembly/books/book-1/units/unit-1/candidates',
      expect.objectContaining({
        method: 'POST',
        credentials: 'omit',
        redirect: 'error',
        headers: expect.objectContaining({ 'Idempotency-Key': op('1') }),
      }),
    );
    const request = fetchImpl.mock.calls[0]![1] as RequestInit;
    expect(String(request.body)).toContain('"sourceVersionId":"source-1"');
    expect(String(request.body)).not.toContain('providerObjectKey');
    await client.load('book-1', 'unit-1', 'candidate-1').catch(() => undefined);
  });

  it('sends trusted migration commands without accepting a browser-supplied target manifest', async () => {
    const fetchImpl = vi.fn(async () => ok({
      status: 'created',
      receipt: { operationId: op('10'), fingerprint: 'x', status: 'created', createdAt: 'now' },
    }));
    const client = createBookAssemblyClient({
      baseUrl: 'https://assembly.example',
      getIdToken: async () => 'token',
      fetchImpl,
    });
    const targetSourceSet = {
      sourceStrategy: 'component_pdfs' as const,
      sources: [
        { sourceKey: 'component-a', sourceVersionId: 'source-a', sourceOrder: 1, ownerNodeKey: 'unit-1' },
        { sourceKey: 'component-b', sourceVersionId: 'source-b', sourceOrder: 2, ownerNodeKey: 'unit-2' },
      ] as const,
    };
    await client.migrate({
      operationId: op('10'), bookId: 'book-1', unitKey: 'unit-1', candidateId: 'candidate-1',
      expectedBookRevision: 4, expectedSourceSetRevision: 2, expectedCandidateRevision: 3,
      targetSourceSetRevision: 3, targetSourceSet,
      remaps: [{ pageGroupKey: 'pages-1', pages: [{ from: { sourceKey: 'full', physicalPageNumber: 1 }, to: { sourceKey: 'component-a', physicalPageNumber: 1 } }] }],
    });
    await client.confirm({
      operationId: op('11'), bookId: 'book-1', unitKey: 'unit-1', migrationCandidateId: 'migration-1',
      expectedCurrentCandidateId: 'candidate-1', expectedCurrentCandidateRevision: 3,
      expectedMigrationCandidateRevision: 1,
    });
    await client.discardMigration({
      operationId: op('12'), bookId: 'book-1', unitKey: 'unit-1', migrationCandidateId: 'migration-2',
      expectedCurrentCandidateId: 'candidate-1', expectedCurrentCandidateRevision: 3,
      expectedMigrationCandidateRevision: 1,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const [migrateUrl, migrateInit] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(migrateUrl).toBe('https://assembly.example/book-assembly/books/book-1/units/unit-1/migrations');
    expect(migrateInit.method).toBe('POST');
    expect((migrateInit.headers as Record<string, string>)['Idempotency-Key']).toBe(op('10'));
    expect(String(migrateInit.body)).toContain('targetSourceSet');
    expect(String(migrateInit.body)).not.toContain('targetManifest');

    const [confirmUrl, confirmInit] = fetchImpl.mock.calls[1] as [string, RequestInit];
    expect(confirmUrl).toBe('https://assembly.example/book-assembly/books/book-1/units/unit-1/migrations/migration-1/confirm');
    expect(confirmInit.method).toBe('POST');
    expect(String(confirmInit.body)).not.toContain('bookId');
    expect(String(confirmInit.body)).not.toContain('migrationCandidateId');

    const [discardUrl, discardInit] = fetchImpl.mock.calls[2] as [string, RequestInit];
    expect(discardUrl).toBe('https://assembly.example/book-assembly/books/book-1/units/unit-1/migrations/migration-2');
    expect(discardInit.method).toBe('DELETE');
    expect(String(discardInit.body)).toContain('expectedCurrentCandidateId');
    expect(String(discardInit.body)).not.toContain('unitKey');
  });

  it('binds published source-strategy successor commands to the canonical route', async () => {
    const fetchImpl = vi.fn(async () => ok({
      status: 'published',
      pointer: { publicationId: 'publication-successor' },
      impact: { fromStrategy: 'full_pdf', toStrategy: 'component_pdfs' },
    }));
    const client = createBookAssemblyClient({
      baseUrl: 'https://assembly.example',
      getIdToken: async () => 'token',
      fetchImpl,
    });
    const operationId = op('20');
    await client.publishSuccessor({
      operationId,
      bookId: 'book-1',
      expectedCurrentPublicationId: 'publication-before',
      expectedBookRevision: 7,
      expectedSourceSetRevision: 4,
      targetSourceSetRevision: 5,
      targetSourceSet: {
        sourceStrategy: 'component_pdfs',
        sources: [{ sourceKey: 'component-a', sourceVersionId: 'source-a', sourceOrder: 1, ownerNodeKey: 'section-1' }],
      },
      remaps: [{
        pageGroupKey: 'pages-1',
        pages: [{ from: { sourceKey: 'full', physicalPageNumber: 1 }, to: { sourceKey: 'component-a', physicalPageNumber: 1 } }],
      }],
      previewApproval: {
        approvalId: 'approval-1',
        approvalRevision: 1,
        approvedAt: '2026-07-27T23:00:00.000Z',
        expiresAt: '2026-07-28T01:00:00.000Z',
      },
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://assembly.example/book-assembly/source-strategy-successors',
      expect.objectContaining({
        method: 'POST',
        credentials: 'omit',
        redirect: 'error',
        headers: expect.objectContaining({ 'Idempotency-Key': operationId }),
      }),
    );
    const request = fetchImpl.mock.calls[0]![1] as RequestInit;
    expect(String(request.body)).toContain('expectedCurrentPublicationId');
    expect(String(request.body)).toContain('previewApproval');
    expect(String(request.body)).not.toContain('pdfBytes');
  });

  it('fails closed on redirect binding mismatch, empty token, and malformed response', async () => {
    const redirected = vi.fn(async () => ({
      redirected: true,
      url: 'https://evil.example',
      ok: true,
      status: 200,
      text: async () => '{}',
    } as unknown as Response));
    const client = createBookAssemblyClient({
      baseUrl: 'https://assembly.example',
      getIdToken: async () => 'token',
      fetchImpl: redirected,
    });
    await expect(client.create({
      operationId: op('2'), bookId: 'book-1', expectedBookRevision: 1,
      expectedSourceSetRevision: 2, unitKey: 'unit-1', manifest,
    })).rejects.toMatchObject({ code: 'response_binding_mismatch' });
    const noToken = createBookAssemblyClient({
      baseUrl: 'https://assembly.example',
      getIdToken: async () => '',
      fetchImpl: vi.fn(),
    });
    await expect(noToken.load('book-1', 'unit-1', 'candidate-1'))
      .rejects.toMatchObject({ code: 'unauthorized' });
  });
});
