/**
 * Account Deletion Service
 * PRD-0015: Phase 9 & 10 - GDPR-compliant account deletion
 * 
 * Implements:
 * - Soft delete with 30-day grace period
 * - Hard delete (admin only)
 * - Deletion cancellation
 * - Scheduled cleanup
 */

import { ref, get, update, remove } from 'firebase/database';
import { database } from './firebase';

export interface DeletedUser {
    userId: string;
    email: string;
    displayName: string;
    requestedAt: number;
    scheduledDeletionAt: number; // requestedAt + 30 days
    reason?: string;
    status: 'pending' | 'cancelled' | 'completed';
}

const GRACE_PERIOD_DAYS = 30;
const GRACE_PERIOD_MS = GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;

/**
 * Request account deletion (soft delete)
 * Sets deletion flag and schedule for permanent deletion after 30 days
 * 
 * @param userId - User ID to delete
 * @param reason - Optional reason for deletion
 * @returns Promise<void>
 */
export async function requestDeletion(
    userId: string,
    reason?: string
): Promise<void> {
    try {
        if (!userId) {
            throw new Error('User ID is required');
        }

        // Get user data before marking for deletion
        const userRef = ref(database, `users/${userId}`);
        const userSnapshot = await get(userRef);

        if (!userSnapshot.exists()) {
            throw new Error('User not found');
        }

        const userData = userSnapshot.val();
        const now = Date.now();
        const scheduledDeletionAt = now + GRACE_PERIOD_MS;

        // Create deletion record
        const deletionRecord: DeletedUser = {
            userId,
            email: userData.email || 'unknown',
            displayName: userData.displayName || 'Unknown User',
            requestedAt: now,
            scheduledDeletionAt,
            reason,
            status: 'pending'
        };

        // Save to deleted_users collection
        const deletionRef = ref(database, `deleted_users/${userId}`);
        await update(deletionRef, deletionRecord);

        // Mark user as deleted (soft delete)
        await update(userRef, {
            deletionRequested: true,
            deletionRequestedAt: now,
            scheduledDeletionAt,
            updatedAt: now
        });

        console.log(`✅ Deletion requested for user ${userId}, scheduled for ${new Date(scheduledDeletionAt).toISOString()}`);
    } catch (error) {
        console.error('Error requesting deletion:', error);
        throw error;
    }
}

/**
 * Cancel account deletion request
 * User can cancel within 30-day grace period
 * 
 * @param userId - User ID
 * @returns Promise<void>
 */
export async function cancelDeletion(userId: string): Promise<void> {
    try {
        if (!userId) {
            throw new Error('User ID is required');
        }

        // Update user record
        const userRef = ref(database, `users/${userId}`);
        const userSnapshot = await get(userRef);

        if (!userSnapshot.exists()) {
            throw new Error('User not found');
        }

        const userData = userSnapshot.val();

        if (!userData.deletionRequested) {
            throw new Error('No deletion request found for this user');
        }

        // Remove deletion flags from user
        await update(userRef, {
            deletionRequested: false,
            deletionRequestedAt: null,
            scheduledDeletionAt: null,
            updatedAt: Date.now()
        });

        // Update deletion record status
        const deletionRef = ref(database, `deleted_users/${userId}`);
        await update(deletionRef, {
            status: 'cancelled',
            cancelledAt: Date.now()
        });

        console.log(`✅ Deletion cancelled for user ${userId}`);
    } catch (error) {
        console.error('Error cancelling deletion:', error);
        throw error;
    }
}

/**
 * Permanently delete user account and all associated data (ADMIN ONLY)
 * This action is irreversible
 * 
 * @param userId - User ID to permanently delete
 * @param adminId - Admin user ID performing the deletion
 * @returns Promise<void>
 */
export async function hardDelete(
    userId: string,
    adminId: string
): Promise<void> {
    try {
        if (!userId) {
            throw new Error('User ID is required');
        }

        if (!adminId) {
            throw new Error('Admin ID is required');
        }

        // Verify admin permissions (in real implementation, check admin role)
        console.log(`🔒 Admin ${adminId} performing hard delete for user ${userId}`);

        // Delete user data
        const userRef = ref(database, `users/${userId}`);
        await remove(userRef);

        // Delete all test results
        const resultsByStudentRef = ref(database, `test_results_by_student/${userId}`);
        await remove(resultsByStudentRef);

        // Delete academic records
        const academicRecordRef = ref(database, `academic_records/${userId}`);
        await remove(academicRecordRef);

        // Delete badges
        const badgesRef = ref(database, `user_badges/${userId}`);
        await remove(badgesRef);

        // Delete notifications
        const notificationsRef = ref(database, `notifications/${userId}`);
        await remove(notificationsRef);

        // Update deletion record
        const deletionRef = ref(database, `deleted_users/${userId}`);
        await update(deletionRef, {
            status: 'completed',
            completedAt: Date.now(),
            completedBy: adminId
        });

        console.log(`✅ Hard delete completed for user ${userId}`);
    } catch (error) {
        console.error('Error performing hard delete:', error);
        throw error;
    }
}

/**
 * Get all users with pending deletion requests
 * Used by admin panel
 * 
 * @returns Promise<DeletedUser[]>
 */
export async function getDeletedUsers(): Promise<DeletedUser[]> {
    try {
        const deletedUsersRef = ref(database, 'deleted_users');
        const snapshot = await get(deletedUsersRef);

        if (!snapshot.exists()) {
            return [];
        }

        const data = snapshot.val();
        const users: DeletedUser[] = Object.values(data);

        // Sort by requested date (newest first)
        return users.sort((a, b) => b.requestedAt - a.requestedAt);
    } catch (error) {
        console.error('Error getting deleted users:', error);
        return [];
    }
}

/**
 * Get pending deletion requests (status = 'pending')
 * 
 * @returns Promise<DeletedUser[]>
 */
export async function getPendingDeletions(): Promise<DeletedUser[]> {
    try {
        const users = await getDeletedUsers();
        return users.filter(user => user.status === 'pending');
    } catch (error) {
        console.error('Error getting pending deletions:', error);
        return [];
    }
}

/**
 * Scheduled task: Process hard deletes for users past grace period
 * Should be run daily by a scheduled job (e.g., Cloud Functions cron)
 * 
 * @param adminId - System admin ID for audit trail
 * @returns Promise<{ processed: number; failed: number }>
 */
export async function scheduledHardDelete(
    adminId: string = 'system'
): Promise<{ processed: number; failed: number }> {
    try {
        const now = Date.now();
        const pendingDeletions = await getPendingDeletions();

        let processed = 0;
        let failed = 0;

        for (const deletion of pendingDeletions) {
            // Check if grace period has expired
            if (deletion.scheduledDeletionAt <= now) {
                try {
                    await hardDelete(deletion.userId, adminId);
                    processed++;
                    console.log(`✅ Auto-deleted user ${deletion.userId} (grace period expired)`);
                } catch (error) {
                    failed++;
                    console.error(`❌ Failed to auto-delete user ${deletion.userId}:`, error);
                }
            }
        }

        console.log(`🗑️ Scheduled deletion completed: ${processed} processed, ${failed} failed`);
        return { processed, failed };
    } catch (error) {
        console.error('Error in scheduled hard delete:', error);
        return { processed: 0, failed: 0 };
    }
}

/**
 * Check if user has pending deletion
 * 
 * @param userId - User ID to check
 * @returns Promise<boolean>
 */
export async function hasPendingDeletion(userId: string): Promise<boolean> {
    try {
        const userRef = ref(database, `users/${userId}`);
        const snapshot = await get(userRef);

        if (!snapshot.exists()) {
            return false;
        }

        const userData = snapshot.val();
        return userData.deletionRequested === true;
    } catch (error) {
        console.error('Error checking pending deletion:', error);
        return false;
    }
}

/**
 * Get days remaining until permanent deletion
 * 
 * @param userId - User ID
 * @returns Promise<number | null> - Days remaining, or null if no deletion pending
 */
export async function getDaysUntilDeletion(userId: string): Promise<number | null> {
    try {
        const userRef = ref(database, `users/${userId}`);
        const snapshot = await get(userRef);

        if (!snapshot.exists()) {
            return null;
        }

        const userData = snapshot.val();

        if (!userData.deletionRequested || !userData.scheduledDeletionAt) {
            return null;
        }

        const now = Date.now();
        const remaining = userData.scheduledDeletionAt - now;

        if (remaining <= 0) {
            return 0;
        }

        return Math.ceil(remaining / (24 * 60 * 60 * 1000));
    } catch (error) {
        console.error('Error getting days until deletion:', error);
        return null;
    }
}
