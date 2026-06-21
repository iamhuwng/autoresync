import { afterEach, describe, expect, it, vi } from 'vitest';
import { createUploadWorker } from '../worker.js';
import { issueGrant, MAX_UPLOAD_BYTES } from '../src/upload-worker/grant-authority.js';

const BASE_URL = 'https://r2-upload-signer.test';
const APPROVED_ORIGIN = 'http://localhost:5173';
const UNAPPROVED_ORIGIN = 'https://attacker.example';
const NOW = 1_800_000_000_000;
const NONCE = '0123456789abcdef0123456789abcdef';
const OTHER_NONCE = 'fedcba9876543210fedcba9876543210';
const SECRET = 'TEST_ONLY_NOT_A_SECRET';
const DENIED_STATUSES = [400, 401, 403];

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
  validToken = 'owner-a-token',
  verifiedUid = 'owner-a',
  grantSecret = SECRET,
  publicUrl = 'https://public.example.test',
} = {}) => {
  const bucket = createBucket();
  const consumed = new Set();
  const firebaseVerifier = {
    verifyAuthorizationHeader: vi.fn(async (header) => {
      if (header === `Bearer ${validToken}`) return { valid: true, uid: verifiedUid };
      if (header === 'Bearer owner-b-token') return { valid: true, uid: 'owner-b' };
      return { valid: false, reason: 'invalid_token' };
    }),
  };
  const env = {
    R2_BUCKET: bucket,
    PUBLIC_URL: publicUrl,
    FIREBASE_PROJECT_ID: 'test-project',
    UPLOAD_GRANT_SECRET: grantSecret,
    UPLOAD_RATE_LIMITER: { limit: async () => ({ success: true }) },
    UPLOAD_GRANT_REPLAY_LEDGER: {
      async consume({ key }) {
        if (consumed.has(key)) return { consumed: false };
        consumed.add(key);
        return { consumed: true };
      },
    },
  };
  const worker = createUploadWorker({
    firebaseVerifier,
    nonceGenerator: () => NONCE,
    now,
  });
  return {
    bucket,
    env,
    fetch(path, init = {}) {
      return worker.fetch(new Request(`${BASE_URL}${path}`, init), env);
    },
  };
};

const expectDenied = (response) => expect(DENIED_STATUSES).toContain(response.status);
const expectNoR2Access = (ctx) => expect(ctx.bucket.calls).toEqual([]);
const expectNoR2Mutation = (ctx) => {
  expect(ctx.bucket.calls.filter(([method]) => method === 'put' || method === 'delete')).toEqual([]);
};

const authorize = (ctx, body = {}, { token = 'owner-a-token' } = {}) =>
  ctx.fetch('/upload/authorize', {
    method: 'POST',
    headers: {
      ...bearer(token),
      'Content-Type': 'application/json',
      Origin: APPROVED_ORIGIN,
    },
    body: JSON.stringify({
      operationKind: 'listening_audio_temp',
      fileName: 'lesson.mp3',
      contentType: 'audio/mpeg',
      sizeBytes: 3,
      ...body,
    }),
  });

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

const putWithGrant = (ctx, grant, { token = 'owner-a-token', headers = {}, body } = {}) =>
  ctx.fetch(`/upload?grant=${encodeURIComponent(grant)}`, {
    method: 'PUT',
    headers: {
      ...bearer(token),
      'Content-Type': 'audio/mpeg',
      'Content-Length': '3',
      Origin: APPROVED_ORIGIN,
      ...headers,
    },
    body: body ?? new Uint8Array([1, 2, 3]),
  });

afterEach(() => vi.restoreAllMocks());

describe('PRD-0056 hardened Worker negative contract', () => {
  it('missing auth denied', async () => {
    const ctx = createContext();
    const response = await ctx.fetch('/upload/authorize', {
      method: 'POST',
      headers: { Origin: APPROVED_ORIGIN },
    });
    expect(response.status).toBe(401);
    expectNoR2Access(ctx);
  });

  it('invalid auth denied', async () => {
    const ctx = createContext();
    const response = await authorize(ctx, {}, { token: 'invalid-token' });
    expect(response.status).toBe(401);
    expectNoR2Access(ctx);
  });

  it('expired Firebase token denied', async () => {
    const ctx = createContext();
    const response = await authorize(ctx, {}, { token: 'firebase.expired.signature' });
    expect(response.status).toBe(401);
    expectNoR2Access(ctx);
  });

  it('wrong Firebase audience denied', async () => {
    const ctx = createContext();
    const response = await authorize(ctx, {}, { token: 'firebase.wrong-audience.signature' });
    expect(response.status).toBe(401);
    expectNoR2Access(ctx);
  });

  it('cross-owner upload denied', async () => {
    const ctx = createContext();
    const response = await ctx.fetch(
      '/?filename=temp/listening-audio/owner-b/cross-owner.mp3&contentType=audio%2Fmpeg&sizeBytes=3',
      { method: 'POST', headers: { ...bearer(), Origin: APPROVED_ORIGIN } },
    );
    expect(response.status).toBe(403);
    expectNoR2Access(ctx);
  });

  it('cross-owner move denied', async () => {
    const ctx = createContext();
    const grant = await signedGrant(ctx, {
      kind: 'move',
      uid: 'owner-b',
      operationKind: 'listening_audio_temp',
      sourceKey: `temp/listening-audio/owner-b/${NONCE}-cross-owner.mp3`,
      destKey: `listening-audio/owner-b/${NONCE}-cross-owner.mp3`,
    });
    const response = await ctx.fetch('/move', {
      method: 'POST',
      headers: { ...bearer(), 'Content-Type': 'application/json', Origin: APPROVED_ORIGIN },
      body: JSON.stringify({ moveGrant: grant }),
    });
    expect(response.status).toBe(403);
    expectNoR2Access(ctx);
  });

  it('raw sourceKey/destKey cannot move arbitrary object', async () => {
    const ctx = createContext();
    const response = await ctx.fetch('/move', {
      method: 'POST',
      headers: { ...bearer(), 'Content-Type': 'application/json', Origin: APPROVED_ORIGIN },
      body: JSON.stringify({
        sourceKey: 'temp/audio/raw-source.mp3',
        destKey: 'private/raw-destination.mp3',
      }),
    });
    expect(response.status).toBe(400);
    expectNoR2Access(ctx);
  });

  it('forbidden prefix upload denied', async () => {
    const ctx = createContext();
    const response = await ctx.fetch(
      '/?filename=reading_v2/owner-a/forbidden.mp3&contentType=audio%2Fmpeg&sizeBytes=3',
      { method: 'POST', headers: { ...bearer(), Origin: APPROVED_ORIGIN } },
    );
    expect(response.status).toBe(403);
    expectNoR2Access(ctx);
  });

  it('forbidden prefix move denied', async () => {
    const ctx = createContext();
    const grant = await signedGrant(ctx, {
      kind: 'move',
      operationKind: 'test_audio_temp',
      sourceKey: 'temp/audio/owner-a/forbidden-source.mp3',
      destKey: 'backups/owner-a/forbidden-destination.mp3',
    });
    const response = await ctx.fetch('/move', {
      method: 'POST',
      headers: { ...bearer(), 'Content-Type': 'application/json', Origin: APPROVED_ORIGIN },
      body: JSON.stringify({ moveGrant: grant }),
    });
    expectDenied(response);
    expectNoR2Access(ctx);
  });

  it('path traversal denied', async () => {
    const ctx = createContext();
    const response = await authorize(ctx, { fileName: '../private/traversal.mp3' });
    expect(response.status).toBe(400);
    expectNoR2Access(ctx);
  });

  it('encoded traversal denied', async () => {
    const ctx = createContext();
    const response = await authorize(ctx, { fileName: '%252e%252e%252fprivate.mp3' });
    expect(response.status).toBe(400);
    expectNoR2Access(ctx);
  });

  it('wildcard/unapproved CORS origin denied', async () => {
    const ctx = createContext();
    const response = await ctx.fetch('/upload/authorize', {
      method: 'OPTIONS',
      headers: {
        Origin: UNAPPROVED_ORIGIN,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Authorization, Content-Type',
      },
    });
    expect(response.status).toBe(403);
    expect(response.headers.get('Access-Control-Allow-Origin')).not.toBe('*');
    expectNoR2Access(ctx);
  });

  it('approved CORS origin accepted without wildcard', async () => {
    const ctx = createContext();
    const response = await ctx.fetch('/upload/authorize', {
      method: 'OPTIONS',
      headers: {
        Origin: APPROVED_ORIGIN,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Authorization, Content-Type',
      },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(APPROVED_ORIGIN);
    expect(response.headers.get('Access-Control-Allow-Origin')).not.toBe('*');
    expectNoR2Access(ctx);
  });

  it('unsupported method denied', async () => {
    const ctx = createContext();
    const response = await ctx.fetch('/upload/authorize', {
      method: 'PATCH',
      headers: { ...bearer(), Origin: APPROVED_ORIGIN },
    });
    expect(response.status).toBe(405);
    expectNoR2Mutation(ctx);
  });

  it('GET denied even if baseline advertises GET', async () => {
    const ctx = createContext();
    const response = await ctx.fetch('/', {
      method: 'GET',
      headers: { ...bearer(), Origin: APPROVED_ORIGIN },
    });
    expect(response.status).toBe(405);
    expectNoR2Mutation(ctx);
  });

  it('DELETE denied even if baseline advertises DELETE', async () => {
    const ctx = createContext();
    const response = await ctx.fetch('/', {
      method: 'DELETE',
      headers: { ...bearer(), Origin: APPROVED_ORIGIN },
    });
    expect(response.status).toBe(405);
    expectNoR2Mutation(ctx);
  });

  it('upload over 50 MB denied', async () => {
    const ctx = createContext();
    const response = await authorize(ctx, { sizeBytes: MAX_UPLOAD_BYTES + 1 });
    expect(response.status).toBe(413);
    expectNoR2Mutation(ctx);
  });

  it('missing Content-Length denied', async () => {
    const ctx = createContext();
    const key = `temp/listening-audio/owner-a/${NONCE}-missing-length.mp3`;
    const grant = await signedGrant(ctx, { kind: 'upload', operationKind: 'listening_audio_temp', key });
    const response = await ctx.fetch(`/upload?grant=${encodeURIComponent(grant)}`, {
      method: 'PUT',
      headers: { ...bearer(), 'Content-Type': 'audio/mpeg', Origin: APPROVED_ORIGIN },
      body: new Uint8Array([1, 2, 3]),
    });
    expect(response.status).toBe(411);
    expectNoR2Mutation(ctx);
  });

  it('replayed upload grant denied', async () => {
    const ctx = createContext();
    const key = `temp/listening-audio/owner-a/${NONCE}-replayed-upload.mp3`;
    const grant = await signedGrant(ctx, { kind: 'upload', operationKind: 'listening_audio_temp', key });
    expect((await putWithGrant(ctx, grant)).status).toBe(200);
    ctx.bucket.calls.length = 0;
    const replay = await putWithGrant(ctx, grant);
    expect(replay.status).toBe(409);
    await expect(replay.json()).resolves.toMatchObject({ error: 'replay_detected' });
    expectNoR2Access(ctx);
  });

  it('expired upload grant denied', async () => {
    const ctx = createContext();
    const key = `temp/listening-audio/owner-a/${NONCE}-expired.mp3`;
    const grant = await signedGrant(ctx, {
      kind: 'upload',
      operationKind: 'listening_audio_temp',
      key,
      expiresAt: NOW,
    });
    const response = await putWithGrant(ctx, grant);
    expect(response.status).toBe(403);
    expectNoR2Access(ctx);
  });

  it('replayed move grant cannot move different object', async () => {
    const ctx = createContext();
    const sourceA = `temp/audio/owner-a/${NONCE}-source-a.mp3`;
    const destA = `audio/owner-a/${NONCE}-source-a.mp3`;
    const sourceB = `temp/audio/owner-a/${OTHER_NONCE}-source-b.mp3`;
    const destB = `audio/owner-a/${OTHER_NONCE}-source-b.mp3`;
    ctx.bucket.objects.set(sourceA, { body: 'audio-a' });
    ctx.bucket.objects.set(sourceB, { body: 'audio-b' });
    const grant = await signedGrant(ctx, {
      kind: 'move',
      operationKind: 'test_audio_temp',
      sourceKey: sourceA,
      destKey: destA,
    });
    const move = (sourceKey, destKey) =>
      ctx.fetch('/move', {
        method: 'POST',
        headers: { ...bearer(), 'Content-Type': 'application/json', Origin: APPROVED_ORIGIN },
        body: JSON.stringify({ moveGrant: grant, sourceKey, destKey }),
      });
    expect((await move(sourceA, destA)).status).toBe(200);
    ctx.bucket.calls.length = 0;
    const replay = await move(sourceB, destB);
    expectDenied(replay);
    expectNoR2Access(ctx);
    expect(ctx.bucket.objects.has(sourceB)).toBe(true);
    expect(ctx.bucket.objects.has(destB)).toBe(false);
  });

  it('logs exclude token, grant, URL, secret, key, UID, and audio body', async () => {
    const token = 'firebase-token-log-sentinel';
    const verifiedUid = 'verified-uid-log-sentinel';
    const grantSecret = 'grant-secret-binding-log-sentinel';
    const fileName = 'filename-log-sentinel.mp3';
    const contentType = 'audio/log-sentinel';
    const audioBody = 'audio-body-log-sentinel';
    const rawKey = 'temp/audio/raw-key-log-sentinel.mp3';
    const publicUrlBase = 'https://public-url-log-sentinel.example';
    const logSpies = ['log', 'warn', 'error'].map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    );
    const ctx = createContext({ validToken: token, verifiedUid, grantSecret, publicUrl: publicUrlBase });
    const authorizationResponse = await authorize(
      ctx,
      { fileName, contentType, sizeBytes: audioBody.length },
      { token },
    );
    expect(authorizationResponse.status).toBe(200);
    const authorization = await authorizationResponse.json();
    const { key: canonicalKey, uploadUrl, publicUrl, moveGrant } = authorization;
    const uploadRequestUrl = new URL(uploadUrl);
    const uploadGrant = uploadRequestUrl.searchParams.get('grant');
    uploadRequestUrl.searchParams.set('key', rawKey);

    ctx.bucket.get = vi.fn(async (key) => {
      ctx.bucket.calls.push(['get', key]);
      throw new Error('controlled post-verification R2 failure');
    });
    const uploadResponse = await ctx.fetch(`${uploadRequestUrl.pathname}${uploadRequestUrl.search}`, {
      method: 'PUT',
      headers: {
        ...bearer(token),
        'Content-Type': contentType,
        'Content-Length': String(audioBody.length),
        Origin: APPROVED_ORIGIN,
      },
      body: audioBody,
    });
    expect(uploadResponse.status).toBe(500);
    expect(ctx.bucket.calls).toEqual([['get', canonicalKey]]);

    const logs = logSpies.flatMap((spy) => spy.mock.calls).flat().map(String).join(' ');
    const forbiddenValues = [
      token,
      uploadGrant,
      moveGrant,
      uploadUrl,
      publicUrl,
      grantSecret,
      canonicalKey,
      rawKey,
      verifiedUid,
      audioBody,
    ];
    for (const forbiddenValue of forbiddenValues) {
      expect(forbiddenValue).toEqual(expect.any(String));
      expect(logs).not.toContain(forbiddenValue);
    }
  });
});
