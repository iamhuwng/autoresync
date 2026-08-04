import { describe, expect, it, vi } from 'vitest';
import { FirebaseRtdbRestClient } from '../src/upload-worker/listening-authoring/rtdb.ts';

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
});
