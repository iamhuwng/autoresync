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

/** All byte categories required by the account-capacity invariant. */
export interface BookSourceCapacityUsage {
  /** Active, hidden, retained, delayed-delete, and every provider object. */
  readonly trackedAccountBytes: number;
  readonly pendingUploadBytes: number;
  readonly replacementUploadBytes: number;
  readonly temporaryBytes: number;
}

export type BookSourceUploadKind = 'initial' | 'replacement';
export type BookSourceUploadStatus = 'reserved' | 'verified_completed' | 'released';

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
  readonly originalFilename: string;
  readonly expectedChecksum: BookSourceChecksum;
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface BookSourceUploadOperation extends BookSourceUploadReservation {
  readonly status: BookSourceUploadStatus;
  /** Provider file/version identity is absent until trusted completion verifies it. */
  readonly verifiedStorage?: BookSourceVersionStorageIdentity;
  readonly completedAt?: string;
}

export interface BookSourceUploadAccountState {
  readonly revision: number;
  readonly capacity: Pick<BookSourceCapacityUsage, 'trackedAccountBytes' | 'temporaryBytes'>;
  readonly operations: Readonly<Record<string, BookSourceUploadOperation>>;
}
