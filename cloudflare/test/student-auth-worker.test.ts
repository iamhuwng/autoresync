import { describe, expect, it, vi } from 'vitest';
import { createStudentAuthWorkerHandlers } from '../src/upload-worker/student-auth/worker.ts';

const allowedOrigin = 'https://app.hocthem.net';

const createMemoryDatabase = (seed: Record<string, unknown> = {}) => {
  const values = new Map<string, unknown>(Object.entries(seed));
  return {
    values,
    readValue: vi.fn(async (path: string) => values.get(path) ?? null),
    readWithEtag: vi.fn(async (path: string) => ({
      data: values.get(path) ?? null,
      etag: `etag:${path}`,
    })),
    writeIfMatch: vi.fn(async (path: string, value: unknown, etag: string) => {
      if (etag !== `etag:${path}` || values.has(path)) return false;
      if (value === null) values.delete(path);
      else values.set(path, value);
      return true;
    }),
    patchAdminMultiLocation: vi.fn(async (updates: Readonly<Record<string, unknown>>) => {
      Object.entries(updates).forEach(([path, value]) => values.set(path, value));
    }),
  };
};

const makeEnv = () => ({
  FIREBASE_PROJECT_ID: 'temp-a1437',
  FIREBASE_DB_URL: 'https://temp-a1437-default-rtdb.firebaseio.com',
  FIREBASE_WEB_API_KEY: 'test-web-api-key',
  BOOK_HOMEWORK_SERVICE_IDENTITY: 'book-homework-runtime@temp-a1437.iam.gserviceaccount.com',
  BOOK_HOMEWORK_GOOGLE_SA_KEY: '{"client_email":"book-homework-runtime@temp-a1437.iam.gserviceaccount.com","private_key":"test-key"}',
  STUDENT_AUTH_ROUTES_ENABLED: 'enabled',
  STUDENT_AUTH_ALLOWED_ORIGINS: allowedOrigin,
});

const makeRequest = (path: string, body?: Record<string, unknown>, options: { origin?: string; method?: string; authorization?: string } = {}) => new Request(
  `https://worker.example${path}`,
  {
    method: options.method ?? 'POST',
    headers: {
      ...(options.origin === undefined ? { Origin: allowedOrigin } : { Origin: options.origin }),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.authorization ? { Authorization: options.authorization } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  },
);

const readJson = async (response: Response) => response.json() as Promise<Record<string, unknown>>;

describe('student authentication Worker', () => {
  it('creates student-only profiles and a private hashed ID index', async () => {
    const database = createMemoryDatabase();
    const identityToolkit = vi.fn(async (operation: string) => {
      if (operation === 'accounts:signInWithPassword') {
        return { ok: false, status: 400, data: { error: { message: 'EMAIL_NOT_FOUND' } } };
      }
      return {
        ok: true,
        status: 200,
        data: { localId: 'new-student-uid', idToken: 'firebase-id-token', email: 'student@example.com' },
      };
    });
    const worker = createStudentAuthWorkerHandlers({
      databaseFactory: () => database,
      identityToolkit: identityToolkit as never,
      createCustomToken: async () => 'signed-custom-token',
      rateLimit: async () => true,
      now: () => 1_800_000_000_000,
    });

    const response = await worker.fetch(makeRequest('/auth/student/register', {
      email: 'student@example.com',
      password: 'password123',
      displayName: 'New Student',
      studentId: 'Student-2048',
      role: 'teacher',
    }), makeEnv());
    const payload = await readJson(response);

    expect(response.status).toBe(201);
    expect(payload).toEqual({ studentId: 'Student-2048', customToken: 'signed-custom-token' });
    expect(database.values.get('users/new-student-uid')).toMatchObject({
      uid: 'new-student-uid',
      email: 'student@example.com',
      displayName: 'New Student',
      role: 'student',
      status: 'active',
    });
    expect(database.values.get('student_identifiers/new-student-uid')).toMatchObject({
      uid: 'new-student-uid',
      studentId: 'Student-2048',
      normalizedStudentId: 'student-2048',
    });
    const lookupEntries = [...database.values.entries()].filter(([path]) => path.startsWith('student_login_ids/'));
    expect(lookupEntries).toHaveLength(1);
    expect(lookupEntries[0]?.[1]).toMatchObject({ uid: 'new-student-uid' });
    expect(String(lookupEntries[0]?.[0])).not.toContain('student-2048');
    expect(payload).not.toHaveProperty('email');
  });

  it('authenticates student IDs without returning the linked email address', async () => {
    const database = createMemoryDatabase();
    const identityToolkit = vi.fn(async (operation: string, body: Record<string, unknown>) => ({
      ok: true,
      status: 200,
      data: operation === 'accounts:signInWithPassword'
        ? { localId: 'student-uid', email: body.email }
        : {},
    }));
    const worker = createStudentAuthWorkerHandlers({
      databaseFactory: () => database,
      identityToolkit: identityToolkit as never,
      createCustomToken: async () => 'one-time-custom-token',
      rateLimit: async () => true,
    });

    const register = createStudentAuthWorkerHandlers({
      databaseFactory: () => database,
      identityToolkit: vi.fn(async (operation: string) => operation === 'accounts:signInWithPassword'
        ? { ok: false, status: 400, data: { error: { message: 'EMAIL_NOT_FOUND' } } }
        : { ok: true, status: 200, data: { localId: 'student-uid', idToken: 'id-token', email: 'student@example.com' } }) as never,
      createCustomToken: async () => 'registration-token',
      rateLimit: async () => true,
    });
    const registrationResponse = await register.fetch(makeRequest('/auth/student/register', {
      email: 'student@example.com', password: 'password123', displayName: 'Student', studentId: 'student-7',
    }), makeEnv());
    expect(registrationResponse.status).toBe(201);

    const response = await worker.fetch(makeRequest('/auth/student/login', {
      studentId: 'STUDENT-7',
      password: 'password123',
    }), makeEnv());
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload).toEqual({ customToken: 'one-time-custom-token' });
    expect(payload).not.toHaveProperty('email');
    expect(identityToolkit).toHaveBeenCalledWith(
      'accounts:signInWithPassword',
      expect.objectContaining({ email: 'student@example.com', password: 'password123' }),
      allowedOrigin,
      expect.any(Object),
    );
  });

  it('does not allow a second account to claim an existing student ID', async () => {
    const database = createMemoryDatabase();
    let nextUid = 0;
    const deletedAccounts: string[] = [];
    const identityToolkit = vi.fn(async (operation: string, body: Record<string, unknown>) => {
      if (operation === 'accounts:signInWithPassword') {
        return { ok: false, status: 400, data: { error: { message: 'EMAIL_NOT_FOUND' } } };
      }
      if (operation === 'accounts:delete') {
        deletedAccounts.push(String(body.idToken));
        return { ok: true, status: 200, data: {} };
      }
      nextUid += 1;
      return { ok: true, status: 200, data: { localId: `student-${nextUid}`, idToken: `id-token-${nextUid}`, email: body.email } };
    });
    const worker = createStudentAuthWorkerHandlers({
      databaseFactory: () => database,
      identityToolkit: identityToolkit as never,
      createCustomToken: async () => 'custom-token',
      rateLimit: async () => true,
    });

    const first = await worker.fetch(makeRequest('/auth/student/register', {
      email: 'first@example.com', password: 'password123', displayName: 'First Student', studentId: 'shared-id',
    }), makeEnv());
    const second = await worker.fetch(makeRequest('/auth/student/register', {
      email: 'second@example.com', password: 'password123', displayName: 'Second Student', studentId: 'SHARED-ID',
    }), makeEnv());

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect(await readJson(second)).toEqual({ code: 'student_id_unavailable' });
    expect(deletedAccounts).toContain('id-token-2');
    expect(database.values.has('users/student-2')).toBe(false);
  });

  it('returns the same invalid-credentials response for unknown IDs and wrong passwords', async () => {
    const database = createMemoryDatabase();
    const worker = createStudentAuthWorkerHandlers({
      databaseFactory: () => database,
      identityToolkit: async () => ({ ok: false, status: 400, data: { error: { message: 'INVALID_LOGIN_CREDENTIALS' } } }),
      rateLimit: async () => true,
    });

    const response = await worker.fetch(makeRequest('/auth/student/login', {
      studentId: 'missing-id', password: 'password123',
    }), makeEnv());

    expect(response.status).toBe(401);
    expect(await readJson(response)).toEqual({ code: 'invalid_credentials' });
  });

  it('assigns an opaque generated ID to an existing student after Google sign-in', async () => {
    const database = createMemoryDatabase({
      'users/google-student': {
        uid: 'google-student', email: 'google@example.com', role: 'student', status: 'active',
      },
    });
    const worker = createStudentAuthWorkerHandlers({
      firebaseVerifier: {
        verifyAuthorizationHeader: async () => ({ valid: true, uid: 'google-student' }),
      },
      databaseFactory: () => database,
      generateStudentId: () => 'STU-ABCD2345',
      rateLimit: async () => true,
    });

    const response = await worker.fetch(makeRequest('/auth/student/ensure-id', undefined, {
      authorization: 'Bearer firebase-id-token',
    }), makeEnv());

    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({ studentId: 'STU-ABCD2345', created: true });
    expect(database.values.get('student_identifiers/google-student')).toMatchObject({ studentId: 'STU-ABCD2345' });
  });

  it('rejects a malformed requested ID instead of silently generating another one', async () => {
    const database = createMemoryDatabase({
      'users/google-student': {
        uid: 'google-student', email: 'google@example.com', role: 'student', status: 'active',
      },
    });
    const worker = createStudentAuthWorkerHandlers({
      firebaseVerifier: {
        verifyAuthorizationHeader: async () => ({ valid: true, uid: 'google-student' }),
      },
      databaseFactory: () => database,
      generateStudentId: () => 'STU-GENERATED',
      rateLimit: async () => true,
    });

    const response = await worker.fetch(makeRequest('/auth/student/ensure-id', {
      studentId: 'bad id!',
    }, { authorization: 'Bearer firebase-id-token' }), makeEnv());

    expect(response.status).toBe(400);
    expect(await readJson(response)).toEqual({ code: 'invalid_student_id' });
    expect(database.values.has('student_identifiers/google-student')).toBe(false);
  });

  it('treats a committed ensure-id patch as success when the patch response is lost', async () => {
    const database = createMemoryDatabase({
      'users/google-student': {
        uid: 'google-student', email: 'google@example.com', role: 'student', status: 'active',
      },
    });
    database.patchAdminMultiLocation.mockImplementationOnce(async (updates) => {
      Object.entries(updates).forEach(([path, value]) => database.values.set(path, value));
      throw new Error('network_lost_after_commit');
    });
    const worker = createStudentAuthWorkerHandlers({
      firebaseVerifier: {
        verifyAuthorizationHeader: async () => ({ valid: true, uid: 'google-student' }),
      },
      databaseFactory: () => database,
      rateLimit: async () => true,
    });

    const response = await worker.fetch(makeRequest('/auth/student/ensure-id', {
      studentId: 'google-student-7',
    }, { authorization: 'Bearer firebase-id-token' }), makeEnv());

    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({ studentId: 'google-student-7', created: true });
    expect([...database.values.keys()].some((path) => path.startsWith('student_login_ids/'))).toBe(true);
  });

  it('returns a stable client error for malformed JSON requests', async () => {
    const worker = createStudentAuthWorkerHandlers({ rateLimit: async () => true });
    const response = await worker.fetch(new Request('https://worker.example/auth/student/login', {
      method: 'POST',
      headers: { Origin: allowedOrigin, 'Content-Type': 'application/json' },
      body: '{',
    }), makeEnv());

    expect(response.status).toBe(400);
    expect(await readJson(response)).toEqual({ code: 'invalid_request' });
  });

  it('enforces origin allowlisting and rate limits before processing credentials', async () => {
    const databaseFactory = vi.fn(() => createMemoryDatabase());
    const worker = createStudentAuthWorkerHandlers({
      databaseFactory,
      rateLimit: async () => false,
    });

    const denied = await worker.fetch(makeRequest('/auth/student/login', {
      studentId: 'student-7', password: 'password123',
    }, { origin: 'https://attacker.example' }), makeEnv());
    expect(denied.status).toBe(403);

    const limited = await worker.fetch(makeRequest('/auth/student/login', {
      studentId: 'student-7', password: 'password123',
    }), makeEnv());
    expect(limited.status).toBe(429);
    expect(databaseFactory).not.toHaveBeenCalled();
  });
});

\n