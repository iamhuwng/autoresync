import { describe, expect, it } from 'vitest';

import { BOOK_SOURCE_ACCOUNT_CAPACITY_BYTES, BOOK_SOURCE_MAX_PDF_BYTES, type BookSourceUploadAccountState } from '../../types/bookSource.types';
import type { SourceUploadRtdbTransaction } from './sourceUpload.firebaseRtdbTransaction';
import {
  SourceUploadRtdbRepository,
  getBookSourceUploadProviderTotals,
} from './sourceUpload.rtdbRepository';

describe('SourceUploadRtdbRepository', () => {
  it('uses compare-and-set and keeps reservation identity immutable across stale retries', async () => {
    const memory = createMemoryTransaction();
    const repository = createRepository(memory.transaction);
    const first = await repository.reserve(reservation());
    expect(first.revision).toBe(1);
    expect(first.operations['reservation-1']?.originalFilename).toBe('lesson.pdf');
    await expect(repository.reserve(reservation({ expectedRevision: 0 }))).rejects.toThrow('compare-and-set conflict');
    const retry = await repository.reserve(reservation({ expectedRevision: 1 }));
    expect(retry).toBe(first);
    await expect(repository.reserve(reservation({ expectedRevision: 1, sourceVersionId: 'source-retargeted' }))).rejects.toThrow('reservation identity is immutable');
    await expect(repository.reserve(reservation({ expectedRevision: 1, providerObjectKey: 'private/book-1/retargeted.pdf' }))).rejects.toThrow('reservation identity is immutable');
    await expect(repository.reserve(reservation({
      expectedRevision: 1, reservationId: 'reservation-2', providerObjectKey: 'private/book-1/source-2.pdf',
    }))).rejects.toThrow('sourceVersionId is already reserved');
    await expect(repository.reserve(reservation({
      expectedRevision: 1, reservationId: 'reservation-2', sourceVersionId: 'source-2',
    }))).rejects.toThrow('providerObjectKey is already reserved');
    await expect(repository.reserve(reservation({
      expectedRevision: 1,
      reservationId: 'reservation-2',
      sourceVersionId: 'source-2',
      providerObjectKey: 'private/book-1/source-2.pdf',
    }))).rejects.toThrow('sourceKey is already reserved');
    const replacement = await repository.reserve(reservation({
      expectedRevision: 1, reservationId: 'reservation-2', sourceVersionId: 'source-2', providerObjectKey: 'private/book-1/source-2.pdf', kind: 'replacement',
    }));
    expect(replacement.operations['reservation-2']).toMatchObject({ sourceKey: 'unit-1', kind: 'replacement' });
  });

  it('allows exact 500 MiB / 9 GB reservation, rejects overflow, and counts replacement overlap', async () => {
    const memory = createMemoryTransaction({
      trackedAccountBytes: BOOK_SOURCE_ACCOUNT_CAPACITY_BYTES - BOOK_SOURCE_MAX_PDF_BYTES,
      temporaryBytes: 0,
    });
    const repository = createRepository(memory.transaction);
    const state = await repository.reserve(reservation({
      byteSize: BOOK_SOURCE_MAX_PDF_BYTES,
    }));
    expect(state.operations['reservation-1']?.status).toBe('reserved');
    await expect(repository.reserve(reservation({
      expectedRevision: 1, reservationId: 'replacement-1', sourceVersionId: 'source-2', providerObjectKey: 'private/book-1/source-2.pdf', kind: 'replacement', byteSize: 1,
    }))).rejects.toThrow('capacity exceeds');
  });

  it('promotes only trusted matching completion and preserves old replacement bytes until completion', async () => {
    const memory = createMemoryTransaction({
      trackedAccountBytes: 80,
      temporaryBytes: 10,
    });
    const repository = createRepository(memory.transaction);
    const reserved = await repository.reserve(reservation({ kind: 'replacement', byteSize: 10 }));
    expect(reserved.capacity.trackedAccountBytes).toBe(80);
    await expect(repository.completeVerified({
      accountId: 'account-1', expectedRevision: 1, reservationId: 'reservation-1', verifiedAt: '2026-07-23T00:01:00.000Z',
      verifiedStorage: storage({ byteSize: 9 }),
    })).rejects.toThrow('trusted completion does not match');
    const completed = await repository.completeVerified({
      accountId: 'account-1', expectedRevision: 1, reservationId: 'reservation-1', verifiedAt: '2026-07-23T00:01:00.000Z', verifiedStorage: storage(),
    });
    expect(completed.capacity.trackedAccountBytes).toBe(90);
    expect(completed.operations['reservation-1']).toMatchObject({ status: 'verified_completed', verifiedStorage: storage() });
    await expect(repository.completeVerified({
      accountId: 'account-1',
      expectedRevision: 2,
      reservationId: 'reservation-1',
      verifiedAt: '2026-07-23T00:01:00.000Z',
      verifiedStorage: storage({ privateBucketId: 'other-bucket' }),
    })).rejects.toThrow('verified completion identity is immutable');
  });

  it('derives provider totals only from canonical verified operations', async () => {
    const memory = createMemoryTransaction();
    const repository = createRepository(memory.transaction);
    await repository.reserve(reservation());
    const completed = await repository.completeVerified({
      accountId: 'account-1',
      expectedRevision: 1,
      reservationId: 'reservation-1',
      verifiedAt: '2026-07-23T00:01:00.000Z',
      verifiedStorage: storage(),
    });
    expect(getBookSourceUploadProviderTotals(completed)).toEqual({
      totalBytes: 10,
      objectCount: 1,
    });
    expect(() => getBookSourceUploadProviderTotals({
      ...completed,
      capacity: { trackedAccountBytes: 9, temporaryBytes: 0 },
    })).toThrow('tracked provider bytes do not match verified operations');
  });

  it('rejects malformed persisted state and map-key identity before mutation', async () => {
    const memory = createMemoryTransaction();
    const repository = createRepository(memory.transaction);
    const first = await repository.reserve(reservation());
    memory.setState({
      ...first,
      operations: {
        'poisoned-map-key': first.operations['reservation-1']!,
      },
    });
    await expect(repository.reserve(reservation({
      expectedRevision: 1,
      reservationId: 'reservation-2',
      sourceVersionId: 'source-2',
      providerObjectKey: 'private/book-1/source-2.pdf',
    }))).rejects.toThrow('operation identity is inconsistent');
  });

  it('uses trusted time and rejects RTDB-forbidden account/reservation keys', async () => {
    const memory = createMemoryTransaction();
    const repository = createRepository(memory.transaction);
    await expect(repository.reserve(reservation({
      expiresAt: '2026-07-22T23:59:59.999Z',
    }))).rejects.toThrow('expiresAt must be valid');
    await expect(repository.reserve(reservation({ accountId: 'account.bad' })))
      .rejects.toThrow('accountId must be a nonempty RTDB-safe key');
    await expect(repository.reserve(reservation({ reservationId: 'reservation#bad' })))
      .rejects.toThrow('reservationId must be a nonempty RTDB-safe key');
  });

  it('requires trusted provisioning and rejects completion after reservation expiry', async () => {
    const unprovisioned = createMemoryTransaction(null);
    await expect(createRepository(unprovisioned.transaction).reserve(reservation()))
      .rejects.toThrow('must be provisioned from trusted provider reconciliation');

    const memory = createMemoryTransaction();
    await createRepository(memory.transaction).reserve(reservation());
    await expect(createRepository(
      memory.transaction,
      () => new Date('2026-07-23T00:05:00.001Z'),
    ).completeVerified({
      accountId: 'account-1',
      expectedRevision: 1,
      reservationId: 'reservation-1',
      verifiedAt: '2026-07-23T00:04:59.999Z',
      verifiedStorage: storage(),
    })).rejects.toThrow('within the reservation window');
  });

  it('rechecks trusted time inside CAS and rejects exact-expiry, future, and pre-reservation completion', async () => {
    let reads = 0;
    const delayedMemory = createMemoryTransaction();
    await expect(createRepository(delayedMemory.transaction, () => new Date(
      reads++ === 0 ? '2026-07-23T00:00:00.000Z' : '2026-07-23T00:05:00.000Z',
    )).reserve(reservation())).rejects.toThrow('expiresAt must be valid');

    const memory = createMemoryTransaction();
    await createRepository(memory.transaction).reserve(reservation());
    const exactExpiryRepository = createRepository(
      memory.transaction,
      () => new Date('2026-07-23T00:05:00.000Z'),
    );
    await expect(exactExpiryRepository.completeVerified({
      accountId: 'account-1',
      expectedRevision: 1,
      reservationId: 'reservation-1',
      verifiedAt: '2026-07-23T00:05:00.000Z',
      verifiedStorage: storage(),
    })).rejects.toThrow('within the reservation window');

    const activeRepository = createRepository(
      memory.transaction,
      () => new Date('2026-07-23T00:01:00.000Z'),
    );
    for (const verifiedAt of [
      '2026-07-23T00:01:00.001Z',
      '2026-07-22T23:59:59.999Z',
    ]) {
      await expect(activeRepository.completeVerified({
        accountId: 'account-1',
        expectedRevision: 1,
        reservationId: 'reservation-1',
        verifiedAt,
        verifiedStorage: storage(),
      })).rejects.toThrow('within the reservation window');
    }
  });

  it('fails closed on an invalid trusted clock and persisted completion outside its reservation window', async () => {
    const memory = createMemoryTransaction();
    await expect(createRepository(memory.transaction, () => new Date(Number.NaN)).reserve(reservation()))
      .rejects.toThrow('expectedRevision, createdAt, and expiresAt must be valid');

    const valid = createMemoryTransaction();
    await createRepository(valid.transaction).reserve(reservation());
    const completed = await createRepository(valid.transaction).completeVerified({
      accountId: 'account-1',
      expectedRevision: 1,
      reservationId: 'reservation-1',
      verifiedAt: '2026-07-23T00:01:00.000Z',
      verifiedStorage: storage(),
    });
    valid.setState({
      ...completed,
      operations: {
        ...completed.operations,
        'reservation-1': {
          ...completed.operations['reservation-1']!,
          completedAt: '2026-07-23T00:06:00.000Z',
        },
      },
    });
    await expect(createRepository(valid.transaction).reserve(reservation({
      expectedRevision: completed.revision,
      reservationId: 'reservation-2',
      sourceVersionId: 'source-2',
      sourceKey: 'unit-2',
      providerObjectKey: 'private/book-1/source-2.pdf',
    }))).rejects.toThrow('outside the reservation window');
  });

  it('normalizes Firebase omission of an empty operations map', async () => {
    const memory = createMemoryTransaction();
    memory.setState({
      revision: 0,
      capacity: { trackedAccountBytes: 0, temporaryBytes: 0 },
    } as BookSourceUploadAccountState);
    const state = await createRepository(memory.transaction).reserve(reservation());
    expect(state.operations['reservation-1']?.status).toBe('reserved');
  });
});

function reservation(overrides: Partial<Parameters<SourceUploadRtdbRepository['reserve']>[0]> = {}) {
  return {
    accountId: 'account-1', expectedRevision: 0, reservationId: 'reservation-1', bookId: 'book-1', sourceVersionId: 'source-1', sourceKey: 'unit-1', ownerId: 'teacher-1', storageLocationId: 'location-1',
    providerKind: 'b2', privateBucketId: 'bucket-1', providerObjectKey: 'private/book-1/source-1.pdf', kind: 'initial' as const, byteSize: 10, originalFilename: '  lesson.PDF ',
    expectedChecksum: { algorithm: 'sha-256' as const, value: 'a'.repeat(64) }, createdAt: '2026-07-23T00:00:00.000Z', expiresAt: '2026-07-23T00:05:00.000Z', ...overrides,
  };
}

function storage(overrides: Record<string, unknown> = {}) {
  return {
    bookId: 'book-1', sourceVersionId: 'source-1', storageLocationId: 'location-1', providerKind: 'b2', privateBucketId: 'bucket-1', providerObjectKey: 'private/book-1/source-1.pdf',
    providerFileId: 'file-1', providerFileVersionId: 'version-1', checksum: { algorithm: 'sha-256' as const, value: 'a'.repeat(64) }, byteSize: 10, ...overrides,
  };
}

function createMemoryTransaction(
  initialCapacity: { readonly trackedAccountBytes: number; readonly temporaryBytes: number } | null
    = { trackedAccountBytes: 0, temporaryBytes: 0 },
): {
  transaction: SourceUploadRtdbTransaction;
  setState(value: BookSourceUploadAccountState): void;
} {
  let state: BookSourceUploadAccountState | null = initialCapacity === null ? null : {
    revision: 0,
    capacity: initialCapacity,
    operations: {},
  };
  return {
    setState: (value) => { state = value; },
    transaction: async ({ expectedRevision, update }) => {
      if ((state?.revision ?? 0) !== expectedRevision) return { committed: false, value: state };
      const next = update(state);
      if (next === undefined) return { committed: false, value: state };
      state = next as BookSourceUploadAccountState;
      return { committed: true, value: state };
    },
  };
}

function createRepository(
  transaction: SourceUploadRtdbTransaction,
  now: () => Date = () => new Date('2026-07-23T00:01:00.000Z'),
): SourceUploadRtdbRepository {
  return new SourceUploadRtdbRepository(transaction, {
    now,
  });
}
