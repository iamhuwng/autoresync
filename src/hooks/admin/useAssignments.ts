/**
 * useAssignments Hook
 * 
 * Manages student-teacher assignments with optimized batch loading.
 * Uses the getAllAssignments() batch method to eliminate N+1 query problems.
 * 
 * @example
 * const assignments = useAssignments();
 * 
 * useEffect(() => {
 *   assignments.loadAssignments();
 * }, []);
 * 
 * // Check if a student is assigned
 * const hasTeacher = assignments.isStudentAssigned('student-uid-123');
 * 
 * // Get student's assignments
 * const studentAssignments = assignments.getStudentAssignments('student-uid-123');
 */

import { useState, useCallback, useRef } from 'react';
import {
    getAllAssignments,
    getAssignmentsByTeacher,
    removeAssignment as removeAssignmentService
} from '../../services/assignmentManager';
import type { UseAssignmentsReturn, LoadAssignmentsOptions } from '../../types/admin.types';
import type { StudentTeacherAssignment } from '../../types/assignment.types';

export interface UseAssignmentsOptions {
    /**
     * When set, only this teacher's active assignments are loaded (one indexed
     * query) instead of every assignment in the system. Teacher-facing pages
     * must pass their own uid here.
     */
    teacherId?: string | null;
}

const groupAssignments = (all: StudentTeacherAssignment[]) => {
    const byStudent: Record<string, StudentTeacherAssignment[]> = {};
    const byTeacher: Record<string, StudentTeacherAssignment[]> = {};
    all.forEach((assignment) => {
        (byStudent[assignment.studentId] ||= []).push(assignment);
        (byTeacher[assignment.teacherId] ||= []).push(assignment);
    });
    return { byStudent, byTeacher };
};

export function useAssignments(options: UseAssignmentsOptions = {}): UseAssignmentsReturn {
    const teacherId = options.teacherId ?? null;
    const [assignments, setAssignments] = useState<StudentTeacherAssignment[]>([]);
    const [assignmentsByStudent, setAssignmentsByStudent] = useState<Record<string, StudentTeacherAssignment[]>>({});
    const [assignmentsByTeacher, setAssignmentsByTeacher] = useState<Record<string, StudentTeacherAssignment[]>>({});
    const [loading, setLoading] = useState(false);

    // Cache marker lives in a ref so callers never read a stale closure value.
    // (Previously the cache check read `assignmentsByStudent` state, so a reload
    // right after a release/approve was silently skipped and the list went stale.)
    const loadedScopeRef = useRef<string | null>(null);
    const requestIdRef = useRef(0);

    // ============================================================================
    // LOAD ASSIGNMENTS
    // ============================================================================

    const loadAssignments = useCallback(async (loadOptions: LoadAssignmentsOptions = {}) => {
        const scope = teacherId ? `teacher:${teacherId}` : 'all';
        if (!loadOptions.force && loadedScopeRef.current === scope) {
            return;
        }

        const requestId = ++requestIdRef.current;
        setLoading(true);
        try {
            let all: StudentTeacherAssignment[];
            let byStudent: Record<string, StudentTeacherAssignment[]>;
            let byTeacher: Record<string, StudentTeacherAssignment[]>;

            if (teacherId) {
                all = await getAssignmentsByTeacher(teacherId);
                ({ byStudent, byTeacher } = groupAssignments(all));
            } else {
                ({ all, byStudent, byTeacher } = await getAllAssignments());
            }

            if (requestId !== requestIdRef.current) return; // superseded by a newer load
            setAssignments(all);
            setAssignmentsByStudent(byStudent);
            setAssignmentsByTeacher(byTeacher);
            loadedScopeRef.current = scope;
        } catch (err) {
            console.error('Error loading assignments:', err);
            if (requestId !== requestIdRef.current) return;
            // Assignments are supplementary data - keep the UI usable.
            setAssignments([]);
            setAssignmentsByStudent({});
            setAssignmentsByTeacher({});
            loadedScopeRef.current = null;
        } finally {
            if (requestId === requestIdRef.current) {
                setLoading(false);
            }
        }
    }, [teacherId]);

    // ============================================================================
    // REMOVE ASSIGNMENT
    // ============================================================================

    const removeAssignment = useCallback(async (assignmentId: string, reason?: string): Promise<void> => {
        try {
            const result = await removeAssignmentService(assignmentId, reason);

            if (!result.success) {
                throw new Error(result.error || 'Failed to remove assignment');
            }

            await loadAssignments({ force: true });
        } catch (err) {
            console.error('Error removing assignment:', err);
            throw err;
        }
    }, [loadAssignments]);

    // ============================================================================
    // HELPER FUNCTIONS
    // ============================================================================

    const getStudentAssignments = useCallback((studentId: string): StudentTeacherAssignment[] => {
        return assignmentsByStudent[studentId] || [];
    }, [assignmentsByStudent]);

    const getTeacherAssignments = useCallback((teacherId: string): StudentTeacherAssignment[] => {
        return assignmentsByTeacher[teacherId] || [];
    }, [assignmentsByTeacher]);

    const isStudentAssigned = useCallback((studentId: string): boolean => {
        const studentAssignments = assignmentsByStudent[studentId] || [];
        return studentAssignments.length > 0;
    }, [assignmentsByStudent]);

    // ============================================================================
    // RETURN
    // ============================================================================

    return {
        assignments,
        assignmentsByStudent,
        assignmentsByTeacher,
        loading,
        loadAssignments,
        removeAssignment,
        getStudentAssignments,
        getTeacherAssignments,
        isStudentAssigned
    };
}
