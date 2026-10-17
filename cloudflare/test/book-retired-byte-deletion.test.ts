import { describe, expect, it, vi } from 'vitest';

import type {
  BookSourceUploadAccountState,
  BookSourceVersionStorageIdentity,
} from '../../src/types/bookSource.types.ts';
import type { SourceUploadRtdbTransaction } from '../../src/services/book-source-delivery/sourceUpload.firebaseRtdbTransaction.ts';
import {
  SourceUploadRtdbRepository,
} from '../../src/services/book-source-delivery/sourceUpload.rtdbRepository.ts';
import type {
  ReplacementSagaRecord,
} from '../src/upload-worker/book-delivery/replacement-saga/contract.ts';
import fragment from '../src/upload-worker/book-rules/fragments/47.json';
import {
  InMemoryRetiredByteDeletionRepository,
} from '../src/upload-worker/book-delivery/retired-byte-deletion/repository.ts';
import type {
  RetiredByteCapacityAuthority,
  RetiredByteContextReadback,
  RetiredByteSourceAuthority,
} from '../src/upload-worker/book-delivery/retired-byte-deletion/contract.ts';
import {
  createRetiredByteDeletionOwner,
} from '../src/upload-worker/book-delivery/retired-byte-deletion/service.ts';

const identity: BookSourceVersionStorageIdentity = {
  bookId: 'book-1',
  sourceVersionId: 'source-old',
  storageLocationId: 'b2-primary',
  providerKind: 'backblaze-b2-s3',
  privateBucketId: 'bucket-1',
  providerObjectKey: 'book-source/book-1/source-old.pdf',
  providerFileId: '4_file-old',
  providerFileVersionId: '4_file-old',
  checksum: { algorithm: 'sha-256', value: 'a'.repeat(64) },
  byteSize: 12,
};

const fixedNow = '2026-08-11T05:00:00.000Z';
const retirementGuard = {
  bookId: 'book-1',
  sourceVersionId: 'source-old',
  deletionId: 'deletion-1',
  publicationId: 'publication-1',
  publicationRevision: 1,
  manifestVersionId: 'manifest-1',
  sourceSetRevision: 2,
  inputFingerprint: 'b'.repeat(64),
  sourceVersionIds: ['source-new'],
} as const;

const sourceAuthority = {
  storage: identity,
  sourceKey: 'unit-1',
  ownerId: 'teacher-1',
  status: 'retirement_pending' as const,
  purpose: 'book-source' as const,
  studentSafeStatus: 'ready' as const,
  studentSafeDecision: {
    decidedBy: 'teacher-1',
    decidedAt: fixedNow,
    sourceVersionId: 'source-old',
    sha256Hex: 'a'.repeat(64),
    reasonCode: 'teacher-reviewed' as const,
  },
  retirementGuard,
  retiredDeletionId: 'deletion-1',
};

const operationId = 'saga-1:retired-byte-deletion';

const saga = {
  schemaVersion: 1,
  sagaId: 'saga-1',
  ownerId: 'teacher-1',
  bookId: 'book-1',
  planId: 'plan-1',
  reviewId: 'review-1',
  idempotencyKey: 'replace-1',
  tokenHash: 'a'.repeat(64),
  requestFingerprint: 'b'.repeat(64),
  planFingerprint: 'c'.repeat(64),
  deltaFingerprint: 'd'.repeat(64),
  snapshotFingerprint: 'e'.repeat(64),
  adapterFingerprint: 'f'.repeat(64),
  revisionVector: { book: 1 },
  sourceSetDelta: {} as never,
  sourceVersionIds: ['source-old'],
  targetSourceSetRevision: 2,
  contexts: {
    'context-1': {
      contextKey: 'context-1',
      contextKind: 'homework',
      classification: 'assigned',
      lifecycle: 'active',
      status: 'active',
      sourceScopes: [{ sourceKey: 'full', pageCount: 1, placementCount: 1 }],
      state: 'retired-revoked',
      stateRevision: 1,
      operationId: 'saga-1:context:context-1',
    },
  },
  state: 'contexts-pending',
  stateRevision: 4,
  acceptedAt: fixedNow,
  updatedAt: fixedNow,
  stagedReceipt: 'a'.repeat(64),
  visibility: { receipt: 'b'.repeat(64), visibleAt: fixedNow },
  retiredByteHandoff: null,
  audit: {
    itemCount: 1,
    retiredItemCount: 1,
    oldSourceVersionIds: ['source-old'],
    newSourceVersionIds: ['source-new'],
    events: [],
  },
  recovery: {
    resumeBehavior: 'forward-only-after-visible',
    rollbackBoundary: 'staged-only',
    contextOwner: '#117',
    retiredByteOwner: '#119',
  },
} as unknown as ReplacementSagaRecord;

const proof = (overrides: Partial<RetiredByteContextReadback> = {}): RetiredByteContextReadback => ({
  complete: true as const,
  sagaId: saga.sagaId,
  ownerId: saga.ownerId,
  bookId: saga.bookId,
  contextKey: 'context-1',
  operationId: 'saga-1:context:context-1',
  contextRevision: 1,
  immutableActivityWorkFingerprint: '1'.repeat(64),
  authorityStatus: 'adopted' as const,
  retiredDeliveries: [{
    deliveryId: 'delivery-old',
    bindingId: 'binding-old',
    bindingRevision: 1,
    sourceVersionIds: ['source-old'],
    status: 'revoked' as const,
  }],
  currentSourceVersionIds: ['source-new'],
  remainingActiveSourceVersionIds: [],
  ...overrides,
});

const makeHarness = (options: {
  readonly providerPresent?: boolean;
  readonly deleteBehavior?: 'success' | 'before-crash' | 'after-crash';
  readonly capacityBehavior?: 'success' | 'crash';
  readonly contextProof?: () => RetiredByteContextReadback;
  readonly sourceAuthority?: typeof sourceAuthority | null;
  readonly publicationGuard?: typeof retirementGuard;
  readonly driftAtCapacity?: boolean;
  readonly driftDuringProviderRead?: boolean;
  readonly sourceVersions?: RetiredByteSourceAuthority;
  readonly capacity?: RetiredByteCapacityAuthority;
  readonly publicationAuthority?: boolean;
} = {}) => {
  const repository = new InMemoryRetiredByteDeletionRepository();
  let providerPresent = options.providerPresent ?? true;
  let deleteBehavior = options.deleteBehavior ?? 'success';
  let driftAtCapacity = options.driftAtCapacity ?? false;
  let providerReads = 0;
  const events: string[] = [];
  const provider = {
    resolveExactVersion: vi.fn(async () => {
      providerReads += 1;
      events.push('provider-read');
      if (options.driftDuringProviderRead && providerReads === 3) {
        currentPublicationGuard = { ...retirementGuard, publicationRevision: 2 };
      }
      return providerPresent ? identity : null;
    }),
    deleteExactVersion: vi.fn(async ({ identity: requested }) => {
      events.push(`provider-delete:${requested.providerFileId}:${requested.providerFileVersionId}`);
      if (deleteBehavior === 'before-crash') throw new Error('crash-before-provider-effect');
      providerPresent = false;
      if (deleteBehavior === 'after-crash') throw new Error('crash-after-provider-effect');
    }),
  };
  let capacitySettled = false;
  const capacity = options.capacity ?? {
    settle: vi.fn(async () => {
      events.push('capacity-settle');
      if (driftAtCapacity) {
        driftAtCapacity = false;
        currentPublicationGuard = { ...retirementGuard, publicationRevision: 2 };
        throw new Error('publication guard drift');
      }
      if (options.capacityBehavior === 'crash') throw new Error('capacity-unavailable');
      if (capacitySettled) return 'replayed' as const;
      capacitySettled = true;
      return 'settled' as const;
    }),
  };
  const contexts = {
    readRevocation: vi.fn(async () => options.contextProof?.() ?? proof()),
  };
  let currentPublicationGuard = options.publicationGuard ?? retirementGuard;
  const owner = createRetiredByteDeletionOwner({
    repository,
    sourceVersions: options.sourceVersions ?? { readVersion: vi.fn(async () => options.sourceAuthority === undefined ? sourceAuthority : options.sourceAuthority) },
    publicationGuard: options.publicationAuthority === false
      ? undefined
      : { readCurrentGuard: vi.fn(async () => currentPublicationGuard) },
    contexts,
    provider,
    capacity,
    enabled: true,
    now: () => new Date(fixedNow),
  });
  return { repository, owner, provider, capacity, contexts, events, setProviderPresent: (value: boolean) => { providerPresent = value; }, setDeleteBehavior: (value: 'success' | 'before-crash' | 'after-crash') => { deleteBehavior = value; }, setPublicationGuard: (value: typeof retirementGuard) => { currentPublicationGuard = value; } };
};

const enqueue = async (owner: ReturnType<typeof createRetiredByteDeletionOwner>) => {
  await expect(owner.enqueueExactDeletion({
    saga,
    operationId,
    sourceVersionIds: ['source-old'],
    precondition: 'all-contexts-retired-deliveries-revoked',
    deletionId: 'deletion-1',
  })).resolves.toEqual({ status: 'queued' });
};

const createSourceRetirementOwner = () => {
  let sourceState: BookSourceUploadAccountState = {
    revision: 0,
    capacity: {
      trackedAccountBytes: identity.byteSize,
      temporaryBytes: 0,
      providerReconciliation: {
        status: 'healthy',
        totalBytes: identity.byteSize,
        objectCount: 1,
        completedAt: fixedNow,
      },
    },
    operations: {
      'reservation-1': {
        reservationId: 'reservation-1',
        bookId: 'book-1',
        sourceVersionId: 'source-old',
        sourceKey: 'unit-1',
        ownerId: 'teacher-1',
        storageLocationId: 'b2-primary',
        providerKind: 'backblaze-b2-s3',
        privateBucketId: 'bucket-1',
        providerObjectKey: identity.providerObjectKey,
        kind: 'replacement',
        purpose: 'book-source',
        studentSafeStatus: 'ready',
        studentSafeDecision: sourceAuthority.studentSafeDecision,
        byteSize: identity.byteSize,
        originalFilename: 'source.pdf',
        expectedChecksum: identity.checksum,
        createdAt: fixedNow,
        expiresAt: '2026-08-11T05:05:00.000Z',
        status: 'retirement_pending',
        physicalPageCount: 1,
        verifiedStorage: identity,
        completedAt: fixedNow,
        retirementGuard,
        retiredDeletionId: 'deletion-1',
        retirementPendingAt: fixedNow,
      },
    },
  };
  const transaction: SourceUploadRtdbTransaction = async (input) => {
    if (sourceState.revision !== input.expectedRevision) {
      return { committed: false, value: sourceState as never };
    }
    const next = input.update(sourceState as never);
    sourceState = next as never;
    return { committed: true, value: sourceState as never };
  };
  const sourceRepository = new SourceUploadRtdbRepository(transaction, { now: () => new Date(fixedNow) });
  const readVersion: RetiredByteSourceAuthority['readVersion'] = async () => {
    const operation = sourceState.operations['reservation-1'];
    if (!operation || !operation.verifiedStorage) return null;
    return {
      storage: operation.verifiedStorage,
      sourceKey: operation.sourceKey,
      ownerId: operation.ownerId,
      status: operation.status,
      purpose: operation.purpose,
      studentSafeStatus: operation.studentSafeStatus,
      studentSafeDecision: operation.studentSafeDecision,
      retirementGuard: operation.retirementGuard,
      retiredDeletionId: operation.retiredDeletionId,
    };
  };
  const publication = { current: retirementGuard };
  const sourceVersions: RetiredByteSourceAuthority = { readVersion };
  const capacity: RetiredByteCapacityAuthority = {
    settle: vi.fn(async (input) => {
      const current = publication.current;
      if (JSON.stringify(current) !== JSON.stringify(input.publicationGuard)) throw new Error('publication guard drift');
      const proofReadback = await contextAuthority.readRevocation({
        sagaId: saga.sagaId,
        ownerId: saga.ownerId,
        bookId: saga.bookId,
        contextKey: 'context-1',
        operationId: 'saga-1:context:context-1',
        sourceVersionIds: ['source-old'],
      });
      if (!proofReadback
        || proofReadback.currentSourceVersionIds.includes('source-old')
        || proofReadback.remainingActiveSourceVersionIds.includes('source-old')) {
        throw new Error('source still referenced');
      }
      const operation = sourceState.operations['reservation-1']!;
      const before = operation.status;
      await sourceRepository.retireVerifiedSource({
        accountId: 'account-1',
        expectedRevision: sourceState.revision,
        reservationId: operation.reservationId,
        bookId: operation.bookId,
        sourceVersionId: operation.sourceVersionId,
        sourceKey: operation.sourceKey,
        ownerId: operation.ownerId,
        verifiedStorage: input.identity,
        deletionId: input.sourceRetirement.deletionId,
        proof: input.sourceRetirement.proof === 'provider-already-absent' ? 'provider_absent' : 'exact_version_deleted',
        retiredAt: fixedNow,
        currentSourceVersionIds: [],
        remainingActiveSourceVersionIds: [],
        retirementGuard: input.sourceRetirement.publicationGuard,
      });
      return before === 'retired' ? 'replayed' : 'settled';
    }),
  };
  const contextAuthority = {
    readRevocation: vi.fn(async () => proof()),
  };
  const harness = makeHarness({ sourceVersions, capacity });
  return { ...harness, sourceState: () => sourceState, contextAuthority };
};

describe('#119 retired-byte deletion owner', () => {
  it('settles the Source retirement CAS before settling the deletion record', async () => {
    const harness = createSourceRetirementOwner();
    await enqueue(harness.owner);
    await expect(harness.owner.execute({ ownerId: 'teacher-1', deletionId: 'deletion-1' }))
      .resolves.toMatchObject({ status: 'settled', record: { state: 'settled' } });
    expect(harness.sourceState().operations['reservation-1']).toMatchObject({
      status: 'retired',
      sourceKey: 'unit-1',
      ownerId: 'teacher-1',
      retiredDeletionId: 'deletion-1',
    });
    expect(harness.sourceState().capacity.trackedAccountBytes).toBe(0);
    expect(Object.values(harness.sourceState().lifecycleAuditEvents ?? {})
      .filter((event) => event.transition === 'retired')).toHaveLength(1);
    expect(harness.contextAuthority.readRevocation).toHaveBeenCalled();
    expect(harness.capacity.settle).toHaveBeenCalledWith(expect.objectContaining({
      publicationGuard: retirementGuard,
      sourceRetirement: expect.objectContaining({ sourceKey: 'unit-1', ownerId: 'teacher-1' }),
    }));
  });

  it('deletes one exact pinned version and settles capacity after authoritative absence', async () => {
    const harness = makeHarness();
    await enqueue(harness.owner);

    await expect(harness.owner.execute({ ownerId: 'teacher-1', deletionId: 'deletion-1' }))
      .resolves.toMatchObject({ status: 'settled', record: { state: 'settled' } });
    expect(harness.provider.deleteExactVersion).toHaveBeenCalledWith({ identity });
    expect(harness.events.indexOf('provider-delete:4_file-old:4_file-old'))
      .toBeLessThan(harness.events.indexOf('capacity-settle'));
    expect(harness.provider.resolveExactVersion).toHaveBeenCalledTimes(4);
  });

  it('denies wrong provider file/version pins before deletion', async () => {
    for (const wrongPin of [
      { providerFileId: 'wrong-file' },
      { providerFileVersionId: 'wrong-version' },
    ]) {
      const harness = makeHarness();
      harness.provider.resolveExactVersion.mockResolvedValue({ ...identity, ...wrongPin });
      await enqueue(harness.owner);
      await expect(harness.owner.execute({ ownerId: 'teacher-1', deletionId: 'deletion-1' }))
        .resolves.toMatchObject({ status: 'blocked' });
      expect(harness.provider.deleteExactVersion).not.toHaveBeenCalled();
    }
  });

  it.each([
    ['logical-key', { sourceKey: 'unit-2' }],
    ['owner', { ownerId: 'teacher-2' }],
  ] as const)('rejects queued Source %s drift before provider work', async (_label, drift) => {
    const sourceVersions = {
      readVersion: vi.fn()
        .mockResolvedValueOnce(sourceAuthority)
        .mockResolvedValueOnce({ ...sourceAuthority, ...drift }),
    };
    const harness = makeHarness({ sourceVersions });
    await enqueue(harness.owner);
    await expect(harness.owner.execute({ ownerId: 'teacher-1', deletionId: 'deletion-1' }))
      .resolves.toMatchObject({ status: 'pending', code: 'retirement-pending-identity-mismatch' });
    expect(harness.provider.deleteExactVersion).not.toHaveBeenCalled();
  });

  it('blocks same-checksum queued storage drift before provider reads or capacity settlement', async () => {
    const driftedStorage = {
      ...identity,
      storageLocationId: 'b2-secondary',
      privateBucketId: 'bucket-2',
      providerObjectKey: 'book-source/book-1/source-old-drifted.pdf',
      providerFileId: '4_file-drifted',
      providerFileVersionId: '4_file-drifted',
    };
    const sourceVersions = {
      readVersion: vi.fn()
        .mockResolvedValueOnce(sourceAuthority)
        .mockResolvedValueOnce({ ...sourceAuthority, storage: driftedStorage }),
    };
    const harness = makeHarness({ sourceVersions });
    await enqueue(harness.owner);
    await expect(harness.owner.execute({ ownerId: 'teacher-1', deletionId: 'deletion-1' }))
      .resolves.toMatchObject({ status: 'blocked', code: 'stale-source-provenance' });
    expect(harness.provider.resolveExactVersion).not.toHaveBeenCalled();
    expect(harness.provider.deleteExactVersion).not.toHaveBeenCalled();
    expect(harness.capacity.settle).not.toHaveBeenCalled();
  });

  it('conflicts idempotent enqueue when the full source storage identity drifts', async () => {
    const driftedStorage = {
      ...identity,
      providerObjectKey: 'book-source/book-1/source-old-drifted.pdf',
      providerFileId: '4_file-drifted',
      providerFileVersionId: '4_file-drifted',
    };
    let current = sourceAuthority;
    const sourceVersions = { readVersion: vi.fn(async () => current) };
    const harness = makeHarness({ sourceVersions });
    await enqueue(harness.owner);
    current = { ...sourceAuthority, storage: driftedStorage };
    await expect(harness.owner.enqueueExactDeletion({
      saga,
      operationId,
      sourceVersionIds: ['source-old'],
      precondition: 'all-contexts-retired-deliveries-revoked',
      deletionId: 'deletion-1',
    })).resolves.toEqual({ status: 'pending' });
  });

  it.each([
    ['logical-key', { sourceKey: 'unit-2' }],
    ['owner', { ownerId: 'teacher-2' }],
  ] as const)('rejects preflighted Source %s drift before provider work', async (_label, drift) => {
    const sourceVersions = {
      readVersion: vi.fn()
        .mockResolvedValueOnce(sourceAuthority)
        .mockResolvedValueOnce(sourceAuthority)
        .mockResolvedValueOnce({ ...sourceAuthority, ...drift }),
    };
    const harness = makeHarness({ sourceVersions });
    await enqueue(harness.owner);
    await expect(harness.owner.execute({ ownerId: 'teacher-1', deletionId: 'deletion-1' }))
      .resolves.toMatchObject({ status: 'pending', code: 'retirement-pending-identity-mismatch', record: { state: 'preflighted' } });
    expect(harness.provider.deleteExactVersion).not.toHaveBeenCalled();
  });

  it.each([
    ['logical-key', { sourceKey: 'unit-2' }],
    ['owner', { ownerId: 'teacher-2' }],
  ] as const)('rejects resumed-delete Source %s drift before provider work', async (_label, drift) => {
    const sourceVersions = {
      readVersion: vi.fn()
        .mockResolvedValueOnce(sourceAuthority)
        .mockResolvedValueOnce(sourceAuthority)
        .mockResolvedValueOnce(sourceAuthority)
        .mockResolvedValueOnce(sourceAuthority)
        .mockResolvedValueOnce({ ...sourceAuthority, ...drift }),
    };
    const harness = makeHarness({ sourceVersions, deleteBehavior: 'before-crash' });
    await enqueue(harness.owner);
    await expect(harness.owner.execute({ ownerId: 'teacher-1', deletionId: 'deletion-1' }))
      .resolves.toMatchObject({ status: 'pending', record: { state: 'delete-started' } });
    harness.provider.deleteExactVersion.mockClear();
    await expect(harness.owner.execute({ ownerId: 'teacher-1', deletionId: 'deletion-1' }))
      .resolves.toMatchObject({ status: 'pending', code: 'retirement-pending-identity-mismatch' });
    expect(harness.provider.deleteExactVersion).not.toHaveBeenCalled();
  });

  it('conflicts idempotent enqueue when the fenced source key drifts', async () => {
    let current = sourceAuthority;
    const sourceVersions = { readVersion: vi.fn(async () => current) };
    const harness = makeHarness({ sourceVersions });
    await enqueue(harness.owner);
    current = { ...sourceAuthority, sourceKey: 'unit-2' };
    await expect(harness.owner.enqueueExactDeletion({
      saga,
      operationId,
      sourceVersionIds: ['source-old'],
      precondition: 'all-contexts-retired-deliveries-revoked',
      deletionId: 'deletion-1',
    })).resolves.toEqual({ status: 'pending' });
    expect(harness.provider.deleteExactVersion).not.toHaveBeenCalled();
  });

  it('fails closed for rejected, student-document, stale, or unavailable source authority', async () => {
    for (const source of [
      { ...sourceAuthority, purpose: 'student-document' as const },
      { ...sourceAuthority, studentSafeStatus: 'rejected' as const },
      { ...sourceAuthority, studentSafeDecision: { ...sourceAuthority.studentSafeDecision, sourceVersionId: 'other-source' } },
      { ...sourceAuthority, storage: { ...identity, sourceVersionId: 'other-source' } },
      null,
    ]) {
      const harness = makeHarness({ sourceAuthority: source });
      await expect(harness.owner.enqueueExactDeletion({
        saga,
        operationId,
        sourceVersionIds: ['source-old'],
        precondition: 'all-contexts-retired-deliveries-revoked',
        deletionId: 'deletion-1',
      })).resolves.toEqual({ status: 'pending' });
      expect(harness.provider.deleteExactVersion).not.toHaveBeenCalled();
    }
  });

  it('denies active or partial revocation readback', async () => {
    for (const contextProof of [
      () => proof({ currentSourceVersionIds: ['source-old'] }),
      () => proof({ remainingActiveSourceVersionIds: ['source-old'] }),
      () => proof({ retiredDeliveries: [{
        ...proof().retiredDeliveries[0]!,
        sourceVersionIds: ['source-old', 'source-unrelated'],
      }] }),
    ]) {
      const harness = makeHarness({ contextProof });
      await enqueue(harness.owner);
      await expect(harness.owner.execute({ ownerId: 'teacher-1', deletionId: 'deletion-1' }))
        .resolves.toMatchObject({ status: 'blocked', code: 'active-or-partial-revocation' });
      expect(harness.provider.deleteExactVersion).not.toHaveBeenCalled();
    }
  });

  it('denies stale context provenance after pre-delete preparation', async () => {
    let revision = 1;
    const harness = makeHarness({
      deleteBehavior: 'before-crash',
      contextProof: () => proof({ contextRevision: revision }),
    });
    await enqueue(harness.owner);
    await expect(harness.owner.execute({ ownerId: 'teacher-1', deletionId: 'deletion-1' }))
      .resolves.toMatchObject({ status: 'pending', record: { state: 'delete-started' } });
    revision = 2;
    await expect(harness.owner.execute({ ownerId: 'teacher-1', deletionId: 'deletion-1' }))
      .resolves.toMatchObject({ status: 'blocked', code: 'stale-context-provenance' });
    expect(harness.provider.deleteExactVersion).toHaveBeenCalledTimes(1);
  });

  it('keeps the irreversible boundary resumable after a crash before provider effect', async () => {
    const harness = makeHarness({ deleteBehavior: 'before-crash' });
    await enqueue(harness.owner);
    await expect(harness.owner.execute({ ownerId: 'teacher-1', deletionId: 'deletion-1' }))
      .resolves.toMatchObject({ status: 'pending', record: { state: 'delete-started' } });
    harness.setDeleteBehavior('success');
    await expect(harness.owner.execute({ ownerId: 'teacher-1', deletionId: 'deletion-1' }))
      .resolves.toMatchObject({ status: 'settled' });
  });

  it('recovers a crash after delete from authoritative absence and treats replay as idempotent', async () => {
    const harness = makeHarness({ deleteBehavior: 'after-crash' });
    await enqueue(harness.owner);
    await expect(harness.owner.execute({ ownerId: 'teacher-1', deletionId: 'deletion-1' }))
      .resolves.toMatchObject({ status: 'pending', record: { state: 'delete-started' } });
    await expect(harness.owner.execute({ ownerId: 'teacher-1', deletionId: 'deletion-1' }))
      .resolves.toMatchObject({ status: 'settled', record: { providerProof: { outcome: 'provider-already-absent' } } });
    await expect(harness.owner.execute({ ownerId: 'teacher-1', deletionId: 'deletion-1' }))
      .resolves.toMatchObject({ status: 'replayed' });
  });

  it('accepts already-absent only after an exact pre-delete readback', async () => {
    const harness = makeHarness({ deleteBehavior: 'before-crash' });
    await enqueue(harness.owner);
    await expect(harness.owner.execute({ ownerId: 'teacher-1', deletionId: 'deletion-1' }))
      .resolves.toMatchObject({ status: 'pending', record: { state: 'delete-started' } });
    harness.setProviderPresent(false);
    await expect(harness.owner.execute({ ownerId: 'teacher-1', deletionId: 'deletion-1' }))
      .resolves.toMatchObject({ status: 'settled', record: { providerProof: { outcome: 'provider-already-absent' } } });
  });

  it('does not settle capacity until absence verification succeeds', async () => {
    const harness = makeHarness();
    await enqueue(harness.owner);
    harness.provider.resolveExactVersion
      .mockResolvedValueOnce(identity)
      .mockResolvedValueOnce(identity)
      .mockResolvedValueOnce(identity)
      .mockResolvedValueOnce(identity);
    await expect(harness.owner.execute({ ownerId: 'teacher-1', deletionId: 'deletion-1' }))
      .resolves.toMatchObject({ status: 'pending', code: 'absence-verification-pending' });
    expect(harness.capacity.settle).not.toHaveBeenCalled();
    harness.setProviderPresent(false);
    await expect(harness.owner.execute({ ownerId: 'teacher-1', deletionId: 'deletion-1' }))
      .resolves.toMatchObject({ status: 'settled' });
  });

  it('stops the provider retry when the publication guard drifts', async () => {
    const harness = makeHarness({ deleteBehavior: 'before-crash' });
    await enqueue(harness.owner);
    await expect(harness.owner.execute({ ownerId: 'teacher-1', deletionId: 'deletion-1' }))
      .resolves.toMatchObject({ status: 'pending', record: { state: 'delete-started' } });
    harness.setPublicationGuard({ ...retirementGuard, publicationRevision: 2 });
    await expect(harness.owner.execute({ ownerId: 'teacher-1', deletionId: 'deletion-1' }))
      .resolves.toMatchObject({ status: 'blocked', code: 'publication-guard-stale' });
    expect(harness.provider.deleteExactVersion).toHaveBeenCalledTimes(1);
  });

  it('rechecks the publication guard after the final provider read before deletion', async () => {
    const harness = makeHarness({ driftDuringProviderRead: true });
    await enqueue(harness.owner);
    await expect(harness.owner.execute({ ownerId: 'teacher-1', deletionId: 'deletion-1' }))
      .resolves.toMatchObject({ status: 'blocked', code: 'publication-guard-stale' });
    expect(harness.provider.deleteExactVersion).not.toHaveBeenCalled();
  });

  it('rechecks publication guard at capacity settlement before final source retirement', async () => {
    const harness = makeHarness({ driftAtCapacity: true });
    await enqueue(harness.owner);
    await expect(harness.owner.execute({ ownerId: 'teacher-1', deletionId: 'deletion-1' }))
      .resolves.toMatchObject({ status: 'pending', code: 'capacity-settlement-pending', record: { state: 'absence-verified' } });
    expect(harness.capacity.settle).toHaveBeenCalledTimes(1);
    harness.setPublicationGuard(retirementGuard);
    await expect(harness.owner.execute({ ownerId: 'teacher-1', deletionId: 'deletion-1' }))
      .resolves.toMatchObject({ status: 'settled' });
    expect(harness.capacity.settle).toHaveBeenCalledTimes(2);
  });

  it('keeps a missing publication validator retryable before provider effect', async () => {
    const harness = makeHarness({ publicationAuthority: false });
    await enqueue(harness.owner);
    await expect(harness.owner.execute({ ownerId: 'teacher-1', deletionId: 'deletion-1' }))
      .resolves.toMatchObject({ status: 'pending', code: 'publication-guard-authority-unavailable' });
    expect(harness.provider.deleteExactVersion).not.toHaveBeenCalled();
  });

  it('keeps a missing source guard pending before enqueue', async () => {
    const harness = makeHarness({
      sourceAuthority: { ...sourceAuthority, retirementGuard: undefined } as never,
    });
    await expect(harness.owner.enqueueExactDeletion({
      saga,
      operationId,
      sourceVersionIds: ['source-old'],
      precondition: 'all-contexts-retired-deliveries-revoked',
      deletionId: 'deletion-1',
    })).resolves.toEqual({ status: 'pending' });
    expect(harness.provider.deleteExactVersion).not.toHaveBeenCalled();
  });

  it('persists a dedicated metadata-only delete identity and no backup bytes', async () => {
    const harness = makeHarness();
    await enqueue(harness.owner);
    const queued = await harness.repository.read({ ownerId: 'teacher-1', deletionId: 'deletion-1' });
    expect(queued).toMatchObject({
      deleteIdentity: {
        kind: 'retired-byte-exact-version',
        serviceIdentity: 'book_retired_byte_deletion_service',
        capability: 'delete-exact-provider-file-version',
      },
      recovery: { metadataOnly: true, rollbackAfterBoundary: 'not-available' },
      preDelete: null,
    });
    expect(JSON.stringify(queued)).not.toMatch(/"(?:bytes|backupBytes|pdfData|bytePayload)"\s*:/iu);
    await harness.owner.execute({ ownerId: 'teacher-1', deletionId: 'deletion-1' });
    const settled = await harness.repository.read({ ownerId: 'teacher-1', deletionId: 'deletion-1' });
    expect(JSON.stringify(settled)).not.toMatch(/"(?:bytes|backupBytes|pdfData|bytePayload)"\s*:/iu);
  });

  it('keeps the #47 rules fragment inactive and deny-only', () => {
    expect(fragment.ticketId).toBe('47');
    expect(fragment.status).toBe('inactive');
    expect(fragment.activation).toBe('deny-only-until-118-composition');
    expect(fragment.owner.issue).toBe(119);
    expect(fragment.owner.serviceIdentity).toBe('book_retired_byte_deletion_service');
    expect(fragment.owner.generatedRuleLocations.sort()).toEqual(
      fragment.operations.map((operation) => `${operation.path}/${operation.rule}`).sort(),
    );
    expect(fragment.operations.filter((operation) => operation.path === 'book_retired_byte_deletions')
      .every((operation) => operation.expression === 'false')).toBe(true);
    const recordWrite = fragment.operations.find((operation) => operation.path.includes('/records/') && operation.rule === '.write');
    expect(recordWrite?.expression).toContain("stateRevision').val() == data.child('stateRevision').val() + 1");
    expect(recordWrite?.expression).toContain("newData.child('deleteIdentity').val() == data.child('deleteIdentity').val()");
    expect(recordWrite?.expression).toContain("newData.child('contextPins').val() == data.child('contextPins').val()");
    expect(JSON.stringify(fragment)).not.toMatch(/"(?:bytes|backupBytes|pdfData|bytePayload)"\s*:/iu);
  });
});
