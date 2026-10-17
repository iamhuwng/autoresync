export const COMPONENT_PDF_COMPOSITION_LIMITS = Object.freeze({
  maxComponents: 20,
  maxAggregateBytes: 50 * 1024 * 1024,
  maxPages: 500,
  maxOutputBytes: 100 * 1024 * 1024,
  timeoutMs: 60_000,
});

export type ComponentPdfCompositionErrorCode =
  | 'invalid_input'
  | 'too_many_components'
  | 'aggregate_too_large'
  | 'too_many_pages'
  | 'not_pdf'
  | 'invalid_pdf'
  | 'encrypted_pdf'
  | 'unsupported_pdf'
  | 'output_too_large'
  | 'worker_error'
  | 'worker_protocol_error'
  | 'cancelled'
  | 'timeout';

export class ComponentPdfCompositionError extends Error {
  constructor(
    public readonly code: ComponentPdfCompositionErrorCode,
    message = `component_pdf_composition_${code}`,
  ) {
    super(message);
    this.name = 'ComponentPdfCompositionError';
  }
}

/** One-based inclusive page range in the composed PDF. */
export interface ComponentPdfPageMapping {
  readonly componentIndex: number;
  readonly fileName: string;
  readonly pageCount: number;
  readonly startPage: number;
  readonly endPage: number;
}

/** Ordered content identity for binding a result to one selected sequence. */
export interface ComponentPdfInputManifestEntry {
  readonly componentIndex: number;
  readonly sha256Hex: string;
  readonly byteSize: number;
  readonly pageCount: number;
}

export interface ComponentPdfCompositionResult {
  readonly file: File;
  readonly sha256Hex: string;
  readonly mapping: readonly ComponentPdfPageMapping[];
  readonly inputManifest: readonly ComponentPdfInputManifestEntry[];
}

export interface ComponentPdfCompositionWorkerComposeRequest {
  readonly type: 'compose';
  readonly requestId: string;
  readonly files: readonly File[];
}

export interface ComponentPdfCompositionWorkerCancelRequest {
  readonly type: 'cancel';
  readonly requestId: string;
}

export type ComponentPdfCompositionWorkerRequest =
  | ComponentPdfCompositionWorkerComposeRequest
  | ComponentPdfCompositionWorkerCancelRequest;

export interface ComponentPdfCompositionWorkerSuccess {
  readonly type: 'success';
  readonly requestId: string;
  readonly outputBytes: ArrayBuffer;
  readonly byteSize: number;
  readonly sha256Hex: string;
  readonly mapping: readonly ComponentPdfPageMapping[];
  readonly inputManifest: readonly ComponentPdfInputManifestEntry[];
}

export interface ComponentPdfCompositionWorkerFailure {
  readonly type: 'error';
  readonly requestId: string;
  readonly code: ComponentPdfCompositionErrorCode;
}

export type ComponentPdfCompositionWorkerResponse =
  | ComponentPdfCompositionWorkerSuccess
  | ComponentPdfCompositionWorkerFailure;
