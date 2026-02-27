/**
 * HeadphoneRequestPanel Component
 * 
 * Teacher's panel for managing headphone permission requests in offline mode.
 * Shows pending requests with approve/deny buttons.
 * 
 * @see PRD-0018: Unified Audio Architecture - Headphone Permissions
 */

import React, { useState } from 'react';
import type { PendingHeadphoneRequest } from '../../hooks/audio/useHeadphonePermission';

// ============================================================
// TYPES
// ============================================================

export interface HeadphoneRequestPanelProps {
    /** All headphone requests */
    requests: PendingHeadphoneRequest[];

    /** Callback to approve a request */
    onApprove: (studentId: string) => void;

    /** Callback to deny a request */
    onDeny: (studentId: string) => void;

    /** Callback to revoke an approved permission */
    onRevoke: (studentId: string) => void;

    /** Whether the panel is in collapsed state */
    collapsed?: boolean;

    /** Callback when collapse state changes */
    onToggleCollapse?: () => void;

    /** Custom class name */
    className?: string;
}

// ============================================================
// STYLES
// ============================================================

const styles: Record<string, React.CSSProperties> = {
    container: {
        backgroundColor: 'var(--bg-secondary, #f9fafb)',
        border: '1px solid var(--border-color, #e5e7eb)',
        borderRadius: '8px',
        overflow: 'hidden',
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.75rem 1rem',
        backgroundColor: 'var(--bg-tertiary, #f3f4f6)',
        cursor: 'pointer',
        userSelect: 'none' as const,
    },
    headerLeft: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
    },
    headerIcon: {
        fontSize: '1rem',
    },
    headerTitle: {
        fontWeight: 600,
        fontSize: '0.875rem',
        color: 'var(--text-primary, #1a1a2e)',
    },
    badge: {
        backgroundColor: 'var(--primary, #3b82f6)',
        color: 'white',
        padding: '0.125rem 0.5rem',
        borderRadius: '999px',
        fontSize: '0.75rem',
        fontWeight: 600,
        marginLeft: '0.5rem',
    },
    collapseIcon: {
        fontSize: '1rem',
        transition: 'transform 0.2s ease',
    },
    content: {
        padding: '0.75rem 1rem',
        maxHeight: '200px',
        overflowY: 'auto' as const,
    },
    emptyState: {
        textAlign: 'center' as const,
        color: 'var(--text-tertiary, #9ca3af)',
        fontSize: '0.875rem',
        padding: '1rem 0',
    },
    requestList: {
        display: 'flex',
        flexDirection: 'column' as const,
        gap: '0.5rem',
    },
    requestItem: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.5rem 0.75rem',
        backgroundColor: 'white',
        borderRadius: '6px',
        border: '1px solid var(--border-color, #e5e7eb)',
    },
    requestInfo: {
        display: 'flex',
        flexDirection: 'column' as const,
        gap: '0.125rem',
    },
    studentName: {
        fontWeight: 500,
        fontSize: '0.875rem',
        color: 'var(--text-primary, #1a1a2e)',
    },
    requestTime: {
        fontSize: '0.75rem',
        color: 'var(--text-tertiary, #9ca3af)',
    },
    status: {
        fontSize: '0.75rem',
        fontWeight: 500,
    },
    statusPending: {
        color: 'var(--warning, #f59e0b)',
    },
    statusApproved: {
        color: 'var(--success, #10b981)',
    },
    statusDenied: {
        color: 'var(--error, #ef4444)',
    },
    actions: {
        display: 'flex',
        gap: '0.375rem',
    },
    button: {
        padding: '0.375rem 0.625rem',
        borderRadius: '4px',
        border: 'none',
        cursor: 'pointer',
        fontSize: '0.75rem',
        fontWeight: 500,
        transition: 'all 0.15s ease',
    },
    approveBtn: {
        backgroundColor: 'var(--success, #10b981)',
        color: 'white',
    },
    denyBtn: {
        backgroundColor: 'var(--error, #ef4444)',
        color: 'white',
    },
    revokeBtn: {
        backgroundColor: 'var(--text-tertiary, #9ca3af)',
        color: 'white',
    },
};

// ============================================================
// HELPERS
// ============================================================

const formatTime = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;

    if (diff < 60000) {
        return 'Just now';
    } else if (diff < 3600000) {
        const mins = Math.floor(diff / 60000);
        return `${mins}m ago`;
    } else {
        return new Date(timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });
    }
};

// ============================================================
// COMPONENT
// ============================================================

export const HeadphoneRequestPanel: React.FC<HeadphoneRequestPanelProps> = ({
    requests,
    onApprove,
    onDeny,
    onRevoke,
    collapsed: controlledCollapsed,
    onToggleCollapse,
    className,
}) => {
    const [internalCollapsed, setInternalCollapsed] = useState(false);

    const collapsed = controlledCollapsed ?? internalCollapsed;
    const handleToggle = onToggleCollapse ?? (() => setInternalCollapsed(!internalCollapsed));

    const pendingCount = requests.filter(r => r.status === 'pending').length;
    const approvedCount = requests.filter(r => r.status === 'approved').length;

    // Group requests by status
    const pendingRequests = requests.filter(r => r.status === 'pending');
    const approvedRequests = requests.filter(r => r.status === 'approved');
    const allDisplayRequests = [...pendingRequests, ...approvedRequests];

    return (
        <div style={styles.container} className={className}>
            <div
                style={styles.header}
                onClick={handleToggle}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleToggle();
                    }
                }}
            >
                <div style={styles.headerLeft}>
                    <span style={styles.headerIcon}>🎧</span>
                    <span style={styles.headerTitle}>Headphone Requests</span>
                    {pendingCount > 0 && (
                        <span style={styles.badge}>{pendingCount} pending</span>
                    )}
                    {approvedCount > 0 && pendingCount === 0 && (
                        <span style={{ ...styles.badge, backgroundColor: 'var(--success, #10b981)' }}>
                            {approvedCount} active
                        </span>
                    )}
                </div>
                <span
                    style={{
                        ...styles.collapseIcon,
                        transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                    }}
                >
                    ▼
                </span>
            </div>

            {!collapsed && (
                <div style={styles.content}>
                    {allDisplayRequests.length === 0 ? (
                        <div style={styles.emptyState}>
                            No headphone requests
                        </div>
                    ) : (
                        <div style={styles.requestList}>
                            {allDisplayRequests.map((request) => (
                                <div key={request.studentId} style={styles.requestItem}>
                                    <div style={styles.requestInfo}>
                                        <span style={styles.studentName}>{request.studentName}</span>
                                        <span style={styles.requestTime}>
                                            {formatTime(request.requestedAt)}
                                            {' • '}
                                            <span
                                                style={{
                                                    ...styles.status,
                                                    ...(request.status === 'pending' ? styles.statusPending : {}),
                                                    ...(request.status === 'approved' ? styles.statusApproved : {}),
                                                    ...(request.status === 'denied' ? styles.statusDenied : {}),
                                                }}
                                            >
                                                {request.status === 'pending' && '⏳ Pending'}
                                                {request.status === 'approved' && '✅ Approved'}
                                                {request.status === 'denied' && '❌ Denied'}
                                            </span>
                                        </span>
                                    </div>

                                    <div style={styles.actions}>
                                        {request.status === 'pending' && (
                                            <>
                                                <button
                                                    style={{ ...styles.button, ...styles.approveBtn }}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onApprove(request.studentId);
                                                    }}
                                                    title="Approve request"
                                                >
                                                    ✓ Approve
                                                </button>
                                                <button
                                                    style={{ ...styles.button, ...styles.denyBtn }}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onDeny(request.studentId);
                                                    }}
                                                    title="Deny request"
                                                >
                                                    ✗ Deny
                                                </button>
                                            </>
                                        )}

                                        {request.status === 'approved' && (
                                            <button
                                                style={{ ...styles.button, ...styles.revokeBtn }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onRevoke(request.studentId);
                                                }}
                                                title="Revoke permission"
                                            >
                                                Revoke
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default HeadphoneRequestPanel;
