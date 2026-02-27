/**
 * AssignmentHistoryTab Component
 * 
 * Displays the assignment history for a student or teacher.
 * Shows chronological list of assignments/unassignments with details:
 * - Teacher/Student name
 * - Date of action
 * - Admin who performed the action
 * - Courses enrolled (if applicable)
 * 
 * Can be used in both student and teacher profile views.
 */

import React from 'react';
import {
    Stack,
    Text,
    Badge,
    Group,
    Avatar,
    Paper,
    Timeline,
    Loader,
    Alert,
    ScrollArea,
    Divider,
    Tooltip
} from '@mantine/core';
import {
    IconUserCheck,
    IconUserX,
    IconClock,
    IconUser,
    IconSchool,
    IconAlertCircle
} from '@tabler/icons-react';
import { AssignmentHistory } from '../../types/assignment.types';

interface AssignmentHistoryTabProps {
    /** User ID to fetch history for */
    userId: string;

    /** User type - determines which field to display (student or teacher) */
    userType: 'student' | 'teacher';

    /** Assignment history data */
    history: AssignmentHistory[];

    /** Loading state */
    loading?: boolean;

    /** Error message */
    error?: string;

    /** Function to get user display name from ID */
    getUserName?: (userId: string) => string;

    /** Function to get course name from ID */
    getCourseName?: (courseId: string) => string;
}

/**
 * Formats a timestamp to a readable date string
 */
const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

/**
 * Gets relative time string (e.g., "2 hours ago")
 */
const getRelativeTime = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);

    if (years > 0) return `${years} year${years > 1 ? 's' : ''} ago`;
    if (months > 0) return `${months} month${months > 1 ? 's' : ''} ago`;
    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'Just now';
};

export const AssignmentHistoryTab: React.FC<AssignmentHistoryTabProps> = ({
    userType,
    history,
    loading = false,
    error,
    getUserName = (id) => id,
    getCourseName = (id) => id
}) => {
    // Sort history by timestamp (most recent first)
    const sortedHistory = [...history].sort((a, b) => b.timestamp - a.timestamp);

    // Loading state
    if (loading) {
        return (
            <Stack align="center" py="xl">
                <Loader size="md" />
                <Text size="sm" c="dimmed">Loading assignment history...</Text>
            </Stack>
        );
    }

    // Error state
    if (error) {
        return (
            <Alert icon={<IconAlertCircle size={16} />} title="Error" color="red" variant="light">
                {error}
            </Alert>
        );
    }

    // Empty state
    if (sortedHistory.length === 0) {
        return (
            <Stack align="center" py="xl" gap="md">
                <IconClock size={48} style={{ opacity: 0.3 }} />
                <Text size="sm" c="dimmed" ta="center">
                    No assignment history available yet.
                </Text>
                <Text size="xs" c="dimmed" ta="center">
                    Assignment changes will appear here once they occur.
                </Text>
            </Stack>
        );
    }

    return (
        <ScrollArea style={{ height: '100%' }}>
            <Stack gap="md" p="md">
                {/* Header */}
                <Group justify="space-between">
                    <Text size="sm" fw={600} c="dimmed">
                        Assignment History
                    </Text>
                    <Badge variant="light" size="sm">
                        {sortedHistory.length} {sortedHistory.length === 1 ? 'entry' : 'entries'}
                    </Badge>
                </Group>

                <Divider />

                {/* Timeline */}
                <Timeline active={sortedHistory.length} bulletSize={24} lineWidth={2}>
                    {sortedHistory.map((entry) => {
                        const isAssignment = entry.action === 'assigned';
                        const otherUserId = userType === 'student' ? entry.teacherId : entry.studentId;
                        const otherUserName = getUserName(otherUserId);
                        const performedByName = getUserName(entry.performedBy);

                        return (
                            <Timeline.Item
                                key={entry.id}
                                bullet={isAssignment ? <IconUserCheck size={12} /> : <IconUserX size={12} />}
                                title={
                                    <Group gap="xs">
                                        <Badge
                                            color={isAssignment ? 'green' : 'red'}
                                            variant="light"
                                            size="sm"
                                        >
                                            {isAssignment ? 'Assigned' : 'Unassigned'}
                                        </Badge>
                                        <Tooltip label={formatDate(entry.timestamp)} withArrow>
                                            <Text size="xs" c="dimmed">
                                                {getRelativeTime(entry.timestamp)}
                                            </Text>
                                        </Tooltip>
                                    </Group>
                                }
                            >
                                <Paper p="sm" withBorder mt="xs">
                                    <Stack gap="xs">
                                        {/* Other User Info */}
                                        <Group gap="xs">
                                            <Avatar size="sm" radius="xl" color="blue">
                                                <IconUser size={16} />
                                            </Avatar>
                                            <div>
                                                <Text size="sm" fw={500}>
                                                    {otherUserName}
                                                </Text>
                                                <Text size="xs" c="dimmed">
                                                    {userType === 'student' ? 'Teacher' : 'Student'}
                                                </Text>
                                            </div>
                                        </Group>

                                        {/* Admin Info */}
                                        <Group gap="xs">
                                            <Text size="xs" c="dimmed">
                                                {isAssignment ? 'Assigned by:' : 'Unassigned by:'}
                                            </Text>
                                            <Text size="xs" fw={500}>
                                                {performedByName}
                                            </Text>
                                        </Group>

                                        {/* Courses Enrolled */}
                                        {entry.coursesEnrolled && entry.coursesEnrolled.length > 0 && (
                                            <div>
                                                <Group gap="xs" mb={4}>
                                                    <IconSchool size={14} />
                                                    <Text size="xs" c="dimmed">
                                                        Courses:
                                                    </Text>
                                                </Group>
                                                <Group gap={4}>
                                                    {entry.coursesEnrolled.map((courseId) => (
                                                        <Badge
                                                            key={courseId}
                                                            size="xs"
                                                            variant="outline"
                                                            color="cyan"
                                                        >
                                                            {getCourseName(courseId)}
                                                        </Badge>
                                                    ))}
                                                </Group>
                                            </div>
                                        )}

                                        {/* Unassignment Reason */}
                                        {!isAssignment && entry.reason && (
                                            <div>
                                                <Text size="xs" c="dimmed" mb={4}>
                                                    Reason:
                                                </Text>
                                                <Text size="xs" fs="italic">
                                                    {entry.reason}
                                                </Text>
                                            </div>
                                        )}
                                    </Stack>
                                </Paper>
                            </Timeline.Item>
                        );
                    })}
                </Timeline>
            </Stack>
        </ScrollArea>
    );
};

export default AssignmentHistoryTab;
