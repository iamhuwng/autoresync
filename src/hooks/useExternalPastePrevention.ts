/**
 * useExternalPastePrevention — PRD-0030 Task 3.3
 * Prevents external paste/drop into writing textarea.
 * Internal copy/cut is tracked and allowed within 60s.
 */

import { useRef, useCallback } from 'react';

interface PastePreventionResult {
    pasteAttemptCount: number;
    attachToTextarea: (textarea: HTMLTextAreaElement) => () => void;
}

export function useExternalPastePrevention(): PastePreventionResult {
    const pasteCountRef = useRef(0);
    const lastInternalCopyRef = useRef<{ text: string; timestamp: number } | null>(null);

    const attachToTextarea = useCallback((textarea: HTMLTextAreaElement): () => void => {
        // Track internal copy/cut
        const handleCopy = () => {
            const selection = textarea.value.substring(
                textarea.selectionStart,
                textarea.selectionEnd
            );
            if (selection) {
                lastInternalCopyRef.current = { text: selection, timestamp: Date.now() };
            }
        };

        const handleCut = () => {
            handleCopy(); // Track the cut text same as copy
        };

        // Block external paste
        const handlePaste = (e: ClipboardEvent) => {
            const pastedText = e.clipboardData?.getData('text/plain') || '';

            // Check if this matches a recent internal copy
            const internal = lastInternalCopyRef.current;
            if (
                internal &&
                internal.text === pastedText &&
                Date.now() - internal.timestamp < 60_000
            ) {
                // Allow internal paste — insert manually
                e.preventDefault();
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                const before = textarea.value.substring(0, start);
                const after = textarea.value.substring(end);
                textarea.value = before + pastedText + after;
                textarea.selectionStart = textarea.selectionEnd = start + pastedText.length;

                // Trigger React's onChange
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
                return;
            }

            // External paste — BLOCK
            e.preventDefault();
            pasteCountRef.current += 1;

            // Show toast notification (simple approach)
            const toast = document.createElement('div');
            toast.textContent = '⚠️ External paste is not allowed during the writing test.';
            Object.assign(toast.style, {
                position: 'fixed',
                bottom: '24px',
                left: '50%',
                transform: 'translateX(-50%)',
                padding: '12px 24px',
                background: '#ef4444',
                color: '#fff',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                zIndex: '9999',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            });
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
        };

        // Block drag & drop
        const handleDrop = (e: DragEvent) => {
            e.preventDefault();

            const toast = document.createElement('div');
            toast.textContent = '⚠️ Drag and drop is not allowed during the writing test.';
            Object.assign(toast.style, {
                position: 'fixed',
                bottom: '24px',
                left: '50%',
                transform: 'translateX(-50%)',
                padding: '12px 24px',
                background: '#f59e0b',
                color: '#fff',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                zIndex: '9999',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            });
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
        };

        textarea.addEventListener('copy', handleCopy);
        textarea.addEventListener('cut', handleCut);
        textarea.addEventListener('paste', handlePaste);
        textarea.addEventListener('drop', handleDrop);
        textarea.addEventListener('dragover', (e) => e.preventDefault());

        // Return cleanup function
        return () => {
            textarea.removeEventListener('copy', handleCopy);
            textarea.removeEventListener('cut', handleCut);
            textarea.removeEventListener('paste', handlePaste);
            textarea.removeEventListener('drop', handleDrop);
        };
    }, []);

    return {
        get pasteAttemptCount() {
            return pasteCountRef.current;
        },
        attachToTextarea,
    };
}
