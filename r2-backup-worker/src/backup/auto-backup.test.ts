import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkerEnv } from '../types';
import { clearStaleRestoreFlag, runAutoBackup } from './auto-backup';
import {
  executeStep1_RTDB,
  executeStep2_Firestore,
  executeStep3_Finalize,
} from './data-backup';

vi.mock('./data-backup', () => ({
  executeStep1_RTDB: vi.fn(async () => undefined),
  executeStep2_Firestore: vi.fn(async () => undefined),
  executeStep3_Finalize: vi.fn(async () => undefined),
}));

vi.mock('../auth/google-oauth', () => ({
  TokenCache: class {
    async getToken() {
      return 'google-token';
    }
  },
}));

vi.mock('../utils/r2-client', () => ({
  BackupR2Client: class {
    async getObjectAsJson() {
      return null;
    }

    async putObject() {}
  },
}));

const env = {
  FIREBASE_DB_URL: 'https://db.example.test',
  GOOGLE_SA_KEY: '{}',
  ADMIN_UID: 'admin-1',
  BACKUP_R2_ACCESS_KEY_ID: 'key',
  BACKUP_R2_SECRET_ACCESS_KEY: 'secret',
  BACKUP_R2_ENDPOINT: 'https://r2.example.test',
  BACKUP_R2_BUCKET_NAME: 'backup-bucket',
} as WorkerEnv;

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('scheduled auto-backup', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('still succeeds through the cron path after registry coverage is added', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? 'GET';

      if (method === 'GET' && url.pathname.endsWith('/system_flags.json')) {
        return new Response('null', { status: 200, headers: { etag: '"flags-1"' } });
      }

      if (method === 'GET' && url.pathname.endsWith('/listening_authoring.json')) {
        return new Response('null', { status: 200, headers: { etag: '"authoring-1"' } });
      }

      if (method === 'PUT' && url.pathname.includes('/notifications/admin-1/backup_')) {
        return json({ ok: true });
      }

      throw new Error(`Unexpected fetch ${method} ${url.toString()}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await runAutoBackup(env);

    expect(executeStep1_RTDB).toHaveBeenCalledTimes(1);
    expect(executeStep2_Firestore).toHaveBeenCalledTimes(1);
    expect(executeStep3_Finalize).toHaveBeenCalledTimes(1);
    expect(vi.mocked(executeStep1_RTDB).mock.calls[0]?.[2]).toBe('auto');
  });

  it('atomically clears a stale restore flag and its matching restore mutation lease', async () => {
    const startedAt = Date.now() - 3 * 60 * 60 * 1000;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? 'GET';
      if (method === 'GET' && url.pathname.endsWith('/system_flags.json')) {
        return new Response(JSON.stringify({
          restore_in_progress: { active: true, startedAt, backupId: 'backup-stale' },
          listening_media_mutation_lease: {
            kind: 'restore',
            backupId: 'backup-stale',
            leaseId: 'restore-lease-stale',
            expiresAt: Date.now() - 1,
          },
          unrelated: true,
        }), { status: 200, headers: { etag: '"flags-stale"' } });
      }
      if (method === 'GET' && url.pathname.endsWith('/listening_authoring.json')) {
        return new Response(JSON.stringify({
          temp_cleanup_lease: {
            leaseId: 'restore-lease-stale',
            kind: 'restore',
            expiresAt: Date.now() - 1,
          },
          drafts: { retained: true },
        }), { status: 200, headers: { etag: '"authoring-stale"' } });
      }
      if (method === 'PUT') return json({ ok: true });
      throw new Error(`Unexpected fetch ${method} ${String(input)}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await clearStaleRestoreFlag(env);

    const puts = fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT');
    expect(puts[0]?.[1]?.headers).toEqual(expect.objectContaining({ 'if-match': '"flags-stale"' }));
    expect(JSON.parse(String(puts[0]?.[1]?.body))).toEqual({ unrelated: true });
    expect(puts[1]?.[1]?.headers).toEqual(expect.objectContaining({ 'if-match': '"authoring-stale"' }));
    expect(JSON.parse(String(puts[1]?.[1]?.body))).toEqual({ drafts: { retained: true } });
  });

  it('does not clear a long-running restore while its lease remains live', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      restore_in_progress: {
        active: true,
        startedAt: Date.now() - 3 * 60 * 60 * 1000,
        backupId: 'backup-live',
      },
      listening_media_mutation_lease: {
        kind: 'restore',
        backupId: 'backup-live',
        leaseId: 'restore-lease-live',
        expiresAt: Date.now() + 60_000,
      },
    }), { status: 200, headers: { etag: '"flags-live"' } }));
    vi.stubGlobal('fetch', fetchMock);

    await clearStaleRestoreFlag(env);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
