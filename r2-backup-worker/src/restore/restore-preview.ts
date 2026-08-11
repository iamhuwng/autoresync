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
    BookMetadataRestoreDiagnostic,
} from '../types';
import type { BackupR2Client } from '../utils/r2-client';
import { extractBackupZip } from '../utils/zip';
import { findClosestFirestoreBackup } from './firestore-merge';
import { filterGdprEntities } from './gdpr-filter';
import { TokenCache } from '../auth/google-oauth';
import {
    BOOK_METADATA_INVENTORY_NODE,
    buildBookMetadataRestorePreview,
    fingerprintBookMetadata,
    readBookMetadataRoots,
    validateBookMetadataBackupInventory,
} from './book-source-restore';
import {
    assertRecoveryEnvelope,
    type RecoveryEnvelopeIntegrityVerifier,
    type RecoveryRuntimeIdentity,
} from './recovery-envelope';
import {
    RecoveryOperationLedger,
    type RecoveryOperationRecord,
} from './recovery-operation-ledger';
import type { BookMetadataValidationOptions } from './book-source-restore';

export interface RestorePreviewOptions extends BookMetadataValidationOptions {}

export interface RecoveryPreviewResult {
    readonly dryRun: true;
    readonly productionWrites: 0;
    readonly operation: RecoveryOperationRecord;
    readonly validation: {
        readonly valid: boolean;
        readonly diagnostics: readonly BookMetadataRestoreDiagnostic[];
        readonly missingSourceVersionIds: readonly string[];
    };
}

export class RecoveryPreviewValidationError extends Error {
    readonly name = 'RecoveryPreviewValidationError';
    readonly code = 'invalid-preview';

    constructor(
        readonly validation: RecoveryPreviewResult['validation'],
    ) {
        super('Recovery preview validation failed; no production operation was created.');
    }
}

/**
 * #121 deployment-only dry-run seam. The ledger write is the only durable
 * write; no Firebase product root or provider operation is touched.
 */
export async function generateRecoveryPreview(input: {
    readonly envelope: unknown;
    readonly runtime: RecoveryRuntimeIdentity;
    readonly verifier: RecoveryEnvelopeIntegrityVerifier;
    readonly ledger: RecoveryOperationLedger;
    readonly inventory: unknown;
    readonly expectedFirebaseProject?: string;
    readonly availableSourceVersionIds?: Iterable<string>;
    readonly sourceVersionAvailability?: Readonly<Record<string, boolean>>;
    readonly now?: string | number | Date;
}): Promise<RecoveryPreviewResult> {
    const envelope = await assertRecoveryEnvelope(input.envelope, {
        expectedPhase: 'dry-run',
        runtime: input.runtime,
        verifier: input.verifier,
        now: input.now,
    });
    const inventoryValidation = validateBookMetadataBackupInventory(input.inventory, {
        expectedFirebaseProject: input.expectedFirebaseProject ?? envelope.snapshot.firebaseProject,
        availableSourceVersionIds: input.availableSourceVersionIds,
        sourceVersionAvailability: input.sourceVersionAvailability,
        requireExternalSourceVersionProof: true,
    });
    const identityDiagnostics: BookMetadataRestoreDiagnostic[] = [];
    const candidate = input.inventory !== null
        && typeof input.inventory === 'object'
        && !Array.isArray(input.inventory)
        ? input.inventory as Partial<{
            readonly backupId: string;
            readonly firebaseProject: string;
            readonly inventoryVersion: string;
        }>
        : {};
    if (candidate.backupId !== envelope.snapshot.backupId) {
        identityDiagnostics.push({
            code: 'snapshot-mismatch',
            path: '$.backupId',
            message: 'Recovery inventory backupId does not match the envelope snapshot.',
        });
    }
    if (candidate.firebaseProject !== envelope.snapshot.firebaseProject) {
        identityDiagnostics.push({
            code: 'snapshot-mismatch',
            path: '$.firebaseProject',
            message: 'Recovery inventory firebaseProject does not match the envelope scope.',
        });
    }
    if (candidate.inventoryVersion !== envelope.snapshot.inventoryVersion) {
        identityDiagnostics.push({
            code: 'snapshot-mismatch',
            path: '$.inventoryVersion',
            message: 'Recovery inventory version does not match the envelope scope.',
        });
    }
    try {
        if (fingerprintBookMetadata(input.inventory) !== envelope.snapshot.inventoryFingerprint) {
            identityDiagnostics.push({
                code: 'snapshot-mismatch',
                path: '$.inventoryFingerprint',
                message: 'Recovery inventory fingerprint does not match the envelope scope.',
            });
        }
    } catch {
        identityDiagnostics.push({
            code: 'snapshot-mismatch',
            path: '$.inventoryFingerprint',
            message: 'Recovery inventory fingerprint could not be deterministically verified.',
        });
    }
    const validation: RecoveryPreviewResult['validation'] = {
        valid: inventoryValidation.valid && identityDiagnostics.length === 0,
        diagnostics: [...inventoryValidation.diagnostics, ...identityDiagnostics],
        missingSourceVersionIds: inventoryValidation.missingSourceVersionIds,
    };
    if (!validation.valid) throw new RecoveryPreviewValidationError(validation);
    const created = await input.ledger.preview({
        snapshot: envelope.snapshot,
        idempotencyKey: envelope.idempotencyKey,
        now: typeof input.now === 'string' ? input.now : undefined,
    });
    return {
        dryRun: true,
        productionWrites: 0,
        operation: created.operation,
        validation: {
            valid: validation.valid,
            diagnostics: validation.diagnostics,
            missingSourceVersionIds: validation.missingSourceVersionIds,
        },
    };
}

export const previewRecovery = generateRecoveryPreview;

/**
 * Generate a restore preview showing the diff between backup and live data.
 */
export async function generateRestorePreview(
    env: WorkerEnv,
    backupId: string,
    r2: BackupR2Client,
    options: RestorePreviewOptions = {},
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

    let bookMetadata: RestorePreview['bookMetadata'];
    const inventory = extracted.rtdb[BOOK_METADATA_INVENTORY_NODE];
    if (inventory !== undefined) {
        let currentRoots: Awaited<ReturnType<typeof readBookMetadataRoots>> = [];
        try {
            currentRoots = await readBookMetadataRoots(
                env.FIREBASE_DB_URL,
                await tokenCache.getToken(),
                fetch,
                true,
            );
        } catch (error) {
            warnings.push(error instanceof Error
                ? `Book metadata preview is denied: ${error.message}`
                : 'Book metadata preview is denied: canonical root fences could not be read.');
        }
        bookMetadata = buildBookMetadataRestorePreview(
            inventory,
            backupId,
            currentRoots.map((root) => ({
                path: root.path,
                etag: root.etag,
                revision: root.revision,
            })),
            {
                ...options,
                expectedFirebaseProject: env.FIREBASE_PROJECT_ID,
                requireExternalSourceVersionProof: true,
            },
        );
        if (!bookMetadata.allowed) warnings.push('Book metadata restore is fail-closed until every canonical root, Source Version reference, and ETag fence validates.');
    }

    return {
        backupId,
        backupDate: manifest.createdAt,
        categories,
        includesFirestore: manifest.includesFirestore,
        firestoreMergeAvailable,
        gdprExcludedCount,
        warnings,
        ...(bookMetadata ? { bookMetadata } : {}),
    };
}
