import { useEffect, useState } from 'react';
import { Button } from '../modern';

interface BulkDeleteConfirmModalProps {
    isOpen: boolean;
    selectedCount: number;
    onClose: () => void;
    onConfirm: () => void;
    ariaLabel?: string;
    title?: string;
    description?: string;
    warningText?: string;
    confirmLabel?: string;
}

export function BulkDeleteConfirmModal({
    isOpen,
    selectedCount,
    onClose,
    onConfirm,
    ariaLabel = 'Confirm bulk homework archive',
    title,
    description,
    warningText,
    confirmLabel,
}: BulkDeleteConfirmModalProps) {
    const [confirmationText, setConfirmationText] = useState('');

    useEffect(() => {
        if (isOpen) {
            setConfirmationText('');
        }
    }, [isOpen]);

    if (!isOpen) {
        return null;
    }

    const canConfirm = confirmationText === 'DELETE';

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            onClick={(event) => {
                if (event.target === event.currentTarget) {
                    onClose();
                }
            }}
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 1300,
                background: 'rgba(15, 23, 42, 0.45)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1rem',
            }}
        >
            <div
                className="modal-fullscreen-mobile"
                style={{
                    width: 'min(560px, 100%)',
                    background: '#ffffff',
                    borderRadius: 24,
                    border: '1px solid rgba(226, 232, 240, 0.9)',
                    boxShadow: '0 24px 60px rgba(15, 23, 42, 0.18)',
                    overflow: 'hidden',
                }}
            >
                <div
                    style={{
                        padding: '1.25rem 1.5rem',
                        borderBottom: '1px solid #e2e8f0',
                    }}
                >
                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#7f1d1d' }}>
                        {title ?? `Archive ${selectedCount} homework assignments`}
                    </div>
                    <div style={{ marginTop: '0.35rem', color: '#7c2d12', fontSize: '0.94rem' }}>
                        {description ?? `This will archive ${selectedCount} homework assignments. They can be restored within 30 days.`}
                    </div>
                </div>

                <div style={{ padding: '1.5rem', display: 'grid', gap: '1rem' }}>
                    <div
                        style={{
                            borderRadius: 16,
                            padding: '1rem',
                            background: 'rgba(254,226,226,0.92)',
                            border: '1px solid rgba(239,68,68,0.2)',
                            color: '#b91c1c',
                            lineHeight: 1.5,
                        }}
                    >
                        {warningText ?? 'Archived homework is hidden from the default teacher list and will be permanently removed after the trash retention window expires.'}
                    </div>

                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                        <label htmlFor="bulk-delete-confirm-input" style={{ fontWeight: 700, color: '#1e293b' }}>
                            Type DELETE to confirm
                        </label>
                        <input
                            id="bulk-delete-confirm-input"
                            type="text"
                            value={confirmationText}
                            onChange={(event) => setConfirmationText(event.target.value)}
                            style={{
                                minHeight: 44,
                                borderRadius: 14,
                                border: '1px solid #fca5a5',
                                padding: '0.75rem 0.9rem',
                                color: '#7f1d1d',
                            }}
                        />
                    </div>
                </div>

                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: '0.75rem',
                        padding: '1rem 1.5rem 1.5rem',
                        borderTop: '1px solid #e2e8f0',
                    }}
                >
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button variant="danger" onClick={onConfirm} disabled={!canConfirm}>
                        {confirmLabel ?? 'Archive selected homework'}
                    </Button>
                </div>
            </div>
        </div>
    );
}

export default BulkDeleteConfirmModal;
