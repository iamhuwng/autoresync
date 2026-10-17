import { describe, expect, it, vi } from 'vitest';
import { createUploadWorker } from '../worker.js';

describe('native Worker entrypoint lifecycle context', () => {
  it('passes the native context unchanged to the canonical Book router', async () => {
    const executionContext = { waitUntil: vi.fn() } as unknown as ExecutionContext;
    const fetch = vi.fn(async (
      _request: Request,
      _env: Record<string, unknown>,
      receivedContext?: ExecutionContext,
    ) => {
      expect(receivedContext).toBe(executionContext);
      return new Response('book');
    });
    const worker = createUploadWorker({ bookRouter: { fetch } });

    const response = await worker.fetch(
      new Request('https://book.example/v1/book-source/books/book-1/upload/reservation-1/complete'),
      {},
      executionContext,
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('book');
    expect(fetch).toHaveBeenCalledOnce();
  });
});
