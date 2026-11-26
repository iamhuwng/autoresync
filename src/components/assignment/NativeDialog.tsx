/**
 * NativeDialog
 *
 * Accessible modal wrapper built on the native <dialog> element:
 * - Opened via showModal() (top layer, focus containment, inert page, Esc handling)
 * - Light-dismiss via closedby="any" + pointerdown/pointerup fallback for browsers
 *   without HTMLDialogElement.prototype.closedBy
 * - Scroll containment via CSS overscroll-behavior on dialog:modal and dialog::backdrop
 */

import React, { useEffect, useId, useRef } from 'react';
import { IconX } from '@tabler/icons-react';
import './AssignmentModals.css';

export interface NativeDialogProps {
    opened: boolean;
    onClose: () => void;
    title: string;
    icon?: React.ReactNode;
    size?: 'sm' | 'md';
    busy?: boolean;
    children: React.ReactNode;
}

const isPointerOutsideDialog = (event: PointerEvent, dialog: HTMLDialogElement): boolean => {
    const rect = dialog.getBoundingClientRect();
    return (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
    );
};

export const NativeDialog: React.FC<NativeDialogProps> = ({
    opened,
    onClose,
    title,
    icon,
    size = 'md',
    busy = false,
    children,
}) => {
    const dialogRef = useRef<HTMLDialogElement | null>(null);
    const titleId = useId();
    const busyRef = useRef(busy);
    busyRef.current = busy;

    // Sync React `opened` prop with native <dialog> top-layer state.
    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;

        if (opened) {
            if (!dialog.open) {
                if (typeof dialog.showModal === 'function') {
                    dialog.showModal();
                } else {
                    // Fallback for minimal test environments (e.g. jsdom without showModal).
                    dialog.setAttribute('open', '');
                }
            }
        } else if (dialog.open) {
            if (typeof dialog.close === 'function') {
                dialog.close();
            } else {
                dialog.removeAttribute('open');
            }
        }
    }, [opened]);

    // Handle native close/cancel and light-dismiss fallback when `closedBy` is unsupported.
    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;

        const handleCancel = (event: Event) => {
            if (busyRef.current) {
                event.preventDefault();
            }
        };

        const handleClose = () => {
            dialog.returnValue = '';
            onClose();
        };

        dialog.addEventListener('cancel', handleCancel);
        dialog.addEventListener('close', handleClose);

        const supportsClosedBy =
            typeof HTMLDialogElement !== 'undefined' &&
            'closedBy' in HTMLDialogElement.prototype;

        let pressedOutside = false;
        const handlePointerDown = (event: PointerEvent) => {
            pressedOutside = isPointerOutsideDialog(event, dialog);
        };
        const handlePointerUp = (event: PointerEvent) => {
            if (pressedOutside && !busyRef.current && isPointerOutsideDialog(event, dialog)) {
                if (typeof dialog.close === 'function') {
                    dialog.close();
                } else {
                    dialog.removeAttribute('open');
                    onClose();
                }
            }
            pressedOutside = false;
        };

        if (!supportsClosedBy) {
            dialog.addEventListener('pointerdown', handlePointerDown);
            dialog.addEventListener('pointerup', handlePointerUp);
        }

        return () => {
            dialog.removeEventListener('cancel', handleCancel);
            dialog.removeEventListener('close', handleClose);
            if (!supportsClosedBy) {
                dialog.removeEventListener('pointerdown', handlePointerDown);
                dialog.removeEventListener('pointerup', handlePointerUp);
            }
        };
    }, [onClose]);

    if (!opened) {
        return null;
    }

    const dialogAttrs = {
        closedby: busy ? 'none' : 'any',
    } as Record<string, unknown>;

    return (
        <dialog
            ref={dialogRef}
            className={`assignment-dialog${size === 'sm' ? ' assignment-dialog--sm' : ''}`}
            aria-labelledby={titleId}
            {...dialogAttrs}
        >
            <div className="assignment-dialog__header">
                <div className="assignment-dialog__title-row">
                    {icon}
                    <h1 id={titleId} className="assignment-dialog__title">
                        {title}
                    </h1>
                </div>
                <button
                    type="button"
                    className="assignment-dialog__close"
                    onClick={() => {
                        if (!busy) onClose();
                    }}
                    disabled={busy}
                    aria-label={`Close ${title}`}
                >
                    <IconX size={18} aria-hidden="true" />
                </button>
            </div>
            <div className="assignment-dialog__body">{children}</div>
        </dialog>
    );
};
