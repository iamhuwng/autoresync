import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { createUploadWorker } from '../worker.js';
import { createFirebaseVerifier } from '../src/upload-worker/firebase-verification.js';

const BASE_URL = 'https://r2-upload-signer.test';
const APPROVED_ORIGINS = [
  'https://kahut1.web.app',
  'http://localhost:5173',
  'http://localhost:5174',
];
const UNAPPROVED_ORIGIN = 'https://attacker.example';
const ALLOWED_CORS_METHODS = 'OPTIONS, POST, PUT';
const ALLOWED_CORS_HEADERS = 'Authorization, Content-Type, Content-Length';
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
  UPLOAD_GRANT_REPLAY_LEDGER: { consume: async () => ({ consumed: true }) },
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
const preflight = (origin, method = 'POST', headers = ALLOWED_CORS_HEADERS) =>
  fetchWorker('/upload/authorize', {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': method,
      'Access-Control-Request-Headers': headers,
    },
  });

const authorizePath = (params) => {
  const search = new URLSearchParams({
    contentType: 'application/octet-stream',
    sizeBytes: '0',
    ...params,
  });
  return `/?${search.toString()}`;
};

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

  it('never returns wildcard CORS on representative responses', async () => {
    const responses = [
      await preflight(APPROVED_ORIGINS[0]),
      await preflight(UNAPPROVED_ORIGIN),
      await fetchWorker('/?operationKind=test_audio_temp&fileName=no-auth.txt', {
        method: 'POST',
        headers: { Origin: APPROVED_ORIGINS[1] },
      }),
      await fetchWorker('/?operationKind=test_audio_temp&fileName=cli.txt', {
        method: 'POST',
        headers: bearer('valid-owner-a-token'),
      }),
    ];

    for (const response of responses) {
      expect(response.headers.get('Access-Control-Allow-Origin')).not.toBe('*');
    }
  });

  it.each(APPROVED_ORIGINS)('echoes approved origin %s exactly', async (origin) => {
    const response = await preflight(origin);

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe(
      ALLOWED_CORS_METHODS,
    );
    expect(response.headers.get('Access-Control-Allow-Headers')).toBe(
      ALLOWED_CORS_HEADERS,
    );
  });

  it('denies unapproved origin preflight', async () => {
    const response = await preflight(UNAPPROVED_ORIGIN);

    expect(response.status).toBe(403);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('denies unsupported preflight methods fail closed', async () => {
    const response = await preflight(APPROVED_ORIGINS[1], 'DELETE');

    expect([403, 405]).toContain(response.status);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('denies unapproved actual POST before auth and R2 access', async () => {
    const calls = [];
    const worker = createUploadWorker({
      nonceGenerator: () => FIXED_NONCE,
      firebaseVerifier: createFirebaseVerifier({
        verifyToken: async () => {
          calls.push(['auth']);
          return { valid: true, uid: 'owner-a' };
        },
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
      new Request(`${BASE_URL}/?operationKind=test_audio_temp&fileName=blocked.txt`, {
        method: 'POST',
        headers: {
          ...bearer('valid-owner-a-token'),
          Origin: UNAPPROVED_ORIGIN,
        },
      }),
      fakeEnv,
    );

    expect(response.status).toBe(403);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(calls).toEqual([]);
  });

  it('denies unapproved actual PUT before auth and R2 access', async () => {
    const calls = [];
    const worker = createUploadWorker({
      nonceGenerator: () => FIXED_NONCE,
      firebaseVerifier: createFirebaseVerifier({
        verifyToken: async () => {
          calls.push(['auth']);
          return { valid: true, uid: 'owner-a' };
        },
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
        `${BASE_URL}/?key=${encodeURIComponent(
          `temp/audio/owner-a/${FIXED_NONCE}-blocked.txt`,
        )}`,
        {
          method: 'PUT',
          headers: {
            ...bearer('valid-owner-a-token'),
            Origin: UNAPPROVED_ORIGIN,
          },
          body: new Uint8Array(),
        },
      ),
      fakeEnv,
    );

    expect(response.status).toBe(403);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(calls).toEqual([]);
  });

  it('preserves no-Origin non-browser compatibility without wildcard CORS', async () => {
    const response = await fetchWorker(
      authorizePath({ operationKind: 'test_audio_temp', fileName: 'cli.txt' }),
      {
        method: 'POST',
        headers: bearer('valid-owner-a-token'),
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
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
      authorizePath({
        operationKind: 'test_audio_temp',
        fileName: 'harness-smoke.txt',
      }),
      { method: 'POST', headers: bearer('valid-owner-a-token') },
    );

    expect(authorizeResponse.status).toBe(200);
    const authorizeBody = await authorizeResponse.json();
    expect(authorizeBody).toMatchObject({
      key: `temp/audio/owner-a/${FIXED_NONCE}-harness-smoke.txt`,
    });
    expect(authorizeBody.uploadUrl).toContain('/upload?grant=');
    expect(authorizeBody.uploadUrl).not.toContain('key=');
    expect(authorizeBody.moveGrant).toEqual(expect.any(String));

    const uploadResponse = await fetchWorker(new URL(authorizeBody.uploadUrl).pathname + new URL(authorizeBody.uploadUrl).search, {
      method: 'PUT',
      headers: {
        ...bearer('valid-owner-a-token'),
        'Content-Type': 'application/octet-stream',
        'Content-Length': '0',
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
      authorizePath({ filename: 'temp/audio/Legacy Name.MP3' }),
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
      authorizePath({ filename: authorizeKey, ownerId: 'owner-b' }),
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
    expect([403, 405]).toContain(uploadResponse.status);
    expect([400, 403]).toContain(moveResponse.status);
    expect(await env.R2_BUCKET.get(uploadKey)).toBeNull();
    expect(await env.R2_BUCKET.get(sourceKey)).not.toBeNull();
    expect(await env.R2_BUCKET.get(destKey)).toBeNull();
  });

  it('moves an uploaded object through authenticated same-owner scope', async () => {
    const sourceKey = `temp/audio/owner-a/${FIXED_NONCE}-harness-move.txt`;
    const destKey = `audio/owner-a/${FIXED_NONCE}-harness-move.txt`;
    const authorizeResponse = await fetchWorker(
      authorizePath({
        operationKind: 'test_audio_temp',
        fileName: 'harness-move.txt',
      }),
      { method: 'POST', headers: bearer('valid-owner-a-token') },
    );
    const authorizeBody = await authorizeResponse.json();
    await fetchWorker(
      new URL(authorizeBody.uploadUrl).pathname + new URL(authorizeBody.uploadUrl).search,
      {
        method: 'PUT',
        headers: {
          ...bearer('valid-owner-a-token'),
          'Content-Type': 'application/octet-stream',
          'Content-Length': '0',
        },
        body: new Uint8Array(),
      },
    );

    const moveResponse = await fetchWorker('/move', {
      method: 'POST',
      headers: {
        ...bearer('valid-owner-a-token'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        moveGrant: authorizeBody.moveGrant,
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
        `${BASE_URL}${authorizePath({
          operationKind: 'test_audio_temp',
          fileName: '../private.mp3',
        })}`,
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
    const authorizeBody = await (
      await fetchWorker(
        authorizePath({
          operationKind: 'test_image_temp',
          fileName: 'existing.png',
        }),
        { method: 'POST', headers: bearer('valid-owner-a-token') },
      )
    ).json();
    await env.R2_BUCKET.put(sourceKey, 'source');
    await env.R2_BUCKET.put(destKey, 'existing-destination');

    const response = await fetchWorker('/move', {
      method: 'POST',
      headers: {
        ...bearer('valid-owner-a-token'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ moveGrant: authorizeBody.moveGrant, sourceKey, destKey }),
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
