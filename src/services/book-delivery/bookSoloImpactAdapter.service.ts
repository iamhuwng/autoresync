import {
  BOOK_IMPACT_DISCOVERY_ADAPTER_VERSION,
  BOOK_IMPACT_DISCOVERY_CONTRACT_VERSION,
  BOOK_IMPACT_DISCOVERY_EFFECTS,
  BOOK_IMPACT_DISCOVERY_INPUT_VERSION,
  BOOK_IMPACT_DISCOVERY_OUTPUT_VERSION,
  type BookImpactDiscoveryQuery,
  type BookImpactDiscoveryResult,
  type BookImpactEffectiveWindow,
  type BookSoloImpactReader,
} from './bookImpactDiscovery.types';
import {
  createBookImpactDiscoveryAdapter,
  isBookImpactEffectiveWindow,
} from './bookImpactDiscovery.engine';

export const BOOK_SOLO_IMPACT_ADAPTER_ID = 'book-solo-impact-v1' as const;
export const BOOK_SOLO_IMPACT_ADAPTER_VERSION = BOOK_IMPACT_DISCOVERY_ADAPTER_VERSION;

export const BOOK_SOLO_IMPACT_ADAPTER_DECLARATION = Object.freeze({
  adapterId: BOOK_SOLO_IMPACT_ADAPTER_ID,
  adapterVersion: BOOK_SOLO_IMPACT_ADAPTER_VERSION,
  contextKind: 'solo' as const,
  contractVersion: BOOK_IMPACT_DISCOVERY_CONTRACT_VERSION,
  input: Object.freeze({
    version: BOOK_IMPACT_DISCOVERY_INPUT_VERSION,
    immutable: true as const,
    requiredFields: Object.freeze([
      'frozen-placement-binding',
      'book-impact-classification',
    ]) as readonly ['frozen-placement-binding', 'book-impact-classification'],
  }),
  classification: Object.freeze({
    version: BOOK_IMPACT_DISCOVERY_CONTRACT_VERSION,
    supportedEffects: BOOK_IMPACT_DISCOVERY_EFFECTS,
  }),
  sourceReplacement: Object.freeze({
    version: BOOK_IMPACT_DISCOVERY_CONTRACT_VERSION,
    mode: 'owner-adopts-replacement' as const,
    automaticUpdate: false as const,
  }),
  output: Object.freeze({
    version: BOOK_IMPACT_DISCOVERY_OUTPUT_VERSION,
    fields: Object.freeze(['impact-summary']) as readonly ['impact-summary'],
  }),
  conformance: Object.freeze({
    status: 'verified' as const,
    contractVersion: BOOK_IMPACT_DISCOVERY_CONTRACT_VERSION,
    verifiedAdapterVersion: BOOK_SOLO_IMPACT_ADAPTER_VERSION,
  }),
});

export interface BookSoloImpactAdapter {
  readonly adapterId: typeof BOOK_SOLO_IMPACT_ADAPTER_ID;
  readonly adapterVersion: typeof BOOK_SOLO_IMPACT_ADAPTER_VERSION;
  readonly discover: (query: BookImpactDiscoveryQuery) => Promise<BookImpactDiscoveryResult>;
}

export interface BookSoloImpactAdapterOptions {
  readonly reader: BookSoloImpactReader;
}

const soloContextWindow = (value: unknown): value is BookImpactEffectiveWindow | null => (
  value === null || isBookImpactEffectiveWindow(value)
);

const soloPlacementWindow = (value: unknown): value is null => value === null;

const soloPolicy = Object.freeze({
  adapterId: BOOK_SOLO_IMPACT_ADAPTER_ID,
  adapterVersion: BOOK_SOLO_IMPACT_ADAPTER_VERSION,
  contextKind: 'solo' as const,
  ownerScope: 'actor-owned-solo' as const,
  contextOwnedByActor: (value: Record<string, unknown>, actorId: string): boolean => (
    value.ownerId === actorId && value.recipientId === actorId
  ),
  validateContextWindow: soloContextWindow,
  validatePlacementWindow: soloPlacementWindow,
});

export const createBookSoloImpactAdapter = (
  options: BookSoloImpactAdapterOptions,
): BookSoloImpactAdapter => {
  if (!options || !options.reader
    || typeof options.reader.authorize !== 'function'
    || typeof options.reader.readOwnedContexts !== 'function') {
    throw new TypeError('book_solo_impact_reader_invalid');
  }
  const engine = createBookImpactDiscoveryAdapter({
    reader: options.reader,
    policy: soloPolicy,
  });
  return Object.freeze({
    adapterId: BOOK_SOLO_IMPACT_ADAPTER_ID,
    adapterVersion: BOOK_SOLO_IMPACT_ADAPTER_VERSION,
    discover: engine.discover,
  });
};

export const discoverBookSoloImpacts = async (input: {
  readonly reader: BookSoloImpactReader;
  readonly query: BookImpactDiscoveryQuery;
}): Promise<BookImpactDiscoveryResult> => createBookSoloImpactAdapter({
  reader: input.reader,
}).discover(input.query);

export const discoverSoloBookImpacts = discoverBookSoloImpacts;
