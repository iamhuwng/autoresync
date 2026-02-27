/**
 * AuditLogViewer Component
 * 
 * Super Admin-only component for viewing audit logs.
 * Part of RBAC Security Hardening (PRD-0016, Task 6.11)
 * 
 * @security Only super_admin can access this component
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    Card,
    Table,
    Badge,
    Group,
    Text,
    Select,
    TextInput,
    Button,
    Stack,
    Loader,
    Center,
    Title,
    Paper,
    ScrollArea,
    ActionIcon,
    Tooltip,
    rem,
    useMantineTheme,
    Pagination,
    Alert,
    Code,
    Collapse,
    Box,
} from '@mantine/core';
import {
    IconSearch,
    IconRefresh,
    IconShieldCheck,
    IconUser,
    IconLogin,
    IconLogout,
    IconLock,
    IconUserPlus,
    IconUserMinus,
    IconEdit,
    IconEye,
    IconAlertTriangle,
    IconChevronDown,
    IconChevronRight,
} from '@tabler/icons-react';
import { useAuth } from '../../hooks/useAuth';
import {
    getRecentAuditLogs,
    getAuditLogsByUser,
    getAuditLogsByAction,
} from '../../services/auditService';
import type { AuditAction, AuditLogEntry } from '../../types/security.types';

// =============================================================================
// TYPES
// =============================================================================

interface AuditLogViewerProps {
    /** Maximum logs to display per page */
    pageSize?: number;
    /** Show compact view */
    compact?: boolean;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const ACTION_CONFIG: Record<AuditAction, { icon: React.ComponentType<any>; color: string; label: string }> = {
    LOGIN: { icon: IconLogin, color: 'green', label: 'Login' },
    LOGOUT: { icon: IconLogout, color: 'gray', label: 'Logout' },
    READ: { icon: IconEye, color: 'blue', label: 'Read' },
    CREATE: { icon: IconUserPlus, color: 'teal', label: 'Create' },
    UPDATE: { icon: IconEdit, color: 'yellow', label: 'Update' },
    DELETE: { icon: IconUserMinus, color: 'red', label: 'Delete' },
    ACCESS_DENIED: { icon: IconLock, color: 'red', label: 'Access Denied' },
    ROLE_CHANGE: { icon: IconShieldCheck, color: 'violet', label: 'Role Change' },
    STATUS_CHANGE: { icon: IconUser, color: 'orange', label: 'Status Change' },
};

const ACTION_OPTIONS = [
    { value: '', label: 'All Actions' },
    { value: 'LOGIN', label: 'Login' },
    { value: 'LOGOUT', label: 'Logout' },
    { value: 'CREATE', label: 'Create' },
    { value: 'UPDATE', label: 'Update' },
    { value: 'DELETE', label: 'Delete' },
    { value: 'ACCESS_DENIED', label: 'Access Denied' },
    { value: 'ROLE_CHANGE', label: 'Role Change' },
    { value: 'STATUS_CHANGE', label: 'Status Change' },
];

// =============================================================================
// COMPONENT
// =============================================================================

export const AuditLogViewer: React.FC<AuditLogViewerProps> = ({
    pageSize = 20,
    compact = false,
}) => {
    const theme = useMantineTheme();
    const { activeRole } = useAuth();

    // State
    const [logs, setLogs] = useState<AuditLogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchUserId, setSearchUserId] = useState('');
    const [filterAction, setFilterAction] = useState<string>('');
    const [currentPage, setCurrentPage] = useState(1);
    const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

    // Check if user is super_admin
    const isSuperAdmin = activeRole === 'super_admin';

    // Fetch logs
    const fetchLogs = useCallback(async () => {
        if (!isSuperAdmin) return;

        setLoading(true);
        setError(null);

        try {
            let fetchedLogs: AuditLogEntry[];

            if (searchUserId.trim()) {
                fetchedLogs = await getAuditLogsByUser(searchUserId.trim(), pageSize * 5);
            } else if (filterAction) {
                fetchedLogs = await getAuditLogsByAction(filterAction as AuditAction, pageSize * 5);
            } else {
                fetchedLogs = await getRecentAuditLogs(pageSize * 5);
            }

            setLogs(fetchedLogs);
            setCurrentPage(1);
        } catch (err) {
            console.error('Error fetching audit logs:', err);
            setError(err instanceof Error ? err.message : 'Failed to fetch audit logs');
        } finally {
            setLoading(false);
        }
    }, [isSuperAdmin, searchUserId, filterAction, pageSize]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    // Pagination
    const totalPages = Math.ceil(logs.length / pageSize);
    const paginatedLogs = logs.slice(
        (currentPage - 1) * pageSize,
        currentPage * pageSize
    );

    // Format timestamp
    const formatTimestamp = (timestamp: string | number) => {
        const date = new Date(timestamp);
        return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
    };

    // Render action badge
    const renderActionBadge = (action: AuditAction) => {
        const config = ACTION_CONFIG[action];
        if (!config) {
            return (
                <Badge color="gray" variant="light" size={compact ? 'xs' : 'sm'}>
                    {action}
                </Badge>
            );
        }
        const IconComponent = config.icon;

        return (
            <Badge
                color={config.color}
                variant="light"
                leftSection={<IconComponent size={rem(12)} />}
                size={compact ? 'xs' : 'sm'}
            >
                {config.label}
            </Badge>
        );
    };

    // Toggle log details
    const toggleDetails = (logId: string) => {
        setExpandedLogId(expandedLogId === logId ? null : logId);
    };

    // Access denied for non-super_admin
    if (!isSuperAdmin) {
        return (
            <Alert
                icon={<IconAlertTriangle size={rem(16)} />}
                title="Access Denied"
                color="red"
                variant="filled"
            >
                Only Super Administrators can view audit logs.
            </Alert>
        );
    }

    return (
        <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Stack gap="md">
                {/* Header */}
                <Group justify="space-between">
                    <Group gap="xs">
                        <IconShieldCheck size={rem(24)} color={theme.colors.blue[6]} />
                        <Title order={4}>Audit Logs</Title>
                    </Group>
                    <Tooltip label="Refresh logs">
                        <ActionIcon
                            variant="light"
                            onClick={fetchLogs}
                            loading={loading}
                        >
                            <IconRefresh size={rem(16)} />
                        </ActionIcon>
                    </Tooltip>
                </Group>

                {/* Filters */}
                <Paper p="sm" withBorder>
                    <Group gap="md" grow>
                        <TextInput
                            placeholder="Filter by User ID..."
                            leftSection={<IconSearch size={rem(14)} />}
                            value={searchUserId}
                            onChange={(e) => setSearchUserId(e.target.value)}
                            size={compact ? 'xs' : 'sm'}
                        />
                        <Select
                            placeholder="Filter by Action"
                            data={ACTION_OPTIONS}
                            value={filterAction}
                            onChange={(value) => setFilterAction(value || '')}
                            clearable
                            size={compact ? 'xs' : 'sm'}
                        />
                        <Button
                            variant="light"
                            onClick={fetchLogs}
                            loading={loading}
                            size={compact ? 'xs' : 'sm'}
                        >
                            Search
                        </Button>
                    </Group>
                </Paper>

                {/* Error Alert */}
                {error && (
                    <Alert color="red" icon={<IconAlertTriangle size={rem(16)} />}>
                        {error}
                    </Alert>
                )}

                {/* Loading State */}
                {loading && (
                    <Center py="xl">
                        <Loader size="md" />
                    </Center>
                )}

                {/* Logs Table */}
                {!loading && !error && (
                    <ScrollArea>
                        <Table striped highlightOnHover>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th style={{ width: 40 }}></Table.Th>
                                    <Table.Th>Timestamp</Table.Th>
                                    <Table.Th>Action</Table.Th>
                                    <Table.Th>User ID</Table.Th>
                                    <Table.Th>Role</Table.Th>
                                    <Table.Th>Target</Table.Th>
                                    {!compact && <Table.Th>Target ID</Table.Th>}
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {paginatedLogs.length === 0 ? (
                                    <Table.Tr>
                                        <Table.Td colSpan={7}>
                                            <Center py="md">
                                                <Text c="dimmed" size="sm">
                                                    No audit logs found
                                                </Text>
                                            </Center>
                                        </Table.Td>
                                    </Table.Tr>
                                ) : (
                                    paginatedLogs.map((log) => (
                                        <React.Fragment key={log.id}>
                                            <Table.Tr
                                                style={{ cursor: log.details ? 'pointer' : 'default' }}
                                                onClick={() => log.details && toggleDetails(log.id)}
                                            >
                                                <Table.Td>
                                                    {log.details && (
                                                        <ActionIcon variant="subtle" size="sm">
                                                            {expandedLogId === log.id ? (
                                                                <IconChevronDown size={rem(14)} />
                                                            ) : (
                                                                <IconChevronRight size={rem(14)} />
                                                            )}
                                                        </ActionIcon>
                                                    )}
                                                </Table.Td>
                                                <Table.Td>
                                                    <Text size="xs" c="dimmed">
                                                        {formatTimestamp(log.timestamp)}
                                                    </Text>
                                                </Table.Td>
                                                <Table.Td>{renderActionBadge(log.action)}</Table.Td>
                                                <Table.Td>
                                                    <Code>{log.userId?.slice(0, 8) || 'N/A'}...</Code>
                                                </Table.Td>
                                                <Table.Td>
                                                    <Badge variant="outline" size="xs">
                                                        {log.userRole || 'N/A'}
                                                    </Badge>
                                                </Table.Td>
                                                <Table.Td>
                                                    <Text size="sm">{log.target || '—'}</Text>
                                                </Table.Td>
                                                {!compact && (
                                                    <Table.Td>
                                                        <Text size="xs" c="dimmed" truncate style={{ maxWidth: 120 }}>
                                                            {log.targetId || '—'}
                                                        </Text>
                                                    </Table.Td>
                                                )}
                                            </Table.Tr>
                                            {/* Expanded Details Row */}
                                            {log.details && (
                                                <Table.Tr>
                                                    <Table.Td colSpan={7} p={0}>
                                                        <Collapse in={expandedLogId === log.id}>
                                                            <Box p="sm" bg={theme.colors.gray[0]}>
                                                                <Text size="xs" fw={500} mb="xs">
                                                                    Details:
                                                                </Text>
                                                                <Code block style={{ fontSize: rem(11) }}>
                                                                    {JSON.stringify(log.details, null, 2)}
                                                                </Code>
                                                            </Box>
                                                        </Collapse>
                                                    </Table.Td>
                                                </Table.Tr>
                                            )}
                                        </React.Fragment>
                                    ))
                                )}
                            </Table.Tbody>
                        </Table>
                    </ScrollArea>
                )}

                {/* Pagination */}
                {!loading && totalPages > 1 && (
                    <Group justify="center">
                        <Pagination
                            value={currentPage}
                            onChange={setCurrentPage}
                            total={totalPages}
                            size={compact ? 'xs' : 'sm'}
                        />
                    </Group>
                )}

                {/* Stats Footer */}
                {!loading && logs.length > 0 && (
                    <Text size="xs" c="dimmed" ta="center">
                        Showing {paginatedLogs.length} of {logs.length} logs
                    </Text>
                )}
            </Stack>
        </Card>
    );
};

export default AuditLogViewer;
