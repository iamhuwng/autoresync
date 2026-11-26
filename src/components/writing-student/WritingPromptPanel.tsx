/**
 * WritingPromptPanel — PRD-0030 Task 3.1
 * Left panel showing task prompt, image, word minimum.
 * Mobile: collapsible floating button.
 * NO MANTINE.
 */

import { useEffect, useId, useRef, useState } from 'react';
import type { WritingTask } from '../../types/ielts-writing.types';
import './WritingTestPage.css';

interface WritingPromptPanelProps {
    task?: WritingTask;
    taskNumber: number;
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

function syncNativeDialog(dialog: HTMLDialogElement | null, isOpen: boolean) {
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
}

export default function WritingPromptPanel({ task, taskNumber }: WritingPromptPanelProps) {
    const [mobileOpen, setMobileOpen] = useState(false);
    const [imageZoomOpen, setImageZoomOpen] = useState(false);
    const mobileDialogRef = useRef<HTMLDialogElement>(null);
    const lightboxDialogRef = useRef<HTMLDialogElement>(null);
    const mobileTitleId = useId();

    useEffect(() => {
        syncNativeDialog(mobileDialogRef.current, mobileOpen);
    }, [mobileOpen]);

    useEffect(() => {
        syncNativeDialog(lightboxDialogRef.current, imageZoomOpen);
    }, [imageZoomOpen]);

    // Fallback light-dismiss for browsers without native <dialog closedby="any">
    useEffect(() => {
        const attachLightDismissFallback = (
            dialog: HTMLDialogElement | null,
            onDismiss: () => void,
        ) => {
            if (!dialog || (typeof HTMLDialogElement !== 'undefined' && 'closedBy' in HTMLDialogElement.prototype)) {
                return undefined;
            }
            let pressedOutside = false;
            const handlePointerDown = (event: PointerEvent) => {
                pressedOutside = isPointerOutsideDialog(event, dialog);
            };
            const handlePointerUp = (event: PointerEvent) => {
                if (pressedOutside && isPointerOutsideDialog(event, dialog)) {
                    onDismiss();
                }
                pressedOutside = false;
            };
            dialog.addEventListener('pointerdown', handlePointerDown);
            dialog.addEventListener('pointerup', handlePointerUp);
            return () => {
                dialog.removeEventListener('pointerdown', handlePointerDown);
                dialog.removeEventListener('pointerup', handlePointerUp);
            };
        };

        const cleanupMobile = mobileOpen
            ? attachLightDismissFallback(mobileDialogRef.current, () => setMobileOpen(false))
            : undefined;
        const cleanupLightbox = imageZoomOpen
            ? attachLightDismissFallback(lightboxDialogRef.current, () => setImageZoomOpen(false))
            : undefined;

        return () => {
            cleanupMobile?.();
            cleanupLightbox?.();
        };
    }, [imageZoomOpen, mobileOpen]);

    if (!task) {
        return (
            <div className="wtp-prompt-panel wtp-prompt-panel--desktop">
                <div className="wtp-prompt-text">Prompt unavailable for Task {taskNumber}.</div>
            </div>
        );
    }

    const recommendedMinutes = task.recommendedTimeMinutes || (taskNumber === 2 ? 40 : 20);
    const wordMinimum = task.wordMinimum || (taskNumber === 2 ? 250 : 150);

    const renderPromptContent = (headingId?: string) => (
        <>
            <div className="wtp-prompt-header">
                <span id={headingId} className="wtp-task-label">WRITING TASK {taskNumber}</span>
                <span className="wtp-rec-time">
                    You should spend about {recommendedMinutes} minutes on this task
                </span>
            </div>

            {task.promptImageUrl && (
                <div className="wtp-prompt-image-wrapper">
                    <button
                        type="button"
                        className="wtp-prompt-image-btn"
                        onClick={() => setImageZoomOpen(true)}
                        aria-label="Zoom task image"
                        title="Click to enlarge image"
                    >
                        <img
                            src={task.promptImageUrl}
                            alt={task.promptImageCaption || `Writing Task ${taskNumber} visual prompt`}
                            className="wtp-prompt-image"
                        />
                        <span className="wtp-prompt-image-zoom-hint">Click to enlarge</span>
                    </button>
                    {task.promptImageCaption && (
                        <p className="wtp-image-caption">{task.promptImageCaption}</p>
                    )}
                </div>
            )}

            <div className="wtp-prompt-text">
                {task.promptText}
            </div>

            <div className="wtp-word-min">
                Write at least <strong>{wordMinimum}</strong> words.
            </div>
        </>
    );

    return (
        <>
            {/* Desktop panel */}
            <div className="wtp-prompt-panel wtp-prompt-panel--desktop">
                {renderPromptContent()}
            </div>

            {/* Mobile: floating button + native modal sheet */}
            <button
                type="button"
                className="wtp-prompt-mobile-btn"
                aria-expanded={mobileOpen}
                onClick={() => setMobileOpen(true)}
            >
                Show Prompt
            </button>
            {mobileOpen && (
                <dialog
                    ref={mobileDialogRef}
                    className="wtp-prompt-mobile-dialog"
                    aria-labelledby={mobileTitleId}
                    {...({ closedby: 'any' } as Record<string, string>)}
                    onClose={() => setMobileOpen(false)}
                >
                    <div className="wtp-prompt-mobile-content">
                        <button
                            type="button"
                            className="wtp-prompt-mobile-close"
                            aria-label="Close prompt"
                            onClick={() => setMobileOpen(false)}
                        >
                            ✕
                        </button>
                        {renderPromptContent(mobileTitleId)}
                    </div>
                </dialog>
            )}

            {/* Full-size image lightbox for Task 1 charts/tables/diagrams */}
            {imageZoomOpen && task.promptImageUrl && (
                <dialog
                    ref={lightboxDialogRef}
                    className="wtp-lightbox-dialog"
                    aria-label={task.promptImageCaption || `Writing Task ${taskNumber} visual prompt enlarged`}
                    {...({ closedby: 'any' } as Record<string, string>)}
                    onClose={() => setImageZoomOpen(false)}
                >
                    <div className="wtp-lightbox-content">
                        <button
                            type="button"
                            className="wtp-lightbox-close"
                            aria-label="Close enlarged image"
                            autoFocus
                            onClick={() => setImageZoomOpen(false)}
                        >
                            ✕
                        </button>
                        <img
                            src={task.promptImageUrl}
                            alt={task.promptImageCaption || `Writing Task ${taskNumber} visual prompt`}
                            className="wtp-lightbox-image"
                        />
                        {task.promptImageCaption && (
                            <p className="wtp-lightbox-caption">{task.promptImageCaption}</p>
                        )}
                    </div>
                </dialog>
            )}
        </>
    );
}
