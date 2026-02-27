
import { Paper, Text, Stack, Group, ThemeIcon, ScrollArea, Button, Badge, Box, ActionIcon } from '@mantine/core';
import { IconInfoCircle, IconCheck, IconAlertTriangle, IconX, IconChecklist, IconSettings, IconMessageCircle } from '@tabler/icons-react';
import { Notification } from '../../types/notification.types';
import { useNavigate } from 'react-router-dom';

interface NotificationPanelProps {
    notifications: Notification[];
    onMarkAsRead: (id: string) => void;
    onMarkAllRead: () => void;
    onClose?: () => void;
    onOpenSettings?: () => void;
}

const NotificationItem = ({ notification, onMarkAsRead, onClose }: { notification: Notification, onMarkAsRead: (id: string) => void, onClose?: () => void }) => {
    const navigate = useNavigate();

    const getIcon = () => {
        switch (notification.type) {
            case 'success': return <IconCheck size={16} />;
            case 'warning': return <IconAlertTriangle size={16} />;
            case 'error': return <IconX size={16} />;
            case 'feedback': return <IconMessageCircle size={16} />;
            case 'info': default: return <IconInfoCircle size={16} />;
        }
    };

    const getColor = () => {
        switch (notification.type) {
            case 'success': return 'green';
            case 'warning': return 'yellow';
            case 'error': return 'red';
            case 'feedback': return 'blue';
            case 'info': default: return 'blue';
        }
    };

    const handleClick = () => {
        if (!notification.read) {
            onMarkAsRead(notification.id);
        }
        if (notification.link) {
            navigate(notification.link);
            if (onClose) onClose();
        }
    };

    return (
        <Paper
            p="sm"
            radius="sm"
            withBorder={false}
            style={{
                backgroundColor: notification.read ? 'transparent' : 'rgba(var(--mantine-color-blue-light), 0.1)',
                borderBottom: '1px solid var(--mantine-color-gray-2)',
                cursor: notification.link ? 'pointer' : 'default',
                transition: 'background-color 0.2s'
            }}
            onClick={handleClick}
            className="notification-item"
        >
            <Group wrap="nowrap" align="flex-start">
                <ThemeIcon color={getColor()} variant="light" size="md" radius="xl" mt={2}>
                    {getIcon()}
                </ThemeIcon>
                <div style={{ flex: 1 }}>
                    <Group justify="space-between" align="flex-start" wrap="nowrap">
                        <Text size="sm" fw={600} style={{ lineHeight: 1.2 }}>{notification.title}</Text>
                        {!notification.read && <Badge size="xs" circle color="blue" />}
                    </Group>
                    <Text size="xs" c="dimmed" mt={4} style={{ lineHeight: 1.4 }}>
                        {notification.message}
                    </Text>
                    <Text size="xs" c="dimmed" mt={8} style={{ fontSize: '0.65rem' }}>
                        {new Date(notification.createdAt).toLocaleString()}
                    </Text>
                </div>
            </Group>
        </Paper>
    );
};

export function NotificationPanel({ notifications, onMarkAsRead, onMarkAllRead, onClose, onOpenSettings }: NotificationPanelProps) {
    const unreadCount = notifications.filter(n => !n.read).length;
    // Notifications are already capped at 5 by NotificationBell — display all of them
    const displayList = notifications;
    const navigate = useNavigate();

    return (
        <Stack gap={0} style={{ width: 320, maxHeight: 500 }}>
            <Box p="sm" style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}>
                <Group justify="space-between">
                    <Text fw={700} size="sm">Notifications</Text>
                    {unreadCount > 0 && (
                        <Button
                            variant="subtle"
                            size="xs"
                            leftSection={<IconChecklist size={14} />}
                            onClick={onMarkAllRead}
                        >
                            Mark all read
                        </Button>
                    )}
                    {onOpenSettings && (
                        <ActionIcon variant="subtle" color="gray" onClick={onOpenSettings} size="sm">
                            <IconSettings size={16} />
                        </ActionIcon>
                    )}
                </Group>
            </Box>

            <ScrollArea.Autosize mah={400} type="always">
                {displayList.length === 0 ? (
                    <Stack align="center" justify="center" p="xl" style={{ minHeight: 150 }}>
                        <ThemeIcon color="gray" variant="light" size="xl" radius="xl">
                            <IconCheck size={24} />
                        </ThemeIcon>
                        <Text size="sm" c="dimmed" ta="center">No notifications yet</Text>
                    </Stack>
                ) : (
                    <Stack gap={0}>
                        {displayList.map(notification => (
                            <NotificationItem
                                key={notification.id}
                                notification={notification}
                                onMarkAsRead={onMarkAsRead}
                                onClose={onClose}
                            />
                        ))}
                    </Stack>
                )}
            </ScrollArea.Autosize>
            <Box p="xs" style={{ borderTop: '1px solid var(--mantine-color-gray-3)' }}>
                <Button
                    variant="subtle"
                    fullWidth
                    size="xs"
                    onClick={() => {
                        console.log('📢 [NotificationPanel] User clicked "See All Activity" — navigating to dashboard feed.');
                        onClose?.();
                        navigate('/student/dashboard?view=feed');
                    }}
                >
                    See All Activity →
                </Button>
            </Box>
        </Stack>
    );
}

export default NotificationPanel;
