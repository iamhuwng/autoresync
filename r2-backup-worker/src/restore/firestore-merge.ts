/**
 * Firestore Merge — Find Closest Backup with Firestore Data (PRD §4.13.3)
 *
 * When restoring from a backup that skipped Firestore, this module
 * finds the closest backup that HAS Firestore data and extracts it.
 */

import type { BackupHistoryEntry } from '../types';
import type { BackupR2Client } from '../utils/r2-client';
import { extractBackupZip } from '../utils/zip';

/**
 * Find the closest backup that includes Firestore data
 * and extract its Firestore data.
 */
export async function findClosestFirestoreBackup(
    r2: BackupR2Client,
    currentBackupTimestamp: string
): Promise<{
    backupId: string;
    timestamp: string;
    firestoreData: Record<string, unknown>;
} | null> {
    // Read backup history
    const history = await r2.getObjectAsJson<BackupHistoryEntry[]>('backup_history.json');
    if (!history) return null;

    // Find all backups with Firestore
    const withFirestore = history
        .filter(b => b.status === 'complete' && b.includesFirestore)
        .sort((a, b) => {
            // Sort by distance from currentBackupTimestamp
            const currentTime = new Date(currentBackupTimestamp).getTime();
            const distA = Math.abs(new Date(a.createdAt).getTime() - currentTime);
            const distB = Math.abs(new Date(b.createdAt).getTime() - currentTime);
            return distA - distB;
        });

    if (withFirestore.length === 0) return null;

    const closest = withFirestore[0];

    // Download and extract the backup ZIP
    const zipData = await r2.getObject(`backups/${closest.backupId}.zip`);
    if (!zipData) {
        console.error(`[FirestoreMerge] Could not download backup: ${closest.backupId}`);
        return null;
    }

    try {
        const extracted = extractBackupZip(zipData);
        if (!extracted.firestore) {
            console.error(`[FirestoreMerge] Backup ${closest.backupId} claims Firestore but has no firestore/ data`);
            return null;
        }

        return {
            backupId: closest.backupId,
            timestamp: closest.createdAt,
            firestoreData: extracted.firestore,
        };
    } catch (err: unknown) {
        console.error('[FirestoreMerge] Failed to extract backup:', err);
        return null;
    }
}
