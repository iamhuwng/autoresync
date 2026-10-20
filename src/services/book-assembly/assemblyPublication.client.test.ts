import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBookAssemblyPreviewClient } from './assemblyPublication.client';
import type { BookAssemblyPublicationPointer } from '../../types/bookAssembly.types';

const units = [{
  unitKey: 'unit-1',
  activitySlots: [],
  pageGroups: [],
}] as const;

const pointer: BookAssemblyPublicationPointer = {
  publicationId: 'publication-1',
  publicationRevision: 2,
  manifestVersionId: 'manifest-1',
  bookRevision: 3,
  sourceSetRevision: 4,
  inputFingerprint: 'input-1',
  updatedAt: '2026-08-28T00:00:00.000Z',
  updatedByCommandId: 'command-1',
};

describe('BookAssemblyPreviewClient current publication', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('permits only the exact local Worker origin in development local-only mode', () => {
    const create = (baseUrl: string) => createBookAssemblyPreviewClient({ baseUrl, getIdToken: async () => 'token' });
    vi.stubEnv('DEV', true);
    vi.stubEnv('VITE_FIREBASE_LOCAL_ONLY', 'true');
    expect(() => create('http://localhost:8787')).not.toThrow();
    for (const url of ['http://localhost:8788', 'http://127.0.0.1:8787', 'http://worker.example',
      'http://localhost:8787.evil.test', 'http://user:password@localhost:8787',
      'http://localhost:8787?token=1', 'http://localhost:8787#fragment']) {
      expect(() => create(url)).toThrow('unavailable');
    }
    vi.stubEnv('VITE_FIREBASE_LOCAL_ONLY', 'false');
    expect(() => create('http://localhost:8787')).toThrow('unavailable');
    vi.stubEnv('VITE_FIREBASE_LOCAL_ONLY', 'true');
    vi.stubEnv('DEV', false);
    expect(() => create('http://localhost:8787')).toThrow('unavailable');
    expect(() => create('https://assembly.example')).not.toThrow();
  });

  it('reads the authenticated current publication pointer', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ status: 'published', pointer, units }), { status: 200 }));
    const client = createBookAssemblyPreviewClient({ baseUrl: 'https://assembly.example', getIdToken: async () => 'token', fetchImpl });

    await expect(client.readCurrentPublication?.('book/1')).resolves.toEqual({ pointer, units });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://assembly.example/book-assembly/books/book%2F1/current-publication',
      expect.objectContaining({ method: 'GET', credentials: 'omit', redirect: 'error', headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' } }),
    );
  });

  it('maps an empty current publication to null', async () => {
    const client = createBookAssemblyPreviewClient({
      baseUrl: 'https://assembly.example',
      getIdToken: async () => 'token',
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({ status: 'empty' }), { status: 200 })),
    });

    await expect(client.readCurrentPublication?.('book-1')).resolves.toBeNull();
  });

  it('sends a stable publication operation id as a header, not as request data', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => new Response(JSON.stringify({
      operationId: '11111111-1111-4111-8111-111111111111',
      manifestVersionId: 'manifest-1',
      publicationId: 'publication-1',
      publicationRevision: 2,
      result: { status: 'published' },
    }), { status: 200 }));
    const client = createBookAssemblyPreviewClient({ baseUrl: 'https://assembly.example', getIdToken: async () => 'token', fetchImpl });

    await client.publishFull({
      bookId: 'book-1',
      unitKey: 'unit-1',
      candidateId: 'candidate-1',
      expectedCandidateRevision: 1,
      operationId: '11111111-1111-4111-8111-111111111111',
      expectedCurrentPublicationId: null,
      expectedBookRevision: 1,
      expectedSourceSetRevision: 1,
      previewApproval: {
        approvalId: 'approval-1',
        approvalRevision: 1,
        approvedAt: '2026-08-28T00:00:00.000Z',
        expiresAt: '2026-08-29T00:00:00.000Z',
      },
    });

    const init = fetchImpl.mock.calls[0]?.[1];
    expect(init?.headers).toEqual(expect.objectContaining({
      'Idempotency-Key': '11111111-1111-4111-8111-111111111111',
    }));
    expect(JSON.parse(String(init?.body))).not.toHaveProperty('operationId');
  });

  it('sends exact component Unit approval coverage without a first-Unit fallback', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ operationId: 'op', manifestVersionId: 'm',
      publicationId: 'p', publicationRevision: 1, result: { status: 'published' } }), { status: 200 }));
    const client = createBookAssemblyPreviewClient({ baseUrl: 'https://assembly.example', getIdToken: async () => 'token', fetchImpl });
    await client.publishComponent({ bookId: 'book-1', expectedCurrentPublicationId: null,
      expectedBookRevision: 3, expectedSourceSetRevision: 4, unitApprovals: ['unit-1', 'unit-2'].map((unitKey, index) => ({
        unitKey, candidateId: `candidate-${index + 1}`, candidateRevision: index + 1,
        approvalId: `approval-${index + 1}`, approvalRevision: 1,
        approvedAt: '2026-08-28T00:00:00.000Z', expiresAt: '2026-08-29T00:00:00.000Z',
      })) });
    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({ bookId: 'book-1', unitApprovals: [{ unitKey: 'unit-1' }, { unitKey: 'unit-2' }] });
    expect(body).not.toHaveProperty('unitKey');
  });
});
