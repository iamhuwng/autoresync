/** Provider-neutral checksum for immutable Book PDF source bytes. */
export interface BookSourceChecksum {
  readonly algorithm: 'sha-256';
  readonly value: string;
}

/** Immutable storage coordinates for one Book PDF Source Version. */
export interface BookSourceVersionStorageIdentity {
  readonly bookId: string;
  readonly sourceVersionId: string;
  readonly storageLocationId: string;
  readonly providerKind: string;
  readonly privateBucketId: string;
  readonly providerObjectKey: string;
  readonly providerFileId: string;
  readonly providerFileVersionId: string;
  readonly checksum: BookSourceChecksum;
  readonly byteSize: number;
}

/**
 * Immutable Source Version metadata that is safe to retain in application
 * records. `originalFilename` is display-only and never participates in
 * provider object identity or mapping identity.
 */
export interface BookSourceVersionMetadata {
  readonly sourceKey: string;
  readonly originalFilename: string;
  readonly storage: BookSourceVersionStorageIdentity;
}

export const BOOK_SOURCE_MAX_PDF_BYTES = 500 * 1024 * 1024;
export const BOOK_SOURCE_ACCOUNT_CAPACITY_BYTES = 9_000_000_000;
export const BOOK_SOURCE_PROVIDER_RECONCILIATION_MAX_AGE_MS = 15 * 60 * 1_000;

/** All byte categories required by the account-capacity invariant. */
export interface BookSourceCapacityUsage {
  /** Active, hidden, retained, delayed-delete, and every provider object. */
  readonly trackedAccountBytes: number;
  readonly pendingUploadBytes: number;
  readonly replacementUploadBytes: number;
  readonly temporaryBytes: number;
}

export interface BookSourceProviderReconciliationSnapshot {
  readonly status: 'healthy' | 'drift';
  readonly totalBytes: number;
  readonly objectCount: number;
  readonly completedAt: string;
}

export interface BookSourceProviderReconciliationContinuation {
  /** Opaque, authenticated cursor emitted by the bounded provider probe. */
  readonly token: string;
  readonly updatedAt: string;
}

export interface BookSourceUploadAccountCapacityState extends Pick<
  BookSourceCapacityUsage,
  'trackedAccountBytes' | 'temporaryBytes'
> {
  /**
   * Trusted provider snapshot. Absence is valid for migration/readback but
   * must never authorize a new provider upload.
   */
  readonly providerReconciliation?: BookSourceProviderReconciliationSnapshot;
  /**
   * Service-only progress for a multi-page provider scan. Domain mutations
   * clear this value so a scan can never complete against a stale revision.
   */
  readonly providerReconciliationContinuation?: BookSourceProviderReconciliationContinuation;
}

export type BookSourceUploadKind = 'initial' | 'replacement';
export type BookSourceUploadStatus =
  | 'reserved'
  | 'cleanup_pending'
  | 'verified_completed'
  | 'released';

export type BookSourceUploadCleanupReason =
  | 'cancel_requested'
  | 'expired'
  | 'unverifiable';

export interface BookSourceUploadCleanupState {
  readonly reason: BookSourceUploadCleanupReason;
  readonly requestedAt: string;
  readonly attempt: number;
  readonly nextRetryAt: string;
  readonly lastErrorCode?: string;
  readonly providerFileId?: string;
  readonly providerFileVersionId?: string;
  readonly leaseOwner?: string;
  readonly leaseExpiresAt?: string;
}

export interface BookSourceCommittedVersionReconciliationState {
  readonly attempt: number;
  readonly nextRetryAt: string;
  readonly lastErrorCode: string;
}

/**
 * Reservation identity is immutable once issued. It is the idempotency key
 * carried from capacity preflight through trusted completion verification.
 */
export interface BookSourceUploadReservation {
  readonly reservationId: string;
  readonly bookId: string;
  readonly sourceVersionId: string;
  readonly sourceKey: string;
  readonly ownerId: string;
  readonly storageLocationId: string;
  readonly providerKind: string;
  readonly privateBucketId: string;
  /** Worker-generated immutable object key; never derived from filename. */
  readonly providerObjectKey: string;
  readonly kind: BookSourceUploadKind;
  readonly byteSize: number;
  /**
   * Page count attested by the authenticated owner's PDF.js inspection. It is
   * bound to `expectedChecksum` and `byteSize` for the lifetime of a
   * reservation; trusted completion never replaces it with a provider hint.
   */
  readonly ownerAttestedPhysicalPageCount: number;
  readonly originalFilename: string;
  readonly expectedChecksum: BookSourceChecksum;
  readonly createdAt: string;
  readonly expiresAt: string;
}

/** Safe Assembly projection written only after trusted storage verification. */
export interface BookSourceAssemblyProjection {
  readonly ownerId: string;
  readonly bookId: string;
  readonly sourceKey: string;
  readonly sourceVersionId: string;
  readonly physicalPageCount: number;
  readonly verifiedUsable: boolean;
}

/** Current source map for one Book, keyed by logical source key. */
export type BookSourceAssemblySourceMap = Readonly<Record<string, BookSourceAssemblyProjection>>;

/** Provider-free current Assembly projections, keyed by Book id. */
export type BookSourceAssemblyBooks = Readonly<Record<string, BookSourceAssemblySourceMap>>;

export interface BookSourceUploadOperation extends Omit<
  BookSourceUploadReservation,
  'ownerAttestedPhysicalPageCount'
> {
  /**
   * Legacy operations may predate the owner page-count attestation. Such rows
   * remain readable for capacity/lifecycle work but are never Assembly-usable.
   */
  readonly ownerAttestedPhysicalPageCount?: number;
  readonly status: BookSourceUploadStatus;
  /** Provider file/version identity is absent until trusted completion verifies it. */
  readonly verifiedStorage?: BookSourceVersionStorageIdentity;
  readonly completedAt?: string;
  readonly cleanup?: BookSourceUploadCleanupState;
  /** Retry state for deleting uncommitted siblings while preserving this committed version. */
  readonly versionReconciliation?: BookSourceCommittedVersionReconciliationState;
  readonly releasedAt?: string;
  readonly releaseProof?: 'exact_version_deleted' | 'provider_absent';
}

export interface BookSourceUploadAccountState {
  readonly revision: number;
  readonly capacity: BookSourceUploadAccountCapacityState;
  readonly operations: Readonly<Record<string, BookSourceUploadOperation>>;
  /** Atomically updated with reservations/completions in this account CAS. */
  readonly assemblyBooks?: BookSourceAssemblyBooks;
}
