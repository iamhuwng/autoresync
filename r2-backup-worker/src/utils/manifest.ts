/**
 * Manifest Builders (PRD §4.5, §4.6)
 *
 * Utilities for building backup manifests and media manifests.
 */

import type {
    BackupManifest,
    MediaManifest,
    MediaFileEntry,
} from '../types';

const WORKER_VERSION = '1.0.0';

/**
 * Generate a unique backup ID.
 * Format: BK-YYYY-MM-DD-HHmmss-{trigger}
 */
export function generateBackupId(trigger: 'auto' | 'manual'): string {
    const now = new Date();
    const timestamp = now.toISOString()
        .replace(/[-:T]/g, '')
        .slice(0, 14); // YYYYMMDDHHmmss
    const formatted = `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}-${timestamp.slice(8, 14)}`;
    return `BK-${formatted}-${trigger}`;
}

/**
 * Build a complete BackupManifest (PRD §4.5).
 */
export function buildBackupManifest(params: {
    backupId: string;
    trigger: 'auto' | 'manual';
    createdAt: string;
    completedAt: string;
    durationMs: number;
    status: 'complete' | 'partial' | 'failed';
    includesFirestore: boolean;
    firestoreSkipReason: string | null;
    firestoreCollectionsIncluded: string[];
    firebaseProject: string;
    rtdbBytesRead: number;
    firestoreDocsRead: number;
    entityCounts: {
        rtdb: Record<string, number>;
        firestore: Record<string, number>;
    };
    totalSizeBytes: number;
    checksums: Record<string, string>;
    previousBackupId: string | null;
}): BackupManifest {
    return {
        version: '1.0',
        backupId: params.backupId,
        type: 'data',
        trigger: params.trigger,
        createdAt: params.createdAt,
        completedAt: params.completedAt,
        durationMs: params.durationMs,
        status: params.status,
        includesFirestore: params.includesFirestore,
        firestoreSkipReason: params.firestoreSkipReason,
        firestoreCollectionsIncluded: params.firestoreCollectionsIncluded,
        includesMedia: false,
        workerVersion: WORKER_VERSION,
        firebaseProject: params.firebaseProject,
        sparkPlanUsage: {
            rtdbBytesRead: params.rtdbBytesRead,
            firestoreDocsRead: params.firestoreDocsRead,
        },
        entityCounts: params.entityCounts,
        totalSizeBytes: params.totalSizeBytes,
        checksums: params.checksums,
        previousBackupId: params.previousBackupId,
        encryptionKeyVersion: null,
    };
}

/**
 * Build a MediaManifest (PRD §4.6).
 * Lists all media files referenced by data in the primary R2 bucket.
 */
export function buildMediaManifest(
    files: MediaFileEntry[],
    backupId: string
): MediaManifest {
    const categories = {
        audio: { count: 0, sizeBytes: 0 },
        images: { count: 0, sizeBytes: 0 },
        avatars: { count: 0, sizeBytes: 0 },
    };

    for (const file of files) {
        if (file.type === 'audio') {
            categories.audio.count++;
            categories.audio.sizeBytes += file.sizeBytes;
        } else if (file.type === 'image') {
            categories.images.count++;
            categories.images.sizeBytes += file.sizeBytes;
        } else if (file.type === 'avatar') {
            categories.avatars.count++;
            categories.avatars.sizeBytes += file.sizeBytes;
        }
    }

    const totalSizeBytes = files.reduce((sum, f) => sum + f.sizeBytes, 0);

    return {
        version: '1.0',
        generatedAt: new Date().toISOString(),
        backupId,
        mediaFiles: files,
        totalFiles: files.length,
        totalSizeBytes,
        categories,
    };
}
