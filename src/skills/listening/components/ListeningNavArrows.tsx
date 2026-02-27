/**
 * ListeningNavArrows Component - IELTS CBT Style
 * 
 * Floating navigation arrows on the right side of the content area
 * for quick previous/next question navigation.
 * 
 * Layout:
 * ┌───────────────────────────────────────────────────┐
 * │ Content Area                              [←]     │
 * │                                           [→]     │
 * └───────────────────────────────────────────────────┘
 */

import React from 'react';

interface ListeningNavArrowsProps {
    currentQuestion: number;
    totalQuestions: number;
    onPrevious: () => void;
    onNext: () => void;
    disabled?: boolean;
}

export const ListeningNavArrows: React.FC<ListeningNavArrowsProps> = ({
    currentQuestion,
    totalQuestions,
    onPrevious,
    onNext,
    disabled = false,
}) => {
    const canGoPrevious = currentQuestion > 1 && !disabled;
    const canGoNext = currentQuestion < totalQuestions && !disabled;

    const buttonBaseStyle: React.CSSProperties = {
        width: '44px',
        height: '44px',
        border: 'none',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '20px',
        fontWeight: 'bold',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
    };

    return (
        <div
            style={{
                position: 'fixed',
                right: '20px',
                top: '50%',
                transform: 'translateY(-50%)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                zIndex: 80,
            }}
        >
            {/* Previous Arrow */}
            <button
                onClick={onPrevious}
                disabled={!canGoPrevious}
                aria-label="Previous question"
                title="Previous question"
                style={{
                    ...buttonBaseStyle,
                    backgroundColor: canGoPrevious ? '#374151' : '#e5e7eb',
                    color: canGoPrevious ? '#ffffff' : '#9ca3af',
                    cursor: canGoPrevious ? 'pointer' : 'not-allowed',
                    opacity: canGoPrevious ? 1 : 0.6,
                }}
                onMouseEnter={(e) => {
                    if (canGoPrevious) {
                        e.currentTarget.style.backgroundColor = '#1f2937';
                        e.currentTarget.style.transform = 'scale(1.05)';
                    }
                }}
                onMouseLeave={(e) => {
                    if (canGoPrevious) {
                        e.currentTarget.style.backgroundColor = '#374151';
                        e.currentTarget.style.transform = 'scale(1)';
                    }
                }}
            >
                ←
            </button>

            {/* Next Arrow */}
            <button
                onClick={onNext}
                disabled={!canGoNext}
                aria-label="Next question"
                title="Next question"
                style={{
                    ...buttonBaseStyle,
                    backgroundColor: canGoNext ? '#3b82f6' : '#e5e7eb',
                    color: canGoNext ? '#ffffff' : '#9ca3af',
                    cursor: canGoNext ? 'pointer' : 'not-allowed',
                    opacity: canGoNext ? 1 : 0.6,
                }}
                onMouseEnter={(e) => {
                    if (canGoNext) {
                        e.currentTarget.style.backgroundColor = '#2563eb';
                        e.currentTarget.style.transform = 'scale(1.05)';
                    }
                }}
                onMouseLeave={(e) => {
                    if (canGoNext) {
                        e.currentTarget.style.backgroundColor = '#3b82f6';
                        e.currentTarget.style.transform = 'scale(1)';
                    }
                }}
            >
                →
            </button>

            {/* Question Counter (optional tooltip) */}
            <div
                style={{
                    textAlign: 'center',
                    fontSize: '10px',
                    fontWeight: 600,
                    color: '#6b7280',
                    marginTop: '4px',
                }}
            >
                {currentQuestion}/{totalQuestions}
            </div>
        </div>
    );
};

export default ListeningNavArrows;
