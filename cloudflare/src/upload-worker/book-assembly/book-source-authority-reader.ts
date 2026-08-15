import {
  FirebaseRtdbRestClient,
  type FirebaseRtdbAuthRequest,
  type RepositoryEnv,
} from '../listening-authoring/rtdb.ts';
import {
  createFirebaseClaimTokenProvider,
  type BookFirebaseClaimTuple,
} from '../book-activity-authoring/firebase-token.ts';
import {
  readMaterialBookPdfAuthorityFromMetadata,
  type MaterialBookPdfAuthority,
} from '../../../../src/services/materialCatalog/materialBooks.service.ts';
import type {
  BookAssemblyBookAuthority,
} from '../../../../src/services/book-assembly/unitAssembly.types.ts';
import type {
  BookSourceVersionAuthority,
  TrustedBookSourceVersionProjection,
  SourceSetCandidate,
} from '../../../../src/types/bookAssembly.types.ts';

/** Canonical Material Book authority path. This is read before source state. */
export const MATERIAL_BOOK_PATH = (bookId: string): string =>
  `material_catalog/books/${bookId}`;

/**
 * Provider-free Source Upload aggregate projection path. The parent account
 * remains service-owned; Assembly reads only the book's immutable projection.
 */
export const BOOK_SOURCE_ASSEMBLY_PROJECTION_PATH = (
  accountId: string,
  bookId: string,
): string => `book_source_upload_accounts/${accountId}/assemblyBooks/${bookId}`;

/** Exact #118B least-privilege child; the Book projection parent is denied. */
export const BOOK_SOURCE_ASSEMBLY_PROJECTION_SOURCE_PATH = (
  accountId: string,
  bookId: string,
  sourceKey: string,
): string => `${BOOK_SOURCE_ASSEMBLY_PROJECTION_PATH(accountId, bookId)}/${sourceKey}`;

const ID = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/u;
const ACCOUNT_ID = /^[A-Za-z0-9_:@-]{1,256}$/u;
const SOURCE_PROJECTION_KEYS = [
  'ownerId',
  'bookId',
  'sourceKey',
  'sourceVersionId',
  'physicalPageCount',
  'verifiedUsable',
] as const;

type RecordValue = Record<string, unknown>;

export interface BookSourceAuthorityReadPort {
  readonly readValue: (path: string) => Promise<unknown>;
}

export interface ReadBookSourceAuthorityInput {
  /** Authenticated owner; never derive this from a Book row or source row. */
  readonly ownerId: string;
  readonly bookId: string;
}

export interface BookSourceAuthorityReaderOptions extends RepositoryEnv {
  /** Existing deployment account used by the Source Upload aggregate. */
  readonly BOOK_SOURCE_UPLOAD_ACCOUNT_ID: string;
  readonly fetchImpl?: typeof fetch;
  /** Existing scoped Firebase ID-token seam. */
  readonly getFirebaseAuthToken?: (
    request?: FirebaseRtdbAuthRequest,
  ) => Promise<string>;
  /** Existing OAuth seam, retained only for already-authorized trusted callers. */
  readonly getAccessToken?: (
    request?: FirebaseRtdbAuthRequest,
  ) => Promise<string>;
}

export interface BookSourceAuthorityReader {
  readonly read: (
    input: ReadBookSourceAuthorityInput,
  ) => Promise<BookAssemblyBookAuthority | null>;
}

const isRecord = (value: unknown): value is RecordValue => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

const exactKeys = (value: RecordValue, expected: readonly string[]): boolean => {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
};

const validId = (value: unknown): value is string =>
  typeof value === 'string' && ID.test(value);

const validAccountId = (value: unknown): value is string =>
  typeof value === 'string' && ACCOUNT_ID.test(value);

const validPageCount = (value: unknown): value is number =>
  typeof value === 'number'
  && Number.isSafeInteger(value)
  && value >= 1
  && value <= 100_000;

const cloneSourceSet = (sourceSet: SourceSetCandidate): SourceSetCandidate =>
  structuredClone(sourceSet);

const projectionFor = (
  value: unknown,
  input: ReadBookSourceAuthorityInput,
  sourceSet: SourceSetCandidate,
): ReadonlyMap<string, TrustedBookSourceVersionProjection> | null => {
  if (!isRecord(value)) return null;
  const sourceEntries = Object.entries(value);
  if (sourceEntries.length !== sourceSet.sources.length) return null;

  const byVersion = new Map<string, TrustedBookSourceVersionProjection>();
  const sourceKeys = new Set(sourceSet.sources.map((source) => source.sourceKey));
  for (const [sourceKey, rawProjection] of sourceEntries) {
    if (!sourceKeys.has(sourceKey) || !isRecord(rawProjection)
      || !exactKeys(rawProjection, SOURCE_PROJECTION_KEYS)) {
      return null;
    }
    const source = sourceSet.sources.find((candidate) => candidate.sourceKey === sourceKey);
    if (!source
      || rawProjection.ownerId !== input.ownerId
      || rawProjection.bookId !== input.bookId
      || rawProjection.sourceKey !== sourceKey
      || rawProjection.sourceVersionId !== source.sourceVersionId
      || rawProjection.verifiedUsable !== true
      || !validPageCount(rawProjection.physicalPageCount)
      || !validId(rawProjection.ownerId)
      || !validId(rawProjection.bookId)
      || !validId(rawProjection.sourceKey)
      || !validId(rawProjection.sourceVersionId)
      || byVersion.has(source.sourceVersionId)) {
      return null;
    }
    byVersion.set(source.sourceVersionId, Object.freeze({
      sourceVersionId: source.sourceVersionId,
      bookId: input.bookId,
      physicalPageCount: rawProjection.physicalPageCount,
      verifiedUsable: true,
    }));
  }
  return byVersion.size === sourceSet.sources.length ? byVersion : null;
};

const sourceVersionAuthority = (
  projections: ReadonlyMap<string, TrustedBookSourceVersionProjection>,
): BookSourceVersionAuthority => Object.freeze({
  getSourceVersion: (sourceVersionId: string): TrustedBookSourceVersionProjection | undefined =>
    projections.get(sourceVersionId),
});

/**
 * Pure parser for the canonical Book row and Source Upload aggregate
 * projection. It deliberately never reads or returns provider coordinates.
 */
export const parseBookSourceAuthority = (
  input: ReadBookSourceAuthorityInput & {
    readonly book: unknown;
    readonly sourceProjection: unknown;
  },
): BookAssemblyBookAuthority | null => {
  if (!validId(input.ownerId) || !validId(input.bookId)) return null;
  if (!isRecord(input.book) || input.book.bookId !== input.bookId
    || input.book.ownerId !== input.ownerId) return null;

  let authority: MaterialBookPdfAuthority | null;
  try {
    authority = readMaterialBookPdfAuthorityFromMetadata(input.book as never);
  } catch {
    return null;
  }
  if (!authority || authority.bookId !== input.bookId || authority.ownerId !== input.ownerId) {
    return null;
  }
  const projections = projectionFor(input.sourceProjection, input, authority.sourceSet);
  if (!projections) return null;

  return Object.freeze({
    bookId: authority.bookId,
    ownerId: authority.ownerId,
    bookMode: authority.bookMode,
    bookRevision: authority.bookRevision,
    sourceSetRevision: authority.sourceSetRevision,
    sourceSet: cloneSourceSet(authority.sourceSet),
    sourceVersionAuthority: sourceVersionAuthority(projections),
  });
};

/** Read authority through an already-configured Firebase REST port. */
export const readBookSourceAuthority = async (
  port: BookSourceAuthorityReadPort,
  input: ReadBookSourceAuthorityInput & { readonly accountId: string },
): Promise<BookAssemblyBookAuthority | null> => {
  if (!validId(input.ownerId) || !validId(input.bookId) || !validAccountId(input.accountId)) {
    return null;
  }

  // The Material Book row is the authority fence. In particular, a malformed
  // or revision-less row must not cause a source-account read.
  const book = await port.readValue(MATERIAL_BOOK_PATH(input.bookId));
  if (!isRecord(book) || book.bookId !== input.bookId || book.ownerId !== input.ownerId) {
    return null;
  }
  const materialAuthority = (() => {
    try {
      return readMaterialBookPdfAuthorityFromMetadata(book as never);
    } catch {
      return null;
    }
  })();
  if (!materialAuthority || materialAuthority.bookId !== input.bookId
    || materialAuthority.ownerId !== input.ownerId) {
    return null;
  }

  // The Book parent is intentionally never read: #118B grants only the
  // immutable source leaves selected by the already-validated Source Set.
  const sourceEntries = await Promise.all(materialAuthority.sourceSet.sources.map(async (source) => [
    source.sourceKey,
    await port.readValue(BOOK_SOURCE_ASSEMBLY_PROJECTION_SOURCE_PATH(
      input.accountId,
      input.bookId,
      source.sourceKey,
    )),
  ] as const));
  const sourceProjection = Object.fromEntries(sourceEntries);
  return parseBookSourceAuthority({
    ownerId: input.ownerId,
    bookId: input.bookId,
    book,
    sourceProjection,
  });
};

/**
 * Firebase REST adapter. The caller supplies the existing scoped token seam;
 * this module does not mint or add a new claim type.
 */
export const createFirebaseBookSourceAuthorityReader = (
  options: BookSourceAuthorityReaderOptions,
): BookSourceAuthorityReader => {
  const accountId = options.BOOK_SOURCE_UPLOAD_ACCOUNT_ID.trim();
  if (!validAccountId(accountId)) throw new Error('invalid_book_source_upload_account_id');
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const getFirebaseAuthToken = options.getFirebaseAuthToken;
  const getAccessToken = options.getAccessToken;
  if (!getFirebaseAuthToken && !getAccessToken && !options.GOOGLE_SA_KEY?.trim()) {
    throw new Error('missing_book_source_authority_firebase_auth_token');
  }
  const rtdb = new FirebaseRtdbRestClient({
    env: options,
    fetchImpl,
    ...(getFirebaseAuthToken ? {
      firebaseAuthToken: true,
      getFirebaseAuthToken,
    } : getAccessToken ? { getAccessToken } : {}),
  });
  return {
    read: (input) => readBookSourceAuthority(rtdb, { ...input, accountId }),
  };
};

/**
 * Existing claim-provider convention for the Material Book read. This helper
 * is intentionally only a token factory; the current RTDB rules still deny
 * the Source Upload aggregate path (see the handoff note), so callers must
 * supply an authorized transport for that path.
 */
export const createBookAssemblyScopedSourceAuthorityTokenProvider = (options: {
  readonly env: Required<Pick<RepositoryEnv, 'FIREBASE_PROJECT_ID' | 'FIREBASE_WEB_API_KEY' | 'GOOGLE_SA_KEY'>> & {
    readonly BOOK_SOURCE_UPLOAD_SERVICE_IDENTITY: string;
  };
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
  readonly unitKey?: string;
}) => {
  const serviceIdentity = options.env.BOOK_SOURCE_UPLOAD_SERVICE_IDENTITY.trim();
  const provider = createFirebaseClaimTokenProvider({
    serviceAccountJson: options.env.GOOGLE_SA_KEY,
    serviceIdentity,
    firebaseProjectId: options.env.FIREBASE_PROJECT_ID,
    firebaseWebApiKey: options.env.FIREBASE_WEB_API_KEY,
    fetchImpl: options.fetchImpl,
    now: options.now,
  });
  return (input: Pick<ReadBookSourceAuthorityInput, 'ownerId' | 'bookId'>) =>
    (request?: FirebaseRtdbAuthRequest): Promise<string> => {
      const claims: BookFirebaseClaimTuple = {
        service: 'book_assembly',
        bookId: input.bookId,
        unitKey: options.unitKey ?? 'source-authority',
        ownerId: input.ownerId,
      };
      return provider(claims);
    };
};
