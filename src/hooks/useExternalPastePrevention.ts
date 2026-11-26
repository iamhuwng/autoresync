/**
 * useExternalPastePrevention
 * Prevents external paste/drop into a writing textarea when enabled.
 * Internal copy/cut is tracked and allowed within 60 seconds.
 */

import { useCallback, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { toast } from '../components/modern/ToastNotification';

interface UseExternalPastePreventionOptions {
    enabled: boolean;
    initialPasteAttemptCount?: number;
}

interface PastePreventionResult {
    pasteAttemptCount: number;
    setPasteAttemptCount: Dispatch<SetStateAction<number>>;
    attachToTextarea: (textarea: HTMLTextAreaElement) => () => void;
}

const INTERNAL_COPY_TTL_MS = 60_000;
const ALLOWED_BULK_INPUT_TYPES = new Set(['historyUndo', 'historyRedo', 'insertReplacementText']);

function setTextareaValueForReact(textarea: HTMLTextAreaElement, nextValue: string) {
    const prototypeSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value',
    )?.set;

    if (prototypeSetter) {
        prototypeSetter.call(textarea, nextValue);
    } else {
        textarea.value = nextValue;
    }
}

export function useExternalPastePrevention({
    enabled,
    initialPasteAttemptCount = 0,
}: UseExternalPastePreventionOptions): PastePreventionResult {
    const [pasteAttemptCount, setPasteAttemptCount] = useState(initialPasteAttemptCount);
    const lastInternalCopyRef = useRef<{ text: string; timestamp: number } | null>(null);

    const attachToTextarea = useCallback((textarea: HTMLTextAreaElement): () => void => {
        if (!enabled) {
            return () => {};
        }

        let previousValue = textarea.value;
        let isComposing = false;
        let lastInputType: string | null = null;
        let suppressingSyntheticInput = false;

        const incrementAttemptCount = () => {
            setPasteAttemptCount((current) => current + 1);
        };

        const handleFocus = () => {
            previousValue = textarea.value;
        };

        const handleCopy = () => {
            const selection = textarea.value.substring(
                textarea.selectionStart,
                textarea.selectionEnd,
            );

            if (selection) {
                lastInternalCopyRef.current = {
                    text: selection,
                    timestamp: Date.now(),
                };
            }
        };

        const handleCut = () => {
            handleCopy();
        };

        const handleCompositionStart = () => {
            isComposing = true;
            previousValue = textarea.value;
        };

        const handleCompositionEnd = () => {
            isComposing = false;
            previousValue = textarea.value;
        };

        const handlePaste = (event: ClipboardEvent) => {
            const pastedText = event.clipboardData?.getData('text/plain') || '';
            const lastInternalCopy = lastInternalCopyRef.current;
            const isRecentInternalCopy = Boolean(
                lastInternalCopy
                && lastInternalCopy.text === pastedText
                && Date.now() - lastInternalCopy.timestamp < INTERNAL_COPY_TTL_MS,
            );

            if (isRecentInternalCopy) {
                event.preventDefault();
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                const before = textarea.value.substring(0, start);
                const after = textarea.value.substring(end);
                const nextValue = before + pastedText + after;
                previousValue = nextValue;
                suppressingSyntheticInput = true;
                setTextareaValueForReact(textarea, nextValue);
                textarea.selectionStart = textarea.selectionEnd = start + pastedText.length;
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
                suppressingSyntheticInput = false;
                return;
            }

            event.preventDefault();
            incrementAttemptCount();
            toast.warning('External paste is not allowed during the writing test.');
        };

        const handleDrop = (event: DragEvent) => {
            event.preventDefault();
            incrementAttemptCount();
            toast.warning('Drag and drop is not allowed during the writing test.');
        };

        const handleDragOver = (event: DragEvent) => {
            event.preventDefault();
        };

        const handleBeforeInput = (event: Event) => {
            previousValue = textarea.value;
            lastInputType = 'inputType' in event && typeof (event as InputEvent).inputType === 'string'
                ? (event as InputEvent).inputType
                : null;
        };

        const handleInput = (event: Event) => {
            const currentValue = textarea.value;

            if (suppressingSyntheticInput || isComposing || (event as InputEvent).isComposing) {
                previousValue = currentValue;
                lastInputType = null;
                return;
            }

            const inputType = ('inputType' in event && typeof (event as InputEvent).inputType === 'string'
                ? (event as InputEvent).inputType
                : null) ?? lastInputType;
            lastInputType = null;

            if (inputType && ALLOWED_BULK_INPUT_TYPES.has(inputType)) {
                previousValue = currentValue;
                return;
            }

            const delta = currentValue.length - previousValue.length;
            const lastInternalCopy = lastInternalCopyRef.current;
            const hasRecentInternalCopy = Boolean(
                lastInternalCopy && Date.now() - lastInternalCopy.timestamp < INTERNAL_COPY_TTL_MS,
            );

            if (delta > 10 && !hasRecentInternalCopy) {
                suppressingSyntheticInput = true;
                setTextareaValueForReact(textarea, previousValue);
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
                suppressingSyntheticInput = false;
                incrementAttemptCount();
                toast.warning('Bulk text insertion is not allowed during the writing test.');
                return;
            }

            previousValue = currentValue;
        };

        textarea.addEventListener('focus', handleFocus);
        textarea.addEventListener('copy', handleCopy);
        textarea.addEventListener('cut', handleCut);
        textarea.addEventListener('compositionstart', handleCompositionStart);
        textarea.addEventListener('compositionend', handleCompositionEnd);
        textarea.addEventListener('paste', handlePaste);
        textarea.addEventListener('drop', handleDrop);
        textarea.addEventListener('dragover', handleDragOver);
        textarea.addEventListener('beforeinput', handleBeforeInput);
        textarea.addEventListener('input', handleInput);

        return () => {
            textarea.removeEventListener('focus', handleFocus);
            textarea.removeEventListener('copy', handleCopy);
            textarea.removeEventListener('cut', handleCut);
            textarea.removeEventListener('compositionstart', handleCompositionStart);
            textarea.removeEventListener('compositionend', handleCompositionEnd);
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
