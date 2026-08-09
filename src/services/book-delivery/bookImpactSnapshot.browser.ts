import {
  BOOK_IMPACT_SNAPSHOT_SCHEMA_VERSION,
  isBookImpactSnapshotExpired,
  type BookImpactSnapshot,
  type BookImpactSnapshotReadResult,
} from './bookImpactSnapshot.types';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/u;

export class BookImpactSnapshotBrowserError extends Error {
  constructor(
    readonly code: 'invalid-request' | 'unauthorized' | 'unavailable' | 'malformed-response',
  ) {
    super(code);
    this.name = 'BookImpactSnapshotBrowserError';
  }
}

const isSnapshot = (value: unknown): value is BookImpactSnapshot => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const snapshot = value as Partial<BookImpactSnapshot>;
  return snapshot.schemaVersion === BOOK_IMPACT_SNAPSHOT_SCHEMA_VERSION
    && typeof snapshot.snapshotId === 'string'
    && typeof snapshot.actorId === 'string'
    && typeof snapshot.ownerId === 'string'
    && typeof snapshot.bookId === 'string'
    && typeof snapshot.inputFingerprint === 'string'
    && typeof snapshot.createdAt === 'string'
    && typeof snapshot.expiresAt === 'string'
    && Array.isArray(snapshot.adapters)
    && Array.isArray(snapshot.contexts);
};

export interface BookImpactSnapshotBrowserClient {
  readCurrent(input: {
    readonly actorId: string;
    readonly bookId: string;
    readonly expectedFingerprint?: string;
    readonly now?: string;
    readonly signal?: AbortSignal;
  }): Promise<BookImpactSnapshotReadResult>;
}

export const createBookImpactSnapshotBrowserClient = (options: {
  readonly getIdToken: () => Promise<string>;
  readonly fetchImpl?: typeof fetch;
  readonly basePath?: string;
}): BookImpactSnapshotBrowserClient => {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const basePath = (options.basePath ?? '/book-impact/snapshots').replace(/\/$/u, '');
  const client: BookImpactSnapshotBrowserClient = {
    async readCurrent(input): Promise<BookImpactSnapshotReadResult> {
      if (!ID.test(input.actorId) || !ID.test(input.bookId)) {
        throw new BookImpactSnapshotBrowserError('invalid-request');
      }
      const token = await options.getIdToken();
      if (!token) throw new BookImpactSnapshotBrowserError('unauthorized');
      const query = input.expectedFingerprint
        ? `?fingerprint=${encodeURIComponent(input.expectedFingerprint)}`
        : '';
      const response = await fetchImpl(`${basePath}/${encodeURIComponent(input.bookId)}${query}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        signal: input.signal,
      });
      if (response.status === 401 || response.status === 403) return { status: 'denied' };
      if (response.status === 404) return { status: 'missing' };
      if (response.status === 409 || response.status === 410) {
        const payload: unknown = await response.json();
        if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
          throw new BookImpactSnapshotBrowserError('malformed-response');
        }
        const result = payload as {
          status?: unknown;
          snapshotId?: unknown;
          expiresAt?: unknown;
        };
        if (response.status === 409
          && result.status === 'stale'
          && typeof result.snapshotId === 'string') {
          return { status: 'stale', snapshotId: result.snapshotId };
        }
        if (response.status === 410
          && result.status === 'expired'
          && typeof result.snapshotId === 'string'
          && typeof result.expiresAt === 'string') {
          return { status: 'expired', snapshotId: result.snapshotId, expiresAt: result.expiresAt };
        }
        throw new BookImpactSnapshotBrowserError('malformed-response');
      }
      if (!response.ok) throw new BookImpactSnapshotBrowserError('unavailable');
      const payload: unknown = await response.json();
      if (!isSnapshot(payload)) throw new BookImpactSnapshotBrowserError('malformed-response');
      if (payload.actorId !== input.actorId
        || payload.ownerId !== input.actorId
        || payload.bookId !== input.bookId) {
        return { status: 'denied' };
      }
      if (input.expectedFingerprint && payload.inputFingerprint !== input.expectedFingerprint) {
        return { status: 'stale', snapshotId: payload.snapshotId };
      }
      const now = input.now ?? new Date().toISOString();
      if (isBookImpactSnapshotExpired(payload, now)) {
        return { status: 'expired', snapshotId: payload.snapshotId, expiresAt: payload.expiresAt };
      }
      return { status: 'ready', snapshot: payload };
    },
  };
  return Object.freeze(client);
};
