import type {
  BookSourceChecksum,
  BookSourcePurpose,
  BookSourceStudentSafeDecision,
  BookSourceStudentSafeStatus,
  BookSourceUploadAccountState,
  BookSourceUploadCleanupReason,
  BookSourceUploadKind,
  BookSourceUploadOperation,
  BookSourceAssemblyBooks,
  BookSourceAssemblyProjection,
  BookSourceProviderReconciliationContinuation,
  BookSourceProviderReconciliationSnapshot,
  BookSourceVersionStorageIdentity,
  BookSourceLifecycleAuditEvent,
  BookSourceLifecycleTransition,
  PublicationRetirementGuard,
} from '../../types/bookSource.types';
import { BOOK_SOURCE_PROVIDER_RECONCILIATION_MAX_AGE_MS } from '../../types/bookSource.types';
import {
  assertBookSourceCapacityAvailable,
  assertBookSourcePdfByteSize,
  calculateBookSourceCapacityUsage,
} from './sourceCapacity.service';
import { normalizeBookSourceDisplayFilename } from './sourceDisplayFilename.service';
import type { SourceUploadRtdbTransaction } from './sourceUpload.firebaseRtdbTransaction';
import { createBookSourceVersionStorageIdentity, SourceVersionError } from './sourceVersion.service';

export class SourceUploadConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SourceUploadConflictError';
  }
}

const MAX_SOURCE_UPLOAD_OPERATIONS = 10_000;
const OPERATION_KEYS = [
  'reservationId',
  'bookId',
  'sourceVersionId',
  'sourceKey',
  'ownerId',
  'storageLocationId',
  'providerKind',
  'privateBucketId',
  'providerObjectKey',
  'kind',
  'purpose',
  'studentSafeStatus',
  'studentSafeDecision',
  'byteSize',
  'originalFilename',
  'expectedChecksum',
  'createdAt',
  'expiresAt',
  'status',
  'verifiedStorage',
  'completedAt',
  'physicalPageCount',
  'replacesSourceVersionId',
  'cleanup',
  'versionReconciliation',
  'releasedAt',
  'releaseProof',
  'retirementGuard',
  'retiredDeletionId',
  'retirementPendingAt',
] as const;

const CLEANUP_KEYS = [
  'reason',
  'requestedAt',
  'attempt',
  'nextRetryAt',
  'lastErrorCode',
  'providerFileId',
  'providerFileVersionId',
  'leaseOwner',
  'leaseExpiresAt',
] as const;

const RETIRED_OPERATION_KEYS = [
  'reservationId', 'bookId', 'sourceVersionId', 'sourceKey', 'ownerId',
  'purpose', 'studentSafeStatus', 'studentSafeDecision',
  'checksum', 'byteSize', 'ownerAttestedPhysicalPageCount', 'originalFilename',
  'createdAt', 'completedAt', 'status', 'retiredAt', 'retirementProof',
  'retiredDeletionId',
  'retirementGuard', 'retirementPendingAt',
] as const;

export interface ReserveSourceUploadInput {
  readonly accountId: string;
  readonly expectedRevision: number;
  readonly reservationId: string;
  readonly bookId: string;
  readonly sourceVersionId: string;
  readonly sourceKey: string;
  readonly ownerId: string;
  readonly storageLocationId: string;
  readonly providerKind: string;
  readonly privateBucketId: string;
  readonly providerObjectKey: string;
  readonly kind: BookSourceUploadKind;
  readonly purpose: BookSourcePurpose;
  readonly studentSafeStatus: BookSourceStudentSafeStatus;
  readonly studentSafeDecision?: BookSourceStudentSafeDecision;
  readonly byteSize: number;
  readonly originalFilename: unknown;
  readonly expectedChecksum: BookSourceChecksum;
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface CompleteSourceUploadInput {
  readonly accountId: string;
  readonly expectedRevision: number;
  readonly reservationId: string;
  /** Trusted completion inspection, never a browser assertion. */
  readonly verifiedStorage: BookSourceVersionStorageIdentity;
  /** Worker-derived count from the verified immutable provider object. */
  readonly physicalPageCount: number;
  readonly verifiedAt: string;
}

export interface RequestSourceUploadCleanupInput {
  readonly accountId: string;
  readonly expectedRevision: number;
  readonly reservationId: string;
  readonly ownerId: string;
  readonly reason: BookSourceUploadCleanupReason;
  readonly requestedAt: string;
  readonly providerFileId?: string;
  readonly providerFileVersionId?: string;
}

export interface ClaimSourceUploadCleanupInput {
  readonly accountId: string;
  readonly expectedRevision: number;
  readonly reservationId: string;
  readonly leaseOwner: string;
  readonly claimedAt: string;
  readonly leaseExpiresAt: string;
}

export interface FailSourceUploadCleanupInput {
  readonly accountId: string;
  readonly expectedRevision: number;
  readonly reservationId: string;
  readonly leaseOwner: string;
  readonly failedAt: string;
  readonly nextRetryAt: string;
  readonly errorCode: string;
}

export interface ReleaseSourceUploadInput {
  readonly accountId: string;
  readonly expectedRevision: number;
  readonly reservationId: string;
  readonly leaseOwner: string;
  readonly releasedAt: string;
  readonly proof: 'exact_version_deleted' | 'provider_absent';
}

export interface RetireVerifiedSourceInput {
  readonly accountId: string;
  readonly expectedRevision: number;
  readonly reservationId: string;
  readonly bookId: string;
  readonly sourceVersionId: string;
  readonly sourceKey: string;
  readonly ownerId: string;
  readonly verifiedStorage: BookSourceVersionStorageIdentity;
  readonly deletionId: string;
  readonly proof: 'exact_version_deleted' | 'provider_absent';
  readonly retiredAt: string;
  readonly currentSourceVersionIds: readonly string[];
  readonly remainingActiveSourceVersionIds: readonly string[];
  readonly retirementGuard?: PublicationRetirementGuard;
}

export interface FenceVerifiedSourceInput {
  readonly accountId: string;
  readonly expectedRevision: number;
  readonly reservationId: string;
  readonly bookId: string;
  readonly sourceVersionId: string;
  readonly sourceKey: string;
  readonly ownerId: string;
  readonly verifiedStorage: BookSourceVersionStorageIdentity;
  readonly deletionId: string;
  readonly retirementGuard: PublicationRetirementGuard;
  readonly fencedAt: string;
  readonly currentSourceVersionIds: readonly string[];
  readonly remainingActiveSourceVersionIds: readonly string[];
}

export interface DecideStudentSafeSourceInput {
  readonly accountId: string;
  readonly expectedRevision: number;
  readonly reservationId: string;
  readonly bookId: string;
  readonly actorId: string;
  readonly studentSafeStatus: Exclude<BookSourceStudentSafeStatus, 'unreviewed'>;
  readonly studentSafeDecision: BookSourceStudentSafeDecision;
}

export interface RecordSourceProviderReconciliationInput {
  readonly accountId: string;
  readonly expectedRevision: number;
  readonly snapshot: BookSourceProviderReconciliationSnapshot;
}

export interface RecordSourceProviderReconciliationContinuationInput {
  readonly accountId: string;
  readonly expectedRevision: number;
  readonly expectedContinuationToken?: string;
  readonly continuation: BookSourceProviderReconciliationContinuation;
}

export interface ClearSourceProviderReconciliationContinuationInput {
  readonly accountId: string;
  readonly expectedRevision: number;
  readonly expectedContinuationToken: string;
}

export interface InvalidateSourceProviderReconciliationInput {
  readonly accountId: string;
  readonly expectedRevision: number;
  /** Expected sealed cursor, or undefined when no cursor is stored. */
  readonly expectedContinuationToken?: string;
}

export interface RecordCommittedVersionReconciliationFailureInput {
  readonly accountId: string;
  readonly expectedRevision: number;
  readonly reservationId: string;
  readonly failedAt: string;
  readonly nextRetryAt: string;
  readonly errorCode: string;
}

export interface ClearCommittedVersionReconciliationFailureInput {
  readonly accountId: string;
  readonly expectedRevision: number;
  readonly reservationId: string;
}

export interface SourceUploadRtdbRepositoryOptions {
  readonly now?: () => Date;
}

export class SourceUploadRtdbRepository {
  private readonly now: () => Date;

  constructor(
    private readonly transaction: SourceUploadRtdbTransaction,
    private readonly options: SourceUploadRtdbRepositoryOptions,
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async reserve(input: ReserveSourceUploadInput): Promise<BookSourceUploadAccountState> {
    const now = this.now();
    assertReservationInput(input, now);
    const result = await this.transaction<BookSourceUploadAccountState>({
      path: sourceUploadAccountPath(input.accountId),
      expectedRevision: input.expectedRevision,
      update: (current) => {
        assertReservationInput(input, this.now());
        if (!current) {
          throw new SourceUploadConflictError(
            'upload account state must be provisioned from trusted provider reconciliation.',
          );
        }
        const state = normalizePersistedState(current);
        assertState(state);
        assertCurrentHealthyProviderReconciliation(state, this.now());
        const previous = state.operations[input.reservationId];
        if (previous) {
          if (!sameReservation(previous, input)) throw new SourceUploadConflictError('reservation identity is immutable.');
          return state;
        }
        if (Object.keys(state.operations).length >= MAX_SOURCE_UPLOAD_OPERATIONS) {
          throw new SourceUploadConflictError('upload account operation bound exceeded.');
        }
        for (const operation of Object.values(state.operations)) {
          if (operation.sourceVersionId === input.sourceVersionId) {
            throw new SourceUploadConflictError('sourceVersionId is already reserved.');
          }
          if (operation.providerObjectKey === input.providerObjectKey) {
            throw new SourceUploadConflictError('providerObjectKey is already reserved.');
          }
          if (input.kind !== 'replacement'
              && operation.status !== 'released'
              && operation.bookId === input.bookId
              && operation.sourceKey === input.sourceKey) {
            throw new SourceUploadConflictError('sourceKey is already reserved.');
          }
        }
        const predecessor = input.kind === 'replacement'
          ? findReplacementPredecessor(state.operations, input.bookId, input.sourceKey)
          : undefined;
        const operation: BookSourceUploadOperation = Object.freeze({
          reservationId: input.reservationId,
          bookId: input.bookId,
          sourceVersionId: input.sourceVersionId,
          sourceKey: input.sourceKey,
          ownerId: input.ownerId,
          storageLocationId: input.storageLocationId,
          providerKind: input.providerKind,
          privateBucketId: input.privateBucketId,
          providerObjectKey: input.providerObjectKey,
          kind: input.kind,
          purpose: input.purpose,
          studentSafeStatus: input.studentSafeStatus,
          ...(input.studentSafeDecision === undefined ? {} : {
            studentSafeDecision: Object.freeze({ ...input.studentSafeDecision }),
          }),
          byteSize: input.byteSize,
          originalFilename: normalizeBookSourceDisplayFilename(input.originalFilename),
          expectedChecksum: Object.freeze({ algorithm: 'sha-256', value: input.expectedChecksum.value.toLowerCase() }),
          createdAt: input.createdAt,
          expiresAt: input.expiresAt,
          status: 'reserved',
          ...(predecessor === undefined ? {} : {
            replacesSourceVersionId: predecessor.sourceVersionId,
          }),
        });
        const next = nextState(state, { ...state.operations, [input.reservationId]: operation });
        assertBookSourceCapacityAvailable(calculateBookSourceCapacityUsage({ ...next.capacity, operations: next.operations }));
        return next;
      },
    });
    return requireCommitted(result.committed, result.value);
  }

  async recordProviderReconciliation(
    input: RecordSourceProviderReconciliationInput,
  ): Promise<BookSourceUploadAccountState> {
    assertRtdbKey(input.accountId, 'accountId');
    assertProviderReconciliationSnapshot(input.snapshot);
    if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) {
      throw new SourceUploadConflictError('invalid provider reconciliation revision.');
    }
    const result = await this.transaction<BookSourceUploadAccountState>({
      path: sourceUploadAccountPath(input.accountId),
      expectedRevision: input.expectedRevision,
      update: (current) => {
        if (!current) {
          throw new SourceUploadConflictError('upload account state does not exist.');
        }
        const state = normalizePersistedState(current);
        assertState(state);
        return nextState(state, state.operations, state.capacity.trackedAccountBytes, input.snapshot);
      },
    });
    return requireCommitted(result.committed, result.value);
  }

  async recordProviderReconciliationContinuation(
    input: RecordSourceProviderReconciliationContinuationInput,
  ): Promise<BookSourceUploadAccountState> {
    assertRtdbKey(input.accountId, 'accountId');
    assertExpectedRevision(input.expectedRevision);
    assertOptionalProviderReconciliationToken(input.expectedContinuationToken);
    assertProviderReconciliationContinuation(input.continuation);
    const result = await this.transaction<BookSourceUploadAccountState>({
      path: sourceUploadAccountPath(input.accountId),
      expectedRevision: input.expectedRevision,
      update: (current) => {
        if (!current) {
          throw new SourceUploadConflictError('upload account state does not exist.');
        }
        const state = normalizePersistedState(current);
        assertState(state);
        if (state.capacity.providerReconciliationContinuation?.token
          !== input.expectedContinuationToken) {
          throw new SourceUploadConflictError(
            'provider reconciliation continuation compare-and-set conflict.',
          );
        }
        return withProviderReconciliationContinuation(state, input.continuation);
      },
    });
    return requireCommitted(result.committed, result.value);
  }

  async clearProviderReconciliationContinuation(
    input: ClearSourceProviderReconciliationContinuationInput,
  ): Promise<BookSourceUploadAccountState> {
    assertRtdbKey(input.accountId, 'accountId');
    assertExpectedRevision(input.expectedRevision);
    assertOptionalProviderReconciliationToken(input.expectedContinuationToken);
    const result = await this.transaction<BookSourceUploadAccountState>({
      path: sourceUploadAccountPath(input.accountId),
      expectedRevision: input.expectedRevision,
      update: (current) => {
        if (!current) {
          throw new SourceUploadConflictError('upload account state does not exist.');
        }
        const state = normalizePersistedState(current);
        assertState(state);
        if (state.capacity.providerReconciliationContinuation?.token
          !== input.expectedContinuationToken) {
          throw new SourceUploadConflictError(
            'provider reconciliation continuation compare-and-set conflict.',
          );
        }
        return withProviderReconciliationContinuation(state, undefined);
      },
    });
    return requireCommitted(result.committed, result.value);
  }

  async invalidateProviderReconciliation(
    input: InvalidateSourceProviderReconciliationInput,
  ): Promise<BookSourceUploadAccountState> {
    assertRtdbKey(input.accountId, 'accountId');
    assertExpectedRevision(input.expectedRevision);
    assertOptionalProviderReconciliationToken(input.expectedContinuationToken);
    const result = await this.transaction<BookSourceUploadAccountState>({
      path: sourceUploadAccountPath(input.accountId),
      expectedRevision: input.expectedRevision,
      update: (current) => {
        if (!current) {
          throw new SourceUploadConflictError('upload account state does not exist.');
        }
        const state = normalizePersistedState(current);
        assertState(state);
        if (state.capacity.providerReconciliationContinuation?.token
          !== input.expectedContinuationToken) {
          throw new SourceUploadConflictError(
            'provider reconciliation invalidation compare-and-set conflict.',
          );
        }
        const snapshot = state.capacity.providerReconciliation;
        return nextState(
          state,
          state.operations,
          state.capacity.trackedAccountBytes,
          snapshot === undefined
            ? undefined
            : { ...snapshot, status: 'drift' },
        );
      },
    });
    return requireCommitted(result.committed, result.value);
  }

  async recordCommittedVersionReconciliationFailure(
    input: RecordCommittedVersionReconciliationFailureInput,
  ): Promise<BookSourceUploadAccountState> {
    assertRtdbKey(input.accountId, 'accountId');
    assertRtdbKey(input.reservationId, 'reservationId');
    assertIso(input.failedAt, 'failedAt');
    assertIso(input.nextRetryAt, 'nextRetryAt');
    if (!Number.isSafeInteger(input.expectedRevision)
      || input.expectedRevision < 0
      || Date.parse(input.nextRetryAt) <= Date.parse(input.failedAt)
      || !/^[a-z0-9_]{1,80}$/u.test(input.errorCode)) {
      throw new SourceUploadConflictError('invalid committed-version reconciliation retry.');
    }
    const result = await this.transaction<BookSourceUploadAccountState>({
      path: sourceUploadAccountPath(input.accountId),
      expectedRevision: input.expectedRevision,
      update: (current) => {
        if (!current) throw new SourceUploadConflictError('upload account state does not exist.');
        const state = normalizePersistedState(current);
        assertState(state);
        const operation = state.operations[input.reservationId];
        if (!operation || operation.status !== 'verified_completed') {
          throw new SourceUploadConflictError('committed upload reconciliation is unavailable.');
        }
        return nextState(state, {
          ...state.operations,
          [input.reservationId]: Object.freeze({
            ...operation,
            versionReconciliation: Object.freeze({
              attempt: (operation.versionReconciliation?.attempt ?? 0) + 1,
              nextRetryAt: input.nextRetryAt,
              lastErrorCode: input.errorCode,
            }),
          }),
        });
      },
    });
    return requireCommitted(result.committed, result.value);
  }

  async clearCommittedVersionReconciliationFailure(
    input: ClearCommittedVersionReconciliationFailureInput,
  ): Promise<BookSourceUploadAccountState> {
    assertRtdbKey(input.accountId, 'accountId');
    assertRtdbKey(input.reservationId, 'reservationId');
    if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) {
      throw new SourceUploadConflictError('invalid committed-version reconciliation revision.');
    }
    const result = await this.transaction<BookSourceUploadAccountState>({
      path: sourceUploadAccountPath(input.accountId),
      expectedRevision: input.expectedRevision,
      update: (current) => {
        if (!current) throw new SourceUploadConflictError('upload account state does not exist.');
        const state = normalizePersistedState(current);
        assertState(state);
        const operation = state.operations[input.reservationId];
        if (!operation || operation.status !== 'verified_completed') {
          throw new SourceUploadConflictError('committed upload reconciliation is unavailable.');
        }
        if (operation.versionReconciliation === undefined) return state;
        return nextState(state, {
          ...state.operations,
          [input.reservationId]: Object.freeze({
            ...operation,
            versionReconciliation: undefined,
          }),
        });
      },
    });
    return requireCommitted(result.committed, result.value);
  }

  async completeVerified(input: CompleteSourceUploadInput): Promise<BookSourceUploadAccountState> {
    if (!isIsoDate(input.verifiedAt)) throw new SourceVersionError('verifiedAt must be a UTC ISO date.');
    assertPhysicalPageCount(input.physicalPageCount);
    const verifiedStorage = createBookSourceVersionStorageIdentity(input.verifiedStorage);
    const result = await this.transaction<BookSourceUploadAccountState>({
      path: sourceUploadAccountPath(input.accountId),
      expectedRevision: input.expectedRevision,
      update: (current) => {
        if (!current) throw new SourceUploadConflictError('upload account state does not exist.');
        const state = normalizePersistedState(current);
        assertState(state);
        const operation = state.operations[input.reservationId];
        if (!operation) throw new SourceUploadConflictError('upload reservation does not exist.');
        if (operation.status === 'verified_completed') {
          if (!sameVerifiedStorage(operation.verifiedStorage, verifiedStorage)
            || operation.completedAt !== input.verifiedAt
            || operation.physicalPageCount !== input.physicalPageCount) {
            throw new SourceUploadConflictError('verified completion identity is immutable.');
          }
          return ensureAssemblyProjection(state, operation);
        }
        if (operation.status !== 'reserved') throw new SourceUploadConflictError('only a reserved upload can complete.');
        const commitNow = this.now().getTime();
        const verifiedAt = Date.parse(input.verifiedAt);
        if (!Number.isFinite(commitNow)
          || Date.parse(operation.expiresAt) <= commitNow
          || verifiedAt < Date.parse(operation.createdAt)
          || verifiedAt > commitNow) {
          throw new SourceUploadConflictError('trusted completion must occur within the reservation window.');
        }
        assertTrustedCompletionMatchesReservation(operation, verifiedStorage);
        const completed = Object.freeze({
          ...operation,
          status: 'verified_completed' as const,
          verifiedStorage,
          physicalPageCount: input.physicalPageCount,
          completedAt: input.verifiedAt,
        });
        const completedOperations = { ...state.operations, [input.reservationId]: completed };
        const next = nextState(
          state,
          completedOperations,
          state.capacity.trackedAccountBytes + operation.byteSize,
          state.capacity.providerReconciliation,
          withAssemblyProjection(state.assemblyBooks, completed),
          withLifecycleAuditEvents(state, completed, state.revision + 1, input.verifiedAt),
        );
        assertBookSourceCapacityAvailable(calculateBookSourceCapacityUsage({ ...next.capacity, operations: next.operations }));
        return next;
      },
    });
    return requireCommitted(result.committed, result.value);
  }

  async decideStudentSafeSource(input: DecideStudentSafeSourceInput): Promise<BookSourceUploadAccountState> {
    assertDecisionInput(input);
    const result = await this.transaction<BookSourceUploadAccountState>({
      path: sourceUploadAccountPath(input.accountId),
      expectedRevision: input.expectedRevision,
      update: (current) => {
        if (!current) throw new SourceUploadConflictError('upload account state does not exist.');
        const state = normalizePersistedState(current);
        assertState(state);
        const operation = state.operations[input.reservationId];
        if (!operation || operation.bookId !== input.bookId) {
          throw new SourceUploadConflictError('student-safe decision authority is unavailable.');
        }
        if (operation.status !== 'verified_completed') {
          throw new SourceUploadConflictError('student-safe decision requires a verified source.');
        }
        assertStudentSafeDecisionMatches(operation, input.studentSafeDecision);
        if (operation.studentSafeStatus !== 'unreviewed') {
          if (sameStudentSafeDecision(operation.studentSafeStatus, operation.studentSafeDecision, input)) return state;
          throw new SourceUploadConflictError('student-safe decision is immutable.');
        }
        const decided = Object.freeze({
          ...operation,
          studentSafeStatus: input.studentSafeStatus,
          studentSafeDecision: Object.freeze({ ...input.studentSafeDecision }),
        });
        return nextState(
          state,
          { ...state.operations, [input.reservationId]: decided },
          state.capacity.trackedAccountBytes,
          state.capacity.providerReconciliation,
          withAssemblyProjection(state.assemblyBooks, decided),
        );
      },
    });
    return requireCommitted(result.committed, result.value);
  }

  async requestCleanup(input: RequestSourceUploadCleanupInput): Promise<BookSourceUploadAccountState> {
    assertRtdbKey(input.accountId, 'accountId');
    assertRtdbKey(input.reservationId, 'reservationId');
    assertSafeId(input.ownerId, 'ownerId');
    assertCleanupReason(input.reason);
    assertIso(input.requestedAt, 'requestedAt');
    assertOptionalProviderIdentity(input.providerFileId, input.providerFileVersionId);
    const result = await this.transaction<BookSourceUploadAccountState>({
      path: sourceUploadAccountPath(input.accountId),
      expectedRevision: input.expectedRevision,
      update: (current) => {
        if (!current) throw new SourceUploadConflictError('upload account state does not exist.');
        const state = normalizePersistedState(current);
        assertState(state);
        const operation = state.operations[input.reservationId];
        if (!operation || operation.ownerId !== input.ownerId) {
          throw new SourceUploadConflictError('upload reservation owner mismatch.');
        }
        if (operation.status === 'verified_completed' || operation.status === 'retired') {
          throw new SourceUploadConflictError('verified upload cannot enter cleanup.');
        }
        if (operation.status === 'released') return state;
        if (operation.status === 'cleanup_pending') {
          if (operation.cleanup?.reason !== input.reason
            || operation.cleanup.providerFileId !== input.providerFileId
            || operation.cleanup.providerFileVersionId !== input.providerFileVersionId) {
            throw new SourceUploadConflictError('cleanup request identity is immutable.');
          }
          return state;
        }
        const cleanup = Object.freeze({
          reason: input.reason,
          requestedAt: input.requestedAt,
          attempt: 0,
          nextRetryAt: input.providerFileId === undefined
            && Date.parse(operation.expiresAt) > Date.parse(input.requestedAt)
            ? operation.expiresAt
            : input.requestedAt,
          ...(input.providerFileId === undefined ? {} : {
            providerFileId: input.providerFileId,
            providerFileVersionId: input.providerFileVersionId,
          }),
        });
        return nextState(state, {
          ...state.operations,
          [input.reservationId]: Object.freeze({
            ...operation,
            status: 'cleanup_pending' as const,
            cleanup,
          }),
        });
      },
    });
    return requireCommitted(result.committed, result.value);
  }

  async claimCleanup(input: ClaimSourceUploadCleanupInput): Promise<BookSourceUploadAccountState> {
    assertCleanupLeaseInput(input);
    const result = await this.transaction<BookSourceUploadAccountState>({
      path: sourceUploadAccountPath(input.accountId),
      expectedRevision: input.expectedRevision,
      update: (current) => {
        if (!current) throw new SourceUploadConflictError('upload account state does not exist.');
        const state = normalizePersistedState(current);
        assertState(state);
        const operation = state.operations[input.reservationId];
        if (!operation || operation.status !== 'cleanup_pending' || !operation.cleanup) {
          throw new SourceUploadConflictError('upload cleanup is not pending.');
        }
        const claimedAt = Date.parse(input.claimedAt);
        if (Date.parse(operation.cleanup.nextRetryAt) > claimedAt
          || (operation.cleanup.leaseExpiresAt !== undefined
            && Date.parse(operation.cleanup.leaseExpiresAt) > claimedAt)) {
          throw new SourceUploadConflictError('upload cleanup lease is unavailable.');
        }
        return nextState(state, {
          ...state.operations,
          [input.reservationId]: Object.freeze({
            ...operation,
            cleanup: Object.freeze({
              ...operation.cleanup,
              attempt: operation.cleanup.attempt + 1,
              leaseOwner: input.leaseOwner,
              leaseExpiresAt: input.leaseExpiresAt,
            }),
          }),
        });
      },
    });
    return requireCommitted(result.committed, result.value);
  }

  async failCleanup(input: FailSourceUploadCleanupInput): Promise<BookSourceUploadAccountState> {
    assertCleanupResultInput(input, input.failedAt);
    assertIso(input.nextRetryAt, 'nextRetryAt');
    if (Date.parse(input.nextRetryAt) <= Date.parse(input.failedAt)
      || !/^[a-z0-9_]{1,80}$/u.test(input.errorCode)) {
      throw new SourceUploadConflictError('invalid cleanup retry metadata.');
    }
    return this.finishCleanupLease(input, (operation) => Object.freeze({
      ...operation,
      cleanup: Object.freeze({
        ...operation.cleanup!,
        nextRetryAt: input.nextRetryAt,
        lastErrorCode: input.errorCode,
        leaseOwner: undefined,
        leaseExpiresAt: undefined,
      }),
    }));
  }

  async releaseCleaned(input: ReleaseSourceUploadInput): Promise<BookSourceUploadAccountState> {
    assertCleanupResultInput(input, input.releasedAt);
    if (input.proof !== 'exact_version_deleted' && input.proof !== 'provider_absent') {
      throw new SourceUploadConflictError('invalid cleanup release proof.');
    }
    return this.finishCleanupLease(input, (operation) => Object.freeze({
      ...operation,
      status: 'released' as const,
      cleanup: undefined,
      releasedAt: input.releasedAt,
      releaseProof: input.proof,
    }));
  }

  async fenceVerifiedSource(input: FenceVerifiedSourceInput): Promise<BookSourceUploadAccountState> {
    assertFenceInput(input);
    const verifiedStorage = createBookSourceVersionStorageIdentity(input.verifiedStorage);
    const result = await this.transaction<BookSourceUploadAccountState>({
      path: sourceUploadAccountPath(input.accountId),
      expectedRevision: input.expectedRevision,
      update: (current) => {
        if (!current) throw new SourceUploadConflictError('upload account state does not exist.');
        const state = normalizePersistedState(current);
        assertState(state);
        const operation = state.operations[input.reservationId];
        if (!operation || operation.bookId !== input.bookId) {
          throw new SourceUploadConflictError('verified upload operation is missing or ambiguous.');
        }
        if (operation.status === 'retirement_pending') {
          if (input.currentSourceVersionIds.includes(operation.sourceVersionId)
            || input.remainingActiveSourceVersionIds.includes(operation.sourceVersionId)) {
            throw new SourceUploadConflictError('verified source is still actively referenced.');
          }
          if (!samePendingReplay(operation, input, verifiedStorage)) {
            throw new SourceUploadConflictError('retirement fence identity conflicts.');
          }
          return state;
        }
        if (operation.status !== 'verified_completed'
          || operation.sourceVersionId !== input.sourceVersionId
          || operation.sourceKey !== input.sourceKey
          || operation.ownerId !== input.ownerId
          || !sameVerifiedStorage(operation.verifiedStorage, verifiedStorage)) {
          throw new SourceUploadConflictError('verified upload identity is stale or mismatched.');
        }
        assertRetirementGuard(input.retirementGuard, input, operation);
        const projection = state.assemblyBooks?.[operation.bookId]?.[operation.sourceVersionId];
        if (!projection || projection.verifiedUsable !== true) {
          throw new SourceUploadConflictError('verified Assembly projection is missing or mismatched.');
        }
        const pending = Object.freeze({
          ...operation,
          status: 'retirement_pending' as const,
          retirementGuard: Object.freeze({ ...input.retirementGuard, sourceVersionIds: [...input.retirementGuard.sourceVersionIds] }),
          retiredDeletionId: input.deletionId,
          retirementPendingAt: input.fencedAt,
        });
        const { [operation.sourceVersionId]: _removed, ...remainingSources } = state.assemblyBooks![operation.bookId]!;
        const audit = withLifecycleAuditEvents(state, pending, state.revision + 1, input.fencedAt, {
          deletionId: input.deletionId,
          retirementGuard: input.retirementGuard,
        });
        return nextState(
          state,
          { ...state.operations, [input.reservationId]: pending },
          state.capacity.trackedAccountBytes,
          state.capacity.providerReconciliation,
          { ...state.assemblyBooks, [operation.bookId]: remainingSources },
          audit,
        );
      },
    });
    return requireCommitted(result.committed, result.value);
  }

  async retireVerifiedSource(input: RetireVerifiedSourceInput): Promise<BookSourceUploadAccountState> {
    assertRetireInput(input);
    const verifiedStorage = createBookSourceVersionStorageIdentity(input.verifiedStorage);
    const result = await this.transaction<BookSourceUploadAccountState>({
      path: sourceUploadAccountPath(input.accountId),
      expectedRevision: input.expectedRevision,
      update: (current) => {
        if (!current) throw new SourceUploadConflictError('upload account state does not exist.');
        const state = normalizePersistedState(current);
        assertState(state);
        const operation = state.operations[input.reservationId];
        if (!operation || operation.bookId !== input.bookId) {
          throw new SourceUploadConflictError('verified upload operation is missing or ambiguous.');
        }
        if (operation.status === 'retired') {
          if (!sameRetiredReplay(operation, input, verifiedStorage)) {
            throw new SourceUploadConflictError('retired source replay identity conflicts.');
          }
          return state;
        }
        if (operation.status === 'retirement_pending') {
          if (operation.sourceKey !== input.sourceKey
            || operation.ownerId !== input.ownerId
            || !input.retirementGuard || !samePublicationGuard(operation.retirementGuard, input.retirementGuard)
            || operation.retiredDeletionId !== input.deletionId) {
            throw new SourceUploadConflictError('retirement fence identity conflicts.');
          }
          if (!sameVerifiedStorage(operation.verifiedStorage, verifiedStorage)) {
            throw new SourceUploadConflictError('verified upload identity is stale or mismatched.');
          }
          assertRetirementGuard(input.retirementGuard, input, operation);
          return retirePendingOperation(state, operation, input, verifiedStorage);
        }
        throw new SourceUploadConflictError('retirement fence is required before final retirement.');
      },
    });
    return requireCommitted(result.committed, result.value);
  }

  private async finishCleanupLease(
    input: Pick<FailSourceUploadCleanupInput, 'accountId' | 'expectedRevision' | 'reservationId' | 'leaseOwner'>,
    update: (operation: BookSourceUploadOperation) => BookSourceUploadOperation,
  ): Promise<BookSourceUploadAccountState> {
    const result = await this.transaction<BookSourceUploadAccountState>({
      path: sourceUploadAccountPath(input.accountId),
      expectedRevision: input.expectedRevision,
      update: (current) => {
        if (!current) throw new SourceUploadConflictError('upload account state does not exist.');
        const state = normalizePersistedState(current);
        assertState(state);
        const operation = state.operations[input.reservationId];
        if (operation?.status === 'released') return state;
        if (!operation || operation.status !== 'cleanup_pending'
          || operation.cleanup?.leaseOwner !== input.leaseOwner) {
          throw new SourceUploadConflictError('upload cleanup lease mismatch.');
        }
        return nextState(state, {
          ...state.operations,
          [input.reservationId]: update(operation),
        });
      },
    });
    return requireCommitted(result.committed, result.value);
  }
}

export const sourceUploadAccountPath = (accountId: string): string =>
  `book_source_upload_accounts/${assertRtdbKey(accountId, 'accountId')}`;

/**
 * Derives provider totals only from canonical verified rows. Any aggregate
 * mismatch or temporary provider state fails closed before reconciliation.
 */
export function getBookSourceUploadProviderTotals(
  value: unknown,
): { readonly totalBytes: number; readonly objectCount: number } {
  const state = normalizePersistedState(value as BookSourceUploadAccountState);
  assertState(state);
  if (state.capacity.temporaryBytes !== 0) {
    throw new SourceUploadConflictError('temporary provider bytes require reconciliation.');
  }
  const completed = Object.values(state.operations).filter(
    (operation) => operation.status === 'verified_completed' || operation.status === 'retirement_pending',
  );
  const totalBytes = completed.reduce((sum, operation) => sum + operation.byteSize, 0);
  if (!Number.isSafeInteger(totalBytes)
    || totalBytes !== state.capacity.trackedAccountBytes) {
    throw new SourceUploadConflictError('tracked provider bytes do not match verified operations.');
  }
  return Object.freeze({ totalBytes, objectCount: completed.length });
}

export function validateBookSourceUploadAccountState(
  value: unknown,
): BookSourceUploadAccountState {
  const state = normalizePersistedState(value as BookSourceUploadAccountState);
  assertState(state);
  return state;
}

function nextState(
  state: BookSourceUploadAccountState,
  operations: Readonly<Record<string, BookSourceUploadOperation>>,
  trackedAccountBytes = state.capacity.trackedAccountBytes,
  providerReconciliation = state.capacity.providerReconciliation,
  assemblyBooks = state.assemblyBooks,
  lifecycleAuditEvents = state.lifecycleAuditEvents,
): BookSourceUploadAccountState {
  return Object.freeze({
    revision: state.revision + 1,
    capacity: Object.freeze({
      trackedAccountBytes,
      temporaryBytes: state.capacity.temporaryBytes,
      ...(providerReconciliation === undefined ? {} : {
        providerReconciliation: Object.freeze({ ...providerReconciliation }),
      }),
      // Any domain revision change invalidates an in-progress provider scan.
    }),
    operations: Object.freeze(operations),
    ...(assemblyBooks === undefined ? {} : {
      assemblyBooks: freezeAssemblyBooks(assemblyBooks, operations),
    }),
    ...(lifecycleAuditEvents === undefined ? {} : {
      lifecycleAuditEvents: freezeLifecycleAuditEvents(lifecycleAuditEvents),
    }),
  });
}

function withProviderReconciliationContinuation(
  state: BookSourceUploadAccountState,
  continuation: BookSourceProviderReconciliationContinuation | undefined,
): BookSourceUploadAccountState {
  return Object.freeze({
    ...state,
    capacity: Object.freeze({
      trackedAccountBytes: state.capacity.trackedAccountBytes,
      temporaryBytes: state.capacity.temporaryBytes,
      ...(state.capacity.providerReconciliation === undefined ? {} : {
        providerReconciliation: Object.freeze({ ...state.capacity.providerReconciliation }),
      }),
      ...(continuation === undefined ? {} : {
        providerReconciliationContinuation: Object.freeze({ ...continuation }),
      }),
    }),
    ...(state.assemblyBooks === undefined ? {} : {
      assemblyBooks: freezeAssemblyBooks(state.assemblyBooks, state.operations),
    }),
    ...(state.lifecycleAuditEvents === undefined ? {} : {
      lifecycleAuditEvents: freezeLifecycleAuditEvents(state.lifecycleAuditEvents),
    }),
  });
}

function normalizePersistedState(value: BookSourceUploadAccountState): BookSourceUploadAccountState {
  if (value.operations !== undefined && value.assemblyBooks !== undefined) return value;
  return {
    ...value,
    operations: value.operations ?? {},
    assemblyBooks: value.assemblyBooks === undefined ? {} : value.assemblyBooks,
  };
}

function requireCommitted<T>(committed: boolean, value: T | null): T {
  if (!committed || value === null) throw new SourceUploadConflictError('source upload compare-and-set conflict.');
  return value;
}

function assertReservationInput(input: ReserveSourceUploadInput, now: Date): void {
  assertRtdbKey(input.accountId, 'accountId');
  assertRtdbKey(input.reservationId, 'reservationId');
  assertSafeId(input.bookId, 'bookId');
  assertSafeId(input.sourceVersionId, 'sourceVersionId');
  assertSafeId(input.sourceKey, 'sourceKey');
  assertSafeId(input.ownerId, 'ownerId');
  assertSafeId(input.storageLocationId, 'storageLocationId');
  assertSafeId(input.providerKind, 'providerKind');
  assertSafeId(input.privateBucketId, 'privateBucketId');
  assertProviderObjectKey(input.providerObjectKey);
  if (input.kind !== 'initial' && input.kind !== 'replacement') throw new SourceVersionError('kind must be initial or replacement.');
  assertStudentSafeFields(input.purpose, input.studentSafeStatus, input.studentSafeDecision);
  if (input.studentSafeStatus !== 'unreviewed') {
    throw new SourceUploadConflictError('new reservations must start unreviewed.');
  }
  assertBookSourcePdfByteSize(input.byteSize, input.purpose);
  if (input.expectedChecksum.algorithm !== 'sha-256' || !/^[a-fA-F0-9]{64}$/u.test(input.expectedChecksum.value)) {
    throw new SourceVersionError('expectedChecksum must be a SHA-256 checksum.');
  }
  if (!(now instanceof Date)
    || !Number.isFinite(now.getTime())
    || !Number.isSafeInteger(input.expectedRevision)
    || input.expectedRevision < 0
    || !isIsoDate(input.createdAt)
    || !isIsoDate(input.expiresAt)
    || Date.parse(input.expiresAt) <= Date.parse(input.createdAt)
    || Date.parse(input.expiresAt) <= now.getTime()) {
    throw new SourceVersionError('expectedRevision, createdAt, and expiresAt must be valid.');
  }
  normalizeBookSourceDisplayFilename(input.originalFilename);
}

function assertState(state: BookSourceUploadAccountState): void {
  const operations = state.operations ?? {};
  const capacityKeys = isPlainRecord(state.capacity)
    ? Object.keys(state.capacity)
    : [];
  if (!isPlainRecord(state) ||
      (!hasOnlyKeys(state, ['revision', 'capacity', 'operations', 'assemblyBooks', 'lifecycleAuditEvents']) &&
        !hasOnlyKeys(state, ['revision', 'capacity', 'operations', 'assemblyBooks']) &&
        !hasOnlyKeys(state, ['revision', 'capacity', 'operations', 'lifecycleAuditEvents']) &&
        !hasOnlyKeys(state, ['revision', 'capacity', 'operations']) &&
        !hasOnlyKeys(state, ['revision', 'capacity'])) ||
      !Number.isSafeInteger(state.revision) ||
      (state.revision as number) < 0 ||
      !isPlainRecord(state.capacity) ||
      !capacityKeys.includes('trackedAccountBytes') ||
      !capacityKeys.includes('temporaryBytes') ||
      capacityKeys.some((key) => ![
        'trackedAccountBytes',
        'temporaryBytes',
        'providerReconciliation',
        'providerReconciliationContinuation',
      ].includes(key)) ||
      !isPlainRecord(operations)) {
    throw new SourceUploadConflictError('invalid upload account state.');
  }
  if (state.lifecycleAuditEvents !== undefined) {
    assertLifecycleAuditEvents(state.lifecycleAuditEvents);
  }
  if (state.capacity.providerReconciliation !== undefined) {
    assertProviderReconciliationSnapshot(state.capacity.providerReconciliation);
  }
  if (state.capacity.providerReconciliationContinuation !== undefined) {
    assertProviderReconciliationContinuation(
      state.capacity.providerReconciliationContinuation,
    );
  }
  const entries = Object.entries(operations);
  if (entries.length > MAX_SOURCE_UPLOAD_OPERATIONS) {
    throw new SourceUploadConflictError('upload account operation bound exceeded.');
  }
  const sourceVersionIds = new Set<string>();
  const providerObjectKeys = new Set<string>();
  let verifiedBytes = 0;
  for (const [reservationId, operation] of entries) {
    assertRtdbKey(reservationId, 'reservationId');
    assertOperation(operation);
    if (reservationId !== operation.reservationId || sourceVersionIds.has(operation.sourceVersionId)) {
      throw new SourceUploadConflictError('upload account operation identity is inconsistent.');
    }
    sourceVersionIds.add(operation.sourceVersionId);
    if (operation.status !== 'retired') {
      if (providerObjectKeys.has(operation.providerObjectKey)) {
        throw new SourceUploadConflictError('upload account operation identity is inconsistent.');
      }
      providerObjectKeys.add(operation.providerObjectKey);
    }
    if (operation.status === 'verified_completed' || operation.status === 'retirement_pending') {
      verifiedBytes += operation.byteSize;
    }
  }
  if (!Number.isSafeInteger(verifiedBytes)
    || state.capacity.trackedAccountBytes < verifiedBytes) {
    throw new SourceUploadConflictError('tracked provider bytes undercount verified operations.');
  }
  if (state.assemblyBooks !== undefined) assertAssemblyBooks(state.assemblyBooks, state.operations);
  calculateBookSourceCapacityUsage({ ...state.capacity, operations: state.operations });
}

function assertExpectedRevision(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new SourceUploadConflictError('invalid provider reconciliation revision.');
  }
}

function assertProviderReconciliationContinuation(
  value: unknown,
): asserts value is BookSourceProviderReconciliationContinuation {
  if (!isPlainRecord(value)
    || !hasOnlyKeys(value, ['token', 'updatedAt'])
    || typeof value.token !== 'string'
    || !/^[A-Za-z0-9_-]{1,65536}$/u.test(value.token)
    || typeof value.updatedAt !== 'string'
    || !isIsoDate(value.updatedAt)) {
    throw new SourceUploadConflictError('invalid provider reconciliation continuation.');
  }
}

function assertOptionalProviderReconciliationToken(value: unknown): void {
  if (value !== undefined
    && (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,65536}$/u.test(value))) {
    throw new SourceUploadConflictError('invalid provider reconciliation continuation.');
  }
}

function assertProviderReconciliationSnapshot(
  value: unknown,
): asserts value is BookSourceProviderReconciliationSnapshot {
  if (!isPlainRecord(value)
    || !hasOnlyKeys(value, ['status', 'totalBytes', 'objectCount', 'completedAt'])
    || (value.status !== 'healthy' && value.status !== 'drift')
    || typeof value.totalBytes !== 'number'
    || !Number.isSafeInteger(value.totalBytes)
    || value.totalBytes < 0
    || typeof value.objectCount !== 'number'
    || !Number.isSafeInteger(value.objectCount)
    || value.objectCount < 0
    || typeof value.completedAt !== 'string'
    || !isIsoDate(value.completedAt)) {
    throw new SourceUploadConflictError('invalid provider reconciliation snapshot.');
  }
}

function assertCurrentHealthyProviderReconciliation(
  state: BookSourceUploadAccountState,
  now: Date,
): void {
  const snapshot = state.capacity.providerReconciliation;
  const nowMs = now.getTime();
  const completedAtMs = snapshot === undefined
    ? Number.NaN
    : Date.parse(snapshot.completedAt);
  if (snapshot === undefined
    || snapshot.status !== 'healthy'
    || !Number.isFinite(nowMs)
    || !Number.isFinite(completedAtMs)
    || completedAtMs > nowMs
    || nowMs - completedAtMs > BOOK_SOURCE_PROVIDER_RECONCILIATION_MAX_AGE_MS) {
    throw new SourceUploadConflictError(
      'current healthy provider reconciliation is required before upload authorization.',
    );
  }
}

function assertOperation(value: unknown): asserts value is BookSourceUploadOperation {
  if (!isPlainRecord(value)) {
    throw new SourceUploadConflictError('invalid upload operation.');
  }
  if (value.status === 'retired') {
    assertRetiredOperation(value);
    return;
  }
  if (value.status === 'retirement_pending') {
    assertRetirementPendingOperation(value);
    return;
  }
  if (!hasOnlyKeys(value, OPERATION_KEYS)) {
    throw new SourceUploadConflictError('invalid upload operation.');
  }
  assertRtdbKey(value.reservationId, 'reservationId');
  for (const [field, label] of [
    ['bookId', 'bookId'],
    ['sourceVersionId', 'sourceVersionId'],
    ['sourceKey', 'sourceKey'],
    ['ownerId', 'ownerId'],
    ['storageLocationId', 'storageLocationId'],
    ['providerKind', 'providerKind'],
    ['privateBucketId', 'privateBucketId'],
  ] as const) {
    assertSafeId(value[field], label);
  }
  assertProviderObjectKey(value.providerObjectKey);
  if (value.kind !== 'initial' && value.kind !== 'replacement') {
    throw new SourceUploadConflictError('invalid upload operation kind.');
  }
  assertStudentSafeFields(value.purpose, value.studentSafeStatus, value.studentSafeDecision);
  if (value.status !== 'reserved' &&
      value.status !== 'cleanup_pending' &&
       value.status !== 'verified_completed' &&
       value.status !== 'retirement_pending' &&
      value.status !== 'released') {
    throw new SourceUploadConflictError('invalid upload operation status.');
  }
  assertBookSourcePdfByteSize(value.byteSize, value.purpose);
  if (value.ownerAttestedPhysicalPageCount !== undefined) {
    throw new SourceUploadConflictError('active upload cannot contain an owner-attested page count.');
  }
  if (value.replacesSourceVersionId !== undefined) {
    assertSafeId(value.replacesSourceVersionId, 'replacesSourceVersionId');
    if (value.replacesSourceVersionId === value.sourceVersionId) {
      throw new SourceUploadConflictError('replacement provenance cannot reference itself.');
    }
  }
  if (normalizeBookSourceDisplayFilename(value.originalFilename) !== value.originalFilename ||
      !isPlainRecord(value.expectedChecksum) ||
      !hasOnlyKeys(value.expectedChecksum, ['algorithm', 'value']) ||
      value.expectedChecksum.algorithm !== 'sha-256' ||
      typeof value.expectedChecksum.value !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(value.expectedChecksum.value) ||
      typeof value.createdAt !== 'string' ||
      typeof value.expiresAt !== 'string' ||
      !isIsoDate(value.createdAt) ||
      !isIsoDate(value.expiresAt) ||
      Date.parse(value.expiresAt) <= Date.parse(value.createdAt)) {
    throw new SourceUploadConflictError('invalid upload operation metadata.');
  }
  const studentSafeDecision = value.studentSafeDecision;
  if (isPlainRecord(studentSafeDecision)
    && (studentSafeDecision.sourceVersionId !== value.sourceVersionId
      || studentSafeDecision.sha256Hex !== value.expectedChecksum.value)) {
    throw new SourceUploadConflictError('student-safe decision is stale or hash-mismatched.');
  }
  if ((value.status === 'reserved' || value.status === 'cleanup_pending' || value.status === 'released')
      && (value.verifiedStorage !== undefined || value.completedAt !== undefined)) {
    throw new SourceUploadConflictError('unverified upload cannot contain completion identity.');
  }
  if (value.status === 'verified_completed') {
    if (value.verifiedStorage === undefined ||
        typeof value.completedAt !== 'string' ||
        !isIsoDate(value.completedAt) ||
        value.physicalPageCount === undefined) {
      throw new SourceUploadConflictError('verified upload completion is incomplete.');
    }
    assertPhysicalPageCount(value.physicalPageCount);
    const completedAt = Date.parse(value.completedAt);
    if (completedAt < Date.parse(value.createdAt) || completedAt > Date.parse(value.expiresAt)) {
      throw new SourceUploadConflictError('verified upload completion is outside the reservation window.');
    }
    const storage = createBookSourceVersionStorageIdentity(value.verifiedStorage);
    assertTrustedCompletionMatchesReservation(
      value as unknown as BookSourceUploadOperation,
      storage,
    );
    if (value.versionReconciliation !== undefined) {
      assertCommittedVersionReconciliationState(value.versionReconciliation);
    }
  } else if (value.physicalPageCount !== undefined) {
    throw new SourceUploadConflictError('unverified upload cannot contain a trusted page count.');
  } else if (value.versionReconciliation !== undefined) {
    throw new SourceUploadConflictError(
      'only a verified upload can contain version reconciliation state.',
    );
  }
  if (value.status === 'cleanup_pending') {
    assertCleanupState(value.cleanup);
    if (value.releasedAt !== undefined || value.releaseProof !== undefined) {
      throw new SourceUploadConflictError('pending cleanup cannot contain release proof.');
    }
  } else if (value.cleanup !== undefined) {
    throw new SourceUploadConflictError('only pending cleanup can contain cleanup state.');
  }
  if (value.status === 'released') {
    if (typeof value.releasedAt !== 'string'
      || !isIsoDate(value.releasedAt)
      || (value.releaseProof !== 'exact_version_deleted' && value.releaseProof !== 'provider_absent')) {
      throw new SourceUploadConflictError('released upload requires exact cleanup proof.');
    }
  } else if (value.releasedAt !== undefined || value.releaseProof !== undefined) {
    throw new SourceUploadConflictError('only released upload can contain release proof.');
  }
}

function assertRetiredOperation(value: Record<string, unknown>): void {
  if (!hasOnlyKeys(value, RETIRED_OPERATION_KEYS)) {
    throw new SourceUploadConflictError('invalid retired upload operation.');
  }
  for (const [field, label] of [
    ['reservationId', 'reservationId'],
    ['bookId', 'bookId'],
    ['sourceVersionId', 'sourceVersionId'],
    ['sourceKey', 'sourceKey'],
    ['ownerId', 'ownerId'],
    ['retiredDeletionId', 'retiredDeletionId'],
  ] as const) assertSafeId(value[field], label);
  assertStudentSafeFields(value.purpose, value.studentSafeStatus, value.studentSafeDecision);
  if (!isPlainRecord(value.checksum)
    || !hasOnlyKeys(value.checksum, ['algorithm', 'value'])
    || value.checksum.algorithm !== 'sha-256'
    || typeof value.checksum.value !== 'string'
    || !/^[a-f0-9]{64}$/u.test(value.checksum.value)) {
    throw new SourceUploadConflictError('invalid retired upload checksum.');
  }
  const studentSafeDecision = value.studentSafeDecision;
  if (isPlainRecord(studentSafeDecision)
    && (studentSafeDecision.sourceVersionId !== value.sourceVersionId
      || studentSafeDecision.sha256Hex !== value.checksum.value)) {
    throw new SourceUploadConflictError('retired student-safe decision is stale or hash-mismatched.');
  }
  assertBookSourcePdfByteSize(value.byteSize, value.purpose);
  assertPhysicalPageCount(value.ownerAttestedPhysicalPageCount);
  if (normalizeBookSourceDisplayFilename(value.originalFilename) !== value.originalFilename
    || typeof value.createdAt !== 'string'
    || typeof value.completedAt !== 'string'
    || typeof value.retiredAt !== 'string'
    || !isIsoDate(value.createdAt)
    || !isIsoDate(value.completedAt)
    || !isIsoDate(value.retiredAt)
    || Date.parse(value.completedAt) < Date.parse(value.createdAt)
    || Date.parse(value.retiredAt) < Date.parse(value.completedAt)
    || (value.retirementProof !== 'exact_version_deleted'
      && value.retirementProof !== 'provider_absent')) {
    throw new SourceUploadConflictError('invalid retired upload metadata.');
  }
  if (value.retirementGuard !== undefined) {
    assertRetirementGuardShape(value.retirementGuard as PublicationRetirementGuard);
    if ((value.retirementGuard as PublicationRetirementGuard).deletionId !== value.retiredDeletionId
      || (value.retirementGuard as PublicationRetirementGuard).bookId !== value.bookId
      || (value.retirementGuard as PublicationRetirementGuard).sourceVersionId !== value.sourceVersionId
      || (value.retirementGuard as PublicationRetirementGuard).sourceVersionIds.includes(value.sourceVersionId as string)) {
      throw new SourceUploadConflictError('retired deletion identity mismatch.');
    }
  } else {
    throw new SourceUploadConflictError('retired upload requires retirement guard.');
  }
}

function assertRetirementPendingOperation(value: Record<string, unknown>): void {
  if (!hasOnlyKeys(value, OPERATION_KEYS)) {
    throw new SourceUploadConflictError('invalid retirement-pending upload operation.');
  }
  assertOperation({ ...value, status: 'verified_completed' });
  if (value.retirementGuard === undefined || value.retiredDeletionId === undefined
    || typeof value.retirementPendingAt !== 'string' || !isIsoDate(value.retirementPendingAt)) {
    throw new SourceUploadConflictError('retirement-pending upload operation is incomplete.');
  }
  assertRetirementGuardShape(value.retirementGuard as PublicationRetirementGuard);
  assertSafeId(value.retiredDeletionId, 'retiredDeletionId');
  if ((value.retirementGuard as PublicationRetirementGuard).deletionId !== value.retiredDeletionId) {
    throw new SourceUploadConflictError('retirement-pending deletion identity mismatch.');
  }
  if ((value.retirementGuard as PublicationRetirementGuard).bookId !== value.bookId
    || (value.retirementGuard as PublicationRetirementGuard).sourceVersionId !== value.sourceVersionId
    || (value.retirementGuard as PublicationRetirementGuard).sourceVersionIds.includes(value.sourceVersionId as string)) {
    throw new SourceUploadConflictError('retirement-pending source identity mismatch.');
  }
}

function assertCommittedVersionReconciliationState(value: unknown): void {
  if (!isPlainRecord(value)
    || !hasOnlyKeys(value, ['attempt', 'nextRetryAt', 'lastErrorCode'])
    || !Number.isSafeInteger(value.attempt)
    || (value.attempt as number) < 1
    || typeof value.nextRetryAt !== 'string'
    || !isIsoDate(value.nextRetryAt)
    || typeof value.lastErrorCode !== 'string'
    || !/^[a-z0-9_]{1,80}$/u.test(value.lastErrorCode)) {
    throw new SourceUploadConflictError('invalid committed-version reconciliation state.');
  }
}

function assertCleanupState(value: unknown): void {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, CLEANUP_KEYS)) {
    throw new SourceUploadConflictError('invalid upload cleanup state.');
  }
  assertCleanupReason(value.reason);
  if (typeof value.requestedAt !== 'string' || !isIsoDate(value.requestedAt)
    || typeof value.nextRetryAt !== 'string' || !isIsoDate(value.nextRetryAt)
    || Date.parse(value.nextRetryAt) < Date.parse(value.requestedAt)
    || !Number.isSafeInteger(value.attempt) || (value.attempt as number) < 0) {
    throw new SourceUploadConflictError('invalid upload cleanup retry state.');
  }
  assertOptionalProviderIdentity(value.providerFileId, value.providerFileVersionId);
  if (value.lastErrorCode !== undefined
    && (typeof value.lastErrorCode !== 'string' || !/^[a-z0-9_]{1,80}$/u.test(value.lastErrorCode))) {
    throw new SourceUploadConflictError('invalid upload cleanup error code.');
  }
  const hasLeaseOwner = value.leaseOwner !== undefined;
  const hasLeaseExpiry = value.leaseExpiresAt !== undefined;
  if (hasLeaseOwner !== hasLeaseExpiry) {
    throw new SourceUploadConflictError('upload cleanup lease is incomplete.');
  }
  if (hasLeaseOwner) {
    assertSafeId(value.leaseOwner, 'leaseOwner');
    if (typeof value.leaseExpiresAt !== 'string' || !isIsoDate(value.leaseExpiresAt)
      || Date.parse(value.leaseExpiresAt) <= Date.parse(value.requestedAt)) {
      throw new SourceUploadConflictError('invalid upload cleanup lease.');
    }
  }
}

function assertCleanupReason(value: unknown): asserts value is BookSourceUploadCleanupReason {
  if (value !== 'cancel_requested' && value !== 'expired' && value !== 'unverifiable') {
    throw new SourceUploadConflictError('invalid cleanup reason.');
  }
}

function assertOptionalProviderIdentity(fileId: unknown, versionId: unknown): void {
  if ((fileId === undefined) !== (versionId === undefined)) {
    throw new SourceUploadConflictError('cleanup provider identity is incomplete.');
  }
  if (fileId !== undefined) {
    assertSafeId(fileId, 'providerFileId');
    assertSafeId(versionId, 'providerFileVersionId');
  }
}

function assertIso(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !isIsoDate(value)) {
    throw new SourceUploadConflictError(`${label} must be a UTC ISO date.`);
  }
}

function assertCleanupLeaseInput(input: ClaimSourceUploadCleanupInput): void {
  assertRtdbKey(input.accountId, 'accountId');
  assertRtdbKey(input.reservationId, 'reservationId');
  assertSafeId(input.leaseOwner, 'leaseOwner');
  assertIso(input.claimedAt, 'claimedAt');
  assertIso(input.leaseExpiresAt, 'leaseExpiresAt');
  if (Date.parse(input.leaseExpiresAt) <= Date.parse(input.claimedAt)) {
    throw new SourceUploadConflictError('cleanup lease must expire after claim.');
  }
}

function assertCleanupResultInput(
  input: Pick<FailSourceUploadCleanupInput, 'accountId' | 'expectedRevision' | 'reservationId' | 'leaseOwner'>,
  completedAt: unknown,
): void {
  assertRtdbKey(input.accountId, 'accountId');
  assertRtdbKey(input.reservationId, 'reservationId');
  assertSafeId(input.leaseOwner, 'leaseOwner');
  assertIso(completedAt, 'cleanup result time');
}

function assertTrustedCompletionMatchesReservation(operation: BookSourceUploadOperation, storage: BookSourceVersionStorageIdentity): void {
  if (
    storage.bookId !== operation.bookId
    || storage.sourceVersionId !== operation.sourceVersionId
    || storage.storageLocationId !== operation.storageLocationId
    || storage.providerKind !== operation.providerKind
    || storage.privateBucketId !== operation.privateBucketId
    || storage.providerObjectKey !== operation.providerObjectKey
    || storage.byteSize !== operation.byteSize
    || storage.checksum.algorithm !== operation.expectedChecksum.algorithm
    || storage.checksum.value !== operation.expectedChecksum.value
  ) throw new SourceUploadConflictError('trusted completion does not match immutable reservation identity.');
}

function assertPhysicalPageCount(value: unknown): asserts value is number {
  if (typeof value !== 'number'
    || !Number.isSafeInteger(value)
    || value < 1
    || value > 100_000) {
    throw new SourceUploadConflictError('physicalPageCount must be a positive safe integer.');
  }
}

function assertChecksum(value: unknown, label: string): asserts value is BookSourceChecksum {
  if (!isPlainRecord(value)
    || !hasOnlyKeys(value, ['algorithm', 'value'])
    || value.algorithm !== 'sha-256'
    || typeof value.value !== 'string'
    || !/^[a-f0-9]{64}$/u.test(value.value)) {
    throw new SourceUploadConflictError(`${label} must be a canonical SHA-256 checksum.`);
  }
}

function assertStudentSafeFields(
  purpose: unknown,
  status: unknown,
  decision: unknown,
): asserts purpose is BookSourcePurpose {
  if (purpose !== 'book-source' && purpose !== 'student-document') {
    throw new SourceUploadConflictError('invalid source purpose.');
  }
  if (status !== 'unreviewed' && status !== 'review-required' && status !== 'ready' && status !== 'rejected') {
    throw new SourceUploadConflictError('invalid student-safe status.');
  }
  if (status === 'unreviewed') {
    if (decision !== undefined) throw new SourceUploadConflictError('unreviewed source cannot contain a safety decision.');
    return;
  }
  if (!isPlainRecord(decision)
    || !hasOnlyKeys(decision, ['decidedBy', 'decidedAt', 'sourceVersionId', 'sha256Hex', 'reasonCode'])) {
    throw new SourceUploadConflictError('student-safe decision is incomplete.');
  }
  assertSafeId(decision.decidedBy, 'student-safe decidedBy');
  assertSafeId(decision.sourceVersionId, 'student-safe sourceVersionId');
  if (typeof decision.decidedAt !== 'string' || !isIsoDate(decision.decidedAt)
    || typeof decision.sha256Hex !== 'string' || !/^[a-f0-9]{64}$/u.test(decision.sha256Hex)
    || (decision.reasonCode !== 'teacher-reviewed'
      && decision.reasonCode !== 'teacher-only-content'
      && decision.reasonCode !== 'invalid-document'
      && decision.reasonCode !== 'superseded')) {
    throw new SourceUploadConflictError('invalid student-safe decision.');
  }
}

function assertDecisionInput(input: DecideStudentSafeSourceInput): void {
  assertRtdbKey(input.accountId, 'accountId');
  assertExpectedRevision(input.expectedRevision);
  assertRtdbKey(input.reservationId, 'reservationId');
  assertSafeId(input.bookId, 'bookId');
  assertSafeId(input.actorId, 'actorId');
  assertStudentSafeFields('book-source', input.studentSafeStatus, input.studentSafeDecision);
  if (input.studentSafeDecision.decidedBy !== input.actorId) {
    throw new SourceUploadConflictError('student-safe decision actor is invalid.');
  }
}

function assertStudentSafeDecisionMatches(
  operation: BookSourceUploadOperation,
  decision: BookSourceStudentSafeDecision,
): void {
  if (decision.sourceVersionId !== operation.sourceVersionId
    || decision.sha256Hex !== operation.expectedChecksum.value) {
    throw new SourceUploadConflictError('student-safe decision is stale or hash-mismatched.');
  }
}

function sameStudentSafeDecision(
  status: BookSourceStudentSafeStatus,
  decision: BookSourceStudentSafeDecision | undefined,
  input: DecideStudentSafeSourceInput,
): boolean {
  return status === input.studentSafeStatus
    && decision?.sourceVersionId === input.studentSafeDecision.sourceVersionId
    && decision.sha256Hex === input.studentSafeDecision.sha256Hex
    && decision.reasonCode === input.studentSafeDecision.reasonCode;
}

function sameOptionalStudentSafeDecision(
  left: BookSourceStudentSafeDecision | undefined,
  right: unknown,
): boolean {
  return left === undefined
    ? right === undefined
    : isPlainRecord(right)
      && left.decidedBy === right.decidedBy
      && left.decidedAt === right.decidedAt
      && left.sourceVersionId === right.sourceVersionId
      && left.sha256Hex === right.sha256Hex
      && left.reasonCode === right.reasonCode;
}

function findReplacementPredecessor(
  operations: Readonly<Record<string, BookSourceUploadOperation>>,
  bookId: string,
  sourceKey: string,
): BookSourceUploadOperation | undefined {
  return Object.values(operations)
    .filter((operation) => operation.status === 'verified_completed'
      && operation.bookId === bookId
      && operation.sourceKey === sourceKey)
    .sort((left, right) => {
      const completedAt = Date.parse(right.completedAt ?? '') - Date.parse(left.completedAt ?? '');
      return completedAt || right.sourceVersionId.localeCompare(left.sourceVersionId);
    })[0];
}

function lifecycleAuditEventId(
  sourceVersionId: string,
  revision: number,
  transition: BookSourceLifecycleTransition,
): string {
  return `${sourceVersionId}-${revision}-${transition}`;
}

function withLifecycleAuditEvents(
  state: BookSourceUploadAccountState,
  operation: BookSourceUploadOperation,
  revision: number,
  occurredAt: string,
  retirement: {
    readonly deletionId?: string;
    readonly retirementGuard?: PublicationRetirementGuard;
    readonly retirementProof?: 'exact_version_deleted' | 'provider_absent';
  } = {},
): Readonly<Record<string, BookSourceLifecycleAuditEvent>> {
  const transition: BookSourceLifecycleTransition = operation.status === 'retirement_pending'
    ? 'retirement_pending'
    : operation.status === 'retired'
      ? 'retired'
      : operation.kind === 'replacement'
    ? 'private_replaced'
    : 'private_ready';
  const eventId = lifecycleAuditEventId(operation.sourceVersionId, revision, transition);
  const event: BookSourceLifecycleAuditEvent = Object.freeze({
    eventId,
    transition,
    revision,
    occurredAt,
    reservationId: operation.reservationId,
    ownerId: operation.ownerId,
    bookId: operation.bookId,
    sourceKey: operation.sourceKey,
    sourceVersionId: operation.sourceVersionId,
    ...(operation.replacesSourceVersionId === undefined ? {} : {
      replacesSourceVersionId: operation.replacesSourceVersionId,
    }),
    ...(retirement.deletionId === undefined ? {} : { deletionId: retirement.deletionId }),
    ...(retirement.retirementGuard === undefined ? {} : { retirementGuard: retirement.retirementGuard }),
    ...(retirement.retirementProof === undefined ? {} : { retirementProof: retirement.retirementProof }),
  });
  const existing = state.lifecycleAuditEvents?.[eventId];
  if (existing && JSON.stringify(existing) !== JSON.stringify(event)) {
    throw new SourceUploadConflictError('lifecycle audit identity is immutable.');
  }
  return {
    ...(state.lifecycleAuditEvents ?? {}),
    [eventId]: existing ?? event,
  };
}

function assertLifecycleAuditEvents(value: unknown): asserts value is Readonly<Record<string, BookSourceLifecycleAuditEvent>> {
  if (!isPlainRecord(value)) throw new SourceUploadConflictError('invalid lifecycle audit events.');
  for (const [eventId, event] of Object.entries(value)) {
    if (!isPlainRecord(event)) throw new SourceUploadConflictError('invalid lifecycle audit event.');
    const hasPredecessor = event.replacesSourceVersionId !== undefined;
    if (!hasOnlyKeys(event, [
      'eventId',
      'transition',
      'revision',
      'occurredAt',
      'reservationId',
      'ownerId',
      'bookId',
      'sourceKey',
      'sourceVersionId',
      ...(hasPredecessor ? ['replacesSourceVersionId'] : []),
      ...(event.deletionId === undefined ? [] : ['deletionId']),
      ...(event.retirementGuard === undefined ? [] : ['retirementGuard']),
      ...(event.retirementProof === undefined ? [] : ['retirementProof']),
    ])
      || event.eventId !== eventId
      || (event.transition !== 'private_ready'
        && event.transition !== 'private_replaced'
        && event.transition !== 'retirement_pending'
        && event.transition !== 'retired')
      || typeof event.revision !== 'number'
      || !Number.isSafeInteger(event.revision)
      || event.revision < 1
      || typeof event.occurredAt !== 'string'
      || !isIsoDate(event.occurredAt)) {
      throw new SourceUploadConflictError('invalid lifecycle audit event.');
    }
    assertRtdbKey(eventId, 'lifecycle event id');
    for (const [field, label] of [
      ['reservationId', 'lifecycle reservationId'],
      ['ownerId', 'lifecycle ownerId'],
      ['bookId', 'lifecycle bookId'],
      ['sourceKey', 'lifecycle sourceKey'],
      ['sourceVersionId', 'lifecycle sourceVersionId'],
    ] as const) assertSafeId(event[field], label);
    if (hasPredecessor) assertSafeId(event.replacesSourceVersionId, 'lifecycle replacesSourceVersionId');
    if (event.transition === 'private_ready' && hasPredecessor) {
      throw new SourceUploadConflictError('private_ready cannot contain replacement provenance.');
    }
    if (event.deletionId !== undefined) assertSafeId(event.deletionId, 'lifecycle deletionId');
    const retirementGuard = event.retirementGuard;
    if (retirementGuard !== undefined) assertRetirementGuardShape(retirementGuard);
    if (event.transition === 'retirement_pending' || event.transition === 'retired') {
      if (event.deletionId === undefined || retirementGuard === undefined
        || retirementGuard.deletionId !== event.deletionId
        || (event.transition === 'retired' && event.retirementProof === undefined)
        || (event.transition === 'retirement_pending' && event.retirementProof !== undefined)) {
        throw new SourceUploadConflictError('invalid lifecycle retirement event.');
      }
    } else if (event.deletionId !== undefined || event.retirementGuard !== undefined || event.retirementProof !== undefined) {
      throw new SourceUploadConflictError('non-retirement lifecycle event contains retirement metadata.');
    }
    if (event.retirementProof !== undefined
      && event.retirementProof !== 'exact_version_deleted'
      && event.retirementProof !== 'provider_absent') {
      throw new SourceUploadConflictError('invalid lifecycle retirement proof.');
    }
    if (event.eventId !== lifecycleAuditEventId(assertSafeId(event.sourceVersionId, 'lifecycle sourceVersionId'), event.revision, event.transition)) {
      throw new SourceUploadConflictError('lifecycle audit identity is inconsistent.');
    }
  }
}

function freezeLifecycleAuditEvents(
  value: Readonly<Record<string, BookSourceLifecycleAuditEvent>>,
): Readonly<Record<string, BookSourceLifecycleAuditEvent>> {
  assertLifecycleAuditEvents(value);
  return Object.freeze(Object.fromEntries(
    Object.entries(value).map(([eventId, event]) => [eventId, Object.freeze({ ...event })]),
  ));
}

function freezeAssemblyBooks(
  value: BookSourceAssemblyBooks,
  operations: Readonly<Record<string, BookSourceUploadOperation>>,
): BookSourceAssemblyBooks {
  assertAssemblyBooks(value, operations);
  return Object.freeze(Object.fromEntries(
    Object.entries(value).map(([bookId, sources]) => [
      bookId,
      Object.freeze(Object.fromEntries(
        Object.entries(sources).map(([sourceVersionId, projection]) => [
          sourceVersionId,
          Object.freeze({ ...projection }),
        ]),
      )),
    ]),
  ));
}

function assertAssemblyBooks(
  value: unknown,
  operations: Readonly<Record<string, BookSourceUploadOperation>>,
): asserts value is BookSourceAssemblyBooks {
  if (!isPlainRecord(value)) throw new SourceUploadConflictError('invalid Assembly source projection.');
  for (const [bookId, sources] of Object.entries(value)) {
    assertSafeId(bookId, 'assembly bookId');
    if (!isPlainRecord(sources)) throw new SourceUploadConflictError('invalid Assembly source map.');
    for (const [sourceVersionId, projection] of Object.entries(sources)) {
      assertSafeId(sourceVersionId, 'assembly sourceVersionId');
      if (!isPlainRecord(projection)
        || !hasOnlyKeys(projection, [
          'ownerId',
          'bookId',
          'sourceKey',
          'sourceVersionId',
          'checksum',
          'purpose',
          'studentSafeStatus',
          'studentSafeDecision',
          'physicalPageCount',
          'verifiedUsable',
        ])
        || projection.bookId !== bookId
        || projection.sourceVersionId !== sourceVersionId
        || projection.verifiedUsable !== true) {
        throw new SourceUploadConflictError('invalid Assembly source projection.');
      }
      assertSafeId(projection.ownerId, 'assembly ownerId');
      assertSafeId(projection.bookId, 'assembly bookId');
      assertSafeId(projection.sourceKey, 'assembly sourceKey');
      assertSafeId(projection.sourceVersionId, 'assembly sourceVersionId');
      assertChecksum(projection.checksum, 'assembly checksum');
      assertStudentSafeFields(projection.purpose, projection.studentSafeStatus, projection.studentSafeDecision);
      assertPhysicalPageCount(projection.physicalPageCount);
      const operation = Object.values(operations).find((candidate) =>
        candidate.bookId === projection.bookId
        && candidate.sourceKey === projection.sourceKey
        && candidate.sourceVersionId === projection.sourceVersionId);
      if (!operation
        || operation.status !== 'verified_completed'
        || operation.ownerId !== projection.ownerId
        || operation.expectedChecksum.algorithm !== projection.checksum?.algorithm
        || operation.expectedChecksum.value !== projection.checksum?.value
        || operation.purpose !== projection.purpose
        || operation.studentSafeStatus !== projection.studentSafeStatus
        || !sameOptionalStudentSafeDecision(operation.studentSafeDecision, projection.studentSafeDecision)
        || operation.physicalPageCount !== projection.physicalPageCount) {
        throw new SourceUploadConflictError(
          'Assembly projection requires a matching trusted verified source operation.',
        );
      }
    }
  }
}

function withAssemblyProjection(
  books: BookSourceAssemblyBooks | undefined,
  operation: BookSourceUploadOperation,
): BookSourceAssemblyBooks {
  if (operation.status !== 'verified_completed' || operation.physicalPageCount === undefined) {
    throw new SourceUploadConflictError('trusted assembly projection inputs are unavailable.');
  }
  const projection: BookSourceAssemblyProjection = Object.freeze({
    ownerId: operation.ownerId,
    bookId: operation.bookId,
    sourceKey: operation.sourceKey,
    sourceVersionId: operation.sourceVersionId,
    checksum: Object.freeze({ ...operation.expectedChecksum }),
    purpose: operation.purpose,
    studentSafeStatus: operation.studentSafeStatus,
    ...(operation.studentSafeDecision === undefined ? {} : {
      studentSafeDecision: operation.studentSafeDecision,
    }),
    physicalPageCount: operation.physicalPageCount,
    verifiedUsable: true,
  });
  return {
    ...(books ?? {}),
    [operation.bookId]: {
      ...(books?.[operation.bookId] ?? {}),
      [operation.sourceVersionId]: projection,
    },
  };
}

function ensureAssemblyProjection(
  state: BookSourceUploadAccountState,
  operation: BookSourceUploadOperation,
): BookSourceUploadAccountState {
  if (operation.status !== 'verified_completed' || operation.physicalPageCount === undefined) {
    throw new SourceUploadConflictError('trusted assembly projection inputs are unavailable.');
  }
  const existing = state.assemblyBooks?.[operation.bookId]?.[operation.sourceVersionId];
  if (existing
    && existing.bookId === operation.bookId
    && existing.sourceVersionId === operation.sourceVersionId
    && existing.sourceKey === operation.sourceKey
    && existing.checksum.algorithm === operation.expectedChecksum.algorithm
    && existing.checksum.value === operation.expectedChecksum.value
    && existing.purpose === operation.purpose
    && existing.studentSafeStatus === operation.studentSafeStatus
    && sameOptionalStudentSafeDecision(existing.studentSafeDecision, operation.studentSafeDecision)
    && existing.ownerId === operation.ownerId
    && existing.physicalPageCount === operation.physicalPageCount
    && existing.verifiedUsable === true) return state;
  return nextState(
    state,
    state.operations,
    state.capacity.trackedAccountBytes,
    state.capacity.providerReconciliation,
    withAssemblyProjection(state.assemblyBooks, operation),
  );
}

function sameReservation(operation: BookSourceUploadOperation, input: ReserveSourceUploadInput): boolean {
  return operation.bookId === input.bookId
    && operation.sourceVersionId === input.sourceVersionId
    && operation.sourceKey === input.sourceKey
    && operation.ownerId === input.ownerId
    && operation.storageLocationId === input.storageLocationId
    && operation.providerKind === input.providerKind
    && operation.privateBucketId === input.privateBucketId
    && operation.providerObjectKey === input.providerObjectKey
    && operation.kind === input.kind
    && operation.purpose === input.purpose
    && operation.studentSafeStatus === input.studentSafeStatus
    && sameOptionalStudentSafeDecision(operation.studentSafeDecision, input.studentSafeDecision)
    && operation.byteSize === input.byteSize
    && operation.originalFilename === normalizeBookSourceDisplayFilename(input.originalFilename)
    && operation.expectedChecksum.value === input.expectedChecksum.value.toLowerCase()
    && operation.createdAt === input.createdAt
    && operation.expiresAt === input.expiresAt;
}

function sameVerifiedStorage(left: BookSourceVersionStorageIdentity | undefined, right: BookSourceVersionStorageIdentity): boolean {
  return left !== undefined
    && left.bookId === right.bookId
    && left.sourceVersionId === right.sourceVersionId
    && left.storageLocationId === right.storageLocationId
    && left.providerKind === right.providerKind
    && left.privateBucketId === right.privateBucketId
    && left.providerFileId === right.providerFileId
    && left.providerFileVersionId === right.providerFileVersionId
    && left.providerObjectKey === right.providerObjectKey
    && left.byteSize === right.byteSize
    && left.checksum.algorithm === right.checksum.algorithm
    && left.checksum.value === right.checksum.value;
}

function assertRetireInput(input: RetireVerifiedSourceInput): void {
  assertRtdbKey(input.accountId, 'accountId');
  assertRtdbKey(input.reservationId, 'reservationId');
  assertSafeId(input.bookId, 'bookId');
  assertSafeId(input.sourceVersionId, 'sourceVersionId');
  assertSafeId(input.sourceKey, 'sourceKey');
  assertSafeId(input.ownerId, 'ownerId');
  assertRtdbKey(input.deletionId, 'deletionId');
  assertExpectedRevision(input.expectedRevision);
  assertIso(input.retiredAt, 'retiredAt');
  if (input.proof !== 'exact_version_deleted' && input.proof !== 'provider_absent') {
    throw new SourceUploadConflictError('invalid retirement proof.');
  }
  for (const references of [input.currentSourceVersionIds, input.remainingActiveSourceVersionIds]) {
    if (!Array.isArray(references)
      || references.some((value) => typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u.test(value))) {
      throw new SourceUploadConflictError('invalid active source reference readback.');
    }
  }
  if (input.retirementGuard !== undefined) {
    assertRetirementGuardShape(input.retirementGuard);
    if (input.retirementGuard.deletionId !== input.deletionId) {
      throw new SourceUploadConflictError('retirement guard deletion identity mismatch.');
    }
  }
}

function assertFenceInput(input: FenceVerifiedSourceInput): void {
  assertRtdbKey(input.accountId, 'accountId');
  assertRtdbKey(input.reservationId, 'reservationId');
  assertSafeId(input.bookId, 'bookId');
  assertSafeId(input.sourceVersionId, 'sourceVersionId');
  assertSafeId(input.sourceKey, 'sourceKey');
  assertSafeId(input.ownerId, 'ownerId');
  assertRtdbKey(input.deletionId, 'deletionId');
  assertExpectedRevision(input.expectedRevision);
  for (const references of [input.currentSourceVersionIds, input.remainingActiveSourceVersionIds]) {
    if (!Array.isArray(references)
      || references.some((value) => typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u.test(value))) {
      throw new SourceUploadConflictError('invalid active source reference readback.');
    }
  }
  if (input.retirementGuard.deletionId !== input.deletionId
    || !isIsoDate(input.fencedAt)) {
    throw new SourceUploadConflictError('invalid retirement fence metadata.');
  }
}

function assertRetirementGuardShape(value: unknown): asserts value is PublicationRetirementGuard {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SourceUploadConflictError('invalid retirement publication guard.');
  }
  const guard = value as Record<string, unknown>;
  for (const [field, label] of [
    ['bookId', 'retirement guard bookId'],
    ['sourceVersionId', 'retirement guard sourceVersionId'],
    ['deletionId', 'retirement guard deletionId'],
    ['publicationId', 'retirement guard publicationId'],
    ['manifestVersionId', 'retirement guard manifestVersionId'],
    ['inputFingerprint', 'retirement guard inputFingerprint'],
  ] as const) assertSafeId(guard[field], label);
  if (typeof guard.publicationRevision !== 'number' || !Number.isSafeInteger(guard.publicationRevision) || guard.publicationRevision < 0
    || typeof guard.sourceSetRevision !== 'number' || !Number.isSafeInteger(guard.sourceSetRevision) || guard.sourceSetRevision < 0
    || !Array.isArray(guard.sourceVersionIds)
    || guard.sourceVersionIds.some((id) => typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u.test(id))) {
    throw new SourceUploadConflictError('invalid retirement publication guard.');
  }
}

function assertRetirementGuard(
  guard: PublicationRetirementGuard,
  input: Pick<RetireVerifiedSourceInput, 'bookId' | 'sourceVersionId' | 'deletionId' | 'currentSourceVersionIds' | 'remainingActiveSourceVersionIds'>,
  operation: BookSourceUploadOperation,
): void {
  assertRetirementGuardShape(guard);
  if (guard.bookId !== input.bookId || guard.sourceVersionId !== input.sourceVersionId
    || guard.deletionId !== input.deletionId
    || operation.sourceVersionId !== guard.sourceVersionId
    || input.currentSourceVersionIds.includes(input.sourceVersionId)
    || input.remainingActiveSourceVersionIds.includes(input.sourceVersionId)
    || guard.sourceVersionIds.includes(input.sourceVersionId)) {
    throw new SourceUploadConflictError('retirement source remains referenced or guard is stale.');
  }
}

function samePublicationGuard(
  left: PublicationRetirementGuard | undefined,
  right: PublicationRetirementGuard | undefined,
): boolean {
  return left !== undefined && right !== undefined
    && JSON.stringify(left) === JSON.stringify(right);
}

function samePendingReplay(
  operation: BookSourceUploadOperation,
  input: FenceVerifiedSourceInput,
  storage: BookSourceVersionStorageIdentity,
): boolean {
  return operation.status === 'retirement_pending'
    && operation.sourceVersionId === input.sourceVersionId
    && operation.sourceKey === input.sourceKey
    && operation.ownerId === input.ownerId
    && operation.retiredDeletionId === input.deletionId
    && samePublicationGuard(operation.retirementGuard, input.retirementGuard)
    && sameVerifiedStorage(operation.verifiedStorage, storage);
}

function retirePendingOperation(
  state: BookSourceUploadAccountState,
  operation: BookSourceUploadOperation,
  input: RetireVerifiedSourceInput,
  _verifiedStorage: BookSourceVersionStorageIdentity,
): BookSourceUploadAccountState {
  if (!operation.retirementGuard || input.retirementGuard === undefined) {
    throw new SourceUploadConflictError('retirement guard is required for pending source.');
  }
  if (state.capacity.trackedAccountBytes < operation.byteSize) {
    throw new SourceUploadConflictError('tracked provider bytes undercount verified source.');
  }
  const retired = Object.freeze({
    reservationId: operation.reservationId,
    bookId: operation.bookId,
    sourceVersionId: operation.sourceVersionId,
    sourceKey: operation.sourceKey,
    ownerId: operation.ownerId,
    purpose: operation.purpose,
    studentSafeStatus: operation.studentSafeStatus,
    ...(operation.studentSafeDecision === undefined ? {} : { studentSafeDecision: operation.studentSafeDecision }),
    checksum: operation.expectedChecksum,
    byteSize: operation.byteSize,
    ownerAttestedPhysicalPageCount: operation.physicalPageCount,
    originalFilename: operation.originalFilename,
    createdAt: operation.createdAt,
    completedAt: operation.completedAt,
    status: 'retired' as const,
    retiredAt: input.retiredAt,
    retirementProof: input.proof,
    retiredDeletionId: input.deletionId,
    retirementGuard: operation.retirementGuard,
  });
  const { [operation.sourceVersionId]: _removed, ...remainingSources } = state.assemblyBooks?.[operation.bookId] ?? {};
  const retirementAudit = withLifecycleAuditEvents(state, retired as unknown as BookSourceUploadOperation, state.revision + 1, input.retiredAt, {
    deletionId: input.deletionId,
    retirementGuard: operation.retirementGuard,
    retirementProof: input.proof,
  });
  return nextState(
    state,
    { ...state.operations, [operation.reservationId]: retired as unknown as BookSourceUploadOperation },
    state.capacity.trackedAccountBytes - operation.byteSize,
    state.capacity.providerReconciliation,
    { ...state.assemblyBooks, [operation.bookId]: remainingSources },
    retirementAudit,
  );
}

function sameRetiredReplay(
  operation: BookSourceUploadOperation,
  input: RetireVerifiedSourceInput,
  storage: BookSourceVersionStorageIdentity,
): boolean {
  return operation.status === 'retired'
    && operation.reservationId === input.reservationId
    && operation.bookId === input.bookId
    && operation.sourceVersionId === input.sourceVersionId
    && operation.sourceKey === input.sourceKey
    && operation.ownerId === input.ownerId
    && operation.retiredDeletionId === input.deletionId
    && operation.retirementProof === input.proof
    && samePublicationGuard(operation.retirementGuard, input.retirementGuard)
    && operation.checksum?.value === storage.checksum.value
    && operation.byteSize === storage.byteSize
    && storage.bookId === operation.bookId
    && storage.sourceVersionId === operation.sourceVersionId;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  return Reflect.ownKeys(value).every((key) =>
    typeof key === 'string' && allowed.includes(key));
}

function assertSafeId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u.test(value)) {
    throw new SourceVersionError(`${label} must be a nonempty safe identifier.`);
  }
  return value;
}

function assertRtdbKey(value: unknown, label: string): string {
  if (typeof value !== 'string'
    || value.length === 0
    || value.length > 256
    || /[\u0000-\u001F\u007F.#$\[\]\/]/u.test(value)) {
    throw new SourceVersionError(`${label} must be a nonempty RTDB-safe key.`);
  }
  return value;
}

function assertProviderObjectKey(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1024 || value.startsWith('/') || value.endsWith('/') || value.includes('\\') || value.split('/').some((part) => part === '' || part === '.' || part === '..') || /[\u0000-\u001F\u007F]/u.test(value)) {
    throw new SourceVersionError('providerObjectKey must be a safe Worker-generated object key.');
  }
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) {
    return false;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}
