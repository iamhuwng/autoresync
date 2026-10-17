import type {
  BookAssemblyBookAuthority,
  BookAssemblyCandidateRecord,
  BookAssemblyMutationResult,
} from '../../../../src/services/book-assembly/unitAssembly.types.ts';
import type { SourceSetCandidate } from '../../../../src/types/bookAssembly.types.ts';
import { validateBookAssemblyManifestCandidate } from '../../../../src/services/book-assembly/manifestCandidate.service.ts';
import { planSourceStrategyMigration } from '../../../../src/services/book-assembly/sourceStrategyMigration.service.ts';
import type { SourceStrategyMigrationRemap } from '../../../../src/services/book-assembly/sourceStrategyMigration.service.ts';
import {
  BookAssemblyWorkerError,
  type BookAssemblyAuthorityReader,
  type BookAssemblyRepositoryPort,
} from './worker.ts';
import { FirebaseRestBookAssemblyRepository, type BookAssemblyRepositoryEnv, type BookAssemblyScope } from './repository.ts';

const MAX_BODY_BYTES = 1_200_000;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;
const OPERATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const clone = <T>(value: T): T => structuredClone(value);
const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};
const plain = (value: unknown): Record<string, unknown> | null => (
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
);
const exact = (value: unknown, keys: readonly string[]): Record<string, unknown> => {
  const record = plain(value);
  if (!record || Object.keys(record).some((key) => !keys.includes(key))) throw new BookAssemblyWorkerError('invalid_request');
  return record;
};
const id = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !ID.test(value)) throw new BookAssemblyWorkerError(`invalid_${label}`);
  return value;
};
const revision = (value: unknown, label: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new BookAssemblyWorkerError(`invalid_${label}`);
  return value as number;
};
const operationId = (value: unknown): string => {
  if (typeof value !== 'string' || !OPERATION_ID.test(value)) throw new BookAssemblyWorkerError('invalid_operation_id');
  return value;
};
const readBody = async (request: Request): Promise<unknown> => {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) throw new BookAssemblyWorkerError('content_type_required');
  const claimed = request.headers.get('content-length');
  if (claimed !== null && (!/^\d+$/u.test(claimed) || Number(claimed) > MAX_BODY_BYTES)) throw new BookAssemblyWorkerError('body_too_large', 413);
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw new BookAssemblyWorkerError('body_too_large', 413);
  try { return JSON.parse(text); } catch { throw new BookAssemblyWorkerError('invalid_json'); }
};
const pointer = (candidate: BookAssemblyCandidateRecord): NonNullable<BookAssemblyScope['current']> => ({
  candidateId: candidate.candidateId,
  candidateRevision: candidate.revision,
  bookRevision: candidate.bookRevision,
  sourceSetRevision: candidate.sourceSetRevision,
  updatedAt: candidate.updatedAt,
});
const result = (operationIdValue: string, fingerprint: string, status: BookAssemblyMutationResult['status'], at: string, candidate?: BookAssemblyCandidateRecord, extra: Partial<BookAssemblyMutationResult> = {}): BookAssemblyMutationResult => ({
  status,
  ...(candidate ? { candidate: clone(candidate) } : {}),
  ...extra,
  receipt: { operationId: operationIdValue, fingerprint, status, ...(candidate ? { candidateId: candidate.candidateId, candidateRevision: candidate.revision } : {}), createdAt: at },
});
const remember = (scope: BookAssemblyScope, ownerId: string, operation: string, fingerprint: string, value: BookAssemblyMutationResult, at: string): void => {
  const entries = Object.entries(scope.operations ?? {}).slice(-31);
  scope.operations = { ...Object.fromEntries(entries), [operation]: { ownerId, fingerprint, result: clone(value), createdAt: at } };
};
const replay = (scope: BookAssemblyScope, ownerId: string, operation: string, fingerprint: string): BookAssemblyMutationResult | null => {
  const stored = scope.operations?.[operation];
  if (!stored) return null;
  if (stored.ownerId !== ownerId || stored.fingerprint !== fingerprint) return result(operation, fingerprint, 'idempotency-conflict', stored.createdAt);
  return { ...clone(stored.result), status: 'replayed', receipt: { ...stored.result.receipt, status: 'replayed' } };
};
const roleAllowed = (value: unknown): boolean => {
  const profile = plain(value);
  return !!profile && (profile.role === 'teacher' || profile.role === 'super_admin') && !['blocked', 'inactive', 'suspended'].includes(String(profile.status ?? '')) && profile.forceReauth !== true;
};
const unpublished = (authority: BookAssemblyBookAuthority): boolean => {
  const value = authority as BookAssemblyBookAuthority & { hasPublication?: unknown; published?: unknown };
  return value.hasPublication !== true && value.published !== true;
};
const authoritySame = (before: BookAssemblyBookAuthority, after: BookAssemblyBookAuthority | null): void => {
  if (!after || after.bookId !== before.bookId || after.ownerId !== before.ownerId || after.bookMode !== before.bookMode || after.bookRevision !== before.bookRevision || after.sourceSetRevision !== before.sourceSetRevision || stable(after.sourceSet) !== stable(before.sourceSet)) throw new BookAssemblyWorkerError('assembly_authority_changed', 409);
};
export const createSourceStrategyMigrationWorkerHandlers = (options: {
  repository?: BookAssemblyRepositoryPort;
  now?: () => string;
  createCandidateId?: () => string;
  readBookAuthority?: BookAssemblyAuthorityReader;
  isPublished?: (authority: BookAssemblyBookAuthority, repository: BookAssemblyRepositoryPort) => Promise<boolean>;
} = {}) => {
  const now = options.now ?? (() => new Date().toISOString());
  const repositoryFor = (env: BookAssemblyRepositoryEnv, ownerId: string): BookAssemblyRepositoryPort => options.repository ?? new FirebaseRestBookAssemblyRepository({ env, ownerId });
  const authorityFor = async (repository: BookAssemblyRepositoryPort, bookId: string): Promise<BookAssemblyBookAuthority | null> => options.readBookAuthority?.(repository, bookId) ?? null;
  const gate = (env: BookAssemblyRepositoryEnv): boolean => env.BOOK_ASSEMBLY_MIGRATIONS_ENABLED === 'true';
  const auth = async (repository: BookAssemblyRepositoryPort, uid: string): Promise<void> => { if (!roleAllowed(await repository.readValue(`users/${uid}`))) throw new BookAssemblyWorkerError('assembly_forbidden', 403); };
  const isUnpublished = async (authority: BookAssemblyBookAuthority, repository: BookAssemblyRepositoryPort): Promise<boolean> => unpublished(authority) && !(await options.isPublished?.(authority, repository));

  type MutationInput = { request: Request; env: BookAssemblyRepositoryEnv; uid: string; params?: { bookId?: string; unitKey?: string; migrationCandidateId?: string } };
  const mutate = async (action: 'migrate' | 'confirm' | 'cancel', input: MutationInput) => {
    try {
      const repository = repositoryFor(input.env, input.uid);
      const body = await readBody(input.request);
      await auth(repository, input.uid);
      if (!gate(input.env)) return { body: { code: 'book_assembly_migration_disabled' }, init: { status: 503 } };
      const keys = action === 'migrate'
        ? ['operationId', 'bookId', 'unitKey', 'candidateId', 'expectedBookRevision', 'expectedSourceSetRevision', 'expectedCandidateRevision', 'targetSourceSetRevision', 'targetSourceSet', 'remaps']
        : ['operationId', 'expectedCurrentCandidateId', 'expectedCurrentCandidateRevision', 'expectedMigrationCandidateRevision'];
      const parsed = exact(body, keys);
      const operation = operationId(parsed.operationId);
      const bookId = id(action === 'migrate' ? parsed.bookId : input.params?.bookId, 'book_id');
      const unitKey = id(action === 'migrate' ? parsed.unitKey : input.params?.unitKey, 'unit_key');
      const authority = await authorityFor(repository, bookId);
      if (!authority) return { body: { status: 'not-found' }, init: { status: 404 } };
      if (authority.ownerId !== input.uid || authority.bookMode !== 'pdf') return { body: { status: 'forbidden' }, init: { status: 403 } };
      if (!(await isUnpublished(authority, repository))) return { body: { code: 'source_strategy_migration_requires_unpublished' }, init: { status: 409 } };
      const at = now();
      const output = await repository.transaction(bookId, unitKey, (scope) => {
        const fingerprint = stable({ action, ...parsed, params: input.params ?? null }); const replayed = replay(scope, input.uid, operation, fingerprint); if (replayed) return { outcome: replayed, write: false };
        const current = scope.current; const currentCandidate = current ? scope.candidates?.[current.candidateId] : undefined;
        if (!current || !currentCandidate || currentCandidate.ownerId !== input.uid) { const value = result(operation, fingerprint, 'not-found', at); remember(scope, input.uid, operation, fingerprint, value, at); return { outcome: value, next: scope, write: true }; }
        if (action === 'migrate') {
          const expectedBook = revision(parsed.expectedBookRevision, 'expected_book_revision'); const expectedSource = revision(parsed.expectedSourceSetRevision, 'expected_source_set_revision'); const expectedCandidate = revision(parsed.expectedCandidateRevision, 'expected_candidate_revision'); const targetRevision = revision(parsed.targetSourceSetRevision, 'target_source_set_revision'); const requestedCandidateId = id(parsed.candidateId, 'candidate_id');
          if (authority.bookRevision !== expectedBook || authority.sourceSetRevision !== expectedSource || current.candidateId !== requestedCandidateId || current.candidateRevision !== expectedCandidate || targetRevision <= authority.sourceSetRevision) { const value = result(operation, fingerprint, 'conflict', at, currentCandidate, { currentRevision: current.candidateRevision, currentBookRevision: authority.bookRevision, currentSourceSetRevision: authority.sourceSetRevision }); remember(scope, input.uid, operation, fingerprint, value, at); return { outcome: value, next: scope, write: true }; }
          const planned = planSourceStrategyMigration({ bookId: authority.bookId, bookMode: authority.bookMode, bookRevision: authority.bookRevision, sourceSetRevision: authority.sourceSetRevision, sourceSet: authority.sourceSet, candidate: currentCandidate, target: { sourceSetRevision: targetRevision, sourceSet: parsed.targetSourceSet as SourceSetCandidate }, remaps: parsed.remaps as readonly SourceStrategyMigrationRemap[] | undefined, sourceVersionAuthority: authority.sourceVersionAuthority, expectedBookRevision: expectedBook, expectedSourceSetRevision: expectedSource, expectedCandidateRevision: expectedCandidate, published: (authority as BookAssemblyBookAuthority & { published?: boolean }).published === true, hasPublication: (authority as BookAssemblyBookAuthority & { hasPublication?: boolean }).hasPublication === true });
          const validation = validateBookAssemblyManifestCandidate(planned.targetManifest, authority.sourceVersionAuthority);
          if (!planned.valid || !validation.valid || planned.targetManifest.bookId !== bookId) { const value = result(operation, fingerprint, 'invalid', at); remember(scope, input.uid, operation, fingerprint, value, at); return { outcome: value, next: scope, write: true }; }
          const candidateId = options.createCandidateId?.() ?? `migration-${crypto.randomUUID()}`; if (!ID.test(candidateId) || scope.candidates?.[candidateId]) { const value = result(operation, fingerprint, 'conflict', at); remember(scope, input.uid, operation, fingerprint, value, at); return { outcome: value, next: scope, write: true }; }
          const candidate: BookAssemblyCandidateRecord = {
            candidateId,
            ownerId: input.uid,
            bookId,
            bookRevision: authority.bookRevision,
            sourceSetRevision: targetRevision,
            unitKey,
            revision: 1,
            lifecycle: 'validated',
            manifest: clone(planned.targetManifest),
            validation,
            updatedAt: at,
            migration: {
              kind: 'source-strategy',
              baseCandidateId: currentCandidate.candidateId,
              fromSourceSetRevision: authority.sourceSetRevision,
              targetSourceSetRevision: targetRevision,
            },
          };
          scope.candidates = { ...(scope.candidates ?? {}), [candidateId]: candidate }; const value = result(operation, fingerprint, 'created', at, candidate, { currentRevision: current.candidateRevision, currentBookRevision: current.bookRevision, currentSourceSetRevision: current.sourceSetRevision }); remember(scope, input.uid, operation, fingerprint, value, at); return { outcome: value, next: scope, write: true };
        }
        const candidateId = id(input.params?.migrationCandidateId, 'migration_candidate_id'); const expectedCurrentId = id(parsed.expectedCurrentCandidateId, 'expected_current_candidate_id'); const expectedCurrentRevision = revision(parsed.expectedCurrentCandidateRevision, 'expected_current_candidate_revision'); const expectedMigrationRevision = revision(parsed.expectedMigrationCandidateRevision, 'expected_migration_candidate_revision'); const replacement = scope.candidates?.[candidateId];
        const migration = replacement?.migration;
        if (current.candidateId !== expectedCurrentId
          || current.candidateRevision !== expectedCurrentRevision
          || !replacement
          || replacement.ownerId !== input.uid
          || replacement.revision !== expectedMigrationRevision
          || replacement.lifecycle !== 'validated'
          || !replacement.validation.valid
          || migration?.kind !== 'source-strategy'
          || migration.baseCandidateId !== expectedCurrentId
          || migration.fromSourceSetRevision !== current.sourceSetRevision
          || migration.targetSourceSetRevision !== replacement.sourceSetRevision
          || replacement.sourceSetRevision <= authority.sourceSetRevision) {
          const value = result(operation, fingerprint, 'conflict', at, currentCandidate, { currentRevision: current.candidateRevision }); remember(scope, input.uid, operation, fingerprint, value, at); return { outcome: value, next: scope, write: true };
        }
        if (action === 'confirm') scope.current = pointer(replacement);
        else scope.candidates = { ...(scope.candidates ?? {}), [candidateId]: { ...replacement, lifecycle: 'discarded', manifest: null, revision: replacement.revision + 1, updatedAt: at } };
        const value = result(operation, fingerprint, action === 'confirm' ? 'replaced' : 'discarded', at, action === 'confirm' ? replacement : scope.candidates[candidateId]); remember(scope, input.uid, operation, fingerprint, value, at); return { outcome: value, next: scope, write: true };
      }, { beforeWrite: async () => {
        const latest = await authorityFor(repository, bookId);
        authoritySame(authority, latest);
        if (!latest || !(await isUnpublished(latest, repository))) throw new BookAssemblyWorkerError('source_strategy_migration_requires_unpublished', 409);
      } });
      const status = output.status === 'not-found' ? 404 : output.status === 'conflict' || output.status === 'idempotency-conflict' ? 409 : output.status === 'invalid' ? 422 : 200;
      return { body: output, init: { status } };
    } catch (error) { if (error instanceof BookAssemblyWorkerError) return { body: { code: error.code }, init: { status: error.status } }; return { body: { code: 'book_assembly_failed' }, init: { status: 500 } }; }
  };
  return {
    migrate: (input: MutationInput) => mutate('migrate', input),
    confirm: (input: MutationInput) => mutate('confirm', input),
    cancel: (input: MutationInput) => mutate('cancel', input),
    discard: (input: MutationInput) => mutate('cancel', input),
  };
};
