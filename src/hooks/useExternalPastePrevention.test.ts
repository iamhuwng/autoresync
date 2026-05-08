import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useExternalPastePrevention } from './useExternalPastePrevention';

function createPasteEvent(text: string) {
    const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', {
        value: {
            getData: (type: string) => (type === 'text/plain' ? text : ''),
        },
    });
    return event;
}

describe('useExternalPastePrevention', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        document.body.innerHTML = '';
    });

    afterEach(() => {
        vi.runOnlyPendingTimers();
        vi.useRealTimers();
        document.body.innerHTML = '';
    });

    it('blocks external paste, drop, and bulk insert when enabled', () => {
        const { result } = renderHook(() => useExternalPastePrevention({ enabled: true }));
        const textarea = document.createElement('textarea');
        const cleanup = result.current.attachToTextarea(textarea);

        const pasteEvent = createPasteEvent('external text');
        act(() => {
            textarea.dispatchEvent(pasteEvent);
        });
        expect(pasteEvent.defaultPrevented).toBe(true);
        expect(result.current.pasteAttemptCount).toBe(1);

        const dropEvent = new Event('drop', { bubbles: true, cancelable: true });
        act(() => {
            textarea.dispatchEvent(dropEvent);
        });
        expect(dropEvent.defaultPrevented).toBe(true);
        expect(result.current.pasteAttemptCount).toBe(2);

        act(() => {
            textarea.value = '';
            textarea.dispatchEvent(new Event('beforeinput', { bubbles: true }));
            textarea.value = '01234567890';
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
        });
        expect(textarea.value).toBe('');
        expect(result.current.pasteAttemptCount).toBe(3);

        cleanup();
    });

    it('allows recent internal copy and paste without increasing the count', () => {
        const { result } = renderHook(() => useExternalPastePrevention({ enabled: true }));
        const textarea = document.createElement('textarea');
        const cleanup = result.current.attachToTextarea(textarea);

        textarea.value = 'hello';
        textarea.selectionStart = 0;
        textarea.selectionEnd = 5;
        act(() => {
            textarea.dispatchEvent(new Event('copy', { bubbles: true }));
        });

        textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
        const pasteEvent = createPasteEvent('hello');
        act(() => {
            textarea.dispatchEvent(pasteEvent);
        });

        expect(pasteEvent.defaultPrevented).toBe(true);
        expect(textarea.value).toBe('hellohello');
        expect(result.current.pasteAttemptCount).toBe(0);

        cleanup();
    });

    it('allows paste when disabled and leaves the count unchanged', () => {
        const { result } = renderHook(() => useExternalPastePrevention({ enabled: false }));
        const textarea = document.createElement('textarea');
        const cleanup = result.current.attachToTextarea(textarea);

        const pasteEvent = createPasteEvent('external text');
        act(() => {
            textarea.dispatchEvent(pasteEvent);
        });

        expect(pasteEvent.defaultPrevented).toBe(false);
        expect(result.current.pasteAttemptCount).toBe(0);

        cleanup();
    });
});
