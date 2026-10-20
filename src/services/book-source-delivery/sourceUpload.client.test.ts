import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSourceUploadClient,
  createSourceUploadSessionStatePort,
  SourceUploadClientError,
  type AttachSourceSetCommand,
  type BeginSourceUploadCommand,
} from './sourceUpload.client';

const beginCommand: BeginSourceUploadCommand = {
  bookId: 'book/one',
  operationId: '11111111-1111-4111-8111-111111111111',
  sourceKey: 'source-one',
  kind: 'initial',
  purpose: 'book-source',
  inspection: {
    schemaVersion: 1,
    trust: 'browser-supplied-untrusted',
    state: 'complete',
    displayFilename: 'source.pdf',
    exactByteSize: 42,
    sha256Hex: 'a'.repeat(64),
    physicalPageCount: 3,
    pdfType: 'application/pdf',
    readability: 'readable',
  },
};

const attachCommand: AttachSourceSetCommand = {
  bookId: 'book-1',
  operationId: '22222222-2222-4222-8222-222222222222',
  expectedBookRevision: 2,
  expectedSourceSetRevision: 3,
  sourceSet: {
    sourceStrategy: 'full_pdf',
    sources: [{ sourceKey: 'full', sourceVersionId: 'source-version-1', sourceOrder: 1 }],
  },
};

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => vi.unstubAllEnvs());

describe('sourceUpload.client', () => {
  it.each([
    ['true', 'http://localhost:8787', true],
    ['false', 'http://localhost:8787', false],
    ['true', 'http://localhost:9999', false],
    ['true', 'http://127.0.0.1:8787', false],
    ['true', 'http://control.example', false],
    ['true', 'http://user:password@localhost:8787', false],
    ['true', 'http://localhost:8787?redirect=other', false],
    ['true', 'http://localhost:8787#fragment', false],
  ])('restricts HTTP control to explicit local mode (%s, %s)', async (localOnly, baseUrl, allowed) => {
    vi.stubEnv('VITE_FIREBASE_LOCAL_ONLY', localOnly);
    vi.stubEnv('DEV', true);
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => Response.json({ sources: [] }));
    const client = createSourceUploadClient({ baseUrl, getIdToken: async () => 'token', fetchImpl });
    if (allowed) {
      await expect(client.listSourceVersions('book-1')).resolves.toEqual([]);
      expect(fetchImpl).toHaveBeenCalledOnce();
      expect(fetchImpl.mock.calls[0][0]).toBe('http://localhost:8787/v1/book-source/books/book-1/sources');
    } else {
      await expect(client.listSourceVersions('book-1')).rejects.toMatchObject({ code: 'unavailable', status: 0 });
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  });

  it('rejects HTTP control in a production build even if the local-only flag is set', async () => {
    vi.stubEnv('VITE_FIREBASE_LOCAL_ONLY', 'true');
    vi.stubEnv('DEV', false);
    const fetchImpl = vi.fn();
    const client = createSourceUploadClient({ baseUrl: 'http://localhost:8787', getIdToken: async () => 'token', fetchImpl });
    await expect(client.listSourceVersions('book-1')).rejects.toMatchObject({ code: 'unavailable', status: 0 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('sends metadata-only begin control and never serializes PDF bytes', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toEqual({
        Authorization: 'Bearer id-token',
        'Content-Type': 'application/json',
        'Idempotency-Key': beginCommand.operationId,
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        operationId: beginCommand.operationId,
        sourceKey: beginCommand.sourceKey,
        kind: 'initial',
        purpose: 'book-source',
        inspection: beginCommand.inspection,
      });
      expect(String(init?.body)).not.toMatch(/%PDF|arrayBuffer|fileBytes|base64/iu);
      return Response.json({
        status: 'reserved',
        reservationId: 'reservation-1',
        sourceVersionId: 'version-1',
        upload: {
          url: 'https://upload.example/exact-object',
          expiresAt: '2099-07-26T01:00:00.000Z',
          requiredHeaders: {
            'content-type': 'application/pdf',
            'x-amz-content-sha256': beginCommand.inspection.sha256Hex,
            'x-amz-meta-book-source-byte-size': String(beginCommand.inspection.exactByteSize),
            'x-amz-meta-book-source-sha256': beginCommand.inspection.sha256Hex,
          },
        },
      });
    });
    const client = createSourceUploadClient({
      baseUrl: 'https://control.example/',
      getIdToken: async () => 'id-token',
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(client.begin(beginCommand)).resolves.toMatchObject({
      status: 'reserved',
      reservationId: 'reservation-1',
      sourceVersionId: 'version-1',
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://control.example/v1/book-source/books/book%2Fone/upload/begin',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('sends the exact submission operation binding when one is supplied', async () => {
    const command = { ...beginCommand, submissionOperationId: 'submission-1' };
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({
        operationId: command.operationId,
        submissionOperationId: command.submissionOperationId,
      });
      return Response.json({
        status: 'reserved',
        reservationId: 'reservation-1',
        sourceVersionId: 'version-1',
        upload: {
          url: 'https://upload.example/exact-object',
          expiresAt: '2099-07-26T01:00:00.000Z',
          requiredHeaders: {
            'content-type': 'application/pdf',
            'x-amz-content-sha256': command.inspection.sha256Hex,
            'x-amz-meta-book-source-byte-size': String(command.inspection.exactByteSize),
            'x-amz-meta-book-source-sha256': command.inspection.sha256Hex,
          },
        },
      });
    });
    const client = createSourceUploadClient({
      baseUrl: 'https://control.example',
      getIdToken: async () => 'id-token',
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(client.begin(command)).resolves.toMatchObject({ reservationId: 'reservation-1' });
  });

  it('sends only the operation identity and validates the completion response', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({ operationId: '11111111-1111-4111-8111-111111111111' });
      return Response.json({
        status: 'verified_completed',
        reservationId: 'reservation-1',
        sourceVersionId: 'source-version-1',
        checksum: { algorithm: 'sha-256', value: 'a'.repeat(64) },
      });
    });
    const client = createSourceUploadClient({
      baseUrl: 'https://control.example',
      getIdToken: async () => 'id-token',
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(client.complete({
      bookId: 'book-1',
      reservationId: 'reservation-1',
      operationId: '11111111-1111-4111-8111-111111111111',
    })).resolves.toEqual({
      status: 'verified_completed',
      reservationId: 'reservation-1',
      sourceVersionId: 'source-version-1',
      checksum: { algorithm: 'sha-256', value: 'a'.repeat(64) },
    });
  });

  it.each([
    ['missing checksum', {}],
    ['malformed checksum', { checksum: { algorithm: 'sha-256', value: 'not-a-hash' } }],
    ['legacy optional completion fields', {
      checksum: { algorithm: 'sha-256', value: 'a'.repeat(64) },
      bookRevision: 1,
    }],
  ])('fails closed on %s completion response', async (_label, checksumResponse) => {
    const client = createSourceUploadClient({
      baseUrl: 'https://control.example',
      getIdToken: async () => 'id-token',
      fetchImpl: vi.fn(async () => Response.json({
        status: 'verified_completed',
        reservationId: 'reservation-1',
        sourceVersionId: 'source-version-1',
        ...checksumResponse,
      })) as typeof fetch,
    });

    await expect(client.complete({
      bookId: 'book-1',
      reservationId: 'reservation-1',
      operationId: '11111111-1111-4111-8111-111111111111',
    })).rejects.toMatchObject({ code: 'invalid_response', status: 502 });
  });

  it('sends a trusted safety decision and returns its version/hash-bound projection', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({
        operationId: beginCommand.operationId,
        studentSafeStatus: 'ready',
        reasonCode: 'teacher-reviewed',
      });
      return Response.json({
        status: 'verified_completed',
        reservationId: 'reservation-1',
        sourceVersionId: 'source-version-1',
        checksum: { algorithm: 'sha-256', value: 'a'.repeat(64) },
        purpose: 'book-source',
        studentSafeStatus: 'ready',
        studentSafeDecision: {
          decidedBy: 'teacher-1',
          decidedAt: '2026-08-11T00:02:00.000Z',
          sourceVersionId: 'source-version-1',
          sha256Hex: 'A'.repeat(64),
          reasonCode: 'teacher-reviewed',
        },
      });
    });
    const client = createSourceUploadClient({
      baseUrl: 'https://control.example',
      getIdToken: async () => 'id-token',
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(client.decideStudentSafeSource({
      bookId: 'book-1',
      reservationId: 'reservation-1',
      operationId: beginCommand.operationId,
      studentSafeStatus: 'ready',
      reasonCode: 'teacher-reviewed',
    })).resolves.toMatchObject({
      status: 'verified_completed',
      purpose: 'book-source',
      sourceVersionId: 'source-version-1',
      studentSafeDecision: expect.objectContaining({ sha256Hex: 'a'.repeat(64) }),
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://control.example/v1/book-source/books/book-1/upload/reservation-1/student-safe/decide',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Idempotency-Key': beginCommand.operationId }),
      }),
    );
  });

  it('sends explicit full-PDF attachment with CAS revisions and accepts replay', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({
        operationId: attachCommand.operationId,
        expectedBookRevision: 2,
        expectedSourceSetRevision: 3,
        sourceSet: attachCommand.sourceSet,
      });
      return Response.json({
        status: 'replayed',
        bookRevision: 2,
        sourceSetRevision: 3,
        sourceSet: attachCommand.sourceSet,
      });
    });
    const client = createSourceUploadClient({
      baseUrl: 'https://control.example',
      getIdToken: async () => 'id-token',
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(client.attachSourceSet(attachCommand)).resolves.toEqual({
      status: 'replayed',
      bookRevision: 2,
      sourceSetRevision: 3,
      sourceSet: attachCommand.sourceSet,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://control.example/v1/book-source/books/book-1/source-set/attach',
      expect.objectContaining({
        headers: expect.objectContaining({ 'Idempotency-Key': attachCommand.operationId }),
      }),
    );
  });

  it.each([
    ['component count 1', {
      sourceStrategy: 'component_pdfs',
      sources: [{ sourceKey: 'a', sourceVersionId: 'a-v1', sourceOrder: 1, ownerNodeKey: 'unit-1' }],
    }],
    ['component count 21', {
      sourceStrategy: 'component_pdfs',
      sources: Array.from({ length: 21 }, (_, index) => ({
        sourceKey: `source-${index + 1}`,
        sourceVersionId: `version-${index + 1}`,
        sourceOrder: index + 1,
        ownerNodeKey: 'unit-1',
      })),
    }],
    ['component order gap', {
      sourceStrategy: 'component_pdfs',
      sources: [
        { sourceKey: 'a', sourceVersionId: 'a-v1', sourceOrder: 1, ownerNodeKey: 'unit-1' },
        { sourceKey: 'b', sourceVersionId: 'b-v1', sourceOrder: 3, ownerNodeKey: 'unit-1' },
      ],
    }],
    ['component duplicate source key', {
      sourceStrategy: 'component_pdfs',
      sources: [
        { sourceKey: 'a', sourceVersionId: 'a-v1', sourceOrder: 1, ownerNodeKey: 'unit-1' },
        { sourceKey: 'a', sourceVersionId: 'b-v1', sourceOrder: 2, ownerNodeKey: 'unit-1' },
      ],
    }],
    ['component duplicate source version', {
      sourceStrategy: 'component_pdfs',
      sources: [
        { sourceKey: 'a', sourceVersionId: 'a-v1', sourceOrder: 1, ownerNodeKey: 'unit-1' },
        { sourceKey: 'b', sourceVersionId: 'a-v1', sourceOrder: 2, ownerNodeKey: 'unit-1' },
      ],
    }],
    ['component reordered orders', {
      sourceStrategy: 'component_pdfs',
      sources: [
        { sourceKey: 'a', sourceVersionId: 'a-v1', sourceOrder: 2, ownerNodeKey: 'unit-1' },
        { sourceKey: 'b', sourceVersionId: 'b-v1', sourceOrder: 1, ownerNodeKey: 'unit-1' },
      ],
    }],
    ['full PDF with zero sources', { sourceStrategy: 'full_pdf', sources: [] }],
    ['full PDF with two sources', {
      sourceStrategy: 'full_pdf',
      sources: [
        { sourceKey: 'a', sourceVersionId: 'a-v1', sourceOrder: 1 },
        { sourceKey: 'b', sourceVersionId: 'b-v1', sourceOrder: 2 },
      ],
    }],
    ['full PDF with non-one order', {
      sourceStrategy: 'full_pdf',
      sources: [{ sourceKey: 'a', sourceVersionId: 'a-v1', sourceOrder: 2 }],
    }],
  ])('fails closed on %s attachment response', async (_label, sourceSet) => {
    const client = createSourceUploadClient({
      baseUrl: 'https://control.example',
      getIdToken: async () => 'id-token',
      fetchImpl: vi.fn(async () => Response.json({
        status: 'attached',
        bookRevision: 1,
        sourceSetRevision: 1,
        sourceSet,
      })) as typeof fetch,
    });

    await expect(client.attachSourceSet({
      ...attachCommand,
      sourceSet: sourceSet as never,
    })).rejects.toMatchObject({ code: 'invalid_response', status: 502 });
  });

  it('surfaces explicit attachment conflicts for caller retry or refresh', async () => {
    const client = createSourceUploadClient({
      baseUrl: 'https://control.example',
      getIdToken: async () => 'id-token',
      fetchImpl: vi.fn(async () => Response.json({ code: 'stale_cas' }, { status: 409 })) as typeof fetch,
    });

    await expect(client.attachSourceSet(attachCommand)).rejects.toEqual(
      new SourceUploadClientError('stale_cas', 409),
    );
  });

  it.each([
    ['stale decision version', { sourceVersionId: 'other-version' }],
    ['student document', { purpose: 'student-document' }],
    ['hash mismatch', { sha256Hex: 'b'.repeat(64) }],
  ])('fails closed on %s safety decision response', async (_label, patch) => {
    const client = createSourceUploadClient({
      baseUrl: 'https://control.example',
      getIdToken: async () => 'id-token',
      fetchImpl: vi.fn(async () => Response.json({
        status: 'verified_completed',
        reservationId: 'reservation-1',
        sourceVersionId: 'source-version-1',
        checksum: { algorithm: 'sha-256', value: 'a'.repeat(64) },
        purpose: 'book-source',
        studentSafeStatus: 'ready',
        studentSafeDecision: {
          decidedBy: 'teacher-1',
          decidedAt: '2026-08-11T00:02:00.000Z',
          sourceVersionId: 'source-version-1',
          sha256Hex: 'a'.repeat(64),
          reasonCode: 'teacher-reviewed',
          ...patch,
        },
      })) as typeof fetch,
    });

    await expect(client.decideStudentSafeSource({
       bookId: 'book-1',
       reservationId: 'reservation-1',
       operationId: beginCommand.operationId,
       studentSafeStatus: 'ready',
      reasonCode: 'teacher-reviewed',
    })).rejects.toMatchObject({ code: 'invalid_response', status: 502 });
  });

  it('fails closed on a malformed success or sanitized server failure', async () => {
    const malformed = createSourceUploadClient({
      baseUrl: 'https://control.example',
      getIdToken: async () => 'id-token',
      fetchImpl: vi.fn(async () => Response.json({ status: 'reserved', privateBucketId: 'leak' })) as typeof fetch,
    });
    await expect(malformed.begin(beginCommand)).rejects.toMatchObject({
      code: 'invalid_response',
      status: 502,
    });

    const denied = createSourceUploadClient({
      baseUrl: 'https://control.example',
      getIdToken: async () => 'id-token',
      fetchImpl: vi.fn(async () => Response.json({ code: 'rollout_denied' }, { status: 503 })) as typeof fetch,
    });
    await expect(denied.begin(beginCommand)).rejects.toEqual(
      new SourceUploadClientError('rollout_denied', 503),
    );
  });

  it('gets a fresh token for each control call and rejects redirected response binding', async () => {
    const getIdToken = vi.fn()
      .mockResolvedValueOnce('begin-token')
      .mockResolvedValueOnce('complete-token');
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(Response.json({
        status: 'reserved',
        reservationId: 'reservation-1',
        sourceVersionId: 'source-version-1',
        upload: {
          url: 'https://upload.example/exact.pdf',
          expiresAt: '2099-01-01T00:00:00.000Z',
          requiredHeaders: {
            'content-type': 'application/pdf',
            'x-amz-content-sha256': beginCommand.inspection.sha256Hex,
            'x-amz-meta-book-source-byte-size': String(beginCommand.inspection.exactByteSize),
            'x-amz-meta-book-source-sha256': beginCommand.inspection.sha256Hex,
          },
        },
      }))
      .mockResolvedValueOnce(Response.json({
        status: 'verified_completed',
        reservationId: 'reservation-1',
        sourceVersionId: 'source-version-1',
        checksum: { algorithm: 'sha-256', value: 'a'.repeat(64) },
      }));
    const client = createSourceUploadClient({
      baseUrl: 'https://control.example',
      getIdToken,
      fetchImpl,
    });
    await client.begin(beginCommand);
    await client.complete({
      bookId: beginCommand.bookId,
      reservationId: 'reservation-1',
      operationId: beginCommand.operationId,
    });

    expect(getIdToken).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({
      credentials: 'omit',
      redirect: 'error',
      headers: expect.objectContaining({ Authorization: 'Bearer begin-token' }),
    });
    expect(fetchImpl.mock.calls[1]?.[1]).toMatchObject({
      credentials: 'omit',
      redirect: 'error',
      headers: expect.objectContaining({ Authorization: 'Bearer complete-token' }),
    });

    const redirectedResponse = Response.json({
      status: 'verified_completed',
      reservationId: 'reservation-1',
      sourceVersionId: 'source-version-1',
      checksum: { algorithm: 'sha-256', value: 'a'.repeat(64) },
    });
    Object.defineProperties(redirectedResponse, {
      redirected: { value: true },
      url: { value: 'https://evil.example/complete' },
    });
    const redirected = createSourceUploadClient({
      baseUrl: 'https://control.example',
      getIdToken: async () => 'token',
      fetchImpl: vi.fn(async () => redirectedResponse) as typeof fetch,
    });
    await expect(redirected.complete({
      bookId: 'book-1',
      reservationId: 'reservation-1',
      operationId: beginCommand.operationId,
    })).rejects.toMatchObject({ code: 'response_binding_mismatch' });
  });

  it('persists reload-safe metadata only and removes injected capability state', async () => {
    const port = createSourceUploadSessionStatePort();
    await port.save({
      schemaVersion: 1,
      bookId: 'book-1',
      operationId: '11111111-1111-4111-8111-111111111111',
      reservationId: 'reservation-1',
      sourceVersionId: 'source-version-1',
      sourceKey: 'main',
      kind: 'initial',
      displayFilename: 'book.pdf',
      exactByteSize: 42,
      sha256Hex: 'a'.repeat(64),
      phase: 'completion_pending',
    });
    await expect(port.load('book-1')).resolves.toMatchObject({
      phase: 'completion_pending',
    });
    expect(JSON.stringify(sessionStorage.getItem('prd0062:book-source-upload:v1:book-1:main')))
      .not.toMatch(/token|signature|requiredHeaders|uploadUrl/iu);

    sessionStorage.setItem(
      'prd0062:book-source-upload:v1:book-1:main',
      JSON.stringify({
        ...(await port.load('book-1')),
        uploadUrl: 'https://upload.example/private?signature=secret',
      }),
    );
    await expect(port.load('book-1')).resolves.toBeNull();
    expect(sessionStorage.getItem('prd0062:book-source-upload:v1:book-1:main')).toBeNull();
  });

  it('persists a begin-pending replay identity without remote or provider authority', async () => {
    const port = createSourceUploadSessionStatePort();
    await port.save({
      schemaVersion: 1,
      bookId: 'book-1',
      operationId: '11111111-1111-4111-8111-111111111111',
      sourceKey: 'main',
      kind: 'initial',
      displayFilename: 'book.pdf',
      exactByteSize: 42,
      sha256Hex: 'a'.repeat(64),
      phase: 'begin_pending',
    });

    await expect(port.load('book-1')).resolves.toEqual({
      schemaVersion: 1,
      bookId: 'book-1',
      operationId: '11111111-1111-4111-8111-111111111111',
      sourceKey: 'main',
      kind: 'initial',
      displayFilename: 'book.pdf',
      exactByteSize: 42,
      sha256Hex: 'a'.repeat(64),
      phase: 'begin_pending',
    });
    expect(JSON.stringify(sessionStorage.getItem('prd0062:book-source-upload:v1:book-1:main')))
      .not.toMatch(/reservationId|sourceVersionId|provider|token|signature|headers|uploadUrl/iu);
  });

  it('sends cancellation metadata only and never claims provider deletion', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.body).toBe('{}');
      expect(String(init?.body)).not.toMatch(/%PDF|providerDeleted|fileBytes/iu);
      return Response.json({ status: 'cancellation_requested' });
    });
    const client = createSourceUploadClient({
      baseUrl: 'https://control.example',
      getIdToken: async () => 'token',
      fetchImpl: fetchImpl as typeof fetch,
    });
    await expect(client.requestCancellation({
      bookId: 'book-1',
      reservationId: 'reservation-1',
    })).resolves.toBeUndefined();
  });

  it('uses bound GET status and POST reconcile lifecycle routes', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(Response.json({
        reservationId: 'reservation-1',
        bookId: 'book-1',
        sourceVersionId: 'source-version-1',
        status: 'cleanup_pending',
        retryKind: 'cleanup',
      }))
      .mockResolvedValueOnce(Response.json({
        reservationId: 'reservation-1',
        bookId: 'book-1',
        sourceVersionId: 'source-version-1',
        status: 'released',
        retryKind: 'none',
      }));
    const client = createSourceUploadClient({
      baseUrl: 'https://control.example',
      reconciliationBaseUrl: 'https://reconciliation.example',
      getIdToken: async () => 'token',
      fetchImpl,
    });
    const command = { bookId: 'book-1', reservationId: 'reservation-1' };
    await expect(client.status(command)).resolves.toMatchObject({
      status: 'cleanup_pending',
    });
    await expect(client.reconcile(command)).resolves.toMatchObject({
      status: 'released',
    });
    expect(fetchImpl.mock.calls[0]).toEqual([
      'https://control.example/v1/book-source/books/book-1/upload/reservation-1/status',
      expect.objectContaining({ method: 'GET' }),
    ]);
    expect(fetchImpl.mock.calls[0]?.[1]).not.toHaveProperty('body');
    expect(fetchImpl.mock.calls[1]).toEqual([
      'https://reconciliation.example/v1/book-source/books/book-1/upload/reservation-1/reconcile',
      expect.objectContaining({ method: 'POST', body: '{}' }),
    ]);
  });

  it('loads a bounded trusted source projection for session-independent resume', async () => {
    const fetchImpl = vi.fn(async () => Response.json({
      sources: [{
        sourceKey: 'full',
        sourceVersionId: 'source-version-1',
        bookId: 'book-1',
        checksum: { algorithm: 'sha-256', value: 'a'.repeat(64) },
        physicalPageCount: 14,
        verifiedUsable: true,
        purpose: 'book-source',
        studentSafeStatus: 'ready',
        studentSafeDecision: {
          decidedBy: 'teacher-1',
          decidedAt: '2026-08-11T00:02:00.000Z',
          sourceVersionId: 'source-version-1',
          sha256Hex: 'a'.repeat(64),
          reasonCode: 'teacher-reviewed',
        },
      }],
    }));
    const client = createSourceUploadClient({
      baseUrl: 'https://control.example',
      getIdToken: async () => 'token',
      fetchImpl,
    });

    await expect(client.listSourceVersions('book-1')).resolves.toEqual([{
      sourceKey: 'full',
      sourceVersionId: 'source-version-1',
      bookId: 'book-1',
      checksum: { algorithm: 'sha-256', value: 'a'.repeat(64) },
      physicalPageCount: 14,
      verifiedUsable: true,
      purpose: 'book-source',
      studentSafeStatus: 'ready',
      studentSafeDecision: {
        decidedBy: 'teacher-1',
        decidedAt: '2026-08-11T00:02:00.000Z',
        sourceVersionId: 'source-version-1',
        sha256Hex: 'a'.repeat(64),
        reasonCode: 'teacher-reviewed',
      },
    }]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://control.example/v1/book-source/books/book-1/sources',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchImpl.mock.calls[0]?.[1]).not.toHaveProperty('body');
  });

  it('retains private unreviewed rows but excludes student-document, unsafe, and rejected rows', async () => {
    const complete = {
      sourceKey: 'full',
      sourceVersionId: 'source-ready',
      bookId: 'book-1',
      checksum: { algorithm: 'sha-256', value: 'a'.repeat(64) },
      physicalPageCount: 14,
      verifiedUsable: true,
      purpose: 'book-source',
      studentSafeStatus: 'ready',
      studentSafeDecision: {
        decidedBy: 'teacher-1',
        decidedAt: '2026-08-11T00:02:00.000Z',
        sourceVersionId: 'source-ready',
        sha256Hex: 'a'.repeat(64),
        reasonCode: 'teacher-reviewed',
      },
    };
    const client = createSourceUploadClient({
      baseUrl: 'https://control.example',
      getIdToken: async () => 'token',
      fetchImpl: vi.fn(async () => Response.json({
        sources: [
          complete,
          { ...complete, sourceVersionId: 'student-document-1', purpose: 'student-document', studentSafeDecision: { ...complete.studentSafeDecision, sourceVersionId: 'student-document-1' } },
          { ...complete, sourceVersionId: 'rejected-1', studentSafeStatus: 'rejected', studentSafeDecision: { ...complete.studentSafeDecision, sourceVersionId: 'rejected-1', reasonCode: 'teacher-only-content' } },
          { ...complete, sourceVersionId: 'unsafe-1', verifiedUsable: false, studentSafeDecision: { ...complete.studentSafeDecision, sourceVersionId: 'unsafe-1' } },
          (() => {
            const unreviewed = { ...complete, sourceVersionId: 'unreviewed-1', studentSafeStatus: 'unreviewed' } as Record<string, unknown>;
            delete unreviewed.studentSafeDecision;
            return unreviewed;
          })(),
          { ...complete, sourceVersionId: 'review-required-1', studentSafeStatus: 'review-required', studentSafeDecision: { ...complete.studentSafeDecision, sourceVersionId: 'review-required-1' } },
        ],
      })) as typeof fetch,
    });

    await expect(client.listSourceVersions('book-1')).resolves.toEqual([
      complete,
      expect.objectContaining({ sourceVersionId: 'unreviewed-1', studentSafeStatus: 'unreviewed' }),
      expect.objectContaining({ sourceVersionId: 'review-required-1', studentSafeStatus: 'review-required' }),
    ]);
  });

  it.each([
    ['missing decision', (source: Record<string, unknown>) => ({ ...source, studentSafeDecision: undefined })],
    ['malformed decision', (source: Record<string, unknown>) => ({ ...source, studentSafeDecision: { decidedBy: 'teacher-1' } })],
  ])('fails closed on %s', async (_label, mutate) => {
    const source = {
      sourceKey: 'full',
      sourceVersionId: 'source-version-1',
      bookId: 'book-1',
      checksum: { algorithm: 'sha-256', value: 'a'.repeat(64) },
      physicalPageCount: 14,
      verifiedUsable: true,
      purpose: 'book-source',
      studentSafeStatus: 'ready',
      studentSafeDecision: {
        decidedBy: 'teacher-1',
        decidedAt: '2026-08-11T00:02:00.000Z',
        sourceVersionId: 'source-version-1',
        sha256Hex: 'a'.repeat(64),
        reasonCode: 'teacher-reviewed',
      },
    };
    const client = createSourceUploadClient({
      baseUrl: 'https://control.example',
      getIdToken: async () => 'token',
      fetchImpl: vi.fn(async () => Response.json({ sources: [mutate(source)] })) as typeof fetch,
    });

    await expect(client.listSourceVersions('book-1')).rejects.toMatchObject({
      code: 'invalid_response',
      status: 502,
    });
  });

  it.each([
    ['stale sourceVersionId', { sourceVersionId: 'other-version' }],
    ['malformed hash', { sha256Hex: 'not-a-sha256' }],
    ['mismatched checksum', { sha256Hex: 'b'.repeat(64) }],
  ])('fails closed on %s in the safety decision', async (_label, decisionPatch) => {
    const source = {
      sourceKey: 'full',
      sourceVersionId: 'source-version-1',
      bookId: 'book-1',
      checksum: { algorithm: 'sha-256', value: 'a'.repeat(64) },
      physicalPageCount: 14,
      verifiedUsable: true,
      purpose: 'book-source',
      studentSafeStatus: 'ready',
      studentSafeDecision: {
        decidedBy: 'teacher-1',
        decidedAt: '2026-08-11T00:02:00.000Z',
        sourceVersionId: 'source-version-1',
        sha256Hex: 'a'.repeat(64),
        reasonCode: 'teacher-reviewed',
        ...decisionPatch,
      },
    };
    const client = createSourceUploadClient({
      baseUrl: 'https://control.example',
      getIdToken: async () => 'token',
      fetchImpl: vi.fn(async () => Response.json({ sources: [source] })) as typeof fetch,
    });

    await expect(client.listSourceVersions('book-1')).rejects.toMatchObject({
      code: 'invalid_response',
      status: 502,
    });
  });

  it('fails closed on malformed trusted source projection data', async () => {
    const client = createSourceUploadClient({
      baseUrl: 'https://control.example',
      getIdToken: async () => 'token',
      fetchImpl: vi.fn(async () => Response.json({
        sources: [{ sourceKey: 'full', sourceVersionId: 'source-version-1', bookId: 'book-1', physicalPageCount: 0, verifiedUsable: true }],
      })) as typeof fetch,
    });
    await expect(client.listSourceVersions('book-1')).rejects.toMatchObject({
      code: 'invalid_response',
      status: 502,
    });
  });

  it('fails closed when the reconciliation Worker is not configured', async () => {
    const fetchImpl = vi.fn();
    const client = createSourceUploadClient({
      baseUrl: 'https://control.example',
      getIdToken: async () => 'token',
      fetchImpl,
    });

    await expect(client.reconcile({
      bookId: 'book-1',
      reservationId: 'reservation-1',
    })).rejects.toMatchObject({ code: 'unavailable', status: 503 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
