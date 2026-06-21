import { describe, expect, it } from 'vitest';
import { createUploadWorker } from '../worker.js';
import { createFirebaseVerifier } from '../src/upload-worker/firebase-verification.js';

const BASE_URL = 'https://r2-upload-signer.test';
const APPROVED_ORIGIN = 'http://localhost:5173';
const FIXED_NONCE = '11112222333344445555666677778888';
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

const bearer = (token = 'valid-owner-a-token') => ({ Authorization: `Bearer ${token}` });

const tokenUidMap = {
  'valid-owner-a-token': 'owner-a',
  'valid-owner-b-token': 'owner-b',
};
const createMemoryBucket = () => {
  const objects = new Map();
  const calls = [];
  return {
    calls,
    async get(key) {
      calls.push(['get', key]);
      const object = objects.get(key);
      if (!object) return null;
      return {
        body: object.body,
        httpMetadata: object.httpMetadata,
        customMetadata: object.customMetadata,
        async text() {
          return typeof object.body === 'string'
            ? object.body
            : new TextDecoder().decode(object.body);
        },
      };
    },
    async put(key, body, options = {}) {
      calls.push(['put', key]);
      const storedBody =
        body instanceof ReadableStream
          ? new Uint8Array(await new Response(body).arrayBuffer())
          : body;
      objects.set(key, {
        body: storedBody,
        httpMetadata: options.httpMetadata,
        customMetadata: options.customMetadata,
      });
    },
    async delete(key) {
      calls.push(['delete', key]);
      objects.delete(key);
    },
  };
};
const createReplayLedger = () => {
  const consumed = new Set();
  const calls = [];
  return {
    calls,
    async consume({ key, expiresAt }) {
      calls.push({ key, expiresAt });
      if (consumed.has(key)) return { consumed: false };
      consumed.add(key);
      return { consumed: true };
    },
  };
};
const createRateLimiter = ({ allowed = true, calls = [] } = {}) => ({
  async limit(input) {
    calls.push(input);
    return { success: allowed };
  },
});
const createTestContext = ({
  now = () => 1_800_000_000_000,
  nonceGenerator = () => FIXED_NONCE,
  rateLimiter = createRateLimiter(),
  replayLedger = createReplayLedger(),
} = {}) => {
  const bucket = createMemoryBucket();
  const worker = createUploadWorker({
    nonceGenerator,
    now,
    firebaseVerifier: createFirebaseVerifier({
      verifyToken: async (token) => {
        const uid = tokenUidMap[token];
        return uid ? { valid: true, uid } : { valid: false, reason: 'invalid_token' };
      },
    }),
  });
  const env = {
    R2_BUCKET: bucket,
    PUBLIC_URL: 'https://public.example.test',
    FIREBASE_PROJECT_ID: 'test-project',
    UPLOAD_GRANT_SECRET: 'TEST_ONLY_NOT_A_SECRET',
    UPLOAD_RATE_LIMITER: rateLimiter,
    ...(replayLedger ? { UPLOAD_GRANT_REPLAY_LEDGER: replayLedger } : {}),
  };

  return {
    bucket,
    replayLedger,
    async fetch(path, init = {}) {
      return worker.fetch(new Request(`${BASE_URL}${path}`, init), env);
    },
  };
};
const authorizeUpload = (ctx, overrides = {}) =>
  ctx.fetch('/upload/authorize', {
    method: 'POST',
    headers: {
      ...bearer(),
      'Content-Type': 'application/json',
      Origin: APPROVED_ORIGIN,
    },
    body: JSON.stringify({
      operationKind: 'listening_audio_temp',
      fileName: 'lesson-audio.mp3',
      contentType: 'audio/mpeg',
      sizeBytes: 3,
      ...overrides,
    }),
  });
const putToUploadUrl = (ctx, uploadUrl, overrides = {}) =>
  ctx.fetch(new URL(uploadUrl).pathname + new URL(uploadUrl).search, {
    method: 'PUT',
    headers: {
      ...bearer(overrides.token),
      'Content-Type': overrides.contentType ?? 'audio/mpeg',
      'Content-Length': String(overrides.sizeBytes ?? 3),
      Origin: APPROVED_ORIGIN,
    },
    body: overrides.body ?? new Uint8Array([1, 2, 3]),
  });
describe('Task 2.9 opaque upload and move grants', () => {
  it('requires opaque upload grant instead of browser raw key authority', async () => {
    const ctx = createTestContext();
    const authorizeResponse = await authorizeUpload(ctx);
    expect(authorizeResponse.status).toBe(200);
    const authorizeBody = await authorizeResponse.json();

    expect(authorizeBody.key).toBe(
      `temp/listening-audio/owner-a/${FIXED_NONCE}-lesson-audio.mp3`,
    );
    expect(authorizeBody.uploadUrl).toContain('/upload?grant=');
    expect(authorizeBody.uploadUrl).not.toContain('key=');

    const rawKeyResponse = await ctx.fetch(
      `/?key=${encodeURIComponent(authorizeBody.key)}`,
      {
        method: 'PUT',
        headers: {
          ...bearer(),
          'Content-Type': 'audio/mpeg',
          'Content-Length': '3',
          Origin: APPROVED_ORIGIN,
        },
        body: new Uint8Array([1, 2, 3]),
      },
    );

    expect([400, 405]).toContain(rawKeyResponse.status);
    expect(await ctx.bucket.get(authorizeBody.key)).toBeNull();
  });

  it('rejects tampered upload grants before R2 writes', async () => {
    const ctx = createTestContext();
    const authorizeBody = await (await authorizeUpload(ctx)).json();
    const uploadUrl = new URL(authorizeBody.uploadUrl);
    const grant = uploadUrl.searchParams.get('grant');
    uploadUrl.searchParams.set('grant', `${grant.slice(0, -2)}xx`);

    const response = await putToUploadUrl(ctx, uploadUrl.toString());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: 'invalid_grant',
    });
    expect(await ctx.bucket.get(authorizeBody.key)).toBeNull();
  });

  it('rejects upload grants used by a different verified UID', async () => {
    const ctx = createTestContext();
    const authorizeBody = await (await authorizeUpload(ctx)).json();

    const response = await putToUploadUrl(ctx, authorizeBody.uploadUrl, {
      token: 'valid-owner-b-token',
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: 'grant_uid_mismatch',
    });
    expect(await ctx.bucket.get(authorizeBody.key)).toBeNull();
  });

  it('rejects expired upload grants before R2 writes', async () => {
    let now = 1_800_000_000_000;
    const ctx = createTestContext({ now: () => now });
    const authorizeBody = await (await authorizeUpload(ctx)).json();
    now += 10 * 60 * 1000 + 1;

    const response = await putToUploadUrl(ctx, authorizeBody.uploadUrl);

    expect(response.status).toBe(403);
    expect(await ctx.bucket.get(authorizeBody.key)).toBeNull();
  });

  it('rejects replayed upload grant and preserves the first object', async () => {
    const ctx = createTestContext();
    const authorizeBody = await (await authorizeUpload(ctx)).json();

    const first = await putToUploadUrl(ctx, authorizeBody.uploadUrl);
    ctx.bucket.calls.length = 0;
    const replay = await putToUploadUrl(ctx, authorizeBody.uploadUrl, {
      body: new Uint8Array([9, 9, 9]),
    });

    expect(first.status).toBe(200);
    expect(replay.status).toBe(409);
    await expect(replay.json()).resolves.toMatchObject({
      error: 'replay_detected',
    });
    expect(ctx.bucket.calls).toEqual([]);
    expect(await (await ctx.bucket.get(authorizeBody.key)).text()).not.toBe(
      new TextDecoder().decode(new Uint8Array([9, 9, 9])),
    );
  });

  it('rejects replayed avatar upload grant before overwrite', async () => {
    const ctx = createTestContext();
    const authorizeBody = await (
      await authorizeUpload(ctx, {
        operationKind: 'avatar_permanent',
        fileName: 'avatar.png',
        contentType: 'image/png',
      })
    ).json();

    const first = await putToUploadUrl(ctx, authorizeBody.uploadUrl, {
      contentType: 'image/png',
      body: new Uint8Array([1, 1, 1]),
    });
    ctx.bucket.calls.length = 0;
    const replay = await putToUploadUrl(ctx, authorizeBody.uploadUrl, {
      contentType: 'image/png',
      body: new Uint8Array([9, 9, 9]),
    });

    expect(first.status).toBe(200);
    expect(replay.status).toBe(409);
    await expect(replay.json()).resolves.toMatchObject({
      error: 'replay_detected',
    });
    expect(ctx.bucket.calls).toEqual([]);
    expect(await (await ctx.bucket.get('avatars/owner-a/avatar')).text()).toBe(
      new TextDecoder().decode(new Uint8Array([1, 1, 1])),
    );
  });

  it('allows fresh avatar grants to replace the avatar singleton', async () => {
    const nonces = [
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    ];
    const ctx = createTestContext({ nonceGenerator: () => nonces.shift() });
    const firstGrant = await (
      await authorizeUpload(ctx, {
        operationKind: 'avatar_permanent',
        fileName: 'avatar.png',
        contentType: 'image/png',
      })
    ).json();
    const secondGrant = await (
      await authorizeUpload(ctx, {
        operationKind: 'avatar_permanent',
        fileName: 'avatar.png',
        contentType: 'image/png',
      })
    ).json();

    const first = await putToUploadUrl(ctx, firstGrant.uploadUrl, {
      contentType: 'image/png',
      body: new Uint8Array([1, 1, 1]),
    });
    const second = await putToUploadUrl(ctx, secondGrant.uploadUrl, {
      contentType: 'image/png',
      body: new Uint8Array([2, 2, 2]),
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await (await ctx.bucket.get('avatars/owner-a/avatar')).text()).toBe(
      new TextDecoder().decode(new Uint8Array([2, 2, 2])),
    );
  });

  it('rejects move without move grant and treats sourceKey/destKey as assertions only', async () => {
    const ctx = createTestContext();
    const sourceKey = `temp/listening-audio/owner-a/${FIXED_NONCE}-raw-source.mp3`;
    const destKey = `listening-audio/owner-a/${FIXED_NONCE}-raw-source.mp3`;
    await ctx.bucket.put(sourceKey, 'fixture');

    const response = await ctx.fetch('/move', {
      method: 'POST',
      headers: {
        ...bearer(),
        'Content-Type': 'application/json',
        Origin: APPROVED_ORIGIN,
      },
      body: JSON.stringify({ sourceKey, destKey }),
    });

    expect(response.status).toBe(400);
    expect(await ctx.bucket.get(sourceKey)).not.toBeNull();
    expect(await ctx.bucket.get(destKey)).toBeNull();
  });

  it('rejects replayed move grant before any second R2 access', async () => {
    const ctx = createTestContext();
    const authorizeBody = await (await authorizeUpload(ctx)).json();
    await putToUploadUrl(ctx, authorizeBody.uploadUrl);

    const firstMove = await ctx.fetch('/move', {
      method: 'POST',
      headers: {
        ...bearer(),
        'Content-Type': 'application/json',
        Origin: APPROVED_ORIGIN,
      },
      body: JSON.stringify({
        moveGrant: authorizeBody.moveGrant,
        sourceKey: authorizeBody.key,
        destKey: authorizeBody.key.slice('temp/'.length),
      }),
    });
    ctx.bucket.calls.length = 0;
    const replayMove = await ctx.fetch('/move', {
      method: 'POST',
      headers: {
        ...bearer(),
        'Content-Type': 'application/json',
        Origin: APPROVED_ORIGIN,
      },
      body: JSON.stringify({
        moveGrant: authorizeBody.moveGrant,
        sourceKey: authorizeBody.key,
        destKey: authorizeBody.key.slice('temp/'.length),
      }),
    });

    expect(firstMove.status).toBe(200);
    expect(replayMove.status).toBe(409);
    await expect(replayMove.json()).resolves.toMatchObject({
      error: 'replay_detected',
    });
    expect(ctx.bucket.calls).toEqual([]);
  });

  it('fails closed when replay protection binding is unavailable', async () => {
    const ctx = createTestContext({ replayLedger: null });
    const authorizeBody = await (await authorizeUpload(ctx)).json();

    const response = await putToUploadUrl(ctx, authorizeBody.uploadUrl);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: 'replay_protection_unavailable',
    });
    expect(await ctx.bucket.get(authorizeBody.key)).toBeNull();
  });

  it('enforces rate controls before issuing grants or touching R2', async () => {
    const calls = [];
    const ctx = createTestContext({
      rateLimiter: createRateLimiter({ allowed: false, calls }),
    });

    const response = await authorizeUpload(ctx);

    expect(response.status).toBe(429);
    expect(calls).toHaveLength(1);
    expect(calls[0].key).toContain('owner-a');
  });

  it('enforces the 50 MB ceiling on authorize and upload requests', async () => {
    const ctx = createTestContext();
    const oversizeAuthorize = await authorizeUpload(ctx, {
      sizeBytes: MAX_UPLOAD_BYTES + 1,
    });
    const authorizeBody = await (await authorizeUpload(ctx)).json();
    const oversizePut = await putToUploadUrl(ctx, authorizeBody.uploadUrl, {
      sizeBytes: MAX_UPLOAD_BYTES + 1,
    });

    expect(oversizeAuthorize.status).toBe(413);
    expect(oversizePut.status).toBe(413);
    expect(await ctx.bucket.get(authorizeBody.key)).toBeNull();
  });
});
