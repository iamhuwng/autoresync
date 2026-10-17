import {
  inspectSourcePdf,
  type SourcePdfInspectionClaim,
} from './sourcePdfInspection.browser';
import {
  COMPONENT_PDF_COMPOSITION_LIMITS,
  ComponentPdfCompositionError,
  type ComponentPdfCompositionErrorCode,
  type ComponentPdfCompositionResult,
  type ComponentPdfCompositionWorkerRequest,
  type ComponentPdfCompositionWorkerResponse,
  type ComponentPdfInputManifestEntry,
  type ComponentPdfPageMapping,
} from './componentPdfComposition.types';

export interface ComponentPdfCompositionWorkerPort {
  readonly postMessage: (message: ComponentPdfCompositionWorkerRequest) => void;
  readonly addEventListener: (type: 'message' | 'error', listener: EventListener) => void;
  readonly removeEventListener: (type: 'message' | 'error', listener: EventListener) => void;
  readonly terminate: () => void;
}

interface ComponentPdfCompositionBrowserDependencies {
  readonly createWorker: () => ComponentPdfCompositionWorkerPort;
  readonly inspectPdf: (file: File, signal?: AbortSignal) => Promise<SourcePdfInspectionClaim>;
  readonly setTimeout: (handler: () => void, timeoutMs: number) => ReturnType<typeof globalThis.setTimeout>;
  readonly clearTimeout: (handle: ReturnType<typeof globalThis.setTimeout>) => void;
}

export interface ComposeComponentPdfsOptions {
  readonly signal?: AbortSignal;
  readonly outputFilename?: string;
  /** Narrow seams for tests; production uses the existing inspection seam and a module Worker. */
  readonly __testDependencies?: Partial<ComponentPdfCompositionBrowserDependencies>;
}

const defaultDependencies: ComponentPdfCompositionBrowserDependencies = {
  createWorker: () => new Worker(
    new URL('./componentPdfComposition.worker.ts', import.meta.url),
    { type: 'module' },
  ) as unknown as ComponentPdfCompositionWorkerPort,
  inspectPdf: (file, signal) => inspectSourcePdf(file, { signal }),
  setTimeout: (handler, timeoutMs) => globalThis.setTimeout(handler, timeoutMs),
  clearTimeout: (handle) => globalThis.clearTimeout(handle),
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object';

const validSha256 = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);

const isValidClaim = (claim: SourcePdfInspectionClaim, file: File): boolean =>
  isRecord(claim)
  && claim.schemaVersion === 1
  && claim.state === 'complete'
  && claim.trust === 'browser-supplied-untrusted'
  && claim.pdfType === 'application/pdf'
  && claim.readability === 'readable'
  && claim.exactByteSize === file.size
  && validSha256(claim.sha256Hex)
  && Number.isSafeInteger(claim.physicalPageCount)
  && claim.physicalPageCount > 0;

const preflight = async (
  files: readonly File[],
  dependencies: ComponentPdfCompositionBrowserDependencies,
  signal?: AbortSignal,
): Promise<readonly SourcePdfInspectionClaim[]> => {
  if (!Array.isArray(files) || files.length < 1) {
    throw new ComponentPdfCompositionError('invalid_input');
  }
  if (files.length > COMPONENT_PDF_COMPOSITION_LIMITS.maxComponents) {
    throw new ComponentPdfCompositionError('too_many_components');
  }

  const aggregateBytes = files.reduce((sum, file) => sum + (Number.isSafeInteger(file?.size) ? file.size : 0), 0);
  if (aggregateBytes > COMPONENT_PDF_COMPOSITION_LIMITS.maxAggregateBytes) {
    throw new ComponentPdfCompositionError('aggregate_too_large');
  }

  const claims: SourcePdfInspectionClaim[] = [];
  let totalPages = 0;
  for (const file of files) {
    if (!file || typeof file.arrayBuffer !== 'function' || !Number.isSafeInteger(file.size) || file.size < 1) {
      throw new ComponentPdfCompositionError('invalid_input');
    }
    if (signal?.aborted) throw new ComponentPdfCompositionError('cancelled');
    let claim: SourcePdfInspectionClaim;
    try {
      claim = await dependencies.inspectPdf(file, signal);
    } catch (error) {
      if (signal?.aborted) throw new ComponentPdfCompositionError('cancelled');
      if (error instanceof ComponentPdfCompositionError) throw error;
      throw new ComponentPdfCompositionError('invalid_pdf');
    }
    if (!isValidClaim(claim, file)) {
      throw new ComponentPdfCompositionError('invalid_pdf');
    }
    totalPages += claim.physicalPageCount;
    if (totalPages > COMPONENT_PDF_COMPOSITION_LIMITS.maxPages) {
      throw new ComponentPdfCompositionError('too_many_pages');
    }
    claims.push(claim);
  }
  return claims;
};

const validErrorCode = (value: unknown): value is ComponentPdfCompositionErrorCode => [
  'invalid_input',
  'too_many_components',
  'aggregate_too_large',
  'too_many_pages',
  'not_pdf',
  'invalid_pdf',
  'encrypted_pdf',
  'unsupported_pdf',
  'output_too_large',
  'worker_error',
  'worker_protocol_error',
  'cancelled',
  'timeout',
].includes(value as ComponentPdfCompositionErrorCode);

const validMapping = (
  mapping: unknown,
  files: readonly File[],
  claims: readonly SourcePdfInspectionClaim[],
): mapping is readonly ComponentPdfPageMapping[] => {
  if (!Array.isArray(mapping) || mapping.length !== files.length) return false;
  let nextPage = 1;
  return mapping.every((entry, index) => {
    if (!isRecord(entry)) return false;
    const pageCount = claims[index]?.physicalPageCount;
    return entry.componentIndex === index
      && entry.fileName === files[index]?.name
      && entry.pageCount === pageCount
      && entry.startPage === nextPage
      && entry.endPage === nextPage + (pageCount ?? 0) - 1
      && (nextPage += pageCount ?? 0) > 0;
  });
};

const validInputManifest = (
  manifest: unknown,
  files: readonly File[],
  claims: readonly SourcePdfInspectionClaim[],
): manifest is readonly ComponentPdfInputManifestEntry[] => {
  if (!Array.isArray(manifest) || manifest.length !== files.length) return false;
  return manifest.every((entry, index) => {
    if (!isRecord(entry)) return false;
    const claim = claims[index];
    return entry.componentIndex === index
      && validSha256(entry.sha256Hex)
      && entry.sha256Hex === claim?.sha256Hex
      && entry.byteSize === files[index]?.size
      && entry.pageCount === claim?.physicalPageCount;
  });
};

const responseForRequest = (value: unknown, requestId: string): ComponentPdfCompositionWorkerResponse | null => {
  if (!isRecord(value) || value.requestId !== requestId || typeof value.type !== 'string') return null;
  return value as unknown as ComponentPdfCompositionWorkerResponse;
};

const terminate = (worker: ComponentPdfCompositionWorkerPort): void => {
  try {
    worker.terminate();
  } catch {
    // Worker teardown is best effort after a failed/cancelled request.
  }
};

export const composeComponentPdfs = async (
  files: readonly File[],
  options: ComposeComponentPdfsOptions = {},
): Promise<ComponentPdfCompositionResult> => {
  if (options.signal?.aborted) {
    throw new ComponentPdfCompositionError('cancelled');
  }
  const dependencies = { ...defaultDependencies, ...options.__testDependencies };
  const selectedFiles = Array.isArray(files) ? [...files] : files;
  const controller = new AbortController();
  let timedOut = false;
  const onCallerAbort = (): void => controller.abort();
  if (options.signal) options.signal.addEventListener('abort', onCallerAbort, { once: true });
  const timer = dependencies.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, COMPONENT_PDF_COMPOSITION_LIMITS.timeoutMs);

  try {
    const claims = await preflight(selectedFiles, dependencies, controller.signal);
    if (controller.signal.aborted) {
      throw new ComponentPdfCompositionError(timedOut ? 'timeout' : 'cancelled');
    }

    let worker: ComponentPdfCompositionWorkerPort;
    try {
      worker = dependencies.createWorker();
    } catch {
      throw new ComponentPdfCompositionError('worker_error');
    }
    const requestId = crypto.randomUUID();
    const outputFilename = options.outputFilename ?? 'composed-components.pdf';
    let settled = false;

    return await new Promise<ComponentPdfCompositionResult>((resolve, reject) => {
    const finish = (error?: ComponentPdfCompositionError, response?: ComponentPdfCompositionWorkerResponse): void => {
      if (settled) return;
      settled = true;
      controller.signal.removeEventListener('abort', onAbort);
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      if (error) {
        terminate(worker);
        reject(error);
        return;
      }
      if (!response || response.type !== 'success'
        || !(response.outputBytes instanceof ArrayBuffer)
        || response.byteSize !== response.outputBytes.byteLength
        || response.byteSize > COMPONENT_PDF_COMPOSITION_LIMITS.maxOutputBytes
        || !validSha256(response.sha256Hex)
        || !validMapping(response.mapping, selectedFiles, claims)
        || !validInputManifest(response.inputManifest, selectedFiles, claims)) {
        terminate(worker);
        reject(new ComponentPdfCompositionError('worker_protocol_error'));
        return;
      }
      terminate(worker);
      resolve({
        file: new File([response.outputBytes], outputFilename, { type: 'application/pdf' }),
        sha256Hex: response.sha256Hex,
        mapping: response.mapping,
        inputManifest: response.inputManifest,
      });
    };
    const onMessage = (event: Event): void => {
      const message = responseForRequest((event as MessageEvent<unknown>).data, requestId);
      if (!message) return;
      if (message.type === 'error') {
        finish(new ComponentPdfCompositionError(
          validErrorCode(message.code) ? message.code : 'worker_protocol_error',
        ));
        return;
      }
      finish(undefined, message);
    };
    const onError = (): void => finish(new ComponentPdfCompositionError('worker_error'));
    const onAbort = (): void => {
      if (settled) return;
      try {
        worker.postMessage({ type: 'cancel', requestId });
      } finally {
        finish(new ComponentPdfCompositionError(timedOut ? 'timeout' : 'cancelled'));
      }
    };

    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    controller.signal.addEventListener('abort', onAbort, { once: true });
    if (controller.signal.aborted) {
      onAbort();
      return;
    }

    try {
      worker.postMessage({ type: 'compose', requestId, files: selectedFiles });
    } catch {
      finish(new ComponentPdfCompositionError('worker_error'));
    }
    });
  } catch (error) {
    if (timedOut) throw new ComponentPdfCompositionError('timeout');
    throw error;
  } finally {
    dependencies.clearTimeout(timer);
    if (options.signal) options.signal.removeEventListener('abort', onCallerAbort);
  }
};
