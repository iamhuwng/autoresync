import { SignJWT, importPKCS8 } from 'jose';
import { FirebaseRtdbRestClient, type RepositoryEnv } from '../listening-authoring/rtdb.ts';
import type {
  BookAssemblyCandidateRecord,
  BookAssemblyMutationResult,
} from '../../../../src/services/book-assembly/unitAssembly.types.ts';

export const BOOK_ASSEMBLY_ROOT = 'book_assembly/books';
const MAX_RETRIES = 5;
const MAX_CANDIDATES_PER_SCOPE = 8;
const MAX_OPERATIONS_PER_SCOPE = 32;
const MAX_SCOPE_BYTES = 2 * 1024 * 1024;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;
const OPERATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const OAUTH2_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FIREBASE_SCOPES = [
  'https://www.googleapis.com/auth/firebase.database',
  'https://www.googleapis.com/auth/datastore',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

export interface BookAssemblyRepositoryEnv extends RepositoryEnv {
  BOOK_ASSEMBLY_SERVICE_IDENTITY?: string;
  BOOK_ASSEMBLY_GOOGLE_SA_KEY?: string;
}

export interface BookAssemblyCurrentPointer {
  readonly candidateId: string;
  readonly candidateRevision: number;
  readonly bookRevision: number;
  readonly sourceSetRevision: number;
  readonly updatedAt: string;
}

export interface BookAssemblyScope {
  current?: BookAssemblyCurrentPointer;
  candidates?: Record<string, BookAssemblyCandidateRecord>;
  operations?: Record<string, {
    ownerId: string;
    fingerprint: string;
    result: BookAssemblyMutationResult;
    createdAt: string;
  }>;
}

interface ServiceAccountKey { client_email: string; private_key: string }
interface TokenResponse { access_token: string; expires_in?: number }

const clone = <T>(value: T): T => structuredClone(value);
const bytes = (value: unknown): number =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength;
const assertId = (value: unknown, label: string): asserts value is string => {
  if (typeof value !== 'string' || !ID.test(value)) throw new Error(`invalid_book_assembly_${label}`);
};
const assertOperationId = (value: unknown): asserts value is string => {
  if (typeof value !== 'string' || !OPERATION_ID.test(value)) {
    throw new Error('invalid_book_assembly_operation_id');
  }
};
const scopePath = (bookId: string, unitKey: string): string => {
  assertId(bookId, 'book_id');
  assertId(unitKey, 'unit_key');
  return `${BOOK_ASSEMBLY_ROOT}/${bookId}/units/${unitKey}`;
};

const tokenProvider = (
  keyJson: string,
  identity: string,
  fetchImpl: typeof fetch,
): (() => Promise<string>) => {
  let key: ServiceAccountKey;
  try { key = JSON.parse(keyJson) as ServiceAccountKey; }
  catch { throw new Error('invalid_book_assembly_google_sa_key'); }
  if (!key.client_email || !key.private_key || key.client_email !== identity) {
    throw new Error('book_assembly_service_identity_mismatch');
  }
  let cached = '';
  let expiresAt = 0;
  return async () => {
    if (cached && Date.now() < expiresAt - 300_000) return cached;
    const now = Math.floor(Date.now() / 1000);
    const assertion = await new SignJWT({
      iss: key.client_email, sub: key.client_email, aud: OAUTH2_TOKEN_URL,
      iat: now, exp: now + 3600, scope: FIREBASE_SCOPES,
    }).setProtectedHeader({ alg: 'RS256' })
      .sign(await importPKCS8(key.private_key, 'RS256'));
    const response = await fetchImpl(OAUTH2_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${assertion}`,
    });
    if (!response.ok) throw new Error(`book_assembly_google_oauth_failed:${response.status}`);
    const body = JSON.parse(await response.text()) as TokenResponse;
    if (!body.access_token) throw new Error('book_assembly_google_oauth_failed:invalid_response');
    cached = body.access_token;
    expiresAt = Date.now() + Math.max(0, (body.expires_in ?? 3600) * 1000);
    return cached;
  };
};

const validCandidate = (
  value: unknown,
  expectedId: string,
  bookId: string,
  unitKey: string,
): value is BookAssemblyCandidateRecord => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as BookAssemblyCandidateRecord;
  return record.candidateId === expectedId
    && record.bookId === bookId
    && record.unitKey === unitKey
    && ID.test(record.candidateId)
    && ID.test(record.ownerId)
    && Number.isSafeInteger(record.bookRevision) && record.bookRevision >= 0
    && Number.isSafeInteger(record.sourceSetRevision) && record.sourceSetRevision >= 0
    && Number.isSafeInteger(record.revision) && record.revision >= 1
    && (record.lifecycle === 'draft' || record.lifecycle === 'validated' || record.lifecycle === 'discarded')
    && typeof record.updatedAt === 'string'
    && !!record.validation
    && typeof record.validation === 'object'
    && Array.isArray(record.validation.errors);
};

const parseScope = (value: unknown, bookId: string, unitKey: string): BookAssemblyScope => {
  if (value === null || value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || bytes(value) > MAX_SCOPE_BYTES) throw new Error('invalid_book_assembly_scope');
  const source = value as Record<string, unknown>;
  if (Object.keys(source).some((key) => !['current', 'candidates', 'operations'].includes(key))) {
    throw new Error('invalid_book_assembly_scope');
  }
  const candidates: Record<string, BookAssemblyCandidateRecord> = {};
  const rawCandidates = source.candidates;
  if (rawCandidates !== undefined) {
    if (!rawCandidates || typeof rawCandidates !== 'object' || Array.isArray(rawCandidates)) {
      throw new Error('invalid_book_assembly_candidates');
    }
    const entries = Object.entries(rawCandidates);
    if (entries.length > MAX_CANDIDATES_PER_SCOPE) throw new Error('book_assembly_candidate_capacity_exceeded');
    for (const [id, candidate] of entries) {
      if (!validCandidate(candidate, id, bookId, unitKey)) {
        throw new Error('invalid_book_assembly_candidate');
      }
      candidates[id] = clone(candidate);
    }
  }
  const operations: NonNullable<BookAssemblyScope['operations']> = {};
  const rawOperations = source.operations;
  if (rawOperations !== undefined) {
    if (!rawOperations || typeof rawOperations !== 'object' || Array.isArray(rawOperations)) {
      throw new Error('invalid_book_assembly_operations');
    }
    const entries = Object.entries(rawOperations);
    if (entries.length > MAX_OPERATIONS_PER_SCOPE) throw new Error('book_assembly_operation_capacity_exceeded');
    for (const [id, operation] of entries) {
      assertOperationId(id);
      if (!operation || typeof operation !== 'object' || Array.isArray(operation)) {
        throw new Error('invalid_book_assembly_operation');
      }
      const candidate = operation as Record<string, unknown>;
      if (typeof candidate.ownerId !== 'string'
        || typeof candidate.fingerprint !== 'string'
        || typeof candidate.createdAt !== 'string'
        || !candidate.result || typeof candidate.result !== 'object') {
        throw new Error('invalid_book_assembly_operation');
      }
      operations[id] = clone(operation) as NonNullable<BookAssemblyScope['operations']>[string];
    }
  }
  let current: BookAssemblyCurrentPointer | undefined;
  if (source.current !== undefined) {
    const pointer = source.current as Record<string, unknown>;
    if (!ID.test(String(pointer.candidateId ?? ''))
      || !Number.isSafeInteger(pointer.candidateRevision)
      || !Number.isSafeInteger(pointer.bookRevision)
      || !Number.isSafeInteger(pointer.sourceSetRevision)
      || typeof pointer.updatedAt !== 'string') {
      throw new Error('invalid_book_assembly_current_pointer');
    }
    current = clone(pointer) as BookAssemblyCurrentPointer;
  }
  if (current && !candidates[current.candidateId]) {
    throw new Error('book_assembly_current_candidate_missing');
  }
  return {
    current,
    candidates: Object.keys(candidates).length ? candidates : undefined,
    operations: Object.keys(operations).length ? operations : undefined,
  };
};

export class FirebaseRestBookAssemblyRepository {
  private readonly rtdb: FirebaseRtdbRestClient;

  constructor(private readonly options: {
    env: BookAssemblyRepositoryEnv;
    fetchImpl?: typeof fetch;
    getAccessToken?: () => Promise<string>;
    maxRetries?: number;
  }) {
    const identity = options.env.BOOK_ASSEMBLY_SERVICE_IDENTITY?.trim();
    if (!identity) throw new Error('missing_book_assembly_service_identity');
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    const keyJson = options.env.BOOK_ASSEMBLY_GOOGLE_SA_KEY?.trim();
    if (!keyJson && !options.getAccessToken) {
      throw new Error('missing_book_assembly_google_sa_key');
    }
    this.rtdb = new FirebaseRtdbRestClient({
      env: { ...options.env, GOOGLE_SA_KEY: keyJson },
      fetchImpl,
      getAccessToken: options.getAccessToken
        ?? tokenProvider(keyJson!, identity, fetchImpl),
    });
  }

  async readScope(bookId: string, unitKey: string): Promise<BookAssemblyScope> {
    return parseScope(await this.rtdb.readWithEtag<unknown>(scopePath(bookId, unitKey)).then((value) => value.data), bookId, unitKey);
  }

  async readValue(path: string): Promise<unknown> {
    if (!/^users\/[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u.test(path)) {
      throw new Error('book_assembly_path_forbidden');
    }
    return this.rtdb.readValue(path);
  }

  async transaction<T>(
    bookId: string,
    unitKey: string,
    mutate: (current: BookAssemblyScope) => {
      outcome: T;
      next?: BookAssemblyScope;
      write: boolean;
    },
    options: { beforeWrite?: () => Promise<void> } = {},
  ): Promise<T> {
    const path = scopePath(bookId, unitKey);
    for (let attempt = 0; attempt < (this.options.maxRetries ?? MAX_RETRIES); attempt += 1) {
      const current = await this.rtdb.readWithEtag<unknown>(path);
      const parsed = parseScope(current.data, bookId, unitKey);
      const mutation = mutate(parsed);
      if (!mutation.write) return mutation.outcome;
      await options.beforeWrite?.();
      const next = parseScope(mutation.next ?? {}, bookId, unitKey);
      if (await this.rtdb.writeIfMatch(path, next, current.etag)) return mutation.outcome;
    }
    throw new Error('book_assembly_scope_cas_retries_exhausted');
  }
}
