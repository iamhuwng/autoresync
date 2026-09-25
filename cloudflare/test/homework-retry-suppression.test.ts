import { describe, expect, it, vi } from 'vitest';
import { recordHomeworkImmediateOutcome } from '../src/upload-worker/notifications/homework-retry.ts';

const pem = (bytes: ArrayBuffer): string => {
  const base64 = btoa(String.fromCharCode(...new Uint8Array(bytes)));
  return `-----BEGIN PRIVATE KEY-----\n${base64.match(/.{1,64}/gu)?.join('\n')}\n-----END PRIVATE KEY-----`;
};
const field = (value: unknown): unknown => typeof value === 'string' ? { stringValue: value }
  : typeof value === 'number' ? { integerValue: String(value) }
    : { mapValue: { fields: Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .map(([name, item]) => [name, field(item)])) } };

describe('suppressed homework delivery', () => {
  it('reports a verified immediate failure before marking the retry unavailable', async () => {
    const key = await crypto.subtle.generateKey({
      name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256',
    }, true, ['sign', 'verify']);
    const identity = 'notification-homework-suppression@example.test';
    const env = {
      FIREBASE_DB_URL: 'https://test-default-rtdb.firebaseio.com', FIREBASE_PROJECT_ID: 'test',
      NOTIFICATION_COMMAND_SERVICE_IDENTITY: identity,
      NOTIFICATION_COMMAND_GOOGLE_SA_KEY: JSON.stringify({
        client_email: identity, private_key: pem(await crypto.subtle.exportKey('pkcs8', key.privateKey)),
      }),
    };
    const input = { resultId: 'result1', studentId: 'student1', teacherId: 'teacher1', homeworkId: 'homework1' };
    const steps: string[] = [];
    const fetchImpl: typeof fetch = vi.fn(async function (this: unknown, raw, init) {
      if (this !== globalThis) throw new TypeError('fetch receiver was lost');
      const url = String(raw);
      const method = init?.method ?? 'GET';
      if (url === 'https://oauth2.googleapis.com/token') return new Response(JSON.stringify({ access_token: 'token', expires_in: 3600 }));
      if (url.endsWith(':runQuery')) return new Response(JSON.stringify([{ document: {
        name: 'projects/test/databases/(default)/documents/homework_submissions/submission1',
        updateTime: '2026-01-01T00:00:00Z',
        fields: {
          notificationIntent: field({ schemaVersion: 1, eventId: 'homework-submitted:result1',
            resultId: 'result1', ...input, submittedAt: 100 }),
          notificationDelivery: field({ state: 'retry_due', attempts: 1, dueAt: 200 }),
        },
      } }]));
      if (url.startsWith(env.FIREBASE_DB_URL)) {
        if (method === 'GET' && url.includes('/notification_retry_families/')) {
          return new Response(JSON.stringify({ consecutiveFailures: 3, retrySuppressed: true,
            lastFailedActionId: 'earlier-action' }), { headers: { etag: '"0"' } });
        }
        if (method === 'GET') return new Response('null', { headers: { etag: '"0"' } });
        if (method === 'PUT') {
          if (url.includes('/reports/errors/')) steps.push('report');
          return new Response('null');
        }
      }
      if (url.includes('/homework_submissions/submission1') && method === 'PATCH') {
        steps.push('failed');
        expect(String(init?.body)).toContain('"stringValue":"failed"');
        expect(String(init?.body)).toContain('"integerValue":"1"');
        return new Response(JSON.stringify({ updateTime: '2026-01-01T00:00:01Z' }));
      }
      throw new Error(`unexpected ${method} ${url}`);
    });
    await recordHomeworkImmediateOutcome(env, input, false, 300, fetchImpl);
    expect(steps).toEqual(['report', 'failed']);
  });
});
