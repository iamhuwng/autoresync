/**
 * Types for the Backup & Disaster Recovery System (PRD-0026)
 * Single source of truth for all data shapes used by the Worker.
 */

// ─── Backup Manifest (§4.5) ────────────────────────────────────────────
export interface BackupManifest {
    version: string;
    backupId: string;
    type: 'data';
    trigger: 'auto' | 'manual';
    createdAt: string;
    completedAt: string;
    durationMs: number;
    status: 'complete' | 'partial' | 'failed';
    includesFirestore: boolean;
    firestoreSkipReason: string | null;
    firestoreCollectionsIncluded: string[];
    includesMedia: false; // Always false for data backups
    workerVersion: string;
    firebaseProject: string;
    sparkPlanUsage: {
        rtdbBytesRead: number;
        firestoreDocsRead: number;
    };
    entityCounts: {
        rtdb: Record<string, number>;
        firestore: Record<string, number>;
    };
    totalSizeBytes: number;
    checksums: Record<string, string>;
    previousBackupId: string | null;
    encryptionKeyVersion: string | null;
}

// ─── Media Manifest (§4.6) ─────────────────────────────────────────────
export interface MediaManifest {
    version: string;
    generatedAt: string;
    backupId: string;
    mediaFiles: MediaFileEntry[];
    totalFiles: number;
    totalSizeBytes: number;
    categories: {
        audio: { count: number; sizeBytes: number };
        images: { count: number; sizeBytes: number };
        avatars: { count: number; sizeBytes: number };
    };
}

export interface MediaFileEntry {
    url: string;
    key: string;
    type: 'audio' | 'image' | 'avatar';
    sizeBytes: number;
    referencedBy: string[];
}

// ─── Media Backup Manifest (§4.7) ──────────────────────────────────────
export interface MediaBackupManifest {
    version: string;
    mediaBackupId: string;
    type: 'full' | 'delta';
    sequenceNumber: number;
    createdAt: string;
    baseBackupId: string;
    previousBackupId: string | null;
    chainLength: number;
    isCheckpoint: boolean;
    files: MediaBackupFileEntry[];
    totalFiles: number;
    totalSizeBytes: number;
}

export interface MediaBackupFileEntry {
    key: string;
    sizeBytes: number;
    lastModified: string;
    downloadUrl?: string;
}

// ─── Backup State (persisted in backup R2 as backup_state.json) ────────
export interface BackupState {
    firestoreReadsToday: number;
    lastResetDate: string;
    mediaChain: {
        lastBackupId: string | null;
        sequenceNumber: number;
        baseBackupId: string | null;
        chainLength: number;
    };
    lastBackupTimestamp: string | null;
}

// ─── Backup History Entry ──────────────────────────────────────────────
export interface BackupHistoryEntry {
    backupId: string;
    type: 'data';
    trigger: 'auto' | 'manual';
    createdAt: string;
    status: 'complete' | 'partial' | 'failed';
    includesFirestore: boolean;
    totalSizeBytes: number;
    entityCounts: {
        rtdb: Record<string, number>;
        firestore: Record<string, number>;
    };
    firestoreSkipReason: string | null;
}

// ─── Backup Lock ───────────────────────────────────────────────────────
export interface BackupLock {
    backupId: string;
    createdAt: string;
    type: string;
    released?: boolean;
    releasedAt?: string;
}

// ─── Restore Progress ──────────────────────────────────────────────────
export interface RestoreProgress {
    restoreId: string;
    backupId: string;
    phase:
    | 'snapshot'
    | 'reading'
    | 'restoring_rtdb'
    | 'restoring_firestore'
    | 'validating'
    | 'complete'
    | 'failed';
    progress: number; // 0-100
    currentEntity: string;
    entitiesRestored: number;
    entitiesSkipped: number;
    entitiesFailed: number;
    totalEntities: number;
    startedAt: string;
    completedAt?: string;
    error?: string;
}

// ── Book metadata backup/restore inventory (PRD0062 48B) ────────────────

/** One explicit, non-overlapping canonical Book metadata root. */
export interface BookMetadataInventoryRoot {
    readonly path: string;
    readonly order: number;
    readonly required: true;
    readonly schemaVersion: 1;
    readonly present: boolean;
    /** Shared notifications are validated/fenced here and reconciled by #124. */
    readonly restoreDisposition: 'restore' | 'delegated-validation-only';
    readonly delegatedOwner: '#124' | null;
    readonly data: Record<string, unknown>;
    readonly entityCount: number;
    /** Deterministic metadata fingerprint; it never represents PDF bytes. */
    readonly contentFingerprint: string;
}

/** Versioned, exhaustive Book metadata-only backup payload. */
export interface BookMetadataBackupInventory {
    readonly kind: 'book-metadata-inventory';
    readonly inventoryVersion: 'prd0062-48b-v1';
    readonly schemaVersion: 1;
    readonly backupId: string;
    readonly firebaseProject: string;
    readonly generatedAt: string;
    readonly bytePolicy: 'metadata-only';
    readonly pdfBodyReads: 0;
    readonly pdfBodyWrites: 0;
    readonly pdfBodyBytes: 0;
    readonly rootCount: number;
    readonly roots: readonly BookMetadataInventoryRoot[];
    /** References are sorted and deduplicated at capture time. */
    readonly sourceVersionIds: readonly string[];
    readonly audit: {
        readonly bounded: true;
        readonly provenance: readonly string[];
    };
}

export interface BookMetadataRootFence {
    readonly etag: string;
    readonly revision: number | null;
}

export interface BookMetadataRestoreDiagnostic {
    readonly code: string;
    readonly path: string;
    readonly message: string;
}

/** Deterministic preview proof consumed by Book metadata execute. */
export interface BookMetadataRestorePreview {
    readonly backupId: string;
    readonly inventoryVersion: 'prd0062-48b-v1';
    readonly inventoryFingerprint: string;
    readonly valid: boolean;
    readonly allowed: boolean;
    readonly rootCount: number;
    readonly orderedRoots: readonly string[];
    readonly delegatedRoots: readonly string[];
    readonly rootFences: Readonly<Record<string, BookMetadataRootFence>>;
    readonly sourceVersionIds: readonly string[];
    readonly missingSourceVersionIds: readonly string[];
    readonly diagnostics: readonly BookMetadataRestoreDiagnostic[];
    readonly zeroByteProof: {
        readonly pdfBodyReads: 0;
        readonly pdfBodyWrites: 0;
        readonly providerOperations: 0;
    };
}

// ── PRD0062 49A recovery control plane ─────────────────────────────────

export const RECOVERY_ENVELOPE_SCHEMA_VERSION = 'prd0062-49a-v1' as const;
export const RECOVERY_OPERATION_SCHEMA_VERSION = 'prd0062-49a-v1' as const;

export type RecoveryEnvelopePhase = 'dry-run' | 'execute';

export type RecoveryOperationState =
    | 'previewed'
    | 'authorized'
    | 'restoring_canonical_authority'
    | 'rebuilding'
    | 'reconciling'
    | 'completed'
    | 'failed_retryable'
    | 'failed_terminal';

export type RecoveryWorkPhase =
    | 'restoring_canonical_authority'
    | 'rebuilding'
    | 'reconciling';

export type RecoverySuppressionFamily =
    | 'source-cleanup-provider-delete'
    | 'submission-result-scoring'
    | 'completion'
    | 'checkpoint'
    | 'notification'
    | 'update-replacement-revocation'
    | 'audit-fan-out';

export interface RecoverySnapshotIdentity {
    readonly backupId: string;
    readonly snapshotId: string;
    readonly firebaseProject: string;
    readonly tenantId: string;
    readonly ownerId: string;
    readonly inventoryVersion: string;
    readonly inventoryFingerprint: string;
    readonly allowedRoots: readonly string[];
}

export interface RecoveryEnvelopeAuthorization {
    readonly kind: 'deployment-operator' | 'deployment-service';
    readonly identity: string;
}

export interface RecoveryEnvelopeIntegrity {
    readonly algorithm: 'injected-signature';
    readonly value: string;
}

export interface RecoveryEnvelope {
    readonly kind: 'book-recovery-envelope';
    readonly schemaVersion: typeof RECOVERY_ENVELOPE_SCHEMA_VERSION;
    readonly snapshot: RecoverySnapshotIdentity;
    readonly phase: RecoveryEnvelopePhase;
    readonly idempotencyKey: string;
    readonly issuedAt: string;
    readonly expiresAt: string;
    readonly authorized: RecoveryEnvelopeAuthorization;
    readonly integrity: RecoveryEnvelopeIntegrity;
}

export interface RecoveryOperationError {
    readonly code: string;
    readonly phase: RecoveryWorkPhase | null;
    readonly at: string;
    readonly message: string;
}

export interface RecoveryOperationAuditEvent {
    readonly code: string;
    readonly at: string;
    readonly phase: RecoveryWorkPhase | null;
}

export interface RecoveryOperationRecord {
    readonly kind: 'book-recovery-operation';
    readonly schemaVersion: typeof RECOVERY_OPERATION_SCHEMA_VERSION;
    readonly operationId: string;
    readonly snapshot: RecoverySnapshotIdentity;
    readonly idempotencyKey: string;
    readonly requestFingerprint: string;
    readonly state: RecoveryOperationState;
    readonly stateRevision: number;
    readonly resumePhase: RecoveryWorkPhase | null;
    readonly attempts: Readonly<Record<RecoveryWorkPhase, number>>;
    readonly errors: readonly RecoveryOperationError[];
    readonly audit: readonly RecoveryOperationAuditEvent[];
    readonly suppression: {
        readonly mode: 'fail-closed';
        readonly families: readonly RecoverySuppressionFamily[];
        readonly releasedFamilies: readonly RecoverySuppressionFamily[];
        readonly finalReconciliation: 'pending' | 'approved';
    };
    readonly createdAt: string;
    readonly updatedAt: string;
}

// ─── Restore Preview ───────────────────────────────────────────────────
export interface RestorePreview {
    backupId: string;
    backupDate: string;
    categories: RestorePreviewCategory[];
    includesFirestore: boolean;
    firestoreMergeAvailable: {
        available: boolean;
        fromBackupId?: string;
        fromDate?: string;
    };
    gdprExcludedCount: number;
    warnings: string[];
    bookMetadata?: BookMetadataRestorePreview;
}

export interface RestorePreviewCategory {
    name: string;
    backupCount: number;
    currentCount: number;
    difference: number;
    status: 'match' | 'missing' | 'extra' | 'merged';
}

// ─── Restore Result ────────────────────────────────────────────────────
export interface RestoreResult {
    status: 'complete' | 'partial' | 'failed';
    entitiesRestored: number;
    entitiesSkipped: number;
    entitiesFailed: number;
    notificationsSkipped: true;
    details: Record<string, {
        restored: number;
        skipped: number;
        failed: number;
    }>;
    bookMetadata?: {
        readonly restoredRoots: number;
        readonly skippedRoots: number;
        readonly failedRoots: number;
    };
}

// ─── Status Tracker (in-memory + persisted to R2) ──────────────────────
export interface StatusTrackerState {
    id: string;
    type: 'backup' | 'restore';
    phase: string;
    progress: number;
    currentNode: string;
    startedAt: string;
    completedAt?: string;
    error?: string;
}

// ─── Worker Environment (Cloudflare Workers bindings & vars) ───────────
export interface WorkerEnv {
    // R2 bucket binding (primary — same Cloudflare account)
    PRIMARY_R2: R2Bucket;

    // Environment variables (from wrangler.toml [vars])
    FIREBASE_PROJECT_ID: string;
    FIREBASE_DB_URL: string;
    BACKUP_RETENTION_COUNT: string;
    MEDIA_CHECKPOINT_INTERVAL: string;
    ADMIN_UID: string;

    // Secrets (set via `wrangler secret put`)
    GOOGLE_SA_KEY: string;
    DIAGNOSTIC_TOKEN: string;
    BACKUP_R2_ACCESS_KEY_ID: string;
    BACKUP_R2_SECRET_ACCESS_KEY: string;
    BACKUP_R2_BUCKET_NAME: string;
    BACKUP_R2_ENDPOINT: string;
}
