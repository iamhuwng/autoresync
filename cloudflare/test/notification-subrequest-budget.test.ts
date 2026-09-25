import { describe, expect, it } from 'vitest';
import { FirebaseRestNotificationCommandRepository } from '../src/upload-worker/notifications/repository.ts';
import { FirebaseDeadlineNotificationStorage } from '../src/upload-worker/notifications/deadline-action-store.ts';
import { FirebaseHomeworkResetNotificationStorage } from '../src/upload-worker/notifications/homework-reset-action-store.ts';
import { FirebaseThcsNotificationStorage } from '../src/upload-worker/notifications/thcs-notification-store.ts';

const pem = (bytes: ArrayBuffer): string => {
  const base64 = btoa(String.fromCharCode(...new Uint8Array(bytes)));
  return `-----BEGIN PRIVATE KEY-----\n${base64.match(/.{1,64}/gu)?.join('\n')}\n-----END PRIVATE KEY-----`;
};

describe('notification inbox external subrequests', () => {
  it('reuses one OAuth exchange per first-batch Firestore retry store', async () => {
    const key = await crypto.subtle.generateKey({
      name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256',
    }, true, ['sign', 'verify']);
    const privateKey = pem(await crypto.subtle.exportKey('pkcs8', key.privateKey));
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
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
