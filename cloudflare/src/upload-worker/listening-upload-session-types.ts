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
  assetIds: Record<string, true>;
  assetRequests: Record<string, ListeningUploadAssetRecord>;
  bridgeVersion: '0056A-v1';
}

export interface ListeningUploadAssetReference {
  assetId: string;
  source: string;
}

export interface ListeningUploadSessionSweepCandidate {
  ownerId: string;
  uploadSessionId: string;
  status: Extract<ListeningUploadSessionStatus, 'active' | 'cleanup-queued'>;
  createdAt: number;
  expiresAt: number;
  maxEligibilityExpiresAt: number;
  assetCount: number;
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
  isRestoreInProgress?(): Promise<boolean>;
  findByCreationRequest(ownerId: string, creationRequestIdHash: string): Promise<ListeningUploadSessionRecord | null>;
  create(record: ListeningUploadSessionRecord): Promise<ListeningUploadSessionRecord>;
  get(ownerId: string, uploadSessionId: string): Promise<ListeningUploadSessionRecord | null>;
  issueAsset(input: {
    ownerId: string;
    uploadSessionId: string;
    assetRequestIdHash: string;
    asset: ListeningUploadAssetRecord;
  }): Promise<{ session: ListeningUploadSessionRecord; asset: ListeningUploadAssetRecord } | null>;
  findDurableAssetReferences?(input: {
    ownerId: string;
    assetIds: readonly string[];
    tempKeys: readonly string[];
  }): Promise<ListeningUploadAssetReference[]>;
  markCleanupState?(input: {
    ownerId: string;
    uploadSessionId: string;
    status: Extract<ListeningUploadSessionStatus, 'abandoned' | 'cleanup-queued'>;
    reason: string;
    cleanupQueuedAt: number;
    completedAt?: number;
    deletedAssetIds: readonly string[];
    preservedAssetIds: readonly string[];
  }): Promise<ListeningUploadSessionRecord | null>;
  listExpiredCleanupCandidates?(input: {
    now: number;
    notBeforeMs: number;
    maxOwners: number;
    maxSessions: number;
  }): Promise<ListeningUploadSessionSweepCandidate[]>;
  writeSweepRecord?(record: ListeningUploadSessionSweepRecord): Promise<void>;
  writeMetricRecord?(record: ListeningUploadSessionMetricRecord): Promise<void>;
}
