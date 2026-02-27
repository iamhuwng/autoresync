/**
 * Backup Retention — Prune stale history entries (PRD §4.11)
 *
 * Reads backup_history.json, checks each entry's backup file existence in R2.
 * If the file no longer exists (expired by lifecycle rule), removes the entry.
 * This keeps history consistent with actual R2 contents.
 */

import type { BackupHistoryEntry } from '../types';
import type { BackupR2Client } from '../utils/r2-client';

/**
 * Prune stale entries from backup_history.json.
 *
 * Entries whose backup files no longer exist in R2 (expired by lifecycle rule)
 * are removed from the history.
 */
export async function pruneBackupHistory(r2: BackupR2Client): Promise<void> {
    const history = await r2.getObjectAsJson<BackupHistoryEntry[]>('backup_history.json');
    if (!history || history.length === 0) return;

    const validEntries: BackupHistoryEntry[] = [];

    for (const entry of history) {
        // Check if the backup file still exists in R2
        const { exists } = await r2.headObject(`backups/${entry.backupId}.zip`);

        if (exists) {
            validEntries.push(entry);
        } else if (entry.status === 'failed') {
            // Keep failed entries for a while (they have no file) — remove if > 30 days old
            const age = Date.now() - new Date(entry.createdAt).getTime();
            const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
            if (age < THIRTY_DAYS_MS) {
                validEntries.push(entry);
            } else {
                console.log(`[Retention] Pruning old failed entry: ${entry.backupId}`);
            }
        } else {
            console.log(`[Retention] Pruning stale entry (file expired): ${entry.backupId}`);
        }
    }

    // Only write back if something changed
    if (validEntries.length !== history.length) {
        console.log(`[Retention] Pruned ${history.length - validEntries.length} entries (${validEntries.length} remaining)`);
        await r2.putObject(
            'backup_history.json',
            JSON.stringify(validEntries, null, 2),
            'application/json'
        );
    }
}
