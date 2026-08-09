import type {
  BookImpactSnapshot,
  BookImpactSnapshotReadResult,
} from '../../../../src/services/book-delivery/bookImpactSnapshot.types.ts';
import { isBookImpactSnapshotExpired } from '../../../../src/services/book-delivery/bookImpactSnapshot.types.ts';
import { FirebaseRtdbRestClient, type RepositoryEnv } from '../listening-authoring/rtdb.ts';
import type { BookImpactSnapshotRepository } from './impact-snapshot.ts';

export const BOOK_IMPACT_SNAPSHOT_ROOT = 'book_impact_snapshots';
const ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/u;

interface SnapshotPointer {
  readonly snapshotId: string;
  readonly inputFingerprint: string;
  readonly createdAt: string;
  readonly expiresAt: string;
}

interface SnapshotRoot {
  records?: Record<string, Record<string, BookImpactSnapshot>>;
  current?: Record<string, Record<string, SnapshotPointer>>;
  indexes?: {
    by_book?: Record<string, Record<string, Record<string, SnapshotPointer>>>;
  };
  readonly [key: string]: unknown;
}

export interface BookImpactSnapshotRepositoryEnv extends RepositoryEnv {
  BOOK_IMPACT_SNAPSHOT_SERVICE_IDENTITY?: string;
  BOOK_IMPACT_SNAPSHOT_GOOGLE_SA_KEY?: string;
}

const record = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const rootFrom = (value: unknown): SnapshotRoot => {
  if (value === null || value === undefined) return {};
  if (!record(value)) throw new Error('invalid_book_impact_snapshot_root');
  return structuredClone(value) as SnapshotRoot;
};

const at = (root: SnapshotRoot, ownerId: string, snapshotId: string): BookImpactSnapshot | null => (
  root.records?.[ownerId]?.[snapshotId] ?? null
);

const pointerFor = (snapshot: BookImpactSnapshot): SnapshotPointer => ({
  snapshotId: snapshot.snapshotId,
  inputFingerprint: snapshot.inputFingerprint,
  createdAt: snapshot.createdAt,
  expiresAt: snapshot.expiresAt,
});

export class FirebaseRestBookImpactSnapshotRepository implements BookImpactSnapshotRepository {
  private readonly rtdb: FirebaseRtdbRestClient;

  constructor(private readonly options: {
    readonly env: BookImpactSnapshotRepositoryEnv;
    readonly fetchImpl?: typeof fetch;
    readonly getAccessToken?: () => Promise<string>;
    readonly maxRetries?: number;
  }) {
    const identity = options.env.BOOK_IMPACT_SNAPSHOT_SERVICE_IDENTITY?.trim();
    if (!identity) throw new Error('missing_book_impact_snapshot_service_identity');
    const keyJson = (
      options.env.BOOK_IMPACT_SNAPSHOT_GOOGLE_SA_KEY
      ?? options.env.GOOGLE_SA_KEY
    )?.trim();
    if (!keyJson) throw new Error('missing_book_impact_snapshot_google_sa_key');
    let clientEmail: unknown;
    try {
      clientEmail = (JSON.parse(keyJson) as Record<string, unknown>).client_email;
    } catch {
      throw new Error('invalid_book_impact_snapshot_google_sa_key');
    }
    if (clientEmail !== identity) throw new Error('book_impact_snapshot_service_identity_mismatch');
    this.rtdb = new FirebaseRtdbRestClient({
      env: { ...options.env, GOOGLE_SA_KEY: keyJson },
      fetchImpl: options.fetchImpl ?? globalThis.fetch.bind(globalThis),
      getAccessToken: options.getAccessToken,
    });
  }

  async save(snapshot: BookImpactSnapshot): Promise<{
    readonly status: 'created' | 'reused';
    readonly snapshot: BookImpactSnapshot;
  }> {
    if (!ID.test(snapshot.ownerId) || !ID.test(snapshot.bookId) || !ID.test(snapshot.snapshotId)
      || snapshot.ownerId !== snapshot.actorId) {
      throw new Error('invalid_book_impact_snapshot_identity');
    }
    const maxRetries = this.options.maxRetries ?? 5;
    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      const current = await this.rtdb.readWithEtag<unknown>(BOOK_IMPACT_SNAPSHOT_ROOT);
      const root = rootFrom(current.data);
      const active = root.current?.[snapshot.ownerId]?.[snapshot.bookId];
      const existing = active ? at(root, snapshot.ownerId, active.snapshotId) : null;
      if (existing
        && existing.ownerId === snapshot.ownerId
        && existing.bookId === snapshot.bookId
        && existing.inputFingerprint === snapshot.inputFingerprint
        && !isBookImpactSnapshotExpired(existing, snapshot.createdAt)) {
        return { status: 'reused', snapshot: structuredClone(existing) };
      }
      const pointer = pointerFor(snapshot);
      root.records ??= {};
      root.records[snapshot.ownerId] ??= {};
      if (root.records[snapshot.ownerId]![snapshot.snapshotId]) {
        throw new Error('book_impact_snapshot_id_collision');
      }
      root.records[snapshot.ownerId]![snapshot.snapshotId] = structuredClone(snapshot);
      root.current ??= {};
      root.current[snapshot.ownerId] ??= {};
      root.current[snapshot.ownerId]![snapshot.bookId] = pointer;
      root.indexes ??= {};
      root.indexes.by_book ??= {};
      root.indexes.by_book[snapshot.ownerId] ??= {};
      root.indexes.by_book[snapshot.ownerId]![snapshot.bookId] ??= {};
      root.indexes.by_book[snapshot.ownerId]![snapshot.bookId]![snapshot.snapshotId] = pointer;
      if (await this.rtdb.writeIfMatch(BOOK_IMPACT_SNAPSHOT_ROOT, root, current.etag)) {
        return { status: 'created', snapshot };
      }
    }
    throw new Error('book_impact_snapshot_cas_retries_exhausted');
  }

  async readCurrent(input: {
    readonly actorId: string;
    readonly bookId: string;
    readonly expectedFingerprint?: string;
    readonly now: string;
  }): Promise<BookImpactSnapshotReadResult> {
    if (!ID.test(input.actorId) || !ID.test(input.bookId) || !Number.isFinite(Date.parse(input.now))) {
      return { status: 'denied' };
    }
    const pointerValue = await this.rtdb.readValue(
      `${BOOK_IMPACT_SNAPSHOT_ROOT}/current/${input.actorId}/${input.bookId}`,
    );
    if (!record(pointerValue) || typeof pointerValue.snapshotId !== 'string'
      || !ID.test(pointerValue.snapshotId)) return { status: 'missing' };
    const snapshotValue = await this.rtdb.readValue(
      `${BOOK_IMPACT_SNAPSHOT_ROOT}/records/${input.actorId}/${pointerValue.snapshotId}`,
    );
    if (!record(snapshotValue)) return { status: 'missing' };
    const snapshot = snapshotValue as unknown as BookImpactSnapshot;
    if (snapshot.ownerId !== input.actorId
      || snapshot.actorId !== input.actorId
      || snapshot.bookId !== input.bookId
      || snapshot.snapshotId !== pointerValue.snapshotId) {
      return { status: 'denied' };
    }
    if (input.expectedFingerprint && snapshot.inputFingerprint !== input.expectedFingerprint) {
      return { status: 'stale', snapshotId: snapshot.snapshotId };
    }
    if (isBookImpactSnapshotExpired(snapshot, input.now)) {
      return { status: 'expired', snapshotId: snapshot.snapshotId, expiresAt: snapshot.expiresAt };
    }
    return { status: 'ready', snapshot: structuredClone(snapshot) };
  }
}
