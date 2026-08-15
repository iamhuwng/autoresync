import {
  FirebaseRtdbRestClient,
  type FirebaseRtdbAuthRequest,
  type RepositoryEnv,
} from '../listening-authoring/rtdb.ts';
import type {
  BookAssemblyPreviewApprovalRead,
  BookAssemblyPreviewApprovalRepository,
  BookAssemblyPreviewApprovalRevocationRecord,
  PreviewApprovalCreateStatus,
  PreviewApprovalRevokeStatus,
} from '../../../../src/services/book-assembly/previewApproval.repository.ts';
import type { BookAssemblyPreviewApprovalRecord } from '../../../../src/services/book-assembly/unitPreview.service.ts';

export const BOOK_ASSEMBLY_PREVIEW_APPROVAL_ROOT = 'book_assembly_preview_approvals/books';

const MAX_RETRIES = 5;
const MAX_RECORD_BYTES = 256 * 1024;
const MAX_CANONICAL_FINGERPRINTS = 500;
const PATH_ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;
// The service currently emits fnv1a64 values, but the durable contract keeps
// the algorithm provider-neutral while requiring a bounded opaque fingerprint.
const FINGERPRINT = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;

export type FirebasePreviewApprovalIdTokenProvider = (
  request?: FirebaseRtdbAuthRequest,
) => Promise<string>;

export interface BookAssemblyPreviewApprovalRepositoryEnv extends RepositoryEnv {}

export interface FirebaseRestBookAssemblyPreviewApprovalRepositoryOptions {
  readonly env: BookAssemblyPreviewApprovalRepositoryEnv;
  readonly fetchImpl?: typeof fetch;
  /** A caller-owned Firebase Auth ID token provider. No OAuth fallback exists. */
  readonly getIdToken?: FirebasePreviewApprovalIdTokenProvider;
  /** Explicit Firebase spelling used by some Worker composition seams. */
  readonly getFirebaseIdToken?: FirebasePreviewApprovalIdTokenProvider;
  /** Compatibility spelling used by the shared RTDB client. */
  readonly getFirebaseAuthToken?: FirebasePreviewApprovalIdTokenProvider;
  readonly maxRetries?: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const clone = <T>(value: T): T => structuredClone(value);

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stable(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
};

const jsonBytes = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).byteLength;

const exact = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
  error = 'invalid_book_assembly_preview_approval',
): Record<string, unknown> => {
  if (!isRecord(value)
    || required.some((key) => !(key in value))
    || Object.keys(value).some((key) => !required.includes(key) && !optional.includes(key))) {
    throw new Error(error);
  }
  return value;
};

const id = (value: unknown, error: string): string => {
  if (typeof value !== 'string' || !PATH_ID.test(value)) throw new Error(error);
  return value;
};

const revision = (value: unknown, error: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw new Error(error);
  return value as number;
};

const timestamp = (value: unknown, error: string): string => {
  if (typeof value !== 'string') throw new Error(error);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) throw new Error(error);
  return value;
};

const fingerprint = (value: unknown, error: string): string => {
  if (typeof value !== 'string' || !FINGERPRINT.test(value)) throw new Error(error);
  return value;
};

const assertRecordBytes = (value: unknown, error: string): void => {
  if (!Number.isFinite(jsonBytes(value)) || jsonBytes(value) > MAX_RECORD_BYTES) throw new Error(error);
};

const canonicalFingerprints = (value: unknown): Readonly<Record<string, string>> => {
  if (!isRecord(value) || Object.keys(value).length > MAX_CANONICAL_FINGERPRINTS) {
    throw new Error('invalid_book_assembly_preview_approval_fingerprints');
  }
  const result: Record<string, string> = {};
  for (const key of Object.keys(value).sort()) {
    id(key, 'invalid_book_assembly_preview_approval_activity_key');
    result[key] = fingerprint(value[key], 'invalid_book_assembly_preview_approval_fingerprint');
  }
  return result;
};

/** Validates and strips all fields outside the durable approval contract. */
export const assertBookAssemblyPreviewApprovalRecord = (
  value: unknown,
): BookAssemblyPreviewApprovalRecord => {
  const record = exact(value, [
    'approvalId', 'approvalRevision', 'actorId', 'bookId', 'bookRevision', 'unitKey',
    'candidateId', 'candidateRevision', 'sourceSetRevision', 'registryVersion',
    'inputFingerprint', 'canonicalActivityFingerprintsByKey', 'approvedAt', 'expiresAt',
  ]);
  const approvedAt = timestamp(record.approvedAt, 'invalid_book_assembly_preview_approval_time');
  const expiresAt = timestamp(record.expiresAt, 'invalid_book_assembly_preview_approval_time');
  if (Date.parse(expiresAt) <= Date.parse(approvedAt)) {
    throw new Error('invalid_book_assembly_preview_approval_time');
  }
  const result: BookAssemblyPreviewApprovalRecord = {
    approvalId: id(record.approvalId, 'invalid_book_assembly_preview_approval_id'),
    approvalRevision: revision(record.approvalRevision, 'invalid_book_assembly_preview_approval_revision'),
    actorId: id(record.actorId, 'invalid_book_assembly_preview_approval_actor'),
    bookId: id(record.bookId, 'invalid_book_assembly_preview_approval_book_id'),
    bookRevision: revision(record.bookRevision, 'invalid_book_assembly_preview_approval_book_revision'),
    unitKey: id(record.unitKey, 'invalid_book_assembly_preview_approval_unit_key'),
    candidateId: id(record.candidateId, 'invalid_book_assembly_preview_approval_candidate_id'),
    candidateRevision: revision(record.candidateRevision, 'invalid_book_assembly_preview_approval_candidate_revision'),
    sourceSetRevision: revision(record.sourceSetRevision, 'invalid_book_assembly_preview_approval_source_set_revision'),
    registryVersion: id(record.registryVersion, 'invalid_book_assembly_preview_approval_registry_version'),
    inputFingerprint: fingerprint(record.inputFingerprint, 'invalid_book_assembly_preview_approval_input_fingerprint'),
    canonicalActivityFingerprintsByKey: canonicalFingerprints(record.canonicalActivityFingerprintsByKey),
    approvedAt,
    expiresAt,
  };
  assertRecordBytes(result, 'book_assembly_preview_approval_too_large');
  return clone(result);
};

/** Validates the minimal immutable revocation marker; it cannot carry content. */
export const assertBookAssemblyPreviewApprovalRevocationRecord = (
  value: unknown,
): BookAssemblyPreviewApprovalRevocationRecord => {
  const record = exact(value, ['approvalId', 'bookId', 'unitKey', 'actorId', 'revokedAt'], [],
    'invalid_book_assembly_preview_approval_revocation');
  const result: BookAssemblyPreviewApprovalRevocationRecord = {
    approvalId: id(record.approvalId, 'invalid_book_assembly_preview_approval_id'),
    bookId: id(record.bookId, 'invalid_book_assembly_preview_approval_book_id'),
    unitKey: id(record.unitKey, 'invalid_book_assembly_preview_approval_unit_key'),
    actorId: id(record.actorId, 'invalid_book_assembly_preview_approval_actor'),
    revokedAt: timestamp(record.revokedAt, 'invalid_book_assembly_preview_approval_revoked_at'),
  };
  assertRecordBytes(result, 'book_assembly_preview_approval_revocation_too_large');
  return clone(result);
};

const approvalPath = (bookId: string, unitKey: string, approvalId: string): string => {
  id(bookId, 'invalid_book_assembly_preview_approval_book_id');
  id(unitKey, 'invalid_book_assembly_preview_approval_unit_key');
  id(approvalId, 'invalid_book_assembly_preview_approval_id');
  return `${BOOK_ASSEMBLY_PREVIEW_APPROVAL_ROOT}/${bookId}/units/${unitKey}/approvals/${approvalId}`;
};

const revocationPath = (bookId: string, unitKey: string, approvalId: string): string => (
  `${BOOK_ASSEMBLY_PREVIEW_APPROVAL_ROOT}/${id(bookId, 'invalid_book_assembly_preview_approval_book_id')}`
  + `/units/${id(unitKey, 'invalid_book_assembly_preview_approval_unit_key')}/revocations/`
  + id(approvalId, 'invalid_book_assembly_preview_approval_id')
);

const scopeMatches = (
  record: BookAssemblyPreviewApprovalRecord | BookAssemblyPreviewApprovalRevocationRecord,
  bookId: string,
  unitKey: string,
  approvalId: string,
): boolean => record.bookId === bookId && record.unitKey === unitKey && record.approvalId === approvalId;

const absent = (value: unknown): boolean => value === null || value === undefined;
type CreateOnlyStatus = 'created' | 'replayed' | 'conflict';

export class FirebaseRestBookAssemblyPreviewApprovalRepository
implements BookAssemblyPreviewApprovalRepository {
  private readonly rtdb: FirebaseRtdbRestClient;
  private readonly maxRetries: number;

  constructor(options: FirebaseRestBookAssemblyPreviewApprovalRepositoryOptions) {
    const tokenProvider = options.getIdToken
      ?? options.getFirebaseIdToken
      ?? options.getFirebaseAuthToken;
    if (!tokenProvider) throw new Error('missing_book_assembly_preview_approval_firebase_id_token_provider');
    this.maxRetries = options.maxRetries ?? MAX_RETRIES;
    if (!Number.isSafeInteger(this.maxRetries) || this.maxRetries < 1 || this.maxRetries > 10) {
      throw new Error('invalid_book_assembly_preview_approval_max_retries');
    }
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    // Deliberately bypass RepositoryEnv.readDatabaseValue: every Firebase call
    // must use the injected ID token and never an implicit OAuth/service key.
    this.rtdb = new FirebaseRtdbRestClient({
      env: { ...options.env, readDatabaseValue: undefined },
      fetchImpl,
      firebaseAuthToken: true,
      getFirebaseAuthToken: tokenProvider,
    });
  }

  async create(input: BookAssemblyPreviewApprovalRecord): Promise<PreviewApprovalCreateStatus> {
    const record = assertBookAssemblyPreviewApprovalRecord(input);
    return this.createOnly(
      approvalPath(record.bookId, record.unitKey, record.approvalId),
      record,
      (value) => assertBookAssemblyPreviewApprovalRecord(value),
    );
  }

  async revoke(input: BookAssemblyPreviewApprovalRevocationRecord): Promise<PreviewApprovalRevokeStatus> {
    const record = assertBookAssemblyPreviewApprovalRevocationRecord(input);
    return this.createOnly(
      revocationPath(record.bookId, record.unitKey, record.approvalId),
      record,
      (value) => assertBookAssemblyPreviewApprovalRevocationRecord(value),
    ).then((status) => status === 'created' ? 'revoked' : status);
  }

  async read(bookId: string, unitKey: string, approvalId: string): Promise<BookAssemblyPreviewApprovalRead> {
    const approvalChildPath = approvalPath(bookId, unitKey, approvalId);
    const revocationChildPath = revocationPath(bookId, unitKey, approvalId);
    const [approvalRaw, revocationRaw] = await Promise.all([
      this.rtdb.readValue(approvalChildPath),
      this.rtdb.readValue(revocationChildPath),
    ]);
    const approval = absent(approvalRaw) ? null : assertBookAssemblyPreviewApprovalRecord(approvalRaw);
    const revocation = absent(revocationRaw)
      ? null
      : assertBookAssemblyPreviewApprovalRevocationRecord(revocationRaw);
    if (approval && !scopeMatches(approval, bookId, unitKey, approvalId)) {
      throw new Error('book_assembly_preview_approval_scope_mismatch');
    }
    if (revocation && !scopeMatches(revocation, bookId, unitKey, approvalId)) {
      throw new Error('book_assembly_preview_approval_revocation_scope_mismatch');
    }
    return { approval: clone(approval), revocation: clone(revocation) };
  }

  private async createOnly<T>(
    path: string,
    value: T,
    parse: (value: unknown) => T,
  ): Promise<CreateOnlyStatus> {
    for (let attempt = 0; attempt < this.maxRetries; attempt += 1) {
      const current = await this.rtdb.readWithEtag<unknown>(path);
      if (!absent(current.data)) {
        const existing = parse(current.data);
        return stable(existing) === stable(value) ? 'replayed' : 'conflict';
      }
      if (await this.rtdb.writeIfMatch(path, value, current.etag)) return 'created';
    }
    throw new Error('book_assembly_preview_approval_cas_retries_exhausted');
  }
}

/** Descriptive alias for code that omits the REST transport detail. */
export const FirebaseBookAssemblyPreviewApprovalRepository =
  FirebaseRestBookAssemblyPreviewApprovalRepository;

export const createFirebaseBookAssemblyPreviewApprovalRepository = (
  options: FirebaseRestBookAssemblyPreviewApprovalRepositoryOptions,
): BookAssemblyPreviewApprovalRepository => new FirebaseRestBookAssemblyPreviewApprovalRepository(options);
