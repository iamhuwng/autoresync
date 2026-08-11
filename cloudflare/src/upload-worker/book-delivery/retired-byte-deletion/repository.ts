import { FirebaseRtdbRestClient, type RepositoryEnv } from '../../listening-authoring/rtdb.ts';
import type {
  RetiredByteDeletionRecord,
  RetiredByteDeletionRepository,
  RetiredByteDeletionState,
} from './contract.ts';
import { RETIRED_BYTE_DELETION_ROOT } from './contract.ts';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,191}$/u;
const HASH = /^[a-f0-9]{64}$/u;

interface RetiredByteDeletionRoot {
  records?: Record<string, Record<string, RetiredByteDeletionRecord>>;
  by_idempotency?: Record<string, Record<string, Record<string, {
    readonly deletionId: string;
    readonly ownerId: string;
    readonly bookId: string;
    readonly requestFingerprint: string;
  }>>>;
  readonly [key: string]: unknown;
}

const clone = <T>(value: T): T => structuredClone(value);
const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);
const same = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);
const validId = (value: unknown): value is string => typeof value === 'string' && ID.test(value);
const validHash = (value: unknown): value is string => typeof value === 'string' && HASH.test(value);

const rootFrom = (value: unknown): RetiredByteDeletionRoot => {
  if (value === null || value === undefined) return {};
  if (!isRecord(value)) throw new Error('invalid_retired_byte_deletion_root');
  return clone(value) as RetiredByteDeletionRoot;
};

const validRecord = (value: unknown, ownerId: string, deletionId: string): value is RetiredByteDeletionRecord => (
  isRecord(value)
  && value.schemaVersion === 1
  && value.ownerId === ownerId
  && value.deletionId === deletionId
  && validId(ownerId)
  && validId(deletionId)
  && validId(value.bookId)
  && validId(value.operationId)
  && validId(value.idempotencyKey)
  && validHash(value.requestFingerprint)
  && Array.isArray(value.sourceVersionIds)
  && value.sourceVersionIds.length === 1
  && value.sourceVersionIds[0] === value.sourceVersionId
  && (value.state === 'queued' || value.state === 'preflighted'
    || value.state === 'delete-started' || value.state === 'absence-verified' || value.state === 'settled')
  && Number.isSafeInteger(value.stateRevision)
  && (value.stateRevision as number) >= 0
);

const legalTransition = (from: RetiredByteDeletionState, to: RetiredByteDeletionState): boolean => (
  (from === 'queued' && to === 'preflighted')
  || (from === 'preflighted' && (to === 'delete-started' || to === 'absence-verified'))
  || (from === 'delete-started' && to === 'absence-verified')
  || (from === 'absence-verified' && to === 'settled')
);

const sameImmutableFields = (
  current: RetiredByteDeletionRecord,
  next: RetiredByteDeletionRecord,
): boolean => {
  const mutable = new Set([
    'state', 'stateRevision', 'updatedAt', 'identity', 'preDelete',
    'providerProof', 'irreversibleEffect', 'capacity',
  ]);
  const left = Object.fromEntries(Object.entries(current).filter(([key]) => !mutable.has(key)));
  const right = Object.fromEntries(Object.entries(next).filter(([key]) => !mutable.has(key)));
  return same(left, right)
    && next.recovery.metadataOnly === true
    && next.recovery.rollbackAfterBoundary === 'not-available';
};

const validTransition = (
  current: RetiredByteDeletionRecord,
  next: RetiredByteDeletionRecord,
  expectedState: RetiredByteDeletionState,
  expectedRevision: number,
): boolean => (
  validRecord(next, current.ownerId, current.deletionId)
  && current.state === expectedState
  && current.stateRevision === expectedRevision
  && next.stateRevision === current.stateRevision + 1
  && legalTransition(current.state, next.state)
  && sameImmutableFields(current, next)
  && (current.identity === null || same(current.identity, next.identity))
  && (current.preDelete === null || same(current.preDelete, next.preDelete))
  && (current.providerProof === null || same(current.providerProof, next.providerProof))
  && Date.parse(next.updatedAt) >= Date.parse(current.updatedAt)
  && (next.state !== 'settled' || next.capacity.status === 'settled')
);

export class InMemoryRetiredByteDeletionRepository implements RetiredByteDeletionRepository {
  private readonly records = new Map<string, RetiredByteDeletionRecord>();
  private readonly operations = new Map<string, {
    readonly deletionId: string;
    readonly ownerId: string;
    readonly bookId: string;
    readonly requestFingerprint: string;
  }>();

  async findByIdempotency(input: { readonly ownerId: string; readonly bookId: string; readonly idempotencyKey: string }) {
    const pointer = this.operations.get(`${input.ownerId}/${input.bookId}/${input.idempotencyKey}`);
    return pointer ? clone(this.records.get(`${pointer.ownerId}/${pointer.deletionId}`) ?? null) : null;
  }

  async enqueue(input: { readonly record: RetiredByteDeletionRecord }) {
    const record = input.record;
    const key = `${record.ownerId}/${record.bookId}/${record.idempotencyKey}`;
    const prior = this.operations.get(key);
    if (prior) {
      const existing = this.records.get(`${prior.ownerId}/${prior.deletionId}`);
      if (!existing) throw new Error('retired_byte_deletion_idempotency_index_corrupt');
      return existing.requestFingerprint === record.requestFingerprint
        ? { status: 'replayed' as const, record: clone(existing) }
        : { status: 'conflict' as const };
    }
    if (this.records.has(`${record.ownerId}/${record.deletionId}`)) {
      throw new Error('retired_byte_deletion_id_collision');
    }
    this.records.set(`${record.ownerId}/${record.deletionId}`, clone(record));
    this.operations.set(key, {
      deletionId: record.deletionId,
      ownerId: record.ownerId,
      bookId: record.bookId,
      requestFingerprint: record.requestFingerprint,
    });
    return { status: 'created' as const, record: clone(record) };
  }

  async read(input: { readonly ownerId: string; readonly deletionId: string }) {
    const record = this.records.get(`${input.ownerId}/${input.deletionId}`);
    return record && validRecord(record, input.ownerId, input.deletionId) ? clone(record) : null;
  }

  async compareAndSet(input: {
    readonly ownerId: string;
    readonly deletionId: string;
    readonly expectedState: RetiredByteDeletionState;
    readonly expectedRevision: number;
    readonly next: RetiredByteDeletionRecord;
  }) {
    const key = `${input.ownerId}/${input.deletionId}`;
    const current = this.records.get(key);
    if (!current) return { status: 'missing' as const };
    if (!validTransition(current, input.next, input.expectedState, input.expectedRevision)) {
      return { status: 'conflict' as const };
    }
    this.records.set(key, clone(input.next));
    return { status: 'advanced' as const, record: clone(input.next) };
  }
}

export interface RetiredByteDeletionRepositoryEnv extends RepositoryEnv {
  BOOK_RETIRED_BYTE_DELETION_SERVICE_IDENTITY?: string;
  BOOK_RETIRED_BYTE_DELETION_GOOGLE_SA_KEY?: string;
}

export class FirebaseRestRetiredByteDeletionRepository implements RetiredByteDeletionRepository {
  private readonly rtdb: FirebaseRtdbRestClient;

  constructor(private readonly options: {
    readonly env: RetiredByteDeletionRepositoryEnv;
    readonly fetchImpl?: typeof fetch;
    readonly getAccessToken?: () => Promise<string>;
    readonly maxRetries?: number;
  }) {
    const identity = options.env.BOOK_RETIRED_BYTE_DELETION_SERVICE_IDENTITY?.trim();
    if (identity !== 'book_retired_byte_deletion_service') {
      throw new Error('missing_retired_byte_deletion_service_identity');
    }
    const keyJson = (options.env.BOOK_RETIRED_BYTE_DELETION_GOOGLE_SA_KEY ?? options.env.GOOGLE_SA_KEY)?.trim();
    if (!keyJson && !options.getAccessToken) throw new Error('missing_retired_byte_deletion_google_sa_key');
    this.rtdb = new FirebaseRtdbRestClient({
      env: { ...options.env, GOOGLE_SA_KEY: keyJson },
      fetchImpl: options.fetchImpl ?? globalThis.fetch.bind(globalThis),
      getAccessToken: options.getAccessToken,
    });
  }

  async findByIdempotency(input: { readonly ownerId: string; readonly bookId: string; readonly idempotencyKey: string }) {
    if (![input.ownerId, input.bookId, input.idempotencyKey].every(validId)) return null;
    const value = await this.rtdb.readValue(`${RETIRED_BYTE_DELETION_ROOT}/by_idempotency/${input.ownerId}/${input.bookId}/${input.idempotencyKey}`);
    if (!isRecord(value) || !validId(value.deletionId) || value.ownerId !== input.ownerId || value.bookId !== input.bookId) return null;
    return this.read({ ownerId: input.ownerId, deletionId: value.deletionId });
  }

  async enqueue(input: { readonly record: RetiredByteDeletionRecord }) {
    const record = input.record;
    const maxRetries = this.options.maxRetries ?? 5;
    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      const current = await this.rtdb.readWithEtag<unknown>(RETIRED_BYTE_DELETION_ROOT);
      const root = rootFrom(current.data);
      const prior = root.by_idempotency?.[record.ownerId]?.[record.bookId]?.[record.idempotencyKey];
      if (prior) {
        const existing = root.records?.[prior.ownerId]?.[prior.deletionId];
        if (!existing) throw new Error('retired_byte_deletion_idempotency_index_corrupt');
        return existing.requestFingerprint === record.requestFingerprint
          ? { status: 'replayed' as const, record: clone(existing) }
          : { status: 'conflict' as const };
      }
      if (root.records?.[record.ownerId]?.[record.deletionId]) throw new Error('retired_byte_deletion_id_collision');
      root.records ??= {};
      root.records[record.ownerId] ??= {};
      root.records[record.ownerId]![record.deletionId] = clone(record);
      root.by_idempotency ??= {};
      root.by_idempotency[record.ownerId] ??= {};
      root.by_idempotency[record.ownerId]![record.bookId] ??= {};
      root.by_idempotency[record.ownerId]![record.bookId]![record.idempotencyKey] = {
        deletionId: record.deletionId,
        ownerId: record.ownerId,
        bookId: record.bookId,
        requestFingerprint: record.requestFingerprint,
      };
      if (await this.rtdb.writeIfMatch(RETIRED_BYTE_DELETION_ROOT, root, current.etag)) {
        return { status: 'created' as const, record: clone(record) };
      }
    }
    return { status: 'conflict' as const };
  }

  async read(input: { readonly ownerId: string; readonly deletionId: string }) {
    if (![input.ownerId, input.deletionId].every(validId)) return null;
    const value = await this.rtdb.readValue(`${RETIRED_BYTE_DELETION_ROOT}/records/${input.ownerId}/${input.deletionId}`);
    return validRecord(value, input.ownerId, input.deletionId) ? clone(value) : null;
  }

  async compareAndSet(input: {
    readonly ownerId: string;
    readonly deletionId: string;
    readonly expectedState: RetiredByteDeletionState;
    readonly expectedRevision: number;
    readonly next: RetiredByteDeletionRecord;
  }) {
    const maxRetries = this.options.maxRetries ?? 5;
    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      const current = await this.rtdb.readWithEtag<unknown>(RETIRED_BYTE_DELETION_ROOT);
      const root = rootFrom(current.data);
      const existing = root.records?.[input.ownerId]?.[input.deletionId];
      if (!existing || !validRecord(existing, input.ownerId, input.deletionId)) return { status: 'missing' as const };
      if (!validTransition(existing, input.next, input.expectedState, input.expectedRevision)) {
        return { status: 'conflict' as const };
      }
      root.records![input.ownerId]![input.deletionId] = clone(input.next);
      if (await this.rtdb.writeIfMatch(RETIRED_BYTE_DELETION_ROOT, root, current.etag)) {
        return { status: 'advanced' as const, record: clone(input.next) };
      }
    }
    return { status: 'conflict' as const };
  }
}
