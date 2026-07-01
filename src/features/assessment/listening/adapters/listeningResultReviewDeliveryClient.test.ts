import { describe, expect, it, vi } from 'vitest';

import {
  createListeningResultReviewDeliveryIssuer,
  resolveListeningResultReviewDeliveryEndpoint,
} from './listeningResultReviewDeliveryClient';
import { DEFAULT_R2_UPLOAD_WORKER_URL } from '../../../../services/r2WorkerEndpoint';

const deliveryResponse = {
  assetId: 'asset-1',
  url: 'https://authorized.example/asset-1',
  tokenId: 'token-1',
  issuedAt: 1_700_000_000_000,
  expiresAt: 1_700_003_600_000,
  refreshAfter: 1_700_003_000_000,
  ttlMs: 3_600_000,
  deliveryReady: true,
  range: {
    requestRange: 'bytes=0-0',
    status: 206,
    acceptRanges: 'bytes',
    contentLength: 1,
    contentRange: 'bytes 0-0/4096',
  },
};

describe('listeningResultReviewDeliveryClient', () => {
  it('resolves an explicit delivery endpoint before the shared upload Worker fallback', () => {
    expect(resolveListeningResultReviewDeliveryEndpoint({
      VITE_LISTENING_RESULT_REVIEW_DELIVERY_WORKER_URL: ' https://delivery.example/// ',
      VITE_R2_UPLOAD_WORKER_URL: 'https://upload.example',
    })).toBe('https://delivery.example');

    expect(resolveListeningResultReviewDeliveryEndpoint({
      VITE_R2_UPLOAD_WORKER_URL: ' https://upload.example/ ',
    })).toBe('https://upload.example');
    expect(resolveListeningResultReviewDeliveryEndpoint({})).toBe(DEFAULT_R2_UPLOAD_WORKER_URL);
  });

  it('posts only asset and result-review scope to the authenticated Worker boundary', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(deliveryResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    const issuer = createListeningResultReviewDeliveryIssuer({
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
      now: 1_700_000_000_000,
      resultScope: {
        resultId: 'result-1',
        versionId: 'version-1',
      },
    })).resolves.toEqual(deliveryResponse);

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://upload.example/listening-delivery/result-review',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer id-token',
          'Content-Type': 'application/json',
        },
      }),
    );
    const [, init] = fetchImpl.mock.calls[0];
    expect(JSON.parse(String(init.body))).toEqual({
      assetId: 'asset-1',
      resultId: 'result-1',
      versionId: 'version-1',
    });
    expect(String(init.body)).not.toContain('student-1');
    expect(String(init.body)).not.toContain('trusted-server');
    expect(String(init.body)).not.toContain('ownerId');
  });

  it('requires a Firebase ID token before requesting delivery', async () => {
    const fetchImpl = vi.fn();
    const issuer = createListeningResultReviewDeliveryIssuer({
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
      now: 1_700_000_000_000,
      resultScope: {
        resultId: 'result-1',
        versionId: 'version-1',
      },
    })).rejects.toThrow('listening_result_review_delivery_auth_required');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('surfaces safe Worker error codes on delivery failure', async () => {
    const issuer = createListeningResultReviewDeliveryIssuer({
      endpoint: 'https://upload.example',
      getIdToken: async () => 'id-token',
      fetchImpl: async () => new Response(JSON.stringify({ code: 'delivery_not_authorized' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }),
    });

    await expect(issuer.issue({
      assetId: 'asset-1',
      context: {
        runtime: 'trusted-server',
        callerUserId: 'student-1',
      },
      now: 1_700_000_000_000,
      resultScope: {
        resultId: 'result-1',
        versionId: 'version-1',
      },
    })).rejects.toThrow('delivery_not_authorized');
  });
});
