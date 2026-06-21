import { env, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';
import {
  createUploadWorker,
  UploadGrantReplayLedger,
} from '../worker.js';
import { consumeGrantNonce } from '../src/upload-worker/replay-authority.js';

const BASE_URL = 'https://r2-upload-signer.test';
const APPROVED_ORIGIN = 'http://localhost:5173';
const NOW = 1_800_000_000_000;
const NONCE = '0123456789abcdef0123456789abcdef';
const SECRET = 'TEST_ONLY_NOT_A_SECRET';

const bearer = (token = 'owner-a-token') => ({ Authorization: `Bearer ${token}` });

const buildWorker = ({ bucket, replayLedger, now = () => NOW } = {}) =>
  createUploadWorker({
    now,
    nonceGenerator: () => NONCE,
    firebaseVerifier: {
      verifyAuthorizationHeader: vi.fn(async (header) => {
        if (header === 'Bearer owner-a-token') return { valid: true, uid: 'owner-a' };
        return { valid: false, reason: 'invalid_token' };
      }),
    },
  }).fetch.bind(null);

const createRecordingBucket = () => {
  const calls = [];
  return {
    calls,
    async get(key) {
      calls.push(['get', key]);
      return null;
    },
    async put(key) {
      calls.push(['put', key]);
    },
    async delete(key) {
      calls.push(['delete', key]);
    },
  };
};

const authorize = async (workerFetch, envOverride = {}) => {
  const response = await workerFetch(
    new Request(`${BASE_URL}/upload/authorize`, {
      method: 'POST',
      headers: {
        ...bearer(),
        Origin: APPROVED_ORIGIN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        operationKind: 'listening_audio_temp',
        fileName: 'lesson.mp3',
        contentType: 'audio/mpeg',
        sizeBytes: 3,
      }),
    }),
    {
      R2_BUCKET: env.R2_BUCKET,
      PUBLIC_URL: 'https://public.example.test',
      FIREBASE_PROJECT_ID: 'test-project',
      UPLOAD_GRANT_SECRET: SECRET,
      UPLOAD_RATE_LIMITER: { limit: async () => ({ success: true }) },
      UPLOAD_GRANT_REPLAY_LEDGER: env.UPLOAD_GRANT_REPLAY_LEDGER,
      ...envOverride,
    },
  );
  expect(response.status).toBe(200);
  return response.json();
};

describe('Packet 2K replay ledger prerequisite', () => {
  it('exports UploadGrantReplayLedger from worker entry module', () => {
    expect(UploadGrantReplayLedger).toBeTypeOf('function');
  });

  it('accepts first consume, rejects sequential replay, and persists durable state', async () => {
    const stub = env.UPLOAD_GRANT_REPLAY_LEDGER.getByName(`grant:owner-a:upload:${NONCE}`);

    await expect(stub.consume({ key: `grant:owner-a:upload:${NONCE}`, expiresAt: NOW + 60_000 }))
      .resolves.toEqual({ consumed: true });
    await expect(stub.consume({ key: `grant:owner-a:upload:${NONCE}`, expiresAt: NOW + 60_000 }))
      .resolves.toEqual({ consumed: false });

    await expect(
      runInDurableObject(stub, async (_instance, state) => ({
        consumedAt: await state.storage.get('consumedAt'),
        expiresAt: await state.storage.get('expiresAt'),
        cleanupAt: await state.storage.get('cleanupAt'),
      })),
    ).resolves.toMatchObject({
      consumedAt: expect.any(Number),
      expiresAt: NOW + 60_000,
      cleanupAt: expect.any(Number),
    });
  });

  it('allows exactly one concurrent consume winner for same key', async () => {
    const key = `grant:owner-a:upload:${NONCE}-concurrent`;
    const stub = env.UPLOAD_GRANT_REPLAY_LEDGER.getByName(key);
    const results = await Promise.all([
      stub.consume({ key, expiresAt: NOW + 60_000 }),
      stub.consume({ key, expiresAt: NOW + 60_000 }),
      stub.consume({ key, expiresAt: NOW + 60_000 }),
    ]);

    expect(results.filter(({ consumed }) => consumed)).toHaveLength(1);
    expect(results.filter(({ consumed }) => !consumed)).toHaveLength(2);
  });

  it('keeps different keys independent', async () => {
    const alpha = env.UPLOAD_GRANT_REPLAY_LEDGER.getByName('grant:owner-a:upload:alpha');
    const beta = env.UPLOAD_GRANT_REPLAY_LEDGER.getByName('grant:owner-a:upload:beta');

    await expect(alpha.consume({ key: 'grant:owner-a:upload:alpha', expiresAt: NOW + 60_000 }))
      .resolves.toEqual({ consumed: true });
    await expect(beta.consume({ key: 'grant:owner-a:upload:beta', expiresAt: NOW + 60_000 }))
      .resolves.toEqual({ consumed: true });
  });

  it('rejects malformed and expired consume inputs fail closed', async () => {
    await expect(
      consumeGrantNonce({
        env,
        payload: {
          uid: 'owner-a',
          kind: 'upload',
          nonce: '',
          expiresAt: NOW + 60_000,
        },
      }),
    ).rejects.toMatchObject({ reason: 'invalid_grant', status: 403 });
    await expect(
      consumeGrantNonce({
        env,
        payload: {
          uid: 'owner-a',
          kind: 'upload',
          nonce: `${NONCE}-expired`,
          expiresAt: Date.now() - 1,
        },
      }),
    ).rejects.toMatchObject({ reason: 'grant_expired', status: 403 });
  });

  it('schedules cleanup alarm at max(expiresAt + 5m, consumeTime + 15m) and clears storage plus alarm', async () => {
    const key = 'grant:owner-a:upload:cleanup';
    const expiresAt = NOW + 60_000;
    const stub = env.UPLOAD_GRANT_REPLAY_LEDGER.getByName(key);

    await stub.consume({ key, expiresAt });

    const beforeAlarm = await runInDurableObject(stub, async (_instance, state) => ({
      alarmAt: await state.storage.getAlarm(),
      cleanupAt: await state.storage.get('cleanupAt'),
      consumedAt: await state.storage.get('consumedAt'),
    }));

    expect(beforeAlarm.cleanupAt).toBe(
      Math.max(expiresAt + 5 * 60_000, beforeAlarm.consumedAt + 15 * 60_000),
    );
    expect(beforeAlarm.alarmAt).toBe(beforeAlarm.cleanupAt);
    await expect(runDurableObjectAlarm(stub)).resolves.toBe(true);
    await expect(
      runInDurableObject(stub, async (_instance, state) => ({
        alarmAt: await state.storage.getAlarm(),
        consumedAt: await state.storage.get('consumedAt'),
        cleanupAt: await state.storage.get('cleanupAt'),
      })),
    ).resolves.toEqual({
      alarmAt: null,
      consumedAt: undefined,
      cleanupAt: undefined,
    });
  });

  it('fails closed when namespace, stub method, or RPC path is unavailable', async () => {
    await expect(
      consumeGrantNonce({
        env: {},
        payload: { uid: 'owner-a', kind: 'upload', nonce: NONCE, expiresAt: NOW + 60_000 },
      }),
    ).rejects.toMatchObject({ reason: 'replay_protection_unavailable', status: 500 });

    await expect(
      consumeGrantNonce({
        env: { UPLOAD_GRANT_REPLAY_LEDGER: { getByName: () => ({}) } },
        payload: { uid: 'owner-a', kind: 'upload', nonce: NONCE, expiresAt: NOW + 60_000 },
      }),
    ).rejects.toMatchObject({ reason: 'replay_protection_unavailable', status: 500 });

    await expect(
      consumeGrantNonce({
        env: {
          UPLOAD_GRANT_REPLAY_LEDGER: {
            getByName: () => ({
              consume: async () => {
                throw new Error('rpc failed');
              },
            }),
          },
        },
        payload: { uid: 'owner-a', kind: 'upload', nonce: NONCE, expiresAt: NOW + 60_000 },
      }),
    ).rejects.toMatchObject({ reason: 'replay_protection_unavailable', status: 500 });
  });

  it('consumes upload grants before all R2 access', async () => {
    const bucket = createRecordingBucket();
    const calls = [];
    const workerFetch = buildWorker();
    const authorizeBody = await authorize(workerFetch);
    const uploadUrl = new URL(authorizeBody.uploadUrl);

    const response = await workerFetch(
      new Request(`${BASE_URL}${uploadUrl.pathname}${uploadUrl.search}`, {
        method: 'PUT',
        headers: {
          ...bearer(),
          Origin: APPROVED_ORIGIN,
          'Content-Type': 'audio/mpeg',
          'Content-Length': '3',
        },
        body: new Uint8Array([1, 2, 3]),
      }),
      {
        R2_BUCKET: bucket,
        PUBLIC_URL: 'https://public.example.test',
        FIREBASE_PROJECT_ID: 'test-project',
        UPLOAD_GRANT_SECRET: SECRET,
        UPLOAD_RATE_LIMITER: { limit: async () => ({ success: true }) },
        UPLOAD_GRANT_REPLAY_LEDGER: {
          getByName: () => ({
            consume: async () => {
              calls.push('consume');
              return { consumed: true };
            },
          }),
        },
      },
    );

    expect(response.status).toBe(200);
    expect(calls).toEqual(['consume']);
    expect(bucket.calls[0]).toEqual(['get', authorizeBody.key]);
  });

  it('consumes move grants before all R2 access', async () => {
    const bucket = createRecordingBucket();
    bucket.get = async (key) => {
      bucket.calls.push(['get', key]);
      if (key.startsWith('temp/')) {
        return {
          body: new Uint8Array([1, 2, 3]),
          httpMetadata: { contentType: 'audio/mpeg' },
          customMetadata: {},
        };
      }
      return null;
    };
    const calls = [];
    const workerFetch = buildWorker();
    const authorizeBody = await authorize(workerFetch);

    const response = await workerFetch(
      new Request(`${BASE_URL}/move`, {
        method: 'POST',
        headers: {
          ...bearer(),
          Origin: APPROVED_ORIGIN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ moveGrant: authorizeBody.moveGrant }),
      }),
      {
        R2_BUCKET: bucket,
        PUBLIC_URL: 'https://public.example.test',
        FIREBASE_PROJECT_ID: 'test-project',
        UPLOAD_GRANT_SECRET: SECRET,
        UPLOAD_RATE_LIMITER: { limit: async () => ({ success: true }) },
        UPLOAD_GRANT_REPLAY_LEDGER: {
          getByName: () => ({
            consume: async () => {
              calls.push('consume');
              return { consumed: true };
            },
          }),
        },
      },
    );

    expect(response.status).toBe(200);
    expect(calls).toEqual(['consume']);
    expect(bucket.calls[0]).toEqual(['get', authorizeBody.key.slice('temp/'.length)]);
  });
});
