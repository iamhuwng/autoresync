import { FirebaseRtdbRestClient, type RepositoryEnv } from '../../listening-authoring/rtdb.ts';
import type {
  ReplacementSagaLedger,
  ReplacementSagaRecord,
  ReplacementSagaState,
} from './contract.ts';
import { REPLACEMENT_SAGA_ROOT } from './contract.ts';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/u;
const HASH = /^[a-f0-9]{64}$/u;

export interface ReplacementSagaRepositoryEnv extends RepositoryEnv {
  BOOK_REPLACEMENT_SAGA_SERVICE_IDENTITY?: string;
  BOOK_REPLACEMENT_SAGA_GOOGLE_SA_KEY?: string;
}

interface IdempotencyPointer {
  readonly sagaId: string;
  readonly ownerId: string;
  readonly bookId: string;
  readonly requestFingerprint: string;
}

interface ReplacementSagaRoot {
  records?: Record<string, Record<string, ReplacementSagaRecord>>;
  by_idempotency?: Record<string, Record<string, Record<string, IdempotencyPointer>>>;
  readonly [key: string]: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const clone = <T>(value: T): T => structuredClone(value);

const rootFrom = (value: unknown): ReplacementSagaRoot => {
  if (value === null || value === undefined) return {};
  if (!isRecord(value)) throw new Error('invalid_replacement_saga_root');
  return clone(value) as ReplacementSagaRoot;
};

const validIdentity = (value: unknown): value is string => typeof value === 'string' && ID.test(value);
const validHash = (value: unknown): value is string => typeof value === 'string' && HASH.test(value);
const same = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);

const legalAggregateTransition = (from: ReplacementSagaState, to: ReplacementSagaState): boolean => (
  (from === 'accepted' && to === 'staging')
  || (from === 'staging' && (to === 'staged' || to === 'compensating'))
  || (from === 'staged' && (to === 'visible' || to === 'compensating'))
  || (from === 'visible' && to === 'contexts-pending')
  || (from === 'contexts-pending' && to === 'awaiting-retired-byte-deletion')
  || (from === 'compensating' && to === 'compensated')
);

const validSaga = (value: unknown, ownerId: string, sagaId: string): value is ReplacementSagaRecord => {
  const stateRevision = isRecord(value) ? value.stateRevision : undefined;
  if (!isRecord(value)
    || value.schemaVersion !== 1
    || value.ownerId !== ownerId
    || value.sagaId !== sagaId
    || !validIdentity(value.ownerId)
    || !validIdentity(value.bookId)
    || !validIdentity(value.planId)
    || !validIdentity(value.reviewId)
    || !validIdentity(value.idempotencyKey)
    || !validHash(value.tokenHash)
    || !validHash(value.requestFingerprint)
    || !validHash(value.planFingerprint)
    || !validHash(value.deltaFingerprint)
    || !validHash(value.snapshotFingerprint)
    || !validHash(value.adapterFingerprint)
    || !isRecord(value.contexts)
    || typeof stateRevision !== 'number'
    || !Number.isSafeInteger(stateRevision)
    || stateRevision < 0
    || typeof value.confirmationToken === 'string'
    || Object.hasOwn(value, 'token')) return false;
  return true;
};

const sameContextIdentity = (
  left: ReplacementSagaRecord['contexts'][string],
  right: ReplacementSagaRecord['contexts'][string],
): boolean => {
  const { state: _leftState, stateRevision: _leftRevision, ...leftIdentity } = left;
  const { state: _rightState, stateRevision: _rightRevision, ...rightIdentity } = right;
  return same(leftIdentity, rightIdentity);
};

const isSingleContextAdvance = (next: ReplacementSagaRecord, current: ReplacementSagaRecord): boolean => {
  const keys = Object.keys(current.contexts);
  if (!same([...keys].sort(), Object.keys(next.contexts).sort())) return false;
  let changed = 0;
  for (const key of keys) {
    const before = current.contexts[key];
    const after = next.contexts[key];
    if (!before || !after) return false;
    if (same(before, after)) continue;
    changed += 1;
    if (before.state !== 'pending'
      || after.state !== 'retired-revoked'
      || after.stateRevision !== before.stateRevision + 1
      || !sameContextIdentity(before, after)) return false;
  }
  return changed === 1
    && next.audit.retiredItemCount === current.audit.retiredItemCount + 1
    && same(next.stagedReceipt, current.stagedReceipt)
    && same(next.visibility, current.visibility)
    && same(next.retiredByteHandoff, current.retiredByteHandoff);
};

const allContextsRetired = (saga: ReplacementSagaRecord): boolean => (
  Object.values(saga.contexts).every((item) => item.state === 'retired-revoked')
  && saga.audit.retiredItemCount === Object.values(saga.contexts).filter((item) => item.state === 'retired-revoked').length
);

const validTransitionRecord = (
  next: ReplacementSagaRecord,
  current: ReplacementSagaRecord,
  expectedState: ReplacementSagaState,
  expectedRevision: number,
): boolean => validSaga(next, current.ownerId, current.sagaId)
  && current.state === expectedState
  && current.stateRevision === expectedRevision
  && next.ownerId === current.ownerId
  && next.sagaId === current.sagaId
  && next.bookId === current.bookId
  && next.planId === current.planId
  && next.planFingerprint === current.planFingerprint
  && next.reviewId === current.reviewId
  && next.idempotencyKey === current.idempotencyKey
  && next.tokenHash === current.tokenHash
  && next.deltaFingerprint === current.deltaFingerprint
  && next.snapshotFingerprint === current.snapshotFingerprint
  && next.adapterFingerprint === current.adapterFingerprint
  && same(next.revisionVector, current.revisionVector)
  && same(next.sourceSetDelta, current.sourceSetDelta)
  && same(next.sourceVersionIds, current.sourceVersionIds)
  && next.targetSourceSetRevision === current.targetSourceSetRevision
  && next.acceptedAt === current.acceptedAt
  && next.audit.itemCount === current.audit.itemCount
  && same(next.audit.oldSourceVersionIds, current.audit.oldSourceVersionIds)
  && same(next.audit.newSourceVersionIds, current.audit.newSourceVersionIds)
  && same(next.recovery, current.recovery)
  && next.requestFingerprint === current.requestFingerprint
  && next.stateRevision === current.stateRevision + 1
  && Number.isFinite(Date.parse(next.updatedAt))
  && Number.isFinite(Date.parse(current.updatedAt))
  && Date.parse(next.updatedAt) >= Date.parse(current.updatedAt)
  && (
    (current.state === 'contexts-pending'
      && next.state === 'contexts-pending'
      && isSingleContextAdvance(next, current))
    || (legalAggregateTransition(current.state, next.state)
      && same(next.contexts, current.contexts)
      && (current.state !== 'contexts-pending'
        || next.state !== 'awaiting-retired-byte-deletion'
        || (allContextsRetired(next) && next.retiredByteHandoff !== null))
      && (current.state === 'contexts-pending' && next.state === 'awaiting-retired-byte-deletion'
        ? allContextsRetired(next)
        : next.audit.retiredItemCount === current.audit.retiredItemCount))
  );

export class InMemoryReplacementSagaLedger implements ReplacementSagaLedger {
  private readonly records = new Map<string, ReplacementSagaRecord>();
  private readonly operations = new Map<string, IdempotencyPointer>();

  async findByIdempotency(input: { readonly ownerId: string; readonly bookId: string; readonly idempotencyKey: string }) {
    const pointer = this.operations.get(`${input.ownerId}/${input.bookId}/${input.idempotencyKey}`);
    return pointer ? clone(this.records.get(`${pointer.ownerId}/${pointer.sagaId}`) ?? null) : null;
  }

  async accept(input: { readonly saga: ReplacementSagaRecord }) {
    const saga = input.saga;
    const key = `${saga.ownerId}/${saga.bookId}/${saga.idempotencyKey}`;
    const existingPointer = this.operations.get(key);
    if (existingPointer) {
      const existing = this.records.get(`${existingPointer.ownerId}/${existingPointer.sagaId}`);
      if (!existing) throw new Error('replacement_saga_idempotency_index_corrupt');
      return existing.requestFingerprint === saga.requestFingerprint
        ? { status: 'replayed' as const, saga: clone(existing) }
        : { status: 'conflict' as const };
    }
    const recordKey = `${saga.ownerId}/${saga.sagaId}`;
    if (this.records.has(recordKey)) throw new Error('replacement_saga_id_collision');
    this.records.set(recordKey, clone(saga));
    const pointer = { sagaId: saga.sagaId, ownerId: saga.ownerId, bookId: saga.bookId, requestFingerprint: saga.requestFingerprint };
    this.operations.set(key, pointer);
    return { status: 'created' as const, saga: clone(saga) };
  }

  async read(input: { readonly ownerId: string; readonly sagaId: string }) {
    return clone(this.records.get(`${input.ownerId}/${input.sagaId}`) ?? null);
  }

  async compareAndSet(input: { readonly ownerId: string; readonly sagaId: string; readonly expectedState: ReplacementSagaState; readonly expectedRevision: number; readonly next: ReplacementSagaRecord }) {
    const key = `${input.ownerId}/${input.sagaId}`;
    const current = this.records.get(key);
    if (!current) return { status: 'missing' as const };
    if (!validTransitionRecord(input.next, current, input.expectedState, input.expectedRevision)) return { status: 'conflict' as const };
    this.records.set(key, clone(input.next));
    return { status: 'advanced' as const, saga: clone(input.next) };
  }
}

export class FirebaseRestReplacementSagaLedger implements ReplacementSagaLedger {
  private readonly rtdb: FirebaseRtdbRestClient;

  constructor(private readonly options: {
    readonly env: ReplacementSagaRepositoryEnv;
    readonly fetchImpl?: typeof fetch;
    readonly getAccessToken?: () => Promise<string>;
    readonly maxRetries?: number;
  }) {
    const identity = options.env.BOOK_REPLACEMENT_SAGA_SERVICE_IDENTITY?.trim();
    if (!identity) throw new Error('missing_replacement_saga_service_identity');
    const keyJson = (options.env.BOOK_REPLACEMENT_SAGA_GOOGLE_SA_KEY ?? options.env.GOOGLE_SA_KEY)?.trim();
    if (!keyJson && !options.getAccessToken) throw new Error('missing_replacement_saga_google_sa_key');
    if (keyJson) {
      let clientEmail: unknown;
      try { clientEmail = (JSON.parse(keyJson) as Record<string, unknown>).client_email; } catch { throw new Error('invalid_replacement_saga_google_sa_key'); }
      if (clientEmail !== identity) throw new Error('replacement_saga_service_identity_mismatch');
    }
    this.rtdb = new FirebaseRtdbRestClient({
      env: { ...options.env, GOOGLE_SA_KEY: keyJson },
      fetchImpl: options.fetchImpl ?? globalThis.fetch.bind(globalThis),
      getAccessToken: options.getAccessToken,
    });
  }

  async findByIdempotency(input: { readonly ownerId: string; readonly bookId: string; readonly idempotencyKey: string }) {
    if (!validIdentity(input.ownerId) || !validIdentity(input.bookId) || !validIdentity(input.idempotencyKey)) return null;
    const pointer = await this.rtdb.readValue(`${REPLACEMENT_SAGA_ROOT}/by_idempotency/${input.ownerId}/${input.bookId}/${input.idempotencyKey}`);
    if (!isRecord(pointer) || !validIdentity(pointer.sagaId) || pointer.ownerId !== input.ownerId || pointer.bookId !== input.bookId) return null;
    return this.read({ ownerId: input.ownerId, sagaId: pointer.sagaId });
  }

  async accept(input: { readonly saga: ReplacementSagaRecord }) {
    const saga = input.saga;
    if (!validSaga(saga, saga.ownerId, saga.sagaId)) throw new Error('invalid_replacement_saga');
    const maxRetries = this.options.maxRetries ?? 5;
    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      const current = await this.rtdb.readWithEtag<unknown>(REPLACEMENT_SAGA_ROOT);
      const root = rootFrom(current.data);
      const prior = root.by_idempotency?.[saga.ownerId]?.[saga.bookId]?.[saga.idempotencyKey];
      if (prior) {
        const existing = root.records?.[prior.ownerId]?.[prior.sagaId];
        if (!existing) throw new Error('replacement_saga_idempotency_index_corrupt');
        return existing.requestFingerprint === saga.requestFingerprint
          ? { status: 'replayed' as const, saga: clone(existing) }
          : { status: 'conflict' as const };
      }
      if (root.records?.[saga.ownerId]?.[saga.sagaId]) throw new Error('replacement_saga_id_collision');
      root.records ??= {};
      root.records[saga.ownerId] ??= {};
      root.records[saga.ownerId]![saga.sagaId] = clone(saga);
      root.by_idempotency ??= {};
      root.by_idempotency[saga.ownerId] ??= {};
      root.by_idempotency[saga.ownerId]![saga.bookId] ??= {};
      root.by_idempotency[saga.ownerId]![saga.bookId]![saga.idempotencyKey] = {
        sagaId: saga.sagaId, ownerId: saga.ownerId, bookId: saga.bookId, requestFingerprint: saga.requestFingerprint,
      };
      if (await this.rtdb.writeIfMatch(REPLACEMENT_SAGA_ROOT, root, current.etag)) return { status: 'created' as const, saga: clone(saga) };
    }
    throw new Error('replacement_saga_accept_cas_retries_exhausted');
  }

  async read(input: { readonly ownerId: string; readonly sagaId: string }) {
    if (!validIdentity(input.ownerId) || !validIdentity(input.sagaId)) return null;
    const value = await this.rtdb.readValue(`${REPLACEMENT_SAGA_ROOT}/records/${input.ownerId}/${input.sagaId}`);
    return validSaga(value, input.ownerId, input.sagaId) ? clone(value) : null;
  }

  async compareAndSet(input: { readonly ownerId: string; readonly sagaId: string; readonly expectedState: ReplacementSagaState; readonly expectedRevision: number; readonly next: ReplacementSagaRecord }) {
    if (!validIdentity(input.ownerId) || !validIdentity(input.sagaId)) return { status: 'conflict' as const };
    const maxRetries = this.options.maxRetries ?? 5;
    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      const current = await this.rtdb.readWithEtag<unknown>(REPLACEMENT_SAGA_ROOT);
      const root = rootFrom(current.data);
      const existing = root.records?.[input.ownerId]?.[input.sagaId];
      if (!existing) return { status: 'missing' as const };
      if (!validTransitionRecord(input.next, existing, input.expectedState, input.expectedRevision)) return { status: 'conflict' as const };
      root.records![input.ownerId]![input.sagaId] = clone(input.next);
      if (await this.rtdb.writeIfMatch(REPLACEMENT_SAGA_ROOT, root, current.etag)) return { status: 'advanced' as const, saga: clone(input.next) };
    }
    return { status: 'conflict' as const };
  }
}
