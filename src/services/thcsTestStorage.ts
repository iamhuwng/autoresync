/**
 * THCS-THPT Test Storage Service
 * Handles RTDB CRUD for published THCS-THPT tests
 * Follows testStorage.ts patterns
 *
 * NOTE: THCS-THPT tests are stored in the SAME tests/ node as IELTS tests.
 * They are distinguished by the testType field. Do NOT create a separate thcs_tests/ node.
 */

import { ref, set, get, update, runTransaction } from 'firebase/database';
// @ts-ignore - firebase.js doesn't have type declarations
import { database } from './firebase';
import type { THCSTest } from '../types/thcs-test.types';

/**
 * Generate unique THCS-THPT test ID
 */
export const generateThcsTestId = (): string => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    return `thcs-test-${timestamp}-${random}`;
};

/**
 * Save a THCS-THPT test to Firebase RTDB
 * Writes full THCSTest to tests/{testId}
 * The testType: 'THCS-THPT' field MUST be set
 * Do NOT initialize stats — it's optional and only created on first student submission
 */
export const saveThcsTestToFirebase = async (
    test: THCSTest,
    teacherUid?: string
): Promise<{ success: boolean; testId?: string; error?: string }> => {
    try {
        const testId = test.id;
        const testRef = ref(database, `tests/${testId}`);

        // Ensure testType is always set
        const testData = {
            ...test,
            testType: 'THCS-THPT' as const,
        };

        // Task 9.3: Detect re-publish vs first-time publish
        const existingSnapshot = await get(testRef);
        if (existingSnapshot.exists() && existingSnapshot.val().publishedAt) {
            // Re-publish — use publishTestUpdate to create changelog
            console.log('📝 [thcsTestStorage] Re-publish detected, creating changelog entry...');
            await publishTestUpdate(testId, testData, teacherUid || test.createdBy || 'unknown');
            return { success: true, testId };
        }

        // First-time publish — direct set (no changelog entry)
        await set(testRef, { ...testData, publishedAt: Date.now() });

        console.log('✅ THCS-THPT test saved to Firebase:', testId);

        return {
            success: true,
            testId,
        };
    } catch (error) {
        console.error('❌ [thcsTestStorage] Error saving THCS test to Firebase:', error);

        let errorMessage = 'Failed to save test';
        if (error instanceof Error) {
            if (error.message.includes('permission')) {
                errorMessage = 'Permission denied. Please check Firebase database rules.';
            } else if (error.message.includes('network')) {
                errorMessage = 'Network error. Please check your connection.';
            } else {
                errorMessage = error.message;
            }
        }

        return {
            success: false,
            error: errorMessage,
        };
    }
};

/**
 * Get a THCS-THPT test from Firebase RTDB
 * Reads from tests/{testId}, verifies testType === 'THCS-THPT'
 */
export const getThcsTestFromFirebase = async (
    testId: string
): Promise<{ success: boolean; data?: THCSTest; error?: string }> => {
    try {
        const testRef = ref(database, `tests/${testId}`);
        const snapshot = await get(testRef);

        if (!snapshot.exists()) {
            return {
                success: false,
                error: 'Test not found',
            };
        }

        const data = snapshot.val();

        // Verify this is a THCS-THPT test
        if (data.testType !== 'THCS-THPT') {
            return {
                success: false,
                error: `Test ${testId} is not a THCS-THPT test (testType: ${data.testType || 'undefined'})`,
            };
        }

        return {
            success: true,
            data: data as THCSTest,
        };
    } catch (error) {
        console.error('❌ [thcsTestStorage] Error getting THCS test from Firebase:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get test',
        };
    }
};

/**
 * Partial update of a THCS-THPT test in Firebase RTDB
 * Always sets updatedAt to current timestamp
 */
export const updateThcsTestInFirebase = async (
    testId: string,
    updates: Partial<THCSTest>
): Promise<{ success: boolean; error?: string }> => {
    try {
        const testRef = ref(database, `tests/${testId}`);

        const updatedData = {
            ...updates,
            updatedAt: Date.now(),
        };

        await update(testRef, updatedData);

        console.log('✅ THCS-THPT test updated in Firebase:', testId);

        return {
            success: true,
        };
    } catch (error) {
        console.error('❌ [thcsTestStorage] Error updating THCS test in Firebase:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to update test',
        };
    }
};

/**
 * Delete a THCS-THPT test from Firebase RTDB
 * Sets tests/{testId} to null
 */
export const deleteThcsTestFromFirebase = async (
    testId: string
): Promise<{ success: boolean; error?: string }> => {
    try {
        const testRef = ref(database, `tests/${testId}`);
        await set(testRef, null);

        console.log('✅ THCS-THPT test deleted from Firebase:', testId);

        return {
            success: true,
        };
    } catch (error) {
        console.error('❌ [thcsTestStorage] Error deleting THCS test from Firebase:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to delete test',
        };
    }
};

// ═══════════════════════════════════════════════════════════════
// TASK 9.0: Version Changelog & Delta System
// ═══════════════════════════════════════════════════════════════

/**
 * Changelog entry stored at tests/{testId}/_changelog/v_{timestamp}
 */
export interface ChangelogEntry {
    publishedAt: number;
    publishedBy: string;
    label: string;
    previousValues: Record<string, any>;
}

/**
 * Task 9.1: Deep recursive comparison of two objects.
 * Returns a flat map of changed fields: key → OLD value.
 * Key format uses `~` separator for nested paths.
 * `null` value means the field was newly added (no old value).
 * Arrays compared element-by-element by index.
 */
export const computeDelta = (
    oldData: any,
    newData: any,
    prefix: string = ''
): Record<string, any> => {
    const delta: Record<string, any> = {};

    if (oldData === newData) return delta;
    if (oldData === undefined || oldData === null) {
        if (newData !== undefined && newData !== null) {
            delta[prefix || '_root'] = null;
        }
        return delta;
    }
    if (newData === undefined || newData === null) {
        delta[prefix || '_root'] = oldData;
        return delta;
    }

    // Primitives
    if (typeof oldData !== 'object' || typeof newData !== 'object') {
        if (oldData !== newData) {
            delta[prefix || '_root'] = oldData;
        }
        return delta;
    }

    // Arrays
    if (Array.isArray(oldData) || Array.isArray(newData)) {
        const oldArr = Array.isArray(oldData) ? oldData : [];
        const newArr = Array.isArray(newData) ? newData : [];
        const maxLen = Math.max(oldArr.length, newArr.length);
        for (let i = 0; i < maxLen; i++) {
            const childPrefix = prefix ? `${prefix}~${i}` : String(i);
            const childDelta = computeDelta(oldArr[i], newArr[i], childPrefix);
            Object.assign(delta, childDelta);
        }
        return delta;
    }

    // Objects
    const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
    for (const key of allKeys) {
        if (key === '_changelog') continue;
        const childPrefix = prefix ? `${prefix}~${key}` : key;
        const childDelta = computeDelta(oldData[key], newData[key], childPrefix);
        Object.assign(delta, childDelta);
    }

    return delta;
};

/**
 * Task 9.2: Publish an update to an existing test with changelog entry.
 * Uses runTransaction for changelog write to prevent race conditions (PRD §9 EC8/EC15).
 */
export const publishTestUpdate = async (
    testId: string,
    newData: any,
    teacherUid: string
): Promise<void> => {
    const testRef = ref(database, `tests/${testId}`);

    const snapshot = await get(testRef);
    if (!snapshot.exists()) {
        throw new Error(`Test ${testId} not found for update`);
    }
    const currentData = snapshot.val();

    const delta = computeDelta(currentData, newData);
    const changedFieldCount = Object.keys(delta).length;

    if (changedFieldCount === 0) {
        console.log('ℹ️ [publishTestUpdate] No changes detected, skipping changelog.');
        return;
    }

    const existingChangelog = currentData._changelog || {};
    const changelogCount = Object.keys(existingChangelog).length + 1;
    const timestamp = Date.now();

    const entry: ChangelogEntry = {
        publishedAt: timestamp,
        publishedBy: teacherUid,
        label: `Edit #${changelogCount} — ${changedFieldCount} field${changedFieldCount === 1 ? '' : 's'} changed`,
        previousValues: delta,
    };

    // Write changelog via runTransaction (race-safe)
    const changelogRef = ref(database, `tests/${testId}/_changelog/v_${timestamp}`);
    await runTransaction(changelogRef, (current: any) => {
        if (current !== null) return undefined; // abort on collision
        return entry;
    });

    // Verify write; retry with unique key if collision occurred
    const verifySnapshot = await get(changelogRef);
    if (!verifySnapshot.exists()) {
        const retryKey = `v_${timestamp}_${Math.random().toString(36).substr(2, 5)}`;
        const retryRef = ref(database, `tests/${testId}/_changelog/${retryKey}`);
        await set(retryRef, entry);
    }

    // Overwrite test data while preserving _changelog
    const preservedChangelog = { ...existingChangelog, [`v_${timestamp}`]: entry };
    await set(testRef, {
        ...newData,
        publishedAt: currentData.publishedAt,
        updatedAt: timestamp,
        _changelog: preservedChangelog,
    });

    console.log(`✅ [publishTestUpdate] Changelog v_${timestamp} created: ${entry.label}`);
};

/**
 * Task 9.4: Reconstruct a previous version by applying deltas backward.
 */
export const reconstructVersion = async (
    testId: string,
    targetVersionKey: string
): Promise<THCSTest> => {
    const testRef = ref(database, `tests/${testId}`);
    const snapshot = await get(testRef);

    if (!snapshot.exists()) {
        throw new Error(`Test ${testId} not found`);
    }

    const fullData = snapshot.val();
    const changelog: Record<string, ChangelogEntry> = fullData._changelog || {};

    const currentData = { ...fullData };
    delete currentData._changelog;

    // Sort by timestamp descending (newest first)
    const sortedEntries = Object.entries(changelog)
        .map(([key, entry]) => ({ key, ...entry }))
        .sort((a, b) => b.publishedAt - a.publishedAt);

    let reconstructed = JSON.parse(JSON.stringify(currentData));

    for (const entry of sortedEntries) {
        if (entry.key === targetVersionKey) break;

        for (const [path, oldValue] of Object.entries(entry.previousValues)) {
            if (oldValue === null) {
                deletePath(reconstructed, path);
            } else {
                setPath(reconstructed, path, oldValue);
            }
        }
    }

    return reconstructed as THCSTest;
};

/** Helper: Set value at `~` separated path */
function setPath(obj: any, path: string, value: any): void {
    const parts: string[] = path.split('~');
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const key: string = parts[i]!;
        if (current[key] === undefined || current[key] === null) {
            const nextKey = parts[i + 1] || '';
            current[key] = /^\d+$/.test(nextKey) ? [] : {};
        }
        current = current[key];
    }
    const lastKey: string = parts[parts.length - 1]!;
    current[lastKey] = value;
}

/** Helper: Delete value at `~` separated path */
function deletePath(obj: any, path: string): void {
    const parts: string[] = path.split('~');
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const key: string = parts[i]!;
        if (current[key] === undefined) return;
        current = current[key];
    }
    const lastKey: string = parts[parts.length - 1]!;
    if (Array.isArray(current)) {
        current.splice(Number(lastKey), 1);
    } else {
        delete current[lastKey];
    }
}
