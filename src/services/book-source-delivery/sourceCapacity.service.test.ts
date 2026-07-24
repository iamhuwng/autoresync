import { describe, expect, it } from 'vitest';

import { BOOK_SOURCE_ACCOUNT_CAPACITY_BYTES, BOOK_SOURCE_MAX_PDF_BYTES } from '../../types/bookSource.types';
import {
  assertBookSourceCapacityAvailable,
  assertBookSourcePdfByteSize,
  calculateBookSourceCapacityUsage,
  totalBookSourceCapacityBytes,
} from './sourceCapacity.service';

describe('Book Source capacity domain', () => {
  it('accepts exactly 500 MiB and rejects one byte more', () => {
    expect(() => assertBookSourcePdfByteSize(BOOK_SOURCE_MAX_PDF_BYTES)).not.toThrow();
    expect(() => assertBookSourcePdfByteSize(BOOK_SOURCE_MAX_PDF_BYTES + 1)).toThrow();
  });

  it('accounts for tracked, pending, replacement, and temporary bytes at 9 GB boundary', () => {
    const usage = calculateBookSourceCapacityUsage({
      trackedAccountBytes: BOOK_SOURCE_ACCOUNT_CAPACITY_BYTES - 100,
      temporaryBytes: 10,
      operations: {
        pending: operation('pending', 'initial', 40),
        replacement: operation('replacement', 'replacement', 50),
        completed: operation('completed', 'initial', 500, 'verified_completed'),
      },
    });
    expect(usage).toMatchObject({ trackedAccountBytes: BOOK_SOURCE_ACCOUNT_CAPACITY_BYTES - 100, pendingUploadBytes: 40, replacementUploadBytes: 50, temporaryBytes: 10 });
    expect(totalBookSourceCapacityBytes(usage)).toBe(BOOK_SOURCE_ACCOUNT_CAPACITY_BYTES);
    expect(() => assertBookSourceCapacityAvailable(usage)).not.toThrow();
    expect(() => assertBookSourceCapacityAvailable({ ...usage, temporaryBytes: 11 })).toThrow();
  });
});

function operation(reservationId: string, kind: 'initial' | 'replacement', byteSize: number, status: 'reserved' | 'verified_completed' = 'reserved') {
  return {
    reservationId, bookId: 'book-1', sourceVersionId: `source-${reservationId}`, sourceKey: 'unit-1', ownerId: 'teacher-1', storageLocationId: 'location-1',
    providerKind: 'b2', privateBucketId: 'bucket-1', providerObjectKey: `private/${reservationId}.pdf`, kind, byteSize,
    originalFilename: 'source.pdf', expectedChecksum: { algorithm: 'sha-256' as const, value: 'a'.repeat(64) }, createdAt: '2026-07-23T00:00:00.000Z', expiresAt: '2026-07-23T00:05:00.000Z', status,
  };
}
