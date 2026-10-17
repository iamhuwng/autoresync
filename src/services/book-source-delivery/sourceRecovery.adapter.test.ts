import { describe, expect, it } from 'vitest';
import type {
  BookSourcePurpose,
  BookSourceStudentSafeDecision,
  BookSourceStudentSafeStatus,
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

const account = (
  ownerId = 'teacher-1',
  sourceVersionId = 'source-1',
  safety: {
    readonly purpose?: BookSourcePurpose;
    readonly studentSafeStatus?: BookSourceStudentSafeStatus;
  } = {},
): BookSourceUploadAccountState => {
  const identity = storage(sourceVersionId);
  const purpose = safety.purpose ?? 'book-source';
  const studentSafeStatus = safety.studentSafeStatus ?? 'ready';
  const studentSafeDecision: BookSourceStudentSafeDecision | undefined = studentSafeStatus === 'unreviewed'
    ? undefined
    : {
      decidedBy: ownerId,
      decidedAt: '2026-08-11T00:02:00.000Z',
      sourceVersionId,
      sha256Hex: identity.checksum.value,
      reasonCode: studentSafeStatus === 'rejected' ? 'invalid-document' : 'teacher-reviewed',
    };
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
        purpose,
        studentSafeStatus,
        ...(studentSafeDecision === undefined ? {} : { studentSafeDecision }),
        byteSize: identity.byteSize,
        physicalPageCount: 4,
        originalFilename: 'lesson.pdf',
        expectedChecksum: identity.checksum,
        createdAt: '2026-08-11T00:00:00.000Z',
        expiresAt: '2026-08-11T00:05:00.000Z',
        status: 'verified_completed',
        verifiedStorage: identity,
        completedAt: '2026-08-11T00:01:00.000Z',
      },
    },
    assemblyBooks: {
      'book-1': {
        [sourceVersionId]: {
          ownerId,
          bookId: 'book-1',
          sourceKey: 'full',
          sourceVersionId,
          checksum: identity.checksum,
          purpose,
          studentSafeStatus,
          ...(studentSafeDecision === undefined ? {} : { studentSafeDecision }),
          physicalPageCount: 4,
          verifiedUsable: true,
        },
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
      checksum: storage().checksum,
      purpose: 'book-source',
      studentSafeStatus: 'ready',
      studentSafeDecision: expect.objectContaining({ sourceVersionId: 'source-1', sha256Hex: 'a'.repeat(64) }),
      physicalPageCount: 4,
      verifiedUsable: true,
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

  it.each([
    ['rejected', { studentSafeStatus: 'rejected' as const }],
    ['student document', { purpose: 'student-document' as const }],
  ])('does not expose a %s as a usable Book source', (_label, safety) => {
    const result = validateBookSourceRecoveryAuthority({
      uploadAccounts: { 'account-1': account('teacher-1', 'source-1', safety) },
      sourceVersionIds: ['source-1'],
      availability: { 'source-1': true },
      requireUsableBookSource: true,
    });

    expect(result.missingSourceVersionIds).toEqual(['source-1']);
    expect(result.authorities.get('source-1')?.available).toBe(false);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'source-not-usable' }),
    ]));
  });

  it.each([
    ['missing projection', (value: BookSourceUploadAccountState) => {
      const { assemblyBooks: _assemblyBooks, ...withoutProjection } = value;
      return withoutProjection;
    }, 'source-projection-missing'],
    ['malformed projection', (value: BookSourceUploadAccountState) => ({
      ...value,
      assemblyBooks: { 'book-1': { 'source-1': {
        ...value.assemblyBooks?.['book-1']?.['source-1'], unexpected: true,
      } } },
    }), 'invalid-source-account'],
    ['missing checksum', (value: BookSourceUploadAccountState) => ({
      ...value,
      assemblyBooks: { 'book-1': { 'source-1': (() => {
        const { checksum: _checksum, ...withoutChecksum } = value.assemblyBooks?.['book-1']?.['source-1'] ?? {};
        return withoutChecksum;
      })() } },
    }), 'invalid-source-account'],
    ['mismatched checksum', (value: BookSourceUploadAccountState) => ({
      ...value,
      assemblyBooks: { 'book-1': { 'source-1': {
        ...value.assemblyBooks?.['book-1']?.['source-1'],
        checksum: { algorithm: 'sha-256' as const, value: 'b'.repeat(64) },
      } } },
    }), 'invalid-source-account'],
    ['mismatched projection source key', (value: BookSourceUploadAccountState) => ({
      ...value,
      assemblyBooks: { 'book-1': { 'source-1': {
        ...value.assemblyBooks?.['book-1']?.['source-1'],
        sourceKey: 'other-source',
      } } },
    }), 'invalid-source-account'],
    ['hash-mismatched authority', (value: BookSourceUploadAccountState) => ({
      ...value,
      operations: { ...value.operations, 'reservation-1': {
        ...value.operations['reservation-1'],
        studentSafeDecision: {
          ...value.operations['reservation-1'].studentSafeDecision!,
          sha256Hex: 'b'.repeat(64),
        },
      } },
    }), 'invalid-source-account'],
    ['stale authority', (value: BookSourceUploadAccountState) => ({
      ...value,
      operations: { ...value.operations, 'reservation-1': {
        ...value.operations['reservation-1'],
        studentSafeDecision: {
          ...value.operations['reservation-1'].studentSafeDecision!,
          sourceVersionId: 'other-source',
        },
      } },
    }), 'invalid-source-account'],
  ] as const)('fails closed on %s', (_label, mutate, diagnosticCode) => {
    const result = validateBookSourceRecoveryAuthority({
      uploadAccounts: { 'account-1': mutate(account()) },
      sourceVersionIds: ['source-1'],
      availability: { 'source-1': true },
      requireUsableBookSource: true,
    });

    expect(result.missingSourceVersionIds).toEqual(['source-1']);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: diagnosticCode }),
    ]));
  });
});
