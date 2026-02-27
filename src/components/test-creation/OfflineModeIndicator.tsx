/**
 * OfflineModeIndicator Component
 * 
 * Displays a visual indicator when the user is offline.
 * Shows in the test creation flow to inform users that
 * AI features are unavailable and rule-based parsing is active.
 * 
 * @module OfflineModeIndicator
 * @version 1.0.0
 * @date 2026-02-06
 * @see PRD-0020 Phase 8, Task 8.8
 */

import React from 'react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface OfflineModeIndicatorProps {
    /** Position of the indicator */
    position?: 'top' | 'bottom' | 'inline';
    /** Whether to show expanded message */
    expanded?: boolean;
    /** Custom className */
    className?: string;
    /** Callback when user clicks retry (for reconnection) */
    onRetry?: () => void;
}

// ═══════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════

const styles: Record<string, React.CSSProperties> = {
    container: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 16px',
        borderRadius: '12px',
        background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.15) 0%, rgba(245, 158, 11, 0.1) 100%)',
        border: '1px solid rgba(251, 191, 36, 0.3)',
        backdropFilter: 'blur(8px)',
        animation: 'slideDown 0.3s ease-out',
    },
    containerTop: {
        position: 'fixed' as const,
        top: '16px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
    },
    containerBottom: {
        position: 'fixed' as const,
        bottom: '16px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
    },
    containerInline: {
        width: '100%',
        maxWidth: '600px',
        margin: '16px auto',
    },
    icon: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '40px',
        height: '40px',
        borderRadius: '10px',
        background: 'rgba(251, 191, 36, 0.2)',
        flexShrink: 0,
    },
    content: {
        flex: 1,
        minWidth: 0,
    },
    title: {
        fontSize: '14px',
        fontWeight: 600,
        color: '#F59E0B',
        margin: 0,
        lineHeight: 1.4,
    },
    message: {
        fontSize: '12px',
        color: 'rgba(255, 255, 255, 0.7)',
        margin: '4px 0 0 0',
        lineHeight: 1.4,
    },
    compactText: {
        fontSize: '13px',
        fontWeight: 500,
        color: '#F59E0B',
        margin: 0,
    },
    retryButton: {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '8px 12px',
        borderRadius: '8px',
        border: 'none',
        background: 'rgba(251, 191, 36, 0.2)',
        color: '#F59E0B',
        fontSize: '12px',
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        flexShrink: 0,
    },
    pulsingDot: {
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: '#F59E0B',
        animation: 'pulse 2s infinite',
    },
};

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

export const OfflineModeIndicator: React.FC<OfflineModeIndicatorProps> = ({
    position = 'inline',
    expanded = true,
    className = '',
    onRetry,
}) => {
    const isOnline = useOnlineStatus();

    // Don't render if online
    if (isOnline) {
        return null;
    }

    // Determine container style based on position
    const positionStyle = position === 'top'
        ? styles.containerTop
        : position === 'bottom'
            ? styles.containerBottom
            : styles.containerInline;

    return (
        <>
            {/* Keyframes for animations */}
            <style>
                {`
                    @keyframes slideDown {
                        from {
                            opacity: 0;
                            transform: translateX(-50%) translateY(-10px);
                        }
                        to {
                            opacity: 1;
                            transform: translateX(-50%) translateY(0);
                        }
                    }
                    
                    @keyframes pulse {
                        0%, 100% {
                            opacity: 1;
                            transform: scale(1);
                        }
                        50% {
                            opacity: 0.5;
                            transform: scale(0.9);
                        }
                    }
                    
                    .offline-retry-btn:hover {
                        background: rgba(251, 191, 36, 0.3) !important;
                    }
                `}
            </style>

            <div
                className={className}
                style={{ ...styles.container, ...positionStyle }}
                role="alert"
                aria-live="polite"
            >
                {/* Icon */}
                <div style={styles.icon}>
                    <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#F59E0B"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <line x1="1" y1="1" x2="23" y2="23" />
                        <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
                        <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
                        <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
                        <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
                        <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                        <line x1="12" y1="20" x2="12.01" y2="20" />
                    </svg>
                </div>

                {/* Content */}
                <div style={styles.content}>
                    {expanded ? (
                        <>
                            <p style={styles.title}>Offline Mode</p>
                            <p style={styles.message}>
                                AI extraction unavailable. Using rule-based parsing only.
                                Your work will be saved locally.
                            </p>
                        </>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={styles.pulsingDot} />
                            <p style={styles.compactText}>Offline Mode</p>
                        </div>
                    )}
                </div>

                {/* Retry Button */}
                {onRetry && (
                    <button
                        className="offline-retry-btn"
                        style={styles.retryButton}
                        onClick={onRetry}
                        aria-label="Check connection"
                    >
                        <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <polyline points="23 4 23 10 17 10" />
                            <polyline points="1 20 1 14 7 14" />
                            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                        </svg>
                        Retry
                    </button>
                )}
            </div>
        </>
    );
};

// ═══════════════════════════════════════════════════════════════
// COMPACT VERSION
// ═══════════════════════════════════════════════════════════════

/**
 * Compact offline indicator for use in headers/toolbars
 */
export const OfflineModeIndicatorCompact: React.FC<{ className?: string }> = ({ className }) => {
    const isOnline = useOnlineStatus();

    if (isOnline) return null;

    return (
        <div
            className={className}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 10px',
                borderRadius: '8px',
                background: 'rgba(251, 191, 36, 0.15)',
                border: '1px solid rgba(251, 191, 36, 0.3)',
            }}
            title="You are offline. AI features unavailable."
            role="status"
            aria-live="polite"
        >
            <div style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#F59E0B',
                animation: 'pulse 2s infinite',
            }} />
            <span style={{
                fontSize: '12px',
                fontWeight: 500,
                color: '#F59E0B',
            }}>
                Offline
            </span>
        </div>
    );
};

export default OfflineModeIndicator;
