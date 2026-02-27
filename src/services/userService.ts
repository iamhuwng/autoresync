import { ref, get, update, remove, query, orderByChild, equalTo } from 'firebase/database';
import { database } from './firebase';
import { SecurityAuthContext } from '../types/security.types';
import { validateAdminAccess, validateTeacherAccess, assertAccess } from './securityMiddleware';
import { getAssignmentsByTeacher } from './assignmentManager';
import { logDelete, logSecurityEvent } from './auditService';

export interface UserProfile {
    uid: string;
    email: string;
    displayName: string;
    role: 'student' | 'teacher' | 'super_admin';
    status?: 'active' | 'blocked';
    studentGroup?: string; // For categorization
    createdAt?: number;
    lastLoginAt?: number;
    photoURL?: string;
    preferences?: {
        notifications?: {
            emailResults?: boolean;
            weeklyReport?: boolean;
            teacherAlerts?: boolean;
        };
    };
    [key: string]: any;
}

/**
 * @deprecated Use getAllUsersSecure() which requires admin auth context
 * This function is kept for backward compatibility but should be migrated
 */
export const getAllUsers = async (): Promise<UserProfile[]> => {
    console.warn('[Security] getAllUsers() called without auth context. Migrate to getAllUsersSecure()');
    const usersRef = ref(database, 'users');
    const snapshot = await get(usersRef);

    if (snapshot.exists()) {
        const data = snapshot.val();
        // Map Firebase keys (UIDs) into user objects to ensure uid is always present
        return Object.entries(data).map(([key, value]: [string, any]) => ({
            ...value,
            uid: value.uid || key // Use stored uid or fallback to Firebase key
        }));
    }
    return [];
};

/**
 * Get all users (super_admin only)
 * PRD-0016 Task 3.11: Requires admin auth context
 * 
 * @param authContext - Security context from useSecureService
 * @throws Error if not super_admin
 */
export const getAllUsersSecure = async (
    authContext: SecurityAuthContext | null
): Promise<UserProfile[]> => {
    // Validate admin access
    const validation = validateAdminAccess(authContext);
    assertAccess(validation);

    const usersRef = ref(database, 'users');
    const snapshot = await get(usersRef);

    if (snapshot.exists()) {
        const data = snapshot.val();
        // Map Firebase keys (UIDs) into user objects to ensure uid is always present
        return Object.entries(data).map(([key, value]: [string, any]) => ({
            ...value,
            uid: value.uid || key // Use stored uid or fallback to Firebase key
        }));
    }
    return [];
};

/**
 * Get students assigned to a specific teacher
 * PRD-0016 Task 3.12: Role-appropriate alternative to getAllUsers
 * 
 * @param authContext - Security context from useSecureService
 * @param teacherId - Optional teacher ID (defaults to current user)
 * @returns Students assigned to the teacher
 */
export const getTeacherStudents = async (
    authContext: SecurityAuthContext | null,
    teacherId?: string
): Promise<UserProfile[]> => {
    // Validate teacher access
    const validation = validateTeacherAccess(authContext);
    assertAccess(validation);

    // Use provided teacherId or current user
    const targetTeacherId = teacherId || authContext!.userId;

    // Get assignments for this teacher
    const assignments = await getAssignmentsByTeacher(targetTeacherId);
    const studentIds = assignments.map(a => a.studentId);

    if (studentIds.length === 0) {
        return [];
    }

    // Fetch student profiles
    const students: UserProfile[] = [];
    for (const studentId of studentIds) {
        const profile = await getUserById(studentId);
        if (profile) {
            students.push(profile);
        }
    }

    return students;
};

export const getUsersByRole = async (role: string): Promise<UserProfile[]> => {
    const usersRef = ref(database, 'users');
    const roleQuery = query(usersRef, orderByChild('role'), equalTo(role));
    const snapshot = await get(roleQuery);

    if (snapshot.exists()) {
        const data = snapshot.val();
        // Map Firebase keys (UIDs) into user objects to ensure uid is always present
        return Object.entries(data).map(([key, value]: [string, any]) => ({
            ...value,
            uid: value.uid || key
        }));
    }
    return [];
};

export const getUserByEmail = async (email: string): Promise<UserProfile | null> => {
    const usersRef = ref(database, 'users');
    const emailQuery = query(usersRef, orderByChild('email'), equalTo(email));
    const snapshot = await get(emailQuery);

    if (snapshot.exists()) {
        const data = snapshot.val();
        // Return the first match with uid included (emails should be unique)
        const entries = Object.entries(data);
        if (entries.length > 0) {
            const [key, value] = entries[0] as [string, any];
            return { ...value, uid: value.uid || key };
        }
    }
    return null;
};

export const getUserById = async (uid: string): Promise<UserProfile | null> => {
    const userRef = ref(database, `users/${uid}`);
    const snapshot = await get(userRef);

    if (snapshot.exists()) {
        const data = snapshot.val();
        // Ensure uid is always present in the returned object
        return { ...data, uid: data.uid || uid };
    }
    return null;
};

/**
 * Update user profile
 * Note: For role/status changes, use updateUserProfileSecure() or updateUserRole()
 */
export const updateUserProfile = async (uid: string, updates: Partial<UserProfile>): Promise<void> => {
    const userRef = ref(database, `users/${uid}`);
    await update(userRef, updates);
};

/**
 * Update user profile with forceReauth for sensitive changes
 * PRD-0016 Task 5.5: Set forceReauth on role change
 * 
 * @param uid - User ID to update
 * @param updates - Profile updates
 * @param triggersReauth - Whether to force re-authentication
 */
export const updateUserProfileSecure = async (
    uid: string,
    updates: Partial<UserProfile>,
    triggersReauth: boolean = false
): Promise<void> => {
    const userRef = ref(database, `users/${uid}`);

    // Check if this is a sensitive change
    const sensitiveFields = ['role', 'status'];
    const hasSensitiveChange = Object.keys(updates).some(key => sensitiveFields.includes(key));

    // Set forceReauth if sensitive change or explicitly requested
    const finalUpdates = {
        ...updates,
        ...(hasSensitiveChange || triggersReauth ? { forceReauth: true } : {})
    };

    await update(userRef, finalUpdates);
    console.log(`[Security] Updated user ${uid}`, { updates, forceReauth: hasSensitiveChange || triggersReauth });
};

/**
 * Update user role with forced re-authentication
 * PRD-0016 Task 5.5: Always sets forceReauth on role change
 * Task 6.5: Audit logging for role changes
 */
export const updateUserRole = async (
    uid: string,
    newRole: 'student' | 'teacher' | 'super_admin',
    authContext?: SecurityAuthContext | null
): Promise<void> => {
    // Get old role for audit log
    const oldProfile = await getUserById(uid);
    const oldRole = oldProfile?.role || 'unknown';

    const userRef = ref(database, `users/${uid}`);
    await update(userRef, {
        role: newRole,
        forceReauth: true,
        roleUpdatedAt: Date.now()
    });

    // Log role change event (Task 6.5)
    if (authContext) {
        logSecurityEvent.roleChange(authContext, uid, oldRole as any, newRole);
    }

    console.log(`[Security] Updated user ${uid} role to ${newRole}, forceReauth set`);
};

/**
 * Delete user profile
 * Task 6.5: Audit logging for deletions
 */
export const deleteUserProfile = async (
    uid: string,
    authContext?: SecurityAuthContext | null
): Promise<void> => {
    const userRef = ref(database, `users/${uid}`);
    await remove(userRef);

    // Log deletion event (Task 6.5)
    if (authContext) {
        logDelete(authContext, 'user', uid, { action: 'profile_deleted' });
    }
};

/**
 * Toggle user status (active/blocked)
 * PRD-0016 Task 5.6: Sets forceReauth when blocking user
 * Task 6.5: Audit logging for status changes
 */
export const toggleUserStatus = async (
    uid: string,
    currentStatus: string,
    authContext?: SecurityAuthContext | null
): Promise<void> => {
    const newStatus = currentStatus === 'blocked' ? 'active' : 'blocked';
    const userRef = ref(database, `users/${uid}`);

    // Set forceReauth when blocking to trigger immediate logout
    await update(userRef, {
        status: newStatus,
        forceReauth: newStatus === 'blocked', // Only force reauth when blocking
        statusUpdatedAt: Date.now()
    });

    // Log status change event (Task 6.5)
    if (authContext) {
        logSecurityEvent.statusChange(authContext, uid, currentStatus, newStatus);
    }

    console.log(`[Security] Toggled user ${uid} status to ${newStatus}`);
};

/**
 * Block a user with immediate session termination
 * PRD-0016 Task 5.6, 5.7: Blocking triggers forceReauth for immediate logout
 * Task 6.5: Audit logging for blocks
 */
export const blockUser = async (
    uid: string,
    reason?: string,
    authContext?: SecurityAuthContext | null
): Promise<void> => {
    const userRef = ref(database, `users/${uid}`);
    await update(userRef, {
        status: 'blocked',
        forceReauth: true, // Trigger immediate logout
        blockedAt: Date.now(),
        blockedReason: reason || 'Blocked by administrator'
    });

    // Log block event (Task 6.5)
    if (authContext) {
        logSecurityEvent.statusChange(authContext, uid, 'active', 'blocked', reason);
    }

    console.log(`[Security] Blocked user ${uid}`);
};

/**
 * Unblock a user
 * Task 6.5: Audit logging for unblocks
 */
export const unblockUser = async (
    uid: string,
    authContext?: SecurityAuthContext | null
): Promise<void> => {
    const userRef = ref(database, `users/${uid}`);
    await update(userRef, {
        status: 'active',
        forceReauth: false,
        unblockedAt: Date.now()
    });

    // Log unblock event (Task 6.5)
    if (authContext) {
        logSecurityEvent.statusChange(authContext, uid, 'blocked', 'active', 'User unblocked');
    }

    console.log(`[Security] Unblocked user ${uid}`);
};

export const updateUserGroup = async (uid: string, group: string): Promise<void> => {
    await updateUserProfile(uid, { studentGroup: group });
};

