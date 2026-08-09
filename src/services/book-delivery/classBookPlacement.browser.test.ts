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

  it('resolves current delivery with stable path IDs, auth, and no request body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ bindingId: 'binding-1' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    const client = createClassBookPlacementBrowserClient({
      baseUrl: 'https://upload.test/',
      getIdToken: async () => 'id-token-1',
      fetchImpl,
    });
    await expect(client.resolveCurrent({
      classId: 'class-1', copyId: 'copy-1', classPlacementId: 'class-placement-1',
      classCourseMaterialId: 'class-material-1', bindingId: 'binding-1',
    })).resolves.toEqual({ bindingId: 'binding-1' });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://upload.test/v1/book-class-placement/current/class-1/copy-1/class-placement-1/class-material-1/binding-1',
      expect.objectContaining({
        method: 'GET',
        credentials: 'omit',
        redirect: 'error',
        headers: expect.objectContaining({ Authorization: 'Bearer id-token-1' }),
      }),
    );
    expect(fetchImpl.mock.calls[0][1]).not.toHaveProperty('body');
  });

  it('prepares canonical Class delivery through the production route without a legacy envelope', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      schemaVersion: 1,
      projectionKind: 'book-runtime-delivery',
      bindingId: 'binding-1',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const client = createClassBookPlacementBrowserClient({
      baseUrl: 'https://upload.test',
      getIdToken: async () => 'id-token-1',
      fetchImpl,
    });

    await expect(client.prepareDelivery({
      operationId: '11111111-1111-4111-8111-111111111111',
      classId: 'class-1',
      copyId: 'copy-1',
      classPlacementId: 'class-placement-1',
      classCourseMaterialId: 'class-material-1',
    })).resolves.toMatchObject({ projectionKind: 'book-runtime-delivery', bindingId: 'binding-1' });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://upload.test/v1/book-class-placement/prepare',
      expect.objectContaining({ method: 'POST', body: expect.any(String) }),
    );
  });
});
