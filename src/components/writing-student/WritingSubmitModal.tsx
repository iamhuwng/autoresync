/**
 * WritingSubmitModal — PRD-0030 Task 3.6
 * Confirmation modal before submitting writing test.
 * Shows word counts per task.
 * NO MANTINE.
 */

import { useEffect, useId, useRef } from 'react';
import './WritingTestPage.css';

interface WritingSubmitModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    tasks: Array<{ taskNumber: number; wordCount: number; wordMinimum?: number }>;
    isSubmitting?: boolean;
}

function getWordThreshold(taskNumber: number, wordMinimum?: number): number {
    if (typeof wordMinimum === 'number' && Number.isFinite(wordMinimum) && wordMinimum > 0) {
        return wordMinimum;
    }
    return taskNumber === 1 ? 150 : 250;
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

export default function WritingSubmitModal({
    isOpen,
    onClose,
    onConfirm,
    tasks,
    isSubmitting = false,
}: WritingSubmitModalProps) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const titleId = useId();

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

    const hasUnderMinimum = tasks.some((t) => t.wordCount < getWordThreshold(t.taskNumber, t.wordMinimum));

    return (
        <dialog
            ref={dialogRef}
            className="wtp-submit-dialog"
            aria-labelledby={titleId}
            {...({ closedby: isSubmitting ? 'none' : 'any' } as Record<string, string>)}
            onCancel={(event) => {
                if (isSubmitting) {
                    event.preventDefault();
                    return;
                }
                event.preventDefault();
                onClose();
            }}
            onClose={() => {
                if (!isSubmitting) {
                    onClose();
                }
            }}
        >
            <div className="wtp-submit-modal">
                <h1 id={titleId}>Submit Writing Test?</h1>
                <p className="wtp-submit-modal-desc">
                    Please review your word counts before submitting.
                    You cannot edit your essays after submission.
                </p>

                <div className="wtp-submit-tasks">
                    {tasks.map((t) => {
                        const threshold = getWordThreshold(t.taskNumber, t.wordMinimum);
                        const isLow = t.wordCount < threshold;
                        return (
                            <div key={t.taskNumber} className="wtp-submit-task-row">
                                <span className="wtp-submit-task-label">Task {t.taskNumber}</span>
                                <span
                                    className={`wtp-submit-task-words ${
                                        isLow ? 'wtp-submit-task-words--low' : 'wtp-submit-task-words--ok'
                                    }`}
                                >
                                    {t.wordCount} words{isLow ? ` (min ${threshold})` : ''}
                                </span>
                            </div>
                        );
                    })}
                </div>

                {hasUnderMinimum && (
                    <p className="wtp-submit-warning">
                        One or more tasks are below the recommended minimum word count. You can still submit or go back to keep writing.
                    </p>
                )}

                <div className="wtp-submit-actions">
                    <button
                        type="button"
                        className="wtp-submit-btn wtp-submit-btn--cancel"
                        onClick={onClose}
                        disabled={isSubmitting}
                        autoFocus
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="wtp-submit-btn wtp-submit-btn--confirm"
                        onClick={onConfirm}
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? 'Submitting...' : 'Submit'}
                    </button>
                </div>
            </div>
        </dialog>
    );
}
