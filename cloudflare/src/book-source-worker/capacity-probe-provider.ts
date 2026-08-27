import {
  SOURCE_PROVIDER_ACCOUNT_TOTALS_MAX_PAGE_SIZE,
  SourceProviderError,
  type SourceProviderAccountTotalsPage,
  type SourceProviderPort,
} from '../../../src/services/book-source-delivery/sourceProvider.port.ts';

const MAX_CONTINUATION_LENGTH = 4_096;
const PROVIDER_TIMEOUT_MS = 10_000;
const MAX_AUTHORIZATION_RESPONSE_BYTES = 64 * 1_024;
const MAX_LIST_RESPONSE_BYTES = 8 * 1024 * 1024;
const encoder = new TextEncoder();
const safeIdentifier = /^[A-Za-z0-9_-]{1,160}$/u;
const safeBucketName = /^[a-z0-9][a-z0-9.-]{4,61}[a-z0-9]$/u;
const safeRegion = /^[a-z0-9-]{1,64}$/u;

export interface CapacityProbeProviderConfig {
  readonly endpoint: string;
  readonly region: string;
  readonly storageLocationId: string;
  readonly privateBucketId: string;
  readonly privateBucketName: string;
  readonly applicationKeyId: string;
  readonly applicationKey: string;
  readonly fetch?: typeof fetch;
}

type CapacityProbeRemotePhase = 'authorize' | 'list';
type CapacityProbeRemoteFailureKind = 'http' | 'network' | 'response';

class CapacityProbeRemoteError extends SourceProviderError {
  constructor(
    code: ConstructorParameters<typeof SourceProviderError>[0],
    public readonly phase: CapacityProbeRemotePhase,
    public readonly kind: CapacityProbeRemoteFailureKind,
    public readonly status?: number,
  ) {
    super(code, false);
  }
}

function fail(code: ConstructorParameters<typeof SourceProviderError>[0] = 'metadata_mismatch'): never {
  throw new SourceProviderError(code, false);
}
function failRemote(
  code: ConstructorParameters<typeof SourceProviderError>[0],
  phase: CapacityProbeRemotePhase,
  kind: CapacityProbeRemoteFailureKind,
  status?: number,
): never {
  throw new CapacityProbeRemoteError(code, phase, kind, status);
}
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const required = (env: Record<string, unknown>, name: string): string => {
  const value = env[name];
  if (typeof value !== 'string') {
    throw new SourceProviderError('metadata_mismatch', false);
  }
  const trimmed = value.trim();
  if (!trimmed) fail();
  return trimmed;
};
const string = (value: unknown): string | null => typeof value === 'string' && value.length > 0 ? value : null;
const integer = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
const base64 = (bytes: Uint8Array): string => {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
};
const base64Url = (bytes: Uint8Array): string => base64(bytes).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/gu, '');
const decodeBase64Url = (value: string): Uint8Array | null => {
  if (!/^[A-Za-z0-9_-]{1,4096}$/u.test(value) || value.length % 4 === 1) return null;
  try {
    const binary = atob(value.replace(/-/gu, '+').replace(/_/gu, '/').padEnd(Math.ceil(value.length / 4) * 4, '='));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch { return null; }
};
const encodeContinuation = (fileName: string, fileId: string): string =>
  base64Url(encoder.encode(JSON.stringify({ fileName, fileId })));
const decodeContinuation = (value: string): { readonly fileName: string; readonly fileId: string } | null => {
  if (value.length > MAX_CONTINUATION_LENGTH) return null;
  const decoded = decodeBase64Url(value);
  if (!decoded) return null;
  try {
    const parsed = record(JSON.parse(new TextDecoder().decode(decoded)));
    const fileName = string(parsed?.fileName);
    const fileId = string(parsed?.fileId);
    return fileName && fileId ? Object.freeze({ fileName, fileId }) : null;
  } catch { return null; }
};

/** Read-only B2 adapter used only by capacity reconciliation. */
export class CapacityProbeProvider implements Pick<SourceProviderPort, 'readAccountTotalsPage'> {
  private readonly endpoint: URL;
  private readonly authorizationUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(private readonly config: CapacityProbeProviderConfig) {
    try { this.endpoint = new URL(config.endpoint); } catch { fail(); }
    const cluster = /-(\d{3})$/u.exec(config.region)?.[1];
    if (this.endpoint.protocol !== 'https:' || this.endpoint.pathname !== '/' || this.endpoint.search || this.endpoint.hash
      || this.endpoint.username || this.endpoint.password || this.endpoint.hostname !== `s3.${config.region}.backblazeb2.com`
      || !safeRegion.test(config.region) || !cluster || !safeIdentifier.test(config.storageLocationId)
      || !safeIdentifier.test(config.privateBucketId) || !safeBucketName.test(config.privateBucketName)
      || !config.applicationKeyId || !config.applicationKey || /master(?:[-_ ]?key)?/iu.test(config.applicationKeyId)
      || /master(?:[-_ ]?key)?/iu.test(config.applicationKey)) fail('unauthorized');
    this.authorizationUrl = `https://api${cluster}.backblazeb2.com/b2api/v4/b2_authorize_account`;
    this.fetcher = config.fetch ?? fetch;
  }

  async readAccountTotalsPage(input: {
    readonly storageLocationId: string;
    readonly privateBucketId: string;
    readonly continuation?: string;
    readonly maxPageSize?: number;
  }): Promise<SourceProviderAccountTotalsPage> {
    if (input.storageLocationId !== this.config.storageLocationId || input.privateBucketId !== this.config.privateBucketId) {
      fail('unauthorized');
    }
    const maxFileCount = input.maxPageSize ?? SOURCE_PROVIDER_ACCOUNT_TOTALS_MAX_PAGE_SIZE;
    if (!Number.isSafeInteger(maxFileCount) || maxFileCount < 1 || maxFileCount > SOURCE_PROVIDER_ACCOUNT_TOTALS_MAX_PAGE_SIZE) fail();
    const cursor = input.continuation === undefined ? undefined : decodeContinuation(input.continuation);
    if (input.continuation !== undefined && !cursor) fail();
    const authorization = await this.authorize();
    const body: Record<string, unknown> = { bucketId: this.config.privateBucketId, maxFileCount };
    if (cursor) { body.startFileName = cursor.fileName; body.startFileId = cursor.fileId; }
    const response = await this.requestJson(`${authorization.apiUrl}/b2api/v4/b2_list_file_versions`, {
      method: 'POST', headers: { Authorization: authorization.token, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }, MAX_LIST_RESPONSE_BYTES, 'list');
    if (!response.ok) {
      failRemote(
        response.status === 401 || response.status === 403 ? 'unauthorized' : 'timeout',
        'list',
        'http',
        response.status,
      );
    }
    const parsed = response.body;
    if (!parsed) fail();
    const files = parsed?.files;
    if (!Array.isArray(files) || files.length > maxFileCount) fail();
    const fileRows = files as unknown[];
    let totalBytes = 0;
    let objectCount = 0;
    for (const rawFile of fileRows) {
      const file = record(rawFile);
      // `upload` includes current files and retained/hidden prior upload versions.
      if (!file) fail();
      const size = integer(file.contentLength);
      if (size === null || !string(file.fileId) || !string(file.fileName)) fail();
      if (file.action === 'hide' || file.action === 'folder') {
        if (size !== 0) fail('provider_drift');
        continue;
      }
      // `start` rows do not expose uploaded part bytes through listFiles-only
      // authority. Unknown future actions are equally unaccountable.
      if (file.action !== 'upload') fail('provider_drift');
      totalBytes += size;
      objectCount += 1;
      if (!Number.isSafeInteger(totalBytes) || !Number.isSafeInteger(objectCount)) fail();
    }
    const nextFileName = string(parsed.nextFileName) ?? undefined;
    const nextFileId = string(parsed.nextFileId) ?? undefined;
    if ((nextFileName === undefined) !== (nextFileId === undefined)) fail();
    const continuation = nextFileName && nextFileId ? encodeContinuation(nextFileName, nextFileId) : undefined;
    if (continuation !== undefined && continuation === input.continuation) fail();
    return Object.freeze({ storageLocationId: input.storageLocationId, privateBucketId: input.privateBucketId,
      totalBytes, objectCount, ...(continuation === undefined ? {} : { continuation }) });
  }

  private async requestJson(
    url: string,
    init: RequestInit,
    maxResponseBytes: number,
    phase: CapacityProbeRemotePhase,
  ): Promise<{ readonly ok: boolean; readonly status: number; readonly body: Record<string, unknown> | null }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
    try {
      const response = await this.fetcher.call(globalThis, url, {
        ...init,
        redirect: 'follow',
        signal: controller.signal,
      });
      if (response.url) {
        let finalUrl: URL;
        try { finalUrl = new URL(response.url); }
        catch { failRemote('provider_drift', phase, 'response'); }
        const expectedPath = phase === 'authorize'
          ? '/b2api/v4/b2_authorize_account'
          : '/b2api/v4/b2_list_file_versions';
        if (finalUrl.protocol !== 'https:'
          || !/^(?:api\d+|api)\.backblazeb2\.com$/u.test(finalUrl.hostname)
          || finalUrl.pathname !== expectedPath
          || finalUrl.search
          || finalUrl.hash
          || finalUrl.username
          || finalUrl.password) {
          failRemote('provider_drift', phase, 'response');
        }
      }
      if (!response.ok) return Object.freeze({ ok: false, status: response.status, body: null });
      const contentLength = response.headers.get('content-length');
      if (contentLength !== null
        && (!/^\d+$/u.test(contentLength) || Number(contentLength) > maxResponseBytes)
        || !response.body) {
        failRemote('metadata_mismatch', phase, 'response');
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > maxResponseBytes) {
          await reader.cancel();
          failRemote('metadata_mismatch', phase, 'response');
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(received);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      let body: Record<string, unknown> | null;
      try { body = record(JSON.parse(new TextDecoder().decode(bytes))); }
      catch { failRemote('metadata_mismatch', phase, 'response'); }
      if (!body) failRemote('metadata_mismatch', phase, 'response');
      return Object.freeze({ ok: true, status: response.status, body });
    } catch (error) {
      if (error instanceof SourceProviderError) throw error;
      failRemote('timeout', phase, 'network');
    } finally {
      clearTimeout(timeout);
    }
  }

  private async authorize(): Promise<{ readonly apiUrl: string; readonly token: string }> {
    const response = await this.requestJson(this.authorizationUrl, {
      method: 'GET', headers: { Authorization: `Basic ${base64(encoder.encode(`${this.config.applicationKeyId}:${this.config.applicationKey}`))}` },
    }, MAX_AUTHORIZATION_RESPONSE_BYTES, 'authorize');
    if (!response.ok) {
      failRemote(
        response.status === 401 || response.status === 403 ? 'unauthorized' : 'timeout',
        'authorize',
        'http',
        response.status,
      );
    }
    const parsed = response.body;
    const storageApi = record(record(parsed?.apiInfo)?.storageApi);
    const allowed = record(storageApi?.allowed ?? parsed?.allowed);
    const apiUrl = string(storageApi?.apiUrl ?? parsed?.apiUrl);
    const s3ApiUrl = string(storageApi?.s3ApiUrl ?? parsed?.s3ApiUrl);
    const token = string(parsed?.authorizationToken);
    // Capacity reconciliation must use a durable key. An expiring key would
    // recreate the stale-ledger outage even when the rest of the deployment is
    // healthy, so reject it before any list operation.
    if (parsed?.applicationKeyExpirationTimestamp !== null) fail('unauthorized');
    const capabilities = allowed?.capabilities;
    const buckets = allowed?.buckets;
    if (!apiUrl || !s3ApiUrl || !token || !Array.isArray(capabilities) || capabilities.length !== 1 || capabilities[0] !== 'listFiles'
      || !Array.isArray(buckets) || buckets.length !== 1 || allowed?.namePrefix !== null) fail('unauthorized');
    const bucket = record(buckets[0]);
    if (!bucket || bucket.id !== this.config.privateBucketId || bucket.name !== this.config.privateBucketName) fail('unauthorized');
    try {
      const api = new URL(apiUrl);
      if (api.protocol !== 'https:' || api.pathname !== '/' || api.search || api.hash || api.username || api.password
        || !/^api\d+\.backblazeb2\.com$/u.test(api.hostname) || new URL(s3ApiUrl).origin !== this.endpoint.origin) fail('provider_drift');
    } catch (error) {
      if (error instanceof SourceProviderError) throw error;
      fail();
    }
    return Object.freeze({ apiUrl, token });
  }
}

export const createCapacityProbeProviderFromEnv = (
  env: Record<string, unknown>,
  options: Pick<CapacityProbeProviderConfig, 'fetch'> = {},
): CapacityProbeProvider => new CapacityProbeProvider({
  endpoint: required(env, 'BOOK_SOURCE_B2_ENDPOINT'), region: required(env, 'BOOK_SOURCE_B2_REGION'),
  storageLocationId: required(env, 'BOOK_SOURCE_B2_STORAGE_LOCATION_ID'), privateBucketId: required(env, 'BOOK_SOURCE_B2_PRIVATE_BUCKET_ID'),
  privateBucketName: required(env, 'BOOK_SOURCE_B2_PRIVATE_BUCKET_NAME'),
  applicationKeyId: required(env, 'BOOK_SOURCE_B2_CAPACITY_APPLICATION_KEY_ID'), applicationKey: required(env, 'BOOK_SOURCE_B2_CAPACITY_APPLICATION_KEY'),
  ...options,
});
