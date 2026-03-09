import React, { useState, useEffect } from 'react';
import { IconInbox } from '@tabler/icons-react';
import { ResultCard } from './ResultCard';
import type { EnhancedTestResultRecord } from '../../types/results.types';

interface ResultTimelineProps {
    results: EnhancedTestResultRecord[];
    loading?: boolean;
    onResultClick?: (resultId: string) => void;
    emptyMessage?: string;
    pageSize?: number;
    variant?: 'default' | 'glass' | 'lavender' | 'sky' | 'mint' | 'rose' | 'peach';
}

/**
 * ResultTimeline Component
 * 
 * Displays test results in chronological order (newest first) with pagination.
 * 
 * Features:
 * - Chronological list sorted by submission date (newest first)
 * - Pagination with "Load More" button
 * - Loading state with spinner
 * - Empty state with custom message
 * - Uses ResultCard component for individual results
 * - Configurable page size (default: 10)
 * 
 * Part of PRD-0015: Academic Record & Enhanced Profile System - Phase 4
 */
export const ResultTimeline: React.FC<ResultTimelineProps> = ({
    results,
    loading = false,
    onResultClick,
    emptyMessage = 'No test results found',
    pageSize = 10,
    variant = 'glass'
}) => {
    const [displayCount, setDisplayCount] = useState(pageSize);
    const [sortedResults, setSortedResults] = useState<EnhancedTestResultRecord[]>([]);

    // Sort results by submission date (newest first)
    useEffect(() => {
        const sorted = [...results].sort((a, b) => b.submittedAt - a.submittedAt);
        setSortedResults(sorted);
    }, [results]);

    // Reset display count when results change
    useEffect(() => {
        setDisplayCount(pageSize);
    }, [results, pageSize]);

    const displayedResults = sortedResults.slice(0, displayCount);
    const hasMore = displayCount < sortedResults.length;

    const handleLoadMore = () => {
        setDisplayCount(prev => Math.min(prev + pageSize, sortedResults.length));
    };

    // Loading state
    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem 0' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                    <div
                        style={{
                            width: 28,
                            height: 28,
                            border: '3px solid #e2e8f0',
                            borderTopColor: '#8b5cf6',
                            borderRadius: '50%',
                            animation: 'timelineSpin 0.8s linear infinite',
                        }}
                    />
                    <style>{`@keyframes timelineSpin { to { transform: rotate(360deg); } }`}</style>
                    <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b' }}>Loading results...</p>
                </div>
            </div>
        );
    }

    // Empty state
    if (sortedResults.length === 0) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem 0' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                    <IconInbox size={64} style={{ color: '#94a3b8', opacity: 0.5 }} />
                    <p style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: '#64748b' }}>
                        {emptyMessage}
                    </p>
                    <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b', textAlign: 'center', maxWidth: 400 }}>
                        Your test results will appear here once you complete a test.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Results List */}
            {displayedResults.map((result) => (
                <ResultCard
                    key={result.resultId}
                    result={result}
                    onClick={onResultClick}
                    variant={variant}
                />
            ))}

            {/* Load More Button */}
            {hasMore && (
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.75rem' }}>
                    <button
                        type="button"
                        onClick={handleLoadMore}
                        style={{
                            border: '1px solid #cbd5e1',
                            borderRadius: 10,
                            padding: '0.625rem 0.875rem',
                            background: '#f8fafc',
                            color: '#334155',
                            fontSize: '0.875rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                        }}
                    >
                        Load More ({sortedResults.length - displayCount} remaining)
                    </button>
                </div>
            )}

            {/* Results Count */}
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#64748b', textAlign: 'center' }}>
                Showing {displayedResults.length} of {sortedResults.length} result{sortedResults.length !== 1 ? 's' : ''}
            </p>
        </div>
    );
};
