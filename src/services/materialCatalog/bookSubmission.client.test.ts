import { afterEach, describe, expect, it, vi } from 'vitest';
import { BookSubmissionClientError, createBookSubmissionClient } from './bookSubmission.client';

const operation = {
  schemaVersion: 1,
  operationId: 'submission-1',
  ownerId: 'teacher-1',
  finalBookId: 'book-1',
  idempotencyKey: 'draft-1',
  fingerprint: 'a'.repeat(64),
  state: 'preparing',
  completedSteps: ['begin'],
  createdAt: '2026-10-09T00:00:00Z',
  updatedAt: '2026-10-09T00:00:00Z',
};

afterEach(() => vi.unstubAllEnvs());

describe('book submission client', () => {
  it.each([
    [true, 'true', 'http://localhost:8787', true],
    [false, 'true', 'http://localhost:8787', false],
    [true, 'false', 'http://localhost:8787', false],
    [true, 'true', 'http://localhost:9999', false],
  ])('bounds the local HTTP endpoint (%s, %s, %s)', async (dev, localOnly, baseUrl, allowed) => {
    vi.stubEnv('DEV', dev); vi.stubEnv('VITE_FIREBASE_LOCAL_ONLY', localOnly);
    const fetchImpl = vi.fn(async () => Response.json({ status: 'created', operation }));
    const client = createBookSubmissionClient({ baseUrl, getIdToken: async () => 'token', fetchImpl });
    const result = client.begin({ fingerprint: operation.fingerprint, idempotencyKey: 'draft-1' });
    if (allowed) {
      await expect(result).resolves.toEqual({ status: 'created', operation });
      expect(fetchImpl).toHaveBeenCalledOnce();
    } else {
      await expect(result).rejects.toMatchObject({ code: 'unavailable', status: 503 });
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  });

  it('fails closed without a configured HTTPS endpoint', async () => {
    const client = createBookSubmissionClient({ baseUrl: '', getIdToken: async () => 'token' });
    await expect(client.begin({ fingerprint: operation.fingerprint, idempotencyKey: 'draft-1' }))
      .rejects.toThrowError(new BookSubmissionClientError('unavailable', 503));
  });

  it('binds authenticated begin requests and validates the operation envelope', async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.headers).toEqual(expect.objectContaining({ Authorization: 'Bearer token' }));
      return new Response(JSON.stringify({ status: 'created', operation }), { status: 200 });
    });
    const client = createBookSubmissionClient({
      baseUrl: 'https://submission.example',
      getIdToken: async () => 'token',
      fetchImpl,
    });
    await expect(client.begin({ fingerprint: operation.fingerprint, idempotencyKey: 'draft-1' }))
      .resolves.toEqual({ status: 'created', operation });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://submission.example/v1/book-submissions',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
