import { describe, expect, it, vi } from 'vitest';
import {
  BOOK_UPDATE_ACTION_ROOT,
  FirebaseRestBookUpdateActionRepository,
} from '../../../cloudflare/src/upload-worker/book-updates/update-action-repository';
import type { BookUpdateActionRecord } from './bookUpdateAction.types';

const action = (overrides: Partial<BookUpdateActionRecord> = {}): BookUpdateActionRecord => ({
  schemaVersion: 1,
  actionId: 'action-1', actorId: 'teacher-1', ownerId: 'teacher-1', bookId: 'book-1',
  snapshotId: 'snapshot-1', snapshotFingerprint: 'a'.repeat(64), idempotencyKey: 'operation-1',
  requestFingerprint: 'b'.repeat(64), reason: 'Reviewed update', selections: [{
    contextKey: 'homework:one', placementId: 'placement-1', choice: 'retain-current',
  }],
  state: 'accepted', stateRevision: 0,
  acceptedAt: '2026-08-10T00:05:00.000Z', committedAt: null,
  updatedAt: '2026-08-10T00:05:00.000Z',
  terminalFailureCode: null,
  audit: {
    actorId: 'teacher-1', acceptedAt: '2026-08-10T00:05:00.000Z', reason: 'Reviewed update',
    bookId: 'book-1', oldActivityVersionId: 'activity-v1', newActivityVersionId: 'activity-v2',
    selectedContextKeys: ['homework:one'], classifications: ['display-only'],
    affectedCount: 1, checkpointCount: 0, regradeCount: 0, notificationCount: 1,
    terminalStatus: null, terminalAt: null,
  },
  recovery: {
    restoreBehavior: 'resume-or-compensate', replaySideEffects: 'none',
    recoveryLedgerRoot: 'book_update_action_recovery',
  },
  ...overrides,
});

const env = {
  FIREBASE_DB_URL: 'https://example.firebaseio.test',
  BOOK_UPDATE_ACTION_SERVICE_IDENTITY: 'updates@example.iam.gserviceaccount.com',
  BOOK_UPDATE_ACTION_GOOGLE_SA_KEY: JSON.stringify({
    client_email: 'updates@example.iam.gserviceaccount.com',
  }),
};

describe('#109 Firebase action repository', () => {
  it('CAS-persists one record with exact idempotency and book indexes', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('null', { status: 200, headers: { etag: 'root-v1' } }))
      .mockResolvedValueOnce(new Response('null', { status: 200 }));
    const repository = new FirebaseRestBookUpdateActionRepository({
      env, fetchImpl, getAccessToken: async () => 'service-token',
    });
    await expect(repository.accept(action())).resolves.toMatchObject({ status: 'accepted' });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(`https://example.firebaseio.test/${BOOK_UPDATE_ACTION_ROOT}.json`);
    const write = fetchImpl.mock.calls[1]?.[1];
    const body = JSON.parse(String(write?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      records: { 'teacher-1': { 'action-1': { state: 'accepted', stateRevision: 0 } } },
      by_idempotency: { 'teacher-1': { 'operation-1': { actionId: 'action-1' } } },
      by_book: { 'teacher-1': { 'book-1': { 'action-1': { actionId: 'action-1' } } } },
    });
  });

  it('advances only the expected state/revision and persists terminal audit facts', async () => {
    const root = { records: { 'teacher-1': { 'action-1': action({ state: 'applying', stateRevision: 1 }) } } };
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(root), { status: 200, headers: { etag: 'root-v2' } }))
      .mockResolvedValueOnce(new Response('null', { status: 200 }));
    const repository = new FirebaseRestBookUpdateActionRepository({
      env, fetchImpl, getAccessToken: async () => 'service-token',
    });
    const result = await repository.transition({
      ownerId: 'teacher-1', actionId: 'action-1', expectedState: 'applying', expectedRevision: 1,
      nextState: 'terminal-failure', at: '2026-08-10T00:06:00.000Z',
      terminalFailureCode: 'downstream_failed',
    });
    expect(result).toMatchObject({
      status: 'advanced',
      action: { state: 'terminal-failure', stateRevision: 2, audit: { terminalStatus: 'terminal-failure' } },
    });
    const body = JSON.parse(String(fetchImpl.mock.calls[1]?.[1]?.body)) as {
      records: Record<string, Record<string, BookUpdateActionRecord>>;
    };
    expect(body.records['teacher-1']?.['action-1']?.terminalFailureCode).toBe('downstream_failed');
  });
});
