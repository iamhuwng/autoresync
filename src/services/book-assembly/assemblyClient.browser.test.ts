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
  it('binds the one A0 activation command to the Book route without owner authority input', async () => {
    const receipt = { schemaVersion: 1, operationId: op('30'), inputFingerprint: 'fnv1a64:0000000000000000' };
    const fetchImpl = vi.fn(async () => ok({ status: 'activated', receipt }));
    const client = createBookAssemblyClient({ baseUrl: 'https://assembly.example', getIdToken: async () => 'token', fetchImpl });
    await expect(client.activateComponentPdf({
      operationId: op('30'), bookId: 'book-1', expectedBookRevision: 3, expectedSourceSetRevision: 5,
      sourceSet: manifest.sourceSet, manifest, studentDocumentSourceVersionId: 'student-v1',
      activatedAt: '2026-09-20T00:00:00.000Z',
    })).resolves.toEqual(receipt);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://assembly.example/book-assembly/books/book-1/component-pdf-activation');
    expect(init.method).toBe('POST');
    expect(String(init.body)).not.toContain('ownerId');
    expect(JSON.parse(String(init.body))).not.toHaveProperty('bookId');
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe(op('30'));
  });

  it('accepts exactly one trusted descriptor authority form', async () => {
    const fetchImpl = vi.fn(async () => ok({ status: 'activated', receipt: { operationId: op('31') } }));
    const client = createBookAssemblyClient({ baseUrl: 'https://assembly.example', getIdToken: async () => 'token', fetchImpl });
    const base = { operationId: op('31'), bookId: 'book-1', expectedBookRevision: 3, expectedSourceSetRevision: 5,
      sourceSet: manifest.sourceSet, manifest, activatedAt: '2026-09-20T00:00:00.000Z' };
    await expect(client.activateComponentPdf({ ...base, preparation: {
      componentReservationIds: ['reservation-1', 'reservation-2'], studentDocumentReservationId: 'reservation-3',
    } })).resolves.toMatchObject({ operationId: op('31') });
    expect(JSON.parse(String((fetchImpl.mock.calls[0]![1] as RequestInit).body))).not.toHaveProperty('studentDocumentSourceVersionId');
    expect(() => client.activateComponentPdf(base)).toThrow(expect.objectContaining({ code: 'component_pdf_activation_authority_invalid', status: 422 }));
    expect(() => client.activateComponentPdf({ ...base, studentDocumentSourceVersionId: 'student-v1', preparation: {
      componentReservationIds: ['reservation-1', 'reservation-2'], studentDocumentReservationId: 'reservation-3',
    } })).toThrow(expect.objectContaining({ code: 'component_pdf_activation_authority_invalid', status: 422 }));
    expect(() => client.activateComponentPdf({ ...base, preparation: {
      componentReservationIds: ['reservation-1'], studentDocumentReservationId: 'reservation-3',
    } })).toThrow(expect.objectContaining({ code: 'component_pdf_activation_authority_invalid', status: 422 }));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

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

  it('loads owner draft discovery with verified saved slots before activation', async () => {
    const sharedManifest = {
      bookId: 'book-1',
      sourceSet: { sourceStrategy: 'component_pdfs' },
      units: [{ unitKey: 'unit-1', activitySlots: [{ activityKey: 'activity-1' }] }],
    };
    const baseCandidate = {
      candidateId: 'candidate-first', ownerId: 'teacher-1', bookId: 'book-1',
      bookRevision: 0, sourceSetRevision: 0, unitKey: 'unit-1', revision: 2, lifecycle: 'validated', updatedAt: 'now',
    };
    const expected = [{
      candidate: { ...baseCandidate, manifest: sharedManifest },
      savedActivityKeysByUnit: { 'unit-1': ['activity-1'] },
    }];
    const wire = {
      status: 'loaded',
      savedActivityKeysByUnit: { 'unit-1': ['activity-1'] },
      manifestsById: { m0: sharedManifest },
      drafts: [{ candidate: { ...baseCandidate, manifest: null }, manifestRef: 'm0' }],
    };
    const fetchImpl = vi.fn(async () => ok(wire));
    const client = createBookAssemblyClient({ baseUrl: 'https://assembly.example',
      getIdToken: async () => 'token', fetchImpl });
    await expect(client.discoverDrafts('book-1')).resolves.toEqual(expected);
    expect(fetchImpl).toHaveBeenCalledWith('https://assembly.example/book-assembly/books/book-1/drafts',
      expect.objectContaining({ method: 'GET', credentials: 'omit', redirect: 'error' }));
    for (const badWire of [
      { ...wire, drafts: [{ candidate: { ...baseCandidate, bookId: 'other-book', manifest: null }, manifestRef: 'm0' }] },
      { ...wire, drafts: [{ candidate: { ...baseCandidate, revision: 0, manifest: null }, manifestRef: 'm0' }] },
      { ...wire, drafts: [{ candidate: { ...baseCandidate, lifecycle: 'draft', manifest: null }, manifestRef: 'm0' }] },
      { ...wire, drafts: [{ candidate: { ...baseCandidate, unitKey: 'unknown-unit', manifest: null }, manifestRef: 'm0' }] },
      { ...wire, drafts: [{ candidate: { ...baseCandidate, manifest: null }, manifestRef: 'missing' }] },
      { ...wire, manifestsById: null },
      { ...wire, savedActivityKeysByUnit: null },
      { ...wire, savedActivityKeysByUnit: { 'unit-1': ['forged-slot'] } },
      { ...wire, savedActivityKeysByUnit: { 'unit-1': [null] } },
    ]) {
      fetchImpl.mockImplementation(async () => ok(badWire));
      await expect(client.discoverDrafts('book-1')).rejects.toMatchObject({ code: 'invalid_response', status: 502 });
    }
  });

  it('hydrates deduplicated discoverDrafts responses for attached multi-unit books with bookRevision >= 1 and >32 units', async () => {
    const unitEntries = Array.from({ length: 40 }, (_, index) => {
      const unitKey = `unit-${String(index + 1).padStart(2, '0')}`;
      return {
        unitKey,
        activitySlots: [{ activityKey: `${unitKey}-ex1` }],
      };
    });
    const sharedManifest = {
      bookId: 'book-1',
      sourceSet: { sourceStrategy: 'full_pdf' },
      units: unitEntries,
    };
    const savedActivityKeysByUnit = Object.fromEntries(
      unitEntries.map((unit) => [unit.unitKey, [unit.activitySlots[0]!.activityKey]]),
    );
    const wireDrafts = unitEntries.map((unit, index) => ({
      candidate: {
        candidateId: `candidate-${index + 1}`,
        ownerId: 'teacher-1',
        bookId: 'book-1',
        bookRevision: 4,
        sourceSetRevision: 2,
        unitKey: unit.unitKey,
        revision: 2,
        lifecycle: 'validated',
        updatedAt: '2026-08-01T00:00:00.000Z',
        manifest: null,
      },
      manifestRef: 'm0',
    }));
    const fetchImpl = vi.fn(async () => ok({
      status: 'loaded',
      savedActivityKeysByUnit,
      manifestsById: { m0: sharedManifest },
      drafts: wireDrafts,
    }));
    const client = createBookAssemblyClient({
      baseUrl: 'https://assembly.example',
      getIdToken: async () => 'token',
      fetchImpl,
    });
    const hydrated = await client.discoverDrafts('book-1');
    expect(hydrated).toHaveLength(40);
    expect(hydrated[0]?.candidate.bookRevision).toBe(4);
    expect(hydrated[0]?.candidate.manifest).toEqual(sharedManifest);
    expect(hydrated[39]?.savedActivityKeysByUnit['unit-40']).toEqual(['unit-40-ex1']);
  });

  it('loads the current owner-scoped Unit candidate without a browser-supplied candidate id', async () => {
    const fetchImpl = vi.fn(async () => ok({
      status: 'loaded',
      candidate: { candidateId: 'candidate-1' },
      savedActivityKeysByUnit: { 'unit-1': ['activity-1'] },
      conflict: null,
    }));
    const client = createBookAssemblyClient({
      baseUrl: 'https://assembly.example',
      getIdToken: async () => 'token',
      fetchImpl,
    });

    await expect(client.loadCurrent('book-1', 'unit-1'))
      .resolves.toEqual({
        candidate: { candidateId: 'candidate-1' },
        savedActivityKeysByUnit: { 'unit-1': ['activity-1'] },
      });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://assembly.example/book-assembly/books/book-1/units/unit-1/current',
      expect.objectContaining({ method: 'GET', credentials: 'omit', redirect: 'error' }),
    );
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
