import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkerEnv } from '../types';
import { runAutoBackup } from './auto-backup';
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

      if (method === 'GET' && url.pathname.endsWith('/system_flags/restore_in_progress.json')) {
        return json(null);
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
});
