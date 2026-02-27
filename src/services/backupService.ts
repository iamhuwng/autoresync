/**
 * Backup Service — Frontend API Client for r2-backup-worker (PRD-0026)
 *
 * All backup/restore API calls go through this service.
 * Uses the super_admin's Firebase ID token for authorization.
 */

import { getAuth } from 'firebase/auth';

// Worker URL — set via environment variable or hardcode for development
const WORKER_BASE_URL = import.meta.env.VITE_BACKUP_WORKER_URL || '';

/**
 * Get the current user's Firebase ID token for Authorization header.
 */
async function getIdToken(): Promise<string> {
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) {
        throw new Error('Not authenticated');
    }
    return user.getIdToken();
}

/**
 * Make an authenticated request to the backup worker.
 */
async function workerFetch<T>(
    path: string,
    options: RequestInit = {}
): Promise<T> {
    const token = await getIdToken();
    const url = `${WORKER_BASE_URL}${path}`;

    console.log('[BackupService] Request:', options.method || 'GET', url);
    console.log('[BackupService] Worker base URL:', WORKER_BASE_URL || '(empty!)');

    const response = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            ...options.headers,
        },
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        console.error('[BackupService] Error response:', response.status, errorData);
        throw new Error((errorData as { error?: string }).error ?? `HTTP ${response.status}`);
    }

    return response.json() as Promise<T>;
}

// ─── Backup Operations ─────────────────────────────────────────────────

/**
 * Trigger a manual data backup.
 * Returns immediately with backupId — Step 1 (RTDB) runs async on the worker.
 */
export async function triggerBackup(): Promise<{ backupId: string }> {
    return workerFetch('/api/backup/trigger', { method: 'POST' });
}

/**
 * Tell the worker to proceed to the next backup step.
 */
export async function continueBackup(backupId: string): Promise<unknown> {
    return workerFetch(`/api/backup/continue/${backupId}`, { method: 'POST' });
}

// Track which backupIds we've already triggered continuation for
const continuationTriggered = new Set<string>();

/**
 * Get backup progress/status.
 * Automatically triggers next step when a step completes.
 */
export async function getBackupStatus(backupId: string): Promise<{
    id: string;
    type: string;
    phase: string;
    progress: number;
    currentNode: string;
    startedAt: string;
    completedAt?: string;
    error?: string;
}> {
    const result = await workerFetch(`/api/backup/status/${backupId}`);
    const status = result as any;
    console.log('[BackupService] Status response:', JSON.stringify(status));

    // Auto-trigger next step when a step completes
    const phase = status.phase;
    if (phase === 'rtdb_complete' || phase === 'firestore_complete') {
        const key = `${backupId}_${phase}`;
        if (!continuationTriggered.has(key)) {
            continuationTriggered.add(key);
            console.log(`[BackupService] Auto-continuing backup: ${phase} → next step`);
            continueBackup(backupId).catch(err =>
                console.error('[BackupService] Continue failed:', err)
            );
        }
    }

    return status;
}

/**
 * Get backup history list.
 */
export async function getBackupHistory(): Promise<Array<{
    backupId: string;
    type: string;
    trigger: string;
    createdAt: string;
    status: string;
    includesFirestore: boolean;
    totalSizeBytes: number;
    entityCounts: {
        rtdb: Record<string, number>;
        firestore: Record<string, number>;
    };
    firestoreSkipReason: string | null;
}>> {
    return workerFetch('/api/backup/history');
}

/**
 * Download a backup ZIP file.
 */
export async function downloadBackup(backupId: string): Promise<Blob> {
    const token = await getIdToken();

    const response = await fetch(`${WORKER_BASE_URL}/api/backup/download/${backupId}`, {
        headers: {
            'Authorization': `Bearer ${token}`,
        },
    });

    if (!response.ok) {
        throw new Error(`Download failed: HTTP ${response.status}`);
    }

    return response.blob();
}

/**
 * Get system health status.
 */
export async function getHealthStatus(): Promise<{
    status: string;
    primaryR2: boolean;
    backupR2: boolean;
    firebase: boolean;
    quotaStatus: {
        firestoreReadsToday: number;
        rtdbBytesThisMonth: number;
    };
    mediaChain?: {
        lastBackupId: string | null;
        sequenceNumber: number;
        lastBackupDate: string | null;
        chainLength: number;
        checkpointInterval: number;
    };
}> {
    const result = await workerFetch('/api/backup/health');
    console.log('[BackupService] Health response:', JSON.stringify(result, null, 2));
    return result as any;
}

// ─── Media Backup Operations ───────────────────────────────────────────

/**
 * Calculate media delta — returns file list with download URLs.
 */
export async function getMediaDelta(): Promise<{
    type: string;
    sequenceNumber: number;
    files: Array<{
        key: string;
        sizeBytes: number;
        lastModified: string;
        downloadUrl?: string;
    }>;
    totalSizeBytes: number;
    chainInfo: string;
}> {
    return workerFetch('/api/backup/media/delta', { method: 'POST' });
}

/**
 * Download a single media file via worker proxy.
 */
export async function downloadMediaFile(key: string): Promise<Blob> {
    const token = await getIdToken();
    const url = `${WORKER_BASE_URL}/api/backup/media/download?key=${encodeURIComponent(key)}`;

    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${token}`,
        },
    });

    if (!response.ok) {
        throw new Error(`Media download failed: HTTP ${response.status}`);
    }

    return response.blob();
}

// ─── Restore Operations ────────────────────────────────────────────────

/**
 * Generate restore preview diff.
 */
export async function getRestorePreview(backupId: string): Promise<{
    backupId: string;
    backupDate: string;
    categories: Array<{
        name: string;
        backupCount: number;
        currentCount: number;
        difference: number;
        status: string;
    }>;
    includesFirestore: boolean;
    firestoreMergeAvailable: {
        available: boolean;
        fromBackupId?: string;
        fromDate?: string;
    };
    gdprExcludedCount: number;
    warnings: string[];
}> {
    return workerFetch('/api/restore/preview', {
        method: 'POST',
        body: JSON.stringify({ backupId }),
    });
}

/**
 * Execute a restore operation.
 * Returns immediately with restoreId — restore runs async on the worker.
 */
export async function executeRestore(params: {
    backupId: string;
    scope: string[];
    mode: 'smart_auto' | 'per_entity';
    perEntityDecisions?: Record<string, 'skip' | 'overwrite' | 'duplicate'>;
    mergeFirestoreFromBackupId?: string;
}): Promise<{ restoreId: string }> {
    return workerFetch('/api/restore/execute', {
        method: 'POST',
        body: JSON.stringify(params),
    });
}

/**
 * Get restore progress/status.
 */
export async function getRestoreStatus(restoreId: string): Promise<{
    id: string;
    type: string;
    phase: string;
    progress: number;
    currentNode: string;
    startedAt: string;
    completedAt?: string;
    error?: string;
}> {
    return workerFetch(`/api/restore/status/${restoreId}`);
}
