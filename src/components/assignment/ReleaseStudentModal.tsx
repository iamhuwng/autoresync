/**
 * Release Student Modal Component
 *
 * Native <dialog> modal for releasing a student from a teacher's oversight.
 * Includes option to record course unenrollment for associated courses.
 */

import React, { useEffect, useId, useMemo, useState } from 'react';
import { IconAlertCircle, IconUserMinus } from '@tabler/icons-react';
import type { StudentTeacherAssignment } from '../../types/assignment.types';
import { NativeDialog } from './NativeDialog';

export interface ReleaseStudentModalProps {
    opened: boolean;
    onClose: () => void;
    student: {
        uid: string;
        displayName: string;
        email: string;
    } | null;
    assignments: StudentTeacherAssignment[];
    currentTeacherId?: string | null;
    availableCourses: Array<{ value: string; label: string }>;
    onConfirm: (assignmentIds: string[], unenrollCourseIds: string[]) => Promise<void>;
}

export const ReleaseStudentModal: React.FC<ReleaseStudentModalProps> = ({
    opened,
    onClose,
    student,
    assignments,
    currentTeacherId,
    availableCourses,
    onConfirm,
}) => {
    const checkboxId = useId();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [unenrollFromCourses, setUnenrollFromCourses] = useState(false);
    const [selectedCoursesToUnenroll, setSelectedCoursesToUnenroll] = useState<string[]>([]);

    const relevantAssignments = useMemo(
        () =>
            currentTeacherId
                ? assignments.filter((a) => a.teacherId === currentTeacherId && a.status === 'active')
                : assignments.filter((a) => a.status === 'active'),
        [assignments, currentTeacherId]
    );

    const enrolledCourseIds = useMemo(
        () => Array.from(new Set(relevantAssignments.flatMap((a) => a.coursesEnrolled || []))),
        [relevantAssignments]
    );

    const filteredAvailableCourses = useMemo(
        () => availableCourses.filter((c) => enrolledCourseIds.includes(c.value)),
        [availableCourses, enrolledCourseIds]
    );

    useEffect(() => {
        if (!opened) {
            setUnenrollFromCourses(false);
            setSelectedCoursesToUnenroll([]);
            setError(null);
            setLoading(false);
        } else {
            setUnenrollFromCourses(false);
            setSelectedCoursesToUnenroll(enrolledCourseIds);
            setError(null);
            setLoading(false);
        }
    }, [opened, student?.uid, enrolledCourseIds]);

    const toggleCourse = (courseId: string) => {
        setSelectedCoursesToUnenroll((prev) =>
            prev.includes(courseId) ? prev.filter((id) => id !== courseId) : [...prev, courseId]
        );
    };

    const handleConfirm = async () => {
        if (!student || relevantAssignments.length === 0) return;

        setLoading(true);
        setError(null);

        try {
            const assignmentIds = relevantAssignments.map((a) => a.id);
            await onConfirm(assignmentIds, unenrollFromCourses ? selectedCoursesToUnenroll : []);
            onClose();
        } catch (err) {
            console.error('Error in release modal:', err);
            setError(err instanceof Error ? err.message : 'Failed to release student');
        } finally {
            setLoading(false);
        }
    };

    return (
        <NativeDialog
            opened={opened}
            onClose={onClose}
            title="Release Student"
            icon={<IconUserMinus size={20} color="#ea580c" aria-hidden="true" />}
            busy={loading}
        >
            {student && (
                <p className="assignment-dialog__text">
                    Are you sure you want to release{' '}
                    <strong>{student.displayName || student.email}</strong> from{' '}
                    {currentTeacherId ? 'your oversight' : 'all assigned teachers'}?
                </p>
            )}

            {relevantAssignments.length > 1 && !currentTeacherId && (
                <div className="assignment-dialog__alert assignment-dialog__alert--warning" role="status">
                    <IconAlertCircle size={16} className="assignment-dialog__alert-icon" aria-hidden="true" />
                    <span>
                        This student is assigned to {relevantAssignments.length} teachers. Releasing will remove all
                        these assignments.
                    </span>
                </div>
            )}

            {error && (
                <div className="assignment-dialog__alert assignment-dialog__alert--error" role="alert">
                    <IconAlertCircle size={16} className="assignment-dialog__alert-icon" aria-hidden="true" />
                    <span>{error}</span>
                </div>
            )}

            {enrolledCourseIds.length > 0 && (
                <>
                    <div className="assignment-dialog__divider">Course Access</div>

                    <label htmlFor={checkboxId} className="assignment-dialog__checkbox-row">
                        <input
                            id={checkboxId}
                            type="checkbox"
                            checked={unenrollFromCourses}
                            onChange={(e) => setUnenrollFromCourses(e.currentTarget.checked)}
                            disabled={loading}
                        />
                        <span>
                            Also unenroll from courses?
                            <span className="assignment-dialog__checkbox-hint">
                                Remove the student from selected courses associated with this assignment
                            </span>
                        </span>
                    </label>

                    {unenrollFromCourses && filteredAvailableCourses.length > 0 && (
                        <div className="assignment-dialog__course-list" role="group" aria-label="Select Courses to Unenroll">
                            <div className="assignment-dialog__course-legend">Select Courses to Unenroll</div>
                            {filteredAvailableCourses.map((course) => (
                                <label key={course.value} className="assignment-dialog__checkbox-row">
                                    <input
                                        type="checkbox"
                                        checked={selectedCoursesToUnenroll.includes(course.value)}
                                        onChange={() => toggleCourse(course.value)}
                                        disabled={loading}
                                    />
                                    <span>{course.label}</span>
                                </label>
                            ))}
                        </div>
                    )}

                    {unenrollFromCourses && filteredAvailableCourses.length === 0 && (
                        <p className="assignment-dialog__text" style={{ fontSize: '0.8rem', fontStyle: 'italic' }}>
                            Note: Student is enrolled in {enrolledCourseIds.length} course(s), but course names are not
                            available.
                        </p>
                    )}
                </>
            )}

            <div className="assignment-dialog__footer">
                <button
                    type="button"
                    className="assignment-dialog__btn assignment-dialog__btn--secondary"
                    onClick={onClose}
                    disabled={loading}
                    autoFocus
                >
                    Cancel
                </button>
                <button
                    type="button"
                    className="assignment-dialog__btn assignment-dialog__btn--warning"
                    onClick={handleConfirm}
                    disabled={relevantAssignments.length === 0 || loading}
                >
                    {loading ? 'Releasing...' : 'Confirm Release'}
                </button>
            </div>
        </NativeDialog>
    );
};
