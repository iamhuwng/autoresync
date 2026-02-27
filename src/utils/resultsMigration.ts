/**
 * Results Migration Utilities
 * Scripts to migrate and backfill data for the enhanced results system
 */

import { ref, get, update, set } from 'firebase/database';
// @ts-ignore
import { database } from '../services/firebase';
import { TestResultRecord } from '../services/testResults.service';

/**
 * Backfill teacherId and isGuest for existing test results
 * Reads session data to find creator (teacherId) and updates result records and indexes
 */
export async function backfillTeacherId(): Promise<string> {
    console.log('🔄 Starting migration: Backfill teacherId...');
    const logs: string[] = [];
    let updatedCount = 0;
    let errorCount = 0;

    try {
        // 1. Get all test results
        const resultsRef = ref(database, 'test_results');
        const snapshot = await get(resultsRef);

        if (!snapshot.exists()) {
            return 'No results found to migrate.';
        }

        const results = snapshot.val() as Record<string, TestResultRecord>;
        const resultEntries = Object.entries(results);

        console.log(`Found ${resultEntries.length} results to check.`);

        // Cache session creators to avoid redundant lookups
        const sessionCreatorCache: Record<string, string> = {};

        for (const [resultId, result] of resultEntries) {
            // Skip if already has teacherId
            if (result.teacherId) {
                continue;
            }

            try {
                const sessionCode = result.sessionCode;
                let teacherId = sessionCreatorCache[sessionCode];

                // If not in cache, fetch from session
                if (!teacherId) {
                    const sessionRef = ref(database, `game_sessions/${sessionCode}`);
                    const sessionSnap = await get(sessionRef);

                    if (sessionSnap.exists()) {
                        teacherId = sessionSnap.val().createdBy;
                        if (teacherId) {
                            sessionCreatorCache[sessionCode] = teacherId;
                        }
                    }
                }

                if (teacherId) {
                    const updates: Partial<TestResultRecord> = {
                        teacherId: teacherId,
                        isGuest: result.studentId.startsWith('guest_')
                    };

                    // 1. Update main record
                    await update(ref(database, `test_results/${resultId}`), updates);

                    // 2. Add to teacher index
                    const teacherIndexRef = ref(database, `test_results_by_teacher/${teacherId}/${resultId}`);
                    await set(teacherIndexRef, {
                        resultId,
                        sessionCode,
                        studentId: result.studentId,
                        studentName: result.studentName,
                        percentage: result.percentage,
                        submittedAt: result.submittedAt,
                        isGuest: updates.isGuest
                    });

                    updatedCount++;
                    // logs.push(`✅ Updated result ${resultId} (Session: ${sessionCode}, Teacher: ${teacherId})`);
                } else {
                    logs.push(`⚠️ Could not find teacher for session ${sessionCode} (Result: ${resultId})`);
                    errorCount++;
                }
            } catch (err) {
                console.error(`Error processing result ${resultId}:`, err);
                logs.push(`❌ Error processing ${resultId}: ${err}`);
                errorCount++;
            }
        }

        const summary = `Migration Complete. Updated: ${updatedCount}, Errors/Skipped: ${errorCount}`;
        console.log(summary);
        return summary + '\n' + logs.join('\n');

    } catch (error) {
        console.error('Fatal migration error:', error);
        throw error;
    }
}

// =============================================================================
// PRD-0016: Context Migration Functions
// =============================================================================

import type { ResultContext } from '../types/solo.types';

/**
 * Default context for legacy results (created before PRD-0016)
 * These are all considered class_session by default
 */
function createLegacyContext(sessionCode?: string, className?: string): ResultContext {
    return {
        type: 'class_session',
        source: {
            type: 'class',
            name: sessionCode ? `Session ${sessionCode}` : (className || 'Legacy Session')
        },
        configApplied: {
            feedbackTiming: 'after_completion',
            source: 'material_default'
        }
    };
}

interface ContextMigrationResult {
    success: boolean;
    totalRecords: number;
    migratedRecords: number;
    skippedRecords: number;
    failedRecords: number;
    errors: string[];
    durationMs: number;
}

/**
 * Run a dry run of the context migration to see what would be changed
 * Does NOT modify any data
 */
export async function runContextMigrationDryRun(): Promise<{
    totalRecords: number;
    recordsNeedingMigration: number;
    recordsAlreadyMigrated: number;
    sampleRecordIds: string[];
}> {
    console.log('🔍 Starting context migration dry run...');

    const resultsRef = ref(database, 'test_results');
    const snapshot = await get(resultsRef);

    if (!snapshot.exists()) {
        return {
            totalRecords: 0,
            recordsNeedingMigration: 0,
            recordsAlreadyMigrated: 0,
            sampleRecordIds: []
        };
    }

    const results = snapshot.val() as Record<string, any>;
    const entries = Object.entries(results);

    let recordsNeedingMigration = 0;
    let recordsAlreadyMigrated = 0;
    const sampleRecordIds: string[] = [];

    for (const [resultId, data] of entries) {
        if (data.context) {
            recordsAlreadyMigrated++;
        } else {
            recordsNeedingMigration++;
            if (sampleRecordIds.length < 5) {
                sampleRecordIds.push(resultId);
            }
        }
    }

    console.log('📊 Dry run complete:');
    console.log(`   Total records: ${entries.length}`);
    console.log(`   Need migration: ${recordsNeedingMigration}`);
    console.log(`   Already migrated: ${recordsAlreadyMigrated}`);

    return {
        totalRecords: entries.length,
        recordsNeedingMigration,
        recordsAlreadyMigrated,
        sampleRecordIds
    };
}

/**
 * Migrate existing results to add context field
 * PRD-0016: All existing results are treated as 'class_session' context
 */
export async function migrateResultsWithContext(): Promise<ContextMigrationResult> {
    const startTime = Date.now();
    const errors: string[] = [];

    console.log('🚀 Starting context migration...');

    try {
        const resultsRef = ref(database, 'test_results');
        const snapshot = await get(resultsRef);

        if (!snapshot.exists()) {
            return {
                success: true,
                totalRecords: 0,
                migratedRecords: 0,
                skippedRecords: 0,
                failedRecords: 0,
                errors: [],
                durationMs: Date.now() - startTime
            };
        }

        const results = snapshot.val() as Record<string, any>;
        const entries = Object.entries(results);
        const totalRecords = entries.length;

        let migratedRecords = 0;
        let skippedRecords = 0;
        let failedRecords = 0;

        console.log(`📊 Found ${totalRecords} total records`);

        for (const [resultId, data] of entries) {
            // Skip if already has context
            if (data.context) {
                skippedRecords++;
                continue;
            }

            try {
                // Create legacy context with session/class info
                const context = createLegacyContext(data.sessionCode, data.className);

                // If the record has class info, use it
                if (data.classId) {
                    context.source.id = data.classId;
                }

                // Update the record
                await update(ref(database, `test_results/${resultId}`), { context });

                migratedRecords++;

                // Log progress every 100 records
                if (migratedRecords % 100 === 0) {
                    console.log(`  ✓ Migrated ${migratedRecords} records...`);
                }
            } catch (err) {
                failedRecords++;
                errors.push(`Failed to migrate ${resultId}: ${err}`);
            }
        }

        const durationMs = Date.now() - startTime;

        console.log('✅ Context migration complete!');
        console.log(`   Migrated: ${migratedRecords}`);
        console.log(`   Skipped: ${skippedRecords}`);
        console.log(`   Failed: ${failedRecords}`);
        console.log(`   Duration: ${durationMs}ms`);

        return {
            success: failedRecords === 0,
            totalRecords,
            migratedRecords,
            skippedRecords,
            failedRecords,
            errors,
            durationMs
        };
    } catch (error) {
        console.error('❌ Context migration failed:', error);
        return {
            success: false,
            totalRecords: 0,
            migratedRecords: 0,
            skippedRecords: 0,
            failedRecords: 0,
            errors: [`Migration failed: ${error}`],
            durationMs: Date.now() - startTime
        };
    }
}

/**
 * Rollback context migration by removing context field from legacy records
 * Only removes context from records tagged as 'Legacy Session'
 */
export async function rollbackContextMigration(): Promise<ContextMigrationResult> {
    const startTime = Date.now();
    const errors: string[] = [];

    console.log('⚠️ Starting context migration rollback...');

    try {
        const resultsRef = ref(database, 'test_results');
        const snapshot = await get(resultsRef);

        if (!snapshot.exists()) {
            return {
                success: true,
                totalRecords: 0,
                migratedRecords: 0,
                skippedRecords: 0,
                failedRecords: 0,
                errors: [],
                durationMs: Date.now() - startTime
            };
        }

        const results = snapshot.val() as Record<string, any>;
        const entries = Object.entries(results);
        const totalRecords = entries.length;

        let rolledBackRecords = 0;
        let skippedRecords = 0;
        let failedRecords = 0;

        for (const [resultId, data] of entries) {
            // Skip if no context
            if (!data.context) {
                skippedRecords++;
                continue;
            }

            // Only rollback legacy context records
            const isLegacy = data.context.type === 'class_session' &&
                (data.context.source?.name?.includes('Legacy') ||
                    data.context.source?.name?.includes('Session'));

            if (!isLegacy) {
                skippedRecords++;
                continue;
            }

            try {
                await update(ref(database, `test_results/${resultId}`), { context: null });
                rolledBackRecords++;
            } catch (err) {
                failedRecords++;
                errors.push(`Failed to rollback ${resultId}: ${err}`);
            }
        }

        const durationMs = Date.now() - startTime;

        console.log('✅ Context rollback complete!');
        console.log(`   Rolled back: ${rolledBackRecords}`);
        console.log(`   Skipped: ${skippedRecords}`);

        return {
            success: failedRecords === 0,
            totalRecords,
            migratedRecords: rolledBackRecords,
            skippedRecords,
            failedRecords,
            errors,
            durationMs
        };
    } catch (error) {
        console.error('❌ Context rollback failed:', error);
        return {
            success: false,
            totalRecords: 0,
            migratedRecords: 0,
            skippedRecords: 0,
            failedRecords: 0,
            errors: [`Rollback failed: ${error}`],
            durationMs: Date.now() - startTime
        };
    }
}
