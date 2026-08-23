export interface ListeningUploadAssetRecord {
  assetId: string;
  fileName: string;
  sanitizedFileName: string;
  declaredMimeType: string;
  sizeBytes: number;
  tempKey: string;
  issuedAt: number;
  grantExpiresAt: number;
}

export type ListeningUploadSessionStatus =
  | 'active'
  | 'committing'
  | 'completed'
  | 'cleanup-queued'
  | 'abandoned'
  | 'expired';

export interface ListeningUploadSessionRecord {
  schemaVersion: 1;
  ownerId: string;
  uploadSessionId: string;
  purpose: 'listening-authoring';
  status: ListeningUploadSessionStatus;
  creationRequestIdHash: string;
  draftId?: string;
  testId?: string;
  revisionId?: string;
  createdAt: number;
  createdBy: string;
  expiresAt: number;
  maxEligibilityExpiresAt: number;
  lastGrantIssuedAt?: number;
  abandonmentReason?: string;
  cleanupQueuedAt?: number;
  completedAt?: number;
  deletedAssetIds?: Record<string, true>;
  preservedAssetIds?: Record<string, true>;
  cleanupFence?: {
    assetId: string;
    leaseId: string;
    claimedAt: number;
  };
  assetIds: Record<string, true>;
  assetRequests: Record<string, ListeningUploadAssetRecord>;
  bridgeVersion: '0056A-v1';
}

export interface ListeningUploadAssetReference {
  assetId: string;
  source: string;
  kind?: 'registry' | 'reference' | 'unknown';
}

export interface ListeningUploadCleanupLease {
  schemaVersion: 1;
  leaseId: string;
  kind: 'listening-temp-cleanup';
  ownerId: string;
  uploadSessionId: string;
  assetId: string;
  claimedAt: number;
  expiresAt: number;
}

export interface ListeningDeletedTempAssetTombstone {
  schemaVersion: 1;
  assetId: string;
  ownerId: string;
  uploadSessionId: string;
  cleanupLeaseId: string;
  state: 'deletion-pending' | 'deleted';
  deletedAt: number;
}

export interface ListeningUploadSessionSweepCandidate {
  ownerId: string;
  uploadSessionId: string;
  status: Extract<ListeningUploadSessionStatus, 'active' | 'cleanup-queued' | 'expired'>;
  createdAt: number;
  expiresAt: number;
  maxEligibilityExpiresAt: number;
  assetCount: number;
}

export interface ListeningUploadSessionSweepCursor {
  ownerId?: string;
  uploadSessionId?: string;
}

export interface ListeningUploadSessionSweepCheckpoint {
  schemaVersion: 1;
  sweepId: string;
  status: 'running' | 'complete' | 'failed';
  createdAt: number;
  updatedAt: number;
  notBeforeMs: number;
  cursor?: ListeningUploadSessionSweepCursor;
  leaseId?: string;
  leaseExpiresAt?: number;
  lastErrorCode?: string;
}

export interface ListeningUploadSessionSweepPage {
  candidates: ListeningUploadSessionSweepCandidate[];
  nextCursor?: ListeningUploadSessionSweepCursor;
  hasMore: boolean;
}

export interface ListeningUploadSessionSweepRecord {
  schemaVersion: 1;
  sweepId: string;
  status: 'running' | 'complete' | 'failed';
  createdAt: number;
  completedAt?: number;
  sweepKind: 'listening-temp-upload-session';
  trigger: 'scheduled';
  notBeforeMs: number;
  scannedCandidateCount: number;
  processedSessionCount: number;
  deletedAssetCount: number;
  preservedAssetCount: number;
  skippedAssetCount: number;
  failedSessionCount: number;
}

export interface ListeningUploadSessionMetricRecord {
  schemaVersion: 1;
  metricEventId: string;
  createdAt: number;
  ownerScope: string;
  assetId: string;
  operation: 'reconciliation' | 'delete-failure' | 'reclaimed-bytes';
  outcome: 'within-threshold' | 'threshold-exceeded';
  reasonCode: string;
  stateBefore: string;
  stateAfter: string;
  sizeBytes: number;
  durationMs: number;
  attemptCount: number;
  runId: string;
  budgetName: string;
  budgetValue: number;
  thresholdName: string;
  thresholdValue: number;
  stopAction: string;
}

export interface ListeningUploadSessionRepository {
  findByCreationRequest(ownerId: string, creationRequestIdHash: string): Promise<ListeningUploadSessionRecord | null>;
  create(record: ListeningUploadSessionRecord): Promise<ListeningUploadSessionRecord>;
  get(ownerId: string, uploadSessionId: string): Promise<ListeningUploadSessionRecord | null>;
  issueAsset(input: {
    ownerId: string;
    uploadSessionId: string;
    assetRequestIdHash: string;
    asset: ListeningUploadAssetRecord;
  }): Promise<{ session: ListeningUploadSessionRecord; asset: ListeningUploadAssetRecord } | null>;
  /** ETag-fenced transition. Terminal committing/completed records never match. */
  markCleanupState?(input: {
    ownerId: string;
    uploadSessionId: string;
    status: Extract<ListeningUploadSessionStatus, 'abandoned' | 'cleanup-queued'>;
    reason: string;
    cleanupQueuedAt: number;
    completedAt?: number;
    deletedAssetIds: readonly string[];
    preservedAssetIds: readonly string[];
    expectedStatuses?: readonly Extract<ListeningUploadSessionStatus, 'active' | 'cleanup-queued' | 'expired'>[];
    cleanupFence?: ListeningUploadSessionRecord['cleanupFence'];
  }): Promise<ListeningUploadSessionRecord | null>;
  findDurableAssetReferences?(input: {
    ownerId: string;
    uploadSessionId?: string;
    assetIds: readonly string[];
    tempKeys: readonly string[];
  }): Promise<ListeningUploadAssetReference[]>;
  isRestoreInProgress?(): Promise<boolean>;
  acquireCleanupLease?(input: {
    ownerId: string;
    uploadSessionId: string;
    assetId: string;
    leaseId: string;
    now: number;
    leaseMs: number;
  }): Promise<ListeningUploadCleanupLease | null>;
  assertCleanupLeaseOwned?(lease: ListeningUploadCleanupLease, now: number): Promise<boolean>;
  recordDeletedTempAsset?(input: {
    lease: ListeningUploadCleanupLease;
    deletedAt: number;
    state: ListeningDeletedTempAssetTombstone['state'];
  }): Promise<void>;
  releaseCleanupLease?(lease: ListeningUploadCleanupLease): Promise<void>;
  listExpiredCleanupCandidates?(input: {
    now: number;
    notBeforeMs: number;
    maxOwners: number;
    maxSessions: number;
    cursor?: ListeningUploadSessionSweepCursor;
  }): Promise<ListeningUploadSessionSweepPage | ListeningUploadSessionSweepCandidate[]>;
  readSweepCheckpoint?(): Promise<ListeningUploadSessionSweepCheckpoint | null>;
  acquireSweepLease?(input: {
    sweepId: string;
    now: number;
    leaseMs: number;
    notBeforeMs: number;
  }): Promise<ListeningUploadSessionSweepCheckpoint | null>;
  writeSweepCheckpoint?(record: ListeningUploadSessionSweepCheckpoint): Promise<void>;
  writeSweepRecord?(record: ListeningUploadSessionSweepRecord): Promise<void>;
  writeMetricRecord?(record: ListeningUploadSessionMetricRecord): Promise<void>;
}
