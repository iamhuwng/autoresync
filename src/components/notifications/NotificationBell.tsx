
import { useState, useEffect } from 'react';
import { Indicator, ActionIcon, Popover } from '@mantine/core';
import { IconBell, IconBellFilled } from '@tabler/icons-react';
import {
    subscribeToNotifications,
    markNotificationAsRead,
    markAllNotificationsAsRead
} from '../../services/notificationService';
import { Notification } from '../../types/notification.types';
import NotificationPanel from './NotificationPanel';
import { NotificationSettingsModal } from './NotificationSettingsModal';

interface NotificationBellProps {
    userId: string;
}

export function NotificationBell({ userId }: NotificationBellProps) {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [opened, setOpened] = useState(false);
    const [settingsOpened, setSettingsOpened] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);

    useEffect(() => {
        if (!userId) return;

        // Subscribe to real-time notifications
        const unsubscribe = subscribeToNotifications(userId, (newNotifications) => {
            // Task 4.1: Unread badge uses FULL array for accuracy;
            // displayed list is capped at 5 most recent
            setUnreadCount(newNotifications.filter(n => !n.read).length);
            setNotifications(newNotifications.slice(0, 5));
            console.log(`📢 [NotificationBell] Received ${newNotifications.length} notifications, displaying top 5.`);
        });

        return () => unsubscribe();
    }, [userId]);

    const handleMarkAsRead = async (id: string) => {
        await markNotificationAsRead(userId, id);
    };

    const handleMarkAllRead = async () => {
        await markAllNotificationsAsRead(userId);
    };

    return (
        <>
            <Popover
                opened={opened}
                onChange={setOpened}
                width={340}
                position="bottom-end"
                shadow="md"
                withArrow
                trapFocus
            >
                <Popover.Target>
                    <Indicator
                        inline
                        label={unreadCount > 99 ? '99+' : unreadCount}
                        size={16}
                        color="red"
                        offset={4}
                        disabled={unreadCount === 0}
                        withBorder
                    >
                        <ActionIcon
                            variant={opened ? "light" : "transparent"} // Change variant based on open state
                            radius="md"
                            size="lg"
                            color={opened ? "blue" : "gray"} // Highlight when open
                            onClick={() => setOpened((o) => !o)}
                            aria-label="Notifications"
                        >
                            {unreadCount > 0 ? <IconBellFilled size={22} /> : <IconBell size={22} />}
                        </ActionIcon>
                    </Indicator>
                </Popover.Target>

                <Popover.Dropdown p={0}>
                    <NotificationPanel
                        notifications={notifications}
                        onMarkAsRead={handleMarkAsRead}
                        onMarkAllRead={handleMarkAllRead}
                        onClose={() => setOpened(false)}
                        onOpenSettings={() => {
                            setOpened(false);
                            setSettingsOpened(true);
                        }}
                    />
                </Popover.Dropdown>
            </Popover>
            <NotificationSettingsModal
                userId={userId}
                opened={settingsOpened}
                onClose={() => setSettingsOpened(false)}
            />
        </>
    );
}

export default NotificationBell;
