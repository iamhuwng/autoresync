import { describe, expect, it } from 'vitest';
import { createBookUpdateRecoveryProjection } from '../../src/services/book-delivery/bookUpdate.recovery.ts';
import { FirebaseRestBookUpdateRecoveryProjectionStore } from '../src/upload-worker/book-updates/recovery-repository.ts';

const firebaseMock = () => {
  const values = new Map<string, unknown>();
  const versions = new Map<string, number>();
  const failNextWrite = { value: false };
  const read = (path: string): unknown => {
    if (values.has(path)) return values.get(path);
    const parts = path.split('/');
    for (let index = parts.length - 1; index > 0; index -= 1) {
      const parentPath = parts.slice(0, index).join('/');
      if (!values.has(parentPath)) continue;
      let value = values.get(parentPath);
      for (const part of parts.slice(index)) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
        value = (value as Record<string, unknown>)[part];
      }
      return value;
    }
    return null;
  };
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const path = decodeURIComponent(url.pathname.replace(/^\/+|\.json$/gu, ''));
    const headers = new Headers(init?.headers);
    if ((init?.method ?? 'GET') === 'GET') {
      return new Response(JSON.stringify(read(path) ?? null), {
        status: 200,
        headers: { etag: `"${versions.get(path) ?? 0}"` },
      });
    }
    if (failNextWrite.value) {
      failNextWrite.value = false;
      return new Response('', { status: 412 });
    }
    if (headers.get('if-match') !== `"${versions.get(path) ?? 0}"`) return new Response('', { status: 412 });
    values.set(path, JSON.parse(String(init?.body)));
    versions.set(path, (versions.get(path) ?? 0) + 1);
    return new Response('{}', { status: 200 });
  };
  return { values, failNextWrite, fetchImpl };
};

const projection = (fingerprint = 'fingerprint-1') => createBookUpdateRecoveryProjection({
  recoveryOperationId: 'recovery-124',
  recordKind: 'notification',
  recordId: 'notification-1',
  ownerId: 'teacher-1',
  bookId: 'book-1',
  scopeKey: 'notification-student-1-notification-1',
  recipientId: 'student-1',
  contextId: 'homework-1',
  metadata: {
    notificationId: 'notification-1',
    updateActionId: 'action-1',
    recipientId: 'student-1',
    contextId: 'homework-1',
    case: 'review',
    checkpointAvailable: true,
    dispatch: 'held',
  },
  canonicalFingerprint: fingerprint,
});

const env = {
  FIREBASE_DB_URL: 'https://firebase.test',
  BOOK_RECOVERY_SERVICE_IDENTITY: 'book_recovery@example.iam.gserviceaccount.com',
} as const;

describe('Book update recovery Firebase repository', () => {
  it('uses held-child CAS for crash replay and drift conflict', async () => {
    const firebase = firebaseMock();
    const store = new FirebaseRestBookUpdateRecoveryProjectionStore({
      env,
      fetchImpl: firebase.fetchImpl,
      getAccessToken: async () => 'token',
    });
    const value = projection();
    await expect(store.putIfAbsent({ projectionKey: value.projectionKey, projection: value })).resolves.toBe('created');
    await expect(store.putIfAbsent({ projectionKey: value.projectionKey, projection: value })).resolves.toBe('replayed');
    await expect(store.putIfAbsent({
      projectionKey: value.projectionKey,
      projection: projection('fingerprint-drift'),
    })).resolves.toBe('conflict');
    await expect(store.readHold({ scopeKey: value.scopeKey })).resolves.toMatchObject({
      recoveryOperationId: 'recovery-124',
      recipientId: 'student-1',
      deliveryState: 'unavailable',
      readDenied: true,
    });
    expect(firebase.values.has('book_update_action_recovery/49d/notifications/student-1/recovery-124~notification~notification-1')).toBe(true);
    expect(firebase.values.has('book_update_action_recovery/49d/holds/notification-student-1-notification-1')).toBe(true);
  });

  it('replays after an ETag crash without creating a second held child', async () => {
    const firebase = firebaseMock();
    const store = new FirebaseRestBookUpdateRecoveryProjectionStore({
      env,
      fetchImpl: firebase.fetchImpl,
      getAccessToken: async () => 'token',
      maxRetries: 1,
    });
    const value = projection();
    firebase.failNextWrite.value = true;
    await expect(store.putIfAbsent({ projectionKey: value.projectionKey, projection: value }))
      .rejects.toThrow('book_update_recovery_child_cas_retries_exhausted');
    await expect(store.putIfAbsent({ projectionKey: value.projectionKey, projection: value })).resolves.toBe('created');
  });
});
