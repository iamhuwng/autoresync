import React from 'react';
import type { SoloSessionProgress } from '../../types/practice.types';

interface SoloResumeModalProps {
    opened: boolean;
    onResume: () => void;
    onStartNew: () => void;
    onClose: () => void;
    savedProgress: SoloSessionProgress;
    totalQuestions: number;
}

export const SoloResumeModal: React.FC<SoloResumeModalProps> = ({
    opened,
    onResume,
    onStartNew,
    onClose,
    savedProgress,
    totalQuestions,
}) => {
    const answeredCount = savedProgress?.answers ? Object.keys(savedProgress.answers).length : 0;

    const formattedDate = React.useMemo(() => {
        if (!savedProgress?.startedAt) return 'Unknown Date';
        return new Date(savedProgress.startedAt).toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
        });
    }, [savedProgress]);

    if (!opened) {
        return null;
    }

    return (
        <>
            <div
                aria-hidden="true"
                onClick={onClose}
                style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(17, 24, 39, 0.45)',
                    zIndex: 1000,
                }}
            />
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="solo-resume-modal-title"
                style={{
                    position: 'fixed',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: 'min(420px, calc(100vw - 24px))',
                    maxWidth: 'calc(100vw - 24px)',
                    maxHeight: 'calc(100vh - 24px)',
                    background: '#ffffff',
                    borderRadius: 16,
                    border: '1px solid #e5e7eb',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
                    padding: 24,
                    overflowY: 'auto',
                    WebkitOverflowScrolling: 'touch',
                    zIndex: 1001,
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 16 }}>
                    <h2
                        id="solo-resume-modal-title"
                        style={{
                            margin: 0,
                            fontSize: '1.125rem',
                            fontWeight: 700,
                            color: '#111827',
                        }}
                    >
                        Resume Practice?
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close dialog"
                        style={{
                            border: 'none',
                            background: 'transparent',
                            color: '#6b7280',
                            cursor: 'pointer',
                            fontSize: '1rem',
                            lineHeight: 1,
                            minWidth: 44,
                            minHeight: 44,
                            padding: 0,
                        }}
                    >
                        X
                    </button>
                </div>

                <p style={{ margin: '16px 0 0', fontSize: '0.9375rem', lineHeight: 1.6, color: '#374151' }}>
                    You have an in-progress session from <strong>{formattedDate}</strong>.
                </p>
                <p style={{ margin: '12px 0 0', fontSize: '0.9375rem', lineHeight: 1.6, color: '#374151' }}>
                    You have <strong>{answeredCount}{totalQuestions > 0 ? `/${totalQuestions}` : ''}</strong> questions answered so far.
                </p>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        onClick={onStartNew}
                        style={{
                            minWidth: 44,
                            minHeight: 44,
                            padding: '10px 16px',
                            borderRadius: 999,
                            border: '1px solid #d1d5db',
                            background: '#ffffff',
                            color: '#374151',
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                        }}
                    >
                        Start New
                    </button>
                    <button
                        type="button"
                        onClick={onResume}
                        style={{
                            minWidth: 44,
                            minHeight: 44,
                            padding: '10px 16px',
                            borderRadius: 999,
                            border: 'none',
                            background: '#4f46e5',
                            color: '#ffffff',
                            fontWeight: 700,
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                        }}
                    >
                        Resume
                    </button>
                </div>
            </div>
        </>
    );
};
