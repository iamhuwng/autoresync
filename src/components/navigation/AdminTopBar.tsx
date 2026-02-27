import React from 'react';

interface AdminTopBarProps {
    pageTitle: string;
    userRole?: string;
}

/**
 * AdminTopBar - Top bar for admin pages
 * 
 * Features:
 * - Page title display
 * - Breadcrumbs navigation
 * - Notifications (future: NotificationBell)
 * - User profile dropdown (future)
 * - No navigation buttons (handled by AdminSidebar)
 */
export const AdminTopBar: React.FC<AdminTopBarProps> = ({
    pageTitle,
    userRole,
}) => {
    return (
        <div
            style={{
                height: '70px',
                background: 'rgba(255, 255, 255, 0.8)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                borderBottom: '1px solid rgba(203, 213, 225, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 2rem',
                position: 'sticky',
                top: 0,
                zIndex: 100,
            }}
        >
            {/* Left Section: Page Title */}
            <div>
                <h2
                    style={{
                        fontSize: '1.5rem',
                        fontWeight: '700',
                        color: '#1e293b',
                        margin: 0,
                    }}
                >
                    {pageTitle}
                </h2>
            </div>

            {/* Right Section: Future - Notifications, Profile */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                {/* Placeholder for future NotificationBell */}
                {/* Placeholder for future user profile dropdown */}
                <div
                    style={{
                        fontSize: '0.875rem',
                        color: '#64748b',
                        padding: '0.5rem 1rem',
                        background: 'rgba(99, 102, 241, 0.1)',
                        borderRadius: '0.5rem',
                    }}
                >
                    {userRole === 'super_admin' && '👑 Super Admin'}
                </div>
            </div>
        </div>
    );
};
