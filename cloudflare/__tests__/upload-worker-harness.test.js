import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { createUploadWorker } from '../worker.js';
import { createFirebaseVerifier } from '../src/upload-worker/firebase-verification.js';

const BASE_URL = 'https://r2-upload-signer.test';

const tokenUidMap = {
  'valid-owner-a-token': 'owner-a',
  'valid-owner-b-token': 'owner-b',
};

const testEnv = () => ({
  R2_BUCKET: env.R2_BUCKET,
  PUBLIC_URL: env.PUBLIC_URL,
  FIREBASE_PROJECT_ID: env.FIREBASE_PROJECT_ID,
  UPLOAD_GRANT_SECRET: env.UPLOAD_GRANT_SECRET,
  UPLOAD_RATE_LIMITER: env.UPLOAD_RATE_LIMITER,
});

const FIXED_NONCE = '00112233445566778899aabbccddeeff';

const createTestWorker = () =>
  createUploadWorker({
    nonceGenerator: () => FIXED_NONCE,
    firebaseVerifier: createFirebaseVerifier({
      verifyToken: async (token) => {
        const uid = tokenUidMap[token];
        return uid ? { valid: true, uid } : { valid: false, reason: 'invalid_token' };
      },
    }),
  });

const fetchWorker = (path, init = {}) =>
  createTestWorker().fetch(new Request(`${BASE_URL}${path}`, init), testEnv());

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

describe('r2-upload-signer native R2 harness', () => {
  it('injects the test-only upload grant secret', () => {
    expect(env.UPLOAD_GRANT_SECRET).toBe('TEST_ONLY_NOT_A_SECRET');
  });

  it('provides a usable local rate-limit binding', async () => {
    const rateLimiter = env.UPLOAD_RATE_LIMITER;

    expect(rateLimiter).toBeDefined();
    if (!rateLimiter) return;
    expect(typeof rateLimiter.limit).toBe('function');

    await expect(
      rateLimiter.limit({ key: 'task-2.3-harness' }),
    ).resolves.toEqual({ success: true });
  });

  it('missing auth denied before upload or move R2 access', async () => {
    const missingUploadKey = 'temp/audio/owner-a/harness-missing-auth.txt';
    const sourceKey = 'temp/audio/owner-a/harness-missing-auth-move.txt';
    const destKey = 'audio/owner-a/harness-missing-auth-move.txt';
    await env.R2_BUCKET.put(sourceKey, 'fixture');

    const missingUpload = await fetchWorker(`/?key=${encodeURIComponent(missingUploadKey)}`, {
      method: 'PUT',
      body: new Uint8Array(),
    });
    const missingMove = await fetchWorker('/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceKey, destKey }),
    });

    expect(missingUpload.status).toBe(401);
    expect(missingMove.status).toBe(401);
    expect(await env.R2_BUCKET.get(missingUploadKey)).toBeNull();
    expect(await env.R2_BUCKET.get(sourceKey)).not.toBeNull();
    expect(await env.R2_BUCKET.get(destKey)).toBeNull();
  });

  it.each([
    ['invalid auth denied', 'not-a-firebase-token'],
    ['expired Firebase token denied', 'firebase.expired.signature'],
    ['wrong Firebase audience denied', 'firebase.wrong-audience.signature'],
  ])('%s', async (_name, token) => {
    const uploadKey = `temp/audio/owner-a/harness-${token.replaceAll('.', '-')}.txt`;
    const response = await fetchWorker(`/?key=${encodeURIComponent(uploadKey)}`, {
      method: 'PUT',
      headers: bearer(token),
      body: new Uint8Array(),
    });

    expect(response.status).toBe(401);
    expect(await env.R2_BUCKET.get(uploadKey)).toBeNull();
  });

  it('uploads through the Worker entrypoint using authenticated same-owner scope', async () => {
    const authorizeResponse = await fetchWorker(
      '/?operationKind=test_audio_temp&fileName=harness-smoke.txt',
      { method: 'POST', headers: bearer('valid-owner-a-token') },
    );

    expect(authorizeResponse.status).toBe(200);
    const authorizeBody = await authorizeResponse.json();
    expect(authorizeBody).toMatchObject({
      key: `temp/audio/owner-a/${FIXED_NONCE}-harness-smoke.txt`,
    });
    expect(authorizeBody.uploadUrl).toContain(
      `key=temp%2Faudio%2Fowner-a%2F${FIXED_NONCE}-harness-smoke.txt`,
    );

    const uploadResponse = await fetchWorker(new URL(authorizeBody.uploadUrl).pathname + new URL(authorizeBody.uploadUrl).search, {
      method: 'PUT',
      headers: {
        ...bearer('valid-owner-a-token'),
        'Content-Type': 'application/octet-stream',
      },
      body: new Uint8Array(),
    });

    expect(uploadResponse.status).toBe(200);
    const storedObject = await env.R2_BUCKET.get(
      `temp/audio/owner-a/${FIXED_NONCE}-harness-smoke.txt`,
    );
    expect(storedObject).not.toBeNull();
    expect(storedObject?.httpMetadata?.contentType).toBe(
      'application/octet-stream',
    );
  });

  it('canonicalizes a legacy temp hint with verified uid and generated nonce', async () => {
    const response = await fetchWorker(
      '/?filename=temp%2Faudio%2FLegacy%20Name.MP3',
      { method: 'POST', headers: bearer('valid-owner-a-token') },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      key: `temp/audio/owner-a/${FIXED_NONCE}-legacy-name.mp3`,
    });
  });

  it('rejects cross-owner upload and move requests without mutating R2', async () => {
    const authorizeKey = 'temp/audio/owner-b/harness-cross-owner-authorize.txt';
    const uploadKey = `temp/audio/owner-b/${FIXED_NONCE}-harness-cross-owner.txt`;
    const sourceKey = `temp/audio/owner-b/${FIXED_NONCE}-harness-cross-owner-move.txt`;
    const destKey = `audio/owner-b/${FIXED_NONCE}-harness-cross-owner-move.txt`;
    await env.R2_BUCKET.put(sourceKey, 'fixture');

    const authorizeResponse = await fetchWorker(
      `/?filename=${encodeURIComponent(authorizeKey)}&ownerId=owner-b`,
      {
        method: 'POST',
        headers: bearer('valid-owner-a-token'),
      },
    );
    const uploadResponse = await fetchWorker(`/?key=${encodeURIComponent(uploadKey)}`, {
      method: 'PUT',
      headers: bearer('valid-owner-a-token'),
      body: new Uint8Array(),
    });
    const moveResponse = await fetchWorker('/move', {
      method: 'POST',
      headers: {
        ...bearer('valid-owner-a-token'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sourceKey,
        destKey,
        ownerId: 'owner-b',
        uid: 'owner-b',
        email: 'owner-b@example.test',
        role: 'teacher',
      }),
    });

    expect(authorizeResponse.status).toBe(403);
    expect(uploadResponse.status).toBe(403);
    expect(moveResponse.status).toBe(403);
    expect(await env.R2_BUCKET.get(uploadKey)).toBeNull();
    expect(await env.R2_BUCKET.get(sourceKey)).not.toBeNull();
    expect(await env.R2_BUCKET.get(destKey)).toBeNull();
  });

  it('moves an uploaded object through authenticated same-owner scope', async () => {
    const sourceKey = `temp/audio/owner-a/${FIXED_NONCE}-harness-move.txt`;
    const destKey = `audio/owner-a/${FIXED_NONCE}-harness-move.txt`;
    await env.R2_BUCKET.put(
      sourceKey,
      new Uint8Array(),
      { httpMetadata: { contentType: 'application/octet-stream' } },
    );

    const moveResponse = await fetchWorker('/move', {
      method: 'POST',
      headers: {
        ...bearer('valid-owner-a-token'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sourceKey,
        destKey,
      }),
    });

    expect(moveResponse.status).toBe(200);
    const moveBody = await moveResponse.json();
    expect(moveBody.success).toBe(true);
    expect(await env.R2_BUCKET.get(sourceKey)).toBeNull();
    expect(await env.R2_BUCKET.get(destKey)).not.toBeNull();
  });

  it('rejects invalid path requests before any R2 access', async () => {
    const calls = [];
    const worker = createUploadWorker({
      nonceGenerator: () => FIXED_NONCE,
      firebaseVerifier: createFirebaseVerifier({
        verifyToken: async () => ({ valid: true, uid: 'owner-a' }),
      }),
    });
    const fakeEnv = {
      ...testEnv(),
      R2_BUCKET: {
        get: async (...args) => calls.push(['get', ...args]),
        put: async (...args) => calls.push(['put', ...args]),
        delete: async (...args) => calls.push(['delete', ...args]),
      },
    };

    const response = await worker.fetch(
      new Request(
        `${BASE_URL}/?operationKind=test_audio_temp&fileName=${encodeURIComponent('../private.mp3')}`,
        { method: 'POST', headers: bearer('valid-owner-a-token') },
      ),
      fakeEnv,
    );

    expect(response.status).toBe(400);
    expect(calls).toEqual([]);
  });

  it('rejects cross-prefix and noncanonical movement before R2 access', async () => {
    const calls = [];
    const worker = createUploadWorker({
      nonceGenerator: () => FIXED_NONCE,
      firebaseVerifier: createFirebaseVerifier({
        verifyToken: async () => ({ valid: true, uid: 'owner-a' }),
      }),
    });
    const fakeEnv = {
      ...testEnv(),
      R2_BUCKET: {
        get: async (...args) => calls.push(['get', ...args]),
        put: async (...args) => calls.push(['put', ...args]),
        delete: async (...args) => calls.push(['delete', ...args]),
      },
    };
    const sourceKey = `temp/audio/owner-a/${FIXED_NONCE}-move.mp3`;

    const response = await worker.fetch(
      new Request(`${BASE_URL}/move`, {
        method: 'POST',
        headers: {
          ...bearer('valid-owner-a-token'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sourceKey,
          destKey: `images/owner-a/${FIXED_NONCE}-move.mp3`,
        }),
      }),
      fakeEnv,
    );

    expect(response.status).toBe(400);
    expect(calls).toEqual([]);
  });

  it('rejects existing move destination without overwriting or deleting source', async () => {
    const sourceKey = `temp/images/owner-a/${FIXED_NONCE}-existing.png`;
    const destKey = `images/owner-a/${FIXED_NONCE}-existing.png`;
    await env.R2_BUCKET.put(sourceKey, 'source');
    await env.R2_BUCKET.put(destKey, 'existing-destination');

    const response = await fetchWorker('/move', {
      method: 'POST',
      headers: {
        ...bearer('valid-owner-a-token'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sourceKey, destKey }),
    });

    expect(response.status).toBe(409);
    expect(await (await env.R2_BUCKET.get(sourceKey)).text()).toBe('source');
    expect(await (await env.R2_BUCKET.get(destKey)).text()).toBe(
      'existing-destination',
    );
  });

  it('exposes an injectable Firebase verification seam for later auth tests', async () => {
    const verifier = createFirebaseVerifier({
      verifyToken: async () => ({ uid: 'test-uid' }),
    });

    await expect(verifier.verifyToken()).resolves.toEqual({
      uid: 'test-uid',
    });
  });
});
