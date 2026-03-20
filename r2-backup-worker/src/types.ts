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
