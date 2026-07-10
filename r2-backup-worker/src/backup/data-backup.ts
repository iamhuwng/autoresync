/**
 * Core Data Backup Module (PRD §4.2.1, §4.3, §4.16)
 *
 * Client-driven 3-step backup. Each step is a separate Worker invocation
 * with its own time budget. The client polls for status and triggers
 * the next step automatically.
 *
 * Step 1 (RTDB):      Read all RTDB nodes → save to R2
 * Step 2 (Firestore): Read all Firestore collections → save to R2
 * Step 3 (Finalize):  Build ZIP from R2 data → upload → update history
 */

import type {
    WorkerEnv,
    BackupManifest,
    BackupHistoryEntry,
    MediaFileEntry,
} from '../types';
import type { BackupR2Client } from '../utils/r2-client';
import type { StatusTracker } from './status-tracker';
import { TokenCache } from '../auth/google-oauth';
import { acquireLock, releaseLock } from './backup-lock';
import { checkFirestoreBudget, updateFirestoreReads } from './firestore-budget';
import { buildBackupManifest, buildMediaManifest } from '../utils/manifest';
import { createBackupZip } from '../utils/zip';
import { pruneBackupHistory } from './retention';

// ─── Constants ─────────────────────────────────────────────────────────

const RTDB_EXCLUDE = ['system_flags'];
const RTDB_REQUIRED_NODES = ['listening_authoring', 'book_activity'];
const FIRESTORE_EXCLUDE = ['parsingCache'];

const SPECIAL_HANDLERS: Record<string, (data: Record<string, unknown>) => Record<string, unknown>> = {
    game_sessions: (data) => {
        const filtered: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(data)) {
            const session = value as Record<string, unknown>;
            if (session.status !== 'in-progress') {
                filtered[key] = value;
            }
        }
        return filtered;
    },
};

// ─── Intermediate metadata stored in R2 between steps ──────────────────

interface StepMeta {
    backupId: string;
    trigger: 'auto' | 'manual';
    createdAt: string;
    startTime: number;
    currentStep: 'rtdb' | 'firestore' | 'finalize' | 'complete';
    rtdbBytesRead: number;
    entityCounts: { rtdb: Record<string, number>; firestore: Record<string, number> };
    includesFirestore: boolean;
    firestoreSkipReason: string | null;
    firestoreCollectionsIncluded: string[];
    firestoreDocsRead: number;
}

// ─── Step 1: RTDB Backup ───────────────────────────────────────────────

export async function executeStep1_RTDB(
    env: WorkerEnv,
    r2: BackupR2Client,
    trigger: 'auto' | 'manual',
    tracker: StatusTracker
): Promise<void> {
    const backupId = tracker.state.id;
    const createdAt = new Date().toISOString();
    const startTime = Date.now();

    try {
        // Lock
        await tracker.update('locking', 2, 'Acquiring backup lock...');
        const lockResult = await acquireLock(r2, backupId, `data-${trigger}`);
        if (!lockResult.acquired) {
            throw new Error(lockResult.reason ?? 'Another backup is in progress');
        }

        // Auth
        await tracker.update('authenticating', 5, 'Getting Firebase access token...');
        const tokenCache = new TokenCache(env.GOOGLE_SA_KEY);
        const token = await tokenCache.getToken();

        // Discover RTDB nodes
        await tracker.update('discovering_rtdb', 8, 'Discovering RTDB nodes...');
        const shallowRes = await fetch(`${env.FIREBASE_DB_URL}/.json?shallow=true`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!shallowRes.ok) throw new Error(`RTDB discovery failed: ${shallowRes.status}`);

        const shallowData = await shallowRes.json() as Record<string, boolean> | null;
        const discoveredNodes = shallowData ? Object.keys(shallowData) : [];
        const nodesToBackup = [...new Set([...discoveredNodes, ...RTDB_REQUIRED_NODES])]
            .filter(n => !RTDB_EXCLUDE.includes(n));

        // Read RTDB nodes in parallel batches of 5
        const rtdbData: Record<string, unknown> = {};
        const entityCounts: Record<string, number> = {};
        let rtdbBytesRead = 0;

        for (let i = 0; i < nodesToBackup.length; i += 5) {
            const batch = nodesToBackup.slice(i, i + 5);
            const progress = 10 + Math.floor((i / nodesToBackup.length) * 20);
            await tracker.update('reading_rtdb', progress,
                `Reading RTDB ${Math.floor(i / 5) + 1}/${Math.ceil(nodesToBackup.length / 5)}...`);

            const currentToken = await tokenCache.getToken();
            const results = await Promise.all(batch.map(async (nodeName) => {
                const res = await fetch(`${env.FIREBASE_DB_URL}/${nodeName}.json`, {
                    headers: { 'Authorization': `Bearer ${currentToken}` },
                });
                if (!res.ok) return { nodeName, data: {} as unknown, bytes: 0, count: 0 };
                const data = await res.json() as Record<string, unknown> | null;
                const cl = res.headers.get('Content-Length');
                const bytes = cl ? parseInt(cl, 10) : (data ? JSON.stringify(data).length : 0);
                const finalData = (data && SPECIAL_HANDLERS[nodeName])
                    ? SPECIAL_HANDLERS[nodeName](data) : (data ?? {});
                const count = (data && typeof data === 'object') ? Object.keys(data).length : 0;
                return { nodeName, data: finalData, bytes, count };
            }));

            for (const r of results) {
                rtdbData[r.nodeName] = r.data;
                entityCounts[r.nodeName] = r.count;
                rtdbBytesRead += r.bytes;
            }
        }

        // Save RTDB data to R2
        await tracker.update('saving_rtdb', 32, 'Saving RTDB data...');
        await r2.putObject(`steps/${backupId}/rtdb.json`, JSON.stringify(rtdbData), 'application/json');

        // Save step metadata
        const meta: StepMeta = {
            backupId, trigger, createdAt, startTime,
            currentStep: 'rtdb',
            rtdbBytesRead,
            entityCounts: { rtdb: entityCounts, firestore: {} },
            includesFirestore: false,
            firestoreSkipReason: null,
            firestoreCollectionsIncluded: [],
            firestoreDocsRead: 0,
        };
        await r2.putObject(`steps/${backupId}/meta.json`, JSON.stringify(meta, null, 2), 'application/json');

        // Mark step 1 complete — client will trigger step 2
        await tracker.update('rtdb_complete', 33, 'RTDB backup complete');
        await tracker.persist();

    } catch (err: unknown) {
        try { await releaseLock(r2); } catch { /* ignore */ }
        const message = err instanceof Error ? err.message : 'Unknown error';
        await tracker.fail(message);
    }
}

// ─── Step 2: Firestore Backup ──────────────────────────────────────────

export async function executeStep2_Firestore(
    env: WorkerEnv,
    r2: BackupR2Client,
    backupId: string
): Promise<void> {
    // Reconstruct tracker
    const { StatusTracker } = await import('./status-tracker');
    const tracker = new StatusTracker('backup');
    tracker.state.id = backupId;
    tracker.setR2Client(r2);

    // Load metadata
    const meta = await r2.getObjectAsJson<StepMeta>(`steps/${backupId}/meta.json`);
    if (!meta) { await tracker.fail('Step metadata not found'); return; }
    tracker.state.startedAt = meta.createdAt;

    try {
        const tokenCache = new TokenCache(env.GOOGLE_SA_KEY);
        const history = await r2.getObjectAsJson<BackupHistoryEntry[]>('backup_history.json') ?? [];
        const budgetResult = await checkFirestoreBudget(r2, history);

        let firestoreData: Record<string, unknown> | null = null;

        if (budgetResult.include) {
            await tracker.update('reading_firestore', 36, 'Discovering Firestore collections...');

            const fsToken = await tokenCache.getToken();
            const listUrl = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents:listCollectionIds`;
            const listRes = await fetch(listUrl, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${fsToken}`, 'Content-Type': 'application/json' },
                body: '{}',
            });

            if (!listRes.ok) {
                meta.firestoreSkipReason = `discovery_failed_${listRes.status}`;
            } else {
                const listData = await listRes.json() as { collectionIds?: string[] };
                const collections = (listData.collectionIds ?? []).filter(c => !FIRESTORE_EXCLUDE.includes(c));

                firestoreData = {};
                meta.includesFirestore = true;
                meta.firestoreCollectionsIncluded = collections;

                // Read 3 collections in parallel
                for (let i = 0; i < collections.length; i += 3) {
                    const batch = collections.slice(i, i + 3);
                    const progress = 38 + Math.floor((i / collections.length) * 25);
                    await tracker.update('reading_firestore', progress,
                        `Firestore ${Math.floor(i / 3) + 1}/${Math.ceil(collections.length / 3)}...`);

                    const batchResults = await Promise.all(batch.map(async (collName) => {
                        const docs = await readFirestoreCollection(env.FIREBASE_PROJECT_ID, collName, tokenCache);
                        return { collName, docs, count: Object.keys(docs).length };
                    }));

                    for (const r of batchResults) {
                        firestoreData![r.collName] = r.docs;
                        meta.entityCounts.firestore[r.collName] = r.count;
                        meta.firestoreDocsRead += r.count;
                    }
                }

                await updateFirestoreReads(r2, meta.firestoreDocsRead);
            }
        } else {
            meta.firestoreSkipReason = budgetResult.reason ?? 'read_budget_exceeded';
        }

        // Save Firestore data
        await tracker.update('saving_firestore', 63, 'Saving Firestore data...');
        if (firestoreData) {
            await r2.putObject(`steps/${backupId}/firestore.json`, JSON.stringify(firestoreData), 'application/json');
        }

        // Update metadata
        meta.currentStep = 'firestore';
        await r2.putObject(`steps/${backupId}/meta.json`, JSON.stringify(meta, null, 2), 'application/json');

        // Mark step 2 complete — client will trigger step 3
        await tracker.update('firestore_complete', 65, 'Firestore backup complete');
        await tracker.persist();

    } catch (err: unknown) {
        const { StatusTracker: ST } = await import('./status-tracker');
        const t = new ST('backup'); t.state.id = backupId; t.setR2Client(r2);
        await t.fail(err instanceof Error ? err.message : 'Unknown error');
        try { await releaseLock(r2); } catch { /* ignore */ }
    }
}

// ─── Step 3: Finalize (ZIP + upload) ───────────────────────────────────

export async function executeStep3_Finalize(
    env: WorkerEnv,
    r2: BackupR2Client,
    backupId: string
): Promise<void> {
    const { StatusTracker } = await import('./status-tracker');
    const tracker = new StatusTracker('backup');
    tracker.state.id = backupId;
    tracker.setR2Client(r2);

    const meta = await r2.getObjectAsJson<StepMeta>(`steps/${backupId}/meta.json`);
    if (!meta) { await tracker.fail('Step metadata not found'); return; }
    tracker.state.startedAt = meta.createdAt;

    try {
        // Load RTDB data from R2
        await tracker.update('loading_data', 68, 'Loading backup data...');
        const rtdbRaw = await r2.getObject(`steps/${backupId}/rtdb.json`);
        if (!rtdbRaw) throw new Error('RTDB step data not found');
        const rtdbData = JSON.parse(new TextDecoder().decode(rtdbRaw)) as Record<string, unknown>;

        // Load Firestore data (if exists)
        let firestoreData: Record<string, unknown> | null = null;
        if (meta.includesFirestore) {
            const fsRaw = await r2.getObject(`steps/${backupId}/firestore.json`);
            if (fsRaw) firestoreData = JSON.parse(new TextDecoder().decode(fsRaw));
        }

        // Build manifests
        await tracker.update('building_manifest', 72, 'Building manifests...');
        const mediaManifest = buildMediaManifest([], backupId);

        const history = await r2.getObjectAsJson<BackupHistoryEntry[]>('backup_history.json') ?? [];
        const previousBackupId = history.length > 0
            ? history.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0].backupId
            : null;

        let manifest = buildBackupManifest({
            backupId, trigger: meta.trigger, createdAt: meta.createdAt,
            completedAt: new Date().toISOString(),
            durationMs: Date.now() - meta.startTime,
            status: 'complete',
            includesFirestore: meta.includesFirestore,
            firestoreSkipReason: meta.firestoreSkipReason,
            firestoreCollectionsIncluded: meta.firestoreCollectionsIncluded,
            firebaseProject: env.FIREBASE_PROJECT_ID,
            rtdbBytesRead: meta.rtdbBytesRead,
            firestoreDocsRead: meta.firestoreDocsRead,
            entityCounts: meta.entityCounts,
            totalSizeBytes: 0, checksums: {}, previousBackupId,
        });

        // Create ZIP
        await tracker.update('creating_zip', 78, 'Creating backup archive...');
        const { zipData, checksums } = await createBackupZip({
            rtdb: rtdbData, firestore: firestoreData, manifest, mediaManifest,
        });

        manifest = {
            ...manifest, totalSizeBytes: zipData.length, checksums,
            completedAt: new Date().toISOString(),
            durationMs: Date.now() - meta.startTime,
        };

        // Upload ZIP
        await tracker.update('uploading', 85, `Uploading ${(zipData.length / 1024).toFixed(0)} KB...`);
        await r2.putObject(`backups/${backupId}.zip`, zipData, 'application/zip');
        await r2.putObject(`backups/${backupId}_manifest.json`, JSON.stringify(manifest, null, 2), 'application/json');

        // Update history
        await tracker.update('updating_history', 93, 'Updating history...');
        const newEntry: BackupHistoryEntry = {
            backupId, type: 'data', trigger: meta.trigger, createdAt: meta.createdAt,
            status: 'complete', includesFirestore: meta.includesFirestore,
            totalSizeBytes: zipData.length,
            entityCounts: meta.entityCounts,
            firestoreSkipReason: meta.firestoreSkipReason,
        };
        await r2.putObject('backup_history.json', JSON.stringify([...history, newEntry], null, 2), 'application/json');
        await pruneBackupHistory(r2);

        // Cleanup step files (overwrite with empty — no delete permission)
        await r2.putObject(`steps/${backupId}/rtdb.json`, '{}', 'application/json');
        if (meta.includesFirestore) {
            await r2.putObject(`steps/${backupId}/firestore.json`, '{}', 'application/json');
        }

        // Release lock & complete
        await releaseLock(r2);
        await tracker.complete();
        console.log(`[Backup] ${backupId} complete in ${Date.now() - meta.startTime}ms`);

    } catch (err: unknown) {
        try { await releaseLock(r2); } catch { /* ignore */ }
        const message = err instanceof Error ? err.message : 'Unknown error';
        await tracker.fail(message);
    }
}

// ─── Helpers ───────────────────────────────────────────────────────────

async function readFirestoreCollection(
    projectId: string, collectionId: string, tokenCache: TokenCache
): Promise<Record<string, unknown>> {
    const docs: Record<string, unknown> = {};
    let pageToken: string | undefined;
    do {
        const token = await tokenCache.getToken();
        let url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionId}?pageSize=300`;
        if (pageToken) url += `&pageToken=${pageToken}`;
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) break;
        const data = await res.json() as { documents?: Array<{ name: string; fields: unknown }>; nextPageToken?: string };
        if (data.documents) for (const doc of data.documents) docs[doc.name.split('/').pop()!] = doc.fields;
        pageToken = data.nextPageToken;
    } while (pageToken);
    return docs;
}
