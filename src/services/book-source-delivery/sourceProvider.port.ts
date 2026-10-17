import type {
  BookSourceChecksum,
  BookSourceVersionStorageIdentity,
} from '../../types/bookSource.types';

/** Provider page bound used by every account-capacity reconciliation caller. */
export const SOURCE_PROVIDER_ACCOUNT_TOTALS_MAX_PAGE_SIZE = 1_000;

export const SOURCE_PROVIDER_FAILURE_CODES = [
  'aborted',
  'timeout',
  'not_found',
  'conflict',
  'unauthorized',
  'checksum_mismatch',
  'metadata_mismatch',
  'provider_drift',
  'reconciliation_bound_exceeded',
] as const;

export type SourceProviderFailureCode = (typeof SOURCE_PROVIDER_FAILURE_CODES)[number];

/** Sanitized provider outcome. Never expose provider response bodies/errors. */
export class SourceProviderError extends Error {
  constructor(
    public readonly code: SourceProviderFailureCode,
    public readonly retryable: boolean,
  ) {
    super(`source_provider_${code}`);
    this.name = 'SourceProviderError';
  }
}

export interface SourceProviderRequestOptions {
  readonly signal?: AbortSignal;
  /** Positive bounded duration. Providers must reject before remote work when elapsed. */
  readonly timeoutMs?: number;
  /** Absolute deadline for provider work, including response-body consumption. */
  readonly deadlineAt?: number;
}

export interface SourceProviderUploadAuthorization {
  readonly authorizationId: string;
  readonly expiresAt: string;
  readonly storageLocationId: string;
  readonly providerKind: string;
  readonly privateBucketId: string;
  readonly providerObjectKey: string;
  readonly requiredHeaders: Readonly<Record<string, string>>;
}

export interface SourceProviderObjectMetadata {
  readonly identity: BookSourceVersionStorageIdentity;
  readonly contentType: 'application/pdf';
}

/** Immutable reservation coordinates used to resolve provider version identity. */
export interface SourceProviderObjectReservation {
  readonly bookId: string;
  readonly sourceVersionId: string;
  readonly storageLocationId: string;
  readonly providerKind: string;
  readonly privateBucketId: string;
  readonly providerObjectKey: string;
  readonly checksum: BookSourceChecksum;
  readonly byteSize: number;
}

export interface SourceProviderAccountTotals {
  readonly storageLocationId: string;
  readonly privateBucketId: string;
  readonly totalBytes: number;
  readonly objectCount: number;
}

export interface SourceProviderAccountTotalsPage extends SourceProviderAccountTotals {
  /** Opaque provider cursor for the next bounded reconciliation request. */
  readonly continuation?: string;
}

/** Exactly one range form is permitted. Offsets are zero-based adapter details. */
export type SourceProviderReadRange =
  | { readonly offset: number; readonly length?: number; readonly suffixLength?: never }
  | { readonly offset?: never; readonly length?: never; readonly suffixLength: number };

export interface SourceProviderBoundedRead {
  readonly bytes: Uint8Array;
  readonly totalByteSize: number;
  readonly offset: number;
  /** Provider-confirmed immutable content identity for this range. */
  readonly contentIdentity?: BookSourceVersionStorageIdentity;
}

/**
 * Provider boundary for trusted code only. Browser code receives only a
 * short-lived upload authorization or a Book Delivery resource, never this
 * port, storage identity, provider URL, or application-key identity.
 */
export interface SourceProviderPort {
  authorizeUpload(input: {
    readonly storageLocationId: string;
    readonly providerKind: string;
    readonly privateBucketId: string;
    readonly providerObjectKey: string;
    readonly expectedChecksum: BookSourceChecksum;
    readonly expectedByteSize: number;
    readonly expiresAt: string;
    /** Canonical reservation time used to reconstruct an exact replay URL. */
    readonly issuedAt?: string;
  }, options?: SourceProviderRequestOptions): Promise<SourceProviderUploadAuthorization>;

  /** Resolve and verify the canonical object from reservation coordinates only. */
  resolveCompletedObject(input: {
    readonly expected: SourceProviderObjectReservation;
  }, options?: SourceProviderRequestOptions): Promise<SourceProviderObjectMetadata>;

  verifyCompletedObject(input: {
    readonly expected: BookSourceVersionStorageIdentity;
  }, options?: SourceProviderRequestOptions): Promise<SourceProviderObjectMetadata>;

  readObjectMetadata(input: {
    readonly identity: BookSourceVersionStorageIdentity;
  }, options?: SourceProviderRequestOptions): Promise<SourceProviderObjectMetadata>;

  readAccountTotals(input: {
    readonly storageLocationId: string;
    readonly privateBucketId: string;
  }, options?: SourceProviderRequestOptions): Promise<SourceProviderAccountTotals>;

  readAccountTotalsPage(input: {
    readonly storageLocationId: string;
    readonly privateBucketId: string;
    readonly continuation?: string;
    readonly maxPageSize?: number;
  }, options?: SourceProviderRequestOptions): Promise<SourceProviderAccountTotalsPage>;

  readBounded(input: {
    readonly identity: BookSourceVersionStorageIdentity;
    readonly range: SourceProviderReadRange;
  }, options?: SourceProviderRequestOptions): Promise<SourceProviderBoundedRead>;

  deleteExactVersion(input: {
    readonly identity: BookSourceVersionStorageIdentity;
  }, options?: SourceProviderRequestOptions): Promise<void>;
}
