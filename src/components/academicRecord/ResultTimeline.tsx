import React, { useState, useEffect } from 'react';
import { Stack, Text, Loader, Center, Button, Group } from '@mantine/core';
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
            <Center py="xl">
                <Stack align="center" gap="md">
                    <Loader size="lg" />
                    <Text size="sm" c="dimmed">Loading results...</Text>
                </Stack>
            </Center>
        );
    }

    // Empty state
    if (sortedResults.length === 0) {
        return (
            <Center py="xl">
                <Stack align="center" gap="md">
                    <IconInbox size={64} style={{ color: '#94a3b8', opacity: 0.5 }} />
                    <Text size="lg" fw={500} c="dimmed">
                        {emptyMessage}
                    </Text>
                    <Text size="sm" c="dimmed" ta="center" maw={400}>
                        Your test results will appear here once you complete a test.
                    </Text>
                </Stack>
            </Center>
        );
    }

    return (
        <Stack gap="md">
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
                <Group justify="center" mt="md">
                    <Button
                        variant="light"
                        onClick={handleLoadMore}
                        size="md"
                    >
                        Load More ({sortedResults.length - displayCount} remaining)
                    </Button>
                </Group>
            )}

            {/* Results Count */}
            <Text size="xs" c="dimmed" ta="center" mt="xs">
                Showing {displayedResults.length} of {sortedResults.length} result{sortedResults.length !== 1 ? 's' : ''}
            </Text>
        </Stack>
    );
};
