/** Provider-neutral checksum for immutable Book PDF source bytes. */
export interface BookSourceChecksum {
  readonly algorithm: 'sha-256';
  readonly value: string;
}

/** Immutable publication identity bound to a retirement operation. */
export interface PublicationRetirementGuard {
  readonly bookId: string;
  readonly sourceVersionId: string;
  readonly deletionId: string;
  readonly publicationId: string;
  readonly publicationRevision: number;
  readonly manifestVersionId: string;
  readonly sourceSetRevision: number;
  readonly inputFingerprint: string;
  readonly sourceVersionIds: readonly string[];
}

/** Exact canceled submission identity, with no published source references. */
export interface CanceledSubmissionRetirementGuard {
  readonly kind: 'canceled-submission';
  readonly bookId: string;
  readonly sourceVersionId: string;
  readonly deletionId: string;
  readonly sourceVersionIds?: readonly string[];
  readonly ownerId: string;
  readonly submissionOperationId: string;
  readonly inputFingerprint: string;
}

export type SourceRetirementGuard = PublicationRetirementGuard | CanceledSubmissionRetirementGuard;

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

/** Maximum bytes for one original/component Book source PDF. */
export const BOOK_SOURCE_MAX_PDF_BYTES = 50 * 1024 * 1024;
/** Maximum bytes for a provider-backed student-document source/output. */
export const STUDENT_DOCUMENT_MAX_PDF_BYTES = 100 * 1024 * 1024;
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
export type BookSourcePurpose = 'book-source' | 'student-document';
export type BookSourceStudentSafeStatus = 'unreviewed' | 'review-required' | 'ready' | 'rejected';
export type BookSourceStudentSafeReasonCode =
  | 'teacher-reviewed'
  | 'teacher-only-content'
  | 'invalid-document'
  | 'superseded';

export interface BookSourceStudentSafeDecision {
  readonly decidedBy: string;
  readonly decidedAt: string;
  readonly sourceVersionId: string;
  readonly sha256Hex: string;
  readonly reasonCode: BookSourceStudentSafeReasonCode;
}

export type BookSourceUploadStatus =
  | 'reserved'
  | 'cleanup_pending'
  | 'verified_completed'
  | 'retirement_pending'
  | 'retired'
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
  readonly purpose: BookSourcePurpose;
  readonly studentSafeStatus: BookSourceStudentSafeStatus;
  readonly studentSafeDecision?: BookSourceStudentSafeDecision;
  readonly byteSize: number;
  readonly originalFilename: string;
  readonly expectedChecksum: BookSourceChecksum;
  readonly createdAt: string;
  readonly expiresAt: string;
}

/** Server-only scope retained to find versions from already-started canceled uploads. */
export type BookSourceTerminalCleanupIdentity = Pick<BookSourceUploadReservation,
  'storageLocationId' | 'providerKind' | 'privateBucketId' | 'providerObjectKey' | 'kind' | 'expectedChecksum' | 'expiresAt'>;

/** Safe Assembly projection written only after trusted storage verification. */
export interface BookSourceAssemblyProjection {
  readonly ownerId: string;
  readonly bookId: string;
  readonly sourceKey: string;
  readonly sourceVersionId: string;
  readonly checksum: BookSourceChecksum;
  readonly purpose: BookSourcePurpose;
  readonly studentSafeStatus: BookSourceStudentSafeStatus;
  readonly studentSafeDecision?: BookSourceStudentSafeDecision;
  readonly physicalPageCount: number;
  readonly verifiedUsable: boolean;
}

/** Current source map for one Book, keyed by immutable source version id. */
export type BookSourceAssemblySourceMap = Readonly<Record<string, BookSourceAssemblyProjection>>;

/** Provider-free current Assembly projections, keyed by Book id. */
export type BookSourceAssemblyBooks = Readonly<Record<string, BookSourceAssemblySourceMap>>;

export interface BookSourceUploadOperation extends Omit<
  BookSourceUploadReservation,
  never
> {
  /** Exact submission operation that allocated this not-yet-canonical Book. */
  readonly submissionOperationId?: string;
  /**
   * Worker-derived page count. It is absent until trusted completion reads the
   * immutable provider object through the bounded SourceProvider seam.
   */
  readonly physicalPageCount?: number;
  /** Retained only on the pre-existing retired-history representation. */
  readonly ownerAttestedPhysicalPageCount?: number;
  /** Immutable predecessor provenance for replacement completion. */
  readonly replacesSourceVersionId?: string;
  readonly status: BookSourceUploadStatus;
  /** Provider file/version identity is absent until trusted completion verifies it. */
  readonly verifiedStorage?: BookSourceVersionStorageIdentity;
  readonly completedAt?: string;
  readonly cleanup?: BookSourceUploadCleanupState;
  readonly cleanupIdentity?: BookSourceTerminalCleanupIdentity;
  /** Retry state for deleting uncommitted siblings while preserving this committed version. */
  readonly versionReconciliation?: BookSourceCommittedVersionReconciliationState;
  readonly releasedAt?: string;
  readonly releaseProof?: 'exact_version_deleted' | 'provider_absent';
  /** Publication retirement retains provider-free immutable history. */
  readonly checksum?: BookSourceChecksum;
  readonly retiredAt?: string;
  readonly retirementProof?: 'exact_version_deleted' | 'provider_absent';
  readonly retiredDeletionId?: string;
  readonly retirementGuard?: SourceRetirementGuard;
  readonly retirementPendingAt?: string;
}

export interface BookSourceUploadAccountState {
  readonly revision: number;
  /** Round-robin reservation discovery progress; independent of domain revision. */
  readonly canceledSubmissionScanAfterReservationId?: string;
  readonly capacity: BookSourceUploadAccountCapacityState;
  readonly operations: Readonly<Record<string, BookSourceUploadOperation>>;
  /** Atomically updated with reservations/completions in this account CAS. */
  readonly assemblyBooks?: BookSourceAssemblyBooks;
  /** Deterministic create/replace lifecycle events in the same account CAS. */
  readonly lifecycleAuditEvents?: Readonly<Record<string, BookSourceLifecycleAuditEvent>>;
}

export type BookSourceLifecycleTransition =
  | 'private_ready'
  | 'private_replaced'
  | 'retirement_pending'
  | 'retired';

export interface BookSourceLifecycleAuditEvent {
  readonly eventId: string;
  readonly transition: BookSourceLifecycleTransition;
  readonly revision: number;
  readonly occurredAt: string;
  readonly reservationId: string;
  readonly ownerId: string;
  readonly bookId: string;
  readonly sourceKey: string;
  readonly sourceVersionId: string;
  readonly replacesSourceVersionId?: string;
  readonly deletionId?: string;
  readonly retirementGuard?: SourceRetirementGuard;
  readonly retirementProof?: 'exact_version_deleted' | 'provider_absent';
}
