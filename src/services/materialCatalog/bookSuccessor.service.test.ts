import { describe, expect, it, vi } from 'vitest';
import { createBookSuccessorClient, oppositeBookMode } from './bookSuccessor.service';

const successor = {
  bookId: 'book-successor',
  bookMode: 'pdf',
  ownerId: 'teacher-1',
  title: 'Book',
  authors: [],
  testTypeIds: ['ielts'],
  tags: [],
  visibility: 'private',
  status: 'draft-empty',
  createdAt: '2026-07-25T00:00:00.000Z',
  updatedAt: '2026-07-25T00:00:00.000Z',
  createdBy: 'teacher-1',
  updatedBy: 'teacher-1',
  modeSuccessorLineage: {
    kind: 'mode-successor',
    predecessorBookId: 'book-original',
    fromMode: 'materials',
    toMode: 'pdf',
    reason: 'Need a PDF source',
    actorId: 'teacher-1',
    createdAt: '2026-07-25T00:00:00.000Z',
  },
};

describe('bookSuccessor service', () => {
  it('maps each Book mode to the other mode', () => {
    expect(oppositeBookMode('materials')).toBe('pdf');
    expect(oppositeBookMode('pdf')).toBe('materials');
  });

  it('sends an authenticated idempotent create command', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      status: 'created',
      successor,
      predecessorUpdatedAt: 'before',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const client = createBookSuccessorClient({
      baseUrl: 'https://worker.example/',
      getIdToken: async () => 'firebase-token',
      fetchImpl,
    });

    await expect(client.create({
      predecessorBookId: 'book-original',
      expectedUpdatedAt: 'before',
      targetMode: 'pdf',
      reason: 'Need a PDF source',
      operationId: '2d694f43-5655-49f9-bb97-bdb151777836',
    })).resolves.toMatchObject({ status: 'created', successor });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://worker.example/api/material-books/successors/create',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer firebase-token',
          'Idempotency-Key': '2d694f43-5655-49f9-bb97-bdb151777836',
        }),
      }),
    );
  });

  it('fails closed on malformed success and missing configuration', async () => {
    const malformed = createBookSuccessorClient({
      baseUrl: 'https://worker.example',
      getIdToken: async () => 'token',
      fetchImpl: async () => new Response('{"status":"created"}'),
    });
    await expect(malformed.create({
      predecessorBookId: 'book-original',
      expectedUpdatedAt: 'before',
      targetMode: 'pdf',
      reason: 'Need a PDF source',
      operationId: crypto.randomUUID(),
    })).rejects.toThrow('invalid response');

    const missing = createBookSuccessorClient({
      baseUrl: '',
      getIdToken: async () => 'token',
    });
    await expect(missing.archive({
      successorBookId: 'book-successor',
      expectedUpdatedAt: 'before',
      operationId: crypto.randomUUID(),
    })).rejects.toThrow('not configured');
  });

  it('maps stale CAS failures to an actionable message', async () => {
    const client = createBookSuccessorClient({
      baseUrl: 'https://worker.example',
      getIdToken: async () => 'token',
      fetchImpl: async () => new Response('{"status":"stale"}', { status: 409 }),
    });

    await expect(client.create({
      predecessorBookId: 'book-original',
      expectedUpdatedAt: 'before',
      targetMode: 'pdf',
      reason: 'Need a PDF source',
      operationId: crypto.randomUUID(),
    })).rejects.toThrow('changed after it was loaded');
  });
});
