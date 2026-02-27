/**
 * TimeUpOverlay Component
 * 
 * Full-screen overlay displayed during the 5-second grace period
 * before auto-submission when student's test timer reaches zero.
 * 
 * PRD-0019: Test Duration End Flow
 * Requirement: FR-S1, FR-S2
 * 
 * @module components/test/TimeUpOverlay
 */

import React, { useState, useEffect, useRef } from 'react';

interface TimeUpOverlayProps {
    /** Callback when countdown completes */
    onComplete: () => void;
    /** Duration of countdown in seconds (default: 5) */
    countdownSeconds?: number;
    /** Optional message to display */
    message?: string;
}

/**
 * TimeUpOverlay - Displays a full-screen overlay with countdown
 * during the grace period before auto-submission
 */
export const TimeUpOverlay: React.FC<TimeUpOverlayProps> = ({
    onComplete,
    countdownSeconds = 5,
    message = 'Submitting your answers...',
}) => {
    const [remaining, setRemaining] = useState(countdownSeconds);
    const [progress, setProgress] = useState(100);
    const hasCompletedRef = useRef(false);

    useEffect(() => {
        // Start countdown
        const startTime = Date.now();
        const duration = countdownSeconds * 1000;

        const timer = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const remainingMs = Math.max(0, duration - elapsed);
            const remainingSec = Math.ceil(remainingMs / 1000);
            const progressPercent = (remainingMs / duration) * 100;

            setRemaining(remainingSec);
            setProgress(progressPercent);

            if (remainingMs <= 0 && !hasCompletedRef.current) {
                hasCompletedRef.current = true;
                clearInterval(timer);
                onComplete();
            }
        }, 100);

        return () => clearInterval(timer);
    }, [countdownSeconds, onComplete]);

    return (
        <div style={styles.overlay}>
            {/* Backdrop blur */}
            <div style={styles.backdrop} />

            {/* Content container */}
            <div style={styles.container}>
                {/* Clock icon with pulse animation */}
                <div style={styles.iconContainer}>
                    <span style={styles.icon}>⏰</span>
                </div>

                {/* Main heading */}
                <h1 style={styles.heading}>Time's Up!</h1>

                {/* Message */}
                <p style={styles.message}>{message}</p>

                {/* Countdown number */}
                <div style={styles.countdownNumber}>
                    {remaining}
                </div>

                {/* Progress bar container */}
                <div style={styles.progressContainer}>
                    <div
                        style={{
                            ...styles.progressBar,
                            width: `${progress}%`,
                        }}
                    />
                </div>

                {/* Warning text */}
                <p style={styles.warningText}>
                    Your work is being saved automatically.
                    <br />
                    Please do not close this page.
                </p>

                {/* Animated dots */}
                <div style={styles.dotsContainer}>
                    <span style={{ ...styles.dot, animationDelay: '0s' }}>●</span>
                    <span style={{ ...styles.dot, animationDelay: '0.2s' }}>●</span>
                    <span style={{ ...styles.dot, animationDelay: '0.4s' }}>●</span>
                </div>
            </div>

            {/* CSS Animations */}
            <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.1); opacity: 0.8; }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes dotPulse {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
        @keyframes progressGlow {
          0%, 100% { box-shadow: 0 0 10px rgba(239, 68, 68, 0.5); }
          50% { box-shadow: 0 0 20px rgba(239, 68, 68, 0.8); }
        }
      `}</style>
        </div>
    );
};

// Styles object
const styles: Record<string, React.CSSProperties> = {
    overlay: {
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    backdrop: {
        position: 'absolute',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
    },
    container: {
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '3rem 4rem',
        background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.9) 100%)',
        borderRadius: '1.5rem',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        maxWidth: '90vw',
        animation: 'fadeInUp 0.3s ease-out',
    },
    iconContainer: {
        marginBottom: '1rem',
        animation: 'pulse 1s ease-in-out infinite',
    },
    icon: {
        fontSize: '4rem',
        filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))',
    },
    heading: {
        fontSize: '2.5rem',
        fontWeight: 800,
        color: '#dc2626',
        margin: '0 0 0.5rem 0',
        textAlign: 'center',
        letterSpacing: '-0.02em',
    },
    message: {
        fontSize: '1.25rem',
        color: '#64748b',
        margin: '0 0 1.5rem 0',
        textAlign: 'center',
    },
    countdownNumber: {
        fontSize: '5rem',
        fontWeight: 900,
        color: '#dc2626',
        lineHeight: 1,
        marginBottom: '1.5rem',
        fontVariantNumeric: 'tabular-nums',
        textShadow: '0 4px 12px rgba(220, 38, 38, 0.3)',
    },
    progressContainer: {
        width: '300px',
        height: '8px',
        backgroundColor: '#fee2e2',
        borderRadius: '4px',
        overflow: 'hidden',
        marginBottom: '1.5rem',
    },
    progressBar: {
        height: '100%',
        backgroundColor: '#dc2626',
        borderRadius: '4px',
        transition: 'width 0.1s linear',
        animation: 'progressGlow 1s ease-in-out infinite',
    },
    warningText: {
        fontSize: '0.95rem',
        color: '#94a3b8',
        textAlign: 'center',
        margin: 0,
        lineHeight: 1.6,
    },
    dotsContainer: {
        display: 'flex',
        gap: '0.5rem',
        marginTop: '1.5rem',
    },
    dot: {
        fontSize: '0.75rem',
        color: '#dc2626',
        animation: 'dotPulse 1.4s ease-in-out infinite',
    },
};

export default TimeUpOverlay;
