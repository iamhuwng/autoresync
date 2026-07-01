import type {
  ListeningMediaAssetRecord,
  ListeningMediaAssetReferences,
  ListeningMediaAssetState,
  ListeningUploadSessionLifecycleRecord,
  ListeningUploadSessionLease,
} from './listeningAssetRegistry';
import {
  isListeningCleanupDeletionStopped,
  shouldRetainListeningExistingAudio,
  type ListeningStorageRollbackControls,
} from './listeningAssetRollback';

export const LISTENING_HEARTBEAT_INTERVAL_MS = 60 * 1000;
export const LISTENING_HEARTBEAT_STALE_MS = 3 * 60 * 1000;
export const LISTENING_MAX_ELIGIBILITY_MS = 8 * 60 * 60 * 1000;
export const LISTENING_TEMP_FALLBACK_MS = 24 * 60 * 60 * 1000;
export const LISTENING_PENDING_DELETE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export type ListeningImmediateCleanupReason =
  | 'explicit-remove'
  | 'builder-cancel'
  | 'confirmed-navigation'
  | 'logout'
  | 'auth-loss'
  | 'failed-save-publish'
  | 'replacement-cancelled'
  | 'detected-abandonment';

export interface ListeningTempCleanupOperation {
  readonly operation: 'cleanup-temp';
  readonly assetId: string;
  readonly tempKey: string;
  readonly reason: ListeningImmediateCleanupReason;
  readonly queuedAt: number;
  readonly durableDeleteAllowed: false;
}

export interface ListeningDurablePreserveOperation {
  readonly operation: 'preserve-durable';
  readonly assetId: string;
  readonly reason: ListeningImmediateCleanupReason;
  readonly queuedAt: number;
  readonly durableDeleteAllowed: false;
}

export interface ListeningCleanupStoppedOperation {
  readonly operation: 'cleanup-stopped';
  readonly assetId: string;
  readonly reason: ListeningImmediateCleanupReason;
  readonly queuedAt: number;
  readonly durableDeleteAllowed: false;
}

export const LISTENING_CROSS_TEST_REUSE_POLICY = {
  implicitFilenameUrlChecksumReuse: false,
  trustedRegistryReferenceRequired: true,
  implementationStatus: 'deferred-product-owner-approved',
} as const;

export function queueImmediateListeningTempCleanup(input: {
  readonly assetId: string;
  readonly ownerId: string;
  readonly tempKey: string;
  readonly state: ListeningMediaAssetState;
  readonly reason: ListeningImmediateCleanupReason;
  readonly now: number;
  readonly rollbackControls?: ListeningStorageRollbackControls;
}): ListeningTempCleanupOperation | ListeningDurablePreserveOperation | ListeningCleanupStoppedOperation {
  if (isListeningCleanupDeletionStopped(input.rollbackControls)) {
    return {
      operation: 'cleanup-stopped',
      assetId: input.assetId,
      reason: input.reason,
      queuedAt: input.now,
      durableDeleteAllowed: false,
    };
  }
  if (input.state === 'temp' || input.state === 'committing') {
    return {
      operation: 'cleanup-temp',
      assetId: input.assetId,
      tempKey: input.tempKey,
      reason: input.reason,
      queuedAt: input.now,
      durableDeleteAllowed: false,
    };
  }
  return {
    operation: 'preserve-durable',
    assetId: input.assetId,
    reason: input.reason,
    queuedAt: input.now,
    durableDeleteAllowed: false,
  };
}

const assertSameOwnerDraft = (
  session: ListeningUploadSessionLifecycleRecord,
  ownerId: string,
  draftId: string,
): void => {
  if (session.ownerId !== ownerId || session.createdBy !== ownerId) {
    throw new Error('upload_session_owner_mismatch');
  }
  if (session.draftId && session.draftId !== draftId) {
    throw new Error('upload_session_draft_mismatch');
  }
};

const hasActiveLease = (
  leases: Record<string, ListeningUploadSessionLease> | undefined,
  now: number,
): boolean =>
  Object.values(leases ?? {}).some((lease) => lease.status === 'active' && lease.staleAt > now);

export interface ListeningAssetHeartbeatResult {
  readonly session: ListeningUploadSessionLifecycleRecord;
  readonly lease?: ListeningUploadSessionLease;
  readonly nextHeartbeatDueAt?: number;
  readonly heartbeatStaleAt?: number;
}

export function recordListeningAssetHeartbeat(input: {
  readonly session: ListeningUploadSessionLifecycleRecord;
  readonly ownerId: string;
  readonly assetId: string;
  readonly draftId: string;
  readonly leaseId: string;
  readonly tabIdHash: string;
  readonly now: number;
}): ListeningAssetHeartbeatResult {
  assertSameOwnerDraft(input.session, input.ownerId, input.draftId);
  if (input.session.status !== 'active') {
    return { session: input.session };
  }
  const maxExpiresAt = input.session.createdAt + LISTENING_MAX_ELIGIBILITY_MS;
  if (input.now > maxExpiresAt) {
    return {
      session: {
        ...input.session,
        status: 'expired',
        cleanupQueuedAt: input.now,
      },
    };
  }

  const lease: ListeningUploadSessionLease = {
    leaseId: input.leaseId,
    ownerId: input.ownerId,
    assetId: input.assetId,
    uploadSessionId: input.session.uploadSessionId,
    draftId: input.draftId,
    tabIdHash: input.tabIdHash,
    createdAt: input.now,
    lastHeartbeatAt: input.now,
    staleAt: input.now + LISTENING_HEARTBEAT_STALE_MS,
    maxExpiresAt,
    status: 'active',
  };

  return {
    session: {
      ...input.session,
      draftId: input.draftId,
      leaseIds: {
        ...(input.session.leaseIds ?? {}),
        [input.leaseId]: true,
      },
      lastHeartbeatAt: input.now,
    },
    nextHeartbeatDueAt: input.now + LISTENING_HEARTBEAT_INTERVAL_MS,
    heartbeatStaleAt: lease.staleAt,
    lease,
  };
}

export interface ListeningAssetLeaseCloseResult {
  readonly session: ListeningUploadSessionLifecycleRecord;
  readonly lease?: ListeningUploadSessionLease;
}

export function closeListeningAssetLease(input: {
  readonly session: ListeningUploadSessionLifecycleRecord;
  readonly leases: Record<string, ListeningUploadSessionLease>;
  readonly ownerId: string;
  readonly draftId: string;
  readonly leaseId: string;
  readonly now: number;
}): ListeningAssetLeaseCloseResult {
  assertSameOwnerDraft(input.session, input.ownerId, input.draftId);
  const existing = input.leases[input.leaseId];
  if (!existing) return { session: input.session };
  const leases = {
    ...input.leases,
    [input.leaseId]: {
      ...existing,
      status: 'closed' as const,
      closedAt: input.now,
    },
  };
  return {
    session: {
      ...input.session,
      ...(hasActiveLease(leases, input.now) ? {} : { cleanupQueuedAt: input.now }),
    },
    lease: leases[input.leaseId],
  };
}

export function isListeningTempFallbackDue(input: {
  readonly state: ListeningMediaAssetState;
  readonly createdAt: number;
  readonly now: number;
}): boolean {
  return (input.state === 'temp' || input.state === 'committing')
    && input.now >= input.createdAt + LISTENING_TEMP_FALLBACK_MS;
}

type ReferenceRemovalInput = {
  readonly kind: keyof ListeningMediaAssetReferences;
  readonly id: string;
};

const removeEmptyReferenceGroups = (
  references: ListeningMediaAssetReferences,
): ListeningMediaAssetReferences => {
  const cleaned: Partial<Record<keyof ListeningMediaAssetReferences, Record<string, true>>> = {};
  (Object.keys(references) as Array<keyof ListeningMediaAssetReferences>).forEach((kind) => {
    const group = references[kind];
    if (group && Object.keys(group).length > 0) cleaned[kind] = group;
  });
  return cleaned;
};

const retainedReferenceCount = (references: ListeningMediaAssetReferences): number =>
  Object.values(references).reduce((total, group) => total + Object.keys(group ?? {}).length, 0);

export function removeListeningAssetReference(input: {
  readonly asset: ListeningMediaAssetRecord;
  readonly reference: ReferenceRemovalInput;
  readonly now: number;
  readonly rollbackControls?: ListeningStorageRollbackControls;
}): ListeningMediaAssetRecord {
  if (shouldRetainListeningExistingAudio(input.rollbackControls)) return input.asset;
  if (input.asset.state === 'pending-delete' && retainedReferenceCount(input.asset.references) === 0) {
    return {
      ...input.asset,
      updatedAt: input.now,
    };
  }
  const group = { ...(input.asset.references[input.reference.kind] ?? {}) };
  delete group[input.reference.id];
  const references = removeEmptyReferenceGroups({
    ...input.asset.references,
    [input.reference.kind]: group,
  });
  if (retainedReferenceCount(references) > 0) {
    return {
      ...input.asset,
      references,
      updatedAt: input.now,
      lastReferencedAt: input.now,
    };
  }
  return {
    ...input.asset,
    state: 'pending-delete',
    references,
    updatedAt: input.now,
    pendingDeleteAt: input.now,
    deleteAfter: input.now + LISTENING_PENDING_DELETE_GRACE_MS,
  };
}

export function rejectImplicitCrossTestReuse(input: {
  readonly attemptedBy: 'filename' | 'url' | 'key' | 'checksum' | 'byte-content' | 'trusted-registry-reference';
  readonly ownerId: string;
  readonly sourceTestId: string;
  readonly targetTestId: string;
}): void {
  if (input.attemptedBy !== 'trusted-registry-reference') {
    throw new Error('implicit_cross_test_reuse_denied');
  }
}
