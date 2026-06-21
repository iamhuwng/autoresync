import { env } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import insecureWorker from './fixtures/insecure-current-worker.js';

const BASE_URL = 'https://r2-upload-signer.test';
const APPROVED_ORIGIN = 'http://localhost:5173';
const UNAPPROVED_ORIGIN = 'https://attacker.example';
const DENIED_STATUSES = [400, 401, 403];

const fetchInsecure = (path, init = {}) =>
  insecureWorker.fetch(new Request(`${BASE_URL}${path}`, init), env);

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

const expectDenied = (response) => {
  expect(DENIED_STATUSES).toContain(response.status);
};

const putObject = (key, body = 'fixture') =>
  env.R2_BUCKET.put(key, body, {
    httpMetadata: { contentType: 'application/octet-stream' },
  });

const move = (body, token = 'valid-owner-token') =>
  fetchInsecure('/move', {
    method: 'POST',
    headers: {
      ...bearer(token),
      'Content-Type': 'application/json',
      Origin: APPROVED_ORIGIN,
    },
    body: JSON.stringify(body),
  });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PRD-0056 insecure-current Worker negative contract', () => {
  it('missing auth denied', async () => {
    const response = await fetchInsecure(
      '/?filename=temp/listening-audio/owner-a/missing-auth.mp3',
      { method: 'POST', headers: { Origin: APPROVED_ORIGIN } },
    );
    expectDenied(response);
  });

  it('invalid auth denied', async () => {
    const response = await fetchInsecure(
      '/?filename=temp/listening-audio/owner-a/invalid-auth.mp3',
      {
        method: 'POST',
        headers: { ...bearer('not-a-firebase-token'), Origin: APPROVED_ORIGIN },
      },
    );
    expectDenied(response);
  });

  it('expired Firebase token denied', async () => {
    const response = await fetchInsecure(
      '/?filename=temp/listening-audio/owner-a/expired-token.mp3',
      {
        method: 'POST',
        headers: { ...bearer('firebase.expired.signature'), Origin: APPROVED_ORIGIN },
      },
    );
    expectDenied(response);
  });

  it('wrong Firebase audience denied', async () => {
    const response = await fetchInsecure(
      '/?filename=temp/listening-audio/owner-a/wrong-audience.mp3',
      {
        method: 'POST',
        headers: { ...bearer('firebase.wrong-audience.signature'), Origin: APPROVED_ORIGIN },
      },
    );
    expectDenied(response);
  });

  it('cross-owner upload denied', async () => {
    const response = await fetchInsecure(
      '/?filename=temp/listening-audio/owner-b/cross-owner.mp3',
      {
        method: 'POST',
        headers: { ...bearer('valid-owner-a-token'), Origin: APPROVED_ORIGIN },
      },
    );
    expectDenied(response);
  });

  it('cross-owner move denied', async () => {
    const sourceKey = 'temp/listening-audio/owner-b/cross-owner-move.mp3';
    const destKey = 'listening-audio/owner-b/cross-owner-move.mp3';
    await putObject(sourceKey);

    const response = await move(
      { sourceKey, destKey, moveGrant: 'owner-b-move-grant' },
      'valid-owner-a-token',
    );

    expectDenied(response);
    expect(await env.R2_BUCKET.get(sourceKey)).not.toBeNull();
    expect(await env.R2_BUCKET.get(destKey)).toBeNull();
  });

  it('raw sourceKey/destKey cannot move arbitrary object', async () => {
    const sourceKey = 'temp/audio/raw-authority-source.mp3';
    const destKey = 'private/raw-authority-destination.mp3';
    await putObject(sourceKey);

    const response = await move({ sourceKey, destKey });

    expectDenied(response);
    expect(await env.R2_BUCKET.get(sourceKey)).not.toBeNull();
    expect(await env.R2_BUCKET.get(destKey)).toBeNull();
  });

  it('forbidden prefix upload denied', async () => {
    const response = await fetchInsecure(
      '/?filename=reading_v2/owner-a/forbidden.mp3',
      {
        method: 'POST',
        headers: { ...bearer('valid-owner-a-token'), Origin: APPROVED_ORIGIN },
      },
    );
    expectDenied(response);
  });

  it('forbidden prefix move denied', async () => {
    const sourceKey = 'temp/audio/forbidden-prefix-source.mp3';
    const destKey = 'backups/forbidden-prefix-destination.mp3';
    await putObject(sourceKey);

    const response = await move({ sourceKey, destKey, moveGrant: 'forbidden-prefix-grant' });

    expectDenied(response);
    expect(await env.R2_BUCKET.get(destKey)).toBeNull();
  });

  it('path traversal denied', async () => {
    const filename = encodeURIComponent('../private/traversal.mp3');
    const response = await fetchInsecure(`/?filename=${filename}`, {
      method: 'POST',
      headers: { ...bearer('valid-owner-token'), Origin: APPROVED_ORIGIN },
    });
    expectDenied(response);
  });

  it('encoded traversal denied', async () => {
    const response = await fetchInsecure(
      '/?filename=%252e%252e%252fprivate%252fencoded-traversal.mp3',
      {
        method: 'POST',
        headers: { ...bearer('valid-owner-token'), Origin: APPROVED_ORIGIN },
      },
    );
    expectDenied(response);
  });

  it('wildcard/unapproved CORS origin denied', async () => {
    const response = await fetchInsecure('/upload/authorize', {
      method: 'OPTIONS',
      headers: {
        Origin: UNAPPROVED_ORIGIN,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Authorization, Content-Type',
      },
    });

    expectDenied(response);
    expect(response.headers.get('Access-Control-Allow-Origin')).not.toBe('*');
  });

  it('approved CORS origin accepted without wildcard', async () => {
    const response = await fetchInsecure('/upload/authorize', {
      method: 'OPTIONS',
      headers: {
        Origin: APPROVED_ORIGIN,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Authorization, Content-Type',
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(APPROVED_ORIGIN);
    expect(response.headers.get('Access-Control-Allow-Origin')).not.toBe('*');
  });

  it('unsupported method denied', async () => {
    const response = await fetchInsecure('/upload/authorize', {
      method: 'PATCH',
      headers: { ...bearer('valid-owner-token'), Origin: APPROVED_ORIGIN },
    });
    expect(response.status).toBe(405);
  });

  it('GET denied even if baseline advertises GET', async () => {
    const response = await fetchInsecure('/', {
      method: 'GET',
      headers: { ...bearer('valid-owner-token'), Origin: APPROVED_ORIGIN },
    });
    expect(response.status).toBe(405);
  });

  it('DELETE denied even if baseline advertises DELETE', async () => {
    const response = await fetchInsecure('/', {
      method: 'DELETE',
      headers: { ...bearer('valid-owner-token'), Origin: APPROVED_ORIGIN },
    });
    expect(response.status).toBe(405);
  });

  it('upload over 50 MB denied', async () => {
    const key = 'temp/listening-audio/owner-a/oversize.mp3';
    const response = await fetchInsecure(`/?key=${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: {
        ...bearer('valid-owner-a-token'),
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(50 * 1024 * 1024 + 1),
        Origin: APPROVED_ORIGIN,
      },
      body: new Uint8Array(),
    });

    expect(response.status).toBe(413);
    expect(await env.R2_BUCKET.get(key)).toBeNull();
  });

  it('missing Content-Length denied', async () => {
    const key = 'temp/listening-audio/owner-a/missing-content-length.mp3';
    const response = await fetchInsecure(`/?key=${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: {
        ...bearer('valid-owner-a-token'),
        'Content-Type': 'audio/mpeg',
        Origin: APPROVED_ORIGIN,
      },
      body: new Uint8Array(),
    });

    expect(response.status).toBe(411);
    expect(await env.R2_BUCKET.get(key)).toBeNull();
  });

  it('replayed upload grant denied', async () => {
    const key = 'temp/listening-audio/owner-a/replayed-upload.mp3';
    const path = `/?key=${encodeURIComponent(key)}&grant=replayed-upload-grant`;
    const init = {
      method: 'PUT',
      headers: {
        ...bearer('valid-owner-a-token'),
        'Content-Type': 'audio/mpeg',
        'Content-Length': '0',
        Origin: APPROVED_ORIGIN,
      },
      body: new Uint8Array(),
    };

    const firstResponse = await fetchInsecure(path, init);
    expect(firstResponse.status).toBe(200);
    const replayResponse = await fetchInsecure(path, init);
    expectDenied(replayResponse);
  });

  it('expired upload grant denied', async () => {
    const key = 'temp/listening-audio/owner-a/expired-grant.mp3';
    const response = await fetchInsecure(
      `/?key=${encodeURIComponent(key)}&grant=expired-upload-grant`,
      {
        method: 'PUT',
        headers: {
          ...bearer('valid-owner-a-token'),
          'Content-Type': 'audio/mpeg',
          'Content-Length': '0',
          Origin: APPROVED_ORIGIN,
        },
        body: new Uint8Array(),
      },
    );

    expectDenied(response);
    expect(await env.R2_BUCKET.get(key)).toBeNull();
  });

  it('replayed move grant cannot move different object', async () => {
    const sourceA = 'temp/audio/owner-a/replay-source-a.mp3';
    const sourceB = 'temp/audio/owner-a/replay-source-b.mp3';
    const destA = 'audio/owner-a/replay-dest-a.mp3';
    const destB = 'audio/owner-a/replay-dest-b.mp3';
    const moveGrant = 'same-move-grant';
    await putObject(sourceA, 'audio-a');
    await putObject(sourceB, 'audio-b');

    const firstResponse = await move({ sourceKey: sourceA, destKey: destA, moveGrant });
    expect(firstResponse.status).toBe(200);
    const replayResponse = await move({ sourceKey: sourceB, destKey: destB, moveGrant });

    expectDenied(replayResponse);
    expect(await env.R2_BUCKET.get(sourceB)).not.toBeNull();
    expect(await env.R2_BUCKET.get(destB)).toBeNull();
  });

  it('logs exclude token, grant, URL, secret, key, UID, and audio body', async () => {
    const forbiddenValues = [
      'token-log-sentinel',
      'grant-log-sentinel',
      'https://signed.example/grant-log-sentinel',
      'secret-log-sentinel',
      'temp/audio/raw-key-log-sentinel.mp3',
      'raw-uid-log-sentinel',
      'audio-body-log-sentinel',
    ];
    const logSpies = ['log', 'warn', 'error'].map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    );

    const key = forbiddenValues[4];
    const response = await fetchInsecure(
      `/?key=${encodeURIComponent(key)}&grant=${forbiddenValues[1]}`,
      {
        method: 'PUT',
        headers: {
          ...bearer(forbiddenValues[0]),
          'Content-Type': 'audio/mpeg',
          'Content-Length': String(forbiddenValues[6].length),
          'X-Test-Secret': forbiddenValues[3],
          'X-Test-Uid': forbiddenValues[5],
          Origin: APPROVED_ORIGIN,
        },
        body: forbiddenValues[6],
      },
    );

    expect(response.status).toBe(200);
    const logs = logSpies
      .flatMap((spy) => spy.mock.calls)
      .flat()
      .map(String)
      .join(' ');
    for (const forbiddenValue of forbiddenValues) {
      expect(logs).not.toContain(forbiddenValue);
    }
  });
});
