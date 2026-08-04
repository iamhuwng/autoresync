import { describe, expect, it, vi } from 'vitest';
import { createUploadWorker } from '../worker.js';

const createTestUploadWorker = createUploadWorker as unknown as (options?: Record<string, unknown>) => {
  fetch: (request: Request, env: Record<string, unknown>) => Promise<Response>;
};

describe('PRD0062 #59 canonical top-level composition', () => {
  it('delegates Book paths before the legacy upload/listening dispatcher', async () => {
    const fetch = vi.fn(async () => new Response('book-route', {
      status: 202,
      headers: { 'x-book-router': '1' },
    }));
    const firebaseVerifier = {
      verifyToken: vi.fn(),
      verifyAuthorizationHeader: vi.fn(async () => ({ valid: false })),
    };
    const worker = createTestUploadWorker({
      bookRouter: { fetch },
      firebaseVerifier,
    });
    const request = new Request('https://worker.test/book-assembly/books/book-1', {
      method: 'POST',
      headers: { Origin: 'http://localhost:5173' },
    });

    const response = await worker.fetch(request, {});

    expect(response.status).toBe(202);
    expect(response.headers.get('x-book-router')).toBe('1');
    expect(fetch).toHaveBeenCalledWith(request, {});
    expect(firebaseVerifier.verifyAuthorizationHeader).not.toHaveBeenCalled();
  });

  it('preserves the existing dispatcher when the Book router returns null', async () => {
    const bookFetch = vi.fn(async () => null);
    const firebaseVerifier = {
      verifyToken: vi.fn(),
      verifyAuthorizationHeader: vi.fn(async () => ({ valid: false })),
    };
    const worker = createTestUploadWorker({
      bookRouter: { fetch: bookFetch },
      firebaseVerifier,
    });
    const request = new Request('https://worker.test/upload/authorize', {
      method: 'POST',
      headers: { Origin: 'http://localhost:5173' },
    });

    const response = await worker.fetch(request, {});

    expect(response.status).toBe(401);
    expect(bookFetch).toHaveBeenCalledWith(request, {});
    expect(firebaseVerifier.verifyAuthorizationHeader).toHaveBeenCalledOnce();
  });

  it('preserves unauthenticated Listening delivery content routing', async () => {
    const bookFetch = vi.fn(async () => null);
    const content = vi.fn(async () => new Response('listening-bytes', {
      status: 206,
      headers: { 'content-range': 'bytes 0-14/15' },
    }));
    const firebaseVerifier = {
      verifyToken: vi.fn(),
      verifyAuthorizationHeader: vi.fn(async () => ({ valid: false })),
    };
    const worker = createTestUploadWorker({
      bookRouter: { fetch: bookFetch },
      firebaseVerifier,
      listeningDeliveryHandlers: {
        content,
        resultReview: vi.fn(),
        solo: vi.fn(),
        live: vi.fn(),
      },
    });
    const request = new Request('https://worker.test/listening-delivery/content', {
      method: 'GET',
      headers: { Origin: 'http://localhost:5174' },
    });

    const response = await worker.fetch(request, {});

    expect(response.status).toBe(206);
    expect(await response.text()).toBe('listening-bytes');
    expect(response.headers.get('content-range')).toBe('bytes 0-14/15');
    expect(content).toHaveBeenCalledOnce();
    expect(firebaseVerifier.verifyAuthorizationHeader).not.toHaveBeenCalled();
  });

  it('preserves authenticated Listening authoring routes and rate limiting', async () => {
    const bookFetch = vi.fn(async () => null);
    const saveDraft = vi.fn(async ({ uid }: { uid: string }) => ({
      body: { saved: true, uid },
      init: { status: 200 },
    }));
    const limit = vi.fn(async () => ({ success: true }));
    const firebaseVerifier = {
      verifyToken: vi.fn(),
      verifyAuthorizationHeader: vi.fn(async () => ({ valid: true, uid: 'teacher-1' })),
    };
    const worker = createTestUploadWorker({
      bookRouter: { fetch: bookFetch },
      firebaseVerifier,
      listeningAuthoringHandlers: {
        saveDraft,
        publish: vi.fn(),
        lifecycle: vi.fn(),
      },
    });
    const request = new Request('https://worker.test/listening-authoring/save-draft', {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:5173',
        Authorization: 'Bearer firebase-token',
      },
    });

    const response = await worker.fetch(request, { UPLOAD_RATE_LIMITER: { limit } });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ saved: true, uid: 'teacher-1' });
    expect(bookFetch).toHaveBeenCalledWith(request, { UPLOAD_RATE_LIMITER: { limit } });
    expect(limit).toHaveBeenCalledOnce();
    expect(saveDraft).toHaveBeenCalledWith(expect.objectContaining({ uid: 'teacher-1' }));
  });
});
