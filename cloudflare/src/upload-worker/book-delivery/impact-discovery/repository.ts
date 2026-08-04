import {
  authorizeBookImpactRead,
  type BookImpactReadIdentity,
} from './authorization.ts';
import type {
  BookImpactDiscoveryAuthorizationResult,
  BookImpactDiscoveryContextKind,
  BookImpactDiscoveryQuery,
  BookImpactDiscoveryResult,
  BookImpactDiscoveryReadAdapters,
  BookImpactDiscoveryReadReader,
  BookImpactDiscoveryReadStore,
} from './contract.ts';

export type {
  BookImpactDiscoveryReadAdapters,
  BookImpactDiscoveryReadStore,
} from './contract.ts';

export interface BookImpactDiscoveryReadRepository {
  readonly discover: (
    contextKind: BookImpactDiscoveryContextKind,
    query: BookImpactDiscoveryQuery,
  ) => Promise<BookImpactDiscoveryResult>;
  readonly soloReader: BookImpactDiscoveryReadReader;
  readonly homeworkReader: BookImpactDiscoveryReadReader;
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
  adapters: BookImpactDiscoveryReadAdapters,
): BookImpactDiscoveryReadRepository => {
  if (!store || typeof store.authorize !== 'function' || typeof store.readOwnedContexts !== 'function') {
    throw new TypeError('book_impact_discovery_read_store_invalid');
  }
  if (!adapters || typeof adapters.solo !== 'function' || typeof adapters.homework !== 'function') {
    throw new TypeError('book_impact_discovery_read_adapters_invalid');
  }
  const soloReader = readerFor(store, 'solo');
  const homeworkReader = readerFor(store, 'homework');
  const soloAdapter = adapters.solo({ reader: soloReader });
  const homeworkAdapter = adapters.homework({ reader: homeworkReader });
  if (!soloAdapter || typeof soloAdapter.discover !== 'function'
    || !homeworkAdapter || typeof homeworkAdapter.discover !== 'function') {
    throw new TypeError('book_impact_discovery_read_adapter_invalid');
  }
  return Object.freeze({
    soloReader: Object.freeze(soloReader),
    homeworkReader: Object.freeze(homeworkReader),
    discover: (contextKind: BookImpactDiscoveryContextKind, query: BookImpactDiscoveryQuery) => (
      contextKind === 'solo'
        ? soloAdapter.discover(query)
        : homeworkAdapter.discover(query)
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
