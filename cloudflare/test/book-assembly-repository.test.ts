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

  it('rejects broad and malformed authority paths', async () => {
    const repository = new FirebaseRestBookAssemblyRepository({
      env,
      fetchImpl: async () => new Response('null', { status: 200, headers: { etag: '"0"' } }),
      getAccessToken: async () => 'test-token',
    });
    await expect(repository.readValue('book_assembly/books/book-1'))
      .rejects.toThrow('book_assembly_path_forbidden');
    await expect(repository.readScope('../book-1', 'unit-1'))
      .rejects.toThrow('invalid_book_assembly_book_id');
  });
});
