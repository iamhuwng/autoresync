import { PDFDocument } from 'pdf-lib';
import {
  COMPONENT_PDF_COMPOSITION_LIMITS,
  ComponentPdfCompositionError,
  type ComponentPdfCompositionErrorCode,
  type ComponentPdfCompositionWorkerRequest,
  type ComponentPdfCompositionWorkerResponse,
  type ComponentPdfCompositionWorkerSuccess,
  type ComponentPdfInputManifestEntry,
  type ComponentPdfPageMapping,
} from './componentPdfComposition.types';

interface PdfSourceDocument {
  readonly getPageCount: () => number;
  readonly getPageIndices: () => number[];
}

interface PdfOutputDocument {
  readonly addPage: (page: unknown) => unknown;
  readonly save: () => Promise<Uint8Array>;
}

export interface ComponentPdfCompositionWorkerDependencies {
  readonly loadPdf: (bytes: Uint8Array) => Promise<PdfSourceDocument>;
  readonly createPdf: () => Promise<PdfOutputDocument>;
  readonly copyPages: (
    output: PdfOutputDocument,
    source: PdfSourceDocument,
    pageIndices: readonly number[],
  ) => Promise<readonly unknown[]>;
  readonly digestSha256: (bytes: ArrayBuffer) => Promise<ArrayBuffer>;
}

export interface ComposeComponentPdfWorkerOptions {
  readonly signal?: AbortSignal;
  readonly __testDependencies?: Partial<ComponentPdfCompositionWorkerDependencies>;
}

export interface ComposedComponentPdfBytes {
  readonly bytes: Uint8Array;
  readonly sha256Hex: string;
  readonly mapping: readonly ComponentPdfPageMapping[];
  readonly inputManifest: readonly ComponentPdfInputManifestEntry[];
}

const PDF_HEADER = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);

const defaultDependencies: ComponentPdfCompositionWorkerDependencies = {
  loadPdf: async (bytes) => PDFDocument.load(bytes) as unknown as PdfSourceDocument,
  createPdf: async () => PDFDocument.create() as unknown as PdfOutputDocument,
  copyPages: (output, source, pageIndices) =>
    (output as unknown as PDFDocument).copyPages(
      source as unknown as PDFDocument,
      [...pageIndices],
    ),
  digestSha256: async (bytes) => {
    if (!globalThis.crypto?.subtle) {
      throw new ComponentPdfCompositionError('worker_error');
    }
    return globalThis.crypto.subtle.digest('SHA-256', bytes);
  },
};

const throwIfAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) throw new ComponentPdfCompositionError('cancelled');
};

const isPdfHeader = (bytes: Uint8Array): boolean =>
  bytes.length >= PDF_HEADER.length
  && PDF_HEADER.every((value, index) => bytes[index] === value);

const toHex = (bytes: ArrayBuffer): string => Array.from(new Uint8Array(bytes))
  .map((value) => value.toString(16).padStart(2, '0'))
  .join('');

const isEncryptedError = (error: unknown): boolean =>
  /encrypt|password|passwords/iu.test(error instanceof Error ? error.message : String(error));

const validateFileShape = (file: File): void => {
  if (!file || typeof file.arrayBuffer !== 'function'
    || typeof file.name !== 'string'
    || !Number.isSafeInteger(file.size)
    || file.size < 1) {
    throw new ComponentPdfCompositionError('invalid_input');
  }
};

const loadSourcePdf = async (
  bytes: Uint8Array,
  dependencies: ComponentPdfCompositionWorkerDependencies,
): Promise<PdfSourceDocument> => {
  try {
    return await dependencies.loadPdf(bytes);
  } catch (error) {
    throw new ComponentPdfCompositionError(
      isEncryptedError(error) ? 'encrypted_pdf' : 'invalid_pdf',
    );
  }
};

const validatePageCount = (pageCount: number): void => {
  if (!Number.isSafeInteger(pageCount) || pageCount < 1) {
    throw new ComponentPdfCompositionError('invalid_pdf');
  }
  if (pageCount > COMPONENT_PDF_COMPOSITION_LIMITS.maxPages) {
    throw new ComponentPdfCompositionError('too_many_pages');
  }
};

export const composeComponentPdfBytes = async (
  files: readonly File[],
  options: ComposeComponentPdfWorkerOptions = {},
): Promise<ComposedComponentPdfBytes> => {
  if (!Array.isArray(files) || files.length < 1) {
    throw new ComponentPdfCompositionError('invalid_input');
  }
  if (files.length > COMPONENT_PDF_COMPOSITION_LIMITS.maxComponents) {
    throw new ComponentPdfCompositionError('too_many_components');
  }

  const dependencies = { ...defaultDependencies, ...options.__testDependencies };
  const output = await dependencies.createPdf();
  const mapping: ComponentPdfPageMapping[] = [];
  const inputManifest: ComponentPdfInputManifestEntry[] = [];
  let aggregateBytes = 0;
  let totalPages = 0;

  const selectedFiles = [...files];
  for (const [componentIndex, file] of selectedFiles.entries()) {
    throwIfAborted(options.signal);
    validateFileShape(file);
    const rawBytes = await file.arrayBuffer();
    const bytes = new Uint8Array(rawBytes);
    if (bytes.byteLength !== file.size) {
      throw new ComponentPdfCompositionError('invalid_input');
    }
    aggregateBytes += bytes.byteLength;
    if (aggregateBytes > COMPONENT_PDF_COMPOSITION_LIMITS.maxAggregateBytes) {
      throw new ComponentPdfCompositionError('aggregate_too_large');
    }
    if (!isPdfHeader(bytes)) {
      throw new ComponentPdfCompositionError('not_pdf');
    }

    let inputSha256Hex: string;
    try {
      inputSha256Hex = toHex(await dependencies.digestSha256(bytes.slice().buffer as ArrayBuffer));
    } catch (error) {
      if (error instanceof ComponentPdfCompositionError) throw error;
      throw new ComponentPdfCompositionError('worker_error');
    }
    throwIfAborted(options.signal);
    if (!/^[a-f0-9]{64}$/u.test(inputSha256Hex)) {
      throw new ComponentPdfCompositionError('worker_error');
    }

    const source = await loadSourcePdf(bytes, dependencies);
    throwIfAborted(options.signal);
    const pageCount = source.getPageCount();
    validatePageCount(pageCount);
    totalPages += pageCount;
    if (totalPages > COMPONENT_PDF_COMPOSITION_LIMITS.maxPages) {
      throw new ComponentPdfCompositionError('too_many_pages');
    }

    const copiedPages = await dependencies.copyPages(output, source, source.getPageIndices());
    throwIfAborted(options.signal);
    if (copiedPages.length !== pageCount) {
      throw new ComponentPdfCompositionError('unsupported_pdf');
    }
    for (const page of copiedPages) {
      throwIfAborted(options.signal);
      output.addPage(page);
    }

    const startPage = totalPages - pageCount + 1;
    mapping.push(Object.freeze({
      componentIndex,
      fileName: file.name,
      pageCount,
      startPage,
      endPage: totalPages,
    }));
    inputManifest.push(Object.freeze({
      componentIndex,
      sha256Hex: inputSha256Hex,
      byteSize: bytes.byteLength,
      pageCount,
    }));
  }

  throwIfAborted(options.signal);
  let bytes: Uint8Array;
  try {
    bytes = await output.save();
  } catch {
    throw new ComponentPdfCompositionError('unsupported_pdf');
  }
  if (bytes.byteLength > COMPONENT_PDF_COMPOSITION_LIMITS.maxOutputBytes) {
    throw new ComponentPdfCompositionError('output_too_large');
  }

  const digest = await dependencies.digestSha256(bytes.slice().buffer as ArrayBuffer);
  const sha256Hex = toHex(digest);
  if (!/^[a-f0-9]{64}$/u.test(sha256Hex)) {
    throw new ComponentPdfCompositionError('worker_error');
  }
  return {
    bytes,
    sha256Hex,
    mapping: Object.freeze(mapping),
    inputManifest: Object.freeze(inputManifest),
  };
};

const errorCode = (error: unknown): ComponentPdfCompositionErrorCode =>
  error instanceof ComponentPdfCompositionError ? error.code : 'worker_error';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object';

const isComposeRequest = (value: unknown): value is Extract<ComponentPdfCompositionWorkerRequest, { type: 'compose' }> =>
  isRecord(value)
  && value.type === 'compose'
  && typeof value.requestId === 'string'
  && value.requestId.length > 0
  && Array.isArray(value.files);

const isCancelRequest = (value: unknown): value is Extract<ComponentPdfCompositionWorkerRequest, { type: 'cancel' }> =>
  isRecord(value)
  && value.type === 'cancel'
  && typeof value.requestId === 'string'
  && value.requestId.length > 0;

export const createComponentPdfCompositionWorkerMessageHandler = (
  postMessage: (
    message: ComponentPdfCompositionWorkerResponse,
    transfer?: Transferable[],
  ) => void = (message, transfer) => (globalThis as unknown as {
    postMessage: (value: unknown, transfer?: Transferable[]) => void;
  }).postMessage(message, transfer ?? []),
  dependencies?: Partial<ComponentPdfCompositionWorkerDependencies>,
) => {
  const jobs = new Map<string, AbortController>();

  return (event: MessageEvent<unknown>): void => {
    const data = event.data;
    if (isCancelRequest(data)) {
      jobs.get(data.requestId)?.abort();
      return;
    }
    if (!isComposeRequest(data)) return;
    if (jobs.has(data.requestId)) {
      postMessage({ type: 'error', requestId: data.requestId, code: 'worker_protocol_error' });
      return;
    }

    const controller = new AbortController();
    jobs.set(data.requestId, controller);
    void composeComponentPdfBytes(data.files, {
      signal: controller.signal,
      __testDependencies: dependencies,
    })
      .then((result) => {
        const outputBytes = result.bytes.slice().buffer as ArrayBuffer;
        const response: ComponentPdfCompositionWorkerSuccess = {
          type: 'success',
          requestId: data.requestId,
          outputBytes,
          byteSize: result.bytes.byteLength,
          sha256Hex: result.sha256Hex,
          mapping: result.mapping,
          inputManifest: result.inputManifest,
        };
        postMessage(response, [outputBytes]);
      })
      .catch((error: unknown) => {
        const code = errorCode(error);
        if (code !== 'cancelled') {
          postMessage({ type: 'error', requestId: data.requestId, code });
        }
      })
      .finally(() => jobs.delete(data.requestId));
  };
};

if (typeof document === 'undefined' && typeof globalThis.addEventListener === 'function') {
  const handler = createComponentPdfCompositionWorkerMessageHandler();
  globalThis.addEventListener('message', handler as EventListener);
}
