/**
 * useExternalPastePrevention
 * Prevents external paste/drop into a writing textarea when enabled.
 * Internal copy/cut is tracked and allowed within 60 seconds.
 */

import { useCallback, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

interface UseExternalPastePreventionOptions {
    enabled: boolean;
    initialPasteAttemptCount?: number;
}

interface PastePreventionResult {
    pasteAttemptCount: number;
    setPasteAttemptCount: Dispatch<SetStateAction<number>>;
    attachToTextarea: (textarea: HTMLTextAreaElement) => () => void;
}

function showBlockingToast(message: string, background: string) {
    const toast = document.createElement('div');
    toast.textContent = message;
    Object.assign(toast.style, {
        position: 'fixed',
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '12px 24px',
        background,
        color: '#fff',
        borderRadius: '8px',
        fontSize: '14px',
        fontWeight: '500',
        zIndex: '9999',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    });
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

export function useExternalPastePrevention({
    enabled,
    initialPasteAttemptCount = 0,
}: UseExternalPastePreventionOptions): PastePreventionResult {
    const [pasteAttemptCount, setPasteAttemptCount] = useState(initialPasteAttemptCount);

    const attachToTextarea = useCallback((textarea: HTMLTextAreaElement): () => void => {
        if (!enabled) {
            return () => {};
        }

        let previousValue = textarea.value;
        let lastInternalCopy: { text: string; timestamp: number } | null = null;

        const incrementAttemptCount = () => {
            setPasteAttemptCount((current) => current + 1);
        };

        const handleCopy = () => {
            const selection = textarea.value.substring(
                textarea.selectionStart,
                textarea.selectionEnd,
            );

            if (selection) {
                lastInternalCopy = {
                    text: selection,
                    timestamp: Date.now(),
                };
            }
        };

        const handleCut = () => {
            handleCopy();
        };

        const handlePaste = (event: ClipboardEvent) => {
            const pastedText = event.clipboardData?.getData('text/plain') || '';
            const isRecentInternalCopy = Boolean(
                lastInternalCopy
                && lastInternalCopy.text === pastedText
                && Date.now() - lastInternalCopy.timestamp < 60_000,
            );

            if (isRecentInternalCopy) {
                event.preventDefault();
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                const before = textarea.value.substring(0, start);
                const after = textarea.value.substring(end);
                textarea.value = before + pastedText + after;
                textarea.selectionStart = textarea.selectionEnd = start + pastedText.length;
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
                return;
            }

            event.preventDefault();
            incrementAttemptCount();
            showBlockingToast(
                'External paste is not allowed during the writing test.',
                '#ef4444',
            );
        };

        const handleDrop = (event: DragEvent) => {
            event.preventDefault();
            incrementAttemptCount();
            showBlockingToast(
                'Drag and drop is not allowed during the writing test.',
                '#f59e0b',
            );
        };

        const handleDragOver = (event: DragEvent) => {
            event.preventDefault();
        };

        const handleBeforeInput = () => {
            previousValue = textarea.value;
        };

        const handleInput = () => {
            const currentValue = textarea.value;
            const delta = currentValue.length - previousValue.length;
            const hasRecentInternalCopy = Boolean(
                lastInternalCopy && Date.now() - lastInternalCopy.timestamp < 60_000,
            );

            if (delta > 10 && !hasRecentInternalCopy) {
                textarea.value = previousValue;
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
                incrementAttemptCount();
                showBlockingToast(
                    'Bulk text insertion is not allowed during the writing test.',
                    '#ef4444',
                );
                return;
            }

            previousValue = currentValue;
        };

        textarea.addEventListener('copy', handleCopy);
        textarea.addEventListener('cut', handleCut);
        textarea.addEventListener('paste', handlePaste);
        textarea.addEventListener('drop', handleDrop);
        textarea.addEventListener('dragover', handleDragOver);
        textarea.addEventListener('beforeinput', handleBeforeInput);
        textarea.addEventListener('input', handleInput);

        return () => {
            textarea.removeEventListener('copy', handleCopy);
            textarea.removeEventListener('cut', handleCut);
            textarea.removeEventListener('paste', handlePaste);
            textarea.removeEventListener('drop', handleDrop);
            textarea.removeEventListener('dragover', handleDragOver);
            textarea.removeEventListener('beforeinput', handleBeforeInput);
            textarea.removeEventListener('input', handleInput);
        };
    }, [enabled]);

    return {
        pasteAttemptCount,
        setPasteAttemptCount,
        attachToTextarea,
    };
}
