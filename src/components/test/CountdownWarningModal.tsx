/**
 * CountdownWarningModal Component
 * PRD-0019: Teacher-side countdown warning before auto-ending test
 * 
 * Shows a 10-second countdown modal to teachers when test time is about to expire.
 * Allows teachers to cancel the countdown or end the test immediately.
 */

import React, { useEffect, useState } from 'react';

export interface CountdownWarningModalProps {
    /** Current countdown in seconds */
    countdownSeconds: number;

    /** Number of students with extra time accommodations */
    accommodatedCount: number;

    /** Callback when teacher cancels the countdown */
    onCancel: () => void;

    /** Callback when teacher clicks "End Now" */
    onEndNow: () => void;

    /** Callback when countdown reaches 0 */
    onCountdownComplete: () => void;
}

export const CountdownWarningModal: React.FC<CountdownWarningModalProps> = ({
    countdownSeconds,
    accommodatedCount,
    onCancel,
    onEndNow,
    onCountdownComplete,
}) => {
    const [localCountdown, setLocalCountdown] = useState(countdownSeconds);

    // Update local countdown when prop changes
    useEffect(() => {
        setLocalCountdown(countdownSeconds);
    }, [countdownSeconds]);

    // Auto-complete when countdown reaches 0
    useEffect(() => {
        if (localCountdown <= 0) {
            console.log('⏰ [CountdownWarningModal] Countdown complete, triggering auto-end');
            onCountdownComplete();
        }
    }, [localCountdown, onCountdownComplete]);

    // Countdown timer
    useEffect(() => {
        if (localCountdown <= 0) return;

        const timer = setInterval(() => {
            setLocalCountdown(prev => Math.max(0, prev - 1));
        }, 1000);

        return () => clearInterval(timer);
    }, [localCountdown]);

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            backdropFilter: 'blur(4px)',
        }}>
            <div style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                borderRadius: '1rem',
                padding: '2rem',
                maxWidth: '500px',
                width: '90%',
                boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
                color: 'white',
                animation: 'slideIn 0.3s ease-out',
            }}>
                {/* Countdown Display */}
                <div style={{
                    textAlign: 'center',
                    marginBottom: '1.5rem',
                }}>
                    <div style={{
                        fontSize: '4rem',
                        fontWeight: 'bold',
                        marginBottom: '0.5rem',
                        textShadow: '0 2px 10px rgba(0, 0, 0, 0.2)',
                    }}>
                        {localCountdown}
                    </div>
                    <div style={{
                        fontSize: '1.5rem',
                        fontWeight: 600,
                        marginBottom: '0.5rem',
                    }}>
                        ⏰ Test ending in {localCountdown} second{localCountdown !== 1 ? 's' : ''}...
                    </div>
                </div>

                {/* Progress Bar */}
                <div style={{
                    width: '100%',
                    height: '8px',
                    backgroundColor: 'rgba(255, 255, 255, 0.3)',
                    borderRadius: '4px',
                    overflow: 'hidden',
                    marginBottom: '1.5rem',
                }}>
                    <div style={{
                        height: '100%',
                        backgroundColor: 'white',
                        width: `${(localCountdown / 10) * 100}%`,
                        transition: 'width 1s linear',
                        boxShadow: '0 0 10px rgba(255, 255, 255, 0.5)',
                    }} />
                </div>

                {/* Message */}
                <div style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.15)',
                    borderRadius: '0.5rem',
                    padding: '1rem',
                    marginBottom: '1.5rem',
                    fontSize: '0.9375rem',
                    lineHeight: '1.6',
                }}>
                    <div style={{ marginBottom: '0.75rem' }}>
                        <strong>All base students</strong> will be auto-submitted and redirected to results.
                    </div>

                    {accommodatedCount > 0 && (
                        <div style={{
                            paddingTop: '0.75rem',
                            borderTop: '1px solid rgba(255, 255, 255, 0.2)',
                        }}>
                            <strong>📋 {accommodatedCount} student{accommodatedCount !== 1 ? 's' : ''}</strong> with extra time will continue after this countdown.
                        </div>
                    )}
                </div>

                {/* Action Buttons */}
                <div style={{
                    display: 'flex',
                    gap: '1rem',
                    justifyContent: 'center',
                }}>
                    <button
                        onClick={onCancel}
                        style={{
                            flex: 1,
                            padding: '0.875rem 1.5rem',
                            background: 'rgba(255, 255, 255, 0.2)',
                            border: '2px solid white',
                            borderRadius: '0.5rem',
                            color: 'white',
                            fontSize: '1rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
                            e.currentTarget.style.transform = 'translateY(-2px)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                            e.currentTarget.style.transform = 'translateY(0)';
                        }}
                    >
                        Cancel Countdown
                    </button>

                    <button
                        onClick={onEndNow}
                        style={{
                            flex: 1,
                            padding: '0.875rem 1.5rem',
                            background: 'white',
                            border: 'none',
                            borderRadius: '0.5rem',
                            color: '#667eea',
                            fontSize: '1rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.2)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
                        }}
                    >
                        End Now
                    </button>
                </div>
            </div>

            {/* Keyframes for slide-in animation */}
            <style>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-20px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
        </div>
    );
};
