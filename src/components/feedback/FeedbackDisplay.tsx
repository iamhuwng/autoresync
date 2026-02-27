import React from 'react';
import { Paper, Text, Stack, Group, Badge, Divider } from '@mantine/core';
import { IconMessageCircle, IconClock, IconUser } from '@tabler/icons-react';

/**
 * FeedbackDisplay Component
 * 
 * Read-only display of teacher feedback on student test results.
 * Shows feedback with timestamp and teacher information in a styled callout design.
 * 
 * Part of PRD-0015: Academic Record & Enhanced Profile System - Phase 5
 */

export interface FeedbackDisplayProps {
    /** The feedback text */
    feedback: string;
    /** Teacher name who provided the feedback */
    teacherName?: string;
    /** Timestamp when feedback was last updated */
    updatedAt: number;
    /** Question ID for per-question feedback */
    questionId?: string;
    /** Question text to display as context */
    questionText?: string;
    /** Whether this is overall feedback */
    isOverall?: boolean;
    /** Custom variant for styling */
    variant?: 'default' | 'highlighted' | 'compact';
}

export const FeedbackDisplay: React.FC<FeedbackDisplayProps> = ({
    feedback,
    teacherName,
    updatedAt,
    questionId,
    questionText,
    isOverall = false,
    variant = 'default'
}) => {
    /**
     * Format timestamp to readable date
     */
    const formatDate = (timestamp: number): string => {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        // If less than 24 hours ago, show relative time
        if (diffDays === 0) {
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            if (diffHours === 0) {
                const diffMinutes = Math.floor(diffMs / (1000 * 60));
                if (diffMinutes === 0) {
                    return 'Just now';
                }
                return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
            }
            return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        }

        // If less than 7 days ago, show days
        if (diffDays < 7) {
            return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
        }

        // Otherwise show full date
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    const isCompact = variant === 'compact';
    const isHighlighted = variant === 'highlighted';

    return (
        <Paper
            p={isCompact ? 'sm' : 'md'}
            radius="md"
            withBorder
            style={{
                borderLeft: isOverall ? '4px solid #228be6' : '4px solid #40c057',
                backgroundColor: isHighlighted ? 'rgba(34, 139, 230, 0.05)' : 'rgba(255, 255, 255, 0.5)',
                backdropFilter: 'blur(10px)'
            }}
        >
            <Stack gap={isCompact ? 'xs' : 'sm'}>
                {/* Header */}
                <Group justify="space-between" wrap="nowrap">
                    <Group gap="xs">
                        <IconMessageCircle size={18} color={isOverall ? '#228be6' : '#40c057'} />
                        <Text size="sm" fw={600} c={isOverall ? 'blue' : 'green'}>
                            {isOverall ? 'Overall Feedback' : 'Question Feedback'}
                        </Text>
                        {!isOverall && questionId && (
                            <Badge size="sm" variant="light" color="gray">
                                Q{questionId}
                            </Badge>
                        )}
                    </Group>
                </Group>

                {/* Question context (for per-question feedback) */}
                {!isOverall && questionText && !isCompact && (
                    <>
                        <Divider />
                        <Text size="sm" c="dimmed" style={{ fontStyle: 'italic' }}>
                            "{questionText}"
                        </Text>
                    </>
                )}

                {/* Feedback content */}
                <Paper
                    p={isCompact ? 'xs' : 'sm'}
                    radius="sm"
                    style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.7)',
                        border: '1px solid rgba(0, 0, 0, 0.05)'
                    }}
                >
                    <Text
                        size={isCompact ? 'sm' : 'md'}
                        style={{
                            whiteSpace: 'pre-wrap',
                            lineHeight: 1.6
                        }}
                    >
                        {feedback}
                    </Text>
                </Paper>

                {/* Footer with metadata */}
                <Group justify="space-between" gap="xs" wrap="nowrap">
                    {/* Teacher info */}
                    {teacherName && (
                        <Group gap={4}>
                            <IconUser size={14} color="#868e96" />
                            <Text size="xs" c="dimmed">
                                {teacherName}
                            </Text>
                        </Group>
                    )}

                    {/* Timestamp */}
                    <Group gap={4}>
                        <IconClock size={14} color="#868e96" />
                        <Text size="xs" c="dimmed">
                            {formatDate(updatedAt)}
                        </Text>
                    </Group>
                </Group>
            </Stack>
        </Paper>
    );
};

export default FeedbackDisplay;
