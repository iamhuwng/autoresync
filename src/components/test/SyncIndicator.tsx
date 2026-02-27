/**
 * SyncIndicator Component
 * 
 * Visual indicator shown when student audio is syncing to teacher's position.
 * Displays a subtle "Syncing..." message with animation.
 * 
 * @see PRD-0018: Unified Audio Architecture - Online Mode Sync
 */

import React from 'react';

// ============================================================
// TYPES
// ============================================================

export interface SyncIndicatorProps {
    /** Whether currently syncing */
    isSyncing: boolean;

    /** Optional custom message */
    message?: string;

    /** Whether teacher appears disconnected */
    isTeacherDisconnected?: boolean;

    /** Custom class name */
    className?: string;
}

// ============================================================
// STYLES
// ============================================================

const styles: Record<string, React.CSSProperties> = {
    container: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.5rem 0.75rem',
        borderRadius: '6px',
        fontSize: '0.8125rem',
        fontWeight: 500,
        transition: 'all 0.3s ease',
    },
    syncing: {
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        color: 'var(--primary, #3b82f6)',
        border: '1px solid rgba(59, 130, 246, 0.2)',
    },
    disconnected: {
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        color: 'var(--warning, #f59e0b)',
        border: '1px solid rgba(245, 158, 11, 0.2)',
    },
    hidden: {
        opacity: 0,
        visibility: 'hidden' as const,
        height: 0,
        padding: 0,
        margin: 0,
        overflow: 'hidden',
    },
    icon: {
        display: 'inline-flex',
        animation: 'pulse 1.5s ease-in-out infinite',
    },
    text: {
        whiteSpace: 'nowrap' as const,
    },
};

// Keyframes for pulse animation (inject into document if not exists)
const injectStyles = () => {
    const styleId = 'sync-indicator-styles';
    if (document.getElementById(styleId)) return;

    const styleSheet = document.createElement('style');
    styleSheet.id = styleId;
    styleSheet.textContent = `
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .sync-indicator-spin {
      animation: spin 1s linear infinite;
    }
  `;
    document.head.appendChild(styleSheet);
};

// ============================================================
// COMPONENT
// ============================================================

export const SyncIndicator: React.FC<SyncIndicatorProps> = ({
    isSyncing,
    message,
    isTeacherDisconnected = false,
    className,
}) => {
    // Inject animation styles on mount
    React.useEffect(() => {
        injectStyles();
    }, []);

    // Determine what to show
    const shouldShow = isSyncing || isTeacherDisconnected;

    if (!shouldShow) {
        return null;
    }

    // Disconnected state takes priority
    if (isTeacherDisconnected) {
        return (
            <div
                style={{
                    ...styles.container,
                    ...styles.disconnected,
                }}
                className={className}
                role="status"
                aria-live="polite"
            >
                <span style={styles.icon}>📡</span>
                <span style={styles.text}>Teacher connection lost, continuing...</span>
            </div>
        );
    }

    // Syncing state
    return (
        <div
            style={{
                ...styles.container,
                ...styles.syncing,
            }}
            className={className}
            role="status"
            aria-live="polite"
        >
            <span className="sync-indicator-spin" style={{ display: 'inline-flex' }}>🔄</span>
            <span style={styles.text}>{message || 'Syncing...'}</span>
        </div>
    );
};

export default SyncIndicator;
