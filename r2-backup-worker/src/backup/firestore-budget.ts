/**
 * Firestore Adaptive Read Budget Check (PRD §4.2.1)
 *
 * Determines whether Firestore should be included in this backup,
 * based on the daily read quota (50K/day Spark Plan with 25K buffer).
 *
 * Algorithm:
 * 1. Read backup_state.json → get firestoreReadsToday + lastResetDate
 * 2. If lastResetDate !== today(UTC) → reset counter to 0
 * 3. Read previous backup manifest → get estimated doc count
 * 4. If firestoreReadsToday + estimatedDocCount > 25,000 → skip
 * 5. Otherwise → include Firestore
 */

import type { BackupState, BackupHistoryEntry } from '../types';
import type { BackupR2Client } from '../utils/r2-client';

const BUDGET_LIMIT = 25_000; // 25K buffer (PRD §4.2.1)

interface BudgetResult {
    include: boolean;
    firestoreReadsToday: number;
    estimatedDocCount: number;
    reason?: string;
}

/**
 * Check if Firestore reads are within budget for this backup.
 */
export async function checkFirestoreBudget(
    r2: BackupR2Client,
    backupHistory: BackupHistoryEntry[]
): Promise<BudgetResult> {
    // 1. Read backup_state.json
    let state = await r2.getObjectAsJson<BackupState>('backup_state.json');

    if (!state) {
        // First ever backup — no previous state
        state = {
            firestoreReadsToday: 0,
            lastResetDate: getTodayUTC(),
            mediaChain: {
                lastBackupId: null,
                sequenceNumber: 0,
                baseBackupId: null,
                chainLength: 0,
            },
            lastBackupTimestamp: null,
        };
    }

    // 2. Reset counter if new day (UTC)
    const todayUTC = getTodayUTC();
    if (state.lastResetDate !== todayUTC) {
        state.firestoreReadsToday = 0;
        state.lastResetDate = todayUTC;
    }

    // 3. Estimate doc count from previous backup's manifest
    let estimatedDocCount = 0;

    // Find the most recent successful backup with Firestore data
    const previousBackup = backupHistory
        .filter(b => b.status === 'complete' && b.includesFirestore)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

    if (previousBackup) {
        // Sum up all Firestore collection entity counts
        estimatedDocCount = Object.values(previousBackup.entityCounts.firestore).reduce(
            (sum, count) => sum + count,
            0
        );
    } else {
        // First backup or no previous Firestore backup — always include
        return {
            include: true,
            firestoreReadsToday: state.firestoreReadsToday,
            estimatedDocCount: 0,
            reason: 'first_backup_or_no_previous_firestore',
        };
    }

    // 4. Check projected total
    const projectedTotal = state.firestoreReadsToday + estimatedDocCount;

    if (projectedTotal > BUDGET_LIMIT) {
        return {
            include: false,
            firestoreReadsToday: state.firestoreReadsToday,
            estimatedDocCount,
            reason: 'read_budget_exceeded',
        };
    }

    // 5. Within budget
    return {
        include: true,
        firestoreReadsToday: state.firestoreReadsToday,
        estimatedDocCount,
    };
}

/**
 * Update the firestoreReadsToday counter after a successful Firestore read.
 */
export async function updateFirestoreReads(
    r2: BackupR2Client,
    actualDocsRead: number
): Promise<void> {
    let state = await r2.getObjectAsJson<BackupState>('backup_state.json');

    if (!state) {
        state = {
            firestoreReadsToday: 0,
            lastResetDate: getTodayUTC(),
            mediaChain: {
                lastBackupId: null,
                sequenceNumber: 0,
                baseBackupId: null,
                chainLength: 0,
            },
            lastBackupTimestamp: null,
        };
    }

    // Reset if new day
    const todayUTC = getTodayUTC();
    if (state.lastResetDate !== todayUTC) {
        state.firestoreReadsToday = 0;
        state.lastResetDate = todayUTC;
    }

    state.firestoreReadsToday += actualDocsRead;
    await r2.putObject('backup_state.json', JSON.stringify(state, null, 2), 'application/json');
}

/**
 * Get today's date in UTC as YYYY-MM-DD.
 */
function getTodayUTC(): string {
    return new Date().toISOString().slice(0, 10);
}
