import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { createFirebaseVerifier } from '../src/upload-worker/firebase-verification.js';

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

  it('uploads through the Worker entrypoint using the R2_BUCKET binding', async () => {
    const authorizeResponse = await SELF.fetch(
      'https://r2-upload-signer.test/?filename=temp/audio/harness-smoke.txt',
      { method: 'POST' },
    );

    expect(authorizeResponse.status).toBe(200);
    const authorizeBody = await authorizeResponse.json();
    expect(authorizeBody).toMatchObject({
      key: 'temp/audio/harness-smoke.txt',
    });
    expect(authorizeBody.uploadUrl).toContain(
      'key=temp%2Faudio%2Fharness-smoke.txt',
    );

    const uploadResponse = await SELF.fetch(authorizeBody.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: new Uint8Array(),
    });

    expect(uploadResponse.status).toBe(200);
    const storedObject = await env.R2_BUCKET.get('temp/audio/harness-smoke.txt');
    expect(storedObject).not.toBeNull();
    expect(storedObject?.httpMetadata?.contentType).toBe(
      'application/octet-stream',
    );
  });

  it('moves an uploaded object through the native R2_BUCKET binding', async () => {
    await env.R2_BUCKET.put(
      'temp/audio/harness-move.txt',
      new Uint8Array(),
      { httpMetadata: { contentType: 'application/octet-stream' } },
    );

    const moveResponse = await SELF.fetch('https://r2-upload-signer.test/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceKey: 'temp/audio/harness-move.txt',
        destKey: 'audio/harness-move.txt',
      }),
    });

    expect(moveResponse.status).toBe(200);
    const moveBody = await moveResponse.json();
    expect(moveBody.success).toBe(true);
    expect(await env.R2_BUCKET.get('temp/audio/harness-move.txt')).toBeNull();
    expect(await env.R2_BUCKET.get('audio/harness-move.txt')).not.toBeNull();
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
