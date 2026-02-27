/**
 * HomeworkResultsSummary Component
 * PRD-0016: Solo Study & Homework System - Phase 5, Task 6.7
 * 
 * Shows homework results in class view:
 * - Submission list for each homework
 * - Completion rate percentage
 * - Average score
 */

import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Paper,
    Text,
    Group,
    Stack,
    Badge,
    Table,
    Loader,
    Alert,
    ThemeIcon,
    Progress,
    RingProgress,
    Card,
    SimpleGrid,
    ActionIcon,
    Tooltip,
    Modal,
    Button
} from '@mantine/core';
import {
    IconClipboard,
    IconAlertCircle,
    IconCheck,
    IconClock,
    IconX,
    IconEye,
    IconUsers,
    IconRefresh
} from '@tabler/icons-react';
import { resetStudentHomework } from '../../services/homeworkSubmissionService';
import { useResultsByContext } from '../../hooks/useResultsByContext';

// ============================================================================
// TYPES
// ============================================================================

interface HomeworkResultsSummaryProps {
    /** Homework ID */
    homeworkId: string;
    /** Homework title */
    homeworkTitle?: string;
    /** Total number of assigned students */
    totalAssigned?: number;
    /** Due date timestamp */
    dueDate?: number;
    /** Show compact version */
    compact?: boolean;
}

interface SubmissionStatus {
    studentId: string;
    studentName: string;
    studentEmail?: string;
    status: 'submitted' | 'in_progress' | 'not_started';
    score?: number;
    percentage?: number;
    submittedAt?: number;
    isLate?: boolean;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

const getScoreColor = (percentage: number): string => {
    if (percentage >= 80) return 'green';
    if (percentage >= 60) return 'yellow';
    return 'red';
};

// Status icon and color functions kept for future use when displaying
// individual student submission status rows (non-submitted students)

// ============================================================================
// COMPONENT
// ============================================================================

export const HomeworkResultsSummary: React.FC<HomeworkResultsSummaryProps> = ({
    homeworkId,
    homeworkTitle = 'Homework',
    totalAssigned = 0,
    dueDate,
    compact = false
}) => {
    const navigate = useNavigate();

    // Reset student homework state
    const [resetTarget, setResetTarget] = useState<{ studentId: string; studentName: string } | null>(null);
    const [isResetting, setIsResetting] = useState(false);
    const [resetResult, setResetResult] = useState<{ success: boolean; message: string } | null>(null);

    const handleResetConfirm = useCallback(async () => {
        if (!resetTarget) return;
        setIsResetting(true);
        setResetResult(null);
        try {
            const result = await resetStudentHomework(
                homeworkId,
                resetTarget.studentId,
                homeworkTitle
            );
            setResetResult({
                success: true,
                message: `Reset complete: ${result.submissionsDeleted} submission(s) and ${result.resultsDeleted} result(s) deleted.`
            });
            // Close dialog after a short delay so user sees the success message
            setTimeout(() => {
                setResetTarget(null);
                setResetResult(null);
                // Force page reload to refresh the results data
                window.location.reload();
            }, 1500);
        } catch (err) {
            setResetResult({
                success: false,
                message: `Reset failed: ${err instanceof Error ? err.message : 'Unknown error'}`
            });
        } finally {
            setIsResetting(false);
        }
    }, [resetTarget, homeworkId, homeworkTitle]);

    const {
        results,
        isLoading,
        error
    } = useResultsByContext({
        homeworkId
    });

    // Calculate statistics
    const stats = React.useMemo(() => {
        if (!results || results.length === 0) {
            return {
                submitted: 0,
                avgScore: 0,
                highestScore: 0,
                lowestScore: 0,
                onTime: 0,
                late: 0,
                completionRate: 0
            };
        }

        const submitted = results.length;
        const avgScore = results.reduce((sum, r) => sum + r.percentage, 0) / submitted;
        const scores = results.map(r => r.percentage);

        // Count on-time vs late submissions
        let onTime = 0;
        let late = 0;
        if (dueDate) {
            results.forEach(r => {
                if (r.completedAt <= dueDate) {
                    onTime++;
                } else {
                    late++;
                }
            });
        } else {
            onTime = submitted;
        }

        return {
            submitted,
            avgScore: Math.round(avgScore),
            highestScore: Math.round(Math.max(...scores)),
            lowestScore: Math.round(Math.min(...scores)),
            onTime,
            late,
            completionRate: totalAssigned > 0 ? Math.round((submitted / totalAssigned) * 100) : 0
        };
    }, [results, totalAssigned, dueDate]);

    // Loading state
    if (isLoading) {
        return (
            <Paper p="md" withBorder>
                <Group justify="center" py="xl">
                    <Loader size="md" />
                    <Text c="dimmed">Loading homework results...</Text>
                </Group>
            </Paper>
        );
    }

    // Error state
    if (error) {
        return (
            <Paper p="md" withBorder>
                <Alert icon={<IconAlertCircle size={16} />} color="red">
                    {error}
                </Alert>
            </Paper>
        );
    }

    return (
        <Paper p={compact ? 'sm' : 'md'} withBorder>
            {/* Header */}
            <Group justify="space-between" mb="md">
                <Group gap="sm">
                    <ThemeIcon size="md" variant="light" color="orange">
                        <IconClipboard size={18} />
                    </ThemeIcon>
                    <Text fw={600} lineClamp={1}>{homeworkTitle}</Text>
                </Group>
                {dueDate && (
                    <Badge
                        variant="light"
                        color={Date.now() > dueDate ? 'red' : 'blue'}
                    >
                        {Date.now() > dueDate ? 'Past Due' : 'Active'}
                    </Badge>
                )}
            </Group>

            {/* Statistics Cards */}
            {!compact && (
                <SimpleGrid cols={{ base: 2, sm: 4 }} mb="md">
                    {/* Completion Rate Ring */}
                    <Card padding="sm" withBorder>
                        <Stack align="center" gap={4}>
                            <RingProgress
                                size={80}
                                thickness={8}
                                sections={[
                                    { value: stats.completionRate, color: 'blue' }
                                ]}
                                label={
                                    <Text size="xs" ta="center" fw={600}>
                                        {stats.completionRate}%
                                    </Text>
                                }
                            />
                            <Text size="xs" c="dimmed">Completion</Text>
                        </Stack>
                    </Card>

                    {/* Submissions Count */}
                    <Card padding="sm" withBorder>
                        <Stack align="center" gap={4}>
                            <Group gap="xs">
                                <ThemeIcon size="sm" variant="light" color="green">
                                    <IconCheck size={14} />
                                </ThemeIcon>
                            </Group>
                            <Text fw={600} size="xl">
                                {stats.submitted}
                                <Text span size="sm" c="dimmed"> / {totalAssigned}</Text>
                            </Text>
                            <Text size="xs" c="dimmed">Submitted</Text>
                        </Stack>
                    </Card>

                    {/* Average Score */}
                    <Card padding="sm" withBorder>
                        <Stack align="center" gap={4}>
                            <Text fw={600} size="xl" c={getScoreColor(stats.avgScore)}>
                                {stats.avgScore}%
                            </Text>
                            <Progress
                                value={stats.avgScore}
                                size="xs"
                                color={getScoreColor(stats.avgScore)}
                                w="100%"
                            />
                            <Text size="xs" c="dimmed">Average Score</Text>
                        </Stack>
                    </Card>

                    {/* Late Submissions */}
                    <Card padding="sm" withBorder>
                        <Stack align="center" gap={4}>
                            <Group gap="xs">
                                <Text fw={600} size="xl" c="green">{stats.onTime}</Text>
                                <Text size="xs" c="dimmed">/</Text>
                                <Text fw={600} size="xl" c="red">{stats.late}</Text>
                            </Group>
                            <Text size="xs" c="dimmed">On-time / Late</Text>
                        </Stack>
                    </Card>
                </SimpleGrid>
            )}

            {/* Compact Stats */}
            {compact && (
                <Group gap="md" mb="sm">
                    <Group gap={4}>
                        <IconUsers size={14} />
                        <Text size="sm">{stats.submitted}/{totalAssigned}</Text>
                    </Group>
                    <Text size="sm" c={getScoreColor(stats.avgScore)}>
                        Avg: {stats.avgScore}%
                    </Text>
                    {stats.late > 0 && (
                        <Badge size="sm" color="red">{stats.late} late</Badge>
                    )}
                </Group>
            )}

            {/* Submissions Table */}
            {results.length > 0 ? (
                <Table striped highlightOnHover>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>Student</Table.Th>
                            <Table.Th>Score</Table.Th>
                            <Table.Th>Submitted</Table.Th>
                            {!compact && <Table.Th></Table.Th>}
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {results.map((result, index) => {
                            const isLate = dueDate && result.completedAt > dueDate;

                            return (
                                <Table.Tr key={`${result.studentId}-${index}`}>
                                    <Table.Td>
                                        <Group gap="xs">
                                            <ThemeIcon size="sm" variant="light" color="green">
                                                <IconCheck size={12} />
                                            </ThemeIcon>
                                            <div>
                                                <Text size="sm" fw={500}>
                                                    {result.studentName}
                                                </Text>
                                                {result.studentEmail && !compact && (
                                                    <Text size="xs" c="dimmed">
                                                        {result.studentEmail}
                                                    </Text>
                                                )}
                                            </div>
                                        </Group>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text
                                            size="sm"
                                            fw={600}
                                            c={getScoreColor(result.percentage)}
                                        >
                                            {Math.round(result.percentage)}%
                                        </Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <Group gap={4}>
                                            <Text size="sm" c="dimmed">
                                                {formatDate(result.completedAt)}
                                            </Text>
                                            {isLate && (
                                                <Badge size="xs" color="red">Late</Badge>
                                            )}
                                        </Group>
                                    </Table.Td>
                                    {!compact && (
                                        <Table.Td>
                                            <Group gap={4}>
                                                <Tooltip label="View Details">
                                                    <ActionIcon
                                                        variant="subtle"
                                                        onClick={() => navigate(`/teacher/results/${result.sessionCode}`)}
                                                    >
                                                        <IconEye size={16} />
                                                    </ActionIcon>
                                                </Tooltip>
                                                <Tooltip label="Reset Homework">
                                                    <ActionIcon
                                                        variant="subtle"
                                                        color="orange"
                                                        onClick={() => setResetTarget({
                                                            studentId: result.studentId,
                                                            studentName: result.studentName
                                                        })}
                                                    >
                                                        <IconRefresh size={16} />
                                                    </ActionIcon>
                                                </Tooltip>
                                            </Group>
                                        </Table.Td>
                                    )}
                                </Table.Tr>
                            );
                        })}
                    </Table.Tbody>
                </Table>
            ) : (
                <Stack align="center" gap="sm" py="xl">
                    <Text c="dimmed">No submissions yet</Text>
                </Stack>
            )}

            {/* Reset Confirmation Modal */}
            <Modal
                opened={!!resetTarget}
                onClose={() => { if (!isResetting) { setResetTarget(null); setResetResult(null); } }}
                title={
                    <Group gap="xs">
                        <IconRefresh size={20} color="#e67700" />
                        <Text fw={600}>Reset Homework</Text>
                    </Group>
                }
                centered
                size="sm"
            >
                <Stack gap="md">
                    {resetResult ? (
                        <Alert
                            color={resetResult.success ? 'green' : 'red'}
                            icon={resetResult.success ? <IconCheck size={16} /> : <IconAlertCircle size={16} />}
                        >
                            {resetResult.message}
                        </Alert>
                    ) : (
                        <>
                            <Text size="sm">
                                Are you sure you want to reset <Text span fw={600}>{resetTarget?.studentName}</Text>'s homework?
                            </Text>
                            <Alert color="orange" icon={<IconAlertCircle size={16} />}>
                                <Text size="sm">This will permanently delete:</Text>
                                <ul style={{ margin: '4px 0 0', paddingLeft: '1.2em', fontSize: '0.85rem' }}>
                                    <li>All submission attempts</li>
                                    <li>All test results and scores</li>
                                </ul>
                                <Text size="xs" c="dimmed" mt={4}>
                                    The student will need to retake the homework from scratch.
                                    This action cannot be undone.
                                </Text>
                            </Alert>
                            <Group justify="flex-end" gap="sm">
                                <Button
                                    variant="default"
                                    onClick={() => { setResetTarget(null); setResetResult(null); }}
                                    disabled={isResetting}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    color="orange"
                                    loading={isResetting}
                                    onClick={handleResetConfirm}
                                    leftSection={<IconRefresh size={16} />}
                                >
                                    Reset Homework
                                </Button>
                            </Group>
                        </>
                    )}
                </Stack>
            </Modal>
        </Paper>
    );
};

export default HomeworkResultsSummary;
