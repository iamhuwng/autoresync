import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { NativeDialog } from './NativeDialog';

describe('NativeDialog', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('opens dialog, invokes onClose via close button, and ignores close when busy', () => {
        const onClose = vi.fn();
        const { rerender } = render(
            <NativeDialog opened={true} onClose={onClose} title="Test Modal" busy={false}>
                <p>Dialog Body</p>
            </NativeDialog>
        );

        expect(screen.getByText('Test Modal')).toBeInTheDocument();
        expect(screen.getByText('Dialog Body')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Close Test Modal' }));
        expect(onClose).toHaveBeenCalledTimes(1);

        onClose.mockClear();
        rerender(
            <NativeDialog opened={true} onClose={onClose} title="Test Modal" busy={true}>
                <p>Dialog Body</p>
            </NativeDialog>
        );

        const closeBtn = screen.getByRole('button', { name: 'Close Test Modal' });
        expect(closeBtn).toBeDisabled();
        fireEvent.click(closeBtn);
        expect(onClose).not.toHaveBeenCalled();
    });

    it('prevents Escape cancel when busy and allows cancel when idle', () => {
        const onClose = vi.fn();
        const { container, rerender } = render(
            <NativeDialog opened={true} onClose={onClose} title="Escape Modal" busy={true}>
                <p>Content</p>
            </NativeDialog>
        );

        const dialog = container.querySelector('dialog')!;
        const cancelWhenBusy = new Event('cancel', { cancelable: true });
        dialog.dispatchEvent(cancelWhenBusy);
        expect(cancelWhenBusy.defaultPrevented).toBe(true);

        rerender(
            <NativeDialog opened={true} onClose={onClose} title="Escape Modal" busy={false}>
                <p>Content</p>
            </NativeDialog>
        );

        const cancelWhenIdle = new Event('cancel', { cancelable: true });
        dialog.dispatchEvent(cancelWhenIdle);
        expect(cancelWhenIdle.defaultPrevented).toBe(false);

        dialog.dispatchEvent(new Event('close'));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('supports pointerdown/pointerup backdrop light-dismiss only when not busy', () => {
        const onClose = vi.fn();
        const { container, rerender } = render(
            <NativeDialog opened={true} onClose={onClose} title="Backdrop Modal" busy={false}>
                <p>Content</p>
            </NativeDialog>
        );

        const dialog = container.querySelector('dialog')!;
        vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue({
            left: 100,
            right: 400,
            top: 100,
            bottom: 300,
            width: 300,
            height: 200,
            x: 100,
            y: 100,
            toJSON: () => ({}),
        });

        // Click inside should NOT dismiss
        fireEvent.pointerDown(dialog, { clientX: 200, clientY: 200 });
        fireEvent.pointerUp(dialog, { clientX: 200, clientY: 200 });
        expect(onClose).not.toHaveBeenCalled();

        // Click outside should dismiss
        fireEvent.pointerDown(dialog, { clientX: 10, clientY: 10 });
        fireEvent.pointerUp(dialog, { clientX: 10, clientY: 10 });
        expect(onClose).toHaveBeenCalledTimes(1);

        // Click outside while busy should NOT dismiss
        onClose.mockClear();
        rerender(
            <NativeDialog opened={true} onClose={onClose} title="Backdrop Modal" busy={true}>
                <p>Content</p>
            </NativeDialog>
        );
        fireEvent.pointerDown(dialog, { clientX: 10, clientY: 10 });
        fireEvent.pointerUp(dialog, { clientX: 10, clientY: 10 });
        expect(onClose).not.toHaveBeenCalled();
    });
});
