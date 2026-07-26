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
