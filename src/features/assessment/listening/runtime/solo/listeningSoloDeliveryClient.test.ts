import { describe, expect, it, vi } from 'vitest';

import {
  createListeningSoloDeliveryIssuer,
  resolveListeningSoloDeliveryEndpoint,
} from './listeningSoloDeliveryClient';
import { DEFAULT_R2_UPLOAD_WORKER_URL } from '../../../../../services/r2WorkerEndpoint';

const deliveryResponse = {
  assetId: 'asset-1',
  url: 'https://authorized.example/listening/asset-1.mp3',
  tokenId: 'token-1',
  issuedAt: 1_700_000_000_000,
  expiresAt: 1_700_003_600_000,
  refreshAfter: 1_700_003_000_000,
  ttlMs: 60 * 60 * 1000,
  deliveryReady: true,
  range: {
    requestRange: 'bytes=0-0',
    status: 206,
    acceptRanges: 'bytes',
    contentLength: 1,
    contentRange: 'bytes 0-0/4096',
  },
};

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('listeningSoloDeliveryClient', () => {
  it('resolves an explicit solo delivery endpoint before the shared upload Worker fallback', () => {
    expect(resolveListeningSoloDeliveryEndpoint({
      VITE_LISTENING_SOLO_DELIVERY_WORKER_URL: ' https://solo.example/// ',
      VITE_R2_UPLOAD_WORKER_URL: 'https://upload.example',
    })).toBe('https://solo.example');
    expect(resolveListeningSoloDeliveryEndpoint({
      VITE_R2_UPLOAD_WORKER_URL: ' https://upload.example/ ',
    })).toBe('https://upload.example');
    expect(resolveListeningSoloDeliveryEndpoint({})).toBe(DEFAULT_R2_UPLOAD_WORKER_URL);
  });

  it('posts asset and solo scope with a Firebase token while deriving student authority from auth', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(deliveryResponse));
    const issuer = createListeningSoloDeliveryIssuer({
      endpoint: 'https://upload.example/',
      getIdToken: async () => 'id-token',
      fetchImpl,
    });

    await expect(issuer.issue({
      assetId: 'asset-1',
      context: {
        runtime: 'trusted-server',
        callerUserId: 'student-1',
      },
      now: deliveryResponse.issuedAt,
      soloScope: {
        testId: 'listening-material',
        versionId: 'version-1',
        studentId: 'student-1',
        mode: 'homework',
        homeworkId: 'hw-1',
        submissionId: 'sub-1',
      },
    })).resolves.toEqual(deliveryResponse);

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://upload.example/listening-delivery/solo',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer id-token',
          'Content-Type': 'application/json',
        }),
      }),
    );
    const [, init] = fetchImpl.mock.calls[0];
    expect(JSON.parse(String(init.body))).toEqual({
      assetId: 'asset-1',
      testId: 'listening-material',
      versionId: 'version-1',
      mode: 'homework',
      homeworkId: 'hw-1',
      submissionId: 'sub-1',
    });
    expect(String(init.body)).not.toContain('studentId');
    expect(String(init.body)).not.toContain('callerUserId');
  });

  it('requires a Firebase ID token before requesting delivery', async () => {
    const fetchImpl = vi.fn();
    const issuer = createListeningSoloDeliveryIssuer({
      endpoint: 'https://upload.example',
      getIdToken: async () => null,
      fetchImpl,
    });

    await expect(issuer.issue({
      assetId: 'asset-1',
      context: {
        runtime: 'trusted-server',
        callerUserId: 'student-1',
      },
      now: deliveryResponse.issuedAt,
      soloScope: {
        testId: 'listening-material',
        versionId: 'version-1',
        studentId: 'student-1',
        mode: 'self_study',
      },
    })).rejects.toThrow('listening_solo_delivery_auth_required');

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('posts previous delivery metadata during refresh without browser authority fields', async () => {
    const refreshed = {
      ...deliveryResponse,
      url: 'https://authorized.example/listening/asset-1-refresh.mp3',
      tokenId: 'token-2',
      previousUrlValidUntil: deliveryResponse.expiresAt,
    };
    const fetchImpl = vi.fn(async () => jsonResponse(refreshed));
    const issuer = createListeningSoloDeliveryIssuer({
      endpoint: 'https://upload.example',
      getIdToken: async () => 'id-token',
      fetchImpl,
    });

    await expect(issuer.refresh?.({
      previous: deliveryResponse,
      context: {
        runtime: 'trusted-server',
        callerUserId: 'student-1',
      },
      now: deliveryResponse.refreshAfter,
      soloScope: {
        testId: 'listening-material',
        versionId: 'version-1',
        studentId: 'student-1',
        mode: 'self_study',
      },
    })).resolves.toEqual(refreshed);

    const [, init] = fetchImpl.mock.calls[0];
    const body = JSON.parse(String(init.body));
    expect(body.previous).toEqual(deliveryResponse);
    expect(body).not.toHaveProperty('studentId');
    expect(body).not.toHaveProperty('callerUserId');
    expect(String(init.body)).not.toContain('"studentId"');
    expect(String(init.body)).not.toContain('"callerUserId"');
  });

  it('surfaces safe Worker error codes on delivery failure', async () => {
    const issuer = createListeningSoloDeliveryIssuer({
      endpoint: 'https://upload.example',
      getIdToken: async () => 'id-token',
      fetchImpl: async () => jsonResponse({ code: 'delivery_not_authorized' }, 403),
    });

    await expect(issuer.issue({
      assetId: 'asset-1',
      context: {
        runtime: 'trusted-server',
        callerUserId: 'student-1',
      },
      now: deliveryResponse.issuedAt,
      soloScope: {
        testId: 'listening-material',
        versionId: 'version-1',
        studentId: 'student-1',
        mode: 'self_study',
      },
    })).rejects.toThrow('delivery_not_authorized');
  });
});
