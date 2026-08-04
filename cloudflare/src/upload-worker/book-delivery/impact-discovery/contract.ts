/**
 * Cloudflare-local 39B boundary contract.
 *
 * The Worker project is built and tested as an isolated project.  This small
 * representation deliberately mirrors only the immutable read seam needed by
 * the Worker; #59 composition can inject the already-conforming root adapter
 * factories without making the Worker source graph depend on the app source
 * tree.
 */

export const BOOK_IMPACT_DISCOVERY_CONTRACT_VERSION = 1 as const;
export const BOOK_IMPACT_DISCOVERY_INPUT_VERSION = 1 as const;
export const BOOK_IMPACT_DISCOVERY_OUTPUT_VERSION = 1 as const;
export const BOOK_IMPACT_DISCOVERY_ADAPTER_VERSION = 1 as const;
export const BOOK_IMPACT_DISCOVERY_MAX_CONTEXTS = 100 as const;

export type BookImpactDiscoveryContextKind = 'solo' | 'homework';

export type BookImpactDiscoveryFailureCode =
  | 'invalid-actor'
  | 'unauthorized'
  | 'missing'
  | 'malformed'
  | 'cross-owner'
  | 'ambiguous'
  | 'stale'
  | 'uncertain'
  | 'unbounded'
  | 'unsupported';

export interface BookImpactDiscoveryAuthorization {
  readonly authorized: true;
  readonly actorId: string;
  readonly contextKind: BookImpactDiscoveryContextKind;
  readonly ownerScope: 'actor-owned-solo' | 'uploader-owned-homework';
  readonly maxContexts: number;
}

export interface BookImpactDiscoveryAuthorizationFailure {
  readonly authorized: false;
  readonly code: Extract<BookImpactDiscoveryFailureCode, 'invalid-actor' | 'unauthorized' | 'uncertain'>;
}

export type BookImpactDiscoveryAuthorizationResult =
  | BookImpactDiscoveryAuthorization
  | BookImpactDiscoveryAuthorizationFailure;

export interface BookImpactDiscoveryQuery {
  readonly actorId: string;
  readonly evaluatedAt: string;
  readonly limit?: number;
}

/** A bounded, complete owner/index read; pagination and truncation fail closed. */
export interface BookImpactDiscoveryReadPage {
  readonly contexts: readonly unknown[];
  readonly complete: true;
}

export interface BookImpactDiscoveryReadReader {
  authorize(input: { readonly actorId: string }): Promise<BookImpactDiscoveryAuthorizationResult>;
  readOwnedContexts(input: {
    readonly actorId: string;
    readonly limit: number;
  }): Promise<BookImpactDiscoveryReadPage>;
}

export interface BookImpactDiscoveryReadStore {
  /** Authorization metadata only; this must run before any context read. */
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

export interface BookImpactDiscoverySuccess {
  readonly status: 'ok';
  readonly contractVersion: typeof BOOK_IMPACT_DISCOVERY_CONTRACT_VERSION;
  readonly inputVersion: typeof BOOK_IMPACT_DISCOVERY_INPUT_VERSION;
  readonly outputVersion: typeof BOOK_IMPACT_DISCOVERY_OUTPUT_VERSION;
  readonly adapterId: string;
  readonly adapterVersion: number;
  readonly contextKind: BookImpactDiscoveryContextKind;
  readonly evaluatedAt: string;
  /** The injected adapter owns the detailed immutable impact-summary shape. */
  readonly impacts: readonly unknown[];
  readonly replacementScopes: readonly unknown[];
}

export interface BookImpactDiscoveryBlocked {
  readonly status: 'blocked';
  readonly contractVersion: typeof BOOK_IMPACT_DISCOVERY_CONTRACT_VERSION;
  readonly inputVersion: typeof BOOK_IMPACT_DISCOVERY_INPUT_VERSION;
  readonly outputVersion: typeof BOOK_IMPACT_DISCOVERY_OUTPUT_VERSION;
  readonly adapterId: string;
  readonly adapterVersion: number;
  readonly contextKind: BookImpactDiscoveryContextKind;
  readonly evaluatedAt: string;
  readonly code: BookImpactDiscoveryFailureCode;
}

export type BookImpactDiscoveryResult =
  | BookImpactDiscoverySuccess
  | BookImpactDiscoveryBlocked;

export interface BookImpactDiscoveryReadAdapter {
  readonly discover: (query: BookImpactDiscoveryQuery) => Promise<BookImpactDiscoveryResult>;
}

export type BookImpactDiscoveryReadAdapterFactory = (input: {
  readonly reader: BookImpactDiscoveryReadReader;
}) => BookImpactDiscoveryReadAdapter;

/**
 * 39B registers adapter factories only.  It does not activate a route or
 * choose a data source; those choices remain with #59 composition.
 */
export interface BookImpactDiscoveryReadAdapters {
  readonly solo: BookImpactDiscoveryReadAdapterFactory;
  readonly homework: BookImpactDiscoveryReadAdapterFactory;
}

const forbiddenKeys = new Set([
  'answer',
  'answerkey',
  'answers',
  'credential',
  'credentials',
  'pdf',
  'pdfbytes',
  'privateobjectkey',
  'objectkey',
  'providerauthority',
  'provider',
  'storagelocation',
  'bucket',
  'secret',
  'response',
  'teachernotes',
  'teacheronly',
  'prompt',
  'rawresponse',
]);

/** Used by the Worker projection before any response is serialized. */
export const containsBookImpactSensitiveKey = (value: unknown): boolean => {
  const seen = new WeakSet<object>();
  const visit = (candidate: unknown): boolean => {
    if (candidate === null || typeof candidate !== 'object') return false;
    if (seen.has(candidate)) return true;
    seen.add(candidate);
    return Reflect.ownKeys(candidate).some((key) => {
      if (typeof key === 'string'
        && forbiddenKeys.has(key.replace(/[^a-z0-9]/giu, '').toLowerCase())) return true;
      return visit((candidate as Record<string, unknown>)[key as string]);
    });
  };
  return visit(value);
};

/** A bounded deep freeze that rejects cycles and repeated references. */
export const freezeBookImpactValue = <T>(value: T): T => {
  const seen = new WeakSet<object>();
  const visit = (candidate: unknown): void => {
    if (candidate === null || typeof candidate !== 'object') return;
    if (seen.has(candidate)) throw new Error('book_impact_discovery_cycle');
    seen.add(candidate);
    Reflect.ownKeys(candidate).forEach((key) => {
      visit((candidate as Record<string, unknown>)[key as string]);
    });
    Object.freeze(candidate);
  };
  visit(value);
  return value;
};

export const isBookImpactDiscoverySafeId = (value: unknown): value is string => (
  typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/u.test(value)
);

export const isBookImpactDiscoveryTimestamp = (value: unknown): value is string => (
  typeof value === 'string'
  && Number.isFinite(Date.parse(value))
  && new Date(Date.parse(value)).toISOString() === value
);
