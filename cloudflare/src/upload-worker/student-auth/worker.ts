import { importPKCS8, SignJWT } from 'jose';
import {
  createTrustedFirebaseRtdbServiceAccountAccessTokenProvider,
} from '../../../../src/services/book-source-delivery/sourceUpload.firebaseRtdbTransaction.ts';
import { FirebaseRtdbRestClient } from '../listening-authoring/rtdb.ts';
// @ts-ignore JavaScript module has no declaration file.
import { parseSpareAllowedLocalhostOrigins } from '../cors-policy.js';
import {
  isValidRegistrationPassword,
  normalizeDisplayName,
  normalizeNamePart,
  normalizeRegistrationEmail,
  normalizeStudentId,
} from '../../../../src/services/studentRegistrationValidation.ts';

const MAX_BODY_BYTES = 8 * 1024;
const FIREBASE_CUSTOM_TOKEN_AUDIENCE = 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit';
const STUDENT_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

interface StudentAuthWorkerEnv extends Record<string, unknown> {
  readonly FIREBASE_DB_URL?: unknown;
  readonly FIREBASE_PROJECT_ID?: unknown;
  readonly FIREBASE_WEB_API_KEY?: unknown;
  readonly BOOK_HOMEWORK_SERVICE_IDENTITY?: unknown;
  readonly BOOK_HOMEWORK_GOOGLE_SA_KEY?: unknown;
  readonly STUDENT_AUTH_ROUTES_ENABLED?: unknown;
  readonly STUDENT_AUTH_ALLOWED_ORIGINS?: unknown;
  readonly LOCAL_EMULATOR_AUTH?: unknown;
  readonly UPLOAD_RATE_LIMITER?: {
    limit: (input: { key: string }) => Promise<{ success: boolean }> | { success: boolean };
  };
  readonly BOOK_ROUTE_RATE_LIMITER?: {
    limit: (input: { key: string }) => Promise<{ success: boolean }> | { success: boolean };
  };
}

interface FirebaseIdentity {
  readonly valid: boolean;
  readonly uid?: string;
  readonly email?: string;
  readonly emailVerified?: boolean;
  readonly hasGoogleIdentity?: boolean;
  readonly photoURL?: string;
}

interface FirebaseVerifier {
  verifyAuthorizationHeader: (
    header: string | null,
    env: StudentAuthWorkerEnv,
  ) => Promise<FirebaseIdentity> | FirebaseIdentity;
}

interface IdentityToolkitResult {
  readonly ok: boolean;
  readonly status: number;
  readonly data: Record<string, unknown>;
}

interface StudentAuthDatabase {
  readValue(path: string): Promise<unknown>;
  readWithEtag<T = unknown>(path: string): Promise<{ data: T | null; etag: string }>;
  writeIfMatch(path: string, value: unknown, etag: string): Promise<boolean>;
}

interface RegistrationClaim {
  readonly path: string;
  readonly uid: string;
  readonly operationId: string;
  readonly startedAt: number;
}

const REGISTRATION_CLAIM_TTL_MS = 5 * 60 * 1000;

interface StudentAuthWorkerOptions {
  readonly firebaseVerifier?: FirebaseVerifier;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
  readonly databaseFactory?: (
    env: StudentAuthWorkerEnv,
    fetchImpl: typeof fetch,
  ) => Promise<StudentAuthDatabase> | StudentAuthDatabase;
  readonly identityToolkit?: (
    operation: 'accounts:signUp' | 'accounts:signInWithPassword',
    body: Record<string, unknown>,
    origin: string,
    env: StudentAuthWorkerEnv,
  ) => Promise<IdentityToolkitResult>;
  readonly createCustomToken?: (uid: string, env: StudentAuthWorkerEnv) => Promise<string>;
  readonly rateLimit?: (request: Request, env: StudentAuthWorkerEnv) => Promise<boolean>;
  readonly generateStudentId?: () => string;
}

const asRecord = (value: unknown): Record<string, unknown> | null => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const requiredString = (value: unknown, code: string, maxLength = 32 * 1024): string => {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw new Error(code);
  }
  return value.trim();
};

const isLocalEmulator = (env: StudentAuthWorkerEnv): boolean => {
  if (env.LOCAL_EMULATOR_AUTH !== 'true' || env.FIREBASE_PROJECT_ID !== 'demo-luyentap-local') {
    return false;
  }
  try {
    const databaseUrl = new URL(requiredString(env.FIREBASE_DB_URL, 'database_url_missing'));
    return databaseUrl.protocol === 'http:'
      && databaseUrl.hostname === 'localhost'
      && databaseUrl.port === '9000';
  } catch {
    return false;
  }
};

const hashStudentId = async (normalized: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const generateStudentId = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `STU-${[...bytes].map((byte) => STUDENT_ID_ALPHABET[byte % STUDENT_ID_ALPHABET.length]).join('')}`;
};

const parseJson = async (response: Response): Promise<Record<string, unknown>> => {
  const raw = await response.text();
  if (new TextEncoder().encode(raw).byteLength > 16 * 1024) throw new Error('response_too_large');
  try {
    return asRecord(JSON.parse(raw)) ?? {};
  } catch {
    return {};
  }
};

const buildDatabaseUrl = (databaseUrl: string, path: string, local: boolean): string => {
  const url = new URL(databaseUrl);
  const basePath = url.pathname.replace(/\/$/u, '');
  const suffix = path ? `${path}.json` : '.json';
  url.pathname = `${basePath}/${suffix}`;
  if (local) url.searchParams.set('auth', 'owner');
  return url.toString();
};

const createLocalDatabase = (
  env: StudentAuthWorkerEnv,
  fetchImpl: typeof fetch,
): StudentAuthDatabase => {
  const databaseUrl = requiredString(env.FIREBASE_DB_URL, 'database_url_missing');
  const request = async (
    path: string,
    init: RequestInit = {},
  ): Promise<Response> => fetchImpl(buildDatabaseUrl(databaseUrl, path, false), {
    ...init,
    headers: {
      Authorization: 'Bearer owner',
      ...(init.headers ?? {}),
    },
  });

  return {
    async readValue(path) {
      const response = await request(path);
      if (!response.ok) throw new Error(`database_read_failed:${response.status}`);
      const value = await response.json() as unknown;
      return value ?? null;
    },
    async readWithEtag<T>(path: string) {
      const response = await request(path, { headers: { 'X-Firebase-ETag': 'true' } });
      if (!response.ok) throw new Error(`database_read_failed:${response.status}`);
      const etag = response.headers.get('etag');
      if (!etag) throw new Error('database_etag_missing');
      return { data: await response.json() as T | null, etag };
    },
    async writeIfMatch(path, value, etag) {
      const response = await request(path, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'If-Match': etag },
        body: JSON.stringify(value),
      });
      if (response.status === 412) return false;
      if (!response.ok) throw new Error(`database_write_failed:${response.status}`);
      return true;
    },
  };
};

const createProductionDatabase = (
  env: StudentAuthWorkerEnv,
  fetchImpl: typeof fetch,
  now: () => number,
): StudentAuthDatabase => {
  const serviceIdentity = requiredString(env.BOOK_HOMEWORK_SERVICE_IDENTITY, 'service_identity_missing');
  const serviceAccountJson = requiredString(env.BOOK_HOMEWORK_GOOGLE_SA_KEY, 'service_account_missing', 64 * 1024);
  let serviceAccount: Record<string, unknown> | null = null;
  try {
    serviceAccount = asRecord(JSON.parse(serviceAccountJson));
  } catch {
    throw new Error('service_account_invalid');
  }
  if (serviceAccount?.client_email !== serviceIdentity
    || typeof serviceAccount.private_key !== 'string'
    || !serviceAccount.private_key.trim()) {
    throw new Error('service_account_identity_mismatch');
  }

  const databaseUrl = requiredString(env.FIREBASE_DB_URL, 'database_url_missing');
  const parsedDatabaseUrl = new URL(databaseUrl);
  if (parsedDatabaseUrl.protocol !== 'https:'
    || parsedDatabaseUrl.search
    || parsedDatabaseUrl.hash
    || !/(?:firebaseio\.com|firebasedatabase\.app)$/u.test(parsedDatabaseUrl.hostname)) {
    throw new Error('database_url_invalid');
  }
  const accessTokenProvider = createTrustedFirebaseRtdbServiceAccountAccessTokenProvider({
    serviceAccountEmail: serviceIdentity,
    serviceAccountPrivateKey: serviceAccount.private_key.replace(/\\n/gu, '\n'),
    fetchImpl,
    now,
  });
  const client = new FirebaseRtdbRestClient({
    env: {
      FIREBASE_DB_URL: databaseUrl,
      FIREBASE_PROJECT_ID: requiredString(env.FIREBASE_PROJECT_ID, 'project_id_missing'),
      GOOGLE_SA_KEY: serviceAccountJson,
    },
    fetchImpl,
    getAccessToken: () => accessTokenProvider.getAccessToken(),
  });
  return client;
};

const identityToolkitRequest = async (
  operation: 'accounts:signUp' | 'accounts:signInWithPassword',
  body: Record<string, unknown>,
  origin: string,
  env: StudentAuthWorkerEnv,
  fetchImpl: typeof fetch,
): Promise<IdentityToolkitResult> => {
  const local = isLocalEmulator(env);
  const apiKey = local ? 'local-dev-key' : requiredString(env.FIREBASE_WEB_API_KEY, 'firebase_api_key_missing');
  const baseUrl = local
    ? 'http://localhost:9099/identitytoolkit.googleapis.com/v1'
    : 'https://identitytoolkit.googleapis.com/v1';
  const response = await fetchImpl(`${baseUrl}/${operation}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
      Referer: `${origin}/`,
    },
    body: JSON.stringify(body),
  });
  return { ok: response.ok, status: response.status, data: await parseJson(response) };
};

const createFirebaseCustomToken = async (
  uid: string,
  env: StudentAuthWorkerEnv,
  now: () => number,
  keyCache?: Map<string, Promise<CryptoKey>>,
): Promise<string> => {
  const serviceIdentity = requiredString(env.BOOK_HOMEWORK_SERVICE_IDENTITY, 'service_identity_missing');
  const raw = requiredString(env.BOOK_HOMEWORK_GOOGLE_SA_KEY, 'service_account_missing', 64 * 1024);
  const cacheKey = `${serviceIdentity}\0${raw}`;
  let privateKeyPromise = keyCache?.get(cacheKey);
  if (!privateKeyPromise) {
    let serviceAccount: Record<string, unknown> | null = null;
    try {
      serviceAccount = asRecord(JSON.parse(raw));
    } catch {
      throw new Error('service_account_invalid');
    }
    if (serviceAccount?.client_email !== serviceIdentity
      || typeof serviceAccount.private_key !== 'string'
      || !serviceAccount.private_key.trim()) {
      throw new Error('service_account_identity_mismatch');
    }
    privateKeyPromise = importPKCS8(serviceAccount.private_key.replace(/\\n/gu, '\n'), 'RS256')
      .catch((error) => {
        keyCache?.delete(cacheKey);
        throw error;
      });
    if (keyCache) {
      if (keyCache.size >= 8) keyCache.clear();
      keyCache.set(cacheKey, privateKeyPromise);
    }
  }
  const issuedAt = Math.floor(now() / 1000);
  const privateKey = await privateKeyPromise;
  return new SignJWT({ uid })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(serviceIdentity)
    .setSubject(serviceIdentity)
    .setAudience(FIREBASE_CUSTOM_TOKEN_AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + 3600)
    .sign(privateKey);
};

const accountAvailable = (profile: Record<string, unknown> | null): boolean => (
  profile?.role === 'student'
  && !['blocked', 'disabled', 'inactive', 'suspended'].includes(String(profile.status ?? 'active'))
  && profile.forceReauth !== true
);

const getAllowedOrigins = (env: StudentAuthWorkerEnv): Set<string> => {
  const origins = new Set(
    requiredString(env.STUDENT_AUTH_ALLOWED_ORIGINS, 'allowed_origins_missing', 4096)
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
  parseSpareAllowedLocalhostOrigins(env).forEach((origin) => origins.add(origin));
  return origins;
};

const jsonResponse = (
  body: Record<string, unknown>,
  status: number,
  origin: string,
  allowed: boolean,
): Response => {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    Pragma: 'no-cache',
    Vary: 'Origin',
  });
  if (allowed) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  }
  return new Response(JSON.stringify(body), { status, headers });
};

const readBody = async (request: Request, { allowEmpty = false } = {}): Promise<Record<string, unknown>> => {
  if (allowEmpty && !request.body) return {};
  if (!(request.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) {
    throw new Error('invalid_content_type');
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw new Error('body_too_large');
  if (allowEmpty && !raw.trim()) return {};
  const parsed = asRecord(JSON.parse(raw));
  if (!parsed) throw new Error('invalid_request');
  return parsed;
};

const workerError = (code: string, status: number): { body: Record<string, unknown>; status: number } => ({
  body: { code },
  status,
});

const reserveStudentId = async (
  database: StudentAuthDatabase,
  uid: string,
  studentId: { display: string; normalized: string },
  now: number,
): Promise<{ hash: string; createdAt: number; created: boolean } | null> => {
  const hash = await hashStudentId(studentId.normalized);
  const path = `student_login_ids/${hash}`;
  const current = await database.readWithEtag<Record<string, unknown>>(path);
  if (current.data && current.data.uid !== uid) return null;
  if (current.data?.uid === uid) {
    return {
      hash,
      createdAt: typeof current.data.createdAt === 'number' ? current.data.createdAt : now,
      created: false,
    };
  }
  if (!await database.writeIfMatch(path, { uid, createdAt: now }, current.etag)) return null;
  return { hash, createdAt: now, created: true };
};

const releaseStudentIdReservation = async (
  database: StudentAuthDatabase,
  hash: string,
  uid: string,
): Promise<void> => {
  try {
    const path = `student_login_ids/${hash}`;
    const current = await database.readWithEtag<Record<string, unknown>>(path);
    if (current.data?.uid === uid) await database.writeIfMatch(path, null, current.etag);
  } catch {
    // A stale mapping cannot authenticate without a matching active profile.
  }
};

const acquireRegistrationClaim = async (
  database: StudentAuthDatabase,
  uid: string,
  now: number,
): Promise<RegistrationClaim | null> => {
  const path = `student_registration_claims/${uid}`;
  const current = await database.readWithEtag<Record<string, unknown>>(path);
  const startedAt = typeof current.data?.startedAt === 'number' ? current.data.startedAt : 0;
  if (current.data?.uid === uid
    && typeof current.data.operationId === 'string'
    && now - startedAt < REGISTRATION_CLAIM_TTL_MS) {
    return null;
  }
  const operationId = crypto.randomUUID();
  const claim = { uid, operationId, startedAt: now };
  if (!await database.writeIfMatch(path, claim, current.etag)) return null;
  return { path, ...claim };
};

const releaseRegistrationClaim = async (
  database: StudentAuthDatabase,
  claim: RegistrationClaim,
): Promise<void> => {
  try {
    const current = await database.readWithEtag<Record<string, unknown>>(claim.path);
    if (current.data?.uid === claim.uid && current.data.operationId === claim.operationId) {
      await database.writeIfMatch(claim.path, null, current.etag);
    }
  } catch {
    // A retry can replace an expired claim.
  }
};

const createStudentProfile = (input: {
  readonly uid: string;
  readonly email: string;
  readonly displayName: string;
  readonly photoURL?: string;
  readonly now: number;
}): Record<string, unknown> => ({
  uid: input.uid,
  email: input.email,
  displayName: input.displayName,
  photoURL: input.photoURL ?? null,
  role: 'student',
  createdAt: input.now,
  lastLoginAt: input.now,
  status: 'active',
  forceReauth: false,
});

const identityErrorCode = (result: IdentityToolkitResult): string => {
  const error = asRecord(result.data.error);
  return typeof error?.message === 'string' ? error.message : 'identity_toolkit_failed';
};

export const createStudentAuthWorkerHandlers = (options: StudentAuthWorkerOptions = {}) => {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const productionDatabaseCache = new Map<string, StudentAuthDatabase>();
  const customTokenKeyCache = new Map<string, Promise<CryptoKey>>();
  const resolveProductionDatabase = (env: StudentAuthWorkerEnv): StudentAuthDatabase => {
    const cacheKey = [
      String(env.BOOK_HOMEWORK_SERVICE_IDENTITY ?? ''),
      String(env.FIREBASE_DB_URL ?? ''),
      String(env.FIREBASE_PROJECT_ID ?? ''),
      String(env.BOOK_HOMEWORK_GOOGLE_SA_KEY ?? ''),
    ].join('\0');
    const cached = productionDatabaseCache.get(cacheKey);
    if (cached) return cached;
    const database = createProductionDatabase(env, fetchImpl, now);
    if (productionDatabaseCache.size >= 8) productionDatabaseCache.clear();
    productionDatabaseCache.set(cacheKey, database);
    return database;
  };
  const resolveDatabase = options.databaseFactory ?? ((env: StudentAuthWorkerEnv) => (
    isLocalEmulator(env)
      ? createLocalDatabase(env, fetchImpl)
      : resolveProductionDatabase(env)
  ));
  const callIdentityToolkit = options.identityToolkit
    ?? ((operation, body, origin, env) => identityToolkitRequest(operation, body, origin, env, fetchImpl));
  const signCustomToken = options.createCustomToken
    ?? ((uid, env) => createFirebaseCustomToken(uid, env, now, customTokenKeyCache));
  const enforceRateLimit = options.rateLimit ?? (async (request, env) => {
    const limiter = env.UPLOAD_RATE_LIMITER ?? env.BOOK_ROUTE_RATE_LIMITER;
    if (!limiter || typeof limiter.limit !== 'function') return isLocalEmulator(env);
    const address = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    const result = await limiter.limit({ key: `student-auth:${address}` });
    return result?.success === true;
  });

  const responseFor = (
    body: Record<string, unknown>,
    status: number,
    origin: string,
    allowed: boolean,
  ) => jsonResponse(body, status, origin, allowed);

  const register = async (
    body: Record<string, unknown>,
    origin: string,
    env: StudentAuthWorkerEnv,
  ): Promise<{ body: Record<string, unknown>; status: number }> => {
    const studentId = normalizeStudentId(body.studentId);
    if (!studentId) return workerError('invalid_student_id', 400);
    const email = normalizeRegistrationEmail(body.email) ?? '';
    const password = typeof body.password === 'string' ? body.password : '';
    const displayName = normalizeDisplayName(body.displayName);
    if (!email) {
      return workerError('invalid_email', 400);
    }
    if (!isValidRegistrationPassword(password)) return workerError('weak_password', 400);
    if (displayName.length < 2) return workerError('invalid_display_name', 400);

    try {
      const database = await resolveDatabase(env, fetchImpl);
      const credentials = { email, password, returnSecureToken: true };
      let result = await callIdentityToolkit('accounts:signInWithPassword', credentials, origin, env);
      const createdAccount = !result.ok;
      if (createdAccount) {
        const hash = await hashStudentId(studentId.normalized);
        if (await database.readValue(`student_login_ids/${hash}`)) {
          return workerError('student_id_unavailable', 409);
        }
        result = await callIdentityToolkit('accounts:signUp', credentials, origin, env);
        if (!result.ok) {
          const code = identityErrorCode(result);
          if (code.startsWith('WEAK_PASSWORD')) return workerError('weak_password', 400);
          if (code === 'EMAIL_EXISTS') return workerError('email_or_password_invalid', 409);
          return workerError('registration_unavailable', 400);
        }
      }

      const uid = result.data.localId;
      if (typeof uid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/u.test(uid)
        || typeof result.data.idToken !== 'string' || !result.data.idToken) {
        return workerError('registration_unavailable', 503);
      }
      const resolvedEmail = typeof result.data.email === 'string' ? result.data.email : email;
      const claim = await acquireRegistrationClaim(database, uid, now());
      if (!claim) return workerError('registration_in_progress', 409);

      try {
        const profilePath = `users/${uid}`;
        const identifierPath = `student_identifiers/${uid}`;
        const [profile, identifier] = await Promise.all([
          database.readWithEtag<Record<string, unknown>>(profilePath),
          database.readWithEtag<Record<string, unknown>>(identifierPath),
        ]);
        if (profile.data !== null && !accountAvailable(asRecord(profile.data))) {
          return workerError('account_unavailable', 403);
        }
        let assignedId = normalizeStudentId(identifier.data?.studentId);
        if (assignedId && assignedId.normalized !== studentId.normalized) {
          return workerError('student_id_already_assigned', 409);
        }

        const local = isLocalEmulator(env);
        const token = local ? null : await signCustomToken(uid, env);
        const reservation = await reserveStudentId(database, uid, assignedId ?? studentId, now());
        if (!reservation) return workerError('student_id_unavailable', 409);

        if (!assignedId) {
          // The identifier's conditional write decides the winner even after a claim expires.
          const saved = await database.writeIfMatch(identifierPath, {
            uid,
            studentId: studentId.display,
            normalizedStudentId: studentId.normalized,
            createdAt: reservation.createdAt,
          }, identifier.etag).catch(() => false);
          const stored = saved ? studentId : normalizeStudentId(asRecord(await database.readValue(identifierPath))?.studentId);
          if (!stored) return workerError('student_auth_unavailable', 503);
          if (stored.normalized !== studentId.normalized) {
            if (reservation.created) await releaseStudentIdReservation(database, reservation.hash, uid);
            return workerError('student_id_already_assigned', 409);
          }
          assignedId = stored;
        }

        if (profile.data === null) {
          const nextProfile = createStudentProfile({ uid, email: resolvedEmail, displayName, now: now() });
          const saved = await database.writeIfMatch(profilePath, nextProfile, profile.etag).catch(() => false);
          if (!saved) {
            const stored = await database.readValue(profilePath);
            if (stored === null) return workerError('student_auth_unavailable', 503);
            if (!accountAvailable(asRecord(stored))) return workerError('account_unavailable', 403);
          }
        }

        return {
          body: {
            studentId: assignedId.display,
            ...(local ? { email: resolvedEmail } : { customToken: token }),
          },
          status: createdAccount ? 201 : 200,
        };
      } finally {
        await releaseRegistrationClaim(database, claim);
      }
    } catch {
      // Auth and confirmed ID records can be resumed by a retry with the same credentials.
      return workerError('student_auth_unavailable', 503);
    }
  };

  const login = async (
    body: Record<string, unknown>,
    origin: string,
    env: StudentAuthWorkerEnv,
  ): Promise<{ body: Record<string, unknown>; status: number }> => {
    const studentId = normalizeStudentId(body.studentId);
    const password = typeof body.password === 'string' ? body.password : '';
    if (!studentId || password.length < 1 || password.length > 128) {
      return workerError('invalid_credentials', 401);
    }
    try {
      const database = await resolveDatabase(env, fetchImpl);
      const hash = await hashStudentId(studentId.normalized);
      const mapping = asRecord(await database.readValue(`student_login_ids/${hash}`));
      const uid = typeof mapping?.uid === 'string' ? mapping.uid : '';
      if (!uid || !/^[A-Za-z0-9_-]{1,128}$/u.test(uid)) return workerError('invalid_credentials', 401);
      const [profile, identifier] = await Promise.all([
        database.readValue(`users/${uid}`).then(asRecord),
        database.readValue(`student_identifiers/${uid}`).then(asRecord),
      ]);
      if (!accountAvailable(profile)
        || normalizeStudentId(identifier?.studentId)?.normalized !== studentId.normalized
        || typeof profile?.email !== 'string') {
        return workerError('invalid_credentials', 401);
      }
      const authResult = await callIdentityToolkit('accounts:signInWithPassword', {
        email: profile.email,
        password,
        returnSecureToken: true,
      }, origin, env);
      if (!authResult.ok || authResult.data.localId !== uid) {
        return workerError('invalid_credentials', 401);
      }
      if (isLocalEmulator(env)) return { body: { email: profile.email }, status: 200 };
      return { body: { customToken: await signCustomToken(uid, env) }, status: 200 };
    } catch {
      return workerError('student_auth_unavailable', 503);
    }
  };

  const ensureId = async (
    request: Request,
    env: StudentAuthWorkerEnv,
  ): Promise<{ body: Record<string, unknown>; status: number }> => {
    if (!options.firebaseVerifier) return workerError('student_auth_unavailable', 503);
    const verified = await options.firebaseVerifier.verifyAuthorizationHeader(
      request.headers.get('Authorization'),
      env,
    );
    const uid = verified.valid && typeof verified.uid === 'string' ? verified.uid : '';
    if (!/^[A-Za-z0-9_-]{1,128}$/u.test(uid)) return workerError('unauthorized', 401);

    const body = await readBody(request, { allowEmpty: true });
    const registerGoogle = body.registerGoogle === true;
    const googleEmail = verified.emailVerified && verified.hasGoogleIdentity
      ? verified.email?.trim().toLowerCase() ?? ''
      : '';
    if (registerGoogle && !googleEmail) return workerError('account_unavailable', 403);

    try {
      const database = await resolveDatabase(env, fetchImpl);
      const profilePath = `users/${uid}`;
      const profile = await database.readWithEtag<Record<string, unknown>>(profilePath);
      const createProfile = profile.data === null && registerGoogle;
      if (!createProfile && !accountAvailable(asRecord(profile.data))) {
        return workerError('account_unavailable', 403);
      }

      const suppliedStudentId = Object.prototype.hasOwnProperty.call(body, 'studentId');
      const requestedId = normalizeStudentId(body.studentId);
      if ((suppliedStudentId || registerGoogle) && !requestedId) return workerError('invalid_student_id', 400);
      const displayName = normalizeDisplayName(body.displayName);
      const firstName = normalizeNamePart(body.firstName);
      const familyName = normalizeNamePart(body.familyName);
      if (registerGoogle && (!firstName || !familyName || !displayName)) return workerError('invalid_display_name', 400);

      const identifierPath = `student_identifiers/${uid}`;
      const currentIdentifier = await database.readWithEtag<Record<string, unknown>>(identifierPath);
      const currentId = normalizeStudentId(currentIdentifier.data?.studentId);
      if (currentId && requestedId && currentId.normalized !== requestedId.normalized) {
        return workerError('student_id_already_assigned', 409);
      }
      for (let attempt = 0; attempt < 12; attempt += 1) {
        let candidate = currentId ?? requestedId ?? normalizeStudentId((options.generateStudentId ?? generateStudentId)());
        if (!candidate) continue;
        const reservation = await reserveStudentId(database, uid, candidate, now());
        if (!reservation) {
          if (currentId) return workerError('student_id_conflict', 409);
          if (requestedId) return workerError('student_id_unavailable', 409);
          continue;
        }

        if (!currentId) {
          const identifier = {
            uid,
            studentId: candidate.display,
            normalizedStudentId: candidate.normalized,
            createdAt: reservation.createdAt,
          };
          const assigned = await database.writeIfMatch(identifierPath, identifier, currentIdentifier.etag).catch(() => false);
          if (!assigned) {
            const storedIdentifier = asRecord(await database.readValue(identifierPath));
            const assignedId = normalizeStudentId(storedIdentifier?.studentId);
            if (!assignedId) return workerError('student_auth_unavailable', 503);
            if (assignedId.normalized !== candidate.normalized) {
              await releaseStudentIdReservation(database, reservation.hash, uid);
              if (requestedId) return workerError('student_id_already_assigned', 409);
            }
            candidate = assignedId;
          }
        }

        const names = {
          ...(displayName ? { displayName } : {}),
          ...(firstName ? { firstName } : {}),
          ...(familyName ? { familyName } : {}),
        };
        if (createProfile || Object.keys(names).length > 0) {
          // Publish a new profile only after both student ID records exist.
          const initialProfile = createProfile
            ? createStudentProfile({ uid, email: googleEmail, displayName, photoURL: verified.photoURL, now: now() })
            : profile.data;
          const saved = await database.writeIfMatch(profilePath, { ...initialProfile, ...names }, profile.etag).catch(() => false);
          if (!saved) {
            const latest = asRecord(await database.readValue(profilePath));
            if (!latest) return workerError('student_auth_unavailable', 503);
            if (!accountAvailable(latest)) return workerError('account_unavailable', 403);
            if (Object.entries(names).some(([name, value]) => latest[name] !== value)) {
              return workerError('student_auth_unavailable', 503);
            }
          }
        }
        return { body: { studentId: candidate.display, created: !currentId }, status: 200 };
      }
      return workerError('student_id_unavailable', 503);
    } catch {
      return workerError('student_auth_unavailable', 503);
    }
  };

  return {
    async fetch(request: Request, env: StudentAuthWorkerEnv): Promise<Response> {
      const url = new URL(request.url);
      if (!['/auth/student/register', '/auth/student/login', '/auth/student/ensure-id'].includes(url.pathname)) {
        return responseFor({ code: 'not_found' }, 404, '', false);
      }
      if (env.STUDENT_AUTH_ROUTES_ENABLED !== 'enabled') {
        return responseFor({ code: 'student_auth_unavailable' }, 503, '', false);
      }

      let allowedOrigins: Set<string>;
      try {
        allowedOrigins = getAllowedOrigins(env);
      } catch {
        return responseFor({ code: 'student_auth_unavailable' }, 503, '', false);
      }
      const origin = request.headers.get('Origin') ?? '';
      const allowed = Boolean(origin) && allowedOrigins.has(origin);
      if (!allowed) return responseFor({ code: 'origin_denied' }, 403, origin, false);
      const requestedHeaders = (request.headers.get('Access-Control-Request-Headers') ?? '')
        .split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
      if (requestedHeaders.some((header) => !['authorization', 'content-type'].includes(header))) {
        return responseFor({ code: 'cors_header_denied' }, 403, origin, true);
      }
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Authorization, Content-Type',
            'Access-Control-Max-Age': '86400',
            'Cache-Control': 'no-store',
            Vary: 'Origin',
          },
        });
      }
      if (request.method !== 'POST') return responseFor({ code: 'method_not_allowed' }, 405, origin, true);

      try {
        if (!await enforceRateLimit(request, env)) {
          return responseFor({ code: 'rate_limited' }, 429, origin, true);
        }
      } catch {
        return responseFor({ code: 'student_auth_unavailable' }, 503, origin, true);
      }

      try {
        if (url.pathname === '/auth/student/ensure-id') {
          const result = await ensureId(request, env);
          return responseFor(result.body, result.status, origin, true);
        }
        const body = await readBody(request);
        const result = url.pathname === '/auth/student/register'
          ? await register(body, origin, env)
          : await login(body, origin, env);
        return responseFor(result.body, result.status, origin, true);
      } catch (error) {
        const code = error instanceof Error && error.message === 'body_too_large'
          ? 'body_too_large'
          : error instanceof Error && error.message === 'invalid_content_type'
            ? 'invalid_content_type'
            : 'invalid_request';
        const status = code === 'body_too_large' ? 413 : code === 'invalid_request' ? 400 : 415;
        return responseFor({ code }, status, origin, true);
      }
    },
  };
};
