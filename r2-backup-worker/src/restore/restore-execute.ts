/**
 * Restore Execution (PRD §4.13.5)
 *
 * Executes the restore operation with:
 * - Pre-restore safety snapshot
 * - GDPR filtering
 * - Known dependency order + unknown-last pattern
 * - Smart auto mode (skip existing) or per-entity manual mode
 * - Post-restore validation
 * - Flag management (system_flags/restore_in_progress)
 */

import type {
    WorkerEnv,
    RestoreResult,
    RestorePreview,
    BookMetadataRestorePreview,
} from '../types';
import type { BackupR2Client } from '../utils/r2-client';
import type { StatusTracker } from '../backup/status-tracker';
import { TokenCache } from '../auth/google-oauth';
import { extractBackupZip } from '../utils/zip';
import { createBackupZip } from '../utils/zip';
import { buildBackupManifest, buildMediaManifest } from '../utils/manifest';
import { filterGdprEntities } from './gdpr-filter';
import {
    BOOK_METADATA_EXCLUSIVE_TOP_LEVEL_ROOTS,
    BOOK_METADATA_DELEGATED_TOP_LEVEL_ROOTS,
    BOOK_METADATA_INVENTORY_NODE,
    BOOK_METADATA_CANONICAL_ROOTS,
    buildBookMetadataRestorePreview,
    prepareBookSourceRestore,
    readBookMetadataRoots,
    restoreBookMetadataRoots,
} from './book-source-restore';
import { BookMetadataRestoreValidationError } from './book-source-restore';
import type { BookMetadataValidationOptions, BookMetadataRestorePlan } from './book-source-restore';
import {
    RecoveryOperationLedger,
    type RecoveryOperationRecord,
} from './recovery-operation-ledger';
import type { RecoverySuppressionContext } from './recovery-suppression';
import {
    assertRecoveryEnvelope,
    type RecoveryEnvelopeIntegrityVerifier,
    type RecoveryRuntimeIdentity,
} from './recovery-envelope';

export interface RecoveryPhaseRunnerInput {
    readonly operationId: string;
    readonly phase: 'restoring_canonical_authority' | 'rebuilding' | 'reconciling';
    /** Adapters must pass this context to every external-effect boundary. */
    readonly suppression: RecoverySuppressionContext;
}

export type RecoveryPhaseRunner = (input: RecoveryPhaseRunnerInput) => Promise<void>;

/**
 * Execute one deterministic control-plane operation. When phase runners are
 * supplied, only the unfinished phase is invoked and a crash is converted to
 * a retryable record that resumes at that same phase. This function does not
 * release any side-effect family; #125 owns that final gate.
 */
export async function executeRecovery(input: {
    readonly envelope: unknown;
    readonly runtime: RecoveryRuntimeIdentity;
    readonly verifier: RecoveryEnvelopeIntegrityVerifier;
    readonly ledger: RecoveryOperationLedger;
    readonly runners?: Partial<Record<RecoveryPhaseRunnerInput['phase'], RecoveryPhaseRunner>>;
    readonly now?: string;
}): Promise<RecoveryOperationRecord> {
    const envelope = await assertRecoveryEnvelope(input.envelope, {
        expectedPhase: 'execute',
        runtime: input.runtime,
        verifier: input.verifier,
        now: input.now,
    });
    let current = (await input.ledger.authorizeExecute({
        envelope,
        runtime: input.runtime,
        verifier: input.verifier,
        now: input.now,
    })).operation;
    if (current.state === 'completed' || current.state === 'failed_terminal') return current;

    while (current.state !== 'completed' && current.state !== 'failed_terminal') {
        const started = await input.ledger.beginNextPhase(current.operationId, input.now);
        const phase = started.state as RecoveryPhaseRunnerInput['phase'];
        const runner = input.runners?.[phase];
        if (!runner) return started;
        try {
            await runner({
                operationId: started.operationId,
                phase,
                suppression: { recoveryOperationId: started.operationId, operation: started },
            });
            current = await input.ledger.completePhase({
                operationId: started.operationId,
                expectedState: started.state,
                expectedRevision: started.stateRevision,
                phase,
                now: input.now,
            });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Recovery phase failed.';
            return input.ledger.failRetryable({
                operationId: started.operationId,
                expectedState: started.state,
                expectedRevision: started.stateRevision,
                code: 'phase-failed',
                message,
                now: input.now,
            });
        }
    }
    return current;
}

export const executeRecoveryOperation = executeRecovery;

// ─── Constants ─────────────────────────────────────────────────────────

/** Known dependency order for RTDB restore (PRD §4.16.3) */
const RTDB_RESTORE_ORDER = [
    'users', 'media_asset_upload_sessions', 'media_assets', 'media_asset_events',
    'media_asset_metrics', 'media_asset_sweeps', 'listening_authoring', 'book_activity', 'tests', 'quizzes', 'classes', 'courses',
    'course_enrollments', 'class_course_links', 'course_materials', 'course_progress',
    'test_results', 'game_sessions', 'deleted_users', 'guest_results',
    'invitations', 'badges', 'course_attendance', 'audit_logs',
    'test_results_by_session', 'test_results_by_student', 'test_results_by_teacher',
    'test_results_by_course', 'test_results_by_class',
];

const RTDB_REQUIRED_SNAPSHOT_NODES = ['listening_authoring', 'book_activity'];

/** Nodes excluded from restore by default (prevent spam) */
const RTDB_SKIP_ON_RESTORE = ['notifications'];

export interface RestoreOptions extends BookMetadataValidationOptions {
    scope: string[];
    mode: 'smart_auto' | 'per_entity';
    perEntityDecisions?: Record<string, 'skip' | 'overwrite' | 'duplicate'>;
    mergeFirestoreFromBackupId?: string;
    bookMetadataPreview?: BookMetadataRestorePreview;
    /** Compatibility alias for callers that pass the complete preview object. */
    preview?: RestorePreview;
    /** #121 recovery identity is transport metadata, never product payload data. */
    recoveryOperationId?: string;
}

const scopeIncludesBookMetadata = (scope: readonly string[]): boolean => (
    scope.includes('all')
    || scope.includes('book')
    || scope.includes('book_metadata')
    || scope.includes(BOOK_METADATA_INVENTORY_NODE)
    || scope.some((entry) => BOOK_METADATA_CANONICAL_ROOTS.includes(entry as typeof BOOK_METADATA_CANONICAL_ROOTS[number]))
);

const inventoryFromPreview = (options: RestoreOptions): BookMetadataRestorePreview | undefined => (
    options.bookMetadataPreview ?? options.preview?.bookMetadata
);

const BOOK_METADATA_MIXED_TOP_LEVEL_ROOTS = new Set(['classes', 'material_catalog']);
const BOOK_METADATA_MATERIAL_CHILDREN = new Set([
    'book_indexes',
    'book_nodes',
    'book_successor_operations',
    'books',
    'public_book_projections',
]);

const isPlainRecord = (value: unknown): value is Record<string, unknown> => (
    value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
);

/** Keep mixed legacy nodes useful for non-Book state without re-writing fenced Book paths. */
const stripBookMetadataFromLegacyNode = (
    nodeName: string,
    value: unknown,
): Record<string, unknown> => {
    if (!BOOK_METADATA_MIXED_TOP_LEVEL_ROOTS.has(nodeName) || !isPlainRecord(value)) {
        return (isPlainRecord(value) ? value : {}) as Record<string, unknown>;
    }
    if (nodeName === 'material_catalog') {
        const filtered = { ...value };
        for (const child of BOOK_METADATA_MATERIAL_CHILDREN) delete filtered[child];
        if (isPlainRecord(filtered.material_summary_indexes)) {
            const summaryIndexes = { ...filtered.material_summary_indexes };
            delete summaryIndexes.v1;
            if (Object.keys(summaryIndexes).length === 0) delete filtered.material_summary_indexes;
            else filtered.material_summary_indexes = summaryIndexes;
        }
        return filtered;
    }
    const filtered = { ...value };
    for (const [classId, classValue] of Object.entries(filtered)) {
        if (!isPlainRecord(classValue) || !Object.prototype.hasOwnProperty.call(classValue, 'book_locks')) continue;
        const classMetadata = { ...classValue };
        delete classMetadata.book_locks;
        filtered[classId] = classMetadata;
    }
    return filtered;
};

/**
 * Execute a full restore operation.
 */
export async function executeRestore(
    env: WorkerEnv,
    r2: BackupR2Client,
    backupId: string,
    options: RestoreOptions,
    tracker: StatusTracker
): Promise<RestoreResult> {
    tracker.setR2Client(r2);
    const tokenCache = new TokenCache(env.GOOGLE_SA_KEY);

    const details: RestoreResult['details'] = {};
    let entitiesRestored = 0;
    let entitiesSkipped = 0;
    let entitiesFailed = 0;
    let bookMetadataResult: RestoreResult['bookMetadata'];

    // Book metadata is preflighted before the legacy restore flag, snapshot,
    // or any product write. Malformed inventory and stale/missing ETag cases
    // therefore fail atomically at the affected Book scope.
    let bookMetadataPreflight: {
        readonly plan: BookMetadataRestorePlan;
        readonly preview: BookMetadataRestorePreview;
    } | null = null;
    if (scopeIncludesBookMetadata(options.scope)) {
        const zipData = await r2.getObject(`backups/${backupId}.zip`);
        if (!zipData) throw new Error(`Backup not found: ${backupId}`);
        const candidate = extractBackupZip(zipData);
        const inventory = candidate.rtdb[BOOK_METADATA_INVENTORY_NODE];
        if (inventory === undefined) {
            const explicitBookScope = options.scope.some((entry) => (
                entry === 'book'
                || entry === 'book_metadata'
                || entry === BOOK_METADATA_INVENTORY_NODE
                || (BOOK_METADATA_CANONICAL_ROOTS as readonly string[]).includes(entry)
            ));
            if (explicitBookScope) {
                throw new BookMetadataRestoreValidationError({
                    code: 'missing-required-root',
                    path: `rtdb.${BOOK_METADATA_INVENTORY_NODE}`,
                    message: 'Book metadata restore requires the versioned exhaustive inventory.',
                });
            }
        } else {
            const preview = inventoryFromPreview(options);
            if (!preview) {
                throw new BookMetadataRestoreValidationError({
                    code: 'missing-etag',
                    path: '$.bookMetadataPreview',
                    message: 'Book metadata execute requires a write-free preview with current ETag fences.',
                });
            }
            if (preview.backupId !== backupId || preview.allowed !== true) {
                throw new BookMetadataRestoreValidationError({
                    code: 'preview-drift',
                    path: '$.bookMetadataPreview',
                    message: 'Book metadata preview does not authorize this backup and scope.',
                });
            }
            const plan = prepareBookSourceRestore({
                snapshot: inventory,
                ...options,
                expectedFirebaseProject: env.FIREBASE_PROJECT_ID,
                requireExternalSourceVersionProof: true,
            });
            const currentRoots = await readBookMetadataRoots(
                env.FIREBASE_DB_URL,
                await tokenCache.getToken(),
                fetch,
                true,
            );
            const recalculatedPreview = buildBookMetadataRestorePreview(
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
            const sameFences = BOOK_METADATA_CANONICAL_ROOTS.every((path) => {
                const expected = preview.rootFences[path];
                const actual = recalculatedPreview.rootFences[path];
                return expected?.etag === actual?.etag && expected?.revision === actual?.revision;
            });
            const previewZeroByteProof = preview.zeroByteProof;
            const samePreviewShape = preview.valid === true
                && preview.inventoryVersion === recalculatedPreview.inventoryVersion
                && preview.rootCount === recalculatedPreview.rootCount
                && JSON.stringify(preview.orderedRoots) === JSON.stringify(recalculatedPreview.orderedRoots)
                && JSON.stringify(preview.delegatedRoots) === JSON.stringify(recalculatedPreview.delegatedRoots)
                && JSON.stringify(preview.sourceVersionIds) === JSON.stringify(recalculatedPreview.sourceVersionIds)
                && Array.isArray(preview.missingSourceVersionIds)
                && preview.missingSourceVersionIds.length === 0
                && Array.isArray(preview.diagnostics)
                && preview.diagnostics.length === 0
                && previewZeroByteProof?.pdfBodyReads === 0
                && previewZeroByteProof?.pdfBodyWrites === 0
                && previewZeroByteProof?.providerOperations === 0;
            if (!recalculatedPreview.allowed || preview.inventoryFingerprint !== recalculatedPreview.inventoryFingerprint || !sameFences || !samePreviewShape) {
                throw new BookMetadataRestoreValidationError({
                    code: 'preview-drift',
                    path: '$.bookMetadataPreview',
                    message: recalculatedPreview.diagnostics.map((entry) => entry.message).join('; ') || 'Current Book metadata roots drifted from the preview fences.',
                });
            }
            bookMetadataPreflight = { plan, preview };
        }
    }

    try {
        // ── Step 1: Set RTDB restore flag ───────────────────────────
        await tracker.update('snapshot', 2, 'Setting restore flag...');
        const token = await tokenCache.getToken();
        const flagUrl = `${env.FIREBASE_DB_URL}/system_flags/restore_in_progress.json?access_token=${token}`;
        await fetch(flagUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                active: true,
                startedAt: Date.now(),
                backupId,
            }),
        });

        // ── Step 2: Pre-restore snapshot ────────────────────────────
        await tracker.update('snapshot', 5, 'Creating pre-restore safety snapshot...');
        await createPreRestoreSnapshot(env, r2, tokenCache);

        // ── Step 3: Parse backup ────────────────────────────────────
        await tracker.update('reading', 15, 'Downloading and parsing backup...');
        const zipData = await r2.getObject(`backups/${backupId}.zip`);
        if (!zipData) {
            throw new Error(`Backup not found: ${backupId}`);
        }

        const extracted = extractBackupZip(zipData);
        let firestoreData = extracted.firestore;

        // Merge Firestore from another backup if requested
        if (options.mergeFirestoreFromBackupId && !firestoreData) {
            await tracker.update('reading', 20, 'Merging Firestore data from closest backup...');
            const mergeZip = await r2.getObject(`backups/${options.mergeFirestoreFromBackupId}.zip`);
            if (mergeZip) {
                const mergeExtracted = extractBackupZip(mergeZip);
                firestoreData = mergeExtracted.firestore;
            }
        }

        // ── Step 4: Apply GDPR filter ───────────────────────────────
        if (extracted.rtdb.deleted_users && typeof extracted.rtdb.deleted_users === 'object') {
            const { filtered, excludedCount } = filterGdprEntities(
                extracted.rtdb.deleted_users as Record<string, unknown>
            );
            extracted.rtdb.deleted_users = filtered;
            if (excludedCount > 0) {
                console.log(`[Restore] GDPR: excluded ${excludedCount} completed deletion entries`);
            }
        }

        // ── Step 5: Restore RTDB ────────────────────────────────────
        // Build final restore order: known first, unknown last
        if (bookMetadataPreflight) {
            await tracker.update('restoring_book_metadata', 24, 'Restoring canonical Book metadata...');
            const currentToken = await tokenCache.getToken();
            bookMetadataResult = await restoreBookMetadataRoots(
                env.FIREBASE_DB_URL,
                currentToken,
                bookMetadataPreflight.plan,
                bookMetadataPreflight.preview.rootFences,
                fetch,
                options.recoveryOperationId
                    ? { recoveryOperationId: options.recoveryOperationId, phase: 'restoring_canonical_authority' }
                    : undefined,
            );
            entitiesRestored += bookMetadataResult.restoredRoots;
            entitiesSkipped += bookMetadataResult.skippedRoots;
            entitiesFailed += bookMetadataResult.failedRoots;
            details.book_metadata = {
                restored: bookMetadataResult.restoredRoots,
                skipped: bookMetadataResult.skippedRoots,
                failed: bookMetadataResult.failedRoots,
            };
        }

        const allBackupNodes = Object.keys(extracted.rtdb).filter((nodeName) => (
            nodeName !== BOOK_METADATA_INVENTORY_NODE
            && (!bookMetadataPreflight
                || (
                    !BOOK_METADATA_EXCLUSIVE_TOP_LEVEL_ROOTS.includes(nodeName as typeof BOOK_METADATA_EXCLUSIVE_TOP_LEVEL_ROOTS[number])
                    && !BOOK_METADATA_DELEGATED_TOP_LEVEL_ROOTS.includes(nodeName as typeof BOOK_METADATA_DELEGATED_TOP_LEVEL_ROOTS[number])
                ))
        ));
        const knownNodes = RTDB_RESTORE_ORDER.filter(n => allBackupNodes.includes(n));
        const unknownNodes = allBackupNodes.filter(
            n => !RTDB_RESTORE_ORDER.includes(n) && !RTDB_SKIP_ON_RESTORE.includes(n)
        );
        const finalRestoreOrder = [...knownNodes, ...unknownNodes];

        // Filter by scope
        const scopeIsAll = options.scope.includes('all');
        const nodesToRestore = scopeIsAll
            ? finalRestoreOrder
            : finalRestoreOrder.filter(n => options.scope.includes(n));

        const totalEntities = nodesToRestore.length + (firestoreData ? Object.keys(firestoreData).length : 0);
        let currentIndex = 0;

        for (const nodeName of nodesToRestore) {
            currentIndex++;
            const progress = 25 + Math.floor((currentIndex / totalEntities) * 50);
            await tracker.update(
                'restoring_rtdb',
                progress,
                `Restoring ${nodeName}... (${currentIndex}/${totalEntities})`
            );

            const nodeData = bookMetadataPreflight
                ? stripBookMetadataFromLegacyNode(nodeName, extracted.rtdb[nodeName])
                : extracted.rtdb[nodeName];
            if (!nodeData || typeof nodeData !== 'object') {
                entitiesSkipped++;
                details[nodeName] = { restored: 0, skipped: 1, failed: 0 };
                continue;
            }

            try {
                const currentToken = await tokenCache.getToken();
                const nodeResult = await restoreRtdbNode(
                    env,
                    nodeName,
                    nodeData as Record<string, unknown>,
                    currentToken,
                    options.mode,
                    options.perEntityDecisions
                );

                entitiesRestored += nodeResult.restored;
                entitiesSkipped += nodeResult.skipped;
                entitiesFailed += nodeResult.failed;
                details[nodeName] = nodeResult;
            } catch (err: unknown) {
                console.error(`[Restore] Failed to restore ${nodeName}:`, err);
                entitiesFailed++;
                details[nodeName] = { restored: 0, skipped: 0, failed: 1 };
            }
        }

        // ── Step 6: Restore Firestore ───────────────────────────────
        if (firestoreData) {
            const firestoreCollections = Object.keys(firestoreData);
            const firestoreToRestore = scopeIsAll
                ? firestoreCollections
                : firestoreCollections.filter(c => options.scope.includes(c));

            for (const collName of firestoreToRestore) {
                currentIndex++;
                const progress = 75 + Math.floor((currentIndex / totalEntities) * 15);
                await tracker.update(
                    'restoring_firestore',
                    progress,
                    `Restoring Firestore: ${collName}... (${currentIndex}/${totalEntities})`
                );

                const collData = firestoreData[collName] as Record<string, unknown>;
                if (!collData) continue;

                try {
                    const currentToken = await tokenCache.getToken();
                    const collResult = await restoreFirestoreCollection(
                        env,
                        collName,
                        collData,
                        currentToken
                    );

                    entitiesRestored += collResult.restored;
                    entitiesSkipped += collResult.skipped;
                    entitiesFailed += collResult.failed;
                    details[`${collName} (Firestore)`] = collResult;
                } catch (err: unknown) {
                    console.error(`[Restore] Failed to restore Firestore ${collName}:`, err);
                    entitiesFailed++;
                    details[`${collName} (Firestore)`] = { restored: 0, skipped: 0, failed: 1 };
                }
            }
        }

        // ── Step 7: Post-restore validation ─────────────────────────
        await tracker.update('validating', 93, 'Validating restore...');
        // Re-read entity counts and compare (lightweight check)
        const currentToken2 = await tokenCache.getToken();
        for (const nodeName of nodesToRestore) {
            const shallowUrl = `${env.FIREBASE_DB_URL}/${nodeName}.json?shallow=true&access_token=${currentToken2}`;
            try {
                const res = await fetch(shallowUrl);
                if (res.ok) {
                    const data = await res.json() as Record<string, boolean> | null;
                    const liveCount = data ? Object.keys(data).length : 0;
                    const backupCount = extracted.manifest.entityCounts.rtdb[nodeName] ?? 0;
                    if (liveCount < backupCount) {
                        console.warn(`[Restore] Validation: ${nodeName} has ${liveCount} entities, expected at least ${backupCount}`);
                    }
                }
            } catch {
                // Non-critical
            }
        }

        const status = entitiesFailed > 0 ? 'partial' : 'complete';
        await tracker.complete();

        return {
            status,
            entitiesRestored,
            entitiesSkipped,
            entitiesFailed,
            notificationsSkipped: true,
            details,
            ...(bookMetadataResult ? { bookMetadata: bookMetadataResult } : {}),
        };
    } finally {
        // ── Step 8: Clear RTDB flag (ALWAYS, even on failure) ───────
        try {
            const finalToken = await tokenCache.getToken();
            const flagUrl = `${env.FIREBASE_DB_URL}/system_flags/restore_in_progress.json?access_token=${finalToken}`;
            await fetch(flagUrl, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: 'null',
            });
        } catch (err: unknown) {
            console.error('[Restore] CRITICAL: Failed to clear restore flag:', err);
        }
    }
}

// ─── RTDB Node Restore ─────────────────────────────────────────────────

async function restoreRtdbNode(
    env: WorkerEnv,
    nodeName: string,
    backupData: Record<string, unknown>,
    token: string,
    mode: 'smart_auto' | 'per_entity',
    perEntityDecisions?: Record<string, 'skip' | 'overwrite' | 'duplicate'>
): Promise<{ restored: number; skipped: number; failed: number }> {
    let restored = 0;
    let skipped = 0;
    let failed = 0;

    if (mode === 'smart_auto') {
        // ⚠️ CRITICAL: Do NOT make individual HTTP requests per entity key.
        // Fetch entire node's keys in ONE request via ?shallow=true
        const shallowUrl = `${env.FIREBASE_DB_URL}/${nodeName}.json?shallow=true&access_token=${token}`;
        const shallowRes = await fetch(shallowUrl);
        const liveKeys: Record<string, boolean> = shallowRes.ok
            ? ((await shallowRes.json()) as Record<string, boolean> | null) ?? {}
            : {};

        // Find entities that need restoring (don't exist in live data)
        const entitiesToRestore: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(backupData)) {
            if (liveKeys[key]) {
                skipped++;
            } else {
                entitiesToRestore[key] = value;
                restored++;
            }
        }

        // Batch PATCH: single request per node
        if (Object.keys(entitiesToRestore).length > 0) {
            const patchUrl = `${env.FIREBASE_DB_URL}/${nodeName}.json?access_token=${token}`;
            const patchRes = await fetch(patchUrl, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(entitiesToRestore),
            });

            if (!patchRes.ok) {
                console.error(`[Restore] PATCH ${nodeName} failed: ${patchRes.status}`);
                failed += Object.keys(entitiesToRestore).length;
                restored = 0;
            }
        }
    } else {
        // Per-entity mode
        for (const [key, value] of Object.entries(backupData)) {
            const decision = perEntityDecisions?.[`${nodeName}/${key}`] ?? 'skip';

            if (decision === 'skip') {
                skipped++;
                continue;
            }

            try {
                if (decision === 'overwrite') {
                    // PUT replaces entirely
                    const putUrl = `${env.FIREBASE_DB_URL}/${nodeName}/${key}.json?access_token=${token}`;
                    const res = await fetch(putUrl, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(value),
                    });
                    if (res.ok) restored++;
                    else failed++;
                } else if (decision === 'duplicate') {
                    // POST creates with auto-generated key
                    const postUrl = `${env.FIREBASE_DB_URL}/${nodeName}.json?access_token=${token}`;
                    const res = await fetch(postUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(value),
                    });
                    if (res.ok) restored++;
                    else failed++;
                }
            } catch {
                failed++;
            }
        }
    }

    return { restored, skipped, failed };
}

// ─── Firestore Collection Restore ──────────────────────────────────────

async function restoreFirestoreCollection(
    env: WorkerEnv,
    collectionId: string,
    docsData: Record<string, unknown>,
    token: string
): Promise<{ restored: number; skipped: number; failed: number }> {
    let restored = 0;
    const skipped = 0;
    let failed = 0;

    for (const [docId, fields] of Object.entries(docsData)) {
        try {
            // PATCH creates or overwrites the document
            const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${collectionId}/${docId}`;
            const res = await fetch(url, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ fields }),
            });

            if (res.ok) {
                restored++;
            } else {
                console.error(`[Restore] Firestore PATCH ${collectionId}/${docId} failed: ${res.status}`);
                failed++;
            }
        } catch {
            failed++;
        }
    }

    return { restored, skipped, failed };
}

// ─── Pre-Restore Snapshot ──────────────────────────────────────────────

/**
 * Create a pre-restore safety snapshot of current RTDB state.
 * Explicitly EXCLUDES Firestore to avoid consuming reads (PRD §4.13.5).
 */
async function createPreRestoreSnapshot(
    env: WorkerEnv,
    r2: BackupR2Client,
    tokenCache: TokenCache
): Promise<void> {
    const token = await tokenCache.getToken();

    // Discover RTDB nodes
    const shallowUrl = `${env.FIREBASE_DB_URL}/.json?shallow=true&access_token=${token}`;
    const shallowRes = await fetch(shallowUrl);
    if (!shallowRes.ok) {
        console.error('[Restore] Failed to discover RTDB nodes for pre-restore snapshot');
        return;
    }

    const shallowData = await shallowRes.json() as Record<string, boolean> | null;
    const allNodes = [
        ...new Set([
            ...Object.keys(shallowData ?? {}),
            ...RTDB_REQUIRED_SNAPSHOT_NODES,
        ]),
    ];
    const nodesToBackup = allNodes.filter(n => n !== 'system_flags');

    const rtdbData: Record<string, unknown> = {};
    const entityCounts: Record<string, number> = {};

    for (const nodeName of nodesToBackup) {
        const currentToken = await tokenCache.getToken();
        const nodeUrl = `${env.FIREBASE_DB_URL}/${nodeName}.json?access_token=${currentToken}`;
        const res = await fetch(nodeUrl);
        if (res.ok) {
            const data = await res.json();
            rtdbData[nodeName] = data ?? {};
            entityCounts[nodeName] = data && typeof data === 'object' ? Object.keys(data).length : 0;
        }
    }

    // Build a minimal snapshot manifest
    const manifest = buildBackupManifest({
        backupId: `PRE-RESTORE-${new Date().toISOString().replace(/[:.]/g, '-')}`,
        trigger: 'manual',
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 0,
        status: 'complete',
        includesFirestore: false,
        firestoreSkipReason: 'pre_restore_snapshot_excludes_firestore',
        firestoreCollectionsIncluded: [],
        firebaseProject: env.FIREBASE_PROJECT_ID,
        rtdbBytesRead: 0,
        firestoreDocsRead: 0,
        entityCounts: { rtdb: entityCounts, firestore: {} },
        totalSizeBytes: 0,
        checksums: {},
        previousBackupId: null,
    });

    const mediaManifest = buildMediaManifest([], manifest.backupId);

    const { zipData } = await createBackupZip({
        rtdb: rtdbData,
        firestore: null,
        manifest,
        mediaManifest,
    });

    // Store in pre-restore/ prefix (14-day retention via R2 lifecycle)
    const snapshotKey = `pre-restore/${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;
    await r2.putObject(snapshotKey, zipData, 'application/zip');

    console.log(`[Restore] Pre-restore snapshot saved: ${snapshotKey} (${(zipData.length / 1024 / 1024).toFixed(1)} MB)`);
}
