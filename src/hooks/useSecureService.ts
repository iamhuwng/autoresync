/**
 * useSecureService Hook
 * 
 * Provides a secure auth context for service layer operations.
 * Part of RBAC Security Hardening (PRD-0016).
 * 
 * This hook builds a SecurityAuthContext from the current user's auth state,
 * which can be passed to services for role-based access validation.
 * 
 * @security All sensitive service calls should use this context
 */

import { useMemo, useState, useEffect } from 'react';
import { useAuth } from './useAuth';
import { SecurityAuthContext, UserRole } from '../types/security.types';
import { getAssignmentsByTeacher, getAssignmentsByStudent } from '../services/assignmentManager';

/**
 * Hook result interface
 */
export interface UseSecureServiceResult {
    /** The auth context for passing to services */
    authContext: SecurityAuthContext | null;
    /** Whether the context is still loading */
    loading: boolean;
    /** Error message if context creation failed */
    error: string | null;
    /** Whether user is authenticated and has valid context */
    isAuthenticated: boolean;
    /** Current user's role */
    userRole: UserRole | null;
    /** Current user's ID */
    userId: string | null;
}

/**
 * Hook that builds a SecurityAuthContext from the current auth state.
 * 
 * The context includes:
 * - User ID and role
 * - Active role (for multi-role switching)
 * - Assignment IDs for ownership checks
 * - User status (active/blocked)
 * 
 * @example
 * ```tsx
 * const { authContext, loading, error } = useSecureService();
 * 
 * if (loading) return <Loader />;
 * if (!authContext) return <AccessDenied />;
 * 
 * // Pass to service that requires auth
 * const data = await getUserData(userId, authContext);
 * ```
 */
export const useSecureService = (): UseSecureServiceResult => {
    const { user, profile, loading: authLoading } = useAuth();
    const [assignedStudentIds, setAssignedStudentIds] = useState<string[]>([]);
    const [assignedTeacherIds, setAssignedTeacherIds] = useState<string[]>([]);
    const [assignmentsLoading, setAssignmentsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Load assignments when user changes
    useEffect(() => {
        if (!user?.uid || !profile?.role) {
            setAssignedStudentIds([]);
            setAssignedTeacherIds([]);
            return;
        }

        const loadAssignments = async () => {
            setAssignmentsLoading(true);
            setError(null);

            try {
                if (profile.role === 'teacher' || profile.role === 'super_admin') {
                    // Teachers need to know their assigned students
                    const assignments = await getAssignmentsByTeacher(user.uid);
                    setAssignedStudentIds(assignments.map(a => a.studentId));
                }

                if (profile.role === 'student') {
                    // Students need to know their assigned teachers
                    const assignments = await getAssignmentsByStudent(user.uid);
                    setAssignedTeacherIds(assignments.map(a => a.teacherId));
                }
            } catch (err) {
                console.error('[useSecureService] Failed to load assignments:', err);
                setError('Failed to load user assignments');
            } finally {
                setAssignmentsLoading(false);
            }
        };

        loadAssignments();
    }, [user?.uid, profile?.role]);

    // Build the auth context
    const authContext = useMemo<SecurityAuthContext | null>(() => {
        if (!user?.uid || !profile?.role) {
            return null;
        }

        const userRole = profile.role as UserRole;

        // Get active role from session storage, fallback to profile role
        const storedActiveRole = typeof window !== 'undefined'
            ? sessionStorage.getItem('activeRole') as UserRole | null
            : null;
        const activeRole = storedActiveRole || userRole;

        // Build roles array
        const roles: UserRole[] = profile.roles
            ? (profile.roles as UserRole[])
            : [userRole];

        return {
            userId: user.uid,
            userRole,
            activeRole,
            roles,
            assignedStudentIds: assignedStudentIds.length > 0 ? assignedStudentIds : undefined,
            assignedTeacherIds: assignedTeacherIds.length > 0 ? assignedTeacherIds : undefined,
            isActive: profile.status !== 'blocked',
        };
    }, [user?.uid, profile, assignedStudentIds, assignedTeacherIds]);

    const loading = authLoading || assignmentsLoading;
    const isAuthenticated = !!user && !!profile && !!authContext;
    const userRole = profile?.role as UserRole | null;
    const userId = user?.uid || null;

    return {
        authContext,
        loading,
        error,
        isAuthenticated,
        userRole,
        userId,
    };
};

/**
 * Type guard to check if auth context is valid
 */
export const isValidAuthContext = (ctx: SecurityAuthContext | null): ctx is SecurityAuthContext => {
    return ctx !== null && !!ctx.userId && !!ctx.userRole;
};

export default useSecureService;
