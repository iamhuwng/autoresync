/**
 * useTeacherAccess Hook
 * PRD-0016: Solo Study & Homework System - Phase 5
 * 
 * Verifies and manages teacher access to student data.
 * Handles:
 * - Access verification on each request
 * - Immediate access revocation on unassignment
 * - Caching for performance
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { isStudentAssignedToTeacher, getAssignmentsByTeacher, subscribeToAssignments } from '../services/assignmentManager';
import type { StudentTeacherAssignment } from '../types/assignment.types';

// ============================================================================
// TYPES
// ============================================================================

interface UseTeacherAccessOptions {
    /** Teacher ID */
    teacherId: string;
    /** Enable real-time subscription to assignment changes */
    realtime?: boolean;
    /** Cache TTL in milliseconds (default: 60000) */
    cacheTTL?: number;
}

interface UseTeacherAccessReturn {
    /** Check if teacher has access to a specific student */
    hasAccessTo: (studentId: string) => Promise<boolean>;
    /** List of assigned student IDs */
    assignedStudentIds: string[];
    /** Full assignment data */
    assignments: StudentTeacherAssignment[];
    /** Loading state */
    isLoading: boolean;
    /** Error message if any */
    error: string | null;
    /** Refresh assignments */
    refresh: () => Promise<void>;
    /** Check if access was revoked (for UI notification) */
    wasAccessRevoked: boolean;
    /** Clear the access revoked flag */
    clearRevokedFlag: () => void;
}

// ============================================================================
// ACCESS CACHE
// ============================================================================

interface AccessCacheEntry {
    hasAccess: boolean;
    timestamp: number;
}

const accessCache = new Map<string, AccessCacheEntry>();

const getCacheKey = (teacherId: string, studentId: string) =>
    `${teacherId}:${studentId}`;

const getCachedAccess = (
    teacherId: string,
    studentId: string,
    ttl: number
): boolean | null => {
    const key = getCacheKey(teacherId, studentId);
    const entry = accessCache.get(key);

    if (!entry) return null;

    // Check if cache is still valid
    if (Date.now() - entry.timestamp > ttl) {
        accessCache.delete(key);
        return null;
    }

    return entry.hasAccess;
};

const setCachedAccess = (
    teacherId: string,
    studentId: string,
    hasAccess: boolean
): void => {
    const key = getCacheKey(teacherId, studentId);
    accessCache.set(key, {
        hasAccess,
        timestamp: Date.now()
    });
};

const invalidateCacheForTeacher = (teacherId: string): void => {
    const keysToDelete: string[] = [];
    accessCache.forEach((_, key) => {
        if (key.startsWith(`${teacherId}:`)) {
            keysToDelete.push(key);
        }
    });
    keysToDelete.forEach(key => accessCache.delete(key));
};

// ============================================================================
// HOOK
// ============================================================================

/**
 * Hook for managing teacher access to student data
 */
export function useTeacherAccess({
    teacherId,
    realtime = true,
    cacheTTL = 60000 // 1 minute default
}: UseTeacherAccessOptions): UseTeacherAccessReturn {
    const [assignments, setAssignments] = useState<StudentTeacherAssignment[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [wasAccessRevoked, setWasAccessRevoked] = useState(false);

    // Track previous assignments to detect revocations
    const previousAssignmentsRef = useRef<Set<string>>(new Set());

    /**
     * Fetch assignments
     */
    const fetchAssignments = useCallback(async () => {
        if (!teacherId) return;

        setIsLoading(true);
        setError(null);

        try {
            const newAssignments = await getAssignmentsByTeacher(teacherId);

            // Check for revoked access
            const newStudentIds = new Set(newAssignments.map(a => a.studentId));
            const previousIds = previousAssignmentsRef.current;

            // If we had assignments before and some are now missing
            if (previousIds.size > 0) {
                previousIds.forEach(studentId => {
                    if (!newStudentIds.has(studentId)) {
                        // Access was revoked for this student
                        setWasAccessRevoked(true);
                        // Invalidate cache for this student
                        accessCache.delete(getCacheKey(teacherId, studentId));
                        console.log(`Access revoked for student ${studentId}`);
                    }
                });
            }

            // Update previous assignments
            previousAssignmentsRef.current = newStudentIds;

            // Invalidate all cache entries for this teacher (to ensure freshness)
            invalidateCacheForTeacher(teacherId);

            setAssignments(newAssignments);
        } catch (err) {
            console.error('Error fetching assignments:', err);
            setError(err instanceof Error ? err.message : 'Failed to fetch assignments');
        } finally {
            setIsLoading(false);
        }
    }, [teacherId]);

    /**
     * Initial fetch and real-time subscription
     */
    useEffect(() => {
        fetchAssignments();

        if (realtime && teacherId) {
            // Subscribe to assignment changes
            const unsubscribe = subscribeToAssignments(teacherId, (newAssignments) => {
                // Check for revoked access
                const newStudentIds = new Set(newAssignments.map(a => a.studentId));
                const previousIds = previousAssignmentsRef.current;

                if (previousIds.size > 0) {
                    previousIds.forEach(studentId => {
                        if (!newStudentIds.has(studentId)) {
                            setWasAccessRevoked(true);
                            accessCache.delete(getCacheKey(teacherId, studentId));
                        }
                    });
                }

                previousAssignmentsRef.current = newStudentIds;
                invalidateCacheForTeacher(teacherId);
                setAssignments(newAssignments);
            });

            return unsubscribe;
        }
    }, [teacherId, realtime, fetchAssignments]);

    /**
     * Check if teacher has access to a specific student
     */
    const hasAccessTo = useCallback(async (studentId: string): Promise<boolean> => {
        if (!teacherId || !studentId) return false;

        // Check cache first
        const cached = getCachedAccess(teacherId, studentId, cacheTTL);
        if (cached !== null) {
            return cached;
        }

        // Check from current assignments (if available)
        const localCheck = assignments.some(a => a.studentId === studentId);
        if (localCheck) {
            setCachedAccess(teacherId, studentId, true);
            return true;
        }

        // If not found locally, verify from database
        try {
            const hasAccess = await isStudentAssignedToTeacher(studentId, teacherId);
            setCachedAccess(teacherId, studentId, hasAccess);
            return hasAccess;
        } catch (err) {
            console.error('Error checking access:', err);
            return false;
        }
    }, [teacherId, assignments, cacheTTL]);

    /**
     * Clear access revoked flag
     */
    const clearRevokedFlag = useCallback(() => {
        setWasAccessRevoked(false);
    }, []);

    /**
     * Manual refresh
     */
    const refresh = useCallback(async () => {
        await fetchAssignments();
    }, [fetchAssignments]);

    return {
        hasAccessTo,
        assignedStudentIds: assignments.map(a => a.studentId),
        assignments,
        isLoading,
        error,
        refresh,
        wasAccessRevoked,
        clearRevokedFlag
    };
}

export default useTeacherAccess;
