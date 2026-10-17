import { describe, expect, it, vi } from 'vitest';
import { createBookImpactSnapshotBrowserClient } from './bookImpactSnapshot.browser';
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

describe('Book impact snapshot browser projection', () => {
  it('reads through the fixed Worker route and enforces owner, fingerprint, and TTL locally', async () => {
    const fetchImpl = vi.fn(async () => Response.json(snapshot()));
    const client = createBookImpactSnapshotBrowserClient({
      getIdToken: async () => 'token', fetchImpl,
    });
    await expect(client.readCurrent({
      actorId: 'teacher-1', bookId: 'book-1', expectedFingerprint: 'a'.repeat(64),
      now: '2026-08-10T00:10:00.000Z',
    })).resolves.toMatchObject({ status: 'ready' });
    expect(fetchImpl).toHaveBeenCalledWith(
      `/book-impact/snapshots/book-1?fingerprint=${'a'.repeat(64)}`,
      expect.objectContaining({ method: 'GET', headers: { Authorization: 'Bearer token' } }),
    );

    vi.mocked(fetchImpl).mockResolvedValueOnce(Response.json(snapshot({ ownerId: 'teacher-2' })));
    await expect(client.readCurrent({ actorId: 'teacher-1', bookId: 'book-1' }))
      .resolves.toEqual({ status: 'denied' });

    vi.mocked(fetchImpl).mockResolvedValueOnce(Response.json(snapshot()));
    await expect(client.readCurrent({
      actorId: 'teacher-1', bookId: 'book-1', expectedFingerprint: 'b'.repeat(64),
    })).resolves.toEqual({ status: 'stale', snapshotId: 'snapshot-1' });

    vi.mocked(fetchImpl).mockResolvedValueOnce(Response.json(snapshot()));
    await expect(client.readCurrent({
      actorId: 'teacher-1', bookId: 'book-1', now: '2026-08-10T00:15:00.000Z',
    })).resolves.toEqual({
      status: 'expired', snapshotId: 'snapshot-1', expiresAt: '2026-08-10T00:15:00.000Z',
    });
  });

  it('maps denial and absence without attempting a write', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    const client = createBookImpactSnapshotBrowserClient({ getIdToken: async () => 'token', fetchImpl });
    await expect(client.readCurrent({ actorId: 'teacher-1', bookId: 'book-1' }))
      .resolves.toEqual({ status: 'denied' });
    await expect(client.readCurrent({ actorId: 'teacher-1', bookId: 'book-1' }))
      .resolves.toEqual({ status: 'missing' });
    expect(fetchImpl.mock.calls.every((call) => call[1]?.method === 'GET')).toBe(true);
  });

  it('preserves stale and expired Worker responses for teacher refresh handling', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(Response.json(
        { status: 'stale', snapshotId: 'snapshot-1' },
        { status: 409 },
      ))
      .mockResolvedValueOnce(Response.json(
        { status: 'expired', snapshotId: 'snapshot-1', expiresAt: '2026-08-10T00:15:00.000Z' },
        { status: 410 },
      ));
    const client = createBookImpactSnapshotBrowserClient({ getIdToken: async () => 'token', fetchImpl });

    await expect(client.readCurrent({ actorId: 'teacher-1', bookId: 'book-1' }))
      .resolves.toEqual({ status: 'stale', snapshotId: 'snapshot-1' });
    await expect(client.readCurrent({ actorId: 'teacher-1', bookId: 'book-1' }))
      .resolves.toEqual({
        status: 'expired', snapshotId: 'snapshot-1', expiresAt: '2026-08-10T00:15:00.000Z',
      });
  });
});
