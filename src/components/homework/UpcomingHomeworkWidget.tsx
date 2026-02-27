/**
 * Upcoming Homework Widget
 * PRD-0016: Solo Study & Homework System
 * 
 * A compact widget for displaying upcoming homework on the student dashboard.
 * Shows at most 3 items with quick actions.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Paper,
    Text,
    Group,
    Stack,
    Badge,
    Button,
    Loader,
    ThemeIcon
} from '@mantine/core';
import {
    IconClipboard,
    IconClock,
    IconAlertTriangle,
    IconChevronRight,
    IconCheck
} from '@tabler/icons-react';
import { getStudentHomeworkList } from '../../services/homeworkSubmissionService';
import type { HomeworkAssignment, HomeworkSubmission } from '../../types/homework.types';

// ============================================================================
// TYPES
// ============================================================================

interface HomeworkItem {
    homework: HomeworkAssignment;
    submission: HomeworkSubmission | null;
    status: 'not_started' | 'in_progress' | 'completed' | 'overdue';
    daysRemaining: number;
}

interface UpcomingHomeworkWidgetProps {
    studentId: string;
    maxItems?: number;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format relative time remaining
 */
const formatTimeRemaining = (dueDate: number): { text: string; urgent: boolean; color: string } => {
    const now = Date.now();
    const diff = dueDate - now;

    if (diff <= 0) {
        return { text: 'Overdue', urgent: true, color: 'red' };
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (hours < 24) {
        return { text: `${hours}h left`, urgent: true, color: 'red' };
    }

    if (days < 3) {
        return { text: `${days}d left`, urgent: true, color: 'orange' };
    }

    return { text: `${days}d left`, urgent: false, color: 'blue' };
};

/**
 * Get skill color
 */
const getSkillColor = (skill: string): string => {
    switch (skill.toLowerCase()) {
        case 'reading': return 'blue';
        case 'listening': return 'violet';
        case 'writing': return 'orange';
        case 'speaking': return 'teal';
        default: return 'gray';
    }
};

// ============================================================================
// COMPONENT
// ============================================================================

export const UpcomingHomeworkWidget: React.FC<UpcomingHomeworkWidgetProps> = ({
    studentId,
    maxItems = 3
}) => {
    const navigate = useNavigate();
    const [homeworkItems, setHomeworkItems] = useState<HomeworkItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    /**
     * Load homework data
     */
    useEffect(() => {
        const loadHomework = async () => {
            if (!studentId) return;

            try {
                setIsLoading(true);
                const items = await getStudentHomeworkList(studentId);

                // Map to our widget format
                const mappedItems: HomeworkItem[] = items.map(item => {
                    const daysRemaining = Math.ceil(
                        (item.homework.scheduling.dueDate - Date.now()) / (1000 * 60 * 60 * 24)
                    );

                    let status: 'not_started' | 'in_progress' | 'completed' | 'overdue' = 'not_started';
                    if (item.submission?.status === 'submitted' || item.submission?.status === 'graded') {
                        status = 'completed';
                    } else if (item.submission?.status === 'in_progress') {
                        status = 'in_progress';
                    } else if (item.isOverdue) {
                        status = 'overdue';
                    }

                    return {
                        homework: item.homework,
                        submission: item.submission,
                        status,
                        daysRemaining
                    };
                });

                // Filter to show only active/not completed, sorted by due date
                const activeItems = mappedItems
                    .filter(item => item.status !== 'completed')
                    .sort((a, b) => a.homework.scheduling.dueDate - b.homework.scheduling.dueDate)
                    .slice(0, maxItems);

                setHomeworkItems(activeItems);
            } catch (err) {
                console.error('Error loading homework:', err);
                setError('Failed to load homework');
            } finally {
                setIsLoading(false);
            }
        };

        loadHomework();
    }, [studentId, maxItems]);

    /**
     * Handle homework click
     */
    const handleHomeworkClick = (item: HomeworkItem) => {
        if (item.status === 'in_progress' && item.homework.materialId) {
            // Go directly to test-taking
            navigate(`/student/practice/${item.homework.materialId}`, {
                state: {
                    isHomework: true,
                    homeworkId: item.homework.id,
                    submissionId: item.submission?.id,
                },
            });
        } else {
            // For not_started, go to homework list where they can start
            navigate('/student/homework');
        }
    };

    /**
     * Handle view all click
     */
    const handleViewAll = () => {
        navigate('/student/homework');
    };

    // Loading state
    if (isLoading) {
        return (
            <Paper p="md" withBorder style={{ background: 'rgba(255, 255, 255, 0.95)' }}>
                <Group justify="center" py="md">
                    <Loader size="sm" />
                    <Text size="sm" c="dimmed">Loading homework...</Text>
                </Group>
            </Paper>
        );
    }

    // Error state
    if (error) {
        return (
            <Paper p="md" withBorder style={{ background: 'rgba(255, 255, 255, 0.95)' }}>
                <Text size="sm" c="red" ta="center">{error}</Text>
            </Paper>
        );
    }

    // Empty state
    if (homeworkItems.length === 0) {
        return (
            <Paper p="md" withBorder style={{ background: 'rgba(255, 255, 255, 0.95)' }}>
                <Stack align="center" gap="sm" py="md">
                    <ThemeIcon size="xl" color="green" variant="light">
                        <IconCheck size={24} />
                    </ThemeIcon>
                    <Text fw={500}>All caught up!</Text>
                    <Text size="sm" c="dimmed">No pending homework</Text>
                </Stack>
            </Paper>
        );
    }

    return (
        <Paper
            p="md"
            withBorder
            style={{
                background: 'rgba(255, 255, 255, 0.95)',
                animation: 'slideUp 0.5s ease-out 0.15s backwards'
            }}
        >
            {/* Header */}
            <Group justify="space-between" mb="md">
                <Group gap="xs">
                    <ThemeIcon size="md" color="orange" variant="light">
                        <IconClipboard size={16} />
                    </ThemeIcon>
                    <Text fw={600}>Upcoming Homework</Text>
                </Group>
                <Badge color="orange" variant="light">
                    {homeworkItems.length} pending
                </Badge>
            </Group>

            {/* Homework List */}
            <Stack gap="sm">
                {homeworkItems.map((item) => {
                    const timeInfo = formatTimeRemaining(item.homework.scheduling.dueDate);

                    return (
                        <Paper
                            key={item.homework.id}
                            p="sm"
                            withBorder
                            style={{
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                borderLeft: `3px solid var(--mantine-color-${timeInfo.color}-5)`
                            }}
                            onClick={() => handleHomeworkClick(item)}
                        >
                            <Group justify="space-between" wrap="nowrap">
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <Text fw={500} size="sm" lineClamp={1}>
                                        {item.homework.title || item.homework.materialTitle}
                                    </Text>
                                    <Group gap="xs" mt={4}>
                                        <Badge
                                            size="xs"
                                            color={getSkillColor(item.homework.materialSkill)}
                                            variant="light"
                                        >
                                            {item.homework.materialSkill}
                                        </Badge>
                                        {item.status === 'in_progress' && (
                                            <Badge size="xs" color="blue" variant="light">
                                                In Progress
                                            </Badge>
                                        )}
                                    </Group>
                                </div>
                                <Group gap="xs" wrap="nowrap">
                                    <Badge
                                        color={timeInfo.color}
                                        variant={timeInfo.urgent ? 'filled' : 'light'}
                                        size="sm"
                                        leftSection={
                                            timeInfo.urgent && item.daysRemaining <= 0
                                                ? <IconAlertTriangle size={10} />
                                                : <IconClock size={10} />
                                        }
                                    >
                                        {timeInfo.text}
                                    </Badge>
                                    <IconChevronRight size={16} color="gray" />
                                </Group>
                            </Group>
                        </Paper>
                    );
                })}
            </Stack>

            {/* View All Button */}
            <Button
                variant="subtle"
                fullWidth
                mt="md"
                onClick={handleViewAll}
                rightSection={<IconChevronRight size={16} />}
            >
                View All Homework
            </Button>
        </Paper>
    );
};

export default UpcomingHomeworkWidget;
