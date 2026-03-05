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
            case 'success': return '#22c55e'; // green
            case 'warning': return '#eab308'; // yellow
            case 'error': return '#ef4444'; // red
            case 'feedback': return '#3b82f6'; // blue
            case 'info': default: return '#3b82f6'; // blue
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
        <div
            style={{
                padding: '0.75rem',
                backgroundColor: notification.read ? 'transparent' : 'rgba(59,130,246,0.1)',
                borderBottom: '1px solid #f1f5f9',
                cursor: notification.link ? 'pointer' : 'default',
                transition: 'background-color 0.2s',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.75rem'
            }}
            onClick={handleClick}
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

export function NotificationPanel({ notifications, onMarkAsRead, onMarkAllRead, onClose, onOpenSettings }: NotificationPanelProps) {
    const unreadCount = notifications.filter(n => !n.read).length;
    const displayList = notifications;
    const navigate = useNavigate();

    return (
        <div style={{ display: 'flex', flexDirection: 'column', width: 320, maxHeight: 500 }}>
            {/* Header */}
            <div style={{ padding: '0.75rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#0f172a' }}>Notifications</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {unreadCount > 0 && (
                        <button
                            onClick={onMarkAllRead}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '0.25rem',
                                border: 'none', background: 'transparent',
                                color: '#3b82f6', fontSize: '0.75rem', fontWeight: 500,
                                cursor: 'pointer', padding: '0.25rem 0.5rem', borderRadius: '0.25rem'
                            }}
                        >
                            <IconChecklist size={14} /> Mark all read
                        </button>
                    )}
                    {onOpenSettings && (
                        <button
                            onClick={onOpenSettings}
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                border: 'none', background: 'transparent', color: '#64748b',
                                cursor: 'pointer', padding: '0.25rem', borderRadius: '0.25rem'
                            }}
                        >
                            <IconSettings size={16} />
                        </button>
                    )}
                </div>
            </div>

            {/* List */}
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                {displayList.length === 0 ? (
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
                                onClose={onClose}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div style={{ padding: '0.5rem', borderTop: '1px solid #e2e8f0' }}>
                <button
                    onClick={() => {
                        console.log('📢 [NotificationPanel] User clicked "See All Activity" — navigating to dashboard feed.');
                        onClose?.();
                        navigate('/student/dashboard?view=feed');
                    }}
                    style={{
                        width: '100%', padding: '0.5rem', border: 'none', background: 'transparent',
                        color: '#64748b', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                        borderRadius: '0.25rem'
                    }}
                >
                    See All Activity →
                </button>
            </div>
        </div>
    );
}

export default NotificationPanel;
