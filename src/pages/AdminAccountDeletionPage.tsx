/**
 * AdminAccountDeletionPage Component
 * PRD-0015: Phase 10 - Admin Management for Account Deletions
 * 
 * Features:
 * - List all pending deletion requests
 * - Show user info, request date, and days remaining
 * - Force hard delete (immediate permanent deletion)
 * - Cancel deletion requests
 * - View completed deletions
 */

import { useState, useEffect } from 'react';
import {
    Container,
    Paper,
    Title,
    Text,
    Stack,
    Group,
    Button,
    Table,
    Badge,
    Loader,
    Center,
    Alert,
    Tabs,
    ActionIcon,
    Tooltip,
    Modal,
} from '@mantine/core';
import {
    IconTrash,
    IconX,
    IconAlertTriangle,
    IconClock,
    IconCheck,
    IconShieldCheck,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import {
    getDeletedUsers,
    getPendingDeletions,
    hardDelete,
    cancelDeletion,
    DeletedUser,
} from '@/services/accountDeletionService';
import { useAuth } from '@/contexts/AuthContext';

export function AdminAccountDeletionPage() {
    const { currentUser } = useAuth();
    const [loading, setLoading] = useState(true);
    const [allDeletions, setAllDeletions] = useState<DeletedUser[]>([]);
    const [pendingDeletions, setPendingDeletions] = useState<DeletedUser[]>([]);
    const [processing, setProcessing] = useState<string | null>(null);
    const [selectedUser, setSelectedUser] = useState<DeletedUser | null>(null);
    const [hardDeleteModalOpen, setHardDeleteModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<string>('pending');

    useEffect(() => {
        loadDeletions();
    }, []);

    const loadDeletions = async () => {
        setLoading(true);
        try {
            const [all, pending] = await Promise.all([
                getDeletedUsers(),
                getPendingDeletions(),
            ]);
            setAllDeletions(all);
            setPendingDeletions(pending);
        } catch (error) {
            console.error('Failed to load deletions:', error);
            notifications.show({
                title: 'Error',
                message: 'Failed to load deletion requests',
                color: 'red',
            });
        } finally {
            setLoading(false);
        }
    };

    const handleCancelDeletion = async (userId: string, displayName: string) => {
        setProcessing(userId);
        try {
            await cancelDeletion(userId);

            notifications.show({
                title: 'Deletion Cancelled',
                message: `Cancelled deletion request for ${displayName}`,
                color: 'green',
                icon: <IconCheck size={20} />,
            });

            await loadDeletions();
        } catch (error) {
            console.error('Failed to cancel deletion:', error);
            notifications.show({
                title: 'Error',
                message: 'Failed to cancel deletion request',
                color: 'red',
            });
        } finally {
            setProcessing(null);
        }
    };

    const openHardDeleteModal = (user: DeletedUser) => {
        setSelectedUser(user);
        setHardDeleteModalOpen(true);
    };

    const handleHardDelete = async () => {
        if (!selectedUser || !currentUser?.uid) return;

        setProcessing(selectedUser.userId);
        try {
            await hardDelete(selectedUser.userId, currentUser.uid);

            notifications.show({
                title: 'Account Deleted',
                message: `Permanently deleted account for ${selectedUser.displayName}`,
                color: 'red',
                icon: <IconTrash size={20} />,
            });

            setHardDeleteModalOpen(false);
            setSelectedUser(null);
            await loadDeletions();
        } catch (error) {
            console.error('Failed to hard delete:', error);
            notifications.show({
                title: 'Error',
                message: 'Failed to permanently delete account',
                color: 'red',
            });
        } finally {
            setProcessing(null);
        }
    };

    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const getDaysRemainingDisplay = (scheduledAt: number) => {
        const now = Date.now();
        const remaining = scheduledAt - now;
        const days = Math.ceil(remaining / (24 * 60 * 60 * 1000));

        if (days <= 0) {
            return <Badge color="red">Overdue</Badge>;
        } else if (days <= 7) {
            return <Badge color="orange">{days} days</Badge>;
        } else {
            return <Badge color="blue">{days} days</Badge>;
        }
    };

    const getStatusBadge = (status: DeletedUser['status']) => {
        switch (status) {
            case 'pending':
                return <Badge color="orange">Pending</Badge>;
            case 'cancelled':
                return <Badge color="green">Cancelled</Badge>;
            case 'completed':
                return <Badge color="red">Completed</Badge>;
            default:
                return <Badge color="gray">Unknown</Badge>;
        }
    };

    if (loading) {
        return (
            <Center h="100vh">
                <Loader size="lg" />
            </Center>
        );
    }

    const completedDeletions = allDeletions.filter(d => d.status === 'completed');
    const cancelledDeletions = allDeletions.filter(d => d.status === 'cancelled');

    return (
        <Container size="xl" py="xl">
            <Paper p="xl" shadow="sm" radius="md">
                <Stack gap="lg">
                    {/* Header */}
                    <Group justify="space-between">
                        <div>
                            <Group gap="sm">
                                <IconShieldCheck size={32} color="red" />
                                <Title order={2}>Account Deletion Management</Title>
                            </Group>
                            <Text size="sm" c="dimmed" mt="xs">
                                Manage user account deletion requests and enforce GDPR compliance
                            </Text>
                        </div>
                        <Button
                            variant="light"
                            leftSection={<IconCheck size={16} />}
                            onClick={loadDeletions}
                        >
                            Refresh
                        </Button>
                    </Group>

                    {/* Summary Stats */}
                    <Group grow>
                        <Paper p="md" withBorder>
                            <Text size="sm" c="dimmed">Pending Deletions</Text>
                            <Text size="xl" fw={700} c="orange">{pendingDeletions.length}</Text>
                        </Paper>
                        <Paper p="md" withBorder>
                            <Text size="sm" c="dimmed">Completed</Text>
                            <Text size="xl" fw={700} c="red">{completedDeletions.length}</Text>
                        </Paper>
                        <Paper p="md" withBorder>
                            <Text size="sm" c="dimmed">Cancelled</Text>
                            <Text size="xl" fw={700} c="green">{cancelledDeletions.length}</Text>
                        </Paper>
                    </Group>

                    {/* Tabs */}
                    <Tabs value={activeTab} onChange={(value) => setActiveTab(value || 'pending')}>
                        <Tabs.List>
                            <Tabs.Tab value="pending" leftSection={<IconClock size={16} />}>
                                Pending ({pendingDeletions.length})
                            </Tabs.Tab>
                            <Tabs.Tab value="all" leftSection={<IconAlertTriangle size={16} />}>
                                All Requests ({allDeletions.length})
                            </Tabs.Tab>
                        </Tabs.List>

                        {/* Pending Deletions Tab */}
                        <Tabs.Panel value="pending" pt="md">
                            {pendingDeletions.length === 0 ? (
                                <Alert color="green" icon={<IconCheck size={20} />}>
                                    <Text fw={500}>No pending deletions</Text>
                                    <Text size="sm">All deletion requests have been processed.</Text>
                                </Alert>
                            ) : (
                                <>
                                    <Alert color="orange" icon={<IconAlertTriangle size={20} />} mb="md">
                                        <Text size="sm">
                                            <strong>{pendingDeletions.length}</strong> account(s) scheduled for deletion.
                                            Review and take action below.
                                        </Text>
                                    </Alert>

                                    <Table highlightOnHover>
                                        <Table.Thead>
                                            <Table.Tr>
                                                <Table.Th>User</Table.Th>
                                                <Table.Th>Email</Table.Th>
                                                <Table.Th>Requested</Table.Th>
                                                <Table.Th>Time Remaining</Table.Th>
                                                <Table.Th>Reason</Table.Th>
                                                <Table.Th>Actions</Table.Th>
                                            </Table.Tr>
                                        </Table.Thead>
                                        <Table.Tbody>
                                            {pendingDeletions.map((deletion) => (
                                                <Table.Tr key={deletion.userId}>
                                                    <Table.Td>
                                                        <Text fw={500}>{deletion.displayName}</Text>
                                                        <Text size="xs" c="dimmed">{deletion.userId}</Text>
                                                    </Table.Td>
                                                    <Table.Td>{deletion.email}</Table.Td>
                                                    <Table.Td>
                                                        <Text size="sm">{formatDate(deletion.requestedAt)}</Text>
                                                    </Table.Td>
                                                    <Table.Td>
                                                        {getDaysRemainingDisplay(deletion.scheduledDeletionAt)}
                                                    </Table.Td>
                                                    <Table.Td>
                                                        <Text size="sm" c="dimmed">
                                                            {deletion.reason || '—'}
                                                        </Text>
                                                    </Table.Td>
                                                    <Table.Td>
                                                        <Group gap="xs">
                                                            <Tooltip label="Cancel Deletion">
                                                                <ActionIcon
                                                                    variant="light"
                                                                    color="green"
                                                                    onClick={() =>
                                                                        handleCancelDeletion(
                                                                            deletion.userId,
                                                                            deletion.displayName
                                                                        )
                                                                    }
                                                                    loading={processing === deletion.userId}
                                                                >
                                                                    <IconX size={16} />
                                                                </ActionIcon>
                                                            </Tooltip>
                                                            <Tooltip label="Force Delete Now">
                                                                <ActionIcon
                                                                    variant="light"
                                                                    color="red"
                                                                    onClick={() => openHardDeleteModal(deletion)}
                                                                    loading={processing === deletion.userId}
                                                                >
                                                                    <IconTrash size={16} />
                                                                </ActionIcon>
                                                            </Tooltip>
                                                        </Group>
                                                    </Table.Td>
                                                </Table.Tr>
                                            ))}
                                        </Table.Tbody>
                                    </Table>
                                </>
                            )}
                        </Tabs.Panel>

                        {/* All Requests Tab */}
                        <Tabs.Panel value="all" pt="md">
                            {allDeletions.length === 0 ? (
                                <Alert color="blue">
                                    <Text>No deletion requests found.</Text>
                                </Alert>
                            ) : (
                                <Table highlightOnHover>
                                    <Table.Thead>
                                        <Table.Tr>
                                            <Table.Th>User</Table.Th>
                                            <Table.Th>Email</Table.Th>
                                            <Table.Th>Requested</Table.Th>
                                            <Table.Th>Status</Table.Th>
                                            <Table.Th>Scheduled For</Table.Th>
                                            <Table.Th>Reason</Table.Th>
                                        </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                        {allDeletions.map((deletion) => (
                                            <Table.Tr key={deletion.userId}>
                                                <Table.Td>
                                                    <Text fw={500}>{deletion.displayName}</Text>
                                                    <Text size="xs" c="dimmed">{deletion.userId}</Text>
                                                </Table.Td>
                                                <Table.Td>{deletion.email}</Table.Td>
                                                <Table.Td>
                                                    <Text size="sm">{formatDate(deletion.requestedAt)}</Text>
                                                </Table.Td>
                                                <Table.Td>{getStatusBadge(deletion.status)}</Table.Td>
                                                <Table.Td>
                                                    <Text size="sm">
                                                        {formatDate(deletion.scheduledDeletionAt)}
                                                    </Text>
                                                </Table.Td>
                                                <Table.Td>
                                                    <Text size="sm" c="dimmed">
                                                        {deletion.reason || '—'}
                                                    </Text>
                                                </Table.Td>
                                            </Table.Tr>
                                        ))}
                                    </Table.Tbody>
                                </Table>
                            )}
                        </Tabs.Panel>
                    </Tabs>
                </Stack>
            </Paper>

            {/* Hard Delete Confirmation Modal */}
            <Modal
                opened={hardDeleteModalOpen}
                onClose={() => {
                    setHardDeleteModalOpen(false);
                    setSelectedUser(null);
                }}
                title={
                    <Group gap="xs">
                        <IconAlertTriangle size={24} color="red" />
                        <Text fw={600} size="lg">Force Delete Account</Text>
                    </Group>
                }
                size="md"
            >
                <Stack gap="md">
                    <Alert icon={<IconAlertTriangle size={20} />} color="red" variant="filled">
                        <Text fw={500} mb="xs">⚠️ IRREVERSIBLE ACTION ⚠️</Text>
                        <Text size="sm">
                            This will IMMEDIATELY and PERMANENTLY delete all data for this user.
                            This action CANNOT be undone!
                        </Text>
                    </Alert>

                    {selectedUser && (
                        <Paper p="md" withBorder>
                            <Stack gap="xs">
                                <Group justify="space-between">
                                    <Text size="sm" c="dimmed">User:</Text>
                                    <Text fw={500}>{selectedUser.displayName}</Text>
                                </Group>
                                <Group justify="space-between">
                                    <Text size="sm" c="dimmed">Email:</Text>
                                    <Text>{selectedUser.email}</Text>
                                </Group>
                                <Group justify="space-between">
                                    <Text size="sm" c="dimmed">User ID:</Text>
                                    <Text size="sm" ff="monospace">{selectedUser.userId}</Text>
                                </Group>
                                <Group justify="space-between">
                                    <Text size="sm" c="dimmed">Requested:</Text>
                                    <Text size="sm">{formatDate(selectedUser.requestedAt)}</Text>
                                </Group>
                            </Stack>
                        </Paper>
                    )}

                    <Alert color="blue" variant="light">
                        <Text size="sm">
                            <strong>Admin Note:</strong> Use this action only in special circumstances.
                            Normally, the system will automatically delete accounts after the 30-day grace period.
                        </Text>
                    </Alert>

                    <Group justify="right" mt="md">
                        <Button
                            variant="subtle"
                            onClick={() => {
                                setHardDeleteModalOpen(false);
                                setSelectedUser(null);
                            }}
                            disabled={processing !== null}
                        >
                            Cancel
                        </Button>
                        <Button
                            color="red"
                            leftSection={<IconTrash size={16} />}
                            onClick={handleHardDelete}
                            loading={processing === selectedUser?.userId}
                        >
                            Permanently Delete
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Container>
    );
}
