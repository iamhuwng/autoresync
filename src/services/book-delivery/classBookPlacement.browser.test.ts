import { describe, expect, it, vi } from 'vitest';
import { createClassBookPlacementBrowserClient } from './classBookPlacement.browser';

describe('#103 Class Book browser consumer', () => {
  it('uses the canonical Worker seam with an ID token and no browser storage write', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { classPlacementId: 'class-placement-1' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    const client = createClassBookPlacementBrowserClient({
      baseUrl: 'https://upload.test/',
      getIdToken: async () => 'id-token-1',
      fetchImpl,
    });
    await expect(client.place({ classId: 'class-1', copyId: 'copy-1' })).resolves.toEqual({ classPlacementId: 'class-placement-1' });
    expect(fetchImpl).toHaveBeenCalledWith('https://upload.test/v1/class-book-placement/place', expect.objectContaining({
      method: 'POST',
      credentials: 'omit',
      redirect: 'error',
      headers: expect.objectContaining({ Authorization: 'Bearer id-token-1' }),
    }));
  });

  it('surfaces the server denial code without accepting an HTML or oversized response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'class_book_locked' }), { status: 403 }));
    const client = createClassBookPlacementBrowserClient({
      baseUrl: 'https://upload.test',
      getIdToken: async () => 'id-token-1',
      fetchImpl,
    });
    await expect(client.sync({ classId: 'class-1' })).rejects.toThrowError('class_book_locked');
  });
});
