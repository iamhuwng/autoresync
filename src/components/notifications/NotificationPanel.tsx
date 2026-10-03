import { toast } from '../modern/ToastNotification';
import { IconInfoCircle, IconCheck, IconAlertTriangle, IconX, IconChecklist, IconSettings, IconMessageCircle } from '@tabler/icons-react';
import type { Notification } from '../../types/notification.types';
import { parseNotificationMetadata } from '../../services/notificationMetadata';
import type { NotificationDestinationResolution } from '../../services/notificationDestinationResolver';

interface NotificationPanelProps {
    notifications: Notification[];
    title?: string;
    loading?: boolean;
    error?: string;
    onLoadMore?: () => void;
    onBack?: () => void;
    onMarkAsRead: (id: string) => void | Promise<void>;
    onMarkAllRead: () => void | Promise<void>;
    onOpenNotification?: (notification: Notification) => Promise<NotificationDestinationResolution>;
    onSeeAll?: () => void;
    onClose?: () => void;
    onOpenSettings?: () => void;
}

const blockedMessage = (reason: Extract<NotificationDestinationResolution, { status: 'blocked' }>['reason']) => {
    switch (reason) {
        case 'stale-destination': return 'This notification is no longer available.';
        case 'unauthorized':
        case 'unauthenticated': return 'This notification is not available for the current account.';
        default: return 'This notification cannot be opened safely.';
    }
};

const NotificationItem = ({
    notification,
    onMarkAsRead,
    onOpenNotification,
    onBlocked,
    onClose,
}: {
    notification: Notification;
    onMarkAsRead: (id: string) => void | Promise<void>;
    onOpenNotification?: (notification: Notification) => Promise<NotificationDestinationResolution>;
    onBlocked: (reason: Extract<NotificationDestinationResolution, { status: 'blocked' }>['reason']) => void;
    onClose?: () => void;
}) => {
    const hasDestination = Boolean(notification.link)
        || parseNotificationMetadata(notification.metadata).kind === 'book';

    const getIcon = () => {
        switch (notification.type) {
            case 'success': return <IconCheck size={16} />;
            case 'warning': return <IconAlertTriangle size={16} />;
            case 'error': return <IconX size={16} />;
            case 'feedback': return <IconMessageCircle size={16} />;
            case 'homework_reminder': return <IconMessageCircle size={16} />;
            case 'info': default: return <IconInfoCircle size={16} />;
        }
    };

    const getColor = () => {
        switch (notification.type) {
            case 'success': return '#22c55e'; // green
            case 'warning': return '#eab308'; // yellow
            case 'error': return '#ef4444'; // red
            case 'feedback': return '#3b82f6'; // blue
            case 'homework_reminder': return '#8b5cf6';
            case 'info': default: return '#3b82f6'; // blue
        }
    };

    const handleClick = async () => {
        if (!notification.read) {
            await onMarkAsRead(notification.id);
        }
        if (!hasDestination || !onOpenNotification) return;

        const resolution = await onOpenNotification(notification);
        if (resolution.status === 'blocked') {
            onBlocked(resolution.reason);
            return;
        }

        onClose?.();
    };

    return (
        <div
            style={{
                padding: '0.75rem',
                backgroundColor: notification.read ? 'transparent' : 'rgba(59,130,246,0.1)',
                borderBottom: '1px solid #f1f5f9',
                cursor: hasDestination ? 'pointer' : 'default',
                transition: 'background-color 0.2s',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.75rem'
            }}
            onClick={() => { void handleClick(); }}
            onKeyDown={(event) => {
                if ((event.key !== 'Enter' && event.key !== ' ')) return;
                event.preventDefault();
                void handleClick();
            }}
            role="button"
            tabIndex={0}
            aria-label={`${hasDestination ? 'Open' : 'Read'} notification: ${notification.title}`}
            className="notification-item"
        >
            <div style={{
                color: getColor(),
                backgroundColor: `${getColor()}20`,
                borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 32, height: 32, flexShrink: 0,
                marginTop: 2
            }}>
                {getIcon()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, lineHeight: 1.2, color: '#1e293b' }}>
                        {notification.title}
                    </div>
                    {!notification.read && <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#3b82f6', flexShrink: 0, marginTop: 4 }} />}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 4, lineHeight: 1.4 }}>
                    {notification.message}
                </div>
                <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: 8 }}>
                    {new Date(notification.createdAt).toLocaleString()}
                </div>
            </div>
        </div>
    );
};

export function NotificationPanel({
    notifications,
    title = 'Notifications',
    loading = false,
    error,
    onLoadMore,
    onBack,
    onMarkAsRead,
    onMarkAllRead,
    onOpenNotification,
    onSeeAll,
    onClose,
    onOpenSettings,
}: NotificationPanelProps) {
    const unreadCount = notifications.filter(n => !n.read).length;
    const displayList = notifications;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', width: '100%', maxHeight: 'min(600px, 80dvh)' }}>
            {/* Header */}
            <div style={{ padding: '0.75rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#0f172a', overflowWrap: 'anywhere' }}>{title}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {unreadCount > 0 && (
                        <button
                            type="button"
                            onClick={onMarkAllRead}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '0.25rem',
                                border: 'none', background: 'transparent',
                                color: '#3b82f6', fontSize: '0.75rem', fontWeight: 500,
                                cursor: 'pointer', padding: '0.25rem 0.5rem', minHeight: 44, borderRadius: '0.25rem'
                            }}
                        >
                            <IconChecklist size={14} /> Mark displayed read
                        </button>
                    )}
                    {onOpenSettings && (
                        <button
                            type="button"
                            onClick={onOpenSettings}
                            aria-label="Notification settings"
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                border: 'none', background: 'transparent', color: '#64748b',
                                cursor: 'pointer', padding: '0.25rem', minWidth: 44, minHeight: 44, borderRadius: '0.25rem'
                            }}
                        >
                            <IconSettings size={16} />
                        </button>
                    )}
                </div>
            </div>


            {error && <div role="alert" style={{ padding: 12 }}>{error}</div>}
            {loading && <div role="status" style={{ padding: 12 }}>Loading notification history…</div>}
            {/* List */}
            <div style={{ maxHeight: 400, overflowY: 'auto', minHeight: 0, flex: '1 1 auto' }}>
                {displayList.length === 0 && !loading && !error ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 150, padding: '1.5rem' }}>
                        <div style={{ color: '#94a3b8', backgroundColor: '#f1f5f9', borderRadius: '50%', width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.75rem' }}>
                            <IconCheck size={24} />
                        </div>
                        <div style={{ fontSize: '0.875rem', color: '#64748b', textAlign: 'center' }}>No notifications yet</div>
                    </div>
                ) : (
                    <div>
                        {displayList.map(notification => (
                            <NotificationItem
                                key={notification.id}
                                notification={notification}
                                onMarkAsRead={onMarkAsRead}
                                onOpenNotification={onOpenNotification}
                                onBlocked={(reason) => toast.warning(blockedMessage(reason))}
                                onClose={onClose}
                            />
                        ))}
                    </div>
                )}
            </div>

            <div style={{ padding: '0.5rem', borderTop: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
                {onLoadMore && <button type="button" disabled={loading} onClick={onLoadMore} style={{ minHeight: 44, cursor: 'pointer' }}>{title === 'Notification history' ? 'Load 20 more' : 'Load 10 more'}</button>}
                {onSeeAll && <button type="button" disabled={loading} onClick={onSeeAll} style={{ minHeight: 44, cursor: 'pointer' }}>View notification history</button>}
                {onBack && <button type="button" onClick={onBack} style={{ minHeight: 44, cursor: 'pointer' }}>Back to latest notifications</button>}
                {onClose && <button type="button" onClick={onClose} style={{ minHeight: 44, cursor: 'pointer' }}>Close notifications</button>}
            </div>
        </div>
    );
}

export default NotificationPanel;
