import { describe, expect, it } from 'vitest';
import type {
  BookSourceUploadAccountState,
  BookSourceVersionStorageIdentity,
} from '../../types/bookSource.types';
import {
  validateBookSourceRecoveryAuthority,
} from './sourceRecovery.adapter';

const storage = (sourceVersionId = 'source-1'): BookSourceVersionStorageIdentity => ({
  bookId: 'book-1',
  sourceVersionId,
  storageLocationId: 'location-1',
  providerKind: 'b2',
  privateBucketId: 'bucket-1',
  providerObjectKey: `private/book-1/${sourceVersionId}.pdf`,
  providerFileId: 'file-1',
  providerFileVersionId: 'version-1',
  checksum: { algorithm: 'sha-256', value: 'a'.repeat(64) },
  byteSize: 10,
});

const account = (ownerId = 'teacher-1', sourceVersionId = 'source-1'): BookSourceUploadAccountState => {
  const identity = storage(sourceVersionId);
  return {
    revision: 1,
    capacity: {
      trackedAccountBytes: 10,
      temporaryBytes: 0,
      providerReconciliation: {
        status: 'healthy',
        totalBytes: 10,
        objectCount: 1,
        completedAt: '2026-08-11T00:01:00.000Z',
      },
    },
    operations: {
      'reservation-1': {
        reservationId: 'reservation-1',
        bookId: 'book-1',
        sourceVersionId,
        sourceKey: 'full',
        ownerId,
        storageLocationId: identity.storageLocationId,
        providerKind: identity.providerKind,
        privateBucketId: identity.privateBucketId,
        providerObjectKey: identity.providerObjectKey,
        kind: 'initial',
        byteSize: identity.byteSize,
        originalFilename: 'lesson.pdf',
        expectedChecksum: identity.checksum,
        createdAt: '2026-08-11T00:00:00.000Z',
        expiresAt: '2026-08-11T00:05:00.000Z',
        status: 'verified_completed',
        verifiedStorage: identity,
        completedAt: '2026-08-11T00:01:00.000Z',
      },
    },
  };
};

describe('Book Source recovery authority', () => {
  it('requires explicit availability and preserves the exact canonical identity', () => {
    const input = {
      uploadAccounts: { 'account-1': account() },
      sourceVersionIds: ['source-1'],
      availability: { 'source-1': { available: true, identity: storage() } },
    };
    const result = validateBookSourceRecoveryAuthority(input);

    expect(result.missingSourceVersionIds).toEqual([]);
    expect(result.diagnostics).toEqual([]);
    expect(result.authorities.get('source-1')).toMatchObject({
      accountId: 'account-1',
      reservationId: 'reservation-1',
      sourceKey: 'full',
      available: true,
      storage: storage(),
    });
  });

  it.each([
    ['missing proof', undefined, 'availability-proof-missing'],
    ['false proof', { 'source-1': false }, 'availability-proof-false'],
    ['mismatched proof', { 'source-1': { available: true, identity: storage('other-source') } }, 'source-identity-mismatch'],
  ] as const)('keeps %s unavailable without provider work', (_label, availability, code) => {
    const result = validateBookSourceRecoveryAuthority({
      uploadAccounts: { 'account-1': account() },
      sourceVersionIds: ['source-1'],
      availability,
    });

    expect(result.missingSourceVersionIds).toEqual(['source-1']);
    expect(result.authorities.get('source-1')?.available).toBe(false);
    expect(result.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code })]));
  });

  it('denies an unauthorized owner and an approved replacement deletion', () => {
    const ownerMismatch = validateBookSourceRecoveryAuthority({
      uploadAccounts: { 'account-1': account('other-teacher') },
      sourceVersionIds: ['source-1'],
      expectedOwnerId: 'teacher-1',
      availability: { 'source-1': true },
    });
    expect(ownerMismatch.missingSourceVersionIds).toEqual(['source-1']);
    expect(ownerMismatch.authorities.get('source-1')?.available).toBe(false);
    expect(ownerMismatch.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'source-owner-mismatch' }),
      expect.objectContaining({ code: 'source-version-unavailable' }),
    ]));

    const approvedDeletion = validateBookSourceRecoveryAuthority({
      uploadAccounts: { 'account-1': account() },
      retiredByteDeletions: {
        'deletion-1': {
          sourceVersionId: 'source-1',
          state: 'settled',
          deleteIdentity: {
            kind: 'retired-byte-exact-version',
            serviceIdentity: 'book_retired_byte_deletion_service',
          },
          recovery: { metadataOnly: true, rollbackAfterBoundary: 'not-available' },
        },
      },
      sourceVersionIds: ['source-1'],
      availability: { 'source-1': true },
    });
    expect(approvedDeletion.missingSourceVersionIds).toEqual(['source-1']);
    expect(approvedDeletion.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'source-version-approved-removed' }),
    ]));
  });
});
