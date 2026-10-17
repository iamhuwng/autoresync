import type { BookSourceVersionStorageIdentity } from '../../../src/types/bookSource.types.ts';
import type { TrustedSourcePageCountAdapter } from '../../../src/services/book-source-delivery/sourceUpload.service.ts';
import type { SourceProviderPort } from '../../../src/services/book-source-delivery/sourceProvider.port.ts';
import { countBookSourcePdfPagesFromProvider } from './processor-count';

const DEFAULT_TIMEOUT_MS = 55_000;
const DEFAULT_MAX_RANGE_BYTES = 1024 * 1024;
const DEFAULT_MAX_RANGE_REQUESTS = 64;
const DEFAULT_MAX_AGGREGATE_BYTES = 64 * 1024 * 1024;

export interface BookSourceDirectPdfPageCountOptions {
  readonly timeoutMs?: number;
  readonly maxRangeBytes?: number;
  readonly maxRangeRequests?: number;
  readonly maxAggregateBytes?: number;
  readonly now?: () => number;
}

const boundedInteger = (
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  code: string,
): number => {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result < minimum || result > maximum) throw new Error(code);
  return result;
};

const assertCountBinding = (input: {
  readonly identity: BookSourceVersionStorageIdentity;
  readonly checksum: BookSourceVersionStorageIdentity['checksum'];
  readonly byteSize: number;
}): void => {
  if (input.identity.byteSize !== input.byteSize
    || input.identity.checksum.algorithm !== input.checksum.algorithm
    || input.identity.checksum.value !== input.checksum.value.toLowerCase()) {
    throw new Error('book_source_original_integrity_invalid');
  }
};

export const createBookSourceDirectPdfPageCountAdapter = (
  provider: Pick<SourceProviderPort, 'readBounded'>,
  options: BookSourceDirectPdfPageCountOptions = {},
): TrustedSourcePageCountAdapter => {
  const timeoutMs = boundedInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS, 5_000, DEFAULT_TIMEOUT_MS, 'book_source_page_count_configuration_invalid');
  const maxRangeBytes = boundedInteger(options.maxRangeBytes, DEFAULT_MAX_RANGE_BYTES, 65_536, DEFAULT_MAX_RANGE_BYTES, 'book_source_page_count_configuration_invalid');
  const maxRangeRequests = boundedInteger(options.maxRangeRequests, DEFAULT_MAX_RANGE_REQUESTS, 4, 128, 'book_source_page_count_configuration_invalid');
  const maxAggregateBytes = boundedInteger(options.maxAggregateBytes, DEFAULT_MAX_AGGREGATE_BYTES, maxRangeBytes, 64 * 1024 * 1024, 'book_source_page_count_configuration_invalid');
  const now = options.now ?? Date.now;

  return Object.freeze({
    async countVerifiedPages(input) {
      assertCountBinding(input);
      if (input.identity.providerObjectKey.length < 1 || input.signal?.aborted) {
        throw new Error(input.signal?.aborted
          ? 'book_source_processor_cancelled'
          : 'book_source_original_integrity_invalid');
      }
      const startedAt = now();
      const deadlineAt = input.deadlineAt ?? startedAt + timeoutMs;
      if (!Number.isSafeInteger(startedAt) || !Number.isSafeInteger(deadlineAt) || deadlineAt <= startedAt) {
        throw new Error('book_source_page_count_configuration_invalid');
      }
      const counted = await countBookSourcePdfPagesFromProvider({
        provider,
        identity: input.identity,
        byteSize: input.byteSize,
        deadlineAt,
        maxRangeBytes,
        maxRangeRequests,
        maxAggregateBytes,
        signal: input.signal,
        assertNotCancelled: async () => {
          if (input.signal?.aborted) throw new Error('book_source_processor_cancelled');
        },
        deferCleanup: input.deferCleanup,
      });
      return counted.pageCount;
    },
  });
};
