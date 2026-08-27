import { describe, expect, it, vi } from 'vitest';
import { createBookSourceUploadWorkerHandlers } from '../src/upload-worker/book-source/worker.ts';
import { createBookRouter } from '../src/upload-worker/book-router.ts';
import { canonicalBookRouteManifest } from '../src/upload-worker/book-routes/manifest.ts';

const operationId = '11111111-1111-4111-8111-111111111111';
const beginDescriptor = canonicalBookRouteManifest.find((route) => route.id === 'book.source-upload.begin');
if (!beginDescriptor) throw new Error('missing_book_source_begin_descriptor');
const pilotIssuedAt = new Date(Date.now() - 60 * 60_000).toISOString();
const pilotExpiresAt = new Date(Date.now() + 60 * 60_000).toISOString();
const inspection = {
  schemaVersion: 1,
  trust: 'browser-supplied-untrusted',
  state: 'complete',
  displayFilename: 'book.pdf',
  exactByteSize: 42,
  sha256Hex: 'a'.repeat(64),
  physicalPageCount: 2,
  pdfType: 'application/pdf',
  readability: 'readable',
};

const env = {
  BOOK_SOURCE_UPLOAD_ROUTES_ENABLED: 'enabled',
  BOOK_PILOT_SCOPE_ENFORCEMENT: 'enabled',
  BOOK_PILOT_SCOPE_ENVIRONMENT: 'test',
  BOOK_PILOT_SCOPE_CONFIG_JSON: JSON.stringify({
    schemaVersion: 'v1',
    environment: 'test',
    revision: 'source-upload-test-1',
    issuedAt: pilotIssuedAt,
    expiresAt: pilotExpiresAt,
    teacherId: 'teacher-1',
    bookId: 'book-1',
    assignmentId: 'assignment-1',
    studentIds: ['student-1'],
    maxStudents: 30,
  }),
  BOOK_SOURCE_UPLOAD_SERVICE_IDENTITY: 'book-source@test.iam.gserviceaccount.com',
  BOOK_SOURCE_UPLOAD_GOOGLE_SA_KEY: '{"client_email":"book-source@test.iam.gserviceaccount.com","private_key":"private"}',
  BOOK_SOURCE_CONTROL_ALLOWED_ORIGIN: 'http://localhost:5173',
  FIREBASE_PROJECT_ID: 'project',
} as const;

describe('canonical #49 source upload composition', () => {
  it('delegates begin through the canonical route while preserving the trusted actor', async () => {
    const begin = vi.fn(async () => ({
      status: 'reserved' as const,
      uploadUrl: 'https://s3.us-west-004.backblazeb2.com/exact',
      expiresAt: '2099-07-30T01:00:00.000Z',
      requiredHeaders: {
        'content-type': 'application/pdf',
        'x-amz-content-sha256': 'a'.repeat(64),
        'x-amz-meta-book-source-byte-size': '42',
        'x-amz-meta-book-source-sha256': 'a'.repeat(64),
      },
      reservationId: 'reservation-1',
      sourceVersionId: 'source-version-1',
    }));
    const handlers = createBookSourceUploadWorkerHandlers({
      runtimeFactory: () => ({
        service: {
          begin,
          complete: vi.fn(),
        },
      }),
    });
    const response = await handlers.begin({
      request: new Request(
        `https://book.example/v1/book-source/books/book-1/upload/begin`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': operationId,
            origin: 'http://localhost:5173',
          },
          body: JSON.stringify({
            operationId,
            sourceKey: 'source-1',
            kind: 'initial',
            inspection,
          }),
        },
      ),
      env,
      uid: 'teacher-1',
      params: { bookId: 'book-1' },
      descriptor: beginDescriptor,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'reserved',
      reservationId: 'reservation-1',
      sourceVersionId: 'source-version-1',
    });
    expect(begin).toHaveBeenCalledWith({
      actorId: 'teacher-1',
      bookId: 'book-1',
      idempotencyKey: operationId,
      sourceKey: 'source-1',
      kind: 'initial',
      claim: inspection,
    });
  });

  it('keeps the canonical route disabled by default', async () => {
    const router = createBookRouter({
      firebaseVerifier: { verifyAuthorizationHeader: async () => ({ valid: true, uid: 'teacher-1' }) },
      routeHandlers: {
        sourceUploadHandlers: {
          begin: vi.fn(),
        },
      },
    });
    const response = await router.fetch(
      new Request('https://book.example/v1/book-source/books/book-1/upload/begin', {
        method: 'POST',
        headers: { origin: 'http://localhost:5173' },
      }),
      {
        BOOK_SOURCE_UPLOAD_ROUTES_ENABLED: 'disabled',
        BOOK_ROUTE_RATE_LIMITER: { limit: async () => ({ success: true }) },
      },
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: 'book_route_disabled' });
  });

  it('fails closed when the allowed-origin binding is missing', async () => {
    const runtimeFactory = vi.fn();
    const handlers = createBookSourceUploadWorkerHandlers({ runtimeFactory });
    for (const allowedOrigin of [undefined, '', '   ']) {
      const response = await handlers.begin({
        request: new Request('https://book.example/v1/book-source/books/book-1/upload/begin', {
          method: 'POST',
          headers: { origin: 'http://localhost:5173' },
        }),
        env: { ...env, BOOK_SOURCE_CONTROL_ALLOWED_ORIGIN: allowedOrigin },
        uid: 'teacher-1',
        params: { bookId: 'book-1' },
        descriptor: beginDescriptor,
      });

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ code: 'invalid_deployment' });
    }
    expect(runtimeFactory).not.toHaveBeenCalled();
  });

  it('fails source-upload preflight closed when the allowed-origin binding is missing', async () => {
    const router = createBookRouter({
      firebaseVerifier: { verifyAuthorizationHeader: async () => ({ valid: true, uid: 'teacher-1' }) },
      routeHandlers: { sourceUploadHandlers: { begin: vi.fn() } },
    });
    const response = await router.fetch(
      new Request('https://book.example/v1/book-source/books/book-1/upload/begin', {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:5173',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Authorization, Content-Type',
        },
      }),
      { ...env, BOOK_SOURCE_CONTROL_ALLOWED_ORIGIN: undefined },
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ code: 'invalid_deployment' });
  });

  it('denies source-upload preflight when the request origin differs from the exact binding', async () => {
    const router = createBookRouter({
      firebaseVerifier: { verifyAuthorizationHeader: async () => ({ valid: true, uid: 'teacher-1' }) },
      routeHandlers: { sourceUploadHandlers: { begin: vi.fn() } },
    });
    const response = await router.fetch(
      new Request('https://book.example/v1/book-source/books/book-1/upload/begin', {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:5174',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Authorization, Content-Type',
        },
      }),
      env,
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ code: 'cors_origin_denied' });
  });
});
