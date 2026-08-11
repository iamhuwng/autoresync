import { describe, expect, it, vi } from 'vitest';
import { createBookSourceControlWorker } from '../src/book-source-worker/control-worker';

const pilotIssuedAt = new Date(Date.now() - 60 * 60_000).toISOString();
const pilotExpiresAt = new Date(Date.now() + 60 * 60_000).toISOString();
const pilotConfig = JSON.stringify({
  schemaVersion: 'v1',
  environment: 'test',
  revision: 'source-worker-test-1',
  issuedAt: pilotIssuedAt,
  expiresAt: pilotExpiresAt,
  teacherId: 'teacher-1',
  bookId: 'book-1',
  assignmentId: 'assignment-1',
  studentIds: ['student-1'],
  maxStudents: 30,
});

describe('book source control worker activation seam', () => {
  it('defaults disabled and stays unavailable without #59 composition', async () => {
    const worker = createBookSourceControlWorker();
    for (const state of [undefined, 'disabled', 'enabled', 'unexpected']) {
      const response = await worker.fetch(
        new Request('https://control.example/v1/book-source/books/book-1/upload/begin', { method: 'POST' }),
        { BOOK_SOURCE_UPLOAD_CONTROL_STATE: state },
      );
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ code: 'book_source_upload_unavailable' });
    }
  });

  it('delegates only when deployment state and trusted composition are both enabled', async () => {
    const operationId = '11111111-1111-4111-8111-111111111111';
    const begin = vi.fn(async () => ({
      status: 'reserved' as const,
      uploadUrl: 'https://upload.example/exact',
      expiresAt: '2099-07-26T01:00:00.000Z',
      requiredHeaders: {
        'content-type': 'application/pdf',
        'x-amz-content-sha256': 'a'.repeat(64),
        'x-amz-meta-book-source-byte-size': '42',
        'x-amz-meta-book-source-sha256': 'a'.repeat(64),
      },
      reservationId: 'reservation-1',
      sourceVersionId: 'source-version-1',
    }));
    const worker = createBookSourceControlWorker({
      serviceFactory: () => ({ begin, complete: vi.fn() }),
      verifier: { verifyAuthorizationHeader: async () => ({ valid: true, uid: 'teacher-1' }) },
    });
    const response = await worker.fetch(new Request(
      'https://control.example/v1/book-source/books/book-1/upload/begin',
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer token',
          'content-type': 'application/json',
          'idempotency-key': operationId,
        },
        body: JSON.stringify({
          operationId,
          sourceKey: 'source-1',
          kind: 'initial',
          inspection: {
            schemaVersion: 1,
            trust: 'browser-supplied-untrusted',
            state: 'complete',
            displayFilename: 'book.pdf',
            exactByteSize: 42,
            sha256Hex: 'a'.repeat(64),
            physicalPageCount: 2,
            pdfType: 'application/pdf',
            readability: 'readable',
          },
        }),
      },
    ), {
      BOOK_SOURCE_UPLOAD_CONTROL_STATE: 'enabled',
      BOOK_PILOT_SCOPE_ENFORCEMENT: 'enabled',
      BOOK_PILOT_SCOPE_ENVIRONMENT: 'test',
      BOOK_PILOT_SCOPE_CONFIG_JSON: pilotConfig,
      BOOK_PILOT_SCOPE_AUDIT: vi.fn(),
    });

    expect(response.status).toBe(200);
    expect(begin).toHaveBeenCalledTimes(1);
  });
});
