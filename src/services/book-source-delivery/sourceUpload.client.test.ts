import { describe, expect, it, vi } from 'vitest';
import {
  createSourceUploadClient,
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
});
