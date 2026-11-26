/**
 * SubmitToTeacherModal — PRD-0030 Phase 7 (Task 7.2)
 *
 * Native HTML/CSS modal for submitting solo-practice writing to an enrolled teacher.
 * Props:
 *   - isOpen: modal visibility
 *   - onClose: close callback
 *   - onSubmit: callback with { teacherId: string | null, note: string }
 *   - studentTeachers: list of enrolled teachers
 *   - tasks: word count summary per task
 *
 * Behaviors:
 *   - Single teacher → auto-selected (shown disabled)
 *   - No teachers → "save for self-review" flow
 *   - Optional note textarea
 *   - Word count summary per task
 *
 * NO MANTINE.
 */

import { useState, useEffect, useId, useRef } from 'react';
import './SubmitToTeacherModal.css';

// ── Types ──────────────────────────────────────────────────
interface SubmitToTeacherModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: { teacherId: string | null; note: string }) => void;
    studentTeachers: Array<{ id: string; name: string }>;
    tasks: Array<{ taskNumber: number; wordCount: number; wordMinimum?: number }>;
    isSubmitting?: boolean;
}

function isPointerOutsideDialog(event: PointerEvent, dialog: HTMLDialogElement): boolean {
    const rect = dialog.getBoundingClientRect();
    return (
        event.clientX < rect.left
        || event.clientX > rect.right
        || event.clientY < rect.top
        || event.clientY > rect.bottom
    );
}

// ── Component ──────────────────────────────────────────────
export default function SubmitToTeacherModal({
    isOpen,
    onClose,
    onSubmit,
    studentTeachers,
    tasks,
    isSubmitting = false,
}: SubmitToTeacherModalProps) {
    const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
    const [note, setNote] = useState('');
    const dialogRef = useRef<HTMLDialogElement>(null);
    const titleId = useId();

    // Auto-select if single teacher
    useEffect(() => {
        if (studentTeachers.length === 1) {
            setSelectedTeacherId(studentTeachers[0]!.id);
        } else if (studentTeachers.length > 1 && !selectedTeacherId) {
            setSelectedTeacherId(studentTeachers[0]!.id);
        }
    }, [studentTeachers, selectedTeacherId]);

    // Reset state when modal opens
    useEffect(() => {
        if (isOpen) {
            setNote('');
            if (studentTeachers.length >= 1) {
                setSelectedTeacherId(studentTeachers[0]!.id);
            } else {
                setSelectedTeacherId(null);
            }
        }
    }, [isOpen, studentTeachers]);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;

        if (isOpen && !dialog.open) {
            if (typeof dialog.showModal === 'function') {
                dialog.showModal();
            } else {
                dialog.setAttribute('open', '');
            }
        } else if (!isOpen && dialog.open) {
            if (typeof dialog.close === 'function') {
                dialog.close();
            } else {
                dialog.removeAttribute('open');
            }
        }
    }, [isOpen]);

    // Light-dismiss fallback when <dialog closedby="any"> is unsupported
    useEffect(() => {
        const dialog = dialogRef.current;
        if (
            !isOpen
            || isSubmitting
            || !dialog
            || (typeof HTMLDialogElement !== 'undefined' && 'closedBy' in HTMLDialogElement.prototype)
        ) {
            return undefined;
        }

        let pressedOutside = false;
        const handlePointerDown = (event: PointerEvent) => {
            pressedOutside = isPointerOutsideDialog(event, dialog);
        };
        const handlePointerUp = (event: PointerEvent) => {
            if (pressedOutside && isPointerOutsideDialog(event, dialog)) {
                onClose();
            }
            pressedOutside = false;
        };

        dialog.addEventListener('pointerdown', handlePointerDown);
        dialog.addEventListener('pointerup', handlePointerUp);
        return () => {
            dialog.removeEventListener('pointerdown', handlePointerDown);
            dialog.removeEventListener('pointerup', handlePointerUp);
        };
    }, [isOpen, isSubmitting, onClose]);

    if (!isOpen) return null;

    const hasTeachers = studentTeachers.length > 0;
    const isSingleTeacher = studentTeachers.length === 1;

    const handleSubmit = () => {
        onSubmit({ teacherId: selectedTeacherId, note: note.trim() });
    };

    const handleSelfReview = () => {
        onSubmit({ teacherId: null, note: note.trim() });
    };

    const getWordThreshold = (taskNumber: number, wordMinimum?: number) => {
        if (typeof wordMinimum === 'number' && Number.isFinite(wordMinimum) && wordMinimum > 0) {
            return wordMinimum;
        }
        return taskNumber === 1 ? 150 : 250;
    };

    return (
        <dialog
            ref={dialogRef}
            className="stm-dialog"
            aria-labelledby={titleId}
            {...({ closedby: isSubmitting ? 'none' : 'any' } as Record<string, string>)}
            onCancel={(event) => {
                event.preventDefault();
                if (!isSubmitting) {
                    onClose();
                }
            }}
            onClose={() => {
                if (!isSubmitting) {
                    onClose();
                }
            }}
        >
            <div className="stm-modal">
                {/* Header */}
                <h1 id={titleId}>
                    {hasTeachers ? 'Submit to Teacher' : 'Save for Self-Review'}
                </h1>
                <p className="stm-subtitle">
                    {hasTeachers
                        ? 'Your essay will be sent to your teacher for grading. You can add an optional note.'
                        : "You're not enrolled in any class. Your essay will be saved for your own review."}
                </p>

                {/* Teacher Select (only if teachers exist) */}
                {hasTeachers && (
                    <div className="stm-field">
                        <label className="stm-label" htmlFor="stm-teacher-select">
                            Submit to
                        </label>
                        <select
                            id="stm-teacher-select"
                            className="stm-select"
                            value={selectedTeacherId || ''}
                            onChange={(e) => setSelectedTeacherId(e.target.value)}
                            disabled={isSingleTeacher || isSubmitting}
                        >
                            {studentTeachers.map((teacher) => (
                                <option key={teacher.id} value={teacher.id}>
                                    {teacher.name}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                {/* No-teacher info */}
                {!hasTeachers && (
                    <div className="stm-no-teachers">
                        <span>
                            Join a class with a teacher to get your writing graded.
                            For now, your essay will be saved so you can review it later.
                        </span>
                    </div>
                )}

                {/* Word Count Summary */}
                <div className="stm-word-summary">
                    <div className="stm-word-summary-header">Word Count</div>
                    {tasks.map((task) => {
                        const threshold = getWordThreshold(task.taskNumber, task.wordMinimum);
                        const isLow = task.wordCount < threshold;
                        return (
                            <div key={task.taskNumber} className="stm-word-row">
                                <span className="stm-word-row-label">
                                    Task {task.taskNumber}
                                </span>
                                <span
                                    className={`stm-word-row-count ${isLow ? 'stm-word-row-count--low' : 'stm-word-row-count--ok'
                                        }`}
                                >
                                    {task.wordCount} words
                                    {isLow && ` (min ${threshold})`}
                                </span>
                            </div>
                        );
                    })}
                </div>

                {/* Optional Note */}
                <div className="stm-field">
                    <label className="stm-label" htmlFor="stm-note">
                        Note to teacher (optional)
                    </label>
                    <textarea
                        id="stm-note"
                        className="stm-textarea"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Any questions or comments for your teacher..."
                        maxLength={500}
                        disabled={isSubmitting}
                    />
                </div>

                {/* Actions */}
                <div className="stm-actions">
                    <button
                        type="button"
                        className="stm-btn stm-btn--cancel"
                        onClick={onClose}
                        disabled={isSubmitting}
                        autoFocus
                    >
                        Cancel
                    </button>

                    {hasTeachers ? (
                        <button
                            type="button"
                            className="stm-btn stm-btn--submit"
                            onClick={handleSubmit}
                            disabled={!selectedTeacherId || isSubmitting}
                        >
                            {isSubmitting ? 'Submitting...' : 'Submit'}
                        </button>
                    ) : (
                        <button
                            type="button"
                            className="stm-btn stm-btn--self-review"
                            onClick={handleSelfReview}
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? 'Saving...' : 'Save for Review'}
                        </button>
                    )}
                </div>
            </div>
        </dialog>
    );
}
