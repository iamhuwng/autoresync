import { describe, expect, it } from 'vitest';

import { LISTENING_PENDING_DELETE_GRACE_MS } from './listeningAssetLifecycle';
import {
  LISTENING_ADMIN_DELETION_OPERATION,
  LISTENING_ASSET_DELETION_STATE_TRANSITIONS,
  LISTENING_DELETION_TOMBSTONE_RETENTION_MS,
  assertListeningMediaAssetStateTransition,
  createListeningAssetDeletionTombstone,
  planListeningAdministrativeAssetDeletion,
} from './listeningAssetDeletionGovernance';
import { LISTENING_STORAGE_ROLLBACK_CONTROLS } from './listeningAssetRollback';
import type { ListeningMediaAssetRecord, ListeningMediaAssetReferences } from './listeningAssetRegistry';

const now = 1_700_000_000_000;
const dayMs = 24 * 60 * 60 * 1000;

const pendingAsset = (overrides: Partial<ListeningMediaAssetRecord> = {}): ListeningMediaAssetRecord => ({
  assetId: 'asset-1',
  ownerId: 'teacher-1',
  uploadSessionId: 'session-1',
  state: 'pending-delete',
  tempKey: 'temp/listening/teacher-1/session-1/asset-1-audio.mp3',
  contentType: 'audio/mpeg',
  sizeBytes: 12_345,
  checksum: 'sha256:proof',
  checksumAlgorithm: 'sha256',
  createdAt: now - (10 * dayMs),
  updatedAt: now - LISTENING_PENDING_DELETE_GRACE_MS,
  createdBy: 'teacher-1',
  lastReferencedAt: now - LISTENING_PENDING_DELETE_GRACE_MS,
  references: {},
  pendingDeleteAt: now - LISTENING_PENDING_DELETE_GRACE_MS,
  deleteAfter: now,
  ...overrides,
});

const adminOperation = (overrides = {}) => ({
  operationId: 'admin-delete-operation-1',
  actorUserId: 'admin-1',
  actorRole: 'super-admin' as const,
  requestedVia: 'administrative-deletion' as const,
  reasonCode: 'retention-approved',
  idempotencyKeyHash: 'hash:admin-delete',
  requestHash: 'hash:request',
  ...overrides,
});

const referenceRecheck = (references: ListeningMediaAssetReferences = {}) => ({
  assetId: 'asset-1',
  checkedAt: now,
  references,
});

describe('Listening asset final deletion governance', () => {
  it('codifies the approved state machine and rejects direct unsafe transitions', () => {
    expect(LISTENING_ASSET_DELETION_STATE_TRANSITIONS).toEqual({
      temp: ['committing'],
      committing: ['committed', 'temp'],
      committed: ['pending-delete'],
      'pending-delete': ['committed', 'deleted'],
      deleted: ['deleted'],
    });

    expect(assertListeningMediaAssetStateTransition('pending-delete', 'deleted')).toBe('deleted');
    expect(() => assertListeningMediaAssetStateTransition('temp', 'committed')).toThrow(
      'invalid_asset_state_transition:temp->committed',
    );
    expect(() => assertListeningMediaAssetStateTransition('committed', 'deleted')).toThrow(
      'invalid_asset_state_transition:committed->deleted',
    );
    expect(() => assertListeningMediaAssetStateTransition('deleted', 'committed')).toThrow(
      'invalid_asset_state_transition:deleted->committed',
    );
  });

  it('denies deletion before the seven-day zero-reference pending-delete grace has elapsed', () => {
    expect(() => planListeningAdministrativeAssetDeletion({
      asset: pendingAsset({
        pendingDeleteAt: now - LISTENING_PENDING_DELETE_GRACE_MS + 1,
        deleteAfter: now + 1,
      }),
      operation: adminOperation(),
      referenceRecheck: referenceRecheck(),
      now,
    })).toThrow('pending_delete_grace_not_elapsed');
  });

  it('requires an immediate reference recheck before deletion', () => {
    expect(() => planListeningAdministrativeAssetDeletion({
      asset: pendingAsset(),
      operation: adminOperation(),
      now,
    })).toThrow('reference_recheck_required');

    expect(() => planListeningAdministrativeAssetDeletion({
      asset: pendingAsset(),
      operation: adminOperation(),
      referenceRecheck: {
        ...referenceRecheck(),
        checkedAt: now - 1,
      },
      now,
    })).toThrow('reference_recheck_not_immediate');
  });

  it('denies retained-reference deletion from the recheck even when the pending snapshot is empty', () => {
    expect(() => planListeningAdministrativeAssetDeletion({
      asset: pendingAsset({ references: {} }),
      operation: adminOperation(),
      referenceRecheck: referenceRecheck({
        versions: {
          'version-1': true,
        },
      }),
      now,
    })).toThrow('retained_references_block_delete');
  });

  it('creates an audited admin deletion intent and a metadata-only 90-day tombstone', () => {
    const plan = planListeningAdministrativeAssetDeletion({
      asset: pendingAsset(),
      operation: adminOperation(),
      referenceRecheck: referenceRecheck(),
      now,
    });

    expect(plan.deletion.operation).toBe(LISTENING_ADMIN_DELETION_OPERATION);
    expect(plan.deletion).toEqual({
      operation: 'administrative-delete-listening-asset',
      assetId: 'asset-1',
      ownerId: 'teacher-1',
      deletedAt: now,
      stateBefore: 'pending-delete',
      stateAfter: 'deleted',
      retainedReferenceCount: 0,
      referencesCheckedAt: now,
      tombstoneExpiresAt: now + LISTENING_DELETION_TOMBSTONE_RETENTION_MS,
    });
    expect(plan.tombstone).toEqual({
      schemaVersion: 1,
      assetId: 'asset-1',
      ownerId: 'teacher-1',
      uploadSessionId: 'session-1',
      state: 'deleted',
      deletedAt: now,
      deletedBy: 'admin-1',
      deletionOperationId: 'admin-delete-operation-1',
      reasonCode: 'retention-approved',
      sizeBytes: 12_345,
      contentType: 'audio/mpeg',
      retainedReferenceCount: 0,
      referencesCheckedAt: now,
      tombstoneExpiresAt: now + (90 * dayMs),
    });
    expect(plan.auditEvent).toEqual({
      operation: 'administrative-delete-listening-asset',
      actorUserId: 'admin-1',
      actorRole: 'super-admin',
      assetId: 'asset-1',
      ownerId: 'teacher-1',
      outcome: 'succeeded',
      reasonCode: 'retention-approved',
      createdAt: now,
    });
  });

  it('excludes signed URLs, secrets, keys, raw audio, and audio content from tombstones', () => {
    const tombstone = createListeningAssetDeletionTombstone({
      asset: {
        ...pendingAsset(),
        signedUrl: 'https://signed.example/audio.mp3?token=secret',
        streamUrl: 'https://public.example/audio.mp3',
        secretAccessKey: 'secret-key',
        durableKey: 'assessment-assets/listening/teacher-1/asset-1/audio.mp3',
        rawAudio: 'base64-audio',
        audioContent: new Uint8Array([1, 2, 3]),
      } as ListeningMediaAssetRecord & Record<string, unknown>,
      operation: adminOperation(),
      retainedReferenceCount: 0,
      referencesCheckedAt: now,
      deletedAt: now,
    });

    const serialized = JSON.stringify(tombstone);
    expect(serialized).not.toContain('https://');
    expect(serialized).not.toContain('secret');
    expect(serialized).not.toContain('assessment-assets');
    expect(serialized).not.toContain('base64-audio');
    expect(tombstone).not.toHaveProperty('tempKey');
    expect(tombstone).not.toHaveProperty('signedUrl');
    expect(tombstone).not.toHaveProperty('secretAccessKey');
    expect(tombstone).not.toHaveProperty('durableKey');
    expect(tombstone).not.toHaveProperty('rawAudio');
    expect(tombstone).not.toHaveProperty('audioContent');
  });

  it('requires a separate audited administrative operation and rejects teacher-endpoint reuse', () => {
    expect(() => planListeningAdministrativeAssetDeletion({
      asset: pendingAsset(),
      operation: adminOperation({
        actorRole: 'teacher',
      }),
      referenceRecheck: referenceRecheck(),
      now,
    })).toThrow('administrative_delete_requires_admin_actor');

    expect(() => planListeningAdministrativeAssetDeletion({
      asset: pendingAsset(),
      operation: adminOperation({
        requestedVia: 'teacher-endpoint',
      }),
      referenceRecheck: referenceRecheck(),
      now,
    })).toThrow('teacher_endpoint_delete_forbidden');
  });

  it('replays idempotent administrative deletion retries and rejects changed retry bodies', () => {
    const first = planListeningAdministrativeAssetDeletion({
      asset: pendingAsset(),
      operation: adminOperation(),
      referenceRecheck: referenceRecheck(),
      now,
    });

    expect(planListeningAdministrativeAssetDeletion({
      asset: pendingAsset(),
      operation: adminOperation(),
      referenceRecheck: referenceRecheck(),
      previousOperation: first.operationRecord,
      now,
    })).toEqual(first);

    expect(() => planListeningAdministrativeAssetDeletion({
      asset: pendingAsset(),
      operation: adminOperation({
        requestHash: 'hash:changed-request',
      }),
      referenceRecheck: referenceRecheck(),
      previousOperation: first.operationRecord,
      now,
    })).toThrow('administrative_delete_idempotency_conflict');
  });

  it('honors rollback stop-delete controls before producing any deletion intent', () => {
    expect(() => planListeningAdministrativeAssetDeletion({
      asset: pendingAsset(),
      operation: adminOperation(),
      referenceRecheck: referenceRecheck(),
      rollbackControls: LISTENING_STORAGE_ROLLBACK_CONTROLS,
      now,
    })).toThrow('cleanup_deletion_disabled');
  });
});
