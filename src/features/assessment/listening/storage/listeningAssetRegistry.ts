export const LISTENING_MEDIA_ASSET_STATES = [
  'temp',
  'committing',
  'committed',
  'pending-delete',
  'deleted',
] as const;

export type ListeningMediaAssetState = typeof LISTENING_MEDIA_ASSET_STATES[number];

export const LISTENING_MEDIA_ASSET_INDEXES = [
  'ownerId',
  'state',
  'uploadSessionId',
  'createdAt',
  'committedAt',
  'pendingDeleteAt',
  'deleteAfter',
  'tombstoneExpiresAt',
  'lastReferencedAt',
] as const;

export interface ListeningMediaAssetReferences {
  readonly drafts?: Record<string, true>;
  readonly tests?: Record<string, true>;
  readonly versions?: Record<string, true>;
  readonly results?: Record<string, true>;
  readonly assignments?: Record<string, true>;
  readonly sessions?: Record<string, true>;
}

export interface ListeningMediaAssetRecord {
  readonly assetId: string;
  readonly ownerId: string;
  readonly uploadSessionId: string;
  readonly state: ListeningMediaAssetState;
  readonly tempKey: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly checksum: string;
  readonly checksumAlgorithm: 'sha256';
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly createdBy: string;
  readonly lastReferencedAt: number;
  readonly references: ListeningMediaAssetReferences;
  readonly committedAt?: number;
  readonly pendingDeleteAt?: number;
  readonly deleteAfter?: number;
  readonly tombstoneExpiresAt?: number;
}

export type ListeningUploadSessionLifecycleStatus =
  | 'active'
  | 'committing'
  | 'completed'
  | 'abandoned'
  | 'expired'
  | 'cleanup-queued';

export interface ListeningUploadSessionLifecycleRecord {
  readonly ownerId: string;
  readonly uploadSessionId: string;
  readonly createdBy: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly maxEligibilityExpiresAt: number;
  readonly status: ListeningUploadSessionLifecycleStatus;
  readonly bridgeVersion: string;
  readonly draftId?: string;
  readonly leaseIds?: Record<string, true>;
  readonly lastHeartbeatAt?: number;
  readonly abandonmentReason?: string;
  readonly cleanupQueuedAt?: number;
  readonly completedAt?: number;
}

export interface ListeningUploadSessionLease {
  readonly leaseId: string;
  readonly ownerId: string;
  readonly assetId: string;
  readonly uploadSessionId: string;
  readonly draftId: string;
  readonly tabIdHash: string;
  readonly createdAt: number;
  readonly lastHeartbeatAt: number;
  readonly staleAt: number;
  readonly maxExpiresAt: number;
  readonly status: 'active' | 'closed' | 'stale';
  readonly closedAt?: number;
}

export interface CreateListeningMediaAssetRecordInput {
  readonly assetId: string;
  readonly ownerId: string;
  readonly uploadSessionId: string;
  readonly tempKey: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly checksum: string;
  readonly createdAt: number;
  readonly createdBy: string;
  readonly references?: ListeningMediaAssetReferences;
}

export interface ListeningMediaAssetCleanupGate {
  readonly cleanupEnabled?: boolean;
  readonly restoreVerifiedAt?: number | null;
  readonly integrityVerified?: boolean;
}

export function createListeningMediaAssetRecord(
  input: CreateListeningMediaAssetRecordInput,
): ListeningMediaAssetRecord {
  return {
    assetId: input.assetId,
    ownerId: input.ownerId,
    uploadSessionId: input.uploadSessionId,
    state: 'temp',
    tempKey: input.tempKey,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    checksum: input.checksum,
    checksumAlgorithm: 'sha256',
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    createdBy: input.createdBy,
    lastReferencedAt: input.createdAt,
    references: input.references ?? {},
  };
}

// Cleanup must fail closed until restore and integrity are both verified.
export function isListeningMediaAssetCleanupAuthorized(
  gate: ListeningMediaAssetCleanupGate,
): boolean {
  return Boolean(gate.cleanupEnabled && gate.restoreVerifiedAt && gate.integrityVerified);
}

export function continueListeningUploadSessionLifecycle(input: {
  readonly session: ListeningUploadSessionLifecycleRecord;
  readonly ownerId: string;
  readonly now: number;
}): ListeningUploadSessionLifecycleRecord {
  if (input.session.ownerId !== input.ownerId || input.session.createdBy !== input.ownerId) {
    throw new Error('upload_session_owner_mismatch');
  }
  if (input.session.status !== 'active') {
    return input.session;
  }
  if (input.now > input.session.maxEligibilityExpiresAt) {
    return {
      ...input.session,
      status: 'expired',
      cleanupQueuedAt: input.now,
    };
  }
  return {
    ...input.session,
    lastHeartbeatAt: input.now,
  };
}
