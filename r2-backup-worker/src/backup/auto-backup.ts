/**
 * Auto-Backup Retry Logic (PRD §4.10)
 *
 * Called by the scheduled() cron handler every Monday at 3:00 AM UTC.
 * Implements 3-attempt retry with 15-minute delays.
 */

import type { WorkerEnv, BackupHistoryEntry } from '../types';
import { BackupR2Client } from '../utils/r2-client';
import { StatusTracker } from './status-tracker';
import { executeStep1_RTDB, executeStep2_Firestore, executeStep3_Finalize } from './data-backup';
import { TokenCache } from '../auth/google-oauth';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Run the auto-backup with retry logic.
 * Runs all 3 steps sequentially in one cron invocation.
 */
export async function runAutoBackup(env: WorkerEnv): Promise<void> {
    const r2 = new BackupR2Client(
        env.BACKUP_R2_ACCESS_KEY_ID,
        env.BACKUP_R2_SECRET_ACCESS_KEY,
        env.BACKUP_R2_ENDPOINT,
        env.BACKUP_R2_BUCKET_NAME
    );

    // Check and clear stale restore flag (PRD §4.13.6 safety net)
    await clearStaleRestoreFlag(env);

    let lastError: string | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        console.log(`[AutoBackup] Attempt ${attempt}/${MAX_RETRIES}`);

        try {
            const tracker = new StatusTracker('backup');
            tracker.setR2Client(r2);
            const backupId = tracker.state.id;

            // Step 1: RTDB
            await executeStep1_RTDB(env, r2, 'auto', tracker);
            // Step 2: Firestore
            await executeStep2_Firestore(env, r2, backupId);
            // Step 3: Finalize
            await executeStep3_Finalize(env, r2, backupId);

            // Success — send admin notification
            await sendAdminNotification(env, `✅ Weekly backup completed successfully.`);

            console.log(`[AutoBackup] Success on attempt ${attempt}: ${backupId}`);
            return;
        } catch (err: unknown) {
            lastError = err instanceof Error ? err.message : 'Unknown error';
            console.error(`[AutoBackup] Attempt ${attempt} failed:`, lastError);

            if (attempt < MAX_RETRIES) {
                console.log(`[AutoBackup] Waiting ${RETRY_DELAY_MS / 60000} minutes before retry...`);
                await sleep(RETRY_DELAY_MS);
            }
        }
    }

    // All retries failed — record failure
    console.error(`[AutoBackup] All ${MAX_RETRIES} attempts failed. Last error: ${lastError}`);

    // Write failure entry to backup_history.json
    const history = await r2.getObjectAsJson<BackupHistoryEntry[]>('backup_history.json') ?? [];
    const failureEntry: BackupHistoryEntry = {
        backupId: `BK-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}-auto-FAILED`,
        type: 'data',
        trigger: 'auto',
        createdAt: new Date().toISOString(),
        status: 'failed',
        includesFirestore: false,
        totalSizeBytes: 0,
        entityCounts: { rtdb: {}, firestore: {} },
        firestoreSkipReason: `backup_failed: ${lastError}`,
    };

    history.push(failureEntry);
    await r2.putObject(
        'backup_history.json',
        JSON.stringify(history, null, 2),
        'application/json'
    );

    // Send failure notification
    await sendAdminNotification(
        env,
        `❌ Weekly backup failed after ${MAX_RETRIES} attempts. Please check backup settings.`
    );
}

/**
 * Send an in-app notification to the admin via RTDB REST API.
 * Follows the existing Notification type format.
 */
async function sendAdminNotification(env: WorkerEnv, message: string): Promise<void> {
    if (!env.ADMIN_UID) {
        console.warn('[AutoBackup] ADMIN_UID not set — cannot send notification');
        return;
    }

    try {
        const tokenCache = new TokenCache(env.GOOGLE_SA_KEY);
        const token = await tokenCache.getToken();

        const notifId = `backup_${Date.now()}`;
        const notification = {
            id: notifId,
            type: 'system',
            title: 'Backup System',
            message,
            read: false,
            createdAt: Date.now(),
        };

        const url = `${env.FIREBASE_DB_URL}/notifications/${env.ADMIN_UID}/${notifId}.json`;
        const res = await fetch(url, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify(notification),
        });

        if (!res.ok) {
            console.error(`[AutoBackup] Failed to send notification: ${res.status}`);
        }
    } catch (err: unknown) {
        console.error('[AutoBackup] Notification send error:', err);
    }
}

/**
 * Check and clear stale restore_in_progress flag (PRD §4.13.6 safety net).
 * If the flag is > 2 hours old, clear it — the Worker likely crashed mid-restore.
 */
export async function clearStaleRestoreFlag(env: WorkerEnv): Promise<void> {
    try {
        const tokenCache = new TokenCache(env.GOOGLE_SA_KEY);
        const token = await tokenCache.getToken();

        const flagsUrl = `${env.FIREBASE_DB_URL}/system_flags.json`;
        const res = await fetch(flagsUrl, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'X-Firebase-ETag': 'true',
            },
        });

        if (!res.ok) return;

        const flags = await res.json() as Record<string, unknown> | null;
        const now = Date.now();
        const flag = flags?.restore_in_progress as {
            active?: boolean;
            startedAt?: number;
            backupId?: string;
        } | null;
        const lease = flags?.listening_media_mutation_lease;
        const restoreLease = lease !== null && typeof lease === 'object' && !Array.isArray(lease)
            && (lease as Record<string, unknown>).kind === 'restore'
            ? lease as Record<string, unknown>
            : null;
        const ageMs = flag?.startedAt ? now - flag.startedAt : 0;
        const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
        let staleRestoreLeaseId: string | undefined;

        if (
            flag?.active
            && flag.startedAt
            && ageMs > TWO_HOURS_MS
            && restoreLease
            && Number(restoreLease.expiresAt) <= now
            && (!flag.backupId || restoreLease.backupId === flag.backupId)
        ) {
            console.warn(`[AutoBackup] Stale restore flag detected (${(ageMs / 60000).toFixed(0)} min old), clearing...`);
            const etag = res.headers.get('etag');
            if (!etag || !flags) return;
            const next = { ...flags };
            delete next.restore_in_progress;
            staleRestoreLeaseId = String(restoreLease.leaseId ?? '');
            delete next.listening_media_mutation_lease;
            const cleared = await fetch(flagsUrl, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'if-match': etag,
                },
                body: JSON.stringify(next),
            });
            if (!cleared.ok) return;
        } else if (restoreLease) {
            // Never clear a live restore. Its lease is the authoritative proof
            // even when the age-based watchdog threshold has elapsed.
            return;
        }

        const authoringUrl = `${env.FIREBASE_DB_URL}/listening_authoring.json`;
            const authoringResponse = await fetch(authoringUrl, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'X-Firebase-ETag': 'true',
                },
            });
        if (!authoringResponse.ok) return;
            const authoringEtag = authoringResponse.headers.get('etag');
            const authoring = await authoringResponse.json() as Record<string, unknown> | null;
            const authoringLease = authoring?.temp_cleanup_lease;
            if (
                !authoringEtag
                || !authoring
                || authoringLease === null
                || typeof authoringLease !== 'object'
                || Array.isArray(authoringLease)
                || (authoringLease as Record<string, unknown>).kind !== 'restore'
                || Number((authoringLease as Record<string, unknown>).expiresAt) > now
                || (staleRestoreLeaseId
                    && (authoringLease as Record<string, unknown>).leaseId !== staleRestoreLeaseId)
            ) return;
            const nextAuthoring = { ...authoring };
            delete nextAuthoring.temp_cleanup_lease;
            await fetch(authoringUrl, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'if-match': authoringEtag,
                },
                body: JSON.stringify(nextAuthoring),
            });
    } catch (err: unknown) {
        console.error('[AutoBackup] Failed to check/clear stale restore flag:', err);
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
