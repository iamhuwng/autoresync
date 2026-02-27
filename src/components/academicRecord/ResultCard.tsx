import React from 'react';
import { Card, CardBody } from '../modern';
import { Badge, Group, Text, Stack } from '@mantine/core';
import {
    IconCheck,
    IconBook,
    IconCalendar,
    IconChevronRight
} from '@tabler/icons-react';
import type { EnhancedTestResultRecord } from '../../types/results.types';

interface ResultCardProps {
    result: EnhancedTestResultRecord;
    onClick?: (resultId: string) => void;
    variant?: 'default' | 'glass' | 'lavender' | 'sky' | 'mint' | 'rose' | 'peach';
}

/**
 * ResultCard Component
 * 
 * Displays a single test result in a card format for academic record views.
 * Shows key information: title, score, course/module context, date, and feedback status.
 * 
 * Features:
 * - Score percentage with color coding (green ≥70%, yellow ≥50%, red <50%)
 * - Course and module name display
 * - Feedback indicator when teacher feedback exists
 * - Formatted submission date
 * - Click handler for navigation to result details
 * - Skill badge (Reading, Listening, Writing, Speaking)
 * 
 * Part of PRD-0015: Academic Record & Enhanced Profile System - Phase 4
 */
export const ResultCard: React.FC<ResultCardProps> = ({
    result,
    onClick,
    variant = 'glass'
}) => {
    const hasFeedback = !!(result.overallFeedback || result.questionResults?.some(q => q.teacherFeedback));

    // Determine score color
    const getScoreColor = (percentage: number): string => {
        if (percentage >= 70) return '#10b981'; // green
        if (percentage >= 50) return '#f59e0b'; // yellow/amber
        return '#ef4444'; // red
    };

    // Format date
    const formatDate = (timestamp: number): string => {
        const date = new Date(timestamp);
        const now = new Date();
        const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;

        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
        });
    };

    // Get skill badge color
    const getSkillColor = (skill: string): string => {
        const colors: Record<string, string> = {
            reading: 'blue',
            listening: 'grape',
            writing: 'teal',
            speaking: 'orange',
            mixed: 'violet',
        };
        return colors[skill.toLowerCase()] || 'gray';
    };

    const handleClick = () => {
        if (onClick) {
            onClick(result.resultId);
        }
    };

    return (
        <Card
            variant={variant}
            hover={!!onClick}
            onClick={handleClick}
            style={{
                cursor: onClick ? 'pointer' : 'default',
                transition: 'all 0.2s ease',
            }}
        >
            <CardBody>
                <Stack gap="sm">
                    {/* Header: Title and Score */}
                    <Group justify="space-between" align="flex-start">
                        <div style={{ flex: 1 }}>
                            <Text
                                fw={600}
                                size="md"
                                style={{
                                    color: '#1e293b',
                                    lineHeight: 1.3,
                                    marginBottom: '0.25rem'
                                }}
                            >
                                {result.testTitle}
                            </Text>

                            {/* Badges: Skill, Test Type, and Marking Status */}
                            <Group gap="xs" mt={4}>
                                <Badge
                                    color={getSkillColor(result.testSkill)}
                                    variant="light"
                                    size="xs"
                                    style={{ textTransform: 'capitalize' }}
                                >
                                    {result.testSkill}
                                </Badge>
                                <Badge color="gray" variant="outline" size="xs">
                                    {result.testType}
                                </Badge>
                                {/* PRD-0015: Phase 7 & 8 - Pending Review Badge */}
                                {result.markingStatus === 'pending-review' && (
                                    <Badge
                                        color="orange"
                                        variant="filled"
                                        size="xs"
                                        style={{
                                            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                                            fontWeight: 600
                                        }}
                                    >
                                        ⏳ Pending Review
                                    </Badge>
                                )}
                            </Group>
                        </div>

                        {/* Score Display - PRD-0015: Phase 7 & 8 */}
                        <div style={{ textAlign: 'right' }}>
                            {result.markingStatus === 'pending-review' ? (
                                <>
                                    <Text
                                        size="md"
                                        fw={600}
                                        style={{
                                            color: '#f59e0b',
                                            lineHeight: 1
                                        }}
                                    >
                                        Pending
                                    </Text>
                                    <Text size="xs" c="dimmed">
                                        Awaiting review
                                    </Text>
                                </>
                            ) : (
                                <>
                                    <Text
                                        size="xl"
                                        fw={700}
                                        style={{
                                            color: getScoreColor(result.percentage),
                                            lineHeight: 1
                                        }}
                                    >
                                        {/* THCS: show scaledScore/10, IELTS: show percentage */}
                                        {(result as any).thcsData?.scaledScore !== undefined
                                            ? `${(result as any).thcsData.scaledScore.toFixed(1)}/10`
                                            : `${Math.round(result.percentage)}%`
                                        }
                                    </Text>
                                    <Text size="xs" c="dimmed">
                                        {result.correct}/{result.totalQuestions}
                                    </Text>
                                </>
                            )}
                        </div>
                    </Group>

                    {/* Course and Module Context - PRD-0015: Phase 10 - Orphaned Results Handling */}
                    {(result.courseName || result.moduleName || result.courseId === null) && (
                        <Group gap="xs" wrap="wrap">
                            {/* Handle orphaned results (null courseId) */}
                            {result.courseId === null ? (
                                <Group gap={4}>
                                    <IconBook size={14} style={{ color: '#94a3b8' }} />
                                    <Text
                                        size="xs"
                                        c="dimmed"
                                        fs="italic"
                                        style={{
                                            color: '#94a3b8',
                                            fontStyle: 'italic'
                                        }}
                                    >
                                        Unassigned Course
                                    </Text>
                                    <Badge
                                        color="gray"
                                        variant="dot"
                                        size="xs"
                                        style={{ marginLeft: '4px' }}
                                    >
                                        No academic link
                                    </Badge>
                                </Group>
                            ) : (
                                <>
                                    {result.courseName && (
                                        <Group gap={4}>
                                            <IconBook size={14} style={{ color: '#64748b' }} />
                                            <Text size="xs" c="dimmed">
                                                {result.courseName}
                                            </Text>
                                        </Group>
                                    )}
                                    {result.moduleName && (
                                        <>
                                            {result.courseName && (
                                                <Text size="xs" c="dimmed">•</Text>
                                            )}
                                            <Text size="xs" c="dimmed">
                                                {result.moduleName}
                                            </Text>
                                        </>
                                    )}
                                </>
                            )}
                        </Group>
                    )}

                    {/* Footer: Date and Feedback Indicator */}
                    <Group justify="space-between" align="center" mt="xs">
                        <Group gap={4}>
                            <IconCalendar size={14} style={{ color: '#64748b' }} />
                            <Text size="xs" c="dimmed">
                                {formatDate(result.submittedAt)}
                            </Text>
                        </Group>

                        <Group gap="xs">
                            {hasFeedback && (
                                <Badge
                                    color="green"
                                    variant="light"
                                    size="xs"
                                    leftSection={<IconCheck size={12} />}
                                >
                                    Has Feedback
                                </Badge>
                            )}

                            {onClick && (
                                <IconChevronRight size={16} style={{ color: '#94a3b8' }} />
                            )}
                        </Group>
                    </Group>
                </Stack>
            </CardBody>
        </Card>
    );
};
