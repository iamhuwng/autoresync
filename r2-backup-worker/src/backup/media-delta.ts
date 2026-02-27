/**
 * Media Delta Calculator (PRD §4.2.2, §4.16.5)
 *
 * Compares current primary R2 files against the previous media backup manifest
 * to determine which files are new or modified (delta).
 *
 * Chain strategy: Full(1) → Delta(2) → ... → Delta(5) → Full(6) → ...
 * Every MEDIA_CHECKPOINT_INTERVAL-th backup is a full checkpoint.
 *
 * ⚠️ IMPORTANT: Primary R2 uses a Worker binding (PRIMARY_R2), NOT an S3 API client.
 * R2 bucket bindings do NOT support pre-signed URLs.
 * Instead, the admin UI downloads files via the Worker proxy endpoint (GET /api/backup/media/download?key=...).
 */

import type {
    WorkerEnv,
    BackupState,
    MediaBackupManifest,
    MediaBackupFileEntry,
} from '../types';
import type { BackupR2Client } from '../utils/r2-client';

/** Media prefixes to scan in primary R2 */
const MEDIA_PREFIXES = ['audio/', 'images/', 'avatars/'];

interface MediaDeltaResult {
    type: 'full' | 'delta';
    sequenceNumber: number;
    files: MediaBackupFileEntry[];
    totalSizeBytes: number;
    chainInfo: string;
}

/**
 * Calculate the media delta — files new or modified since the last media backup.
 */
export async function calculateMediaDelta(
    env: WorkerEnv,
    r2: BackupR2Client
): Promise<MediaDeltaResult> {
    const checkpointInterval = parseInt(env.MEDIA_CHECKPOINT_INTERVAL, 10) || 6;

    // Read backup state for chain info
    let state = await r2.getObjectAsJson<BackupState>('backup_state.json');
    if (!state) {
        state = {
            firestoreReadsToday: 0,
            lastResetDate: '',
            mediaChain: {
                lastBackupId: null,
                sequenceNumber: 0,
                baseBackupId: null,
                chainLength: 0,
            },
            lastBackupTimestamp: null,
        };
    }

    const chain = state.mediaChain;
    const nextSeq = chain.sequenceNumber + 1;

    // Determine if this should be a full backup
    let isFull = false;
    let isCheckpoint = false;

    if (!chain.lastBackupId || !chain.baseBackupId) {
        isFull = true;
        isCheckpoint = true;
    } else if (nextSeq % checkpointInterval === 0) {
        isFull = true;
        isCheckpoint = true;
    } else if (chain.chainLength >= checkpointInterval) {
        // Safety: chain too long → force full
        isFull = true;
        isCheckpoint = true;
        console.warn(`[MediaDelta] Chain length ${chain.chainLength} exceeds interval, forcing full backup`);
    }

    // List all current files in primary R2
    const currentFiles: MediaBackupFileEntry[] = [];
    for (const prefix of MEDIA_PREFIXES) {
        let cursor: string | undefined;
        let truncated = true;

        while (truncated) {
            const listed = await env.PRIMARY_R2.list({ prefix, cursor });

            for (const obj of listed.objects) {
                currentFiles.push({
                    key: obj.key,
                    sizeBytes: obj.size,
                    lastModified: obj.uploaded.toISOString(),
                    // downloadUrl is set below
                });
            }

            truncated = listed.truncated;
            cursor = listed.truncated ? listed.cursor : undefined;
        }
    }

    let filesToReturn: MediaBackupFileEntry[];

    if (isFull) {
        // Full backup — return all files
        filesToReturn = currentFiles;
    } else {
        // Delta — compare against previous manifest
        const prevManifest = await r2.getObjectAsJson<MediaBackupManifest>(
            `media_manifests/${chain.lastBackupId}.json`
        );

        if (!prevManifest) {
            // Cannot find previous manifest — safe fallback to full
            console.warn('[MediaDelta] Previous manifest not found, defaulting to full backup');
            isFull = true;
            isCheckpoint = true;
            filesToReturn = currentFiles;
        } else {
            // Build a map of previous files by key
            const prevMap = new Map<string, string>(); // key → lastModified
            for (const f of prevManifest.files) {
                prevMap.set(f.key, f.lastModified);
            }

            // Find new or modified files
            filesToReturn = currentFiles.filter(f => {
                const prevModified = prevMap.get(f.key);
                if (!prevModified) return true; // New file
                return f.lastModified !== prevModified; // Modified file
            });
        }
    }

    // Set download URLs as Worker proxy paths (admin UI prepends base URL)
    for (const file of filesToReturn) {
        file.downloadUrl = `/api/backup/media/download?key=${encodeURIComponent(file.key)}`;
    }

    const mediaBackupId = `MB-${String(nextSeq).padStart(3, '0')}`;
    const totalSizeBytes = filesToReturn.reduce((sum, f) => sum + f.sizeBytes, 0);

    // Build and store the media backup manifest
    const manifest: MediaBackupManifest = {
        version: '1.0',
        mediaBackupId,
        type: isFull ? 'full' : 'delta',
        sequenceNumber: nextSeq,
        createdAt: new Date().toISOString(),
        baseBackupId: isFull ? mediaBackupId : (chain.baseBackupId ?? mediaBackupId),
        previousBackupId: chain.lastBackupId,
        chainLength: isFull ? 1 : chain.chainLength + 1,
        isCheckpoint,
        files: filesToReturn,
        totalFiles: filesToReturn.length,
        totalSizeBytes,
    };

    // Store manifest in backup R2
    await r2.putObject(
        `media_manifests/${mediaBackupId}.json`,
        JSON.stringify(manifest, null, 2),
        'application/json'
    );

    // Update backup_state.json with new chain state
    state.mediaChain = {
        lastBackupId: mediaBackupId,
        sequenceNumber: nextSeq,
        baseBackupId: isFull ? mediaBackupId : (chain.baseBackupId ?? mediaBackupId),
        chainLength: isFull ? 1 : chain.chainLength + 1,
    };

    await r2.putObject(
        'backup_state.json',
        JSON.stringify(state, null, 2),
        'application/json'
    );

    const chainInfo = isFull
        ? `Full backup (checkpoint #${nextSeq})`
        : `Delta #${chain.chainLength + 1} (next checkpoint at #${Math.ceil(nextSeq / checkpointInterval) * checkpointInterval})`;

    return {
        type: isFull ? 'full' : 'delta',
        sequenceNumber: nextSeq,
        files: filesToReturn,
        totalSizeBytes,
        chainInfo,
    };
}
