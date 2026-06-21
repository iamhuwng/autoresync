import { describe, expect, it, vi } from 'vitest';
import { createUploadWorker } from '../worker.js';
import { issueGrant, MAX_UPLOAD_BYTES } from '../src/upload-worker/grant-authority.js';

const BASE_URL = 'https://r2-upload-signer.test';
const APPROVED_ORIGIN = 'http://localhost:5173';
const NOW = 1_800_000_000_000;
const NONCE = '0123456789abcdef0123456789abcdef';
const OTHER_NONCE = 'fedcba9876543210fedcba9876543210';
const SECRET = 'TEST_ONLY_NOT_A_SECRET';

const bearer = (token = 'owner-a-token') => ({ Authorization: `Bearer ${token}` });

const createBucket = () => {
  const objects = new Map();
  const calls = [];
  return {
    calls,
    objects,
    async get(key) {
      calls.push(['get', key]);
      const object = objects.get(key);
      if (!object) return null;
      return {
        body: object.body,
        httpMetadata: object.httpMetadata,
        customMetadata: object.customMetadata,
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

const createContext = ({
  now = () => NOW,
  nonceGenerator = () => NONCE,
  rateAllowed = true,
} = {}) => {
  const bucket = createBucket();
  const authCalls = [];
  const rateCalls = [];
  const consumed = new Set();
  const firebaseVerifier = {
    verifyAuthorizationHeader: vi.fn(async (header) => {
      authCalls.push(header);
      if (header === 'Bearer owner-a-token') return { valid: true, uid: 'owner-a' };
      if (header === 'Bearer owner-b-token') return { valid: true, uid: 'owner-b' };
      return { valid: false, reason: 'invalid_token' };
    }),
  };
  const env = {
    R2_BUCKET: bucket,
    PUBLIC_URL: 'https://public.example.test',
    FIREBASE_PROJECT_ID: 'test-project',
    UPLOAD_GRANT_SECRET: SECRET,
    UPLOAD_RATE_LIMITER: {
      async limit(input) {
        rateCalls.push(input);
        return { success: rateAllowed };
      },
    },
    UPLOAD_GRANT_REPLAY_LEDGER: {
      async consume({ key }) {
        if (consumed.has(key)) return { consumed: false };
        consumed.add(key);
        return { consumed: true };
      },
    },
  };
  const worker = createUploadWorker({ firebaseVerifier, nonceGenerator, now });

  return {
    authCalls,
    bucket,
    env,
    rateCalls,
    async fetch(path, init = {}) {
      return worker.fetch(new Request(`${BASE_URL}${path}`, init), env);
    },
  };
};

const authorize = (ctx, overrides = {}, request = {}) =>
  ctx.fetch(request.path ?? '/upload/authorize', {
    method: 'POST',
    headers: {
      ...bearer(request.token),
      'Content-Type': 'application/json',
      ...(request.origin === false ? {} : { Origin: APPROVED_ORIGIN }),
      ...request.headers,
    },
    body: JSON.stringify({
      operationKind: 'listening_audio_temp',
      fileName: 'lesson.mp3',
      contentType: 'audio/mpeg',
      sizeBytes: 3,
      ...overrides,
    }),
  });

const upload = (ctx, uploadUrl, request = {}) => {
  const url = new URL(uploadUrl);
  const rawKey = request.rawKey
    ? `&key=${encodeURIComponent(request.rawKey)}`
    : '';
  return ctx.fetch(`${url.pathname}${url.search}${rawKey}`, {
    method: 'PUT',
    headers: {
      ...bearer(request.token),
      'Content-Type': request.contentType ?? 'audio/mpeg',
      'Content-Length': String(request.sizeBytes ?? 3),
      Origin: APPROVED_ORIGIN,
    },
    body: request.body ?? new Uint8Array([1, 2, 3]),
  });
};

const signedGrant = (ctx, payload) =>
  issueGrant({
    env: ctx.env,
    payload: {
      uid: 'owner-a',
      contentType: 'audio/mpeg',
      sizeBytes: 3,
      expiresAt: NOW + 60_000,
      nonce: NONCE,
      ...payload,
    },
  });

describe('Packet 2I integrated authentication and authority closure', () => {
  it('keeps OPTIONS governed only by exact-origin CORS preflight policy', async () => {
    const ctx = createContext();
    const allowed = await ctx.fetch('/upload/authorize', {
      method: 'OPTIONS',
      headers: {
        Origin: APPROVED_ORIGIN,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Authorization, Content-Type',
      },
    });
    const denied = await ctx.fetch('/upload/authorize', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://attacker.example',
        'Access-Control-Request-Method': 'POST',
      },
    });

    expect(allowed.status).toBe(204);
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe(APPROVED_ORIGIN);
    expect(denied.status).toBe(403);
    expect(ctx.authCalls).toEqual([]);
    expect(ctx.rateCalls).toEqual([]);
    expect(ctx.bucket.calls).toEqual([]);
  });

  it.each([
    ['authorize route', '/upload/authorize', { method: 'POST' }],
    ['legacy authorize route', '/', { method: 'POST' }],
    ['upload route', '/upload?grant=missing', { method: 'PUT' }],
    ['move route', '/move', { method: 'POST' }],
    ['unsupported GET', '/', { method: 'GET' }],
    ['unsupported DELETE', '/upload', { method: 'DELETE' }],
    ['unsupported path and method', '/unknown', { method: 'PATCH' }],
  ])('authenticates %s before rate, routing, grant handling, or R2', async (_name, path, init) => {
    const ctx = createContext();
    const response = await ctx.fetch(path, init);

    expect(response.status).toBe(401);
    expect(ctx.authCalls).toEqual([null]);
    expect(ctx.rateCalls).toEqual([]);
    expect(ctx.bucket.calls).toEqual([]);
  });

  it('uses verified sub as sole owner despite browser identity fields', async () => {
    const ctx = createContext();
    const response = await authorize(
      ctx,
      {
        ownerId: 'owner-b',
        uid: 'owner-b',
        email: 'owner-b@example.test',
        role: 'admin',
      },
      {
        path: '/upload/authorize?ownerId=owner-b&uid=owner-b&email=owner-b%40example.test&role=admin',
        headers: {
          'X-Owner-Id': 'owner-b',
          'X-Uid': 'owner-b',
          'X-Email': 'owner-b@example.test',
          'X-Role': 'admin',
        },
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      key: `temp/listening-audio/owner-a/${NONCE}-lesson.mp3`,
    });
    expect(ctx.bucket.calls).toEqual([]);
  });

  it('lets filename affect only sanitized basename after operation, prefix, and owner derivation', async () => {
    const ctx = createContext();
    const accepted = await authorize(ctx, {
      operationKind: 'test_audio_temp',
      fileName: '  Lesson FINAL (1).MP3  ',
    });
    const crossOwner = await authorize(ctx, {}, {
      path: '/?filename=temp/audio/owner-b/lesson.mp3&contentType=audio/mpeg&sizeBytes=3',
    });
    const forbiddenPrefix = await authorize(ctx, {}, {
      path: '/?filename=private/owner-a/lesson.mp3&contentType=audio/mpeg&sizeBytes=3',
    });

    expect(accepted.status).toBe(200);
    await expect(accepted.json()).resolves.toMatchObject({
      key: `temp/audio/owner-a/${NONCE}-lesson-final-1.mp3`,
    });
    expect(crossOwner.status).toBe(403);
    expect(forbiddenPrefix.status).toBe(403);
    expect(ctx.bucket.calls).toEqual([]);
  });

  it('rejects cross-owner upload and move grants before every R2 call', async () => {
    const ctx = createContext();
    const authorization = await (await authorize(ctx)).json();

    const uploadResponse = await upload(ctx, authorization.uploadUrl, {
      token: 'owner-b-token',
    });
    const moveResponse = await ctx.fetch('/move', {
      method: 'POST',
      headers: {
        ...bearer('owner-b-token'),
        'Content-Type': 'application/json',
        Origin: APPROVED_ORIGIN,
      },
      body: JSON.stringify({ moveGrant: authorization.moveGrant }),
    });

    expect(uploadResponse.status).toBe(403);
    expect(moveResponse.status).toBe(403);
    expect(ctx.bucket.calls).toEqual([]);
  });

  it('rejects raw key upload authority before every R2 call', async () => {
    const ctx = createContext();
    const rawKey = `temp/audio/owner-a/${NONCE}-raw.mp3`;
    const response = await ctx.fetch(`/upload?key=${encodeURIComponent(rawKey)}`, {
      method: 'PUT',
      headers: {
        ...bearer(),
        'Content-Type': 'audio/mpeg',
        'Content-Length': '3',
        Origin: APPROVED_ORIGIN,
      },
      body: new Uint8Array([1, 2, 3]),
    });

    expect(response.status).toBe(400);
    expect(ctx.bucket.calls).toEqual([]);
  });

  it('rejects raw move authority and mismatched assertions before every R2 call', async () => {
    const ctx = createContext();
    const authorization = await (await authorize(ctx)).json();
    const rawOnly = await ctx.fetch('/move', {
      method: 'POST',
      headers: {
        ...bearer(),
        'Content-Type': 'application/json',
        Origin: APPROVED_ORIGIN,
      },
      body: JSON.stringify({
        sourceKey: `temp/audio/owner-a/${OTHER_NONCE}-raw.mp3`,
        destKey: `audio/owner-a/${OTHER_NONCE}-raw.mp3`,
      }),
    });
    const sourceMismatch = await ctx.fetch('/move', {
      method: 'POST',
      headers: {
        ...bearer(),
        'Content-Type': 'application/json',
        Origin: APPROVED_ORIGIN,
      },
      body: JSON.stringify({
        moveGrant: authorization.moveGrant,
        sourceKey: `temp/listening-audio/owner-a/${OTHER_NONCE}-other.mp3`,
      }),
    });
    const destinationMismatch = await ctx.fetch('/move', {
      method: 'POST',
      headers: {
        ...bearer(),
        'Content-Type': 'application/json',
        Origin: APPROVED_ORIGIN,
      },
      body: JSON.stringify({
        moveGrant: authorization.moveGrant,
        destKey: `listening-audio/owner-a/${OTHER_NONCE}-other.mp3`,
      }),
    });

    expect(rawOnly.status).toBe(400);
    expect(sourceMismatch.status).toBe(400);
    expect(destinationMismatch.status).toBe(400);
    expect(ctx.bucket.calls).toEqual([]);
  });

  it.each([
    ['noncanonical', `temp/audio/owner-a/${NONCE}-Lesson.MP3`, 400],
    ['forbidden prefix', `private/owner-a/${NONCE}-lesson.mp3`, 400],
    ['cross-owner', `temp/audio/owner-b/${NONCE}-lesson.mp3`, 403],
    ['direct durable', `audio/owner-a/${NONCE}-lesson.mp3`, 400],
  ])('rejects validly signed %s upload grant before R2', async (_name, key, status) => {
    const ctx = createContext();
    const grant = await signedGrant(ctx, {
      kind: 'upload',
      operationKind: 'test_audio_temp',
      key,
    });
    const response = await upload(ctx, `${BASE_URL}/upload?grant=${grant}`);

    expect(response.status).toBe(status);
    expect(ctx.bucket.calls).toEqual([]);
  });

  it.each([
    [
      'cross-owner',
      `temp/audio/owner-b/${NONCE}-lesson.mp3`,
      `audio/owner-b/${NONCE}-lesson.mp3`,
      403,
    ],
    [
      'cross-prefix',
      `temp/audio/owner-a/${NONCE}-lesson.mp3`,
      `images/owner-a/${NONCE}-lesson.mp3`,
      400,
    ],
    [
      'forbidden prefix',
      `temp/audio/owner-a/${NONCE}-lesson.mp3`,
      `private/owner-a/${NONCE}-lesson.mp3`,
      400,
    ],
  ])('rejects validly signed %s move grant before R2', async (_name, sourceKey, destKey, status) => {
    const ctx = createContext();
    const grant = await signedGrant(ctx, {
      kind: 'move',
      operationKind: 'test_audio_temp',
      sourceKey,
      destKey,
    });
    const response = await ctx.fetch('/move', {
      method: 'POST',
      headers: {
        ...bearer(),
        'Content-Type': 'application/json',
        Origin: APPROVED_ORIGIN,
      },
      body: JSON.stringify({ moveGrant: grant }),
    });

    expect(response.status).toBe(status);
    expect(ctx.bucket.calls).toEqual([]);
  });

  it('uses only grant-derived canonical path for successful upload', async () => {
    const ctx = createContext();
    const authorization = await (await authorize(ctx)).json();
    const rawKey = `temp/listening-audio/owner-a/${OTHER_NONCE}-raw.mp3`;
    const response = await upload(ctx, authorization.uploadUrl, { rawKey });

    expect(response.status).toBe(200);
    expect(ctx.bucket.calls).toEqual([
      ['get', authorization.key],
      ['put', authorization.key],
    ]);
    expect(ctx.bucket.objects.has(authorization.key)).toBe(true);
    expect(ctx.bucket.objects.has(rawKey)).toBe(false);
  });

  it('uses only grant-derived canonical paths for successful move', async () => {
    const ctx = createContext();
    const authorization = await (await authorize(ctx)).json();
    expect((await upload(ctx, authorization.uploadUrl)).status).toBe(200);
    ctx.bucket.calls.length = 0;
    const destinationKey = authorization.key.slice('temp/'.length);

    const response = await ctx.fetch('/move', {
      method: 'POST',
      headers: {
        ...bearer(),
        'Content-Type': 'application/json',
        Origin: APPROVED_ORIGIN,
      },
      body: JSON.stringify({ moveGrant: authorization.moveGrant }),
    });

    expect(response.status).toBe(200);
    expect(ctx.bucket.calls).toEqual([
      ['get', destinationKey],
      ['get', authorization.key],
      ['put', destinationKey],
      ['delete', authorization.key],
    ]);
    expect(ctx.bucket.objects.has(authorization.key)).toBe(false);
    expect(ctx.bucket.objects.has(destinationKey)).toBe(true);
  });

  it('preserves traversal and existing-destination overwrite denial before mutation', async () => {
    const ctx = createContext();
    const traversal = await authorize(ctx, { fileName: '../private.mp3' });
    expect(traversal.status).toBe(400);
    expect(ctx.bucket.calls).toEqual([]);

    const authorization = await (await authorize(ctx)).json();
    ctx.bucket.objects.set(authorization.key, { body: 'existing' });
    const overwrite = await upload(ctx, authorization.uploadUrl);
    expect(overwrite.status).toBe(409);
    expect(ctx.bucket.calls).toEqual([['get', authorization.key]]);
    expect(ctx.bucket.objects.get(authorization.key).body).toBe('existing');
  });

  it('preserves exact-origin and no-Origin compatibility', async () => {
    const approved = createContext();
    const approvedResponse = await authorize(approved);
    const noOrigin = createContext();
    const noOriginResponse = await authorize(noOrigin, {}, { origin: false });
    const rejected = createContext();
    const rejectedResponse = await authorize(rejected, {}, {
      headers: { Origin: 'https://attacker.example' },
    });

    expect(approvedResponse.status).toBe(200);
    expect(approvedResponse.headers.get('Access-Control-Allow-Origin')).toBe(APPROVED_ORIGIN);
    expect(noOriginResponse.status).toBe(200);
    expect(noOriginResponse.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(rejectedResponse.status).toBe(403);
    expect(rejected.authCalls).toEqual([]);
    expect(rejected.bucket.calls).toEqual([]);
  });

  it('preserves expiry and replay denial before R2 access', async () => {
    let clock = NOW;
    const expired = createContext({ now: () => clock });
    const expiredAuthorization = await (await authorize(expired)).json();
    clock += 10 * 60 * 1000 + 1;
    const expiredResponse = await upload(expired, expiredAuthorization.uploadUrl);
    expect(expiredResponse.status).toBe(403);
    expect(expired.bucket.calls).toEqual([]);

    const replay = createContext();
    const replayAuthorization = await (await authorize(replay)).json();
    expect((await upload(replay, replayAuthorization.uploadUrl)).status).toBe(200);
    replay.bucket.calls.length = 0;
    const replayResponse = await upload(replay, replayAuthorization.uploadUrl);
    expect(replayResponse.status).toBe(409);
    expect(replay.bucket.calls).toEqual([]);
  });

  it('preserves rate-limit and 50 MB denial before R2 access', async () => {
    const limited = createContext({ rateAllowed: false });
    const limitedResponse = await authorize(limited);
    expect(limitedResponse.status).toBe(429);
    expect(limited.rateCalls).toHaveLength(1);
    expect(limited.bucket.calls).toEqual([]);

    const oversized = createContext();
    const oversizedAuthorize = await authorize(oversized, {
      sizeBytes: MAX_UPLOAD_BYTES + 1,
    });
    expect(oversizedAuthorize.status).toBe(413);
    const authorization = await (await authorize(oversized)).json();
    const oversizedUpload = await upload(oversized, authorization.uploadUrl, {
      sizeBytes: MAX_UPLOAD_BYTES + 1,
    });
    expect(oversizedUpload.status).toBe(413);
    expect(oversized.bucket.calls).toEqual([]);
  });
});
