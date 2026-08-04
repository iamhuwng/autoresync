import { describe, expect, it, vi } from 'vitest';
import { exportPKCS8, generateKeyPair, jwtVerify } from 'jose';
import {
  createCourseBookAuthority102TokenProvider,
  FirebaseRtdbRestClient,
  type CourseBookAuthority102EnrollmentClaims,
  type CourseBookAuthority102ReleaseClaims,
} from '../src/upload-worker/listening-authoring/rtdb.ts';

const enrollmentClaims: CourseBookAuthority102EnrollmentClaims = {
  operation: 'enrollment-transition',
  actorUid: 'teacher-001',
  courseId: 'course-001',
  studentId: 'student-001',
  legacyEnrollmentId: 'legacy-001',
  expectedLegacyRevision: 1,
  expectedAuthorityRevision: 0,
  operationId: '00000000-0000-4000-8000-000000000102',
};

const releaseClaims: CourseBookAuthority102ReleaseClaims = {
  operation: 'release-transition',
  actorUid: 'teacher-001',
  courseId: 'course-001',
  moduleId: 'module-001',
  studentId: 'student-001',
  expectedReleaseRevision: 0,
  operationId: '00000000-0000-4000-8000-000000000103',
};

describe('FirebaseRtdbRestClient multi-location patch', () => {
  it('uses one scoped Firebase Auth PATCH at the root', async () => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response('{}', { status: 200 }));
    const client = new FirebaseRtdbRestClient({
      env: { FIREBASE_DB_URL: 'https://database.example.test' },
      fetchImpl: fetchImpl as typeof fetch,
      getAccessToken: vi.fn(async () => 'oauth-token-that-must-not-be-used'),
      getFirebaseAuthToken: async () => 'scoped-id-token',
      firebaseAuthToken: true,
    });
    await client.patchMultiLocation([
      { path: 'course_book_authority/releases/course-1/module-1/student-1', value: { revision: 1 } },
      { path: 'course_book_authority/operations/op-1', value: { operation: 'release-transition' } },
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe('https://database.example.test/.json?auth=scoped-id-token');
    expect(init).toMatchObject({ method: 'PATCH', headers: { 'Content-Type': 'application/json' } });
    expect(init?.headers).not.toHaveProperty('Authorization');
    expect(JSON.parse(String(init?.body))).toEqual({
      'course_book_authority/releases/course-1/module-1/student-1': { revision: 1 },
      'course_book_authority/operations/op-1': { operation: 'release-transition' },
    });
  });

  it('fails closed for non-scoped auth, failed PATCHes, transport uncertainty, and overlapping paths', async () => {
    const updates = [{ path: 'a/one', value: 1 }, { path: 'b/two', value: 2 }];
    const noScope = new FirebaseRtdbRestClient({
      env: { FIREBASE_DB_URL: 'https://database.example.test' },
      fetchImpl: vi.fn() as typeof fetch,
      getAccessToken: async () => 'oauth-token',
    });
    await expect(noScope.patchMultiLocation(updates))
      .rejects.toThrow('firebase_rtdb_multi_location_patch_requires_firebase_auth_token');

    const failed = new FirebaseRtdbRestClient({
      env: { FIREBASE_DB_URL: 'https://database.example.test' },
      fetchImpl: vi.fn(async () => new Response('', { status: 403 })) as typeof fetch,
      getFirebaseAuthToken: async () => 'scoped-token',
      firebaseAuthToken: true,
    });
    await expect(failed.patchMultiLocation(updates))
      .rejects.toThrow('firebase_rtdb_multi_location_patch_failed:403');

    const transport = new FirebaseRtdbRestClient({
      env: { FIREBASE_DB_URL: 'https://database.example.test' },
      fetchImpl: vi.fn(async () => { throw new Error('network'); }) as typeof fetch,
      getFirebaseAuthToken: async () => 'scoped-token',
      firebaseAuthToken: true,
    });
    await expect(transport.patchMultiLocation(updates))
      .rejects.toThrow('firebase_rtdb_multi_location_patch_transport_failed');
    await expect(failed.patchMultiLocation([{ path: 'a', value: 1 }, { path: 'a/b', value: 2 }]))
      .rejects.toThrow('firebase_rtdb_multi_location_patch_invalid');
  });

  it('mints exact discriminated enrollment and release claims with separate cache entries', async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
    const privateKeyPem = await exportPKCS8(privateKey);
    const customTokens: string[] = [];
    const exchange = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      customTokens.push(String(JSON.parse(String(init?.body)).token));
      return Response.json({ idToken: 'course-102-scoped-id-token', expiresIn: '300' });
    });
    const tokenFor = createCourseBookAuthority102TokenProvider({
      env: {
        FIREBASE_WEB_API_KEY: 'api-key',
        GOOGLE_SA_KEY: JSON.stringify({ client_email: 'course-102@example.test', private_key: privateKeyPem }),
      },
      fetchImpl: exchange as typeof fetch,
      now: () => 1_784_000_000_000,
    });

    expect(await tokenFor(enrollmentClaims)).toBe('course-102-scoped-id-token');
    expect(await tokenFor(enrollmentClaims)).toBe('course-102-scoped-id-token');
    expect(await tokenFor(releaseClaims)).toBe('course-102-scoped-id-token');
    expect(exchange).toHaveBeenCalledTimes(2);

    const verified = await jwtVerify(customTokens[1]!, publicKey, {
      issuer: 'course-102@example.test',
      subject: 'course-102@example.test',
      audience: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
      algorithms: ['RS256'],
      currentDate: new Date(1_784_000_000_000),
    });
    expect(verified.payload).toMatchObject({
      uid: `course-book-authority-102:${releaseClaims.operationId}`,
      claims: { courseBookAuthority102: true, ...releaseClaims },
    });
    expect(Object.keys(verified.payload.claims as object).sort()).toEqual([
      'actorUid', 'courseBookAuthority102', 'courseId', 'expectedReleaseRevision',
      'moduleId', 'operation', 'operationId', 'studentId',
    ]);
  });

  it('rejects malformed or extra claims before token exchange', async () => {
    const exchange = vi.fn();
    const tokenFor = createCourseBookAuthority102TokenProvider({
      env: { FIREBASE_WEB_API_KEY: 'api-key', GOOGLE_SA_KEY: '{}' },
      fetchImpl: exchange as typeof fetch,
    });
    await expect(tokenFor({
      ...releaseClaims,
      moduleId: undefined,
    } as never)).rejects.toThrow('invalid_course_book_authority_102_claims');
    await expect(tokenFor({
      ...enrollmentClaims,
      unexpected: true,
    } as never)).rejects.toThrow('invalid_course_book_authority_102_claims');
    expect(exchange).not.toHaveBeenCalled();
  });
});
