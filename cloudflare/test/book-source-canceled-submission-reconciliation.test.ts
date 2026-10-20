import { describe, expect, it, vi } from 'vitest';
import { createBookSourceReconciliationWorker } from '../src/book-source-worker/reconciliation-worker';

const env = {
  LOCAL_EMULATOR_AUTH: 'true', FIREBASE_PROJECT_ID: 'demo-luyentap-local',
  FIREBASE_DATABASE_URL: 'http://localhost:9000?ns=demo-luyentap-local',
  BOOK_SOURCE_RECONCILIATION_STATE: 'enabled', BOOK_SOURCE_RECONCILIATION_ACTION_STATE: 'enabled',
  BOOK_SOURCE_UPLOAD_ACCOUNT_ID: 'account-1', BOOK_SOURCE_RECONCILIATION_LEASE_OWNER: 'test-reconciler',
  BOOK_SOURCE_B2_ENDPOINT: 'https://s3.us-west-004.backblazeb2.com', BOOK_SOURCE_B2_REGION: 'us-west-004',
  BOOK_SOURCE_B2_STORAGE_LOCATION_ID: 'location-1', BOOK_SOURCE_B2_PRIVATE_BUCKET_ID: 'bucket-1',
  BOOK_SOURCE_B2_PRIVATE_BUCKET_NAME: 'bookpdf', BOOK_SOURCE_B2_OBJECT_KEY_PREFIX: 'book-source/test/',
  BOOK_SOURCE_B2_DELETE_APPLICATION_KEY_ID: 'delete-id', BOOK_SOURCE_B2_DELETE_APPLICATION_KEY: 'delete-key',
  BOOK_SOURCE_B2_METADATA_APPLICATION_KEY_ID: 'metadata-id', BOOK_SOURCE_B2_METADATA_APPLICATION_KEY: 'metadata-key',
} as const;
const operation = {
  reservationId: 'reservation-1', bookId: 'book-1', sourceVersionId: 'source-1',
  sourceKey: 'full', ownerId: 'teacher-1', submissionOperationId: 'submission-1',
  storageLocationId: 'location-1', providerKind: 'backblaze-b2-s3', privateBucketId: 'bucket-1',
  providerObjectKey: 'book-source/test/source.pdf', kind: 'initial', purpose: 'book-source',
  studentSafeStatus: 'unreviewed', byteSize: 42, originalFilename: 'source.pdf',
  expectedChecksum: { algorithm: 'sha-256', value: 'a'.repeat(64) },
  createdAt: '2026-10-19T00:00:00.000Z', expiresAt: '2026-10-19T00:15:00.000Z', status: 'reserved',
};
const parent = { operationId: 'submission-1', ownerId: 'teacher-1', finalBookId: 'book-1',
  fingerprint: 'b'.repeat(64), state: 'canceled' };

describe('unpublished canceled source reconciliation authority', () => {
  it.each([
    ['exact canceled parent', {}, null, { role: 'teacher', status: 'active' }, 409],
    ['preparing parent', { state: 'preparing' }, null, { role: 'teacher', status: 'active' }, 403],
    ['committing parent', { state: 'committing' }, null, { role: 'teacher', status: 'active' }, 403],
    ['committed parent', { state: 'committed' }, null, { role: 'teacher', status: 'active' }, 403],
    ['foreign parent owner', { ownerId: 'other' }, null, { role: 'teacher', status: 'active' }, 403],
    ['foreign final Book', { finalBookId: 'other' }, null, { role: 'teacher', status: 'active' }, 403],
    ['foreign operation', { operationId: 'other' }, null, { role: 'teacher', status: 'active' }, 403],
    ['invalid fingerprint', { fingerprint: 'invalid' }, null, { role: 'teacher', status: 'active' }, 403],
    ['inactive teacher', {}, null, { role: 'teacher', status: 'blocked' }, 403],
    ['conflicting Book', {}, { bookId: 'book-1', ownerId: 'other', status: 'ready' }, { role: 'teacher', status: 'active' }, 403],
  ])('fences %s before provider work', async (_label, patch, book, profile, expectedStatus) => {
    const account = { revision: 0, capacity: { trackedAccountBytes: 0, temporaryBytes: 0 },
      operations: { 'reservation-1': operation } };
    const records: Record<string, unknown> = {
      '/book_source_upload_accounts/account-1.json': account,
      '/material_catalog/books/book-1.json': book,
      '/users/teacher-1.json': profile,
      '/book_submission_operations/teacher-1/operations/submission-1.json': { ...parent, ...patch },
    };
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(String(input));
      expect(url.origin).toBe('http://localhost:9000');
      expect(url.search).toBe('?ns=demo-luyentap-local');
      expect(init?.method ?? 'GET').toBe('GET');
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer owner');
      expect(Object.hasOwn(records, url.pathname)).toBe(true);
      return Response.json(records[url.pathname]);
    });
    const verifier = { verifyAuthorizationHeader: async () => ({ valid: true, uid: 'teacher-1' }) };
    const worker = createBookSourceReconciliationWorker(fetcher, () => new Date('2026-10-19T00:01:00Z'),
      undefined, undefined, undefined, verifier);
    const response = await worker.fetch(new Request('http://localhost:8787/v1/book-source/books/book-1/upload/reservation-1/reconcile', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    }), env as never);
    expect(response.status).toBe(expectedStatus);
    expect(await response.json()).toEqual({ code: expectedStatus === 409 ? 'operation_not_eligible' : 'authority_denied' });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
});
