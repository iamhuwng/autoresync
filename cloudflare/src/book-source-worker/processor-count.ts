import type {
  BookSourceVersionStorageIdentity,
} from '../../../src/types/bookSource.types.ts';
import type {
  SourceProviderPort,
  SourceProviderRequestOptions,
} from '../../../src/services/book-source-delivery/sourceProvider.port.ts';
import { runBookSourceProcessorBeforeDeadline } from './processor-deadline';

const PDF_RANGE_CHUNK_BYTES = 1024 * 1024;
/** Parser safety only; product byte/page authorization lives at its caller. */
const MAX_SOURCE_PAGES = 2_000;
const STABLE_PROCESSOR_ERRORS = new Set([
  'book_source_original_integrity_invalid',
  'book_source_processor_cancelled',
  'book_source_processor_configuration_invalid',
  'book_source_processor_pdf_page_count_invalid',
  'book_source_processor_range_budget_exceeded',
  'book_source_processor_range_invalid',
  'book_source_processor_timed_out',
]);

if (!Reflect.has(globalThis, 'DOMMatrix')) {
  class CountOnlyDOMMatrix {
    readonly a = 1;
    readonly b = 0;
    readonly c = 0;
    readonly d = 1;
    readonly e = 0;
    readonly f = 0;

    constructor(initial?: unknown) {
      if (initial !== undefined) throw new Error('book_source_processor_count_geometry_unsupported');
    }
  }
  Reflect.set(globalThis, 'DOMMatrix', CountOnlyDOMMatrix);
}

const pdfjsPromise = Promise.all([
  import('pdfjs-dist/legacy/build/pdf.worker.mjs'),
  import('pdfjs-dist/legacy/build/pdf.mjs'),
]).then(([, pdfjs]) => pdfjs);

export interface BookSourcePdfCountInput {
  readonly provider: Pick<SourceProviderPort, 'readBounded'>;
  readonly identity: BookSourceVersionStorageIdentity;
  readonly byteSize: number;
  readonly deadlineAt: number;
  readonly maxRangeBytes: number;
  readonly maxRangeRequests: number;
  readonly maxAggregateBytes: number;
  readonly assertNotCancelled: () => Promise<void>;
  readonly signal?: AbortSignal;
  readonly deferCleanup?: (promise: Promise<unknown>) => void;
}

export interface BookSourcePdfCountResult {
  readonly pageCount: number;
  readonly bytesRead: number;
  readonly rangeRequests: number;
}

const normalizePdfFailure = (error: unknown): Error => {
  const source = error && typeof error === 'object' ? error as Record<string, unknown> : null;
  const name = typeof source?.name === 'string' ? source.name : '';
  const code = typeof source?.code === 'string' ? source.code : '';
  if (code === 'aborted') return new Error('book_source_processor_cancelled');
  if (code === 'timeout') return new Error('book_source_processor_timed_out');
  if (code === 'metadata_mismatch' || code === 'provider_drift') {
    return new Error('book_source_original_integrity_invalid');
  }
  if (name === 'PasswordException') return new Error('book_source_processor_pdf_password_required');
  if (name === 'InvalidPDFException' || name === 'MissingPDFException'
    || name === 'FormatError' || name === 'ResponseException') {
    return new Error('book_source_processor_pdf_invalid');
  }
  if (error instanceof Error && STABLE_PROCESSOR_ERRORS.has(error.message)) return error;
  return new Error('book_source_processor_pdf_count_failed');
};

const sameContentIdentity = (
  left: BookSourceVersionStorageIdentity | undefined,
  right: BookSourceVersionStorageIdentity,
): boolean => left?.bookId === right.bookId
  && left.sourceVersionId === right.sourceVersionId
  && left.storageLocationId === right.storageLocationId
  && left.providerKind === right.providerKind
  && left.privateBucketId === right.privateBucketId
  && left.providerObjectKey === right.providerObjectKey
  && left.providerFileId === right.providerFileId
  && left.providerFileVersionId === right.providerFileVersionId
  && left.byteSize === right.byteSize
  && left.checksum.algorithm === right.checksum.algorithm
  && left.checksum.value === right.checksum.value;

const readProviderRange = async (
  input: BookSourcePdfCountInput,
  begin: number,
  length: number,
  signal: AbortSignal,
  remainingMs: number,
) => {
  const options: SourceProviderRequestOptions = {
    signal,
    timeoutMs: remainingMs,
    deadlineAt: input.deadlineAt,
  };
  const result = await input.provider.readBounded({
    identity: input.identity,
    range: { offset: begin, length },
  }, options);
  if (!sameContentIdentity(result.contentIdentity, input.identity)
    || result.totalByteSize !== input.byteSize
    || result.offset !== begin
    || result.bytes.byteLength !== length) {
    throw new Error('book_source_original_integrity_invalid');
  }
  return result.bytes;
};

export const countBookSourcePdfPagesFromProvider = async (
  input: BookSourcePdfCountInput,
): Promise<BookSourcePdfCountResult> => {
  const rangeChunkBytes = Math.min(PDF_RANGE_CHUNK_BYTES, input.maxRangeBytes);
  if (!Number.isSafeInteger(input.byteSize) || input.byteSize < 1
    || input.identity.byteSize !== input.byteSize
    || !Number.isSafeInteger(rangeChunkBytes) || rangeChunkBytes < 65_536
    || !Number.isSafeInteger(input.maxRangeRequests) || input.maxRangeRequests < 1
    || !Number.isSafeInteger(input.maxAggregateBytes) || input.maxAggregateBytes < rangeChunkBytes) {
    throw new Error('book_source_processor_configuration_invalid');
  }
  if (input.signal?.aborted) throw new Error('book_source_processor_cancelled');
  await runBookSourceProcessorBeforeDeadline(input.deadlineAt, input.assertNotCancelled);
  const { PDFDataRangeTransport, getDocument } = await runBookSourceProcessorBeforeDeadline(
    input.deadlineAt,
    async () => pdfjsPromise,
  );
  let rangeRequests = 0;
  let bytesRead = 0;
  let aggregateReserved = 0;
  let aborted = false;
  const requestController = new AbortController();
  const pending = new Set<Promise<void>>();
  let rejectRangeFailure!: (reason: unknown) => void;
  const rangeFailure = new Promise<never>((_, reject) => { rejectRangeFailure = reject; });
  const onAbort = () => {
    aborted = true;
    requestController.abort();
    rejectRangeFailure(new Error('book_source_processor_cancelled'));
  };
  if (input.signal?.aborted) onAbort();
  else input.signal?.addEventListener('abort', onAbort, { once: true });

  class PrivateProviderRangeTransport extends PDFDataRangeTransport {
    requestDataRange(begin: number, end: number): void {
      const length = end - begin;
      if (aborted || input.signal?.aborted) {
        rejectRangeFailure(new Error('book_source_processor_cancelled'));
        return;
      }
      if (!Number.isSafeInteger(begin) || !Number.isSafeInteger(end)
        || begin < 0 || end <= begin || end > input.byteSize || length > rangeChunkBytes) {
        rejectRangeFailure(new Error('book_source_processor_range_invalid'));
        return;
      }
      rangeRequests += 1;
      aggregateReserved += length;
      if (rangeRequests > input.maxRangeRequests || aggregateReserved > input.maxAggregateBytes) {
        rejectRangeFailure(new Error('book_source_processor_range_budget_exceeded'));
        return;
      }

      const operation = (async () => {
        await runBookSourceProcessorBeforeDeadline(input.deadlineAt, input.assertNotCancelled);
        const bytes = await runBookSourceProcessorBeforeDeadline(
          input.deadlineAt,
          async (remainingMs) => readProviderRange(
            input,
            begin,
            length,
            requestController.signal,
            remainingMs,
          ),
        );
        await runBookSourceProcessorBeforeDeadline(input.deadlineAt, input.assertNotCancelled);
        bytesRead += bytes.byteLength;
        // PDF.js takes ownership of this TypedArray. Record metrics first and
        // never touch it after delivery.
        this.onDataRange(begin, bytes);
      })();
      pending.add(operation);
      void operation.then(
        () => pending.delete(operation),
        (error) => {
          pending.delete(operation);
          rejectRangeFailure(error);
        },
      );
    }

    abort(): void {
      aborted = true;
      requestController.abort();
    }
  }

  const range = new PrivateProviderRangeTransport(input.byteSize, null);
  range.transportReady();
  const loadingTask = getDocument({
    range,
    length: input.byteSize,
    rangeChunkSize: rangeChunkBytes,
    disableStream: true,
    disableAutoFetch: true,
    disableFontFace: true,
    enableXfa: false,
    isEvalSupported: false,
    isImageDecoderSupported: false,
    isOffscreenCanvasSupported: false,
    stopAtErrors: true,
    useWasm: false,
    useWorkerFetch: false,
  });
  try {
    const document = await runBookSourceProcessorBeforeDeadline(
      input.deadlineAt,
      async () => Promise.race([loadingTask.promise, rangeFailure]),
    );
    if (!Number.isSafeInteger(document.numPages) || document.numPages < 1
      || document.numPages > MAX_SOURCE_PAGES) {
      throw new Error('book_source_processor_pdf_page_count_invalid');
    }
    await runBookSourceProcessorBeforeDeadline(input.deadlineAt, input.assertNotCancelled);
    const result = { pageCount: document.numPages, bytesRead, rangeRequests };
    await runBookSourceProcessorBeforeDeadline(input.deadlineAt, async () => document.destroy());
    return result;
  } catch (error) {
    throw normalizePdfFailure(error);
  } finally {
    range.abort();
    input.signal?.removeEventListener('abort', onAbort);
    const cleanup = Promise.allSettled([
      Promise.resolve().then(() => loadingTask.destroy()),
      ...pending,
    ]);
    let cleanupFinished = false;
    await runBookSourceProcessorBeforeDeadline(
      input.deadlineAt,
      async () => cleanup.then(() => { cleanupFinished = true; }),
    ).catch(() => undefined);
    if (!cleanupFinished) {
      if (!input.deferCleanup) throw new Error('book_source_processor_cleanup_unavailable');
      input.deferCleanup(cleanup);
    }
  }
};
