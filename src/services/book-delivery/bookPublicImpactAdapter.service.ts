import {
  BOOK_IMPACT_DISCOVERY_ADAPTER_VERSION,
  BOOK_IMPACT_DISCOVERY_CONTRACT_VERSION,
  BOOK_IMPACT_DISCOVERY_EFFECTS,
  BOOK_IMPACT_DISCOVERY_INPUT_VERSION,
  BOOK_IMPACT_DISCOVERY_OUTPUT_VERSION,
  type BookImpactDiscoveryQuery,
  type BookImpactDiscoveryResult,
  type BookPublicImpactReader,
} from './bookImpactDiscovery.types';
import { createBookImpactDiscoveryAdapter } from './bookImpactDiscovery.engine';

export const BOOK_PUBLIC_IMPACT_ADAPTER_ID = 'book-public-impact-v1' as const;
export const BOOK_PUBLIC_IMPACT_ADAPTER_VERSION = BOOK_IMPACT_DISCOVERY_ADAPTER_VERSION;

export const BOOK_PUBLIC_IMPACT_ADAPTER_DECLARATION = Object.freeze({
  adapterId: BOOK_PUBLIC_IMPACT_ADAPTER_ID,
  adapterVersion: BOOK_PUBLIC_IMPACT_ADAPTER_VERSION,
  contextKind: 'public-reference' as const,
  contractVersion: BOOK_IMPACT_DISCOVERY_CONTRACT_VERSION,
  input: Object.freeze({
    version: BOOK_IMPACT_DISCOVERY_INPUT_VERSION,
    immutable: true as const,
    requiredFields: Object.freeze([
      'frozen-placement-binding', 'book-impact-classification',
    ]) as readonly ['frozen-placement-binding', 'book-impact-classification'],
  }),
  classification: Object.freeze({
    version: BOOK_IMPACT_DISCOVERY_CONTRACT_VERSION,
    supportedEffects: BOOK_IMPACT_DISCOVERY_EFFECTS,
  }),
  sourceReplacement: Object.freeze({
    version: BOOK_IMPACT_DISCOVERY_CONTRACT_VERSION,
    mode: 'invalidation-only' as const,
    automaticUpdate: false as const,
  }),
  output: Object.freeze({
    version: BOOK_IMPACT_DISCOVERY_OUTPUT_VERSION,
    fields: Object.freeze(['impact-summary']) as readonly ['impact-summary'],
  }),
  conformance: Object.freeze({
    status: 'verified' as const,
    contractVersion: BOOK_IMPACT_DISCOVERY_CONTRACT_VERSION,
    verifiedAdapterVersion: BOOK_PUBLIC_IMPACT_ADAPTER_VERSION,
  }),
});

export interface BookPublicImpactAdapter {
  readonly adapterId: typeof BOOK_PUBLIC_IMPACT_ADAPTER_ID;
  readonly adapterVersion: typeof BOOK_PUBLIC_IMPACT_ADAPTER_VERSION;
  readonly discover: (query: BookImpactDiscoveryQuery) => Promise<BookImpactDiscoveryResult>;
}

export const createBookPublicImpactAdapter = (input: {
  readonly reader: BookPublicImpactReader;
}): BookPublicImpactAdapter => {
  if (!input || !input.reader || typeof input.reader.authorize !== 'function'
    || typeof input.reader.readOwnedContexts !== 'function') {
    throw new TypeError('book_public_impact_reader_invalid');
  }
  const engine = createBookImpactDiscoveryAdapter({
    reader: input.reader,
    policy: Object.freeze({
      adapterId: BOOK_PUBLIC_IMPACT_ADAPTER_ID,
      adapterVersion: BOOK_PUBLIC_IMPACT_ADAPTER_VERSION,
      contextKind: 'public-reference' as const,
      ownerScope: 'downstream-owner-public-reference' as const,
      contextOwnedByActor: (value: Record<string, unknown>, actorId: string): boolean => (
        value.ownerId === actorId
      ),
      validateContextWindow: (value: unknown): value is null => value === null,
      validatePlacementWindow: (value: unknown): value is null => value === null,
    }),
  });
  return Object.freeze({
    adapterId: BOOK_PUBLIC_IMPACT_ADAPTER_ID,
    adapterVersion: BOOK_PUBLIC_IMPACT_ADAPTER_VERSION,
    discover: engine.discover,
  });
};

export const discoverBookPublicImpacts = (input: {
  readonly reader: BookPublicImpactReader;
  readonly query: BookImpactDiscoveryQuery;
}): Promise<BookImpactDiscoveryResult> => createBookPublicImpactAdapter({
  reader: input.reader,
}).discover(input.query);
