/**
 * StudentGrid Component
 * 
 * Grid layout for displaying multiple StudentCard components.
 * Handles responsive layout and empty states.
 * 
 * @example
 * <StudentGrid
 *   students={filteredStudents}
 *   assignments={assignmentsByStudent}
 *   teachers={allTeachers}
 *   onViewAnalytics={(id) => navigate(...)}
 *   onEdit={handleEdit}
 *   onAssignToTeacher={handleAssign}
 *   onRelease={handleRelease}
 *   onAddToClass={handleAddToClass}
 *   isSuperAdmin={true}
 *   isTeacher={false}
 * />
 */

import { StudentCard } from './StudentCard';
import type { UserProfile } from '../../services/userService';
import type { StudentTeacherAssignment } from '../../types/assignment.types';

export interface StudentGridProps {
    students: UserProfile[];
    assignments: Record<string, StudentTeacherAssignment[]>;
    teachers: UserProfile[];

    // Actions (passed to StudentCard)
    onViewAnalytics: (studentId: string) => void;
    onEdit: (student: UserProfile) => void;
    onAssignToTeacher?: (student: UserProfile) => void;
    onRelease: (student: UserProfile) => void;
    onAddToClass?: (student: UserProfile) => void;

    // Permissions
    isSuperAdmin?: boolean;
    isTeacher?: boolean;
}

const CARD_VARIANTS: Array<'lavender' | 'sky' | 'mint' | 'rose' | 'peach'> = [
    'lavender',
    'sky',
    'mint',
    'rose',
    'peach'
];

export function StudentGrid({
    students,
    assignments,
    teachers,
    onViewAnalytics,
    onEdit,
    onAssignToTeacher,
    onRelease,
    onAddToClass,
    isSuperAdmin = false,
    isTeacher = false
}: StudentGridProps) {
    return (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: '1.5rem',
                padding: '0.5rem 0'
            }}
        >
            {students.map((student, index) => {
                const variant = CARD_VARIANTS[index % CARD_VARIANTS.length];
                const studentAssignments = assignments[student.uid] || [];

                return (
                    <StudentCard
                        key={student.uid}
                        student={student}
                        variant={variant}
                        index={index}
                        assignments={studentAssignments}
                        teachers={teachers}
                        onViewAnalytics={onViewAnalytics}
                        onEdit={onEdit}
                        onAssignToTeacher={onAssignToTeacher}
                        onRelease={onRelease}
                        onAddToClass={onAddToClass}
                        isSuperAdmin={isSuperAdmin}
                        isTeacher={isTeacher}
                    />
                );
            })}
        </div>
    );
}
