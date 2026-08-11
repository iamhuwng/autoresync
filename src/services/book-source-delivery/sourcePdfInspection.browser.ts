import { BOOK_SOURCE_MAX_PDF_BYTES } from '../../types/bookSource.types';
import {
  normalizeBookSourceDisplayFilename,
} from './sourceDisplayFilename.service';
import type { SourceUploadInspectionClaim } from './sourceUpload.protocol';

export type SourcePdfInspectionClaim = SourceUploadInspectionClaim;

type PdfDocument = {
  readonly numPages: number;
};

type PdfLoadingTask = {
  readonly promise: Promise<PdfDocument>;
  readonly destroy?: () => Promise<unknown> | unknown;
};

export type SourcePdfInspectionErrorCode =
  | 'invalid_file'
  | 'invalid_filename'
  | 'file_too_large'
  | 'file_changed'
  | 'not_pdf'
  | 'empty_pdf'
  | 'unreadable'
  | 'aborted';

export class SourcePdfInspectionError extends Error {
  constructor(
    public readonly code: SourcePdfInspectionErrorCode,
    options?: ErrorOptions,
  ) {
    super(`source_pdf_inspection_${code}`, options);
    this.name = 'SourcePdfInspectionError';
  }
}

interface SourcePdfInspectionDependencies {
  readonly readArrayBuffer: (file: File) => Promise<ArrayBuffer>;
  readonly digestSha256: (bytes: ArrayBuffer) => Promise<ArrayBuffer>;
  readonly loadPdfDocument: (
    bytes: Uint8Array,
    signal?: AbortSignal,
  ) => Promise<PdfLoadingTask> | PdfLoadingTask;
}

export interface InspectSourcePdfOptions {
  readonly signal?: AbortSignal;
  /** Deterministic seams for focused tests; production uses browser APIs directly. */
  readonly __testDependencies?: SourcePdfInspectionDependencies;
}

const claims = new WeakMap<File, SourcePdfInspectionClaim>();
const PDF_HEADER = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);

const abortError = (): SourcePdfInspectionError =>
  new SourcePdfInspectionError('aborted');

const throwIfAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) throw abortError();
};

const awaitWithAbort = async <T>(
  promise: Promise<T>,
  signal?: AbortSignal,
): Promise<T> => {
  throwIfAborted(signal);
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
};

const bytesArePdf = (bytes: Uint8Array): boolean =>
  bytes.length >= PDF_HEADER.length
  && PDF_HEADER.every((value, index) => bytes[index] === value);

const hex = (bytes: ArrayBuffer): string => Array.from(new Uint8Array(bytes))
  .map((value) => value.toString(16).padStart(2, '0'))
  .join('');

const defaultDependencies = (): SourcePdfInspectionDependencies => ({
  readArrayBuffer: (file) => file.arrayBuffer(),
  digestSha256: (bytes) => {
    if (!globalThis.crypto?.subtle) {
      throw new SourcePdfInspectionError('unreadable');
    }
    return globalThis.crypto.subtle.digest('SHA-256', bytes);
  },
  loadPdfDocument: async (bytes, signal) => {
    throwIfAborted(signal);
    const [{ getDocument, GlobalWorkerOptions }, workerModule] = await Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]);
    throwIfAborted(signal);
    GlobalWorkerOptions.workerSrc = workerModule.default;
    return getDocument({ data: bytes }) as unknown as PdfLoadingTask;
  },
});

export const inspectSourcePdf = async (
  file: File,
  options: InspectSourcePdfOptions = {},
): Promise<SourcePdfInspectionClaim> => {
  claims.delete(file);
  const testDependencies = options.__testDependencies;
  if (!file || typeof file.arrayBuffer !== 'function'
    && typeof testDependencies?.readArrayBuffer !== 'function'
    || typeof file.name !== 'string' || !Number.isSafeInteger(file.size)) {
    throw new SourcePdfInspectionError('invalid_file');
  }
  if (file.size < 1 || file.size > BOOK_SOURCE_MAX_PDF_BYTES) {
    throw new SourcePdfInspectionError('file_too_large');
  }

  let displayFilename: string;
  try {
    displayFilename = normalizeBookSourceDisplayFilename(file.name);
  } catch (error) {
    throw new SourcePdfInspectionError('invalid_filename', { cause: error });
  }

  const signal = options.signal;
  const dependencies = options.__testDependencies ?? defaultDependencies();
  throwIfAborted(signal);
  let task: PdfLoadingTask | undefined;
  try {
    const rawBytes = await awaitWithAbort(dependencies.readArrayBuffer(file), signal);
    const bytes = new Uint8Array(rawBytes);
    if (bytes.byteLength !== file.size) {
      throw new SourcePdfInspectionError('file_changed');
    }
    if (!bytesArePdf(bytes)) {
      throw new SourcePdfInspectionError('not_pdf');
    }
    const digest = await awaitWithAbort(
      dependencies.digestSha256(bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer),
      signal,
    );
    const sha256Hex = hex(digest);
    if (sha256Hex.length !== 64) {
      throw new SourcePdfInspectionError('unreadable');
    }

    task = await awaitWithAbort(
      Promise.resolve(dependencies.loadPdfDocument(bytes, signal)),
      signal,
    );
    const document = await awaitWithAbort(task.promise, signal);
    if (!Number.isSafeInteger(document.numPages) || document.numPages < 1) {
      throw new SourcePdfInspectionError('empty_pdf');
    }
    throwIfAborted(signal);
    const claim = Object.freeze({
      schemaVersion: 1 as const,
      trust: 'browser-supplied-untrusted' as const,
      state: 'complete' as const,
      displayFilename,
      exactByteSize: file.size,
      sha256Hex,
      physicalPageCount: document.numPages,
      pdfType: 'application/pdf' as const,
      readability: 'readable' as const,
    });
    claims.set(file, claim);
    return claim;
  } catch (error) {
    claims.delete(file);
    if (error instanceof SourcePdfInspectionError) throw error;
    throw new SourcePdfInspectionError('unreadable', { cause: error });
  } finally {
    if (task?.destroy) {
      try {
        await task.destroy();
      } catch {
        // PDF.js cleanup is best-effort and must not mask the inspection result.
      }
    }
  }
};

export const invalidateSourcePdfInspectionClaim = (file: File): void => {
  claims.delete(file);
};

export const isSourcePdfInspectionClaimForFile = (
  claim: SourcePdfInspectionClaim | null | undefined,
  file: File | null | undefined,
): boolean => {
  if (!claim || !file) return false;
  if (claims.get(file) !== claim
    || claim.schemaVersion !== 1
    || claim.trust !== 'browser-supplied-untrusted'
    || claim.state !== 'complete'
    || claim.pdfType !== 'application/pdf'
    || claim.readability !== 'readable'
    || claim.exactByteSize !== file.size) return false;
  try {
    return claim.displayFilename === normalizeBookSourceDisplayFilename(file.name);
  } catch {
    return false;
  }
};
