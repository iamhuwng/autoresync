import {
  BOOK_SUBMISSION_SCHEMA_VERSION,
  assertBookSubmissionId,
  assertBookSubmissionIdempotencyKey,
  cloneBookSubmissionOperation,
  cloneBookSubmissionReceipt,
  normalizeBookSubmissionFingerprint,
  BookSubmissionContractError,
  type BookSubmissionBeginResult,
  type BookSubmissionCancelResult,
  type BookSubmissionCommitResult,
  type BookSubmissionOperation,
  type BookSubmissionStep,
  type BookSubmissionStatusResult,
} from '../../../../src/services/materialCatalog/bookSubmission.contract.ts';
import type { BookSubmissionRepository } from './worker.ts';
import type { PreparedComponentPdfArtifact } from './component-preparation.ts';
import { createTrustedFirebaseRtdbServiceAccountAccessTokenProvider } from '../../../../src/services/book-source-delivery/sourceUpload.firebaseRtdbTransaction.ts';

const nowDefault = () => new Date().toISOString();
const COMMIT_LEASE_MS = 2 * 60 * 1000;
const id = (prefix: string) => prefix === 'submission' ? crypto.randomUUID() : `${prefix}-${crypto.randomUUID()}`;
const clone = <T>(v: T): T => structuredClone(v);

const receipt = (operation: BookSubmissionOperation) => {
  if (operation.state !== 'committed' || !operation.committedAt) throw new BookSubmissionContractError('invalid_transition');
  return cloneBookSubmissionReceipt({ status: 'committed', operationId: operation.operationId, ownerId: operation.ownerId,
    finalBookId: operation.finalBookId, fingerprint: operation.fingerprint, committedAt: operation.committedAt });
};
const withStep = (operation: BookSubmissionOperation, step: BookSubmissionStep): BookSubmissionOperation => (
  operation.completedSteps.includes(step) ? operation : { ...operation, completedSteps: [...operation.completedSteps, step] as BookSubmissionStep[] }
);
const leaseExpired = (operation: BookSubmissionOperation, now = Date.now()): boolean => (
  operation.commitLeaseExpiresAt === undefined || operation.commitLeaseExpiresAt <= now
);

export const createInMemoryBookSubmissionRepository = (options: {
  now?: () => string;
  allocateOperationId?: () => string;
  allocateBookId?: () => string;
} = {}): BookSubmissionRepository => {
  const operations = new Map<string, BookSubmissionOperation>();
  const preparedComponents = new Map<string, PreparedComponentPdfArtifact>();
  const now = options.now ?? nowDefault;
  const allocateOperationId = options.allocateOperationId ?? (() => id('submission'));
  const allocateBookId = options.allocateBookId ?? (() => id('book'));
  const save = (value: BookSubmissionOperation, updatedAt = now()) => {
    const next = cloneBookSubmissionOperation({ ...value, updatedAt }); operations.set(next.operationId, next); return next;
  };
  const owned = (ownerId: string, operationId: string) => {
    const owner = assertBookSubmissionId(ownerId); const operation = operations.get(assertBookSubmissionId(operationId));
    if (!operation) throw new BookSubmissionContractError('operation_not_found');
    if (operation.ownerId !== owner) throw new BookSubmissionContractError('operation_owner_mismatch');
    return operation;
  };
  return {
    async begin(input) {
      const ownerId = assertBookSubmissionId(input.ownerId); const fp = normalizeBookSubmissionFingerprint(input.fingerprint);
      const key = assertBookSubmissionIdempotencyKey(input.idempotencyKey);
      const existing = [...operations.values()].find((candidate) => candidate.ownerId === ownerId && candidate.idempotencyKey === key);
      if (existing) {
        if (existing.fingerprint !== fp) throw new BookSubmissionContractError('idempotency_conflict');
        return { status: 'replayed', operation: cloneBookSubmissionOperation(existing) };
      }
      const createdAt = now();
      const operation: BookSubmissionOperation = { schemaVersion: BOOK_SUBMISSION_SCHEMA_VERSION,
        operationId: assertBookSubmissionId(allocateOperationId()), ownerId, finalBookId: assertBookSubmissionId(allocateBookId()),
        idempotencyKey: key, fingerprint: fp, state: 'preparing', completedSteps: ['begin'], createdAt, updatedAt: createdAt };
      if (operations.has(operation.operationId)) throw new BookSubmissionContractError('idempotency_conflict');
      operations.set(operation.operationId, cloneBookSubmissionOperation(operation));
      return { status: 'created', operation: cloneBookSubmissionOperation(operation) };
    },
    async status(input) {
      const viewed = save(withStep(owned(input.ownerId, input.operationId), 'status'));
      return { status: viewed.state, operation: cloneBookSubmissionOperation(viewed), ...(viewed.state === 'committed' ? { receipt: receipt(viewed) } : {}) };
    },
    async cancel(input) {
      const operation = owned(input.ownerId, input.operationId);
      if (operation.state === 'canceled') return { status: 'replayed', operation: cloneBookSubmissionOperation(operation) };
      if (operation.state === 'committed') throw new BookSubmissionContractError('invalid_transition');
      if (operation.state === 'committing' && !leaseExpired(operation)) throw new BookSubmissionContractError('invalid_transition');
      const canceled = save({ ...withStep(operation, 'cancel'), state: 'canceled', canceledAt: now() });
      return { status: 'canceled', operation: cloneBookSubmissionOperation(canceled) };
    },
    async commit(input) {
      const operation = owned(input.ownerId, input.operationId);
      if (normalizeBookSubmissionFingerprint(input.fingerprint) !== operation.fingerprint) throw new BookSubmissionContractError('idempotency_conflict');
      if (operation.state === 'committed') return { status: 'replayed', operation: cloneBookSubmissionOperation(operation), receipt: receipt(operation) };
      if (operation.state === 'canceled') throw new BookSubmissionContractError('invalid_transition');
      const leaseId = crypto.randomUUID();
      if (operation.state === 'committing' && !leaseExpired(operation)) throw new BookSubmissionContractError('invalid_transition');
      const committing = save({ ...withStep(operation, 'commit'), state: 'committing', commitLeaseId: leaseId, commitLeaseExpiresAt: Date.now() + COMMIT_LEASE_MS });
      try {
        await input.commit(cloneBookSubmissionOperation(committing), preparedComponents.get(committing.operationId));
      } catch (error) {
        // Release the lease after a failed finalizer so a corrected retry can
        // adopt the same operation without permitting concurrent commits.
        const current = operations.get(committing.operationId);
        if (current?.state === 'committing' && current.commitLeaseId === leaseId) save({ ...committing, state: 'preparing', commitLeaseId: undefined, commitLeaseExpiresAt: undefined });
        throw error;
      }
      const current = owned(input.ownerId, input.operationId);
      if (current.state !== 'committing' || current.commitLeaseId !== leaseId || leaseExpired(current)) {
        throw new BookSubmissionContractError('invalid_transition');
      }
      const committedAt = now(); const committed = save({ ...current, state: 'committed', committedAt, commitLeaseId: undefined, commitLeaseExpiresAt: undefined }, committedAt);
      return { status: 'committed', operation: cloneBookSubmissionOperation(committed), receipt: receipt(committed) };
    },
    async prepareComponent(input) {
      const operation = owned(input.ownerId, input.operationId);
      if (normalizeBookSubmissionFingerprint(input.fingerprint) !== operation.fingerprint) {
        throw new BookSubmissionContractError('idempotency_conflict');
      }
      const existing = preparedComponents.get(operation.operationId);
      if (existing) {
        if (operation.state === 'canceled') throw new BookSubmissionContractError('invalid_transition');
        return { status: 'replayed', operation: cloneBookSubmissionOperation(operation), artifact: clone(existing) };
      }
      if (operation.state !== 'preparing') {
        throw new BookSubmissionContractError('invalid_transition');
      }
      const artifact = await input.prepare(cloneBookSubmissionOperation(operation));
      if (artifact.operationId !== operation.operationId || artifact.ownerId !== operation.ownerId || artifact.bookId !== operation.finalBookId || artifact.fingerprint !== operation.fingerprint || artifact.active !== false) {
        throw new BookSubmissionContractError('invalid_input');
      }
      const current = owned(input.ownerId, input.operationId);
      if (current.state !== 'preparing') throw new BookSubmissionContractError('invalid_transition');
      const raced = preparedComponents.get(current.operationId);
      if (raced) return { status: 'replayed', operation: cloneBookSubmissionOperation(current), artifact: clone(raced) };
      preparedComponents.set(current.operationId, clone(artifact));
      return { status: 'prepared', operation: cloneBookSubmissionOperation(current), artifact: clone(artifact) };
    },
  };
};

interface StoredState {
  readonly operations?: Record<string, BookSubmissionOperation>;
  readonly preparedComponents?: Record<string, PreparedComponentPdfArtifact>;
}
const safeId = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;
const path = (ownerId: string) => `book_submission_operations/${ownerId}`;
const dbUrl = (value: unknown, allowInsecureLocalhost = false): string => {
  if (typeof value !== 'string' || !value.trim()) throw new Error('book_submission_database_unavailable');
  let url: URL; try { url = new URL(value); } catch { throw new Error('book_submission_database_unavailable'); }
  const localHttp = allowInsecureLocalhost && url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  const localNamespace = localHttp && url.search === '?ns=demo-luyentap-local';
  if ((!localHttp && url.protocol !== 'https:') || url.username || url.password || (url.search && !localNamespace) || url.hash) throw new Error('book_submission_database_unavailable');
  return url.href.replace(/\/$/u, '');
};
const parseServiceAccount = (env: Record<string, unknown>) => {
  const identity = env.BOOK_SUBMISSION_SERVICE_IDENTITY; const raw = env.BOOK_SUBMISSION_GOOGLE_SA_KEY;
  if (typeof identity !== 'string' || typeof raw !== 'string') throw new Error('book_submission_service_unavailable');
  let value: Record<string, unknown> | null = null; try { value = JSON.parse(raw); } catch { value = null; }
  if (value?.client_email !== identity || typeof value.private_key !== 'string') throw new Error('book_submission_service_unavailable');
  return { email: identity, privateKey: value.private_key.replace(/\\n/gu, '\n') };
};

export const createFirebaseBookSubmissionRepository = (env: Record<string, unknown>): BookSubmissionRepository => {
  const endpoint = dbUrl(env.FIREBASE_DB_URL, env.LOCAL_EMULATOR_AUTH === 'true'); const sa = parseServiceAccount(env);
  const tokenProvider = env.LOCAL_EMULATOR_AUTH === 'true'
    ? { getAccessToken: async () => 'owner' }
    : createTrustedFirebaseRtdbServiceAccountAccessTokenProvider({ serviceAccountEmail: sa.email, serviceAccountPrivateKey: sa.privateKey });
  const request = async (ownerId: string, init: RequestInit = {}) => {
    if (!safeId.test(ownerId)) throw new BookSubmissionContractError('invalid_input');
    const token = await tokenProvider.getAccessToken();
    const url = new URL(endpoint); const query = url.search; url.search = ''; url.pathname = `${url.pathname.replace(/\/$/u, '')}/${path(ownerId)}.json`; url.search = query;
    return fetch(url.toString(), { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
  };
  const transact = async <T>(ownerId: string, update: (state: StoredState) => { value: T; next?: StoredState }): Promise<T> => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const read = await request(ownerId, { headers: { 'X-Firebase-ETag': 'true' } });
      if (!read.ok) throw new Error('book_submission_state_unavailable');
      const etag = read.headers.get('etag'); if (!etag) throw new Error('book_submission_state_unavailable');
      const raw = await read.json() as unknown; const state: StoredState = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as StoredState : {};
      const result = update(state); if (!result.next) return result.value;
      const write = await request(ownerId, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': etag }, body: JSON.stringify(result.next) });
      if (write.status === 412) continue; if (!write.ok) throw new Error('book_submission_state_unavailable'); return result.value;
    }
    throw new Error('book_submission_state_contention');
  };
  const readOwned = async (ownerId: string, operationId: string) => transact(ownerId, (state) => {
    const operation = state.operations?.[operationId]; if (!operation) throw new BookSubmissionContractError('operation_not_found');
    if (operation.ownerId !== ownerId) throw new BookSubmissionContractError('operation_owner_mismatch');
    return { value: operation };
  });
  return {
    async begin(input) {
      const ownerId = assertBookSubmissionId(input.ownerId); const fp = normalizeBookSubmissionFingerprint(input.fingerprint); const key = assertBookSubmissionIdempotencyKey(input.idempotencyKey);
      return transact(ownerId, (state) => {
        const operations = { ...(state.operations ?? {}) }; const existing = Object.values(operations).find((candidate) => candidate.idempotencyKey === key);
        if (existing) { if (existing.fingerprint !== fp) throw new BookSubmissionContractError('idempotency_conflict'); return { value: { status: 'replayed', operation: cloneBookSubmissionOperation(existing) } as BookSubmissionBeginResult }; }
        const createdAt = nowDefault(); const operation: BookSubmissionOperation = { schemaVersion: 1, operationId: assertBookSubmissionId(id('submission')), ownerId, finalBookId: assertBookSubmissionId(id('book')), idempotencyKey: key, fingerprint: fp, state: 'preparing', completedSteps: ['begin'], createdAt, updatedAt: createdAt };
        operations[operation.operationId] = operation; return { value: { status: 'created', operation: cloneBookSubmissionOperation(operation) } as BookSubmissionBeginResult, next: { ...state, operations } };
      });
    },
    async status(input) { return transact<BookSubmissionStatusResult>(input.ownerId, (state) => { const operation = state.operations?.[input.operationId]; if (!operation) throw new BookSubmissionContractError('operation_not_found'); if (operation.ownerId !== input.ownerId) throw new BookSubmissionContractError('operation_owner_mismatch'); const viewed: BookSubmissionOperation = { ...operation, completedSteps: operation.completedSteps.includes('status') ? operation.completedSteps : [...operation.completedSteps, 'status'] as BookSubmissionStep[], updatedAt: nowDefault() }; return { value: { status: viewed.state, operation: viewed, ...(viewed.state === 'committed' ? { receipt: receipt(viewed) } : {}) } as BookSubmissionStatusResult, next: { ...state, operations: { ...(state.operations ?? {}), [viewed.operationId]: viewed } } }; }); },
    async cancel(input) { const operation = await readOwned(input.ownerId, input.operationId); if (operation.state === 'canceled') return { status: 'replayed', operation }; if (operation.state === 'committed') throw new BookSubmissionContractError('invalid_transition'); if (operation.state === 'committing' && !leaseExpired(operation)) throw new BookSubmissionContractError('invalid_transition'); return transact<BookSubmissionCancelResult>(input.ownerId, (state) => { const current = state.operations?.[input.operationId]; if (!current) throw new BookSubmissionContractError('operation_not_found'); if (current.ownerId !== input.ownerId) throw new BookSubmissionContractError('operation_owner_mismatch'); if (current.state === 'canceled') return { value: { status: 'replayed', operation: current } as BookSubmissionCancelResult }; if (current.state === 'committed' || (current.state === 'committing' && !leaseExpired(current))) throw new BookSubmissionContractError('invalid_transition'); const value: BookSubmissionOperation = { ...current, state: 'canceled', canceledAt: nowDefault(), updatedAt: nowDefault(), commitLeaseId: undefined, commitLeaseExpiresAt: undefined, completedSteps: current.completedSteps.includes('cancel') ? current.completedSteps : [...current.completedSteps, 'cancel'] as BookSubmissionStep[] }; return { value: { status: 'canceled', operation: value } as BookSubmissionCancelResult, next: { ...state, operations: { ...(state.operations ?? {}), [value.operationId]: value } } }; }); },
    async commit(input) {
      const operation = await readOwned(input.ownerId, input.operationId);
      const fp = normalizeBookSubmissionFingerprint(input.fingerprint);
      if (fp !== operation.fingerprint) throw new BookSubmissionContractError('idempotency_conflict');
      if (operation.state === 'committed') return { status: 'replayed', operation, receipt: receipt(operation) };
      if (operation.state === 'canceled') throw new BookSubmissionContractError('invalid_transition');
      let preparedComponent: PreparedComponentPdfArtifact | undefined;
      const committing = await transact<BookSubmissionOperation>(input.ownerId, (state) => {
        preparedComponent = state.preparedComponents?.[input.operationId];
        const current = state.operations?.[input.operationId];
        if (!current) throw new BookSubmissionContractError('operation_not_found');
        if (current.ownerId !== input.ownerId) throw new BookSubmissionContractError('operation_owner_mismatch');
        if (current.state === 'committed') return { value: current };
        if (current.state === 'canceled') throw new BookSubmissionContractError('invalid_transition');
        if (current.state === 'committing' && !leaseExpired(current)) throw new BookSubmissionContractError('invalid_transition');
        const value: BookSubmissionOperation = {
          ...current,
          state: 'committing',
          commitLeaseId: crypto.randomUUID(),
          commitLeaseExpiresAt: Date.now() + COMMIT_LEASE_MS,
          updatedAt: nowDefault(),
          completedSteps: current.completedSteps.includes('commit')
            ? current.completedSteps
            : [...current.completedSteps, 'commit'] as BookSubmissionStep[],
        };
        return { value, next: { ...state, operations: { ...(state.operations ?? {}), [value.operationId]: value } } };
      });
      if (committing.state === 'committed') return { status: 'replayed', operation: committing, receipt: receipt(committing) };
      try {
        await input.commit(committing, preparedComponent ? clone(preparedComponent) : undefined);
      } catch (error) {
        await transact(input.ownerId, (state) => {
          const current = state.operations?.[input.operationId];
          if (!current || current.state !== 'committing' || current.commitLeaseId !== committing.commitLeaseId) return { value: undefined };
          const value: BookSubmissionOperation = { ...current, state: 'preparing', updatedAt: nowDefault(), commitLeaseId: undefined, commitLeaseExpiresAt: undefined };
          return { value: undefined, next: { ...state, operations: { ...(state.operations ?? {}), [value.operationId]: value } } };
        });
        throw error;
      }
      return transact<BookSubmissionCommitResult>(input.ownerId, (state) => {
        const current = state.operations?.[input.operationId];
        if (!current) throw new BookSubmissionContractError('operation_not_found');
        if (current.ownerId !== input.ownerId) throw new BookSubmissionContractError('operation_owner_mismatch');
        if (current.state === 'committed') return { value: { status: 'replayed', operation: current, receipt: receipt(current) } as BookSubmissionCommitResult };
        if (current.state !== 'committing' || current.commitLeaseId !== committing.commitLeaseId || leaseExpired(current)) throw new BookSubmissionContractError('invalid_transition');
        const committedAt = nowDefault();
        const value: BookSubmissionOperation = { ...current, state: 'committed', committedAt, updatedAt: committedAt, commitLeaseId: undefined, commitLeaseExpiresAt: undefined };
        return { value: { status: 'committed', operation: value, receipt: receipt(value) } as BookSubmissionCommitResult, next: { ...state, operations: { ...(state.operations ?? {}), [value.operationId]: value } } };
      });
    },
    async prepareComponent(input) {
      const operation = await readOwned(input.ownerId, input.operationId);
      const fp = normalizeBookSubmissionFingerprint(input.fingerprint);
      if (fp !== operation.fingerprint) throw new BookSubmissionContractError('idempotency_conflict');
      const existing = await transact<{ readonly operation: BookSubmissionOperation; readonly artifact?: PreparedComponentPdfArtifact }>(input.ownerId, (state) => ({
        value: { operation: state.operations?.[input.operationId] ?? operation, artifact: state.preparedComponents?.[input.operationId] },
      }));
      if (existing.artifact) {
        if (existing.operation.state === 'canceled') throw new BookSubmissionContractError('invalid_transition');
        return { status: 'replayed', operation: cloneBookSubmissionOperation(existing.operation), artifact: clone(existing.artifact) };
      }
      if (operation.state !== 'preparing') throw new BookSubmissionContractError('invalid_transition');
      const artifact = await input.prepare(cloneBookSubmissionOperation(operation));
      if (artifact.operationId !== operation.operationId || artifact.ownerId !== operation.ownerId || artifact.bookId !== operation.finalBookId || artifact.fingerprint !== operation.fingerprint || artifact.active !== false) throw new BookSubmissionContractError('invalid_input');
      return transact<{ status: 'prepared' | 'replayed'; operation: BookSubmissionOperation; artifact: PreparedComponentPdfArtifact }>(input.ownerId, (state) => {
        const current = state.operations?.[input.operationId];
        if (!current) throw new BookSubmissionContractError('operation_not_found');
        if (current.ownerId !== input.ownerId) throw new BookSubmissionContractError('operation_owner_mismatch');
        if (current.fingerprint !== fp || current.state !== 'preparing') throw new BookSubmissionContractError('invalid_transition');
        const raced = state.preparedComponents?.[input.operationId];
        if (raced) return { value: { status: 'replayed', operation: cloneBookSubmissionOperation(current), artifact: clone(raced) } as const };
        return { value: { status: 'prepared', operation: cloneBookSubmissionOperation(current), artifact: clone(artifact) } as const,
          next: { ...state, preparedComponents: { ...(state.preparedComponents ?? {}), [input.operationId]: artifact } } };
      });
    },
  };
};
