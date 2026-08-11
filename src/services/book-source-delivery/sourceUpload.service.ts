import type {
  BookSourceUploadAccountState,
  BookSourceChecksum,
  BookSourceUploadKind,
  BookSourceUploadOperation,
  BookSourceVersionStorageIdentity,
} from '../../types/bookSource.types';
import { BOOK_SOURCE_MAX_PDF_BYTES } from '../../types/bookSource.types';
import { normalizeBookSourceDisplayFilename } from './sourceDisplayFilename.service';
import {
  SourceUploadConflictError,
  type CompleteSourceUploadInput as RepositoryCompleteSourceUploadInput,
  type ReserveSourceUploadInput,
  type SourceUploadRtdbRepository,
} from './sourceUpload.rtdbRepository';
import type { SourceUploadInspectionClaim } from './sourceUpload.protocol';
import { createBookSourceVersionStorageIdentity } from './sourceVersion.service';
import type { BookSourceRecoveryContext } from './sourceRecovery.adapter';

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

/** Provider-neutral trusted seam; concrete #27 adapters conform structurally. */
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
  verifyCompletedObject(input: {
    readonly expected: BookSourceVersionStorageIdentity;
  }): Promise<SourceUploadProviderObjectMetadata>;
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
const BEGIN_KEYS = ['actorId', 'bookId', 'idempotencyKey', 'sourceKey', 'kind', 'claim'] as const;
const COMPLETE_KEYS = ['actorId', 'bookId', 'reservationId', 'providerFileId', 'providerFileVersionId'] as const;

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

export interface SourceUploadBookManagementAuthority {
  readonly canManageBookSource?: (input: { readonly actorId: string; readonly bookId: string }) => boolean | Promise<boolean>;
  readonly authorize?: (input: { readonly actorId: string; readonly bookId: string }) => boolean | Promise<boolean>;
}

export interface SourceUploadRolloutGate {
  readonly isUploadAllowed?: () => boolean | Promise<boolean>;
  readonly authorizeUpload?: () =>
    | boolean
    | { readonly decision: { readonly allowed: boolean } }
    | Promise<boolean | { readonly decision: { readonly allowed: boolean } }>;
  readonly evaluate?: (operation: 'upload') => { readonly allowed: boolean } | boolean;
}

export interface SourceUploadDeploymentConfig {
  readonly accountId: string;
  readonly storageLocationId: string;
  readonly providerKind: string;
  readonly privateBucketId: string;
  readonly objectKeyPrefix?: string;
}

export type SourceUploadAccountStateReader =
  | { readonly read: (accountId: string) => BookSourceUploadAccountState | null | Promise<BookSourceUploadAccountState | null> }
  | { readonly readAccountState: (accountId: string) => BookSourceUploadAccountState | null | Promise<BookSourceUploadAccountState | null> }
  | ((accountId: string) => BookSourceUploadAccountState | null | Promise<BookSourceUploadAccountState | null>);

export interface SourceUploadClock {
  readonly now: () => Date;
}

export interface SourceUploadControlDependencies {
  readonly bookManagementAuthority?: SourceUploadBookManagementAuthority;
  readonly bookAccess?: SourceUploadBookManagementAuthority;
  readonly bookManagement?: SourceUploadBookManagementAuthority;
  readonly rolloutGate: SourceUploadRolloutGate;
  readonly deployment?: SourceUploadDeploymentConfig;
  readonly deploymentConfig?: SourceUploadDeploymentConfig;
  readonly accountStateReader?: SourceUploadAccountStateReader;
  readonly trustedAccountStateReader?: SourceUploadAccountStateReader;
  readonly repository?: Pick<SourceUploadRtdbRepository, 'reserve' | 'completeVerified'>;
  readonly sourceUploadRepository?: Pick<SourceUploadRtdbRepository, 'reserve' | 'completeVerified'>;
  readonly provider?: SourceUploadProviderPort;
  readonly sourceProvider?: SourceUploadProviderPort;
  /** Worker-memory cache for short-lived exact replay authorities only. */
  readonly authorizationCache?: Map<string, SourceUploadBeginResult>;
  readonly clock?: SourceUploadClock | (() => Date);
  readonly reservationTtlMs?: number;
  /** Canonical recovery never creates a new upload or verifies provider bytes. */
  readonly recoveryContext?: BookSourceRecoveryContext;
}

export interface BeginSourceUploadInput {
  readonly actorId: string;
  readonly bookId: string;
  readonly idempotencyKey: string;
  readonly sourceKey: string;
  readonly kind: BookSourceUploadKind;
  readonly claim: SourceUploadInspectionClaim;
}

export interface SourceUploadBeginResult {
  readonly status: 'reserved' | 'replayed';
  readonly uploadUrl: string;
  readonly expiresAt: string;
  readonly requiredHeaders: Readonly<Record<string, string>>;
  readonly reservationId: string;
  readonly sourceVersionId: string;
}

export interface CompleteSourceUploadInput {
  readonly actorId: string;
  readonly bookId: string;
  readonly reservationId: string;
  readonly providerFileId: string;
  readonly providerFileVersionId: string;
}

/** Browser-safe immutable completion projection. Storage authority is omitted. */
export interface SourceUploadVerifiedOperation {
  readonly reservationId: string;
  readonly bookId: string;
  readonly sourceVersionId: string;
  readonly sourceKey: string;
  readonly kind: BookSourceUploadKind;
  readonly status: 'verified_completed';
  readonly completedAt: string;
}

export interface SourceUploadControl {
  readonly begin: (input: BeginSourceUploadInput) => Promise<SourceUploadBeginResult>;
  readonly complete: (input: CompleteSourceUploadInput) => Promise<SourceUploadVerifiedOperation>;
}

type ResolvedDependencies = {
  readonly authority: SourceUploadBookManagementAuthority;
  readonly rolloutGate: SourceUploadRolloutGate;
  readonly deployment: SourceUploadDeploymentConfig & { readonly objectKeyPrefix: string };
  readonly accountStateReader: SourceUploadAccountStateReader;
  readonly repository: Pick<SourceUploadRtdbRepository, 'reserve' | 'completeVerified'>;
  readonly provider: SourceUploadProviderPort;
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
  assertExactRecord(value, BEGIN_KEYS, 'invalid_input');
  assertSafeIdentifier(value.actorId);
  assertSafeIdentifier(value.bookId);
  if (typeof value.idempotencyKey !== 'string' || !UUID.test(value.idempotencyKey)) {
    throw new SourceUploadControlError('invalid_input');
  }
  assertSafeIdentifier(value.sourceKey);
  if (value.kind !== 'initial' && value.kind !== 'replacement') throw new SourceUploadControlError('invalid_input');
  assertClaim(value.claim);
};

const assertCompleteInput = (value: CompleteSourceUploadInput): void => {
  assertExactRecord(value, COMPLETE_KEYS, 'invalid_input');
  assertSafeIdentifier(value.actorId);
  assertSafeIdentifier(value.bookId);
  assertSafeIdentifier(value.reservationId);
  assertSafeIdentifier(value.providerFileId);
  assertSafeIdentifier(value.providerFileVersionId);
};

function assertClaim(value: unknown): asserts value is SourceUploadInspectionClaim {
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
      || value.exactByteSize > BOOK_SOURCE_MAX_PDF_BYTES
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

const resolveDependencies = (input: SourceUploadControlDependencies): ResolvedDependencies => {
  const authority = input.bookManagementAuthority ?? input.bookAccess ?? input.bookManagement;
  const deployment = input.deployment ?? input.deploymentConfig;
  const accountStateReader = input.accountStateReader ?? input.trustedAccountStateReader;
  const repository = input.repository ?? input.sourceUploadRepository;
  const provider = input.provider ?? input.sourceProvider;
  if (!authority || (!authority.canManageBookSource && !authority.authorize)
    || !deployment || !accountStateReader || !repository || !provider) {
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
  const clock = typeof input.clock === 'function' ? input.clock : input.clock?.now;
  if (!clock) throw new SourceUploadControlError('invalid_deployment');
  return {
    authority,
    rolloutGate: input.rolloutGate,
    deployment: Object.freeze({ ...deployment, objectKeyPrefix }),
    accountStateReader,
    repository,
    provider,
    authorizationCache: input.authorizationCache ?? new Map<string, SourceUploadBeginResult>(),
    clock,
    reservationTtlMs,
  };
};

const readAccountState = async (reader: SourceUploadAccountStateReader, accountId: string): Promise<BookSourceUploadAccountState> => {
  try {
    const value = typeof reader === 'function'
      ? await reader(accountId)
      : 'read' in reader ? await reader.read(accountId) : await reader.readAccountState(accountId);
    if (!value || !Number.isSafeInteger(value.revision) || value.revision < 0 || !value.operations) {
      throw new SourceUploadControlError('account_state_unavailable');
    }
    return value;
  } catch (error) {
    if (error instanceof SourceUploadControlError) throw error;
    throw new SourceUploadControlError('account_state_unavailable');
  }
};

const authorizeBook = async (authority: SourceUploadBookManagementAuthority, actorId: string, bookId: string): Promise<void> => {
  try {
    const result = authority.canManageBookSource
      ? await authority.canManageBookSource({ actorId, bookId })
      : await authority.authorize!({ actorId, bookId });
    if (result !== true) throw new SourceUploadControlError('authority_denied');
  } catch (error) {
    if (error instanceof SourceUploadControlError) throw error;
    throw new SourceUploadControlError('authority_denied');
  }
};

const assertUploadGate = async (gate: SourceUploadRolloutGate): Promise<void> => {
  try {
    if (gate.authorizeUpload) {
      const result = await gate.authorizeUpload();
      const allowed = result === true
        || (isPlainRecord(result)
          && isPlainRecord(result.decision)
          && result.decision.allowed === true);
      if (!allowed) throw new SourceUploadControlError('rollout_denied');
      return;
    }
    if (gate.isUploadAllowed) {
      if ((await gate.isUploadAllowed()) !== true) throw new SourceUploadControlError('rollout_denied');
      return;
    }
    if (gate.evaluate) {
      const result = gate.evaluate('upload');
      if ((typeof result === 'boolean' ? result : result.allowed) !== true) {
        throw new SourceUploadControlError('rollout_denied');
      }
      return;
    }
  } catch (error) {
    if (error instanceof SourceUploadControlError) throw error;
    throw new SourceUploadControlError('rollout_denied');
  }
  throw new SourceUploadControlError('rollout_denied');
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

/** Small deterministic digest; UUID entropy remains the trusted request identity. */
const stableDigest = (value: string): string => {
  let left = 0x811c9dc5;
  let right = 0x9e3779b1;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    left = Math.imul(left ^ code, 0x01000193) >>> 0;
    right = Math.imul(right ^ (code + index), 0x85ebca6b) >>> 0;
  }
  return `${left.toString(16).padStart(8, '0')}${right.toString(16).padStart(8, '0')}`;
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
    reservationId: `reservation-${digest}`,
    sourceVersionId: `source-version-${stableDigest(`${input.bookId}\u0000${input.actorId}\u0000${key}`)}`,
    providerObjectKey: `${objectKeyPrefix}${input.actorId}/${input.bookId}/${digest}.pdf`,
  });
};

const sameRequest = (operation: BookSourceUploadOperation, input: BeginSourceUploadInput): boolean =>
  operation.bookId === input.bookId
  && operation.ownerId === input.actorId
  && operation.sourceKey === input.sourceKey
  && operation.kind === input.kind
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

const sameIdentity = (left: BookSourceVersionStorageIdentity, right: BookSourceVersionStorageIdentity): boolean =>
  left.bookId === right.bookId
  && left.sourceVersionId === right.sourceVersionId
  && left.storageLocationId === right.storageLocationId
  && left.providerKind === right.providerKind
  && left.privateBucketId === right.privateBucketId
  && left.providerObjectKey === right.providerObjectKey
  && left.providerFileId === right.providerFileId
  && left.providerFileVersionId === right.providerFileVersionId
  && left.byteSize === right.byteSize
  && left.checksum.algorithm === right.checksum.algorithm
  && left.checksum.value === right.checksum.value;

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
    status: 'verified_completed',
    completedAt: operation.completedAt,
  });
};

const providerIdentity = async (
  provider: SourceUploadProviderPort,
  expected: BookSourceVersionStorageIdentity,
  input: CompleteSourceUploadInput,
): Promise<BookSourceVersionStorageIdentity> => {
  let result: SourceUploadProviderObjectMetadata;
  try {
    result = await provider.verifyCompletedObject({ expected });
  } catch (error) {
    throw providerError(error);
  }
  if (!isPlainRecord(result)) throw new SourceUploadControlError('provider_metadata_mismatch');
  if (result.contentType !== PDF_CONTENT_TYPE) throw new SourceUploadControlError('provider_not_pdf');
  let identity: BookSourceVersionStorageIdentity;
  try {
    const candidate = result.identity as unknown as Record<string, unknown>;
    if (candidate.providerFileId !== input.providerFileId
      || candidate.providerFileVersionId !== input.providerFileVersionId) {
      throw new SourceUploadControlError('provider_identity_mismatch');
    }
    identity = createBookSourceVersionStorageIdentity(candidate);
  } catch (error) {
    if (error instanceof SourceUploadControlError) throw error;
    throw new SourceUploadControlError('provider_metadata_mismatch');
  }
  if (!sameIdentity(identity, expected)) throw new SourceUploadControlError('provider_identity_mismatch');
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

const begin = async (input: BeginSourceUploadInput, dependencies: SourceUploadControlDependencies): Promise<SourceUploadBeginResult> => {
  assertBeginInput(input);
  const resolved = resolveDependencies(dependencies);
  if (dependencies.recoveryContext) throw new SourceUploadControlError('recovery_suppressed');
  await authorizeBook(resolved.authority, input.actorId, input.bookId);
  await assertUploadGate(resolved.rolloutGate);
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
    if (existing.status === 'verified_completed') {
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
      storageLocationId: existing.storageLocationId,
      providerKind: existing.providerKind,
      privateBucketId: existing.privateBucketId,
      providerObjectKey: existing.providerObjectKey,
      kind: existing.kind,
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
    storageLocationId: resolved.deployment.storageLocationId,
    providerKind: resolved.deployment.providerKind,
    privateBucketId: resolved.deployment.privateBucketId,
    providerObjectKey: identity.providerObjectKey,
    kind: input.kind,
    byteSize: input.claim.exactByteSize,
    originalFilename: input.claim.displayFilename,
    expectedChecksum: { algorithm: 'sha-256', value: input.claim.sha256Hex.toLowerCase() },
    createdAt: createdAt.toISOString(),
    expiresAt,
  };
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
  const authorized = await providerAuthorization(resolved.provider, reservation, 'reserved', createdAt);
  cacheAuthorization(resolved.authorizationCache, identity.reservationId, authorized, createdAt.getTime());
  return authorized;
};

const complete = async (input: CompleteSourceUploadInput, dependencies: SourceUploadControlDependencies): Promise<SourceUploadVerifiedOperation> => {
  assertCompleteInput(input);
  const resolved = resolveDependencies(dependencies);
  if (dependencies.recoveryContext) throw new SourceUploadControlError('recovery_suppressed');
  await authorizeBook(resolved.authority, input.actorId, input.bookId);
  const state = await readAccountState(resolved.accountStateReader, resolved.deployment.accountId);
  const operation = state.operations[input.reservationId];
  if (!operation || operation.bookId !== input.bookId || operation.ownerId !== input.actorId) {
    throw new SourceUploadControlError('reservation_not_found');
  }
  if (operation.status === 'released') throw new SourceUploadControlError('reservation_released');
  if (operation.status === 'cleanup_pending') throw new SourceUploadControlError('cleanup_pending');
  let expected: BookSourceVersionStorageIdentity;
  try {
    expected = createBookSourceVersionStorageIdentity({
      bookId: operation.bookId,
      sourceVersionId: operation.sourceVersionId,
      storageLocationId: operation.storageLocationId,
      providerKind: operation.providerKind,
      privateBucketId: operation.privateBucketId,
      providerObjectKey: operation.providerObjectKey,
      providerFileId: input.providerFileId,
      providerFileVersionId: input.providerFileVersionId,
      checksum: operation.expectedChecksum,
      byteSize: operation.byteSize,
    });
  } catch {
    throw new SourceUploadControlError('account_state_unavailable');
  }
  if (operation.status === 'verified_completed') {
    let storedIdentity: BookSourceVersionStorageIdentity;
    try {
      storedIdentity = createBookSourceVersionStorageIdentity(operation.verifiedStorage);
    } catch {
      throw new SourceUploadControlError('account_state_unavailable');
    }
    if (!sameIdentity(storedIdentity, expected)) {
      throw new SourceUploadControlError('provider_identity_mismatch');
    }
    return verifiedProjection(operation);
  }
  const verifiedStorage = await providerIdentity(resolved.provider, expected, input);
  const verifiedAt = nowIso(resolved.clock).toISOString();
  let completedState: BookSourceUploadAccountState;
  try {
    const completion: RepositoryCompleteSourceUploadInput = {
      accountId: resolved.deployment.accountId,
      expectedRevision: state.revision,
      reservationId: operation.reservationId,
      verifiedStorage,
      verifiedAt,
    };
    completedState = await resolved.repository.completeVerified(completion);
  } catch (error) {
    throw completeRepositoryError(error);
  }
  const completed = completedState.operations[input.reservationId];
  if (!completed || completed.status !== 'verified_completed') throw new SourceUploadControlError('reservation_conflict');
  return verifiedProjection(completed);
};

export const createSourceUploadControl = (dependencies: SourceUploadControlDependencies): SourceUploadControl => {
  const authorizationCache = dependencies.authorizationCache ?? new Map<string, SourceUploadBeginResult>();
  const resolvedDependencies = { ...dependencies, authorizationCache };
  return Object.freeze({
    begin: (input: BeginSourceUploadInput) => begin(input, resolvedDependencies),
    complete: (input: CompleteSourceUploadInput) => complete(input, resolvedDependencies),
  });
};

export async function beginSourceUpload(
  input: BeginSourceUploadInput,
  dependencies: SourceUploadControlDependencies,
): Promise<SourceUploadBeginResult> {
  return begin(input, dependencies);
}

export async function completeSourceUpload(
  input: CompleteSourceUploadInput,
  dependencies: SourceUploadControlDependencies,
): Promise<SourceUploadVerifiedOperation> {
  return complete(input, dependencies);
}

export const beginBookSourceUpload = beginSourceUpload;
export const completeBookSourceUpload = completeSourceUpload;
