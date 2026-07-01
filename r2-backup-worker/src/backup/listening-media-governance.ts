export const LISTENING_MEDIA_BACKUP_GOVERNANCE = {
  workerOwner: 'r2-backup-worker/',
  ownerApproval: {
    status: 'recorded',
    decisionRef: 'PRD-0055 Task 6.5 Batch C current-thread DR-worker owner approval',
    scope: 'local audio-object backup governance design/tests only',
    approvedAt: '2026-06-29',
  },
  mediaRetention: {
    backupsPrefixDays: 77,
    preRestorePrefixDays: 14,
    backupCopiesAreLiveProductReferences: false,
  },
  restoreAuthority: {
    allowedActorRoles: ['super-admin', 'service-admin'],
    permanentlyDeletedRestoreRequiresApprovedPath: true,
  },
  registryBackupRestore: {
    status: 'accepted-task-4',
    mustNotBeDeferredByTask6_5: true,
    evidence: 'data-backup.test.ts and restore-execute.test.ts registry path backup/restore drill',
  },
} as const;

export type ListeningBackupReferenceSource = 'live-product' | 'backup-copy';

export interface ListeningBackupReferenceEvidence {
  readonly source: ListeningBackupReferenceSource;
  readonly key: string;
  readonly assetId: string;
  readonly sizeBytes: number;
  readonly referencePath?: string;
}

export interface ListeningLiveReferenceSummary {
  readonly liveProductReferenceCount: number;
  readonly backupCopyCount: number;
  readonly backupCopyBytes: number;
}

export type ListeningMediaDeletionState =
  | 'active'
  | 'gdpr-completed'
  | 'tombstoned'
  | 'permanently-deleted';

export interface ListeningMediaRestoreCandidate {
  readonly assetId: string;
  readonly ownerId: string;
  readonly key: string;
  readonly sizeBytes: number;
  readonly deletionState: ListeningMediaDeletionState;
}

export interface ListeningMediaRestoreAuthority {
  readonly actorRole: 'teacher' | 'super-admin' | 'service-admin';
  readonly approvalStatus: 'approved' | 'missing';
  readonly approvalId: string;
}

export interface ListeningMediaRestoreExclusion {
  readonly assetId: string;
  readonly key: string;
  readonly reasonCode:
    | 'gdpr_completed_delete_filter'
    | 'metadata_tombstone_filter'
    | 'permanent_delete_filter';
  readonly approvedRestorePathRequired: boolean;
  readonly liveRetentionAllowed: false;
}

export interface ListeningMediaRestoreGovernancePlan {
  readonly status: 'planned';
  readonly restorableAssetIds: readonly string[];
  readonly excluded: readonly ListeningMediaRestoreExclusion[];
  readonly approvalId: string;
  readonly generatedAt: number;
}

export interface ListeningMediaBackupRestoreDeletionFilterDrill {
  readonly status: 'passed-local-drill';
  readonly restoredAssetIds: readonly string[];
  readonly excludedAssetIds: readonly string[];
  readonly backupCopiesLiveProductReferenceCount: 0;
  readonly registryBackupRestoreAcceptance: 'preserved-task-4';
  readonly cronProofRequired: true;
}

export function deriveListeningLiveReferenceSummary(
  references: readonly ListeningBackupReferenceEvidence[],
): ListeningLiveReferenceSummary {
  return references.reduce<ListeningLiveReferenceSummary>((summary, reference) => {
    if (reference.source === 'backup-copy') {
      return {
        ...summary,
        backupCopyCount: summary.backupCopyCount + 1,
        backupCopyBytes: summary.backupCopyBytes + reference.sizeBytes,
      };
    }
    return {
      ...summary,
      liveProductReferenceCount: summary.liveProductReferenceCount + 1,
    };
  }, {
    liveProductReferenceCount: 0,
    backupCopyCount: 0,
    backupCopyBytes: 0,
  });
}

const assertRestoreAuthority = (authority: ListeningMediaRestoreAuthority): void => {
  if (
    authority.approvalStatus !== 'approved'
    || (authority.actorRole !== 'super-admin' && authority.actorRole !== 'service-admin')
  ) {
    throw new Error('listening_media_restore_requires_dr_authority');
  }
};

const exclusionFor = (
  candidate: ListeningMediaRestoreCandidate,
): ListeningMediaRestoreExclusion | undefined => {
  if (candidate.deletionState === 'gdpr-completed') {
    return {
      assetId: candidate.assetId,
      key: candidate.key,
      reasonCode: 'gdpr_completed_delete_filter',
      approvedRestorePathRequired: false,
      liveRetentionAllowed: false,
    };
  }
  if (candidate.deletionState === 'tombstoned') {
    return {
      assetId: candidate.assetId,
      key: candidate.key,
      reasonCode: 'metadata_tombstone_filter',
      approvedRestorePathRequired: false,
      liveRetentionAllowed: false,
    };
  }
  if (candidate.deletionState === 'permanently-deleted') {
    return {
      assetId: candidate.assetId,
      key: candidate.key,
      reasonCode: 'permanent_delete_filter',
      approvedRestorePathRequired: true,
      liveRetentionAllowed: false,
    };
  }
  return undefined;
};

export function planListeningMediaRestoreGovernance(input: {
  readonly now: number;
  readonly restoreAuthority: ListeningMediaRestoreAuthority;
  readonly candidates: readonly ListeningMediaRestoreCandidate[];
}): ListeningMediaRestoreGovernancePlan {
  assertRestoreAuthority(input.restoreAuthority);
  const restorableAssetIds: string[] = [];
  const excluded: ListeningMediaRestoreExclusion[] = [];
  for (const candidate of input.candidates) {
    const exclusion = exclusionFor(candidate);
    if (exclusion) {
      excluded.push(exclusion);
      continue;
    }
    restorableAssetIds.push(candidate.assetId);
  }
  return {
    status: 'planned',
    restorableAssetIds,
    excluded,
    approvalId: input.restoreAuthority.approvalId,
    generatedAt: input.now,
  };
}

export function runListeningMediaBackupRestoreDeletionFilterDrill(input: {
  readonly now: number;
  readonly restoreAuthority: ListeningMediaRestoreAuthority;
  readonly backupReferences: readonly ListeningBackupReferenceEvidence[];
  readonly restoreCandidates: readonly ListeningMediaRestoreCandidate[];
}): ListeningMediaBackupRestoreDeletionFilterDrill {
  const referenceSummary = deriveListeningLiveReferenceSummary(input.backupReferences);
  if (referenceSummary.liveProductReferenceCount > 0) {
    throw new Error('listening_media_backup_copy_live_reference_detected');
  }
  const restorePlan = planListeningMediaRestoreGovernance({
    now: input.now,
    restoreAuthority: input.restoreAuthority,
    candidates: input.restoreCandidates,
  });
  return {
    status: 'passed-local-drill',
    restoredAssetIds: restorePlan.restorableAssetIds,
    excludedAssetIds: restorePlan.excluded.map((entry) => entry.assetId),
    backupCopiesLiveProductReferenceCount: 0,
    registryBackupRestoreAcceptance: 'preserved-task-4',
    cronProofRequired: true,
  };
}
