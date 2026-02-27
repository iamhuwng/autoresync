import React, { useState, useMemo } from 'react';
import { Stack, Text, Collapse, Group, Badge, Progress, ActionIcon } from '@mantine/core';
import { IconChevronDown, IconChevronRight, IconBook, IconInbox } from '@tabler/icons-react';
import { ResultCard } from './ResultCard';
import type { EnhancedTestResultRecord } from '../../types/results.types';

interface ResultsByCourseProps {
    results: EnhancedTestResultRecord[];
    onResultClick?: (resultId: string) => void;
    variant?: 'default' | 'glass' | 'lavender' | 'sky' | 'mint' | 'rose' | 'peach';
    showProgress?: boolean;
}

interface CourseGroup {
    courseId: string | null;
    courseName: string | null;
    results: EnhancedTestResultRecord[];
    averageScore: number;
    totalTests: number;
    progressPercentage?: number;
}

/**
 * ResultsByCourse Component
 * 
 * Groups test results by course with collapsible sections.
 * Shows course progress percentage and average score in headers.
 * 
 * Features:
 * - Groups results by course (courseId)
 * - Collapsible course sections (click to expand/collapse)
 * - Course header shows:
 *   - Course name
 *   - Number of tests taken
 *   - Average score percentage
 *   - Optional progress bar (if showProgress is true)
 * - Results sorted by submission date within each course
 * - "Uncategorized" section for results without course context
 * - Empty state when no results exist
 * 
 * Part of PRD-0015: Academic Record & Enhanced Profile System - Phase 4
 */
export const ResultsByCourse: React.FC<ResultsByCourseProps> = ({
    results,
    onResultClick,
    variant = 'glass',
    showProgress = false
}) => {
    const [expandedCourses, setExpandedCourses] = useState<Set<string>>(new Set());

    // Group results by course
    const courseGroups = useMemo(() => {
        const groups = new Map<string, CourseGroup>();

        results.forEach(result => {
            const key = result.courseId || 'uncategorized';

            if (!groups.has(key)) {
                groups.set(key, {
                    courseId: result.courseId || null,
                    courseName: result.courseName || 'Uncategorized',
                    results: [],
                    averageScore: 0,
                    totalTests: 0,
                    progressPercentage: undefined
                });
            }

            const group = groups.get(key)!;
            group.results.push(result);
        });

        // Calculate statistics for each group
        groups.forEach(group => {
            group.totalTests = group.results.length;
            const totalScore = group.results.reduce((sum, r) => sum + r.percentage, 0);
            group.averageScore = group.totalTests > 0 ? totalScore / group.totalTests : 0;

            // Sort results by submission date (newest first)
            group.results.sort((a, b) => b.submittedAt - a.submittedAt);
        });

        // Convert to array and sort by course name
        return Array.from(groups.values()).sort((a, b) => {
            // Uncategorized always goes last
            if (a.courseName === 'Uncategorized') return 1;
            if (b.courseName === 'Uncategorized') return -1;
            return (a.courseName || '').localeCompare(b.courseName || '');
        });
    }, [results]);

    const toggleCourse = (courseId: string | null) => {
        const key = courseId || 'uncategorized';
        setExpandedCourses(prev => {
            const newSet = new Set(prev);
            if (newSet.has(key)) {
                newSet.delete(key);
            } else {
                newSet.add(key);
            }
            return newSet;
        });
    };

    const isCourseExpanded = (courseId: string | null) => {
        const key = courseId || 'uncategorized';
        return expandedCourses.has(key);
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
                    Your test results will appear here grouped by course.
                </Text>
            </Stack>
        );
    }

    return (
        <Stack gap="lg">
            {courseGroups.map((group) => {
                const isExpanded = isCourseExpanded(group.courseId);
                const key = group.courseId || 'uncategorized';

                return (
                    <div key={key}>
                        {/* Course Header */}
                        <div
                            onClick={() => toggleCourse(group.courseId)}
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

                                    <IconBook size={20} style={{ color: '#64748b' }} />

                                    <div style={{ flex: 1 }}>
                                        <Text fw={600} size="md" style={{ color: '#1e293b' }}>
                                            {group.courseName}
                                        </Text>
                                        <Group gap="xs" mt={4}>
                                            <Badge size="xs" variant="light" color="blue">
                                                {group.totalTests} test{group.totalTests !== 1 ? 's' : ''}
                                            </Badge>
                                            <Badge size="xs" variant="light" color="green">
                                                Avg: {Math.round(group.averageScore)}%
                                            </Badge>
                                        </Group>
                                    </div>
                                </Group>

                                {/* Progress percentage badge (if available) */}
                                {showProgress && group.progressPercentage !== undefined && (
                                    <Badge size="lg" variant="filled" color="grape">
                                        {Math.round(group.progressPercentage)}% Complete
                                    </Badge>
                                )}
                            </Group>

                            {/* Progress bar (if enabled) */}
                            {showProgress && group.progressPercentage !== undefined && (
                                <Progress
                                    value={group.progressPercentage}
                                    size="sm"
                                    mt="md"
                                    color="grape"
                                    style={{ borderRadius: '4px' }}
                                />
                            )}
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
                {courseGroups.length} course{courseGroups.length !== 1 ? 's' : ''} • {results.length} total result{results.length !== 1 ? 's' : ''}
            </Text>
        </Stack>
    );
};
