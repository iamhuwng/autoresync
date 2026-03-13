/**
 * ExtendStudentDeadlineModal — Modal for extending a single student's deadline.
 * PRD-0034 Task 11.2
 *
 * Shows student name, current deadline, date-time picker, and confirm/cancel buttons.
 * Validates that the new deadline is in the future.
 */

import { useCallback, useMemo, useState } from 'react';
import { Button } from '../modern';
import './HomeworkMobilePolish.css';

interface ExtendStudentDeadlineModalProps {
    isOpen: boolean;
    studentName: string;
    currentDeadline: number;
    onClose: () => void;
    onConfirm: (newDeadline: number) => void;
}

function toInputValue(timestamp: number): string {
    const date = new Date(timestamp);
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(timestamp - offset).toISOString().slice(0, 16);
}

export default function ExtendStudentDeadlineModal({
    isOpen,
    studentName,
    currentDeadline,
    onClose,
    onConfirm,
}: ExtendStudentDeadlineModalProps) {
    const defaultValue = useMemo(() => {
        // Default to current deadline + 1 day for convenience
        return toInputValue(currentDeadline + 24 * 60 * 60 * 1000);
    }, [currentDeadline]);

    const [value, setValue] = useState(defaultValue);
    const [error, setError] = useState<string | null>(null);

    const handleConfirm = useCallback(() => {
        const parsed = new Date(value).getTime();

        if (isNaN(parsed)) {
            setError('Please select a valid date and time.');
            return;
        }

        if (parsed <= Date.now()) {
            setError('New deadline must be in the future.');
            return;
        }

        setError(null);
        onConfirm(parsed);
    }, [onConfirm, value]);

    if (!isOpen) {
        return null;
    }

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(15,23,42,0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1rem',
                zIndex: 50,
                animation: 'fadeIn 0.2s ease-out',
            }}
            onClick={onClose}
        >
            <div
                className="modal-fullscreen-mobile"
                style={{
                    width: '100%',
                    maxWidth: '440px',
                    borderRadius: '1.25rem',
                    background: '#ffffff',
                    boxShadow: '0 24px 48px rgba(15,23,42,0.18)',
                    padding: '1.5rem',
                    display: 'grid',
                    gap: '1.1rem',
                    animation: 'scaleIn 0.2s ease-out',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div style={{ display: 'grid', gap: '0.3rem' }}>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                        📌 Extend Deadline
                    </div>
                    <div style={{ color: '#64748b', fontSize: '0.92rem' }}>
                        Set a new deadline for <strong style={{ color: '#334155' }}>{studentName}</strong>
                    </div>
                </div>

                <div
                    style={{
                        padding: '0.9rem',
                        borderRadius: '0.75rem',
                        background: 'rgba(241,245,249,0.8)',
                        display: 'grid',
                        gap: '0.4rem',
                    }}
                >
                    <div style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>
                        Current deadline
                    </div>
                    <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.95rem' }}>
                        {new Date(currentDeadline).toLocaleString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                        })}
                    </div>
                </div>

                <div style={{ display: 'grid', gap: '0.4rem' }}>
                    <label
                        htmlFor="extend-deadline-input"
                        style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155' }}
                    >
                        New deadline
                    </label>
                    <input
                        id="extend-deadline-input"
                        type="datetime-local"
                        value={value}
                        onChange={(e) => {
                            setValue(e.target.value);
                            setError(null);
                        }}
                        style={{
                            width: '100%',
                            padding: '0.65rem 0.75rem',
                            borderRadius: '0.6rem',
                            border: `1.5px solid ${error ? '#ef4444' : 'rgba(148,163,184,0.3)'}`,
                            fontSize: '0.95rem',
                            color: '#0f172a',
                            outline: 'none',
                            transition: 'border-color 0.15s',
                        }}
                        onFocus={(e) => {
                            e.currentTarget.style.borderColor = '#8b5cf6';
                        }}
                        onBlur={(e) => {
                            e.currentTarget.style.borderColor = error ? '#ef4444' : 'rgba(148,163,184,0.3)';
                        }}
                    />
                    {error ? (
                        <div style={{ color: '#ef4444', fontSize: '0.82rem', fontWeight: 600 }}>
                            {error}
                        </div>
                    ) : null}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.3rem' }}>
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button variant="primary" onClick={handleConfirm}>
                        Extend Deadline
                    </Button>
                </div>
            </div>
        </div>
    );
}
