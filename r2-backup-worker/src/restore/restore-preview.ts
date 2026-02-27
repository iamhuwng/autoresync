/**
 * Restore Preview — Generate Diff (PRD §4.13.4)
 *
 * Downloads and parses the backup, compares entity counts against live data,
 * and produces a detailed preview for the admin UI.
 */

import type {
    WorkerEnv,
    RestorePreview,
    RestorePreviewCategory,
} from '../types';
import type { BackupR2Client } from '../utils/r2-client';
import { extractBackupZip } from '../utils/zip';
import { findClosestFirestoreBackup } from './firestore-merge';
import { filterGdprEntities } from './gdpr-filter';
import { TokenCache } from '../auth/google-oauth';

/**
 * Generate a restore preview showing the diff between backup and live data.
 */
export async function generateRestorePreview(
    env: WorkerEnv,
    backupId: string,
    r2: BackupR2Client
): Promise<RestorePreview> {
    // 1. Download and parse the backup ZIP
    const zipData = await r2.getObject(`backups/${backupId}.zip`);
    if (!zipData) {
        throw new Error(`Backup not found: ${backupId}`);
    }

    const extracted = extractBackupZip(zipData);
    const { manifest } = extracted;

    const tokenCache = new TokenCache(env.GOOGLE_SA_KEY);
    const categories: RestorePreviewCategory[] = [];
    const warnings: string[] = [];

    // 2. Compare RTDB entity counts
    for (const [nodeName, backupCount] of Object.entries(manifest.entityCounts.rtdb)) {
        const currentToken = await tokenCache.getToken();
        const shallowUrl = `${env.FIREBASE_DB_URL}/${nodeName}.json?shallow=true&access_token=${currentToken}`;

        let currentCount = 0;
        try {
            const res = await fetch(shallowUrl);
            if (res.ok) {
                const data = await res.json() as Record<string, boolean> | null;
                currentCount = data ? Object.keys(data).length : 0;
            }
        } catch {
            // Node might not exist — count as 0
        }

        const difference = currentCount - backupCount;
        let status: RestorePreviewCategory['status'];

        if (difference === 0) status = 'match';
        else if (difference > 0) status = 'extra'; // Current has more
        else status = 'missing'; // Backup has more

        categories.push({
            name: nodeName,
            backupCount,
            currentCount,
            difference,
            status,
        });
    }

    // 3. Compare Firestore entity counts (if included)
    if (manifest.includesFirestore) {
        for (const [collName, backupCount] of Object.entries(manifest.entityCounts.firestore)) {
            const currentToken = await tokenCache.getToken();
            let currentCount = 0;

            try {
                // Use aggregation query for count (costs 1 read per 1000 docs)
                const aggUrl = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents:runAggregationQuery`;
                const res = await fetch(aggUrl, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${currentToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        structuredAggregationQuery: {
                            aggregations: [{ alias: 'count', count: {} }],
                            structuredQuery: {
                                from: [{ collectionId: collName }],
                            },
                        },
                    }),
                });

                if (res.ok) {
                    const results = await res.json() as Array<{
                        result: {
                            aggregateFields: {
                                count: { integerValue: string };
                            };
                        };
                    }>;
                    if (results[0]?.result?.aggregateFields?.count?.integerValue) {
                        currentCount = parseInt(results[0].result.aggregateFields.count.integerValue, 10);
                    }
                }
            } catch {
                // Collection might not exist
            }

            const difference = currentCount - backupCount;
            let status: RestorePreviewCategory['status'] = 'match';
            if (difference > 0) status = 'extra';
            else if (difference < 0) status = 'missing';

            categories.push({
                name: `${collName} (Firestore)`,
                backupCount,
                currentCount,
                difference,
                status,
            });
        }
    }

    // 4. Check Firestore merge availability
    let firestoreMergeAvailable: RestorePreview['firestoreMergeAvailable'] = { available: false };
    if (!manifest.includesFirestore) {
        const mergeResult = await findClosestFirestoreBackup(r2, manifest.createdAt);
        if (mergeResult) {
            firestoreMergeAvailable = {
                available: true,
                fromBackupId: mergeResult.backupId,
                fromDate: mergeResult.timestamp,
            };
        }
    }

    // 5. Count GDPR-excluded entities
    let gdprExcludedCount = 0;
    if (extracted.rtdb.deleted_users && typeof extracted.rtdb.deleted_users === 'object') {
        const { excludedCount } = filterGdprEntities(
            extracted.rtdb.deleted_users as Record<string, unknown>
        );
        gdprExcludedCount = excludedCount;
    }

    // 6. Generate warnings
    const backupAge = Date.now() - new Date(manifest.createdAt).getTime();
    const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
    if (backupAge > THREE_DAYS_MS) {
        const daysOld = Math.floor(backupAge / (24 * 60 * 60 * 1000));
        warnings.push(`This backup is ${daysOld} days old. Data created since may not be affected.`);
    }

    if (gdprExcludedCount > 0) {
        warnings.push(`${gdprExcludedCount} deleted user account(s) excluded from restore (GDPR compliance).`);
    }

    if (!manifest.includesFirestore && !firestoreMergeAvailable.available) {
        warnings.push('No Firestore backup available. Homework assignments, submissions, and streaks will NOT be restored.');
    }

    return {
        backupId,
        backupDate: manifest.createdAt,
        categories,
        includesFirestore: manifest.includesFirestore,
        firestoreMergeAvailable,
        gdprExcludedCount,
        warnings,
    };
}
