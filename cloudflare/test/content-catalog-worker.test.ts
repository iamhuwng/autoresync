import { describe, expect, it, vi } from 'vitest';
import { handleContentCatalogRequest } from '../src/upload-worker/content-catalog/worker';

const catalog = {
  browseChildren: vi.fn(async () => [{
    selection: { kind: 'book', bookId: 'book-1' },
    title: 'Public Book',
    parent: { kind: 'catalog' },
    state: 'metadata-only',
    capabilities: { preview: false, launch: false, sourceAssisted: true },
    readiness: { publication: 'trusted', source: 'blocked', entitlement: 'none' },
    provenance: { adapterId: 'public-reference-v1', adapterVersion: 1 },
  }]),
  resolveSelection: vi.fn(async (_selection, context) => {
    if (context.intent === 'preview' || context.intent === 'launch') {
      throw new Error(`${context.intent}_not_authorized`);
    }
    return { state: 'metadata-only' };
  }),
};

const request = (body: unknown, method = 'POST'): Request => new Request(
  'https://worker.example.test/content-catalog',
  {
    method,
    headers: {
      authorization: 'Bearer token',
      'content-type': 'application/json',
    },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  },
);

const dependencies = (role = 'teacher') => ({
  catalog,
  verifyAuthorizationHeader: vi.fn(async () => ({ valid: true, uid: 'teacher-1' })),
  readUserRole: vi.fn(async () => ({ role })),
});

describe('ContentCatalog Worker boundary', () => {
  it('binds browse to the verified teacher identity and returns bounded safe projection', async () => {
    const deps = dependencies();
    const result = await handleContentCatalogRequest(request({
      action: 'browse',
      container: { kind: 'catalog' },
    }), deps);
    expect(result.status).toBe(200);
    expect(catalog.browseChildren).toHaveBeenCalledWith(
      { kind: 'catalog' },
      { actorId: 'teacher-1', intent: undefined },
    );
    const text = await result.text();
    expect(text).toContain('metadata-only');
    expect(text).not.toMatch(/objectKey|answerKey|credentials|teacherNotes/u);
  });

  it('proves metadata visibility never grants preview or launch entitlement', async () => {
    for (const intent of ['preview', 'launch'] as const) {
      const result = await handleContentCatalogRequest(request({
        action: 'resolve',
        selection: { kind: 'book', bookId: 'book-1' },
        intent,
      }), dependencies());
      expect(result.status).toBe(403);
      await expect(result.json()).resolves.toEqual({ code: `${intent}_not_authorized` });
    }
  });

  it('rejects unauthenticated, non-teacher, wrong-method, and extra-field requests', async () => {
    const unauthenticated = dependencies();
    unauthenticated.verifyAuthorizationHeader.mockResolvedValueOnce({ valid: false });
    expect((await handleContentCatalogRequest(request({
      action: 'browse',
      container: { kind: 'catalog' },
    }), unauthenticated)).status).toBe(401);
    expect((await handleContentCatalogRequest(request({
      action: 'browse',
      container: { kind: 'catalog' },
    }), dependencies('student'))).status).toBe(403);
    expect((await handleContentCatalogRequest(request({}, 'GET'), dependencies())).status).toBe(405);
    expect((await handleContentCatalogRequest(request({
      action: 'browse',
      container: { kind: 'catalog' },
      privateObjectKey: 'forbidden',
    }), dependencies())).status).toBe(400);
  });

  it('redacts unexpected repository errors', async () => {
    catalog.browseChildren.mockRejectedValueOnce(new Error('secret backend detail'));
    const result = await handleContentCatalogRequest(request({
      action: 'browse',
      container: { kind: 'catalog' },
    }), dependencies());
    expect(result.status).toBe(503);
    await expect(result.json()).resolves.toEqual({ code: 'content_catalog_failed' });
  });
});
