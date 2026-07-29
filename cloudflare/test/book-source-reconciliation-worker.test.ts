import { describe, expect, it, vi } from 'vitest';

import { createBookSourceReconciliationWorker } from '../src/book-source-worker/reconciliation-worker';

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
});
