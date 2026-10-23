import { beforeEach, describe, expect, it, vi } from 'vitest';

const boundary = vi.hoisted(() => ({
  account: null as Record<string, unknown> | null,
  profile: { role: 'teacher', status: 'active' } as Record<string, unknown>,
  book: null as unknown,
  operations: {} as Record<string, unknown>,
  authorizeUpload: vi.fn(async (input: Record<string, unknown>) => ({
    authorizationId: 'https://upload.example/signed',
    expiresAt: input.expiresAt,
    storageLocationId: input.storageLocationId,
    providerKind: input.providerKind,
    privateBucketId: input.privateBucketId,
    providerObjectKey: input.providerObjectKey,
    requiredHeaders: {
      'content-type': 'application/pdf',
      'x-amz-content-sha256': (input.expectedChecksum as { value: string }).value,
      'x-amz-meta-book-source-byte-size': String(input.expectedByteSize),
      'x-amz-meta-book-source-sha256': (input.expectedChecksum as { value: string }).value,
    },
  })),
}));

vi.mock('../../src/services/book-source-delivery/sourceUpload.firebaseRtdbTransaction.ts', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/services/book-source-delivery/sourceUpload.firebaseRtdbTransaction.ts')>(),
  createTrustedFirebaseRtdbServiceAccountAccessTokenProvider: () => ({ getAccessToken: async () => 'test-token' }),
  createTrustedFirebaseSourceUploadRtdbTransaction: () => async ({ update }: { update: (state: unknown) => unknown }) => {
    const value = update(boundary.account);
    boundary.account = value as Record<string, unknown>;
    return { committed: true, value };
  },
}));

vi.mock('../src/book-source-worker/backblaze-b2-provider-wiring.ts', () => ({
  resolveBackblazeB2ProviderWiring: () => ({
    state: 'enabled',
    provider: {
      authorizeUpload: boundary.authorizeUpload,
      resolveCompletedObject: vi.fn(),
      readBounded: vi.fn(),
    },
  }),
}));

import { createBookSourceUploadWorkerHandlers } from '../src/upload-worker/book-source/worker.ts';
import { canonicalBookRouteManifest } from '../src/upload-worker/book-routes/manifest.ts';

const beginDescriptor = canonicalBookRouteManifest.find((route) => route.id === 'book.source-upload.begin');
const statusDescriptor = canonicalBookRouteManifest.find((route) => route.id === 'book.source-upload.status');
const cancelDescriptor = canonicalBookRouteManifest.find((route) => route.id === 'book.source-upload.cancel');
const completeDescriptor = canonicalBookRouteManifest.find((route) => route.id === 'book.source-upload.complete');
const safetyDescriptor = canonicalBookRouteManifest.find((route) => route.id === 'book.source-upload.decideStudentSafeSource');
if (!beginDescriptor || !statusDescriptor || !cancelDescriptor || !completeDescriptor || !safetyDescriptor) {
  throw new Error('missing_book_source_upload_route');
}

const ownerId = 'teacher-1';
const bookId = 'book-pending-1';
const submissionOperationId = 'submission-1';
const sourceOperationId = '11111111-1111-4111-8111-111111111111';
const fingerprint = 'a'.repeat(64);
const now = new Date().toISOString();
const inspection = {
  schemaVersion: 1,
  trust: 'browser-supplied-untrusted',
  state: 'complete',
  displayFilename: 'book.pdf',
  exactByteSize: 4,
  sha256Hex: fingerprint,
  physicalPageCount: 1,
  pdfType: 'application/pdf',
  readability: 'readable',
};
const env = {
  BOOK_SOURCE_UPLOAD_ACCOUNT_ID: 'source-account-1',
  BOOK_SOURCE_UPLOAD_SERVICE_IDENTITY: 'source@test.iam.gserviceaccount.com',
  BOOK_SOURCE_UPLOAD_GOOGLE_SA_KEY: JSON.stringify({
    client_email: 'source@test.iam.gserviceaccount.com', private_key: 'test-private-key',
  }),
  FIREBASE_DB_URL: 'https://database.example',
  BOOK_SOURCE_B2_PROVIDER_STATE: 'enabled',
  BOOK_SOURCE_B2_STORAGE_LOCATION_ID: 'location-1',
  BOOK_SOURCE_B2_PRIVATE_BUCKET_ID: 'bucket-1',
} as const;

const sourceAccount = () => ({
  revision: 0,
  capacity: {
    trackedAccountBytes: 0,
    temporaryBytes: 0,
    providerReconciliation: { status: 'healthy', totalBytes: 0, objectCount: 0, completedAt: now },
  },
  operations: {},
  assemblyBooks: {},
});

const submission = (patch: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  operationId: submissionOperationId,
  ownerId,
  finalBookId: bookId,
  fingerprint,
  state: 'preparing',
  ...patch,
});

const handlers = createBookSourceUploadWorkerHandlers();
const begin = (operationId = sourceOperationId, submissionId = submissionOperationId, runtimeEnv: Record<string, unknown> = env) => handlers.begin({
  request: new Request(`https://worker.test/v1/book-source/books/${bookId}/upload/begin`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': operationId },
    body: JSON.stringify({ operationId, submissionOperationId: submissionId,
      sourceKey: 'full', kind: 'initial', purpose: 'book-source', inspection }),
  }),
  env: runtimeEnv,
  uid: ownerId,
  params: { bookId },
  descriptor: beginDescriptor,
});

const callReservation = (action: 'status' | 'cancel' | 'complete', reservationId: string) => {
  const descriptor = action === 'status' ? statusDescriptor : action === 'cancel' ? cancelDescriptor : completeDescriptor;
  const method = action === 'status' ? 'GET' : 'POST';
  const operationId = sourceOperationId;
  return handlers[action === 'status' ? 'status' : action === 'cancel' ? 'cancel' : 'complete']({
    request: new Request(`https://worker.test/v1/book-source/books/${bookId}/upload/${reservationId}/${action}`, {
      method,
      headers: action === 'complete'
        ? { 'content-type': 'application/json', 'idempotency-key': operationId }
        : action === 'cancel' ? { 'content-type': 'application/json' } : {},
      ...(action === 'complete' ? { body: JSON.stringify({ operationId }) } : action === 'cancel' ? { body: '{}' } : {}),
    }),
    env,
    uid: ownerId,
    params: { bookId, reservationId },
    descriptor,
    ...(action === 'complete' ? { executionContext: { waitUntil: vi.fn() } as unknown as ExecutionContext } : {}),
  });
};

const decideSafety = (reservationId: string) => handlers.decideStudentSafeSource({
  request: new Request(`https://worker.test/v1/book-source/books/${bookId}/upload/${reservationId}/student-safe/decide`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': sourceOperationId },
    body: JSON.stringify({ operationId: sourceOperationId, studentSafeStatus: 'ready', reasonCode: 'teacher-reviewed' }),
  }),
  env,
  uid: ownerId,
  params: { bookId, reservationId },
  descriptor: safetyDescriptor,
});

const markReservationVerified = (reservationId: string) => {
  const account = structuredClone(boundary.account!);
  boundary.account = account;
  const operation = (account.operations as Record<string, Record<string, unknown>>)[reservationId];
  (account.operations as Record<string, Record<string, unknown>>)[reservationId] = {
    ...operation,
    status: 'verified_completed',
    completedAt: operation.createdAt,
    physicalPageCount: 1,
    verifiedStorage: {
      bookId,
      sourceVersionId: operation.sourceVersionId,
      storageLocationId: operation.storageLocationId,
      providerKind: operation.providerKind,
      privateBucketId: operation.privateBucketId,
      providerObjectKey: operation.providerObjectKey,
      providerFileId: 'file-1',
      providerFileVersionId: 'version-1',
      checksum: operation.expectedChecksum,
      byteSize: operation.byteSize,
    },
  };
  (account.capacity as Record<string, unknown>).trackedAccountBytes = operation.byteSize;
};

describe('Book submission source upload authority in production runtime', () => {
  beforeEach(() => {
    boundary.account = sourceAccount();
    boundary.profile = { role: 'teacher', status: 'active' };
    boundary.book = null;
    boundary.operations = { [submissionOperationId]: submission() };
    boundary.authorizeUpload.mockClear();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname.replace(/^\//u, '').replace(/\.json$/u, '');
      if (path === 'book_source_upload_accounts/source-account-1') return Response.json(boundary.account);
      if (path === `users/${ownerId}`) return Response.json(boundary.profile);
      if (path === `material_catalog/books/${bookId}`) return Response.json(boundary.book);
      const prefix = `book_submission_operations/${ownerId}/operations/`;
      if (path.startsWith(prefix)) return Response.json(boundary.operations[path.slice(prefix.length)] ?? null);
      throw new Error(`unexpected_firebase_read:${path}`);
    }));
  });

  it('uses the exact demo namespace and emulator bearer for local source authority reads', async () => {
    const result = await begin(sourceOperationId, submissionOperationId, { ...env,
      LOCAL_EMULATOR_AUTH: 'true', FIREBASE_PROJECT_ID: 'demo-luyentap-local',
      FIREBASE_DB_URL: 'http://localhost:9000?ns=demo-luyentap-local',
    });
    expect(result.init.status).toBe(200);
    const calls = vi.mocked(fetch).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    for (const [input, init] of calls) {
      const url = new URL(String(input));
      expect(url.origin).toBe('http://localhost:9000');
      expect(url.search).toBe('?ns=demo-luyentap-local');
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer owner');
    }
  });

  it('allows an exact active owner submission and immutably binds the reservation on replay', async () => {
    const first = await begin();
    expect(first.init.status).toBe(200);
    expect(first.body).toMatchObject({ status: 'reserved' });
    const reservationId = (first.body as { reservationId: string }).reservationId;
    expect((boundary.account as any).operations[reservationId].submissionOperationId).toBe(submissionOperationId);

    const replay = await begin();
    expect(replay.init.status).toBe(200);
    expect(replay.body).toMatchObject({ status: 'replayed', reservationId });

    const otherSubmissionId = 'submission-2';
    boundary.operations[otherSubmissionId] = submission({ operationId: otherSubmissionId });
    const rebound = await begin(sourceOperationId, otherSubmissionId);
    expect(rebound.init.status).toBe(409);
    expect(rebound.body).toEqual({ code: 'idempotency_conflict' });
    expect((boundary.account as any).operations[reservationId].submissionOperationId).toBe(submissionOperationId);
  });

  it.each([
    ['wrong final Book', submission({ finalBookId: 'book-other' })],
    ['canceled submission', submission({ state: 'canceled' })],
    ['committing submission', submission({ state: 'committing' })],
    ['inactive teacher', submission()],
  ])('denies %s before provider authorization', async (_name, operation) => {
    boundary.operations[submissionOperationId] = operation;
    if (_name === 'inactive teacher') boundary.profile = { role: 'teacher', status: 'suspended' };
    const result = await begin();
    expect(result.init.status).toBe(403);
    expect(result.body).toEqual({ code: 'authority_denied' });
    expect(boundary.authorizeUpload).not.toHaveBeenCalled();
  });

  it.each([
    ['foreign owner', { bookId, ownerId: 'teacher-other', status: 'active' }],
    ['archived Book', { bookId, ownerId, status: 'archived' }],
    ['malformed Book row', 'unexpected'],
  ])('does not fall back to a pending submission when a canonical row exists (%s)', async (_name, book) => {
    boundary.book = book;
    const result = await begin();
    expect(result.init.status).toBe(403);
    expect(result.body).toEqual({ code: 'authority_denied' });
    expect(boundary.authorizeUpload).not.toHaveBeenCalled();
  });

  it('allows exact canceled-reservation status and cleanup, but prevents cleanup after commit', async () => {
    const created = await begin();
    const reservationId = (created.body as { reservationId: string }).reservationId;
    boundary.operations[submissionOperationId] = submission({ state: 'canceled' });

    const status = await callReservation('status', reservationId);
    expect(status.init.status).toBe(200);
    expect(status.body).toMatchObject({ status: 'reserved', reservationId });
    const cleanup = await callReservation('cancel', reservationId);
    expect(cleanup.init.status).toBe(200);
    expect(cleanup.body).toMatchObject({ status: 'cleanup_pending', reservationId });

    const another = '22222222-2222-4222-8222-222222222222';
    boundary.account = sourceAccount();
    boundary.operations[submissionOperationId] = submission();
    const attached = await begin(another);
    const attachedId = (attached.body as { reservationId: string }).reservationId;
    boundary.operations[submissionOperationId] = submission({ state: 'committed' });
    boundary.book = { bookId, ownerId, status: 'active' };
    const denied = await callReservation('cancel', attachedId);
    expect(denied.init.status).toBe(403);
    expect(denied.body).toEqual({ code: 'authority_denied' });
  });

  it('allows status for an expired-lease committing submission without allowing begin or cleanup', async () => {
    const created = await begin();
    const reservationId = (created.body as { reservationId: string }).reservationId;
    boundary.operations[submissionOperationId] = submission({
      state: 'committing',
      commitLeaseId: 'lease-expired',
      commitLeaseExpiresAt: '2000-01-01T00:00:00.000Z',
    });

    const status = await callReservation('status', reservationId);
    expect(status.init.status).toBe(200);
    expect(status.body).toMatchObject({ status: 'reserved', reservationId });

    const cleanup = await callReservation('cancel', reservationId);
    expect(cleanup.init.status).toBe(403);
    expect(cleanup.body).toEqual({ code: 'authority_denied' });

    const anotherBegin = await begin('33333333-3333-4333-8333-333333333333');
    expect(anotherBegin.init.status).toBe(403);
    expect(anotherBegin.body).toEqual({ code: 'authority_denied' });
  });

  it('denies completion and safety decisions after cancellation while preserving status and cleanup access', async () => {
    const created = await begin();
    const reservationId = (created.body as { reservationId: string }).reservationId;
    boundary.operations[submissionOperationId] = submission({ state: 'canceled' });

    const complete = await callReservation('complete', reservationId);
    expect(complete.init.status).toBe(403);
    expect(complete.body).toEqual({ code: 'authority_denied' });
    expect(boundary.authorizeUpload).toHaveBeenCalledOnce();

    markReservationVerified(reservationId);
    const decision = await decideSafety(reservationId);
    expect(decision.init.status).toBe(403);
    expect(decision.body).toEqual({ code: 'authority_denied' });
    expect((boundary.account!.operations as Record<string, Record<string, unknown>>)[reservationId].studentSafeStatus).toBe('unreviewed');
  });
});
