import { describe, expect, it } from 'vitest';

import {
  LISTENING_MEDIA_BACKUP_GOVERNANCE,
  deriveListeningLiveReferenceSummary,
  planListeningMediaRestoreGovernance,
  runListeningMediaBackupRestoreDeletionFilterDrill,
} from './listening-media-governance';

describe('Listening media backup governance', () => {
  it('records DR-worker ownership, retention policy, and Task 4 registry backup/restore acceptance', () => {
    expect(LISTENING_MEDIA_BACKUP_GOVERNANCE).toMatchObject({
      workerOwner: 'r2-backup-worker/',
      ownerApproval: {
        status: 'recorded',
        decisionRef: 'PRD-0055 Task 6.5 Batch C current-thread DR-worker owner approval',
        scope: 'local audio-object backup governance design/tests only',
      },
      mediaRetention: {
        backupsPrefixDays: 77,
        preRestorePrefixDays: 14,
        backupCopiesAreLiveProductReferences: false,
      },
      registryBackupRestore: {
        status: 'accepted-task-4',
        mustNotBeDeferredByTask6_5: true,
      },
    });
  });

  it('does not count backup copies as live product references', () => {
    const summary = deriveListeningLiveReferenceSummary([
      {
        source: 'backup-copy',
        key: 'backups/BK-2026-06-29.zip',
        assetId: 'asset-1',
        sizeBytes: 100,
      },
      {
        source: 'backup-copy',
        key: 'pre-restore/2026-06-29.zip',
        assetId: 'asset-1',
        sizeBytes: 100,
      },
      {
        source: 'live-product',
        key: 'assessment-assets/listening/teacher-1/asset-1/audio.mp3',
        assetId: 'asset-1',
        referencePath: 'listening_authoring/versions/version-1/audioSections/0',
        sizeBytes: 100,
      },
    ]);

    expect(summary).toEqual({
      liveProductReferenceCount: 1,
      backupCopyCount: 2,
      backupCopyBytes: 200,
    });
  });

  it('filters GDPR-completed, tombstoned, and permanently deleted objects from restore/live retention', () => {
    const plan = planListeningMediaRestoreGovernance({
      now: 1_700_000_000_000,
      restoreAuthority: {
        actorRole: 'service-admin',
        approvalStatus: 'approved',
        approvalId: 'drill-approved',
      },
      candidates: [
        {
          assetId: 'asset-active',
          ownerId: 'teacher-1',
          key: 'assessment-assets/listening/teacher-1/asset-active/audio.mp3',
          sizeBytes: 100,
          deletionState: 'active',
        },
        {
          assetId: 'asset-gdpr',
          ownerId: 'teacher-deleted',
          key: 'assessment-assets/listening/teacher-deleted/asset-gdpr/audio.mp3',
          sizeBytes: 200,
          deletionState: 'gdpr-completed',
        },
        {
          assetId: 'asset-tombstone',
          ownerId: 'teacher-1',
          key: 'assessment-assets/listening/teacher-1/asset-tombstone/audio.mp3',
          sizeBytes: 300,
          deletionState: 'tombstoned',
        },
        {
          assetId: 'asset-permanent',
          ownerId: 'teacher-1',
          key: 'assessment-assets/listening/teacher-1/asset-permanent/audio.mp3',
          sizeBytes: 400,
          deletionState: 'permanently-deleted',
        },
      ],
    });

    expect(plan.restorableAssetIds).toEqual(['asset-active']);
    expect(plan.excluded.map((entry) => entry.reasonCode)).toEqual([
      'gdpr_completed_delete_filter',
      'metadata_tombstone_filter',
      'permanent_delete_filter',
    ]);
    expect(plan.excluded.every((entry) => entry.liveRetentionAllowed === false)).toBe(true);
  });

  it('requires DR restore authority and blocks permanent-delete resurrection without approved restore path', () => {
    expect(() => planListeningMediaRestoreGovernance({
      now: 1_700_000_000_000,
      restoreAuthority: {
        actorRole: 'teacher',
        approvalStatus: 'approved',
        approvalId: 'bad-actor',
      },
      candidates: [],
    })).toThrow('listening_media_restore_requires_dr_authority');

    const plan = planListeningMediaRestoreGovernance({
      now: 1_700_000_000_000,
      restoreAuthority: {
        actorRole: 'service-admin',
        approvalStatus: 'approved',
        approvalId: 'drill-approved',
      },
      candidates: [{
        assetId: 'asset-permanent',
        ownerId: 'teacher-1',
        key: 'assessment-assets/listening/teacher-1/asset-permanent/audio.mp3',
        sizeBytes: 400,
        deletionState: 'permanently-deleted',
      }],
    });

    expect(plan.restorableAssetIds).toEqual([]);
    expect(plan.excluded[0]).toMatchObject({
      assetId: 'asset-permanent',
      reasonCode: 'permanent_delete_filter',
      approvedRestorePathRequired: true,
      liveRetentionAllowed: false,
    });
  });

  it('performs a local backup/restore/deletion-filter drill without making backup copies live references', () => {
    const drill = runListeningMediaBackupRestoreDeletionFilterDrill({
      now: 1_700_000_000_000,
      restoreAuthority: {
        actorRole: 'service-admin',
        approvalStatus: 'approved',
        approvalId: 'drill-approved',
      },
      backupReferences: [
        {
          source: 'backup-copy',
          key: 'backups/BK-2026-06-29.zip',
          assetId: 'asset-active',
          sizeBytes: 100,
        },
      ],
      restoreCandidates: [
        {
          assetId: 'asset-active',
          ownerId: 'teacher-1',
          key: 'assessment-assets/listening/teacher-1/asset-active/audio.mp3',
          sizeBytes: 100,
          deletionState: 'active',
        },
        {
          assetId: 'asset-deleted',
          ownerId: 'teacher-1',
          key: 'assessment-assets/listening/teacher-1/asset-deleted/audio.mp3',
          sizeBytes: 200,
          deletionState: 'permanently-deleted',
        },
      ],
    });

    expect(drill).toEqual({
      status: 'passed-local-drill',
      restoredAssetIds: ['asset-active'],
      excludedAssetIds: ['asset-deleted'],
      backupCopiesLiveProductReferenceCount: 0,
      registryBackupRestoreAcceptance: 'preserved-task-4',
      cronProofRequired: true,
    });
  });
});
