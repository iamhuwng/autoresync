/**
 * StudentGrid Component
 *
 * Grid layout for displaying multiple StudentCard components.
 */

import { StudentCard, type StudentCardClassBadge } from './StudentCard';
import type { UserProfile } from '../../services/userService';
import type { StudentTeacherAssignment } from '../../types/assignment.types';

export interface StudentGridProps {
    students: UserProfile[];
    assignments: Record<string, StudentTeacherAssignment[]>;
    teachers: UserProfile[];
    classesByStudent?: Record<string, StudentCardClassBadge[]>;
    currentUserId?: string | null;

    // Actions (passed to StudentCard; omitted handlers hide their button)
    onViewAnalytics: (studentId: string) => void;
    onEdit?: (student: UserProfile) => void;
    onAssignToTeacher?: (student: UserProfile) => void;
    onRelease?: (student: UserProfile) => void;
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
    classesByStudent,
    currentUserId = null,
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
            data-testid="student-grid"
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
                const enrolledClasses = classesByStudent?.[student.uid] || [];

                return (
                    <StudentCard
                        key={student.uid}
                        student={student}
                        variant={variant}
                        index={index}
                        assignments={studentAssignments}
                        teachers={teachers}
                        enrolledClasses={enrolledClasses}
                        currentUserId={currentUserId}
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
