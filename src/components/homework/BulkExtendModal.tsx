import { useEffect, useMemo, useState } from 'react';
import { Button } from '../modern';

interface BulkExtendModalProps {
    isOpen: boolean;
    selectedCount: number;
    onClose: () => void;
    onConfirm: (params: {
        mode: 'absolute' | 'relative';
        absoluteDate?: number;
        relativeHours?: number;
    }) => void;
}

type ExtendMode = 'absolute' | 'relative';

function formatDateTimeLocal(timestamp: number): string {
    const value = new Date(timestamp);
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    const hours = String(value.getHours()).padStart(2, '0');
    const minutes = String(value.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function BulkExtendModal({
    isOpen,
    selectedCount,
    onClose,
    onConfirm,
}: BulkExtendModalProps) {
    const [mode, setMode] = useState<ExtendMode>('relative');
    const [absoluteValue, setAbsoluteValue] = useState('');
    const [relativeHours, setRelativeHours] = useState('24');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        setMode('relative');
        setAbsoluteValue(formatDateTimeLocal(Date.now() + (24 * 60 * 60 * 1000)));
        setRelativeHours('24');
        setError(null);
    }, [isOpen]);

    const relativePresets = useMemo(
        () => [
            { label: '24h', value: '24' },
            { label: '3 days', value: '72' },
            { label: '1 week', value: '168' },
        ],
        []
    );

    if (!isOpen) {
        return null;
    }

    const handleConfirm = () => {
        if (mode === 'absolute') {
            const timestamp = new Date(absoluteValue).getTime();

            if (Number.isNaN(timestamp) || timestamp <= Date.now()) {
                setError('Choose a future deadline.');
                return;
            }

            onConfirm({
                mode,
                absoluteDate: timestamp,
            });
            return;
        }

        const hours = Number(relativeHours);
        if (!Number.isFinite(hours) || hours <= 0) {
            setError('Enter a valid number of hours to extend.');
            return;
        }

        onConfirm({
            mode,
            relativeHours: hours,
        });
    };

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label="Bulk extend homework deadlines"
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
                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                        Extend deadlines for {selectedCount} homework assignments
                    </div>
                    <div style={{ marginTop: '0.35rem', color: '#64748b', fontSize: '0.94rem' }}>
                        Choose a new shared deadline or extend each current deadline by a fixed number of hours.
                    </div>
                </div>

                <div style={{ padding: '1.5rem', display: 'grid', gap: '1.25rem' }}>
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <button
                            type="button"
                            onClick={() => {
                                setMode('absolute');
                                setError(null);
                            }}
                            style={{
                                padding: '0.7rem 1rem',
                                borderRadius: '999px',
                                border: mode === 'absolute' ? '1px solid rgba(99,102,241,0.35)' : '1px solid #cbd5e1',
                                background: mode === 'absolute' ? 'rgba(99,102,241,0.12)' : '#ffffff',
                                color: mode === 'absolute' ? '#4338ca' : '#475569',
                                fontWeight: 700,
                                cursor: 'pointer',
                            }}
                        >
                            Set new deadline
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setMode('relative');
                                setError(null);
                            }}
                            style={{
                                padding: '0.7rem 1rem',
                                borderRadius: '999px',
                                border: mode === 'relative' ? '1px solid rgba(16,185,129,0.35)' : '1px solid #cbd5e1',
                                background: mode === 'relative' ? 'rgba(16,185,129,0.12)' : '#ffffff',
                                color: mode === 'relative' ? '#047857' : '#475569',
                                fontWeight: 700,
                                cursor: 'pointer',
                            }}
                        >
                            Extend by
                        </button>
                    </div>

                    {mode === 'absolute' ? (
                        <div style={{ display: 'grid', gap: '0.5rem' }}>
                            <label style={{ fontWeight: 700, color: '#1e293b' }} htmlFor="bulk-extend-absolute">
                                New deadline
                            </label>
                            <input
                                id="bulk-extend-absolute"
                                type="datetime-local"
                                value={absoluteValue}
                                onChange={(event) => {
                                    setAbsoluteValue(event.target.value);
                                    setError(null);
                                }}
                                style={{
                                    minHeight: 44,
                                    borderRadius: 14,
                                    border: '1px solid #cbd5e1',
                                    padding: '0.75rem 0.9rem',
                                    color: '#1e293b',
                                }}
                            />
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gap: '0.9rem' }}>
                            <div style={{ fontWeight: 700, color: '#1e293b' }}>Choose an extension</div>
                            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                                {relativePresets.map((preset) => (
                                    <button
                                        key={preset.value}
                                        type="button"
                                        onClick={() => {
                                            setRelativeHours(preset.value);
                                            setError(null);
                                        }}
                                        style={{
                                            padding: '0.7rem 1rem',
                                            borderRadius: '999px',
                                            border: relativeHours === preset.value ? '1px solid rgba(16,185,129,0.35)' : '1px solid #cbd5e1',
                                            background: relativeHours === preset.value ? 'rgba(16,185,129,0.12)' : '#ffffff',
                                            color: relativeHours === preset.value ? '#047857' : '#475569',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                        }}
                                    >
                                        {preset.label}
                                    </button>
                                ))}
                            </div>
                            <div style={{ display: 'grid', gap: '0.5rem' }}>
                                <label style={{ fontWeight: 700, color: '#1e293b' }} htmlFor="bulk-extend-relative">
                                    Custom hours
                                </label>
                                <input
                                    id="bulk-extend-relative"
                                    type="number"
                                    min={1}
                                    step={1}
                                    value={relativeHours}
                                    onChange={(event) => {
                                        setRelativeHours(event.target.value);
                                        setError(null);
                                    }}
                                    style={{
                                        minHeight: 44,
                                        borderRadius: 14,
                                        border: '1px solid #cbd5e1',
                                        padding: '0.75rem 0.9rem',
                                        color: '#1e293b',
                                    }}
                                />
                            </div>
                        </div>
                    )}

                    {error ? (
                        <div
                            style={{
                                borderRadius: 14,
                                padding: '0.85rem 1rem',
                                background: 'rgba(254,226,226,0.9)',
                                border: '1px solid rgba(239,68,68,0.18)',
                                color: '#b91c1c',
                                fontWeight: 600,
                            }}
                        >
                            {error}
                        </div>
                    ) : null}
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
                    <Button variant="primary" onClick={handleConfirm}>
                        Extend selected homework
                    </Button>
                </div>
            </div>
        </div>
    );
}

export default BulkExtendModal;
