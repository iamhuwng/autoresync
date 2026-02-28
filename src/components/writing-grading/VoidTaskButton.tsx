/**
 * VoidTaskButton — PRD-0030 Task 5.7
 * Button to void/unvoid a writing task.
 * Voiding requires a reason (min 10 chars) + confirmation.
 * NO MANTINE.
 */

import { useState } from 'react';

interface VoidTaskButtonProps {
    taskNumber: 1 | 2;
    isVoided: boolean;
    voidReason?: string;
    onVoid: (reason: string) => void;
    onUnvoid: () => void;
}

export default function VoidTaskButton({
    taskNumber,
    isVoided,
    voidReason,
    onVoid,
    onUnvoid,
}: VoidTaskButtonProps) {
    const [expanded, setExpanded] = useState(false);
    const [reason, setReason] = useState('');

    const handleConfirmVoid = () => {
        if (reason.trim().length < 10) return;
        onVoid(reason.trim());
        setExpanded(false);
        setReason('');
    };

    if (isVoided) {
        return (
            <div style={{
                padding: '10px 14px',
                borderRadius: '8px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
            }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                }}>
                    <div>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#dc2626' }}>
                            🚫 Task {taskNumber} Voided
                        </span>
                        {voidReason && (
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>
                                Reason: {voidReason}
                            </div>
                        )}
                    </div>
                    <button
                        onClick={onUnvoid}
                        style={{
                            padding: '4px 12px',
                            borderRadius: '6px',
                            border: '1px solid #93c5fd',
                            background: '#eff6ff',
                            color: '#2563eb',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                        }}
                    >
                        ↩ Undo Void
                    </button>
                </div>
            </div>
        );
    }

    if (!expanded) {
        return (
            <button
                onClick={() => setExpanded(true)}
                style={{
                    padding: '6px 14px',
                    borderRadius: '8px',
                    border: '1px solid #fecaca',
                    background: '#fff',
                    color: '#dc2626',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                }}
            >
                🚫 Void Task {taskNumber}
            </button>
        );
    }

    return (
        <div style={{
            padding: '12px',
            borderRadius: '8px',
            border: '1px solid #fecaca',
            background: '#fff',
        }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#dc2626', marginBottom: '6px' }}>
                Void Task {taskNumber}
            </div>
            <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Reason for voiding (min 10 characters)..."
                rows={2}
                style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '6px',
                    border: '1px solid #e2e8f0',
                    fontSize: '0.8rem',
                    resize: 'vertical',
                    fontFamily: 'inherit',
                    marginBottom: '6px',
                }}
            />
            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                <button
                    onClick={() => { setExpanded(false); setReason(''); }}
                    style={{
                        padding: '4px 12px', borderRadius: '6px', border: '1px solid #e2e8f0',
                        background: '#fff', fontSize: '0.75rem', cursor: 'pointer',
                    }}
                >Cancel</button>
                <button
                    onClick={handleConfirmVoid}
                    disabled={reason.trim().length < 10}
                    style={{
                        padding: '4px 12px', borderRadius: '6px', border: 'none',
                        background: reason.trim().length >= 10 ? '#dc2626' : '#fca5a5',
                        color: '#fff', fontSize: '0.75rem', fontWeight: 600,
                        cursor: reason.trim().length >= 10 ? 'pointer' : 'not-allowed',
                    }}
                >Confirm Void</button>
            </div>
            <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: '4px' }}>
                {reason.trim().length}/10 characters minimum
            </div>
        </div>
    );
}
