import type { BookSourceVersionStorageIdentity } from '../../../src/types/bookSource.types.ts';
import {
  SourceProviderError,
  SOURCE_PROVIDER_ACCOUNT_TOTALS_MAX_PAGE_SIZE,
  type SourceProviderAccountTotalsPage,
  type SourceProviderBoundedRead,
  type SourceProviderObjectMetadata,
  type SourceProviderPort,
  type SourceProviderRequestOptions,
  type SourceProviderUploadAuthorization,
} from '../../../src/services/book-source-delivery/sourceProvider.port.ts';

/**
 * Ticket 03B owns upload, verification, metadata, totals, and bounded reads.
 * Exact deletion stays behind the separate cleanup/replacement authority owned
 * by tickets 07 and 47, so this adapter deliberately implements only its
 * issue-owned subset of the provider-neutral port.
 */
type BackblazeB2ProviderOperations = Pick<SourceProviderPort,
  | 'authorizeUpload'
  | 'verifyCompletedObject'
  | 'readObjectMetadata'
  | 'readAccountTotalsPage'
  | 'readBounded'
>;

const PROVIDER_KIND = 'backblaze-b2-s3';
const MAX_UPLOAD_LEASE_MS = 15 * 60 * 1_000;
const DEFAULT_MAX_READ_BYTES = 1024 * 1024;
const SHA_256 = 'SHA-256';
const MAX_ACCOUNT_TOTALS_CONTINUATION_LENGTH = 4_096;
const MAX_METADATA_RESPONSE_BYTES = 64 * 1024;

export interface BackblazeB2SourceProviderConfig {
  /** Private B2 S3 endpoint, e.g. https://s3.us-west-004.backblazeb2.com. */
  readonly endpoint: string;
  readonly region: string;
  /** Saved B2 bucket identity. `privateBucketName` is used only to form S3 paths. */
  readonly storageLocationId: string;
  readonly privateBucketId: string;
  readonly privateBucketName: string;
  /** Exact provider key prefix returned by every operation-scoped key. */
  readonly objectKeyPrefix: string;
  /** Operation-scoped Worker secrets. Never expose secret values to callers. */
  readonly uploadCredentials: BackblazeB2ApplicationKey;
  readonly metadataCredentials: BackblazeB2ApplicationKey;
  readonly readCredentials: BackblazeB2ApplicationKey;
  readonly fetch?: typeof fetch;
  readonly now?: () => Date;
  /** Small processor probes only. Never use this port to buffer a PDF. */
  readonly maxReadBytes?: number;
}

export interface BackblazeB2ApplicationKey {
  readonly applicationKeyId: string;
  readonly applicationKey: string;
}

export interface BackblazeB2SourceProviderEnv {
  readonly BOOK_SOURCE_B2_ENDPOINT: string;
  readonly BOOK_SOURCE_B2_REGION: string;
  readonly BOOK_SOURCE_B2_STORAGE_LOCATION_ID: string;
  readonly BOOK_SOURCE_B2_PRIVATE_BUCKET_ID: string;
  readonly BOOK_SOURCE_B2_PRIVATE_BUCKET_NAME: string;
  readonly BOOK_SOURCE_B2_OBJECT_KEY_PREFIX: string;
  readonly BOOK_SOURCE_B2_UPLOAD_APPLICATION_KEY_ID: string;
  readonly BOOK_SOURCE_B2_UPLOAD_APPLICATION_KEY: string;
  readonly BOOK_SOURCE_B2_METADATA_APPLICATION_KEY_ID: string;
  readonly BOOK_SOURCE_B2_METADATA_APPLICATION_KEY: string;
  readonly BOOK_SOURCE_B2_READ_APPLICATION_KEY_ID: string;
  readonly BOOK_SOURCE_B2_READ_APPLICATION_KEY: string;
}

interface B2FileInfo {
  readonly fileId?: unknown;
  readonly fileName?: unknown;
  readonly contentLength?: unknown;
  readonly contentType?: unknown;
  readonly contentSha1?: unknown;
  readonly action?: unknown;
}

interface B2ListVersionsResponse {
  readonly files?: unknown;
  readonly nextFileName?: unknown;
  readonly nextFileId?: unknown;
}

interface B2AuthorizationResponse {
  readonly allowed?: unknown;
  readonly apiUrl?: unknown;
  readonly s3ApiUrl?: unknown;
  readonly apiInfo?: unknown;
  readonly authorizationToken?: unknown;
}

interface B2AuthorizedStorageApi {
  readonly apiUrl: string;
  readonly token: string;
  readonly s3ApiUrl: string;
  readonly capabilities: ReadonlySet<string>;
  readonly buckets: readonly { readonly id: string; readonly name: string | null }[];
  readonly namePrefix: string | null;
}

type B2AuthorityKind = 'upload' | 'metadata' | 'read';

const encoder = new TextEncoder();
const sha256Hex = /^[a-f0-9]{64}$/u;
const safeObjectKey = /^(?!\/)(?!.*(?:^|\/)\.\.?\/)[A-Za-z0-9!$&'()*+,=:@._\/-]{1,1024}$/u;
const safeObjectKeyPrefix = /^(?!\/)(?!.*(?:^|\/)\.\.?\/)[A-Za-z0-9!$&'()*+,=:@._\/-]{1,768}\/$/u;
const safeProviderId = /^[A-Za-z0-9._=-]{1,512}$/u;
const safeBucketId = /^[A-Za-z0-9_-]{1,160}$/u;
const safeBucketName = /^[a-z0-9][a-z0-9.-]{4,61}[a-z0-9]$/u;
const safeLocationId = /^[A-Za-z0-9_-]{1,160}$/u;
const safeRegion = /^[a-z0-9-]{1,64}$/u;
const PROVIDER_TIMEOUT_MS = 10_000;

const fail = (code: ConstructorParameters<typeof SourceProviderError>[0], retryable = false): never => {
  throw new SourceProviderError(code, retryable);
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

const readBoundedJsonRecord = async (
  response: Response,
  maxBytes: number,
): Promise<Record<string, unknown> | null> => {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength !== null
    && (!/^\d+$/u.test(declaredLength) || Number(declaredLength) > maxBytes)) {
    fail('metadata_mismatch');
  }
  const reader = response.body?.getReader();
  if (!reader) fail('metadata_mismatch');

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      fail('metadata_mismatch');
    }
    chunks.push(value);
  }

  const encoded = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    encoded.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return asRecord(JSON.parse(new TextDecoder().decode(encoded)));
  } catch {
    fail('metadata_mismatch');
  }
};

const hex = (bytes: Uint8Array): string => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

const base64 = (bytes: Uint8Array): string => {
  let result = '';
  for (const byte of bytes) result += String.fromCharCode(byte);
  return btoa(result);
};

const base64Url = (bytes: Uint8Array): string => base64(bytes)
  .replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/gu, '');

const decodeBase64Url = (value: string): Uint8Array | null => {
  if (!/^[A-Za-z0-9_-]{1,4096}$/u.test(value) || value.length % 4 === 1) return null;
  try {
    const binary = atob(value.replace(/-/gu, '+').replace(/_/gu, '/').padEnd(Math.ceil(value.length / 4) * 4, '='));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
};

const awsEncode = (value: string): string => encodeURIComponent(value)
  .replace(/[!'()*]/gu, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
const encodePath = (value: string): string => value.split('/').map(awsEncode).join('/');
const canonicalQuery = (params: Readonly<Record<string, string>>): string => Object.entries(params)
  .map(([key, value]) => [awsEncode(key), awsEncode(value)] as const)
  .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
    leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0)
  .map(([key, value]) => `${key}=${value}`)
  .join('&');

const awsDate = (date: Date): { readonly full: string; readonly day: string } => {
  const full = date.toISOString().replace(/[-:]/gu, '').replace(/\.\d{3}Z$/u, 'Z');
  return { full, day: full.slice(0, 8) };
};

const statusFailure = (status: number): SourceProviderError => {
  if (status === 404) return new SourceProviderError('not_found', false);
  if (status === 401 || status === 403) return new SourceProviderError('unauthorized', false);
  if (status === 409 || status === 412) return new SourceProviderError('conflict', true);
  return new SourceProviderError('timeout', true);
};

const checkedString = (value: unknown): string | null => typeof value === 'string' && value.length > 0 ? value : null;
const checkedInteger = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;

const encodeAccountTotalsContinuation = (fileName: string, fileId: string): string =>
  base64Url(encoder.encode(JSON.stringify({ fileName, fileId })));

const decodeAccountTotalsContinuation = (continuation: string): { readonly fileName: string; readonly fileId: string } | null => {
  if (continuation.length > MAX_ACCOUNT_TOTALS_CONTINUATION_LENGTH) return null;
  const encoded = decodeBase64Url(continuation);
  if (!encoded) return null;
  try {
    const parsed = asRecord(JSON.parse(new TextDecoder().decode(encoded)));
    const fileName = checkedString(parsed?.fileName);
    const fileId = checkedString(parsed?.fileId);
    return fileName && fileId ? Object.freeze({ fileName, fileId }) : null;
  } catch {
    return null;
  }
};

const checkedNullableString = (value: unknown): string | null | undefined =>
  value === null ? null : checkedString(value) ?? undefined;

const requiredConfiguration = (env: Record<string, unknown>, name: string): string => {
  const value = env[name];
  if (typeof value !== 'string' || !value.trim()) throw new SourceProviderError('metadata_mismatch', false);
  return value.trim();
};

const looksLikeMasterKey = (value: string): boolean => /master(?:[-_ ]?key)?/iu.test(value);

const credentialsFromEnv = (env: Record<string, unknown>, prefix: string): BackblazeB2ApplicationKey => {
  const applicationKeyId = requiredConfiguration(env, `${prefix}_ID`);
  const applicationKey = requiredConfiguration(env, prefix);
  if (looksLikeMasterKey(applicationKeyId) || looksLikeMasterKey(applicationKey)) {
    throw new SourceProviderError('unauthorized', false);
  }
  return Object.freeze({ applicationKeyId, applicationKey });
};

export const hasBackblazeB2SourceProviderConfiguration = (env: Record<string, unknown>): boolean => {
  try {
    createBackblazeB2SourceProviderFromEnv(env);
    return true;
  } catch {
    return false;
  }
};

/** Parses named Worker bindings only. No remote call occurs here. */
export const createBackblazeB2SourceProviderFromEnv = (
  env: Record<string, unknown>,
  options: Pick<BackblazeB2SourceProviderConfig, 'fetch' | 'now' | 'maxReadBytes'> = {},
): BackblazeB2SourceProvider => new BackblazeB2SourceProvider({
  endpoint: requiredConfiguration(env, 'BOOK_SOURCE_B2_ENDPOINT'),
  region: requiredConfiguration(env, 'BOOK_SOURCE_B2_REGION'),
  storageLocationId: requiredConfiguration(env, 'BOOK_SOURCE_B2_STORAGE_LOCATION_ID'),
  privateBucketId: requiredConfiguration(env, 'BOOK_SOURCE_B2_PRIVATE_BUCKET_ID'),
  privateBucketName: requiredConfiguration(env, 'BOOK_SOURCE_B2_PRIVATE_BUCKET_NAME'),
  objectKeyPrefix: requiredConfiguration(env, 'BOOK_SOURCE_B2_OBJECT_KEY_PREFIX'),
  uploadCredentials: credentialsFromEnv(env, 'BOOK_SOURCE_B2_UPLOAD_APPLICATION_KEY'),
  metadataCredentials: credentialsFromEnv(env, 'BOOK_SOURCE_B2_METADATA_APPLICATION_KEY'),
  readCredentials: credentialsFromEnv(env, 'BOOK_SOURCE_B2_READ_APPLICATION_KEY'),
  ...options,
});

/** Private B2 adapter. No provider error body, credential, or object URL is logged. */
export class BackblazeB2SourceProvider implements BackblazeB2ProviderOperations {
  private readonly endpoint: URL;
  private readonly authorizationUrl: string;
  private readonly fetcher: typeof fetch;
  private readonly now: () => Date;
  private readonly maxReadBytes: number;

  constructor(private readonly config: BackblazeB2SourceProviderConfig) {
    let endpoint: URL;
    try { endpoint = new URL(config.endpoint); } catch { throw new SourceProviderError('metadata_mismatch', false); }
    const cluster = /-(\d{3})$/u.exec(config.region)?.[1];
    if (endpoint.protocol !== 'https:' || endpoint.pathname !== '/' || endpoint.search || endpoint.hash
      || endpoint.username || endpoint.password || endpoint.hostname !== `s3.${config.region}.backblazeb2.com`
      || !safeRegion.test(config.region) || !cluster || !safeLocationId.test(config.storageLocationId)
      || !safeBucketId.test(config.privateBucketId) || !safeBucketName.test(config.privateBucketName)
      || !safeObjectKeyPrefix.test(config.objectKeyPrefix)
      || Object.values({
        ...config.uploadCredentials,
        ...config.metadataCredentials,
        ...config.readCredentials,
      }).some((value) => !value || looksLikeMasterKey(value))) {
      fail('metadata_mismatch');
    }
    const credentials = [config.uploadCredentials, config.metadataCredentials, config.readCredentials];
    const credentialIds = credentials.map(({ applicationKeyId }) => applicationKeyId);
    const credentialSecrets = credentials.map(({ applicationKey }) => applicationKey);
    if (new Set(credentialIds).size !== credentialIds.length
      || new Set(credentialSecrets).size !== credentialSecrets.length) fail('unauthorized');
    this.endpoint = endpoint;
    this.authorizationUrl = `https://api${cluster}.backblazeb2.com/b2api/v4/b2_authorize_account`;
    this.fetcher = config.fetch ?? fetch;
    this.now = config.now ?? (() => new Date());
    this.maxReadBytes = config.maxReadBytes ?? DEFAULT_MAX_READ_BYTES;
    if (!Number.isSafeInteger(this.maxReadBytes) || this.maxReadBytes < 1) fail('metadata_mismatch');
  }

  async authorizeUpload(input: {
    readonly storageLocationId: string;
    readonly providerKind: string;
    readonly privateBucketId: string;
    readonly providerObjectKey: string;
    readonly expectedChecksum: BookSourceVersionStorageIdentity['checksum'];
    readonly expectedByteSize: number;
    readonly expiresAt: string;
    readonly issuedAt?: string;
  }, options?: SourceProviderRequestOptions): Promise<SourceProviderUploadAuthorization> {
    this.assertLocation(input);
    if (!safeObjectKey.test(input.providerObjectKey) || input.expectedChecksum.algorithm !== 'sha-256'
      || !sha256Hex.test(input.expectedChecksum.value) || !Number.isSafeInteger(input.expectedByteSize) || input.expectedByteSize < 1) {
      fail('metadata_mismatch');
    }
    const currentTime = this.now();
    const signingTime = input.issuedAt === undefined ? currentTime : new Date(input.issuedAt);
    if (!Number.isFinite(signingTime.getTime()) || signingTime.getTime() > currentTime.getTime()) fail('unauthorized');
    const expiresAtMs = new Date(input.expiresAt).getTime();
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= currentTime.getTime()) fail('unauthorized');
    const expiresInMs = expiresAtMs - signingTime.getTime();
    if (!Number.isFinite(expiresInMs) || expiresInMs <= 0 || expiresInMs > MAX_UPLOAD_LEASE_MS) fail('unauthorized');
    this.throwIfCancelled(options);
    const expiresSeconds = Math.floor(expiresInMs / 1000);
    if (expiresSeconds < 1 || expiresSeconds > MAX_UPLOAD_LEASE_MS / 1000) fail('unauthorized');
    const signedExpiresAtMs = Math.floor(signingTime.getTime() / 1000) * 1000 + expiresSeconds * 1000;
    if (signedExpiresAtMs <= currentTime.getTime() || signedExpiresAtMs > expiresAtMs) fail('unauthorized');
    await this.b2Authorize(this.config.uploadCredentials, 'upload', input.providerObjectKey, options);
    const requiredHeaders = Object.freeze({
      'content-type': 'application/pdf',
      // B2 validates the SigV4 payload digest without sending bytes through the
      // Worker. User metadata persists that same digest for exact-version HEAD.
      'x-amz-content-sha256': input.expectedChecksum.value,
      'x-amz-meta-book-source-byte-size': String(input.expectedByteSize),
      'x-amz-meta-book-source-sha256': input.expectedChecksum.value,
    });
    const signed = await this.presign({
      method: 'PUT', objectKey: input.providerObjectKey, expiresSeconds, headers: requiredHeaders,
      // Presigned S3 requests use the SigV4 unsigned-payload marker in the
      // canonical request. The actual SHA-256 remains bound by the signed
      // x-amz-content-sha256 header and the persisted metadata.
      payloadHash: 'UNSIGNED-PAYLOAD', now: signingTime,
      credentials: this.config.uploadCredentials,
    });
    // `authorizationId` is a short-lived, exact-object S3 presigned target.
    // It is a capability, not an account credential; the port intentionally
    // carries no reusable application-key value.
    return Object.freeze({
      authorizationId: signed.url,
      expiresAt: new Date(signedExpiresAtMs).toISOString(),
      storageLocationId: input.storageLocationId,
      providerKind: input.providerKind,
      privateBucketId: input.privateBucketId,
      providerObjectKey: input.providerObjectKey,
      requiredHeaders,
    });
  }

  async verifyCompletedObject(input: { readonly expected: BookSourceVersionStorageIdentity }, options?: SourceProviderRequestOptions): Promise<SourceProviderObjectMetadata> {
    return this.readObjectMetadata({ identity: input.expected }, options);
  }

  async readObjectMetadata(input: { readonly identity: BookSourceVersionStorageIdentity }, options?: SourceProviderRequestOptions): Promise<SourceProviderObjectMetadata> {
    this.assertIdentity(input.identity);
    const authorization = await this.b2Authorize(
      this.config.metadataCredentials,
      'metadata',
      input.identity.providerObjectKey,
      options,
    );
    const requestUrl = new URL(`${authorization.apiUrl}/b2api/v4/b2_get_file_info`);
    requestUrl.searchParams.set('fileId', input.identity.providerFileVersionId);
    const response = await this.request(requestUrl.href, {
      method: 'GET',
      headers: { Authorization: authorization.token },
    }, options);
    if (!response.ok) throw statusFailure(response.status);

    const metadata = await readBoundedJsonRecord(response, MAX_METADATA_RESPONSE_BYTES);
    const fileInfo = asRecord(metadata?.fileInfo);
    const length = checkedInteger(metadata?.contentLength);
    const contentType = checkedString(metadata?.contentType)?.trim().toLowerCase();
    const checksum = checkedString(fileInfo?.['book-source-sha256']);
    const declaredByteSize = checkedString(fileInfo?.['book-source-byte-size']);
    const fileId = checkedString(metadata?.fileId);
    const fileName = checkedString(metadata?.fileName);
    const bucketId = checkedString(metadata?.bucketId);
    if (length !== input.identity.byteSize || contentType !== 'application/pdf'
      || checksum !== input.identity.checksum.value || declaredByteSize !== String(input.identity.byteSize)
      || fileName !== input.identity.providerObjectKey || bucketId !== input.identity.privateBucketId
      || !fileId) {
      fail('metadata_mismatch');
    }
    if (input.identity.providerFileId !== fileId || input.identity.providerFileVersionId !== fileId) {
      fail('provider_drift');
    }
    return Object.freeze({
      identity: input.identity,
      contentType: 'application/pdf',
    });
  }

  async readBounded(input: {
    readonly identity: BookSourceVersionStorageIdentity;
    readonly range: { readonly offset: number; readonly length?: number; readonly suffixLength?: never }
      | { readonly offset?: never; readonly length?: never; readonly suffixLength: number };
  }, options?: SourceProviderRequestOptions): Promise<SourceProviderBoundedRead> {
    this.assertIdentity(input.identity);
    await this.b2Authorize(this.config.readCredentials, 'read', input.identity.providerObjectKey, options);
    const range = this.toRange(input.range);
    const response = await this.s3Fetch({
      method: 'GET', objectKey: input.identity.providerObjectKey,
      versionId: input.identity.providerFileVersionId, options,
      headers: { range: range.header }, credentials: this.config.readCredentials,
    });
    if (response.status !== 206) throw statusFailure(response.status);
    const contentRange = response.headers.get('content-range');
    const match = contentRange?.match(/^bytes (\d+)-(\d+)\/(\d+)$/u);
    if (!match) throw new SourceProviderError('metadata_mismatch', false);
    const offset = Number(match[1]);
    const last = Number(match[2]);
    const totalByteSize = Number(match[3]);
    const expectedOffset = 'suffixLength' in input.range && input.range.suffixLength !== undefined
      ? Math.max(0, totalByteSize - input.range.suffixLength)
      : input.range.offset;
    const expectedLength = 'suffixLength' in input.range && input.range.suffixLength !== undefined
      ? Math.min(totalByteSize, input.range.suffixLength)
      : Math.min(input.range.length!, Math.max(0, totalByteSize - input.range.offset));
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(last) || !Number.isSafeInteger(totalByteSize)
      || totalByteSize !== input.identity.byteSize || offset !== expectedOffset
      || expectedLength !== last - offset + 1 || expectedLength > this.maxReadBytes) {
      fail('metadata_mismatch');
    }
    const declaredLength = response.headers.get('content-length');
    if (declaredLength !== null && Number(declaredLength) !== expectedLength) fail('metadata_mismatch');
    const bytes = await this.readBoundedBody(response, expectedLength);
    return Object.freeze({ bytes, totalByteSize, offset });
  }

  async readAccountTotalsPage(input: {
    readonly storageLocationId: string;
    readonly privateBucketId: string;
    readonly continuation?: string;
    readonly maxPageSize?: number;
  }, options?: SourceProviderRequestOptions): Promise<SourceProviderAccountTotalsPage> {
    this.assertLocation({ ...input, providerKind: PROVIDER_KIND });
    const maxPageSize = input.maxPageSize ?? SOURCE_PROVIDER_ACCOUNT_TOTALS_MAX_PAGE_SIZE;
    if (!Number.isSafeInteger(maxPageSize) || maxPageSize < 1 || maxPageSize > SOURCE_PROVIDER_ACCOUNT_TOTALS_MAX_PAGE_SIZE) {
      fail('metadata_mismatch');
    }
    const cursor = input.continuation === undefined ? undefined : decodeAccountTotalsContinuation(input.continuation);
    if (input.continuation !== undefined && !cursor) fail('metadata_mismatch');
    let totalBytes = 0;
    let objectCount = 0;
    const authorization = await this.b2Authorize(this.config.metadataCredentials, 'metadata', undefined, options);
    const body: Record<string, unknown> = {
      bucketId: input.privateBucketId,
      prefix: this.config.objectKeyPrefix,
      maxFileCount: maxPageSize,
    };
    if (cursor) { body.startFileName = cursor.fileName; body.startFileId = cursor.fileId; }
    const response = await this.request(`${authorization.apiUrl}/b2api/v4/b2_list_file_versions`, {
      method: 'POST', headers: { Authorization: authorization.token, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }, options);
    if (!response.ok) throw statusFailure(response.status);
    const parsed = asRecord(await response.json()) as B2ListVersionsResponse | null;
    if (!parsed || !Array.isArray(parsed.files) || parsed.files.length > maxPageSize) {
      throw new SourceProviderError('metadata_mismatch', false);
    }
    for (const rawFile of parsed.files) {
      const file = asRecord(rawFile) as B2FileInfo | null;
      if (!file || file.action !== 'upload') continue;
      const size = checkedInteger(file.contentLength);
      const fileName = checkedString(file.fileName);
      if (size === null || !checkedString(file.fileId)
        || !fileName?.startsWith(this.config.objectKeyPrefix)) {
        fail('metadata_mismatch');
      }
      totalBytes += size;
      objectCount += 1;
      if (!Number.isSafeInteger(totalBytes) || !Number.isSafeInteger(objectCount)) fail('metadata_mismatch');
    }
    const nextFileName = checkedString(parsed.nextFileName) ?? undefined;
    const nextFileId = checkedString(parsed.nextFileId) ?? undefined;
    if ((nextFileName === undefined) !== (nextFileId === undefined)) fail('metadata_mismatch');
    if (nextFileName !== undefined && !nextFileName.startsWith(this.config.objectKeyPrefix)) {
      fail('metadata_mismatch');
    }
    const continuation = nextFileName && nextFileId
      ? encodeAccountTotalsContinuation(nextFileName, nextFileId)
      : undefined;
    if (continuation !== undefined && continuation === input.continuation) fail('metadata_mismatch');
    return Object.freeze({
      storageLocationId: input.storageLocationId,
      privateBucketId: input.privateBucketId,
      totalBytes,
      objectCount,
      ...(continuation === undefined ? {} : { continuation }),
    });
  }

  private assertLocation(input: { readonly storageLocationId: string; readonly providerKind: string; readonly privateBucketId: string }): void {
    if (input.storageLocationId !== this.config.storageLocationId || input.providerKind !== PROVIDER_KIND || input.privateBucketId !== this.config.privateBucketId) {
      fail('unauthorized');
    }
  }

  private assertIdentity(identity: BookSourceVersionStorageIdentity): void {
    this.assertLocation(identity);
    if (!safeObjectKey.test(identity.providerObjectKey) || !safeProviderId.test(identity.providerFileId)
      || !safeProviderId.test(identity.providerFileVersionId)
      || identity.checksum.algorithm !== 'sha-256' || !sha256Hex.test(identity.checksum.value)
      || !Number.isSafeInteger(identity.byteSize) || identity.byteSize < 1) fail('metadata_mismatch');
  }

  private toRange(range: { readonly offset: number; readonly length?: number; readonly suffixLength?: never } | { readonly offset?: never; readonly length?: never; readonly suffixLength: number }): { readonly header: string } {
    if ('suffixLength' in range && range.suffixLength !== undefined) {
      if (!Number.isSafeInteger(range.suffixLength) || range.suffixLength < 1 || range.suffixLength > this.maxReadBytes) fail('metadata_mismatch');
      return { header: `bytes=-${range.suffixLength}` };
    }
    if (!Number.isSafeInteger(range.offset) || range.offset < 0 || !Number.isSafeInteger(range.length)
      || range.length! < 1 || range.length! > this.maxReadBytes) fail('metadata_mismatch');
    return { header: `bytes=${range.offset}-${range.offset + range.length! - 1}` };
  }

  private async s3Fetch(input: { readonly method: 'HEAD' | 'GET'; readonly objectKey: string; readonly versionId: string; readonly headers?: Record<string, string>; readonly options?: SourceProviderRequestOptions; readonly credentials: BackblazeB2ApplicationKey }): Promise<Response> {
    const signed = await this.presign({
      method: input.method, objectKey: input.objectKey, expiresSeconds: 60,
      query: { versionId: input.versionId }, headers: input.headers ?? {}, credentials: input.credentials,
    });
    return this.request(signed.url, { method: input.method, headers: input.headers }, input.options);
  }

  private async presign(input: { readonly method: 'PUT' | 'HEAD' | 'GET'; readonly objectKey: string; readonly expiresSeconds: number; readonly query?: Readonly<Record<string, string>>; readonly headers: Record<string, string>; readonly payloadHash?: string; readonly credentials: BackblazeB2ApplicationKey; readonly now?: Date }): Promise<{ readonly url: string }> {
    const date = awsDate(input.now ?? this.now());
    const host = this.endpoint.host;
    const credentialScope = `${date.day}/${this.config.region}/s3/aws4_request`;
    const normalizedHeaders = Object.entries({ host, ...input.headers })
      .map(([name, value]) => [name.toLowerCase(), value.trim().replace(/\s+/gu, ' ')] as const)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
    const signedHeaders = normalizedHeaders.map(([name]) => name).join(';');
    const canonicalHeaders = normalizedHeaders.map(([name, value]) => `${name}:${value}\n`).join('');
    const query = {
      ...input.query,
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': `${input.credentials.applicationKeyId}/${credentialScope}`,
      'X-Amz-Date': date.full,
      'X-Amz-Expires': String(input.expiresSeconds),
      'X-Amz-SignedHeaders': signedHeaders,
    };
    const canonicalUri = `/${awsEncode(this.config.privateBucketName)}/${encodePath(input.objectKey)}`;
    const canonicalRequest = [
      input.method,
      canonicalUri,
      canonicalQuery(query),
      canonicalHeaders,
      signedHeaders,
      input.payloadHash ?? 'UNSIGNED-PAYLOAD',
    ].join('\n');
    const stringToSign = ['AWS4-HMAC-SHA256', date.full, credentialScope, await this.digest(canonicalRequest)].join('\n');
    const signingKey = await this.signingKey(date.day, input.credentials.applicationKey);
    const signature = hex(new Uint8Array(await crypto.subtle.sign('HMAC', signingKey, encoder.encode(stringToSign))));
    return { url: `${this.endpoint.origin}${canonicalUri}?${canonicalQuery({ ...query, 'X-Amz-Signature': signature })}` };
  }

  private async signingKey(day: string, applicationKey: string): Promise<CryptoKey> {
    const hmac = async (key: BufferSource, value: string): Promise<ArrayBuffer> => {
      const imported = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: SHA_256 }, false, ['sign']);
      return crypto.subtle.sign('HMAC', imported, encoder.encode(value));
    };
    const dateKey = await hmac(encoder.encode(`AWS4${applicationKey}`), day);
    const regionKey = await hmac(dateKey, this.config.region);
    const serviceKey = await hmac(regionKey, 's3');
    const signingKey = await hmac(serviceKey, 'aws4_request');
    return crypto.subtle.importKey('raw', signingKey, { name: 'HMAC', hash: SHA_256 }, false, ['sign']);
  }

  private async digest(value: string): Promise<string> {
    return hex(new Uint8Array(await crypto.subtle.digest(SHA_256, encoder.encode(value))));
  }

  private async readBoundedBody(response: Response, expectedLength: number): Promise<Uint8Array> {
    if (!response.body || expectedLength < 1 || expectedLength > this.maxReadBytes) fail('metadata_mismatch');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > expectedLength || received > this.maxReadBytes) {
          await reader.cancel();
          fail('metadata_mismatch');
        }
        chunks.push(value);
      }
    } catch (error) {
      if (error instanceof SourceProviderError) throw error;
      throw new SourceProviderError('timeout', true);
    }
    if (received !== expectedLength) fail('metadata_mismatch');

    const result = new Uint8Array(received);
    let cursor = 0;
    for (const chunk of chunks) {
      result.set(chunk, cursor);
      cursor += chunk.byteLength;
    }
    return result;
  }

  private throwIfCancelled(options?: SourceProviderRequestOptions): void {
    if (options?.signal?.aborted) fail('aborted');
    if (options?.timeoutMs !== undefined && (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1)) fail('timeout', true);
  }

  private async request(url: string, init: RequestInit, options?: SourceProviderRequestOptions): Promise<Response> {
    this.throwIfCancelled(options);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options?.timeoutMs ?? PROVIDER_TIMEOUT_MS);
    const onAbort = () => controller.abort();
    options?.signal?.addEventListener('abort', onAbort, { once: true });
    try {
      return await this.fetcher.call(globalThis, url, { ...init, redirect: 'manual', signal: controller.signal });
    } catch {
      if (options?.signal?.aborted) throw new SourceProviderError('aborted', false);
      throw new SourceProviderError('timeout', true);
    } finally {
      clearTimeout(timeout);
      options?.signal?.removeEventListener('abort', onAbort);
    }
  }

  private async b2Authorize(
    credentials: BackblazeB2ApplicationKey,
    authority: B2AuthorityKind,
    objectKey: string | undefined,
    options?: SourceProviderRequestOptions,
  ): Promise<B2AuthorizedStorageApi> {
    const response = await this.request(this.authorizationUrl, {
      method: 'GET', headers: { Authorization: `Basic ${base64(encoder.encode(`${credentials.applicationKeyId}:${credentials.applicationKey}`))}` },
    }, options);
    if (!response.ok) throw statusFailure(response.status);
    const parsed = asRecord(await response.json()) as B2AuthorizationResponse | null;
    const apiInfo = asRecord(parsed?.apiInfo);
    const storageApi = asRecord(apiInfo?.storageApi);
    const allowed = asRecord(storageApi?.allowed ?? parsed?.allowed);
    const apiUrl = checkedString(storageApi?.apiUrl ?? parsed?.apiUrl);
    const s3ApiUrl = checkedString(storageApi?.s3ApiUrl ?? parsed?.s3ApiUrl);
    const token = checkedString(parsed?.authorizationToken);
    const rawCapabilities = allowed?.capabilities;
    if (!apiUrl || !s3ApiUrl || !token || !apiUrl.startsWith('https://')
      || !Array.isArray(rawCapabilities) || rawCapabilities.some((value) => typeof value !== 'string')) {
      throw new SourceProviderError('metadata_mismatch', false);
    }
    const capabilities = new Set(rawCapabilities as string[]);
    const required = authority === 'upload' ? ['writeFiles']
      : authority === 'metadata' ? ['readFiles', 'listFiles'] : ['readFiles'];
    // Reject "required plus broad powers" keys. A master or over-privileged
    // application key must not pass merely because it contains the one
    // capability this operation needs.
    if (capabilities.size !== required.length
      || required.some((capability) => !capabilities.has(capability))) fail('unauthorized');

    const rawBuckets = allowed?.buckets;
    const buckets: readonly { readonly id: string; readonly name: string | null }[] = Array.isArray(rawBuckets)
      ? rawBuckets.map((value): { readonly id: string; readonly name: string | null } => {
        const bucket = asRecord(value);
        const id = bucket?.id;
        const name = bucket?.name;
        const bucketName: string | null = name === null
          ? null
          : typeof name === 'string'
            ? name
            : (() => { throw new SourceProviderError('metadata_mismatch', false); })();
        if (typeof id !== 'string' || !id) {
          throw new SourceProviderError('metadata_mismatch', false);
        }
        return Object.freeze({ id, name: bucketName });
      })
      : (() => {
        const id = checkedString(allowed?.bucketId);
        const name = checkedNullableString(allowed?.bucketName);
        return id && name !== undefined ? [Object.freeze({ id, name })] : [];
      })();
    if (buckets.length !== 1 || buckets[0]?.id !== this.config.privateBucketId
      || (buckets[0]?.name !== null && buckets[0]?.name !== this.config.privateBucketName)) fail('unauthorized');
    const rawNamePrefix = allowed?.namePrefix;
    const namePrefix: string | null = rawNamePrefix === null
      ? null
      : typeof rawNamePrefix === 'string'
        ? rawNamePrefix
        : (() => { throw new SourceProviderError('metadata_mismatch', false); })();
    if (namePrefix !== this.config.objectKeyPrefix
      || (objectKey !== undefined && !objectKey.startsWith(this.config.objectKeyPrefix))) {
      fail('unauthorized');
    }
    let authorizedApiUrl: URL;
    let authorizedS3Origin: string;
    try {
      authorizedApiUrl = new URL(apiUrl);
      authorizedS3Origin = new URL(s3ApiUrl).origin;
    }
    catch { throw new SourceProviderError('metadata_mismatch', false); }
    if (authorizedApiUrl.protocol !== 'https:' || authorizedApiUrl.pathname !== '/'
      || authorizedApiUrl.search || authorizedApiUrl.hash || authorizedApiUrl.username
      || authorizedApiUrl.password || !/^api\d+\.backblazeb2\.com$/u.test(authorizedApiUrl.hostname)
      || authorizedS3Origin !== this.endpoint.origin) fail('provider_drift');
    return Object.freeze({ apiUrl, token, s3ApiUrl: authorizedS3Origin, capabilities, buckets, namePrefix });
  }
}
