import { describe, expect, it, vi } from 'vitest';

import type {
  ListeningDeliveryIssuedUrl,
  ListeningDeliveryRefreshedUrl,
} from '../../storage/listeningAssetDelivery.service';
import {
  readListeningSoloVersionId,
  refreshListeningSoloAudioDelivery,
  resolveListeningSoloAudioSection,
} from './listeningSoloDeliveryAdapter';

const now = 1_700_000_000_000;
const issuedDelivery: ListeningDeliveryIssuedUrl = {
  assetId: 'asset-1',
  url: 'https://authorized.example/listening/asset-1.mp3',
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

describe('listeningSoloDeliveryAdapter', () => {
  it('keeps legacy public audio read-only and does not call the delivery issuer', async () => {
    const issue = vi.fn();

    await expect(resolveListeningSoloAudioSection({
      materialId: 'listening-material',
      materialVersionId: 'version-1',
      studentId: 'student-1',
      now,
      scopeContext: { mode: 'self_study' },
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

  it('resolves asset-ID solo audio through authorized delivery scoped to homework test/version/student', async () => {
    const issue = vi.fn(async () => issuedDelivery);

    await expect(resolveListeningSoloAudioSection({
      materialId: 'listening-material',
      materialVersionId: 'version-1',
      studentId: 'student-1',
      now,
      scopeContext: {
        mode: 'homework',
        homeworkId: 'hw-1',
        submissionId: 'sub-1',
      },
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
      soloScope: {
        testId: 'listening-material',
        versionId: 'version-1',
        studentId: 'student-1',
        mode: 'homework',
        homeworkId: 'hw-1',
        submissionId: 'sub-1',
      },
    });
  });

  it('requires immutable version scope before resolving an asset-ID section', async () => {
    await expect(resolveListeningSoloAudioSection({
      materialId: 'listening-material',
      studentId: 'student-1',
      now,
      scopeContext: { mode: 'self_study' },
      section: {
        number: 1,
        audioUrl: 'https://public.example/legacy.mp3',
        assetId: 'asset-1',
      },
      deliveryIssuer: { issue: vi.fn() },
    })).rejects.toThrow('listening_solo_version_scope_required');
  });

  it('reads legacy freeze version metadata from student-safe payloads', () => {
    expect(readListeningSoloVersionId({
      authoringVersioning: {
        frozen: true,
        versionId: 'legacy-version-1',
      },
    })).toBe('legacy-version-1');
  });

  it('delegates refresh with the same solo authorization scope and preserves previous URL handoff metadata', async () => {
    const refreshed: ListeningDeliveryRefreshedUrl = {
      ...issuedDelivery,
      url: 'https://authorized.example/listening/asset-1-refresh.mp3',
      tokenId: 'token-2',
      issuedAt: issuedDelivery.refreshAfter,
      expiresAt: issuedDelivery.refreshAfter + 60 * 60 * 1000,
      refreshAfter: issuedDelivery.refreshAfter + 50 * 60 * 1000,
      previousUrlValidUntil: issuedDelivery.expiresAt,
    };
    const refresh = vi.fn(async () => refreshed);

    await expect(refreshListeningSoloAudioDelivery({
      previous: issuedDelivery,
      materialId: 'listening-material',
      materialVersionId: 'version-1',
      studentId: 'student-1',
      now: issuedDelivery.refreshAfter,
      scopeContext: { mode: 'self_study' },
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
      soloScope: {
        testId: 'listening-material',
        versionId: 'version-1',
        studentId: 'student-1',
        mode: 'self_study',
      },
    });
  });
});
