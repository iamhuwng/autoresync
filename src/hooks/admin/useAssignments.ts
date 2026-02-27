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

import { useState, useCallback } from 'react';
import {
    getAllAssignments,
    removeAssignment as removeAssignmentService
} from '../../services/assignmentManager';
import type { UseAssignmentsReturn } from '../../types/admin.types';
import type { StudentTeacherAssignment } from '../../types/assignment.types';

export function useAssignments(): UseAssignmentsReturn {
    const [assignments, setAssignments] = useState<StudentTeacherAssignment[]>([]);
    const [assignmentsByStudent, setAssignmentsByStudent] = useState<Record<string, StudentTeacherAssignment[]>>({});
    const [assignmentsByTeacher, setAssignmentsByTeacher] = useState<Record<string, StudentTeacherAssignment[]>>({});
    const [loading, setLoading] = useState(false);

    // ============================================================================
    // LOAD ASSIGNMENTS (BATCH - NO N+1!)
    // ============================================================================

    const loadAssignments = useCallback(async () => {
        // Avoid reloading if already populated
        if (Object.keys(assignmentsByStudent).length > 0) {
            console.log('📦 [useAssignments] Assignments already loaded, skipping...');
            return;
        }

        setLoading(true);
        try {
            console.log('🏫 [useAssignments] Loading assignments... (BATCH MODE - NO N+1!)');

            // FIXED: Use batch method instead of N+1 queries
            // Before: 100 students = 100+ Firestore calls
            // After: 1 Firestore call total
            const { all, byStudent, byTeacher } = await getAllAssignments();

            setAssignments(all);
            setAssignmentsByStudent(byStudent);
            setAssignmentsByTeacher(byTeacher);

            console.log(`✅ [useAssignments] Assignments loaded: ${all.length} total (1 query)`);
        } catch (err) {
            console.error('Error loading assignments:', err);
            // Don't throw - assignments are supplementary data
            // Set empty state to allow UI to continue
            setAssignments([]);
            setAssignmentsByStudent({});
            setAssignmentsByTeacher({});
        } finally {
            setLoading(false);
        }
    }, [assignmentsByStudent]);

    // ============================================================================
    // REMOVE ASSIGNMENT
    // ============================================================================

    const removeAssignment = useCallback(async (assignmentId: string, reason?: string): Promise<void> => {
        try {
            const result = await removeAssignmentService(assignmentId, reason);

            if (!result.success) {
                throw new Error(result.error || 'Failed to remove assignment');
            }

            // Reload assignments after removal
            // Clear the cache first to force reload
            setAssignmentsByStudent({});
            await loadAssignments();
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
