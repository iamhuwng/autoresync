import { describe, expect, it, vi } from 'vitest';
import {
  createBookSourceUploadWorkerHandlers,
  createBookSourceUploadRuntime,
  listBookSourceProjections,
} from '../src/upload-worker/book-source/worker.ts';
import {
  isActiveBookSourceAuthorityProfile,
  readReadyBookSourceSafety,
} from '../src/upload-worker/book-source/trusted-source-contract.ts';
import { createBookRouter } from '../src/upload-worker/book-router.ts';
import { canonicalBookRouteManifest } from '../src/upload-worker/book-routes/manifest.ts';
import { createBookSourceControlHost } from '../src/book-source-worker/control-host.ts';
import { SourceUploadControlError } from '../../src/services/book-source-delivery/sourceUpload.service.ts';

const operationId = '11111111-1111-4111-8111-111111111111';
const beginDescriptor = canonicalBookRouteManifest.find((route) => route.id === 'book.source-upload.begin');
if (!beginDescriptor) throw new Error('missing_book_source_begin_descriptor');
const completeDescriptor = canonicalBookRouteManifest.find((route) => route.id === 'book.source-upload.complete');
if (!completeDescriptor) throw new Error('missing_book_source_complete_descriptor');
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
  BOOK_SOURCE_UPLOAD_SERVICE_IDENTITY: 'book-source@test.iam.gserviceaccount.com',
  BOOK_SOURCE_UPLOAD_GOOGLE_SA_KEY: '{"client_email":"book-source@test.iam.gserviceaccount.com","private_key":"private"}',
  BOOK_SOURCE_CONTROL_ALLOWED_ORIGIN: 'http://localhost:5173',
  FIREBASE_PROJECT_ID: 'project',
} as const;

describe('canonical #49 source upload composition', () => {
  it.each([
    { LOCAL_EMULATOR_AUTH: 'true', FIREBASE_PROJECT_ID: 'production', FIREBASE_DB_URL: 'http://localhost:9000?ns=demo-luyentap-local' },
    { LOCAL_EMULATOR_AUTH: 'true', FIREBASE_PROJECT_ID: 'demo-luyentap-local', FIREBASE_DB_URL: 'https://production.example' },
    { LOCAL_EMULATOR_AUTH: 'false', FIREBASE_PROJECT_ID: 'demo-luyentap-local', FIREBASE_DB_URL: 'http://localhost:9000?ns=demo-luyentap-local' },
  ])('rejects a mismatched local runtime before using service credentials', async (target) => {
    await expect(createBookSourceUploadRuntime({ ...env, BOOK_SOURCE_UPLOAD_ACCOUNT_ID: 'local_qa', ...target }))
      .rejects.toMatchObject({ code: 'invalid_deployment' });
  });

  it('keeps student delivery ready-only and bound to a complete decision', () => {
    const source = {
      purpose: 'book-source',
      studentSafeStatus: 'ready',
      checksum: { algorithm: 'sha-256', value: 'a'.repeat(64) },
      studentSafeDecision: {
        decidedBy: 'teacher-1',
        decidedAt: '2026-08-01T00:00:00.000Z',
        sourceVersionId: 'version-1',
        sha256Hex: 'a'.repeat(64),
        reasonCode: 'teacher-reviewed',
      },
    };
    expect(readReadyBookSourceSafety(source, 'version-1')).not.toBeNull();
    expect(readReadyBookSourceSafety({ ...source, studentSafeStatus: 'unreviewed', studentSafeDecision: undefined }, 'version-1')).toBeNull();
    expect(readReadyBookSourceSafety({ ...source, studentSafeStatus: 'rejected' }, 'version-1')).toBeNull();
    expect(readReadyBookSourceSafety({ ...source, purpose: 'student-document' }, 'version-1')).toBeNull();
    expect(readReadyBookSourceSafety({ ...source, studentSafeDecision: { ...source.studentSafeDecision, sourceVersionId: 'other-version' } }, 'version-1')).toBeNull();
    expect(readReadyBookSourceSafety({ ...source, checksum: undefined, expectedChecksum: source.checksum }, 'version-1')).toBeNull();
  });

  it('uses one active authority predicate for owner teachers and unfenced admins', () => {
    const active = { role: 'teacher', status: 'active' };
    expect(isActiveBookSourceAuthorityProfile(active, 'teacher')).toBe(true);
    for (const fence of [
      { status: 'blocked' },
      { status: 'inactive' },
      { status: 'suspended' },
      { disabled: true },
      { forceReauth: true },
      { privilegedAuthorityRevokedAt: 'now' },
    ]) {
      expect(isActiveBookSourceAuthorityProfile({ ...active, ...fence }, 'teacher')).toBe(false);
    }
    expect(isActiveBookSourceAuthorityProfile({ role: 'teacher' }, 'teacher')).toBe(false);
    expect(isActiveBookSourceAuthorityProfile({ role: 'super_admin', status: 'active' }, 'super_admin')).toBe(true);
    for (const fence of [
      { status: 'blocked' },
      { status: 'inactive' },
      { status: 'suspended' },
      { disabled: true },
      { forceReauth: true },
      { privilegedAuthorityRevokedAt: 'now' },
    ]) {
      expect(isActiveBookSourceAuthorityProfile({ role: 'super_admin', status: 'active', ...fence }, 'super_admin')).toBe(false);
    }
    expect(isActiveBookSourceAuthorityProfile({ role: 'super_admin' }, 'super_admin')).toBe(false);
    expect(isActiveBookSourceAuthorityProfile({ role: 'student', status: 'active' }, 'teacher')).toBe(false);
  });

  it('lists version-keyed projections by logical source key while retaining both identities', () => {
    expect(listBookSourceProjections({
      assemblyBooks: {
        'book-1': {
          'version-2': {
            ownerId: 'teacher-1', bookId: 'book-1', sourceKey: 'z-logical', sourceVersionId: 'version-2',
            checksum: { algorithm: 'sha-256', value: 'b'.repeat(64) }, physicalPageCount: 8, verifiedUsable: true,
            purpose: 'book-source', studentSafeStatus: 'ready', studentSafeDecision: {
              decidedBy: 'teacher-1', decidedAt: '2026-08-01T00:00:00.000Z', sourceVersionId: 'version-2',
              sha256Hex: 'b'.repeat(64), reasonCode: 'teacher-reviewed',
            },
          },
          'version-1': {
            ownerId: 'teacher-1', bookId: 'book-1', sourceKey: 'a-logical', sourceVersionId: 'version-1',
            checksum: { algorithm: 'sha-256', value: 'a'.repeat(64) }, physicalPageCount: 4, verifiedUsable: true,
            purpose: 'book-source', studentSafeStatus: 'ready', studentSafeDecision: {
              decidedBy: 'teacher-1', decidedAt: '2026-08-01T00:00:00.000Z', sourceVersionId: 'version-1',
              sha256Hex: 'a'.repeat(64), reasonCode: 'teacher-reviewed',
            },
          },
          'version-0': {
            ownerId: 'teacher-1', bookId: 'book-1', sourceKey: 'a-logical', sourceVersionId: 'version-0',
            checksum: { algorithm: 'sha-256', value: 'c'.repeat(64) }, physicalPageCount: 3, verifiedUsable: true,
            purpose: 'book-source', studentSafeStatus: 'ready', studentSafeDecision: {
              decidedBy: 'teacher-1', decidedAt: '2026-08-01T00:00:00.000Z', sourceVersionId: 'version-0',
              sha256Hex: 'c'.repeat(64), reasonCode: 'teacher-reviewed',
            },
          },
          'wrong-entry': {
            ownerId: 'teacher-1', bookId: 'book-1', sourceKey: 'ignored', sourceVersionId: 'version-3',
            checksum: { algorithm: 'sha-256', value: 'a'.repeat(64) }, physicalPageCount: 2, verifiedUsable: true, purpose: 'book-source', studentSafeStatus: 'unreviewed',
          },
        },
      },
    }, 'teacher-1', 'book-1')).toEqual([
      {
        sourceKey: 'a-logical', sourceVersionId: 'version-0', bookId: 'book-1',
        checksum: { algorithm: 'sha-256', value: 'c'.repeat(64) },
        physicalPageCount: 3, verifiedUsable: true, purpose: 'book-source', studentSafeStatus: 'ready',
        studentSafeDecision: expect.objectContaining({ sourceVersionId: 'version-0' }),
      },
      {
        sourceKey: 'a-logical', sourceVersionId: 'version-1', bookId: 'book-1',
        checksum: { algorithm: 'sha-256', value: 'a'.repeat(64) },
        physicalPageCount: 4, verifiedUsable: true, purpose: 'book-source', studentSafeStatus: 'ready',
        studentSafeDecision: expect.objectContaining({ sourceVersionId: 'version-1' }),
      },
      {
        sourceKey: 'z-logical', sourceVersionId: 'version-2', bookId: 'book-1',
        checksum: { algorithm: 'sha-256', value: 'b'.repeat(64) },
        physicalPageCount: 8, verifiedUsable: true, purpose: 'book-source', studentSafeStatus: 'ready',
        studentSafeDecision: expect.objectContaining({ sourceVersionId: 'version-2' }),
      },
    ]);
  });

  it('does not expose a missing retirement-pending projection as ready', () => {
    expect(listBookSourceProjections({ assemblyBooks: { 'book-1': {} } }, 'teacher-1', 'book-1')).toEqual([]);
  });

  it('retains unreviewed/review-required components but excludes student documents and rejected rows', () => {
    const source = (purpose: string, studentSafeStatus: string, version: string) => ({
      ownerId: 'teacher-1', bookId: 'book-1', sourceKey: 'logical', sourceVersionId: version,
      checksum: { algorithm: 'sha-256', value: 'a'.repeat(64) }, physicalPageCount: 1, verifiedUsable: true, purpose, studentSafeStatus,
      ...(studentSafeStatus === 'unreviewed' ? {} : {
        studentSafeDecision: {
          decidedBy: 'teacher-1', decidedAt: '2026-08-01T00:00:00.000Z', sourceVersionId: version,
          sha256Hex: 'a'.repeat(64), reasonCode: 'teacher-reviewed',
        },
      }),
    });
    expect(listBookSourceProjections({ assemblyBooks: { 'book-1': {
      'component-v1': source('book-source', 'ready', 'component-v1'),
      'component-v2': source('book-source', 'unreviewed', 'component-v2'),
      'component-v3': source('book-source', 'review-required', 'component-v3'),
      'student-v1': source('student-document', 'ready', 'student-v1'),
      'rejected-v1': source('book-source', 'rejected', 'rejected-v1'),
    } } } as never, 'teacher-1', 'book-1')).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceVersionId: 'component-v1', studentSafeStatus: 'ready' }),
      expect.objectContaining({ sourceVersionId: 'component-v2', studentSafeStatus: 'unreviewed' }),
      expect.objectContaining({ sourceVersionId: 'component-v3', studentSafeStatus: 'review-required' }),
    ]));
    expect(listBookSourceProjections({ assemblyBooks: { 'book-1': {
      'student-v1': source('student-document', 'ready', 'student-v1'),
      'rejected-v1': source('book-source', 'rejected', 'rejected-v1'),
    } } } as never, 'teacher-1', 'book-1')).toEqual([]);
  });

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
            purpose: 'book-source',
            inspection,
          }),
        },
      ),
      env,
      uid: 'teacher-1',
      params: { bookId: 'book-1' },
      descriptor: beginDescriptor,
    });

    expect(response.init.status).toBe(200);
    expect(response.body).toMatchObject({
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
      purpose: 'book-source',
      claim: inspection,
    });
  });

  it('fails closed when source runtime configuration cannot be constructed', async () => {
    const handlers = createBookSourceUploadWorkerHandlers({
      runtimeFactory: async () => {
        throw new SourceUploadControlError('invalid_deployment');
      },
    });
    const response = await handlers.begin({
      request: new Request('https://book.example/v1/book-source/books/book-1/upload/begin', {
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
          purpose: 'book-source',
          inspection,
        }),
      }),
      env,
      uid: 'teacher-1',
      params: { bookId: 'book-1' },
      descriptor: beginDescriptor,
    });

    expect(response.init.status).toBe(503);
    expect(response.body).toEqual({ code: 'invalid_deployment' });
  });

  it('passes one native cleanup sink through source completion and fails closed without it', async () => {
    const waitUntil = vi.fn();
    const completed = {
      status: 'verified_completed' as const,
      reservationId: 'reservation-1',
      sourceVersionId: 'source-version-1',
      checksum: { algorithm: 'sha-256' as const, value: 'a'.repeat(64) },
    };
    const complete = vi.fn(async (_input: unknown, context?: { deferCleanup?: (promise: Promise<unknown>) => void }) => {
      context?.deferCleanup?.(Promise.resolve());
      return completed;
    });
    const handlers = createBookSourceUploadWorkerHandlers({
      runtimeFactory: () => ({ service: { begin: vi.fn(), complete } }),
    });
    const makeRequest = () => new Request(
      'https://book.example/v1/book-source/books/book-1/upload/reservation-1/complete',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': operationId,
          origin: 'http://localhost:5173',
        },
        body: JSON.stringify({ operationId }),
      },
    );
    const executionContext = { waitUntil } as unknown as ExecutionContext;

    const response = await handlers.complete({
      request: makeRequest(),
      env,
      uid: 'teacher-1',
      params: { bookId: 'book-1', reservationId: 'reservation-1' },
      descriptor: completeDescriptor,
      executionContext,
    });

    expect(response.init.status).toBe(200);
    expect(complete).toHaveBeenCalledWith(
      { actorId: 'teacher-1', bookId: 'book-1', reservationId: 'reservation-1', operationId },
      expect.objectContaining({ deferCleanup: expect.any(Function) }),
    );
    expect(waitUntil).toHaveBeenCalledOnce();

    const withoutContext = await handlers.complete({
      request: makeRequest(),
      env,
      uid: 'teacher-1',
      params: { bookId: 'book-1', reservationId: 'reservation-1' },
      descriptor: completeDescriptor,
    });
    expect(withoutContext.init.status).toBe(503);
    expect(withoutContext.body).toEqual({ code: 'cleanup_unavailable' });
    expect(complete).toHaveBeenCalledOnce();
  });

  it('routes owner safety decisions through the trusted service and rejects stale and malformed results', async () => {
    const decision = {
      status: 'verified_completed' as const,
      reservationId: 'reservation-1',
      sourceVersionId: 'source-version-1',
      checksum: { algorithm: 'sha-256' as const, value: 'a'.repeat(64) },
      purpose: 'book-source' as const,
      studentSafeStatus: 'ready' as const,
      studentSafeDecision: {
        decidedBy: 'teacher-1',
        decidedAt: '2026-08-01T00:00:00.000Z',
        sourceVersionId: 'source-version-1',
        sha256Hex: 'a'.repeat(64),
        reasonCode: 'teacher-reviewed' as const,
      },
    };
    const decideStudentSafeSource = vi.fn(async () => decision);
    const verifier = { verifyAuthorizationHeader: async () => ({ valid: true, uid: 'teacher-1' }) };
    const host = createBookSourceControlHost({
      verifier,
      service: { begin: vi.fn(), complete: vi.fn(), decideStudentSafeSource },
    });
    const response = await host.fetch(new Request(
      'https://control.example/v1/book-source/books/book-1/upload/reservation-1/student-safe/decide',
      {
        method: 'POST',
        headers: { authorization: 'Bearer token', 'content-type': 'application/json', 'idempotency-key': operationId },
        body: JSON.stringify({ operationId, studentSafeStatus: 'ready', reasonCode: 'teacher-reviewed' }),
      },
    ), env);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(decision);
    expect(decideStudentSafeSource).toHaveBeenCalledWith({
      actorId: 'teacher-1',
      bookId: 'book-1',
      reservationId: 'reservation-1',
      operationId,
      studentSafeStatus: 'ready',
      reasonCode: 'teacher-reviewed',
    });

    const mismatchedHashHost = createBookSourceControlHost({
      verifier,
      service: {
        begin: vi.fn(),
        complete: vi.fn(),
        decideStudentSafeSource: vi.fn(async () => ({
          ...decision,
          studentSafeDecision: { ...decision.studentSafeDecision, sha256Hex: 'b'.repeat(64) },
        })),
      },
    });
    const mismatchedHash = await mismatchedHashHost.fetch(new Request(
      'https://control.example/v1/book-source/books/book-1/upload/reservation-1/student-safe/decide',
      {
        method: 'POST',
        headers: { authorization: 'Bearer token', 'content-type': 'application/json', 'idempotency-key': operationId },
        body: JSON.stringify({ operationId, studentSafeStatus: 'ready', reasonCode: 'teacher-reviewed' }),
      },
    ), env);
    expect(mismatchedHash.status).toBe(409);

    for (const malformed of [
      { ...decision, studentSafeDecision: { ...decision.studentSafeDecision, decidedBy: 'teacher-2' } },
      { ...decision, studentSafeDecision: { ...decision.studentSafeDecision, decidedAt: 'not-a-date' } },
      { ...decision, studentSafeDecision: { ...decision.studentSafeDecision, sourceVersionId: 'source-version-old' } },
      { ...decision, studentSafeDecision: { ...decision.studentSafeDecision, sha256Hex: 'z'.repeat(64) } },
      { ...decision, studentSafeStatus: 'review-required' as const },
    ]) {
      const malformedHost = createBookSourceControlHost({
        verifier,
        service: {
          begin: vi.fn(),
          complete: vi.fn(),
          decideStudentSafeSource: vi.fn(async () => malformed),
        },
      });
      const malformedResponse = await malformedHost.fetch(new Request(
        'https://control.example/v1/book-source/books/book-1/upload/reservation-1/student-safe/decide',
        {
          method: 'POST',
          headers: { authorization: 'Bearer token', 'content-type': 'application/json', 'idempotency-key': operationId },
          body: JSON.stringify({ operationId, studentSafeStatus: 'ready', reasonCode: 'teacher-reviewed' }),
        },
      ), env);
      expect(malformedResponse.status).toBe(409);
    }

    for (const failure of ['reservation_conflict', 'stale_cas'] as const) {
      const failingHost = createBookSourceControlHost({
        verifier,
        service: {
          begin: vi.fn(),
          complete: vi.fn(),
          decideStudentSafeSource: vi.fn(async () => { throw { code: failure }; }),
        },
      });
      const failed = await failingHost.fetch(new Request(
        'https://control.example/v1/book-source/books/book-1/upload/reservation-1/student-safe/decide',
        {
          method: 'POST',
          headers: { authorization: 'Bearer token', 'content-type': 'application/json', 'idempotency-key': operationId },
          body: JSON.stringify({ operationId, studentSafeStatus: 'ready', reasonCode: 'teacher-reviewed' }),
        },
      ), env);
      expect(failed.status).toBe(409);
    }

    const studentDocumentHost = createBookSourceControlHost({
      verifier,
      service: {
        begin: vi.fn(),
        complete: vi.fn(),
        decideStudentSafeSource: vi.fn(async () => ({ ...decision, purpose: 'student-document' as const })),
      },
    });
    const studentDocument = await studentDocumentHost.fetch(new Request(
      'https://control.example/v1/book-source/books/book-1/upload/reservation-1/student-safe/decide',
      {
        method: 'POST',
        headers: { authorization: 'Bearer token', 'content-type': 'application/json', 'idempotency-key': operationId },
        body: JSON.stringify({ operationId, studentSafeStatus: 'ready', reasonCode: 'teacher-reviewed' }),
      },
    ), env);
    expect(studentDocument.status).toBe(200);
  });

  it('does not require the retired source-upload route switch', async () => {
    const begin = vi.fn(async () => ({ body: { status: 'available' }, init: { status: 200 } }));
    const router = createBookRouter({
      firebaseVerifier: { verifyAuthorizationHeader: async () => ({ valid: true, uid: 'teacher-1' }) },
      routeHandlers: {
        sourceUploadHandlers: {
          begin,
        },
      },
    });
    const response = await router.fetch(
      new Request('https://book.example/v1/book-source/books/book-1/upload/begin', {
        method: 'POST',
        headers: { origin: 'http://localhost:5173' },
      }),
      { ...env, BOOK_ROUTE_RATE_LIMITER: { limit: async () => ({ success: true }) } },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'available' });
    expect(begin).toHaveBeenCalledOnce();
  });

  it('fails closed when the allowed-origin binding is missing', async () => {
    const begin = vi.fn();
    const router = createBookRouter({
      firebaseVerifier: { verifyAuthorizationHeader: async () => ({ valid: true, uid: 'teacher-1' }) },
      routeHandlers: { sourceUploadHandlers: { begin } },
    });
    for (const allowedOrigin of [undefined, '', '   ']) {
      const response = await router.fetch(
        new Request('https://book.example/v1/book-source/books/book-1/upload/begin', {
          method: 'POST',
          headers: { origin: 'http://localhost:5173' },
        }),
        {
          ...env,
          BOOK_SOURCE_CONTROL_ALLOWED_ORIGIN: allowedOrigin,
          BOOK_ROUTE_RATE_LIMITER: { limit: async () => ({ success: true }) },
        },
      );

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ code: 'invalid_deployment' });
    }
    expect(begin).not.toHaveBeenCalled();
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
