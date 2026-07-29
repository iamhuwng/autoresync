import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSourceUploadClient,
  createSourceUploadSessionStatePort,
  SourceUploadClientError,
  type BeginSourceUploadCommand,
} from './sourceUpload.client';

const beginCommand: BeginSourceUploadCommand = {
  bookId: 'book/one',
  operationId: '11111111-1111-4111-8111-111111111111',
  sourceKey: 'source-one',
  kind: 'initial',
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

beforeEach(() => {
  sessionStorage.clear();
});

describe('sourceUpload.client', () => {
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

  it('sends only provider completion identity and validates reservation binding', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({
        providerFileId: 'file-1',
        providerFileVersionId: 'file-version-1',
      });
      return Response.json({
        status: 'verified_completed',
        reservationId: 'reservation-1',
        sourceVersionId: 'source-version-1',
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
      providerFileId: 'file-1',
      providerFileVersionId: 'file-version-1',
    })).resolves.toEqual({
      status: 'verified_completed',
      reservationId: 'reservation-1',
      sourceVersionId: 'source-version-1',
    });
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
      providerFileId: '4_file',
      providerFileVersionId: '4_version',
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
      providerFileId: '4_file',
      providerFileVersionId: '4_version',
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
      providerFileId: '4_file',
      providerFileVersionId: '4_version',
    });
    await expect(port.load('book-1')).resolves.toMatchObject({
      phase: 'completion_pending',
      providerFileVersionId: '4_version',
    });
    expect(sessionStorage.getItem('prd0062:book-source-upload:v1:book-1'))
      .not.toMatch(/token|signature|requiredHeaders|uploadUrl/iu);

    sessionStorage.setItem(
      'prd0062:book-source-upload:v1:book-1',
      JSON.stringify({
        ...(await port.load('book-1')),
        uploadUrl: 'https://upload.example/private?signature=secret',
      }),
    );
    await expect(port.load('book-1')).resolves.toBeNull();
    expect(sessionStorage.getItem('prd0062:book-source-upload:v1:book-1')).toBeNull();
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
      'https://control.example/v1/book-source/books/book-1/upload/reservation-1/reconcile',
      expect.objectContaining({ method: 'POST', body: '{}' }),
    ]);
  });
});
