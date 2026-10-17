import { describe, expect, it, vi } from 'vitest';
import { createBookRouteHandlers } from '../src/upload-worker/book-route-handlers.ts';
import { canonicalBookRouteManifest } from '../src/upload-worker/book-routes/manifest.ts';
import { bookSourceRouteDescriptors } from '../src/upload-worker/book-source/route.ts';
import { createBookSourceUploadWorkerHandlers } from '../src/upload-worker/book-source/worker.ts';

describe('trusted source decision route registration', () => {
  it('connects the canonical descriptor through the manifest and handler factory', async () => {
    const operationId = '11111111-1111-4111-8111-111111111111';
    expect(bookSourceRouteDescriptors).toContainEqual({
      handler: 'decideStudentSafeSource',
      method: 'POST',
      path: '/v1/book-source/books/:bookId/upload/:reservationId/student-safe/decide',
    });
    const descriptor = canonicalBookRouteManifest.find(
      (route) => route.id === 'book.source-upload.decideStudentSafeSource',
    );
    expect(descriptor).toEqual(expect.objectContaining({
      methods: ['POST'],
      pathTemplate: '/v1/book-source/books/:bookId/upload/:reservationId/student-safe/decide',
      handler: 'bookSource.decideStudentSafeSource',
      firebaseAuth: 'firebase-id-token-teacher',
      rateClass: 'book-control',
      requestBodyBytes: 16 * 1024,
      contributorTicket: '#49',
    }));

    const decideStudentSafeSource = vi.fn(async () => ({
      status: 'verified_completed' as const,
      reservationId: 'reservation-1',
      sourceVersionId: 'source-version-1',
      checksum: { algorithm: 'sha-256' as const, value: 'a'.repeat(64) },
      purpose: 'book-source' as const,
      studentSafeStatus: 'ready' as const,
      studentSafeDecision: {
        decidedBy: 'teacher-1',
        decidedAt: '2026-08-01T00:00:00.000Z',
        sourceVersionId: 'source-version-1',
        sha256Hex: 'a'.repeat(64),
        reasonCode: 'teacher-reviewed' as const,
      },
    }));
    const sourceUpload = createBookSourceUploadWorkerHandlers({
      runtimeFactory: () => ({ service: {
        begin: vi.fn(),
        complete: vi.fn(),
        decideStudentSafeSource,
      } }),
    });
    const handlers = createBookRouteHandlers({ sourceUploadHandlers: sourceUpload });
    const handler = handlers['bookSource.decideStudentSafeSource'];
    expect(handler).toEqual(expect.any(Function));

    const result = await handler!({
      request: new Request('https://book.example/v1/book-source/books/book-1/upload/reservation-1/student-safe/decide', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': operationId },
        body: JSON.stringify({ operationId, studentSafeStatus: 'ready', reasonCode: 'teacher-reviewed' }),
      }),
      env: {},
      uid: 'teacher-1',
      params: { bookId: 'book-1', reservationId: 'reservation-1' },
      descriptor: descriptor!,
    });

    expect(result).toMatchObject({ init: { status: 200 }, body: { reservationId: 'reservation-1' } });
    expect(decideStudentSafeSource).toHaveBeenCalledWith({
      actorId: 'teacher-1',
      bookId: 'book-1',
      reservationId: 'reservation-1',
      operationId,
      studentSafeStatus: 'ready',
      reasonCode: 'teacher-reviewed',
    });
  });
});
