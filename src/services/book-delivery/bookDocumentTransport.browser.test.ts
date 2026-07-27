import { describe, expect, it, vi } from 'vitest';
import {
  BookDocumentTransportError,
  createBookDocumentTransport,
  type BookDocumentRoute,
} from './bookDocumentTransport.browser';

const routeUrl = 'https://worker.example/v1/book-delivery/document/opaque-1';
const etag = `"${'a'.repeat(64)}"`;
const bytes = new TextEncoder().encode('%PDF-1.7\n');

const route = (overrides: Partial<BookDocumentRoute> = {}): BookDocumentRoute => ({
  url: routeUrl,
  sourceVersionId: 'source-v1',
  expectedByteLength: 100,
  expectedEtag: etag,
  physicalPageNumber: 1,
  ...overrides,
});

const response = (
  init: {
    readonly status?: number;
    readonly headers?: Record<string, string>;
    readonly body?: BodyInit | null;
    readonly url?: string;
    readonly redirected?: boolean;
  } = {},
): Response => {
  const status = init.status ?? 206;
  const output = new Response(init.body ?? bytes, {
    status,
    headers: {
      'accept-ranges': 'bytes',
      'content-length': String(bytes.byteLength),
      'content-type': 'application/pdf',
      etag,
      ...(status === 206 ? { 'content-range': `bytes 0-${bytes.byteLength - 1}/100` } : {}),
      ...init.headers,
    },
  });
  Object.defineProperties(output, {
    redirected: { configurable: true, value: init.redirected ?? false },
    url: { configurable: true, value: init.url ?? routeUrl },
  });
  return output;
};

const headResponse = (headers: Record<string, string> = {}): Response =>
  response({
    status: 200,
    body: null,
    headers: {
      'content-length': '100',
      ...headers,
    },
  });

const consume = async (body: ReadableStream<Uint8Array>): Promise<Uint8Array> => {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    chunks.push(next.value);
    length += next.value.byteLength;
  }
  const output = new Uint8Array(length);
  let offset = 0;
  chunks.forEach((chunk) => {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  });
  return output;
};

describe('bookDocumentTransport.browser', () => {
  it('sends Firebase Authorization on HEAD, full GET, and range requests', async () => {
    const getIdToken = vi.fn(async () => 'id-token');
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'HEAD') return headResponse();
      if (!Reflect.has(init?.headers ?? {}, 'Range')) return response({
        status: 200,
        headers: { 'content-length': String(bytes.byteLength) },
      });
      return response();
    });
    const transport = createBookDocumentTransport({
      route: route({ expectedByteLength: undefined }),
      getIdToken,
      fetchImpl: fetchImpl as typeof fetch,
    });

    await transport.head();
    await consume((await transport.get()).body);
    await consume((await transport.get({ kind: 'closed', start: 0, end: 8 })).body);
    await consume((await transport.get({ kind: 'open', start: 8 })).body);
    await consume((await transport.get({ kind: 'suffix', suffixLength: 9 })).body);

    expect(getIdToken).toHaveBeenCalledTimes(5);
    expect(fetchImpl.mock.calls.map((call) => call[1])).toEqual([
      expect.objectContaining({
        method: 'HEAD',
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        headers: { Authorization: 'Bearer id-token' },
      }),
      expect.objectContaining({
        method: 'GET',
        headers: { Authorization: 'Bearer id-token' },
      }),
      expect.objectContaining({
        method: 'GET',
        headers: { Authorization: 'Bearer id-token', Range: 'bytes=0-8' },
      }),
      expect.objectContaining({
        method: 'GET',
        headers: { Authorization: 'Bearer id-token', Range: 'bytes=8-' },
      }),
      expect.objectContaining({
        method: 'GET',
        headers: { Authorization: 'Bearer id-token', Range: 'bytes=-9' },
      }),
    ]);
  });

  it('refreshes the Firebase token exactly once on authentication expiry', async () => {
    const getIdToken = vi.fn()
      .mockResolvedValueOnce('stale-token')
      .mockResolvedValueOnce('fresh-token');
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(Response.json({ code: 'unauthorized' }, { status: 401 }))
      .mockResolvedValueOnce(response());
    const transport = createBookDocumentTransport({
      route: route({ expectedByteLength: undefined }),
      getIdToken,
      fetchImpl: fetchImpl as typeof fetch,
    });

    await consume((await transport.get({ kind: 'closed', start: 0, end: 8 })).body);

    expect(getIdToken).toHaveBeenNthCalledWith(1, false);
    expect(getIdToken).toHaveBeenNthCalledWith(2, true);
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({
      headers: { Authorization: 'Bearer stale-token', Range: 'bytes=0-8' },
    });
    expect(fetchImpl.mock.calls[1]?.[1]).toMatchObject({
      headers: { Authorization: 'Bearer fresh-token', Range: 'bytes=0-8' },
    });

    const denied = createBookDocumentTransport({
      route: route(),
      getIdToken: vi.fn()
        .mockResolvedValueOnce('stale-token')
        .mockResolvedValueOnce('still-denied'),
      fetchImpl: vi.fn()
        .mockResolvedValueOnce(Response.json({ code: 'unauthorized' }, { status: 401 }))
        .mockResolvedValueOnce(Response.json({ code: 'unauthorized' }, { status: 401 })) as typeof fetch,
    });
    await expect(denied.get()).rejects.toEqual(new BookDocumentTransportError('unauthorized', 401));
  });

  it('validates metadata before exposing a PDF.js stream', async () => {
    const transport = createBookDocumentTransport({
      route: route(),
      getIdToken: async () => 'token',
      fetchImpl: vi.fn(async () => response()) as typeof fetch,
    });
    await expect(transport.get({ kind: 'closed', start: 0, end: 8 })).resolves.toMatchObject({
      acceptRanges: 'bytes',
      contentLength: bytes.byteLength,
      contentRange: { start: 0, end: bytes.byteLength - 1, total: 100 },
      contentType: 'application/pdf',
      etag,
      sourceVersionId: 'source-v1',
      status: 206,
    });

    for (const bad of [
      response({ headers: { 'content-type': 'text/html' } }),
      response({ headers: { 'accept-ranges': 'none' } }),
      response({ headers: { etag: '"short"' } }),
      response({ headers: { 'content-range': 'bytes 0-99/99' } }),
      response({ url: 'https://worker.example/v1/book-delivery/document/other' }),
    ]) {
      const invalid = createBookDocumentTransport({
        route: route(),
        getIdToken: async () => 'token',
        fetchImpl: vi.fn(async () => bad) as typeof fetch,
      });
      await expect(invalid.get({ kind: 'closed', start: 0, end: 8 }))
        .rejects.toMatchObject({ code: expect.stringMatching(/invalid_metadata|response_binding_mismatch/u) });
    }
  });

  it('rejects a range request when the server ignores Range and returns a full 200', async () => {
    const transport = createBookDocumentTransport({
      route: route(),
      getIdToken: async () => 'token',
      fetchImpl: vi.fn(async () => response({
        status: 200,
        headers: { 'content-length': '100' },
      })) as typeof fetch,
    });
    await expect(transport.get({ kind: 'closed', start: 0, end: 8 }))
      .rejects.toMatchObject({ code: 'invalid_metadata' });
  });

  it.each([
    ['truncated body', bytes.slice(0, 2), String(bytes.byteLength)],
    ['oversized body', new Uint8Array([...bytes, 1]), String(bytes.byteLength)],
  ])('rejects %s against content-length while reading', async (_label, body, contentLength) => {
    const transport = createBookDocumentTransport({
      route: route({ expectedByteLength: undefined }),
      getIdToken: async () => 'token',
      fetchImpl: vi.fn(async () => response({
        body,
        headers: {
          'content-length': contentLength,
          'content-range': `bytes 0-${Number(contentLength) - 1}/${Number(contentLength)}`,
        },
      })) as typeof fetch,
    });
    const output = await transport.get({ kind: 'closed', start: 0, end: Number(contentLength) - 1 });
    await expect(consume(output.body)).rejects.toMatchObject({ code: 'truncated_body' });
    expect(transport.activeRequestCount).toBe(0);
  });

  it('does not buffer whole documents into ArrayBuffer or Blob', async () => {
    let exposedBody: BodyInit | null | undefined;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
    const fetchImpl = vi.fn(async () => {
      const output = response({ body });
      Object.defineProperty(output, 'arrayBuffer', { value: vi.fn() });
      Object.defineProperty(output, 'blob', { value: vi.fn() });
      return output;
    });
    const transport = createBookDocumentTransport({
      route: route({ expectedByteLength: undefined }),
      getIdToken: async () => 'token',
      fetchImpl: fetchImpl as typeof fetch,
    });

    const result = await transport.get({ kind: 'closed', start: 0, end: 8 });
    exposedBody = result.body;
    expect(exposedBody).toBeInstanceOf(ReadableStream);
    await consume(result.body);
    const fetched = await fetchImpl.mock.results[0]?.value;
    expect(fetched.arrayBuffer).not.toHaveBeenCalled();
    expect(fetched.blob).not.toHaveBeenCalled();
    expect(transport.activeRequestCount).toBe(0);
  });

  it('aborts stale requests on source switch and destroy', async () => {
    const getIdToken = vi.fn(async () => 'token');
    const fetchImpl = vi.fn((_url, init?: RequestInit) => new Promise<Response>(
      (_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        }, { once: true });
      },
    ));
    const transport = createBookDocumentTransport({
      route: route(),
      getIdToken,
      fetchImpl: fetchImpl as typeof fetch,
    });

    const pending = transport.get({ kind: 'closed', start: 0, end: 8 });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    transport.switchRoute(route({
      url: 'https://worker.example/v1/book-delivery/document/opaque-2',
      sourceVersionId: 'source-v2',
    }));
    expect(transport.activeRequestCount).toBe(0);
    await expect(pending).rejects.toMatchObject({ code: 'aborted' });

    const second = transport.get({ kind: 'closed', start: 0, end: 8 });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
    transport.destroy();
    await expect(second).rejects.toMatchObject({ code: 'aborted' });
    expect(transport.activeRequestCount).toBe(0);
  });

  it('maps denial and route-expiry failures to redacted typed states', async () => {
    const onRouteExpired = vi.fn();
    const fetchImpl = vi.fn(async () => Response.json({
      code: 'not_found',
      token: 'secret-token',
      providerObjectKey: 'private/source.pdf',
    }, { status: 404 }));
    const transport = createBookDocumentTransport({
      route: route(),
      getIdToken: async () => 'secret-token',
      fetchImpl: fetchImpl as typeof fetch,
      onRouteExpired,
    });

    await expect(transport.get()).rejects.toMatchObject({
      code: 'route_expired',
      message: 'book_document_transport_route_expired',
      status: 404,
    });
    await expect(transport.get()).rejects.not.toMatchObject({
      message: expect.stringMatching(/secret-token|private\/source\.pdf/u),
    });
    expect(onRouteExpired).toHaveBeenCalledWith('not-found');
  });

  it('rejects credentialized or provider-shaped document routes before fetch', async () => {
    for (const badRoute of [
      'https://user:pass@worker.example/v1/book-delivery/document/opaque-1',
      'https://worker.example/v1/book-delivery/document/opaque-1?token=secret',
      'https://worker.example/v1/book-delivery/document/opaque-1#secret',
      'https://s3.us-west-004.backblazeb2.com/private/source.pdf',
    ]) {
      expect(() => createBookDocumentTransport({
        route: route({ url: badRoute }),
        getIdToken: async () => 'token',
      })).toThrow(BookDocumentTransportError);
    }
  });

  it('accepts the canonical teacher Assembly route without broadening provider-shaped paths', async () => {
    const teacherRoute = route({
      url: 'https://worker.example/v1/book-delivery/teacher-assembly/book-1/unit-1/candidate-1/3/full/source-v1/4/7',
    });
    const fetchImpl = vi.fn(async () => response({ url: teacherRoute.url }));
    const transport = createBookDocumentTransport({
      route: teacherRoute,
      getIdToken: async () => 'teacher-token',
      fetchImpl: fetchImpl as typeof fetch,
      trustedWorkerOrigins: ['https://worker.example/'],
    });

    await expect(transport.get({ kind: 'closed', start: 0, end: bytes.byteLength - 1 }))
      .resolves.toMatchObject({ sourceVersionId: 'source-v1', status: 206 });
    expect(fetchImpl).toHaveBeenCalledWith(
      teacherRoute.url,
      expect.objectContaining({
        credentials: 'omit',
        redirect: 'error',
      }),
    );
  });

  it('rejects a teacher Assembly projection targeting an untrusted HTTPS origin before token fetch', () => {
    const getIdToken = vi.fn(async () => 'teacher-token');
    expect(() => createBookDocumentTransport({
      route: route({
        url: 'https://attacker.example/v1/book-delivery/teacher-assembly/book-1/unit-1/candidate-1/3/full/source-v1/4/7',
      }),
      getIdToken,
      trustedWorkerOrigins: ['https://worker.example/'],
    })).toThrow(new BookDocumentTransportError('invalid_route'));
    expect(getIdToken).not.toHaveBeenCalled();
  });
});
