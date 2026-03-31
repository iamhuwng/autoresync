import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { S, studentTokens } from './studentLayoutStyles';
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
    user?: unknown;
}

const menuStyles = {
    container: {
        position: 'absolute' as const,
        bottom: 'calc(100% + 8px)',
        left: 0,
        right: 0,
        background: studentTokens.bgSurface,
        borderRadius: studentTokens.radiusPanel,
        border: `1px solid ${studentTokens.borderSoft}`,
        boxShadow: '0 10px 30px rgba(43, 52, 55, 0.08)',
        padding: 6,
        zIndex: 999,
        animation: 'fadeSlideUp 0.15s ease-out',
    },
    item: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        padding: '10px 12px',
        borderRadius: studentTokens.radiusSoft,
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        fontSize: '0.8125rem',
        fontWeight: 600,
        color: studentTokens.textBody,
        transition: 'background 0.12s ease',
        textAlign: 'left' as const,
        letterSpacing: '0.01em',
    },
    itemDanger: {
        color: '#9e3f4e',
    },
    divider: {
        height: 1,
        background: studentTokens.borderWhisper,
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
        color: studentTokens.textDim,
        transition: 'transform 0.2s ease',
    },
};

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
        if (['feed', 'classes'].includes(item.id) && onViewSwitch) {
            onViewSwitch(item.id);
            return;
        }

        if (item.id === activePage) {
            if (item.id === 'records') {
                navigate(item.route, { state: { resetRecordsView: true } });
            }
            return;
        }

        navigate(item.route);
    };

    const handleJoinClassClick = () => {
        if (onJoinClass) {
            onJoinClass();
        } else {
            navigate('/student/dashboard');
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

    const renderNavButton = (item: { id: string; route: string; label: string; icon: React.ReactNode; badge?: number | null }) => {
        const isActive = activePage === item.id;
        const isHovered = hoveredNav === item.id && !isActive;

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
                    background: isHovered ? studentTokens.bgSurfaceStrong : isActive ? studentTokens.bgSurface : 'transparent',
                    outline: 'none',
                }}
            >
                {item.icon}
                {item.label}
                {item.badge ? <span style={S.navBadge}>{item.badge}</span> : null}
            </button>
        );
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: studentTokens.bgShell }}>
            <style>{`
                @keyframes fadeSlideUp {
                    from { opacity: 0; transform: translateY(6px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>

            <div>
                <div style={S.sidebarLogo}>The Scholar</div>
                <p style={{ margin: '-18px 0 20px', padding: '0 10px', color: studentTokens.textMuted, fontSize: '0.625rem', letterSpacing: '0.16em', textTransform: 'uppercase', opacity: 0.7 }}>
                    Academic Workspace
                </p>
            </div>

            <nav style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                {group1.map(renderNavButton)}
                <div style={{ height: 10 }} />
                {group2.map(renderNavButton)}
            </nav>

            <div style={{ marginTop: 'auto', padding: '0 8px' }}>
                <button
                    style={S.joinBtn}
                    onClick={handleJoinClassClick}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = studentTokens.bgSurfaceStrong;
                        e.currentTarget.style.borderColor = studentTokens.outlineSoft;
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = studentTokens.bgSurface;
                        e.currentTarget.style.borderColor = studentTokens.borderSoft;
                    }}
                >
                    Join Class
                </button>

                <div ref={menuRef} style={{ position: 'relative', marginTop: 18, paddingTop: 14, borderTop: `1px solid ${studentTokens.borderWhisper}` }}>
                    {menuOpen ? (
                        <div style={menuStyles.container} role="menu" aria-label="User menu">
                            <button
                                role="menuitem"
                                style={{
                                    ...menuStyles.item,
                                    background: hoveredMenuItem === 'settings' ? studentTokens.bgSurfaceAlt : 'transparent',
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
                                    background: hoveredMenuItem === 'signout' ? '#fff2f2' : 'transparent',
                                }}
                                onClick={handleSignOut}
                                onMouseEnter={() => setHoveredMenuItem('signout')}
                                onMouseLeave={() => setHoveredMenuItem(null)}
                            >
                                <span style={menuStyles.iconWrap}><SignOutIcon /></span>
                                Sign Out
                            </button>
                        </div>
                    ) : null}

                    <div
                        style={{
                            ...S.profileRow,
                            background: menuOpen ? studentTokens.bgSurfaceStrong : 'transparent',
                        }}
                        onClick={() => setMenuOpen(!menuOpen)}
                        onMouseEnter={(e) => { if (!menuOpen) e.currentTarget.style.background = studentTokens.bgSurfaceStrong; }}
                        onMouseLeave={(e) => { if (!menuOpen) e.currentTarget.style.background = 'transparent'; }}
                        role="button"
                        tabIndex={0}
                        aria-haspopup="menu"
                        aria-expanded={menuOpen}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setMenuOpen(!menuOpen);
                            }
                        }}
                    >
                        <div style={S.profileAvatar}>
                            {avatarSrc ? (
                                <img src={avatarSrc} alt={displayName} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                            ) : (
                                displayName[0]?.toUpperCase() || '?'
                            )}
                        </div>
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                            <p style={{ fontWeight: 700, fontSize: '0.8125rem', margin: 0, color: studentTokens.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {displayName}
                            </p>
                            <p style={{ color: studentTokens.textMuted, fontSize: '0.75rem', margin: '2px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {email}
                            </p>
                        </div>
                        <div style={{ ...menuStyles.chevron, transform: menuOpen ? 'rotate(0deg)' : 'rotate(180deg)' }}>
                            <ChevronUpIcon />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
