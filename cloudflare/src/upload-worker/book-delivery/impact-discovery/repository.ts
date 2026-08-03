import {
  createBookHomeworkImpactAdapter,
} from '../../../../../src/services/book-delivery/bookHomeworkImpactAdapter.service.ts';
import {
  createBookSoloImpactAdapter,
} from '../../../../../src/services/book-delivery/bookSoloImpactAdapter.service.ts';
import type {
  BookHomeworkImpactReader,
  BookSoloImpactReader,
} from '../../../../../src/services/book-delivery/bookImpactDiscovery.types.ts';
import {
  authorizeBookImpactRead,
  type BookImpactReadIdentity,
} from './authorization.ts';
import type {
  BookImpactDiscoveryAuthorizationResult,
  BookImpactDiscoveryContextKind,
  BookImpactDiscoveryReadPage,
  BookImpactDiscoveryQuery,
  BookImpactDiscoveryResult,
} from '../../../../../src/services/book-delivery/bookImpactDiscovery.types.ts';

export interface BookImpactDiscoveryReadStore {
  /** Authorization metadata only; this runs before any context read. */
  authorize(input: {
    readonly actorId: string;
    readonly contextKind: BookImpactDiscoveryContextKind;
  }): Promise<BookImpactDiscoveryAuthorizationResult>;
  /** One bounded, complete owner/index read; truncation and pagination fail closed. */
  readOwnedContexts(input: {
    readonly actorId: string;
    readonly contextKind: BookImpactDiscoveryContextKind;
    readonly limit: number;
  }): Promise<BookImpactDiscoveryReadPage>;
}

export interface BookImpactDiscoveryReadRepository {
  readonly discover: (
    contextKind: BookImpactDiscoveryContextKind,
    query: BookImpactDiscoveryQuery,
  ) => Promise<BookImpactDiscoveryResult>;
  readonly soloReader: BookSoloImpactReader;
  readonly homeworkReader: BookHomeworkImpactReader;
}

const readerFor = (
  store: BookImpactDiscoveryReadStore,
  contextKind: BookImpactDiscoveryContextKind,
) => ({
  authorize: (input: { readonly actorId: string }) => store.authorize({
    actorId: input.actorId,
    contextKind,
  }),
  readOwnedContexts: (input: { readonly actorId: string; readonly limit: number }) => store.readOwnedContexts({
    actorId: input.actorId,
    contextKind,
    limit: input.limit,
  }),
});

/**
 * Read-only Worker repository.  It has no write method by construction and
 * delegates owner/index reads only after the adapter's authorization call.
 */
export const createBookImpactDiscoveryReadRepository = (
  store: BookImpactDiscoveryReadStore,
): BookImpactDiscoveryReadRepository => {
  if (!store || typeof store.authorize !== 'function' || typeof store.readOwnedContexts !== 'function') {
    throw new TypeError('book_impact_discovery_read_store_invalid');
  }
  const soloReader = readerFor(store, 'solo');
  const homeworkReader = readerFor(store, 'homework');
  return Object.freeze({
    soloReader: Object.freeze(soloReader),
    homeworkReader: Object.freeze(homeworkReader),
    discover: (contextKind: BookImpactDiscoveryContextKind, query: BookImpactDiscoveryQuery) => (
      contextKind === 'solo'
        ? createBookSoloImpactAdapter({ reader: soloReader }).discover(query)
        : createBookHomeworkImpactAdapter({ reader: homeworkReader }).discover(query)
    ),
  });
};

/**
 * Adapter for a trusted service identity. Browser callers cannot supply this
 * object; route composition must derive it from the verified token.
 */
export const createBookImpactDiscoveryIdentity = (
  input: BookImpactReadIdentity,
): BookImpactDiscoveryAuthorizationResult => authorizeBookImpactRead(input);
