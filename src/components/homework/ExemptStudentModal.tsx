/**
 * ExemptStudentModal — Modal for exempting a student from a homework assignment.
 * PRD-0034 Task 11.3
 *
 * Shows student name, optional reason textarea, and explanation text.
 * On confirm, parent calls updateStudentOverride({ exempted: true, exemptReason: reason }).
 */

import { useCallback, useState } from 'react';
import { Button } from '../modern';
import './HomeworkMobilePolish.css';

interface ExemptStudentModalProps {
    isOpen: boolean;
    studentName: string;
    onClose: () => void;
    onConfirm: (reason: string) => void;
}

export default function ExemptStudentModal({
    isOpen,
    studentName,
    onClose,
    onConfirm,
}: ExemptStudentModalProps) {
    const [reason, setReason] = useState('');

    const handleConfirm = useCallback(() => {
        onConfirm(reason.trim());
    }, [onConfirm, reason]);

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
                        🎓 Exempt Student
                    </div>
                    <div style={{ color: '#64748b', fontSize: '0.92rem' }}>
                        Exempt <strong style={{ color: '#334155' }}>{studentName}</strong> from this assignment
                    </div>
                </div>

                <div
                    style={{
                        padding: '0.8rem 0.9rem',
                        borderRadius: '0.75rem',
                        background: 'rgba(245,158,11,0.08)',
                        border: '1px solid rgba(245,158,11,0.18)',
                        color: '#92400e',
                        fontSize: '0.85rem',
                        lineHeight: 1.55,
                    }}
                >
                    Exempted students are excluded from completion rate calculations.
                    Their status will show as "Exempted" in the submission table.
                </div>

                <div style={{ display: 'grid', gap: '0.4rem' }}>
                    <label
                        htmlFor="exempt-reason-input"
                        style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155' }}
                    >
                        Reason <span style={{ color: '#94a3b8', fontWeight: 500 }}>(optional)</span>
                    </label>
                    <textarea
                        id="exempt-reason-input"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="e.g. Medical absence, transfer student, modified curriculum…"
                        rows={3}
                        style={{
                            width: '100%',
                            padding: '0.65rem 0.75rem',
                            borderRadius: '0.6rem',
                            border: '1.5px solid rgba(148,163,184,0.3)',
                            fontSize: '0.9rem',
                            color: '#0f172a',
                            resize: 'vertical',
                            fontFamily: 'inherit',
                            outline: 'none',
                            transition: 'border-color 0.15s',
                        }}
                        onFocus={(e) => {
                            e.currentTarget.style.borderColor = '#8b5cf6';
                        }}
                        onBlur={(e) => {
                            e.currentTarget.style.borderColor = 'rgba(148,163,184,0.3)';
                        }}
                    />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.3rem' }}>
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button variant="primary" onClick={handleConfirm}>
                        Exempt Student
                    </Button>
                </div>
            </div>
        </div>
    );
}
