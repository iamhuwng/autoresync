import { describe, expect, it, vi } from 'vitest';
import { exportPKCS8, generateKeyPair, jwtVerify } from 'jose';
import { createCourseBookAuthority102TokenProvider, FirebaseRtdbRestClient } from '../src/upload-worker/listening-authoring/rtdb.ts';

describe('FirebaseRtdbRestClient multi-location patch', () => {
  it('uses one scoped Firebase Auth PATCH without a root read or admin bearer token', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    const client = new FirebaseRtdbRestClient({
      env: { FIREBASE_DB_URL: 'https://database.example.test' },
      fetchImpl: fetchImpl as typeof fetch,
      getAccessToken: async () => 'scoped-id-token',
      firebaseAuthToken: true,
    });
    await client.patchMultiLocation([
      { path: 'course_enrollments/legacy-1', value: { revision: 2 } },
      { path: 'course_book_authority/enrollments/course-1/student-1', value: { revision: 2 } },
      { path: 'course_book_authority/operations/op-1', value: { status: 'committed' } },
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe('https://database.example.test/.json?auth=scoped-id-token');
    expect(init).toMatchObject({ method: 'PATCH', headers: { 'Content-Type': 'application/json' } });
    expect(init?.headers).not.toHaveProperty('Authorization');
    expect(JSON.parse(String(init?.body))).toEqual({
      'course_enrollments/legacy-1': { revision: 2 },
      'course_book_authority/enrollments/course-1/student-1': { revision: 2 },
      'course_book_authority/operations/op-1': { status: 'committed' },
    });
  });

  it('fails closed for non-Firebase auth, conflicts, transport uncertainty, and overlapping paths', async () => {
    const updates = [{ path: 'a/one', value: 1 }, { path: 'b/two', value: 2 }];
    const noScope = new FirebaseRtdbRestClient({ env: { FIREBASE_DB_URL: 'https://database.example.test' }, fetchImpl: vi.fn() as typeof fetch, getAccessToken: async () => 'token' });
    await expect(noScope.patchMultiLocation(updates)).rejects.toThrow('firebase_rtdb_multi_location_patch_requires_firebase_auth_token');
    const conflict = new FirebaseRtdbRestClient({ env: { FIREBASE_DB_URL: 'https://database.example.test' }, fetchImpl: vi.fn(async () => new Response('', { status: 403 })) as typeof fetch, getAccessToken: async () => 'token', firebaseAuthToken: true });
    await expect(conflict.patchMultiLocation(updates)).rejects.toThrow('firebase_rtdb_multi_location_patch_failed:403');
    const transport = new FirebaseRtdbRestClient({ env: { FIREBASE_DB_URL: 'https://database.example.test' }, fetchImpl: vi.fn(async () => { throw new Error('network'); }) as typeof fetch, getAccessToken: async () => 'token', firebaseAuthToken: true });
    await expect(transport.patchMultiLocation(updates)).rejects.toThrow('firebase_rtdb_multi_location_patch_transport_failed');
    await expect(conflict.patchMultiLocation([{ path: 'a', value: 1 }, { path: 'a/b', value: 2 }])).rejects.toThrow('firebase_rtdb_multi_location_patch_invalid');
  });

  it('uses an exact short-lived exchanged #102 claim token for a root patch and never the OAuth token', async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
    const privateKeyPem = await exportPKCS8(privateKey);
    let customToken = '';
    const exchange = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      customToken = String(JSON.parse(String(init?.body)).token);
      return Response.json({ idToken: 'course-102-scoped-id-token', expiresIn: '300' });
    });
    const claims = { operation: 'enrollment-transition' as const, actorUid: 'teacher-001', courseId: 'course-001', studentId: 'student-001', legacyEnrollmentId: 'legacy-001', expectedLegacyRevision: 1, expectedAuthorityRevision: 0, operationId: '00000000-0000-4000-8000-000000000102' };
    const tokenFor = createCourseBookAuthority102TokenProvider({ env: { FIREBASE_WEB_API_KEY: 'api-key', GOOGLE_SA_KEY: JSON.stringify({ client_email: 'course-102@example.test', private_key: privateKeyPem }) }, fetchImpl: exchange as typeof fetch, now: () => 1_784_000_000_000 });
    expect(await tokenFor(claims)).toBe('course-102-scoped-id-token');
    expect(await tokenFor(claims)).toBe('course-102-scoped-id-token');
    expect(exchange).toHaveBeenCalledTimes(1);
    const verified = await jwtVerify(customToken, publicKey, { issuer: 'course-102@example.test', subject: 'course-102@example.test', audience: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit', algorithms: ['RS256'], currentDate: new Date(1_784_000_000_000) });
    expect(verified.payload).toMatchObject({ uid: 'course-book-authority-102:00000000-0000-4000-8000-000000000102', claims: { courseBookAuthority102: true, ...claims } });
    const patch = vi.fn(async () => new Response('{}'));
    const client = new FirebaseRtdbRestClient({ env: { FIREBASE_DB_URL: 'https://database.example.test' }, fetchImpl: patch as typeof fetch, getAccessToken: async () => 'oauth-admin-token', getFirebaseAuthToken: () => tokenFor(claims), firebaseAuthToken: true });
    await client.patchMultiLocation([{ path: 'a/one', value: 1 }, { path: 'b/two', value: 2 }]);
    expect(String(patch.mock.calls[0]![0])).toContain('?auth=course-102-scoped-id-token');
    expect(String(patch.mock.calls[0]![0])).not.toContain('oauth-admin-token');
  });

  it('rejects a malformed claim set before token exchange', async () => {
    const exchange = vi.fn();
    const tokenFor = createCourseBookAuthority102TokenProvider({ env: { FIREBASE_WEB_API_KEY: 'api-key', GOOGLE_SA_KEY: '{}' }, fetchImpl: exchange as typeof fetch });
    await expect(tokenFor({ operation: 'enrollment-transition', actorUid: 'teacher-001', courseId: 'course-001', studentId: 'student-001', legacyEnrollmentId: 'legacy-001', expectedLegacyRevision: 0, expectedAuthorityRevision: 0, operationId: 'not-an-operation' })).rejects.toThrow('invalid_course_book_authority_102_claims');
    expect(exchange).not.toHaveBeenCalled();
  });
});
