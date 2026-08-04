import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createBookRouter,
  type CanonicalBookRouteDescriptor,
  type FirebaseVerifier,
} from '../src/upload-worker/book-router.ts';

const ORIGIN = 'http://localhost:5173';
const identity = JSON.stringify({
  client_email: 'book-service@example.test',
  private_key: 'private-key',
});

const descriptor = (overrides: Partial<CanonicalBookRouteDescriptor> = {}): CanonicalBookRouteDescriptor => ({
  id: 'book.delivery.test',
  methods: ['POST'],
  pathTemplate: '/book-delivery/test/:bookId',
  owner: '#test',
  domain: 'delivery',
  handler: 'bookDelivery.create',
  firebaseAuth: 'firebase-id-token',
  rateClass: 'book-control',
  gateEnv: 'BOOK_TEST_GATE',
  gateDefault: 'disabled',
  requestBodyBytes: 4,
  responseLimitBytes: 256 * 1024,
  identityEnv: 'BOOK_TEST_IDENTITY',
  credentialEnv: 'BOOK_TEST_KEY',
  source: 'contributor',
  contributorTicket: '#31',
  ...overrides,
});

const env = (overrides: Record<string, unknown> = {}) => ({
  BOOK_TEST_GATE: 'enabled',
  BOOK_TEST_IDENTITY: 'book-service@example.test',
  BOOK_TEST_KEY: identity,
  BOOK_ROUTE_RATE_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
  ...overrides,
});

const verifier: FirebaseVerifier = { verifyAuthorizationHeader: vi.fn(async () => ({ valid: true, uid: 'teacher-1' })) };
const request = (path = '/book-delivery/test/book-1', init: RequestInit = {}) => new Request(
  `https://worker.test${path}`,
  {
    ...init,
    method: init.method ?? 'POST',
    headers: {
      Origin: ORIGIN,
      Authorization: 'Bearer firebase-token',
      'Content-Length': '0',
      ...init.headers,
    },
  },
);

const handler = vi.fn(async ({ params }: { params: Record<string, string> }) => ({
  body: { ok: true, bookId: params.bookId },
}));

const makeRouter = (
  route = descriptor(),
  handlers: Record<string, (...args: any[]) => unknown> = { 'bookDelivery.create': handler },
  verifierOverride: FirebaseVerifier = verifier,
) => createBookRouter({
  manifest: [route],
  handlers,
  firebaseVerifier: verifierOverride,
});

describe('canonical Book router core', () => {
  beforeEach(() => {
    handler.mockClear();
  });

  it('authenticates before rate, gate, identity, and handler', async () => {
    const limited = vi.fn(async () => ({ success: true }));
    const invalidVerifier: FirebaseVerifier = { verifyAuthorizationHeader: vi.fn(async () => ({ valid: false })) };
    const response = await makeRouter(descriptor(), { 'bookDelivery.create': handler }, invalidVerifier)(
      request(),
      env({ BOOK_ROUTE_RATE_LIMITER: { limit: limited }, BOOK_TEST_GATE: 'disabled' }),
    );
    expect(response?.status).toBe(401);
    expect(limited).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it('dispatches exact template with decoded safe params and route-class rate key', async () => {
    const limiter = vi.fn(async (_input: { key: string }) => ({ success: true }));
    const response = await makeRouter()(request('/book-delivery/test/book%2D1'), env({ BOOK_ROUTE_RATE_LIMITER: { limit: limiter } }));
    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({ ok: true, bookId: 'book-1' });
    expect(limiter.mock.calls.at(0)?.[0].key).toContain('book-control');
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ uid: 'teacher-1', params: { bookId: 'book-1' } }));
  });

  it('returns null for non-Book paths', async () => {
    const response = await makeRouter()(request('/listening-delivery/content'), env());
    expect(response).toBeNull();
  });

  it('rejects query, trailing, repeated, and crafted paths', async () => {
    for (const path of [
      '/book-delivery/test/book-1?x=1',
      '/book-delivery/test/book-1/',
      '/book-delivery/test//book-1',
      '/book-delivery/test/book%2F1',
      '/book-delivery/test/book%00',
    ]) {
      const response = await makeRouter()(request(path), env());
      expect(response?.status).toBe(404);
    }
    expect(handler).not.toHaveBeenCalled();
  });

  it('requires enabled gate', async () => {
    const response = await makeRouter()(request(), env({ BOOK_TEST_GATE: 'true' }));
    expect(response?.status).toBe(503);
    expect(await response?.json()).toEqual({ code: 'book_route_disabled' });
  });

  it('returns unavailable when handler missing', async () => {
    const response = await makeRouter(descriptor(), {})(request(), env());
    expect(response?.status).toBe(501);
  });

  it('enforces declared content-length before handler', async () => {
    const response = await makeRouter()(request('/book-delivery/test/book-1', { headers: { 'Content-Length': '5' } }), env());
    expect(response?.status).toBe(413);
    expect(handler).not.toHaveBeenCalled();
  });

  it('selects the matching method when multiple descriptors share one path', async () => {
    const replace = descriptor({
      id: 'book.assembly.replace',
      methods: ['PUT'],
      pathTemplate: '/book-assembly/books/:bookId/candidates/:candidateId',
      handler: 'bookAssembly.replace',
    });
    const discard = descriptor({
      id: 'book.assembly.discard',
      methods: ['DELETE'],
      pathTemplate: '/book-assembly/books/:bookId/candidates/:candidateId',
      handler: 'bookAssembly.discard',
    });
    const replaceHandler = vi.fn(async () => ({ body: { route: 'replace' } }));
    const discardHandler = vi.fn(async () => ({ body: { route: 'discard' } }));
    const router = createBookRouter({
      manifest: [replace, discard],
      handlers: {
        'bookAssembly.replace': replaceHandler,
        'bookAssembly.discard': discardHandler,
      },
      firebaseVerifier: verifier,
    });

    const response = await router(request(
      '/book-assembly/books/book-1/candidates/candidate-1',
      { method: 'DELETE' },
    ), env());

    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({ route: 'discard' });
    expect(discardHandler).toHaveBeenCalledOnce();
    expect(replaceHandler).not.toHaveBeenCalled();
  });

  it('dispatches declared document GET and HEAD methods while rejecting undeclared mutation methods', async () => {
    const documentRoute = descriptor({
      id: 'book.document-delivery.serve-authorized-document',
      methods: ['GET', 'HEAD'],
      pathTemplate: '/v1/book-delivery/document/:opaqueRouteKey',
      domain: 'document-delivery',
      handler: 'serveAuthorizedDocument',
      firebaseAuth: 'firebase-id-token-before-lookup',
      rateClass: 'book-document',
      requestBodyBytes: 0,
      responseLimitBytes: 500 * 1024 * 1024,
    });
    const documentHandler = vi.fn(async ({ request: handledRequest }) => new Response(null, {
      status: handledRequest.method === 'HEAD' ? 204 : 200,
      headers: { 'content-length': '0' },
    }));
    const router = makeRouter(documentRoute, { serveAuthorizedDocument: documentHandler });

    const getResponse = await router(request('/v1/book-delivery/document/route-key', { method: 'GET' }), env());
    const headResponse = await router(request('/v1/book-delivery/document/route-key', { method: 'HEAD' }), env());
    const postResponse = await router(request('/v1/book-delivery/document/route-key', { method: 'POST' }), env());

    expect(getResponse?.status).toBe(200);
    expect(headResponse?.status).toBe(204);
    expect(postResponse?.status).toBe(405);
    expect(documentHandler).toHaveBeenCalledTimes(2);
  });

  it('resolves default document descriptors to fail-closed route handlers instead of missing-handler 501', async () => {
    const documentRoute = descriptor({
      id: 'book.document-delivery.serve-authorized-document',
      methods: ['GET', 'HEAD'],
      pathTemplate: '/v1/book-delivery/document/:opaqueRouteKey',
      domain: 'document-delivery',
      handler: 'serveAuthorizedDocument',
      firebaseAuth: 'firebase-id-token-before-lookup',
      rateClass: 'book-document',
      requestBodyBytes: 0,
      responseLimitBytes: 500 * 1024 * 1024,
    });

    const response = await createBookRouter({
      manifest: [documentRoute],
      firebaseVerifier: verifier,
    })(request('/v1/book-delivery/document/route-key', { method: 'GET' }), env());

    expect(response?.status).toBe(503);
    expect(await response?.json()).toEqual({ code: 'document_configuration_unavailable' });
  });

  it('bounds unclaimed request bodies and serialized handler responses', async () => {
    const bodyRequest = new Request('https://worker.test/book-delivery/test/book-1', {
      method: 'POST',
      headers: {
        Origin: ORIGIN,
        Authorization: 'Bearer firebase-token',
      },
      body: '12345',
    });
    const oversizedBody = await makeRouter()(bodyRequest, env());
    expect(oversizedBody?.status).toBe(413);

    const oversizedResponse = await makeRouter(
      descriptor({ responseLimitBytes: 4 }),
      { 'bookDelivery.create': async () => ({ body: { value: '12345' } }) },
    )(request(), env());
    expect(oversizedResponse?.status).toBe(502);
    expect(await oversizedResponse?.json()).toEqual({ code: 'book_response_too_large' });
  });

  it('bounds streamed handler responses even when no content-length is declared', async () => {
    const streamedResponse = await makeRouter(
      descriptor({ responseLimitBytes: 4 }),
      {
        'bookDelivery.create': async () => new Response(new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array([1, 2, 3]));
            controller.enqueue(new Uint8Array([4, 5]));
            controller.close();
          },
        })),
      },
    )(request(), env());

    expect(streamedResponse?.status).toBe(200);
    const reader = streamedResponse?.body?.getReader();
    expect(reader).toBeDefined();
    await expect(reader!.read()).resolves.toMatchObject({ done: false });
    await expect(reader!.read()).rejects.toThrow('book_response_too_large');
  });

  it('returns exact CORS preflight and rejects wrong origin/method/header', async () => {
    const good = await makeRouter()(new Request('https://worker.test/book-delivery/test/book-1', {
      method: 'OPTIONS',
      headers: {
        Origin: ORIGIN,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Authorization, Content-Type',
      },
    }), env());
    expect(good?.status).toBe(204);
    expect(good?.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(good?.headers.get('Cache-Control')).toBe('no-store');

    const wrongOrigin = await makeRouter()(request('/book-delivery/test/book-1', { headers: { Origin: 'https://evil.test' } }), env());
    expect(wrongOrigin?.status).toBe(403);
    const wrongMethod = await makeRouter()(new Request('https://worker.test/book-delivery/test/book-1', {
      method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'GET' },
    }), env());
    expect(wrongMethod?.status).toBe(405);
    const wrongHeader = await makeRouter()(new Request('https://worker.test/book-delivery/test/book-1', {
      method: 'OPTIONS', headers: {
        Origin: ORIGIN, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'X-Evil',
      },
    }), env());
    expect(wrongHeader?.status).toBe(403);
  });

  it('fails closed on missing or swapped dedicated identity, never generic key fallback', async () => {
    const missing = await makeRouter()(request(), env({ BOOK_TEST_KEY: undefined, GOOGLE_SA_KEY: identity }));
    expect(missing?.status).toBe(503);
    const swapped = await makeRouter()(request(), env({ BOOK_TEST_KEY: JSON.stringify({ client_email: 'other@example.test', private_key: 'key' }) }));
    expect(swapped?.status).toBe(503);
    expect(handler).not.toHaveBeenCalled();
  });

  it('hides handler exceptions behind generic response with CORS/no-store', async () => {
    const failing = vi.fn(async () => { throw new Error('secret detail'); });
    const response = await makeRouter(descriptor(), { 'bookDelivery.create': failing })(request(), env());
    expect(response?.status).toBe(500);
    expect(await response?.json()).toEqual({ code: 'book_route_failed' });
    expect(response?.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(response?.headers.get('Cache-Control')).toBe('no-store');
  });
});
