import { useState, useEffect, useRef, useImperativeHandle, type Ref } from 'react';
import { IconBell, IconBellFilled } from '@tabler/icons-react';
import {
    subscribeToNotifications,
    getPaginatedUserNotifications,
    markNotificationAsRead,
    markAllNotificationsAsRead
} from '../../services/notificationService';
import type { NotificationCursor } from '../../services/notificationService';
import { toast } from '../modern/ToastNotification';
import { FEATURE_IDS } from '../../config/featureRegistry';
import { sessionService } from '../../services/sessionService';
import { auth } from '../../services/firebase';
import { Notification } from '../../types/notification.types';
import NotificationPanel from './NotificationPanel';
import { NotificationSettingsModal } from './NotificationSettingsModal';
import { useNavigation } from '../../hooks/useNavigation';
import { useFeatureTracking } from '../../hooks/useFeatureTracking';
import { resolveNotificationDestination } from '../../services/notificationDestinationResolver';
import type { NotificationResolverRole } from '../../services/notificationDestinationResolver';

export interface NotificationBellHandle { openHistory: (returnFocus?: HTMLElement) => void }

interface NotificationBellProps {
    ref?: Ref<NotificationBellHandle>;
    hideTrigger?: boolean;
    userId: string;
    role?: NotificationResolverRole;
}

export function NotificationBell({ userId, role = 'student', ref, hideTrigger = false }: NotificationBellProps) {
    const { currentPath, navigateTo } = useNavigation(role);
    const { trackAction } = useFeatureTracking(FEATURE_IDS.notifications);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [opened, setOpened] = useState(false);
    const [settingsOpened, setSettingsOpened] = useState(false);
    const [limit, setLimit] = useState(10);
    const [hasMore, setHasMore] = useState(false);
    const [history, setHistory] = useState<Notification[] | null>(null);
    const [cursor, setCursor] = useState<NotificationCursor>();
    const [historyHasMore, setHistoryHasMore] = useState(false);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [inboxError, setInboxError] = useState(false);
    const historyRequest = useRef(0);
    const unreadCount = notifications.slice(0, 10).filter(notification => !notification.read).length;
    const panelRef = useRef<HTMLDivElement>(null);
    const returnFocusRef = useRef<HTMLElement | undefined>(undefined);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        historyRequest.current += 1;
        setHistory(null);
        setCursor(undefined);
        setHistoryHasMore(false);
        setLoadingHistory(false);
        setLimit(10);
        setNotifications([]);
        setOpened(false);
    }, [userId]);

    useEffect(() => {
        if (!userId) return;
        setInboxError(false);
        return subscribeToNotifications(userId, records => {
            setNotifications(records.slice(0, limit));
            setHasMore(records.length > limit);
            setInboxError(false);
        }, limit, () => setInboxError(true));
    }, [userId, limit]);

    const loadHistory = async (append = false) => {
        if (loadingHistory) return;
        const request = ++historyRequest.current;
        if (append) panelRef.current?.focus();
        trackAction(append ? 'loadMoreHistory' : 'openHistory', { role });
        setLoadingHistory(true);
        try {
            const page = await getPaginatedUserNotifications(userId, 20, append ? cursor : undefined);
            if (request !== historyRequest.current) return;
            setHistory(previous => append ? [...(previous ?? []), ...page.notifications.filter(item => !previous?.some(old => old.id === item.id))] : page.notifications);
            setCursor(page.cursor);
            setHistoryHasMore(page.hasMore);
        } catch {
            if (request === historyRequest.current) toast.error('Could not load notification history. Please try again.');
        } finally {
            if (request === historyRequest.current) setLoadingHistory(false);
        }
    };

    useImperativeHandle(ref, () => ({ openHistory: returnFocus => {
        returnFocusRef.current = returnFocus;
        setOpened(true);
        void loadHistory();
    } }));

    useEffect(() => { if (opened) panelRef.current?.focus(); }, [opened]);
    const closeNotifications = () => {
        trackAction('closeBell');
        setOpened(false);
        returnFocusRef.current?.focus();
    };

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
        trackAction('markRead', { notificationId: id });
        const result = await markNotificationAsRead(userId, id);
        if (!result.success) { toast.error('Could not mark notification as read. Please try again.'); return; }
        setNotifications(previous => previous.map(item => item.id === id ? { ...item, read: true } : item));
        setHistory(previous => previous?.map(item => item.id === id ? { ...item, read: true } : item) ?? null);
    };

    const handleMarkAllRead = async () => {
        panelRef.current?.focus();
        trackAction('markDisplayedRead', { source: 'notification_bell' });
        const displayed = history ?? notifications;
        const result = await markAllNotificationsAsRead(userId, displayed);
        if (!result.success) { toast.error('Could not mark notifications as read. Please try again.'); return; }
        const ids = new Set(displayed.map(item => item.id));
        setNotifications(previous => previous.map(item => ids.has(item.id) ? { ...item, read: true } : item));
        setHistory(previous => previous?.map(item => ({ ...item, read: true })) ?? null);
        toast.success('Displayed notifications marked as read.');
    };

    const handleOpenNotification = async (notification: Notification) => {
        const resolution = await resolveNotificationDestination(notification, {
            userId,
            currentPath,
            role,
        });

        trackAction('openFeedLink', {
            source: 'notification_bell',
            notificationId: notification.id,
            outcome: resolution.status,
            ...(resolution.status === 'allowed'
                ? { destination: resolution.destination }
                : { reason: resolution.reason }),
        });

        if (resolution.status === 'allowed') {
            if (resolution.destination === 'STUDENT_TEST' || resolution.destination === 'STUDENT_WAITING') {
                const sessionCode = resolution.params.sessionCode ?? resolution.params.gameSessionId;
                if (sessionCode) sessionService.setPlayerData(userId, auth.currentUser?.displayName || 'Student', sessionCode);
            }
            navigateTo(resolution.destination, resolution.params, { reason: 'notification_open' });
        }

        return resolution;
    };

    return (
        <div ref={containerRef} style={{ display: 'inline-block', position: 'relative' }} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); closeNotifications(); } }}>
            {!hideTrigger && <div style={{ position: 'relative', display: 'inline-block' }}>
                <button
                    onClick={() => { trackAction('toggleBell', { opened: !opened }); setOpened(o => !o); }}
                    style={{
                        background: opened ? 'rgba(59,130,246,0.1)' : 'transparent',
                        color: opened ? '#3b82f6' : '#64748b',
                        border: 'none',
                        borderRadius: '0.375rem',
                        padding: '0.375rem',
                        cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        minWidth: '44px', minHeight: '44px',
                        transition: 'background 0.2s, color 0.2s'
                    }}
                    aria-label="Notifications"
                    aria-expanded={opened}
                >
                    {unreadCount > 0 ? <IconBellFilled size={22} /> : <IconBell size={22} />}
                </button>
                {unreadCount > 0 && (
                    <div title="Unread among the latest 10 notifications" style={{
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
            </div>}

            {opened && (
                <div ref={panelRef} tabIndex={-1} role="dialog" aria-label={history ? 'Notification history' : 'Notifications'} style={{
                    position: hideTrigger ? 'fixed' : 'absolute', top: hideTrigger ? 64 : 'calc(100% + 0.5rem)', right: hideTrigger ? 12 : 0,
                    width: 'min(340px, calc(100vw - 24px))', background: 'white',
                    borderRadius: '0.5rem', boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                    border: '1px solid #e2e8f0', zIndex: 1000,
                    overflow: 'hidden'
                }}>
                    <NotificationPanel
                        title={history ? 'Notification history' : 'Notifications'}
                        loading={loadingHistory}
                        error={inboxError && !history ? 'Could not load notifications.' : undefined}
                        notifications={history ?? notifications}
                        onLoadMore={history ? (historyHasMore ? () => { void loadHistory(true); } : undefined) : (hasMore && limit < 30 ? () => { trackAction('loadMoreBell', { limit }); panelRef.current?.focus(); setLimit(value => Math.min(30, value + 10)); } : undefined)}
                        onBack={history ? () => { trackAction('closeHistory'); setHistory(null); } : undefined}
                        onMarkAsRead={handleMarkAsRead}
                        onMarkAllRead={handleMarkAllRead}
                        onOpenNotification={handleOpenNotification}
                        onSeeAll={history ? undefined : () => { void loadHistory(); }}
                        onClose={closeNotifications}
                        onOpenSettings={() => {
                            trackAction('openSettings');
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
