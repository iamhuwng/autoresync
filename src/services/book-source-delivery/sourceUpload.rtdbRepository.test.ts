import { describe, expect, it } from 'vitest';

import {
  BOOK_SOURCE_ACCOUNT_CAPACITY_BYTES,
  BOOK_SOURCE_MAX_PDF_BYTES,
  BOOK_SOURCE_PROVIDER_RECONCILIATION_MAX_AGE_MS,
  type BookSourceUploadAccountState,
  type CanceledSubmissionRetirementGuard,
  type PublicationRetirementGuard,
} from '../../types/bookSource.types';
import type { SourceUploadRtdbTransaction } from './sourceUpload.firebaseRtdbTransaction';
import {
  SourceUploadRtdbRepository,
  getBookSourceUploadProviderTotals,
  validateBookSourceUploadAccountState,
} from './sourceUpload.rtdbRepository';

describe('SourceUploadRtdbRepository', () => {
  it('persists canceled submission scan progress without changing domain state and preserves it across writes', async () => {
    const memory = createMemoryTransaction();
    const repository = createRepository(memory.transaction);
    const initial = memory.getState()!;
    const scanned = await repository.advanceCanceledSubmissionScan({
      accountId: 'account-1', expectedRevision: initial.revision, afterReservationId: 'reservation-1',
    });
    expect(scanned).toMatchObject({ revision: initial.revision, canceledSubmissionScanAfterReservationId: 'reservation-1' });
    expect(scanned.capacity).toBe(initial.capacity);
    expect(scanned.operations).toBe(initial.operations);
    expect(validateBookSourceUploadAccountState(scanned)).toBe(scanned);
    await expect(repository.advanceCanceledSubmissionScan({
      accountId: 'account-1', expectedRevision: scanned.revision, afterReservationId: '',
    })).rejects.toThrow('afterReservationId');
    const progressed = await repository.recordProviderReconciliationContinuation({
      accountId: 'account-1', expectedRevision: scanned.revision,
      continuation: { token: 'cursor-1', updatedAt: '2026-07-23T00:01:00.000Z' },
    });
    expect(progressed.canceledSubmissionScanAfterReservationId).toBe('reservation-1');
    const reserved = await repository.reserve(reservation());
    expect(reserved.canceledSubmissionScanAfterReservationId).toBe('reservation-1');
    await expect(repository.advanceCanceledSubmissionScan({
      accountId: 'account-1', expectedRevision: scanned.revision, afterReservationId: 'reservation-2',
    })).rejects.toThrow('compare-and-set conflict');
    const advanced = await repository.advanceCanceledSubmissionScan({
      accountId: 'account-1', expectedRevision: reserved.revision, afterReservationId: 'reservation-2',
    });
    expect(advanced.revision).toBe(reserved.revision);
    expect(advanced.canceledSubmissionScanAfterReservationId).toBe('reservation-2');
    expect(advanced.capacity).toBe(reserved.capacity);
    expect(advanced.operations).toBe(reserved.operations);
    expect(() => validateBookSourceUploadAccountState({ ...advanced, canceledSubmissionScanAfterReservationId: '' }))
      .toThrow('canceledSubmissionScanAfterReservationId');
  });

  it('fences only the exact canceled submission and keeps generic cleanup away from verified sources', async () => {
    const { memory, repository, completed, fenceInput } = await canceledSubmissionSource();
    const cleanupInput = {
      accountId: 'account-1', expectedRevision: completed.revision, reservationId: 'reservation-1',
      ownerId: 'teacher-1', reason: 'cancel_requested' as const, requestedAt: '2026-07-23T00:02:00.000Z',
    };
    await expect(repository.requestCleanup(cleanupInput)).rejects.toThrow('verified upload cannot enter cleanup');
    for (const identity of [
      { ownerId: 'teacher-other' }, { submissionOperationId: 'submission-other' },
      { bookId: 'book-other' }, { sourceVersionId: 'source-other' },
      { sourceVersionIds: ['source-other'] }, { inputFingerprint: 'invalid' },
    ]) {
      await expect(repository.fenceVerifiedSource({
        ...fenceInput, retirementGuard: { ...fenceInput.retirementGuard, ...identity },
      })).rejects.toThrow();
      expect(memory.getState()).toBe(completed);
    }
    await expect(repository.fenceVerifiedSource({
      ...fenceInput, currentSourceVersionIds: ['source-other'],
    })).rejects.toThrow('guard is stale');
    const fenced = await repository.fenceVerifiedSource(fenceInput);
    expect(fenced.operations['reservation-1']).toMatchObject({
      status: 'retirement_pending', verifiedStorage: storage(),
      cleanup: { reason: 'cancel_requested', requestedAt: fenceInput.fencedAt, attempt: 0, nextRetryAt: '2026-07-23T00:05:00.000Z' },
    });
    expect(fenced.assemblyBooks?.['book-1']?.['source-1']).toBeUndefined();
    expect(fenced.capacity.trackedAccountBytes).toBe(10);
    await expect(repository.requestCleanup({ ...cleanupInput, expectedRevision: fenced.revision }))
      .rejects.toThrow('verified upload cannot enter cleanup');
    for (const mutation of [
      { cleanup: undefined },
      { submissionOperationId: 'submission-other' },
      { ownerId: 'teacher-other' },
    ]) {
      expect(() => validateBookSourceUploadAccountState({
        ...fenced, operations: { 'reservation-1': { ...fenced.operations['reservation-1'], ...mutation } },
      })).toThrow();
    }
  });

  it('resumes canceled retirement after Firebase drops empty guard arrays from persisted JSON', async () => {
    const { memory, repository, fenceInput } = await canceledSubmissionSource();
    const input = { ...fenceInput, retirementGuard: { ...fenceInput.retirementGuard, sourceVersionIds: [] } };
    const fenced = await repository.fenceVerifiedSource(input);
    expect(fenced.operations['reservation-1'].retirementGuard).not.toHaveProperty('sourceVersionIds');
    const persisted: BookSourceUploadAccountState = JSON.parse(JSON.stringify(fenced, (key, value) =>
      key === 'sourceVersionIds' && Array.isArray(value) && value.length === 0 ? undefined : value));
    memory.setState(persisted);
    expect(validateBookSourceUploadAccountState(persisted)).toBe(persisted);
    expect(await repository.fenceVerifiedSource({ ...input, expectedRevision: persisted.revision })).toBe(persisted);
    const claimed = await repository.claimCleanup({
      accountId: 'account-1', expectedRevision: persisted.revision, reservationId: 'reservation-1', leaseOwner: 'cleanup-1',
      claimedAt: '2026-07-23T00:05:00.000Z', leaseExpiresAt: '2026-07-23T00:06:00.000Z',
    });
    const retire = retireInput({
      expectedRevision: claimed.revision, retirementGuard: input.retirementGuard, leaseOwner: 'cleanup-1',
      retiredAt: '2026-07-23T00:05:01.000Z', proof: 'provider_absent',
    });
    const retired = await repository.retireVerifiedSource(retire);
    expect(retired.capacity.trackedAccountBytes).toBe(0);
    expect(retired.operations['reservation-1']).toMatchObject({ status: 'retired', retirementProof: 'provider_absent' });
    expect(retired.operations['reservation-1'].retirementGuard).not.toHaveProperty('sourceVersionIds');
    expect(await repository.retireVerifiedSource({ ...retire, expectedRevision: retired.revision })).toBe(retired);
  });

  it('requires expired signed upload authority and an active owned lease to retire a canceled source', async () => {
    const { repository, fenceInput } = await canceledSubmissionSource();
    const fenced = await repository.fenceVerifiedSource(fenceInput);
    const claimInput = {
      accountId: 'account-1', expectedRevision: fenced.revision, reservationId: 'reservation-1',
      leaseOwner: 'cleanup-1', claimedAt: '2026-07-23T00:05:00.000Z', leaseExpiresAt: '2026-07-23T00:06:00.000Z',
    };
    await expect(repository.claimCleanup({ ...claimInput, claimedAt: '2026-07-23T00:04:59.000Z' }))
      .rejects.toThrow('lease is unavailable');
    const input = retireInput({
      expectedRevision: fenced.revision, retirementGuard: fenceInput.retirementGuard,
      retiredAt: '2026-07-23T00:05:00.000Z', leaseOwner: 'cleanup-1',
    });
    await expect(repository.retireVerifiedSource(input)).rejects.toThrow('active cleanup lease');
    const claimed = await repository.claimCleanup(claimInput);
    for (const invalid of [
      { leaseOwner: undefined }, { leaseOwner: 'cleanup-other' },
      { retiredAt: '2026-07-23T00:04:59.000Z' }, { retiredAt: '2026-07-23T00:06:00.000Z' },
    ]) {
      await expect(repository.retireVerifiedSource({ ...input, expectedRevision: claimed.revision, ...invalid }))
        .rejects.toThrow('active cleanup lease');
    }
    await expect(repository.releaseCleaned({
      accountId: 'account-1', expectedRevision: claimed.revision, reservationId: 'reservation-1', leaseOwner: 'cleanup-1',
      releasedAt: '2026-07-23T00:05:01.000Z', proof: 'provider_absent',
    })).rejects.toThrow('lease mismatch');
    expect(claimed.capacity.trackedAccountBytes).toBe(10);
  });

  it('retries canceled source deletion and releases capacity only with proof, retaining scoped replay history', async () => {
    const { repository, fenceInput } = await canceledSubmissionSource();
    const fenced = await repository.fenceVerifiedSource(fenceInput);
    const claimed = await repository.claimCleanup({
      accountId: 'account-1', expectedRevision: fenced.revision, reservationId: 'reservation-1', leaseOwner: 'cleanup-1',
      claimedAt: '2026-07-23T00:05:00.000Z', leaseExpiresAt: '2026-07-23T00:06:00.000Z',
    });
    const failed = await repository.failCleanup({
      accountId: 'account-1', expectedRevision: claimed.revision, reservationId: 'reservation-1', leaseOwner: 'cleanup-1',
      failedAt: '2026-07-23T00:05:01.000Z', nextRetryAt: '2026-07-23T00:07:00.000Z', errorCode: 'provider_unavailable',
    });
    expect(failed.operations['reservation-1']).toMatchObject({
      status: 'retirement_pending', verifiedStorage: storage(),
      cleanup: { attempt: 1, nextRetryAt: '2026-07-23T00:07:00.000Z', lastErrorCode: 'provider_unavailable' },
    });
    expect(failed.capacity.trackedAccountBytes).toBe(10);
    const retried = await repository.claimCleanup({
      accountId: 'account-1', expectedRevision: failed.revision, reservationId: 'reservation-1', leaseOwner: 'cleanup-2',
      claimedAt: '2026-07-23T00:07:00.000Z', leaseExpiresAt: '2026-07-23T00:08:00.000Z',
    });
    const input = retireInput({
      expectedRevision: retried.revision, retirementGuard: fenceInput.retirementGuard, leaseOwner: 'cleanup-2',
      retiredAt: '2026-07-23T00:07:01.000Z', proof: 'provider_absent',
    });
    await expect(repository.retireVerifiedSource({ ...input, proof: undefined as never })).rejects.toThrow('invalid retirement proof');
    const retired = await repository.retireVerifiedSource(input);
    expect(retired.capacity.trackedAccountBytes).toBe(0);
    expect(retired.operations['reservation-1']).toMatchObject({
      status: 'retired', submissionOperationId: 'submission-1', retirementGuard: fenceInput.retirementGuard,
      retirementProof: 'provider_absent', checksum: { algorithm: 'sha-256', value: 'a'.repeat(64) },
    });
    for (const field of ['verifiedStorage', 'providerObjectKey', 'providerFileId', 'providerKind', 'privateBucketId']) {
      expect(retired.operations['reservation-1']).not.toHaveProperty(field);
    }
    expect(Object.values(retired.lifecycleAuditEvents ?? {}).filter((event) => event.transition === 'retirement_pending')).toHaveLength(1);
    expect(Object.values(retired.lifecycleAuditEvents ?? {}).filter((event) => event.transition === 'retired')).toHaveLength(1);
    expect(await repository.retireVerifiedSource({ ...input, expectedRevision: retired.revision })).toBe(retired);
    expect(() => validateBookSourceUploadAccountState({
      ...retired, operations: { 'reservation-1': { ...retired.operations['reservation-1'], submissionOperationId: 'submission-other' } },
    })).toThrow('identity mismatch');
  });

  it.each(['retired', 'released'] as const)('keeps %s submission cleanup leased and recurring after late provider versions are deleted', async (status) => {
    const { memory, repository, reserved, fenceInput } = await canceledSubmissionSource();
    let terminal: BookSourceUploadAccountState;
    if (status === 'retired') {
      const fenced = await repository.fenceVerifiedSource(fenceInput);
      const claimed = await repository.claimCleanup({
        accountId: 'account-1', expectedRevision: fenced.revision, reservationId: 'reservation-1', leaseOwner: 'first-cleanup',
        claimedAt: '2026-07-23T00:05:00.000Z', leaseExpiresAt: '2026-07-23T00:06:00.000Z',
      });
      terminal = await repository.retireVerifiedSource(retireInput({
        expectedRevision: claimed.revision, retirementGuard: fenceInput.retirementGuard, leaseOwner: 'first-cleanup',
        retiredAt: '2026-07-23T00:05:01.000Z', proof: 'provider_absent',
      }));
      expect(terminal.operations['reservation-1'].cleanupIdentity).toMatchObject({
        providerObjectKey: 'private/book-1/source-1.pdf', expectedChecksum: { algorithm: 'sha-256', value: 'a'.repeat(64) },
      });
      for (const mutation of [
        { cleanupIdentity: undefined },
        { cleanupIdentity: { ...terminal.operations['reservation-1'].cleanupIdentity, expectedChecksum: { algorithm: 'sha-256', value: 'b'.repeat(64) } } },
        { cleanup: undefined },
      ]) {
        expect(() => validateBookSourceUploadAccountState({
          ...terminal, operations: { 'reservation-1': { ...terminal.operations['reservation-1'], ...mutation } },
        })).toThrow();
      }
    } else {
      memory.setState(reserved);
      const pending = await repository.requestCleanup({
        accountId: 'account-1', expectedRevision: reserved.revision, reservationId: 'reservation-1', ownerId: 'teacher-1',
        reason: 'cancel_requested', requestedAt: '2026-07-23T00:02:00.000Z',
      });
      const claimed = await repository.claimCleanup({
        accountId: 'account-1', expectedRevision: pending.revision, reservationId: 'reservation-1', leaseOwner: 'first-cleanup',
        claimedAt: '2026-07-23T00:05:00.000Z', leaseExpiresAt: '2026-07-23T00:06:00.000Z',
      });
      terminal = await repository.releaseCleaned({
        accountId: 'account-1', expectedRevision: claimed.revision, reservationId: 'reservation-1', leaseOwner: 'first-cleanup',
        releasedAt: '2026-07-23T00:05:01.000Z', proof: 'provider_absent',
      });
    }
    expect(terminal.operations['reservation-1'].cleanup).toMatchObject({
      requestedAt: '2026-07-23T00:05:01.000Z', nextRetryAt: '2026-07-23T01:05:01.000Z', attempt: 0,
    });
    const claimed = await repository.claimCleanup({
      accountId: 'account-1', expectedRevision: terminal.revision, reservationId: 'reservation-1', leaseOwner: 'late-cleanup',
      claimedAt: '2026-07-23T01:05:01.000Z', leaseExpiresAt: '2026-07-23T01:06:01.000Z',
    });
    const input = {
      accountId: 'account-1', expectedRevision: claimed.revision, reservationId: 'reservation-1', leaseOwner: 'late-cleanup',
      completedAt: '2026-07-23T01:05:02.000Z', nextRetryAt: '2026-07-23T02:05:02.000Z', proof: 'exact_version_deleted' as const,
    };
    await expect(repository.completeTerminalCleanup({ ...input, leaseOwner: 'wrong-cleanup' })).rejects.toThrow('lease mismatch');
    await expect(repository.completeTerminalCleanup({ ...input, completedAt: '2026-07-23T01:06:01.000Z' })).rejects.toThrow('active lease');
    const swept = await repository.completeTerminalCleanup(input);
    expect(swept.operations['reservation-1']).toMatchObject({ status, cleanup: { nextRetryAt: input.nextRetryAt, attempt: 1 } });
    expect(swept.operations['reservation-1'].cleanup?.leaseOwner).toBeUndefined();
    expect(swept.capacity.trackedAccountBytes).toBe(0);
    expect(swept.lifecycleAuditEvents).toEqual(terminal.lifecycleAuditEvents);
    expect(validateBookSourceUploadAccountState(swept)).toBe(swept);
    const retryClaim = await repository.claimCleanup({
      accountId: 'account-1', expectedRevision: swept.revision, reservationId: 'reservation-1', leaseOwner: 'retry-cleanup',
      claimedAt: input.nextRetryAt, leaseExpiresAt: '2026-07-23T02:06:02.000Z',
    });
    const failed = await repository.failCleanup({
      accountId: 'account-1', expectedRevision: retryClaim.revision, reservationId: 'reservation-1', leaseOwner: 'retry-cleanup',
      failedAt: '2026-07-23T02:05:03.000Z', nextRetryAt: '2026-07-23T02:07:03.000Z', errorCode: 'provider_unavailable',
    });
    expect(failed.operations['reservation-1']).toMatchObject({ status, cleanup: { lastErrorCode: 'provider_unavailable', attempt: 2 } });
    expect(failed.capacity.trackedAccountBytes).toBe(0);
  });
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

  it('keeps browser page counts out of reservations and commits the trusted count', async () => {
    const memory = createMemoryTransaction();
    const repository = createRepository(memory.transaction);
    const reserved = await repository.reserve(reservation());

    expect(reserved.operations['reservation-1']).not.toHaveProperty('ownerAttestedPhysicalPageCount');
    expect(reserved.operations['reservation-1']).not.toHaveProperty('physicalPageCount');
    const completed = await repository.completeVerified({
      accountId: 'account-1',
      expectedRevision: reserved.revision,
      reservationId: 'reservation-1',
      verifiedAt: '2026-07-23T00:01:00.000Z',
      verifiedStorage: storage(),
      physicalPageCount: 7,
    });
    expect(completed.operations['reservation-1']).toMatchObject({ physicalPageCount: 7 });
    await expect(repository.completeVerified({
      accountId: 'account-1',
      expectedRevision: completed.revision,
      reservationId: 'reservation-1',
      verifiedAt: '2026-07-23T00:01:00.000Z',
      verifiedStorage: storage(),
      physicalPageCount: 8,
    })).rejects.toThrow('verified completion identity is immutable');
  });

  it('persists bounded provider scan progress without advancing the domain revision', async () => {
    const memory = createMemoryTransaction();
    const repository = createRepository(memory.transaction);
    const progressed = await repository.recordProviderReconciliationContinuation({
      accountId: 'account-1',
      expectedRevision: 0,
      continuation: {
        token: 'sealed_cursor_1',
        updatedAt: '2026-07-23T00:01:00.000Z',
      },
    });
    expect(progressed).toMatchObject({
      revision: 0,
      capacity: {
        providerReconciliationContinuation: {
          token: 'sealed_cursor_1',
        },
      },
    });

    const reserved = await repository.reserve(reservation());
    expect(reserved.revision).toBe(1);
    expect(reserved.capacity.providerReconciliationContinuation).toBeUndefined();

    const progressedAgain = await repository.recordProviderReconciliationContinuation({
      accountId: 'account-1',
      expectedRevision: 1,
      continuation: {
        token: 'sealed_cursor_2',
        updatedAt: '2026-07-23T00:02:00.000Z',
      },
    });
    await expect(repository.recordProviderReconciliationContinuation({
      accountId: 'account-1',
      expectedRevision: 1,
      continuation: {
        token: 'stale_writer_cursor',
        updatedAt: '2026-07-23T00:02:01.000Z',
      },
    })).rejects.toThrow('continuation compare-and-set conflict');
    const cleared = await repository.clearProviderReconciliationContinuation({
      accountId: 'account-1',
      expectedRevision: 1,
      expectedContinuationToken: 'sealed_cursor_2',
    });
    expect(progressedAgain.revision).toBe(1);
    expect(cleared.revision).toBe(1);
    expect(cleared.capacity.providerReconciliationContinuation).toBeUndefined();
  });

  it('invalidates a provider snapshot with CAS, clears the cursor, and preserves tracked state', async () => {
    const memory = createMemoryTransaction({ trackedAccountBytes: 23, temporaryBytes: 0 });
    const repository = createRepository(memory.transaction);
    await repository.recordProviderReconciliationContinuation({
      accountId: 'account-1',
      expectedRevision: 0,
      continuation: { token: 'sealed_cursor', updatedAt: '2026-07-23T00:01:00.000Z' },
    });

    const invalidated = await repository.invalidateProviderReconciliation({
      accountId: 'account-1',
      expectedRevision: 0,
      expectedContinuationToken: 'sealed_cursor',
    });

    expect(invalidated).toMatchObject({
      revision: 1,
      capacity: {
        trackedAccountBytes: 23,
        temporaryBytes: 0,
        providerReconciliation: {
          status: 'drift',
          totalBytes: 0,
          objectCount: 0,
          completedAt: '2026-07-23T00:01:00.000Z',
        },
      },
      operations: {},
    });
    expect(invalidated.capacity.providerReconciliationContinuation).toBeUndefined();
    await expect(repository.invalidateProviderReconciliation({
      accountId: 'account-1',
      expectedRevision: 0,
      expectedContinuationToken: 'sealed_cursor',
    })).rejects.toThrow('compare-and-set conflict');
  });

  it('scopes initial source keys to their Book instead of the whole storage account', async () => {
    const memory = createMemoryTransaction();
    const repository = createRepository(memory.transaction);
    await repository.reserve(reservation({ sourceKey: 'main' }));
    const otherActiveBook = await repository.reserve(reservation({
      expectedRevision: 1,
      reservationId: 'reservation-2',
      bookId: 'book-2',
      sourceVersionId: 'source-2',
      sourceKey: 'main',
      providerObjectKey: 'private/book-2/source-2.pdf',
    }));
    expect(otherActiveBook.operations['reservation-2']).toMatchObject({
      bookId: 'book-2',
      sourceKey: 'main',
      status: 'reserved',
    });
    await expect(repository.reserve(reservation({
      expectedRevision: otherActiveBook.revision,
      reservationId: 'reservation-same-book',
      sourceVersionId: 'source-same-book',
      sourceKey: 'main',
      providerObjectKey: 'private/book-1/source-same-book.pdf',
    }))).rejects.toThrow('sourceKey is already reserved');
    const verified = await repository.completeVerified({
      accountId: 'account-1',
      expectedRevision: otherActiveBook.revision,
      reservationId: 'reservation-1',
      physicalPageCount: 4,
      verifiedAt: '2026-07-23T00:01:00.000Z',
      verifiedStorage: storage(),
    });
    const otherVerifiedBook = await repository.reserve(reservation({
      expectedRevision: verified.revision,
      reservationId: 'reservation-3',
      bookId: 'book-3',
      sourceVersionId: 'source-3',
      sourceKey: 'main',
      providerObjectKey: 'private/book-3/source-3.pdf',
    }));
    expect(otherVerifiedBook.operations['reservation-3']).toMatchObject({
      bookId: 'book-3',
      sourceKey: 'main',
      status: 'reserved',
    });

    const cleanupMemory = createMemoryTransaction();
    const cleanupRepository = createRepository(cleanupMemory.transaction);
    await cleanupRepository.reserve(reservation({ sourceKey: 'main' }));
    const cleanupPending = await cleanupRepository.requestCleanup({
      accountId: 'account-1',
      expectedRevision: 1,
      reservationId: 'reservation-1',
      ownerId: 'teacher-1',
      reason: 'cancel_requested',
      requestedAt: '2026-07-23T00:01:00.000Z',
      providerFileId: 'file-1',
      providerFileVersionId: 'version-1',
    });
    const otherCleanupPendingBook = await cleanupRepository.reserve(reservation({
      expectedRevision: cleanupPending.revision,
      reservationId: 'reservation-4',
      bookId: 'book-4',
      sourceVersionId: 'source-4',
      sourceKey: 'main',
      providerObjectKey: 'private/book-4/source-4.pdf',
    }));
    expect(otherCleanupPendingBook.operations['reservation-4']).toMatchObject({
      bookId: 'book-4',
      sourceKey: 'main',
      status: 'reserved',
    });

    const claimed = await cleanupRepository.claimCleanup({
      accountId: 'account-1',
      expectedRevision: otherCleanupPendingBook.revision,
      reservationId: 'reservation-1',
      leaseOwner: 'reconciler-1',
      claimedAt: '2026-07-23T00:01:00.000Z',
      leaseExpiresAt: '2026-07-23T00:02:00.000Z',
    });
    const released = await cleanupRepository.releaseCleaned({
      accountId: 'account-1',
      expectedRevision: claimed.revision,
      reservationId: 'reservation-1',
      leaseOwner: 'reconciler-1',
      releasedAt: '2026-07-23T00:01:01.000Z',
      proof: 'exact_version_deleted',
    });
    const sameBookAfterRelease = await cleanupRepository.reserve(reservation({
      expectedRevision: released.revision,
      reservationId: 'reservation-same-book-released',
      sourceVersionId: 'source-same-book-released',
      sourceKey: 'main',
      providerObjectKey: 'private/book-1/source-same-book-released.pdf',
    }));
    expect(sameBookAfterRelease.operations['reservation-same-book-released']).toMatchObject({
      bookId: 'book-1',
      sourceKey: 'main',
      status: 'reserved',
    });
    await expect(cleanupRepository.reserve(reservation({
      expectedRevision: sameBookAfterRelease.revision,
      reservationId: 'reservation-1',
      bookId: 'book-5',
      sourceVersionId: 'source-5',
      sourceKey: 'main',
      providerObjectKey: 'private/book-5/source-5.pdf',
    }))).rejects.toThrow('reservation identity is immutable');
    await expect(cleanupRepository.reserve(reservation({
      expectedRevision: sameBookAfterRelease.revision,
      reservationId: 'reservation-global-source-version',
      bookId: 'book-5',
      sourceVersionId: 'source-1',
      sourceKey: 'main',
      providerObjectKey: 'private/book-5/global-source-version.pdf',
    }))).rejects.toThrow('sourceVersionId is already reserved');
    await expect(cleanupRepository.reserve(reservation({
      expectedRevision: sameBookAfterRelease.revision,
      reservationId: 'reservation-global-provider-key',
      bookId: 'book-5',
      sourceVersionId: 'source-global-provider-key',
      sourceKey: 'main',
      providerObjectKey: 'private/book-1/source-1.pdf',
    }))).rejects.toThrow('providerObjectKey is already reserved');

    const otherBook = await cleanupRepository.reserve(reservation({
      expectedRevision: sameBookAfterRelease.revision,
      reservationId: 'reservation-5',
      bookId: 'book-5',
      sourceVersionId: 'source-5',
      sourceKey: 'main',
      providerObjectKey: 'private/book-5/source-5.pdf',
    }));

    expect(otherBook.operations['reservation-5']).toMatchObject({
      bookId: 'book-5',
      sourceKey: 'main',
      status: 'reserved',
    });
  });

  it('fails closed when provider reconciliation is missing, drifted, stale, or future-dated', async () => {
    const memory = createMemoryTransaction();
    const repository = createRepository(memory.transaction);
    for (const providerReconciliation of [
      undefined,
      reconciliation({ status: 'drift' }),
      reconciliation({ completedAt: '2026-07-22T23:45:59.999Z' }),
      reconciliation({ completedAt: '2026-07-23T00:01:00.001Z' }),
    ]) {
      memory.setState({
        revision: 0,
        capacity: {
          trackedAccountBytes: 0,
          temporaryBytes: 0,
          ...(providerReconciliation === undefined ? {} : { providerReconciliation }),
        },
        operations: {},
      });
      await expect(repository.reserve(reservation()))
        .rejects.toThrow('current healthy provider reconciliation is required');
    }
  });

  it('accepts the exact reconciliation freshness boundary and rejects one millisecond beyond it', async () => {
    const memory = createMemoryTransaction();
    const completedAt = '2026-07-23T00:01:00.000Z';
    const exactBoundary = new Date(
      Date.parse(completedAt) + BOOK_SOURCE_PROVIDER_RECONCILIATION_MAX_AGE_MS,
    );
    const accepted = await createRepository(memory.transaction, () => exactBoundary)
      .reserve(reservation({
        createdAt: exactBoundary.toISOString(),
        expiresAt: new Date(exactBoundary.getTime() + 60_000).toISOString(),
      }));
    expect(accepted.operations['reservation-1']?.status).toBe('reserved');

    const stale = createMemoryTransaction();
    await expect(createRepository(
      stale.transaction,
      () => new Date(exactBoundary.getTime() + 1),
    ).reserve(reservation({
      createdAt: new Date(exactBoundary.getTime() + 1).toISOString(),
      expiresAt: new Date(exactBoundary.getTime() + 60_001).toISOString(),
    }))).rejects.toThrow('current healthy provider reconciliation is required');
  });

  it('persists a trusted provider reconciliation snapshot with account CAS', async () => {
    const memory = createMemoryTransaction();
    const repository = createRepository(memory.transaction);
    const reconciled = await repository.recordProviderReconciliation({
      accountId: 'account-1',
      expectedRevision: 0,
      snapshot: {
        status: 'healthy',
        totalBytes: 0,
        objectCount: 0,
        completedAt: '2026-07-23T00:01:00.000Z',
      },
    });

    expect(reconciled).toMatchObject({
      revision: 1,
      capacity: {
        trackedAccountBytes: 0,
        temporaryBytes: 0,
        providerReconciliation: {
          status: 'healthy',
          totalBytes: 0,
          objectCount: 0,
          completedAt: '2026-07-23T00:01:00.000Z',
        },
      },
    });
    await expect(repository.recordProviderReconciliation({
      accountId: 'account-1',
      expectedRevision: 0,
      snapshot: {
        status: 'drift',
        totalBytes: 1,
        objectCount: 1,
        completedAt: '2026-07-23T00:02:00.000Z',
      },
    })).rejects.toThrow('compare-and-set conflict');
    await expect(repository.recordProviderReconciliation({
      accountId: 'account-1',
      expectedRevision: 1,
      snapshot: {
        status: 'healthy',
        totalBytes: -1,
        objectCount: 0,
        completedAt: '2026-07-23T00:02:00.000Z',
      },
    })).rejects.toThrow('invalid provider reconciliation snapshot');
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
      verifiedStorage: storage({ byteSize: 9 }), physicalPageCount: 4,
    })).rejects.toThrow('trusted completion does not match');
    const completed = await repository.completeVerified({
      accountId: 'account-1', expectedRevision: 1, reservationId: 'reservation-1', verifiedAt: '2026-07-23T00:01:00.000Z', verifiedStorage: storage(), physicalPageCount: 4,
    });
    expect(completed.capacity.trackedAccountBytes).toBe(90);
    expect(completed.operations['reservation-1']).toMatchObject({ status: 'verified_completed', verifiedStorage: storage() });
    await expect(repository.requestCleanup({
      accountId: 'account-1', expectedRevision: completed.revision, reservationId: 'reservation-1', ownerId: 'teacher-1',
      reason: 'cancel_requested', requestedAt: '2026-07-23T00:01:01.000Z',
    })).rejects.toThrow('verified upload cannot enter cleanup');
    expect(completed.assemblyBooks).toEqual({
      'book-1': {
        'source-1': {
          ownerId: 'teacher-1',
          bookId: 'book-1',
          sourceKey: 'unit-1',
          sourceVersionId: 'source-1',
          checksum: storage().checksum,
          purpose: 'book-source',
          studentSafeStatus: 'unreviewed',
          physicalPageCount: 4,
          verifiedUsable: true,
        },
      },
    });
    await expect(repository.completeVerified({
      accountId: 'account-1',
      expectedRevision: 2,
      reservationId: 'reservation-1',
      physicalPageCount: 4,
      verifiedAt: '2026-07-23T00:01:00.000Z',
      verifiedStorage: storage({ privateBucketId: 'other-bucket' }),
    })).rejects.toThrow('verified completion identity is immutable');
  });

  it('repairs a missing projection on trusted completion replay without provider fields', async () => {
    const memory = createMemoryTransaction();
    const repository = createRepository(memory.transaction);
    await repository.reserve(reservation());
    const completed = await repository.completeVerified({
      accountId: 'account-1',
      expectedRevision: 1,
      reservationId: 'reservation-1',
      physicalPageCount: 4,
      verifiedAt: '2026-07-23T00:01:00.000Z',
      verifiedStorage: storage(),
    });
    memory.setState({ ...completed, assemblyBooks: {} });

    const repaired = await repository.completeVerified({
      accountId: 'account-1',
      expectedRevision: completed.revision,
      reservationId: 'reservation-1',
      physicalPageCount: 4,
      verifiedAt: '2026-07-23T00:01:00.000Z',
      verifiedStorage: storage(),
    });
    expect(repaired.assemblyBooks?.['book-1']?.['source-1']).toEqual({
      ownerId: 'teacher-1',
      bookId: 'book-1',
      sourceKey: 'unit-1',
      sourceVersionId: 'source-1',
      checksum: storage().checksum,
      purpose: 'book-source',
      studentSafeStatus: 'unreviewed',
      physicalPageCount: 4,
      verifiedUsable: true,
    });
    expect(JSON.stringify(repaired.assemblyBooks)).not.toMatch(
      /(?:bucket|location|objectKey|providerFile|providerKind)/iu,
    );
  });

  it('keeps legacy rows readable without making them Assembly-usable', async () => {
    const memory = createMemoryTransaction();
    const repository = createRepository(memory.transaction);
    const current = await repository.reserve(reservation());
    const { ownerAttestedPhysicalPageCount: _legacyCount, ...legacyOperation } =
      current.operations['reservation-1']!;
    memory.setState({
      ...current,
      operations: { 'reservation-1': legacyOperation },
      assemblyBooks: undefined,
    });

    const readable = validateBookSourceUploadAccountState(memory.getState()!);
    expect(readable.operations['reservation-1']?.ownerAttestedPhysicalPageCount).toBeUndefined();
    expect(readable.assemblyBooks).toEqual({});
  });

  it('commits a replacement projection independently of the old source operation', async () => {
    const memory = createMemoryTransaction();
    const repository = createRepository(memory.transaction);
    const initial = await repository.reserve(reservation());
    const committedInitial = await repository.completeVerified({
      accountId: 'account-1',
      expectedRevision: initial.revision,
      reservationId: 'reservation-1',
      physicalPageCount: 4,
      verifiedAt: '2026-07-23T00:01:00.000Z',
      verifiedStorage: storage(),
    });
    const readyAuditId = `source-1-${committedInitial.revision}-private_ready`;
    expect(committedInitial.lifecycleAuditEvents).toMatchObject({
      [readyAuditId]: {
        eventId: readyAuditId,
        transition: 'private_ready',
        revision: committedInitial.revision,
        reservationId: 'reservation-1',
        sourceVersionId: 'source-1',
      },
    });
    expect(Object.keys(committedInitial.lifecycleAuditEvents ?? {})).toHaveLength(1);
    const replay = await repository.completeVerified({
      accountId: 'account-1', expectedRevision: committedInitial.revision, reservationId: 'reservation-1',
      verifiedAt: '2026-07-23T00:01:00.000Z', verifiedStorage: storage(), physicalPageCount: 4,
    });
    expect(replay).toBe(committedInitial);
    expect(replay.lifecycleAuditEvents).toEqual(committedInitial.lifecycleAuditEvents);
    expect(Object.keys(replay.lifecycleAuditEvents ?? {})).toHaveLength(1);
    const replacement = await repository.reserve(reservation({
      expectedRevision: committedInitial.revision,
      reservationId: 'reservation-2',
      sourceVersionId: 'source-2',
      providerObjectKey: 'private/book-1/source-2.pdf',
      kind: 'replacement',
    }));
    expect(replacement.operations['reservation-1']?.sourceVersionId).toBe('source-1');
    expect(replacement.operations['reservation-1']?.physicalPageCount).toBe(4);
    expect(replacement.operations['reservation-2']).toMatchObject({
      replacesSourceVersionId: 'source-1',
    });
    expect(replacement.assemblyBooks?.['book-1']?.['source-1']).toMatchObject({
      sourceVersionId: 'source-1',
      physicalPageCount: 4,
      verifiedUsable: true,
    });

    const committedReplacement = await createRepository(
      memory.transaction,
      () => new Date('2026-07-23T00:02:00.000Z'),
    ).completeVerified({
      accountId: 'account-1',
      expectedRevision: replacement.revision,
      reservationId: 'reservation-2',
      physicalPageCount: 9,
      verifiedAt: '2026-07-23T00:02:00.000Z',
      verifiedStorage: storage({
        sourceVersionId: 'source-2',
        providerObjectKey: 'private/book-1/source-2.pdf',
        providerFileId: 'file-2',
        providerFileVersionId: 'version-2',
      }),
    });
    const replacementAuditId = `source-2-${committedReplacement.revision}-private_replaced`;
    expect(committedReplacement.lifecycleAuditEvents).toMatchObject({
      [replacementAuditId]: {
        eventId: replacementAuditId,
        transition: 'private_replaced',
        revision: committedReplacement.revision,
        reservationId: 'reservation-2',
        sourceVersionId: 'source-2',
        replacesSourceVersionId: 'source-1',
      },
    });
    expect(Object.keys(committedReplacement.lifecycleAuditEvents ?? {})).toHaveLength(2);
    expect(committedReplacement.operations['reservation-1']?.sourceVersionId).toBe('source-1');
    expect(committedReplacement.assemblyBooks?.['book-1']?.['source-2']).toMatchObject({
      sourceVersionId: 'source-2',
      physicalPageCount: 9,
      verifiedUsable: true,
    });
  });

  it('fails closed on stale CAS, malformed audit, and conflicting audit state', async () => {
    const memory = createMemoryTransaction();
    const repository = createRepository(memory.transaction);
    const reserved = await repository.reserve(reservation());
    const completion = {
      accountId: 'account-1',
      reservationId: 'reservation-1',
      verifiedAt: '2026-07-23T00:01:00.000Z',
      verifiedStorage: storage(),
      physicalPageCount: 4,
    } as const;

    await expect(repository.completeVerified({
      ...completion,
      expectedRevision: reserved.revision - 1,
    })).rejects.toThrow('compare-and-set conflict');

    memory.setState({
      ...reserved,
      lifecycleAuditEvents: {
        corrupt: {
          eventId: 'corrupt',
          transition: 'private_ready',
          revision: 0,
          occurredAt: '2026-07-23T00:01:00.000Z',
          reservationId: 'reservation-1',
          ownerId: 'teacher-1',
          bookId: 'book-1',
          sourceKey: 'unit-1',
          sourceVersionId: 'source-1',
        },
      },
    });
    await expect(repository.completeVerified({ ...completion, expectedRevision: reserved.revision }))
      .rejects.toThrow('invalid lifecycle audit event');

    const conflictingAuditId = `source-1-${reserved.revision + 1}-private_ready`;
    memory.setState({
      ...reserved,
      lifecycleAuditEvents: {
        [conflictingAuditId]: {
          eventId: conflictingAuditId,
          transition: 'private_ready',
          revision: reserved.revision + 1,
          occurredAt: '2026-07-23T00:00:59.000Z',
          reservationId: 'reservation-1',
          ownerId: 'teacher-1',
          bookId: 'book-1',
          sourceKey: 'unit-1',
          sourceVersionId: 'source-1',
        },
      },
    });
    await expect(repository.completeVerified({ ...completion, expectedRevision: reserved.revision }))
      .rejects.toThrow('lifecycle audit identity is immutable');
  });

  it('binds trusted safety decisions to the owner, version, and checksum', async () => {
    const memory = createMemoryTransaction();
    const repository = createRepository(memory.transaction);
    const reserved = await repository.reserve(reservation());
    const completed = await repository.completeVerified({
      accountId: 'account-1', expectedRevision: reserved.revision, reservationId: 'reservation-1',
      physicalPageCount: 4,
      verifiedAt: '2026-07-23T00:01:00.000Z', verifiedStorage: storage(),
    });
    const ready = await repository.decideStudentSafeSource({
      accountId: 'account-1', expectedRevision: completed.revision, reservationId: 'reservation-1',
      bookId: 'book-1', actorId: 'teacher-1', studentSafeStatus: 'ready',
      studentSafeDecision: {
        decidedBy: 'teacher-1', decidedAt: '2026-07-23T00:02:00.000Z', sourceVersionId: 'source-1',
        sha256Hex: 'a'.repeat(64), reasonCode: 'teacher-reviewed',
      },
    });
    expect(ready.operations['reservation-1']).toMatchObject({
      purpose: 'book-source', studentSafeStatus: 'ready',
      studentSafeDecision: { sourceVersionId: 'source-1', sha256Hex: 'a'.repeat(64) },
    });
    expect(ready.assemblyBooks?.['book-1']?.['source-1']).toMatchObject({
      purpose: 'book-source', studentSafeStatus: 'ready',
    });
    const replay = await repository.decideStudentSafeSource({
      accountId: 'account-1', expectedRevision: ready.revision, reservationId: 'reservation-1',
      bookId: 'book-1', actorId: 'teacher-1', studentSafeStatus: 'ready',
      studentSafeDecision: {
        decidedBy: 'teacher-1', decidedAt: '2026-07-23T00:03:00.000Z', sourceVersionId: 'source-1',
        sha256Hex: 'a'.repeat(64), reasonCode: 'teacher-reviewed',
      },
    });
    expect(replay).toBe(ready);
    await expect(repository.decideStudentSafeSource({
      accountId: 'account-1', expectedRevision: ready.revision, reservationId: 'reservation-1',
      bookId: 'book-1/ancestor', actorId: 'teacher-1', studentSafeStatus: 'ready',
      studentSafeDecision: {
        decidedBy: 'teacher-1', decidedAt: '2026-07-23T00:03:00.000Z', sourceVersionId: 'source-1',
        sha256Hex: 'a'.repeat(64), reasonCode: 'teacher-reviewed',
      },
    })).rejects.toThrow('bookId');
    await expect(repository.decideStudentSafeSource({
      accountId: 'account-1', expectedRevision: ready.revision, reservationId: 'reservation-1',
      bookId: 'book-1', actorId: 'teacher-1', studentSafeStatus: 'rejected',
      studentSafeDecision: {
        decidedBy: 'teacher-1', decidedAt: '2026-07-23T00:03:00.000Z', sourceVersionId: 'source-1',
        sha256Hex: 'b'.repeat(64), reasonCode: 'invalid-document',
      },
    })).rejects.toThrow('hash-mismatched');
    await expect(repository.decideStudentSafeSource({
      accountId: 'account-1', expectedRevision: ready.revision, reservationId: 'reservation-1',
      bookId: 'book-1', actorId: 'teacher-1', studentSafeStatus: 'rejected',
      studentSafeDecision: {
        decidedBy: 'teacher-1', decidedAt: '2026-07-23T00:03:00.000Z', sourceVersionId: 'source-1',
        sha256Hex: 'a'.repeat(64), reasonCode: 'invalid-document',
      },
    })).rejects.toThrow('immutable');
    await expect(repository.decideStudentSafeSource({
      accountId: 'account-1', expectedRevision: ready.revision, reservationId: 'reservation-1',
      bookId: 'book-1', actorId: 'teacher-2', studentSafeStatus: 'ready',
      studentSafeDecision: {
        decidedBy: 'teacher-1', decidedAt: '2026-07-23T00:04:00.000Z', sourceVersionId: 'source-1',
        sha256Hex: 'a'.repeat(64), reasonCode: 'teacher-reviewed',
      },
    })).rejects.toThrow('decision actor is invalid');
  });

  it('retires one verified version without losing its safe history or its sibling', async () => {
    const memory = createMemoryTransaction();
    const repository = createRepository(memory.transaction);
    const reserved = await repository.reserve(reservation());
    const initial = await repository.completeVerified({
      accountId: 'account-1', expectedRevision: reserved.revision, reservationId: 'reservation-1',
      physicalPageCount: 4,
      verifiedAt: '2026-07-23T00:01:00.000Z', verifiedStorage: storage(),
    });
    const replacement = await repository.reserve(reservation({
      expectedRevision: initial.revision, reservationId: 'reservation-2', sourceVersionId: 'source-2',
      providerObjectKey: 'private/book-1/source-2.pdf', kind: 'replacement',
    }));
    const completed = await createRepository(memory.transaction, () => new Date('2026-07-23T00:02:00.000Z')).completeVerified({
      accountId: 'account-1', expectedRevision: replacement.revision, reservationId: 'reservation-2',
      physicalPageCount: 9,
      verifiedAt: '2026-07-23T00:02:00.000Z', verifiedStorage: storage({
        sourceVersionId: 'source-2', providerObjectKey: 'private/book-1/source-2.pdf',
        providerFileId: 'file-2', providerFileVersionId: 'version-2',
      }),
    });
    const decided = await repository.decideStudentSafeSource({
      accountId: 'account-1', expectedRevision: completed.revision, reservationId: 'reservation-1',
      bookId: 'book-1', actorId: 'teacher-1', studentSafeStatus: 'ready',
      studentSafeDecision: {
        decidedBy: 'teacher-1', decidedAt: '2026-07-23T00:02:30.000Z', sourceVersionId: 'source-1',
        sha256Hex: 'a'.repeat(64), reasonCode: 'teacher-reviewed',
      },
    });
    await repository.recordProviderReconciliationContinuation({
      accountId: 'account-1', expectedRevision: decided.revision,
      continuation: { token: 'stale-cursor', updatedAt: '2026-07-23T00:02:01.000Z' },
    });

    const guard = retirementGuard();
    await expect(repository.fenceVerifiedSource({
      accountId: 'account-1', expectedRevision: decided.revision, reservationId: 'reservation-1',
      bookId: 'book-1', sourceVersionId: 'source-1', sourceKey: 'unit-1', ownerId: 'teacher-1',
      verifiedStorage: storage(), deletionId: 'deletion-1',
      retirementGuard: { ...guard, sourceVersionIds: ['source-1'] },
      fencedAt: '2026-07-23T00:02:59.000Z', currentSourceVersionIds: [], remainingActiveSourceVersionIds: [],
    })).rejects.toThrow('source remains referenced or guard is stale');
    await expect(repository.retireVerifiedSource(retireInput({
      expectedRevision: decided.revision, verifiedStorage: storage(),
      retiredAt: '2026-07-23T00:03:00.000Z', deletionId: 'deletion-1', retirementGuard: guard,
    }))).rejects.toThrow('retirement fence is required');
    const fenced = await repository.fenceVerifiedSource({
      accountId: 'account-1', expectedRevision: decided.revision, reservationId: 'reservation-1',
      bookId: 'book-1', sourceVersionId: 'source-1', sourceKey: 'unit-1', ownerId: 'teacher-1',
      verifiedStorage: storage(), deletionId: 'deletion-1', retirementGuard: guard,
      fencedAt: '2026-07-23T00:02:59.000Z', currentSourceVersionIds: [], remainingActiveSourceVersionIds: [],
    });
    expect(fenced.operations['reservation-1']).toMatchObject({ status: 'retirement_pending', retiredDeletionId: 'deletion-1' });
    expect(Object.values(fenced.lifecycleAuditEvents ?? {}).filter((event) => event.transition === 'retirement_pending')).toHaveLength(1);
    const fencedReplay = await repository.fenceVerifiedSource({
      accountId: 'account-1', expectedRevision: fenced.revision, reservationId: 'reservation-1',
      bookId: 'book-1', sourceVersionId: 'source-1', sourceKey: 'unit-1', ownerId: 'teacher-1',
      verifiedStorage: storage(), deletionId: 'deletion-1', retirementGuard: guard,
      fencedAt: '2026-07-23T00:03:01.000Z', currentSourceVersionIds: [], remainingActiveSourceVersionIds: [],
    });
    expect(fencedReplay).toBe(fenced);
    for (const identity of [
      { sourceKey: 'unit-2', ownerId: 'teacher-1' },
      { sourceKey: 'unit-1', ownerId: 'teacher-2' },
    ]) {
      await expect(repository.fenceVerifiedSource({
        accountId: 'account-1', expectedRevision: fenced.revision, reservationId: 'reservation-1',
        bookId: 'book-1', sourceVersionId: 'source-1', sourceKey: identity.sourceKey, ownerId: identity.ownerId,
        verifiedStorage: storage(), deletionId: 'deletion-1', retirementGuard: guard,
        fencedAt: '2026-07-23T00:03:01.000Z', currentSourceVersionIds: [], remainingActiveSourceVersionIds: [],
      })).rejects.toThrow('retirement fence identity conflicts');
      expect(memory.getState()).toBe(fenced);
    }
    await expect(repository.fenceVerifiedSource({
      accountId: 'account-1', expectedRevision: fenced.revision, reservationId: 'reservation-1',
      bookId: 'book-1', sourceVersionId: 'source-other', sourceKey: 'unit-1', ownerId: 'teacher-1',
      verifiedStorage: storage({ sourceVersionId: 'source-other' }), deletionId: 'deletion-1', retirementGuard: guard,
      fencedAt: '2026-07-23T00:03:01.000Z', currentSourceVersionIds: [], remainingActiveSourceVersionIds: [],
    })).rejects.toThrow('retirement fence identity conflicts');
    expect(memory.getState()).toBe(fenced);
    await expect(repository.fenceVerifiedSource({
      accountId: 'account-1', expectedRevision: fenced.revision, reservationId: 'reservation-1',
      bookId: 'book-1', sourceVersionId: 'source-1', sourceKey: 'unit-1', ownerId: 'teacher-1',
      verifiedStorage: storage(), deletionId: 'deletion-1', retirementGuard: guard,
      fencedAt: '2026-07-23T00:03:01.000Z', currentSourceVersionIds: ['source-1'], remainingActiveSourceVersionIds: [],
    })).rejects.toThrow('still actively referenced');
    await expect(repository.fenceVerifiedSource({
      accountId: 'account-1', expectedRevision: fenced.revision, reservationId: 'reservation-1',
      bookId: 'book-1', sourceVersionId: 'source-1', sourceKey: 'unit-1', ownerId: 'teacher-1',
      verifiedStorage: storage(), deletionId: 'deletion-2',
      retirementGuard: { ...guard, deletionId: 'deletion-2' },
      fencedAt: '2026-07-23T00:03:01.000Z', currentSourceVersionIds: [], remainingActiveSourceVersionIds: [],
    })).rejects.toThrow('retirement fence identity conflicts');
    await expect(repository.fenceVerifiedSource({
      accountId: 'account-1', expectedRevision: decided.revision, reservationId: 'reservation-1',
      bookId: 'book-1', sourceVersionId: 'source-1', sourceKey: 'unit-1', ownerId: 'teacher-1',
      verifiedStorage: storage(), deletionId: 'deletion-1', retirementGuard: guard,
      fencedAt: '2026-07-23T00:03:01.000Z', currentSourceVersionIds: [], remainingActiveSourceVersionIds: [],
    })).rejects.toThrow('compare-and-set conflict');
    for (const identity of [
      { sourceKey: 'unit-2', ownerId: 'teacher-1' },
      { sourceKey: 'unit-1', ownerId: 'teacher-2' },
    ]) {
      await expect(repository.retireVerifiedSource(retireInput({
        expectedRevision: fenced.revision, verifiedStorage: storage(),
        sourceKey: identity.sourceKey, ownerId: identity.ownerId,
        retiredAt: '2026-07-23T00:03:00.000Z', deletionId: 'deletion-1', retirementGuard: guard,
      }))).rejects.toThrow('retirement fence identity conflicts');
      expect(memory.getState()).toBe(fenced);
    }
    const retired = await repository.retireVerifiedSource(retireInput({
      expectedRevision: fenced.revision, verifiedStorage: storage(),
      retiredAt: '2026-07-23T00:03:00.000Z', deletionId: 'deletion-1', retirementGuard: guard,
    }));
    expect(retired.capacity.trackedAccountBytes).toBe(10);
    expect(retired.capacity.providerReconciliationContinuation).toBeUndefined();
    expect(retired.assemblyBooks?.['book-1']?.['source-1']).toBeUndefined();
    expect(retired.assemblyBooks?.['book-1']?.['source-2']).toMatchObject({ sourceVersionId: 'source-2' });
    expect(retired.operations['reservation-1']).toMatchObject({
      status: 'retired', sourceVersionId: 'source-1', checksum: storage().checksum,
      purpose: 'book-source', studentSafeStatus: 'ready',
      studentSafeDecision: { sourceVersionId: 'source-1', sha256Hex: 'a'.repeat(64) },
      byteSize: 10, ownerAttestedPhysicalPageCount: 4,
      retiredAt: '2026-07-23T00:03:00.000Z', retirementProof: 'exact_version_deleted', retiredDeletionId: 'deletion-1',
    });
    expect(Object.values(retired.lifecycleAuditEvents ?? {}).filter((event) => event.transition === 'retirement_pending')).toHaveLength(1);
    expect(Object.values(retired.lifecycleAuditEvents ?? {}).filter((event) => event.transition === 'retired')).toHaveLength(1);
    expect(retired.operations['reservation-1']).not.toHaveProperty('providerObjectKey');
    expect(retired.operations['reservation-1']).not.toHaveProperty('verifiedStorage');
    await expect(repository.requestCleanup({
      accountId: 'account-1', expectedRevision: retired.revision, reservationId: 'reservation-1', ownerId: 'teacher-1',
      reason: 'cancel_requested', requestedAt: '2026-07-23T00:03:01.000Z',
    })).rejects.toThrow('verified upload cannot enter cleanup');
    await expect(repository.retireVerifiedSource(retireInput({
      expectedRevision: retired.revision, verifiedStorage: storage(), deletionId: 'deletion-1',
      retiredAt: '2026-07-23T00:03:00.000Z', retirementGuard: guard,
    }))).resolves.toBe(retired);
    expect(retired.capacity.trackedAccountBytes).toBe(10);
    expect(Object.values(retired.lifecycleAuditEvents ?? {}).filter((event) => event.transition === 'retirement_pending')).toHaveLength(1);
    expect(Object.values(retired.lifecycleAuditEvents ?? {}).filter((event) => event.transition === 'retired')).toHaveLength(1);
    await expect(repository.retireVerifiedSource(retireInput({
      expectedRevision: retired.revision, verifiedStorage: storage(), deletionId: 'deletion-2',
      retiredAt: '2026-07-23T00:03:00.000Z', retirementGuard: { ...guard, deletionId: 'deletion-2' },
    }))).rejects.toThrow('replay identity conflicts');
    await expect(repository.retireVerifiedSource(retireInput({
      expectedRevision: completed.revision, verifiedStorage: storage(), deletionId: 'deletion-1',
      retiredAt: '2026-07-23T00:03:00.000Z', retirementGuard: guard,
    }))).rejects.toThrow('compare-and-set conflict');
    await expect(repository.retireVerifiedSource(retireInput({
      expectedRevision: retired.revision, reservationId: 'reservation-2', sourceVersionId: 'source-2',
      verifiedStorage: storage(), deletionId: 'deletion-2',
    }))).rejects.toThrow('retirement fence is required');
    await expect(repository.fenceVerifiedSource({
      accountId: 'account-1', expectedRevision: retired.revision, reservationId: 'reservation-2',
      bookId: 'book-1', sourceVersionId: 'source-2', sourceKey: 'unit-1', ownerId: 'teacher-1',
      verifiedStorage: storage({ sourceVersionId: 'source-2', providerObjectKey: 'private/book-1/source-2.pdf', providerFileId: 'file-2', providerFileVersionId: 'version-2' }),
      deletionId: 'deletion-2', retirementGuard: retirementGuard({ sourceVersionId: 'source-2', deletionId: 'deletion-2' }),
      fencedAt: '2026-07-23T00:03:02.000Z', currentSourceVersionIds: ['source-2'], remainingActiveSourceVersionIds: [],
    })).rejects.toThrow('source remains referenced');

    const corrupted = { ...retired, operations: {
      ...retired.operations,
      'reservation-1': { ...retired.operations['reservation-1'], retirementGuard: undefined },
    } };
    expect(() => validateBookSourceUploadAccountState(corrupted)).toThrow('requires retirement guard');
    for (const operation of [
      { ...fenced.operations['reservation-1'], retirementGuard: undefined },
      { ...fenced.operations['reservation-1'], retirementGuard: { ...guard, deletionId: 'deletion-2' } },
      { ...fenced.operations['reservation-1'], retiredDeletionId: undefined },
      { ...fenced.operations['reservation-1'], retiredDeletionId: 'deletion-2' },
    ]) {
      expect(() => validateBookSourceUploadAccountState({
        ...fenced,
        operations: { ...fenced.operations, 'reservation-1': operation },
      })).toThrow(/retirement-pending/u);
    }
  });

  it('derives provider totals only from canonical verified operations', async () => {
    const memory = createMemoryTransaction();
    const repository = createRepository(memory.transaction);
    await repository.reserve(reservation());
    const completed = await repository.completeVerified({
      accountId: 'account-1',
      expectedRevision: 1,
      reservationId: 'reservation-1',
      physicalPageCount: 4,
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
    })).toThrow('tracked provider bytes undercount verified operations');
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
      physicalPageCount: 4,
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
      physicalPageCount: 4,
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
        physicalPageCount: 4,
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
      physicalPageCount: 4,
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
      capacity: {
        trackedAccountBytes: 0,
        temporaryBytes: 0,
        providerReconciliation: reconciliation(),
      },
    } as BookSourceUploadAccountState);
    const state = await createRepository(memory.transaction).reserve(reservation());
    expect(state.operations['reservation-1']?.status).toBe('reserved');
  });

  it('leases cleanup with CAS and releases capacity exactly once after exact proof', async () => {
    const memory = createMemoryTransaction();
    const repository = createRepository(memory.transaction);
    await repository.reserve(reservation());
    const pending = await repository.requestCleanup({
      accountId: 'account-1',
      expectedRevision: 1,
      reservationId: 'reservation-1',
      ownerId: 'teacher-1',
      reason: 'cancel_requested',
      requestedAt: '2026-07-23T00:01:00.000Z',
      providerFileId: 'file-1',
      providerFileVersionId: 'version-1',
    });
    expect(pending.operations['reservation-1']).toMatchObject({
      status: 'cleanup_pending',
      cleanup: { attempt: 0, providerFileVersionId: 'version-1' },
    });
    const claimed = await repository.claimCleanup({
      accountId: 'account-1',
      expectedRevision: 2,
      reservationId: 'reservation-1',
      leaseOwner: 'reconciler-1',
      claimedAt: '2026-07-23T00:01:00.000Z',
      leaseExpiresAt: '2026-07-23T00:02:00.000Z',
    });
    await expect(repository.claimCleanup({
      accountId: 'account-1',
      expectedRevision: claimed.revision,
      reservationId: 'reservation-1',
      leaseOwner: 'reconciler-2',
      claimedAt: '2026-07-23T00:01:30.000Z',
      leaseExpiresAt: '2026-07-23T00:02:30.000Z',
    })).rejects.toThrow('lease is unavailable');
    const takeover = await repository.claimCleanup({
      accountId: 'account-1',
      expectedRevision: claimed.revision,
      reservationId: 'reservation-1',
      leaseOwner: 'reconciler-2',
      claimedAt: '2026-07-23T00:02:00.000Z',
      leaseExpiresAt: '2026-07-23T00:03:00.000Z',
    });
    expect(takeover.operations['reservation-1']?.cleanup).toMatchObject({
      attempt: 2,
      leaseOwner: 'reconciler-2',
    });
    await expect(repository.releaseCleaned({
      accountId: 'account-1',
      expectedRevision: takeover.revision,
      reservationId: 'reservation-1',
      leaseOwner: 'reconciler-1',
      releasedAt: '2026-07-23T00:02:01.000Z',
      proof: 'exact_version_deleted',
    })).rejects.toThrow('upload cleanup lease mismatch');
    const released = await repository.releaseCleaned({
      accountId: 'account-1',
      expectedRevision: takeover.revision,
      reservationId: 'reservation-1',
      leaseOwner: 'reconciler-2',
      releasedAt: '2026-07-23T00:02:01.000Z',
      proof: 'exact_version_deleted',
    });
    expect(released.operations['reservation-1']).toMatchObject({
      status: 'released',
      releaseProof: 'exact_version_deleted',
    });
    expect(released.capacity.trackedAccountBytes).toBe(0);
    expect(await repository.releaseCleaned({
      accountId: 'account-1',
      expectedRevision: released.revision,
      reservationId: 'reservation-1',
      leaseOwner: 'reconciler-2',
      releasedAt: '2026-07-23T00:02:01.000Z',
      proof: 'exact_version_deleted',
    })).toBe(released);
  });

  it('never proves absence while an issued upload authorization can still finish', async () => {
    const memory = createMemoryTransaction();
    const repository = createRepository(memory.transaction);
    await repository.reserve(reservation());
    const pending = await repository.requestCleanup({
      accountId: 'account-1',
      expectedRevision: 1,
      reservationId: 'reservation-1',
      ownerId: 'teacher-1',
      reason: 'cancel_requested',
      requestedAt: '2026-07-23T00:01:00.000Z',
    });
    expect(pending.operations['reservation-1']?.cleanup?.nextRetryAt)
      .toBe('2026-07-23T00:05:00.000Z');
    await expect(repository.claimCleanup({
      accountId: 'account-1',
      expectedRevision: pending.revision,
      reservationId: 'reservation-1',
      leaseOwner: 'reconciler-1',
      claimedAt: '2026-07-23T00:01:30.000Z',
      leaseExpiresAt: '2026-07-23T00:02:30.000Z',
    })).rejects.toThrow('lease is unavailable');
  });
});

function reservation(overrides: Partial<Parameters<SourceUploadRtdbRepository['reserve']>[0]> = {}) {
  const value = {
    accountId: 'account-1', expectedRevision: 0, reservationId: 'reservation-1', bookId: 'book-1', sourceVersionId: 'source-1', sourceKey: 'unit-1', ownerId: 'teacher-1', storageLocationId: 'location-1',
    providerKind: 'b2', privateBucketId: 'bucket-1', providerObjectKey: 'private/book-1/source-1.pdf', kind: 'initial' as const, byteSize: 10, originalFilename: '  lesson.PDF ',
    purpose: 'book-source' as const, studentSafeStatus: 'unreviewed' as const,
    expectedChecksum: { algorithm: 'sha-256' as const, value: 'a'.repeat(64) }, createdAt: '2026-07-23T00:00:00.000Z', expiresAt: '2026-07-23T00:05:00.000Z', ...overrides,
  };
  return value;
}

function storage(overrides: Record<string, unknown> = {}) {
  return {
    bookId: 'book-1', sourceVersionId: 'source-1', storageLocationId: 'location-1', providerKind: 'b2', privateBucketId: 'bucket-1', providerObjectKey: 'private/book-1/source-1.pdf',
    providerFileId: 'file-1', providerFileVersionId: 'version-1', checksum: { algorithm: 'sha-256' as const, value: 'a'.repeat(64) }, byteSize: 10, ...overrides,
  };
}

function retireInput(
  overrides: Partial<Parameters<SourceUploadRtdbRepository['retireVerifiedSource']>[0]> = {},
) {
  return {
    accountId: 'account-1', expectedRevision: 0, reservationId: 'reservation-1', bookId: 'book-1',
    sourceVersionId: 'source-1', sourceKey: 'unit-1', ownerId: 'teacher-1', verifiedStorage: storage(),
    deletionId: 'deletion-1', proof: 'exact_version_deleted' as const,
    retiredAt: '2026-07-23T00:03:00.000Z', currentSourceVersionIds: [] as readonly string[],
    remainingActiveSourceVersionIds: [] as readonly string[], ...overrides,
  };
}

function retirementGuard(
  overrides: Partial<PublicationRetirementGuard> = {},
) {
  return {
    bookId: 'book-1', sourceVersionId: 'source-1', deletionId: 'deletion-1',
    publicationId: 'publication-1', publicationRevision: 1, manifestVersionId: 'manifest-1',
    sourceSetRevision: 2, inputFingerprint: 'b'.repeat(64), sourceVersionIds: ['source-2'],
    ...overrides,
  } as const;
}

async function canceledSubmissionSource() {
  const memory = createMemoryTransaction();
  const repository = createRepository(memory.transaction);
  const reserved = await repository.reserve(reservation({ submissionOperationId: 'submission-1' }));
  const completed = await repository.completeVerified({
    accountId: 'account-1', expectedRevision: reserved.revision, reservationId: 'reservation-1',
    verifiedAt: '2026-07-23T00:01:00.000Z', verifiedStorage: storage(), physicalPageCount: 7,
  });
  const guard: CanceledSubmissionRetirementGuard = {
    kind: 'canceled-submission', bookId: 'book-1', sourceVersionId: 'source-1', deletionId: 'deletion-1',
    ownerId: 'teacher-1', submissionOperationId: 'submission-1', inputFingerprint: 'b'.repeat(64),
  };
  return { memory, repository, reserved, completed, fenceInput: {
    accountId: 'account-1', expectedRevision: completed.revision, reservationId: 'reservation-1',
    bookId: 'book-1', sourceVersionId: 'source-1', sourceKey: 'unit-1', ownerId: 'teacher-1',
    verifiedStorage: storage(), deletionId: 'deletion-1', retirementGuard: guard,
    fencedAt: '2026-07-23T00:02:00.000Z', currentSourceVersionIds: [], remainingActiveSourceVersionIds: [],
  } };
}

function createMemoryTransaction(
  initialCapacity: { readonly trackedAccountBytes: number; readonly temporaryBytes: number } | null
    = { trackedAccountBytes: 0, temporaryBytes: 0 },
): {
  transaction: SourceUploadRtdbTransaction;
  setState(value: BookSourceUploadAccountState): void;
  getState(): BookSourceUploadAccountState | null;
} {
  let state: BookSourceUploadAccountState | null = initialCapacity === null ? null : {
    revision: 0,
    capacity: {
      ...initialCapacity,
      providerReconciliation: reconciliation(),
    },
    operations: {},
  };
  return {
    setState: (value) => { state = value; },
    getState: () => state,
    transaction: async ({ expectedRevision, update }) => {
      if ((state?.revision ?? 0) !== expectedRevision) return { committed: false, value: state };
      const next = update(state);
      if (next === undefined) return { committed: false, value: state };
      state = next as BookSourceUploadAccountState;
      return { committed: true, value: state };
    },
  };
}

function reconciliation(
  overrides: Partial<NonNullable<BookSourceUploadAccountState['capacity']['providerReconciliation']>> = {},
): NonNullable<BookSourceUploadAccountState['capacity']['providerReconciliation']> {
  return {
    status: 'healthy',
    totalBytes: 0,
    objectCount: 0,
    completedAt: '2026-07-23T00:01:00.000Z',
    ...overrides,
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
