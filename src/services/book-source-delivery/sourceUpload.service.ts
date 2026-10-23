import type {
  BookSourceUploadAccountState,
  BookSourceChecksum,
  BookSourcePurpose,
  BookSourceAssemblyProjection,
  BookSourceStudentSafeDecision,
  BookSourceStudentSafeReasonCode,
  BookSourceStudentSafeStatus,
  BookSourceUploadKind,
  BookSourceUploadOperation,
  BookSourceVersionStorageIdentity,
} from '../../types/bookSource.types';
import {
  BOOK_SOURCE_MAX_PDF_BYTES,
  STUDENT_DOCUMENT_MAX_PDF_BYTES,
} from '../../types/bookSource.types';
import { normalizeBookSourceDisplayFilename } from './sourceDisplayFilename.service';
import {
  SourceUploadConflictError,
  type CompleteSourceUploadInput as RepositoryCompleteSourceUploadInput,
  type DecideStudentSafeSourceInput as RepositoryDecideStudentSafeSourceInput,
  type ReserveSourceUploadInput,
  type SourceUploadRtdbRepository,
} from './sourceUpload.rtdbRepository';
import type { SourceUploadInspectionClaim } from './sourceUpload.protocol';
import { sourceUploadIdentityDigest as stableDigest, sourceUploadReservationId as derivedReservationId } from './sourceUpload.protocol';
import { createBookSourceVersionStorageIdentity } from './sourceVersion.service';
import type { BookSourceRecoveryContext } from './sourceRecovery.adapter';
import type {
  SourceProviderBoundedRead,
  SourceProviderObjectReservation,
  SourceProviderReadRange,
  SourceProviderRequestOptions,
} from './sourceProvider.port';

const SOURCE_UPLOAD_PROVIDER_FAILURE_CODES = [
  'aborted',
  'timeout',
  'not_found',
  'conflict',
  'unauthorized',
  'checksum_mismatch',
  'metadata_mismatch',
  'provider_drift',
] as const;

type ProviderCode = (typeof SOURCE_UPLOAD_PROVIDER_FAILURE_CODES)[number];

export interface SourceUploadProviderAuthorization {
  readonly authorizationId: string;
  readonly expiresAt: string;
  readonly storageLocationId: string;
  readonly providerKind: string;
  readonly privateBucketId: string;
  readonly providerObjectKey: string;
  readonly requiredHeaders: Readonly<Record<string, string>>;
}

export interface SourceUploadProviderObjectMetadata {
  readonly identity: BookSourceVersionStorageIdentity;
  readonly contentType: 'application/pdf';
}

/** Provider-neutral trusted seam; concrete adapters conform structurally. */
export interface SourceUploadProviderPort {
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
  }): Promise<SourceUploadProviderAuthorization>;
  resolveCompletedObject(input: {
    readonly expected: SourceProviderObjectReservation;
  }, options?: SourceProviderRequestOptions): Promise<SourceUploadProviderObjectMetadata>;
  readBounded(input: {
    readonly identity: BookSourceVersionStorageIdentity;
    readonly range: SourceProviderReadRange;
  }, options?: SourceProviderRequestOptions): Promise<SourceProviderBoundedRead>;
}

/** Trusted count is derived from provider bytes, never from a browser claim. */
export interface TrustedSourcePageCountAdapter {
  countVerifiedPages(input: {
    readonly identity: BookSourceVersionStorageIdentity;
    readonly checksum: BookSourceChecksum;
    readonly byteSize: number;
    readonly signal?: AbortSignal;
    readonly deadlineAt?: number;
    readonly deferCleanup?: (promise: Promise<unknown>) => void;
  }): Promise<number>;
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;
const SAFE_OBJECT_KEY_PREFIX = /^(?!\/)(?!.*(?:^|\/)\.\.?\/)[A-Za-z0-9!$&'()*+,=:@._\/-]{1,768}\/$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const PDF_CONTENT_TYPE = 'application/pdf';
const DEFAULT_RESERVATION_TTL_MS = 15 * 60 * 1_000;
const MAX_RESERVATION_TTL_MS = 24 * 60 * 60 * 1_000;
const CLAIM_KEYS = [
  'schemaVersion',
  'trust',
  'state',
  'displayFilename',
  'exactByteSize',
  'sha256Hex',
  'physicalPageCount',
  'pdfType',
  'readability',
] as const;
const BEGIN_KEYS = ['actorId', 'bookId', 'idempotencyKey', 'sourceKey', 'kind', 'purpose', 'claim'] as const;
const BEGIN_SUBMISSION_KEYS = [...BEGIN_KEYS, 'submissionOperationId'] as const;
const COMPLETE_KEYS = ['actorId', 'bookId', 'reservationId', 'operationId'] as const;
const DECIDE_KEYS = ['actorId', 'bookId', 'reservationId', 'operationId', 'studentSafeStatus', 'reasonCode'] as const;

export type SourceUploadControlErrorCode =
  | 'invalid_input'
  | 'invalid_claim'
  | 'invalid_deployment'
  | 'authority_denied'
  | 'rollout_denied'
  | 'account_state_unavailable'
  | 'idempotency_conflict'
  | 'active_artifact_conflict'
  | 'reservation_not_found'
  | 'reservation_released'
  | 'cleanup_pending'
  | 'stale_cas'
  | 'reservation_conflict'
  | 'provider_authorization_mismatch'
  | 'provider_identity_mismatch'
  | 'provider_metadata_mismatch'
  | 'provider_not_pdf'
  | 'recovery_suppressed'
  | 'provider_failed'
  | `provider_${ProviderCode}`;

/** Stable, sanitized error boundary for browser and trusted transport callers. */
export class SourceUploadControlError extends Error {
  constructor(public readonly code: SourceUploadControlErrorCode) {
    super(`source_upload_${code}`);
    this.name = 'SourceUploadControlError';
  }
}

export type SourceUploadSubmissionAccess = 'status' | 'cleanup';

export interface SourceUploadBookManagementAuthority {
  readonly canManageBookSource: (input: { readonly actorId: string; readonly bookId: string; readonly submissionOperationId?: string; readonly submissionAccess?: SourceUploadSubmissionAccess }) => boolean | Promise<boolean>;
  readonly canDecideStudentSafeSource: (input: { readonly actorId: string; readonly bookId: string; readonly submissionOperationId?: string }) => boolean | Promise<boolean>;
}

export interface BookSourceUploadReleaseAuthorization {
  readonly authorizeUpload: () => boolean | Promise<boolean>;
}

export interface SourceUploadDeploymentConfig {
  readonly accountId: string;
  readonly storageLocationId: string;
  readonly providerKind: string;
  readonly privateBucketId: string;
  readonly objectKeyPrefix?: string;
}

export interface SourceUploadAccountStateReader {
  readonly read: (accountId: string) => BookSourceUploadAccountState | null | Promise<BookSourceUploadAccountState | null>;
}

export interface SourceUploadClock {
  readonly now: () => Date;
}

export interface BookSourceUploadControlDependencies {
  readonly bookManagementAuthority: SourceUploadBookManagementAuthority;
  readonly releaseAuthorization: BookSourceUploadReleaseAuthorization;
  readonly deployment: SourceUploadDeploymentConfig;
  readonly accountStateReader: SourceUploadAccountStateReader;
  readonly repository: Pick<SourceUploadRtdbRepository, 'reserve' | 'completeVerified'>
    & Partial<Pick<SourceUploadRtdbRepository, 'decideStudentSafeSource'>>;
  readonly provider: SourceUploadProviderPort;
  readonly pageCount: TrustedSourcePageCountAdapter;
  /** Worker-memory cache for short-lived exact replay authorities only. */
  readonly authorizationCache?: Map<string, SourceUploadBeginResult>;
  readonly clock: SourceUploadClock;
  readonly reservationTtlMs?: number;
  /** Canonical recovery never creates a new upload or verifies provider bytes. */
  readonly recoveryContext?: BookSourceRecoveryContext;
}

export interface BeginSourceUploadInput {
  readonly actorId: string;
  readonly bookId: string;
  readonly submissionOperationId?: string;
  readonly idempotencyKey: string;
  readonly sourceKey: string;
  readonly kind: BookSourceUploadKind;
  readonly purpose: BookSourcePurpose;
  readonly claim: SourceUploadInspectionClaim;
}

export interface SourceUploadBeginResult {
  readonly status: 'reserved' | 'replayed';
  readonly uploadUrl: string;
  readonly expiresAt: string;
  readonly requiredHeaders: Readonly<Record<string, string>>;
  readonly reservationId: string;
  readonly sourceVersionId: string;
  readonly purpose: BookSourcePurpose;
  readonly studentSafeStatus: BookSourceStudentSafeStatus;
  readonly studentSafeDecision?: BookSourceStudentSafeDecision;
}

export interface CompleteSourceUploadInput {
  readonly actorId: string;
  readonly bookId: string;
  readonly reservationId: string;
  /** Original begin idempotency identity; binds completion to the reservation. */
  readonly operationId: string;
}

/** Request-owned cancellation context; never accepted from the browser payload. */
export interface SourceUploadCompletionContext {
  readonly signal?: AbortSignal;
  readonly deadlineAt?: number;
  readonly deferCleanup?: (promise: Promise<unknown>) => void;
}

/** Browser-safe immutable completion projection. Storage authority is omitted. */
export interface SourceUploadVerifiedOperation {
  readonly reservationId: string;
  readonly bookId: string;
  readonly sourceVersionId: string;
  readonly sourceKey: string;
  readonly kind: BookSourceUploadKind;
  readonly checksum: BookSourceChecksum;
  readonly purpose: BookSourcePurpose;
  readonly studentSafeStatus: BookSourceStudentSafeStatus;
  readonly studentSafeDecision?: BookSourceStudentSafeDecision;
  readonly physicalPageCount: number;
  readonly status: 'verified_completed';
  readonly completedAt: string;
}

export interface DecideStudentSafeSourceInput {
  readonly actorId: string;
  readonly bookId: string;
  readonly reservationId: string;
  readonly operationId: string;
  readonly studentSafeStatus: Exclude<BookSourceStudentSafeStatus, 'unreviewed'>;
  readonly reasonCode: BookSourceStudentSafeReasonCode;
}

export interface BookSourceUploadControl {
  readonly begin: (input: BeginSourceUploadInput) => Promise<SourceUploadBeginResult>;
  readonly complete: (
    input: CompleteSourceUploadInput,
    context?: SourceUploadCompletionContext,
  ) => Promise<SourceUploadVerifiedOperation>;
  readonly decideStudentSafeSource: (input: DecideStudentSafeSourceInput) => Promise<SourceUploadVerifiedOperation>;
}

type ResolvedDependencies = {
  readonly authority: SourceUploadBookManagementAuthority;
  readonly releaseAuthorization: BookSourceUploadReleaseAuthorization;
  readonly deployment: SourceUploadDeploymentConfig & { readonly objectKeyPrefix: string };
  readonly accountStateReader: SourceUploadAccountStateReader;
  readonly repository: Pick<SourceUploadRtdbRepository, 'reserve' | 'completeVerified'>
    & Partial<Pick<SourceUploadRtdbRepository, 'decideStudentSafeSource'>>;
  readonly provider: SourceUploadProviderPort;
  readonly pageCount: TrustedSourcePageCountAdapter;
  readonly authorizationCache: Map<string, SourceUploadBeginResult>;
  readonly clock: () => Date;
  readonly reservationTtlMs: number;
};

const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const actual = Reflect.ownKeys(value).filter((key): key is string => typeof key === 'string').sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> => value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

function assertSafeIdentifier(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !SAFE_IDENTIFIER.test(value)) throw new SourceUploadControlError('invalid_input');
}

function assertExactRecord(value: unknown, keys: readonly string[], code: SourceUploadControlErrorCode): asserts value is Record<string, unknown> {
  if (!isPlainRecord(value) || !hasExactKeys(value, keys)) throw new SourceUploadControlError(code);
}

const assertBeginInput = (value: BeginSourceUploadInput): void => {
  if (!isPlainRecord(value)
    || (!hasExactKeys(value, BEGIN_KEYS) && !hasExactKeys(value, BEGIN_SUBMISSION_KEYS))) {
    throw new SourceUploadControlError('invalid_input');
  }
  assertSafeIdentifier(value.actorId);
  assertSafeIdentifier(value.bookId);
  if (value.submissionOperationId !== undefined) assertSafeIdentifier(value.submissionOperationId);
  if (typeof value.idempotencyKey !== 'string' || !UUID.test(value.idempotencyKey)) {
    throw new SourceUploadControlError('invalid_input');
  }
  assertSafeIdentifier(value.sourceKey);
  if (value.kind !== 'initial' && value.kind !== 'replacement') throw new SourceUploadControlError('invalid_input');
  if (value.purpose !== 'book-source' && value.purpose !== 'student-document') {
    throw new SourceUploadControlError('invalid_input');
  }
  assertClaim(value.claim, value.purpose);
};

const assertCompleteInput = (value: CompleteSourceUploadInput): void => {
  assertExactRecord(value, COMPLETE_KEYS, 'invalid_input');
  assertSafeIdentifier(value.actorId);
  assertSafeIdentifier(value.bookId);
  assertSafeIdentifier(value.reservationId);
  if (typeof value.operationId !== 'string' || !UUID.test(value.operationId)) {
    throw new SourceUploadControlError('invalid_input');
  }
};

const assertDecisionRequest = (value: DecideStudentSafeSourceInput): void => {
  assertExactRecord(value, DECIDE_KEYS, 'invalid_input');
  assertSafeIdentifier(value.actorId);
  assertSafeIdentifier(value.bookId);
  assertSafeIdentifier(value.reservationId);
  if (typeof value.operationId !== 'string' || !UUID.test(value.operationId)) {
    throw new SourceUploadControlError('invalid_input');
  }
  if (!['review-required', 'ready', 'rejected'].includes(value.studentSafeStatus)
    || !['teacher-reviewed', 'teacher-only-content', 'invalid-document', 'superseded'].includes(value.reasonCode)) {
    throw new SourceUploadControlError('invalid_input');
  }
};

function assertClaim(value: unknown, purpose: BookSourcePurpose): asserts value is SourceUploadInspectionClaim {
  try {
    assertExactRecord(value, CLAIM_KEYS, 'invalid_claim');
    if (value.schemaVersion !== 1
      || value.trust !== 'browser-supplied-untrusted'
      || value.state !== 'complete'
      || value.pdfType !== PDF_CONTENT_TYPE
      || value.readability !== 'readable'
      || typeof value.displayFilename !== 'string'
      || typeof value.sha256Hex !== 'string'
      || !/^[a-f0-9]{64}$/iu.test(value.sha256Hex)
      || typeof value.exactByteSize !== 'number'
      || !Number.isSafeInteger(value.exactByteSize)
      || value.exactByteSize <= 0
      || value.exactByteSize > (purpose === 'book-source' ? BOOK_SOURCE_MAX_PDF_BYTES : STUDENT_DOCUMENT_MAX_PDF_BYTES)
      || typeof value.physicalPageCount !== 'number'
      || !Number.isSafeInteger(value.physicalPageCount)
      || value.physicalPageCount <= 0
      || value.physicalPageCount > 100_000
      || normalizeBookSourceDisplayFilename(value.displayFilename) !== value.displayFilename) {
      throw new SourceUploadControlError('invalid_claim');
    }
  } catch (error) {
    if (error instanceof SourceUploadControlError) throw error;
    throw new SourceUploadControlError('invalid_claim');
  }
}

const resolveDependencies = (input: BookSourceUploadControlDependencies): ResolvedDependencies => {
  const { bookManagementAuthority, releaseAuthorization, deployment, accountStateReader, repository, provider, pageCount } = input;
  if (!bookManagementAuthority?.canManageBookSource || !bookManagementAuthority?.canDecideStudentSafeSource
    || !releaseAuthorization?.authorizeUpload
    || !deployment || !accountStateReader?.read || !repository || !provider || !pageCount?.countVerifiedPages) {
    throw new SourceUploadControlError('invalid_deployment');
  }
  for (const value of [
    deployment.accountId,
    deployment.storageLocationId,
    deployment.providerKind,
    deployment.privateBucketId,
  ]) assertSafeIdentifier(value);
  const objectKeyPrefix = deployment.objectKeyPrefix ?? 'book-source/';
  if (!SAFE_OBJECT_KEY_PREFIX.test(objectKeyPrefix)) {
    throw new SourceUploadControlError('invalid_deployment');
  }
  const reservationTtlMs = input.reservationTtlMs ?? DEFAULT_RESERVATION_TTL_MS;
  if (!Number.isSafeInteger(reservationTtlMs) || reservationTtlMs <= 0 || reservationTtlMs > MAX_RESERVATION_TTL_MS) {
    throw new SourceUploadControlError('invalid_deployment');
  }
  const clock = input.clock?.now;
  if (!clock) throw new SourceUploadControlError('invalid_deployment');
  return {
    authority: bookManagementAuthority,
    releaseAuthorization,
    deployment: Object.freeze({ ...deployment, objectKeyPrefix }),
    accountStateReader,
    repository,
    provider,
    pageCount,
    authorizationCache: input.authorizationCache ?? new Map<string, SourceUploadBeginResult>(),
    clock,
    reservationTtlMs,
  };
};

const readAccountState = async (reader: SourceUploadAccountStateReader, accountId: string): Promise<BookSourceUploadAccountState> => {
  try {
    const value = await reader.read(accountId);
    if (!value || !Number.isSafeInteger(value.revision) || value.revision < 0 || !value.operations) {
      throw new SourceUploadControlError('account_state_unavailable');
    }
    return value;
  } catch (error) {
    if (error instanceof SourceUploadControlError) throw error;
    throw new SourceUploadControlError('account_state_unavailable');
  }
};

const authorizeBook = async (authority: SourceUploadBookManagementAuthority, actorId: string, bookId: string,
  submissionOperationId?: string, submissionAccess?: SourceUploadSubmissionAccess): Promise<void> => {
  try {
    const result = await authority.canManageBookSource({ actorId, bookId,
      ...(submissionOperationId === undefined ? {} : { submissionOperationId }),
      ...(submissionAccess === undefined ? {} : { submissionAccess }),
    });
    if (result !== true) throw new SourceUploadControlError('authority_denied');
  } catch (error) {
    if (error instanceof SourceUploadControlError) throw error;
    throw new SourceUploadControlError('authority_denied');
  }
};

const authorizeStudentSafeDecision = async (
  authority: SourceUploadBookManagementAuthority,
  actorId: string,
  bookId: string,
  submissionOperationId?: string,
): Promise<void> => {
  try {
    const result = await authority.canDecideStudentSafeSource({ actorId, bookId,
      ...(submissionOperationId === undefined ? {} : { submissionOperationId }),
    });
    if (result !== true) throw new SourceUploadControlError('authority_denied');
  } catch (error) {
    if (error instanceof SourceUploadControlError) throw error;
    throw new SourceUploadControlError('authority_denied');
  }
};

const assertUploadAuthorized = async (authorization: BookSourceUploadReleaseAuthorization): Promise<void> => {
  try {
    if ((await authorization.authorizeUpload()) !== true) {
      throw new SourceUploadControlError('rollout_denied');
    }
  } catch (error) {
    if (error instanceof SourceUploadControlError) throw error;
    throw new SourceUploadControlError('rollout_denied');
  }
};

const nowIso = (clock: () => Date): Date => {
  try {
    const value = clock();
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new Error('invalid_clock');
    return value;
  } catch {
    throw new SourceUploadControlError('invalid_deployment');
  }
};

const MAX_AUTHORIZATION_CACHE_ENTRIES = 256;

const cacheAuthorization = (
  cache: Map<string, SourceUploadBeginResult>,
  reservationId: string,
  authorization: SourceUploadBeginResult,
  nowMs: number,
): void => {
  for (const [cachedReservationId, cachedAuthorization] of cache) {
    if (!Number.isFinite(Date.parse(cachedAuthorization.expiresAt))
      || Date.parse(cachedAuthorization.expiresAt) <= nowMs) {
      cache.delete(cachedReservationId);
    }
  }
  if (!cache.has(reservationId) && cache.size >= MAX_AUTHORIZATION_CACHE_ENTRIES) {
    const oldestReservationId = cache.keys().next().value;
    if (typeof oldestReservationId === 'string') cache.delete(oldestReservationId);
  }
  cache.set(reservationId, authorization);
};

const derivedIdentity = (input: BeginSourceUploadInput, objectKeyPrefix: string) => {
  const key = input.idempotencyKey.toLowerCase();
  const digest = stableDigest(`${input.actorId}\u0000${input.bookId}\u0000${key}`);
  return Object.freeze({
    reservationId: derivedReservationId(input.actorId, input.bookId, input.idempotencyKey),
    sourceVersionId: `source-version-${stableDigest(`${input.bookId}\u0000${input.actorId}\u0000${key}`)}`,
    providerObjectKey: `${objectKeyPrefix}${input.actorId}/${input.bookId}/${digest}.pdf`,
  });
};

const sameRequest = (operation: BookSourceUploadOperation, input: BeginSourceUploadInput): boolean =>
  operation.bookId === input.bookId
  && operation.ownerId === input.actorId
  && operation.submissionOperationId === input.submissionOperationId
  && operation.sourceKey === input.sourceKey
  && operation.kind === input.kind
  && operation.purpose === input.purpose
  && operation.byteSize === input.claim.exactByteSize
  && operation.originalFilename === input.claim.displayFilename
  && operation.expectedChecksum.value === input.claim.sha256Hex.toLowerCase();

const providerAuthorization = async (
  provider: SourceUploadProviderPort,
  input: ReserveSourceUploadInput,
  status: SourceUploadBeginResult['status'],
  now: Date,
): Promise<SourceUploadBeginResult> => {
  let authorization: SourceUploadProviderAuthorization;
  try {
    authorization = await provider.authorizeUpload({
      storageLocationId: input.storageLocationId,
      providerKind: input.providerKind,
      privateBucketId: input.privateBucketId,
      providerObjectKey: input.providerObjectKey,
      expectedChecksum: input.expectedChecksum,
      expectedByteSize: input.byteSize,
      expiresAt: input.expiresAt,
      issuedAt: input.createdAt,
    });
  } catch (error) {
    throw providerError(error);
  }
  if (!isPlainRecord(authorization)) {
    throw new SourceUploadControlError('provider_authorization_mismatch');
  }
  let authorityUrl: URL;
  try {
    authorityUrl = new URL(authorization.authorizationId);
  } catch {
    throw new SourceUploadControlError('provider_authorization_mismatch');
  }
  const authorityExpiresAt = Date.parse(authorization.expiresAt);
  if (typeof authorization.authorizationId !== 'string'
    || authorization.authorizationId.length === 0
    || authorityUrl.protocol !== 'https:'
    || authorityUrl.username !== ''
    || authorityUrl.password !== ''
    || authorityUrl.hash !== ''
    || typeof authorization.expiresAt !== 'string'
    || !Number.isFinite(authorityExpiresAt)
    || authorityExpiresAt <= now.getTime()
    || authorityExpiresAt > Date.parse(input.expiresAt)
    || authorization.storageLocationId !== input.storageLocationId
    || authorization.providerKind !== input.providerKind
    || authorization.privateBucketId !== input.privateBucketId
    || authorization.providerObjectKey !== input.providerObjectKey
    || !isStringRecord(authorization.requiredHeaders)
    || !hasBoundUploadHeaders(authorization.requiredHeaders, input)) {
    throw new SourceUploadControlError('provider_authorization_mismatch');
  }
  return Object.freeze({
    status,
    uploadUrl: authorization.authorizationId,
    expiresAt: authorization.expiresAt,
    requiredHeaders: Object.freeze({ ...authorization.requiredHeaders }),
    reservationId: input.reservationId,
    sourceVersionId: input.sourceVersionId,
    purpose: input.purpose,
    studentSafeStatus: input.studentSafeStatus,
    ...(input.studentSafeDecision === undefined ? {} : {
      studentSafeDecision: input.studentSafeDecision,
    }),
  });
};

const isStringRecord = (value: unknown): value is Readonly<Record<string, string>> => isPlainRecord(value)
  && Object.values(value).every((entry) => typeof entry === 'string');

const hasBoundUploadHeaders = (
  headers: Readonly<Record<string, string>>,
  input: ReserveSourceUploadInput,
): boolean => {
  const entries = Object.entries(headers);
  const normalizedEntries = entries.map(([key, value]) => [key.toLowerCase(), value] as const);
  const normalized = Object.fromEntries(normalizedEntries);
  const allowed = [
    'content-type',
    'x-amz-content-sha256',
    'x-amz-meta-book-source-byte-size',
    'x-amz-meta-book-source-sha256',
  ];
  return entries.length === allowed.length
    && new Set(normalizedEntries.map(([key]) => key)).size === allowed.length
    && allowed.every((key) => Object.hasOwn(normalized, key))
    && normalized['content-type'] === PDF_CONTENT_TYPE
    && normalized['x-amz-content-sha256'] === input.expectedChecksum.value
    && normalized['x-amz-meta-book-source-byte-size'] === String(input.byteSize)
    && normalized['x-amz-meta-book-source-sha256'] === input.expectedChecksum.value;
};

const providerError = (error: unknown): SourceUploadControlError => {
  const candidate = error !== null && typeof error === 'object'
    ? (error as { readonly code?: unknown }).code
    : undefined;
  const code = typeof candidate === 'string'
    && SOURCE_UPLOAD_PROVIDER_FAILURE_CODES.includes(candidate as ProviderCode)
    ? candidate as ProviderCode
    : undefined;
  if (code) return new SourceUploadControlError(`provider_${code}`);
  return new SourceUploadControlError('provider_failed');
};

const sameReservationIdentity = (
  identity: BookSourceVersionStorageIdentity,
  operation: BookSourceUploadOperation,
): boolean => identity.bookId === operation.bookId
  && identity.sourceVersionId === operation.sourceVersionId
  && identity.storageLocationId === operation.storageLocationId
  && identity.providerKind === operation.providerKind
  && identity.privateBucketId === operation.privateBucketId
  && identity.providerObjectKey === operation.providerObjectKey
  && identity.byteSize === operation.byteSize
  && identity.checksum.algorithm === operation.expectedChecksum.algorithm
  && identity.checksum.value === operation.expectedChecksum.value;

const verifiedProjection = (operation: BookSourceUploadOperation): SourceUploadVerifiedOperation => {
  if (operation.status !== 'verified_completed' || !operation.completedAt) {
    throw new SourceUploadControlError('reservation_conflict');
  }
  return Object.freeze({
    reservationId: operation.reservationId,
    bookId: operation.bookId,
    sourceVersionId: operation.sourceVersionId,
    sourceKey: operation.sourceKey,
    kind: operation.kind,
    checksum: Object.freeze({ ...operation.expectedChecksum }),
    purpose: operation.purpose,
    studentSafeStatus: operation.studentSafeStatus,
    ...(operation.studentSafeDecision === undefined ? {} : {
      studentSafeDecision: operation.studentSafeDecision,
    }),
    physicalPageCount: operation.physicalPageCount!,
    status: 'verified_completed',
    completedAt: operation.completedAt,
  });
};

export interface SourceUploadListedProjection extends BookSourceAssemblyProjection {}

export const listBookSourceProjections = (
  state: Pick<BookSourceUploadAccountState, 'assemblyBooks'>,
  actorId: string,
  bookId: string,
): readonly SourceUploadListedProjection[] => Object.entries(state.assemblyBooks?.[bookId] ?? {})
  .filter(([sourceVersionId, projection]) => projection.ownerId === actorId
    && projection.bookId === bookId
    && projection.sourceVersionId === sourceVersionId
    && projection.purpose === 'book-source'
    && projection.studentSafeStatus !== 'rejected'
    && projection.verifiedUsable === true)
  .map(([, projection]) => Object.freeze({ ...projection }))
  .sort((left, right) => left.sourceKey.localeCompare(right.sourceKey)
    || left.sourceVersionId.localeCompare(right.sourceVersionId));

const resolveProviderObject = async (
  provider: SourceUploadProviderPort,
  expected: SourceProviderObjectReservation,
  options?: SourceProviderRequestOptions,
): Promise<BookSourceVersionStorageIdentity> => {
  let result: SourceUploadProviderObjectMetadata;
  try {
    result = options === undefined
      ? await provider.resolveCompletedObject({ expected })
      : await provider.resolveCompletedObject({ expected }, options);
  } catch (error) {
    throw providerError(error);
  }
  if (!isPlainRecord(result)) throw new SourceUploadControlError('provider_metadata_mismatch');
  if (result.contentType !== PDF_CONTENT_TYPE) throw new SourceUploadControlError('provider_not_pdf');
  let identity: BookSourceVersionStorageIdentity;
  try {
    const candidate = result.identity as unknown as Record<string, unknown>;
    identity = createBookSourceVersionStorageIdentity(candidate);
  } catch (error) {
    if (error instanceof SourceUploadControlError) throw error;
    throw new SourceUploadControlError('provider_metadata_mismatch');
  }
  if (identity.bookId !== expected.bookId
    || identity.sourceVersionId !== expected.sourceVersionId
    || identity.storageLocationId !== expected.storageLocationId
    || identity.providerKind !== expected.providerKind
    || identity.privateBucketId !== expected.privateBucketId
    || identity.providerObjectKey !== expected.providerObjectKey
    || identity.byteSize !== expected.byteSize
    || identity.checksum.algorithm !== expected.checksum.algorithm
    || identity.checksum.value !== expected.checksum.value) {
    throw new SourceUploadControlError('provider_identity_mismatch');
  }
  return identity;
};

const completeRepositoryError = (error: unknown): SourceUploadControlError => {
  if (!(error instanceof SourceUploadConflictError)) return new SourceUploadControlError('reservation_conflict');
  if (error.message.includes('compare-and-set')) return new SourceUploadControlError('stale_cas');
  if (error.message.includes('does not exist') || error.message.includes('only a reserved')) {
    return new SourceUploadControlError('reservation_conflict');
  }
  return new SourceUploadControlError('reservation_conflict');
};

const begin = async (input: BeginSourceUploadInput, dependencies: BookSourceUploadControlDependencies): Promise<SourceUploadBeginResult> => {
  assertBeginInput(input);
  const resolved = resolveDependencies(dependencies);
  if (dependencies.recoveryContext) throw new SourceUploadControlError('recovery_suppressed');
  await authorizeBook(resolved.authority, input.actorId, input.bookId, input.submissionOperationId);
  await assertUploadAuthorized(resolved.releaseAuthorization);
  const state = await readAccountState(resolved.accountStateReader, resolved.deployment.accountId);
  const requestNow = nowIso(resolved.clock);
  for (const [cachedReservationId, cachedAuthorization] of resolved.authorizationCache) {
    if (!Number.isFinite(Date.parse(cachedAuthorization.expiresAt))
      || Date.parse(cachedAuthorization.expiresAt) <= requestNow.getTime()) {
      resolved.authorizationCache.delete(cachedReservationId);
    }
  }
  const identity = derivedIdentity(input, resolved.deployment.objectKeyPrefix);
  const existing = state.operations[identity.reservationId];
  if (existing) {
    if (!sameRequest(existing, input)) throw new SourceUploadControlError('idempotency_conflict');
    if (existing.status === 'released') {
      resolved.authorizationCache.delete(identity.reservationId);
      throw new SourceUploadControlError('reservation_released');
    }
    if (existing.status === 'cleanup_pending') {
      resolved.authorizationCache.delete(identity.reservationId);
      throw new SourceUploadControlError('cleanup_pending');
    }
    if (existing.status === 'verified_completed' || existing.status === 'retired') {
      resolved.authorizationCache.delete(identity.reservationId);
      throw new SourceUploadControlError('reservation_conflict');
    }
    const reservation: ReserveSourceUploadInput = {
      accountId: resolved.deployment.accountId,
      expectedRevision: state.revision,
      reservationId: existing.reservationId,
      bookId: existing.bookId,
      sourceVersionId: existing.sourceVersionId,
      sourceKey: existing.sourceKey,
      ownerId: existing.ownerId,
      ...(existing.submissionOperationId === undefined ? {} : { submissionOperationId: existing.submissionOperationId }),
      storageLocationId: existing.storageLocationId,
      providerKind: existing.providerKind,
      privateBucketId: existing.privateBucketId,
      providerObjectKey: existing.providerObjectKey,
      kind: existing.kind,
      purpose: existing.purpose,
      studentSafeStatus: existing.studentSafeStatus,
      ...(existing.studentSafeDecision === undefined ? {} : {
        studentSafeDecision: existing.studentSafeDecision,
      }),
      byteSize: existing.byteSize,
      originalFilename: existing.originalFilename,
      expectedChecksum: existing.expectedChecksum,
      createdAt: existing.createdAt,
      expiresAt: existing.expiresAt,
    };
    try {
      await resolved.repository.reserve(reservation);
    } catch (error) {
      if (error instanceof SourceUploadConflictError && error.message.includes('compare-and-set')) {
        throw new SourceUploadControlError('stale_cas');
      }
      if (error instanceof SourceUploadConflictError && error.message.includes('provider reconciliation')) {
        throw new SourceUploadControlError('account_state_unavailable');
      }
      throw new SourceUploadControlError('reservation_conflict');
    }
    const cached = resolved.authorizationCache.get(identity.reservationId);
    if (cached) return Object.freeze({ ...cached, status: 'replayed' as const });
    const replayNow = nowIso(resolved.clock);
    const replayed = await providerAuthorization(
      resolved.provider,
      reservation,
      'replayed',
      replayNow,
    );
    cacheAuthorization(
      resolved.authorizationCache,
      identity.reservationId,
      Object.freeze({ ...replayed, status: 'reserved' as const }),
      replayNow.getTime(),
    );
    return replayed;
  }
  if (Object.values(state.operations).some((operation) =>
    (operation.status === 'reserved' || operation.status === 'cleanup_pending')
      && operation.bookId === input.bookId)) {
    throw new SourceUploadControlError('active_artifact_conflict');
  }
  const createdAt = nowIso(resolved.clock);
  const expiresAt = new Date(createdAt.getTime() + resolved.reservationTtlMs).toISOString();
  const reservation: ReserveSourceUploadInput = {
    accountId: resolved.deployment.accountId,
    expectedRevision: state.revision,
    reservationId: identity.reservationId,
    bookId: input.bookId,
    sourceVersionId: identity.sourceVersionId,
    sourceKey: input.sourceKey,
    ownerId: input.actorId,
    ...(input.submissionOperationId === undefined ? {} : { submissionOperationId: input.submissionOperationId }),
    storageLocationId: resolved.deployment.storageLocationId,
    providerKind: resolved.deployment.providerKind,
    privateBucketId: resolved.deployment.privateBucketId,
    providerObjectKey: identity.providerObjectKey,
    kind: input.kind,
    purpose: input.purpose,
    studentSafeStatus: 'unreviewed',
    byteSize: input.claim.exactByteSize,
    originalFilename: input.claim.displayFilename,
    expectedChecksum: { algorithm: 'sha-256', value: input.claim.sha256Hex.toLowerCase() },
    createdAt: createdAt.toISOString(),
    expiresAt,
  };
  const authorized = await providerAuthorization(resolved.provider, reservation, 'reserved', createdAt);
  try {
    await resolved.repository.reserve(reservation);
  } catch (error) {
    if (error instanceof SourceUploadConflictError) {
      if (error.message.includes('sourceKey')) throw new SourceUploadControlError('active_artifact_conflict');
      if (error.message.includes('compare-and-set')) throw new SourceUploadControlError('stale_cas');
      if (error.message.includes('provider reconciliation')) {
        throw new SourceUploadControlError('account_state_unavailable');
      }
      throw new SourceUploadControlError('reservation_conflict');
    }
    throw new SourceUploadControlError('reservation_conflict');
  }
  cacheAuthorization(resolved.authorizationCache, identity.reservationId, authorized, createdAt.getTime());
  return authorized;
};

const complete = async (
  input: CompleteSourceUploadInput,
  dependencies: BookSourceUploadControlDependencies,
  context: SourceUploadCompletionContext = {},
): Promise<SourceUploadVerifiedOperation> => {
  assertCompleteInput(input);
  const resolved = resolveDependencies(dependencies);
  if (dependencies.recoveryContext) throw new SourceUploadControlError('recovery_suppressed');
  const state = await readAccountState(resolved.accountStateReader, resolved.deployment.accountId);
  const operation = state.operations[input.reservationId];
  if (!operation || operation.bookId !== input.bookId || operation.ownerId !== input.actorId) {
    throw new SourceUploadControlError('reservation_not_found');
  }
  await authorizeBook(resolved.authority, input.actorId, input.bookId, operation.submissionOperationId);
  if (operation.status === 'released') throw new SourceUploadControlError('reservation_released');
  if (operation.status === 'cleanup_pending') throw new SourceUploadControlError('cleanup_pending');
  if (operation.status === 'retired') throw new SourceUploadControlError('reservation_conflict');
  if (operation.studentSafeStatus === 'rejected') throw new SourceUploadControlError('reservation_conflict');
  if (derivedReservationId(operation.ownerId, input.bookId, input.operationId) !== operation.reservationId) {
    throw new SourceUploadControlError('reservation_conflict');
  }
  const finishVerified = async (verified: BookSourceUploadOperation): Promise<SourceUploadVerifiedOperation> => {
    return verifiedProjection(verified);
  };
  if (operation.status === 'verified_completed') {
    let storedIdentity: BookSourceVersionStorageIdentity;
    try {
      storedIdentity = createBookSourceVersionStorageIdentity(operation.verifiedStorage);
    } catch {
      throw new SourceUploadControlError('account_state_unavailable');
    }
    if (!sameReservationIdentity(storedIdentity, operation)) {
      throw new SourceUploadControlError('account_state_unavailable');
    }
    if (operation.physicalPageCount === undefined) {
      throw new SourceUploadControlError('account_state_unavailable');
    }
    const projection = state.assemblyBooks?.[operation.bookId]?.[operation.sourceVersionId];
    if (projection
      && projection.ownerId === operation.ownerId
      && projection.bookId === operation.bookId
      && projection.sourceKey === operation.sourceKey
      && projection.sourceVersionId === operation.sourceVersionId
      && projection.checksum?.algorithm === operation.expectedChecksum.algorithm
      && projection.checksum?.value === operation.expectedChecksum.value
      && projection.physicalPageCount === operation.physicalPageCount
      && projection.verifiedUsable === true) {
      return finishVerified(operation);
    }
    let repairedState: BookSourceUploadAccountState;
    try {
      repairedState = await resolved.repository.completeVerified({
        accountId: resolved.deployment.accountId,
        expectedRevision: state.revision,
        reservationId: operation.reservationId,
        verifiedStorage: storedIdentity,
        physicalPageCount: operation.physicalPageCount,
        verifiedAt: operation.completedAt!,
      });
    } catch (error) {
      throw completeRepositoryError(error);
    }
    const repaired = repairedState.operations[input.reservationId];
    if (!repaired || repaired.status !== 'verified_completed') {
      throw new SourceUploadControlError('reservation_conflict');
    }
    return finishVerified(repaired);
  }
  const expected: SourceProviderObjectReservation = {
    bookId: operation.bookId,
    sourceVersionId: operation.sourceVersionId,
    storageLocationId: operation.storageLocationId,
    providerKind: operation.providerKind,
    privateBucketId: operation.privateBucketId,
    providerObjectKey: operation.providerObjectKey,
    checksum: operation.expectedChecksum,
    byteSize: operation.byteSize,
  };
  const providerOptions: SourceProviderRequestOptions | undefined =
    context.signal || context.deadlineAt !== undefined
      ? {
          ...(context.signal === undefined ? {} : { signal: context.signal }),
          ...(context.deadlineAt === undefined ? {} : { deadlineAt: context.deadlineAt }),
        }
      : undefined;
  const verifiedStorage = await resolveProviderObject(resolved.provider, expected, providerOptions);
  let physicalPageCount: number;
  try {
    physicalPageCount = await resolved.pageCount.countVerifiedPages({
      identity: verifiedStorage,
      checksum: operation.expectedChecksum,
      byteSize: operation.byteSize,
      ...(context.signal === undefined ? {} : { signal: context.signal }),
      ...(context.deadlineAt === undefined ? {} : { deadlineAt: context.deadlineAt }),
      ...(context.deferCleanup === undefined ? {} : { deferCleanup: context.deferCleanup }),
    });
  } catch (error) {
    throw providerError(error);
  }
  if (!Number.isSafeInteger(physicalPageCount) || physicalPageCount < 1 || physicalPageCount > 100_000) {
    throw new SourceUploadControlError('provider_metadata_mismatch');
  }
  const verifiedAt = nowIso(resolved.clock).toISOString();
  let completedState: BookSourceUploadAccountState;
  try {
    const completion: RepositoryCompleteSourceUploadInput = {
      accountId: resolved.deployment.accountId,
      expectedRevision: state.revision,
      reservationId: operation.reservationId,
      verifiedStorage,
      physicalPageCount,
      verifiedAt,
    };
    completedState = await resolved.repository.completeVerified(completion);
  } catch (error) {
    throw completeRepositoryError(error);
  }
  const completed = completedState.operations[input.reservationId];
  if (!completed || completed.status !== 'verified_completed') throw new SourceUploadControlError('reservation_conflict');
  return finishVerified(completed);
};

const decideStudentSafeSource = async (
  input: DecideStudentSafeSourceInput,
  dependencies: BookSourceUploadControlDependencies,
): Promise<SourceUploadVerifiedOperation> => {
  assertDecisionRequest(input);
  const resolved = resolveDependencies(dependencies);
  if (dependencies.recoveryContext) throw new SourceUploadControlError('recovery_suppressed');
  const state = await readAccountState(resolved.accountStateReader, resolved.deployment.accountId);
  const operation = state.operations[input.reservationId];
  if (!operation || operation.bookId !== input.bookId) {
    throw new SourceUploadControlError('reservation_not_found');
  }
  if (operation.submissionOperationId && operation.ownerId !== input.actorId) throw new SourceUploadControlError('authority_denied');
  await authorizeStudentSafeDecision(resolved.authority, input.actorId, input.bookId, operation.submissionOperationId);
  if (derivedReservationId(operation.ownerId, input.bookId, input.operationId) !== operation.reservationId) {
    throw new SourceUploadControlError('reservation_conflict');
  }
  if (operation.status !== 'verified_completed') {
    throw new SourceUploadControlError('reservation_conflict');
  }
  if (!resolved.repository.decideStudentSafeSource) {
    throw new SourceUploadControlError('invalid_deployment');
  }
  if (operation.studentSafeStatus !== 'unreviewed') {
    const persistedDecision = operation.studentSafeDecision;
    if (operation.studentSafeStatus === input.studentSafeStatus
      && persistedDecision?.sourceVersionId === operation.sourceVersionId
      && persistedDecision.sha256Hex === operation.expectedChecksum.value
      && persistedDecision.reasonCode === input.reasonCode) {
      return verifiedProjection(operation);
    }
    throw new SourceUploadControlError('reservation_conflict');
  }
  const decidedAt = nowIso(resolved.clock).toISOString();
  const decision: RepositoryDecideStudentSafeSourceInput = {
    accountId: resolved.deployment.accountId,
    expectedRevision: state.revision,
    reservationId: operation.reservationId,
    bookId: operation.bookId,
    actorId: input.actorId,
    studentSafeStatus: input.studentSafeStatus,
    studentSafeDecision: {
      decidedBy: input.actorId,
      decidedAt,
      sourceVersionId: operation.sourceVersionId,
      sha256Hex: operation.expectedChecksum.value,
      reasonCode: input.reasonCode,
    },
  };
  let next: BookSourceUploadAccountState;
  try {
    next = await resolved.repository.decideStudentSafeSource(decision);
  } catch (error) {
    throw completeRepositoryError(error);
  }
  const decided = next.operations[input.reservationId];
  if (!decided || decided.status !== 'verified_completed') {
    throw new SourceUploadControlError('reservation_conflict');
  }
  return verifiedProjection(decided);
};

export const createBookSourceUploadControl = (dependencies: BookSourceUploadControlDependencies): BookSourceUploadControl => {
  const authorizationCache = dependencies.authorizationCache ?? new Map<string, SourceUploadBeginResult>();
  const resolvedDependencies = { ...dependencies, authorizationCache };
  return Object.freeze({
    begin: (input: BeginSourceUploadInput) => begin(input, resolvedDependencies),
    complete: (input: CompleteSourceUploadInput, context?: SourceUploadCompletionContext) =>
      complete(input, resolvedDependencies, context),
    decideStudentSafeSource: (input: DecideStudentSafeSourceInput) =>
      decideStudentSafeSource(input, resolvedDependencies),
  });
};

export async function beginSourceUpload(
  input: BeginSourceUploadInput,
  dependencies: BookSourceUploadControlDependencies,
): Promise<SourceUploadBeginResult> {
  return begin(input, dependencies);
}

export async function completeSourceUpload(
  input: CompleteSourceUploadInput,
  dependencies: BookSourceUploadControlDependencies,
): Promise<SourceUploadVerifiedOperation> {
  return complete(input, dependencies);
}

export async function decideStudentSafeSourceVersion(
  input: DecideStudentSafeSourceInput,
  dependencies: BookSourceUploadControlDependencies,
): Promise<SourceUploadVerifiedOperation> {
  return decideStudentSafeSource(input, dependencies);
}

export const beginBookSourceUpload = beginSourceUpload;
export const completeBookSourceUpload = completeSourceUpload;
