/**
 * r2-backup-worker — Cloudflare Worker Entry Point (PRD-0026)
 *
 * HTTP Router + Scheduled Cron Handler for Backup & Disaster Recovery.
 *
 * ═══════════════════════════════════════════════════════════════
 * API Routes (PRD §7.1.2):
 * ═══════════════════════════════════════════════════════════════
 *  1. POST   /api/backup/trigger               — Trigger manual data backup
 *  2. GET    /api/backup/status/:backupId       — Get backup progress
 *  3. GET    /api/backup/history                — List all backup history
 *  4. GET    /api/backup/download/:backupId     — Download backup ZIP
 *  5. GET    /api/backup/health                 — System health check
 *  6. POST   /api/backup/media/delta            — Calculate media delta & get download URLs
 *  7. GET    /api/backup/media/download         — Proxy-download a single media file from primary R2
 *  8. POST   /api/restore/preview               — Generate restore preview diff
 *  9. POST   /api/restore/execute               — Execute restore operation
 * 10. GET    /api/restore/status/:restoreId     — Get restore progress
 * ═══════════════════════════════════════════════════════════════
 */

import type { WorkerEnv, StatusTrackerState } from './types';
import { verifyAdminToken } from './auth/firebase-auth';
import { BackupR2Client } from './utils/r2-client';
import { clearStaleRestoreFlag } from './backup/auto-backup';
import { handleReadingV2Submit } from './reading-v2/submit';
import { handleCreateHomeworkAssignment } from './homework/assignments';

// ─── Helpers ───────────────────────────────────────────────────────────

function jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
    });
}

function errorResponse(message: string, status = 400): Response {
    return jsonResponse({ error: message }, status);
}

function corsPreflightResponse(): Response {
    return new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Max-Age': '86400',
        },
    });
}

function createR2Client(env: WorkerEnv): BackupR2Client {
    return new BackupR2Client(
        env.BACKUP_R2_ACCESS_KEY_ID,
        env.BACKUP_R2_SECRET_ACCESS_KEY,
        env.BACKUP_R2_ENDPOINT,
        env.BACKUP_R2_BUCKET_NAME
    );
}

function getBearerToken(headerValue: string | null): string | null {
    if (!headerValue?.startsWith('Bearer ')) {
        return null;
    }
    return headerValue.slice('Bearer '.length).trim() || null;
}

// ─── Route Handlers (stubs — implemented in subsequent tasks) ──────────

async function handleBackupTrigger(
    env: WorkerEnv,
    r2: BackupR2Client,
    ctx: ExecutionContext
): Promise<Response> {
    const { executeStep1_RTDB } = await import('./backup/data-backup');
    const { StatusTracker } = await import('./backup/status-tracker');

    const tracker = new StatusTracker('backup');
    tracker.setR2Client(r2);
    const backupId = tracker.state.id;

    // Persist initial status immediately so polling finds it right away
    await tracker.persist();

    // Step 1: RTDB backup (runs async, client polls for completion)
    ctx.waitUntil(
        executeStep1_RTDB(env, r2, 'manual', tracker)
            .catch(err => console.error('[Step1] Error:', err))
    );

    return jsonResponse({ backupId });
}

/**
 * Continue backup to the next step.
 * Client calls this when it sees "rtdb_complete" or "firestore_complete".
 */
async function handleBackupContinue(
    backupId: string,
    env: WorkerEnv,
    r2: BackupR2Client,
    ctx: ExecutionContext
): Promise<Response> {
    // Read current status to determine which step to run next
    const statusData = await r2.getObjectAsJson<{ phase: string }>(
        `backup_status_${backupId}.json`
    );

    if (!statusData) {
        return errorResponse(`Backup ${backupId} not found`, 404);
    }

    if (statusData.phase === 'rtdb_complete') {
        // Run Step 2: Firestore
        const { executeStep2_Firestore } = await import('./backup/data-backup');
        ctx.waitUntil(
            executeStep2_Firestore(env, r2, backupId)
                .catch(err => console.error('[Step2] Error:', err))
        );
        return jsonResponse({ status: 'step2_started', backupId });
    }

    if (statusData.phase === 'firestore_complete') {
        // Run Step 3: Finalize
        const { executeStep3_Finalize } = await import('./backup/data-backup');
        ctx.waitUntil(
            executeStep3_Finalize(env, r2, backupId)
                .catch(err => console.error('[Step3] Error:', err))
        );
        return jsonResponse({ status: 'step3_started', backupId });
    }

    return jsonResponse({ status: statusData.phase, message: 'No action needed' });
}

async function handleBackupStatus(
    backupId: string,
    r2: BackupR2Client
): Promise<Response> {
    const status = await r2.getObjectAsJson<StatusTrackerState>(
        `backup_status_${backupId}.json`
    );
    if (!status) {
        return errorResponse('Backup not found', 404);
    }
    return jsonResponse(status);
}

async function handleBackupHistory(r2: BackupR2Client): Promise<Response> {
    const history = await r2.getObjectAsJson<unknown[]>('backup_history.json');
    return jsonResponse(history ?? []);
}

async function handleBackupDownload(
    backupId: string,
    r2: BackupR2Client
): Promise<Response> {
    const zipData = await r2.getObject(`backups/${backupId}.zip`);
    if (!zipData) {
        return errorResponse('Backup not found', 404);
    }
    return new Response(zipData, {
        status: 200,
        headers: {
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="${backupId}.zip"`,
            'Access-Control-Allow-Origin': '*',
        },
    });
}

async function handleBackupHealth(
    env: WorkerEnv,
    r2: BackupR2Client
): Promise<Response> {
    try {
        const { checkHealth } = await import('./backup/health');
        const health = await checkHealth(env, r2);
        return jsonResponse(health);
    } catch (err: unknown) {
        return jsonResponse({
            status: 'error',
            _debug: {
                error: err instanceof Error ? err.message : String(err),
                stack: err instanceof Error ? err.stack : undefined,
                hasEndpoint: !!env.BACKUP_R2_ENDPOINT,
                hasAccessKey: !!env.BACKUP_R2_ACCESS_KEY_ID,
                hasBucket: !!env.BACKUP_R2_BUCKET_NAME,
                hasSAKey: !!env.GOOGLE_SA_KEY,
                saKeyLength: env.GOOGLE_SA_KEY?.length ?? 0,
            },
        });
    }
}

async function handleMediaDelta(
    env: WorkerEnv,
    r2: BackupR2Client
): Promise<Response> {
    const { calculateMediaDelta } = await import('./backup/media-delta');
    const delta = await calculateMediaDelta(env, r2);
    return jsonResponse(delta);
}

async function handleMediaDownload(
    key: string,
    env: WorkerEnv
): Promise<Response> {
    if (!key) {
        return errorResponse('Missing "key" query parameter', 400);
    }

    const object = await env.PRIMARY_R2.get(key);
    if (!object) {
        return errorResponse('File not found', 404);
    }

    const headers = new Headers();
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Content-Type', object.httpMetadata?.contentType ?? 'application/octet-stream');
    headers.set('Content-Disposition', `attachment; filename="${key.split('/').pop()}"`);
    if (object.size) {
        headers.set('Content-Length', String(object.size));
    }

    return new Response(object.body, { status: 200, headers });
}

async function handleRestorePreview(
    body: { backupId: string },
    env: WorkerEnv,
    r2: BackupR2Client
): Promise<Response> {
    const { generateRestorePreview } = await import('./restore/restore-preview');
    const preview = await generateRestorePreview(env, body.backupId, r2);
    return jsonResponse(preview);
}

async function handleRestoreExecute(
    body: {
        backupId: string;
        scope: string[];
        mode: 'smart_auto' | 'per_entity';
        perEntityDecisions?: Record<string, 'skip' | 'overwrite' | 'duplicate'>;
        mergeFirestoreFromBackupId?: string;
    },
    env: WorkerEnv,
    r2: BackupR2Client,
    ctx: ExecutionContext
): Promise<Response> {
    const { executeRestore } = await import('./restore/restore-execute');
    const { StatusTracker } = await import('./backup/status-tracker');

    const tracker = new StatusTracker('restore');
    const restoreId = tracker.state.id;

    ctx.waitUntil(
        (async () => {
            try {
                await executeRestore(env, r2, body.backupId, {
                    scope: body.scope,
                    mode: body.mode,
                    perEntityDecisions: body.perEntityDecisions,
                    mergeFirestoreFromBackupId: body.mergeFirestoreFromBackupId,
                }, tracker);
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                tracker.fail(message);
            }
        })()
    );

    return jsonResponse({ restoreId });
}

async function handleRestoreStatus(
    restoreId: string,
    r2: BackupR2Client
): Promise<Response> {
    const status = await r2.getObjectAsJson<StatusTrackerState>(
        `restore_status_${restoreId}.json`
    );
    if (!status) {
        return errorResponse('Restore not found', 404);
    }
    return jsonResponse(status);
}

// ─── Main Router ───────────────────────────────────────────────────────

async function handleDiagnosticUpload(
    request: Request,
    r2: BackupR2Client
): Promise<Response> {
    try {
        const contentLengthHeader = request.headers.get('Content-Length');
        const contentLength = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;
        if (Number.isFinite(contentLength) && contentLength > 500 * 1024) {
            return errorResponse('Payload too large', 413);
        }

        const bundle = await request.json() as { errorId?: string };
        if (!bundle?.errorId) {
            return errorResponse('Missing errorId', 400);
        }

        const dateKey = new Date().toISOString().split('T')[0];
        const objectKey = `diagnostic-reports/${dateKey}/${bundle.errorId}.json`;

        await r2.putObject(objectKey, JSON.stringify(bundle), 'application/json');

        const workerBaseUrl = new URL(request.url).origin;
        return jsonResponse({
            success: true,
            url: `${workerBaseUrl}/api/diagnostic/${bundle.errorId}`,
        });
    } catch (err: unknown) {
        console.error('[DiagnosticUpload] Upload failed:', err);
        return errorResponse('Upload failed', 500);
    }
}

async function handlePurgeDiagnostics(
    request: Request,
    r2: BackupR2Client
): Promise<Response> {
    try {
        const body = await request.json() as { cutoffDate?: string };
        const cutoffDate = body?.cutoffDate;

        if (!cutoffDate || !/^\d{4}-\d{2}-\d{2}$/.test(cutoffDate)) {
            return errorResponse('Invalid cutoffDate', 400);
        }

        const objects = await r2.listObjects('diagnostic-reports/');
        const keysToDelete = objects
            .map((object) => object.key)
            .filter((key) => {
                const match = key.match(/^diagnostic-reports\/(\d{4}-\d{2}-\d{2})\//);
                return !!match && match[1] < cutoffDate;
            });

        for (const key of keysToDelete) {
            await r2.deleteObject(key);
        }

        return jsonResponse({ success: true, deletedCount: keysToDelete.length });
    } catch (err: unknown) {
        console.error('[PurgeDiagnostics] Purge failed:', err);
        return errorResponse('Purge failed', 500);
    }
}

async function handleGetDiagnostic(
    errorId: string,
    r2: BackupR2Client
): Promise<Response> {
    try {
        if (!errorId) {
            return errorResponse('Missing errorId', 400);
        }

        const objects = await r2.listObjects('diagnostic-reports/');
        const matchingObject = objects.find((object) =>
            object.key.endsWith(`/${errorId}.json`)
        );

        if (!matchingObject) {
            return errorResponse('Diagnostic bundle not found', 404);
        }

        const bundleBody = await r2.getObject(matchingObject.key);
        if (!bundleBody) {
            return errorResponse('Diagnostic bundle not found', 404);
        }

        return new Response(bundleBody, {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            },
        });
    } catch (err: unknown) {
        console.error('[GetDiagnostic] Fetch failed:', err);
        return errorResponse('Diagnostic bundle not found', 404);
    }
}

async function handleRequest(
    request: Request,
    env: WorkerEnv,
    ctx: ExecutionContext
): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS preflight
    if (method === 'OPTIONS') {
        return corsPreflightResponse();
    }

    if (method === 'POST' && path === '/api/reading-v2/submit') {
        return handleReadingV2Submit(request, env);
    }

    if (method === 'POST' && path === '/api/homework/assignments') {
        return handleCreateHomeworkAssignment(request, env);
    }

    const r2 = createR2Client(env);

    // Clear stale restore flag on every request (PRD §4.6, safety net)
    // Non-blocking: don't await — fire and forget
    clearStaleRestoreFlag(env).catch((err: unknown) =>
        console.warn('[Router] clearStaleRestoreFlag error (non-blocking):', err)
    );

    // ─── Route matching ─────────────────────────────────────────

    // Diagnostic upload uses a shared secret instead of Firebase admin auth.
    if (method === 'POST' && path === '/api/diagnostic') {
        const token = getBearerToken(request.headers.get('Authorization'));
        if (token !== env.DIAGNOSTIC_TOKEN) {
            return errorResponse('Unauthorized', 403);
        }
        return handleDiagnosticUpload(request, r2);
    }

    // All remaining /api/* routes require admin authentication
    if (path.startsWith('/api/')) {
        const authResult = await verifyAdminToken(
            request.headers.get('Authorization'),
            env
        );
        if (!authResult.valid) {
            return errorResponse(authResult.error ?? 'Unauthorized', 403);
        }
    }

    // POST /api/purge-diagnostics
    if (method === 'POST' && path === '/api/purge-diagnostics') {
        return handlePurgeDiagnostics(request, r2);
    }

    // GET /api/diagnostic/:errorId
    if (method === 'GET' && path.startsWith('/api/diagnostic/')) {
        const errorId = path.replace('/api/diagnostic/', '');
        return handleGetDiagnostic(errorId, r2);
    }

    // POST /api/backup/trigger
    if (method === 'POST' && path === '/api/backup/trigger') {
        return handleBackupTrigger(env, r2, ctx);
    }

    // POST /api/backup/continue/:backupId — client triggers next step
    if (method === 'POST' && path.startsWith('/api/backup/continue/')) {
        const backupId = path.slice('/api/backup/continue/'.length);
        return handleBackupContinue(backupId, env, r2, ctx);
    }

    // GET /api/backup/status/:backupId
    if (method === 'GET' && path.startsWith('/api/backup/status/')) {
        const backupId = path.slice('/api/backup/status/'.length);
        return handleBackupStatus(backupId, r2);
    }

    // GET /api/backup/history
    if (method === 'GET' && path === '/api/backup/history') {
        return handleBackupHistory(r2);
    }

    // GET /api/backup/download/:backupId
    if (method === 'GET' && path.startsWith('/api/backup/download/')) {
        const backupId = path.slice('/api/backup/download/'.length);
        return handleBackupDownload(backupId, r2);
    }

    // GET /api/backup/health
    if (method === 'GET' && path === '/api/backup/health') {
        return handleBackupHealth(env, r2);
    }

    // POST /api/backup/unlock — Force release stale lock
    if (method === 'POST' && path === '/api/backup/unlock') {
        const { releaseLock } = await import('./backup/backup-lock');
        await releaseLock(r2);
        return jsonResponse({ status: 'ok', message: 'Lock released' });
    }

    // POST /api/backup/media/delta
    if (method === 'POST' && path === '/api/backup/media/delta') {
        return handleMediaDelta(env, r2);
    }

    // GET /api/backup/media/download?key=...
    if (method === 'GET' && path === '/api/backup/media/download') {
        const key = url.searchParams.get('key') ?? '';
        return handleMediaDownload(key, env);
    }

    // POST /api/restore/preview
    if (method === 'POST' && path === '/api/restore/preview') {
        const body = await request.json();
        return handleRestorePreview(body as { backupId: string }, env, r2);
    }

    // POST /api/restore/execute
    if (method === 'POST' && path === '/api/restore/execute') {
        const body = await request.json();
        return handleRestoreExecute(body as Parameters<typeof handleRestoreExecute>[0], env, r2, ctx);
    }

    // GET /api/restore/status/:restoreId
    if (method === 'GET' && path.startsWith('/api/restore/status/')) {
        const restoreId = path.slice('/api/restore/status/'.length);
        return handleRestoreStatus(restoreId, r2);
    }

    return errorResponse('Not found', 404);
}

// ─── Worker Export ─────────────────────────────────────────────────────

export default {
    async fetch(
        request: Request,
        env: WorkerEnv,
        ctx: ExecutionContext
    ): Promise<Response> {
        try {
            return await handleRequest(request, env, ctx);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Internal server error';
            console.error('[Worker] Unhandled error:', message);
            return errorResponse(message, 500);
        }
    },

    async scheduled(
        event: ScheduledEvent,
        env: WorkerEnv,
        ctx: ExecutionContext
    ): Promise<void> {
        // Auto-backup with retry logic (PRD §4.10) — implemented in Task 2.6
        const { runAutoBackup } = await import('./backup/auto-backup');
        ctx.waitUntil(runAutoBackup(env));
    },
};
