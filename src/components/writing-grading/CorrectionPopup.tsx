/**
 * CorrectionPopup — Inline popup for entering correction text
 *
 * Appears near the selected text when the teacher clicks "Correction" in the
 * toolbar or BubbleMenu. Contains a text input labeled "Correct to:", an Apply
 * button, and a close button.
 *
 * Interaction:
 * - Enter submits the correction
 * - Escape dismisses without applying
 * - Click outside dismisses without applying
 * - Apply button creates a correctionMark on the selected text
 *
 * @see specs/grading-editor-redesign FR-9, FR-10
 * @module components/writing-grading/CorrectionPopup
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import './CorrectionPopup.css';

export interface CorrectionPopupProps {
    /** Whether the popup is visible */
    isOpen: boolean;
    /** The original selected text being corrected */
    selectedText: string;
    /** Position relative to the editor container */
    position: { top: number; left: number };
    /** Called with correction text when the teacher submits */
    onApply: (correctionText: string) => void;
    /** Called when the popup is dismissed without applying */
    onDismiss: () => void;
}

const CorrectionPopup: React.FC<CorrectionPopupProps> = ({
    isOpen,
    selectedText,
    position,
    onApply,
    onDismiss,
}) => {
    const [correctionText, setCorrectionText] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const popupRef = useRef<HTMLDivElement>(null);

    // Focus input when popup opens
    useEffect(() => {
        if (isOpen) {
            setCorrectionText('');
            // Small delay to ensure DOM is rendered
            requestAnimationFrame(() => {
                inputRef.current?.focus();
            });
        }
    }, [isOpen]);

    // Click outside to dismiss
    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
                onDismiss();
            }
        };

        // Delay listener to avoid catching the click that opened the popup
        const timer = setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside);
        }, 50);

        return () => {
            clearTimeout(timer);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen, onDismiss]);

    // Handle keyboard
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (correctionText.trim()) {
                onApply(correctionText.trim());
            }
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            onDismiss();
        }
    }, [correctionText, onApply, onDismiss]);

    const handleApply = useCallback(() => {
        if (correctionText.trim()) {
            onApply(correctionText.trim());
        }
    }, [correctionText, onApply]);

    if (!isOpen) return null;

    return (
        <div
            ref={popupRef}
            className="correction-popup"
            style={{
                top: position.top,
                left: position.left,
            }}
            id="correction-popup"
        >
            {/* Header with selected text preview */}
            <div className="correction-popup-header">
                <span className="correction-popup-label">Correct to:</span>
                <button
                    className="correction-popup-close"
                    onClick={onDismiss}
                    title="Cancel (Esc)"
                    id="correction-popup-close"
                >
                    ✕
                </button>
            </div>

            {/* Selected text preview (struck through) */}
            <div className="correction-popup-preview" id="correction-popup-preview">
                <span className="correction-preview-original">{selectedText}</span>
                {correctionText && (
                    <>
                        <span className="correction-preview-arrow"> → </span>
                        <span className="correction-preview-new">{correctionText}</span>
                    </>
                )}
            </div>

            {/* Input + Apply */}
            <div className="correction-popup-input-row">
                <input
                    ref={inputRef}
                    type="text"
                    className="correction-popup-input"
                    value={correctionText}
                    onChange={(e) => setCorrectionText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type correction…"
                    id="correction-popup-input"
                    autoComplete="off"
                    spellCheck={false}
                />
                <button
                    className="correction-popup-apply"
                    onClick={handleApply}
                    disabled={!correctionText.trim()}
                    id="correction-popup-apply"
                >
                    Apply
                </button>
            </div>
        </div>
    );
};

export default CorrectionPopup;
