import { describe, expect, it, vi } from 'vitest';
import { FirebaseRestNotificationCommandRepository } from '../src/upload-worker/notifications/repository.ts';
import { FirebaseDeadlineNotificationStorage } from '../src/upload-worker/notifications/deadline-action-store.ts';
import { FirebaseHomeworkResetNotificationStorage } from '../src/upload-worker/notifications/homework-reset-action-store.ts';
import { FirebaseThcsNotificationStorage } from '../src/upload-worker/notifications/thcs-notification-store.ts';
import { createDeadlineNotificationHandlers } from '../src/upload-worker/notifications/deadline-action.ts';
import { createHomeworkResetNotificationHandlers } from '../src/upload-worker/notifications/homework-reset-action.ts';
import { retryDueClassNotifications } from '../src/upload-worker/notifications/class-retry.ts';
import { retryDueHomeworkNotifications } from '../src/upload-worker/notifications/homework-retry.ts';

const pem = (bytes: ArrayBuffer): string => {
  const base64 = btoa(String.fromCharCode(...new Uint8Array(bytes)));
  return `-----BEGIN PRIVATE KEY-----\n${base64.match(/.{1,64}/gu)?.join('\n')}\n-----END PRIVATE KEY-----`;
};

const firestoreValue = (value: unknown): unknown => typeof value === 'string' ? { stringValue: value }
  : typeof value === 'number' ? { integerValue: String(value) }
    : { mapValue: { fields: Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .map(([name, item]) => [name, firestoreValue(item)])) } };

describe('notification inbox external subrequests', () => {
  it('bounds a populated class membership retry to one delivered intent', async () => {
    const key = await crypto.subtle.generateKey({
      name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256',
    }, true, ['sign', 'verify']);
    const identity = 'notification-class-populated@example.test';
    const env = {
      FIREBASE_DB_URL: 'https://temp-a1437-default-rtdb.firebaseio.com',
      FIREBASE_PROJECT_ID: 'temp-a1437',
      NOTIFICATION_COMMAND_SERVICE_IDENTITY: identity,
      NOTIFICATION_COMMAND_GOOGLE_SA_KEY: JSON.stringify({
        client_email: identity, private_key: pem(await crypto.subtle.exportKey('pkcs8', key.privateKey)),
      }),
    };
    const now = 1_800_000_000_000;
    const intents = [1].map((index) => ({
      actionId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      kind: 'join-pending', classId: 'class1', studentId: `student${index}`,
      actorUid: 'teacher1', teacherId: 'teacher1', occurredAt: now - 1000,
      className: 'Example Class', studentName: `Student ${index}`,
      dueAt: now - 1, attempts: 1, state: 'retry_due',
    }));
    const calls: string[] = [];
    const writes: Array<{ path: string; state?: string }> = [];
    const fetchImpl: typeof fetch = async function (this: unknown, input, init) {
      if (this !== globalThis) throw new TypeError('fetch receiver was lost');
      const url = String(input);
      const method = init?.method ?? 'GET';
      const path = new URL(url).pathname;
      calls.push(`${method} ${url}`);
      if (url === 'https://oauth2.googleapis.com/token') {
        return new Response(JSON.stringify({ access_token: 'test-token', expires_in: 3600 }));
      }
      if (!url.startsWith(env.FIREBASE_DB_URL)) throw new Error(`unexpected ${method} ${url}`);
      if (method === 'GET' && path === '/notification_intents.json') {
        expect(new URL(url).searchParams.get('limitToFirst')).toBe('1');
        return new Response(JSON.stringify(Object.fromEntries(intents.map((intent) => [intent.actionId, intent]))));
      }
      if (method === 'GET') {
        const intent = intents.find((item) => path === `/notification_intents/${item.actionId}.json`);
        return new Response(JSON.stringify(intent ?? null), { headers: { etag: '"0"' } });
      }
      if (method === 'PUT') {
        writes.push({ path, state: (JSON.parse(String(init?.body)) as { state?: string }).state });
        return new Response('null');
      }
      throw new Error(`unexpected ${method} ${url}`);
    };
    vi.stubGlobal('fetch', fetchImpl);
    try { await retryDueClassNotifications(env, now); } finally { vi.unstubAllGlobals(); }
    expect(writes.filter((write) => write.path.startsWith('/notifications/'))).toHaveLength(2);
    expect(writes.filter((write) => write.state === 'retrying')).toHaveLength(1);
    expect(writes.filter((write) => write.state === 'done')).toHaveLength(1);
    expect(calls.filter((call) => call.startsWith('POST https://oauth2.googleapis.com/token'))).toHaveLength(1);
    expect(calls.filter((call) => call.startsWith('GET https://temp-a1437-default-rtdb.firebaseio.com'))).toHaveLength(7);
    expect(calls.filter((call) => call.startsWith('PUT https://temp-a1437-default-rtdb.firebaseio.com'))).toHaveLength(5);
    expect(calls).toHaveLength(13);
  });

  it('bounds a populated homework submission terminal retry to one failed intent', async () => {
    const key = await crypto.subtle.generateKey({
      name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256',
    }, true, ['sign', 'verify']);
    const identity = 'notification-homework-populated@example.test';
    const env = {
      FIREBASE_DB_URL: 'https://temp-a1437-default-rtdb.firebaseio.com',
      FIREBASE_PROJECT_ID: 'temp-a1437',
      NOTIFICATION_COMMAND_SERVICE_IDENTITY: identity,
      NOTIFICATION_COMMAND_GOOGLE_SA_KEY: JSON.stringify({
        client_email: identity, private_key: pem(await crypto.subtle.exportKey('pkcs8', key.privateKey)),
      }),
    };
    const now = 1_800_000_000_000;
    const calls: string[] = [];
    const patches: unknown[] = [];
    const fetchImpl: typeof fetch = async function (this: unknown, input, init) {
      if (this !== globalThis) throw new TypeError('fetch receiver was lost');
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push(`${method} ${url}`);
      if (url === 'https://oauth2.googleapis.com/token') {
        return new Response(JSON.stringify({ access_token: 'test-token', expires_in: 3600 }));
      }
      if (url.endsWith(':runQuery')) {
        expect((JSON.parse(String(init?.body)) as { structuredQuery: { limit: number } }).structuredQuery.limit).toBe(1);
        return new Response(JSON.stringify([1].map((index) => ({ document: {
          name: `projects/temp-a1437/databases/(default)/documents/homework_submissions/submission${index}`,
          updateTime: '2026-01-01T00:00:00Z',
          fields: {
            notificationIntent: firestoreValue({ schemaVersion: 1, eventId: `homework-submitted:result${index}`,
              resultId: `result${index}`, homeworkId: 'homework1', studentId: `student${index}`,
              teacherId: 'teacher1', submittedAt: now - 1000 }),
            notificationDelivery: firestoreValue({ state: 'retrying', attempts: 2, dueAt: now - 1 }),
          },
        } }))));
      }
      if (url.startsWith('https://firestore.googleapis.com/') && method === 'PATCH') {
        patches.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ updateTime: '2026-01-01T00:00:01Z' }));
      }
      if (url.startsWith(env.FIREBASE_DB_URL) && method === 'GET') {
        return new Response('null', { headers: { etag: '"0"' } });
      }
      if (url.startsWith(env.FIREBASE_DB_URL) && method === 'PUT') return new Response('null');
      throw new Error(`unexpected ${method} ${url}`);
    };
    const repository = new FirebaseRestNotificationCommandRepository({ env, fetchImpl });
    await retryDueHomeworkNotifications(env, now, { fetchImpl, repository });
    expect(patches).toHaveLength(1);
    expect(patches.every((patch) => JSON.stringify(patch).includes('failed'))).toBe(true);
    expect(calls.filter((call) => call.startsWith('POST https://oauth2.googleapis.com/token'))).toHaveLength(2);
    expect(calls.filter((call) => call.startsWith('POST https://firestore.googleapis.com/'))).toHaveLength(1);
    expect(calls.filter((call) => call.startsWith('GET https://temp-a1437-default-rtdb.firebaseio.com'))).toHaveLength(2);
    expect(calls.filter((call) => call.startsWith('PUT https://temp-a1437-default-rtdb.firebaseio.com'))).toHaveLength(1);
    expect(calls).toHaveLength(7);
  });

  it('bounds manual-reminder and homework-reset terminal retries to one intent per pass', async () => {
    const key = await crypto.subtle.generateKey({
      name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256',
    }, true, ['sign', 'verify']);
    const privateKey = pem(await crypto.subtle.exportKey('pkcs8', key.privateKey));
    const now = 1_800_000_000_000;
    for (const family of ['manual-reminder', 'homework-reset'] as const) {
      const identity = `notification-populated-${family}@example.test`;
      const env = {
        FIREBASE_DB_URL: 'https://temp-a1437-default-rtdb.firebaseio.com',
        FIREBASE_PROJECT_ID: 'temp-a1437',
        NOTIFICATION_COMMAND_SERVICE_IDENTITY: identity,
        NOTIFICATION_COMMAND_GOOGLE_SA_KEY: JSON.stringify({ client_email: identity, private_key: privateKey }),
      };
      const calls: string[] = [];
      const patches: unknown[] = [];
      const fetchImpl: typeof fetch = async function (this: unknown, input, init) {
        if (this !== globalThis) throw new TypeError('fetch receiver was lost');
        const url = String(input);
        const method = init?.method ?? 'GET';
        calls.push(`${method} ${url}`);
        if (url === 'https://oauth2.googleapis.com/token') {
          return new Response(JSON.stringify({ access_token: 'test-token', expires_in: 3600 }));
        }
        if (url.endsWith(':runQuery')) {
          expect((JSON.parse(String(init?.body)) as { structuredQuery: { limit: number } }).structuredQuery.limit).toBe(1);
          const rows = [1].map((index) => {
            const intent = {
              ...(family === 'homework-reset' ? { schemaVersion: 1, sourceSubmissionId: `submission${index}` } : {}),
              eventId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
              homeworkId: `homework${index}`, studentId: `student${index}`, actorUid: 'teacher1',
              occurredAt: now - 1000, state: 'retrying', attempts: 2, dueAt: now - 1,
            };
            return { document: {
              name: `projects/temp-a1437/databases/(default)/documents/${family === 'manual-reminder'
                ? 'homework_manual_reminder_intents' : 'homework_reset_notification_intents'}/${intent.eventId}`,
              updateTime: '2026-01-01T00:00:00Z',
              fields: Object.fromEntries(Object.entries(intent).map(([name, value]) => [name, firestoreValue(value)])),
            } };
          });
          return new Response(JSON.stringify(rows));
        }
        if (url.startsWith('https://firestore.googleapis.com/') && method === 'PATCH') {
          patches.push(JSON.parse(String(init?.body)));
          return new Response(JSON.stringify({ updateTime: '2026-01-01T00:00:01Z' }));
        }
        if (url.startsWith(env.FIREBASE_DB_URL) && method === 'GET') {
          return new Response('null', { headers: { etag: '"0"' } });
        }
        if (url.startsWith(env.FIREBASE_DB_URL) && method === 'PUT') return new Response('null');
        throw new Error(`unexpected ${method} ${url}`);
      };
      const repository = new FirebaseRestNotificationCommandRepository({ env, fetchImpl });
      if (family === 'manual-reminder') {
        await createDeadlineNotificationHandlers({
          storage: new FirebaseDeadlineNotificationStorage(env, fetchImpl), repository, now: () => now,
        }).retryDue();
      } else {
        await createHomeworkResetNotificationHandlers({
          storage: new FirebaseHomeworkResetNotificationStorage(env, fetchImpl), repository, now: () => now,
        }).retryDue();
      }
      expect(calls.filter((call) => call.startsWith('POST https://oauth2.googleapis.com/token'))).toHaveLength(1);
      expect(calls.filter((call) => call.startsWith('POST https://firestore.googleapis.com/'))).toHaveLength(1);
      expect(calls.filter((call) => call.startsWith('GET https://temp-a1437-default-rtdb.firebaseio.com'))).toHaveLength(2);
      expect(calls.filter((call) => call.startsWith('PUT https://temp-a1437-default-rtdb.firebaseio.com'))).toHaveLength(1);
      expect(patches).toHaveLength(1);
      expect(patches.every((patch) => JSON.stringify(patch).includes('failed'))).toBe(true);
      expect(calls).toHaveLength(6);
    }
  });

  it('reuses one OAuth exchange per first-batch Firestore retry store', async () => {
    const key = await crypto.subtle.generateKey({
      name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256',
    }, true, ['sign', 'verify']);
    const privateKey = pem(await crypto.subtle.exportKey('pkcs8', key.privateKey));
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async function (this: unknown, input, init) {
      if (this !== globalThis) throw new TypeError('fetch receiver was lost');
      const url = String(input);
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url === 'https://oauth2.googleapis.com/token') {
        return new Response(JSON.stringify({ access_token: 'test-token', expires_in: 3600 }));
      }
      if (url.endsWith(':runQuery')) return new Response('[]');
      return new Response(null, { status: 404 });
    };
    for (const [index, Storage] of [FirebaseDeadlineNotificationStorage, FirebaseHomeworkResetNotificationStorage].entries()) {
      const identity = `notification-budget-${index}@example.test`;
      const env = {
        FIREBASE_DB_URL: 'https://temp-a1437-default-rtdb.firebaseio.com',
        FIREBASE_PROJECT_ID: 'temp-a1437',
        NOTIFICATION_COMMAND_SERVICE_IDENTITY: identity,
        NOTIFICATION_COMMAND_GOOGLE_SA_KEY: JSON.stringify({ client_email: identity, private_key: privateKey }),
      };
      const storage = new Storage(env, fetchImpl);
      expect(await storage.dueIntents(1_800_000_000_000, 2)).toEqual([]);
      expect(await storage.readIntent('00000000-0000-4000-8000-000000000001')).toBeNull();
    }
    expect(calls.filter((call) => call.startsWith('POST https://oauth2.googleapis.com/token'))).toHaveLength(2);
    expect(calls.filter((call) => call.includes('https://firestore.googleapis.com/'))).toHaveLength(4);
  });

  it('shares one OAuth exchange across a THCS due scan and ten recipient writes', async () => {
    const key = await crypto.subtle.generateKey({
      name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256',
    }, true, ['sign', 'verify']);
    const identity = 'notification-budget@example.test';
    const sa = JSON.stringify({ client_email: identity, private_key: pem(await crypto.subtle.exportKey('pkcs8', key.privateKey)) });
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url === 'https://oauth2.googleapis.com/token') {
        return new Response(JSON.stringify({ access_token: 'test-token', expires_in: 3600 }));
      }
      if (url.startsWith('https://firestore.googleapis.com/')) return new Response('[]');
      if (init?.method === 'GET') return new Response('null', { headers: { etag: '"0"' } });
      if (init?.method === 'PUT') return new Response('null');
      throw new Error(`unexpected ${init?.method} ${url}`);
    };
    const env = {
      FIREBASE_DB_URL: 'https://temp-a1437-default-rtdb.firebaseio.com',
      FIREBASE_PROJECT_ID: 'temp-a1437',
      NOTIFICATION_COMMAND_SERVICE_IDENTITY: identity,
      NOTIFICATION_COMMAND_GOOGLE_SA_KEY: sa,
    };
    const storage = new FirebaseThcsNotificationStorage(env, fetchImpl);
    expect(await storage.dueIntents(1_800_000_000_000, 1)).toEqual([]);
    const repository = new FirebaseRestNotificationCommandRepository({ env, fetchImpl });
    for (let index = 0; index < 10; index += 1) {
      await repository.create({
        operationId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        recipientId: `student${index}`,
        notification: { type: 'info', title: 'Update', message: 'Your update is ready.' },
        now: 1_800_000_000_000,
      });
    }
    expect(calls.filter((call) => call.startsWith('POST https://oauth2.googleapis.com/token'))).toHaveLength(1);
    expect(calls.filter((call) => call.startsWith('POST https://firestore.googleapis.com/'))).toHaveLength(1);
    expect(calls.filter((call) => call.startsWith('GET https://temp-a1437-default-rtdb.firebaseio.com'))).toHaveLength(11);
    expect(calls.filter((call) => call.startsWith('PUT https://temp-a1437-default-rtdb.firebaseio.com'))).toHaveLength(10);
    expect(calls).toHaveLength(23);
  });
});
