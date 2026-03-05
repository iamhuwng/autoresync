import { useState, useEffect, useRef } from 'react';
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
    const containerRef = useRef<HTMLDivElement>(null);

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

    // Close popover when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setOpened(false);
            }
        };

        if (opened) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [opened]);

    const handleMarkAsRead = async (id: string) => {
        await markNotificationAsRead(userId, id);
    };

    const handleMarkAllRead = async () => {
        await markAllNotificationsAsRead(userId);
    };

    return (
        <div ref={containerRef} style={{ display: 'inline-block', position: 'relative' }}>
            <div style={{ position: 'relative', display: 'inline-block' }}>
                <button
                    onClick={() => setOpened(o => !o)}
                    style={{
                        background: opened ? 'rgba(59,130,246,0.1)' : 'transparent',
                        color: opened ? '#3b82f6' : '#64748b',
                        border: 'none',
                        borderRadius: '0.375rem',
                        padding: '0.375rem',
                        cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'background 0.2s, color 0.2s'
                    }}
                    aria-label="Notifications"
                >
                    {unreadCount > 0 ? <IconBellFilled size={22} /> : <IconBell size={22} />}
                </button>
                {unreadCount > 0 && (
                    <div style={{
                        position: 'absolute', top: -2, right: -2,
                        background: '#ef4444', color: 'white',
                        fontSize: '0.65rem', fontWeight: 700,
                        border: '2px solid white', borderRadius: '1rem',
                        padding: '0 0.25rem', minWidth: '1rem', height: '1rem',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </div>
                )}
            </div>

            {opened && (
                <div style={{
                    position: 'absolute', top: 'calc(100% + 0.5rem)', right: 0,
                    width: 340, background: 'white',
                    borderRadius: '0.5rem', boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                    border: '1px solid #e2e8f0', zIndex: 1000,
                    overflow: 'hidden'
                }}>
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
                </div>
            )}

            <NotificationSettingsModal
                userId={userId}
                opened={settingsOpened}
                onClose={() => setSettingsOpened(false)}
            />
        </div>
    );
}

export default NotificationBell;
