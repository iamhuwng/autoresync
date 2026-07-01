import { describe, expect, it } from 'vitest';

import {
  LISTENING_MEDIA_ASSET_INDEXES,
  LISTENING_MEDIA_ASSET_STATES,
  continueListeningUploadSessionLifecycle,
  createListeningMediaAssetRecord,
  isListeningMediaAssetCleanupAuthorized,
} from './listeningAssetRegistry';

describe('Listening asset registry foundation', () => {
  it('defines the full PRD-0058 asset states through deleted tombstone retention', () => {
    expect(LISTENING_MEDIA_ASSET_STATES).toEqual([
      'temp',
      'committing',
      'committed',
      'pending-delete',
      'deleted',
    ]);
  });

  it('captures registry checksum metadata without introducing deduplication behavior', () => {
    const record = createListeningMediaAssetRecord({
      assetId: 'asset-1',
      ownerId: 'teacher-1',
      uploadSessionId: 'session-1',
      tempKey: 'temp/listening/teacher-1/session-1/asset-1-audio.mp3',
      contentType: 'audio/mpeg',
      sizeBytes: 12_345,
      checksum: 'sha256:abc123',
      createdAt: 1_700_000_000_000,
      createdBy: 'teacher-1',
      references: {
        drafts: {
          'draft-1': true,
        },
      },
    });

    expect(record).toMatchObject({
      state: 'temp',
      checksum: 'sha256:abc123',
      checksumAlgorithm: 'sha256',
      references: {
        drafts: {
          'draft-1': true,
        },
      },
    });
    expect(record).not.toHaveProperty('dedupeKey');
    expect(record).not.toHaveProperty('duplicateOfAssetId');
  });

  it('keeps cleanup fail-closed until restore and integrity proof are both resolved', () => {
    expect(isListeningMediaAssetCleanupAuthorized({})).toBe(false);
    expect(isListeningMediaAssetCleanupAuthorized({
      cleanupEnabled: true,
      restoreVerifiedAt: null,
      integrityVerified: true,
    })).toBe(false);
    expect(isListeningMediaAssetCleanupAuthorized({
      cleanupEnabled: true,
      restoreVerifiedAt: 1_700_000_000_000,
      integrityVerified: false,
    })).toBe(false);
    expect(isListeningMediaAssetCleanupAuthorized({
      cleanupEnabled: true,
      restoreVerifiedAt: 1_700_000_000_000,
      integrityVerified: true,
    })).toBe(true);
  });

  it('keeps the registry indexes aligned with the approved child PRD', () => {
    expect(LISTENING_MEDIA_ASSET_INDEXES).toEqual([
      'ownerId',
      'state',
      'uploadSessionId',
      'createdAt',
      'committedAt',
      'pendingDeleteAt',
      'deleteAfter',
      'tombstoneExpiresAt',
      'lastReferencedAt',
    ]);
  });

  it('adds PRD-0058 heartbeat continuation without changing PRD-0056A bootstrap identity fields', () => {
    const session = {
      ownerId: 'teacher-1',
      uploadSessionId: 'session-1',
      createdBy: 'teacher-1',
      createdAt: 1_700_000_000_000,
      expiresAt: 1_700_000_600_000,
      maxEligibilityExpiresAt: 1_700_028_800_000,
      status: 'active' as const,
      bridgeVersion: '0056A-v1',
    };

    expect(continueListeningUploadSessionLifecycle({
      session,
      ownerId: 'teacher-1',
      now: 1_700_000_060_000,
    })).toEqual({
      ...session,
      lastHeartbeatAt: 1_700_000_060_000,
    });
  });

  it('expires session continuation after the PRD-0058 eight-hour eligibility ceiling', () => {
    const session = {
      ownerId: 'teacher-1',
      uploadSessionId: 'session-1',
      createdBy: 'teacher-1',
      createdAt: 1_700_000_000_000,
      expiresAt: 1_700_000_600_000,
      maxEligibilityExpiresAt: 1_700_028_800_000,
      status: 'active' as const,
      bridgeVersion: '0056A-v1',
    };

    expect(continueListeningUploadSessionLifecycle({
      session,
      ownerId: 'teacher-1',
      now: 1_700_028_800_001,
    })).toEqual({
      ...session,
      status: 'expired',
      cleanupQueuedAt: 1_700_028_800_001,
    });
  });
});
