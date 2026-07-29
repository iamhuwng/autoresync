import { describe, expect, it, vi } from 'vitest';

import type { BookSourceUploadAccountState } from '../../types/bookSource.types';
import { SourceProviderError } from './sourceProvider.port';
import { createSourceUploadReconciler } from './sourceLifecycle.service';
import { SourceUploadRtdbRepository } from './sourceUpload.rtdbRepository';
import type { SourceUploadRtdbTransaction } from './sourceUpload.firebaseRtdbTransaction';

const legacyTestVersionReconciliation = (
  provider: {
    deleteExactVersion: (
      input: unknown,
      options?: { timeoutMs?: number },
    ) => Promise<void>;
  },
  resolveExactVersion: (operation: BookSourceUploadAccountState['operations'][string]) =>
    Promise<unknown>,
) => ({
  reconcileOperationVersions: async ({
    operation,
  }: { operation: BookSourceUploadAccountState['operations'][string] }) => {
    const identity = await resolveExactVersion(operation);
    if (!identity) return 'provider_absent' as const;
    const expectedFileId = operation.cleanup?.providerFileId;
    const expectedVersionId = operation.cleanup?.providerFileVersionId;
    if (
      (expectedFileId !== undefined || expectedVersionId !== undefined) &&
      (!identity ||
        (identity as { providerFileId?: string }).providerFileId !== expectedFileId ||
        (identity as { providerFileVersionId?: string }).providerFileVersionId !==
          expectedVersionId)
    ) {
      throw new SourceProviderError('provider_drift', false);
    }
    await provider.deleteExactVersion({ identity }, { timeoutMs: 30_000 });
    return 'exact_versions_deleted' as const;
  },
});

describe('source upload reconciliation', () => {
  it('deletes only exact recorded identity and releases once', async () => {
    const memory = await reservedState();
    const provider = { deleteExactVersion: vi.fn(async () => undefined) };
    const reconciler = createSourceUploadReconciler({
      accountId: 'account-1',
      readAccountState: memory.read,
      authorizeOwner: async ({ actorId }) => actorId === 'teacher-1',
      repository: memory.repository,
      provider,
      resolveExactVersion: vi.fn(async (operation) => ({
        bookId: operation.bookId,
        sourceVersionId: operation.sourceVersionId,
        storageLocationId: operation.storageLocationId,
        providerKind: operation.providerKind,
        privateBucketId: operation.privateBucketId,
        providerObjectKey: operation.providerObjectKey,
        providerFileId: 'file-1',
        providerFileVersionId: 'version-1',
        checksum: operation.expectedChecksum,
        byteSize: operation.byteSize,
      })),
      versionReconciliation: legacyTestVersionReconciliation(
        provider,
        async (operation) => ({
          bookId: operation.bookId,
          sourceVersionId: operation.sourceVersionId,
          storageLocationId: operation.storageLocationId,
          providerKind: operation.providerKind,
          privateBucketId: operation.privateBucketId,
          providerObjectKey: operation.providerObjectKey,
          providerFileId: 'file-1',
          providerFileVersionId: 'version-1',
          checksum: operation.expectedChecksum,
          byteSize: operation.byteSize,
        }),
      ),
      clock: sequenceClock(
        '2026-07-23T00:01:00.000Z',
        '2026-07-23T00:01:30.000Z',
      ),
      leaseOwner: 'reconciler-1',
    });
    await reconciler.requestCleanup({
      actorId: 'teacher-1',
      bookId: 'book-1',
      reservationId: 'reservation-1',
      reason: 'cancel_requested',
      providerFileId: 'file-1',
      providerFileVersionId: 'version-1',
    });
    const result = await reconciler.reconcile({
      actorId: 'teacher-1',
      bookId: 'book-1',
      reservationId: 'reservation-1',
    });
    expect(result).toMatchObject({ status: 'released', retryKind: 'none' });
    expect(provider.deleteExactVersion).toHaveBeenCalledWith({
      identity: expect.objectContaining({
        providerObjectKey: 'private/book-1/source-1.pdf',
        providerFileId: 'file-1',
        providerFileVersionId: 'version-1',
      }),
    }, { timeoutMs: 30_000 });
  });

  it('releases only after bounded multi-version reconciliation proves the exact key clean', async () => {
    const memory = await reservedState();
    const versionReconciliation = {
      reconcileOperationVersions: vi.fn(async () => 'exact_versions_deleted' as const),
    };
    const provider = { deleteExactVersion: vi.fn(async () => undefined) };
    const reconciler = createSourceUploadReconciler({
      accountId: 'account-1',
      readAccountState: memory.read,
      authorizeOwner: () => true,
      repository: memory.repository,
      provider,
      versionReconciliation,
      resolveExactVersion: vi.fn(),
      clock: sequenceClock(
        '2026-07-23T00:06:00.000Z',
        '2026-07-23T00:06:01.000Z',
      ),
      leaseOwner: 'reconciler-versions',
    });

    await expect(reconciler.reconcile({
      actorId: 'teacher-1',
      bookId: 'book-1',
      reservationId: 'reservation-1',
    })).resolves.toMatchObject({ status: 'released', retryKind: 'none' });

    expect(versionReconciliation.reconcileOperationVersions).toHaveBeenCalledWith({
      operation: expect.objectContaining({
        providerObjectKey: 'private/book-1/source-1.pdf',
      }),
    }, { timeoutMs: 30_000 });
    expect(provider.deleteExactVersion).not.toHaveBeenCalled();
    expect((await memory.read())?.operations['reservation-1']).toMatchObject({
      status: 'released',
      releaseProof: 'exact_version_deleted',
    });
  });

  it('preserves the committed version while reconciling expired completed operations', async () => {
    const memory = await reservedState();
    const state = (await memory.read())!;
    const operation = state.operations['reservation-1']!;
    const verifiedStorage = {
      bookId: operation.bookId,
      sourceVersionId: operation.sourceVersionId,
      storageLocationId: operation.storageLocationId,
      providerKind: operation.providerKind,
      privateBucketId: operation.privateBucketId,
      providerObjectKey: operation.providerObjectKey,
      providerFileId: 'file-1',
      providerFileVersionId: 'file-1',
      checksum: operation.expectedChecksum,
      byteSize: operation.byteSize,
    };
    await memory.repository.completeVerified({
      accountId: 'account-1',
      expectedRevision: state.revision,
      reservationId: 'reservation-1',
      verifiedAt: '2026-07-23T00:01:00.000Z',
      verifiedStorage,
    });
    const versionReconciliation = {
      reconcileOperationVersions: vi.fn(async () => 'committed_version_preserved' as const),
    };
    const reconciler = createSourceUploadReconciler({
      accountId: 'account-1',
      readAccountState: memory.read,
      authorizeOwner: () => true,
      repository: memory.repository,
      provider: { deleteExactVersion: vi.fn() },
      versionReconciliation,
      resolveExactVersion: vi.fn(),
      clock: () => new Date('2026-07-23T00:06:00.000Z'),
      leaseOwner: 'reconciler-preserve',
    });

    await expect(reconciler.reconcile({
      actorId: 'teacher-1',
      bookId: 'book-1',
      reservationId: 'reservation-1',
    })).resolves.toMatchObject({ status: 'verified_completed', retryKind: 'none' });
    expect(versionReconciliation.reconcileOperationVersions).toHaveBeenCalledWith({
      operation: expect.objectContaining({ status: 'verified_completed' }),
      preserveIdentity: verifiedStorage,
    }, { timeoutMs: 30_000 });
    expect((await memory.read())?.capacity.trackedAccountBytes).toBe(operation.byteSize);
  });

  it('keeps capacity and safe retry metadata on provider failure', async () => {
    const memory = await reservedState();
    const reconciler = createSourceUploadReconciler({
      accountId: 'account-1',
      readAccountState: memory.read,
      authorizeOwner: () => true,
      repository: memory.repository,
      provider: {
        deleteExactVersion: async () => {
          throw new SourceProviderError('timeout', true);
        },
      },
      resolveExactVersion: async (operation) => ({
        bookId: operation.bookId,
        sourceVersionId: operation.sourceVersionId,
        storageLocationId: operation.storageLocationId,
        providerKind: operation.providerKind,
        privateBucketId: operation.privateBucketId,
        providerObjectKey: operation.providerObjectKey,
        providerFileId: 'file-1',
        providerFileVersionId: 'version-1',
        checksum: operation.expectedChecksum,
        byteSize: operation.byteSize,
      }),
      versionReconciliation: legacyTestVersionReconciliation(
        {
          deleteExactVersion: async () => {
            throw new SourceProviderError('timeout', true);
          },
        },
        async (operation) => ({
          bookId: operation.bookId,
          sourceVersionId: operation.sourceVersionId,
          storageLocationId: operation.storageLocationId,
          providerKind: operation.providerKind,
          privateBucketId: operation.privateBucketId,
          providerObjectKey: operation.providerObjectKey,
          providerFileId: 'file-1',
          providerFileVersionId: 'version-1',
          checksum: operation.expectedChecksum,
          byteSize: operation.byteSize,
        }),
      ),
      clock: sequenceClock(
        '2026-07-23T00:06:00.000Z',
        '2026-07-23T00:06:01.000Z',
      ),
      leaseOwner: 'reconciler-1',
    });
    await expect(reconciler.reconcile({
      actorId: 'teacher-1',
      bookId: 'book-1',
      reservationId: 'reservation-1',
    })).rejects.toMatchObject({ code: 'cleanup_pending' });
    const state = await memory.read();
    expect(state?.operations['reservation-1']).toMatchObject({
      status: 'cleanup_pending',
      cleanup: { attempt: 1, lastErrorCode: 'timeout' },
    });
    expect(state?.capacity.trackedAccountBytes).toBe(0);
  });

  it('releases only typed provider absence and retains generic metadata mismatch', async () => {
    for (const [code, expectedStatus] of [
      ['not_found', 'released'],
      ['metadata_mismatch', 'cleanup_pending'],
    ] as const) {
      const memory = await reservedState();
      const reconciler = createSourceUploadReconciler({
        accountId: 'account-1',
        readAccountState: memory.read,
        authorizeOwner: () => true,
        repository: memory.repository,
        provider: {
          deleteExactVersion: async () => {
            throw new SourceProviderError(code, false);
          },
        },
        resolveExactVersion: async (operation) => ({
          bookId: operation.bookId,
          sourceVersionId: operation.sourceVersionId,
          storageLocationId: operation.storageLocationId,
          providerKind: operation.providerKind,
          privateBucketId: operation.privateBucketId,
          providerObjectKey: operation.providerObjectKey,
          providerFileId: 'file-1',
          providerFileVersionId: 'version-1',
          checksum: operation.expectedChecksum,
          byteSize: operation.byteSize,
        }),
        versionReconciliation: legacyTestVersionReconciliation(
          {
            deleteExactVersion: async () => {
              throw new SourceProviderError(code, false);
            },
          },
          async (operation) => ({
            bookId: operation.bookId,
            sourceVersionId: operation.sourceVersionId,
            storageLocationId: operation.storageLocationId,
            providerKind: operation.providerKind,
            privateBucketId: operation.privateBucketId,
            providerObjectKey: operation.providerObjectKey,
            providerFileId: 'file-1',
            providerFileVersionId: 'version-1',
            checksum: operation.expectedChecksum,
            byteSize: operation.byteSize,
          }),
        ),
        clock: sequenceClock(
          '2026-07-23T00:06:00.000Z',
          '2026-07-23T00:06:01.000Z',
        ),
        leaseOwner: `reconciler-${code}`,
      });
      const result = reconciler.reconcile({
        actorId: 'teacher-1',
        bookId: 'book-1',
        reservationId: 'reservation-1',
      });
      if (expectedStatus === 'released') {
        await expect(result).resolves.toMatchObject({ status: 'released' });
      } else {
        await expect(result).rejects.toMatchObject({ code: 'cleanup_pending' });
        expect((await memory.read())?.operations['reservation-1']?.cleanup)
          .toMatchObject({ lastErrorCode: 'metadata_mismatch' });
      }
    }
  });

  it('replays safely after deletion succeeds but release persistence crashes', async () => {
    const memory = await reservedState();
    const releaseCleaned = vi.fn()
      .mockRejectedValueOnce(new Error('lost release write'))
      .mockImplementation((input) => memory.repository.releaseCleaned(input));
    const provider = { deleteExactVersion: vi.fn(async () => undefined) };
    const resolveExactVersion = vi.fn()
      .mockImplementationOnce(async (operation: BookSourceUploadAccountState['operations'][string]) => ({
        bookId: operation.bookId,
        sourceVersionId: operation.sourceVersionId,
        storageLocationId: operation.storageLocationId,
        providerKind: operation.providerKind,
        privateBucketId: operation.privateBucketId,
        providerObjectKey: operation.providerObjectKey,
        providerFileId: 'file-1',
        providerFileVersionId: 'version-1',
        checksum: operation.expectedChecksum,
        byteSize: operation.byteSize,
      }))
      .mockResolvedValueOnce(null);
    const reconciler = createSourceUploadReconciler({
      accountId: 'account-1',
      readAccountState: memory.read,
      authorizeOwner: () => true,
      repository: {
        requestCleanup: memory.repository.requestCleanup.bind(memory.repository),
        claimCleanup: memory.repository.claimCleanup.bind(memory.repository),
        failCleanup: memory.repository.failCleanup.bind(memory.repository),
        releaseCleaned,
        recordCommittedVersionReconciliationFailure:
          memory.repository.recordCommittedVersionReconciliationFailure.bind(memory.repository),
        clearCommittedVersionReconciliationFailure:
          memory.repository.clearCommittedVersionReconciliationFailure.bind(memory.repository),
      },
      provider,
      resolveExactVersion,
      versionReconciliation: legacyTestVersionReconciliation(provider, resolveExactVersion),
      clock: sequenceClock(
        '2026-07-23T00:06:00.000Z',
        '2026-07-23T00:06:01.000Z',
        '2026-07-23T00:06:02.000Z',
        '2026-07-23T00:06:05.000Z',
        '2026-07-23T00:06:06.000Z',
      ),
      leaseOwner: 'reconciler-crash',
    });
    await expect(reconciler.reconcile({
      actorId: 'teacher-1', bookId: 'book-1', reservationId: 'reservation-1',
    })).rejects.toMatchObject({ code: 'cleanup_pending' });
    await expect(reconciler.reconcile({
      actorId: 'teacher-1', bookId: 'book-1', reservationId: 'reservation-1',
    })).resolves.toMatchObject({ status: 'released' });
    expect(provider.deleteExactVersion).toHaveBeenCalledTimes(1);
    expect((await memory.read())?.operations['reservation-1']).toMatchObject({
      status: 'released',
      releaseProof: 'provider_absent',
    });
  });

  it('allows only one reconciler to delete while its lease is active', async () => {
    const memory = await reservedState();
    let finishDelete!: () => void;
    const provider = {
      deleteExactVersion: vi.fn(() => new Promise<void>((resolve) => {
        finishDelete = resolve;
      })),
    };
    const reconciler = createSourceUploadReconciler({
      accountId: 'account-1',
      readAccountState: memory.read,
      authorizeOwner: () => true,
      repository: memory.repository,
      provider,
      resolveExactVersion: async (operation) => ({
        bookId: operation.bookId,
        sourceVersionId: operation.sourceVersionId,
        storageLocationId: operation.storageLocationId,
        providerKind: operation.providerKind,
        privateBucketId: operation.privateBucketId,
        providerObjectKey: operation.providerObjectKey,
        providerFileId: 'file-1',
        providerFileVersionId: 'version-1',
        checksum: operation.expectedChecksum,
        byteSize: operation.byteSize,
      }),
      versionReconciliation: legacyTestVersionReconciliation(provider, async (operation) => ({
        bookId: operation.bookId,
        sourceVersionId: operation.sourceVersionId,
        storageLocationId: operation.storageLocationId,
        providerKind: operation.providerKind,
        privateBucketId: operation.privateBucketId,
        providerObjectKey: operation.providerObjectKey,
        providerFileId: 'file-1',
        providerFileVersionId: 'version-1',
        checksum: operation.expectedChecksum,
        byteSize: operation.byteSize,
      })),
      clock: () => new Date('2026-07-23T00:06:00.000Z'),
      leaseOwner: 'reconciler-concurrent',
    });
    const input = {
      actorId: 'teacher-1',
      bookId: 'book-1',
      reservationId: 'reservation-1',
    };
    const winner = reconciler.reconcile(input);
    await vi.waitFor(() => expect(provider.deleteExactVersion).toHaveBeenCalledTimes(1));
    await expect(reconciler.reconcile(input)).rejects.toThrow('lease is unavailable');
    finishDelete();
    await expect(winner).resolves.toMatchObject({ status: 'released' });
    expect(provider.deleteExactVersion).toHaveBeenCalledTimes(1);
  });

  it('keeps a committed version usable while sibling cleanup failure remains retryable', async () => {
    const memory = await reservedState();
    await memory.repository.completeVerified({
      accountId: 'account-1',
      expectedRevision: 1,
      reservationId: 'reservation-1',
      verifiedAt: '2026-07-23T00:01:00.000Z',
      verifiedStorage: {
        bookId: 'book-1',
        sourceVersionId: 'source-1',
        storageLocationId: 'location-1',
        providerKind: 'b2',
        privateBucketId: 'bucket-1',
        providerObjectKey: 'private/book-1/source-1.pdf',
        providerFileId: 'committed-file',
        providerFileVersionId: 'committed-version',
        checksum: { algorithm: 'sha-256', value: 'a'.repeat(64) },
        byteSize: 10,
      },
    });
    const versionReconciliation = {
      reconcileOperationVersions: vi.fn()
        .mockRejectedValueOnce(new SourceProviderError('timeout', true))
        .mockResolvedValueOnce('committed_version_preserved' as const),
    };
    const reconciler = createSourceUploadReconciler({
      accountId: 'account-1',
      readAccountState: memory.read,
      authorizeOwner: () => true,
      repository: memory.repository,
      provider: { deleteExactVersion: vi.fn(async () => undefined) },
      versionReconciliation,
      resolveExactVersion: vi.fn(),
      clock: sequenceClock(
        '2026-07-23T00:06:00.000Z',
        '2026-07-23T00:06:01.000Z',
        '2026-07-23T00:06:02.000Z',
        '2026-07-23T00:06:04.000Z',
      ),
      leaseOwner: 'reconciler-committed',
    });
    const input = {
      actorId: 'teacher-1',
      bookId: 'book-1',
      reservationId: 'reservation-1',
    };

    await expect(reconciler.reconcile(input))
      .rejects.toMatchObject({ code: 'cleanup_pending' });
    expect(await reconciler.status(input)).toMatchObject({
      status: 'verified_completed',
      retryKind: 'cleanup',
      nextRetryAt: '2026-07-23T00:06:03.000Z',
      lastErrorCode: 'timeout',
    });
    expect((await memory.read())?.operations['reservation-1']).toMatchObject({
      status: 'verified_completed',
      verifiedStorage: { providerFileVersionId: 'committed-version' },
      versionReconciliation: { attempt: 1, lastErrorCode: 'timeout' },
    });
    await expect(reconciler.reconcile(input))
      .rejects.toMatchObject({ code: 'operation_not_eligible' });
    expect(versionReconciliation.reconcileOperationVersions).toHaveBeenCalledTimes(1);
    await expect(reconciler.reconcile(input)).resolves.toMatchObject({
      status: 'verified_completed',
      retryKind: 'none',
    });
    expect((await memory.read())?.operations['reservation-1']?.versionReconciliation)
      .toBeUndefined();
    expect(versionReconciliation.reconcileOperationVersions).toHaveBeenCalledTimes(2);
  });

  it('fails cross-owner access before provider work', async () => {
    const memory = await reservedState();
    const provider = { deleteExactVersion: vi.fn(async () => undefined) };
    const reconciler = createSourceUploadReconciler({
      accountId: 'account-1',
      readAccountState: memory.read,
      authorizeOwner: () => true,
      repository: memory.repository,
      provider,
      resolveExactVersion: vi.fn(),
      clock: () => new Date('2026-07-23T00:06:00.000Z'),
      leaseOwner: 'reconciler-1',
    });
    await expect(reconciler.reconcile({
      actorId: 'teacher-2',
      bookId: 'book-1',
      reservationId: 'reservation-1',
    })).rejects.toMatchObject({ code: 'authority_denied' });
    expect(provider.deleteExactVersion).not.toHaveBeenCalled();
  });

  it('retains capacity when trusted metadata disagrees with caller-supplied identity', async () => {
    const memory = await reservedState();
    const provider = { deleteExactVersion: vi.fn(async () => undefined) };
    const reconciler = createSourceUploadReconciler({
      accountId: 'account-1',
      readAccountState: memory.read,
      authorizeOwner: () => true,
      repository: memory.repository,
      provider,
      resolveExactVersion: async (operation) => ({
        bookId: operation.bookId,
        sourceVersionId: operation.sourceVersionId,
        storageLocationId: operation.storageLocationId,
        providerKind: operation.providerKind,
        privateBucketId: operation.privateBucketId,
        providerObjectKey: operation.providerObjectKey,
        providerFileId: 'other-file',
        providerFileVersionId: 'other-version',
        checksum: operation.expectedChecksum,
        byteSize: operation.byteSize,
      }),
      versionReconciliation: legacyTestVersionReconciliation(provider, async (operation) => ({
        bookId: operation.bookId,
        sourceVersionId: operation.sourceVersionId,
        storageLocationId: operation.storageLocationId,
        providerKind: operation.providerKind,
        privateBucketId: operation.privateBucketId,
        providerObjectKey: operation.providerObjectKey,
        providerFileId: 'other-file',
        providerFileVersionId: 'other-version',
        checksum: operation.expectedChecksum,
        byteSize: operation.byteSize,
      })),
      clock: sequenceClock(
        '2026-07-23T00:01:00.000Z',
        '2026-07-23T00:01:01.000Z',
      ),
      leaseOwner: 'reconciler-1',
    });
    await reconciler.requestCleanup({
      actorId: 'teacher-1',
      bookId: 'book-1',
      reservationId: 'reservation-1',
      reason: 'cancel_requested',
      providerFileId: 'file-1',
      providerFileVersionId: 'version-1',
    });
    await expect(reconciler.reconcile({
      actorId: 'teacher-1',
      bookId: 'book-1',
      reservationId: 'reservation-1',
    })).rejects.toMatchObject({ code: 'cleanup_pending' });
    expect(provider.deleteExactVersion).not.toHaveBeenCalled();
    expect((await memory.read())?.operations['reservation-1']).toMatchObject({
      status: 'cleanup_pending',
      cleanup: { lastErrorCode: 'provider_drift' },
    });
  });
});

const sequenceClock = (...values: string[]) => {
  let index = 0;
  return () => new Date(values[Math.min(index++, values.length - 1)]!);
};

const reservedState = async () => {
  let state: BookSourceUploadAccountState | null = {
    revision: 0,
    capacity: { trackedAccountBytes: 0, temporaryBytes: 0 },
    operations: {},
  };
  const transaction: SourceUploadRtdbTransaction = async ({ expectedRevision, update }) => {
    if ((state?.revision ?? 0) !== expectedRevision) return { committed: false, value: state };
    const next = update(state);
    if (!next) return { committed: false, value: state };
    state = next as BookSourceUploadAccountState;
    return { committed: true, value: state };
  };
  const repository = new SourceUploadRtdbRepository(transaction, {
    now: () => new Date('2026-07-23T00:01:00.000Z'),
  });
  state = await repository.reserve({
    accountId: 'account-1',
    expectedRevision: 0,
    reservationId: 'reservation-1',
    bookId: 'book-1',
    sourceVersionId: 'source-1',
    sourceKey: 'unit-1',
    ownerId: 'teacher-1',
    storageLocationId: 'location-1',
    providerKind: 'b2',
    privateBucketId: 'bucket-1',
    providerObjectKey: 'private/book-1/source-1.pdf',
    kind: 'initial',
    byteSize: 10,
    originalFilename: 'lesson.pdf',
    expectedChecksum: { algorithm: 'sha-256', value: 'a'.repeat(64) },
    createdAt: '2026-07-23T00:00:00.000Z',
    expiresAt: '2026-07-23T00:05:00.000Z',
  });
  return {
    repository,
    read: async () => state,
  };
};
