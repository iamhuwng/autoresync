// @ts-nocheck
﻿import React, { useState, useEffect, useCallback } from 'react';
import { Container, Tabs, Stack, Text, Loader, Center, Group, Select, Alert } from '@mantine/core';
import { IconClock, IconBook, IconTarget, IconClipboard, IconChartBar, IconAlertCircle, IconTrophy } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getFilteredResults } from '@/services/academicRecordService';
import { ResultTimeline, ResultsByCourse, ResultsBySkill, ResultsByTestType, StatisticsDashboard } from '@/components/academicRecord';
import { BadgeShowcase } from '@/components/badges/BadgeShowcase';
import type { EnhancedTestResultRecord } from '@/types/results.types';
import type { AcademicRecordFilters } from '@/types/academicRecord.types';

/**
 * AcademicRecordPage
 * 
 * Main page for viewing student academic records and test history.
 * Provides multiple views for analyzing test results:
 * - Timeline: Chronological list of all results
 * - By Course: Results grouped by course
 * - By Skill: Results grouped by skill (Reading, Listening, Writing, Speaking)
 * - By Test Type: Results grouped by type (Quiz, Test)
 * - Statistics: Analytics dashboard with charts
 * - Badges: Display of earned achievement badges
 * 
 * Part of PRD-0015: Academic Record & Enhanced Profile System - Phase 4 & 6
 */
export const AcademicRecordPage: React.FC = () => {
    const { user } = useAuth();
    const navigate = useNavigate();

    const [activeTab, setActiveTab] = useState<string | null>('timeline');
    const [results, setResults] = useState<EnhancedTestResultRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Filter state
    const [dateRange, setDateRange] = useState<string>('all');

    // Fetch results
    const fetchResults = useCallback(async () => {
        if (!user?.uid) return;

        setLoading(true);
        setError(null);

        try {
            // Apply date range filter
            const appliedFilters: AcademicRecordFilters = {};

            if (dateRange !== 'all') {
                const now = Date.now();
                const ranges: Record<string, number> = {
                    'week': 7 * 24 * 60 * 60 * 1000,
                    'month': 30 * 24 * 60 * 60 * 1000,
                    'quarter': 90 * 24 * 60 * 60 * 1000,
                    'year': 365 * 24 * 60 * 60 * 1000
                };

                if (ranges[dateRange]) {
                    appliedFilters.dateFrom = now - ranges[dateRange];
                    appliedFilters.dateTo = now;
                }
            }

            const fetchedResults = await getFilteredResults(
                user.uid,
                appliedFilters
            );

            setResults(fetchedResults);
        } catch (err) {
            console.error('Error fetching academic records:', err);
            setError('Failed to load your academic records. Please try again.');
        } finally {
            setLoading(false);
        }
    }, [user?.uid, dateRange]);

    useEffect(() => {
        fetchResults();
    }, [fetchResults]);

    // Handle result click - navigate to result detail page
    const handleResultClick = (resultId: string, result?: EnhancedTestResultRecord) => {
        // Find the full result object if only ID was provided
        const fullResult = result || results.find(r => r.resultId === resultId);

        if (fullResult?.sessionCode) {
            // Navigate to existing StudentTestResultsPage with sessionCode
            navigate(`/student-test-results/${fullResult.sessionCode}`);
        } else {
            console.warn('Cannot navigate: sessionCode not found for result', resultId);
        }
    };

    // Handle export functions
    const handleExportPDF = () => {
        // TODO: Implement PDF export
        console.log('Export PDF clicked');
    };

    const handleExportCSV = () => {
        // TODO: Implement CSV export
        console.log('Export CSV clicked');
    };

    // Loading state
    if (loading && results.length === 0) {
        return (
            <Container size="lg" py="xl">
                <Center style={{ minHeight: '50vh' }} aria-live="polite" aria-busy="true">
                    <Stack align="center" gap="md">
                        <Loader size="lg" aria-label="Loading academic records" />
                        <Text c="dimmed">Loading your academic records...</Text>
                    </Stack>
                </Center>
            </Container>
        );
    }

    return (
        <Container size="lg" py="xl">
            <Stack gap="lg">
                {/* Page Header */}
                <div role="banner">
                    <Text size="xl" fw={700} mb="xs" id="page-title">
                        Academic Record
                    </Text>
                    <Text size="sm" c="dimmed" id="page-description">
                        View and analyze your test results and academic progress
                    </Text>
                </div>

                {/* Error Alert */}
                {error && (
                    <Alert icon={<IconAlertCircle size={16} />} title="Error" color="red" variant="light">
                        {error}
                    </Alert>
                )}

                {/* Filters */}
                <Group>
                    <Select
                        placeholder="Time period"
                        label="Filter by time period"
                        value={dateRange}
                        onChange={(value) => setDateRange(value || 'all')}
                        data={[
                            { value: 'all', label: 'All Time' },
                            { value: 'week', label: 'Last 7 Days' },
                            { value: 'month', label: 'Last 30 Days' },
                            { value: 'quarter', label: 'Last 3 Months' },
                            { value: 'year', label: 'Last Year' }
                        ]}
                        style={{ width: 160 }}
                        aria-describedby="results-count"
                    />

                    <Text size="sm" c="dimmed" id="results-count" aria-live="polite">
                        {results.length} result{results.length !== 1 ? 's' : ''} found
                    </Text>
                </Group>

                {/* Tab Navigation */}
                <Tabs
                    value={activeTab}
                    onChange={setActiveTab}
                    role="navigation"
                    aria-label="Academic record view options"
                >
                    <Tabs.List>
                        <Tabs.Tab
                            value="timeline"
                            leftSection={<IconClock size={16} />}
                            aria-label="View results in chronological timeline"
                        >
                            Timeline
                        </Tabs.Tab>
                        <Tabs.Tab
                            value="course"
                            leftSection={<IconBook size={16} />}
                            aria-label="View results grouped by course"
                        >
                            By Course
                        </Tabs.Tab>
                        <Tabs.Tab
                            value="skill"
                            leftSection={<IconTarget size={16} />}
                            aria-label="View results grouped by skill"
                        >
                            By Skill
                        </Tabs.Tab>
                        <Tabs.Tab
                            value="type"
                            leftSection={<IconClipboard size={16} />}
                            aria-label="View results grouped by test type"
                        >
                            By Type
                        </Tabs.Tab>
                        <Tabs.Tab
                            value="statistics"
                            leftSection={<IconChartBar size={16} />}
                            aria-label="View analytics and statistics dashboard"
                        >
                            Statistics
                        </Tabs.Tab>
                        <Tabs.Tab
                            value="badges"
                            leftSection={<IconTrophy size={16} />}
                            aria-label="View earned badge collection"
                        >
                            Badges
                        </Tabs.Tab>
                    </Tabs.List>

                    <Tabs.Panel value="timeline" pt="xl" role="tabpanel" aria-labelledby="tab-timeline">
                        <ResultTimeline
                            results={results}
                            loading={loading}
                            onResultClick={handleResultClick}
                            emptyMessage="No test results found for the selected period"
                        />
                    </Tabs.Panel>

                    <Tabs.Panel value="course" pt="xl" role="tabpanel" aria-labelledby="tab-course">
                        <ResultsByCourse
                            results={results}
                            onResultClick={handleResultClick}
                        />
                    </Tabs.Panel>

                    <Tabs.Panel value="skill" pt="xl" role="tabpanel" aria-labelledby="tab-skill">
                        <ResultsBySkill
                            results={results}
                            onResultClick={handleResultClick}
                        />
                    </Tabs.Panel>

                    <Tabs.Panel value="type" pt="xl" role="tabpanel" aria-labelledby="tab-type">
                        <ResultsByTestType
                            results={results}
                            onResultClick={handleResultClick}
                        />
                    </Tabs.Panel>

                    <Tabs.Panel value="statistics" pt="xl" role="tabpanel" aria-labelledby="tab-statistics">
                        <StatisticsDashboard
                            results={results}
                            onExportPDF={handleExportPDF}
                            onExportCSV={handleExportCSV}
                        />
                    </Tabs.Panel>

                    <Tabs.Panel value="badges" pt="xl" role="tabpanel" aria-labelledby="tab-badges">
                        {user?.uid ? (
                            <BadgeShowcase
                                studentId={user.uid}
                                showLocked={true}
                                title="ðŸ† Your Badges"
                            />
                        ) : (
                            <Center py="xl">
                                <Text c="dimmed">Please log in to view your badges</Text>
                            </Center>
                        )}
                    </Tabs.Panel>
                </Tabs>
            </Stack>
        </Container>
    );
};

export default AcademicRecordPage;

