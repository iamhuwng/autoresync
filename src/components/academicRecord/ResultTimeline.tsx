import React, { useMemo, useState } from 'react';
import { IconInbox } from '@tabler/icons-react';
import { AcademicRecordResultRow } from './AcademicRecordResultRow';
import type { EnhancedTestResultRecord } from '../../types/results.types';

interface ResultTimelineProps {
    results: EnhancedTestResultRecord[];
    loading?: boolean;
    onResultClick?: (resultId: string) => void;
    emptyMessage?: string;
    pageSize?: number;
    variant?: 'default' | 'glass' | 'lavender' | 'sky' | 'mint' | 'rose' | 'peach';
}

const styles: Record<string, React.CSSProperties> = {
    loadingWrap: {
        display: 'flex',
        justifyContent: 'center',
        padding: '2rem 0',
    },
    loadingInner: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.75rem',
    },
    spinner: {
        width: 28,
        height: 28,
        border: '3px solid #e5e7eb',
        borderTopColor: '#4f46e5',
        borderRadius: '50%',
        animation: 'timelineSpin 0.8s linear infinite',
    },
    helperText: {
        margin: 0,
        fontSize: '0.875rem',
        color: '#6b7280',
    },
    emptyWrap: {
        display: 'flex',
        justifyContent: 'center',
        padding: '2rem 0',
    },
    emptyInner: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.75rem',
        maxWidth: 420,
    },
    emptyHeading: {
        margin: 0,
        fontSize: '1.125rem',
        fontWeight: 700,
        color: '#374151',
        textAlign: 'center',
    },
    emptyBody: {
        margin: 0,
        fontSize: '0.875rem',
        color: '#6b7280',
        textAlign: 'center',
        lineHeight: 1.5,
    },
    list: {
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
    },
    footerWrap: {
        display: 'flex',
        justifyContent: 'center',
        marginTop: '0.5rem',
    },
    loadMoreButton: {
        border: 'none',
        borderRadius: 999,
        padding: '0.625rem 0.95rem',
        background: '#e5e7eb',
        color: '#374151',
        fontSize: '0.8125rem',
        fontWeight: 700,
        cursor: 'pointer',
    },
    countText: {
        margin: '0.25rem 0 0',
        fontSize: '0.75rem',
        color: '#6b7280',
        textAlign: 'center',
    },
};

export const ResultTimeline: React.FC<ResultTimelineProps> = ({
    results,
    loading = false,
    onResultClick,
    emptyMessage = 'No test results found',
    pageSize = 10,
}) => {
    const [displayCount, setDisplayCount] = useState(pageSize);

    const sortedResults = useMemo(
        () => [...results].sort((a, b) => b.submittedAt - a.submittedAt),
        [results],
    );

    const displayedResults = sortedResults.slice(0, displayCount);
    const hasMore = displayCount < sortedResults.length;

    React.useEffect(() => {
        setDisplayCount(pageSize);
    }, [pageSize, results]);

    if (loading) {
        return (
            <div style={styles.loadingWrap}>
                <div style={styles.loadingInner}>
                    <div style={styles.spinner} />
                    <style>{'@keyframes timelineSpin { to { transform: rotate(360deg); } }'}</style>
                    <p style={styles.helperText}>Loading results...</p>
                </div>
            </div>
        );
    }

    if (sortedResults.length === 0) {
        return (
            <div style={styles.emptyWrap}>
                <div style={styles.emptyInner}>
                    <IconInbox size={52} style={{ color: '#9ca3af' }} />
                    <p style={styles.emptyHeading}>{emptyMessage}</p>
                    <p style={styles.emptyBody}>
                        Your test results will appear here once you complete a test.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div style={styles.list}>
            {displayedResults.map((result) => (
                <AcademicRecordResultRow
                    key={result.resultId}
                    result={result}
                    onClick={onResultClick}
                />
            ))}

            {hasMore && (
                <div style={styles.footerWrap}>
                    <button
                        type="button"
                        onClick={() => setDisplayCount((count) => Math.min(count + pageSize, sortedResults.length))}
                        style={styles.loadMoreButton}
                    >
                        Load More ({sortedResults.length - displayCount} remaining)
                    </button>
                </div>
            )}

            <p style={styles.countText}>
                Showing {displayedResults.length} of {sortedResults.length} result{sortedResults.length !== 1 ? 's' : ''}
            </p>
        </div>
    );
};
