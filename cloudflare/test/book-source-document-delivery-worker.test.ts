import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type { BookDocumentAuthorizationDecision } from '../src/upload-worker/book-delivery/documentAuthorization';
import { createBookDocumentWorker } from '../src/upload-worker/book-delivery/document-worker';
import type { BookSourceVersionStorageIdentity } from '../../src/types/bookSource.types';
import type { SourceProviderPort } from '../../src/services/book-source-delivery/sourceProvider.port';

const bytes = Uint8Array.from({ length: 32 }, (_, index) => index);
const identity: BookSourceVersionStorageIdentity = {
  bookId: 'book-1',
  sourceVersionId: 'source-v1',
  storageLocationId: 'location-1',
  providerKind: 'backblaze-b2-s3',
  privateBucketId: 'bucket-1',
  providerObjectKey: 'private/book-1/source-v1.pdf',
  providerFileId: 'file-1',
  providerFileVersionId: 'version-1',
  checksum: {
    algorithm: 'sha-256',
    value: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  },
  byteSize: bytes.byteLength,
};

const source = {
  ...identity,
  provider: 'b2' as const,
  bucket: 'book-source',
  objectKey: identity.providerObjectKey,
};

const decision = {
  kind: 'book-document-authorized',
  uid: 'student-1',
  bindingId: 'binding-1',
  contextId: 'solo-1',
  contextKind: 'solo',
  bookId: identity.bookId,
  bookRevision: 1,
  publicationId: 'publication-1',
  publicationRevision: 1,
  sourceStrategy: 'full_pdf',
  sourceVersionIds: [identity.sourceVersionId],
  sourceLocations: [source],
  scope: { kind: 'book' },
} as unknown as BookDocumentAuthorizationDecision;

const provider = () => ({
  readObjectMetadata: vi.fn(async ({ identity: requested }: { identity: BookSourceVersionStorageIdentity }) => ({
    identity: requested,
    contentType: 'application/pdf' as const,
  })),
  readBounded: vi.fn(async ({
    identity: requested,
    range,
  }: {
    identity: BookSourceVersionStorageIdentity;
    range: { offset: number; length: number };
  }) => {
    expect(requested).toBe(source);
    return {
      bytes: bytes.slice(range.offset, range.offset + range.length),
      totalByteSize: bytes.byteLength,
      offset: range.offset,
    };
  }),
});

const authorized = vi.fn(async () => ({
  ok: true as const,
  decision,
  source,
}));

const request = (init: RequestInit = {}) => new Request(
  'https://worker.test/v1/book-delivery/document/opaque-1',
  init,
);

describe('Ticket #52 private Book PDF responder', () => {
  it('authorizes once and streams a full GET from the exact pinned identity', async () => {
    const adapter = provider();
    const worker = createBookDocumentWorker({ authorize: authorized, provider: adapter });
    const response = await worker.fetch(request({ method: 'GET' }), {});
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-length')).toBe('32');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('etag')).toMatch(/^"[a-f0-9]{64}"$/u);
    expect(response.headers.get('etag')).not.toContain(identity.providerFileVersionId);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect(authorized).toHaveBeenCalledTimes(1);
    expect(adapter.readObjectMetadata).toHaveBeenCalledWith(
      { identity: source },
      expect.objectContaining({ signal: expect.any(AbortSignal), timeoutMs: 30_000 }),
    );
    expect(adapter.readBounded).toHaveBeenCalledWith(
      { identity: source, range: { offset: 0, length: 32 } },
      expect.objectContaining({ signal: expect.any(AbortSignal), timeoutMs: 30_000 }),
    );
  });

  it('closes the stream after the authorized byte range is exhausted', async () => {
    const adapter = provider();
    const worker = createBookDocumentWorker({ authorize: authorized, provider: adapter });
    const response = await worker.fetch(request({ method: 'GET' }), {});
    const reader = response.body!.getReader();

    const first = await reader.read();
    expect(first).toEqual({ done: false, value: bytes });
    expect(await reader.read()).toEqual({ done: true, value: undefined });
  });

  it('keeps a 500 MiB response bounded to 1 MiB provider reads', async () => {
    const byteSize = 500 * 1024 * 1024;
    const largeSource = { ...source, byteSize };
    const lengths: number[] = [];
    const adapter: Pick<SourceProviderPort, 'readObjectMetadata' | 'readBounded'> = {
      readObjectMetadata: vi.fn(async () => ({
        identity: largeSource,
        contentType: 'application/pdf' as const,
      })),
      readBounded: vi.fn(async ({ range }) => {
        if (range.offset === undefined || range.length === undefined) {
          throw new Error('unexpected-range-shape');
        }
        lengths.push(range.length);
        return {
          bytes: new Uint8Array(range.length),
          totalByteSize: byteSize,
          offset: range.offset,
        };
      }),
    };
    const authorize = vi.fn(async () => ({
      ok: true as const,
      decision: { ...decision, sourceLocations: [largeSource] },
      source: largeSource,
    }));
    const response = await createBookDocumentWorker({ authorize, provider: adapter })
      .fetch(request({ method: 'GET' }), {});
    const reader = response.body!.getReader();

    for (let index = 0; index < 3; index += 1) {
      const chunk = await reader.read();
      expect(chunk.done).toBe(false);
      expect(chunk.value?.byteLength).toBe(1024 * 1024);
    }
    await reader.cancel();

    expect(response.headers.get('content-length')).toBe(String(byteSize));
    expect(lengths.length).toBeLessThanOrEqual(4);
    expect(lengths.every((length) => length <= 1024 * 1024)).toBe(true);
  });

  it('propagates downstream request abort to an in-flight provider read', async () => {
    const byteSize = 2 * 1024 * 1024;
    const largeSource = { ...source, byteSize };
    let reads = 0;
    let providerSignal: AbortSignal | undefined;
    let markStarted!: () => void;
    let markAborted!: () => void;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    const aborted = new Promise<void>((resolve) => { markAborted = resolve; });
    const adapter: Pick<SourceProviderPort, 'readObjectMetadata' | 'readBounded'> = {
      readObjectMetadata: vi.fn(async () => ({
        identity: largeSource,
        contentType: 'application/pdf' as const,
      })),
      readBounded: vi.fn(async ({ range }, options) => {
        if (range.offset === undefined || range.length === undefined) {
          throw new Error('unexpected-range-shape');
        }
        reads += 1;
        if (reads === 1) {
          return {
            bytes: new Uint8Array(range.length),
            totalByteSize: byteSize,
            offset: range.offset,
          };
        }
        return new Promise<never>((_resolve, reject) => {
          providerSignal = options.signal;
          options.signal?.addEventListener('abort', () => {
            markAborted();
            reject(new DOMException('aborted', 'AbortError'));
          }, { once: true });
          markStarted();
        });
      }),
    };
    const authorize = vi.fn(async () => ({
      ok: true as const,
      decision: { ...decision, sourceLocations: [largeSource] },
      source: largeSource,
    }));
    const downstream = new AbortController();
    const response = await createBookDocumentWorker({ authorize, provider: adapter })
      .fetch(request({ method: 'GET', signal: downstream.signal }), {});

    const reader = response.body!.getReader();
    expect((await reader.read()).value?.byteLength).toBe(1024 * 1024);
    const secondRead = reader.read();
    await started;
    downstream.abort();
    expect(providerSignal?.aborted).toBe(true);
    await aborted;
    await expect(secondRead).rejects.toThrow('document-stream-failed');
    expect(reads).toBe(2);
  });

  it('fails a mid-stream provider error with a stable redacted stream error', async () => {
    const byteSize = 2 * 1024 * 1024;
    const largeSource = { ...source, byteSize };
    let reads = 0;
    const adapter: Pick<SourceProviderPort, 'readObjectMetadata' | 'readBounded'> = {
      readObjectMetadata: vi.fn(async () => ({
        identity: largeSource,
        contentType: 'application/pdf' as const,
      })),
      readBounded: vi.fn(async ({ range }) => {
        reads += 1;
        if (reads > 1) throw new Error('private-b2-secret-provider-body');
        return {
          bytes: new Uint8Array(range.length ?? 0),
          totalByteSize: byteSize,
          offset: range.offset ?? 0,
        };
      }),
    };
    const authorize = vi.fn(async () => ({
      ok: true as const,
      decision: { ...decision, sourceLocations: [largeSource] },
      source: largeSource,
    }));
    const response = await createBookDocumentWorker({ authorize, provider: adapter })
      .fetch(request({ method: 'GET' }), {});
    const reader = response.body!.getReader();
    expect((await reader.read()).done).toBe(false);
    await expect(reader.read()).rejects.toThrow('document-stream-failed');
    expect(reads).toBe(2);
  });

  it('returns HEAD metadata without requesting object bytes', async () => {
    const adapter = provider();
    const worker = createBookDocumentWorker({ authorize: authorized, provider: adapter });
    const response = await worker.fetch(request({ method: 'HEAD' }), {});
    expect(response.status).toBe(200);
    expect(response.body).toBeNull();
    expect(response.headers.get('content-length')).toBe('32');
    expect(adapter.readBounded).not.toHaveBeenCalled();
  });

  it.each([
    ['bytes=4-9', 4, 9],
    ['bytes=8-', 8, 31],
    ['bytes=-5', 27, 31],
    ['bytes=28-99', 28, 31],
  ])('serves one RFC single range: %s', async (header, start, end) => {
    const adapter = provider();
    const worker = createBookDocumentWorker({ authorize: authorized, provider: adapter });
    const response = await worker.fetch(request({
      method: 'GET',
      headers: { range: header },
    }), {});
    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe(`bytes ${start}-${end}/32`);
    expect(response.headers.get('content-length')).toBe(String(end - start + 1));
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes.slice(start, end + 1));
  });

  it.each([
    'bytes=',
    'bytes=4-3',
    'bytes=99-',
    'bytes=0-1,3-4',
    `bytes=0-${'9'.repeat(4_097)}`,
    'items=0-1',
  ])('returns safe 416 without byte access for %s', async (header) => {
    const adapter = provider();
    const worker = createBookDocumentWorker({ authorize: authorized, provider: adapter });
    const response = await worker.fetch(request({
      method: 'GET',
      headers: { range: header },
    }), {});
    expect(response.status).toBe(416);
    expect(response.headers.get('content-range')).toBe('bytes */32');
    expect(await response.text()).toBe('');
    expect(adapter.readBounded).not.toHaveBeenCalled();
  });

  it('denies before any provider access and never accepts browser storage identity', async () => {
    const adapter = provider();
    const authorize = vi.fn(async () => ({
      ok: false as const,
      status: 403 as const,
      code: 'stale-binding' as const,
    }));
    const worker = createBookDocumentWorker({ authorize, provider: adapter });
    const response = await worker.fetch(request({
      method: 'GET',
      headers: {
        'x-provider-object-key': 'private/attacker.pdf',
        cookie: 'document-session=stale',
      },
    }), {});
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ code: 'stale-binding' });
    expect(adapter.readObjectMetadata).not.toHaveBeenCalled();
    expect(adapter.readBounded).not.toHaveBeenCalled();
  });

  it('rejects an authorization source that is absent from the fresh decision', async () => {
    const adapter = provider();
    const authorize = vi.fn(async () => ({
      ok: true as const,
      decision: { ...decision, sourceLocations: [] },
      source,
    }));
    const response = await createBookDocumentWorker({ authorize, provider: adapter })
      .fetch(request({ method: 'GET' }), {});

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ code: 'authorization-source-mismatch' });
    expect(adapter.readObjectMetadata).not.toHaveBeenCalled();
    expect(adapter.readBounded).not.toHaveBeenCalled();
  });

  it('fails safely on provider mismatch, timeout, and truncation', async () => {
    const mismatch = provider();
    mismatch.readObjectMetadata.mockResolvedValueOnce({
      identity: { ...identity, providerFileVersionId: 'latest' },
      contentType: 'application/pdf',
    });
    const mismatchResponse = await createBookDocumentWorker({
      authorize: authorized,
      provider: mismatch,
    }).fetch(request(), {});
    expect(mismatchResponse.status).toBe(502);
    expect(await mismatchResponse.text()).not.toContain(identity.providerObjectKey);

    const timeout = provider();
    timeout.readObjectMetadata.mockRejectedValueOnce({ code: 'timeout' });
    const timeoutResponse = await createBookDocumentWorker({
      authorize: authorized,
      provider: timeout,
    }).fetch(request(), {});
    expect(timeoutResponse.status).toBe(504);
    expect(await timeoutResponse.json()).toEqual({ code: 'document_provider_unavailable' });

    const truncated = provider();
    truncated.readBounded.mockResolvedValueOnce({
      bytes: bytes.slice(0, 4),
      totalByteSize: bytes.byteLength,
      offset: 0,
    });
    const truncatedResponse = await createBookDocumentWorker({
      authorize: authorized,
      provider: truncated,
    }).fetch(request(), {});
    expect(truncatedResponse.status).toBe(502);
    expect(await truncatedResponse.json()).toEqual({ code: 'provider-truncated' });
  });

  it('applies exact document CORS to actual and preflight requests', async () => {
    const adapter = provider();
    const worker = createBookDocumentWorker({ authorize: authorized, provider: adapter });
    const approved = await worker.fetch(request({
      headers: { origin: 'http://localhost:5174' },
    }), {});
    expect(approved.headers.get('access-control-allow-origin')).toBe('http://localhost:5174');
    expect(approved.headers.get('access-control-expose-headers')).toContain('Content-Range');

    const denied = await worker.fetch(request({
      headers: { origin: 'https://attacker.example' },
    }), {});
    expect(denied.status).toBe(403);
    expect(adapter.readObjectMetadata).toHaveBeenCalledTimes(1);

    const nullOrigin = await worker.fetch(request({
      headers: { origin: 'null' },
    }), {});
    expect(nullOrigin.status).toBe(403);

    const preflight = await worker.fetch(request({
      method: 'OPTIONS',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'Authorization, Range',
      },
    }), {});
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-methods')).toContain('HEAD');

    const badHeader = await worker.fetch(request({
      method: 'OPTIONS',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'Authorization, X-Secret',
      },
    }), {});
    expect(badHeader.status).toBe(403);

    const badMethod = await worker.fetch(request({
      method: 'OPTIONS',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'POST',
      },
    }), {});
    expect(badMethod.status).toBe(405);
  });

  it('authorizes before provider access for full, head, resumed, and closed-range requests', async () => {
    for (const [method, range] of [
      ['GET', undefined],
      ['HEAD', undefined],
      ['GET', 'bytes=8-'],
      ['GET', 'bytes=4-9'],
    ] as const) {
      const events: string[] = [];
      const authorize = vi.fn(async () => {
        events.push('authorize');
        return { ok: true as const, decision, source };
      });
      const adapter = provider();
      adapter.readObjectMetadata.mockImplementationOnce(async ({ identity: requested }) => {
        events.push('metadata');
        return { identity: requested, contentType: 'application/pdf' };
      });
      adapter.readBounded.mockImplementation(async ({ identity: requested, range: requestedRange }) => {
        events.push('bytes');
        return {
          bytes: bytes.slice(requestedRange.offset, requestedRange.offset + requestedRange.length),
          totalByteSize: bytes.byteLength,
          offset: requestedRange.offset,
          identity: requested,
        };
      });
      const response = await createBookDocumentWorker({ authorize, provider: adapter }).fetch(request({
        method,
        headers: range ? { range } : undefined,
      }), {});
      if (method === 'GET') await response.arrayBuffer();
      expect(events[0]).toBe('authorize');
      expect(events[1]).toBe('metadata');
      expect(authorize).toHaveBeenCalledTimes(1);
    }
  });

  it('returns redacted stable failures without logging storage authority or tokens', async () => {
    const spies = [
      vi.spyOn(console, 'error').mockImplementation(() => undefined),
      vi.spyOn(console, 'warn').mockImplementation(() => undefined),
      vi.spyOn(console, 'log').mockImplementation(() => undefined),
      vi.spyOn(console, 'info').mockImplementation(() => undefined),
    ];
    const adapter = provider();
    adapter.readObjectMetadata.mockRejectedValueOnce(new Error([
      identity.privateBucketId,
      identity.providerObjectKey,
      identity.providerFileVersionId,
      'firebase-token',
      'b2-application-key',
    ].join(':')));
    const response = await createBookDocumentWorker({ authorize: authorized, provider: adapter })
      .fetch(request({ headers: { authorization: 'Bearer firebase-token' } }), {});
    const body = await response.text();

    expect(response.status).toBe(502);
    expect(body).toBe('{"code":"document_provider_unavailable"}');
    for (const value of [
      identity.privateBucketId,
      identity.providerObjectKey,
      identity.providerFileVersionId,
      'firebase-token',
      'b2-application-key',
    ]) {
      expect(body).not.toContain(value);
    }
    expect(spies.every((spy) => spy.mock.calls.length === 0)).toBe(true);
    spies.forEach((spy) => spy.mockRestore());
  });

  it('contains no whole-document buffering or legacy R2 Book-source path', () => {
    const implementation = readFileSync(
      new URL('../src/upload-worker/book-delivery/document-worker.ts', import.meta.url),
      'utf8',
    );
    expect(implementation).not.toMatch(/\barrayBuffer\s*\(|\bBlob\b|\.concat\s*\(/u);
    expect(implementation).not.toMatch(/BOOK_SOURCE_R2|R2Bucket|kahoot-media/iu);
  });
});
