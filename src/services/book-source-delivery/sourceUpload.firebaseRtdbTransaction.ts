import { SignJWT, importPKCS8 } from 'jose';

export interface SourceUploadRtdbTransactionResult<T> {
  readonly committed: boolean;
  readonly value: T | null;
}

export type SourceUploadRtdbTransaction = <T>(input: {
  readonly path: string;
  readonly expectedRevision: number;
  readonly update: (current: T | null) => T | undefined;
}) => Promise<SourceUploadRtdbTransactionResult<T>>;

export class TrustedSourceUploadRtdbTransactionError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'TrustedSourceUploadRtdbTransactionError';
  }
}

export interface TrustedFirebaseRtdbAccessTokenProvider {
  getAccessToken(): Promise<string>;
}

export interface TrustedFirebaseRtdbServiceAccountConfig {
  readonly serviceAccountEmail: string;
  readonly serviceAccountPrivateKey: string;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
  readonly requestTimeoutMs?: number;
}

export interface TrustedFirebaseSourceUploadTransactionConfig {
  readonly databaseUrl: string;
  readonly accessTokenProvider: TrustedFirebaseRtdbAccessTokenProvider;
  readonly fetchImpl?: typeof fetch;
  readonly maxRetries?: number;
  readonly maxSnapshotBytes?: number;
}

const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FIREBASE_SCOPES = [
  'https://www.googleapis.com/auth/firebase.database',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_SNAPSHOT_BYTES = 32 * 1024 * 1024;
const MAX_SNAPSHOT_BYTES = 64 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 16 * 1024;
const ACCESS_TOKEN_CACHE_SKEW_MS = 60_000;
const encoder = new TextEncoder();

const fail = (code: string): never => {
  throw new TrustedSourceUploadRtdbTransactionError(code);
};

const boundedResponseText = async (
  response: Response,
  maxBytes: number,
  tooLargeCode: string,
): Promise<string> => {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength && /^\d+$/u.test(declaredLength) && Number(declaredLength) > maxBytes) {
    return fail(tooLargeCode);
  }
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // Preserve stable error code below.
        }
        return fail(tooLargeCode);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
};

export const createTrustedFirebaseRtdbServiceAccountAccessTokenProvider = (
  config: TrustedFirebaseRtdbServiceAccountConfig,
): TrustedFirebaseRtdbAccessTokenProvider => {
  const email = config.serviceAccountEmail.trim();
  const privateKey = config.serviceAccountPrivateKey.trim();
  if (!/^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/u.test(email)
    || !privateKey
    || privateKey.length > 32 * 1024) {
    fail('trusted_source_upload_oauth_service_account_invalid');
  }
  const fetchImpl = config.fetchImpl ?? fetch;
  const now = config.now ?? Date.now;
  const requestTimeoutMs = config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  if (!Number.isSafeInteger(requestTimeoutMs)
    || requestTimeoutMs < 1
    || requestTimeoutMs > DEFAULT_REQUEST_TIMEOUT_MS) {
    fail('trusted_source_upload_oauth_timeout_invalid');
  }
  let cached: { readonly value: string; readonly expiresAt: number } | null = null;
  let pending: Promise<string> | null = null;

  const refresh = async (): Promise<string> => {
    const nowMs = now();
    if (!Number.isSafeInteger(nowMs) || nowMs < 0) fail('trusted_source_upload_oauth_clock_invalid');
    let assertion: string;
    try {
      assertion = await new SignJWT({ scope: FIREBASE_SCOPES })
        .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
        .setIssuer(email)
        .setSubject(email)
        .setAudience(GOOGLE_OAUTH_TOKEN_URL)
        .setIssuedAt(Math.floor(nowMs / 1000))
        .setExpirationTime(Math.floor(nowMs / 1000) + 3600)
        .sign(await importPKCS8(privateKey, 'RS256'));
    } catch {
      return fail('trusted_source_upload_oauth_assertion_failed');
    }
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), requestTimeoutMs);
    let response: Response;
    try {
      response = await fetchImpl(GOOGLE_OAUTH_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion,
        }),
        signal: abort.signal,
      });
    } catch {
      return fail('trusted_source_upload_oauth_request_failed');
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) return fail('trusted_source_upload_oauth_exchange_failed');
    let value: unknown;
    try {
      value = JSON.parse(await boundedResponseText(
        response,
        MAX_RESPONSE_BYTES,
        'trusted_source_upload_oauth_response_too_large',
      )) as unknown;
    } catch (error) {
      if (error instanceof TrustedSourceUploadRtdbTransactionError) throw error;
      return fail('trusted_source_upload_oauth_response_invalid');
    }
    const token = value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>).access_token
      : undefined;
    const expiresIn = value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>).expires_in
      : undefined;
    if (typeof token !== 'string'
      || !token.trim()
      || token.length > 8 * 1024
      || !Number.isSafeInteger(expiresIn)
      || (expiresIn as number) < 1
      || (expiresIn as number) > 86_400) {
      return fail('trusted_source_upload_oauth_response_invalid');
    }
    cached = { value: token, expiresAt: nowMs + (expiresIn as number) * 1000 };
    return token;
  };

  return {
    async getAccessToken(): Promise<string> {
      const nowMs = now();
      if (cached && nowMs < cached.expiresAt - ACCESS_TOKEN_CACHE_SKEW_MS) return cached.value;
      if (!pending) {
        pending = refresh().finally(() => {
          pending = null;
        });
      }
      return pending;
    },
  };
};

const normalizeDatabaseUrl = (value: string): string => {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return fail('trusted_source_upload_database_url_invalid');
  }
  if (parsed.protocol !== 'https:' || parsed.search || parsed.hash || parsed.username || parsed.password) {
    return fail('trusted_source_upload_database_url_invalid');
  }
  return parsed.toString().replace(/\/$/u, '');
};

const assertTrustedPath = (value: string): string => {
  if (!/^book_source_upload_accounts\/[A-Za-z0-9_:@-]{1,256}$/u.test(value)) {
    return fail('trusted_source_upload_path_invalid');
  }
  return value;
};

const parseSnapshot = async (response: Response, maxBytes: number): Promise<unknown> => {
  const body = await boundedResponseText(
    response,
    maxBytes,
    'trusted_source_upload_snapshot_too_large',
  );
  if (!body || body === 'null') return null;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return fail('trusted_source_upload_snapshot_invalid');
  }
};

/**
 * Backend-only RTDB REST adapter. OAuth service identity bypasses browser
 * deny-only rules; ETag `If-Match` provides atomic compare-and-set.
 */
export const createTrustedFirebaseSourceUploadRtdbTransaction = (
  config: TrustedFirebaseSourceUploadTransactionConfig,
): SourceUploadRtdbTransaction => {
  const databaseUrl = normalizeDatabaseUrl(config.databaseUrl);
  const fetchImpl = config.fetchImpl ?? fetch;
  const maxRetries = config.maxRetries ?? 5;
  const maxSnapshotBytes = config.maxSnapshotBytes ?? DEFAULT_MAX_SNAPSHOT_BYTES;
  if (!Number.isSafeInteger(maxRetries) || maxRetries < 1 || maxRetries > 10) {
    fail('trusted_source_upload_retry_limit_invalid');
  }
  if (!Number.isSafeInteger(maxSnapshotBytes)
    || maxSnapshotBytes < 1
    || maxSnapshotBytes > MAX_SNAPSHOT_BYTES) {
    fail('trusted_source_upload_snapshot_limit_invalid');
  }

  return async <T>(input: {
    readonly path: string;
    readonly expectedRevision: number;
    readonly update: (current: T | null) => T | undefined;
  }): Promise<SourceUploadRtdbTransactionResult<T>> => {
    const { path, expectedRevision, update } = input;
    const endpoint = `${databaseUrl}/${assertTrustedPath(path)}.json`;
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
      fail('trusted_source_upload_expected_revision_invalid');
    }
    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      const token = await config.accessTokenProvider.getAccessToken();
      if (!token.trim()) fail('trusted_source_upload_token_unavailable');
      const read = await fetchImpl(endpoint, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Firebase-ETag': 'true',
        },
      });
      if (!read.ok) fail('trusted_source_upload_read_failed');
      const etag = read.headers.get('etag')
        ?? fail('trusted_source_upload_etag_missing');
      const current = await parseSnapshot(read, maxSnapshotBytes) as T | null;
      const revision = current === null ? 0 : readRevision(current);
      if (revision !== expectedRevision) {
        return Object.freeze({ committed: false, value: current });
      }
      const next = update(current);
      if (next === undefined) return Object.freeze({ committed: false, value: current });
      const body = JSON.stringify(next);
      if (encoder.encode(body).byteLength > maxSnapshotBytes) {
        fail('trusted_source_upload_mutation_too_large');
      }
      const write = await fetchImpl(endpoint, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'If-Match': etag,
        },
        body,
      });
      if (write.status === 412) continue;
      if (!write.ok) fail('trusted_source_upload_write_failed');
      return Object.freeze({ committed: true, value: next });
    }
    return fail('trusted_source_upload_transaction_contention');
  };
};

function readRevision(value: unknown): number {
  if (value === null
    || typeof value !== 'object'
    || !Number.isSafeInteger((value as { revision?: unknown }).revision)) {
    return -1;
  }
  return (value as { revision: number }).revision;
}
