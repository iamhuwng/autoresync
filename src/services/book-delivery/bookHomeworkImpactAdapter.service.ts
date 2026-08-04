import {
  BOOK_IMPACT_DISCOVERY_ADAPTER_VERSION,
  BOOK_IMPACT_DISCOVERY_CONTRACT_VERSION,
  BOOK_IMPACT_DISCOVERY_EFFECTS,
  BOOK_IMPACT_DISCOVERY_INPUT_VERSION,
  BOOK_IMPACT_DISCOVERY_OUTPUT_VERSION,
  type BookImpactDiscoveryQuery,
  type BookImpactDiscoveryResult,
  type BookImpactEffectiveWindow,
  type BookHomeworkImpactReader,
} from './bookImpactDiscovery.types';
import {
  createBookImpactDiscoveryAdapter,
  isBookImpactEffectiveWindow,
} from './bookImpactDiscovery.engine';

export const BOOK_HOMEWORK_IMPACT_ADAPTER_ID = 'book-homework-impact-v1' as const;
export const BOOK_HOMEWORK_IMPACT_ADAPTER_VERSION = BOOK_IMPACT_DISCOVERY_ADAPTER_VERSION;

export const BOOK_HOMEWORK_IMPACT_ADAPTER_DECLARATION = Object.freeze({
  adapterId: BOOK_HOMEWORK_IMPACT_ADAPTER_ID,
  adapterVersion: BOOK_HOMEWORK_IMPACT_ADAPTER_VERSION,
  contextKind: 'homework' as const,
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
    verifiedAdapterVersion: BOOK_HOMEWORK_IMPACT_ADAPTER_VERSION,
  }),
});

export interface BookHomeworkImpactAdapter {
  readonly adapterId: typeof BOOK_HOMEWORK_IMPACT_ADAPTER_ID;
  readonly adapterVersion: typeof BOOK_HOMEWORK_IMPACT_ADAPTER_VERSION;
  readonly discover: (query: BookImpactDiscoveryQuery) => Promise<BookImpactDiscoveryResult>;
}

export interface BookHomeworkImpactAdapterOptions {
  readonly reader: BookHomeworkImpactReader;
}

const homeworkWindow = (value: unknown): value is BookImpactEffectiveWindow => (
  isBookImpactEffectiveWindow(value)
  && value.dueAt !== null
);

const homeworkPolicy = Object.freeze({
  adapterId: BOOK_HOMEWORK_IMPACT_ADAPTER_ID,
  adapterVersion: BOOK_HOMEWORK_IMPACT_ADAPTER_VERSION,
  contextKind: 'homework' as const,
  ownerScope: 'uploader-owned-homework' as const,
  contextOwnedByActor: (value: Record<string, unknown>, actorId: string): boolean => (
    value.ownerId === actorId
  ),
  validateContextWindow: homeworkWindow,
  validatePlacementWindow: homeworkWindow,
});

export const createBookHomeworkImpactAdapter = (
  options: BookHomeworkImpactAdapterOptions,
): BookHomeworkImpactAdapter => {
  if (!options || !options.reader
    || typeof options.reader.authorize !== 'function'
    || typeof options.reader.readOwnedContexts !== 'function') {
    throw new TypeError('book_homework_impact_reader_invalid');
  }
  const engine = createBookImpactDiscoveryAdapter({
    reader: options.reader,
    policy: homeworkPolicy,
  });
  return Object.freeze({
    adapterId: BOOK_HOMEWORK_IMPACT_ADAPTER_ID,
    adapterVersion: BOOK_HOMEWORK_IMPACT_ADAPTER_VERSION,
    discover: engine.discover,
  });
};

export const discoverBookHomeworkImpacts = async (input: {
  readonly reader: BookHomeworkImpactReader;
  readonly query: BookImpactDiscoveryQuery;
}): Promise<BookImpactDiscoveryResult> => createBookHomeworkImpactAdapter({
  reader: input.reader,
}).discover(input.query);

export const discoverHomeworkBookImpacts = discoverBookHomeworkImpacts;
