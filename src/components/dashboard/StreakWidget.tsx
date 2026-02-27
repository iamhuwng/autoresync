/**
 * StreakWidget.tsx
 * 
 * Dashboard widget displaying student's practice streak.
 * Shows current streak, badge, and activity heatmap.
 * 
 * @module components/dashboard/StreakWidget
 */

import React, { useEffect, useState } from 'react';
import {
    Badge,
    Card,
    Group,
    Paper,
    Progress,
    RingProgress,
    SimpleGrid,
    Skeleton,
    Stack,
    Text,
    ThemeIcon,
    Tooltip,
    useMantineTheme
} from '@mantine/core';
import {
    IconFlame,
    IconTrophy,
    IconCalendarStats,
    IconAlertTriangle
} from '@tabler/icons-react';
import {
    getStreakSummary,
    getRecentActivity,
    StreakSummary,
    STREAK_BADGES,
    getBadgeForStreak
} from '../../services/studentStreakService';

// ============================================================================
// TYPES
// ============================================================================

export interface StreakWidgetProps {
    /** Student ID to display streak for */
    studentId: string;
    /** If true, show compact version */
    compact?: boolean;
    /** If true, show activity heatmap */
    showHeatmap?: boolean;
    /** Number of days to show in heatmap */
    heatmapDays?: number;
}

interface ActivityData {
    date: string;
    count: number;
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/**
 * Mini heatmap showing recent activity
 */
const ActivityHeatmap: React.FC<{
    activity: ActivityData[];
    days: number;
}> = ({ activity, days }) => {
    const theme = useMantineTheme();

    // Get activity intensity color
    const getActivityColor = (count: number): string => {
        if (count === 0) return theme.colors.dark[5];
        if (count === 1) return theme.colors.green[7];
        if (count <= 3) return theme.colors.green[5];
        return theme.colors.green[3];
    };

    // Parse date for display
    const formatDate = (dateString: string): string => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });
    };

    // Group by week for grid display
    const weeks: ActivityData[][] = [];
    let currentWeek: ActivityData[] = [];

    activity.forEach((day, index) => {
        currentWeek.push(day);
        if (currentWeek.length === 7 || index === activity.length - 1) {
            weeks.push([...currentWeek]);
            currentWeek = [];
        }
    });

    return (
        <Stack gap={4}>
            <Text size="xs" c="dimmed" mb={4}>Activity (last {days} days)</Text>
            <Group gap={2} wrap="wrap">
                {activity.map((day) => (
                    <Tooltip
                        key={day.date}
                        label={`${formatDate(day.date)}: ${day.count} ${day.count === 1 ? 'activity' : 'activities'}`}
                    >
                        <div
                            style={{
                                width: 12,
                                height: 12,
                                borderRadius: 2,
                                backgroundColor: getActivityColor(day.count)
                            }}
                        />
                    </Tooltip>
                ))}
            </Group>
        </Stack>
    );
};

/**
 * Badge display component
 */
const StreakBadgeDisplay: React.FC<{
    streak: number;
    size?: 'sm' | 'md' | 'lg';
}> = ({ streak, size = 'md' }) => {
    const badge = getBadgeForStreak(streak);

    if (!badge) {
        return (
            <Text size="sm" c="dimmed">
                Start your streak today!
            </Text>
        );
    }

    const iconSizes = { sm: 20, md: 28, lg: 40 };
    const textSizes = { sm: 'xs', md: 'sm', lg: 'md' } as const;

    return (
        <Group gap="xs">
            <Text size={size === 'lg' ? '2rem' : size === 'md' ? '1.5rem' : '1rem'}>
                {badge.icon}
            </Text>
            <Stack gap={0}>
                <Text size={textSizes[size]} fw={600}>{badge.name}</Text>
                <Text size="xs" c="dimmed">{badge.description}</Text>
            </Stack>
        </Group>
    );
};

/**
 * Next badge progress
 */
const NextBadgeProgress: React.FC<{
    currentStreak: number;
}> = ({ currentStreak }) => {
    const currentBadge = getBadgeForStreak(currentStreak);
    const currentBadgeIndex = currentBadge
        ? STREAK_BADGES.findIndex(b => b.id === currentBadge.id)
        : -1;

    const nextBadge = STREAK_BADGES[currentBadgeIndex + 1];

    if (!nextBadge) {
        return (
            <Text size="xs" c="dimmed">
                🎉 You've earned all badges!
            </Text>
        );
    }

    const previousThreshold = currentBadge?.minStreak || 0;
    const progress = ((currentStreak - previousThreshold) / (nextBadge.minStreak - previousThreshold)) * 100;
    const daysRemaining = nextBadge.minStreak - currentStreak;

    return (
        <Stack gap={4}>
            <Group justify="space-between">
                <Text size="xs" c="dimmed">Next: {nextBadge.icon} {nextBadge.name}</Text>
                <Text size="xs" c="dimmed">{daysRemaining} days to go</Text>
            </Group>
            <Progress
                value={progress}
                size="sm"
                color={nextBadge.color}
                radius="xl"
            />
        </Stack>
    );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const StreakWidget: React.FC<StreakWidgetProps> = ({
    studentId,
    compact = false,
    showHeatmap = true,
    heatmapDays = 28
}) => {
    const [summary, setSummary] = useState<StreakSummary | null>(null);
    const [activity, setActivity] = useState<ActivityData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true);
                const [summaryData, activityData] = await Promise.all([
                    getStreakSummary(studentId),
                    showHeatmap ? getRecentActivity(studentId, heatmapDays) : Promise.resolve([])
                ]);

                setSummary(summaryData);
                setActivity(activityData);
            } catch (err) {
                setError('Failed to load streak data');
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [studentId, showHeatmap, heatmapDays]);

    if (loading) {
        return (
            <Card padding={compact ? 'sm' : 'md'} withBorder>
                <Skeleton height={compact ? 60 : 120} radius="md" />
            </Card>
        );
    }

    if (error || !summary) {
        return (
            <Card padding={compact ? 'sm' : 'md'} withBorder>
                <Text c="dimmed" size="sm">{error || 'No streak data'}</Text>
            </Card>
        );
    }

    // Compact version for sidebar or small spaces
    if (compact) {
        return (
            <Card padding="sm" withBorder>
                <Group justify="space-between">
                    <Group gap="xs">
                        <ThemeIcon
                            size="md"
                            variant="light"
                            color={summary.currentStreak > 0 ? 'orange' : 'gray'}
                        >
                            <IconFlame size={16} />
                        </ThemeIcon>
                        <div>
                            <Text fw={600}>{summary.currentStreak} day streak</Text>
                            {summary.streakAtRisk && (
                                <Badge size="xs" color="yellow" leftSection={<IconAlertTriangle size={10} />}>
                                    Practice today!
                                </Badge>
                            )}
                        </div>
                    </Group>
                    {summary.badge && (
                        <Text size="xl">{summary.badge.icon}</Text>
                    )}
                </Group>
            </Card>
        );
    }

    // Full version for dashboard
    return (
        <Card padding="md" withBorder>
            <Stack gap="md">
                {/* Header */}
                <Group justify="space-between">
                    <Group gap="sm">
                        <ThemeIcon
                            size="lg"
                            variant="light"
                            color="orange"
                            radius="xl"
                        >
                            <IconFlame size={20} />
                        </ThemeIcon>
                        <Text fw={600} size="lg">Practice Streak</Text>
                    </Group>
                    {summary.streakAtRisk && (
                        <Badge
                            color="yellow"
                            leftSection={<IconAlertTriangle size={12} />}
                        >
                            Practice today to keep streak!
                        </Badge>
                    )}
                </Group>

                {/* Main stats */}
                <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="md">
                    {/* Current Streak */}
                    <Paper p="sm" withBorder radius="md">
                        <Stack align="center" gap={4}>
                            <RingProgress
                                size={60}
                                thickness={6}
                                roundCaps
                                sections={[
                                    { value: Math.min(summary.currentStreak * 10, 100), color: 'orange' }
                                ]}
                                label={
                                    <Text ta="center" fw={700} size="lg">
                                        {summary.currentStreak}
                                    </Text>
                                }
                            />
                            <Text size="xs" c="dimmed">Current Streak</Text>
                        </Stack>
                    </Paper>

                    {/* Best Streak */}
                    <Paper p="sm" withBorder radius="md">
                        <Stack align="center" gap={4}>
                            <ThemeIcon size={40} variant="light" color="yellow">
                                <IconTrophy size={24} />
                            </ThemeIcon>
                            <Text fw={600}>{summary.longestStreak} days</Text>
                            <Text size="xs" c="dimmed">Best Streak</Text>
                        </Stack>
                    </Paper>

                    {/* Total Days */}
                    <Paper p="sm" withBorder radius="md">
                        <Stack align="center" gap={4}>
                            <ThemeIcon size={40} variant="light" color="blue">
                                <IconCalendarStats size={24} />
                            </ThemeIcon>
                            <Text fw={600}>{summary.totalActiveDays} days</Text>
                            <Text size="xs" c="dimmed">Total Active</Text>
                        </Stack>
                    </Paper>
                </SimpleGrid>

                {/* Current Badge */}
                <Paper p="sm" withBorder radius="md" bg="dark.6">
                    <StreakBadgeDisplay streak={summary.currentStreak} size="md" />
                </Paper>

                {/* Next Badge Progress */}
                <NextBadgeProgress currentStreak={summary.currentStreak} />

                {/* Activity Heatmap */}
                {showHeatmap && activity.length > 0 && (
                    <ActivityHeatmap activity={activity} days={heatmapDays} />
                )}
            </Stack>
        </Card>
    );
};

export default StreakWidget;
