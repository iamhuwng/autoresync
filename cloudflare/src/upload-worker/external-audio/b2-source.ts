import { AwsClient } from 'aws4fetch';
import { MAX_UPLOAD_BYTES } from '../grant-authority.js';
import { isSupportedAssessmentAudioMimeType } from '../assessment-audio-format.ts';
import { ExternalAudioError, fail, PROVIDER_ID, readJson, record, rootHttpsUrl } from './protocol.ts';

export interface B2Key {
  readonly applicationKeyId: string;
  readonly applicationKey: string;
}

export interface B2Scope {
  readonly accountId: string;
  readonly bucketId: string;
  readonly bucketName: string;
  readonly prefix: string;
}

export interface B2Selection {
  readonly objectKey: string;
  readonly providerVersionId: string;
}

export interface B2AudioFile extends B2Selection {
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly lastModifiedAt?: number;
}

interface AuthorizedB2 {
  readonly scope: B2Scope;
  readonly apiUrl: string;
  readonly s3Url: string;
  readonly region: string;
  readonly token: string;
}

const AUTHORIZE_URL = 'https://api.backblazeb2.com/b2api/v4/b2_authorize_account';
const REQUIRED_CAPABILITIES = ['listBuckets', 'listFiles', 'readFiles'] as const;
const ALLOWED_READ_ONLY_CAPABILITIES = new Set<string>([
  ...REQUIRED_CAPABILITIES,
  'listAllBucketNames',
  'readBuckets',
  'readBucketEncryption',
  'readBucketLifecycleRules',
  'readBucketReplications',
  'readBucketNotifications',
  'readBucketLogging',
  'readFileLegalHolds',
  'readFileRetentions',
  'shareFiles',
]);
const BUCKET_NAME = /^[A-Za-z0-9-]{6,63}$/u;
const KEY_SECRET = /^[A-Za-z0-9_+\/=-]{1,256}$/u;
const PAGE_SIZE = 50;
const PLAYBACK_TTL_SECONDS = 120;
const textEncoder = new TextEncoder();

function pathSegmentsAreSafe(path: string): boolean {
  return !/[\\\u0000-\u001f\u007f]/u.test(path)
    && path.split('/').every((segment) => segment && segment !== '.' && segment !== '..');
}

export function validPrefix(value: unknown): value is string {
  return typeof value === 'string' && (value === ''
    || (value.endsWith('/') && textEncoder.encode(value).byteLength < 1024 && pathSegmentsAreSafe(value.slice(0, -1))));
}

function inScope(value: unknown, prefix: string): value is string {
  return typeof value === 'string' && value.startsWith(prefix) && value.length > prefix.length
    && textEncoder.encode(value).byteLength <= 1024 && pathSegmentsAreSafe(value);
}

export function sameB2Scope(left: B2Scope, right: B2Scope): boolean {
  return left.accountId === right.accountId && left.bucketId === right.bucketId
    && left.bucketName === right.bucketName && left.prefix === right.prefix;
}

function providerId(value: unknown): value is string {
  return typeof value === 'string' && PROVIDER_ID.test(value);
}

type RequestTarget = 'authorize' | 'bucket' | 'object';

async function checkResponse(response: Response, target: RequestTarget): Promise<void> {
  if (response.ok) return;
  let cause: unknown;
  try {
    cause = record(await readJson(response, 4096, 'provider_unavailable')).code;
  } catch {
    // A provider response may also be XML. Only stable status codes are exposed.
  }
  if (response.status === 429 || cause === 'too_many_requests' || cause === 'download_cap_exceeded') {
    fail('provider_rate_limited');
  }
  if (response.status >= 500) fail('provider_unavailable');
  if ((response.status === 401 && target === 'authorize') || cause === 'bad_auth_token' || cause === 'expired_auth_token') {
    fail('invalid_key');
  }
  if (cause === 'unauthorized' || response.status === 403) fail('insufficient_capabilities');
  if (response.status === 401) fail('invalid_key');
  if (target !== 'authorize' && (response.status === 404 || cause === 'file_not_present' || cause === 'no_such_file')) {
    fail(target === 'object' ? 'object_missing' : 'wrong_bucket');
  }
  fail('provider_unavailable');
}

function fileFromMetadata(value: unknown, scope: B2Scope): B2AudioFile {
  const data = record(value);
  if (data.accountId !== scope.accountId || data.bucketId !== scope.bucketId) fail('wrong_bucket');
  if (!inScope(data.fileName, scope.prefix)) fail('wrong_prefix');
  if (!providerId(data.fileId)) fail('provider_unavailable');
  if (data.action !== 'upload') fail('object_missing');
  if (typeof data.contentLength !== 'number' || !Number.isSafeInteger(data.contentLength)
    || data.contentLength < 1 || typeof data.contentType !== 'string'
    || !isSupportedAssessmentAudioMimeType(data.contentType.toLowerCase())) fail('unsupported_audio');
  if (data.contentLength > MAX_UPLOAD_BYTES) fail('oversized_audio');
  return {
    objectKey: data.fileName,
    providerVersionId: data.fileId,
    contentType: data.contentType.toLowerCase(),
    sizeBytes: data.contentLength,
    ...(typeof data.uploadTimestamp === 'number' && Number.isSafeInteger(data.uploadTimestamp)
      ? { lastModifiedAt: data.uploadTimestamp } : {}),
  };
}

export class BackblazeAudioSource {
  constructor(private readonly fetchImpl: typeof fetch = globalThis.fetch) {}

  async verify(key: B2Key, bucketName: string, prefix: string): Promise<B2Scope> {
    const auth = await this.authorize(key, bucketName, prefix);
    await this.assertPrivateBucket(auth);
    return auth.scope;
  }

  async list(key: B2Key, scope: B2Scope, folder: string, cursor?: string, filenamePrefix = '') {
    if (!validPrefix(folder) || !folder.startsWith(scope.prefix)
      || filenamePrefix.length > 255 || /[\/\\\u0000-\u001f\u007f]/u.test(filenamePrefix)
      || (filenamePrefix && !inScope(folder + filenamePrefix, folder))) fail('wrong_prefix');
    const prefix = folder + filenamePrefix;
    const matches = (key: unknown): key is string => inScope(key, folder) && key.startsWith(prefix);
    if (cursor !== undefined && !matches(cursor)) fail('wrong_prefix');
    const auth = await this.authorizeScope(key, scope);
    const result = record(await this.native(auth, 'b2_list_file_names', {
      bucketId: scope.bucketId,
      ...(prefix ? { prefix } : {}),
      maxFileCount: String(PAGE_SIZE),
      ...(cursor === undefined ? {} : { startFileName: cursor }),
    }, 'bucket'));
    if (!Array.isArray(result.files) || result.files.length > PAGE_SIZE) fail('provider_unavailable');
    if (result.nextFileName !== null && (!matches(result.nextFileName) || result.nextFileName === cursor)) {
      fail('provider_unavailable');
    }
    const files = result.files.flatMap((value) => {
      const data = record(value);
      if (typeof data.fileName === 'string' && data.fileName.startsWith(prefix) && data.fileName.endsWith('/')) return [];
      if (!matches(data.fileName)) fail('wrong_prefix');
      try {
        return [fileFromMetadata(value, scope)];
      } catch (error) {
        if (error instanceof ExternalAudioError && ['unsupported_audio', 'oversized_audio'].includes(error.code)) return [];
        throw error;
      }
    });
    return { files, nextCursor: result.nextFileName };
  }

  async inspect(key: B2Key, scope: B2Scope, selection: B2Selection): Promise<B2AudioFile> {
    this.assertSelection(scope, selection);
    return this.inspectAuthorized(await this.authorizeScope(key, scope), selection);
  }

  async signDirectGetUrl(key: B2Key, scope: B2Scope, selection: B2Selection, now: () => number, ttlSeconds = PLAYBACK_TTL_SECONDS): Promise<string> {
    this.assertSelection(scope, selection);
    const auth = await this.authorizeScope(key, scope);
    const issuedAt = Math.floor(now() / 1000) * 1000;
    const datetime = new Date(issuedAt).toISOString().replace(/[:-]|\.\d{3}/gu, '');
    const objectPath = selection.objectKey.split('/').map(encodeURIComponent).join('/');
    const url = new URL(`/${scope.bucketName}/${objectPath}`, auth.s3Url);
    url.searchParams.set('versionId', selection.providerVersionId);
    url.searchParams.set('X-Amz-Expires', String(ttlSeconds));
    const signer = new AwsClient({
      accessKeyId: key.applicationKeyId,
      secretAccessKey: key.applicationKey,
      region: auth.region,
      service: 's3',
    });
    const signed = await signer.sign(url.toString(), { aws: { signQuery: true, datetime } });
    return signed.url;
  }

  async playback(key: B2Key, scope: B2Scope, selection: B2Selection, now: () => number, ttlSeconds = PLAYBACK_TTL_SECONDS) {
    this.assertSelection(scope, selection);
    const auth = await this.authorizeScope(key, scope);
    const file = await this.inspectAuthorized(auth, selection);
    const issuedAt = Math.floor(now() / 1000) * 1000;
    const datetime = new Date(issuedAt).toISOString().replace(/[:-]|\.\d{3}/gu, '');
    const objectPath = file.objectKey.split('/').map(encodeURIComponent).join('/');
    const url = new URL(`/${scope.bucketName}/${objectPath}`, auth.s3Url);
    url.searchParams.set('versionId', file.providerVersionId);
    url.searchParams.set('X-Amz-Expires', String(ttlSeconds));
    const signer = new AwsClient({
      accessKeyId: key.applicationKeyId,
      secretAccessKey: key.applicationKey,
      region: auth.region,
      service: 's3',
    });
    const signed = await signer.sign(url.toString(), { aws: { signQuery: true, datetime } });
    const probe = await this.request(signed.url, { headers: { Range: 'bytes=0-0' } });
    await checkResponse(probe, 'object');
    await probe.body?.cancel();
    if (probe.headers.get('x-amz-version-id') !== file.providerVersionId) fail('object_changed');
    if (probe.status !== 206 || probe.headers.get('content-length') !== '1'
      || probe.headers.get('content-range') !== `bytes 0-0/${file.sizeBytes}`) fail('provider_unavailable');
    return { file, url: signed.url, expiresAt: issuedAt + ttlSeconds * 1000 };
  }

  private assertSelection(scope: B2Scope, selection: B2Selection): void {
    if (!providerId(selection.providerVersionId)) fail('invalid_request');
    if (!inScope(selection.objectKey, scope.prefix)) fail('wrong_prefix');
  }

  private async inspectAuthorized(auth: AuthorizedB2, selection: B2Selection): Promise<B2AudioFile> {
    const result = await this.native(auth, 'b2_get_file_info', {
      fileId: selection.providerVersionId,
    }, 'object');
    const file = fileFromMetadata(result, auth.scope);
    if (file.providerVersionId !== selection.providerVersionId || file.objectKey !== selection.objectKey) {
      fail('object_changed');
    }
    return file;
  }

  private async authorizeScope(key: B2Key, scope: B2Scope): Promise<AuthorizedB2> {
    const auth = await this.authorize(key, scope.bucketName, scope.prefix);
    if (!sameB2Scope(auth.scope, scope)) fail('wrong_bucket');
    await this.assertPrivateBucket(auth);
    return auth;
  }

  private async assertPrivateBucket(auth: AuthorizedB2): Promise<void> {
    const { accountId, bucketId, bucketName } = auth.scope;
    const response = await this.request(`${auth.apiUrl}/b2api/v4/b2_list_buckets`, {
      method: 'POST',
      headers: { Authorization: auth.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId, bucketId }),
    });
    await checkResponse(response, 'bucket');
    const { buckets } = record(await readJson(response, 32_768, 'provider_unavailable'));
    const bucket = Array.isArray(buckets) && buckets.length === 1 ? record(buckets[0]) : {};
    if (bucket.accountId !== accountId || bucket.bucketId !== bucketId || bucket.bucketName !== bucketName) fail('wrong_bucket');
    if (bucket.bucketType !== 'allPrivate') fail('private_bucket_required');
  }

  private async authorize(key: B2Key, bucketName: string, prefix: string): Promise<AuthorizedB2> {
    if (!providerId(key.applicationKeyId) || !KEY_SECRET.test(key.applicationKey)
      || !BUCKET_NAME.test(bucketName) || !validPrefix(prefix)) fail('invalid_request');
    const response = await this.request(AUTHORIZE_URL, {
      headers: { Authorization: `Basic ${btoa(`${key.applicationKeyId}:${key.applicationKey}`)}` },
    });
    await checkResponse(response, 'authorize');
    const result = record(await readJson(response, 32_768, 'provider_unavailable'));
    const apiInfo = record(result.apiInfo);
    const storageApi = record(apiInfo.storageApi);
    const allowed = record(storageApi.allowed);
    const capabilities = allowed.capabilities;
    const partnerCapabilities = record(apiInfo.groupsApi).capabilities;
    if (!Array.isArray(capabilities)
      || !REQUIRED_CAPABILITIES.every((capability) => capabilities.includes(capability))
      || capabilities.some((capability) => typeof capability !== 'string' || !ALLOWED_READ_ONLY_CAPABILITIES.has(capability))
      || (partnerCapabilities !== undefined && (!Array.isArray(partnerCapabilities) || partnerCapabilities.length))) {
      fail('insufficient_capabilities');
    }
    const bucket = Array.isArray(allowed.buckets) && allowed.buckets.length === 1 ? record(allowed.buckets[0]) : {};
    const { accountId, authorizationToken: token } = result;
    if (!providerId(accountId) || !providerId(bucket.id)
      || (bucket.name !== null && bucket.name !== bucketName)) fail('wrong_bucket');
    if (allowed.namePrefix !== (prefix || null)) fail('wrong_prefix');

    const api = rootHttpsUrl(storageApi.apiUrl);
    const s3 = rootHttpsUrl(storageApi.s3ApiUrl);
    const region = s3 && /^s3\.([a-z]{2}(?:-[a-z0-9]+)+-\d+)\.backblazeb2\.com$/u.exec(s3.hostname)?.[1];
    if (!api || !/^api\d+\.backblazeb2\.com$/u.test(api.hostname) || !s3 || !region
      || typeof token !== 'string' || token.length === 0 || token.length > 4096) fail('provider_unavailable');
    return { scope: { accountId, bucketId: bucket.id, bucketName, prefix }, apiUrl: api.origin, s3Url: s3.origin, region, token };
  }

  private async native(auth: AuthorizedB2, operation: string, params: Record<string, string>, target: RequestTarget) {
    const url = new URL(`/b2api/v4/${operation}`, auth.apiUrl);
    url.search = new URLSearchParams(params).toString();
    const response = await this.request(url, { headers: { Authorization: auth.token } });
    await checkResponse(response, target);
    return readJson(response, 256_000, 'provider_unavailable');
  }

  private async request(url: string | URL, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchImpl.call(globalThis, url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(8000) });
    } catch {
      return fail('provider_unavailable');
    }
  }
}
