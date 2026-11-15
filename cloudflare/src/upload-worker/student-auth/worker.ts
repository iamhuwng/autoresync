import { importPKCS8, SignJWT } from 'jose';
import {
  createTrustedFirebaseRtdbServiceAccountAccessTokenProvider,
} from '../../../../src/services/book-source-delivery/sourceUpload.firebaseRtdbTransaction.ts';
import { FirebaseRtdbRestClient } from '../listening-authoring/rtdb.ts';

const MAX_BODY_BYTES = 8 * 1024;
const FIREBASE_CUSTOM_TOKEN_AUDIENCE = 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit';
const STUDENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{2,31}$/u;
const RESERVED_STUDENT_IDS = new Set([
  'admin', 'administrator', 'root', 'system', 'support', 'teacher', 'student', 'superadmin',
]);
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

interface FirebaseVerifier {
  verifyAuthorizationHeader: (
    header: string | null,
    env: StudentAuthWorkerEnv,
  ) => Promise<{ valid: boolean; uid?: string }> | { valid: boolean; uid?: string };
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
  patchAdminMultiLocation(updates: Readonly<Record<string, unknown>>): Promise<void>;
}

interface StudentAuthWorkerOptions {
  readonly firebaseVerifier?: FirebaseVerifier;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
  readonly databaseFactory?: (
    env: StudentAuthWorkerEnv,
    fetchImpl: typeof fetch,
  ) => Promise<StudentAuthDatabase> | StudentAuthDatabase;
  readonly identityToolkit?: (
    operation: 'accounts:signUp' | 'accounts:signInWithPassword' | 'accounts:delete',
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

const normalizeStudentId = (value: unknown): { display: string; normalized: string } | null => {
  if (typeof value !== 'string') return null;
  const display = value.trim().normalize('NFKC');
  if (!STUDENT_ID_PATTERN.test(display) || RESERVED_STUDENT_IDS.has(display.toLowerCase())) return null;
  return { display, normalized: display.toLowerCase() };
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
    async patchAdminMultiLocation(updates) {
      if (Object.keys(updates).length < 2) throw new Error('database_patch_invalid');
      const response = await request('', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!response.ok) throw new Error(`database_patch_failed:${response.status}`);
    },
  };
};

const createProductionDatabase = (
  env: StudentAuthWorkerEnv,
  fetchImpl: typeof fetch,
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
  operation: 'accounts:signUp' | 'accounts:signInWithPassword' | 'accounts:delete',
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
): Promise<string> => {
  const serviceIdentity = requiredString(env.BOOK_HOMEWORK_SERVICE_IDENTITY, 'service_identity_missing');
  const raw = requiredString(env.BOOK_HOMEWORK_GOOGLE_SA_KEY, 'service_account_missing', 64 * 1024);
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
  const issuedAt = Math.floor(now() / 1000);
  const privateKey = await importPKCS8(serviceAccount.private_key.replace(/\\n/gu, '\n'), 'RS256');
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

const getAllowedOrigins = (env: StudentAuthWorkerEnv): Set<string> => new Set(
  requiredString(env.STUDENT_AUTH_ALLOWED_ORIGINS, 'allowed_origins_missing', 4096)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);

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

const readBody = async (request: Request): Promise<Record<string, unknown>> => {
  if (!(request.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) {
    throw new Error('invalid_content_type');
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw new Error('body_too_large');
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
): Promise<{ hash: string; createdAt: number } | null> => {
  const hash = await hashStudentId(studentId.normalized);
  const path = `student_login_ids/${hash}`;
  const current = await database.readWithEtag<Record<string, unknown>>(path);
  if (current.data && current.data.uid !== uid) return null;
  if (current.data?.uid === uid) {
    return {
      hash,
      createdAt: typeof current.data.createdAt === 'number' ? current.data.createdAt : now,
    };
  }
  if (!await database.writeIfMatch(path, { uid, createdAt: now }, current.etag)) return null;
  return { hash, createdAt: now };
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

const createStudentProfile = (input: {
  readonly uid: string;
  readonly email: string;
  readonly displayName: string;
  readonly now: number;
}): Record<string, unknown> => ({
  uid: input.uid,
  email: input.email,
  displayName: input.displayName,
  photoURL: null,
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
  const resolveDatabase = options.databaseFactory ?? ((env: StudentAuthWorkerEnv) => (
    isLocalEmulator(env)
      ? createLocalDatabase(env, fetchImpl)
      : createProductionDatabase(env, fetchImpl)
  ));
  const callIdentityToolkit = options.identityToolkit
    ?? ((operation, body, origin, env) => identityToolkitRequest(operation, body, origin, env, fetchImpl));
  const signCustomToken = options.createCustomToken
    ?? ((uid, env) => createFirebaseCustomToken(uid, env, now));
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
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim().slice(0, 80) : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) || email.length > 254) {
      return workerError('invalid_email', 400);
    }
    if (password.length < 6 || password.length > 128) return workerError('weak_password', 400);
    if (displayName.length < 2) return workerError('invalid_display_name', 400);

    const signIn = await callIdentityToolkit('accounts:signInWithPassword', {
      email,
      password,
      returnSecureToken: true,
    }, origin, env);
    let authResult: Record<string, unknown>;
    let createdAccount = false;
    if (signIn.ok) {
      authResult = signIn.data;
    } else {
      const signUp = await callIdentityToolkit('accounts:signUp', {
        email,
        password,
        returnSecureToken: true,
      }, origin, env);
      if (!signUp.ok) {
        const code = identityErrorCode(signUp);
        if (code === 'WEAK_PASSWORD : Password should be at least 6 characters'
          || code.startsWith('WEAK_PASSWORD')) return workerError('weak_password', 400);
        if (code === 'EMAIL_EXISTS') return workerError('email_or_password_invalid', 409);
        return workerError('registration_unavailable', 400);
      }
      authResult = signUp.data;
      createdAccount = true;
    }

    const uid = typeof authResult.localId === 'string' ? authResult.localId : '';
    const idToken = typeof authResult.idToken === 'string' ? authResult.idToken : '';
    const resolvedEmail = typeof authResult.email === 'string' ? authResult.email : email;
    if (!uid || !idToken || !/^[A-Za-z0-9_-]{1,128}$/u.test(uid)) {
      return workerError('registration_unavailable', 503);
    }

    let database: StudentAuthDatabase;
    try {
      database = await resolveDatabase(env, fetchImpl);
    } catch {
      if (createdAccount) await callIdentityToolkit('accounts:delete', { idToken }, origin, env).catch(() => undefined);
      return workerError('student_auth_unavailable', 503);
    }

    let profile: Record<string, unknown> | null;
    try {
      profile = asRecord(await database.readValue(`users/${uid}`));
    } catch {
      if (createdAccount) await callIdentityToolkit('accounts:delete', { idToken }, origin, env).catch(() => undefined);
      return workerError('student_auth_unavailable', 503);
    }
    if (profile && !accountAvailable(profile)) {
      if (createdAccount) await callIdentityToolkit('accounts:delete', { idToken }, origin, env).catch(() => undefined);
      return workerError('account_unavailable', 403);
    }
    let existingIdentifier: Record<string, unknown> | null;
    try {
      existingIdentifier = asRecord(await database.readValue(`student_identifiers/${uid}`));
    } catch {
      if (createdAccount) await callIdentityToolkit('accounts:delete', { idToken }, origin, env).catch(() => undefined);
      return workerError('student_auth_unavailable', 503);
    }
    const existingStudentId = normalizeStudentId(existingIdentifier?.studentId);
    if (existingStudentId && existingStudentId.normalized !== studentId.normalized) {
      if (createdAccount) await callIdentityToolkit('accounts:delete', { idToken }, origin, env).catch(() => undefined);
      return workerError('student_id_already_assigned', 409);
    }

    let reservation: { hash: string; createdAt: number } | null = null;
    let profileCommitted = false;
    try {
      reservation = await reserveStudentId(database, uid, studentId, now());
      if (!reservation) {
        if (createdAccount) await callIdentityToolkit('accounts:delete', { idToken }, origin, env).catch(() => undefined);
        return workerError('student_id_unavailable', 409);
      }
      const nextProfile = profile
        ? { ...profile, lastLoginAt: now() }
        : createStudentProfile({
          uid,
          email: resolvedEmail,
          displayName,
          now: now(),
        });
      if (!profile) {
        nextProfile.displayName = displayName;
      }
      const local = isLocalEmulator(env);
      const token = local ? null : await signCustomToken(uid, env);
      try {
        await database.patchAdminMultiLocation({
          [`users/${uid}`]: nextProfile,
          [`student_identifiers/${uid}`]: {
            uid,
            studentId: studentId.display,
            normalizedStudentId: studentId.normalized,
            createdAt: typeof existingIdentifier?.createdAt === 'number' ? existingIdentifier.createdAt : reservation.createdAt,
          },
          [`student_login_ids/${reservation.hash}`]: { uid, createdAt: reservation.createdAt },
        });
      } catch {
        const [storedIdentifier, storedIndex] = await Promise.all([
          database.readValue(`student_identifiers/${uid}`).then(asRecord).catch(() => null),
          database.readValue(`student_login_ids/${reservation!.hash}`).then(asRecord).catch(() => null),
        ]);
        const committed = normalizeStudentId(storedIdentifier?.studentId)?.normalized === studentId.normalized
          && storedIndex?.uid === uid;
        if (!committed) throw new Error('student_profile_write_failed');
      }
      profileCommitted = true;
      return {
        body: {
          studentId: studentId.display,
          ...(local ? { email: resolvedEmail } : { customToken: token }),
        },
        status: createdAccount ? 201 : 200,
      };
    } catch {
      if (!profileCommitted) {
        if (reservation) await releaseStudentIdReservation(database, reservation.hash, uid);
        if (createdAccount) await callIdentityToolkit('accounts:delete', { idToken }, origin, env).catch(() => undefined);
      }
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
    if (!uid) return workerError('unauthorized', 401);
    try {
      const database = await resolveDatabase(env, fetchImpl);
      const profile = asRecord(await database.readValue(`users/${uid}`));
      if (!accountAvailable(profile)) return workerError('account_unavailable', 403);
      const currentIdentifier = asRecord(await database.readValue(`student_identifiers/${uid}`));
      let body: Record<string, unknown> = {};
      try { body = asRecord(await request.clone().json()) ?? {}; } catch { /* optional setup body */ }
      const suppliedStudentId = Object.prototype.hasOwnProperty.call(body, 'studentId');
      const requestedId = normalizeStudentId(body.studentId);
      if (suppliedStudentId && !requestedId) return workerError('invalid_student_id', 400);
      const currentId = normalizeStudentId(currentIdentifier?.studentId);
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const candidate = currentId ?? requestedId ?? normalizeStudentId((options.generateStudentId ?? generateStudentId)());
        if (!candidate) continue;
        const reservation = await reserveStudentId(database, uid, candidate, now());
        if (!reservation) {
          if (currentId) return workerError('student_id_conflict', 409);
          continue;
        }
        const displayName = typeof body.displayName === 'string' ? body.displayName.trim().slice(0, 80) : undefined;
        const firstName = typeof body.firstName === 'string' ? body.firstName.trim().slice(0, 50) : undefined;
        const familyName = typeof body.familyName === 'string' ? body.familyName.trim().slice(0, 50) : undefined;
        const updates = {
          [`users/${uid}`]: {
            ...(profile ?? {}),
            ...(displayName ? { displayName } : {}),
            ...(firstName ? { firstName } : {}),
            ...(familyName ? { familyName } : {}),
          },
          [`student_identifiers/${uid}`]: {
            uid,
            studentId: candidate.display,
            normalizedStudentId: candidate.normalized,
            createdAt: typeof currentIdentifier?.createdAt === 'number' ? currentIdentifier.createdAt : reservation.createdAt,
          },
          [`student_login_ids/${reservation.hash}`]: { uid, createdAt: reservation.createdAt },
        };
        try {
          await database.patchAdminMultiLocation(updates);
        } catch {
          const [storedIdentifier, storedIndex] = await Promise.all([
            database.readValue(`student_identifiers/${uid}`).then(asRecord).catch(() => null),
            database.readValue(`student_login_ids/${reservation.hash}`).then(asRecord).catch(() => null),
          ]);
          const committed = normalizeStudentId(storedIdentifier?.studentId)?.normalized === candidate.normalized
            && storedIndex?.uid === uid;
          if (!committed) {
            await releaseStudentIdReservation(database, reservation.hash, uid);
            throw new Error('student_profile_write_failed');
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
