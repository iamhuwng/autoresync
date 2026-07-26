import { describe, expect, it, vi } from 'vitest';
import {
  createBookDeliveryDocumentTransport,
  createBookDocumentRoute,
  resolveBookDeliveryWorkerOrigin,
} from './bookDelivery.browser';
import { BookDocumentTransportError } from './bookDocumentTransport.browser';

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
