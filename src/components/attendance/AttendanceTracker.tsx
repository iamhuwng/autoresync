/**
 * Attendance Tracker
 * 
 * Component for displaying student's module attendance and progress.
 */

import { useState, useEffect } from 'react';
import { Card, Stack, Group, Text, Progress, Badge, RingProgress, Alert, Loader } from '@mantine/core';
import { IconCalendarCheck, IconAlertCircle } from '@tabler/icons-react';
import {
    getStudentAttendanceSummary
} from '@/services/attendanceService';
import type { StudentAttendanceSummary } from '@/types/attendance.types';

interface AttendanceTrackerProps {
    studentId: string;
    courseId: string;
    courseName?: string;
}

export function AttendanceTracker({
    studentId,
    courseId,
    courseName
}: AttendanceTrackerProps) {
    const [summary, setSummary] = useState<StudentAttendanceSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadAttendanceSummary();
    }, [studentId, courseId]);

    const loadAttendanceSummary = async () => {
        setLoading(true);
        setError(null);

        try {
            const data = await getStudentAttendanceSummary(studentId, courseId);
            setSummary(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load attendance data');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <Card withBorder>
                <Group justify="center" p="md">
                    <Loader size="sm" />
                    <Text size="sm" c="dimmed">Loading attendance...</Text>
                </Group>
            </Card>
        );
    }

    if (error) {
        return (
            <Alert color="red" icon={<IconAlertCircle size={16} />}>
                {error}
            </Alert>
        );
    }

    if (!summary) {
        return null;
    }

    const attendanceColor =
        summary.attendancePercentage >= 80 ? 'green' :
            summary.attendancePercentage >= 60 ? 'yellow' :
                'red';

    return (
        <Card withBorder>
            <Stack gap="md">
                {/* Header */}
                <Group justify="space-between">
                    <Group gap="xs">
                        <IconCalendarCheck size={20} />
                        <Text fw={600}>Module Attendance</Text>
                    </Group>
                    {courseName && (
                        <Badge variant="light">{courseName}</Badge>
                    )}
                </Group>

                {/* Ring Progress */}
                <Group justify="center">
                    <RingProgress
                        size={160}
                        thickness={16}
                        sections={[
                            { value: summary.attendancePercentage, color: attendanceColor }
                        ]}
                        label={
                            <Stack gap={0} align="center">
                                <Text size="xl" fw={700} c={attendanceColor}>
                                    {summary.attendancePercentage.toFixed(0)}%
                                </Text>
                                <Text size="xs" c="dimmed">Attendance</Text>
                            </Stack>
                        }
                    />
                </Group>

                {/* Statistics */}
                <Stack gap="xs">
                    <Group justify="space-between">
                        <Text size="sm" c="dimmed">Total Modules</Text>
                        <Text size="sm" fw={600}>{summary.totalModules}</Text>
                    </Group>

                    <Group justify="space-between">
                        <Text size="sm" c="dimmed">Attended</Text>
                        <Badge color="green" variant="light">
                            {summary.attendedModules}
                        </Badge>
                    </Group>

                    {summary.exceptedModules > 0 && (
                        <Group justify="space-between">
                            <Text size="sm" c="dimmed">Excused</Text>
                            <Badge color="blue" variant="light">
                                {summary.exceptedModules}
                            </Badge>
                        </Group>
                    )}

                    {summary.missedModules > 0 && (
                        <Group justify="space-between">
                            <Text size="sm" c="dimmed">Missed</Text>
                            <Badge color="red" variant="light">
                                {summary.missedModules}
                            </Badge>
                        </Group>
                    )}
                </Stack>

                {/* Progress Bar */}
                <div>
                    <Text size="xs" c="dimmed" mb={4}>Progress Breakdown</Text>
                    <Progress.Root size="xl">
                        <Progress.Section
                            value={(summary.attendedModules / summary.totalModules) * 100}
                            color="green"
                        >
                            <Progress.Label>Attended</Progress.Label>
                        </Progress.Section>
                        {summary.exceptedModules > 0 && (
                            <Progress.Section
                                value={(summary.exceptedModules / summary.totalModules) * 100}
                                color="blue"
                            >
                                <Progress.Label>Excused</Progress.Label>
                            </Progress.Section>
                        )}
                        {summary.missedModules > 0 && (
                            <Progress.Section
                                value={(summary.missedModules / summary.totalModules) * 100}
                                color="red"
                            >
                                <Progress.Label>Missed</Progress.Label>
                            </Progress.Section>
                        )}
                    </Progress.Root>
                </div>

                {/* Warning for Low Attendance */}
                {summary.attendancePercentage < 60 && (
                    <Alert color="orange" variant="light">
                        <Text size="sm">
                            Your attendance is below 60%. Please attend upcoming modules to improve your record.
                        </Text>
                    </Alert>
                )}

                {/* Last Updated */}
                <Text size="xs" c="dimmed" ta="right">
                    Last updated: {new Date(summary.lastUpdated).toLocaleString()}
                </Text>
            </Stack>
        </Card>
    );
}
