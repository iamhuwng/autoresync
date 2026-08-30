import {
  FirebaseRtdbRestClient,
  type FirebaseRtdbAuthRequest,
  type RepositoryEnv,
} from '../listening-authoring/rtdb.ts';
import { createFirebaseClaimTokenProvider } from '../book-activity-authoring/firebase-token.ts';
import type {
  BookAssemblyCandidateRecord,
  BookAssemblyMutationResult,
} from '../../../../src/services/book-assembly/unitAssembly.types.ts';

export const BOOK_ASSEMBLY_ROOT = 'book_assembly/books';
const MAX_RETRIES = 5;
export const BOOK_ASSEMBLY_MAX_CANDIDATES_PER_SCOPE = 32;
const MAX_OPERATIONS_PER_SCOPE = 32;
const MAX_SCOPE_BYTES = 2 * 1024 * 1024;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;
const OPERATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

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

/**
 * RTDB drops null object properties and empty arrays. Restore only the two
 * domain fields affected by that wire encoding while hydrating a scope.
 */
const hydrateCandidate = (value: unknown): unknown => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const candidate = value as Record<string, unknown>;
  const hydrated: Record<string, unknown> = { ...candidate };
  const manifest = candidate.manifest;
  if (manifest && typeof manifest === 'object' && !Array.isArray(manifest)) {
    const manifestRecord = manifest as Record<string, unknown>;
    const nodes = manifestRecord.nodes;
    if (Array.isArray(nodes)) {
      hydrated.manifest = {
        ...manifestRecord,
        nodes: nodes.map((node) => {
          if (!node || typeof node !== 'object' || Array.isArray(node)) return node;
          const nodeRecord = node as Record<string, unknown>;
          return Object.hasOwn(nodeRecord, 'parentNodeKey')
            ? nodeRecord
            : { ...nodeRecord, parentNodeKey: null };
        }),
      };
    }
  }
  const validation = candidate.validation;
  if (validation && typeof validation === 'object' && !Array.isArray(validation)) {
    const validationRecord = validation as Record<string, unknown>;
    if (!Object.hasOwn(validationRecord, 'errors') && validationRecord.valid === true) {
      hydrated.validation = { ...validationRecord, errors: [] };
    }
  }
  return hydrated;
};

const candidateScopeFromPath = (path: string): {
  readonly bookId: string;
  readonly unitKey: string;
} | null => {
  const match = /^book_assembly\/books\/([^/]+)\/units\/([^/]+)$/u.exec(path);
  if (!match || !ID.test(match[1]!) || !ID.test(match[2]!)) return null;
  return { bookId: match[1]!, unitKey: match[2]! };
};

const ownerProfileScope = {
  // The users/$ownerId rule does not inspect book/unit claims. Keep profile
  // auth's claim tuple distinct from every real candidate scope nonetheless.
  bookId: 'owner-profile',
  unitKey: 'owner-profile',
} as const;

const authScopeFromPath = (
  path: string,
  ownerId: string,
): { readonly bookId: string; readonly unitKey: string } | null => (
  candidateScopeFromPath(path)
  ?? (path === `users/${ownerId}` ? ownerProfileScope : null)
);

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

const parseScope = (
  value: unknown,
  bookId: string,
  unitKey: string,
  options: { hydrate?: boolean } = {},
): BookAssemblyScope => {
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
    if (entries.length > BOOK_ASSEMBLY_MAX_CANDIDATES_PER_SCOPE) throw new Error('book_assembly_candidate_capacity_exceeded');
    for (const [id, candidate] of entries) {
      const hydratedCandidate = options.hydrate ? hydrateCandidate(candidate) : candidate;
      if (!validCandidate(hydratedCandidate, id, bookId, unitKey)) {
        throw new Error('invalid_book_assembly_candidate');
      }
      candidates[id] = clone(hydratedCandidate);
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
      const hydratedOperation = options.hydrate ? clone(operation) as Record<string, unknown> : operation;
      if (options.hydrate) {
        const result = hydratedOperation.result;
        if (result && typeof result === 'object' && !Array.isArray(result)) {
          const resultRecord = result as Record<string, unknown>;
          if (Object.hasOwn(resultRecord, 'candidate')) {
            hydratedOperation.result = {
              ...resultRecord,
              candidate: hydrateCandidate(resultRecord.candidate),
            };
          }
        }
      }
      operations[id] = clone(hydratedOperation) as NonNullable<BookAssemblyScope['operations']>[string];
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
    /** Server-authenticated owner. Never derive this from request payload. */
    ownerId?: string;
    getAccessToken?: () => Promise<string>;
    /** Injectable Firebase ID-token seam for tests and trusted callers. */
    getFirebaseAuthToken?: (request?: FirebaseRtdbAuthRequest) => Promise<string>;
    maxRetries?: number;
  }) {
    const identity = options.env.BOOK_ASSEMBLY_SERVICE_IDENTITY?.trim();
    if (!identity) throw new Error('missing_book_assembly_service_identity');
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    const keyJson = options.env.BOOK_ASSEMBLY_GOOGLE_SA_KEY?.trim();
    const ownerId = options.ownerId?.trim();
    if (!ownerId) throw new Error('missing_book_assembly_owner_context');
    if (!ID.test(ownerId)) throw new Error('invalid_book_assembly_owner_context');
    if (!keyJson && !options.getAccessToken && !options.getFirebaseAuthToken) {
      throw new Error('missing_book_assembly_google_sa_key');
    }
    const injectedFirebaseAuthToken = options.getFirebaseAuthToken ?? options.getAccessToken;
    const mintFirebaseAuthToken = injectedFirebaseAuthToken ?? (() => {
      const apiKey = options.env.FIREBASE_WEB_API_KEY?.trim();
      if (!apiKey) throw new Error('missing_book_assembly_firebase_web_api_key');
      const projectId = options.env.FIREBASE_PROJECT_ID?.trim();
      if (!projectId) throw new Error('missing_book_assembly_firebase_project_id');
      const provider = createFirebaseClaimTokenProvider({
        serviceAccountJson: keyJson!,
        serviceIdentity: identity,
        firebaseProjectId: projectId,
        firebaseWebApiKey: apiKey,
        fetchImpl,
      });
      return async (request: FirebaseRtdbAuthRequest = { path: '' }): Promise<string> => {
        const scope = authScopeFromPath(request.path, ownerId);
        if (!scope) throw new Error('book_assembly_auth_scope_required');
        return provider({ service: 'book_assembly', ...scope, ownerId });
      };
    })();
    const getFirebaseAuthToken = async (
      request: FirebaseRtdbAuthRequest = { path: '' },
    ): Promise<string> => {
      if (!authScopeFromPath(request.path, ownerId)) {
        throw new Error('book_assembly_auth_scope_required');
      }
      return mintFirebaseAuthToken(request);
    };
    this.rtdb = new FirebaseRtdbRestClient({
      // Candidate Assembly must never fall back to the broad OAuth path in
      // RepositoryEnv.GOOGLE_SA_KEY. Firebase Auth query tokens are the only
      // production transport for this repository.
      env: { ...options.env, GOOGLE_SA_KEY: undefined },
      fetchImpl,
      firebaseAuthToken: true,
      getFirebaseAuthToken,
    });
  }

  async readScope(bookId: string, unitKey: string): Promise<BookAssemblyScope> {
    return parseScope(
      await this.rtdb.readWithEtag<unknown>(scopePath(bookId, unitKey)).then((value) => value.data),
      bookId,
      unitKey,
      { hydrate: true },
    );
  }

  async readValue(path: string): Promise<unknown> {
    const match = /^users\/([A-Za-z0-9][A-Za-z0-9._:@-]{0,255})$/u.exec(path);
    if (!match || match[1] !== this.options.ownerId?.trim()) {
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
      const parsed = parseScope(current.data, bookId, unitKey, { hydrate: true });
      const mutation = mutate(parsed);
      if (!mutation.write) return mutation.outcome;
      await options.beforeWrite?.();
      const next = parseScope(mutation.next ?? {}, bookId, unitKey);
      if (await this.rtdb.writeIfMatch(path, next, current.etag)) return mutation.outcome;
    }
    throw new Error('book_assembly_scope_cas_retries_exhausted');
  }
}
