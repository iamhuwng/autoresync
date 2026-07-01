import { describe, expect, it } from 'vitest';

import {
  LISTENING_CROSS_TEST_REUSE_POLICY,
  closeListeningAssetLease,
  isListeningTempFallbackDue,
  queueImmediateListeningTempCleanup,
  recordListeningAssetHeartbeat,
  removeListeningAssetReference,
  rejectImplicitCrossTestReuse,
} from './listeningAssetLifecycle';
import { LISTENING_STORAGE_ROLLBACK_CONTROLS } from './listeningAssetRollback';
import type { ListeningMediaAssetRecord, ListeningUploadSessionLifecycleRecord } from './listeningAssetRegistry';

const now = 1_700_000_000_000;

const session = (overrides: Partial<ListeningUploadSessionLifecycleRecord> = {}): ListeningUploadSessionLifecycleRecord => ({
  ownerId: 'teacher-1',
  uploadSessionId: 'session-1',
  createdBy: 'teacher-1',
  createdAt: now,
  expiresAt: now + (8 * 60 * 60 * 1000),
  maxEligibilityExpiresAt: now + (8 * 60 * 60 * 1000),
  status: 'active',
  bridgeVersion: '0056A-v1',
  draftId: 'draft-1',
  leaseIds: {},
  ...overrides,
});

const asset = (overrides: Partial<ListeningMediaAssetRecord> = {}): ListeningMediaAssetRecord => ({
  assetId: 'asset-1',
  ownerId: 'teacher-1',
  uploadSessionId: 'session-1',
  state: 'committed',
  tempKey: 'temp/listening/teacher-1/session-1/asset-1-audio.mp3',
  contentType: 'audio/mpeg',
  sizeBytes: 6,
  checksum: 'sha256:proof',
  checksumAlgorithm: 'sha256',
  createdAt: now,
  updatedAt: now,
  createdBy: 'teacher-1',
  lastReferencedAt: now,
  references: {
    drafts: {
      'draft-1': true,
    },
  },
  ...overrides,
});

describe('Listening asset cleanup, heartbeat, leases, references, and reuse policy', () => {
  it.each([
    'explicit-remove',
    'builder-cancel',
    'confirmed-navigation',
    'logout',
    'auth-loss',
    'failed-save-publish',
    'replacement-cancelled',
    'detected-abandonment',
  ] as const)('queues immediate best-effort temp cleanup for %s', (reason) => {
    expect(queueImmediateListeningTempCleanup({
      assetId: 'asset-temp',
      ownerId: 'teacher-1',
      tempKey: 'temp/listening/teacher-1/session-1/asset-temp-audio.mp3',
      state: 'temp',
      reason,
      now,
    })).toEqual({
      operation: 'cleanup-temp',
      assetId: 'asset-temp',
      tempKey: 'temp/listening/teacher-1/session-1/asset-temp-audio.mp3',
      reason,
      queuedAt: now,
      durableDeleteAllowed: false,
    });
  });

  it('does not grant durable delete authority while queueing best-effort cleanup', () => {
    expect(queueImmediateListeningTempCleanup({
      assetId: 'asset-committed',
      ownerId: 'teacher-1',
      tempKey: 'assessment-assets/listening/teacher-1/asset-committed/audio.mp3',
      state: 'committed',
      reason: 'explicit-remove',
      now,
    })).toEqual({
      operation: 'preserve-durable',
      assetId: 'asset-committed',
      reason: 'explicit-remove',
      queuedAt: now,
      durableDeleteAllowed: false,
    });
  });

  it('records 60-second heartbeat, 3-minute stale deadline, and no retained reference', () => {
    const updated = recordListeningAssetHeartbeat({
      session: session(),
      ownerId: 'teacher-1',
      assetId: 'asset-1',
      draftId: 'draft-1',
      leaseId: 'tab-a',
      tabIdHash: 'tab-hash-a',
      now,
    });

    expect(updated.session.lastHeartbeatAt).toBe(now);
    expect(updated.nextHeartbeatDueAt).toBe(now + 60_000);
    expect(updated.heartbeatStaleAt).toBe(now + 180_000);
    expect(updated.session.leaseIds).toEqual({ 'tab-a': true });
    expect(updated.session).not.toHaveProperty('leases');
    expect(updated.session).not.toHaveProperty('nextHeartbeatDueAt');
    expect(updated.session).not.toHaveProperty('heartbeatStaleAt');
    expect(updated.lease).toMatchObject({
      leaseId: 'tab-a',
      ownerId: 'teacher-1',
      assetId: 'asset-1',
      uploadSessionId: 'session-1',
      draftId: 'draft-1',
      tabIdHash: 'tab-hash-a',
      createdAt: now,
      lastHeartbeatAt: now,
      staleAt: now + 180_000,
      maxExpiresAt: now + (8 * 60 * 60 * 1000),
      status: 'active',
    });
    expect(updated.session).not.toHaveProperty('references');
    expect(updated.session).not.toHaveProperty('draftCreatedAt');
  });

  it('expires eligibility after 8 hours and keeps 24-hour temp fallback separate', () => {
    const stillActiveAtLimit = recordListeningAssetHeartbeat({
      session: session(),
      ownerId: 'teacher-1',
      assetId: 'asset-1',
      draftId: 'draft-1',
      leaseId: 'tab-a',
      tabIdHash: 'tab-hash-a',
      now: now + (8 * 60 * 60 * 1000),
    });
    expect(stillActiveAtLimit.session.status).toBe('active');

    const expired = recordListeningAssetHeartbeat({
      session: session(),
      ownerId: 'teacher-1',
      assetId: 'asset-1',
      draftId: 'draft-1',
      leaseId: 'tab-a',
      tabIdHash: 'tab-hash-a',
      now: now + (8 * 60 * 60 * 1000) + 1,
    });

    expect(expired.session).toMatchObject({
      status: 'expired',
      cleanupQueuedAt: now + (8 * 60 * 60 * 1000) + 1,
    });
    expect(isListeningTempFallbackDue({
      state: 'temp',
      createdAt: now,
      now: now + (24 * 60 * 60 * 1000) - 1,
    })).toBe(false);
    expect(isListeningTempFallbackDue({
      state: 'temp',
      createdAt: now,
      now: now + (24 * 60 * 60 * 1000),
    })).toBe(true);
    expect(isListeningTempFallbackDue({
      state: 'committed',
      createdAt: now,
      now: now + (24 * 60 * 60 * 1000),
    })).toBe(false);
  });

  it('aggregates same-owner same-draft leases so one tab close cannot cleanup another valid tab', () => {
    const withTabA = recordListeningAssetHeartbeat({
      session: session(),
      ownerId: 'teacher-1',
      assetId: 'asset-1',
      draftId: 'draft-1',
      leaseId: 'tab-a',
      tabIdHash: 'tab-hash-a',
      now,
    });
    const withTabB = recordListeningAssetHeartbeat({
      session: withTabA.session,
      ownerId: 'teacher-1',
      assetId: 'asset-1',
      draftId: 'draft-1',
      leaseId: 'tab-b',
      tabIdHash: 'tab-hash-b',
      now: now + 30_000,
    });

    const afterTabAClose = closeListeningAssetLease({
      session: withTabB.session,
      leases: {
        'tab-a': withTabA.lease,
        'tab-b': withTabB.lease,
      },
      ownerId: 'teacher-1',
      draftId: 'draft-1',
      leaseId: 'tab-a',
      now: now + 40_000,
    });

    expect(afterTabAClose.session.cleanupQueuedAt).toBeUndefined();
    expect(afterTabAClose.lease.status).toBe('closed');
    expect(afterTabAClose.session.leaseIds).toEqual({
      'tab-a': true,
      'tab-b': true,
    });
  });

  it('queues cleanup when the only remaining lease is stale and rejects different-draft lease retention', () => {
    const stalePlusActive = {
      ...session(),
      leaseIds: {
        'tab-a': true,
        'tab-b': true,
      },
    };
    const leases = {
      'tab-a': {
        ownerId: 'teacher-1',
        assetId: 'asset-1',
        uploadSessionId: 'session-1',
        draftId: 'draft-1',
        leaseId: 'tab-a',
        tabIdHash: 'tab-hash-a',
        createdAt: now - 240_000,
        lastHeartbeatAt: now - 240_000,
        staleAt: now - 60_000,
        maxExpiresAt: now + (8 * 60 * 60 * 1000),
        status: 'active' as const,
      },
      'tab-b': {
        ownerId: 'teacher-1',
        assetId: 'asset-1',
        uploadSessionId: 'session-1',
        draftId: 'draft-1',
        leaseId: 'tab-b',
        tabIdHash: 'tab-hash-b',
        createdAt: now,
        lastHeartbeatAt: now,
        staleAt: now + 180_000,
        maxExpiresAt: now + (8 * 60 * 60 * 1000),
        status: 'active' as const,
      },
    };

    expect(closeListeningAssetLease({
      session: stalePlusActive,
      leases,
      ownerId: 'teacher-1',
      draftId: 'draft-1',
      leaseId: 'tab-b',
      now: now + 1,
    }).session.cleanupQueuedAt).toBe(now + 1);

    expect(() => recordListeningAssetHeartbeat({
      session: session({ draftId: 'draft-1' }),
      ownerId: 'teacher-1',
      assetId: 'asset-1',
      draftId: 'draft-2',
      leaseId: 'tab-c',
      tabIdHash: 'tab-hash-c',
      now,
    })).toThrow('upload_session_draft_mismatch');
  });

  it('removes references and enters pending-delete only after retained references reach zero', () => {
    const stillReferenced = removeListeningAssetReference({
      asset: asset({
        references: {
          drafts: { 'draft-1': true },
          versions: { 'version-1': true },
        },
      }),
      reference: {
        kind: 'drafts',
        id: 'draft-1',
      },
      now,
    });

    expect(stillReferenced.state).toBe('committed');
    expect(stillReferenced.references).toEqual({
      versions: { 'version-1': true },
    });

    const pendingDelete = removeListeningAssetReference({
      asset: stillReferenced,
      reference: {
        kind: 'versions',
        id: 'version-1',
      },
      now: now + 1,
    });

    expect(pendingDelete).toMatchObject({
      state: 'pending-delete',
      pendingDeleteAt: now + 1,
      deleteAfter: now + 1 + (7 * 24 * 60 * 60 * 1000),
    });
    expect(pendingDelete.references).toEqual({});
  });

  it('keeps references and skips pending-delete while rollback retains existing audio', () => {
    const current = asset({
      references: {
        drafts: { 'draft-1': true },
      },
    });

    expect(removeListeningAssetReference({
      asset: current,
      reference: {
        kind: 'drafts',
        id: 'draft-1',
      },
      now: now + 1,
      rollbackControls: LISTENING_STORAGE_ROLLBACK_CONTROLS,
    })).toBe(current);
  });

  it('uses references rather than timestamps for pending-delete decisions', () => {
    expect(removeListeningAssetReference({
      asset: asset({
        updatedAt: now - (30 * 24 * 60 * 60 * 1000),
        references: {
          drafts: { 'draft-1': true },
          tests: { 'test-1': true },
        },
      }),
      reference: {
        kind: 'drafts',
        id: 'draft-1',
      },
      now,
    }).state).toBe('committed');

    expect(removeListeningAssetReference({
      asset: asset({
        updatedAt: now,
        references: {
          drafts: { 'draft-1': true },
        },
      }),
      reference: {
        kind: 'drafts',
        id: 'draft-1',
      },
      now,
    }).state).toBe('pending-delete');
  });

  it('preserves pending-delete timestamps on repeated reference removal retries', () => {
    const pending = removeListeningAssetReference({
      asset: asset({
        references: {
          drafts: { 'draft-1': true },
        },
      }),
      reference: {
        kind: 'drafts',
        id: 'draft-1',
      },
      now,
    });

    const retried = removeListeningAssetReference({
      asset: pending,
      reference: {
        kind: 'drafts',
        id: 'draft-1',
      },
      now: now + 10_000,
    });

    expect(retried.pendingDeleteAt).toBe(pending.pendingDeleteAt);
    expect(retried.deleteAfter).toBe(pending.deleteAfter);
  });

  it.each([
    'filename',
    'url',
    'key',
    'checksum',
    'byte-content',
  ] as const)('rejects implicit cross-test reuse by %s', (attemptedBy) => {
    expect(() => rejectImplicitCrossTestReuse({
      attemptedBy,
      ownerId: 'teacher-1',
      sourceTestId: 'test-a',
      targetTestId: 'test-b',
    })).toThrow('implicit_cross_test_reuse_denied');
  });

  it('makes cross-test reuse explicit and permits only a future trusted operation token', () => {
    expect(LISTENING_CROSS_TEST_REUSE_POLICY).toEqual({
      implicitFilenameUrlChecksumReuse: false,
      trustedRegistryReferenceRequired: true,
      implementationStatus: 'deferred-product-owner-approved',
    });
    expect(() => rejectImplicitCrossTestReuse({
      attemptedBy: 'trusted-registry-reference',
      ownerId: 'teacher-1',
      sourceTestId: 'test-a',
      targetTestId: 'test-b',
    })).not.toThrow();
  });
});
