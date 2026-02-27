/**
 * Backup Lock Mechanism (PRD §4.9)
 *
 * Prevents concurrent backups using a lock file in backup R2.
 * Since the R2 token has NO delete permission, release uses overwrite.
 */

import type { BackupLock } from '../types';
import type { BackupR2Client } from '../utils/r2-client';

const LOCK_KEY = 'backup_lock.json';
const STALE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes — optimized backup finishes in ~15s

/**
 * Attempt to acquire the backup lock.
 * - If lock exists and < 30 min old → reject
 * - If lock exists but > 30 min old → stale, overwrite
 * - If lock released or doesn't exist → acquire
 */
export async function acquireLock(
    r2: BackupR2Client,
    backupId: string,
    type: string
): Promise<{ acquired: boolean; reason?: string }> {
    const existing = await r2.getObjectAsJson<BackupLock>(LOCK_KEY);

    if (existing && !existing.released) {
        const lockAge = Date.now() - new Date(existing.createdAt).getTime();
        if (lockAge < STALE_THRESHOLD_MS) {
            return {
                acquired: false,
                reason: `Another backup in progress (${existing.backupId}, started ${existing.createdAt})`,
            };
        }
        // Stale lock (> 30 min) — proceed to overwrite
        console.log(`[Lock] Stale lock detected (${lockAge}ms old), overwriting`);
    }

    // Write new lock
    const newLock: BackupLock = {
        backupId,
        createdAt: new Date().toISOString(),
        type,
    };

    await r2.putObject(LOCK_KEY, JSON.stringify(newLock, null, 2), 'application/json');
    return { acquired: true };
}

/**
 * Release the backup lock by overwriting with a released marker.
 * Since the R2 token has no delete permission, we overwrite instead of deleting.
 */
export async function releaseLock(r2: BackupR2Client): Promise<void> {
    const releasedLock: BackupLock = {
        backupId: '',
        createdAt: '',
        type: '',
        released: true,
        releasedAt: new Date().toISOString(),
    };

    await r2.putObject(LOCK_KEY, JSON.stringify(releasedLock, null, 2), 'application/json');
}

/**
 * Check if the current lock is stale (> 30 minutes old).
 */
export async function checkStaleLock(r2: BackupR2Client): Promise<boolean> {
    const existing = await r2.getObjectAsJson<BackupLock>(LOCK_KEY);
    if (!existing || existing.released) return false;

    const lockAge = Date.now() - new Date(existing.createdAt).getTime();
    return lockAge > STALE_THRESHOLD_MS;
}
