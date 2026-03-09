import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { S } from './studentLayoutStyles';
import {
    IconHome,
    IconClasses,
    IconHomework,
    IconCourses,
    IconLibrary,
    IconRecord,
    IconProfile,
} from './StudentIcons';

export type StudentActivePage = 'feed' | 'classes' | 'homework' | 'courses' | 'library' | 'records' | 'profile';

export interface StudentSidebarProps {
    activePage: StudentActivePage;
    onViewSwitch?: (view: string) => void;
    onJoinClass?: () => void;
    pendingHomeworkCount?: number;
    /** @deprecated — sidebar now reads user/profile from useAuth() internally. This prop is ignored. */
    user?: unknown;
}

// ─── Profile Menu Styles ────────────────────────────────────────────────────
const menuStyles = {
    overlay: {
        position: 'fixed' as const,
        inset: 0,
        zIndex: 998,
    },
    container: {
        position: 'absolute' as const,
        bottom: 'calc(100% + 8px)',
        left: 0,
        right: 0,
        background: 'white',
        borderRadius: 12,
        border: '1px solid #e5e7eb',
        boxShadow: '0 4px 24px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.06)',
        padding: '6px',
        zIndex: 999,
        animation: 'fadeSlideUp 0.15s ease-out',
    },
    item: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        padding: '10px 12px',
        borderRadius: 8,
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        fontSize: '0.875rem',
        fontWeight: 500,
        color: '#374151',
        transition: 'background 0.12s ease',
        textAlign: 'left' as const,
    },
    itemDanger: {
        color: '#dc2626',
    },
    divider: {
        height: 1,
        background: '#f3f4f6',
        margin: '4px 0',
    },
    iconWrap: {
        width: 20,
        height: 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    chevron: {
        marginLeft: 'auto',
        width: 16,
        height: 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#9ca3af',
        transition: 'transform 0.2s ease',
    },
};

// ─── SVG Icons for the menu ─────────────────────────────────────────────────
const SettingsIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
);

const SignOutIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
);

const ChevronUpIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="18 15 12 9 6 15" />
    </svg>
);

export const StudentSidebar: React.FC<StudentSidebarProps> = ({
    activePage,
    onViewSwitch,
    onJoinClass,
    pendingHomeworkCount,
}) => {
    const navigate = useNavigate();
    const { user, profile, logout } = useAuth();
    const displayName = profile?.displayName || user?.displayName || 'Student';
    const email = profile?.email || user?.email || '';
    const avatarSrc = profile?.avatarUrl || user?.photoURL || null;
    const [hoveredNav, setHoveredNav] = useState<string | null>(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const [hoveredMenuItem, setHoveredMenuItem] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // Close menu on outside click
    const handleClickOutside = useCallback((e: MouseEvent) => {
        if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
            setMenuOpen(false);
        }
    }, []);

    useEffect(() => {
        if (menuOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [menuOpen, handleClickOutside]);

    // Close menu on Escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setMenuOpen(false);
        };
        if (menuOpen) {
            document.addEventListener('keydown', handleEscape);
        }
        return () => document.removeEventListener('keydown', handleEscape);
    }, [menuOpen]);

    const group1 = [
        { id: 'feed', route: '/student/dashboard?view=feed', label: 'Feed', icon: <IconHome /> },
        { id: 'classes', route: '/student/dashboard?view=classes', label: 'Classes', icon: <IconClasses /> },
    ];

    const group2 = [
        { id: 'homework', route: '/student/homework', label: 'Homework', icon: <IconHomework />, badge: (pendingHomeworkCount ?? 0) > 0 ? pendingHomeworkCount : null },
        { id: 'courses', route: '/student/courses', label: 'Courses', icon: <IconCourses /> },
        { id: 'library', route: '/student/library', label: 'Library', icon: <IconLibrary /> },
        { id: 'records', route: '/student/academic-record', label: 'Records', icon: <IconRecord /> },
        { id: 'profile', route: '/profile', label: 'Profile', icon: <IconProfile /> },
    ];

    const handleNavClick = (item: { id: string; route: string }) => {
        // 1. If it's a dashboard view switcher and the dashboard passed the onViewSwitch handler
        if (['feed', 'classes'].includes(item.id) && onViewSwitch) {
            onViewSwitch(item.id);
            return;
        }

        // 2. Allow Records to reset its view even when already active
        if (item.id === activePage) {
            if (item.id === 'records') {
                navigate(item.route, {
                    state: {
                        resetRecordsView: true,
                    },
                });
            }
            return;
        }

        // 3. Standard navigation
        navigate(item.route);
    };

    const handleJoinClassClick = () => {
        if (onJoinClass) {
            onJoinClass();
        } else {
            navigate('/student/dashboard'); // Fallback to go to dashboard which has the join modal
        }
    };

    const handleSettingsClick = () => {
        setMenuOpen(false);
        navigate('/profile');
    };

    const handleSignOut = async () => {
        setMenuOpen(false);
        try {
            await logout();
            navigate('/login');
        } catch (err) {
            console.error('Sign out failed:', err);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Keyframe animation for menu */}
            <style>{`
                @keyframes fadeSlideUp {
                    from { opacity: 0; transform: translateY(6px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>

            {/* Logo */}
            <div style={S.sidebarLogo}>StudentDash</div>

            {/* Group 1: View switchers */}
            <nav style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                {group1.map(item => {
                    const isActive = activePage === item.id;
                    return (
                        <button
                            key={item.id}
                            aria-current={isActive ? 'page' : undefined}
                            onClick={() => handleNavClick(item)}
                            onMouseEnter={() => setHoveredNav(item.id)}
                            onMouseLeave={() => setHoveredNav(null)}
                            style={{
                                ...S.navItem,
                                ...(isActive ? S.navItemActive : {}),
                                background: hoveredNav === item.id && !isActive ? '#e5e7eb' : 'transparent',
                                outline: 'none',
                            }}
                        >
                            {item.icon}
                            {item.label}
                        </button>
                    );
                })}

                {/* Navigation links */}

                {/* Group 2: Navigation links */}
                {group2.map(item => {
                    const isActive = activePage === item.id;
                    return (
                        <button
                            key={item.id}
                            aria-current={isActive ? 'page' : undefined}
                            onClick={() => handleNavClick(item)}
                            onMouseEnter={() => setHoveredNav(item.id)}
                            onMouseLeave={() => setHoveredNav(null)}
                            style={{
                                ...S.navItem,
                                ...(isActive ? S.navItemActive : {}),
                                background: hoveredNav === item.id && !isActive ? '#e5e7eb' : 'transparent',
                                outline: 'none',
                            }}
                        >
                            {item.icon}
                            {item.label}
                            {item.badge && <span style={S.navBadge}>{item.badge}</span>}
                        </button>
                    );
                })}

            </nav>

            {/* Bottom section */}
            <div style={{ marginTop: 'auto', padding: '0 8px' }}>
                <button
                    style={S.joinBtn}
                    onClick={handleJoinClassClick}
                    onMouseEnter={e => e.currentTarget.style.background = '#4338ca'}
                    onMouseLeave={e => e.currentTarget.style.background = '#4f46e5'}
                >
                    Join Class
                </button>

                {/* Profile row with popover menu */}
                <div ref={menuRef} style={{ position: 'relative' }}>
                    {/* Popover Menu */}
                    {menuOpen && (
                        <div style={menuStyles.container} role="menu" aria-label="User menu">
                            <button
                                role="menuitem"
                                style={{
                                    ...menuStyles.item,
                                    background: hoveredMenuItem === 'settings' ? '#f3f4f6' : 'transparent',
                                }}
                                onClick={handleSettingsClick}
                                onMouseEnter={() => setHoveredMenuItem('settings')}
                                onMouseLeave={() => setHoveredMenuItem(null)}
                            >
                                <span style={menuStyles.iconWrap}><SettingsIcon /></span>
                                Settings
                            </button>
                            <div style={menuStyles.divider} />
                            <button
                                role="menuitem"
                                style={{
                                    ...menuStyles.item,
                                    ...menuStyles.itemDanger,
                                    background: hoveredMenuItem === 'signout' ? '#fef2f2' : 'transparent',
                                }}
                                onClick={handleSignOut}
                                onMouseEnter={() => setHoveredMenuItem('signout')}
                                onMouseLeave={() => setHoveredMenuItem(null)}
                            >
                                <span style={menuStyles.iconWrap}><SignOutIcon /></span>
                                Sign Out
                            </button>
                        </div>
                    )}

                    {/* Clickable profile row */}
                    <div
                        style={{
                            ...S.profileRow,
                            background: menuOpen ? '#e5e7eb' : 'transparent',
                        }}
                        onClick={() => setMenuOpen(!menuOpen)}
                        onMouseEnter={e => { if (!menuOpen) e.currentTarget.style.background = '#e5e7eb'; }}
                        onMouseLeave={e => { if (!menuOpen) e.currentTarget.style.background = 'transparent'; }}
                        role="button"
                        tabIndex={0}
                        aria-haspopup="menu"
                        aria-expanded={menuOpen}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setMenuOpen(!menuOpen); } }}
                    >
                        <div style={S.profileAvatar}>
                            {avatarSrc ? (
                                <img src={avatarSrc} alt={displayName} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                            ) : (
                                displayName[0]?.toUpperCase() || '?'
                            )}
                        </div>
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                            <p style={{ fontWeight: 700, fontSize: '0.875rem', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {displayName}
                            </p>
                            <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {email}
                            </p>
                        </div>
                        <div style={{
                            ...menuStyles.chevron,
                            transform: menuOpen ? 'rotate(0deg)' : 'rotate(180deg)',
                        }}>
                            <ChevronUpIcon />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
