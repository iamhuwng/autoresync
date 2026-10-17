import { afterEach, describe, expect, it, vi } from 'vitest';
const dependencies = vi.hoisted(() => ({ readScope: vi.fn(), refresh: vi.fn() }));
vi.mock('../src/upload-worker/book-assembly/publication-repository.ts', () => ({ FirebaseRestBookAssemblyPublicationRepository: class { readScope = dependencies.readScope; } }));
vi.mock('../src/upload-worker/book-public/readiness-producer.ts', () => ({ createPublicBookReadinessProducer: () => ({ refresh: dependencies.refresh }) }));
import { createPublicBookReadinessRefreshHandlers } from '../src/upload-worker/book-public/readiness-refresh.ts';
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('moderation readiness refresh actor boundary', () => {
  it('derives owner/current publication for admin and denies inactive or unrelated teacher actors', async () => {
    let profile = { role: 'super_admin', status: 'active' };
    let readiness: unknown = null;
    const current = { publicationId: 'publication-1', publicationRevision: 1 };
    dependencies.readScope.mockResolvedValue({ current });
    dependencies.refresh.mockImplementation(async () => { readiness = current; });
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toContain('auth=actor-token');
      expect(init?.method ?? 'GET').toBe('GET');
      const url = String(input);
      if (url.includes('/users/')) return Response.json(profile);
      if (url.includes('/material_catalog/books/')) return Response.json({ bookId: 'book-1', ownerId: 'teacher-1', visibility: 'public-library-published', status: 'ready' });
      if (url.includes('/public_book_readiness/')) return Response.json(readiness);
      throw new Error(`unexpected_refresh_read:${url}`);
    });
    const handlers = createPublicBookReadinessRefreshHandlers();
    const invalid = await handlers.refreshReadiness({ request: new Request('https://worker.test', { method: 'POST', headers: { authorization: 'Bearer actor-token' }, body: '{}' }),
      env: { FIREBASE_DB_URL: 'https://database.test' }, uid: 'admin-1', bookId: '../books' });
    expect(invalid).toMatchObject({ init: { status: 400 }, body: { code: 'public_book_request_invalid' } });
    const invalidActor = await handlers.refreshReadiness({ request: new Request('https://worker.test', { method: 'POST', headers: { authorization: 'Bearer actor-token' }, body: '{}' }),
      env: { FIREBASE_DB_URL: 'https://database.test' }, uid: '../users', bookId: 'book-1' });
    expect(invalidActor).toMatchObject({ init: { status: 400 }, body: { code: 'public_book_request_invalid' } });
    const invoke = (body = '{}') => handlers.refreshReadiness({ request: new Request('https://worker.test', { method: 'POST', headers: { authorization: 'Bearer actor-token' }, body }),
      env: { FIREBASE_DB_URL: 'https://database.test' }, uid: 'admin-1', bookId: 'book-1' });
    expect((await invoke()).init.status).toBe(200);
    expect(dependencies.refresh).toHaveBeenCalledWith('book-1', { current });
    profile = { role: 'teacher', status: 'active' };
    expect((await invoke()).init.status).toBe(403);
    profile = { role: 'super_admin', status: 'inactive' };
    expect((await invoke()).init.status).toBe(403);
    expect(dependencies.refresh).toHaveBeenCalledTimes(1);
    profile = { role: 'super_admin', status: 'active' };
    expect((await invoke('{"ownerId":"other"}')).init.status).toBe(400);
    dependencies.refresh.mockRejectedValue(new Error('source absent'));
    expect((await invoke()).init.status).toBe(503);
  });
});
