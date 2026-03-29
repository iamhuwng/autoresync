/**
 * Guest Results Service
 * 
 * Handles storage and retrieval of test results for guest (non-authenticated) users.
 * Guest results are stored separately and can be claimed when a user registers.
 */

import { ref, push, get, set, remove, update } from 'firebase/database';
import { database } from './firebase';
import type { EnhancedTestResultRecord } from '../types/results.types';
import type { ResultContext } from '../types/solo.types';
import type { ResultVisibilityContextType } from '../types/results.types';
import { resolveResultOwnership } from './resultOwnershipResolver';
import { buildUnresolvedResultVisibilityReportEntry } from './resultVisibilityReporting.service';
import {
    getCanonicalClassIndexId,
    getCanonicalCourseIndexId,
    isScopedIndexBackfillEligible,
} from './resultVisibilityReindex.service';

type ResultStorageRecord = EnhancedTestResultRecord & Record<string, any>;

function isPlainObject(value: unknown): value is Record<string, any> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function looksLikeCanonicalResult(value: unknown): value is ResultStorageRecord {
    return isPlainObject(value)
        && (typeof value.resultId === 'string'
            || typeof value.studentId === 'string'
            || typeof value.sessionCode === 'string'
            || typeof value.submittedAt === 'number');
}

function looksLikeLegacyClaimBucket(value: unknown): value is Record<string, ResultStorageRecord> {
    if (!isPlainObject(value) || looksLikeCanonicalResult(value)) {
        return false;
    }

    const entries = Object.entries(value);
    return entries.length > 0 && entries.every(([, childValue]) => looksLikeCanonicalResult(childValue));
}

function omitUndefined<T extends Record<string, any>>(value: T): Partial<T> {
    return Object.fromEntries(
        Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
    ) as Partial<T>;
}

function inferVisibilityContextType(
    context?: ResultContext,
    hints?: {
        homeworkId?: string | null;
        classId?: string | null;
        courseId?: string | null;
        sessionCode?: string | null;
    },
): ResultVisibilityContextType | undefined {
    if (context?.type === 'homework') return 'homework';
    if (context?.type === 'class_session') return 'class_session';
    if (context?.type === 'course_material') return 'course_material';
    if (context?.type === 'self_study') return 'solo_practice';
    if (hints?.homeworkId) return 'homework';
    if (hints?.classId || hints?.courseId) return 'course_material';
    if (hints?.sessionCode) return 'class_session';
    return undefined;
}

function getTeacherIndexOwnerId(result: EnhancedTestResultRecord): string | null {
    if (!result.visibility?.ownershipResolved) {
        return null;
    }
    if (result.visibility.contextType === 'solo_practice') {
        return null;
    }
    return result.visibility.visibilityOwnerTeacherId ?? null;
}

async function buildCanonicalClaimFanout(
    result: ResultStorageRecord,
    userId: string,
    claimMeta: { claimedAt: number; claimedFrom: string },
): Promise<{ resultId: string; updates: Record<string, any> }> {
    const { guestName: _guestName, isGuestResult: _isGuestResult, savedAt: _savedAt, resultId, ...rest } = result;

    const canonicalResultId = resultId;
    const canonicalResult = omitUndefined({
        ...rest,
        resultId: canonicalResultId,
        studentId: userId,
        claimedAt: claimMeta.claimedAt,
        claimedFrom: claimMeta.claimedFrom,
    }) as EnhancedTestResultRecord;

    const submittedAt = typeof canonicalResult.submittedAt === 'number' ? canonicalResult.submittedAt : claimMeta.claimedAt;
    const percentage = typeof canonicalResult.percentage === 'number' ? canonicalResult.percentage : undefined;
    const sessionCode = typeof canonicalResult.sessionCode === 'string' ? canonicalResult.sessionCode : undefined;
    const courseId = typeof canonicalResult.courseId === 'string' && canonicalResult.courseId.trim() !== ''
        ? canonicalResult.courseId
        : undefined;
    const classId = typeof canonicalResult.classId === 'string' && canonicalResult.classId.trim() !== ''
        ? canonicalResult.classId
        : undefined;
    const moduleId = typeof canonicalResult.moduleId === 'string' && canonicalResult.moduleId.trim() !== ''
        ? canonicalResult.moduleId
        : null;
    const studentName = typeof canonicalResult.studentName === 'string' ? canonicalResult.studentName : undefined;
    const bandScore = typeof canonicalResult.bandScore === 'number' ? canonicalResult.bandScore : undefined;
    const testTitle = typeof canonicalResult.testTitle === 'string' ? canonicalResult.testTitle : undefined;
    const testSkill = typeof canonicalResult.testSkill === 'string' ? canonicalResult.testSkill : undefined;
    const testId = typeof canonicalResult.testId === 'string' ? canonicalResult.testId : undefined;
    const visibilityResult = await resolveResultOwnership({
        result: canonicalResult,
        contextType: inferVisibilityContextType(canonicalResult.context, {
            homeworkId: canonicalResult.context?.assignment?.homeworkId ?? null,
            classId: canonicalResult.classId ?? null,
            courseId: canonicalResult.courseId ?? null,
            sessionCode: canonicalResult.sessionCode ?? null,
        }),
        homeworkId: canonicalResult.context?.assignment?.homeworkId ?? null,
        sessionCode: canonicalResult.sessionCode ?? null,
        classId: canonicalResult.classId ?? null,
        courseId: canonicalResult.courseId ?? null,
        sourceNameSnapshot:
            canonicalResult.context?.source?.name
            ?? canonicalResult.className
            ?? canonicalResult.courseName
            ?? canonicalResult.testTitle
            ?? null,
    });

    canonicalResult.visibility = visibilityResult.visibility;

    const updates: Record<string, any> = {
        [`test_results/${canonicalResultId}`]: canonicalResult,
        [`test_results_by_student/${userId}/${canonicalResultId}`]: omitUndefined({
            resultId: canonicalResultId,
            sessionCode,
            testId,
            percentage,
            submittedAt,
        }),
    };

    if (sessionCode) {
        updates[`test_results_by_session/${sessionCode}/${canonicalResultId}`] = omitUndefined({
            resultId: canonicalResultId,
            studentId: userId,
            studentName,
            percentage,
            submittedAt,
        });
    }

    const teacherIndexOwnerId = getTeacherIndexOwnerId(canonicalResult);
    if (teacherIndexOwnerId) {
        updates[`test_results_by_teacher/${teacherIndexOwnerId}/${canonicalResultId}`] = omitUndefined({
            resultId: canonicalResultId,
            sessionCode,
            studentId: userId,
            studentName,
            percentage,
            submittedAt,
            isGuest: canonicalResult.isGuest,
        });
    }

    if (
        canonicalResult.visibility.ownershipResolved
        && canonicalResult.visibility.contextType === 'solo_practice'
    ) {
        updates[`test_results_solo_practice_by_student/${userId}/${canonicalResultId}`] = omitUndefined({
            resultId: canonicalResultId,
            sessionCode,
            testId,
            percentage,
            submittedAt,
        });
    }

    if (canonicalResult.visibility.ownershipResolved) {
        updates[`reports/result_visibility/unresolved/${canonicalResultId}`] = null;
    } else {
        updates[`reports/result_visibility/unresolved/${canonicalResultId}`] =
            buildUnresolvedResultVisibilityReportEntry({
                resultId: canonicalResultId,
                studentId: userId,
                visibility: canonicalResult.visibility,
                sourceLookupAttempted: visibilityResult.sourceLookupAttempted,
                strongestKnownSourceClue: visibilityResult.strongestKnownSourceClue,
            });
    }

    const canWriteScopedIndexes = isScopedIndexBackfillEligible(canonicalResult);
    const canonicalCourseId = getCanonicalCourseIndexId(canonicalResult);
    const canonicalClassId = getCanonicalClassIndexId(canonicalResult);

    if (canWriteScopedIndexes && canonicalCourseId) {
        updates[`test_results_by_course/${canonicalCourseId}/${userId}/${canonicalResultId}`] = omitUndefined({
            resultId: canonicalResultId,
            studentId: userId,
            studentName,
            percentage,
            bandScore,
            testTitle,
            testSkill,
            submittedAt,
            moduleId,
        });
    }

    if (canWriteScopedIndexes && canonicalClassId) {
        updates[`test_results_by_class/${canonicalClassId}/${userId}/${canonicalResultId}`] = omitUndefined({
            resultId: canonicalResultId,
            studentId: userId,
            studentName,
            percentage,
            bandScore,
            testTitle,
            testSkill,
            submittedAt,
            courseId: courseId || null,
        });
    }

    return { resultId: canonicalResultId, updates };
}

/**
 * Save a guest result to Firebase
 * Stores in guest_results/{guestName}/{resultId}
 * 
 * @param guestName - Guest's display name
 * @param result - Test result to save
 * @returns Result ID
 */
export async function saveGuestResult(
    guestName: string,
    result: EnhancedTestResultRecord
): Promise<string> {
    try {
        if (!guestName || guestName.trim() === '') {
            throw new Error('Guest name is required');
        }

        // Generate unique guest name if needed (add suffix for duplicates)
        const uniqueGuestName = await generateUniqueGuestName(guestName);

        // Create reference for new result
        const guestResultsRef = ref(database, `guest_results/${uniqueGuestName}`);
        const newResultRef = push(guestResultsRef);

        if (!newResultRef.key) {
            throw new Error('Failed to generate result ID');
        }

        // Add metadata for guest results
        const guestResult = {
            ...result,
            guestName: uniqueGuestName,
            isGuestResult: true,
            savedAt: Date.now()
        };

        await set(newResultRef, guestResult);

        console.log(`Guest result saved: ${newResultRef.key} for ${uniqueGuestName}`);
        return newResultRef.key;
    } catch (error) {
        console.error('Error saving guest result:', error);
        throw error;
    }
}

/**
 * Get all results for a specific guest name
 * 
 * @param guestName - Guest's display name
 * @returns Array of test results
 */
export async function getGuestResults(guestName: string): Promise<EnhancedTestResultRecord[]> {
    try {
        if (!guestName || guestName.trim() === '') {
            throw new Error('Guest name is required');
        }

        const guestResultsRef = ref(database, `guest_results/${guestName}`);
        const snapshot = await get(guestResultsRef);

        if (!snapshot.exists()) {
            return [];
        }

        const results: EnhancedTestResultRecord[] = [];
        snapshot.forEach((childSnapshot) => {
            const result = childSnapshot.val();
            results.push({
                ...result,
                resultId: childSnapshot.key
            });
        });

        // Sort by submission time (newest first)
        return results.sort((a, b) => b.submittedAt - a.submittedAt);
    } catch (error) {
        console.error('Error getting guest results:', error);
        throw error;
    }
}

/**
 * Generate unique guest name by adding suffix if name already exists
 * 
 * Examples:
 * - "John" → "John" (if available)
 * - "John" → "John_1" (if "John" exists)
 * - "John" → "John_2" (if "John" and "John_1" exist)
 * 
 * @param baseName - Base guest name
 * @returns Unique guest name
 */
export async function generateUniqueGuestName(baseName: string): Promise<string> {
    try {
        const cleanName = baseName.trim();

        // Check if base name is available
        const baseRef = ref(database, `guest_results/${cleanName}`);
        const baseSnapshot = await get(baseRef);

        if (!baseSnapshot.exists()) {
            return cleanName;
        }

        // Find next available suffix
        let suffix = 1;
        let uniqueName = `${cleanName}_${suffix}`;

        while (suffix < 100) { // Safety limit
            const testRef = ref(database, `guest_results/${uniqueName}`);
            const testSnapshot = await get(testRef);

            if (!testSnapshot.exists()) {
                return uniqueName;
            }

            suffix++;
            uniqueName = `${cleanName}_${suffix}`;
        }

        // If we reach here, too many duplicates
        throw new Error(`Too many guest accounts with name: ${cleanName}`);
    } catch (error) {
        console.error('Error generating unique guest name:', error);
        throw error;
    }
}

/**
 * Claim all guest results and transfer them to a registered user
 * Promotes results from guest_results/{guestName}/{resultId} into canonical result storage
 * Deletes the guest results after successful transfer
 * 
 * @param guestName - Guest name to claim results from
 * @param userId - User ID to transfer results to
 * @returns Number of results claimed
 */
export async function claimGuestResults(
    guestName: string,
    userId: string
): Promise<number> {
    try {
        if (!guestName || !userId) {
            throw new Error('Guest name and user ID are required');
        }

        // Get all guest results
        const results = await getGuestResults(guestName);

        if (results.length === 0) {
            return 0;
        }

        const claimTimestamp = Date.now();
        const updates: Record<string, any> = {};
        for (const result of results) {
            const { updates: resultUpdates } = await buildCanonicalClaimFanout(
                result as ResultStorageRecord,
                userId,
                {
                    claimedAt: claimTimestamp,
                    claimedFrom: guestName,
                },
            );
            Object.assign(updates, resultUpdates);
        }

        await update(ref(database), updates);

        // Delete guest results after successful transfer
        const guestResultsRef = ref(database, `guest_results/${guestName}`);
        await remove(guestResultsRef);

        console.log(`Claimed ${results.length} results from ${guestName} to user ${userId}`);
        return results.length;
    } catch (error) {
        console.error('Error claiming guest results:', error);
        throw error;
    }
}

/**
 * Privileged maintenance helper that promotes legacy claimed rows stored under
 * test_results/{userId}/{resultId} into canonical result storage with the
 * expected fan-out indexes.
 *
 * Returns the number of migrated result rows.
 */
export async function migrateLegacyClaimedGuestResults(): Promise<number> {
    try {
        const snapshot = await get(ref(database, 'test_results'));

        if (!snapshot.exists()) {
            return 0;
        }

        const storedResults = snapshot.val();
        if (!isPlainObject(storedResults)) {
            return 0;
        }

        const updates: Record<string, any> = {};
        let migratedCount = 0;

        for (const [bucketUserId, bucketValue] of Object.entries(storedResults)) {
            if (!looksLikeLegacyClaimBucket(bucketValue)) {
                continue;
            }

            for (const [resultId, legacyResult] of Object.entries(bucketValue)) {
                if (!looksLikeCanonicalResult(legacyResult)) {
                    continue;
                }

                const { updates: resultUpdates } = await buildCanonicalClaimFanout(
                    {
                        ...(legacyResult as ResultStorageRecord),
                        resultId,
                    },
                    bucketUserId,
                    {
                        claimedAt: typeof legacyResult.claimedAt === 'number' ? legacyResult.claimedAt : Date.now(),
                        claimedFrom: typeof legacyResult.claimedFrom === 'string' ? legacyResult.claimedFrom : 'guest',
                    },
                );
                Object.assign(updates, resultUpdates);
                migratedCount += 1;
            }

            updates[`test_results/${bucketUserId}`] = null;
        }

        if (migratedCount === 0) {
            return 0;
        }

        await update(ref(database), updates);
        console.log(`Migrated ${migratedCount} legacy claimed guest result(s)`);
        return migratedCount;
    } catch (error) {
        console.error('Error migrating legacy claimed guest results:', error);
        throw error;
    }
}

/**
 * Check if there are claimable results for an email address
 * Searches for guest names that match the email prefix
 * 
 * Example: user@example.com → checks for guest names like "user", "user_1", etc.
 * 
 * @param email - User's email address
 * @returns Array of guest names with claimable results
 */
export async function checkClaimableResults(email: string): Promise<string[]> {
    try {
        if (!email || !email.includes('@')) {
            throw new Error('Valid email is required');
        }

        // Extract username from email (before @)
        const username = email.split('@')[0];

        // Get all guest results
        const guestResultsRef = ref(database, 'guest_results');
        const snapshot = await get(guestResultsRef);

        if (!snapshot.exists()) {
            return [];
        }

        const claimableNames: string[] = [];

        // Check each guest name
        snapshot.forEach((childSnapshot) => {
            const guestName = childSnapshot.key;

            if (!guestName) return;

            // Match exact name or name with suffix (username, username_1, username_2, etc.)
            const pattern = new RegExp(`^${username}(_\\d+)?$`, 'i');

            if (pattern.test(guestName)) {
                claimableNames.push(guestName);
            }
        });

        return claimableNames;
    } catch (error) {
        console.error('Error checking claimable results:', error);
        throw error;
    }
}

/**
 * Delete all results for a specific guest name
 * Used for cleanup or GDPR compliance
 * 
 * @param guestName - Guest name to delete results for
 */
export async function deleteGuestResults(guestName: string): Promise<void> {
    try {
        if (!guestName || guestName.trim() === '') {
            throw new Error('Guest name is required');
        }

        const guestResultsRef = ref(database, `guest_results/${guestName}`);
        await remove(guestResultsRef);

        console.log(`Deleted all results for guest: ${guestName}`);
    } catch (error) {
        console.error('Error deleting guest results:', error);
        throw error;
    }
}

/**
 * Get count of results for a guest name
 * Useful for displaying "You have X results" messages
 * 
 * @param guestName - Guest name to count results for
 * @returns Number of results
 */
export async function getGuestResultCount(guestName: string): Promise<number> {
    try {
        const results = await getGuestResults(guestName);
        return results.length;
    } catch (error) {
        console.error('Error getting guest result count:', error);
        return 0;
    }
}
