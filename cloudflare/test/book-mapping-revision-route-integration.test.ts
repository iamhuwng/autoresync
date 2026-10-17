import { describe, expect, it, vi } from 'vitest';
import { createBookRouteHandlers } from '../src/upload-worker/book-route-handlers.ts';

const descriptor = {
  method: 'POST',
  pathTemplate: '/book-assembly/mapping-revisions',
} as never;

describe('Ticket 18 mapping-revision route composition', () => {
  it('binds the trusted mapping Worker through its canonical handler namespace', async () => {
    const publish = vi.fn(async (input: unknown) => ({ action: 'publish', input }));
    const handlers = createBookRouteHandlers({ assemblyMappingRevisionHandlers: { publish } });
    const result = await handlers['bookAssemblyMappingRevision.publish']!({
      request: new Request('https://worker.test/book-assembly/mapping-revisions', { method: 'POST' }),
      env: {},
      uid: 'teacher-1',
      params: {},
      descriptor,
    });

    expect(result).toMatchObject({ action: 'publish' });
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({
      uid: 'teacher-1',
      request: expect.any(Request),
    }));
  });

  it('fails closed when no trusted mapping Worker is injected', async () => {
    const handlers = createBookRouteHandlers();
    expect(handlers['bookAssemblyMappingRevision.publish']).toBeUndefined();
  });
});
