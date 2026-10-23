import { describe, expect, it, vi } from 'vitest';

import { createBookSourceReconciliationWorker } from '../src/book-source-worker/reconciliation-worker';
import { CAPACITY_PROBE_FAILURE_HEADER } from '../src/book-source-worker/capacity-probe-worker';

describe('Book Source reconciliation Worker', () => {
  it('co-locates the bounded capacity work unit without enabling cleanup routes', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    const capacityProbe = { fetch };
    const request = new Request(
      'https://preview.example/internal/book-source-capacity/reconciliation-page',
      { method: 'POST' },
    );
    const env = { BOOK_SOURCE_RECONCILIATION_STATE: 'disabled' } as never;

    const response = await createBookSourceReconciliationWorker(
      vi.fn<typeof globalThis.fetch>(),
      () => new Date('2026-07-29T00:00:00.000Z'),
      capacityProbe,
    ).fetch(request, env);

    expect(response.status).toBe(204);
    expect(fetch).toHaveBeenCalledWith(request, env);
  });

  it('fails closed before auth, Firebase, or B2 work unless explicitly enabled', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const response = await createBookSourceReconciliationWorker(fetcher).fetch(
      new Request('https://preview.example/v1/book-source/books/book-1/upload/reservation-1/status'),
      {} as never,
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      code: 'book_source_reconciliation_unavailable',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('uses only the namespaced Firebase emulator and owner bearer in strict local mode', async () => {
    const firebaseFetch = vi.fn<typeof fetch>(async () => Response.json(null));
    const verifier = {
      verifyAuthorizationHeader: vi.fn(async (authorization: string | null) => ({
        valid: authorization === 'Bearer local-user-token',
        uid: authorization === 'Bearer local-user-token' ? 'teacher-1' : undefined,
      })),
    };
    const worker = createBookSourceReconciliationWorker(
      firebaseFetch,
      () => new Date('2026-10-19T00:00:00.000Z'),
      undefined,
      undefined,
      undefined,
      verifier,
    );
    const response = await worker.fetch(
      new Request('http://localhost:8787/v1/book-source/books/book-1/upload/reservation-1/reconcile', {
        method: 'POST',
        headers: { Authorization: 'Bearer local-user-token', 'Content-Type': 'application/json' },
        body: '{}',
      }),
      {
        LOCAL_EMULATOR_AUTH: 'true',
        FIREBASE_PROJECT_ID: 'demo-luyentap-local',
        FIREBASE_DATABASE_URL: 'http://localhost:9000/?ns=demo-luyentap-local',
        BOOK_SOURCE_RECONCILIATION_STATE: 'enabled',
        BOOK_SOURCE_RECONCILIATION_ACTION_STATE: 'enabled',
        BOOK_SOURCE_UPLOAD_ACCOUNT_ID: 'book_b2_primary',
        BOOK_SOURCE_RECONCILIATION_LEASE_OWNER: 'local-reconciler',
        BOOK_SOURCE_B2_ENDPOINT: 'https://s3.us-west-004.backblazeb2.com',
        BOOK_SOURCE_B2_REGION: 'us-west-004',
        BOOK_SOURCE_B2_STORAGE_LOCATION_ID: 'b2_book_primary',
        BOOK_SOURCE_B2_PRIVATE_BUCKET_ID: 'bucket-id',
        BOOK_SOURCE_B2_PRIVATE_BUCKET_NAME: 'bookpdf',
        BOOK_SOURCE_B2_OBJECT_KEY_PREFIX: 'book-source/test/',
        BOOK_SOURCE_B2_DELETE_APPLICATION_KEY_ID: 'delete-id',
        BOOK_SOURCE_B2_DELETE_APPLICATION_KEY: 'delete-key',
        BOOK_SOURCE_B2_METADATA_APPLICATION_KEY_ID: 'metadata-id',
        BOOK_SOURCE_B2_METADATA_APPLICATION_KEY: 'metadata-key',
      } as never,
    );

    expect(response.status).toBe(404);
    expect(firebaseFetch).toHaveBeenCalledTimes(1);
    const [request, init] = firebaseFetch.mock.calls[0]!;
    expect(String(request)).toBe(
      'http://localhost:9000/book_source_upload_accounts/book_b2_primary.json?ns=demo-luyentap-local',
    );
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer owner');
    expect(verifier.verifyAuthorizationHeader).toHaveBeenCalledWith(
      'Bearer local-user-token',
      expect.objectContaining({ FIREBASE_PROJECT_ID: 'demo-luyentap-local' }),
    );
  });

  it.each([
    { project: 'temp-a1437', url: 'http://localhost:9000/?ns=demo-luyentap-local' },
    { project: 'demo-luyentap-local', url: 'http://localhost:9000/?ns=other' },
    { project: 'demo-luyentap-local', url: 'https://database.example' },
  ])('fails closed for non-canonical local Firebase target $project $url', async ({ project, url }) => {
    const firebaseFetch = vi.fn<typeof fetch>();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await createBookSourceReconciliationWorker(firebaseFetch).fetch(
      new Request('http://localhost:8787/v1/book-source/books/book-1/upload/reservation-1/reconcile', {
        method: 'POST',
        headers: { Authorization: 'Bearer local-user-token', 'Content-Type': 'application/json' },
        body: '{}',
      }),
      {
        LOCAL_EMULATOR_AUTH: 'true',
        FIREBASE_PROJECT_ID: project,
        FIREBASE_DATABASE_URL: url,
        BOOK_SOURCE_RECONCILIATION_STATE: 'enabled',
      } as never,
    );
    expect(response.status).toBe(503);
    expect(firebaseFetch).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('logs only a bounded failure code for enabled deployment errors', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await createBookSourceReconciliationWorker().fetch(
      new Request(
        'https://preview.example/v1/book-source/books/book-1/upload/reservation-1/status',
        { headers: { Origin: 'http://localhost:5173' } },
      ),
      {
        BOOK_SOURCE_RECONCILIATION_STATE: ' enabled\r\n',
        BOOK_SOURCE_RECONCILIATION_DIAGNOSTICS: ' enabled\r\n',
        BOOK_SOURCE_CONTROL_ALLOWED_ORIGIN: 'http://localhost:5173',
      } as never,
    );
    expect(response.status).toBe(503);
    expect(response.headers.get('x-book-source-diagnostic-code')).toBe('invalid_deployment');
    expect(error).toHaveBeenCalledWith(
      'book_source_reconciliation_unavailable',
      { code: 'invalid_deployment' },
    );
    expect(JSON.stringify(error.mock.calls)).not.toMatch(/key|token|secret|stack/iu);
    error.mockRestore();
  });

  it('never exposes diagnostic codes to another origin', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await createBookSourceReconciliationWorker().fetch(
      new Request(
        'https://preview.example/v1/book-source/books/book-1/upload/reservation-1/status',
        { headers: { Origin: 'https://other.example' } },
      ),
      {
        BOOK_SOURCE_RECONCILIATION_STATE: 'enabled',
        BOOK_SOURCE_RECONCILIATION_DIAGNOSTICS: 'enabled',
        BOOK_SOURCE_CONTROL_ALLOWED_ORIGIN: 'http://localhost:5173',
      } as never,
    );
    expect(response.headers.has('x-book-source-diagnostic-code')).toBe(false);
    error.mockRestore();
  });

  it('runs one deterministic eligible reconciliation work unit per scheduled event', async () => {
    const reconcile = vi.fn(async () => ({
      reservationId: 'reservation-a',
      bookId: 'book-a',
      sourceVersionId: 'source-a',
      status: 'released' as const,
      retryKind: 'none' as const,
    }));
    const runtimeFactory = vi.fn(async () => ({
      readAccountState: async () => ({
        revision: 2,
        capacity: { trackedAccountBytes: 0, temporaryBytes: 0 },
        operations: {
          'reservation-b': {
            reservationId: 'reservation-b',
            bookId: 'book-b',
            sourceVersionId: 'source-b',
            sourceKey: 'main',
            ownerId: 'teacher-b',
            storageLocationId: 'location-1',
            providerKind: 'backblaze-b2-s3',
            privateBucketId: 'bucket-1',
            providerObjectKey: 'private/book-b/source-b.pdf',
            kind: 'initial' as const,
            byteSize: 1,
            originalFilename: 'b.pdf',
            expectedChecksum: { algorithm: 'sha-256' as const, value: 'b'.repeat(64) },
            createdAt: '2026-07-29T00:00:00.000Z',
            expiresAt: '2026-07-29T00:01:00.000Z',
            status: 'reserved' as const,
          },
          'reservation-a': {
            reservationId: 'reservation-a',
            bookId: 'book-a',
            sourceVersionId: 'source-a',
            sourceKey: 'main',
            ownerId: 'teacher-a',
            storageLocationId: 'location-1',
            providerKind: 'backblaze-b2-s3',
            privateBucketId: 'bucket-1',
            providerObjectKey: 'private/book-a/source-a.pdf',
            kind: 'initial' as const,
            byteSize: 1,
            originalFilename: 'a.pdf',
            expectedChecksum: { algorithm: 'sha-256' as const, value: 'a'.repeat(64) },
            createdAt: '2026-07-29T00:00:00.000Z',
            expiresAt: '2026-07-29T00:01:00.000Z',
            status: 'reserved' as const,
          },
        },
      }),
      reconciler: { reconcile },
    }) as never);
    const worker = createBookSourceReconciliationWorker(
      vi.fn<typeof globalThis.fetch>(),
      () => new Date('2026-07-29T00:02:00.000Z'),
      { fetch: vi.fn() },
      runtimeFactory,
    );
    const enabled = {
      BOOK_SOURCE_RECONCILIATION_STATE: 'enabled',
      BOOK_SOURCE_RECONCILIATION_ACTION_STATE: 'enabled',
      BOOK_SOURCE_RECONCILIATION_SCHEDULE_STATE: 'enabled',
    } as never;

    const controller = {
      cron: '*/15 * * * *',
      scheduledTime: Date.parse('2026-07-29T00:02:00.000Z'),
      type: 'scheduled',
      noRetry: vi.fn(),
    } as unknown as ScheduledController;
    const context = { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext;
    await worker.scheduled(controller, enabled, context);

    expect(runtimeFactory).toHaveBeenCalledTimes(1);
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(reconcile).toHaveBeenCalledWith({
      actorId: 'teacher-a',
      bookId: 'book-a',
      reservationId: 'reservation-a',
    });

    await worker.scheduled(controller, {
      ...enabled,
      BOOK_SOURCE_RECONCILIATION_SCHEDULE_STATE: 'disabled',
    }, context);
    expect(runtimeFactory).toHaveBeenCalledTimes(1);
  });

  it('discovers canceled verified sources after a primary reconciliation failure using fresh account state', async () => {
    const primary = { reservationId: 'reservation-a', ownerId: 'teacher-a', bookId: 'book-a',
      status: 'reserved', expiresAt: '2026-07-29T00:01:00.000Z' };
    const canceled = { reservationId: 'reservation-b', ownerId: 'teacher-b', bookId: 'book-b', status: 'verified_completed' };
    const state = { revision: 1, operations: { 'reservation-a': primary } };
    const fresh = { revision: 2, operations: { 'reservation-b': canceled } };
    const readAccountState = vi.fn().mockResolvedValueOnce(state).mockResolvedValueOnce(fresh);
    const findCanceledSubmission = vi.fn(async () => canceled);
    const reconcile = vi.fn().mockRejectedValueOnce({ code: 'authority_denied' }).mockResolvedValueOnce({ status: 'released' });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const worker = createBookSourceReconciliationWorker(
      vi.fn<typeof globalThis.fetch>(), () => new Date('2026-07-29T00:02:00.000Z'),
      { fetch: vi.fn() }, async () => ({ readAccountState, findCanceledSubmission, reconciler: { reconcile } }) as never,
    );
    await worker.scheduled({} as ScheduledController, {
      BOOK_SOURCE_RECONCILIATION_STATE: 'enabled', BOOK_SOURCE_RECONCILIATION_SCHEDULE_STATE: 'enabled',
      BOOK_SOURCE_RECONCILIATION_ACTION_STATE: 'enabled',
    } as never, {} as ExecutionContext);
    expect(readAccountState).toHaveBeenCalledTimes(2);
    expect(findCanceledSubmission).toHaveBeenCalledOnce();
    expect(findCanceledSubmission).toHaveBeenCalledWith(fresh, new Date('2026-07-29T00:02:00.000Z'));
    expect(reconcile).toHaveBeenCalledTimes(2);
    expect(reconcile).toHaveBeenNthCalledWith(2, { actorId: 'teacher-b', bookId: 'book-b', reservationId: 'reservation-b' });
    expect(error).toHaveBeenCalledWith('book_source_reconciliation_scheduled_failure', { code: 'authority_denied' });
    error.mockRestore();
  });

  it('advances one bounded capacity page while cleanup actions remain disabled', async () => {
    const recordContinuation = vi.fn(async () => undefined);
    const clearContinuation = vi.fn(async () => undefined);
    const reconcile = vi.fn();
    const runtimeFactory = vi.fn(async () => ({
      readAccountState: async () => ({
        revision: 7,
        capacity: { trackedAccountBytes: 0, temporaryBytes: 0 },
        operations: {},
      }),
      reconciler: { reconcile },
      repository: {
        recordProviderReconciliationContinuation: recordContinuation,
        clearProviderReconciliationContinuation: clearContinuation,
      },
    }) as never);
    const capacityFetch = vi.fn()
      .mockResolvedValueOnce(Response.json({
        state: 'continue',
        continuationToken: 'sealed_cursor_1',
      }))
      .mockResolvedValueOnce(Response.json({
        state: 'complete',
        status: 'healthy',
      }));
    const worker = createBookSourceReconciliationWorker(
      vi.fn<typeof globalThis.fetch>(),
      () => new Date('2026-07-29T00:02:00.000Z'),
      { fetch: capacityFetch },
      runtimeFactory,
    );

    await worker.scheduled({} as ScheduledController, {
      BOOK_SOURCE_RECONCILIATION_STATE: 'enabled',
      BOOK_SOURCE_RECONCILIATION_SCHEDULE_STATE: 'enabled',
      BOOK_SOURCE_RECONCILIATION_ACTION_STATE: 'disabled',
      BOOK_SOURCE_CAPACITY_PROBE_STATE: 'enabled',
      BOOK_SOURCE_CAPACITY_PROBE_TOKEN: 'probe-secret',
      BOOK_SOURCE_UPLOAD_ACCOUNT_ID: 'account-1',
    } as never, {} as ExecutionContext);

    expect(capacityFetch).toHaveBeenCalledTimes(2);
    const request = capacityFetch.mock.calls[0]![0] as Request;
    expect(request.headers.get('authorization')).toBe('Bearer probe-secret');
    await expect(request.json()).resolves.toEqual({});
    expect(recordContinuation).toHaveBeenCalledWith({
      accountId: 'account-1',
      expectedRevision: 7,
      continuation: {
        token: 'sealed_cursor_1',
        updatedAt: '2026-07-29T00:02:00.000Z',
      },
    });
    expect(clearContinuation).not.toHaveBeenCalled();
    expect(reconcile).not.toHaveBeenCalled();
  });

  it('clears an expired cursor and still runs one independent cleanup unit', async () => {
    const recordContinuation = vi.fn(async () => undefined);
    const clearContinuation = vi.fn(async () => undefined);
    const reconcile = vi.fn(async () => undefined);
    const state = {
      revision: 8,
      capacity: {
        trackedAccountBytes: 0,
        temporaryBytes: 0,
        providerReconciliationContinuation: {
          token: 'expired_cursor',
          updatedAt: '2026-07-29T00:00:00.000Z',
        },
      },
      operations: {
        'reservation-a': {
          reservationId: 'reservation-a',
          bookId: 'book-a',
          sourceVersionId: 'source-a',
          sourceKey: 'main',
          ownerId: 'teacher-a',
          storageLocationId: 'location-1',
          providerKind: 'backblaze-b2-s3',
          privateBucketId: 'bucket-1',
          providerObjectKey: 'private/book-a/source-a.pdf',
          kind: 'initial' as const,
          byteSize: 1,
          originalFilename: 'a.pdf',
          expectedChecksum: { algorithm: 'sha-256' as const, value: 'a'.repeat(64) },
          createdAt: '2026-07-29T00:00:00.000Z',
          expiresAt: '2026-07-29T00:01:00.000Z',
          status: 'reserved' as const,
        },
      },
    };
    const runtimeFactory = vi.fn(async () => ({
      readAccountState: async () => state,
      reconciler: { reconcile },
      repository: {
        recordProviderReconciliationContinuation: recordContinuation,
        clearProviderReconciliationContinuation: clearContinuation,
      },
    }) as never);
    const capacityFetch = vi.fn(async () =>
      Response.json({ code: 'unavailable' }, { status: 400 }));
    const worker = createBookSourceReconciliationWorker(
      vi.fn<typeof globalThis.fetch>(),
      () => new Date('2026-07-29T00:02:00.000Z'),
      { fetch: capacityFetch },
      runtimeFactory,
    );

    await worker.scheduled({} as ScheduledController, {
      BOOK_SOURCE_RECONCILIATION_STATE: 'enabled',
      BOOK_SOURCE_RECONCILIATION_SCHEDULE_STATE: 'enabled',
      BOOK_SOURCE_RECONCILIATION_ACTION_STATE: 'enabled',
      BOOK_SOURCE_CAPACITY_PROBE_STATE: 'enabled',
      BOOK_SOURCE_CAPACITY_PROBE_TOKEN: 'probe-secret',
      BOOK_SOURCE_UPLOAD_ACCOUNT_ID: 'account-1',
    } as never, {} as ExecutionContext);

    expect(clearContinuation).toHaveBeenCalledWith({
      accountId: 'account-1',
      expectedRevision: 8,
      expectedContinuationToken: 'expired_cursor',
    });
    expect(recordContinuation).not.toHaveBeenCalled();
    expect(reconcile).toHaveBeenCalledWith({
      actorId: 'teacher-a',
      bookId: 'book-a',
      reservationId: 'reservation-a',
    });

    capacityFetch.mockResolvedValueOnce(
      Response.json({ code: 'unavailable' }, { status: 503 }),
    );
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await worker.scheduled({} as ScheduledController, {
      BOOK_SOURCE_RECONCILIATION_STATE: 'enabled',
      BOOK_SOURCE_RECONCILIATION_SCHEDULE_STATE: 'enabled',
      BOOK_SOURCE_RECONCILIATION_ACTION_STATE: 'enabled',
      BOOK_SOURCE_CAPACITY_PROBE_STATE: 'enabled',
      BOOK_SOURCE_CAPACITY_PROBE_TOKEN: 'probe-secret',
      BOOK_SOURCE_UPLOAD_ACCOUNT_ID: 'account-1',
    } as never, {} as ExecutionContext);
    expect(error).toHaveBeenCalledWith(
      'book_source_capacity_scheduled_failure',
      { code: 'capacity_probe_503' },
    );
    expect(reconcile).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });

  it('invalidates the trusted snapshot on provider authorization failure with revision and cursor CAS', async () => {
    const invalidate = vi.fn(async () => undefined);
    const state = {
      revision: 12,
      capacity: {
        trackedAccountBytes: 23,
        temporaryBytes: 0,
        providerReconciliation: {
          status: 'healthy' as const,
          totalBytes: 23,
          objectCount: 2,
          completedAt: '2026-07-29T00:01:00.000Z',
        },
        providerReconciliationContinuation: {
          token: 'sealed_cursor',
          updatedAt: '2026-07-29T00:01:30.000Z',
        },
      },
      operations: {},
    };
    const runtimeFactory = vi.fn(async () => ({
      readAccountState: async () => state,
      reconciler: { reconcile: vi.fn() },
      repository: {
        recordProviderReconciliationContinuation: vi.fn(),
        clearProviderReconciliationContinuation: vi.fn(),
        invalidateProviderReconciliation: invalidate,
      },
    }) as never);
    const capacityFetch = vi.fn(async () => new Response(
      JSON.stringify({ code: 'unavailable' }),
      {
        status: 503,
        headers: {
          'content-type': 'application/json',
          [CAPACITY_PROBE_FAILURE_HEADER]: 'unauthorized',
        },
      },
    ));
    const worker = createBookSourceReconciliationWorker(
      vi.fn<typeof globalThis.fetch>(),
      () => new Date('2026-07-29T00:02:00.000Z'),
      { fetch: capacityFetch },
      runtimeFactory,
    );

    await worker.scheduled({} as ScheduledController, {
      BOOK_SOURCE_RECONCILIATION_STATE: 'enabled',
      BOOK_SOURCE_RECONCILIATION_SCHEDULE_STATE: 'enabled',
      BOOK_SOURCE_RECONCILIATION_ACTION_STATE: 'disabled',
      BOOK_SOURCE_CAPACITY_PROBE_STATE: 'enabled',
      BOOK_SOURCE_CAPACITY_PROBE_TOKEN: 'probe-secret',
      BOOK_SOURCE_UPLOAD_ACCOUNT_ID: 'account-1',
    } as never, {} as ExecutionContext);

    expect(invalidate).toHaveBeenCalledWith({
      accountId: 'account-1',
      expectedRevision: 12,
      expectedContinuationToken: 'sealed_cursor',
    });
    expect(capacityFetch).toHaveBeenCalledTimes(1);
  });

  it('runs cleanup before capacity and does not let cleanup erase new progress', async () => {
    const reconcile = vi.fn(async () => undefined);
    const recordContinuation = vi.fn(async () => undefined);
    const state = {
      revision: 4,
      capacity: { trackedAccountBytes: 0, temporaryBytes: 0 },
      operations: {
        'reservation-a': {
          reservationId: 'reservation-a',
          bookId: 'book-a',
          sourceVersionId: 'source-a',
          sourceKey: 'main',
          ownerId: 'teacher-a',
          storageLocationId: 'location-1',
          providerKind: 'backblaze-b2-s3',
          privateBucketId: 'bucket-1',
          providerObjectKey: 'private/book-a/source-a.pdf',
          kind: 'initial' as const,
          byteSize: 1,
          originalFilename: 'a.pdf',
          expectedChecksum: { algorithm: 'sha-256' as const, value: 'a'.repeat(64) },
          createdAt: '2026-07-29T00:00:00.000Z',
          expiresAt: '2026-07-29T00:01:00.000Z',
          status: 'reserved' as const,
        },
      },
    };
    const runtimeFactory = vi.fn(async () => ({
      readAccountState: async () => state,
      reconciler: { reconcile },
      repository: {
        recordProviderReconciliationContinuation: recordContinuation,
        clearProviderReconciliationContinuation: vi.fn(),
      },
    }) as never);
    const capacityFetch = vi.fn()
      .mockResolvedValueOnce(Response.json({
        state: 'continue',
        continuationToken: 'sealed_cursor_1',
      }))
      .mockResolvedValueOnce(Response.json({
        state: 'complete',
        status: 'healthy',
      }));
    const worker = createBookSourceReconciliationWorker(
      vi.fn<typeof globalThis.fetch>(),
      () => new Date('2026-07-29T00:02:00.000Z'),
      { fetch: capacityFetch },
      runtimeFactory,
    );

    await worker.scheduled({} as ScheduledController, {
      BOOK_SOURCE_RECONCILIATION_STATE: 'enabled',
      BOOK_SOURCE_RECONCILIATION_SCHEDULE_STATE: 'enabled',
      BOOK_SOURCE_RECONCILIATION_ACTION_STATE: 'enabled',
      BOOK_SOURCE_CAPACITY_PROBE_STATE: 'enabled',
      BOOK_SOURCE_CAPACITY_PROBE_TOKEN: 'probe-secret',
      BOOK_SOURCE_UPLOAD_ACCOUNT_ID: 'account-1',
    } as never, {} as ExecutionContext);

    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(recordContinuation).toHaveBeenCalledTimes(1);
    expect(reconcile.mock.invocationCallOrder[0])
      .toBeLessThan(recordContinuation.mock.invocationCallOrder[0]!);
  });

  it('runs capacity even when cleanup runtime credentials are unavailable', async () => {
    const cleanupRuntimeFactory = vi.fn(async () => {
      throw new Error('invalid_deployment');
    });
    const recordContinuation = vi.fn(async () => undefined);
    const capacityRuntimeFactory = vi.fn(async () => ({
      readAccountState: async () => ({
        revision: 2,
        capacity: { trackedAccountBytes: 0, temporaryBytes: 0 },
        operations: {},
      }),
      repository: {
        recordProviderReconciliationContinuation: recordContinuation,
        clearProviderReconciliationContinuation: vi.fn(),
      },
    }) as never);
    const capacityFetch = vi.fn(async () => Response.json({
      state: 'complete',
      status: 'healthy',
    }));
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const worker = createBookSourceReconciliationWorker(
      vi.fn<typeof globalThis.fetch>(),
      () => new Date('2026-07-29T00:02:00.000Z'),
      { fetch: capacityFetch },
      cleanupRuntimeFactory,
      capacityRuntimeFactory,
    );

    await worker.scheduled({} as ScheduledController, {
      BOOK_SOURCE_RECONCILIATION_STATE: 'enabled',
      BOOK_SOURCE_RECONCILIATION_SCHEDULE_STATE: 'enabled',
      BOOK_SOURCE_RECONCILIATION_ACTION_STATE: 'enabled',
      BOOK_SOURCE_CAPACITY_PROBE_STATE: 'enabled',
      BOOK_SOURCE_CAPACITY_PROBE_TOKEN: 'probe-secret',
      BOOK_SOURCE_UPLOAD_ACCOUNT_ID: 'account-1',
    } as never, {} as ExecutionContext);

    expect(error).toHaveBeenCalledWith(
      'book_source_reconciliation_scheduled_failure',
      { code: 'invalid_deployment' },
    );
    expect(capacityRuntimeFactory).toHaveBeenCalledTimes(1);
    expect(capacityFetch).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });
});
