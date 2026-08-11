import { SignJWT, importPKCS8 } from 'jose';
import { FirebaseRtdbRestClient, type RepositoryEnv } from '../listening-authoring/rtdb.ts';
import type { BookRolloutWorkerEnvironment } from '../../book-rollout-gate.ts';

export const BOOK_ACTIVITY_AUTHORING_ROOT = 'book_activity_authoring/owners';
const MAX_RETRIES = 5;
const MAX_ACTIVITIES_PER_OWNER = 128;
const MAX_CANDIDATES_PER_OWNER = 128;
const MAX_OPERATIONS_PER_OWNER = 256;
const MAX_OWNER_ROOT_BYTES = 64 * 1024 * 1024;
const OAUTH2_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SAFE_ID = /^[A-Za-z0-9_-]{1,160}$/u;
const FIREBASE_SCOPES = [
  'https://www.googleapis.com/auth/firebase.database',
  'https://www.googleapis.com/auth/datastore',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

export interface BookActivityAuthoringRepositoryEnv extends RepositoryEnv, BookRolloutWorkerEnvironment {
  BOOK_ACTIVITY_AUTHORING_SERVICE_IDENTITY?: string;
  /** Dedicated secret. Generic GOOGLE_SA_KEY is intentionally never used here. */
  BOOK_ACTIVITY_AUTHORING_GOOGLE_SA_KEY?: string;
}

export interface BookActivityAuthoringRoot {
  activities?: Record<string, unknown>;
  candidates?: Record<string, unknown>;
  operations?: Record<string, unknown>;
}

interface ServiceAccountKey { client_email: string; private_key: string }
interface TokenResponse { access_token: string; expires_in?: number }

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const recordMap = (
  value: unknown,
  maximum: number,
  label: string,
): Record<string, unknown> | undefined => {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`invalid_book_activity_authoring_${label}`);
  }
  const entries = Object.entries(value);
  if (entries.length > maximum) {
    throw new Error(`book_activity_authoring_${label}_capacity_exceeded`);
  }
  if (entries.some(([key, entry]) =>
    !key || entry === null || typeof entry !== 'object' || Array.isArray(entry))) {
    throw new Error(`invalid_book_activity_authoring_${label}`);
  }
  return clone(Object.fromEntries(entries));
};
const root = (value: unknown): BookActivityAuthoringRoot => {
  if (value === null || value === undefined) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid_book_activity_authoring_root');
  }
  const source = value as Record<string, unknown>;
  if (Object.keys(source).some((key) =>
    !['activities', 'candidates', 'operations'].includes(key))) {
    throw new Error('invalid_book_activity_authoring_root');
  }
  if (new TextEncoder().encode(JSON.stringify(source)).byteLength > MAX_OWNER_ROOT_BYTES) {
    throw new Error('book_activity_authoring_root_too_large');
  }
  return {
    activities: recordMap(source.activities, MAX_ACTIVITIES_PER_OWNER, 'activities'),
    candidates: recordMap(source.candidates, MAX_CANDIDATES_PER_OWNER, 'candidates'),
    operations: recordMap(source.operations, MAX_OPERATIONS_PER_OWNER, 'operations'),
  };
};
// FirebaseRtdbRestClient encodes each segment exactly once.
const ownerPath = (ownerId: string): string => `${BOOK_ACTIVITY_AUTHORING_ROOT}/${ownerId}`;
const assertOwnerId = (ownerId: string): void => {
  if (!SAFE_ID.test(ownerId)) throw new Error('invalid_book_activity_authoring_owner_id');
};
const assertAllowedReadPath = (path: string): void => {
  if (/^users\/[A-Za-z0-9_-]{1,160}$/u.test(path)) return;
  if (/^material_catalog\/books\/[A-Za-z0-9_-]{1,160}$/u.test(path)) return;
  const ownerPrefix = `${BOOK_ACTIVITY_AUTHORING_ROOT}/`;
  if (path.startsWith(ownerPrefix) && SAFE_ID.test(path.slice(ownerPrefix.length))) return;
  throw new Error('book_activity_authoring_path_forbidden');
};

const dedicatedTokenProvider = (keyJson: string, identity: string, fetchImpl: typeof fetch): (() => Promise<string>) => {
  let key: ServiceAccountKey;
  try { key = JSON.parse(keyJson) as ServiceAccountKey; } catch { throw new Error('invalid_book_activity_authoring_google_sa_key'); }
  if (!key.client_email || !key.private_key) throw new Error('invalid_book_activity_authoring_google_sa_key');
  if (key.client_email !== identity) throw new Error('book_activity_authoring_service_identity_mismatch');
  let cached = ''; let expiresAt = 0;
  return async () => {
    if (cached && Date.now() < expiresAt - 300_000) return cached;
    const now = Math.floor(Date.now() / 1000);
    const assertion = await new SignJWT({ iss: key.client_email, sub: key.client_email, aud: OAUTH2_TOKEN_URL, iat: now, exp: now + 3600, scope: FIREBASE_SCOPES })
      .setProtectedHeader({ alg: 'RS256' })
      .sign(await importPKCS8(key.private_key, 'RS256'));
    const response = await fetchImpl(OAUTH2_TOKEN_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${assertion}`,
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`book_activity_authoring_google_oauth_failed:${response.status}`);
    let token: TokenResponse;
    try { token = JSON.parse(body) as TokenResponse; } catch { throw new Error('book_activity_authoring_google_oauth_failed:invalid_response'); }
    if (!token.access_token) throw new Error('book_activity_authoring_google_oauth_failed:invalid_response');
    cached = token.access_token; expiresAt = Date.now() + Math.max(0, (token.expires_in ?? 3600) * 1000);
    return cached;
  };
};

/** Scoped repository. Each owner CASes only their bounded authoring subtree. */
export class FirebaseRestBookActivityAuthoringRepository {
  private readonly rtdb: FirebaseRtdbRestClient;

  constructor(private readonly options: {
    env: BookActivityAuthoringRepositoryEnv;
    fetchImpl?: typeof fetch;
    /** Test-only injected principal/token provider; production always uses dedicated secret. */
    getAccessToken?: () => Promise<string>;
    maxRetries?: number;
  }) {
    const identity = options.env.BOOK_ACTIVITY_AUTHORING_SERVICE_IDENTITY?.trim();
    if (!identity) throw new Error('missing_book_activity_authoring_service_identity');
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    const getAccessToken = options.getAccessToken ?? dedicatedTokenProvider(
      options.env.BOOK_ACTIVITY_AUTHORING_GOOGLE_SA_KEY?.trim() || (() => { throw new Error('missing_book_activity_authoring_google_sa_key'); })(),
      identity,
      fetchImpl,
    );
    this.rtdb = new FirebaseRtdbRestClient({ env: options.env, fetchImpl, getAccessToken });
  }

  async readValue(path: string): Promise<unknown> {
    assertAllowedReadPath(path);
    return this.rtdb.readValue(path);
  }

  async readOwnerRoot(ownerId: string): Promise<BookActivityAuthoringRoot> {
    assertOwnerId(ownerId);
    const current = await this.rtdb.readWithEtag<BookActivityAuthoringRoot | null>(ownerPath(ownerId));
    return root(current.data);
  }

  async transaction<T>(ownerId: string, mutate: (current: BookActivityAuthoringRoot) => {
    outcome: T; next?: BookActivityAuthoringRoot; write: boolean;
  }, options: { beforeWrite?: (next: BookActivityAuthoringRoot) => Promise<void> } = {}): Promise<T> {
    assertOwnerId(ownerId);
    const path = ownerPath(ownerId);
    const retries = this.options.maxRetries ?? MAX_RETRIES;
    for (let attempt = 0; attempt < retries; attempt += 1) {
      const current = await this.rtdb.readWithEtag<BookActivityAuthoringRoot | null>(path);
      const mutation = mutate(root(current.data));
      if (!mutation.write) return mutation.outcome;
      const next = root(mutation.next ?? {});
      await options.beforeWrite?.(next);
      if (await this.rtdb.writeIfMatch(path, next, current.etag)) return mutation.outcome;
    }
    throw new Error('book_activity_authoring_cas_retries_exhausted');
  }
}
