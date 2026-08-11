import { createBookSourceVersionStorageIdentity } from '../../../../../src/services/book-source-delivery/sourceVersion.service.ts';
import type {
  BookSourceUploadOperation,
  BookSourceVersionStorageIdentity,
} from '../../../../../src/types/bookSource.types.ts';
import type {
  ReplacementSagaContextItem,
  ReplacementSagaRecord,
} from '../replacement-saga/contract.ts';
import {
  RETIRED_BYTE_DELETION_SCHEMA_VERSION,
  type RetiredByteContextReadback,
  type RetiredByteDeleteIdentity,
  type RetiredByteDeletionDependencies,
  type RetiredByteDeletionOwner,
  type RetiredByteDeletionOutcome,
  type RetiredByteDeletionRecord,
  type RetiredByteDeletionResult,
  type RetiredByteDeletionState,
} from './contract.ts';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,191}$/u;
const HASH = /^[a-f0-9]{64}$/u;

class RetiredByteBlocked extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

const clone = <T>(value: T): T => structuredClone(value);
const stable = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(',')}}`;
};
const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};
const validId = (value: unknown): value is string => typeof value === 'string' && ID.test(value);
const validHash = (value: unknown): value is string => typeof value === 'string' && HASH.test(value);
const validRevision = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const validTime = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));

const blocked = (code: string): never => { throw new RetiredByteBlocked(code); };

const nowIso = (dependencies: RetiredByteDeletionDependencies): string | null => {
  try {
    const date = dependencies.now?.() ?? new Date();
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  } catch {
    return null;
  }
};

const sameIdentity = (
  left: BookSourceVersionStorageIdentity | null,
  right: BookSourceVersionStorageIdentity | null,
): boolean => left !== null && right !== null && stable(left) === stable(right);

const assertIdentity = (
  value: unknown,
  expected: { readonly bookId: string; readonly sourceVersionId: string },
): BookSourceVersionStorageIdentity => {
  let identity: BookSourceVersionStorageIdentity | null = null;
  try {
    identity = createBookSourceVersionStorageIdentity(value);
  } catch {
    throw new RetiredByteBlocked('stale-source-provenance');
  }
  if (identity === null) throw new RetiredByteBlocked('stale-source-provenance');
  if (identity.bookId !== expected.bookId
    || identity.sourceVersionId !== expected.sourceVersionId
    || identity.providerKind !== 'backblaze-b2-s3'
    || identity.providerFileId.length === 0
    || identity.providerFileVersionId.length === 0) {
    blocked('stale-source-provenance');
  }
  return identity;
};

const assertDeleteIdentity = (
  value: RetiredByteDeleteIdentity,
  record: RetiredByteDeletionRecord,
): void => {
  if (value.kind !== 'retired-byte-exact-version'
    || value.serviceIdentity !== 'book_retired_byte_deletion_service'
    || value.capability !== 'delete-exact-provider-file-version'
    || value.deletionId !== record.deletionId
    || value.operationId !== record.operationId) {
    blocked('dedicated-delete-identity-required');
  }
};

const sourceOperation = (
  record: RetiredByteDeletionRecord,
  identity: BookSourceVersionStorageIdentity,
): BookSourceUploadOperation => {
  const createdAt = record.createdAt;
  const expiresAt = new Date(Date.parse(createdAt) + 60_000).toISOString();
  return {
    reservationId: record.deletionId,
    bookId: record.bookId,
    sourceVersionId: record.sourceVersionId,
    sourceKey: 'retired-byte',
    ownerId: record.ownerId,
    storageLocationId: identity.storageLocationId,
    providerKind: identity.providerKind,
    privateBucketId: identity.privateBucketId,
    providerObjectKey: identity.providerObjectKey,
    kind: 'replacement',
    byteSize: identity.byteSize,
    originalFilename: 'retired-source.pdf',
    expectedChecksum: identity.checksum,
    createdAt,
    expiresAt,
    status: 'cleanup_pending',
  };
};

const readContextProofs = async (
  dependencies: RetiredByteDeletionDependencies,
  record: RetiredByteDeletionRecord,
): Promise<readonly RetiredByteContextReadback[]> => {
  const proofs: RetiredByteContextReadback[] = [];
  for (const pin of record.contextPins) {
    const proof = await dependencies.contexts.readRevocation({
      sagaId: record.sagaId,
      ownerId: record.ownerId,
      bookId: record.bookId,
      contextKey: pin.contextKey,
      operationId: pin.operationId,
      sourceVersionIds: [...record.sourceVersionIds],
    });
    if (!proof) throw new RetiredByteBlocked('context-revocation-readback-missing');
    if (proof.complete !== true
      || proof.sagaId !== record.sagaId
      || proof.ownerId !== record.ownerId
      || proof.bookId !== record.bookId
      || proof.contextKey !== pin.contextKey
      || proof.operationId !== pin.operationId
      || !validRevision(proof.contextRevision)
      || !validHash(proof.immutableActivityWorkFingerprint)
      || (proof.authorityStatus !== 'adopted' && proof.authorityStatus !== 'declined-unavailable')
      || !Array.isArray(proof.retiredDeliveries)
      || proof.retiredDeliveries.some((delivery) => (
        !validId(delivery.deliveryId)
        || !validId(delivery.bindingId)
        || !validRevision(delivery.bindingRevision)
        || delivery.status !== 'revoked'
        || !delivery.sourceVersionIds.includes(record.sourceVersionId)
      ))
      || proof.currentSourceVersionIds.includes(record.sourceVersionId)
      || proof.remainingActiveSourceVersionIds.includes(record.sourceVersionId)) {
      blocked('active-or-partial-revocation');
    }
    proofs.push(proof);
  }
  if (proofs.length === 0) blocked('context-revocation-readback-missing');
  return proofs;
};

const contextFingerprint = async (proofs: readonly RetiredByteContextReadback[]): Promise<string> => (
  sha256Hex(stable(proofs.map((proof) => ({
    contextKey: proof.contextKey,
    contextRevision: proof.contextRevision,
    immutableActivityWorkFingerprint: proof.immutableActivityWorkFingerprint,
    authorityStatus: proof.authorityStatus,
    retiredDeliveries: proof.retiredDeliveries,
    currentSourceVersionIds: proof.currentSourceVersionIds,
    remainingActiveSourceVersionIds: proof.remainingActiveSourceVersionIds,
  })).sort((left, right) => left.contextKey.localeCompare(right.contextKey))))
);

const providerIdentity = (
  record: RetiredByteDeletionRecord,
  value: BookSourceVersionStorageIdentity | null,
): BookSourceVersionStorageIdentity | null => {
  if (value === null) return null;
  const identity = assertIdentity(value, record);
  if (record.identity !== null && !sameIdentity(record.identity, identity)) blocked('provider-version-drift');
  return identity;
};

const advance = async (
  dependencies: RetiredByteDeletionDependencies,
  current: RetiredByteDeletionRecord,
  state: RetiredByteDeletionState,
  next: RetiredByteDeletionRecord,
): Promise<RetiredByteDeletionRecord | null> => {
  const result = await dependencies.repository.compareAndSet({
    ownerId: current.ownerId,
    deletionId: current.deletionId,
    expectedState: state,
    expectedRevision: current.stateRevision,
    next,
  });
  return result.status === 'advanced' ? result.record ?? null : null;
};

const withState = (
  record: RetiredByteDeletionRecord,
  state: RetiredByteDeletionState,
  updatedAt: string,
  patch: Partial<RetiredByteDeletionRecord> = {},
): RetiredByteDeletionRecord => ({
  ...record,
  ...patch,
  state,
  stateRevision: record.stateRevision + 1,
  updatedAt,
});

const pending = (record: RetiredByteDeletionRecord, code: string): RetiredByteDeletionResult => ({
  status: 'pending',
  code,
  record,
});

const loadCurrent = async (
  dependencies: RetiredByteDeletionDependencies,
  input: { readonly ownerId: string; readonly deletionId: string },
): Promise<RetiredByteDeletionRecord> => {
  const record = await dependencies.repository.read(input);
  if (!record) throw new RetiredByteBlocked('retired-byte-deletion-missing');
  assertDeleteIdentity(record.deleteIdentity, record);
  if (!record.recovery.metadataOnly || record.recovery.rollbackBoundary !== 'before-delete-boundary-only') {
    blocked('invalid-recovery-record');
  }
  return record;
};

export const createRetiredByteDeletionOwner = (
  dependencies: RetiredByteDeletionDependencies,
): RetiredByteDeletionOwner => {
  const enqueueExactDeletion = async (input: {
    readonly saga: ReplacementSagaRecord;
    readonly operationId: string;
    readonly sourceVersionIds: readonly string[];
    readonly precondition: 'all-contexts-retired-deliveries-revoked';
  }): Promise<{ readonly status: 'queued' | 'replayed' | 'pending' }> => {
    if (dependencies.enabled !== true) return { status: 'pending' };
    if (input.precondition !== 'all-contexts-retired-deliveries-revoked'
      || input.saga.state !== 'contexts-pending'
      || !validId(input.saga.sagaId)
      || !validId(input.saga.ownerId)
      || !validId(input.saga.bookId)
      || input.operationId !== `${input.saga.sagaId}:retired-byte-deletion`
      || input.sourceVersionIds.length !== 1
      || input.saga.sourceVersionIds.length !== 1
      || input.sourceVersionIds[0] !== input.saga.sourceVersionIds[0]
      || Object.keys(input.saga.contexts).length === 0
      || Object.values(input.saga.contexts).some((item) => item.state !== 'retired-revoked')
      || input.saga.audit.retiredItemCount !== Object.keys(input.saga.contexts).length) {
      return { status: 'pending' };
    }
    const at = nowIso(dependencies);
    if (!at) return { status: 'pending' };
    const deletionId = dependencies.newId?.() ?? input.operationId.replace(/[^A-Za-z0-9._:@-]/gu, '-');
    if (!validId(deletionId)) return { status: 'pending' };
    const sourceVersionId = input.sourceVersionIds[0]!;
    const contextPins = Object.values(input.saga.contexts).map((item) => ({
      contextKey: item.contextKey,
      operationId: item.operationId,
      sourceVersionIds: [...input.saga.sourceVersionIds],
    }));
    const requestFingerprint = await sha256Hex(stable({
      sagaId: input.saga.sagaId,
      ownerId: input.saga.ownerId,
      bookId: input.saga.bookId,
      operationId: input.operationId,
      sourceVersionIds: input.sourceVersionIds,
      contextPins,
    }));
    const record: RetiredByteDeletionRecord = {
      schemaVersion: RETIRED_BYTE_DELETION_SCHEMA_VERSION,
      deletionId,
      operationId: input.operationId,
      idempotencyKey: input.operationId,
      requestFingerprint,
      sagaId: input.saga.sagaId,
      ownerId: input.saga.ownerId,
      bookId: input.saga.bookId,
      sourceVersionId,
      sourceVersionIds: [sourceVersionId],
      contextPins,
      deleteIdentity: {
        kind: 'retired-byte-exact-version',
        serviceIdentity: 'book_retired_byte_deletion_service',
        capability: 'delete-exact-provider-file-version',
        deletionId,
        operationId: input.operationId,
      },
      identity: null,
      preDelete: null,
      providerProof: null,
      irreversibleEffect: { status: 'not-started', startedAt: null },
      capacity: { status: 'held', settledAt: null },
      recovery: {
        metadataOnly: true,
        rollbackBoundary: 'before-delete-boundary-only',
        rollbackAfterBoundary: 'not-available',
      },
      state: 'queued',
      stateRevision: 0,
      createdAt: at,
      updatedAt: at,
    };
    try {
      const result = await dependencies.repository.enqueue({ record });
      if (result.status === 'conflict' || !result.record) return { status: 'pending' };
      return { status: result.status === 'replayed' ? 'replayed' : 'queued' };
    } catch {
      return { status: 'pending' };
    }
  };

  const execute = async (input: {
    readonly ownerId: string;
    readonly deletionId: string;
  }): Promise<RetiredByteDeletionResult> => {
    if (dependencies.enabled !== true) return { status: 'blocked', code: 'retired-byte-deletion-disabled' };
    if (!validId(input.ownerId) || !validId(input.deletionId)) return { status: 'blocked', code: 'invalid-request' };
    try {
      let record = await loadCurrent(dependencies, input);
      if (record.state === 'settled') return { status: 'replayed', record };
      const at = nowIso(dependencies);
      if (!at) return pending(record, 'clock-unavailable');

      if (record.state === 'queued') {
        const identity = assertIdentity(
          await dependencies.sourceVersions.readVersion({ bookId: record.bookId, sourceVersionId: record.sourceVersionId }),
          record,
        );
        const proofs = await readContextProofs(dependencies, record);
        const providerValue = providerIdentity(
          record,
          await dependencies.provider.resolveExactVersion(sourceOperation(record, identity)),
        );
        if (!providerValue || !sameIdentity(identity, providerValue)) blocked('provider-pre-delete-pin-missing');
        const preDelete = {
          recordedAt: at,
          identity,
          contextReadbackFingerprint: await contextFingerprint(proofs),
          metadataOnly: true as const,
          backupBytesCreated: false as const,
        };
        const advanced = await advance(dependencies, record, 'queued', withState(record, 'preflighted', at, {
          identity,
          preDelete,
        }));
        if (!advanced) return pending(record, 'cas-conflict');
        record = advanced;
      }

      if (record.state === 'preflighted') {
        const pinnedIdentity = record.identity;
        const preDelete = record.preDelete;
        if (!pinnedIdentity || !preDelete) throw new RetiredByteBlocked('pre-delete-record-missing');
        const sourceIdentity = assertIdentity(
          await dependencies.sourceVersions.readVersion({ bookId: record.bookId, sourceVersionId: record.sourceVersionId }),
          record,
        );
        if (!sameIdentity(sourceIdentity, pinnedIdentity)) blocked('stale-source-provenance');
        const proofs = await readContextProofs(dependencies, record);
        const currentProvider = providerIdentity(
          record,
          await dependencies.provider.resolveExactVersion(sourceOperation(record, pinnedIdentity)),
        );
        if (preDelete.contextReadbackFingerprint !== await contextFingerprint(proofs)) blocked('stale-context-provenance');
        if (currentProvider === null) {
          const absence = await advance(dependencies, record, 'preflighted', withState(record, 'absence-verified', at, {
            providerProof: { outcome: 'provider-already-absent', verifiedAt: at, identity: pinnedIdentity },
          }));
          if (!absence) return pending(record, 'cas-conflict');
          record = absence;
        } else {
          if (!sameIdentity(currentProvider, pinnedIdentity)) blocked('provider-version-drift');
          const started = await advance(dependencies, record, 'preflighted', withState(record, 'delete-started', at, {
            irreversibleEffect: { status: 'started', startedAt: at },
          }));
          if (!started) return pending(record, 'cas-conflict');
          record = started;
        }
      }

      if (record.state === 'delete-started') {
        const pinnedIdentity = record.identity;
        const preDelete = record.preDelete;
        if (!pinnedIdentity || !preDelete) throw new RetiredByteBlocked('pre-delete-record-missing');
        const proofs = await readContextProofs(dependencies, record);
        if (preDelete.contextReadbackFingerprint !== await contextFingerprint(proofs)) blocked('stale-context-provenance');
        const currentProvider = providerIdentity(
          record,
          await dependencies.provider.resolveExactVersion(sourceOperation(record, pinnedIdentity)),
        );
        if (currentProvider === null) {
          const absence = await advance(dependencies, record, 'delete-started', withState(record, 'absence-verified', at, {
            providerProof: { outcome: 'provider-already-absent', verifiedAt: at, identity: pinnedIdentity },
          }));
          if (!absence) return pending(record, 'cas-conflict');
          record = absence;
        } else {
          if (!sameIdentity(currentProvider, pinnedIdentity)) blocked('provider-version-drift');
          let deleteOutcome: RetiredByteDeletionOutcome = 'deleted';
          try {
            await dependencies.provider.deleteExactVersion({ identity: pinnedIdentity });
          } catch (error) {
            const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'provider-delete-failed';
            if (code !== 'not_found') return pending(record, `provider-${code}`);
            deleteOutcome = 'provider-already-absent';
          }
          const afterDelete = providerIdentity(
            record,
            await dependencies.provider.resolveExactVersion(sourceOperation(record, pinnedIdentity)),
          );
          if (afterDelete !== null) return pending(record, 'absence-verification-pending');
          const absence = await advance(dependencies, record, 'delete-started', withState(record, 'absence-verified', at, {
            providerProof: { outcome: deleteOutcome, verifiedAt: at, identity: pinnedIdentity },
          }));
          if (!absence) return pending(record, 'cas-conflict');
          record = absence;
        }
      }

      if (record.state === 'absence-verified') {
        if (!record.identity || !record.providerProof) return pending(record, 'absence-proof-missing');
        let capacityOutcome: 'settled' | 'replayed';
        try {
          capacityOutcome = await dependencies.capacity.settle({
            deletionId: record.deletionId,
            identity: record.identity,
            outcome: record.providerProof.outcome,
          });
        } catch {
          return pending(record, 'capacity-settlement-pending');
        }
        const settled = await advance(dependencies, record, 'absence-verified', withState(record, 'settled', at, {
          capacity: { status: 'settled', settledAt: at },
        }));
        if (!settled) return pending(record, capacityOutcome === 'replayed' ? 'capacity-cas-conflict' : 'cas-conflict');
        return { status: 'settled', record: settled };
      }
      return { status: 'pending', record };
    } catch (error) {
      if (error instanceof RetiredByteBlocked) return { status: 'blocked', code: error.code };
      const record = await dependencies.repository.read(input);
      if (!record) return { status: 'blocked', code: 'retired-byte-deletion-missing' };
      return pending(record, 'authority-or-provider-unavailable');
    }
  };

  return Object.freeze({ enqueueExactDeletion, execute });
};
