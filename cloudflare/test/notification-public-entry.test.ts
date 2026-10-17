import { describe, expect, it, vi } from 'vitest';
import worker from '../notification-command-worker.js';
import activeWorker from '../notification-release/notification-command-entry.js';

describe('qualified notification public entry', () => {
  it('forwards guarded migrated routes to the fixed bridge', async () => {
    const stub = { fetch: vi.fn(async () => Response.json({ status: 'created' })) };
    const env = { NOTIFICATION_BRIDGE_OBJECT: { idFromName: vi.fn(() => 'fixed-id'), get: vi.fn(() => stub) } };
    for (const path of ['/events', '/homework-result-authority', '/course-enrollment-approval']) {
      const request = new Request(`https://worker.test${path}`, { method: 'POST', headers: {
        Authorization: 'Bearer token', 'Content-Type': 'application/json',
      }, body: '{}' });
      expect((await (await worker.fetch(request, env)).json()).status).toBe('created');
      expect(env.NOTIFICATION_BRIDGE_OBJECT.idFromName).toHaveBeenLastCalledWith('firestore-bridge');
      expect(stub.fetch).toHaveBeenLastCalledWith(request);
    }
  });

  it('rejects invalid requests before using the bridge and serves preflight', async () => {
    const get = vi.fn();
    const env = { NOTIFICATION_BRIDGE_OBJECT: { idFromName: vi.fn(), get } };
    for (const [suffix, headers, expected] of [
      ['?extra=1', {}, 404],
      ['', { Origin: 'https://untrusted.test' }, 403],
      ['', {}, 401],
      ['', { Authorization: 'Bearer token' }, 400],
      ['', { Authorization: 'Bearer token', 'Content-Type': 'application/json', 'Content-Length': '513' }, 413],
    ] as const) {
      expect((await worker.fetch(new Request(`https://worker.test/events${suffix}`, {
        method: 'POST', headers, body: '{}',
      }), env)).status).toBe(expected);
    }
    const preflight = await worker.fetch(new Request('https://worker.test/events', {
      method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' },
    }), env);
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    expect(get).not.toHaveBeenCalled();
  });

  it('delegates existing excluded routes unchanged and retires ordinary endpoints and cron', async () => {
    const fetch = vi.spyOn(activeWorker, 'fetch');
    for (const path of ['/book-notifications/commands', '/session-notifications/action', '/writing-notifications/actions', '/grading-notifications/manual']) {
      const request = new Request(`https://worker.test${path}`, { method: 'POST' });
      const env = { NOTIFICATION_RETRY_BATCH: 'class-homework' };
      const response = await worker.fetch(request, env);
      expect(fetch).toHaveBeenLastCalledWith(request, env);
      expect(response.status).toBe(path === '/book-notifications/commands' ? 401 : 503);
    }
    for (const path of ['/class-notifications/actions', '/deadline-notifications/actions', '/notifications/committed', '/writing-product']) {
      expect((await worker.fetch(new Request(`https://worker.test${path}`, { method: 'POST' }), {})).status).toBe(404);
    }
    expect(worker).not.toHaveProperty('scheduled');
    fetch.mockRestore();
  });
});
