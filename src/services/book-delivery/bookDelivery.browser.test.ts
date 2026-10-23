import { describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import {
  createBookHistoricalAttemptDocumentRoute,
  createBookDeliveryDocumentTransport,
  createBookDocumentRoute,
  resolveBookDeliveryWorkerOrigin,
} from './bookDelivery.browser';
import { BookDocumentTransportError } from './bookDocumentTransport.browser';
import { opaqueBookDocumentEtag } from '../../../cloudflare/src/upload-worker/book-delivery/document-worker';

const etag = `"${'b'.repeat(64)}"`;

const okResponse = (url: string): Response => {
  const output = new Response(new TextEncoder().encode('%PDF'), {
    status: 206,
    headers: {
      'accept-ranges': 'bytes',
      'content-length': '4',
      'content-range': 'bytes 0-3/4',
      'content-type': 'application/pdf',
      etag,
    },
  });
  Object.defineProperties(output, {
    redirected: { configurable: true, value: false },
    url: { configurable: true, value: url },
  });
  return output;
};

describe('bookDelivery.browser', () => {
  it('resolves Book Delivery Worker origin before shared deployed Worker fallback', () => {
    expect(resolveBookDeliveryWorkerOrigin({
      VITE_BOOK_DELIVERY_WORKER_URL: ' https://book.example/// ',
      VITE_R2_UPLOAD_WORKER_URL: 'https://fallback.example',
    })).toBe('https://book.example');

    expect(resolveBookDeliveryWorkerOrigin({
      VITE_R2_UPLOAD_WORKER_URL: 'https://fallback.example///',
    })).toBe('https://fallback.example');

    expect(() => resolveBookDeliveryWorkerOrigin({
      VITE_BOOK_DELIVERY_WORKER_URL: 'http://127.0.0.1:8787',
    })).toThrow(BookDocumentTransportError);
  });

  it('creates only canonical opaque document routes', () => {
    expect(createBookDocumentRoute({
      workerOrigin: 'https://worker.example/',
      opaqueRouteKey: 'opaque_1.2-3~x',
      sourceVersionId: 'source-v1',
      expectedByteLength: 4,
      expectedEtag: etag,
      physicalPageNumber: 2,
    })).toEqual({
      url: 'https://worker.example/v1/book-delivery/document/opaque_1.2-3~x',
      sourceVersionId: 'source-v1',
      expectedByteLength: 4,
      expectedEtag: etag,
      physicalPageNumber: 2,
    });

    for (const opaqueRouteKey of ['../secret', 'key?token=secret', '']) {
      expect(() => createBookDocumentRoute({
        workerOrigin: 'https://worker.example',
        opaqueRouteKey,
        sourceVersionId: 'source-v1',
      })).toThrow(BookDocumentTransportError);
    }
  });

  it('streams the combined student document without a Source Version in route metadata', async () => {
    const opaqueRouteKey = `bd_${'d'.repeat(40)}-1-student-document`;
    const input = { workerOrigin: 'https://worker.example', opaqueRouteKey, expectedByteLength: 4, expectedEtag: etag };
    expect(createBookDocumentRoute(input)).not.toHaveProperty('sourceVersionId');
    expect(createBookDocumentRoute({
      ...input, opaqueRouteKey: 'assignment-2--student-1--delivery-1-student-document',
    })).not.toHaveProperty('sourceVersionId');
    expect(() => createBookDocumentRoute({ ...input, sourceVersionId: 'student-v1' }))
      .toThrow(BookDocumentTransportError);
    const fetchImpl = vi.fn(async (url: string | URL | Request) => okResponse(String(url)));
    const transport = createBookDeliveryDocumentTransport({
      route: input, getIdToken: async () => 'token', fetchImpl: fetchImpl as typeof fetch,
    });
    const result = await transport.get({ kind: 'closed', start: 0, end: 3 });
    expect(result.status).toBe(206);
    expect(result).not.toHaveProperty('sourceVersionId');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('creates an attempt-bound historical document route without query authority', () => {
    expect(createBookHistoricalAttemptDocumentRoute({
      bookId: 'book-1',
      studentId: 'student-1',
      resultId: 'result-1',
      opaqueRouteKey: 'opaque-historical',
      sourceVersionId: 'source-version-4',
      expectedByteLength: 4,
    }, {
      VITE_BOOK_DELIVERY_WORKER_URL: 'https://worker.example',
    })).toEqual({
      url: 'https://worker.example/v1/book-delivery/historical-document'
        + '/book-1/student-1/result-1/opaque-historical',
      sourceVersionId: 'source-version-4',
      expectedByteLength: 4,
      physicalPageNumber: undefined,
    });
  });

  it('accepts the historical Worker opaque ETag without guessing it from the document checksum', async () => {
    const checksum = 'a'.repeat(64);
    vi.stubGlobal('crypto', webcrypto);
    let opaqueEtag: string;
    try { opaqueEtag = await opaqueBookDocumentEtag({
      bookId: 'book-1', sourceVersionId: 'combined-v1', storageLocationId: 'location-1',
      providerKind: 'backblaze-b2-s3', privateBucketId: 'bucket-1', providerObjectKey: 'private/combined.pdf',
      providerFileId: 'file-1', providerFileVersionId: 'file-version-1',
      checksum: { algorithm: 'sha-256', value: checksum }, byteSize: 4,
    }); } finally { vi.unstubAllGlobals(); }
    expect(opaqueEtag).not.toBe(`"${checksum}"`);
    const route = createBookHistoricalAttemptDocumentRoute({
      bookId: 'book-1', studentId: 'student-1', resultId: 'result-1',
      opaqueRouteKey: 'combined-route', sourceVersionId: 'combined-v1', expectedByteLength: 4,
    }, { VITE_BOOK_DELIVERY_WORKER_URL: 'https://worker.example' });
    expect(route).not.toHaveProperty('expectedEtag');
    const transport = createBookDeliveryDocumentTransport({ route, getIdToken: async () => 'token',
      trustedWorkerOrigins: ['https://worker.example'],
      fetchImpl: vi.fn(async (url: string | URL | Request) => {
        const response = okResponse(String(url));
        response.headers.set('etag', opaqueEtag);
        return response;
      }),
    });
    await expect(transport.get({ kind: 'closed', start: 0, end: 3 })).resolves.toMatchObject({ etag: opaqueEtag });
  });

  it('builds a document transport without accepting provider authority', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => okResponse(String(url)));
    const transport = createBookDeliveryDocumentTransport({
      route: {
        workerOrigin: 'https://worker.example',
        opaqueRouteKey: 'opaque-1',
        sourceVersionId: 'source-v1',
        expectedByteLength: 4,
        expectedEtag: etag,
      },
      getIdToken: async () => 'token',
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(transport.get({ kind: 'closed', start: 0, end: 3 })).resolves.toMatchObject({
      sourceVersionId: 'source-v1',
      status: 206,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://worker.example/v1/book-delivery/document/opaque-1',
      expect.objectContaining({
        credentials: 'omit',
        redirect: 'error',
        headers: { Authorization: 'Bearer token', Range: 'bytes=0-3' },
      }),
    );

    expect(() => createBookDeliveryDocumentTransport({
      route: {
        url: 'https://s3.us-west-004.backblazeb2.com/private/source.pdf?X-Amz-Signature=secret',
        sourceVersionId: 'source-v1',
      },
      getIdToken: async () => 'token',
    })).toThrow(BookDocumentTransportError);
  });
});
