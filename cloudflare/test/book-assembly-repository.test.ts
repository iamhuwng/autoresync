import { describe, expect, it } from 'vitest';
import { FirebaseRestBookAssemblyRepository } from '../src/upload-worker/book-assembly/repository';

const env = {
  FIREBASE_DB_URL: 'https://firebase.test',
  BOOK_ASSEMBLY_SERVICE_IDENTITY: 'book-assembly@example.iam.gserviceaccount.com',
} as const;

describe('Book Assembly Firebase repository', () => {
  it('uses one Book/Unit scope path and retries only scoped ETag CAS', async () => {
    const calls: string[] = [];
    let writes = 0;
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      const path = decodeURIComponent(url.pathname.replace(/^\/+|\.json$/gu, ''));
      calls.push(`${init?.method ?? 'GET'} ${path}`);
      if ((init?.method ?? 'GET') === 'GET') {
        return new Response('null', { status: 200, headers: { etag: '"scope-etag"' } });
      }
      writes += 1;
      if (writes === 1) return new Response('', { status: 412 });
      return new Response('{}', { status: 200 });
    };
    const repository = new FirebaseRestBookAssemblyRepository({
      env,
      ownerId: 'teacher-1',
      fetchImpl,
      getAccessToken: async () => 'test-token',
    });

    expect(await repository.readScope('book-1', 'unit-1')).toEqual({});
    expect(await repository.transaction('book-1', 'unit-1', () => ({
      outcome: 'saved',
      next: {},
      write: true,
    }))).toBe('saved');
    expect(calls).toEqual([
      'GET book_assembly/books/book-1/units/unit-1',
      'GET book_assembly/books/book-1/units/unit-1',
      'PUT book_assembly/books/book-1/units/unit-1',
      'GET book_assembly/books/book-1/units/unit-1',
      'PUT book_assembly/books/book-1/units/unit-1',
    ]);
    expect(calls.some((call) => call === 'GET book_assembly')).toBe(false);
    expect(calls.some((call) => call.includes('/users/'))).toBe(false);
  });

  it('hydrates RTDB-omitted null parents and empty validation errors for revision updates and replay receipts', async () => {
    const candidate = {
      candidateId: 'candidate-1',
      ownerId: 'teacher-1',
      bookId: 'book-1',
      bookRevision: 1,
      sourceSetRevision: 1,
      unitKey: 'unit-1',
      revision: 1,
      lifecycle: 'draft',
      manifest: {
        bookId: 'book-1',
        sourceSet: {
          sourceStrategy: 'full_pdf',
          sources: [{ sourceKey: 'full', sourceVersionId: 'version-1', sourceOrder: 1 }],
        },
        nodes: [{ nodeKey: 'unit-1', nodeType: 'unit', order: 1 }],
        units: [{
          unitKey: 'unit-1',
          activitySlots: [{
            activityKey: 'activity-1',
            order: 1,
            contextRequirement: 'optional',
            pageGroupKeys: ['group-1'],
          }],
          pageGroups: [{
            pageGroupKey: 'group-1',
            sourceKey: 'full',
            pages: [1],
            activityKeys: ['activity-1'],
            mode: 'activity',
            defaultPhysicalPageNumber: 1,
          }],
        }],
      },
      validation: { valid: true },
      updatedAt: '2026-08-13T00:00:00.000Z',
    };
    const operationId = '00000000-0000-4000-8000-000000000201';
    const wireScope = {
      candidates: { 'candidate-1': candidate },
      operations: {
        [operationId]: {
          ownerId: 'teacher-1',
          fingerprint: 'fingerprint-1',
          createdAt: '2026-08-13T00:00:00.000Z',
          result: {
            status: 'created',
            candidate,
            receipt: {
              operationId,
              fingerprint: 'fingerprint-1',
              status: 'created',
              candidateId: 'candidate-1',
              candidateRevision: 1,
              createdAt: '2026-08-13T00:00:00.000Z',
            },
          },
        },
      },
      current: {
        candidateId: 'candidate-1',
        candidateRevision: 1,
        bookRevision: 1,
        sourceSetRevision: 1,
        updatedAt: '2026-08-13T00:00:00.000Z',
      },
    };
    const requests: Array<{ method: string; body: unknown }> = [];
    const repository = new FirebaseRestBookAssemblyRepository({
      env,
      ownerId: 'teacher-1',
      fetchImpl: async (_input, init) => {
        const method = String(init?.method ?? 'GET');
        if (method === 'GET') {
          return new Response(JSON.stringify(wireScope), {
            status: 200,
            headers: { etag: '"scope-etag"' },
          });
        }
        requests.push({ method, body: JSON.parse(String(init?.body ?? 'null')) });
        return new Response('{}', { status: 200 });
      },
      getAccessToken: async () => 'test-token',
    });

    const scope = await repository.readScope('book-1', 'unit-1');
    expect(scope.candidates?.['candidate-1']?.manifest?.nodes[0]?.parentNodeKey).toBeNull();
    expect(scope.candidates?.['candidate-1']?.validation.errors).toEqual([]);
    expect(scope.operations?.[operationId]?.result.candidate?.manifest?.nodes[0]?.parentNodeKey)
      .toBeNull();
    expect(scope.operations?.[operationId]?.result.candidate?.validation.errors).toEqual([]);

    await expect(repository.transaction('book-1', 'unit-1', (current) => {
      const currentCandidate = current.candidates?.['candidate-1'];
      if (!currentCandidate) throw new Error('candidate_missing_in_test');
      const nextCandidate = { ...currentCandidate, revision: 2 };
      return {
        outcome: nextCandidate.revision,
        write: true,
        next: {
          ...current,
          candidates: { 'candidate-1': nextCandidate },
          current: { ...current.current!, candidateRevision: 2 },
        },
      };
    })).resolves.toBe(2);
    expect(requests).toHaveLength(1);
    expect((requests[0]!.body as { candidates: Record<string, { revision: number }> })
      .candidates['candidate-1']!.revision).toBe(2);
  });

  it('rejects broad and malformed authority paths', async () => {
    const repository = new FirebaseRestBookAssemblyRepository({
      env,
      ownerId: 'teacher-1',
      fetchImpl: async () => new Response('null', { status: 200, headers: { etag: '"0"' } }),
      getAccessToken: async () => 'test-token',
    });
    await expect(repository.readValue('book_assembly/books/book-1'))
      .rejects.toThrow('book_assembly_path_forbidden');
    await expect(repository.readValue('users/teacher-2'))
      .rejects.toThrow('book_assembly_path_forbidden');
    await expect(repository.readScope('../book-1', 'unit-1'))
      .rejects.toThrow('invalid_book_assembly_book_id');
  });

  it('uses an exact Firebase ID-token scope and never sends an OAuth bearer token', async () => {
    const authRequests: string[] = [];
    const requests: Array<{ url: string; authorization: string | null }> = [];
    const repository = new FirebaseRestBookAssemblyRepository({
      env: { ...env, FIREBASE_WEB_API_KEY: 'web-key' },
      ownerId: 'teacher-1',
      getFirebaseAuthToken: async (request = { path: '' }) => {
        authRequests.push(request.path);
        return 'firebase-id-token-for-book-1-unit-1';
      },
      fetchImpl: async (input, init) => {
        const url = new URL(String(input));
        requests.push({ url: String(url), authorization: init?.headers instanceof Headers
          ? init.headers.get('authorization')
          : null });
        return new Response('null', { status: 200, headers: { etag: '"scope-etag"' } });
      },
    });

    await expect(repository.readScope('book-1', 'unit-1')).resolves.toEqual({});
    expect(authRequests).toEqual(['book_assembly/books/book-1/units/unit-1']);
    expect(requests).toHaveLength(1);
    expect(new URL(requests[0]!.url).searchParams.get('auth'))
      .toBe('firebase-id-token-for-book-1-unit-1');
    expect(requests[0]!.authorization).toBeNull();
  });

  it('uses the owner-profile token only for users reads and the Book/Unit token for a same-scope GET to PUT', async () => {
    const authRequests: string[] = [];
    const requests: Array<{ method: string; path: string; token: string | null; authorization: string | null }> = [];
    const repository = new FirebaseRestBookAssemblyRepository({
      env: { ...env, FIREBASE_WEB_API_KEY: 'web-key' },
      ownerId: 'teacher-1',
      getFirebaseAuthToken: async (request = { path: '' }) => {
        authRequests.push(request.path);
        return request.path === 'users/teacher-1'
          ? 'firebase-id-token-owner-profile'
          : 'firebase-id-token-book-1-unit-1';
      },
      fetchImpl: async (input, init) => {
        const url = new URL(String(input));
        const path = decodeURIComponent(url.pathname.replace(/^\/+|\.json$/gu, ''));
        requests.push({
          method: String(init?.method ?? 'GET'), path,
          token: url.searchParams.get('auth'),
          authorization: new Headers(init?.headers).get('authorization'),
        });
        if ((init?.method ?? 'GET') === 'GET') {
          return new Response(path === 'users/teacher-1'
            ? JSON.stringify({ role: 'teacher', status: 'active' })
            : 'null', { status: 200, headers: { etag: '"scope-etag"' } });
        }
        return new Response('{}', { status: 200 });
      },
    });

    await expect(repository.readValue('users/teacher-1')).resolves.toMatchObject({ role: 'teacher' });
    await expect(repository.transaction('book-1', 'unit-1', () => ({
      outcome: 'saved', next: {}, write: true,
    }))).resolves.toBe('saved');

    expect(authRequests).toEqual([
      'users/teacher-1',
      'book_assembly/books/book-1/units/unit-1',
      'book_assembly/books/book-1/units/unit-1',
    ]);
    expect(requests).toEqual([
      {
        method: 'GET', path: 'users/teacher-1', token: 'firebase-id-token-owner-profile', authorization: null,
      },
      {
        method: 'GET', path: 'book_assembly/books/book-1/units/unit-1', token: 'firebase-id-token-book-1-unit-1', authorization: null,
      },
      {
        method: 'PUT', path: 'book_assembly/books/book-1/units/unit-1', token: 'firebase-id-token-book-1-unit-1', authorization: null,
      },
    ]);
  });

  it('fails closed when production credentials have no server-authenticated owner context', () => {
    expect(() => new FirebaseRestBookAssemblyRepository({
      env: {
        ...env,
        FIREBASE_PROJECT_ID: 'project-1',
        FIREBASE_WEB_API_KEY: 'web-key',
        BOOK_ASSEMBLY_GOOGLE_SA_KEY: JSON.stringify({
          client_email: env.BOOK_ASSEMBLY_SERVICE_IDENTITY,
          private_key: 'not-used',
        }),
      },
    })).toThrow('missing_book_assembly_owner_context');
  });
});
