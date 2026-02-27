/**
 * TeacherStudentResultsView Component
 * PRD-0016: Solo Study & Homework System - Phase 5
 * 
 * A component for teachers to view student results filtered by context type.
 * Shows results from class sessions, homework, and self-study.
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Paper,
    Text,
    Group,
    Stack,
    Badge,
    Button,
    SegmentedControl,
    Table,
    Loader,
    Alert,
    ThemeIcon,
    ActionIcon,
    Tooltip
} from '@mantine/core';
import {
    IconSchool,
    IconClipboard,
    IconBook,
    IconEye,
    IconAlertCircle,
    IconRefresh
} from '@tabler/icons-react';
import { useResultsByContext, type ResultContextType } from '../../hooks/useResultsByContext';
import { ResultContextBadge } from '../results/ResultContextBadge';

// ============================================================================
// TYPES
// ============================================================================

interface TeacherStudentResultsViewProps {
    /** Teacher ID */
    teacherId: string;
    /** Optional student ID to filter by (for single student view) */
    studentId?: string;
    /** Title for the section */
    title?: string;
    /** Maximum results to show (0 = all) */
    maxResults?: number;
    /** Show view all button */
    showViewAll?: boolean;
    /** Custom onViewAll handler */
    onViewAll?: () => void;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
};

const formatPercentage = (value: number): string => {
    return `${Math.round(value)}%`;
};

const getContextIcon = (context: ResultContextType) => {
    switch (context) {
        case 'class_session':
            return <IconSchool size={14} />;
        case 'homework':
            return <IconClipboard size={14} />;
        case 'self_study':
            return <IconBook size={14} />;
        default:
            return null;
    }
};

// ============================================================================
// COMPONENT
// ============================================================================

export const TeacherStudentResultsView: React.FC<TeacherStudentResultsViewProps> = ({
    teacherId,
    studentId,
    title = 'Student Results',
    maxResults = 0,
    showViewAll = false,
    onViewAll
}) => {
    const navigate = useNavigate();
    const [contextFilter, setContextFilter] = useState<ResultContextType>('all');

    const {
        results,
        isLoading,
        error,
        refresh,
        filterByContext,
        currentContext,
        stats
    } = useResultsByContext({
        teacherId,
        studentId,
        contextType: contextFilter,
        autoRefresh: false
    });

    /**
     * Handle filter change
     */
    const handleFilterChange = (value: string) => {
        const newContext = value as ResultContextType;
        setContextFilter(newContext);
        filterByContext(newContext);
    };

    /**
     * Handle view result
     */
    const handleViewResult = (resultId: string, sessionCode: string) => {
        // Navigate to result detail page
        navigate(`/teacher/results/${sessionCode}?highlight=${resultId}`);
    };

    // Display results (limited if maxResults > 0)
    const displayResults = maxResults > 0 ? results.slice(0, maxResults) : results;

    // Loading state
    if (isLoading) {
        return (
            <Paper p="md" withBorder>
                <Group justify="center" py="xl">
                    <Loader size="md" />
                    <Text c="dimmed">Loading results...</Text>
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
        <Paper p="md" withBorder>
            {/* Header */}
            <Group justify="space-between" mb="md">
                <Group gap="sm">
                    <ThemeIcon size="md" variant="light" color="blue">
                        <IconSchool size={18} />
                    </ThemeIcon>
                    <Text fw={600}>{title}</Text>
                    <Badge variant="light" color="gray">
                        {stats.total} total
                    </Badge>
                </Group>
                <Group gap="xs">
                    <Tooltip label="Refresh">
                        <ActionIcon variant="subtle" onClick={refresh}>
                            <IconRefresh size={16} />
                        </ActionIcon>
                    </Tooltip>
                </Group>
            </Group>

            {/* Context Filter */}
            <SegmentedControl
                value={currentContext}
                onChange={handleFilterChange}
                mb="md"
                data={[
                    {
                        label: (
                            <Group gap={4}>
                                <Text size="xs">All</Text>
                                <Badge size="xs" variant="light">{stats.byContext.all}</Badge>
                            </Group>
                        ),
                        value: 'all'
                    },
                    {
                        label: (
                            <Group gap={4}>
                                {getContextIcon('class_session')}
                                <Text size="xs">Sessions</Text>
                                <Badge size="xs" variant="light">{stats.byContext.class_session}</Badge>
                            </Group>
                        ),
                        value: 'class_session'
                    },
                    {
                        label: (
                            <Group gap={4}>
                                {getContextIcon('homework')}
                                <Text size="xs">Homework</Text>
                                <Badge size="xs" variant="light">{stats.byContext.homework}</Badge>
                            </Group>
                        ),
                        value: 'homework'
                    },
                    {
                        label: (
                            <Group gap={4}>
                                {getContextIcon('self_study')}
                                <Text size="xs">Practice</Text>
                                <Badge size="xs" variant="light">{stats.byContext.self_study}</Badge>
                            </Group>
                        ),
                        value: 'self_study'
                    }
                ]}
            />

            {/* Results Table */}
            {displayResults.length === 0 ? (
                <Stack align="center" gap="sm" py="xl">
                    <Text c="dimmed">No results found</Text>
                </Stack>
            ) : (
                <Table striped highlightOnHover>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>Student</Table.Th>
                            <Table.Th>Test</Table.Th>
                            <Table.Th>Context</Table.Th>
                            <Table.Th>Score</Table.Th>
                            <Table.Th>Date</Table.Th>
                            <Table.Th></Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {displayResults.map((result, index) => (
                            <Table.Tr key={`${result.sessionCode}-${result.studentId}-${index}`}>
                                <Table.Td>
                                    <Text size="sm" fw={500}>
                                        {result.studentName}
                                    </Text>
                                    {result.studentEmail && (
                                        <Text size="xs" c="dimmed">
                                            {result.studentEmail}
                                        </Text>
                                    )}
                                </Table.Td>
                                <Table.Td>
                                    <Text size="sm" lineClamp={1}>
                                        {result.testTitle || 'Untitled'}
                                    </Text>
                                    {result.testSkill && (
                                        <Badge size="xs" variant="light">
                                            {result.testSkill}
                                        </Badge>
                                    )}
                                </Table.Td>
                                <Table.Td>
                                    <ResultContextBadge contextType={result.context?.type || 'class_session'} />
                                </Table.Td>
                                <Table.Td>
                                    <Text
                                        size="sm"
                                        fw={600}
                                        c={result.percentage >= 70 ? 'green' : result.percentage >= 50 ? 'yellow' : 'red'}
                                    >
                                        {formatPercentage(result.percentage)}
                                    </Text>
                                </Table.Td>
                                <Table.Td>
                                    <Text size="sm" c="dimmed">
                                        {formatDate(result.completedAt)}
                                    </Text>
                                </Table.Td>
                                <Table.Td>
                                    <Tooltip label="View Details">
                                        <ActionIcon
                                            variant="subtle"
                                            onClick={() => handleViewResult(result.studentId, result.sessionCode)}
                                        >
                                            <IconEye size={16} />
                                        </ActionIcon>
                                    </Tooltip>
                                </Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
            )}

            {/* View All Button */}
            {showViewAll && results.length > maxResults && maxResults > 0 && (
                <Group justify="center" mt="md">
                    <Button variant="subtle" onClick={onViewAll}>
                        View All {results.length} Results
                    </Button>
                </Group>
            )}
        </Paper>
    );
};

export default TeacherStudentResultsView;
