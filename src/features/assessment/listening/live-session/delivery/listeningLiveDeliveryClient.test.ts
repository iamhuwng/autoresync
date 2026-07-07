import { describe, expect, it, vi } from 'vitest';

import {
  createListeningLiveDeliveryIssuer,
  resolveListeningLiveDeliveryEndpoint,
} from './listeningLiveDeliveryClient';
import { DEFAULT_R2_UPLOAD_WORKER_URL } from '../../../../../services/r2WorkerEndpoint';

const deliveryResponse = {
  assetId: 'asset-1',
  url: 'https://authorized.example/live/asset-1.mp3',
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

describe('listeningLiveDeliveryClient', () => {
  it('resolves an explicit live delivery endpoint before the shared upload Worker fallback', () => {
    expect(resolveListeningLiveDeliveryEndpoint({
      VITE_LISTENING_LIVE_DELIVERY_WORKER_URL: ' https://live.example/// ',
      VITE_R2_UPLOAD_WORKER_URL: 'https://upload.example',
    })).toBe('https://live.example');
    expect(resolveListeningLiveDeliveryEndpoint({
      VITE_R2_UPLOAD_WORKER_URL: ' https://upload.example/ ',
    })).toBe('https://upload.example');
    expect(resolveListeningLiveDeliveryEndpoint({})).toBe(DEFAULT_R2_UPLOAD_WORKER_URL);
  });

  it('uses the deployed upload Worker endpoint for localhost dev live delivery', () => {
    expect(resolveListeningLiveDeliveryEndpoint({
      DEV: true,
      VITE_R2_UPLOAD_WORKER_URL: '',
    })).toBe(DEFAULT_R2_UPLOAD_WORKER_URL);
  });

  it('posts asset and live scope with a Firebase token while deriving student authority from auth', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(deliveryResponse));
    const issuer = createListeningLiveDeliveryIssuer({
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
      liveScope: {
        sessionCode: 'ABC123',
        testId: 'listening-test',
        versionId: 'version-1',
        studentId: 'student-1',
        classId: 'class-1',
        sectionNumber: 1,
      },
    })).resolves.toEqual(deliveryResponse);

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://upload.example/listening-delivery/live',
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
      sessionCode: 'ABC123',
      testId: 'listening-test',
      versionId: 'version-1',
      classId: 'class-1',
      sectionNumber: 1,
    });
    expect(String(init.body)).not.toContain('studentId');
    expect(String(init.body)).not.toContain('callerUserId');
  });

  it('posts previous delivery metadata during refresh without browser authority fields', async () => {
    const refreshed = {
      ...deliveryResponse,
      url: 'https://authorized.example/live/asset-1-refresh.mp3',
      tokenId: 'token-2',
      previousUrlValidUntil: deliveryResponse.expiresAt,
    };
    const fetchImpl = vi.fn(async () => jsonResponse(refreshed));
    const issuer = createListeningLiveDeliveryIssuer({
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
      liveScope: {
        sessionCode: 'ABC123',
        testId: 'listening-test',
        versionId: 'version-1',
        studentId: 'student-1',
        sectionNumber: 1,
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

  it('requires a Firebase ID token before requesting delivery', async () => {
    const fetchImpl = vi.fn();
    const issuer = createListeningLiveDeliveryIssuer({
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
      liveScope: {
        sessionCode: 'ABC123',
        testId: 'listening-test',
        versionId: 'version-1',
        studentId: 'student-1',
      },
    })).rejects.toThrow('listening_live_delivery_auth_required');

    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
