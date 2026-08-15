import { validateBookAssemblyManifestCandidate } from '../../../../src/services/book-assembly/manifestCandidate.service.ts';
import type {
  BookAssemblyManifestCandidate,
  BookAssemblyValidationResult,
} from '../../../../src/types/bookAssembly.types.ts';
import type {
  BookAssemblyBookAuthority,
  BookAssemblyCandidateRecord,
  BookAssemblyMutationResult,
} from '../../../../src/services/book-assembly/unitAssembly.types.ts';
import {
  FirebaseRestBookAssemblyRepository,
  type BookAssemblyRepositoryEnv,
  type BookAssemblyScope,
} from './repository.ts';
import {
  BookPilotScopeDeniedError,
  enforceBookPilotScopeIfConfigured,
} from '../../book-pilot-scope.ts';
export type { BookAssemblyScope } from './repository.ts';

const MAX_BODY_BYTES = 1_200_000;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;
const OPERATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
type Mutation = 'create' | 'replace' | 'validate' | 'discard';

export class BookAssemblyWorkerError extends Error {
  constructor(readonly code: string, readonly status = 400) {
    super(code);
    this.name = 'BookAssemblyWorkerError';
  }
}

export interface BookAssemblyRepositoryPort {
  readValue(path: string): Promise<unknown>;
  readScope(bookId: string, unitKey: string): Promise<BookAssemblyScope>;
  transaction<T>(
    bookId: string,
    unitKey: string,
    mutate: (current: BookAssemblyScope) => {
      outcome: T;
      next?: BookAssemblyScope;
      write: boolean;
    },
    options?: { beforeWrite?: () => Promise<void> },
  ): Promise<T>;
}

export type BookAssemblyAuthorityReader = (
  repository: BookAssemblyRepositoryPort,
  bookId: string,
  context?: { readonly env: BookAssemblyRepositoryEnv; readonly ownerId: string },
) => Promise<BookAssemblyBookAuthority | null>;

const clone = <T>(value: T): T => structuredClone(value);
const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) =>
      `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};
const nowDefault = (): string => new Date().toISOString();
const plain = (value: unknown): Record<string, unknown> | null => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);
const exact = (value: unknown, keys: readonly string[]): Record<string, unknown> => {
  const record = plain(value);
  if (!record || Object.keys(record).some((key) => !keys.includes(key))) {
    throw new BookAssemblyWorkerError('invalid_request');
  }
  return record;
};
const id = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !ID.test(value)) {
    throw new BookAssemblyWorkerError(`invalid_${label}`);
  }
  return value;
};
const operationId = (value: unknown): string => {
  if (typeof value !== 'string' || !OPERATION_ID.test(value)) {
    throw new BookAssemblyWorkerError('invalid_operation_id');
  }
  return value;
};
const revision = (value: unknown, label: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new BookAssemblyWorkerError(`invalid_${label}`);
  }
  return value as number;
};
const readBody = async (request: Request): Promise<unknown> => {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new BookAssemblyWorkerError('content_type_required');
  }
  const claimed = request.headers.get('content-length');
  if (claimed !== null && (!/^\d+$/u.test(claimed) || Number(claimed) > MAX_BODY_BYTES)) {
    throw new BookAssemblyWorkerError('body_too_large', 413);
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new BookAssemblyWorkerError('body_too_large', 413);
  }
  try { return JSON.parse(text); } catch { throw new BookAssemblyWorkerError('invalid_json'); }
};
const roleAllowed = (value: unknown): boolean => {
  const profile = plain(value);
  return !!profile
    && (profile.role === 'teacher' || profile.role === 'super_admin')
    && !['blocked', 'inactive', 'suspended'].includes(String(profile.status ?? ''))
    && profile.forceReauth !== true;
};
const candidateManifest = (value: unknown): value is BookAssemblyManifestCandidate =>
  plain(value) !== null;
const checkManifest = (
  manifest: unknown,
  authority: BookAssemblyBookAuthority,
): BookAssemblyValidationResult => {
  if (!candidateManifest(manifest)) {
    return { valid: false, errors: [{
      code: 'invalid-record', path: '$.manifest', message: 'Manifest is required.',
    }] };
  }
  if (manifest.bookId !== authority.bookId
    || stable(manifest.sourceSet) !== stable(authority.sourceSet)) {
    return { valid: false, errors: [{
      code: 'source-book-mismatch',
      path: '$.sourceSet',
      message: 'Manifest is not bound to the current immutable Source Set.',
    }] };
  }
  return validateBookAssemblyManifestCandidate(manifest, authority.sourceVersionAuthority);
};
const hasUnit = (manifest: BookAssemblyManifestCandidate, unitKey: string): boolean =>
  manifest.units.some((unit) => unit.unitKey === unitKey);
const receipt = (
  operation: string,
  fingerprint: string,
  status: BookAssemblyMutationResult['status'],
  at: string,
  candidate?: BookAssemblyCandidateRecord,
): BookAssemblyMutationResult['receipt'] => ({
  operationId: operation,
  fingerprint,
  status,
  ...(candidate ? { candidateId: candidate.candidateId, candidateRevision: candidate.revision } : {}),
  createdAt: at,
});
const output = (
  operation: string,
  fingerprint: string,
  status: BookAssemblyMutationResult['status'],
  at: string,
  candidate?: BookAssemblyCandidateRecord,
  extra: Partial<BookAssemblyMutationResult> = {},
): BookAssemblyMutationResult => ({
  status,
  ...(candidate ? { candidate: clone(candidate) } : {}),
  ...extra,
  receipt: receipt(operation, fingerprint, status, at, candidate),
});
const assertAuthorityUnchanged = (
  before: BookAssemblyBookAuthority,
  after: BookAssemblyBookAuthority | null,
): void => {
  if (!after
    || after.bookId !== before.bookId
    || after.ownerId !== before.ownerId
    || after.bookMode !== before.bookMode
    || after.bookRevision !== before.bookRevision
    || after.sourceSetRevision !== before.sourceSetRevision
    || stable(after.sourceSet) !== stable(before.sourceSet)) {
    throw new BookAssemblyWorkerError('assembly_authority_changed', 409);
  }
};
const replay = (
  scope: BookAssemblyScope,
  ownerId: string,
  operation: string,
  fingerprint: string,
): BookAssemblyMutationResult | null => {
  const stored = scope.operations?.[operation];
  if (!stored) return null;
  if (stored.ownerId !== ownerId || stored.fingerprint !== fingerprint) {
    return output(operation, fingerprint, 'idempotency-conflict', stored.createdAt);
  }
  return {
    ...clone(stored.result),
    status: 'replayed',
    receipt: { ...stored.result.receipt, status: 'replayed' },
  };
};
const remember = (
  scope: BookAssemblyScope,
  ownerId: string,
  operation: string,
  fingerprint: string,
  value: BookAssemblyMutationResult,
  at: string,
): void => {
  const entries = Object.entries(scope.operations ?? {}).slice(-31);
  scope.operations = {
    ...Object.fromEntries(entries),
    [operation]: { ownerId, fingerprint, result: clone(value), createdAt: at },
  };
};
const pointer = (candidate: BookAssemblyCandidateRecord): NonNullable<BookAssemblyScope['current']> => ({
  candidateId: candidate.candidateId,
  candidateRevision: candidate.revision,
  bookRevision: candidate.bookRevision,
  sourceSetRevision: candidate.sourceSetRevision,
  updatedAt: candidate.updatedAt,
});

export const createBookAssemblyWorkerHandlers = (options: {
  repository?: BookAssemblyRepositoryPort;
  now?: () => string;
  createCandidateId?: () => string;
  readBookAuthority?: BookAssemblyAuthorityReader;
} = {}) => {
  const now = options.now ?? nowDefault;
  const repositoryFor = (env: BookAssemblyRepositoryEnv, ownerId: string): BookAssemblyRepositoryPort =>
    options.repository ?? new FirebaseRestBookAssemblyRepository({ env, ownerId });
  const authorityFor = async (
    repository: BookAssemblyRepositoryPort,
    bookId: string,
    env?: BookAssemblyRepositoryEnv,
    ownerId?: string,
  ): Promise<BookAssemblyBookAuthority | null> =>
    options.readBookAuthority ? options.readBookAuthority(
      repository,
      bookId,
      env && ownerId ? { env, ownerId } : undefined,
    ) : null;
  const authenticate = async (
    repository: BookAssemblyRepositoryPort,
    uid: string,
  ): Promise<void> => {
    if (!roleAllowed(await repository.readValue(`users/${uid}`))) {
      throw new BookAssemblyWorkerError('assembly_forbidden', 403);
    }
  };
  const mutationsEnabled = (env: BookAssemblyRepositoryEnv): boolean =>
    env.BOOK_ASSEMBLY_MUTATIONS_ENABLED === 'true';

  const mutate = async (
    action: Mutation,
    input: { request: Request; env: BookAssemblyRepositoryEnv; uid: string; bookId?: string },
  ) => {
    try {
      await enforceBookPilotScopeIfConfigured({
        env: input.env,
        uid: input.uid,
        request: input.request,
        operation: action === 'create' ? 'create' : 'mutation',
        actorKind: 'teacher',
        // The canonical router supplies this from the matched path. Passing
        // the trusted route subject prevents the direct-handler guard from
        // treating Assembly as owner-only Activity authoring.
        bookId: input.bookId,
        requireBook: true,
      });
      const repository = repositoryFor(input.env, input.uid);
      const body = await readBody(input.request);
      await authenticate(repository, input.uid);
      if (!mutationsEnabled(input.env)) {
        return { body: { code: 'book_assembly_mutation_disabled' }, init: { status: 503 } };
      }
      const parsed = exact(body, action === 'create' || action === 'replace'
        ? ['operationId', 'bookId', 'unitKey', 'expectedBookRevision',
          'expectedSourceSetRevision', 'candidateId', 'expectedCandidateRevision', 'manifest']
        : ['operationId', 'bookId', 'unitKey', 'candidateId', 'expectedCandidateRevision']);
      const operation = operationId(parsed.operationId);
      const bookId = id(parsed.bookId, 'book_id');
      if (input.bookId !== undefined && id(input.bookId, 'route_book_id') !== bookId) {
        throw new BookAssemblyWorkerError('book_route_mismatch', 409);
      }
      const unitKey = id(parsed.unitKey, 'unit_key');
      const candidateId = parsed.candidateId === undefined
        ? undefined : id(parsed.candidateId, 'candidate_id');
      const authority = await authorityFor(repository, bookId, input.env, input.uid);
      if (!authority) return { body: { status: 'not-found' }, init: { status: 404 } };
      if (authority.ownerId !== input.uid || authority.bookMode !== 'pdf') {
        return { body: { status: 'forbidden' }, init: { status: 403 } };
      }
      const at = now();
      const scopeBefore = await repository.readScope(bookId, unitKey);
      const currentBefore = candidateId ? scopeBefore.candidates?.[candidateId] : undefined;
      if (currentBefore && currentBefore.ownerId !== input.uid) {
        return { body: { status: 'not-found' }, init: { status: 404 } };
      }
      const outputValue = await repository.transaction(bookId, unitKey, (scope) => {
        const fingerprint = stable({ action, ...parsed });
        const replayed = replay(scope, input.uid, operation, fingerprint);
        if (replayed) return { outcome: replayed, write: false };
        const current = candidateId ? scope.candidates?.[candidateId] : undefined;
        const expectedCandidateRevision = parsed.expectedCandidateRevision === undefined
          ? undefined : revision(parsed.expectedCandidateRevision, 'expected_candidate_revision');
        if (action === 'create') {
          const expectedBookRevision = revision(parsed.expectedBookRevision, 'expected_book_revision');
          const expectedSourceSetRevision = revision(parsed.expectedSourceSetRevision, 'expected_source_set_revision');
          const requestedUnit = id(parsed.unitKey, 'unit_key');
          const checked = checkManifest(parsed.manifest, authority);
          if (authority.bookRevision !== expectedBookRevision
            || authority.sourceSetRevision !== expectedSourceSetRevision) {
            const conflict = output(operation, fingerprint, 'conflict', at, undefined, {
              currentBookRevision: authority.bookRevision,
              currentSourceSetRevision: authority.sourceSetRevision,
            });
            remember(scope, input.uid, operation, fingerprint, conflict, at);
            return { outcome: conflict, next: scope, write: true };
          }
          if (!checked.valid || !candidateManifest(parsed.manifest)
            || !hasUnit(parsed.manifest, requestedUnit)) {
            const invalid = output(operation, fingerprint, 'invalid', at);
            remember(scope, input.uid, operation, fingerprint, invalid, at);
            return { outcome: invalid, next: scope, write: true };
          }
          const createCandidateId = options.createCandidateId?.() ?? `candidate-${crypto.randomUUID()}`;
          if (!ID.test(createCandidateId) || scope.candidates?.[createCandidateId]) {
            const collision = output(operation, fingerprint, 'conflict', at);
            remember(scope, input.uid, operation, fingerprint, collision, at);
            return { outcome: collision, next: scope, write: true };
          }
          const candidate: BookAssemblyCandidateRecord = {
            candidateId: createCandidateId,
            ownerId: input.uid,
            bookId,
            bookRevision: authority.bookRevision,
            sourceSetRevision: authority.sourceSetRevision,
            unitKey: requestedUnit,
            revision: 1,
            lifecycle: 'draft',
            manifest: clone(parsed.manifest) as BookAssemblyManifestCandidate,
            validation: checked,
            updatedAt: at,
          };
          scope.candidates = { ...(scope.candidates ?? {}), [candidate.candidateId]: candidate };
          scope.current = pointer(candidate);
          const created = output(operation, fingerprint, 'created', at, candidate);
          remember(scope, input.uid, operation, fingerprint, created, at);
          return { outcome: created, next: scope, write: true };
        }
        if (!current || current.ownerId !== input.uid) {
          const missing = output(operation, fingerprint, 'not-found', at);
          remember(scope, input.uid, operation, fingerprint, missing, at);
          return { outcome: missing, next: scope, write: true };
        }
        if (expectedCandidateRevision !== current.revision) {
          const conflict = output(operation, fingerprint, 'conflict', at, current, {
            currentRevision: current.revision,
          });
          remember(scope, input.uid, operation, fingerprint, conflict, at);
          return { outcome: conflict, next: scope, write: true };
        }
        if (authority.bookRevision !== current.bookRevision
          || authority.sourceSetRevision !== current.sourceSetRevision) {
          const conflict = output(operation, fingerprint, 'conflict', at, current, {
            currentBookRevision: authority.bookRevision,
            currentSourceSetRevision: authority.sourceSetRevision,
          });
          remember(scope, input.uid, operation, fingerprint, conflict, at);
          return { outcome: conflict, next: scope, write: true };
        }
        if (action === 'validate' || action === 'replace') {
          const manifest = action === 'replace' ? parsed.manifest : current.manifest;
          const requestedUnit = action === 'replace' ? id(parsed.unitKey, 'unit_key') : current.unitKey;
          const checked = checkManifest(manifest, authority);
          if (!checked.valid || !candidateManifest(manifest) || !hasUnit(manifest, requestedUnit)) {
            const invalid = output(operation, fingerprint, 'invalid', at, current);
            remember(scope, input.uid, operation, fingerprint, invalid, at);
            return { outcome: invalid, next: scope, write: true };
          }
          const next: BookAssemblyCandidateRecord = {
            ...current,
            ...(action === 'replace' ? {
              unitKey: requestedUnit,
              manifest: clone(manifest) as BookAssemblyManifestCandidate,
            } : {}),
            revision: current.revision + 1,
            lifecycle: 'validated',
            validation: checked,
            updatedAt: at,
          };
          scope.candidates = { ...(scope.candidates ?? {}), [next.candidateId]: next };
          scope.current = pointer(next);
          const updated = output(operation, fingerprint, action === 'replace' ? 'replaced' : 'validated', at, next);
          remember(scope, input.uid, operation, fingerprint, updated, at);
          return { outcome: updated, next: scope, write: true };
        }
        const discarded: BookAssemblyCandidateRecord = {
          ...current,
          revision: current.revision + 1,
          lifecycle: 'discarded',
          manifest: null,
          updatedAt: at,
        };
        scope.candidates = { ...(scope.candidates ?? {}), [current.candidateId]: discarded };
        if (scope.current?.candidateId === current.candidateId) delete scope.current;
        const result = output(operation, fingerprint, 'discarded', at, discarded);
        remember(scope, input.uid, operation, fingerprint, result, at);
        return { outcome: result, next: scope, write: true };
      }, {
        beforeWrite: async () => {
          await enforceBookPilotScopeIfConfigured({
            env: input.env,
            uid: input.uid,
            request: input.request,
            operation: action === 'create' ? 'create' : 'mutation',
            actorKind: 'teacher',
            bookId,
            requireBook: true,
          });
          assertAuthorityUnchanged(authority, await authorityFor(repository, bookId, input.env, input.uid));
        },
      });
      const status = outputValue.status === 'not-found' ? 404
        : outputValue.status === 'forbidden' ? 403
        : outputValue.status === 'conflict' || outputValue.status === 'idempotency-conflict' ? 409
        : outputValue.status === 'invalid' ? 422 : 200;
      return { body: outputValue, init: { status } };
    } catch (error) {
      if (error instanceof BookPilotScopeDeniedError) {
        return { body: { code: error.message, decision: error.decision }, init: { status: error.status } };
      }
      if (error instanceof BookAssemblyWorkerError) {
        return { body: { code: error.code }, init: { status: error.status } };
      }
      console.error('Book Assembly candidate mutation failed', error instanceof Error ? error.message : String(error));
      return { body: { code: 'book_assembly_failed' }, init: { status: 500 } };
    }
  };

  return {
    create: (input: { request: Request; env: BookAssemblyRepositoryEnv; uid: string; bookId?: string }) => mutate('create', input),
    replace: (input: { request: Request; env: BookAssemblyRepositoryEnv; uid: string; bookId?: string }) => mutate('replace', input),
    validate: (input: { request: Request; env: BookAssemblyRepositoryEnv; uid: string; bookId?: string }) => mutate('validate', input),
    discard: (input: { request: Request; env: BookAssemblyRepositoryEnv; uid: string; bookId?: string }) => mutate('discard', input),
    async load(input: {
      env: BookAssemblyRepositoryEnv;
      uid: string;
      bookId: string;
      unitKey: string;
      candidateId: string;
    }) {
      try {
        const repository = repositoryFor(input.env, input.uid);
        await authenticate(repository, input.uid);
        const bookId = id(input.bookId, 'book_id');
        const unitKey = id(input.unitKey, 'unit_key');
        const candidateId = id(input.candidateId, 'candidate_id');
        const scope = await repository.readScope(bookId, unitKey);
        const candidate = scope.candidates?.[candidateId];
        if (!candidate || candidate.ownerId !== input.uid) {
          return { body: { status: 'not-found' }, init: { status: 404 } };
        }
        const authority = await authorityFor(repository, bookId, input.env, input.uid);
        if (!authority || authority.ownerId !== input.uid || authority.bookMode !== 'pdf') {
          return { body: { status: 'not-found' }, init: { status: 404 } };
        }
        const conflict = authority.bookRevision !== candidate.bookRevision
          || authority.sourceSetRevision !== candidate.sourceSetRevision
          || (candidate.manifest !== null
            && stable(candidate.manifest.sourceSet) !== stable(authority.sourceSet));
        return {
          body: {
            status: 'loaded',
            candidate: clone(candidate),
            conflict: conflict ? {
              bookRevision: authority?.bookRevision,
              sourceSetRevision: authority?.sourceSetRevision,
            } : null,
          },
          init: { status: 200 },
        };
      } catch (error) {
        const status = error instanceof BookAssemblyWorkerError ? error.status : 500;
        return { body: { code: error instanceof BookAssemblyWorkerError ? error.code : 'book_assembly_failed' }, init: { status } };
      }
    },
  };
};
