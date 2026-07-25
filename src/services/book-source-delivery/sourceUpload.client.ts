import type { BookSourceUploadKind } from '../../types/bookSource.types';
import type { SourceUploadInspectionClaim } from './sourceUpload.protocol';

export const BOOK_SOURCE_UPLOAD_ROUTE = '/v1/book-source/books';

export interface BeginSourceUploadCommand {
  readonly bookId: string;
  readonly operationId: string;
  readonly sourceKey: string;
  readonly kind: BookSourceUploadKind;
  readonly inspection: SourceUploadInspectionClaim;
}

export interface CompleteSourceUploadCommand {
  readonly bookId: string;
  readonly reservationId: string;
  readonly providerFileId: string;
  readonly providerFileVersionId: string;
}

export interface BeginSourceUploadResult {
  readonly status: 'reserved' | 'replayed';
  readonly reservationId: string;
  readonly sourceVersionId: string;
  readonly upload: {
    readonly url: string;
    readonly expiresAt: string;
    readonly requiredHeaders: Readonly<Record<string, string>>;
  };
}

export interface CompleteSourceUploadResult {
  readonly status: 'verified_completed' | 'replayed';
  readonly reservationId: string;
  readonly sourceVersionId: string;
}

export class SourceUploadClientError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(`source_upload_${code}`);
    this.name = 'SourceUploadClientError';
  }
}

export interface SourceUploadClientOptions {
  readonly baseUrl: string;
  readonly getIdToken: () => Promise<string>;
  readonly fetchImpl?: typeof fetch;
}

const trimBaseUrl = (value: string): string => value.trim().replace(/\/+$/u, '');

const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;

const nonEmpty = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() === value && value.length > 0;

const readBody = async (response: Response): Promise<Record<string, unknown>> => {
  try {
    return record(await response.json()) ?? {};
  } catch {
    return {};
  }
};

const request = async (
  options: SourceUploadClientOptions,
  path: string,
  body: unknown,
  operationId?: string,
): Promise<Record<string, unknown>> => {
  const baseUrl = trimBaseUrl(options.baseUrl);
  if (!baseUrl) throw new SourceUploadClientError('unavailable', 0);

  const token = (await options.getIdToken()).trim();
  if (!token) throw new SourceUploadClientError('unauthorized', 401);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  if (operationId) headers['Idempotency-Key'] = operationId;

  const response = await (options.fetchImpl ?? globalThis.fetch)(`${baseUrl}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const responseBody = await readBody(response);
  if (!response.ok) {
    throw new SourceUploadClientError(
      nonEmpty(responseBody.code) ? responseBody.code : `http_${response.status}`,
      response.status,
    );
  }
  return responseBody;
};

const requiredHeaders = (value: unknown): Readonly<Record<string, string>> | undefined => {
  const candidate = record(value);
  if (!candidate) return undefined;
  const entries = Object.entries(candidate);
  if (!entries.every(([key, headerValue]) => nonEmpty(key) && nonEmpty(headerValue))) return undefined;
  return Object.freeze(Object.fromEntries(entries) as Record<string, string>);
};

const validUploadAuthority = (
  upload: Record<string, unknown>,
  headers: Readonly<Record<string, string>>,
  command: BeginSourceUploadCommand,
): boolean => {
  if (!nonEmpty(upload.url) || !nonEmpty(upload.expiresAt)) return false;
  let url: URL;
  try {
    url = new URL(upload.url);
  } catch {
    return false;
  }
  const expiresAt = Date.parse(upload.expiresAt);
  const headerEntries = Object.entries(headers);
  const normalizedEntries = headerEntries.map(([key, value]) => [key.toLowerCase(), value] as const);
  const normalizedHeaders = Object.fromEntries(normalizedEntries);
  const allowedHeaders = [
    'content-type',
    'x-amz-content-sha256',
    'x-amz-meta-book-source-byte-size',
    'x-amz-meta-book-source-sha256',
  ];
  const checksum = command.inspection.sha256Hex.toLowerCase();
  return url.protocol === 'https:'
    && url.username === ''
    && url.password === ''
    && url.hash === ''
    && Number.isFinite(expiresAt)
    && expiresAt > Date.now()
    && headerEntries.length === allowedHeaders.length
    && new Set(normalizedEntries.map(([key]) => key)).size === allowedHeaders.length
    && allowedHeaders.every((key) => Object.hasOwn(normalizedHeaders, key))
    && normalizedHeaders['content-type'] === 'application/pdf'
    && normalizedHeaders['x-amz-content-sha256'] === checksum
    && normalizedHeaders['x-amz-meta-book-source-byte-size'] === String(command.inspection.exactByteSize)
    && normalizedHeaders['x-amz-meta-book-source-sha256'] === checksum;
};

export const createSourceUploadClient = (options: SourceUploadClientOptions) => ({
  async begin(command: BeginSourceUploadCommand): Promise<BeginSourceUploadResult> {
    const body = await request(
      options,
      `${BOOK_SOURCE_UPLOAD_ROUTE}/${encodeURIComponent(command.bookId)}/upload/begin`,
      {
        operationId: command.operationId,
        sourceKey: command.sourceKey,
        kind: command.kind,
        inspection: command.inspection,
      },
      command.operationId,
    );
    const upload = record(body.upload);
    const headers = requiredHeaders(upload?.requiredHeaders);
    if (
      (body.status !== 'reserved' && body.status !== 'replayed')
      || !nonEmpty(body.reservationId)
      || !nonEmpty(body.sourceVersionId)
      || !headers
      || !upload
      || !validUploadAuthority(upload, headers, command)
    ) {
      throw new SourceUploadClientError('invalid_response', 502);
    }
    return {
      status: body.status,
      reservationId: body.reservationId,
      sourceVersionId: body.sourceVersionId,
      upload: {
        url: upload.url as string,
        expiresAt: upload.expiresAt as string,
        requiredHeaders: headers,
      },
    };
  },

  async complete(command: CompleteSourceUploadCommand): Promise<CompleteSourceUploadResult> {
    const body = await request(
      options,
      `${BOOK_SOURCE_UPLOAD_ROUTE}/${encodeURIComponent(command.bookId)}/upload/${encodeURIComponent(command.reservationId)}/complete`,
      {
        providerFileId: command.providerFileId,
        providerFileVersionId: command.providerFileVersionId,
      },
    );
    if (
      (body.status !== 'verified_completed' && body.status !== 'replayed')
      || body.reservationId !== command.reservationId
      || !nonEmpty(body.sourceVersionId)
    ) {
      throw new SourceUploadClientError('invalid_response', 502);
    }
    return {
      status: body.status,
      reservationId: command.reservationId,
      sourceVersionId: body.sourceVersionId,
    };
  },
});
