import React, { useMemo, useState } from 'react';
import { IconInbox } from '@tabler/icons-react';
import {
    AcademicRecordFlatRow,
    formatAcademicRecordDate,
    buildMetaItems,
    getLeadingText,
    getLeadingTone,
    getScoreLabel,
    getScoreTone,
} from './AcademicRecordResultRow';
import type { EnhancedTestResultRecord } from '../../types/results.types';
import { studentTokens } from '../layout/studentLayoutStyles';

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
        border: `3px solid ${studentTokens.accentSoft}`,
        borderTopColor: studentTokens.accent,
        borderRadius: '50%',
        animation: 'timelineSpin 0.8s linear infinite',
    },
    helperText: {
        margin: 0,
        fontSize: '0.875rem',
        color: studentTokens.textMuted,
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
        color: studentTokens.textPrimary,
        textAlign: 'center',
    },
    emptyBody: {
        margin: 0,
        fontSize: '0.875rem',
        color: studentTokens.textMuted,
        textAlign: 'center',
        lineHeight: 1.5,
    },
    list: {
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        background: studentTokens.bgSurface,
        overflow: 'hidden',
    },
    tableHeader: {
        display: 'flex',
        alignItems: 'center',
        padding: '16px 20px',
        background: studentTokens.bgSurfaceAlt,
        color: studentTokens.textMuted,
        fontSize: '0.75rem',
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        borderBottom: `1px solid ${studentTokens.borderWhisper}`,
    },
    footerWrap: {
        display: 'flex',
        justifyContent: 'center',
        marginTop: '1rem',
    },
    loadMoreButton: {
        border: `1px solid ${studentTokens.borderSoft}`,
        borderRadius: studentTokens.radiusSoft,
        minHeight: 44,
        padding: '0.75rem 1rem',
        background: studentTokens.bgSurfaceAlt,
        color: studentTokens.textPrimary,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '0.75rem',
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        cursor: 'pointer',
    },
    countText: {
        margin: '0.5rem 0 0',
        fontSize: '0.75rem',
        color: studentTokens.textMuted,
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
                    <IconInbox size={52} style={{ color: studentTokens.textDim }} />
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
            <div style={styles.tableHeader}>
                <span>Recent Assessment Results</span>
            </div>
            {displayedResults.map((result) => {
                const hasFeedback = Boolean(
                    result.overallFeedback ||
                    result.questionResults?.some((q) => q.teacherFeedback != null),
                );
                const metaItems = [
                    formatAcademicRecordDate(result.submittedAt),
                    ...buildMetaItems(result, hasFeedback),
                ];

                return (
                    <AcademicRecordFlatRow
                        key={result.resultId}
                        title={result.testTitle}
                        metaItems={metaItems}
                        leadingText={getLeadingText(result)}
                        leadingTone={getLeadingTone(result)}
                        trailingPrimary={getScoreLabel(result)}
                        trailingSecondary={`${Math.round(result.percentage)}% score`}
                        trailingTone={getScoreTone(result)}
                        onClick={onResultClick ? () => onResultClick(result.resultId) : undefined}
                        ariaLabel={onResultClick ? `Open result for ${result.testTitle}` : undefined}
                    />
                );
            })}

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
