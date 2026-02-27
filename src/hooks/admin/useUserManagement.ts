/**
 * useUserManagement Hook
 * 
 * Manages user data, filtering, and actions for the admin user management page.
 * Handles loading, searching, filtering, updating, and deleting users.
 * 
 * @param options - Configuration options for user management
 * 
 * @example
 * const userManagement = useUserManagement({
 *   activeTab: 'students',
 *   assignmentsByStudent: assignments.assignmentsByStudent,
 *   filterByTeacherId: null
 * });
 * 
 * useEffect(() => {
 *   userManagement.loadUsers();
 * }, []);
 * 
 * // Filter users
 * userManagement.setSearchTerm('john');
 * userManagement.setAssignmentFilter('assigned');
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
    getAllUsersSecure,
    getTeacherStudents,
    updateUserProfile,
    deleteUserProfile,
    UserProfile
} from '../../services/userService';
import { useSecureService } from '../useSecureService';
import type { UseUserManagementReturn, AssignmentFilter, AdminTab } from '../../types/admin.types';
import type { StudentTeacherAssignment } from '../../types/assignment.types';

interface UseUserManagementOptions {
    activeTab: AdminTab;
    assignmentsByStudent: Record<string, StudentTeacherAssignment[]>;
    filterByTeacherId: string | null;
}

export function useUserManagement(options: UseUserManagementOptions): UseUserManagementReturn {
    const { activeTab, assignmentsByStudent, filterByTeacherId } = options;
    const { authContext } = useSecureService();

    const [users, setUsers] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [assignmentFilter, setAssignmentFilter] = useState<AssignmentFilter>('all');

    // ============================================================================
    // LOAD USERS (ROLE-BASED)
    // ============================================================================

    const loadUsers = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            // PRD-0016 Task 3.12: Use role-appropriate service
            // Teachers get only their students, admins get all users
            const userRole = authContext?.activeRole;
            let allUsers: UserProfile[];

            if (userRole === 'super_admin') {
                // Admin can see all users
                allUsers = await getAllUsersSecure(authContext);
            } else if (userRole === 'teacher') {
                // Teachers only see their assigned students
                // getTeacherStudents already validates teacher access internally
                allUsers = await getTeacherStudents(authContext);
            } else {
                throw new Error(`Invalid role for user management: ${userRole}`);
            }

            // Sort by creation time desc
            allUsers.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            setUsers(allUsers);
        } catch (err) {
            console.error('Error loading users:', err);
            setError('Failed to load users');
        } finally {
            setLoading(false);
        }
    }, [authContext]);

    // ============================================================================
    // FILTER USERS (MEMOIZED)
    // ============================================================================

    const filteredUsers = useMemo(() => {
        console.log('🔄 [useUserManagement] Filtering triggered:', {
            userCount: users.length,
            activeTab,
            filterByTeacherId,
            assignmentsLoaded: Object.keys(assignmentsByStudent).length
        });

        let result = users;

        // Filter by Tab (Role)
        if (activeTab === 'students') {
            result = result.filter(u => u.role === 'student');

            // Filter by Teacher (if teacherId is provided from navigation)
            if (filterByTeacherId) {
                result = result.filter(u => {
                    const studentAssignments = assignmentsByStudent[u.uid] || [];
                    // Only show students assigned to this specific teacher
                    return studentAssignments.some(assignment => assignment.teacherId === filterByTeacherId);
                });
            }

            // Filter by Assignment Status (only for students tab)
            if (assignmentFilter === 'assigned') {
                result = result.filter(u => {
                    const studentAssignments = assignmentsByStudent[u.uid] || [];
                    return studentAssignments.length > 0;
                });
            } else if (assignmentFilter === 'unassigned') {
                result = result.filter(u => {
                    const studentAssignments = assignmentsByStudent[u.uid] || [];
                    return studentAssignments.length === 0;
                });
            }
        } else if (activeTab === 'teachers') {
            result = result.filter(u => u.role === 'teacher' || u.role === 'super_admin');
        }

        // Filter by Search
        if (searchTerm) {
            const lowerSearch = searchTerm.toLowerCase();
            result = result.filter(u =>
                (u.displayName || '').toLowerCase().includes(lowerSearch) ||
                (u.email || '').toLowerCase().includes(lowerSearch) ||
                ((u as any).studentGroup || '').toLowerCase().includes(lowerSearch)
            );
        }

        return result;
    }, [users, searchTerm, activeTab, assignmentFilter, assignmentsByStudent, filterByTeacherId]);

    // ============================================================================
    // UPDATE USER
    // ============================================================================

    const updateUser = useCallback(async (userId: string, updates: Partial<UserProfile>): Promise<void> => {
        try {
            await updateUserProfile(userId, updates as any);
            setSuccessMessage('User updated successfully');
            // Reload users after update
            await loadUsers();
        } catch (err) {
            console.error('Error updating user:', err);
            setError('Failed to update user');
            throw err;
        }
    }, [loadUsers]);

    // ============================================================================
    // DELETE USER
    // ============================================================================

    const deleteUser = useCallback(async (userId: string): Promise<void> => {
        try {
            await deleteUserProfile(userId);
            setSuccessMessage('User deleted successfully');
            // Reload users after deletion
            await loadUsers();
        } catch (err) {
            console.error('Error deleting user:', err);
            setError('Failed to delete user');
            throw err;
        }
    }, [loadUsers]);

    // ============================================================================
    // CLEAR MESSAGES
    // ============================================================================

    const clearMessages = useCallback(() => {
        setError(null);
        setSuccessMessage(null);
    }, []);

    // ============================================================================
    // AUTO-CLEAR MESSAGES AFTER 5 SECONDS
    // ============================================================================

    useEffect(() => {
        if (error || successMessage) {
            const timer = setTimeout(clearMessages, 5000);
            return () => clearTimeout(timer);
        }
        return undefined;
    }, [error, successMessage, clearMessages]);

    // ============================================================================
    // RETURN
    // ============================================================================

    return {
        users,
        filteredUsers,
        loading,
        error,
        successMessage,
        setError,
        setSuccessMessage,
        searchTerm,
        setSearchTerm,
        assignmentFilter,
        setAssignmentFilter,
        filterByTeacherId,
        setFilterByTeacherId: () => { return; }, // Controlled externally via options
        loadUsers,
        updateUser,
        deleteUser,
        clearMessages
    };
}
