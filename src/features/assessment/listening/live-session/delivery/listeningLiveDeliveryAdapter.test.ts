import { describe, expect, it, vi } from 'vitest';

import type {
  ListeningDeliveryIssuedUrl,
  ListeningDeliveryRefreshedUrl,
} from '../../storage/listeningAssetDelivery.service';
import {
  readListeningLiveVersionId,
  refreshListeningLiveAudioDelivery,
  resolveListeningLiveAudioSection,
} from './listeningLiveDeliveryAdapter';

const now = 1_700_000_000_000;
const issuedDelivery: ListeningDeliveryIssuedUrl = {
  assetId: 'asset-1',
  url: 'https://authorized.example/live/asset-1.mp3',
  tokenId: 'token-1',
  issuedAt: now,
  expiresAt: now + 60 * 60 * 1000,
  refreshAfter: now + 50 * 60 * 1000,
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

describe('listeningLiveDeliveryAdapter', () => {
  it('keeps legacy public live audio read-only and does not call delivery issuer', async () => {
    const issue = vi.fn();

    await expect(resolveListeningLiveAudioSection({
      sessionCode: 'ABC123',
      testId: 'listening-test',
      materialVersionId: 'version-1',
      studentId: 'student-1',
      now,
      section: {
        number: 1,
        audioUrl: 'https://public.example/audio.mp3',
      },
      deliveryIssuer: { issue },
    })).resolves.toEqual({
      kind: 'legacy-public-r2',
      sectionNumber: 1,
      readOnly: true,
      deliveryMode: 'public-r2',
      audioUrl: 'https://public.example/audio.mp3',
      streamUrl: undefined,
      migrationPerformed: false,
    });

    expect(issue).not.toHaveBeenCalled();
  });

  it('resolves asset-ID live audio through session-scoped authorized delivery', async () => {
    const issue = vi.fn(async () => issuedDelivery);

    await expect(resolveListeningLiveAudioSection({
      sessionCode: 'ABC123',
      testId: 'listening-test',
      materialVersionId: 'version-1',
      studentId: 'student-1',
      classId: 'class-1',
      now,
      section: {
        number: 1,
        audioUrl: 'https://public.example/legacy.mp3',
        assetId: 'asset-1',
      },
      deliveryIssuer: { issue },
    })).resolves.toMatchObject({
      kind: 'authorized-asset-delivery',
      sectionNumber: 1,
      deliveryMode: 'authorized',
      assetId: 'asset-1',
      versionId: 'version-1',
      audioUrl: issuedDelivery.url,
      migrationPerformed: false,
    });

    expect(issue).toHaveBeenCalledWith({
      assetId: 'asset-1',
      context: {
        runtime: 'trusted-server',
        callerUserId: 'student-1',
      },
      now,
      liveScope: {
        sessionCode: 'ABC123',
        testId: 'listening-test',
        versionId: 'version-1',
        studentId: 'student-1',
        classId: 'class-1',
        sectionNumber: 1,
      },
    });
  });

  it('requires live session, test, student, and immutable version scope for asset-ID audio', async () => {
    await expect(resolveListeningLiveAudioSection({
      sessionCode: 'ABC123',
      testId: 'listening-test',
      studentId: 'student-1',
      now,
      section: {
        number: 1,
        audioUrl: 'https://public.example/legacy.mp3',
        assetId: 'asset-1',
      },
      deliveryIssuer: { issue: vi.fn() },
    })).rejects.toThrow('listening_live_version_scope_required');
  });

  it('reads immutable version metadata from live-safe payloads', () => {
    expect(readListeningLiveVersionId({
      authoringVersioning: {
        frozen: true,
        versionId: 'live-version-1',
      },
    })).toBe('live-version-1');
  });

  it('delegates refresh with same live authorization scope and previous URL handoff metadata', async () => {
    const refreshed: ListeningDeliveryRefreshedUrl = {
      ...issuedDelivery,
      url: 'https://authorized.example/live/asset-1-refresh.mp3',
      tokenId: 'token-2',
      issuedAt: issuedDelivery.refreshAfter,
      expiresAt: issuedDelivery.refreshAfter + 60 * 60 * 1000,
      refreshAfter: issuedDelivery.refreshAfter + 50 * 60 * 1000,
      previousUrlValidUntil: issuedDelivery.expiresAt,
    };
    const refresh = vi.fn(async () => refreshed);

    await expect(refreshListeningLiveAudioDelivery({
      previous: issuedDelivery,
      sessionCode: 'ABC123',
      testId: 'listening-test',
      materialVersionId: 'version-1',
      studentId: 'student-1',
      classId: 'class-1',
      sectionNumber: 1,
      now: issuedDelivery.refreshAfter,
      deliveryIssuer: {
        issue: vi.fn(),
        refresh,
      },
    })).resolves.toEqual(refreshed);

    expect(refresh).toHaveBeenCalledWith({
      previous: issuedDelivery,
      context: {
        runtime: 'trusted-server',
        callerUserId: 'student-1',
      },
      now: issuedDelivery.refreshAfter,
      liveScope: {
        sessionCode: 'ABC123',
        testId: 'listening-test',
        versionId: 'version-1',
        studentId: 'student-1',
        classId: 'class-1',
        sectionNumber: 1,
      },
    });
  });
});
