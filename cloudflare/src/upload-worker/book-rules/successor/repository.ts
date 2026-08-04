import { FirebaseRtdbRestClient, type RepositoryEnv } from '../../listening-authoring/rtdb.ts';

export const BOOK_SUCCESSOR_CATALOG_PATH = 'material_catalog';
export const BOOK_SUCCESSOR_BOOKS_PATH = 'material_catalog/books';
export const BOOK_SUCCESSOR_OPERATIONS_PATH = 'material_catalog/book_successor_operations';

export interface BookSuccessorRoot {
  books?: Record<string, unknown>;
  book_successor_operations?: Record<string, unknown>;
  readonly [key: string]: unknown;
}

export interface BookSuccessorTransaction<T> {
  readonly outcome: T;
  readonly next?: BookSuccessorRoot;
  readonly write: boolean;
}

export interface BookSuccessorRepository {
  readValue(path: string): Promise<unknown>;
  transaction<T>(
    mutate: (current: BookSuccessorRoot) => BookSuccessorTransaction<T>,
    options?: { readonly beforeWrite?: () => Promise<void> },
  ): Promise<T>;
}

export interface BookSuccessorRepositoryEnv extends RepositoryEnv {
  BOOK_SUCCESSOR_SERVICE_IDENTITY?: string;
  BOOK_SUCCESSOR_GOOGLE_SA_KEY?: string;
}

export interface PersistedBookSuccessorOperation {
  readonly ownerId: string;
  readonly fingerprint: string;
  readonly result: Record<string, unknown>;
}

const clone = <T>(value: T): T => structuredClone(value);

const parseRoot = (value: unknown): BookSuccessorRoot => {
  if (value === null || value === undefined) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid_material_catalog_root');
  }

  const source = value as Record<string, unknown>;
  const books = source.books;
  const operations = source.book_successor_operations;
  if (books !== undefined && (books === null || typeof books !== 'object' || Array.isArray(books))) {
    throw new Error('invalid_material_catalog_books');
  }
  if (operations !== undefined && (operations === null || typeof operations !== 'object' || Array.isArray(operations))) {
    throw new Error('invalid_book_successor_operations');
  }

  return clone(source) as BookSuccessorRoot;
};

/**
 * Atomic seam over the canonical material-catalog root. Mutation code is
 * responsible for changing only books and book_successor_operations; this
 * repository preserves all unrelated catalog children byte-for-byte.
 */
export class FirebaseRestBookSuccessorRepository implements BookSuccessorRepository {
  private readonly rtdb: FirebaseRtdbRestClient;

  constructor(private readonly options: {
    env: BookSuccessorRepositoryEnv;
    fetchImpl?: typeof fetch;
    getAccessToken?: () => Promise<string>;
    maxRetries?: number;
  }) {
    const identity = options.env.BOOK_SUCCESSOR_SERVICE_IDENTITY?.trim();
    if (!identity) throw new Error('missing_book_successor_service_identity');
    const keyJson = (
      options.env.BOOK_SUCCESSOR_GOOGLE_SA_KEY
      ?? options.env.GOOGLE_SA_KEY
    )?.trim();
    if (!keyJson) throw new Error('missing_book_successor_google_sa_key');
    let clientEmail: unknown;
    try {
      clientEmail = (JSON.parse(keyJson) as Record<string, unknown>).client_email;
    } catch {
      throw new Error('invalid_book_successor_google_sa_key');
    }
    if (clientEmail !== identity) throw new Error('book_successor_service_identity_mismatch');
    this.rtdb = new FirebaseRtdbRestClient({
      env: { ...options.env, GOOGLE_SA_KEY: keyJson },
      fetchImpl: options.fetchImpl ?? globalThis.fetch.bind(globalThis),
      getAccessToken: options.getAccessToken,
    });
  }

  async readValue(path: string): Promise<unknown> {
    if (!/^users\/[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/u.test(path)) {
      throw new Error('book_successor_read_path_forbidden');
    }
    return this.rtdb.readValue(path);
  }

  async transaction<T>(
    mutate: (current: BookSuccessorRoot) => BookSuccessorTransaction<T>,
    options: { readonly beforeWrite?: () => Promise<void> } = {},
  ): Promise<T> {
    const maxRetries = this.options.maxRetries ?? 5;
    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      const current = await this.rtdb.readWithEtag<unknown>(BOOK_SUCCESSOR_CATALOG_PATH);
      const mutation = mutate(parseRoot(current.data));
      if (!mutation.write) return mutation.outcome;
      await options.beforeWrite?.();
      const next = parseRoot(mutation.next ?? {});
      if (await this.rtdb.writeIfMatch(BOOK_SUCCESSOR_CATALOG_PATH, next, current.etag)) {
        return mutation.outcome;
      }
    }
    throw new Error('book_successor_catalog_cas_retries_exhausted');
  }
}
