/**
 * DraftsListView Component
 * 
 * Displays a list of user's drafts with loading, empty, and error states.
 * Part of PRD-0022 Test Creation Modal with Draft Management.
 * 
 * Features:
 * - Grid/list layout for drafts
 * - Loading skeleton state
 * - Empty state with call to action
 * - Error state with retry
 * - Draft count badge in header
 * 
 * @accessibility
 * - Keyboard navigation through draft cards
 * - Screen reader announcements for loading/empty/error states
 * - Proper headings hierarchy
 */

import React, { useEffect, useState } from 'react';
import {
    IconRefresh,
    IconPlus,
    IconMoodEmpty,
    IconAlertCircle,
} from '@tabler/icons-react';
import { DraftCard } from './DraftCard';
import { testDraftService } from '../../services/draftCloudService';
import type { DraftListItem } from '../../types/draft.types';

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────

const styles = {
    container: {
        padding: '24px',
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px',
    },
    titleSection: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
    },
    title: {
        fontSize: '24px',
        fontWeight: 600,
        color: '#1e1b4b',
        margin: 0,
    },
    countBadge: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: '28px',
        height: '28px',
        padding: '0 10px',
        borderRadius: '14px',
        background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
        color: 'white',
        fontSize: '14px',
        fontWeight: 600,
    },
    refreshButton: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 20px',
        borderRadius: '10px',
        border: '1px solid rgba(139, 92, 246, 0.3)',
        background: 'white',
        color: '#6366f1',
        fontSize: '14px',
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
    },
    grid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
        gap: '20px',
    },
    // Loading state
    loadingContainer: {
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 20px',
        gap: '16px',
    },
    loadingIcon: {
        animation: 'spin 1s linear infinite',
        color: '#8b5cf6',
    },
    loadingText: {
        color: '#6b7280',
        fontSize: '16px',
    },
    // Empty state
    emptyContainer: {
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
        justifyContent: 'center',
        padding: '80px 20px',
        textAlign: 'center' as const,
    },
    emptyIcon: {
        width: '80px',
        height: '80px',
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '24px',
    },
    emptyTitle: {
        fontSize: '20px',
        fontWeight: 600,
        color: '#1e1b4b',
        marginBottom: '8px',
    },
    emptyText: {
        color: '#6b7280',
        fontSize: '16px',
        marginBottom: '24px',
        maxWidth: '400px',
    },
    createButton: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: '14px 28px',
        borderRadius: '12px',
        border: 'none',
        background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
        color: 'white',
        fontSize: '16px',
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)',
    },
    // Error state
    errorContainer: {
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 20px',
        textAlign: 'center' as const,
    },
    errorIcon: {
        width: '64px',
        height: '64px',
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '20px',
    },
    errorTitle: {
        fontSize: '18px',
        fontWeight: 600,
        color: '#dc2626',
        marginBottom: '8px',
    },
    errorText: {
        color: '#6b7280',
        fontSize: '14px',
        marginBottom: '20px',
    },
    retryButton: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: '12px 24px',
        borderRadius: '10px',
        border: 'none',
        background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
        color: 'white',
        fontSize: '14px',
        fontWeight: 500,
        cursor: 'pointer',
    },
    // Skeleton
    skeletonCard: {
        background: 'rgba(255, 255, 255, 0.9)',
        borderRadius: '16px',
        border: '1px solid rgba(139, 92, 246, 0.1)',
        padding: '20px',
        animation: 'pulse 1.5s ease-in-out infinite',
    },
    skeletonTitle: {
        height: '24px',
        width: '60%',
        background: 'linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%)',
        borderRadius: '6px',
        marginBottom: '16px',
    },
    skeletonMeta: {
        height: '16px',
        width: '40%',
        background: 'linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%)',
        borderRadius: '4px',
        marginBottom: '12px',
    },
    skeletonButton: {
        height: '44px',
        width: '100%',
        background: 'linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%)',
        borderRadius: '10px',
        marginTop: '16px',
    },
};

// Add keyframes for animations
const keyframesStyle = `
@keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
}
@keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
}
`;

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT PROPS
// ─────────────────────────────────────────────────────────────────────────────

interface DraftsListViewProps {
    /** Current user's ID */
    userId: string;

    /** Callback to create a new draft */
    onCreateNew?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// SKELETON COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const DraftCardSkeleton: React.FC = () => (
    <div style={styles.skeletonCard} aria-hidden="true">
        <div style={styles.skeletonTitle} />
        <div style={styles.skeletonMeta} />
        <div style={{ ...styles.skeletonMeta, width: '30%' }} />
        <div style={styles.skeletonButton} />
    </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const DraftsListView: React.FC<DraftsListViewProps> = ({
    userId,
    onCreateNew,
}) => {
    const [drafts, setDrafts] = useState<DraftListItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    // ─────────────────────────────────────────────────────────────────────────
    // DATA FETCHING
    // ─────────────────────────────────────────────────────────────────────────

    const fetchDrafts = async () => {
        if (!userId) return;

        setIsLoading(true);
        setError(null);

        try {
            const response = await testDraftService.getUserDrafts(userId);

            if (response.success && response.data) {
                setDrafts(response.data);
            } else {
                throw new Error(response.error || 'Failed to load drafts');
            }
        } catch (err) {
            console.error('❌ [DraftsListView] Failed to fetch drafts:', err);
            setError(err instanceof Error ? err.message : 'Failed to load drafts');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchDrafts();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId]);

    // ─────────────────────────────────────────────────────────────────────────
    // DELETE HANDLER
    // ─────────────────────────────────────────────────────────────────────────

    const handleDelete = async (draftId: string) => {
        setDeletingId(draftId);

        try {
            const response = await testDraftService.deleteDraft(draftId);

            if (response.success) {
                // Remove from local state
                setDrafts((prev) => prev.filter((d) => d.id !== draftId));
                console.log('✅ [DraftsListView] Draft deleted:', draftId);
            } else {
                throw new Error(response.error || 'Failed to delete draft');
            }
        } catch (err) {
            console.error('❌ [DraftsListView] Delete failed:', err);
            alert(err instanceof Error ? err.message : 'Failed to delete draft');
        } finally {
            setDeletingId(null);
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER STATES
    // ─────────────────────────────────────────────────────────────────────────

    // Inject keyframes
    useEffect(() => {
        const styleEl = document.createElement('style');
        styleEl.textContent = keyframesStyle;
        document.head.appendChild(styleEl);
        return () => {
            document.head.removeChild(styleEl);
        };
    }, []);

    // Loading state
    if (isLoading) {
        return (
            <div style={styles.container}>
                <div style={styles.header}>
                    <div style={styles.titleSection}>
                        <h2 style={styles.title}>Your Drafts</h2>
                    </div>
                </div>
                <div style={styles.grid} aria-label="Loading drafts">
                    <DraftCardSkeleton />
                    <DraftCardSkeleton />
                    <DraftCardSkeleton />
                </div>
                <p className="sr-only" aria-live="polite">Loading your drafts...</p>
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div style={styles.container}>
                <div style={styles.header}>
                    <div style={styles.titleSection}>
                        <h2 style={styles.title}>Your Drafts</h2>
                    </div>
                </div>
                <div style={styles.errorContainer} role="alert">
                    <div style={styles.errorIcon}>
                        <IconAlertCircle size={32} color="#dc2626" />
                    </div>
                    <h3 style={styles.errorTitle}>Failed to Load Drafts</h3>
                    <p style={styles.errorText}>{error}</p>
                    <button style={styles.retryButton} onClick={fetchDrafts}>
                        <IconRefresh size={18} />
                        Try Again
                    </button>
                </div>
            </div>
        );
    }

    // Empty state
    if (drafts.length === 0) {
        return (
            <div style={styles.container}>
                <div style={styles.header}>
                    <div style={styles.titleSection}>
                        <h2 style={styles.title}>Your Drafts</h2>
                        <span style={styles.countBadge}>0</span>
                    </div>
                </div>
                <div style={styles.emptyContainer}>
                    <div style={styles.emptyIcon}>
                        <IconMoodEmpty size={40} color="#8b5cf6" />
                    </div>
                    <h3 style={styles.emptyTitle}>No Drafts Yet</h3>
                    <p style={styles.emptyText}>
                        Start creating a new test and it will automatically save as a draft.
                        You can resume editing anytime.
                    </p>
                    {onCreateNew && (
                        <button style={styles.createButton} onClick={onCreateNew}>
                            <IconPlus size={20} />
                            Create New Test
                        </button>
                    )}
                </div>
            </div>
        );
    }

    // Normal state with drafts
    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <div style={styles.titleSection}>
                    <h2 style={styles.title}>Your Drafts</h2>
                    <span style={styles.countBadge} aria-label={`${drafts.length} drafts`}>
                        {drafts.length}
                    </span>
                </div>
                <button style={styles.refreshButton} onClick={fetchDrafts}>
                    <IconRefresh size={18} />
                    Refresh
                </button>
            </div>

            <div style={styles.grid} role="list" aria-label="Drafts list">
                {drafts.map((draft) => (
                    <DraftCard
                        key={draft.id}
                        draft={draft}
                        onDelete={handleDelete}
                        isDeleting={deletingId === draft.id}
                    />
                ))}
            </div>
        </div>
    );
};

export default DraftsListView;
