import type { BookSourceVersionStorageIdentity } from '../../../src/types/bookSource.types.ts';
import {
  SourceProviderError,
  SOURCE_PROVIDER_ACCOUNT_TOTALS_MAX_PAGE_SIZE,
  type SourceProviderAccountTotalsPage,
  type SourceProviderBoundedRead,
  type SourceProviderObjectMetadata,
  type SourceProviderObjectReservation,
  type SourceProviderPort,
  type SourceProviderRequestOptions,
  type SourceProviderUploadAuthorization,
} from '../../../src/services/book-source-delivery/sourceProvider.port.ts';

type OciS3ProviderOperations = Pick<SourceProviderPort,
  | 'authorizeUpload'
  | 'resolveCompletedObject'
  | 'verifyCompletedObject'
  | 'readObjectMetadata'
  | 'readAccountTotalsPage'
  | 'readBounded'
>;

export const OCI_S3_PROVIDER_KIND = 'oci-object-storage-s3';
const MAX_UPLOAD_LEASE_MS = 15 * 60 * 1_000;
const DEFAULT_MAX_READ_BYTES = 1024 * 1024;
const DEFAULT_METADATA_CACHE_TTL_MS = 60_000;
const MAX_METADATA_CACHE_ENTRIES = 256;
const MAX_ACCOUNT_TOTALS_CONTINUATION_LENGTH = 4_096;
const MAX_LIST_RESPONSE_BYTES = 1024 * 1024;
const MAX_COMPLETED_OBJECT_CANDIDATES = 32;
const PROVIDER_TIMEOUT_MS = 10_000;
const SHA_256 = 'SHA-256';
const EMPTY_PAYLOAD_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

export interface OciS3Credentials {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}

export interface OciS3SourceProviderConfig {
  /** OCI S3-compatible endpoint, e.g. https://<namespace>.compat.objectstorage.<region>.oraclecloud.com */
  readonly endpoint: string;
  readonly region: string;
  readonly storageLocationId: string;
  readonly privateBucketName: string;
  readonly privateBucketId?: string;
  readonly objectKeyPrefix: string;
  readonly credentials: OciS3Credentials;
  readonly fetch?: typeof fetch;
  readonly now?: () => Date;
  readonly maxReadBytes?: number;
  readonly metadataCacheTtlMs?: number;
}

interface ParsedS3Version {
  readonly key: string;
  readonly versionId: string;
  readonly size: number;
  readonly isLatest: boolean;
}

interface ParsedListVersionsResult {
  readonly isTruncated: boolean;
  readonly nextKeyMarker?: string;
  readonly nextVersionIdMarker?: string;
  readonly versions: readonly ParsedS3Version[];
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const sha256Hex = /^[a-f0-9]{64}$/u;
const safeObjectKey = /^(?!\/)(?!.*(?:^|\/)\.\.?\/)[A-Za-z0-9!$&'()*+,=:@._\/-]{1,1024}$/u;
const safeObjectKeyPrefix = /^(?!\/)(?!.*(?:^|\/)\.\.?\/)[A-Za-z0-9!$&'()*+,=:@._\/-]{1,768}\/$/u;
const safeProviderId = /^[A-Za-z0-9._=-]{1,512}$/u;
const safeBucketName = /^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$/u;
const safeLocationId = /^[A-Za-z0-9_-]{1,160}$/u;
const safeRegion = /^[a-z0-9-]{1,64}$/u;
const ociS3Hostname = /^[a-z0-9-]+\.compat\.objectstorage\.([a-z0-9-]+)\.oraclecloud\.com$/u;

const metadataCache = new Map<string, number>();

export const clearOciS3MetadataCacheForTests = (): void => {
  metadataCache.clear();
};

const fail = (code: ConstructorParameters<typeof SourceProviderError>[0], retryable = false): never => {
  throw new SourceProviderError(code, retryable);
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

const decodeXmlEntities = (value: string): string => value
  .replace(/&lt;/gu, '<')
  .replace(/&gt;/gu, '>')
  .replace(/&quot;/gu, '"')
  .replace(/&apos;/gu, "'")
  .replace(/&amp;/gu, '&');

const extractXmlTag = (xml: string, tag: string): string | undefined => {
  const match = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'u').exec(xml);
  return match ? decodeXmlEntities(match[1]!) : undefined;
};

const parseListVersionsXml = (xml: string): ParsedListVersionsResult => {
  if (!xml.includes('<ListVersionsResult')) fail('metadata_mismatch');
  const isTruncatedRaw = extractXmlTag(xml, 'IsTruncated');
  if (isTruncatedRaw !== 'true' && isTruncatedRaw !== 'false') fail('metadata_mismatch');
  const versions: ParsedS3Version[] = [];
  const versionPattern = /<Version>([\s\S]*?)<\/Version>/gu;
  for (const match of xml.matchAll(versionPattern)) {
    const block = match[1]!;
    const key = extractXmlTag(block, 'Key');
    const versionId = extractXmlTag(block, 'VersionId');
    const sizeText = extractXmlTag(block, 'Size');
    const isLatestRaw = extractXmlTag(block, 'IsLatest');
    if (!key || !versionId || !sizeText || !/^\d+$/u.test(sizeText)) fail('metadata_mismatch');
    const size = Number(sizeText);
    if (!Number.isSafeInteger(size) || size < 0) fail('metadata_mismatch');
    const isLatest = isLatestRaw === undefined ? true : isLatestRaw === 'true';
    versions.push(Object.freeze({ key, versionId, size, isLatest }));
  }
  const nextKeyMarker = extractXmlTag(xml, 'NextKeyMarker');
  const nextVersionIdMarker = extractXmlTag(xml, 'NextVersionIdMarker');
  return Object.freeze({
    isTruncated: isTruncatedRaw === 'true',
    ...(nextKeyMarker ? { nextKeyMarker } : {}),
    ...(nextVersionIdMarker ? { nextVersionIdMarker } : {}),
    versions: Object.freeze(versions),
  });
};

const encodeAccountTotalsContinuation = (keyMarker: string, versionIdMarker: string): string =>
  base64Url(encoder.encode(JSON.stringify({ keyMarker, versionIdMarker })));

const decodeAccountTotalsContinuation = (
  continuation: string,
): { readonly keyMarker: string; readonly versionIdMarker: string } | null => {
  if (continuation.length > MAX_ACCOUNT_TOTALS_CONTINUATION_LENGTH) return null;
  const encoded = decodeBase64Url(continuation);
  if (!encoded) return null;
  try {
    const parsed = JSON.parse(decoder.decode(encoded)) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const keyMarker = typeof parsed.keyMarker === 'string' && parsed.keyMarker.length > 0 ? parsed.keyMarker : null;
    const versionIdMarker = typeof parsed.versionIdMarker === 'string' && parsed.versionIdMarker.length > 0
      ? parsed.versionIdMarker
      : null;
    return keyMarker && versionIdMarker ? Object.freeze({ keyMarker, versionIdMarker }) : null;
  } catch {
    return null;
  }
};

const readBoundedResponseBody = async (
  response: Response,
  maxBytes: number,
  options?: SourceProviderRequestOptions,
): Promise<Uint8Array> => {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength !== null
    && (!/^\d+$/u.test(declaredLength) || Number(declaredLength) > maxBytes)) {
    const body = response.body;
    if (body) void body.cancel('metadata_mismatch').catch(() => undefined);
    fail('metadata_mismatch');
  }
  const reader = response.body?.getReader();
  if (!reader) fail('metadata_mismatch');

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  const configuredTimeoutMs = options?.timeoutMs ?? PROVIDER_TIMEOUT_MS;
  if (!Number.isSafeInteger(configuredTimeoutMs) || configuredTimeoutMs < 1) {
    void reader.cancel('timeout').catch(() => undefined);
    fail('timeout', true);
  }
  const deadlineRemaining = options?.deadlineAt === undefined
    ? configuredTimeoutMs
    : Math.floor(options.deadlineAt - Date.now());
  if (deadlineRemaining < 1) {
    void reader.cancel('timeout').catch(() => undefined);
    fail('timeout', true);
  }
  const timeoutMs = Math.min(configuredTimeoutMs, deadlineRemaining);
  if (options?.signal?.aborted) {
    void reader.cancel('aborted').catch(() => undefined);
    fail('aborted');
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancelledReject!: (reason: SourceProviderError) => void;
  const cancelled = new Promise<never>((_, reject) => {
    cancelledReject = reject;
  });
  const onAbort = () => cancelledReject(new SourceProviderError('aborted', false));
  options?.signal?.addEventListener('abort', onAbort, { once: true });
  const timedOut = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new SourceProviderError('timeout', true)), timeoutMs);
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), cancelled, timedOut]);
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        void reader.cancel().catch(() => undefined);
        fail('metadata_mismatch');
      }
      chunks.push(value);
    }
  } catch (error) {
    void reader.cancel(error).catch(() => undefined);
    if (error instanceof SourceProviderError) throw error;
    throw new SourceProviderError('timeout', true);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    options?.signal?.removeEventListener('abort', onAbort);
  }

  const encoded = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    encoded.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return encoded;
};

const requiredConfiguration = (env: Record<string, unknown>, name: string): string => {
  const value = env[name];
  if (typeof value !== 'string' || !value.trim()) throw new SourceProviderError('metadata_mismatch', false);
  return value.trim();
};

const metadataCacheKey = (identity: BookSourceVersionStorageIdentity): string => [
  identity.storageLocationId,
  identity.privateBucketId,
  identity.providerObjectKey,
  identity.providerFileId,
  identity.providerFileVersionId,
  String(identity.byteSize),
  identity.checksum.value,
].join('\u0000');

export const createOciS3SourceProviderFromEnv = (
  env: Record<string, unknown>,
  options: Pick<OciS3SourceProviderConfig, 'fetch' | 'now' | 'maxReadBytes' | 'metadataCacheTtlMs'> = {},
): OciS3SourceProvider => {
  const privateBucketName = requiredConfiguration(env, 'BOOK_SOURCE_OCI_PRIVATE_BUCKET_NAME');
  return new OciS3SourceProvider({
    endpoint: requiredConfiguration(env, 'BOOK_SOURCE_OCI_ENDPOINT'),
    region: requiredConfiguration(env, 'BOOK_SOURCE_OCI_REGION'),
    storageLocationId: requiredConfiguration(env, 'BOOK_SOURCE_OCI_STORAGE_LOCATION_ID'),
    privateBucketName,
    privateBucketId: privateBucketName,
    objectKeyPrefix: requiredConfiguration(env, 'BOOK_SOURCE_OCI_OBJECT_KEY_PREFIX'),
    credentials: Object.freeze({
      accessKeyId: requiredConfiguration(env, 'BOOK_SOURCE_OCI_ACCESS_KEY_ID'),
      secretAccessKey: requiredConfiguration(env, 'BOOK_SOURCE_OCI_SECRET_ACCESS_KEY'),
    }),
    ...options,
  });
};

/** Private Oracle Cloud Object Storage (S3-compatible) adapter using Web Crypto SigV4. */
export class OciS3SourceProvider implements OciS3ProviderOperations {
  private readonly endpoint: URL;
  private readonly privateBucketId: string;
  private readonly fetcher: typeof fetch;
  private readonly now: () => Date;
  private readonly maxReadBytes: number;
  private readonly metadataCacheTtlMs: number;

  constructor(private readonly config: OciS3SourceProviderConfig) {
    let endpoint: URL;
    try { endpoint = new URL(config.endpoint); } catch { throw new SourceProviderError('metadata_mismatch', false); }
    const hostMatch = ociS3Hostname.exec(endpoint.hostname);
    const privateBucketId = config.privateBucketId ?? config.privateBucketName;
    if (endpoint.protocol !== 'https:'
      || endpoint.pathname !== '/'
      || endpoint.search
      || endpoint.hash
      || endpoint.username
      || endpoint.password
      || !hostMatch
      || !safeRegion.test(config.region)
      || hostMatch[1] !== config.region
      || !safeLocationId.test(config.storageLocationId)
      || !safeBucketName.test(config.privateBucketName)
      || !safeBucketName.test(privateBucketId)
      || !safeObjectKeyPrefix.test(config.objectKeyPrefix)
      || !config.credentials.accessKeyId.trim()
      || !config.credentials.secretAccessKey.trim()) {
      fail('metadata_mismatch');
    }
    this.endpoint = endpoint;
    this.privateBucketId = privateBucketId;
    this.fetcher = config.fetch ?? fetch;
    this.now = config.now ?? (() => new Date());
    this.maxReadBytes = config.maxReadBytes ?? DEFAULT_MAX_READ_BYTES;
    this.metadataCacheTtlMs = config.metadataCacheTtlMs ?? DEFAULT_METADATA_CACHE_TTL_MS;
    if (!Number.isSafeInteger(this.maxReadBytes) || this.maxReadBytes < 1) fail('metadata_mismatch');
    if (!Number.isSafeInteger(this.metadataCacheTtlMs) || this.metadataCacheTtlMs < 0) fail('metadata_mismatch');
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
    if (!safeObjectKey.test(input.providerObjectKey)
      || !input.providerObjectKey.startsWith(this.config.objectKeyPrefix)
      || input.expectedChecksum.algorithm !== 'sha-256'
      || !sha256Hex.test(input.expectedChecksum.value)
      || !Number.isSafeInteger(input.expectedByteSize)
      || input.expectedByteSize < 1) {
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

    const requiredHeaders = Object.freeze({
      'content-type': 'application/pdf',
      'x-amz-content-sha256': input.expectedChecksum.value,
      'x-amz-meta-book-source-byte-size': String(input.expectedByteSize),
      'x-amz-meta-book-source-sha256': input.expectedChecksum.value,
    });
    const signed = await this.presign({
      method: 'PUT',
      objectKey: input.providerObjectKey,
      expiresSeconds,
      headers: requiredHeaders,
      payloadHash: 'UNSIGNED-PAYLOAD',
      now: signingTime,
    });
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

  async resolveCompletedObject(input: {
    readonly expected: SourceProviderObjectReservation;
  }, options?: SourceProviderRequestOptions): Promise<SourceProviderObjectMetadata> {
    this.assertReservationObject(input.expected);
    const response = await this.signedFetch({
      method: 'GET',
      objectKey: '',
      query: {
        versions: '',
        prefix: input.expected.providerObjectKey,
        'max-keys': String(MAX_COMPLETED_OBJECT_CANDIDATES),
      },
      options,
    });
    if (!response.ok) throw statusFailure(response.status);
    const xml = decoder.decode(await readBoundedResponseBody(response, MAX_LIST_RESPONSE_BYTES, options));
    const parsed = parseListVersionsXml(xml);
    if (parsed.isTruncated || parsed.versions.length > MAX_COMPLETED_OBJECT_CANDIDATES) {
      fail('provider_drift');
    }

    let exactUpload: ParsedS3Version | undefined;
    for (const version of parsed.versions) {
      if (version.key !== input.expected.providerObjectKey || !version.isLatest) continue;
      if (version.size !== input.expected.byteSize) fail('metadata_mismatch');
      if (exactUpload !== undefined) fail('provider_drift');
      exactUpload = version;
    }
    if (!exactUpload) fail('not_found');
    if (!safeProviderId.test(exactUpload.versionId)) fail('metadata_mismatch');
    const identity: BookSourceVersionStorageIdentity = Object.freeze({
      ...input.expected,
      providerFileId: exactUpload.versionId,
      providerFileVersionId: exactUpload.versionId,
    });
    return this.readObjectMetadataUncached(identity, options);
  }

  async verifyCompletedObject(input: {
    readonly expected: BookSourceVersionStorageIdentity;
  }, options?: SourceProviderRequestOptions): Promise<SourceProviderObjectMetadata> {
    this.assertIdentity(input.expected);
    return this.readObjectMetadataUncached(input.expected, options);
  }

  async readObjectMetadata(input: {
    readonly identity: BookSourceVersionStorageIdentity;
  }, options?: SourceProviderRequestOptions): Promise<SourceProviderObjectMetadata> {
    this.assertIdentity(input.identity);
    if (this.metadataCacheTtlMs > 0) {
      const key = metadataCacheKey(input.identity);
      const cachedUntil = metadataCache.get(key);
      if (cachedUntil !== undefined) {
        if (cachedUntil > this.now().getTime()) {
          return Object.freeze({
            identity: input.identity,
            contentType: 'application/pdf',
          });
        }
        metadataCache.delete(key);
      }
    }
    return this.readObjectMetadataUncached(input.identity, options);
  }

  async readBounded(input: {
    readonly identity: BookSourceVersionStorageIdentity;
    readonly range: { readonly offset: number; readonly length?: number; readonly suffixLength?: never }
      | { readonly offset?: never; readonly length?: never; readonly suffixLength: number };
  }, options?: SourceProviderRequestOptions): Promise<SourceProviderBoundedRead> {
    this.assertIdentity(input.identity);
    const range = this.toRange(input.range);
    const response = await this.signedFetch({
      method: 'GET',
      objectKey: input.identity.providerObjectKey,
      query: { versionId: input.identity.providerFileVersionId },
      headers: { range: range.header },
      options,
    });
    if (response.status !== 206) {
      metadataCache.delete(metadataCacheKey(input.identity));
      throw statusFailure(response.status);
    }
    const contentRange = response.headers.get('content-range');
    const match = contentRange?.match(/^bytes (\d+)-(\d+)\/(\d+)$/u);
    if (!match) fail('metadata_mismatch');
    const offset = Number(match[1]);
    const last = Number(match[2]);
    const totalByteSize = Number(match[3]);
    const expectedOffset = 'suffixLength' in input.range && input.range.suffixLength !== undefined
      ? Math.max(0, totalByteSize - input.range.suffixLength)
      : input.range.offset;
    const expectedLength = 'suffixLength' in input.range && input.range.suffixLength !== undefined
      ? Math.min(totalByteSize, input.range.suffixLength)
      : Math.min(input.range.length!, Math.max(0, totalByteSize - input.range.offset));
    if (!Number.isSafeInteger(offset)
      || !Number.isSafeInteger(last)
      || !Number.isSafeInteger(totalByteSize)
      || totalByteSize !== input.identity.byteSize
      || offset !== expectedOffset
      || expectedLength !== last - offset + 1
      || expectedLength > this.maxReadBytes) {
      fail('metadata_mismatch');
    }
    const declaredLength = response.headers.get('content-length');
    if (declaredLength !== null && Number(declaredLength) !== expectedLength) fail('metadata_mismatch');
    const bytes = await readBoundedResponseBody(response, expectedLength, options);
    if (bytes.byteLength !== expectedLength) fail('metadata_mismatch');
    return Object.freeze({ bytes, totalByteSize, offset, contentIdentity: input.identity });
  }

  async readAccountTotalsPage(input: {
    readonly storageLocationId: string;
    readonly privateBucketId: string;
    readonly continuation?: string;
    readonly maxPageSize?: number;
  }, options?: SourceProviderRequestOptions): Promise<SourceProviderAccountTotalsPage> {
    this.assertLocation({ ...input, providerKind: OCI_S3_PROVIDER_KIND });
    const maxPageSize = input.maxPageSize ?? SOURCE_PROVIDER_ACCOUNT_TOTALS_MAX_PAGE_SIZE;
    if (!Number.isSafeInteger(maxPageSize)
      || maxPageSize < 1
      || maxPageSize > SOURCE_PROVIDER_ACCOUNT_TOTALS_MAX_PAGE_SIZE) {
      fail('metadata_mismatch');
    }
    const cursor = input.continuation === undefined
      ? undefined
      : decodeAccountTotalsContinuation(input.continuation);
    if (input.continuation !== undefined && !cursor) fail('metadata_mismatch');

    const query: Record<string, string> = {
      versions: '',
      prefix: this.config.objectKeyPrefix,
      'max-keys': String(maxPageSize),
      ...(cursor ? { 'key-marker': cursor.keyMarker, 'version-id-marker': cursor.versionIdMarker } : {}),
    };
    const response = await this.signedFetch({
      method: 'GET',
      objectKey: '',
      query,
      options,
    });
    if (!response.ok) throw statusFailure(response.status);
    const xml = decoder.decode(await readBoundedResponseBody(response, MAX_LIST_RESPONSE_BYTES, options));
    const parsed = parseListVersionsXml(xml);
    if (parsed.versions.length > maxPageSize) fail('metadata_mismatch');

    let totalBytes = 0;
    let objectCount = 0;
    for (const version of parsed.versions) {
      if (!version.key.startsWith(this.config.objectKeyPrefix)) fail('metadata_mismatch');
      totalBytes += version.size;
      objectCount += 1;
      if (!Number.isSafeInteger(totalBytes) || !Number.isSafeInteger(objectCount)) fail('metadata_mismatch');
    }

    let continuation: string | undefined;
    if (parsed.isTruncated) {
      if (!parsed.nextKeyMarker || !parsed.nextVersionIdMarker
        || !parsed.nextKeyMarker.startsWith(this.config.objectKeyPrefix)) {
        fail('metadata_mismatch');
      }
      continuation = encodeAccountTotalsContinuation(parsed.nextKeyMarker, parsed.nextVersionIdMarker);
      if (continuation === input.continuation) fail('metadata_mismatch');
    }
    return Object.freeze({
      storageLocationId: input.storageLocationId,
      privateBucketId: input.privateBucketId,
      totalBytes,
      objectCount,
      ...(continuation === undefined ? {} : { continuation }),
    });
  }

  async deleteExactVersion(input: {
    readonly identity: BookSourceVersionStorageIdentity;
  }, options?: SourceProviderRequestOptions): Promise<void> {
    this.assertIdentity(input.identity);
    const response = await this.signedFetch({
      method: 'DELETE',
      objectKey: input.identity.providerObjectKey,
      query: { versionId: input.identity.providerFileVersionId },
      options,
    });
    metadataCache.delete(metadataCacheKey(input.identity));
    if (response.status === 204 || response.status === 200) return;
    throw statusFailure(response.status);
  }

  private async readObjectMetadataUncached(
    identity: BookSourceVersionStorageIdentity,
    options?: SourceProviderRequestOptions,
  ): Promise<SourceProviderObjectMetadata> {
    // Use a 1-byte GET Range probe instead of HEAD: Cloudflare Workers' outbound
    // fetch can convert HEAD to GET on the wire, which breaks SigV4 HEAD signatures.
    const response = await this.signedFetch({
      method: 'GET',
      objectKey: identity.providerObjectKey,
      query: { versionId: identity.providerFileVersionId },
      headers: { range: 'bytes=0-0' },
      options,
    });
    if (response.status !== 206 && response.status !== 200) {
      if (response.body) void response.body.cancel().catch(() => undefined);
      metadataCache.delete(metadataCacheKey(identity));
      throw statusFailure(response.status);
    }
    if (response.body) void response.body.cancel().catch(() => undefined);

    let totalByteSize: number | null = null;
    if (response.status === 206) {
      const rangeMatch = response.headers.get('content-range')?.match(/^bytes 0-0\/(\d+)$/u);
      totalByteSize = rangeMatch ? Number(rangeMatch[1]) : null;
    } else {
      const contentLengthRaw = response.headers.get('content-length');
      totalByteSize = contentLengthRaw !== null && /^\d+$/u.test(contentLengthRaw)
        ? Number(contentLengthRaw)
        : null;
    }
    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
    const versionId = response.headers.get('x-amz-version-id')?.trim() ?? '';
    const declaredByteSize = response.headers.get('x-amz-meta-book-source-byte-size')?.trim() ?? '';
    const checksum = response.headers.get('x-amz-meta-book-source-sha256')?.trim().toLowerCase() ?? '';

    if (totalByteSize !== identity.byteSize
      || contentType !== 'application/pdf'
      || checksum !== identity.checksum.value
      || declaredByteSize !== String(identity.byteSize)
      || !versionId) {
      fail('metadata_mismatch');
    }
    if (identity.providerFileId !== versionId || identity.providerFileVersionId !== versionId) {
      fail('provider_drift');
    }

    if (this.metadataCacheTtlMs > 0) {
      if (metadataCache.size >= MAX_METADATA_CACHE_ENTRIES) {
        const oldestKey = metadataCache.keys().next().value;
        if (oldestKey !== undefined) metadataCache.delete(oldestKey);
      }
      metadataCache.set(metadataCacheKey(identity), this.now().getTime() + this.metadataCacheTtlMs);
    }
    return Object.freeze({
      identity,
      contentType: 'application/pdf',
    });
  }

  private assertLocation(input: {
    readonly storageLocationId: string;
    readonly providerKind: string;
    readonly privateBucketId: string;
  }): void {
    if (input.storageLocationId !== this.config.storageLocationId
      || input.providerKind !== OCI_S3_PROVIDER_KIND
      || input.privateBucketId !== this.privateBucketId) {
      fail('unauthorized');
    }
  }

  private assertReservationObject(reservation: SourceProviderObjectReservation): void {
    this.assertLocation(reservation);
    if (!safeProviderId.test(reservation.bookId)
      || !safeProviderId.test(reservation.sourceVersionId)
      || !safeObjectKey.test(reservation.providerObjectKey)
      || !reservation.providerObjectKey.startsWith(this.config.objectKeyPrefix)
      || reservation.checksum.algorithm !== 'sha-256'
      || !sha256Hex.test(reservation.checksum.value)
      || !Number.isSafeInteger(reservation.byteSize)
      || reservation.byteSize < 1) {
      fail('metadata_mismatch');
    }
  }

  private assertIdentity(identity: BookSourceVersionStorageIdentity): void {
    this.assertLocation(identity);
    if (!safeObjectKey.test(identity.providerObjectKey)
      || !identity.providerObjectKey.startsWith(this.config.objectKeyPrefix)
      || !safeProviderId.test(identity.providerFileId)
      || !safeProviderId.test(identity.providerFileVersionId)
      || identity.checksum.algorithm !== 'sha-256'
      || !sha256Hex.test(identity.checksum.value)
      || !Number.isSafeInteger(identity.byteSize)
      || identity.byteSize < 1) {
      fail('metadata_mismatch');
    }
  }

  private toRange(
    range: { readonly offset: number; readonly length?: number; readonly suffixLength?: never }
      | { readonly offset?: never; readonly length?: never; readonly suffixLength: number },
  ): { readonly header: string } {
    if ('suffixLength' in range && range.suffixLength !== undefined) {
      if (!Number.isSafeInteger(range.suffixLength) || range.suffixLength < 1 || range.suffixLength > this.maxReadBytes) {
        fail('metadata_mismatch');
      }
      return { header: `bytes=-${range.suffixLength}` };
    }
    if (!Number.isSafeInteger(range.offset)
      || range.offset < 0
      || !Number.isSafeInteger(range.length)
      || range.length! < 1
      || range.length! > this.maxReadBytes) {
      fail('metadata_mismatch');
    }
    return { header: `bytes=${range.offset}-${range.offset + range.length! - 1}` };
  }

  private async signedFetch(input: {
    readonly method: 'HEAD' | 'GET' | 'DELETE';
    readonly objectKey: string;
    readonly query?: Readonly<Record<string, string>>;
    readonly headers?: Readonly<Record<string, string>>;
    readonly options?: SourceProviderRequestOptions;
  }): Promise<Response> {
    const date = awsDate(this.now());
    const host = this.endpoint.host;
    const credentialScope = `${date.day}/${this.config.region}/s3/aws4_request`;
    const canonicalUri = input.objectKey
      ? `/${awsEncode(this.config.privateBucketName)}/${encodePath(input.objectKey)}`
      : `/${awsEncode(this.config.privateBucketName)}`;
    const queryString = input.query ? canonicalQuery(input.query) : '';
    const headersToSign: Record<string, string> = {
      host,
      'x-amz-content-sha256': EMPTY_PAYLOAD_SHA256,
      'x-amz-date': date.full,
    };
    const normalizedHeaders = Object.entries(headersToSign)
      .map(([name, value]) => [name.toLowerCase(), value.trim().replace(/\s+/gu, ' ')] as const)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
    const signedHeaders = normalizedHeaders.map(([name]) => name).join(';');
    const canonicalHeaders = normalizedHeaders.map(([name, value]) => `${name}:${value}\n`).join('');
    const canonicalRequest = [
      input.method,
      canonicalUri,
      queryString,
      canonicalHeaders,
      signedHeaders,
      EMPTY_PAYLOAD_SHA256,
    ].join('\n');
    const stringToSign = ['AWS4-HMAC-SHA256', date.full, credentialScope, await this.digest(canonicalRequest)].join('\n');
    const signingKey = await this.signingKey(date.day, this.config.credentials.secretAccessKey);
    const signature = hex(new Uint8Array(await crypto.subtle.sign('HMAC', signingKey, encoder.encode(stringToSign))));
    const authorization = `AWS4-HMAC-SHA256 Credential=${this.config.credentials.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    const url = queryString
      ? `${this.endpoint.origin}${canonicalUri}?${queryString}`
      : `${this.endpoint.origin}${canonicalUri}`;
    return this.request(
      url,
      {
        method: input.method,
        headers: {
          ...input.headers,
          'x-amz-content-sha256': EMPTY_PAYLOAD_SHA256,
          'x-amz-date': date.full,
          Authorization: authorization,
        },
      },
      input.options,
    );
  }

  private async presign(input: {
    readonly method: 'PUT' | 'HEAD' | 'GET' | 'DELETE';
    readonly objectKey: string;
    readonly expiresSeconds: number;
    readonly query?: Readonly<Record<string, string>>;
    readonly headers: Record<string, string>;
    readonly payloadHash?: string;
    readonly now?: Date;
  }): Promise<{ readonly url: string }> {
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
      'X-Amz-Credential': `${this.config.credentials.accessKeyId}/${credentialScope}`,
      'X-Amz-Date': date.full,
      'X-Amz-Expires': String(input.expiresSeconds),
      'X-Amz-SignedHeaders': signedHeaders,
    };
    const canonicalUri = input.objectKey
      ? `/${awsEncode(this.config.privateBucketName)}/${encodePath(input.objectKey)}`
      : `/${awsEncode(this.config.privateBucketName)}`;
    const canonicalRequest = [
      input.method,
      canonicalUri,
      canonicalQuery(query),
      canonicalHeaders,
      signedHeaders,
      input.payloadHash ?? 'UNSIGNED-PAYLOAD',
    ].join('\n');
    const stringToSign = ['AWS4-HMAC-SHA256', date.full, credentialScope, await this.digest(canonicalRequest)].join('\n');
    const signingKey = await this.signingKey(date.day, this.config.credentials.secretAccessKey);
    const signature = hex(new Uint8Array(await crypto.subtle.sign('HMAC', signingKey, encoder.encode(stringToSign))));
    return { url: `${this.endpoint.origin}${canonicalUri}?${canonicalQuery({ ...query, 'X-Amz-Signature': signature })}` };
  }

  private async signingKey(day: string, secretAccessKey: string): Promise<CryptoKey> {
    const hmac = async (key: BufferSource, value: string): Promise<ArrayBuffer> => {
      const imported = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: SHA_256 }, false, ['sign']);
      return crypto.subtle.sign('HMAC', imported, encoder.encode(value));
    };
    const dateKey = await hmac(encoder.encode(`AWS4${secretAccessKey}`), day);
    const regionKey = await hmac(dateKey, this.config.region);
    const serviceKey = await hmac(regionKey, 's3');
    const signingKey = await hmac(serviceKey, 'aws4_request');
    return crypto.subtle.importKey('raw', signingKey, { name: 'HMAC', hash: SHA_256 }, false, ['sign']);
  }

  private async digest(value: string): Promise<string> {
    return hex(new Uint8Array(await crypto.subtle.digest(SHA_256, encoder.encode(value))));
  }

  private throwIfCancelled(options?: SourceProviderRequestOptions): void {
    if (options?.signal?.aborted) fail('aborted');
    if (options?.timeoutMs !== undefined && (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1)) {
      fail('timeout', true);
    }
    if (options?.deadlineAt !== undefined
      && (!Number.isSafeInteger(options.deadlineAt) || options.deadlineAt <= Date.now())) {
      fail('timeout', true);
    }
  }

  private async request(url: string, init: RequestInit, options?: SourceProviderRequestOptions): Promise<Response> {
    this.throwIfCancelled(options);
    const controller = new AbortController();
    const configuredTimeout = options?.timeoutMs ?? PROVIDER_TIMEOUT_MS;
    const deadlineRemaining = options?.deadlineAt === undefined
      ? configuredTimeout
      : Math.floor(options.deadlineAt - Date.now());
    const timeout = setTimeout(() => controller.abort(), Math.min(configuredTimeout, deadlineRemaining));
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
}
