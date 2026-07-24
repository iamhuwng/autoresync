import {
  SOURCE_PROVIDER_ACCOUNT_TOTALS_MAX_PAGE_SIZE,
  type SourceProviderAccountTotalsPage,
  type SourceProviderPort,
} from '../../../src/services/book-source-delivery/sourceProvider.port.ts';
import {
  getLedgerProviderTotals,
  type CapacityLedgerEntry,
  type ProviderReconciliationSnapshot,
} from './capacity-ledger.ts';

export const PROVIDER_RECONCILIATION_MAX_PAGES = 256;
const MAX_RECONCILIATION_CONTINUATION_LENGTH = 4_096;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;
const CONTINUATION_FINGERPRINT = /^[a-f0-9]{64}$/u;
const encoder = new TextEncoder();

export class ProviderReconciliationError extends Error {
  constructor(public readonly code: 'provider_drift' | 'invalid_provider_totals' | 'reconciliation_bound_exceeded') {
    super(`book_source_reconciliation_${code}`);
    this.name = 'ProviderReconciliationError';
  }
}

export interface ProviderReconciliationCursor {
  readonly storageLocationId: string;
  readonly privateBucketId: string;
  readonly continuation?: string;
  readonly accumulatedBytes: number;
  readonly accumulatedObjectCount: number;
  readonly pagesRead: number;
  /** SHA-256 fingerprints keep loop detection bounded without persisting every opaque token. */
  readonly seenContinuationFingerprints: readonly string[];
}

export type ProviderReconciliationWorkResult =
  | { readonly state: 'continue'; readonly cursor: ProviderReconciliationCursor }
  | { readonly state: 'complete'; readonly totals: { readonly totalBytes: number; readonly objectCount: number } };

const safeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const canonicalIsoDate = (value: unknown): value is string => {
  if (typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) {
    return false;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
};

const fail = (code: ProviderReconciliationError['code']): never => { throw new ProviderReconciliationError(code); };

const continuationFingerprint = async (continuation: string): Promise<string> =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(continuation))),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');

const assertPage = async (
  page: SourceProviderAccountTotalsPage,
  cursor: ProviderReconciliationCursor,
): Promise<string | undefined> => {
  if (page.storageLocationId !== cursor.storageLocationId || page.privateBucketId !== cursor.privateBucketId
    || !safeInteger(page.totalBytes) || !safeInteger(page.objectCount)) {
    fail('provider_drift');
  }
  if (page.continuation === undefined) return undefined;
  if (typeof page.continuation !== 'string'
    || page.continuation.length < 1
    || page.continuation.length > MAX_RECONCILIATION_CONTINUATION_LENGTH) {
    fail('provider_drift');
  }
  const fingerprint = await continuationFingerprint(page.continuation);
  if (cursor.seenContinuationFingerprints.includes(fingerprint)) fail('provider_drift');
  return fingerprint;
};

/**
 * Reads one provider page. No account scan loop runs inside a Worker request;
 * caller stores returned cursor then triggers next bounded work unit.
 */
export const readProviderTotalsWorkUnit = async (input: {
  readonly provider: Pick<SourceProviderPort, 'readAccountTotalsPage'>;
  readonly cursor: ProviderReconciliationCursor;
  readonly maxPageSize?: number;
}): Promise<ProviderReconciliationWorkResult> => {
  const maxPageSize = input.maxPageSize ?? SOURCE_PROVIDER_ACCOUNT_TOTALS_MAX_PAGE_SIZE;
  if (!Number.isSafeInteger(maxPageSize) || maxPageSize < 1 || maxPageSize > SOURCE_PROVIDER_ACCOUNT_TOTALS_MAX_PAGE_SIZE
    || typeof input.cursor.storageLocationId !== 'string'
    || !SAFE_IDENTIFIER.test(input.cursor.storageLocationId)
    || typeof input.cursor.privateBucketId !== 'string'
    || !SAFE_IDENTIFIER.test(input.cursor.privateBucketId)
    || !safeInteger(input.cursor.accumulatedBytes) || !safeInteger(input.cursor.accumulatedObjectCount)
    || !Number.isSafeInteger(input.cursor.pagesRead) || input.cursor.pagesRead < 0
    || input.cursor.pagesRead >= PROVIDER_RECONCILIATION_MAX_PAGES
    || input.cursor.seenContinuationFingerprints.length !== input.cursor.pagesRead
    || input.cursor.seenContinuationFingerprints.some((fingerprint) =>
      typeof fingerprint !== 'string' || !CONTINUATION_FINGERPRINT.test(fingerprint))
    || new Set(input.cursor.seenContinuationFingerprints).size !== input.cursor.seenContinuationFingerprints.length
    || (input.cursor.pagesRead === 0 && input.cursor.continuation !== undefined)
    || (input.cursor.pagesRead > 0 && input.cursor.continuation === undefined)) {
    fail('reconciliation_bound_exceeded');
  }
  if (input.cursor.continuation !== undefined
    && await continuationFingerprint(input.cursor.continuation)
      !== input.cursor.seenContinuationFingerprints[input.cursor.seenContinuationFingerprints.length - 1]) {
    fail('reconciliation_bound_exceeded');
  }
  const page = await input.provider.readAccountTotalsPage({
    storageLocationId: input.cursor.storageLocationId,
    privateBucketId: input.cursor.privateBucketId,
    ...(input.cursor.continuation === undefined ? {} : { continuation: input.cursor.continuation }),
    maxPageSize,
  });
  const continuationFingerprintValue = await assertPage(page, input.cursor);
  const totalBytes = input.cursor.accumulatedBytes + page.totalBytes;
  const objectCount = input.cursor.accumulatedObjectCount + page.objectCount;
  if (!safeInteger(totalBytes) || !safeInteger(objectCount)) fail('invalid_provider_totals');
  if (page.continuation === undefined) return Object.freeze({
    state: 'complete', totals: Object.freeze({ totalBytes, objectCount }),
  });
  if (input.cursor.pagesRead + 1 >= PROVIDER_RECONCILIATION_MAX_PAGES) fail('reconciliation_bound_exceeded');
  return Object.freeze({
    state: 'continue',
    cursor: Object.freeze({
      ...input.cursor,
      continuation: page.continuation,
      accumulatedBytes: totalBytes,
      accumulatedObjectCount: objectCount,
      pagesRead: input.cursor.pagesRead + 1,
      seenContinuationFingerprints: Object.freeze([
        ...input.cursor.seenContinuationFingerprints,
        continuationFingerprintValue!,
      ]),
    }),
  });
};

/** Exact ledger/provider equality is required. Any uncertainty disables new reservations. */
export const reconcileProviderTotals = (input: {
  readonly expected: { readonly totalBytes: number; readonly objectCount: number };
  readonly observed: { readonly totalBytes: number; readonly objectCount: number };
  readonly completedAt: string;
}): ProviderReconciliationSnapshot => {
  if (!safeInteger(input.expected.totalBytes) || !safeInteger(input.expected.objectCount)
    || !safeInteger(input.observed.totalBytes) || !safeInteger(input.observed.objectCount)
    || !canonicalIsoDate(input.completedAt)) fail('invalid_provider_totals');
  return Object.freeze({
    status: input.expected.totalBytes === input.observed.totalBytes
      && input.expected.objectCount === input.observed.objectCount ? 'healthy' : 'drift',
    totalBytes: input.observed.totalBytes,
    objectCount: input.observed.objectCount,
    completedAt: input.completedAt,
  });
};

/** Provider pages must account for every ledger row marked provider-reported. */
export const reconcileLedgerWithProviderTotals = (input: {
  readonly entries: readonly CapacityLedgerEntry[];
  readonly observed: { readonly totalBytes: number; readonly objectCount: number };
  readonly completedAt: string;
}): ProviderReconciliationSnapshot => reconcileProviderTotals({
  expected: getLedgerProviderTotals(input.entries),
  observed: input.observed,
  completedAt: input.completedAt,
});
