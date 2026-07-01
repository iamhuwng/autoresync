import { describe, expect, it, vi } from 'vitest';

import {
  resolveListeningResultReviewAudio,
  type ListeningResultReviewAudioDeliveryIssuer,
} from './listeningResultReviewAudioResolver';
import { LISTENING_STORAGE_ROLLBACK_CONTROLS } from '../storage/listeningAssetRollback';

const now = 1_700_000_000_000;

const issuer: ListeningResultReviewAudioDeliveryIssuer = {
  issue: vi.fn(async (input) => ({
    assetId: input.assetId,
    url: `https://authorized.example/${input.assetId}`,
    tokenId: 'token-1',
    issuedAt: input.now,
    expiresAt: input.now + 60 * 60 * 1000,
    refreshAfter: input.now + 50 * 60 * 1000,
    ttlMs: 60 * 60 * 1000,
    deliveryReady: true,
    range: {
      requestRange: 'bytes=0-0',
      status: 206,
      acceptRanges: 'bytes',
      contentLength: 1,
      contentRange: 'bytes 0-0/4096',
    },
  })),
};

describe('Listening result-review audio resolver', () => {
  it('keeps legacy raw public R2 result audio on the shared read-only resolver without migration', async () => {
    const result = await resolveListeningResultReviewAudio({
      resultId: 'result-legacy',
      viewerUserId: 'student-1',
      now,
      audio: {
        audioUrl: 'https://pub.example.r2.dev/listening-audio/legacy.mp3',
        streamUrl: 'https://pub.example.r2.dev/listening-audio/legacy.mp3',
      },
      deliveryIssuer: issuer,
    });

    expect(result).toEqual({
      kind: 'legacy-public-r2',
      resultId: 'result-legacy',
      readOnly: true,
      deliveryMode: 'public-r2',
      audioUrl: 'https://pub.example.r2.dev/listening-audio/legacy.mp3',
      streamUrl: 'https://pub.example.r2.dev/listening-audio/legacy.mp3',
      migrationPerformed: false,
    });
    expect(issuer.issue).not.toHaveBeenCalled();
  });

  it('resolves a new asset-ID result through authorized delivery scoped to result review', async () => {
    const result = await resolveListeningResultReviewAudio({
      resultId: 'result-1',
      viewerUserId: 'student-1',
      now,
      audio: {
        audioUrl: 'https://pub.example.r2.dev/assessment-assets/listening/teacher-1/asset-1/audio.mp3',
        streamUrl: 'https://pub.example.r2.dev/assessment-assets/listening/teacher-1/asset-1/audio.mp3',
        assetId: 'asset-1',
        versionId: 'version-1',
      },
      deliveryIssuer: issuer,
    });

    expect(result).toMatchObject({
      kind: 'authorized-asset-delivery',
      resultId: 'result-1',
      assetId: 'asset-1',
      versionId: 'version-1',
      readOnly: true,
      deliveryMode: 'authorized',
      migrationPerformed: false,
      delivery: {
        url: 'https://authorized.example/asset-1',
        deliveryReady: true,
      },
    });
    expect(issuer.issue).toHaveBeenCalledWith({
      assetId: 'asset-1',
      context: {
        runtime: 'trusted-server',
        callerUserId: 'student-1',
      },
      now,
      resultScope: {
        resultId: 'result-1',
        versionId: 'version-1',
      },
    });
  });

  it('fails closed for asset-ID result review records missing immutable version scope', async () => {
    await expect(resolveListeningResultReviewAudio({
      resultId: 'result-1',
      viewerUserId: 'student-1',
      now,
      audio: {
        audioUrl: 'https://pub.example.r2.dev/assessment-assets/listening/teacher-1/asset-1/audio.mp3',
        assetId: 'asset-1',
      },
      deliveryIssuer: issuer,
    })).rejects.toThrow('result_review_version_scope_required');
  });

  it('returns asset-ID result review to public R2 during rollback without data mutation or issuer calls', async () => {
    const rollbackIssuer: ListeningResultReviewAudioDeliveryIssuer = {
      issue: vi.fn(issuer.issue),
    };
    const result = await resolveListeningResultReviewAudio({
      resultId: 'result-rollback',
      viewerUserId: 'student-1',
      now,
      audio: {
        audioUrl: 'https://pub.example.r2.dev/assessment-assets/listening/teacher-1/asset-1/audio.mp3',
        streamUrl: 'https://pub.example.r2.dev/assessment-assets/listening/teacher-1/asset-1/audio.mp3',
        assetId: 'asset-1',
        versionId: 'version-1',
      },
      deliveryIssuer: rollbackIssuer,
      rollbackControls: LISTENING_STORAGE_ROLLBACK_CONTROLS,
    });

    expect(result).toEqual({
      kind: 'legacy-public-r2',
      resultId: 'result-rollback',
      readOnly: true,
      deliveryMode: 'public-r2',
      audioUrl: 'https://pub.example.r2.dev/assessment-assets/listening/teacher-1/asset-1/audio.mp3',
      streamUrl: 'https://pub.example.r2.dev/assessment-assets/listening/teacher-1/asset-1/audio.mp3',
      migrationPerformed: false,
    });
    expect(rollbackIssuer.issue).not.toHaveBeenCalled();
  });
});
