/**
 * THCSSubmitConfirmation — Submit dialog (PRD-0027 Task 5.6)
 */
import React from 'react';

interface THCSSubmitConfirmationProps {
    opened: boolean;
    unansweredCount: number;
    totalCount: number;
    onConfirm: () => void;
    onCancel: () => void;
}

const THCSSubmitConfirmation: React.FC<THCSSubmitConfirmationProps> = ({
    opened, unansweredCount, totalCount, onConfirm, onCancel,
}) => {
    if (!opened) return null;

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(4px)',
        }} onClick={onCancel}>
            <div style={{
                background: 'white', borderRadius: '1rem', padding: '1.5rem',
                width: '100%', maxWidth: '400px',
                boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
                margin: '1rem',
            }} onClick={(e) => e.stopPropagation()}>
                <h2 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem', color: '#1e293b' }}>
                    Submit Test
                </h2>
                <div style={{ fontSize: '0.9375rem', color: '#475569', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                    {unansweredCount > 0
                        ? `You have ${unansweredCount} unanswered question${unansweredCount > 1 ? 's' : ''} out of ${totalCount}. Submit anyway?`
                        : 'Are you sure you want to submit? You cannot change your answers after submission.'}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                    <button
                        onClick={onCancel}
                        style={{
                            padding: '0.5rem 1rem', borderRadius: '0.5rem', border: 'none',
                            background: 'transparent', color: '#64748b', fontWeight: 600,
                            cursor: 'pointer'
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        style={{
                            padding: '0.5rem 1rem', borderRadius: '0.5rem', border: 'none',
                            background: '#8b5cf6', color: 'white', fontWeight: 600,
                            cursor: 'pointer'
                        }}
                    >
                        {unansweredCount > 0 ? 'Submit Anyway' : 'Submit'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default THCSSubmitConfirmation;
