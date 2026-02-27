/**
 * Health Check Endpoint (PRD §7.1.2)
 *
 * Checks connectivity to Primary R2, Backup R2, and Firebase.
 */

import type { WorkerEnv, BackupState } from '../types';
import type { BackupR2Client } from '../utils/r2-client';
import { TokenCache } from '../auth/google-oauth';

interface HealthResult {
    status: 'ok' | 'error';
    primaryR2: boolean;
    backupR2: boolean;
    firebase: boolean;
    quotaStatus: {
        firestoreReadsToday: number;
        rtdbBytesThisMonth: number;
    };
    mediaChain?: {
        lastBackupId: string | null;
        sequenceNumber: number;
        lastBackupDate: string | null;
        chainLength: number;
        checkpointInterval: number;
    };
    // Debug info — included temporarily to diagnose connectivity issues
    _errors?: Record<string, string>;
}

/**
 * Run health checks against all external dependencies.
 */
export async function checkHealth(env: WorkerEnv, r2: BackupR2Client): Promise<HealthResult> {
    const result: HealthResult = {
        status: 'ok',
        primaryR2: false,
        backupR2: false,
        firebase: false,
        quotaStatus: {
            firestoreReadsToday: 0,
            rtdbBytesThisMonth: 0,
        },
        _errors: {},
    };

    // 1. Check Primary R2 connectivity
    try {
        await env.PRIMARY_R2.list({ limit: 1 });
        result.primaryR2 = true;
    } catch (err: unknown) {
        result._errors!.primaryR2 = err instanceof Error ? err.message : String(err);
    }

    // 2. Check Backup R2 connectivity
    try {
        await r2.listObjects('backups/');
        result.backupR2 = true;
    } catch (err: unknown) {
        result._errors!.backupR2 = err instanceof Error ? err.message : String(err);
        result._errors!.backupR2_config = JSON.stringify({
            hasEndpoint: !!env.BACKUP_R2_ENDPOINT,
            endpointLen: env.BACKUP_R2_ENDPOINT?.length,
            hasAccessKey: !!env.BACKUP_R2_ACCESS_KEY_ID,
            accessKeyLen: env.BACKUP_R2_ACCESS_KEY_ID?.length,
            hasSecret: !!env.BACKUP_R2_SECRET_ACCESS_KEY,
            secretLen: env.BACKUP_R2_SECRET_ACCESS_KEY?.length,
            hasBucket: !!env.BACKUP_R2_BUCKET_NAME,
            bucketName: env.BACKUP_R2_BUCKET_NAME,
        });
    }

    // 3. Check Firebase connectivity
    try {
        const tokenCache = new TokenCache(env.GOOGLE_SA_KEY);
        const token = await tokenCache.getToken();
        const url = `${env.FIREBASE_DB_URL}/.json?shallow=true`;
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        result.firebase = res.ok;
        if (!res.ok) {
            const body = await res.text();
            result._errors!.firebase = `HTTP ${res.status}: ${body.slice(0, 200)}`;
            result._errors!.firebase_debug = JSON.stringify({
                url: url,
                tokenPreview: token.slice(0, 20) + '...' + token.slice(-10),
                tokenLength: token.length,
            });
        }
    } catch (err: unknown) {
        result._errors!.firebase = err instanceof Error ? err.message : String(err);
        result._errors!.firebase_config = JSON.stringify({
            hasSAKey: !!env.GOOGLE_SA_KEY,
            saKeyLen: env.GOOGLE_SA_KEY?.length,
            saKeyStart: env.GOOGLE_SA_KEY?.slice(0, 15),
        });
    }

    // 4. Read quota status and media chain from backup_state.json
    try {
        const state = await r2.getObjectAsJson<BackupState>('backup_state.json');
        if (state) {
            result.quotaStatus.firestoreReadsToday = state.firestoreReadsToday;

            if (state.mediaChain) {
                result.mediaChain = {
                    lastBackupId: state.mediaChain.lastBackupId,
                    sequenceNumber: state.mediaChain.sequenceNumber,
                    lastBackupDate: state.lastBackupTimestamp,
                    chainLength: state.mediaChain.chainLength,
                    checkpointInterval: parseInt(env.MEDIA_CHECKPOINT_INTERVAL, 10) || 6,
                };
            }
        }
    } catch {
        // Non-critical
    }

    // Set overall status
    if (!result.primaryR2 || !result.backupR2 || !result.firebase) {
        result.status = 'error';
    }

    // Clean up empty errors
    if (Object.keys(result._errors!).length === 0) {
        delete result._errors;
    }

    return result;
}
