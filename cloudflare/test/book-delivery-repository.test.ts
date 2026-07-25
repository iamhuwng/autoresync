import { describe, expect, it } from 'vitest';
import { FirebaseRestBookDeliveryRepository } from '../src/upload-worker/book-delivery/repository';
import { makeBookDeliveryTestBinding } from './book-delivery-worker.test';

const operation = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const createFirebase = () => {
  const values = new Map<string, unknown>();
  const versions = new Map<string, number>();
  const calls: string[] = [];
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
    calls.push(`${init?.method ?? 'GET'} ${path}`);
    const headers = new Headers(init?.headers);
    if ((init?.method ?? 'GET') === 'GET') {
      const version = versions.get(path) ?? 0;
      return new Response(JSON.stringify(read(path) ?? null), {
        status: 200,
        headers: { etag: `"${version}"` },
      });
    }
    const expected = headers.get('if-match');
    const actual = `"${versions.get(path) ?? 0}"`;
    if (failNextWrite.value) {
      failNextWrite.value = false;
      return new Response('', { status: 412 });
    }
    if (expected !== actual) return new Response('', { status: 412 });
    values.set(path, JSON.parse(String(init?.body)));
    versions.set(path, (versions.get(path) ?? 0) + 1);
    return new Response('{}', { status: 200 });
  };
  return { values, calls, failNextWrite, fetchImpl };
};

const env = {
  FIREBASE_DB_URL: 'https://firebase.test',
  BOOK_DELIVERY_SERVICE_IDENTITY: 'book-delivery@example.iam.gserviceaccount.com',
} as const;

describe('Book Delivery Firebase repository', () => {
  it('uses exact indexes and one scope CAS for atomic lifecycle transitions', async () => {
    const firebase = createFirebase();
    const repository = new FirebaseRestBookDeliveryRepository({
      env,
      fetchImpl: firebase.fetchImpl,
      getAccessToken: async () => 'test-token',
    });
    const draft = await repository.createDraft({
      binding: makeBookDeliveryTestBinding(),
      operationId: operation(1),
      now: '2026-07-25T00:00:00.000Z',
    });
    expect(draft.status).toBe('created');
    const writesBeforeActivation = firebase.calls.filter((call) => call.startsWith('PUT book_delivery/scopes/')).length;
    const active = await repository.activate({
      bindingId: 'binding-worker',
      expectedRecordRevision: 0,
      operationId: operation(2),
      now: '2026-07-25T00:01:00.000Z',
    });
    expect(active.status).toBe('activated');
    expect(firebase.calls.filter((call) => call.startsWith('PUT book_delivery/scopes/')).length - writesBeforeActivation).toBe(1);
    expect(firebase.calls.some((call) => call === 'GET book_delivery')).toBe(false);
    const resolved = await repository.resolveCurrent('teacher-1', 'preview-1');
    expect(resolved?.record.status).toBe('active');
  });

  it('replays exact operations, rejects conflicting replays, and clears pointer in same scope CAS', async () => {
    const firebase = createFirebase();
    const repository = new FirebaseRestBookDeliveryRepository({
      env,
      fetchImpl: firebase.fetchImpl,
      getAccessToken: async () => 'test-token',
    });
    await repository.createDraft({
      binding: makeBookDeliveryTestBinding(),
      operationId: operation(3),
      now: '2026-07-25T00:00:00.000Z',
    });
    await repository.activate({
      bindingId: 'binding-worker',
      expectedRecordRevision: 0,
      operationId: operation(4),
      now: '2026-07-25T00:01:00.000Z',
    });
    expect((await repository.activate({
      bindingId: 'binding-worker',
      expectedRecordRevision: 0,
      operationId: operation(4),
      now: '2026-07-25T00:01:00.000Z',
    })).status).toBe('replayed');
    expect((await repository.activate({
      bindingId: 'binding-worker',
      expectedRecordRevision: 0,
      operationId: operation(4),
      now: '2026-07-25T00:02:00.000Z',
    })).status).toBe('idempotency-conflict');
    const revoked = await repository.revoke({
      bindingId: 'binding-worker',
      expectedRecordRevision: 1,
      expectedCurrentBindingId: 'binding-worker',
      operationId: operation(5),
      now: '2026-07-25T00:03:00.000Z',
    });
    expect(revoked.status).toBe('revoked');
    expect(await repository.readCurrent('teacher-1', 'preview-1')).toBeNull();
  });

  it('fails closed after a CAS failure without publishing a partial active state', async () => {
    const firebase = createFirebase();
    const repository = new FirebaseRestBookDeliveryRepository({
      env,
      fetchImpl: firebase.fetchImpl,
      getAccessToken: async () => 'test-token',
      maxRetries: 1,
    });
    await repository.createDraft({
      binding: makeBookDeliveryTestBinding(),
      operationId: operation(7),
      now: '2026-07-25T00:00:00.000Z',
    });
    firebase.failNextWrite.value = true;
    await expect(repository.activate({
      bindingId: 'binding-worker',
      expectedRecordRevision: 0,
      operationId: operation(8),
      now: '2026-07-25T00:01:00.000Z',
    })).rejects.toThrow('book_delivery_scope_cas_retries_exhausted');
    expect((await repository.readBinding('binding-worker'))?.status).toBe('draft');
    expect(await repository.readCurrent('teacher-1', 'preview-1')).toBeNull();
  });
});
