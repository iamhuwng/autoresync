import { describe, expect, it } from 'vitest';
import {
  BOOK_PDF_ACCOUNT_CAPACITY_BYTES,
  MAX_SOURCE_PDF_BYTES,
  getAccountedCapacityBytes,
  getLedgerProviderTotals,
  reserveSourceCapacity,
  type CapacityLedgerEntry,
  type ReservedSourceVersionIdentity,
  type TrustedCapacityLedgerState,
} from '../src/book-source-worker/capacity-ledger';
import {
  readProviderTotalsWorkUnit,
  reconcileLedgerWithProviderTotals,
  reconcileProviderTotals,
  type ProviderReconciliationCursor,
} from '../src/book-source-worker/provider-reconciliation';

const location = { storageLocationId: 'book_b2_primary', privateBucketId: 'book-private' };
const now = new Date('2026-07-23T00:01:00.000Z');

const reservation = (suffix: string, expectedByteSize = 1): ReservedSourceVersionIdentity => ({
  sourceVersionId: `source_${suffix}`, sourceKey: `source-key-${suffix}`, ownerId: 'teacher_1', bookId: 'book_1',
  ...location, providerObjectKey: `book-source/${suffix}.pdf`, expectedByteSize,
  checksumSlot: 'unfilled', providerIdentitySlot: 'unfilled', expiresAt: '2026-07-23T00:05:00.000Z',
  revision: 0, lifecycleState: 'reserved',
});

const state = (entries: readonly CapacityLedgerEntry[] = [], providerBytes = 0, providerObjects = 0): TrustedCapacityLedgerState => ({
  revision: 7, ...location,
  providerReconciliation: { status: 'healthy', totalBytes: providerBytes, objectCount: providerObjects, completedAt: '2026-07-23T00:00:00.000Z' },
  entries,
});

class MemoryLedgerStore {
  public casCalls = 0;
  constructor(public value: TrustedCapacityLedgerState, private readonly permitCas = true) {}
  async read(): Promise<TrustedCapacityLedgerState> { return this.value; }
  async compareAndSet(input: { readonly expectedRevision: number; readonly next: TrustedCapacityLedgerState }): Promise<boolean> {
    this.casCalls += 1;
    if (!this.permitCas || input.expectedRevision !== this.value.revision) return false;
    this.value = input.next;
    return true;
  }
}

describe('trusted Book Source capacity ledger', () => {
  it('accepts exact 500 MiB source and 9 GB capacity boundary with one CAS', async () => {
    const exactSource = reservation('exact-source', MAX_SOURCE_PDF_BYTES);
    const store = new MemoryLedgerStore(state([], BOOK_PDF_ACCOUNT_CAPACITY_BYTES - MAX_SOURCE_PDF_BYTES));
    const next = await reserveSourceCapacity({ store, expectedLedgerRevision: 7, now, reservation: exactSource, category: 'pending' });
    expect(getAccountedCapacityBytes(next)).toBe(BOOK_PDF_ACCOUNT_CAPACITY_BYTES);
    expect(store.casCalls).toBe(1);
  });

  it('rejects over-500 MiB and over-9 GB before CAS', async () => {
    const sourceTooLarge = new MemoryLedgerStore(state());
    await expect(reserveSourceCapacity({
      store: sourceTooLarge, expectedLedgerRevision: 7, now, reservation: reservation('too-large', MAX_SOURCE_PDF_BYTES + 1), category: 'pending',
    })).rejects.toMatchObject({ code: 'invalid_reservation' });
    expect(sourceTooLarge.casCalls).toBe(0);
    const noRoom = new MemoryLedgerStore(state([], BOOK_PDF_ACCOUNT_CAPACITY_BYTES));
    await expect(reserveSourceCapacity({
      store: noRoom, expectedLedgerRevision: 7, now, reservation: reservation('no-room'), category: 'replacement',
    })).rejects.toMatchObject({ code: 'capacity_exceeded' });
    expect(noRoom.casCalls).toBe(0);
  });

  it('counts replacement overlap and all retained/provider categories exactly once', async () => {
    const categories = ['ready', 'pending', 'replacement', 'temporary', 'hidden', 'retained', 'delayed_deletion', 'unfinished', 'provider_reported'] as const;
    const entries = categories.map((category, index) => ({
      reservation: reservation(category, index + 1), category,
      providerReported: category !== 'pending' && category !== 'replacement' && category !== 'temporary' && category !== 'unfinished',
    }));
    const provider = getLedgerProviderTotals(entries);
    const ledger = state(entries, provider.totalBytes, provider.objectCount);
    // Existing replacement (provider reported) remains while new replacement reserves bytes.
    expect(getAccountedCapacityBytes(ledger)).toBe(categories.reduce((sum, _category, index) => sum + index + 1, 0));
    const store = new MemoryLedgerStore(ledger);
    const next = await reserveSourceCapacity({ store, expectedLedgerRevision: 7, now, reservation: reservation('replacement-next', 10), category: 'replacement' });
    expect(getAccountedCapacityBytes(next)).toBe(55);
  });

  it('allows a replacement to retain sourceKey while old provider bytes remain counted', async () => {
    const previous = reservation('previous', 100);
    const store = new MemoryLedgerStore(state([
      { reservation: previous, category: 'ready', providerReported: true },
    ], 100, 1));
    const replacement = { ...reservation('replacement', 50), sourceKey: previous.sourceKey };
    const next = await reserveSourceCapacity({
      store, expectedLedgerRevision: 7, now, reservation: replacement, category: 'replacement',
    });
    expect(next.entries.map((entry) => entry.reservation.sourceVersionId)).toEqual([
      previous.sourceVersionId, replacement.sourceVersionId,
    ]);
    expect(getAccountedCapacityBytes(next)).toBe(150);

    await expect(reserveSourceCapacity({
      store: new MemoryLedgerStore(state([{ reservation: previous, category: 'ready', providerReported: true }], 100, 1)),
      expectedLedgerRevision: 7, now, reservation: { ...reservation('initial-collision'), sourceKey: previous.sourceKey }, category: 'pending',
    })).rejects.toMatchObject({ code: 'stale_revision' });
    await expect(reserveSourceCapacity({
      store: new MemoryLedgerStore(state([{ reservation: previous, category: 'ready', providerReported: true }], 100, 1)),
      expectedLedgerRevision: 7, now, reservation: { ...reservation('other-version'), providerObjectKey: previous.providerObjectKey }, category: 'replacement',
    })).rejects.toMatchObject({ code: 'stale_revision' });
  });

  it('fails stale local retry and concurrent CAS without overwriting newer state', async () => {
    const stale = new MemoryLedgerStore(state());
    await expect(reserveSourceCapacity({ store: stale, expectedLedgerRevision: 6, now, reservation: reservation('stale'), category: 'pending' }))
      .rejects.toMatchObject({ code: 'stale_revision' });
    expect(stale.casCalls).toBe(0);
    const conflicted = new MemoryLedgerStore(state(), false);
    await expect(reserveSourceCapacity({ store: conflicted, expectedLedgerRevision: 7, now, reservation: reservation('conflict'), category: 'pending' }))
      .rejects.toMatchObject({ code: 'stale_revision' });
    expect(conflicted.value.entries).toHaveLength(0);
    expect(conflicted.casCalls).toBe(1);
  });

  it('admits only one of two simultaneous reservations at the 9 GB boundary', async () => {
    const store = new MemoryLedgerStore(state(
      [],
      BOOK_PDF_ACCOUNT_CAPACITY_BYTES - 1,
    ));
    const results = await Promise.allSettled([
      reserveSourceCapacity({
        store,
        expectedLedgerRevision: 7,
        now,
        reservation: reservation('concurrent-a'),
        category: 'pending',
      }),
      reserveSourceCapacity({
        store,
        expectedLedgerRevision: 7,
        now,
        reservation: reservation('concurrent-b'),
        category: 'pending',
      }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({
      status: 'rejected',
      reason: expect.objectContaining({ code: 'stale_revision' }),
    });
    expect(getAccountedCapacityBytes(store.value)).toBe(BOOK_PDF_ACCOUNT_CAPACITY_BYTES);
    expect(store.value.entries).toHaveLength(1);
    expect(store.casCalls).toBe(2);
  });

  it('fails closed when provider reconciliation reports drift', async () => {
    const healthy = state();
    const drift: TrustedCapacityLedgerState = {
      ...healthy,
      providerReconciliation: { ...healthy.providerReconciliation, status: 'drift' },
    };
    const store = new MemoryLedgerStore(drift);
    await expect(reserveSourceCapacity({ store, expectedLedgerRevision: 7, now, reservation: reservation('drift'), category: 'pending' }))
      .rejects.toMatchObject({ code: 'provider_drift' });
    expect(store.casCalls).toBe(0);
    const staleSnapshot = new MemoryLedgerStore(state());
    await expect(reserveSourceCapacity({
      store: staleSnapshot, expectedLedgerRevision: 7, now: new Date('2026-07-23T00:16:00.001Z'),
      reservation: {
        ...reservation('stale-snapshot'),
        expiresAt: '2026-07-23T00:20:00.000Z',
      },
      category: 'pending',
    })).rejects.toMatchObject({ code: 'provider_drift' });
    expect(staleSnapshot.casCalls).toBe(0);
  });

  it('rejects malformed ledger state, expired reservations, and invalid categories before CAS', async () => {
    const malformedEntry = {
      reservation: reservation('wrong-location'),
      category: 'invented',
      providerReported: false,
    } as never;
    const malformedStore = new MemoryLedgerStore(state([malformedEntry]));
    await expect(reserveSourceCapacity({
      store: malformedStore,
      expectedLedgerRevision: 7,
      now,
      reservation: reservation('next'),
      category: 'pending',
    })).rejects.toMatchObject({ code: 'invalid_reservation' });
    expect(malformedStore.casCalls).toBe(0);

    const expiredStore = new MemoryLedgerStore(state());
    await expect(reserveSourceCapacity({
      store: expiredStore,
      expectedLedgerRevision: 7,
      now,
      reservation: {
        ...reservation('expired'),
        expiresAt: '2026-07-23T00:00:59.999Z',
      },
      category: 'pending',
    })).rejects.toMatchObject({ code: 'invalid_reservation' });
    expect(expiredStore.casCalls).toBe(0);

    await expect(reserveSourceCapacity({
      store: new MemoryLedgerStore(state()),
      expectedLedgerRevision: 7,
      now,
      reservation: reservation('bad-category'),
      category: 'ready' as never,
    })).rejects.toMatchObject({ code: 'invalid_reservation' });
  });
});

describe('bounded provider reconciliation', () => {
  const cursor = (): ProviderReconciliationCursor => ({
    ...location,
    accumulatedBytes: 0,
    accumulatedObjectCount: 0,
    pagesRead: 0,
    seenContinuationFingerprints: [],
  });

  it('does one provider page per work unit then requires exact ledger equality', async () => {
    const calls: unknown[] = [];
    const provider = { readAccountTotalsPage: async (input: unknown) => {
      calls.push(input);
      return calls.length === 1
        ? { ...location, totalBytes: 4, objectCount: 1, continuation: 'next' }
        : { ...location, totalBytes: 6, objectCount: 1 };
    } };
    const first = await readProviderTotalsWorkUnit({ provider: provider as never, cursor: cursor(), maxPageSize: 10 });
    expect(first).toMatchObject({ state: 'continue', cursor: { accumulatedBytes: 4, pagesRead: 1, continuation: 'next' } });
    if (first.state !== 'continue') throw new Error('expected continuation');
    const complete = await readProviderTotalsWorkUnit({ provider: provider as never, cursor: first.cursor, maxPageSize: 10 });
    if (complete.state !== 'complete') throw new Error('expected completion');
    expect(complete).toEqual({ state: 'complete', totals: { totalBytes: 10, objectCount: 2 } });
    expect(calls).toHaveLength(2);
    expect(reconcileProviderTotals({ expected: { totalBytes: 10, objectCount: 2 }, observed: complete.totals, completedAt: '2026-07-23T00:00:00.000Z' }).status).toBe('healthy');
    expect(reconcileProviderTotals({ expected: { totalBytes: 9, objectCount: 2 }, observed: complete.totals, completedAt: '2026-07-23T00:00:00.000Z' }).status).toBe('drift');
    expect(reconcileLedgerWithProviderTotals({
      entries: [{ reservation: reservation('provider-entry', 10), category: 'ready', providerReported: true }],
      observed: complete.totals, completedAt: '2026-07-23T00:00:00.000Z',
    }).status).toBe('drift');
  });

  it('fails closed for cross-location totals, continuation loops, and bounded work', async () => {
    const badLocation = { readAccountTotalsPage: async () => ({ ...location, privateBucketId: 'other', totalBytes: 1, objectCount: 1 }) };
    await expect(readProviderTotalsWorkUnit({ provider: badLocation as never, cursor: cursor() })).rejects.toMatchObject({ code: 'provider_drift' });
    const loop = { readAccountTotalsPage: async () => ({
      ...location,
      totalBytes: 1,
      objectCount: 1,
      continuation: 'seen',
    }) };
    const firstLoopPage = await readProviderTotalsWorkUnit({
      provider: loop as never,
      cursor: cursor(),
    });
    if (firstLoopPage.state !== 'continue') throw new Error('expected continuation');
    await expect(readProviderTotalsWorkUnit({
      provider: loop as never,
      cursor: firstLoopPage.cursor,
    })).rejects.toMatchObject({ code: 'provider_drift' });
    await expect(readProviderTotalsWorkUnit({
      provider: loop as never,
      cursor: {
        ...cursor(),
        continuation: 'token-255',
        pagesRead: 256,
        seenContinuationFingerprints: Array.from({ length: 256 }, (_, index) =>
          index.toString(16).padStart(64, '0')),
      },
    }))
      .rejects.toMatchObject({ code: 'reconciliation_bound_exceeded' });
    let arbitraryCursorCalls = 0;
    const arbitraryCursorProvider = {
      readAccountTotalsPage: async () => {
        arbitraryCursorCalls += 1;
        return { ...location, totalBytes: 0, objectCount: 0 };
      },
    };
    await expect(readProviderTotalsWorkUnit({
      provider: arbitraryCursorProvider as never,
      cursor: { ...cursor(), continuation: 'skip-to-middle' },
    })).rejects.toMatchObject({ code: 'reconciliation_bound_exceeded' });
    expect(arbitraryCursorCalls).toBe(0);
    expect(() => reconcileProviderTotals({
      expected: { totalBytes: 0, objectCount: 0 },
      observed: { totalBytes: 0, objectCount: 0 },
      completedAt: '2026-07-23T00:00:00Z',
    })).toThrow();
  });
});
