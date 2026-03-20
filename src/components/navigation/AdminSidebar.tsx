import React from 'react';
import { Button } from '../modern';

interface AdminSidebarProps {
    currentPage: string;
    onNavigate: (page: string) => void;
    onLogout: () => void;
    collapsed?: boolean;
    onToggleCollapse?: () => void;
}

/**
 * AdminSidebar - Fixed left sidebar for super admin navigation
 * 
 * Features:
 * - Fixed left position (240px width, 64px collapsed)
 * - Vertical navigation links with sections
 * - Active page highlighting
 * - Collapsed icon-only mode
 * - Logo/branding at top
 */
export const AdminSidebar: React.FC<AdminSidebarProps> = ({
    currentPage,
    onNavigate,
    onLogout,
    collapsed = false,
    onToggleCollapse,
}) => {
    const sidebarWidth = collapsed ? '64px' : '240px';

    // Navigation items organized by section
    const navSections = [
        {
            title: 'Overview',
            items: [
                { id: 'dashboard', label: 'Dashboard', icon: '📊' },
            ],
        },
        {
            title: 'Content',
            items: [
                { id: 'materials', label: 'Materials', icon: '📝' },
            ],
        },
        {
            title: 'Management',
            items: [
                { id: 'users', label: 'Users', icon: '👥' },
                { id: 'courses', label: 'Courses', icon: '📚' },
                { id: 'classes', label: 'Classes', icon: '🎓' },
            ],
        },
        {
            title: 'Activity',
            items: [
                { id: 'sessions', label: 'Sessions', icon: '🎮' },
            ],
        },
        {
            title: 'System',
            items: [
                { id: 'settings', label: 'Settings', icon: '⚙️' },
                { id: 'backup', label: 'Backup & Recovery', icon: '🛡️' },
                { id: 'reports', label: 'Reports', icon: '📊' },
            ],
        },
    ];

    return (
        <div
            style={{
                position: 'fixed',
                left: 0,
                top: 0,
                height: '100vh',
                width: sidebarWidth,
                background: 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                borderRight: '1px solid rgba(203, 213, 225, 0.3)',
                display: 'flex',
                flexDirection: 'column',
                transition: 'width 0.3s ease',
                zIndex: 1000,
            }}
        >
            {/* Logo/Branding Section */}
            <div
                style={{
                    padding: collapsed ? '1rem 0.5rem' : '1.5rem 1rem',
                    borderBottom: '1px solid rgba(203, 213, 225, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: collapsed ? 'center' : 'space-between',
                    transition: 'padding 0.3s ease',
                }}
            >
                {!collapsed && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div
                            style={{
                                fontSize: '1.5rem',
                                fontWeight: '800',
                                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                            }}
                        >
                            Admin
                        </div>
                    </div>
                )}
                {onToggleCollapse && (
                    <button
                        onClick={onToggleCollapse}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '1.25rem',
                            padding: '0.25rem',
                            color: '#64748b',
                            transition: 'color 0.2s',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = '#1e293b')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
                        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    >
                        {collapsed ? '→' : '←'}
                    </button>
                )}
            </div>

            {/* Navigation Sections */}
            <div
                style={{
                    flex: 1,
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    padding: collapsed ? '0.5rem 0.25rem' : '1rem 0.5rem',
                }}
            >
                {navSections.map((section, sectionIndex) => (
                    <div key={section.title} style={{ marginBottom: '1.5rem' }}>
                        {/* Section Title */}
                        {!collapsed && (
                            <div
                                style={{
                                    fontSize: '0.75rem',
                                    fontWeight: '600',
                                    color: '#94a3b8',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                    padding: '0 0.75rem',
                                    marginBottom: '0.5rem',
                                }}
                            >
                                {section.title}
                            </div>
                        )}

                        {/* Section Divider (when collapsed, show subtle line) */}
                        {collapsed && sectionIndex > 0 && (
                            <div
                                style={{
                                    height: '1px',
                                    background: 'rgba(203, 213, 225, 0.3)',
                                    margin: '0.5rem 0.5rem 1rem',
                                }}
                            />
                        )}

                        {/* Navigation Items */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            {section.items.map((item) => {
                                const isActive = currentPage === item.id;
                                return (
                                    <button
                                        key={item.id}
                                        onClick={() => onNavigate(item.id)}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.75rem',
                                            padding: collapsed ? '0.75rem 0.5rem' : '0.75rem 1rem',
                                            background: isActive
                                                ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.1))'
                                                : 'transparent',
                                            border: 'none',
                                            borderRadius: '0.5rem',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s ease',
                                            fontSize: '0.875rem',
                                            fontWeight: isActive ? '600' : '500',
                                            color: isActive ? '#6366f1' : '#475569',
                                            width: '100%',
                                            textAlign: 'left',
                                            justifyContent: collapsed ? 'center' : 'flex-start',
                                        }}
                                        onMouseEnter={(e) => {
                                            if (!isActive) {
                                                e.currentTarget.style.background = 'rgba(241, 245, 249, 0.8)';
                                            }
                                        }}
                                        onMouseLeave={(e) => {
                                            if (!isActive) {
                                                e.currentTarget.style.background = 'transparent';
                                            }
                                        }}
                                        title={collapsed ? item.label : undefined}
                                    >
                                        <span style={{ fontSize: '1.25rem' }}>{item.icon}</span>
                                        {!collapsed && <span>{item.label}</span>}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>

            {/* Logout Section */}
            <div
                style={{
                    padding: collapsed ? '1rem 0.5rem' : '1rem',
                    borderTop: '1px solid rgba(203, 213, 225, 0.2)',
                }}
            >
                <Button
                    variant="glass"
                    onClick={onLogout}
                    style={{
                        width: '100%',
                        justifyContent: collapsed ? 'center' : 'flex-start',
                        padding: collapsed ? '0.75rem 0.5rem' : '0.75rem 1rem',
                    }}
                >
                    <span style={{ fontSize: '1.25rem' }}>🚪</span>
                    {!collapsed && <span style={{ marginLeft: '0.75rem' }}>Logout</span>}
                </Button>
            </div>
        </div>
    );
};
