/**
 * Release Student Modal Component
 *
 * Native <dialog> modal for releasing a student from teacher oversight.
 * Releasing removes only the teacher-student assignment; course enrollments are
 * managed separately through the authorized course enrollment workflow.
 */

import React, { useEffect, useMemo, useState } from 'react';
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
    onConfirm: (assignmentIds: string[]) => Promise<void>;
}

export const ReleaseStudentModal: React.FC<ReleaseStudentModalProps> = ({
    opened,
    onClose,
    student,
    assignments,
    currentTeacherId,
    onConfirm,
}) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const relevantAssignments = useMemo(
        () =>
            currentTeacherId
                ? assignments.filter((a) => a.teacherId === currentTeacherId && a.status === 'active')
                : assignments.filter((a) => a.status === 'active'),
        [assignments, currentTeacherId]
    );

    useEffect(() => {
        setError(null);
        setLoading(false);
    }, [opened, student?.uid]);

    const handleConfirm = async () => {
        if (!student || relevantAssignments.length === 0) return;

        setLoading(true);
        setError(null);

        try {
            const assignmentIds = relevantAssignments.map((a) => a.id);
            await onConfirm(assignmentIds);
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
                <>
                    <p className="assignment-dialog__text">
                        Are you sure you want to release{' '}
                        <strong>{student.displayName || student.email}</strong> from{' '}
                        {currentTeacherId ? 'your oversight' : 'all assigned teachers'}?
                    </p>
                    <p className="assignment-dialog__checkbox-hint">
                        This removes teacher oversight only and does not automatically unenroll the student from courses.
                    </p>
                </>
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
