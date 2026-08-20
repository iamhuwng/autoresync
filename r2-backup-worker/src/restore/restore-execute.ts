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
} from '../types';
import type { BackupR2Client } from '../utils/r2-client';
import type { StatusTracker } from '../backup/status-tracker';
import { TokenCache } from '../auth/google-oauth';
import { extractBackupZip } from '../utils/zip';
import { createBackupZip } from '../utils/zip';
import { buildBackupManifest, buildMediaManifest } from '../utils/manifest';
import { filterGdprEntities } from './gdpr-filter';

// ─── Constants ─────────────────────────────────────────────────────────

/** Known dependency order for RTDB restore (PRD §4.16.3) */
const RTDB_RESTORE_ORDER = [
    'users', 'media_asset_upload_sessions', 'media_assets', 'media_asset_events',
    'media_asset_metrics', 'media_asset_sweeps', 'listening_authoring', 'tests', 'quizzes', 'classes', 'courses',
    'course_enrollments', 'class_course_links', 'course_materials', 'course_progress',
    'test_results', 'game_sessions', 'deleted_users', 'guest_results',
    'invitations', 'badges', 'course_attendance', 'audit_logs',
    'test_results_by_session', 'test_results_by_student', 'test_results_by_teacher',
    'test_results_by_course', 'test_results_by_class',
];

const RTDB_REQUIRED_SNAPSHOT_NODES = ['listening_authoring'];
const LISTENING_MEDIA_MUTATION_LEASE_FIELD = 'listening_media_mutation_lease';
const LISTENING_AUTHORING_CLEANUP_LEASE_FIELD = 'temp_cleanup_lease';
const RESTORE_LEASE_MS = 24 * 60 * 60 * 1000;
const RESTORE_LEASE_RETRIES = 5;

/** Nodes excluded from restore by default (prevent spam) */
const RTDB_SKIP_ON_RESTORE = ['notifications'];

interface RestoreOptions {
    scope: string[];
    mode: 'smart_auto' | 'per_entity';
    perEntityDecisions?: Record<string, 'skip' | 'overwrite' | 'duplicate'>;
    mergeFirestoreFromBackupId?: string;
}

interface RestoreCoordinationLease {
    schemaVersion: 1;
    leaseId: string;
    kind: 'restore';
    backupId: string;
    claimedAt: number;
    expiresAt: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

const systemFlagsUrl = (env: WorkerEnv, token: string): string =>
    `${env.FIREBASE_DB_URL}/system_flags.json?access_token=${token}`;

const authoringRootUrl = (env: WorkerEnv, token: string): string =>
    `${env.FIREBASE_DB_URL}/listening_authoring.json?access_token=${token}`;

const readSystemFlags = async (env: WorkerEnv, token: string): Promise<{
    flags: Record<string, unknown>;
    etag: string;
}> => {
    const response = await fetch(systemFlagsUrl(env, token), {
        headers: { 'X-Firebase-ETag': 'true' },
    });
    if (!response.ok) throw new Error(`restore_coordination_read_failed:${response.status}`);
    const etag = response.headers.get('etag');
    if (!etag) throw new Error('restore_coordination_etag_missing');
    const body = await response.json() as unknown;
    return { flags: isRecord(body) ? body : {}, etag };
};

const writeSystemFlags = async (
    env: WorkerEnv,
    token: string,
    flags: Record<string, unknown>,
    etag: string,
): Promise<boolean> => {
    const response = await fetch(systemFlagsUrl(env, token), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'if-match': etag },
        body: JSON.stringify(flags),
    });
    if (response.status === 412) return false;
    if (!response.ok) throw new Error(`restore_coordination_write_failed:${response.status}`);
    return true;
};

const readAuthoringRoot = async (env: WorkerEnv, token: string): Promise<{
    root: Record<string, unknown>;
    etag: string;
}> => {
    const response = await fetch(authoringRootUrl(env, token), {
        headers: { 'X-Firebase-ETag': 'true' },
    });
    if (!response.ok) throw new Error(`restore_authoring_coordination_read_failed:${response.status}`);
    const etag = response.headers.get('etag');
    if (!etag) throw new Error('restore_authoring_coordination_etag_missing');
    const body = await response.json() as unknown;
    return { root: isRecord(body) ? body : {}, etag };
};

const writeAuthoringRoot = async (
    env: WorkerEnv,
    token: string,
    root: Record<string, unknown>,
    etag: string,
): Promise<boolean> => {
    const response = await fetch(authoringRootUrl(env, token), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'if-match': etag },
        body: JSON.stringify(root),
    });
    if (response.status === 412) return false;
    if (!response.ok) throw new Error(`restore_authoring_coordination_write_failed:${response.status}`);
    return true;
};

const acquireRestoreCoordinationLease = async (
    env: WorkerEnv,
    token: string,
    backupId: string,
): Promise<RestoreCoordinationLease> => {
    const claimedAt = Date.now();
    const lease: RestoreCoordinationLease = {
        schemaVersion: 1,
        leaseId: `restore:${backupId}:${claimedAt}`,
        kind: 'restore',
        backupId,
        claimedAt,
        expiresAt: claimedAt + RESTORE_LEASE_MS,
    };
    let authoringAcquired = false;
    for (let attempt = 0; attempt < RESTORE_LEASE_RETRIES; attempt += 1) {
        const { root, etag } = await readAuthoringRoot(env, token);
        const existing = root[LISTENING_AUTHORING_CLEANUP_LEASE_FIELD];
        if (isRecord(existing) && Number(existing.expiresAt) > claimedAt) {
            throw new Error('listening_authoring_mutation_in_progress');
        }
        if (await writeAuthoringRoot(env, token, {
            ...root,
            [LISTENING_AUTHORING_CLEANUP_LEASE_FIELD]: lease,
        }, etag)) {
            authoringAcquired = true;
            break;
        }
    }
    if (!authoringAcquired) throw new Error('restore_authoring_coordination_retries_exhausted');

    try {
        for (let attempt = 0; attempt < RESTORE_LEASE_RETRIES; attempt += 1) {
            const { flags, etag } = await readSystemFlags(env, token);
            const existing = flags[LISTENING_MEDIA_MUTATION_LEASE_FIELD];
            const restore = flags.restore_in_progress;
            if ((isRecord(existing) && Number(existing.expiresAt) > claimedAt)
                || restore === true
                || (isRecord(restore) && restore.active === true)) {
                throw new Error('listening_media_mutation_in_progress');
            }
            if (await writeSystemFlags(env, token, {
                ...flags,
                restore_in_progress: { active: true, startedAt: claimedAt, backupId },
                [LISTENING_MEDIA_MUTATION_LEASE_FIELD]: lease,
            }, etag)) return lease;
        }
        throw new Error('restore_coordination_retries_exhausted');
    } catch (error) {
        await releaseRestoreCoordinationLease(env, token, lease);
        throw error;
    }
};

const releaseRestoreCoordinationLease = async (
    env: WorkerEnv,
    token: string,
    lease: RestoreCoordinationLease,
    releaseAuthoring = true,
): Promise<void> => {
    if (releaseAuthoring) {
        for (let attempt = 0; attempt < RESTORE_LEASE_RETRIES; attempt += 1) {
            const { root, etag } = await readAuthoringRoot(env, token);
            const existing = root[LISTENING_AUTHORING_CLEANUP_LEASE_FIELD];
            if (!isRecord(existing) || existing.leaseId !== lease.leaseId) break;
            const next = { ...root };
            delete next[LISTENING_AUTHORING_CLEANUP_LEASE_FIELD];
            if (await writeAuthoringRoot(env, token, next, etag)) break;
            if (attempt === RESTORE_LEASE_RETRIES - 1) {
                throw new Error('restore_authoring_coordination_release_failed');
            }
        }
    }
    for (let attempt = 0; attempt < RESTORE_LEASE_RETRIES; attempt += 1) {
        const { flags, etag } = await readSystemFlags(env, token);
        const existing = flags[LISTENING_MEDIA_MUTATION_LEASE_FIELD];
        if (!isRecord(existing) || existing.leaseId !== lease.leaseId) return;
        const next = { ...flags };
        delete next.restore_in_progress;
        delete next[LISTENING_MEDIA_MUTATION_LEASE_FIELD];
        if (await writeSystemFlags(env, token, next, etag)) return;
    }
    throw new Error('restore_coordination_release_failed');
};

const renewRestoreCoordinationLease = async (
    env: WorkerEnv,
    token: string,
    lease: RestoreCoordinationLease,
): Promise<RestoreCoordinationLease> => {
    const renewedAt = Date.now();
    const renewed = { ...lease, expiresAt: renewedAt + RESTORE_LEASE_MS };
    let authoringRenewed = false;
    for (let attempt = 0; attempt < RESTORE_LEASE_RETRIES; attempt += 1) {
        const { root, etag } = await readAuthoringRoot(env, token);
        const existing = root[LISTENING_AUTHORING_CLEANUP_LEASE_FIELD];
        if (!isRecord(existing) || existing.leaseId !== lease.leaseId) {
            throw new Error('restore_authoring_coordination_lease_lost');
        }
        if (await writeAuthoringRoot(env, token, {
            ...root,
            [LISTENING_AUTHORING_CLEANUP_LEASE_FIELD]: renewed,
        }, etag)) {
            authoringRenewed = true;
            break;
        }
    }
    if (!authoringRenewed) throw new Error('restore_authoring_coordination_renew_failed');

    for (let attempt = 0; attempt < RESTORE_LEASE_RETRIES; attempt += 1) {
        const { flags, etag } = await readSystemFlags(env, token);
        const existing = flags[LISTENING_MEDIA_MUTATION_LEASE_FIELD];
        if (!isRecord(existing) || existing.leaseId !== lease.leaseId) {
            throw new Error('restore_coordination_lease_lost');
        }
        const restore = isRecord(flags.restore_in_progress) ? flags.restore_in_progress : {};
        if (await writeSystemFlags(env, token, {
            ...flags,
            restore_in_progress: { ...restore, active: true, heartbeatAt: renewedAt },
            [LISTENING_MEDIA_MUTATION_LEASE_FIELD]: renewed,
        }, etag)) return renewed;
    }
    throw new Error('restore_coordination_renew_failed');
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
    let restoreLease: RestoreCoordinationLease | null = null;

    try {
        // ── Step 1: Set RTDB restore flag ───────────────────────────
        await tracker.update('snapshot', 2, 'Setting restore flag...');
        const token = await tokenCache.getToken();
        restoreLease = await acquireRestoreCoordinationLease(env, token, backupId);

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
        const allBackupNodes = Object.keys(extracted.rtdb);
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
            restoreLease = await renewRestoreCoordinationLease(
                env,
                await tokenCache.getToken(),
                restoreLease,
            );
            currentIndex++;
            const progress = 25 + Math.floor((currentIndex / totalEntities) * 50);
            await tracker.update(
                'restoring_rtdb',
                progress,
                `Restoring ${nodeName}... (${currentIndex}/${totalEntities})`
            );

            const nodeData = extracted.rtdb[nodeName];
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
                    options.perEntityDecisions,
                    async () => {
                        restoreLease = await renewRestoreCoordinationLease(
                            env,
                            await tokenCache.getToken(),
                            restoreLease!,
                        );
                    },
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
            restoreLease = await renewRestoreCoordinationLease(
                env,
                await tokenCache.getToken(),
                restoreLease,
            );
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
                        currentToken,
                        async () => {
                            restoreLease = await renewRestoreCoordinationLease(
                                env,
                                await tokenCache.getToken(),
                                restoreLease!,
                            );
                        },
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
        };
    } finally {
        // ── Step 8: Clear RTDB flag (ALWAYS, even on failure) ───────
        try {
            const finalToken = await tokenCache.getToken();
            if (restoreLease) {
                await releaseRestoreCoordinationLease(env, finalToken, restoreLease);
            }
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
    perEntityDecisions?: Record<string, 'skip' | 'overwrite' | 'duplicate'>,
    renewLease?: () => Promise<void>,
): Promise<{ restored: number; skipped: number; failed: number }> {
    let restored = 0;
    let skipped = 0;
    let failed = 0;
    const protectedCoordinationKeys = nodeName === 'listening_authoring'
        ? new Set([LISTENING_AUTHORING_CLEANUP_LEASE_FIELD, 'deleted_temp_assets'])
        : nodeName === 'system_flags'
            ? new Set(['restore_in_progress', LISTENING_MEDIA_MUTATION_LEASE_FIELD])
            : new Set<string>();
    const restorableEntries = Object.entries(backupData)
        .filter(([key]) => {
            if (!protectedCoordinationKeys.has(key)) return true;
            skipped += 1;
            return false;
        });

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
        for (const [key, value] of restorableEntries) {
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
        for (const [key, value] of restorableEntries) {
            await renewLease?.();
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
    token: string,
    renewLease?: () => Promise<void>,
): Promise<{ restored: number; skipped: number; failed: number }> {
    let restored = 0;
    const skipped = 0;
    let failed = 0;

    for (const [docId, fields] of Object.entries(docsData)) {
        await renewLease?.();
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
