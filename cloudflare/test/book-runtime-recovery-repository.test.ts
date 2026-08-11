import { describe, expect, it } from 'vitest';
import {
  createBookRuntimeRecoveryProjection,
} from '../../src/services/book-activity/bookRuntime.recovery.ts';
import { FirebaseRestBookRuntimeRecoveryProjectionStore } from '../src/upload-worker/book-runtime/recovery-repository.ts';

const createFirebase = () => {
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
      return new Response(JSON.stringify(read(path) ?? null), { status: 200, headers: { etag: `"${versions.get(path) ?? 0}"` } });
    }
    if (failNextWrite.value) { failNextWrite.value = false; return new Response('', { status: 412 }); }
    if (headers.get('if-match') !== `"${versions.get(path) ?? 0}"`) return new Response('', { status: 412 });
    values.set(path, JSON.parse(String(init?.body)));
    versions.set(path, (versions.get(path) ?? 0) + 1);
    return new Response('{}', { status: 200 });
  };
  return { values, failNextWrite, fetchImpl };
};

const projection = () => createBookRuntimeRecoveryProjection({
  recoveryOperationId: 'recovery-123', recordKind: 'result', recordId: 'attempt-1', idempotencyKey: 'operation-1',
  recipientId: 'student-1', contextId: 'homework-1', contextKind: 'homework', ownerId: 'teacher-1', bindingId: 'delivery-1', bindingRevision: 3,
  placementId: 'placement-1', activityId: 'activity-1', activityVersion: 2, activityVersionId: 'activity-1-v2', interactionId: 'interaction-1',
  feedbackPolicy: 'after-review', sourceProvenance: [{ sourceKey: 'source-1', sourceVersionId: 'source-1-v2', pages: [4] }],
  metadata: { resultId: 'attempt-1:result', attemptId: 'attempt-1', status: 'submitted', feedbackRelease: 'pending', operationId: 'operation-1' },
  canonicalFingerprint: 'fnv1a64:terminal-1',
});

const env = {
  FIREBASE_DB_URL: 'https://firebase.test',
  BOOK_RECOVERY_SERVICE_IDENTITY: 'book-recovery@example.iam.gserviceaccount.com',
} as const;

describe('Book runtime recovery Firebase repository', () => {
  it('writes exact unavailable recovery children and replays/conflicts by CAS identity', async () => {
    const firebase = createFirebase();
    const store = new FirebaseRestBookRuntimeRecoveryProjectionStore({ env, fetchImpl: firebase.fetchImpl, getAccessToken: async () => 'token' });
    const value = projection();
    await expect(store.putIfAbsent({ projectionKey: value.projectionKey, projection: value })).resolves.toBe('created');
    await expect(store.putIfAbsent({ projectionKey: value.projectionKey, projection: value })).resolves.toBe('replayed');
    await expect(store.putIfAbsent({ projectionKey: value.projectionKey, projection: { ...value, canonicalFingerprint: 'fnv1a64:drift' } })).resolves.toBe('conflict');
    await expect(store.readHold({ recipientId: 'student-1', contextId: 'homework-1' })).resolves.toMatchObject({
      recoveryOperationId: 'recovery-123', deliveryState: 'unavailable', readDenied: true,
    });
    expect(firebase.values.has('book_runtime/scopes/student-1/homework-1/recovery/hold')).toBe(true);
    expect(firebase.values.has(`book_runtime/scopes/student-1/homework-1/recovery/projections/${value.projectionKey}`)).toBe(true);
  });

  it('replays safely after a crash between hold and projection writes', async () => {
    const firebase = createFirebase();
    const store = new FirebaseRestBookRuntimeRecoveryProjectionStore({ env, fetchImpl: firebase.fetchImpl, getAccessToken: async () => 'token', maxRetries: 1 });
    const value = projection();
    firebase.failNextWrite.value = true;
    await expect(store.putIfAbsent({ projectionKey: value.projectionKey, projection: value })).rejects.toThrow('book_runtime_recovery_child_cas_retries_exhausted');
    await expect(store.putIfAbsent({ projectionKey: value.projectionKey, projection: value })).resolves.toBe('created');
    await expect(store.readHold({ recipientId: 'student-1', contextId: 'homework-1' })).resolves.toMatchObject({ recoveryOperationId: 'recovery-123' });
  });
});
