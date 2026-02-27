/**
 * Guest Results Service
 * 
 * Handles storage and retrieval of test results for guest (non-authenticated) users.
 * Guest results are stored separately and can be claimed when a user registers.
 */

import { ref, push, get, set, remove, query, orderByChild, equalTo } from 'firebase/database';
import { database } from './firebase';
import type { EnhancedTestResultRecord } from '../types/results.types';

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
 * Moves results from guest_results/{guestName} to test_results/{userId}
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

        // Transfer each result to the user's test_results
        const userResultsRef = ref(database, `test_results/${userId}`);

        for (const result of results) {
            const newResultRef = push(userResultsRef);

            // Remove guest-specific metadata
            const { guestName: _, isGuestResult, savedAt, resultId, ...cleanResult } = result;

            // Add user-specific metadata
            const userResult = {
                ...cleanResult,
                claimedAt: Date.now(),
                claimedFrom: guestName
            };

            await set(newResultRef, userResult);
        }

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
