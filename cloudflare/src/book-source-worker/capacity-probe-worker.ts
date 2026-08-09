import {
  getBookSourceUploadProviderTotals,
  SourceUploadRtdbRepository,
  validateBookSourceUploadAccountState,
} from '../../../src/services/book-source-delivery/sourceUpload.rtdbRepository';
import type { ProviderReconciliationSnapshot } from './capacity-ledger';
import type { ProviderReconciliationCursor } from './provider-reconciliation';
import type { CapacityProbeEnvironment } from './capacity-probe-env';
import { evaluateLocalBaselineDemand } from './capacity-probe-local-baseline';

const PATH = '/internal/book-source-capacity/reconciliation-page';
const LOCAL_BASELINE_MODE = 'local-baseline';
const REMOTE_RECONCILIATION_MODE = 'remote-reconciliation';
const LOCAL_BASELINE_ENVIRONMENT = 'local';
const MAX_BODY_BYTES = 64 * 1_024;
const MAX_LEDGER_RESPONSE_BYTES = 32 * 1024 * 1024;
const BODY_READ_TIMEOUT_MS = 5_000;
const FIREBASE_READ_TIMEOUT_MS = 10_000;
const TOKEN_TTL_MS = 10 * 60 * 1_000;
const TOKEN_VERSION = 'book-source-capacity-v1';
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const LOCAL_BASELINE_ALLOWED_ENV_KEYS = [
  'BOOK_SOURCE_CAPACITY_PROBE_STATE',
  'BOOK_SOURCE_CAPACITY_ENVIRONMENT',
  'BOOK_SOURCE_CAPACITY_PROBE_MODE',
] as const;
const LOCAL_BASELINE_CREDENTIAL_HEADERS = new Set([
  'authorization',
  'cookie',
  'proxy-authorization',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
]);

interface ExpectedTotals {
  readonly totalBytes: number;
  readonly objectCount: number;
  readonly revision: number;
}
interface ContinuationPayload { readonly v: string; readonly exp: number; readonly expected: ExpectedTotals; readonly cursor: ProviderReconciliationCursor; }
type ExpectedTotalsReader = (env: Record<string, unknown>) => Promise<ExpectedTotals>;
type ReconciliationSnapshotWriter = (
  env: Record<string, unknown>,
  input: {
    readonly expectedRevision: number;
    readonly snapshot: ProviderReconciliationSnapshot;
  },
) => Promise<void>;

export const getCanonicalCapacityExpectedTotals = (state: unknown): ExpectedTotals => {
  if (state === null || state === undefined) throw new Error('invalid');
  const validated = validateBookSourceUploadAccountState(state);
  return Object.freeze({
    ...getBookSourceUploadProviderTotals(validated),
    revision: validated.revision,
  });
};

const noStore = (status: number, value: Record<string, unknown>): Response => new Response(JSON.stringify(value), {
  status, headers: { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' },
});
const unavailable = (status: number): Response => noStore(status, { code: 'unavailable' });
const isSafeCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const base64Url = (bytes: Uint8Array): string => {
  let raw = ''; for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/gu, '');
};
const decodeBase64Url = (value: string): Uint8Array | null => {
  if (!/^[A-Za-z0-9_-]{1,65536}$/u.test(value) || value.length % 4 === 1) return null;
  try {
    const raw = atob(value.replace(/-/gu, '+').replace(/_/gu, '/').padEnd(Math.ceil(value.length / 4) * 4, '='));
    return Uint8Array.from(raw, (character) => character.charCodeAt(0));
  } catch { return null; }
};
const required = (env: Record<string, unknown>, name: string): string => {
  const value = env[name]; if (typeof value !== 'string' || !value.trim()) throw new Error('invalid'); return value.trim();
};
const configuredMaxPages = (env: Record<string, unknown>): number => {
  const value = env.BOOK_SOURCE_CAPACITY_MAX_PROVIDER_PAGES;
  if (value === undefined) return 256;
  if (typeof value !== 'string' || !/^\d{1,3}$/u.test(value)) throw new Error('invalid');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 256) throw new Error('invalid');
  return parsed;
};
const readBoundedResponse = async (response: Response): Promise<unknown> => {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength !== null
    && (!/^\d+$/u.test(declaredLength) || Number(declaredLength) > MAX_LEDGER_RESPONSE_BYTES)
    || !response.body) {
    throw new Error('invalid');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_LEDGER_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error('invalid');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(decoder.decode(bytes)) as unknown;
  } catch {
    throw new Error('invalid');
  }
};
const createTimeoutFetch = (
  fetchImpl: typeof fetch,
  timeoutMs: number,
): typeof fetch => async (input, init) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const inheritedSignal = init?.signal;
  const abortInherited = () => controller.abort();
  if (inheritedSignal?.aborted) controller.abort();
  else inheritedSignal?.addEventListener('abort', abortInherited, { once: true });
  try {
    return await fetchImpl(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    inheritedSignal?.removeEventListener('abort', abortInherited);
  }
};
const createDefaultExpectedTotalsReader = (
  fetchImpl: typeof fetch,
): ExpectedTotalsReader => async (env) => {
  const { createTrustedFirebaseRtdbServiceAccountAccessTokenProvider } =
    await import('../../../src/services/book-source-delivery/sourceUpload.firebaseRtdbTransaction');
  const databaseUrl = new URL(required(env, 'FIREBASE_DATABASE_URL'));
  if (databaseUrl.protocol !== 'https:'
    || databaseUrl.search
    || databaseUrl.hash
    || databaseUrl.username
    || databaseUrl.password) {
    throw new Error('invalid');
  }
  const accountId = required(env, 'BOOK_SOURCE_CAPACITY_ACCOUNT_ID');
  if (!/^[A-Za-z0-9_:@-]{1,256}$/u.test(accountId)) throw new Error('invalid');
  const boundedFetch = createTimeoutFetch(fetchImpl, FIREBASE_READ_TIMEOUT_MS);
  const accessTokenProvider = createTrustedFirebaseRtdbServiceAccountAccessTokenProvider({
    serviceAccountEmail: required(env, 'BOOK_SOURCE_FIREBASE_SERVICE_ACCOUNT_EMAIL'),
    serviceAccountPrivateKey: required(env, 'BOOK_SOURCE_FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY'),
    fetchImpl: boundedFetch,
  });
  const response = await boundedFetch(
    `${databaseUrl.toString().replace(/\/$/u, '')}/book_source_upload_accounts/${accountId}.json`,
    {
      headers: {
        Authorization: `Bearer ${await accessTokenProvider.getAccessToken()}`,
      },
    },
  );
  if (!response.ok) throw new Error('invalid');
  const state = await readBoundedResponse(response);
  return getCanonicalCapacityExpectedTotals(state);
};
const createDefaultReconciliationSnapshotWriter = (
  fetchImpl: typeof fetch,
): ReconciliationSnapshotWriter => async (env, input) => {
  const {
    createTrustedFirebaseRtdbServiceAccountAccessTokenProvider,
    createTrustedFirebaseSourceUploadRtdbTransaction,
  } = await import('../../../src/services/book-source-delivery/sourceUpload.firebaseRtdbTransaction');
  const accessTokenProvider = createTrustedFirebaseRtdbServiceAccountAccessTokenProvider({
    serviceAccountEmail: required(env, 'BOOK_SOURCE_FIREBASE_SERVICE_ACCOUNT_EMAIL'),
    serviceAccountPrivateKey: required(env, 'BOOK_SOURCE_FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY'),
    fetchImpl,
  });
  const repository = new SourceUploadRtdbRepository(
    createTrustedFirebaseSourceUploadRtdbTransaction({
      databaseUrl: required(env, 'FIREBASE_DATABASE_URL'),
      accessTokenProvider,
      fetchImpl,
    }),
    {},
  );
  await repository.recordProviderReconciliation({
    accountId: required(env, 'BOOK_SOURCE_CAPACITY_ACCOUNT_ID'),
    expectedRevision: input.expectedRevision,
    snapshot: input.snapshot,
  });
};
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const actual = Object.keys(value).sort(); const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};
const SAFE_FAILURE_CODES = new Set([
  'aborted', 'timeout', 'not_found', 'conflict', 'unauthorized',
  'checksum_mismatch', 'metadata_mismatch', 'provider_drift',
  'invalid_provider_totals', 'reconciliation_bound_exceeded',
]);
const SAFE_FAILURE_PHASES = new Set(['authorize', 'list']);
const SAFE_FAILURE_KINDS = new Set(['http', 'network', 'response']);
const safeFailure = (error: unknown): Record<string, string | number> => {
  const value = record(error);
  const code = value?.code;
  const phase = value?.phase;
  const kind = value?.kind;
  const status = value?.status;
  return {
    code: typeof code === 'string' && SAFE_FAILURE_CODES.has(code) ? code : 'internal',
    ...(typeof phase === 'string' && SAFE_FAILURE_PHASES.has(phase) ? { phase } : {}),
    ...(typeof kind === 'string' && SAFE_FAILURE_KINDS.has(kind) ? { kind } : {}),
    ...(typeof status === 'number' && Number.isInteger(status) && status >= 400 && status <= 599
      ? { status }
      : {}),
  };
};
const reportFailure = (error: unknown): void => {
  console.error(JSON.stringify({
    event: 'book_source_capacity_probe_failure',
    ...safeFailure(error),
  }));
};

const constantTimeBearer = async (request: Request, secret: string): Promise<boolean> => {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return false;
  const candidate = authorization.slice(7);
  const [candidateDigest, secretDigest] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(candidate)), crypto.subtle.digest('SHA-256', encoder.encode(secret)),
  ]);
  const left = new Uint8Array(candidateDigest); const right = new Uint8Array(secretDigest);
  let difference = 0; for (let index = 0; index < left.length; index += 1) difference |= left[index]! ^ right[index]!;
  return difference === 0;
};
const cursorValid = (value: unknown): value is ProviderReconciliationCursor => {
  const cursor = record(value);
  const keys = cursor?.continuation === undefined
    ? ['storageLocationId', 'privateBucketId', 'accumulatedBytes', 'accumulatedObjectCount', 'pagesRead', 'seenContinuationFingerprints']
    : ['storageLocationId', 'privateBucketId', 'continuation', 'accumulatedBytes', 'accumulatedObjectCount', 'pagesRead', 'seenContinuationFingerprints'];
  return cursor !== null && exactKeys(cursor, keys)
    && typeof cursor.storageLocationId === 'string' && typeof cursor.privateBucketId === 'string'
    && (cursor.continuation === undefined || typeof cursor.continuation === 'string')
    && isSafeCount(cursor.accumulatedBytes) && isSafeCount(cursor.accumulatedObjectCount)
    && isSafeCount(cursor.pagesRead) && Array.isArray(cursor.seenContinuationFingerprints)
    && cursor.seenContinuationFingerprints.every((fingerprint) =>
      typeof fingerprint === 'string' && /^[a-f0-9]{64}$/u.test(fingerprint));
};
const payloadValid = (value: unknown): value is ContinuationPayload => {
  const payload = record(value); const expected = record(payload?.expected);
  return payload !== null && exactKeys(payload, ['v', 'exp', 'expected', 'cursor'])
    && payload.v === TOKEN_VERSION && isSafeCount(payload.exp) && expected !== null
    && exactKeys(expected, ['totalBytes', 'objectCount', 'revision'])
    && isSafeCount(expected.totalBytes)
    && isSafeCount(expected.objectCount)
    && isSafeCount(expected.revision)
    && cursorValid(payload.cursor);
};
const keyFor = async (secret: string): Promise<CryptoKey> => {
  const raw = decodeBase64Url(secret);
  if (!raw || ![16, 24, 32].includes(raw.byteLength)) throw new Error('invalid');
  const keyBytes = raw.slice().buffer as ArrayBuffer;
  return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
};
const seal = async (secret: string, payload: ContinuationPayload): Promise<string> => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(TOKEN_VERSION) }, await keyFor(secret), encoder.encode(JSON.stringify(payload))));
  const combined = new Uint8Array(iv.length + encrypted.length); combined.set(iv); combined.set(encrypted, iv.length);
  return base64Url(combined);
};
const unseal = async (secret: string, token: string, now: number): Promise<ContinuationPayload | null> => {
  const combined = decodeBase64Url(token); if (!combined || combined.byteLength <= 12) return null;
  try {
    const value = JSON.parse(decoder.decode(await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: combined.slice(0, 12), additionalData: encoder.encode(TOKEN_VERSION) }, await keyFor(secret), combined.slice(12),
    )));
    return payloadValid(value) && value.exp > now && value.exp <= now + TOKEN_TTL_MS ? value : null;
  } catch { return null; }
};
const readJson = async (
  request: Request,
  timeoutMs: number,
): Promise<Record<string, unknown> | null> => {
  if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
    return null;
  }
  const contentLength = request.headers.get('content-length');
  if (contentLength !== null && (!/^\d+$/u.test(contentLength) || Number(contentLength) > MAX_BODY_BYTES)) return null;
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  const timeout = setTimeout(() => { void reader.cancel(); }, timeoutMs);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try { return record(JSON.parse(decoder.decode(bytes))); } catch { return null; }
};

const localBaselineEnvironmentSafe = (env: CapacityProbeEnvironment): boolean => {
  const keys = Reflect.ownKeys(env);
  if (keys.length !== LOCAL_BASELINE_ALLOWED_ENV_KEYS.length
    || keys.some((key) => typeof key !== 'string'
      || !LOCAL_BASELINE_ALLOWED_ENV_KEYS.includes(key as typeof LOCAL_BASELINE_ALLOWED_ENV_KEYS[number]))) {
    return false;
  }
  return env.BOOK_SOURCE_CAPACITY_PROBE_STATE === 'enabled'
    && env.BOOK_SOURCE_CAPACITY_ENVIRONMENT === LOCAL_BASELINE_ENVIRONMENT
    && env.BOOK_SOURCE_CAPACITY_PROBE_MODE === LOCAL_BASELINE_MODE;
};

const localBaselineRequestSafe = (request: Request): boolean => {
  for (const [name] of request.headers) {
    if (LOCAL_BASELINE_CREDENTIAL_HEADERS.has(name.toLowerCase())) return false;
  }
  return true;
};

export interface CapacityProbeWorkerOptions {
  readonly now?: () => number;
  readonly bodyReadTimeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
  readonly readExpectedTotals?: ExpectedTotalsReader;
  readonly writeReconciliationSnapshot?: ReconciliationSnapshotWriter;
  /** Test-only observation seam. Production default never logs caught errors. */
  readonly onError?: (error: unknown) => void;
}

export const createCapacityProbeWorker = (
  options: CapacityProbeWorkerOptions = {},
) => {
  const readExpectedTotals = options.readExpectedTotals
    ?? createDefaultExpectedTotalsReader(options.fetchImpl ?? fetch);
  const writeReconciliationSnapshot = options.writeReconciliationSnapshot
    ?? createDefaultReconciliationSnapshotWriter(options.fetchImpl ?? fetch);
  return {
  async fetch(request: Request, env: CapacityProbeEnvironment): Promise<Response> {
    try {
      // State is a secret: absence never activates this internal probe.
      if (env.BOOK_SOURCE_CAPACITY_PROBE_STATE !== 'enabled') return unavailable(503);
      const mode = env.BOOK_SOURCE_CAPACITY_PROBE_MODE;
      if (mode !== undefined && mode !== REMOTE_RECONCILIATION_MODE && mode !== LOCAL_BASELINE_MODE) {
        return unavailable(503);
      }
      const url = new URL(request.url);
      if (request.method !== 'POST' || url.pathname !== PATH || url.search) return unavailable(404);
      if (mode === LOCAL_BASELINE_MODE) {
        if (!localBaselineEnvironmentSafe(env) || !localBaselineRequestSafe(request)) return unavailable(503);
        const body = await readJson(request, options.bodyReadTimeoutMs ?? BODY_READ_TIMEOUT_MS);
        if (!body || !exactKeys(body, ['demand'])) return unavailable(503);
        const evaluation = evaluateLocalBaselineDemand(body.demand);
        if (evaluation.status === 'refused') {
          return unavailable(503);
        }
        return noStore(200, {
          state: 'complete',
          mode: LOCAL_BASELINE_MODE,
          demand: evaluation.demand,
        });
      }
      if (env.BOOK_SOURCE_CAPACITY_ENVIRONMENT !== 'staging') return unavailable(503);
      const bearer = required(env, 'BOOK_SOURCE_CAPACITY_PROBE_TOKEN');
      if (!await constantTimeBearer(request, bearer)) return unavailable(401);
      const body = await readJson(
        request,
        options.bodyReadTimeoutMs ?? BODY_READ_TIMEOUT_MS,
      );
      if (!body) return unavailable(400);
      const now = (options.now ?? Date.now)();
      const cursorSecret = required(env, 'BOOK_SOURCE_CAPACITY_CURSOR_KEY');
      let expected: ExpectedTotals; let cursor: ProviderReconciliationCursor;
      if (exactKeys(body, [])) {
        expected = await readExpectedTotals(env);
        cursor = Object.freeze({ storageLocationId: required(env, 'BOOK_SOURCE_B2_STORAGE_LOCATION_ID'), privateBucketId: required(env, 'BOOK_SOURCE_B2_PRIVATE_BUCKET_ID'), accumulatedBytes: 0, accumulatedObjectCount: 0, pagesRead: 0, seenContinuationFingerprints: [] });
      } else if (exactKeys(body, ['continuationToken']) && typeof body.continuationToken === 'string') {
        const continuation = await unseal(cursorSecret, body.continuationToken, now); if (!continuation) return unavailable(400);
        expected = continuation.expected; cursor = continuation.cursor;
      } else return unavailable(400);
      // Keep provider/reconciliation code out of the local baseline module path.
      const [{ createCapacityProbeProviderFromEnv }, { readProviderTotalsWorkUnit, reconcileProviderTotals }] = await Promise.all([
        import('./capacity-probe-provider'),
        import('./provider-reconciliation'),
      ]);
      const work = await readProviderTotalsWorkUnit({
        provider: createCapacityProbeProviderFromEnv(env, { fetch: options.fetchImpl }),
        cursor,
        maxPages: configuredMaxPages(env),
      });
      if (work.state === 'continue') {
        const continuationToken = await seal(cursorSecret, { v: TOKEN_VERSION, exp: now + TOKEN_TTL_MS, expected, cursor: work.cursor });
        return noStore(200, { state: 'continue', continuationToken });
      }
      const snapshot = reconcileProviderTotals({
        expected,
        observed: work.totals,
        completedAt: new Date(now).toISOString(),
      });
      await writeReconciliationSnapshot(env, {
        expectedRevision: expected.revision,
        snapshot,
      });
      return noStore(200, { state: 'complete', status: snapshot.status });
    } catch (error) {
      if (options.onError) options.onError(error);
      else reportFailure(error);
      return unavailable(503);
    }
  },
  };
};

export default createCapacityProbeWorker();
