import type {
  SourceProviderFailureCode,
  SourceProviderPort,
  SourceProviderRequestOptions,
} from './sourceProvider.port';
import { SourceProviderError } from './sourceProvider.port';
import type {
  BookSourceUploadAccountState,
  BookSourceUploadCleanupReason,
  BookSourceUploadOperation,
  BookSourceVersionStorageIdentity,
} from '../../types/bookSource.types';
import type {
  SourceUploadRtdbRepository,
} from './sourceUpload.rtdbRepository';
import type { BookSourceRecoveryContext } from './sourceRecovery.adapter';

/** Exact-version provider primitive used after lifecycle decisions are made. */
export interface SourceLifecycleProviderPort {
  deleteExactVersion: SourceProviderPort['deleteExactVersion'];
}

export interface SourceLifecycleVersionReconciliationPort {
  reconcileOperationVersions(input: {
    readonly operation: BookSourceUploadOperation;
    readonly preserveIdentity?: BookSourceVersionStorageIdentity;
  }, options?: SourceProviderRequestOptions): Promise<
    'provider_absent' | 'exact_versions_deleted' | 'committed_version_preserved'
  >;
}

/**
 * Lifecycle orchestration owns publication/revocation/retry decisions. This
 * adapter exposes only the provider-neutral exact-delete primitive here.
 */
export const createSourceLifecycleProviderPort = (
  provider: SourceProviderPort,
): SourceLifecycleProviderPort => Object.freeze({
  deleteExactVersion: (
    input: Parameters<SourceProviderPort['deleteExactVersion']>[0],
    options?: SourceProviderRequestOptions,
  ): Promise<void> => provider.deleteExactVersion(input, options),
});

export interface SourceUploadReconciliationRepository extends Pick<
  SourceUploadRtdbRepository,
  | 'requestCleanup'
  | 'claimCleanup'
  | 'failCleanup'
  | 'releaseCleaned'
  | 'recordCommittedVersionReconciliationFailure'
  | 'clearCommittedVersionReconciliationFailure'
> {}

export interface SourceUploadReconciliationDependencies {
  readonly accountId: string;
  readonly readAccountState: () => Promise<BookSourceUploadAccountState | null>;
  readonly authorizeOwner: (input: {
    readonly actorId: string;
    readonly bookId: string;
  }) => boolean | Promise<boolean>;
  readonly repository: SourceUploadReconciliationRepository;
  readonly provider: SourceLifecycleProviderPort;
  readonly versionReconciliation: SourceLifecycleVersionReconciliationPort;
  /** Trusted metadata lookup. `null` is authoritative provider absence. */
  readonly resolveExactVersion: (
    operation: BookSourceUploadOperation,
    options?: SourceProviderRequestOptions,
  ) => Promise<BookSourceVersionStorageIdentity | null>;
  readonly clock: () => Date;
  readonly leaseOwner: string;
  readonly leaseMs?: number;
  readonly emit?: (event: SourceUploadReconciliationEvent) => void | Promise<void>;
  /** Recovery must not request cleanup, claim cleanup, or call a provider. */
  readonly recoveryContext?: BookSourceRecoveryContext;
}

export interface SourceUploadReconciliationEvent {
  readonly reservationId: string;
  readonly bookId: string;
  readonly status: 'cleanup_pending' | 'verified_completed' | 'released';
  readonly code: string;
  readonly attempt: number;
}

export interface SourceUploadSafeStatus {
  readonly reservationId: string;
  readonly bookId: string;
  readonly sourceVersionId: string;
  readonly status: BookSourceUploadOperation['status'];
  readonly retryKind: 'bytes' | 'completion' | 'cleanup' | 'none';
  readonly nextRetryAt?: string;
  readonly lastErrorCode?: string;
}

export class SourceUploadReconciliationError extends Error {
  constructor(readonly code:
    | 'authority_denied'
    | 'invalid_deployment'
    | 'operation_not_found'
    | 'operation_not_eligible'
    | 'cleanup_pending'
    | 'recovery_suppressed') {
    super(`source_upload_reconciliation_${code}`);
    this.name = 'SourceUploadReconciliationError';
  }
}

const DEFAULT_LEASE_MS = 60_000;
const MAX_LEASE_MS = 5 * 60_000;
const MAX_PROVIDER_REQUEST_MS = 30_000;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;

const now = (clock: () => Date): Date => {
  const value = clock();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new SourceUploadReconciliationError('invalid_deployment');
  }
  return value;
};

const operationFor = (
  state: BookSourceUploadAccountState | null,
  reservationId: string,
  bookId: string,
): BookSourceUploadOperation => {
  const operation = state?.operations[reservationId];
  if (!operation || operation.bookId !== bookId) {
    throw new SourceUploadReconciliationError('operation_not_found');
  }
  return operation;
};

const safeStatus = (operation: BookSourceUploadOperation): SourceUploadSafeStatus => Object.freeze({
  reservationId: operation.reservationId,
  bookId: operation.bookId,
  sourceVersionId: operation.sourceVersionId,
  status: operation.status,
  retryKind: operation.status === 'cleanup_pending'
    || (operation.status === 'verified_completed' && operation.versionReconciliation !== undefined)
    ? 'cleanup'
    : operation.status === 'reserved'
      ? 'bytes'
      : 'none',
  ...(operation.cleanup?.nextRetryAt || operation.versionReconciliation?.nextRetryAt
    ? { nextRetryAt: operation.cleanup?.nextRetryAt ?? operation.versionReconciliation!.nextRetryAt }
    : {}),
  ...(operation.cleanup?.lastErrorCode || operation.versionReconciliation?.lastErrorCode
    ? { lastErrorCode: operation.cleanup?.lastErrorCode ?? operation.versionReconciliation!.lastErrorCode }
    : {}),
});

const publicProviderCode = (error: unknown): SourceProviderFailureCode | 'provider_failed' =>
  error instanceof SourceProviderError ? error.code : 'provider_failed';

/** CAS lifecycle for cancel, expiry, retry, and crash-safe exact cleanup. */
export const createSourceUploadReconciler = (dependencies: SourceUploadReconciliationDependencies) => {
  const leaseMs = dependencies.leaseMs ?? DEFAULT_LEASE_MS;
  const providerRequestTimeoutMs = Math.min(leaseMs, MAX_PROVIDER_REQUEST_MS);
  if (!SAFE_ID.test(dependencies.accountId) || !SAFE_ID.test(dependencies.leaseOwner)
    || !Number.isSafeInteger(leaseMs) || leaseMs < 1 || leaseMs > MAX_LEASE_MS) {
    throw new SourceUploadReconciliationError('invalid_deployment');
  }

  const authorize = async (actorId: string, bookId: string): Promise<void> => {
    if (!SAFE_ID.test(actorId) || !SAFE_ID.test(bookId)
      || await dependencies.authorizeOwner({ actorId, bookId }) !== true) {
      throw new SourceUploadReconciliationError('authority_denied');
    }
  };

  const readOwned = async (actorId: string, bookId: string, reservationId: string) => {
    await authorize(actorId, bookId);
    const state = await dependencies.readAccountState();
    const operation = operationFor(state, reservationId, bookId);
    if (operation.ownerId !== actorId) throw new SourceUploadReconciliationError('authority_denied');
    return { state: state!, operation };
  };

  const emit = async (
    operation: BookSourceUploadOperation,
    status: SourceUploadReconciliationEvent['status'],
    code: string,
    attempt: number,
  ) => dependencies.emit?.(Object.freeze({
    reservationId: operation.reservationId,
    bookId: operation.bookId,
    status,
    code,
    attempt,
  }));

  return Object.freeze({
    async status(input: { readonly actorId: string; readonly bookId: string; readonly reservationId: string }) {
      const { operation } = await readOwned(input.actorId, input.bookId, input.reservationId);
      return safeStatus(operation);
    },

    async requestCleanup(input: {
      readonly actorId: string;
      readonly bookId: string;
      readonly reservationId: string;
      readonly reason: BookSourceUploadCleanupReason;
      readonly providerFileId?: string;
      readonly providerFileVersionId?: string;
    }) {
      if (dependencies.recoveryContext) throw new SourceUploadReconciliationError('recovery_suppressed');
      const { state, operation } = await readOwned(input.actorId, input.bookId, input.reservationId);
      const requestedAt = now(dependencies.clock).toISOString();
      const next = await dependencies.repository.requestCleanup({
        accountId: dependencies.accountId,
        expectedRevision: state.revision,
        reservationId: operation.reservationId,
        ownerId: operation.ownerId,
        reason: input.reason,
        requestedAt,
        providerFileId: input.providerFileId,
        providerFileVersionId: input.providerFileVersionId,
      });
      const updated = operationFor(next, input.reservationId, input.bookId);
      await emit(updated, updated.status === 'released' ? 'released' : 'cleanup_pending', input.reason, updated.cleanup?.attempt ?? 0);
      return safeStatus(updated);
    },

    async reconcile(input: { readonly actorId: string; readonly bookId: string; readonly reservationId: string }) {
      if (dependencies.recoveryContext) throw new SourceUploadReconciliationError('recovery_suppressed');
      let { state, operation } = await readOwned(input.actorId, input.bookId, input.reservationId);
      const startedAt = now(dependencies.clock);
      if (operation.status === 'verified_completed') {
        if (Date.parse(operation.expiresAt) > startedAt.getTime()) {
          throw new SourceUploadReconciliationError('operation_not_eligible');
        }
        if (operation.versionReconciliation
          && Date.parse(operation.versionReconciliation.nextRetryAt) > startedAt.getTime()) {
          throw new SourceUploadReconciliationError('operation_not_eligible');
        }
        if (!operation.verifiedStorage || !dependencies.versionReconciliation) {
          throw new SourceUploadReconciliationError('invalid_deployment');
        }
        let proof: 'committed_version_preserved';
        try {
          const result = await dependencies.versionReconciliation.reconcileOperationVersions({
            operation,
            preserveIdentity: operation.verifiedStorage,
          }, { timeoutMs: providerRequestTimeoutMs });
          if (result !== 'committed_version_preserved') {
            throw new SourceProviderError('provider_drift', false);
          }
          proof = result;
        } catch (error) {
          const code = publicProviderCode(error);
          const failedAt = now(dependencies.clock);
          const attempt = (operation.versionReconciliation?.attempt ?? 0) + 1;
          const delayMs = Math.min(60 * 60_000, 2 ** Math.min(attempt, 10) * 1_000);
          const failed = await dependencies.repository.recordCommittedVersionReconciliationFailure({
            accountId: dependencies.accountId,
            expectedRevision: state.revision,
            reservationId: operation.reservationId,
            failedAt: failedAt.toISOString(),
            nextRetryAt: new Date(failedAt.getTime() + delayMs).toISOString(),
            errorCode: code,
          });
          operation = operationFor(failed, input.reservationId, input.bookId);
          await emit(operation, 'verified_completed', code, operation.versionReconciliation?.attempt ?? attempt);
          throw new SourceUploadReconciliationError('cleanup_pending');
        }
        const completedAttempt = operation.versionReconciliation?.attempt ?? 0;
        if (operation.versionReconciliation) {
          const cleared = await dependencies.repository.clearCommittedVersionReconciliationFailure({
            accountId: dependencies.accountId,
            expectedRevision: state.revision,
            reservationId: operation.reservationId,
          });
          operation = operationFor(cleared, input.reservationId, input.bookId);
        }
        await emit(operation, 'verified_completed', proof, completedAttempt);
        return safeStatus(operation);
      }
      if (operation.status === 'reserved') {
        if (Date.parse(operation.expiresAt) > startedAt.getTime()) {
          throw new SourceUploadReconciliationError('operation_not_eligible');
        }
        state = await dependencies.repository.requestCleanup({
          accountId: dependencies.accountId,
          expectedRevision: state.revision,
          reservationId: operation.reservationId,
          ownerId: operation.ownerId,
          reason: 'expired',
          requestedAt: startedAt.toISOString(),
        });
        operation = operationFor(state, input.reservationId, input.bookId);
      }
      if (operation.status === 'released') return safeStatus(operation);
      if (operation.status !== 'cleanup_pending' || !operation.cleanup) {
        throw new SourceUploadReconciliationError('operation_not_eligible');
      }

      const leaseExpiresAt = new Date(startedAt.getTime() + leaseMs).toISOString();
      const claimed = await dependencies.repository.claimCleanup({
        accountId: dependencies.accountId,
        expectedRevision: state.revision,
        reservationId: operation.reservationId,
        leaseOwner: dependencies.leaseOwner,
        claimedAt: startedAt.toISOString(),
        leaseExpiresAt,
      });
      operation = operationFor(claimed, input.reservationId, input.bookId);
      try {
        const cleanup = operation.cleanup!;
        const proof = await dependencies.versionReconciliation.reconcileOperationVersions(
          { operation },
          { timeoutMs: providerRequestTimeoutMs },
        ).then((result) => {
          if (result === 'provider_absent') return 'provider_absent' as const;
          if (result === 'exact_versions_deleted') return 'exact_version_deleted' as const;
          throw new SourceProviderError('provider_drift', false);
        });
        const releasedAt = now(dependencies.clock).toISOString();
        const released = await dependencies.repository.releaseCleaned({
          accountId: dependencies.accountId,
          expectedRevision: claimed.revision,
          reservationId: operation.reservationId,
          leaseOwner: dependencies.leaseOwner,
          releasedAt,
          proof,
        });
        const result = operationFor(released, input.reservationId, input.bookId);
        await emit(result, 'released', proof, cleanup.attempt);
        return safeStatus(result);
      } catch (error) {
        if (error instanceof SourceProviderError && error.code === 'not_found') {
          const released = await dependencies.repository.releaseCleaned({
            accountId: dependencies.accountId,
            expectedRevision: claimed.revision,
            reservationId: operation.reservationId,
            leaseOwner: dependencies.leaseOwner,
            releasedAt: now(dependencies.clock).toISOString(),
            proof: 'provider_absent',
          });
          const result = operationFor(released, input.reservationId, input.bookId);
          await emit(result, 'released', 'provider_absent', operation.cleanup!.attempt);
          return safeStatus(result);
        }
        const code = publicProviderCode(error);
        const failedAt = now(dependencies.clock);
        const delayMs = Math.min(60 * 60_000, 2 ** Math.min(operation.cleanup!.attempt, 10) * 1_000);
        const failed = await dependencies.repository.failCleanup({
          accountId: dependencies.accountId,
          expectedRevision: claimed.revision,
          reservationId: operation.reservationId,
          leaseOwner: dependencies.leaseOwner,
          failedAt: failedAt.toISOString(),
          nextRetryAt: new Date(failedAt.getTime() + delayMs).toISOString(),
          errorCode: code,
        });
        const result = operationFor(failed, input.reservationId, input.bookId);
        await emit(result, 'cleanup_pending', code, result.cleanup!.attempt);
        throw new SourceUploadReconciliationError('cleanup_pending');
      }
    },
  });
};
