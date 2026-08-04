import { describe, expect, it, vi } from 'vitest';
import { createBookRouteHandlers } from '../src/upload-worker/book-route-handlers.ts';

const descriptor = {
  method: 'POST',
  pathTemplate: '/book-assembly/source-strategy-successors',
} as never;

describe('Ticket 20C source-strategy successor route composition', () => {
  it('binds the trusted successor Worker through its canonical handler namespace', async () => {
    const publish = vi.fn(async (input: unknown) => ({ action: 'publish', input }));
    const handlers = createBookRouteHandlers({ assemblySuccessorHandlers: { publish } });
    const result = await handlers['bookAssemblySuccessor.publish']!({
      request: new Request('https://worker.test/book-assembly/source-strategy-successors', { method: 'POST' }),
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

  it('fails closed when no trusted successor Worker is injected', async () => {
    const handlers = createBookRouteHandlers();
    expect(handlers['bookAssemblySuccessor.publish']).toBeUndefined();
  });
});
