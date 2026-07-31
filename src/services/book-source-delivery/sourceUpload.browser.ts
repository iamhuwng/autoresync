import { BOOK_SOURCE_MAX_PDF_BYTES } from '../../types/bookSource.types';
import {
  isSourcePdfInspectionClaimForFile,
  type SourcePdfInspectionClaim,
} from './sourcePdfInspection.browser';
import type { BeginSourceUploadResult } from './sourceUpload.client';

export type SourceUploadBrowserErrorCode =
  | 'aborted'
  | 'expired_authority'
  | 'invalid_authority'
  | 'network_failure'
  | 'provider_failure'
  | 'response_binding_mismatch'
  | 'stale_file';

export class SourceUploadBrowserError extends Error {
  constructor(
    public readonly code: SourceUploadBrowserErrorCode,
    options?: ErrorOptions,
  ) {
    super(`source_upload_browser_${code}`, options);
    this.name = 'SourceUploadBrowserError';
  }
}

export interface SourceUploadByteProgress {
  readonly confirmed: boolean;
  readonly loadedBytes: number;
  readonly totalBytes: number;
  readonly percent: number;
}

export interface SourceUploadProviderIdentity {
  readonly providerFileId: string;
  readonly providerFileVersionId: string;
}

export interface UploadSourcePdfDirectInput {
  readonly file: File;
  readonly claim: SourcePdfInspectionClaim;
  readonly authority: BeginSourceUploadResult['upload'];
  readonly allowedB2Origins: readonly string[];
}

export interface UploadSourcePdfDirectOptions {
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: SourceUploadByteProgress) => void;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
}

const REQUIRED_HEADERS = Object.freeze([
  'content-type',
  'x-amz-content-sha256',
  'x-amz-meta-book-source-byte-size',
  'x-amz-meta-book-source-sha256',
]);

const PROVIDER_ID = /^[A-Za-z0-9._:-]{1,256}$/u;

const normalizeOrigin = (value: string): string | null => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.username === ''
      && url.password === ''
      && url.pathname === '/'
      && url.search === ''
      && url.hash === ''
      ? url.origin
      : null;
  } catch {
    return null;
  }
};

const normalizedHeaders = (
  headers: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> => Object.freeze(
  Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  ),
);

const validateInput = (
  input: UploadSourcePdfDirectInput,
  now: number,
): { readonly url: URL; readonly headers: Readonly<Record<string, string>> } => {
  if (
    !isSourcePdfInspectionClaimForFile(input.claim, input.file)
    || input.file.size !== input.claim.exactByteSize
    || input.file.size < 1
    || input.file.size > BOOK_SOURCE_MAX_PDF_BYTES
  ) {
    throw new SourceUploadBrowserError('stale_file');
  }

  let url: URL;
  try {
    url = new URL(input.authority.url);
  } catch {
    throw new SourceUploadBrowserError('invalid_authority');
  }

  const allowedOrigins = new Set(input.allowedB2Origins.map(normalizeOrigin));
  if (
    allowedOrigins.has(null)
    || allowedOrigins.size !== input.allowedB2Origins.length
    || !allowedOrigins.has(url.origin)
    || url.protocol !== 'https:'
    || url.username !== ''
    || url.password !== ''
    || url.hash !== ''
    || url.pathname === '/'
  ) {
    throw new SourceUploadBrowserError('invalid_authority');
  }

  const expiresAt = Date.parse(input.authority.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    throw new SourceUploadBrowserError('expired_authority');
  }

  const headers = normalizedHeaders(input.authority.requiredHeaders);
  const headerKeys = Object.keys(headers);
  const checksum = input.claim.sha256Hex.toLowerCase();
  if (
    headerKeys.length !== REQUIRED_HEADERS.length
    || new Set(headerKeys).size !== REQUIRED_HEADERS.length
    || !REQUIRED_HEADERS.every((header) => Object.hasOwn(headers, header))
    || headers['content-type'] !== 'application/pdf'
    || headers['x-amz-content-sha256'] !== checksum
    || headers['x-amz-meta-book-source-byte-size'] !== String(input.file.size)
    || headers['x-amz-meta-book-source-sha256'] !== checksum
  ) {
    throw new SourceUploadBrowserError('invalid_authority');
  }

  return { url, headers };
};

/**
 * Uploads the original browser File directly to one exact B2 presigned URL.
 * No Worker request and no application-level byte copy participates.
 */
export const uploadSourcePdfDirect = async (
  input: UploadSourcePdfDirectInput,
  options: UploadSourcePdfDirectOptions = {},
): Promise<SourceUploadProviderIdentity> => {
  const validated = validateInput(input, (options.now ?? Date.now)());
  if (options.signal?.aborted) {
    throw new SourceUploadBrowserError('aborted');
  }

  options.onProgress?.(Object.freeze({
    confirmed: false,
    loadedBytes: 0,
    totalBytes: input.file.size,
    percent: 0,
  }));

  let response: Response;
  try {
    response = await (options.fetchImpl ?? globalThis.fetch)(
      validated.url.href,
      {
        method: 'PUT',
        headers: validated.headers,
        body: input.file,
        credentials: 'omit',
        redirect: 'error',
        signal: options.signal,
      },
    );
  } catch (error) {
    if (error instanceof SourceUploadBrowserError) throw error;
    if (options.signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
      throw new SourceUploadBrowserError('aborted', { cause: error });
    }
    throw new SourceUploadBrowserError('network_failure', { cause: error });
  }

  if (
    response.redirected
    || response.url !== validated.url.href
  ) {
    throw new SourceUploadBrowserError('response_binding_mismatch');
  }
  if (response.status !== 200) {
    throw new SourceUploadBrowserError('provider_failure');
  }

  // Fetch exposes no upload progress for a File body. The provider response is
  // the first point at which transferred bytes can be reported as confirmed.
  options.onProgress?.(Object.freeze({
    confirmed: true,
    loadedBytes: input.file.size,
    totalBytes: input.file.size,
    percent: 100,
  }));

  const versionId = response.headers.get('x-amz-version-id')?.trim() ?? '';
  if (!PROVIDER_ID.test(versionId)) {
    throw new SourceUploadBrowserError('response_binding_mismatch');
  }
  return Object.freeze({
    providerFileId: versionId,
    providerFileVersionId: versionId,
  });
};
