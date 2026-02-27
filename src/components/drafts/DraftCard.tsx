/**
 * DraftCard Component
 * 
 * Displays a single draft with metadata and action buttons.
 * Part of PRD-0022 Test Creation Modal with Draft Management.
 * 
 * Features:
 * - Displays title, format, level, duration, status
 * - Resume button → navigates to /teacher/test/review/:draftId
 * - Delete button with confirmation dialog
 * - Visual status indicators (metadata, parsing, review)
 * - Created at timestamp
 * 
 * @accessibility
 * - Keyboard navigable (Tab + Enter/Space for buttons)
 * - Screen reader labels for all interactive elements
 * - Focus visible states
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    IconFileText,
    IconTrash,
    IconPlayerPlay,
    IconClock,
    IconAlertTriangle,
} from '@tabler/icons-react';
import type { DraftListItem, DraftStatus, TestFormat } from '../../types/draft.types';

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────

const styles = {
    card: {
        background: 'rgba(255, 255, 255, 0.9)',
        backdropFilter: 'blur(10px)',
        borderRadius: '16px',
        border: '1px solid rgba(139, 92, 246, 0.2)',
        padding: '20px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)',
        transition: 'all 0.2s ease',
        display: 'flex',
        flexDirection: 'column' as const,
        gap: '16px',
    },
    cardHover: {
        transform: 'translateY(-2px)',
        boxShadow: '0 8px 30px rgba(139, 92, 246, 0.15)',
        borderColor: 'rgba(139, 92, 246, 0.4)',
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: '12px',
    },
    titleSection: {
        flex: 1,
        minWidth: 0,
    },
    title: {
        fontSize: '18px',
        fontWeight: 600,
        color: '#1e1b4b',
        margin: 0,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap' as const,
    },
    badge: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '4px 10px',
        borderRadius: '20px',
        fontSize: '12px',
        fontWeight: 500,
    },
    statusBadge: {
        metadata: {
            background: 'linear-gradient(135deg, #ddd6fe 0%, #c4b5fd 100%)',
            color: '#5b21b6',
        },
        parsing: {
            background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
            color: '#b45309',
        },
        review: {
            background: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)',
            color: '#047857',
        },
    } as Record<DraftStatus, { background: string; color: string }>,
    meta: {
        display: 'flex',
        flexWrap: 'wrap' as const,
        gap: '12px',
        fontSize: '14px',
        color: '#6b7280',
    },
    metaItem: {
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
    },
    formatBadge: {
        academic: {
            background: 'rgba(59, 130, 246, 0.1)',
            color: '#2563eb',
            padding: '2px 8px',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 500,
            textTransform: 'uppercase' as const,
        },
        general: {
            background: 'rgba(16, 185, 129, 0.1)',
            color: '#059669',
            padding: '2px 8px',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 500,
            textTransform: 'uppercase' as const,
        },
    } as Record<TestFormat, React.CSSProperties>,
    actions: {
        display: 'flex',
        gap: '12px',
        marginTop: 'auto',
    },
    button: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        padding: '10px 20px',
        borderRadius: '10px',
        fontSize: '14px',
        fontWeight: 500,
        cursor: 'pointer',
        border: 'none',
        transition: 'all 0.2s ease',
        flex: 1,
    },
    resumeButton: {
        background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
        color: 'white',
    },
    deleteButton: {
        background: 'transparent',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        color: '#dc2626',
    },
    // Confirmation dialog
    overlay: {
        position: 'fixed' as const,
        inset: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
    },
    dialog: {
        background: 'white',
        borderRadius: '16px',
        padding: '24px',
        maxWidth: '400px',
        width: '90%',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
    },
    dialogTitle: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        fontSize: '18px',
        fontWeight: 600,
        color: '#dc2626',
        marginBottom: '12px',
    },
    dialogText: {
        color: '#4b5563',
        marginBottom: '24px',
        lineHeight: 1.6,
    },
    dialogActions: {
        display: 'flex',
        gap: '12px',
        justifyContent: 'flex-end',
    },
    cancelButton: {
        padding: '10px 20px',
        borderRadius: '10px',
        border: '1px solid #e5e7eb',
        background: 'white',
        color: '#4b5563',
        cursor: 'pointer',
        fontSize: '14px',
        fontWeight: 500,
    },
    confirmDeleteButton: {
        padding: '10px 20px',
        borderRadius: '10px',
        border: 'none',
        background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
        color: 'white',
        cursor: 'pointer',
        fontSize: '14px',
        fontWeight: 500,
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT PROPS
// ─────────────────────────────────────────────────────────────────────────────

interface DraftCardProps {
    /** Draft data to display */
    draft: DraftListItem;

    /** Callback when delete is confirmed */
    onDelete: (draftId: string) => Promise<void>;

    /** Whether delete is in progress */
    isDeleting?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

const getStatusLabel = (status: DraftStatus): string => {
    switch (status) {
        case 'metadata':
            return 'Metadata';
        case 'parsing':
            return 'Parsing';
        case 'review':
            return 'Ready for Review';
        default:
            return status;
    }
};

const getFormatLabel = (format: TestFormat): string => {
    return format === 'academic' ? 'Academic' : 'General';
};

const formatDate = (date: Date): string => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    // Less than 1 minute
    if (diff < 60000) return 'Just now';

    // Less than 1 hour
    if (diff < 3600000) {
        const mins = Math.floor(diff / 60000);
        return `${mins}m ago`;
    }

    // Less than 24 hours
    if (diff < 86400000) {
        const hours = Math.floor(diff / 3600000);
        return `${hours}h ago`;
    }

    // Show date
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const DraftCard: React.FC<DraftCardProps> = ({
    draft,
    onDelete,
    isDeleting = false,
}) => {
    const navigate = useNavigate();
    const [isHovered, setIsHovered] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    const handleResume = () => {
        navigate(`/teacher/test/review/${draft.id}`);
    };

    const handleDeleteClick = () => {
        setShowDeleteConfirm(true);
    };

    const handleConfirmDelete = async () => {
        await onDelete(draft.id);
        setShowDeleteConfirm(false);
    };

    const handleCancelDelete = () => {
        setShowDeleteConfirm(false);
    };

    // Handle keyboard for card focus
    const handleKeyDown = (e: React.KeyboardEvent, action: () => void) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            action();
        }
    };

    return (
        <>
            <article
                style={{
                    ...styles.card,
                    ...(isHovered ? styles.cardHover : {}),
                }}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                aria-label={`Draft: ${draft.title}`}
            >
                {/* Header with title and status */}
                <div style={styles.header}>
                    <div style={styles.titleSection}>
                        <h3 style={styles.title} title={draft.title}>
                            {draft.title || 'Untitled Draft'}
                        </h3>
                    </div>
                    <span
                        style={{
                            ...styles.badge,
                            ...styles.statusBadge[draft.status],
                        }}
                    >
                        {getStatusLabel(draft.status)}
                    </span>
                </div>

                {/* Metadata row */}
                <div style={styles.meta}>
                    <span style={styles.formatBadge[draft.format]}>
                        {getFormatLabel(draft.format)}
                    </span>

                    {draft.cefrLevel && (
                        <span style={styles.metaItem}>
                            <strong>CEFR:</strong> {draft.cefrLevel}
                        </span>
                    )}

                    <span style={styles.metaItem}>
                        <IconClock size={16} />
                        {draft.duration} min
                    </span>

                    <span style={styles.metaItem}>
                        <IconFileText size={16} />
                        {draft.questionCount} Q
                    </span>

                    <span style={styles.metaItem}>
                        Created {formatDate(draft.createdAt)}
                    </span>
                </div>

                {/* Action buttons */}
                <div style={styles.actions}>
                    <button
                        style={{ ...styles.button, ...styles.resumeButton }}
                        onClick={handleResume}
                        onKeyDown={(e) => handleKeyDown(e, handleResume)}
                        aria-label={`Resume editing ${draft.title}`}
                    >
                        <IconPlayerPlay size={18} />
                        Resume
                    </button>

                    <button
                        style={{ ...styles.button, ...styles.deleteButton }}
                        onClick={handleDeleteClick}
                        onKeyDown={(e) => handleKeyDown(e, handleDeleteClick)}
                        disabled={isDeleting}
                        aria-label={`Delete draft ${draft.title}`}
                    >
                        <IconTrash size={18} />
                        Delete
                    </button>
                </div>
            </article>

            {/* Delete confirmation dialog */}
            {showDeleteConfirm && (
                <div
                    style={styles.overlay}
                    onClick={handleCancelDelete}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="delete-dialog-title"
                >
                    <div
                        style={styles.dialog}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div style={styles.dialogTitle} id="delete-dialog-title">
                            <IconAlertTriangle size={24} />
                            Delete Draft?
                        </div>

                        <p style={styles.dialogText}>
                            Are you sure you want to delete "<strong>{draft.title}</strong>"?
                            This action cannot be undone.
                        </p>

                        <div style={styles.dialogActions}>
                            <button
                                style={styles.cancelButton}
                                onClick={handleCancelDelete}
                                aria-label="Cancel delete"
                            >
                                Cancel
                            </button>
                            <button
                                style={styles.confirmDeleteButton}
                                onClick={handleConfirmDelete}
                                disabled={isDeleting}
                                aria-label="Confirm delete"
                            >
                                {isDeleting ? 'Deleting...' : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default DraftCard;
