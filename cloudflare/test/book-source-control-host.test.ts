import { describe, expect, it, vi } from 'vitest';
import { createBookSourceControlHost } from '../src/book-source-worker/control-host';
import { enforceBookPilotScopeIfConfigured } from '../src/book-pilot-scope';

const env = {
  FIREBASE_PROJECT_ID: 'project',
  BOOK_SOURCE_CONTROL_ALLOWED_ORIGIN: 'http://localhost:5173',
};
const pilotIssuedAt = new Date(Date.now() - 60 * 60_000).toISOString();
const pilotExpiresAt = new Date(Date.now() + 60 * 60_000).toISOString();
const pilotEnv = {
  BOOK_PILOT_SCOPE_ENFORCEMENT: 'enabled',
  BOOK_PILOT_SCOPE_ENVIRONMENT: 'test',
  BOOK_PILOT_SCOPE_CONFIG_JSON: JSON.stringify({
    schemaVersion: 'v1',
    environment: 'test',
    revision: 'source-control-test-1',
    issuedAt: pilotIssuedAt,
    expiresAt: pilotExpiresAt,
    teacherId: 'teacher-1',
    bookId: 'book-1',
    assignmentId: 'assignment-1',
    studentIds: ['student-1'],
    maxStudents: 30,
  }),
  BOOK_PILOT_SCOPE_AUDIT: vi.fn(),
};
const pilotScope = ({ actorId, bookId, operation, request }: {
  readonly actorId: string;
  readonly bookId: string;
  readonly operation: 'upload' | 'mutation';
  readonly request: Request;
}) => enforceBookPilotScopeIfConfigured({
  env: pilotEnv,
  uid: actorId,
  request,
  operation,
  actorKind: 'teacher',
  bookId,
  requireBook: true,
});
const verifier = {
  verifyAuthorizationHeader: vi.fn(async () => ({ valid: true, uid: 'teacher-1' })),
};
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

const post = (path: string, body: unknown, extraHeaders: Record<string, string> = {}): Request =>
  new Request(`https://control.example${path}`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer token',
      'content-type': 'application/json',
      origin: 'http://localhost:5173',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });

describe('book source control host', () => {
  it('authenticates and passes exact metadata-only begin input', async () => {
    const operationId = '11111111-1111-4111-8111-111111111111';
    const service = {
      begin: vi.fn(async () => ({
        status: 'reserved' as const,
        reservationId: 'r1',
        sourceVersionId: 'v1',
        uploadUrl: 'https://upload.example/exact',
        expiresAt: '2099-07-26T01:00:00.000Z',
        requiredHeaders: {
          'content-type': 'application/pdf',
          'x-amz-content-sha256': inspection.sha256Hex,
          'x-amz-meta-book-source-byte-size': String(inspection.exactByteSize),
          'x-amz-meta-book-source-sha256': inspection.sha256Hex,
        },
      })),
      complete: vi.fn(),
    };
    const host = createBookSourceControlHost({ service, verifier, pilotScope });
    const response = await host.fetch(post(
      '/v1/book-source/books/book-1/upload/begin',
      { operationId, sourceKey: 'source-1', kind: 'initial', inspection },
      { 'idempotency-key': operationId },
    ), env);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(service.begin).toHaveBeenCalledWith({
      actorId: 'teacher-1',
      bookId: 'book-1',
      idempotencyKey: operationId,
      sourceKey: 'source-1',
      kind: 'initial',
      claim: inspection,
    });
  });

  it('keeps completion available independently and binds route identity', async () => {
    const service = {
      begin: vi.fn(),
      complete: vi.fn(async () => ({
        status: 'verified_completed' as const,
        reservationId: 'reservation-1',
        sourceVersionId: 'source-version-1',
      })),
    };
    const host = createBookSourceControlHost({ service, verifier, pilotScope });
    const response = await host.fetch(post(
      '/v1/book-source/books/book-1/upload/reservation-1/complete',
      { providerFileId: 'file-1', providerFileVersionId: 'version-1' },
    ), env);

    expect(response.status).toBe(200);
    expect(service.begin).not.toHaveBeenCalled();
    expect(service.complete).toHaveBeenCalledWith({
      actorId: 'teacher-1',
      bookId: 'book-1',
      reservationId: 'reservation-1',
      providerFileId: 'file-1',
      providerFileVersionId: 'version-1',
    });
  });

  it('serves only the owner-scoped trusted source projection for resume', async () => {
    const sources = [{
      sourceKey: 'full',
      sourceVersionId: 'source-version-1',
      bookId: 'book-1',
      physicalPageCount: 14,
      verifiedUsable: true,
    }];
    const service = {
      begin: vi.fn(),
      complete: vi.fn(),
      sources: vi.fn(async () => ({ sources })),
    };
    const host = createBookSourceControlHost({ service, verifier, pilotScope });
    const response = await host.fetch(new Request(
      'https://control.example/v1/book-source/books/book-1/sources',
      { headers: { authorization: 'Bearer token', origin: 'http://localhost:5173' } },
    ), env);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sources });
    expect(service.sources).toHaveBeenCalledWith({ actorId: 'teacher-1', bookId: 'book-1' });
  });

  it('rejects unauthenticated, oversized, non-json, extra-key, and idempotency mismatches', async () => {
    const service = { begin: vi.fn(), complete: vi.fn() };
    const deniedHost = createBookSourceControlHost({
      service,
      verifier: { verifyAuthorizationHeader: async () => ({ valid: false }) },
    });
    expect((await deniedHost.fetch(post('/v1/book-source/books/book-1/upload/begin', {}), env)).status)
      .toBe(401);

    const host = createBookSourceControlHost({ service, verifier, pilotScope });
    const oversized = post(
      '/v1/book-source/books/book-1/upload/begin',
      { padding: 'x'.repeat(17 * 1024) },
    );
    expect((await host.fetch(oversized, env)).status).toBe(413);

    const nonJson = new Request('https://control.example/v1/book-source/books/book-1/upload/begin', {
      method: 'POST',
      headers: { authorization: 'Bearer token', 'content-type': 'application/pdf' },
      body: '%PDF',
    });
    expect((await host.fetch(nonJson, env)).status).toBe(415);

    const operationId = '11111111-1111-4111-8111-111111111111';
    const extra = post(
      '/v1/book-source/books/book-1/upload/begin',
      { operationId, sourceKey: 'source-1', kind: 'initial', inspection, bytes: '%PDF' },
      { 'idempotency-key': operationId },
    );
    expect((await host.fetch(extra, env)).status).toBe(400);

    const mismatch = post(
      '/v1/book-source/books/book-1/upload/begin',
      { operationId, sourceKey: 'source-1', kind: 'initial', inspection },
      { 'idempotency-key': '22222222-2222-4222-8222-222222222222' },
    );
    expect((await host.fetch(mismatch, env)).status).toBe(409);
    expect(service.begin).not.toHaveBeenCalled();
  });

  it('does not reflect unapproved origins or leak unknown errors', async () => {
    const host = createBookSourceControlHost({
      verifier,
      pilotScope,
      service: {
        begin: vi.fn(async () => {
          throw { code: 'internal_database_secret', status: 418 };
        }),
        complete: vi.fn(),
      },
    });
    const operationId = '11111111-1111-4111-8111-111111111111';
    const request = post(
      '/v1/book-source/books/book-1/upload/begin',
      { operationId, sourceKey: 'source-1', kind: 'initial', inspection },
      { 'idempotency-key': operationId, origin: 'https://evil.example' },
    );
    const response = await host.fetch(request, env);
    expect(response.status).toBe(503);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(await response.json()).toEqual({ code: 'book_source_upload_unavailable' });
  });

  it('preserves only known bounded service Error codes', async () => {
    const host = createBookSourceControlHost({
      verifier,
      pilotScope,
      service: {
        begin: vi.fn(),
        complete: vi.fn(),
        status: vi.fn(async () => {
          throw new Error('account_state_unavailable');
        }),
      },
    });
    const request = new Request(
      'https://control.example/v1/book-source/books/book-1/upload/reservation-1/status',
      { headers: { authorization: 'Bearer token', origin: 'http://localhost:5173' } },
    );
    const response = await host.fetch(request, env);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: 'account_state_unavailable' });
  });

  it('keeps owner-scoped status, cancel, retry, and manual reconcile behind the trusted service', async () => {
    const status = {
      reservationId: 'reservation-1',
      bookId: 'book-1',
      sourceVersionId: 'source-version-1',
      status: 'cleanup_pending' as const,
      retryKind: 'cleanup' as const,
    };
    const service = {
      begin: vi.fn(),
      complete: vi.fn(),
      status: vi.fn(async () => status),
      requestCleanup: vi.fn(async () => status),
      reconcile: vi.fn(async () => ({ ...status, status: 'released' as const, retryKind: 'none' as const })),
    };
    const host = createBookSourceControlHost({ service, verifier, pilotScope });
    const get = new Request(
      'https://control.example/v1/book-source/books/book-1/upload/reservation-1/status',
      { headers: { authorization: 'Bearer token', origin: 'http://localhost:5173' } },
    );
    expect(await (await host.fetch(get, env)).json()).toEqual(status);

    const cancel = await host.fetch(post(
      '/v1/book-source/books/book-1/upload/reservation-1/cancel',
      { providerFileId: 'file-1', providerFileVersionId: 'version-1' },
    ), env);
    expect(cancel.status).toBe(200);
    expect(service.requestCleanup).toHaveBeenCalledWith({
      actorId: 'teacher-1',
      bookId: 'book-1',
      reservationId: 'reservation-1',
      reason: 'cancel_requested',
      providerFileId: 'file-1',
      providerFileVersionId: 'version-1',
    });

    for (const action of ['retry', 'reconcile'] as const) {
      expect((await host.fetch(post(
        `/v1/book-source/books/book-1/upload/reservation-1/${action}`,
        {},
      ), env)).status).toBe(200);
    }
    expect(service.reconcile).toHaveBeenCalledTimes(2);

    expect((await host.fetch(post(
      '/v1/book-source/books/book-1/upload/reservation-1/cancel',
      { providerFileId: 'file-1' },
    ), env)).status).toBe(400);
  });
});
