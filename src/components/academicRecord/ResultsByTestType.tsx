import React, { useState, useMemo } from 'react';
import { Stack, Text, Collapse, Group, Badge, ActionIcon, ThemeIcon } from '@mantine/core';
import { IconChevronDown, IconChevronRight, IconClipboardList, IconFileText, IconInbox } from '@tabler/icons-react';
import { ResultCard } from './ResultCard';
import type { EnhancedTestResultRecord } from '../../types/results.types';

interface ResultsByTestTypeProps {
    results: EnhancedTestResultRecord[];
    onResultClick?: (resultId: string) => void;
    variant?: 'default' | 'glass' | 'lavender' | 'sky' | 'mint' | 'rose' | 'peach';
}

interface TestTypeGroup {
    testType: 'quiz' | 'test';
    results: EnhancedTestResultRecord[];
    averageScore: number;
    totalTests: number;
    bestScore: number;
    passRate: number; // Percentage of tests with score >= 70%
}

/**
 * ResultsByTestType Component
 * 
 * Groups test results by test type (Quiz, Test, etc.).
 * Shows type-specific statistics and performance indicators.
 * 
 * Features:
 * - Groups results by testType field
 * - Collapsible test type sections (click to expand/collapse)
 * - Test type header shows:
 *   - Type icon (clipboard for quiz, document for test)
 *   - Type name
 *   - Number of tests taken
 *   - Average score
 *   - Best score
 *   - Pass rate (percentage with score >= 70%)
 * - Results sorted by submission date within each type
 * - Color-coded type badges
 * - Empty state when no results exist
 * 
 * Part of PRD-0015: Academic Record & Enhanced Profile System - Phase 4
 */
export const ResultsByTestType: React.FC<ResultsByTestTypeProps> = ({
    results,
    onResultClick,
    variant = 'glass'
}) => {
    const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());

    // Test type configuration
    const testTypeConfig: Record<string, { icon: typeof IconClipboardList; color: string; label: string }> = {
        quiz: {
            icon: IconClipboardList,
            color: 'cyan',
            label: 'Quizzes'
        },
        test: {
            icon: IconFileText,
            color: 'indigo',
            label: 'Tests'
        },
        ielts: {
            icon: IconFileText,
            color: 'blue',
            label: 'IELTS'
        },
        toefl: {
            icon: IconFileText,
            color: 'violet',
            label: 'TOEFL'
        },
        custom: {
            icon: IconClipboardList,
            color: 'teal',
            label: 'Custom'
        },
        'college entrance': {
            icon: IconFileText,
            color: 'orange',
            label: 'College Entrance'
        }
    };

    // Fallback config for unknown/unexpected test type values
    const fallbackConfig = {
        icon: IconFileText,
        color: 'gray',
        label: 'Other'
    };

    // Group results by test type
    const testTypeGroups = useMemo(() => {
        const groups = new Map<string, TestTypeGroup>();

        results.forEach(result => {
            // Normalize testType to lowercase for consistent matching
            const testType = (result.testType || 'test').toLowerCase() as TestTypeGroup['testType'];

            if (!groups.has(testType)) {
                groups.set(testType, {
                    testType,
                    results: [],
                    averageScore: 0,
                    totalTests: 0,
                    bestScore: 0,
                    passRate: 0
                });
            }

            const group = groups.get(testType)!;
            group.results.push(result);
        });

        // Calculate statistics for each group
        groups.forEach(group => {
            group.totalTests = group.results.length;
            const scores = group.results.map(r => r.percentage);
            const totalScore = scores.reduce((sum, score) => sum + score, 0);
            group.averageScore = group.totalTests > 0 ? totalScore / group.totalTests : 0;
            group.bestScore = Math.max(...scores, 0);

            // Calculate pass rate (score >= 70%)
            const passedCount = scores.filter(score => score >= 70).length;
            group.passRate = group.totalTests > 0 ? (passedCount / group.totalTests) * 100 : 0;

            // Sort results by submission date (newest first)
            group.results.sort((a, b) => b.submittedAt - a.submittedAt);
        });

        // Convert to array and sort by test type (quiz first, then test)
        const typeOrder = ['quiz', 'test'];
        return Array.from(groups.values()).sort((a, b) => {
            return typeOrder.indexOf(a.testType) - typeOrder.indexOf(b.testType);
        });
    }, [results]);

    const toggleTestType = (testType: string) => {
        setExpandedTypes(prev => {
            const newSet = new Set(prev);
            if (newSet.has(testType)) {
                newSet.delete(testType);
            } else {
                newSet.add(testType);
            }
            return newSet;
        });
    };

    const isTestTypeExpanded = (testType: string) => {
        return expandedTypes.has(testType);
    };

    // Get color for pass rate
    const getPassRateColor = (passRate: number): string => {
        if (passRate >= 80) return 'green';
        if (passRate >= 60) return 'yellow';
        return 'red';
    };

    // Empty state
    if (results.length === 0) {
        return (
            <Stack align="center" gap="md" py="xl">
                <IconInbox size={64} style={{ color: '#94a3b8', opacity: 0.5 }} />
                <Text size="lg" fw={500} c="dimmed">
                    No test results found
                </Text>
                <Text size="sm" c="dimmed" ta="center" maw={400}>
                    Your test results will appear here grouped by test type.
                </Text>
            </Stack>
        );
    }

    return (
        <Stack gap="lg">
            {testTypeGroups.map((group) => {
                const isExpanded = isTestTypeExpanded(group.testType);
                const config = testTypeConfig[group.testType] || fallbackConfig;
                const TestTypeIcon = config.icon;

                return (
                    <div key={group.testType}>
                        {/* Test Type Header */}
                        <div
                            onClick={() => toggleTestType(group.testType)}
                            style={{
                                padding: '1rem',
                                background: 'rgba(255, 255, 255, 0.6)',
                                backdropFilter: 'blur(10px)',
                                borderRadius: '12px',
                                border: '1px solid rgba(226, 232, 240, 0.8)',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                marginBottom: isExpanded ? '0.75rem' : '0'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.8)';
                                e.currentTarget.style.transform = 'translateY(-2px)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.6)';
                                e.currentTarget.style.transform = 'translateY(0)';
                            }}
                        >
                            <Group justify="space-between" wrap="nowrap">
                                <Group gap="sm" style={{ flex: 1 }}>
                                    <ActionIcon
                                        variant="subtle"
                                        size="sm"
                                        style={{ pointerEvents: 'none' }}
                                    >
                                        {isExpanded ? (
                                            <IconChevronDown size={18} />
                                        ) : (
                                            <IconChevronRight size={18} />
                                        )}
                                    </ActionIcon>

                                    <ThemeIcon size="lg" variant="light" color={config.color}>
                                        <TestTypeIcon size={20} />
                                    </ThemeIcon>

                                    <div style={{ flex: 1 }}>
                                        <Text fw={600} size="md" style={{ color: '#1e293b' }}>
                                            {config.label}
                                        </Text>
                                        <Group gap="xs" mt={4}>
                                            <Badge size="xs" variant="light" color={config.color}>
                                                {group.totalTests} {group.testType}{group.totalTests !== 1 ? (group.testType === 'quiz' ? 'zes' : 's') : ''}
                                            </Badge>
                                            <Badge size="xs" variant="light" color="blue">
                                                Avg: {Math.round(group.averageScore)}%
                                            </Badge>
                                            <Badge size="xs" variant="light" color="green">
                                                Best: {Math.round(group.bestScore)}%
                                            </Badge>
                                            <Badge size="xs" variant="light" color={getPassRateColor(group.passRate)}>
                                                Pass Rate: {Math.round(group.passRate)}%
                                            </Badge>
                                        </Group>
                                    </div>
                                </Group>

                                {/* Average Score Display */}
                                <div style={{ textAlign: 'right' }}>
                                    <Text size="xl" fw={700} style={{ color: '#1e293b', lineHeight: 1 }}>
                                        {Math.round(group.averageScore)}%
                                    </Text>
                                    <Text size="xs" c="dimmed">
                                        average
                                    </Text>
                                </div>
                            </Group>
                        </div>

                        {/* Collapsible Results List */}
                        <Collapse in={isExpanded}>
                            <Stack gap="md" mt="xs" style={{ paddingLeft: '1rem' }}>
                                {group.results.map((result) => (
                                    <ResultCard
                                        key={result.resultId}
                                        result={result}
                                        onClick={onResultClick}
                                        variant={variant}
                                    />
                                ))}
                            </Stack>
                        </Collapse>
                    </div>
                );
            })}

            {/* Summary */}
            <Text size="xs" c="dimmed" ta="center" mt="md">
                {testTypeGroups.length} type{testTypeGroups.length !== 1 ? 's' : ''} • {results.length} total result{results.length !== 1 ? 's' : ''}
            </Text>
        </Stack>
    );
};
