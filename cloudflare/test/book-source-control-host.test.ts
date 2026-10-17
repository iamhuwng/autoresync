import { describe, expect, it, vi } from 'vitest';
import { createBookSourceControlHost, dispatchBookSourceControlRequest } from '../src/book-source-worker/control-host';

const env = {
  FIREBASE_PROJECT_ID: 'project',
  BOOK_SOURCE_CONTROL_ALLOWED_ORIGIN: 'http://localhost:5173',
};
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
    const host = createBookSourceControlHost({ service, verifier });
    const response = await host.fetch(post(
      '/v1/book-source/books/book-1/upload/begin',
       { operationId, sourceKey: 'source-1', kind: 'initial', purpose: 'book-source', inspection },
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
       purpose: 'book-source',
       claim: inspection,
    });
  });

  it('keeps completion available independently and binds route identity', async () => {
    const operationId = '11111111-1111-4111-8111-111111111111';
    const service = {
      begin: vi.fn(),
      complete: vi.fn(async () => ({
         status: 'verified_completed' as const,
         reservationId: 'reservation-1',
         sourceVersionId: 'source-version-1',
         checksum: { algorithm: 'sha-256' as const, value: inspection.sha256Hex },
      })),
    };
    const dispatched = await dispatchBookSourceControlRequest({ request: post(
      '/v1/book-source/books/book-1/upload/reservation-1/complete',
      { operationId }, { 'idempotency-key': operationId },
    ), uid: 'teacher-1', route: { action: 'complete', bookId: 'book-1', reservationId: 'reservation-1' },
      service, executionContext: { waitUntil: vi.fn() } as unknown as ExecutionContext });
    const response = new Response(JSON.stringify(dispatched.body), dispatched.init);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'verified_completed',
      reservationId: 'reservation-1',
      sourceVersionId: 'source-version-1',
      checksum: { algorithm: 'sha-256', value: inspection.sha256Hex },
    });
    expect(service.begin).not.toHaveBeenCalled();
    expect(service.complete).toHaveBeenCalledWith({
      actorId: 'teacher-1',
      bookId: 'book-1',
      reservationId: 'reservation-1',
      operationId,
    }, expect.objectContaining({ deferCleanup: expect.any(Function) }));
  });

  it('serves only the owner-scoped trusted source projection for resume', async () => {
    const sources = [{
      sourceKey: 'full',
       sourceVersionId: 'source-version-1',
       bookId: 'book-1',
       checksum: { algorithm: 'sha-256' as const, value: inspection.sha256Hex },
       physicalPageCount: 14,
       verifiedUsable: true,
       purpose: 'book-source' as const,
       studentSafeStatus: 'unreviewed' as const,
    }];
    const service = {
      begin: vi.fn(),
      complete: vi.fn(),
      sources: vi.fn(async () => ({ sources })),
    };
    const host = createBookSourceControlHost({ service, verifier });
    const response = await host.fetch(new Request(
      'https://control.example/v1/book-source/books/book-1/sources',
      { headers: { authorization: 'Bearer token', origin: 'http://localhost:5173' } },
    ), env);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sources });
    expect(service.sources).toHaveBeenCalledWith({ actorId: 'teacher-1', bookId: 'book-1' });
  });

  it.each([
    ['missing operation id', { studentSafeStatus: 'ready', reasonCode: 'teacher-reviewed' }, {}, 400],
    ['invalid operation id', { operationId: 'not-a-uuid', studentSafeStatus: 'ready', reasonCode: 'teacher-reviewed' }, { 'idempotency-key': 'not-a-uuid' }, 400],
    ['mismatched idempotency key', { operationId: '11111111-1111-4111-8111-111111111111', studentSafeStatus: 'ready', reasonCode: 'teacher-reviewed' }, { 'idempotency-key': '22222222-2222-4222-8222-222222222222' }, 409],
  ])('rejects %s safety decision request', async (_label, body, headers, status) => {
    const service = { begin: vi.fn(), complete: vi.fn(), decideStudentSafeSource: vi.fn() };
    const host = createBookSourceControlHost({ service, verifier });
    const response = await host.fetch(post(
      '/v1/book-source/books/book-1/upload/reservation-1/student-safe/decide',
      body,
      headers,
    ), env);

    expect(response.status).toBe(status);
    expect(service.decideStudentSafeSource).not.toHaveBeenCalled();
  });

  it.each(['book-source', 'student-document'] as const)('passes the validated %s decision operation identity and returns the persisted decision projection', async (purpose) => {
    const operationId = '11111111-1111-4111-8111-111111111111';
    const service = {
      begin: vi.fn(),
      complete: vi.fn(),
      decideStudentSafeSource: vi.fn(async () => ({
        status: 'verified_completed' as const,
        reservationId: 'reservation-1',
        sourceVersionId: 'source-version-1',
        checksum: { algorithm: 'sha-256' as const, value: inspection.sha256Hex },
        purpose,
        studentSafeStatus: 'ready' as const,
        studentSafeDecision: {
          decidedBy: 'teacher-1',
          decidedAt: '2026-08-11T00:02:00.000Z',
          sourceVersionId: 'source-version-1',
          sha256Hex: inspection.sha256Hex,
          reasonCode: 'teacher-reviewed' as const,
        },
      })),
    };
    const host = createBookSourceControlHost({ service, verifier });
    const response = await host.fetch(post(
      '/v1/book-source/books/book-1/upload/reservation-1/student-safe/decide',
      { operationId, studentSafeStatus: 'ready', reasonCode: 'teacher-reviewed' },
      { 'idempotency-key': operationId },
    ), env);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ purpose, studentSafeStatus: 'ready',
      studentSafeDecision: { decidedBy: 'teacher-1', sourceVersionId: 'source-version-1', sha256Hex: inspection.sha256Hex } });
    expect(service.decideStudentSafeSource).toHaveBeenCalledWith({
      actorId: 'teacher-1',
      bookId: 'book-1',
      reservationId: 'reservation-1',
      operationId,
      studentSafeStatus: 'ready',
      reasonCode: 'teacher-reviewed',
    });
  });

  it.each(['unknown-purpose', undefined])('denies malformed returned safety purpose %s', async (purpose) => {
    const operationId = '11111111-1111-4111-8111-111111111111';
    const service = { begin: vi.fn(), complete: vi.fn(), decideStudentSafeSource: vi.fn(async () => ({
      status: 'verified_completed', reservationId: 'reservation-1', sourceVersionId: 'source-version-1',
      checksum: { algorithm: 'sha-256', value: inspection.sha256Hex }, purpose, studentSafeStatus: 'ready',
      studentSafeDecision: { decidedBy: 'teacher-1', decidedAt: '2026-08-11T00:02:00.000Z',
        sourceVersionId: 'source-version-1', sha256Hex: inspection.sha256Hex, reasonCode: 'teacher-reviewed' },
    })) };
    const response = await createBookSourceControlHost({ service: service as never, verifier }).fetch(post(
      '/v1/book-source/books/book-1/upload/reservation-1/student-safe/decide',
      { operationId, studentSafeStatus: 'ready', reasonCode: 'teacher-reviewed' }, { 'idempotency-key': operationId },
    ), env);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ code: 'student_safe_decision_conflict' });
  });

  it.each([
    ['component count 1', {
      sourceStrategy: 'component_pdfs',
      sources: [{ sourceKey: 'a', sourceVersionId: 'a-v1', sourceOrder: 1, ownerNodeKey: 'section-1' }],
    }],
    ['component count 21', {
      sourceStrategy: 'component_pdfs',
      sources: Array.from({ length: 21 }, (_, index) => ({
        sourceKey: `source-${index + 1}`,
        sourceVersionId: `version-${index + 1}`,
        sourceOrder: index + 1,
        ownerNodeKey: 'section-1',
      })),
    }],
    ['component order gap', {
      sourceStrategy: 'component_pdfs',
      sources: [
        { sourceKey: 'a', sourceVersionId: 'a-v1', sourceOrder: 1, ownerNodeKey: 'section-1' },
        { sourceKey: 'b', sourceVersionId: 'b-v1', sourceOrder: 3, ownerNodeKey: 'section-1' },
      ],
    }],
    ['component duplicate source key', {
      sourceStrategy: 'component_pdfs',
      sources: [
        { sourceKey: 'a', sourceVersionId: 'a-v1', sourceOrder: 1, ownerNodeKey: 'section-1' },
        { sourceKey: 'a', sourceVersionId: 'b-v1', sourceOrder: 2, ownerNodeKey: 'section-1' },
      ],
    }],
    ['component duplicate source version', {
      sourceStrategy: 'component_pdfs',
      sources: [
        { sourceKey: 'a', sourceVersionId: 'a-v1', sourceOrder: 1, ownerNodeKey: 'section-1' },
        { sourceKey: 'b', sourceVersionId: 'a-v1', sourceOrder: 2, ownerNodeKey: 'section-1' },
      ],
    }],
    ['component reordered orders', {
      sourceStrategy: 'component_pdfs',
      sources: [
        { sourceKey: 'a', sourceVersionId: 'a-v1', sourceOrder: 2, ownerNodeKey: 'section-1' },
        { sourceKey: 'b', sourceVersionId: 'b-v1', sourceOrder: 1, ownerNodeKey: 'section-1' },
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
  ])('rejects %s Source Set without normalization', async (_label, sourceSet) => {
    const operationId = '11111111-1111-4111-8111-111111111111';
    const service = {
      begin: vi.fn(),
      complete: vi.fn(),
      attachSourceSet: vi.fn(),
    };
    const host = createBookSourceControlHost({ service, verifier });
    const response = await host.fetch(post(
      '/v1/book-source/books/book-1/source-set/attach',
      {
        operationId,
        expectedBookRevision: 0,
        expectedSourceSetRevision: 0,
        sourceSet,
      },
      { 'idempotency-key': operationId },
    ), env);

    expect(response.status).toBe(400);
    expect(service.attachSourceSet).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated, oversized, non-json, extra-key, and idempotency mismatches', async () => {
    const service = { begin: vi.fn(), complete: vi.fn() };
    const deniedHost = createBookSourceControlHost({
      service,
      verifier: { verifyAuthorizationHeader: async () => ({ valid: false }) },
    });
    expect((await deniedHost.fetch(post('/v1/book-source/books/book-1/upload/begin', {}), env)).status)
      .toBe(401);

    const host = createBookSourceControlHost({ service, verifier });
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
       { operationId, sourceKey: 'source-1', kind: 'initial', purpose: 'book-source', inspection, bytes: '%PDF' },
      { 'idempotency-key': operationId },
    );
    expect((await host.fetch(extra, env)).status).toBe(400);

    const mismatch = post(
      '/v1/book-source/books/book-1/upload/begin',
       { operationId, sourceKey: 'source-1', kind: 'initial', purpose: 'book-source', inspection },
      { 'idempotency-key': '22222222-2222-4222-8222-222222222222' },
    );
    expect((await host.fetch(mismatch, env)).status).toBe(409);
    expect(service.begin).not.toHaveBeenCalled();
  });

  it('does not reflect unapproved origins or leak unknown errors', async () => {
    const host = createBookSourceControlHost({
      verifier,
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
       { operationId, sourceKey: 'source-1', kind: 'initial', purpose: 'book-source', inspection },
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
    const host = createBookSourceControlHost({ service, verifier });
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
