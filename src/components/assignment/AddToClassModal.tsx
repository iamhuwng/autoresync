/**
 * AddToClassModal Component
 *
 * Native <dialog> modal for enrolling a student into one of the teacher's classes.
 * Marks already-enrolled classes so teachers can see current membership at a glance.
 */

import React, { useEffect, useId, useMemo, useState } from 'react';
import { IconSchool, IconAlertCircle } from '@tabler/icons-react';
import { NativeDialog } from './NativeDialog';

export interface AddToClassModalProps {
    opened: boolean;
    onClose: () => void;
    student: {
        uid: string;
        displayName: string;
        email: string;
    } | null;
    classes: Array<{ value: string; label: string }>;
    /** Optional list of class IDs the student is already actively enrolled in. */
    enrolledClassIds?: string[];
    onConfirm: (classId: string) => Promise<void>;
}

export const AddToClassModal: React.FC<AddToClassModalProps> = ({
    opened,
    onClose,
    student,
    classes,
    enrolledClassIds = [],
    onConfirm,
}) => {
    const selectId = useId();
    const [selectedClass, setSelectedClass] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const enrolledSet = useMemo(() => new Set(enrolledClassIds), [enrolledClassIds]);
    const availableCount = useMemo(
        () => classes.filter((cls) => !enrolledSet.has(cls.value)).length,
        [classes, enrolledSet]
    );

    useEffect(() => {
        if (opened) {
            setSelectedClass('');
            setError(null);
            setLoading(false);
        }
    }, [opened, student?.uid]);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!selectedClass || !student) return;

        setLoading(true);
        setError(null);

        try {
            await onConfirm(selectedClass);
            onClose();
        } catch (err) {
            console.error('Error in add to class modal:', err);
            setError(err instanceof Error ? err.message : 'Failed to add student to class');
            setLoading(false);
        }
    };

    return (
        <NativeDialog
            opened={opened}
            onClose={onClose}
            title="Add Student to Class"
            icon={<IconSchool size={20} color="#0d9488" aria-hidden="true" />}
            size="sm"
            busy={loading}
        >
            <form onSubmit={handleSubmit} className="assignment-dialog__field" style={{ gap: '1rem' }}>
                {student && (
                    <p className="assignment-dialog__text">
                        Add <strong>{student.displayName || student.email}</strong> to a class.
                    </p>
                )}

                {error && (
                    <div className="assignment-dialog__alert assignment-dialog__alert--error" role="alert">
                        <IconAlertCircle size={16} className="assignment-dialog__alert-icon" aria-hidden="true" />
                        <span>{error}</span>
                    </div>
                )}

                {classes.length === 0 ? (
                    <p className="assignment-dialog__empty-hint">
                        You do not have any active classes yet. Create a class from the Classes tab first.
                    </p>
                ) : (
                    <div className="assignment-dialog__field">
                        <label htmlFor={selectId} className="assignment-dialog__label">
                            Select Class
                        </label>
                        <select
                            id={selectId}
                            className="assignment-dialog__select"
                            value={selectedClass}
                            onChange={(e) => {
                                setSelectedClass(e.target.value);
                                if (error) setError(null);
                            }}
                            disabled={loading || availableCount === 0}
                            autoFocus
                            required
                        >
                            <option value="">
                                {availableCount === 0
                                    ? 'Already enrolled in all active classes'
                                    : 'Choose a class'}
                            </option>
                            {classes.map((cls) => {
                                const alreadyEnrolled = enrolledSet.has(cls.value);
                                return (
                                    <option
                                        key={cls.value}
                                        value={cls.value}
                                        disabled={alreadyEnrolled}
                                    >
                                        {alreadyEnrolled ? `${cls.label} (Already enrolled)` : cls.label}
                                    </option>
                                );
                            })}
                        </select>
                    </div>
                )}

                <div className="assignment-dialog__footer">
                    <button
                        type="button"
                        className="assignment-dialog__btn assignment-dialog__btn--secondary"
                        onClick={onClose}
                        disabled={loading}
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="assignment-dialog__btn assignment-dialog__btn--primary"
                        disabled={!selectedClass || loading}
                    >
                        {loading ? 'Adding...' : 'Add to Class'}
                    </button>
                </div>
            </form>
        </NativeDialog>
    );
};
