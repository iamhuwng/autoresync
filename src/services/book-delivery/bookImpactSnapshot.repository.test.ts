import { describe, expect, it, vi } from 'vitest';
import { createBookImpactSnapshotReadHandler } from '../../../cloudflare/src/upload-worker/book-updates/impact-snapshot-read';
import {
  BOOK_IMPACT_SNAPSHOT_ROOT,
  FirebaseRestBookImpactSnapshotRepository,
} from '../../../cloudflare/src/upload-worker/book-updates/impact-snapshot-repository';
import type { BookImpactSnapshot } from './bookImpactSnapshot.types';

const snapshot = (overrides: Partial<BookImpactSnapshot> = {}): BookImpactSnapshot => ({
  schemaVersion: 1,
  snapshotId: 'snapshot-1',
  actorId: 'teacher-1',
  ownerId: 'teacher-1',
  bookId: 'book-1',
  inputFingerprint: 'a'.repeat(64),
  immutableInputs: {
    oldActivityVersionId: 'activity-v1', newActivityVersionId: 'activity-v2',
    oldActivityFingerprint: 'a'.repeat(64), newActivityFingerprint: 'b'.repeat(64),
    placementFingerprint: 'c'.repeat(64), manifestFingerprint: 'd'.repeat(64),
    sourceFingerprint: 'e'.repeat(64), scheduleFingerprint: 'f'.repeat(64),
  },
  adapters: [],
  contexts: [],
  createdAt: '2026-08-10T00:00:00.000Z',
  expiresAt: '2026-08-10T00:15:00.000Z',
  recovery: {
    backupInventory: 'include-metadata', restoreBehavior: 'retain-read-only',
    expiryBehavior: 'retain-audit-deny-reuse', sideEffectsOnReplay: 'none',
    recoveryLedgerRoot: 'book_impact_snapshot_recovery',
  },
  ...overrides,
});

const env = {
  FIREBASE_DB_URL: 'https://example.firebaseio.test',
  BOOK_IMPACT_SNAPSHOT_SERVICE_IDENTITY: 'snapshot@example.iam.gserviceaccount.com',
  BOOK_IMPACT_SNAPSHOT_GOOGLE_SA_KEY: JSON.stringify({
    client_email: 'snapshot@example.iam.gserviceaccount.com',
  }),
};

describe('#108 Firebase snapshot repository', () => {
  it('atomically persists the immutable record, current pointer, and bounded book index', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('null', { status: 200, headers: { etag: 'root-v1' } }))
      .mockResolvedValueOnce(new Response('null', { status: 200 }));
    const repository = new FirebaseRestBookImpactSnapshotRepository({
      env,
      fetchImpl,
      getAccessToken: async () => 'service-token',
    });

    await expect(repository.save(snapshot())).resolves.toMatchObject({ status: 'created' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(`https://example.firebaseio.test/${BOOK_IMPACT_SNAPSHOT_ROOT}.json`);
    const write = fetchImpl.mock.calls[1]?.[1];
    expect(write).toMatchObject({ method: 'PUT', headers: expect.objectContaining({ 'if-match': 'root-v1' }) });
    const body = JSON.parse(String(write?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      records: { 'teacher-1': { 'snapshot-1': { ownerId: 'teacher-1', bookId: 'book-1' } } },
      current: { 'teacher-1': { 'book-1': { snapshotId: 'snapshot-1' } } },
      indexes: { by_book: { 'teacher-1': { 'book-1': { 'snapshot-1': { snapshotId: 'snapshot-1' } } } } },
    });
  });

  it('denies a persisted record whose ownership does not match the authenticated actor path', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(Response.json({ snapshotId: 'snapshot-1' }))
      .mockResolvedValueOnce(Response.json(snapshot({ actorId: 'teacher-2', ownerId: 'teacher-2' })));
    const repository = new FirebaseRestBookImpactSnapshotRepository({
      env,
      fetchImpl,
      getAccessToken: async () => 'service-token',
    });

    await expect(repository.readCurrent({
      actorId: 'teacher-1', bookId: 'book-1', now: '2026-08-10T00:05:00.000Z',
    })).resolves.toEqual({ status: 'denied' });
    expect(fetchImpl.mock.calls.every((call) => call[1]?.method === 'GET')).toBe(true);
  });
});

describe('#108 snapshot read handler', () => {
  it.each([
    ['denied', 403],
    ['missing', 404],
    ['stale', 409],
    ['expired', 410],
  ] as const)('maps %s repository outcomes without mutation', async (status, expectedStatus) => {
    const result = status === 'stale'
      ? { status, snapshotId: 'snapshot-1' } as const
      : status === 'expired'
        ? { status, snapshotId: 'snapshot-1', expiresAt: '2026-08-10T00:15:00.000Z' } as const
        : { status } as const;
    const repository = { save: vi.fn(), readCurrent: vi.fn(async () => result) };
    const handler = createBookImpactSnapshotReadHandler({
      repository,
      now: () => new Date('2026-08-10T00:05:00.000Z'),
    });

    const response = await handler({
      request: new Request('https://worker.test/book-impact/snapshots/book-1'),
      uid: 'teacher-1',
      params: { bookId: 'book-1' },
    });
    expect(response.status).toBe(expectedStatus);
    expect(repository.save).not.toHaveBeenCalled();
  });
});
