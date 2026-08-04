import { SignJWT, importPKCS8 } from 'jose';

export interface RepositoryEnv {
  FIREBASE_DB_URL?: string;
  FIREBASE_WEB_API_KEY?: string;
  GOOGLE_SA_KEY?: string;
  LISTENING_AUTHORING_IDEMPOTENCY_SECRET?: string;
  LISTENING_AUTHORING_DEV_WRITES_ENABLED?: string;
  readDatabaseValue?: (path: string, query?: FirebaseRtdbQuery) => Promise<unknown>;
}

export interface CourseBookAuthority102Claims {
  readonly operation: 'enrollment-transition';
  readonly actorUid: string;
  readonly courseId: string;
  readonly studentId: string;
  readonly legacyEnrollmentId: string;
  readonly expectedLegacyRevision: number;
  readonly expectedAuthorityRevision: number;
  readonly operationId: string;
}

export interface FirebaseRtdbQuery {
  readonly orderBy: '$key' | string;
  readonly limitToFirst?: number;
  readonly limitToLast?: number;
}

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
}

const OAUTH2_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const IDENTITY_TOOLKIT_CUSTOM_TOKEN_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken';
const FIREBASE_CUSTOM_TOKEN_AUDIENCE = 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit';
const FIREBASE_SCOPES = [
  'https://www.googleapis.com/auth/firebase.database',
  'https://www.googleapis.com/auth/datastore',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

class TokenCache {
  private cachedToken: string | null = null;
  private expiresAt = 0;

  constructor(
    private readonly saKeyJson: string,
    private readonly fetchImpl: typeof fetch,
  ) {}

  async getToken(): Promise<string> {
    if (this.cachedToken && Date.now() < this.expiresAt - REFRESH_BUFFER_MS) {
      return this.cachedToken;
    }
    let serviceAccount: ServiceAccountKey;
    try {
      serviceAccount = JSON.parse(this.saKeyJson) as ServiceAccountKey;
    } catch {
      throw new Error('invalid_google_sa_key');
    }
    if (!serviceAccount.client_email || !serviceAccount.private_key) {
      throw new Error('invalid_google_sa_key');
    }

    const privateKey = await importPKCS8(serviceAccount.private_key, 'RS256');
    const now = Math.floor(Date.now() / 1000);
    const assertion = await new SignJWT({
      iss: serviceAccount.client_email,
      sub: serviceAccount.client_email,
      aud: OAUTH2_TOKEN_URL,
      iat: now,
      exp: now + 3600,
      scope: FIREBASE_SCOPES,
    })
      .setProtectedHeader({ alg: 'RS256' })
      .sign(privateKey);

    const response = await this.fetchImpl.call(globalThis, OAUTH2_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${assertion}`,
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`google_oauth_failed:${response.status}:${body}`);

    const token = JSON.parse(body) as TokenResponse;
    if (typeof token.access_token !== 'string' || token.access_token === '') {
      throw new Error('google_oauth_failed:invalid_response');
    }

    this.cachedToken = token.access_token;
    this.expiresAt = Date.now() + Math.max(0, (token.expires_in || 3600) * 1000);
    return this.cachedToken;
  }
}

const tokenCaches = new Map<string, TokenCache>();
const courseAuthorityTokenCaches = new Map<string, { token: string; expiresAt: number }>();

const getTokenCache = (saKeyJson: string, fetchImpl: typeof fetch): TokenCache => {
  let cache = tokenCaches.get(saKeyJson);
  if (!cache) {
    cache = new TokenCache(saKeyJson, fetchImpl);
    tokenCaches.set(saKeyJson, cache);
  }
  return cache;
};

const stableCourseClaims = (claims: CourseBookAuthority102Claims): string => JSON.stringify({
  operation: claims.operation, actorUid: claims.actorUid, courseId: claims.courseId,
  studentId: claims.studentId, legacyEnrollmentId: claims.legacyEnrollmentId,
  expectedLegacyRevision: claims.expectedLegacyRevision,
  expectedAuthorityRevision: claims.expectedAuthorityRevision, operationId: claims.operationId,
});

const assertCourseClaims = (claims: CourseBookAuthority102Claims): void => {
  const id = /^[A-Za-z0-9][A-Za-z0-9:_-]{2,159}$/u;
  const operation = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
  if (claims.operation !== 'enrollment-transition'
    || ![claims.actorUid, claims.courseId, claims.studentId, claims.legacyEnrollmentId].every((value) => id.test(value))
    || !operation.test(claims.operationId)
    || !Number.isSafeInteger(claims.expectedLegacyRevision)
    || !Number.isSafeInteger(claims.expectedAuthorityRevision)
    || claims.expectedLegacyRevision < 0 || claims.expectedAuthorityRevision < 0) {
    throw new Error('invalid_course_book_authority_102_claims');
  }
};

/** Mints and exchanges a short-lived Firebase ID token for one exact #102 mutation. */
export const createCourseBookAuthority102TokenProvider = (options: {
  readonly env: RepositoryEnv;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
}) => {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const now = options.now ?? Date.now;
  return async (claims: CourseBookAuthority102Claims): Promise<string> => {
    assertCourseClaims(claims);
    const serviceAccountJson = options.env.GOOGLE_SA_KEY?.trim();
    const apiKey = options.env.FIREBASE_WEB_API_KEY?.trim();
    if (!serviceAccountJson) throw new Error('missing_course_book_authority_google_sa_key');
    if (!apiKey) throw new Error('missing_course_book_authority_firebase_web_api_key');
    let serviceAccount: ServiceAccountKey;
    try { serviceAccount = JSON.parse(serviceAccountJson) as ServiceAccountKey; } catch { throw new Error('invalid_course_book_authority_google_sa_key'); }
    if (!serviceAccount.client_email || !serviceAccount.private_key) throw new Error('invalid_course_book_authority_google_sa_key');
    const cacheKey = `${serviceAccount.client_email}:${stableCourseClaims(claims)}`;
    const cached = courseAuthorityTokenCaches.get(cacheKey);
    if (cached && now() < cached.expiresAt - 60_000) return cached.token;
    const issuedAt = Math.floor(now() / 1000);
    const privateKey = await importPKCS8(serviceAccount.private_key, 'RS256');
    const customToken = await new SignJWT({
      iss: serviceAccount.client_email, sub: serviceAccount.client_email,
      aud: FIREBASE_CUSTOM_TOKEN_AUDIENCE, iat: issuedAt, exp: issuedAt + 300,
      uid: `course-book-authority-102:${claims.operationId}`,
      claims: { courseBookAuthority102: true, ...claims },
    }).setProtectedHeader({ alg: 'RS256', typ: 'JWT' }).sign(privateKey);
    let response: Response;
    try { response = await fetchImpl.call(globalThis, `${IDENTITY_TOOLKIT_CUSTOM_TOKEN_URL}?key=${encodeURIComponent(apiKey)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: customToken, returnSecureToken: true }) }); } catch { throw new Error('course_book_authority_token_exchange_transport_failed'); }
    const raw = await response.text();
    if (!response.ok) throw new Error(`course_book_authority_token_exchange_failed:${response.status}`);
    let exchanged: { idToken?: unknown; expiresIn?: unknown };
    try { exchanged = JSON.parse(raw) as { idToken?: unknown; expiresIn?: unknown }; } catch { throw new Error('course_book_authority_token_exchange_invalid_response'); }
    if (typeof exchanged.idToken !== 'string' || exchanged.idToken.length < 16 || !/^\d+$/u.test(String(exchanged.expiresIn))) throw new Error('course_book_authority_token_exchange_invalid_response');
    const lifetime = Math.min(300, Math.max(1, Number(exchanged.expiresIn))) * 1000;
    courseAuthorityTokenCaches.set(cacheKey, { token: exchanged.idToken, expiresAt: now() + lifetime });
    return exchanged.idToken;
  };
};

const parseJsonBody = (value: string): unknown => {
  if (!value.trim()) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const encodeRtdbPath = (path: string): string =>
  path
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/');

const rtdbUrl = (env: RepositoryEnv, path: string): string => {
  const baseUrl = env.FIREBASE_DB_URL?.trim().replace(/\/$/, '');
  if (!baseUrl) throw new Error('missing_firebase_db_url');
  const encodedPath = encodeRtdbPath(path);
  return encodedPath ? `${baseUrl}/${encodedPath}.json` : `${baseUrl}/.json`;
};

const withQuery = (
  url: string,
  query?: FirebaseRtdbQuery,
  authToken?: string,
): string => {
  const parameters = new URLSearchParams();
  if (query) {
    parameters.set('orderBy', JSON.stringify(query.orderBy));
    if (query.limitToFirst !== undefined) {
      parameters.set('limitToFirst', String(query.limitToFirst));
    }
    if (query.limitToLast !== undefined) {
      parameters.set('limitToLast', String(query.limitToLast));
    }
  }
  if (authToken !== undefined) parameters.set('auth', authToken);
  const encoded = parameters.toString();
  return encoded ? `${url}?${encoded}` : url;
};

export class FirebaseRtdbRestClient {
  constructor(
    private readonly options: {
      env: RepositoryEnv;
      fetchImpl: typeof fetch;
      getAccessToken?: () => Promise<string>;
      firebaseAuthToken?: boolean;
      getFirebaseAuthToken?: () => Promise<string>;
    },
  ) {}

  async readValue(path: string, query?: FirebaseRtdbQuery): Promise<unknown> {
    if (this.options.env.readDatabaseValue) {
      return this.options.env.readDatabaseValue(path, query);
    }
    const auth = await this.requestAuth(path, query);
    const response = await this.options.fetchImpl.call(globalThis, auth.url, {
      method: 'GET',
      headers: auth.headers,
    });
    const body = parseJsonBody(await response.text());
    if (!response.ok) throw new Error(`firebase_rtdb_get_failed:${response.status}`);
    return body;
  }

  async readWithEtag<T>(path: string): Promise<{ data: T; etag: string }> {
    const auth = await this.requestAuth(path);
    const response = await this.options.fetchImpl.call(globalThis, auth.url, {
      method: 'GET',
      headers: {
        ...auth.headers,
        'X-Firebase-ETag': 'true',
      },
    });
    const body = parseJsonBody(await response.text());
    if (!response.ok) throw new Error(`firebase_rtdb_get_failed:${response.status}`);
    const etag = response.headers.get('etag');
    if (!etag) throw new Error(`missing_firebase_etag:${path || '/'}`);
    return { data: body as T, etag };
  }

  async patchMultiLocation(updates: readonly { readonly path: string; readonly value: unknown }[]): Promise<void> {
    if (!this.options.firebaseAuthToken) throw new Error('firebase_rtdb_multi_location_patch_requires_firebase_auth_token');
    if (!Array.isArray(updates) || updates.length < 2) throw new Error('firebase_rtdb_multi_location_patch_invalid');
    const payload: Record<string, unknown> = {};
    for (const update of updates) { const path = update?.path; if (typeof path !== 'string' || !/^[A-Za-z0-9_-]{1,160}(?:\/[A-Za-z0-9_-]{1,160})*$/u.test(path) || Object.hasOwn(payload, path) || Object.keys(payload).some((other) => path.startsWith(other + '/') || other.startsWith(path + '/'))) throw new Error('firebase_rtdb_multi_location_patch_invalid'); payload[path] = update.value; }
    const auth = await this.requestAuth(''); let response: Response;
    try { response = await this.options.fetchImpl.call(globalThis, auth.url, { method: 'PATCH', headers: { ...auth.headers, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); } catch { throw new Error('firebase_rtdb_multi_location_patch_transport_failed'); }
    if (!response.ok) throw new Error('firebase_rtdb_multi_location_patch_failed:' + response.status);
  }

  async writeIfMatch(path: string, value: unknown, etag: string): Promise<boolean> {
    const auth = await this.requestAuth(path);
    const response = await this.options.fetchImpl.call(globalThis, auth.url, {
      method: 'PUT',
      headers: {
        ...auth.headers,
        'Content-Type': 'application/json',
        'if-match': etag,
      },
      body: JSON.stringify(value),
    });
    if (response.status === 412) return false;
    if (!response.ok) {
      const body = (await response.text()).slice(0, 240).replace(/[\r\n]+/g, ' ');
      throw new Error(`firebase_rtdb_put_failed:${response.status}:${body}`);
    }
    return true;
  }

  private async accessToken(): Promise<string> {
    if (this.options.getAccessToken) return this.options.getAccessToken();
    const saKey = this.options.env.GOOGLE_SA_KEY?.trim();
    if (!saKey) throw new Error('missing_google_sa_key');
    return getTokenCache(saKey, this.options.fetchImpl).getToken();
  }

  private async requestAuth(path: string, query?: FirebaseRtdbQuery): Promise<{
    url: string;
    headers: Record<string, string>;
  }> {
    const token = this.options.firebaseAuthToken && this.options.getFirebaseAuthToken
      ? await this.options.getFirebaseAuthToken()
      : await this.accessToken();
    const url = rtdbUrl(this.options.env, path);
    return this.options.firebaseAuthToken
      ? { url: withQuery(url, query, token), headers: {} }
      : { url: withQuery(url, query), headers: { Authorization: `Bearer ${token}` } };
  }
}
