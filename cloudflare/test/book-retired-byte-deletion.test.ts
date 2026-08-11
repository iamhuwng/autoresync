import { describe, expect, it, vi } from 'vitest';

import type {
  BookSourceVersionStorageIdentity,
} from '../../src/types/bookSource.types.ts';
import type {
  ReplacementSagaRecord,
} from '../src/upload-worker/book-delivery/replacement-saga/contract.ts';
import fragment from '../src/upload-worker/book-rules/fragments/47.json';
import {
  InMemoryRetiredByteDeletionRepository,
} from '../src/upload-worker/book-delivery/retired-byte-deletion/repository.ts';
import type {
  RetiredByteContextReadback,
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
} = {}) => {
  const repository = new InMemoryRetiredByteDeletionRepository();
  let providerPresent = options.providerPresent ?? true;
  let deleteBehavior = options.deleteBehavior ?? 'success';
  const events: string[] = [];
  const provider = {
    resolveExactVersion: vi.fn(async () => {
      events.push('provider-read');
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
  const capacity = {
    settle: vi.fn(async () => {
      events.push('capacity-settle');
      if (options.capacityBehavior === 'crash') throw new Error('capacity-unavailable');
      if (capacitySettled) return 'replayed' as const;
      capacitySettled = true;
      return 'settled' as const;
    }),
  };
  const contexts = {
    readRevocation: vi.fn(async () => options.contextProof?.() ?? proof()),
  };
  const owner = createRetiredByteDeletionOwner({
    repository,
    sourceVersions: { readVersion: vi.fn(async () => identity) },
    contexts,
    provider,
    capacity,
    enabled: true,
    now: () => new Date(fixedNow),
    newId: () => 'deletion-1',
  });
  return { repository, owner, provider, capacity, contexts, events, setProviderPresent: (value: boolean) => { providerPresent = value; }, setDeleteBehavior: (value: 'success' | 'before-crash' | 'after-crash') => { deleteBehavior = value; } };
};

const enqueue = async (owner: ReturnType<typeof createRetiredByteDeletionOwner>) => {
  await expect(owner.enqueueExactDeletion({
    saga,
    operationId,
    sourceVersionIds: ['source-old'],
    precondition: 'all-contexts-retired-deliveries-revoked',
  })).resolves.toEqual({ status: 'queued' });
};

describe('#119 retired-byte deletion owner', () => {
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

  it('denies active or partial revocation readback', async () => {
    for (const contextProof of [
      () => proof({ currentSourceVersionIds: ['source-old'] }),
      () => proof({ remainingActiveSourceVersionIds: ['source-old'] }),
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
