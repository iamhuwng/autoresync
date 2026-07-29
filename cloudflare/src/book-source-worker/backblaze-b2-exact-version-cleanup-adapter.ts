import type {
  BookSourceUploadOperation,
  BookSourceVersionStorageIdentity,
} from '../../../src/types/bookSource.types.ts';
import {
  SourceProviderError,
  type SourceProviderPort,
  type SourceProviderRequestOptions,
} from '../../../src/services/book-source-delivery/sourceProvider.port.ts';

const PROVIDER_KIND = 'backblaze-b2-s3';
const AUTHORIZATION_URL = 'https://api.backblazeb2.com/b2api/v4/b2_authorize_account';
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 30_000;
const MAX_DELETE_PER_ATTEMPT = 20;
const LIST_PAGE_SIZE = MAX_DELETE_PER_ATTEMPT + 2;
const MAX_LIST_PAGES_PER_ATTEMPT = 8;
const MAX_LIST_ROWS_PER_ATTEMPT = LIST_PAGE_SIZE * MAX_LIST_PAGES_PER_ATTEMPT;

const safeIdentifier = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;
const safeProviderId = /^[A-Za-z0-9._=-]{1,512}$/u;
const safeObjectKey = /^(?!\/)(?!.*(?:^|\/)\.\.?\/)[A-Za-z0-9!$&'()*+,=:@._\/-]{1,1024}$/u;
const safeBucketId = /^[A-Za-z0-9_-]{1,160}$/u;
const safeBucketName = /^[a-z0-9][a-z0-9.-]{4,61}[a-z0-9]$/u;
const sha256Hex = /^[a-f0-9]{64}$/u;

export interface BackblazeB2DeleteApplicationKey {
  readonly applicationKeyId: string;
  readonly applicationKey: string;
}

export interface BackblazeB2ExactVersionCleanupConfig {
  readonly storageLocationId: string;
  readonly privateBucketId: string;
  readonly privateBucketName: string;
  readonly objectKeyPrefix: string;
  readonly deleteCredentials: BackblazeB2DeleteApplicationKey;
  readonly metadataCredentials: BackblazeB2DeleteApplicationKey;
  readonly fetch?: typeof fetch;
}

export interface BackblazeB2ExactVersionCleanupEnv {
  readonly BOOK_SOURCE_B2_STORAGE_LOCATION_ID: string;
  readonly BOOK_SOURCE_B2_PRIVATE_BUCKET_ID: string;
  readonly BOOK_SOURCE_B2_PRIVATE_BUCKET_NAME: string;
  readonly BOOK_SOURCE_B2_OBJECT_KEY_PREFIX: string;
  readonly BOOK_SOURCE_B2_DELETE_APPLICATION_KEY_ID: string;
  readonly BOOK_SOURCE_B2_DELETE_APPLICATION_KEY: string;
  readonly BOOK_SOURCE_B2_METADATA_APPLICATION_KEY_ID: string;
  readonly BOOK_SOURCE_B2_METADATA_APPLICATION_KEY: string;
}

interface B2AuthorizationResponse {
  readonly authorizationToken?: unknown;
  readonly apiInfo?: unknown;
}

interface B2AuthorizedStorageApi {
  readonly apiUrl: string;
  readonly authorizationToken: string;
}

interface B2ExactVersionRow {
  readonly fileId: string;
  readonly fileName: string;
  readonly contentLength?: unknown;
  readonly contentType?: unknown;
  readonly fileInfo?: unknown;
}

interface B2ExactVersionListing {
  readonly rows: readonly B2ExactVersionRow[];
  readonly complete: boolean;
}

export type BackblazeB2VersionReconciliationProof =
  | 'provider_absent'
  | 'exact_versions_deleted'
  | 'committed_version_preserved';

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const requiredString = (value: unknown): string => {
  if (typeof value !== 'string' || value.length === 0) throw new SourceProviderError('metadata_mismatch', false);
  return value;
};

const fail = (code: ConstructorParameters<typeof SourceProviderError>[0], retryable = false): never => {
  throw new SourceProviderError(code, retryable);
};

const validateConfig = (config: BackblazeB2ExactVersionCleanupConfig): void => {
  if (!safeIdentifier.test(config.storageLocationId)
    || !safeBucketId.test(config.privateBucketId)
    || !safeBucketName.test(config.privateBucketName)
    || !safeObjectKey.test(config.objectKeyPrefix)
    || !config.objectKeyPrefix.endsWith('/')
    || config.deleteCredentials === null
    || typeof config.deleteCredentials !== 'object'
    || !requiredString(config.deleteCredentials.applicationKeyId)
    || !requiredString(config.deleteCredentials.applicationKey)
    || config.metadataCredentials === null
    || typeof config.metadataCredentials !== 'object'
    || !requiredString(config.metadataCredentials.applicationKeyId)
    || !requiredString(config.metadataCredentials.applicationKey)) {
    fail('metadata_mismatch');
  }
};

const validateOptions = (options?: SourceProviderRequestOptions): number => {
  if (options?.signal?.aborted) fail('aborted');
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) fail('timeout', true);
  return timeoutMs;
};

const statusFailure = (status: number): SourceProviderError => {
  if (status === 401 || status === 403) return new SourceProviderError('unauthorized', false);
  if (status === 408 || status === 429 || status >= 500) return new SourceProviderError('timeout', true);
  return new SourceProviderError('metadata_mismatch', false);
};

const parseJsonRecord = async (response: Response): Promise<Record<string, unknown> | null> => {
  try {
    return asRecord(await response.json());
  } catch {
    return null;
  }
};

const assertIdentity = (
  config: BackblazeB2ExactVersionCleanupConfig,
  value: unknown,
): asserts value is BookSourceVersionStorageIdentity => {
  const identity = asRecord(value);
  const checksum = asRecord(identity?.checksum);
  const objectKey = identity?.providerObjectKey;
  const providerFileId = identity?.providerFileId;
  const providerFileVersionId = identity?.providerFileVersionId;
  if (!identity || !safeIdentifier.test(requiredString(identity.bookId))
    || !safeIdentifier.test(requiredString(identity.sourceVersionId))
    || identity.storageLocationId !== config.storageLocationId
    || identity.providerKind !== PROVIDER_KIND
    || identity.privateBucketId !== config.privateBucketId
    || typeof objectKey !== 'string'
    || !safeObjectKey.test(objectKey)
    || !objectKey.startsWith(config.objectKeyPrefix)
    || objectKey === config.objectKeyPrefix
    || typeof providerFileId !== 'string'
    || !safeProviderId.test(providerFileId)
    || typeof providerFileVersionId !== 'string'
    || !safeProviderId.test(providerFileVersionId)
    || providerFileVersionId !== providerFileId
    || /^(?:latest|current|head|null|undefined)$/iu.test(providerFileVersionId)
    || !checksum
    || checksum.algorithm !== 'sha-256'
    || typeof checksum.value !== 'string'
    || !sha256Hex.test(checksum.value)
    || !Number.isSafeInteger(identity.byteSize)
    || identity.byteSize < 1) {
    fail('metadata_mismatch');
  }
};

export const createBackblazeB2ExactVersionCleanupAdapterFromEnv = (
  env: BackblazeB2ExactVersionCleanupEnv,
  options: Pick<BackblazeB2ExactVersionCleanupConfig, 'fetch'> = {},
): BackblazeB2ExactVersionCleanupAdapter => new BackblazeB2ExactVersionCleanupAdapter({
  storageLocationId: requiredString(env.BOOK_SOURCE_B2_STORAGE_LOCATION_ID),
  privateBucketId: requiredString(env.BOOK_SOURCE_B2_PRIVATE_BUCKET_ID),
  privateBucketName: requiredString(env.BOOK_SOURCE_B2_PRIVATE_BUCKET_NAME),
  objectKeyPrefix: requiredString(env.BOOK_SOURCE_B2_OBJECT_KEY_PREFIX),
  deleteCredentials: {
    applicationKeyId: requiredString(env.BOOK_SOURCE_B2_DELETE_APPLICATION_KEY_ID),
    applicationKey: requiredString(env.BOOK_SOURCE_B2_DELETE_APPLICATION_KEY),
  },
  metadataCredentials: {
    applicationKeyId: requiredString(env.BOOK_SOURCE_B2_METADATA_APPLICATION_KEY_ID),
    applicationKey: requiredString(env.BOOK_SOURCE_B2_METADATA_APPLICATION_KEY),
  },
  ...options,
});

export const hasBackblazeB2ExactVersionCleanupConfiguration = (
  env: Record<string, unknown>,
): boolean => {
  try {
    createBackblazeB2ExactVersionCleanupAdapterFromEnv(env as BackblazeB2ExactVersionCleanupEnv);
    return true;
  } catch {
    return false;
  }
};

/** Ticket #50 cleanup authority: exact B2 versions only, never a key/latest selector. */
export class BackblazeB2ExactVersionCleanupAdapter implements Pick<SourceProviderPort, 'deleteExactVersion'> {
  private readonly fetcher: typeof fetch;

  constructor(private readonly config: BackblazeB2ExactVersionCleanupConfig) {
    validateConfig(config);
    this.fetcher = (config.fetch ?? fetch).bind(globalThis);
  }

  /** Exact bounded lookup; `null` is authoritative absence for this unique operation key. */
  async resolveExactVersion(
    operation: BookSourceUploadOperation,
    options?: SourceProviderRequestOptions,
  ): Promise<BookSourceVersionStorageIdentity | null> {
    const timeoutMs = validateOptions(options);
    if (!safeObjectKey.test(operation.providerObjectKey)
      || !operation.providerObjectKey.startsWith(this.config.objectKeyPrefix)
      || operation.providerObjectKey === this.config.objectKeyPrefix) fail('metadata_mismatch');
    const authorization = await this.authorize(
      this.config.metadataCredentials,
      ['readFiles', 'listFiles'],
      options,
      timeoutMs,
    );
    const response = await this.request(`${authorization.apiUrl}/b2api/v4/b2_list_file_versions`, {
      method: 'POST',
      headers: {
        Authorization: authorization.authorizationToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        bucketId: this.config.privateBucketId,
        prefix: operation.providerObjectKey,
        startFileName: operation.providerObjectKey,
        maxFileCount: 2,
      }),
    }, options, timeoutMs);
    if (!response.ok) throw statusFailure(response.status);
    const body = await parseJsonRecord(response);
    const files = body?.files;
    if (!Array.isArray(files)) fail('metadata_mismatch');
    const exact = files
      .map(asRecord)
      .filter((file): file is Record<string, unknown> => file?.fileName === operation.providerObjectKey);
    if (exact.length === 0) return null;
    if (exact.length !== 1) fail('provider_drift');
    const file = exact[0]!;
    const fileInfo = asRecord(file.fileInfo);
    const fileId = typeof file.fileId === 'string' ? file.fileId : '';
    if (!safeProviderId.test(fileId)
      || file.action !== 'upload'
      || file.contentType !== 'application/pdf'
      || file.contentLength !== operation.byteSize
      || fileInfo?.['book-source-sha256'] !== operation.expectedChecksum.value
      || fileInfo?.['book-source-byte-size'] !== String(operation.byteSize)) {
      fail('provider_drift');
    }
    return Object.freeze({
      bookId: operation.bookId,
      sourceVersionId: operation.sourceVersionId,
      storageLocationId: operation.storageLocationId,
      providerKind: operation.providerKind,
      privateBucketId: operation.privateBucketId,
      providerObjectKey: operation.providerObjectKey,
      providerFileId: fileId,
      providerFileVersionId: fileId,
      checksum: operation.expectedChecksum,
      byteSize: operation.byteSize,
    });
  }

  async deleteExactVersion(
    input: { readonly identity: BookSourceVersionStorageIdentity },
    options?: SourceProviderRequestOptions,
  ): Promise<void> {
    const timeoutMs = validateOptions(options);
    assertIdentity(this.config, input?.identity);
    const authorization = await this.authorize(
      this.config.deleteCredentials,
      ['deleteFiles'],
      options,
      timeoutMs,
    );
    const response = await this.request(`${authorization.apiUrl}/b2api/v4/b2_delete_file_version`, {
      method: 'POST',
      headers: {
        Authorization: authorization.authorizationToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileName: input.identity.providerObjectKey,
        fileId: input.identity.providerFileId,
      }),
    }, options, timeoutMs);

    const body = await parseJsonRecord(response);
    if (!response.ok) {
      if ((response.status === 400 || response.status === 404) && body?.code === 'file_not_present'
        && (body.status === undefined || body.status === response.status)) {
        throw new SourceProviderError('not_found', false);
      }
      throw statusFailure(response.status);
    }
    if (!body) fail('metadata_mismatch');
    if (body.fileName !== input.identity.providerObjectKey
      || body.fileId !== input.identity.providerFileId
      || (body.bucketId !== undefined && body.bucketId !== this.config.privateBucketId)
      || (body.providerFileId !== undefined && body.providerFileId !== input.identity.providerFileId)
      || (body.providerFileVersionId !== undefined && body.providerFileVersionId !== input.identity.providerFileVersionId)) {
      fail('provider_drift');
    }
  }

  /**
   * Reconciles exact versions under one operation-owned key in bounded steps.
   * Each attempt can inspect up to eight pages and delete at most twenty
   * exact IDs; incomplete or partial work remains retryable until terminal
   * absence or committed preservation is proven.
   */
  async reconcileOperationVersions(
    input: {
      readonly operation: BookSourceUploadOperation;
      readonly preserveIdentity?: BookSourceVersionStorageIdentity;
    },
    options?: SourceProviderRequestOptions,
  ): Promise<BackblazeB2VersionReconciliationProof> {
    const timeoutMs = validateOptions(options);
    this.assertOperationScope(input.operation);
    if (input.preserveIdentity) {
      assertIdentity(this.config, input.preserveIdentity);
      if (input.preserveIdentity.bookId !== input.operation.bookId
        || input.preserveIdentity.sourceVersionId !== input.operation.sourceVersionId
        || input.preserveIdentity.providerObjectKey !== input.operation.providerObjectKey
        || input.preserveIdentity.providerFileId !== input.preserveIdentity.providerFileVersionId) {
        fail('provider_drift');
      }
    }

    const metadataAuthorization = await this.authorize(
      this.config.metadataCredentials,
      ['readFiles', 'listFiles'],
      options,
      timeoutMs,
    );
    const beforeListing = await this.listExactVersionRows(
      input.operation,
      metadataAuthorization,
      options,
      timeoutMs,
    );
    const before = beforeListing.rows;
    const preservedId = input.preserveIdentity?.providerFileVersionId;
    if (preservedId) {
      const preserved = before.find((row) => row.fileId === preservedId);
      if ((preserved && !this.matchesCommittedVersion(preserved, input.operation))
        || (!preserved && beforeListing.complete)) {
        fail('provider_drift');
      }
    }

    const deletions = before.filter((row) => row.fileId !== preservedId);
    if (deletions.length > 0) {
      const deleteAuthorization = await this.authorize(
        this.config.deleteCredentials,
        ['deleteFiles'],
        options,
        timeoutMs,
      );
      for (const row of deletions.slice(0, MAX_DELETE_PER_ATTEMPT)) {
        await this.deleteAuthorizedVersion(
          deleteAuthorization,
          input.operation.providerObjectKey,
          row.fileId,
          options,
          timeoutMs,
        );
      }
    }
    if (!beforeListing.complete || deletions.length > MAX_DELETE_PER_ATTEMPT) {
      throw new SourceProviderError('reconciliation_bound_exceeded', true);
    }

    const afterListing = await this.listExactVersionRows(
      input.operation,
      metadataAuthorization,
      options,
      timeoutMs,
    );
    if (!afterListing.complete) {
      throw new SourceProviderError('reconciliation_bound_exceeded', true);
    }
    const after = afterListing.rows;
    if (!preservedId) {
      if (after.length !== 0) {
        throw new SourceProviderError('reconciliation_bound_exceeded', true);
      }
      return before.length === 0 ? 'provider_absent' : 'exact_versions_deleted';
    }
    if (after.length !== 1 || after[0]?.fileId !== preservedId
      || !this.matchesCommittedVersion(after[0], input.operation)) {
      fail('provider_drift');
    }
    return 'committed_version_preserved';
  }

  private assertOperationScope(operation: BookSourceUploadOperation): void {
    if (!safeObjectKey.test(operation.providerObjectKey)
      || !operation.providerObjectKey.startsWith(this.config.objectKeyPrefix)
      || operation.providerObjectKey === this.config.objectKeyPrefix
      || operation.privateBucketId !== this.config.privateBucketId
      || operation.storageLocationId !== this.config.storageLocationId
      || operation.providerKind !== PROVIDER_KIND) {
      fail('metadata_mismatch');
    }
  }

  private matchesCommittedVersion(
    row: B2ExactVersionRow,
    operation: BookSourceUploadOperation,
  ): boolean {
    const fileInfo = asRecord(row.fileInfo);
    return row.contentType === 'application/pdf'
      && row.contentLength === operation.byteSize
      && fileInfo?.['book-source-sha256'] === operation.expectedChecksum.value
      && fileInfo?.['book-source-byte-size'] === String(operation.byteSize);
  }

  private async listExactVersionRows(
    operation: BookSourceUploadOperation,
    authorization: B2AuthorizedStorageApi,
    options: SourceProviderRequestOptions | undefined,
    timeoutMs: number,
  ): Promise<B2ExactVersionListing> {
    const rows: B2ExactVersionRow[] = [];
    const seenFileIds = new Set<string>();
    const seenContinuations = new Set<string>();
    let startFileName = operation.providerObjectKey;
    let startFileId: string | undefined;

    for (let pageIndex = 0; pageIndex < MAX_LIST_PAGES_PER_ATTEMPT; pageIndex += 1) {
      const response = await this.request(`${authorization.apiUrl}/b2api/v4/b2_list_file_versions`, {
        method: 'POST',
        headers: {
          Authorization: authorization.authorizationToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          bucketId: this.config.privateBucketId,
          prefix: operation.providerObjectKey,
          startFileName,
          ...(startFileId === undefined ? {} : { startFileId }),
          maxFileCount: LIST_PAGE_SIZE,
        }),
      }, options, timeoutMs);
      if (!response.ok) throw statusFailure(response.status);
      const body = await parseJsonRecord(response);
      if (!Array.isArray(body?.files)) fail('metadata_mismatch');
      for (const value of body.files) {
        const row = asRecord(value);
        const fileId = row?.fileId;
        if (!row || row.fileName !== operation.providerObjectKey
          || row.action !== 'upload'
          || typeof fileId !== 'string'
          || !safeProviderId.test(fileId)
          || seenFileIds.has(fileId)) {
          fail('provider_drift');
        }
        seenFileIds.add(fileId);
        rows.push({
          fileId,
          fileName: operation.providerObjectKey,
          contentLength: row.contentLength,
          contentType: row.contentType,
          fileInfo: row.fileInfo,
        });
        if (rows.length > MAX_LIST_ROWS_PER_ATTEMPT) {
          throw new SourceProviderError('reconciliation_bound_exceeded', true);
        }
      }

      const nextFileName = body.nextFileName;
      const nextFileId = body.nextFileId;
      const noNextFileName = nextFileName === undefined || nextFileName === null;
      const noNextFileId = nextFileId === undefined || nextFileId === null;
      if (noNextFileName && noNextFileId) return { rows, complete: true };
      if (noNextFileName !== noNextFileId) fail('provider_drift');
      if (typeof nextFileName !== 'string'
        || typeof nextFileId !== 'string'
        || !safeObjectKey.test(nextFileName)
        || !safeProviderId.test(nextFileId)) {
        fail('provider_drift');
      }
      if (nextFileName !== operation.providerObjectKey) return { rows, complete: true };
      const continuation = `${nextFileName}\u0000${nextFileId}`;
      if (seenContinuations.has(continuation)) fail('provider_drift');
      seenContinuations.add(continuation);
      if (pageIndex + 1 >= MAX_LIST_PAGES_PER_ATTEMPT) {
        return { rows, complete: false };
      }
      startFileName = nextFileName;
      startFileId = nextFileId;
    }
    return { rows, complete: false };
  }

  private async deleteAuthorizedVersion(
    authorization: B2AuthorizedStorageApi,
    fileName: string,
    fileId: string,
    options: SourceProviderRequestOptions | undefined,
    timeoutMs: number,
  ): Promise<void> {
    const response = await this.request(`${authorization.apiUrl}/b2api/v4/b2_delete_file_version`, {
      method: 'POST',
      headers: {
        Authorization: authorization.authorizationToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fileName, fileId }),
    }, options, timeoutMs);
    const body = await parseJsonRecord(response);
    if (!response.ok) {
      if ((response.status === 400 || response.status === 404) && body?.code === 'file_not_present') {
        return;
      }
      throw statusFailure(response.status);
    }
    if (!body || body.fileName !== fileName || body.fileId !== fileId
      || (body.bucketId !== undefined && body.bucketId !== this.config.privateBucketId)) {
      fail('provider_drift');
    }
  }

  private async authorize(
    credentials: BackblazeB2DeleteApplicationKey,
    requiredCapabilities: readonly string[],
    options: SourceProviderRequestOptions | undefined,
    timeoutMs: number,
  ): Promise<B2AuthorizedStorageApi> {
    const response = await this.request(AUTHORIZATION_URL, {
      method: 'GET',
      headers: {
        Authorization: `Basic ${btoa(`${credentials.applicationKeyId}:${credentials.applicationKey}`)}`,
      },
    }, options, timeoutMs);
    if (!response.ok) throw statusFailure(response.status);
    const body = await parseJsonRecord(response) as B2AuthorizationResponse | null;
    const apiInfo = asRecord(body?.apiInfo);
    const storageApi = asRecord(apiInfo?.storageApi);
    const allowed = asRecord(storageApi?.allowed);
    const apiUrl = allowed ? requiredString(storageApi?.apiUrl) : '';
    const authorizationToken = requiredString(body?.authorizationToken);
    const capabilities = allowed?.capabilities;
    const buckets = allowed?.buckets;
    const namePrefix = allowed?.namePrefix;
    if (!allowed || !Array.isArray(capabilities)
      || capabilities.length !== requiredCapabilities.length
      || requiredCapabilities.some((capability) => !capabilities.includes(capability))
      || !Array.isArray(buckets) || buckets.length !== 1
      || !asRecord(buckets[0])
      || buckets[0].id !== this.config.privateBucketId
      || buckets[0].name !== this.config.privateBucketName
      || namePrefix !== this.config.objectKeyPrefix
      || !this.isAuthorizedApiUrl(apiUrl)) {
      fail('unauthorized');
    }
    return { apiUrl, authorizationToken };
  }

  private isAuthorizedApiUrl(value: string): boolean {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && url.pathname === '/' && !url.search && !url.hash
        && !url.username && !url.password && /^api\d+\.backblazeb2\.com$/u.test(url.hostname);
    } catch {
      return false;
    }
  }

  private async request(
    url: string,
    init: RequestInit,
    options: SourceProviderRequestOptions | undefined,
    timeoutMs: number,
  ): Promise<Response> {
    if (options?.signal?.aborted) fail('aborted');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    options?.signal?.addEventListener('abort', onAbort, { once: true });
    try {
      return await this.fetcher(url, { ...init, redirect: 'manual', signal: controller.signal });
    } catch (error) {
      console.error('book_source_b2_cleanup_request_failed', {
        phase: url.includes('b2_authorize_account')
          ? 'authorize'
          : url.includes('b2_list_file_versions')
            ? 'list'
            : 'delete',
        error: error instanceof Error ? error.name : 'unknown',
      });
      if (options?.signal?.aborted) throw new SourceProviderError('aborted', false);
      throw new SourceProviderError('timeout', true);
    } finally {
      clearTimeout(timeout);
      options?.signal?.removeEventListener('abort', onAbort);
    }
  }
}
