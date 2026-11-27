import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createStudentAuthWorkerHandlers } from '../src/upload-worker/student-auth/worker.ts';

const allowedOrigin = 'https://app.hocthem.net';

const createMemoryDatabase = (seed: Record<string, unknown> = {}) => {
  const values = new Map<string, unknown>(Object.entries(seed));
  const revisions = new Map<string, number>();
  const etagFor = (path: string) => `etag:${path}:${revisions.get(path) ?? 0}`;
  const writeValue = (path: string, value: unknown) => {
    revisions.set(path, (revisions.get(path) ?? 0) + 1);
    if (value === null) values.delete(path);
    else values.set(path, value);
  };
  return {
    values,
    readValue: vi.fn(async (path: string) => values.get(path) ?? null),
    readWithEtag: vi.fn(async (path: string) => ({
      data: values.get(path) ?? null,
      etag: etagFor(path),
    })),
    writeIfMatch: vi.fn(async (path: string, value: unknown, etag: string) => {
      if (etag !== etagFor(path)) return false;
      writeValue(path, value);
      return true;
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

const makeGoogleRegistration = (studentId: string) => makeRequest('/auth/student/ensure-id', {
  registerGoogle: true, studentId, firstName: 'New', familyName: 'Student', displayName: 'New Student',
}, { authorization: 'Bearer firebase-id-token' });

const googleIdentity = {
  valid: true, uid: 'google-new', email: 'google@example.com', emailVerified: true, hasGoogleIdentity: true,
};

const makeEmailRegistration = (studentId: string) => makeRequest('/auth/student/register', {
  email: 'student@example.com', password: 'password123', displayName: 'Email Student', studentId,
});

const makeEmailWorker = (database: ReturnType<typeof createMemoryDatabase>, now?: () => number) => (
  createStudentAuthWorkerHandlers({
    databaseFactory: () => database,
    identityToolkit: async () => ({
      ok: true, status: 200, data: { localId: 'email-student', idToken: 'firebase-id-token' },
    }),
    createCustomToken: async () => 'signed-custom-token',
    rateLimit: async () => true,
    now,
  })
);

const loginIndexPaths = (database: ReturnType<typeof createMemoryDatabase>) => (
  [...database.values.keys()].filter((path) => path.startsWith('student_login_ids/'))
);

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

  it('returns success when the profile is saved before the write response is lost', async () => {
    const database = createMemoryDatabase();
    const writeIfMatch = database.writeIfMatch.getMockImplementation()!;
    database.writeIfMatch.mockImplementation(async (path, value, etag) => {
      const saved = await writeIfMatch(path, value, etag);
      if (path === 'users/email-student') throw new Error('profile_response_lost');
      return saved;
    });

    const response = await makeEmailWorker(database).fetch(makeEmailRegistration('committed-7'), makeEnv());

    expect(response.status).toBe(200);
    expect(database.values.get('users/email-student')).toMatchObject({ role: 'student', status: 'active' });
    expect(database.values.get('student_identifiers/email-student')).toMatchObject({ studentId: 'committed-7' });
  });

  it('resumes registration from a confirmed ID after profile creation fails', async () => {
    const database = createMemoryDatabase();
    const writeIfMatch = database.writeIfMatch.getMockImplementation()!;
    database.writeIfMatch.mockImplementation(async (path, value, etag) => {
      if (path === 'users/email-student') throw new Error('profile_write_failed');
      return writeIfMatch(path, value, etag);
    });
    const worker = makeEmailWorker(database);

    const failed = await worker.fetch(makeEmailRegistration('resume-7'), makeEnv());
    expect(failed.status).toBe(503);
    expect(database.values.has('users/email-student')).toBe(false);
    expect(database.values.get('student_identifiers/email-student')).toMatchObject({ studentId: 'resume-7' });

    database.writeIfMatch.mockImplementation(writeIfMatch);
    const different = await worker.fetch(makeEmailRegistration('different-7'), makeEnv());
    expect(await readJson(different)).toEqual({ code: 'student_id_already_assigned' });
    const retry = await worker.fetch(makeEmailRegistration('RESUME-7'), makeEnv());
    expect(retry.status).toBe(200);
    expect(await readJson(retry)).toMatchObject({ studentId: 'resume-7' });
    expect(database.values.get('users/email-student')).toMatchObject({ role: 'student', status: 'active' });
    expect(loginIndexPaths(database)).toHaveLength(1);
  });

  it.each([false, true])('preserves the assigned ID across competing requests (expired claim: %s)', async (expired) => {
    const database = createMemoryDatabase();
    const writeIfMatch = database.writeIfMatch.getMockImplementation()!;
    const started = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    let time = 1_800_000_000_000;
    database.writeIfMatch.mockImplementation(async (path, value, etag) => {
      if (path === 'student_identifiers/email-student' && !database.values.has(path) && time === 1_800_000_000_000) {
        started.resolve();
        await resume.promise;
      }
      return writeIfMatch(path, value, etag);
    });
    const worker = makeEmailWorker(database, () => time);
    const first = worker.fetch(makeEmailRegistration('first-7'), makeEnv());
    await started.promise;
    if (expired) time += 5 * 60 * 1000 + 1;

    const second = await worker.fetch(makeEmailRegistration('second-7'), makeEnv());
    resume.resolve();
    const firstResponse = await first;

    const winner = expired ? 'second-7' : 'first-7';
    expect((expired ? second : firstResponse).status).toBe(200);
    const loser = expired ? firstResponse : second;
    expect(loser.status).toBe(409);
    expect(await readJson(loser)).toEqual({
      code: expired ? 'student_id_already_assigned' : 'registration_in_progress',
    });
    expect(database.values.get('users/email-student')).toMatchObject({ uid: 'email-student', role: 'student' });
    expect(database.values.get('student_identifiers/email-student')).toMatchObject({ studentId: winner });
    expect(loginIndexPaths(database)).toHaveLength(1);
    const later = await worker.fetch(makeEmailRegistration(expired ? 'first-7' : 'second-7'), makeEnv());
    expect(await readJson(later)).toEqual({ code: 'student_id_already_assigned' });
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
    const identityToolkit = vi.fn(async (operation: string, body: Record<string, unknown>) => {
      if (operation === 'accounts:signInWithPassword') {
        return { ok: false, status: 400, data: { error: { message: 'EMAIL_NOT_FOUND' } } };
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
    expect(nextUid).toBe(1);
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

    const request = new Request('https://worker.example/auth/student/ensure-id', {
      method: 'POST',
      headers: { Origin: allowedOrigin, Authorization: 'Bearer firebase-id-token', 'Content-Type': 'application/json' },
      body: '',
    });
    const response = await worker.fetch(request, makeEnv());

    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({ studentId: 'STU-ABCD2345', created: true });
    expect(database.values.get('student_identifiers/google-student')).toMatchObject({ studentId: 'STU-ABCD2345' });
  });

  it('activates a new Google student profile only after the chosen ID is secured', async () => {
    const takenId = 'taken-id';
    const takenIdHash = createHash('sha256').update(takenId).digest('hex');
    const database = createMemoryDatabase({
      [`student_login_ids/${takenIdHash}`]: { uid: 'another-student' },
    });
    const worker = createStudentAuthWorkerHandlers({
      firebaseVerifier: { verifyAuthorizationHeader: async () => googleIdentity },
      databaseFactory: () => database,
      rateLimit: async () => true,
    });
    const submit = (studentId: string) => worker.fetch(makeGoogleRegistration(studentId), makeEnv());

    const duplicate = await submit(takenId);
    expect(duplicate.status).toBe(409);
    expect(await readJson(duplicate)).toEqual({ code: 'student_id_unavailable' });
    expect(database.writeIfMatch).not.toHaveBeenCalled();
    expect(database.values.has('users/google-new')).toBe(false);
    expect(database.values.has('student_identifiers/google-new')).toBe(false);

    const response = await submit('New-Student');
    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({ studentId: 'New-Student', created: true });
    expect(database.writeIfMatch.mock.calls.map(([path]) => path)).toEqual([
      expect.stringMatching(/^student_login_ids\//u), 'student_identifiers/google-new', 'users/google-new',
    ]);
    expect(database.values.get('users/google-new')).toMatchObject({
      uid: 'google-new', email: 'google@example.com', role: 'student', status: 'active',
      firstName: 'New', familyName: 'Student', displayName: 'New Student',
    });
    expect(database.values.get('student_identifiers/google-new')).toMatchObject({
      studentId: 'New-Student', normalizedStudentId: 'new-student',
    });

    const retry = await submit('New-Student');
    expect(retry.status).toBe(200);
    expect(await readJson(retry)).toEqual({ studentId: 'New-Student', created: false });
  });

  it('keeps one chosen ID when two Google registration requests arrive together', async () => {
    const database = createMemoryDatabase();
    const worker = createStudentAuthWorkerHandlers({
      firebaseVerifier: { verifyAuthorizationHeader: async () => googleIdentity },
      databaseFactory: () => database,
      rateLimit: async () => true,
    });
    const responses = await Promise.all([
      worker.fetch(makeGoogleRegistration('choice-1'), makeEnv()),
      worker.fetch(makeGoogleRegistration('choice-2'), makeEnv()),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    const winner = await readJson(responses.find(({ status }) => status === 200)!);
    expect(database.values.get('student_identifiers/google-new')).toMatchObject({ studentId: winner.studentId });
    expect([...database.values.keys()].filter((path) => path.startsWith('student_login_ids/'))).toHaveLength(1);
  });

  it('preserves an administrator profile created during Google registration', async () => {
    const database = createMemoryDatabase();
    const writeIfMatch = database.writeIfMatch.getMockImplementation()!;
    database.writeIfMatch.mockImplementation(async (path, value, etag) => {
      if (path === 'users/google-new') {
        const profileEtag = (await database.readWithEtag(path)).etag;
        await writeIfMatch(path, { role: 'teacher', status: 'active' }, profileEtag);
      }
      return writeIfMatch(path, value, etag);
    });
    const worker = createStudentAuthWorkerHandlers({
      firebaseVerifier: { verifyAuthorizationHeader: async () => googleIdentity },
      databaseFactory: () => database,
      rateLimit: async () => true,
    });

    const response = await worker.fetch(makeGoogleRegistration('new-id'), makeEnv());

    expect(response.status).toBe(403);
    expect(database.values.get('users/google-new')).toEqual({ role: 'teacher', status: 'active' });
  });

  it.each([
    { registerGoogle: false, emailVerified: true, hasGoogleIdentity: true, profile: null },
    { registerGoogle: true, emailVerified: false, hasGoogleIdentity: true, profile: null },
    { registerGoogle: true, emailVerified: true, hasGoogleIdentity: false, profile: null },
    { registerGoogle: true, emailVerified: true, hasGoogleIdentity: true, profile: { role: 'student', status: 'blocked' } },
    { registerGoogle: true, emailVerified: true, hasGoogleIdentity: true, profile: { role: 'teacher', status: 'active' } },
  ])('rejects ineligible Google profile creation %j', async ({ registerGoogle, emailVerified, hasGoogleIdentity, profile }) => {
    const database = createMemoryDatabase(profile ? { 'users/google-new': profile } : {});
    const worker = createStudentAuthWorkerHandlers({
      firebaseVerifier: {
        verifyAuthorizationHeader: async () => ({
          valid: true, uid: 'google-new', email: 'google@example.com', emailVerified, hasGoogleIdentity,
        }),
      },
      databaseFactory: () => database,
      rateLimit: async () => true,
    });
    const response = await worker.fetch(makeRequest('/auth/student/ensure-id', {
      registerGoogle, studentId: 'google-new', firstName: 'New', familyName: 'Student', displayName: 'New Student',
    }, { authorization: 'Bearer firebase-id-token' }), makeEnv());

    expect(response.status).toBe(403);
    expect(await readJson(response)).toEqual({ code: 'account_unavailable' });
    expect(database.writeIfMatch).not.toHaveBeenCalled();
  });

  it('rejects changing an assigned student ID without mutating the profile or identifier', async () => {
    const database = createMemoryDatabase({
      'users/google-student': { uid: 'google-student', role: 'student', status: 'active' },
      'student_identifiers/google-student': { studentId: 'STU-ASSIGNED' },
    });
    const before = [...database.values.entries()];
    const worker = createStudentAuthWorkerHandlers({
      firebaseVerifier: { verifyAuthorizationHeader: async () => ({ valid: true, uid: 'google-student' }) },
      databaseFactory: () => database,
      rateLimit: async () => true,
    });
    const response = await worker.fetch(makeRequest('/auth/student/ensure-id', {
      studentId: 'DIFFERENT-ID', firstName: 'Changed',
    }, { authorization: 'Bearer firebase-id-token' }), makeEnv());
    expect(response.status).toBe(409);
    expect(await readJson(response)).toEqual({ code: 'student_id_already_assigned' });
    expect([...database.values.entries()]).toEqual(before);
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

  it('keeps a committed Google signup when the profile write response is lost', async () => {
    const database = createMemoryDatabase();
    const writeIfMatch = database.writeIfMatch.getMockImplementation()!;
    database.writeIfMatch.mockImplementation(async (path, value, etag) => {
      const saved = await writeIfMatch(path, value, etag);
      if (path === 'users/google-new') throw new Error('network_lost_after_commit');
      return saved;
    });
    const worker = createStudentAuthWorkerHandlers({
      firebaseVerifier: { verifyAuthorizationHeader: async () => googleIdentity },
      databaseFactory: () => database,
      rateLimit: async () => true,
    });

    const response = await worker.fetch(makeGoogleRegistration('google-student-7'), makeEnv());

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

  it('caches CORS preflight responses with Access-Control-Max-Age', async () => {
    const worker = createStudentAuthWorkerHandlers({ rateLimit: async () => true });
    const response = await worker.fetch(new Request('https://worker.example/auth/student/login', {
      method: 'OPTIONS',
      headers: {
        Origin: allowedOrigin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type',
      },
    }), makeEnv());

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Max-Age')).toBe('86400');
  });

  it('reuses cached OAuth tokens and custom-token keys, isolates rotated credentials, and evicts rejected key imports', async () => {
    const generatePem = async () => {
      const pair = await crypto.subtle.generateKey(
        { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
        true,
        ['sign', 'verify'],
      );
      const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
      let binary = '';
      der.forEach((byte) => { binary += String.fromCharCode(byte); });
      const b64 = btoa(binary).match(/.{1,64}/gu)!.join('\n');
      return `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----`;
    };

    const [pemA, pemB] = await Promise.all([generatePem(), generatePem()]);
    const studentHash = createHash('sha256').update('student-7').digest('hex');
    let oauthCalls = 0;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === 'https://oauth2.googleapis.com/token') {
        oauthCalls += 1;
        return new Response(JSON.stringify({ access_token: `oauth-token-${oauthCalls}`, expires_in: 3600 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes(`/student_login_ids/${studentHash}.json`)) {
        return new Response(JSON.stringify({ uid: 'student-uid' }), { status: 200 });
      }
      if (url.includes('/users/student-uid.json')) {
        return new Response(JSON.stringify({
          uid: 'student-uid', email: 'student@example.com', role: 'student', status: 'active',
        }), { status: 200 });
      }
      if (url.includes('/student_identifiers/student-uid.json')) {
        return new Response(JSON.stringify({ studentId: 'student-7' }), { status: 200 });
      }
      if (url.includes('accounts:signInWithPassword')) {
        return new Response(JSON.stringify({ localId: 'student-uid', email: 'student@example.com' }), { status: 200 });
      }
      return new Response('null', { status: 404 });
    });

    const worker = createStudentAuthWorkerHandlers({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      rateLimit: async () => true,
      now: () => 1_800_000_000_000,
    });

    const envA = {
      ...makeEnv(),
      BOOK_HOMEWORK_GOOGLE_SA_KEY: JSON.stringify({
        client_email: makeEnv().BOOK_HOMEWORK_SERVICE_IDENTITY,
        private_key: pemA,
      }),
    };
    const envB = {
      ...makeEnv(),
      BOOK_HOMEWORK_GOOGLE_SA_KEY: JSON.stringify({
        client_email: makeEnv().BOOK_HOMEWORK_SERVICE_IDENTITY,
        private_key: pemB,
      }),
    };
    const envBadKey = {
      ...makeEnv(),
      BOOK_HOMEWORK_GOOGLE_SA_KEY: JSON.stringify({
        client_email: makeEnv().BOOK_HOMEWORK_SERVICE_IDENTITY,
        private_key: 'not-a-valid-pem-key',
      }),
    };

    const first = await worker.fetch(makeRequest('/auth/student/login', { studentId: 'student-7', password: 'password123' }), envA);
    const second = await worker.fetch(makeRequest('/auth/student/login', { studentId: 'student-7', password: 'password123' }), envA);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(typeof (await readJson(first)).customToken).toBe('string');
    expect(typeof (await readJson(second)).customToken).toBe('string');
    expect(oauthCalls).toBe(1);

    const rotated = await worker.fetch(makeRequest('/auth/student/login', { studentId: 'student-7', password: 'password123' }), envB);
    expect(rotated.status).toBe(200);
    expect(oauthCalls).toBe(2);

    const bad = await worker.fetch(makeRequest('/auth/student/login', { studentId: 'student-7', password: 'password123' }), envBadKey);
    expect(bad.status).toBe(503);
    const recovered = await worker.fetch(makeRequest('/auth/student/login', { studentId: 'student-7', password: 'password123' }), envA);
    expect(recovered.status).toBe(200);
    expect(oauthCalls).toBe(2);
  });
});
