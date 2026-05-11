import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Button } from '../modern';
import { NotificationBell } from '../notifications/NotificationBell';
import { ROUTES } from '../../constants/routes';

export interface TeacherNavigationProps {
    /** Current user ID for notification bell */
    userId?: string;
    /** Callback when navigation button is clicked */
    onNavigate: (route: string, reason: string) => void;
    /** Callback when logout is clicked */
    onLogout: () => void;
    /** Teacher display name for profile trigger */
    userDisplayName?: string;
    /** Teacher email (shown in menu) */
    userEmail?: string;
    /** Teacher avatar URL */
    userAvatarUrl?: string;
    /** User role for conditional navigation (super_admin vs teacher) */
    userRole?: 'teacher' | 'super_admin';
    /** Collapse nav tabs into a hamburger dropdown while keeping user actions visible */
    compact?: boolean;
}

/**
 * TeacherNavigation Component
 * 
 * Navigation button group with visual dividers between logical groups:
 * - Primary: Materials
 * - Management: Students, Classes, Courses
 * - Activity: Sessions
 * - User Actions: Notifications, Logout
 * 
 * Uses text-only buttons (no icons) as per PRD requirements.
 * Active page uses variant="primary", inactive uses variant="glass".
 */
export const TeacherNavigation: React.FC<TeacherNavigationProps> = ({
    userId,
    onNavigate,
    onLogout,
    userDisplayName,
    userEmail,
    userAvatarUrl,
    userRole = 'teacher',
    compact = false,
}) => {
    const location = useLocation();
    const currentPath = location.pathname;
    const [menuOpen, setMenuOpen] = useState(false);
    const [navMenuOpen, setNavMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const navMenuRef = useRef<HTMLDivElement | null>(null);

    const displayName = userDisplayName?.trim() || 'Teacher';
    const displayEmail = userEmail?.trim() || '';
    const avatarInitial = displayName.charAt(0).toUpperCase() || 'T';

    // Determine active page based on current route
    const isActive = (route: string): boolean => {
        return currentPath === route || currentPath.startsWith(route);
    };

    // Materials is the lobby/root page
    const isMaterialsActive = currentPath === ROUTES.LOBBY ||
        currentPath.startsWith('/teacher-lobby');

    const handleClickOutside = useCallback((event: MouseEvent) => {
        if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
            setMenuOpen(false);
        }
        if (navMenuRef.current && !navMenuRef.current.contains(event.target as Node)) {
            setNavMenuOpen(false);
        }
    }, []);

    useEffect(() => {
        if (!menuOpen && !navMenuOpen) return;

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setMenuOpen(false);
                setNavMenuOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [menuOpen, navMenuOpen, handleClickOutside]);

    const navItems = [
        {
            id: 'materials',
            label: 'Materials',
            route: ROUTES.LOBBY,
            reason: 'nav_to_materials',
            active: isMaterialsActive,
        },
        {
            id: 'students',
            label: 'Students',
            route: userRole === 'super_admin' ? ROUTES.ADMIN_USERS : ROUTES.TEACHER_STUDENTS,
            reason: userRole === 'super_admin' ? 'nav_to_users' : 'nav_to_students',
            active: userRole === 'super_admin' ? isActive(ROUTES.ADMIN_USERS) : isActive(ROUTES.TEACHER_STUDENTS),
        },
        {
            id: 'classes',
            label: 'Classes',
            route: ROUTES.TEACHER_CLASSES,
            reason: 'nav_to_classes',
            active: isActive(ROUTES.TEACHER_CLASSES),
        },
        {
            id: 'courses',
            label: 'Courses',
            route: ROUTES.TEACHER_COURSES,
            reason: 'nav_to_courses',
            active: isActive(ROUTES.TEACHER_COURSES),
        },
        {
            id: 'homework',
            label: 'Homework',
            route: ROUTES.TEACHER_HOMEWORK,
            reason: 'nav_to_homework',
            active: isActive(ROUTES.TEACHER_HOMEWORK),
        },
        {
            id: 'grading',
            label: 'Grading',
            route: ROUTES.TEACHER_GRADING,
            reason: 'nav_to_grading',
            active: isActive(ROUTES.TEACHER_GRADING),
        },
        {
            id: 'sessions',
            label: 'Sessions',
            route: ROUTES.SESSIONS,
            reason: 'nav_to_sessions',
            active: isActive(ROUTES.SESSIONS),
        },
    ];

    const handleNavItemClick = (route: string, reason: string) => {
        setNavMenuOpen(false);
        onNavigate(route, reason);
    };

    const handleProfileClick = () => {
        setMenuOpen(false);
        onNavigate(ROUTES.PROFILE, 'nav_to_profile');
    };

    const handleLogoutClick = () => {
        setMenuOpen(false);
        onLogout();
    };

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
            }}
        >
            {compact && (
                <>
                    <div ref={navMenuRef} style={{ position: 'relative' }}>
                        <button
                            type="button"
                            onClick={() => setNavMenuOpen(open => !open)}
                            aria-haspopup="menu"
                            aria-expanded={navMenuOpen ? 'true' : 'false'}
                            aria-label="Open teacher navigation menu"
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '44px',
                                height: '44px',
                                border: '1px solid rgba(203, 213, 225, 0.85)',
                                background: '#ffffff',
                                borderRadius: '0.75rem',
                                cursor: 'pointer',
                                color: '#1e293b',
                                boxShadow: '0 2px 8px rgba(15, 23, 42, 0.08)',
                            }}
                        >
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            </svg>
                        </button>

                        {navMenuOpen && (
                            <div
                                role="menu"
                                aria-label="Teacher navigation"
                                style={{
                                    position: 'absolute',
                                    right: 0,
                                    top: 'calc(100% + 0.5rem)',
                                    minWidth: '220px',
                                    borderRadius: '0.75rem',
                                    border: '1px solid #e2e8f0',
                                    background: '#ffffff',
                                    boxShadow: '0 12px 24px rgba(15, 23, 42, 0.12)',
                                    padding: '0.5rem',
                                    zIndex: 60,
                                }}
                            >
                                {navItems.map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        role="menuitem"
                                        onClick={() => handleNavItemClick(item.route, item.reason)}
                                        style={{
                                            width: '100%',
                                            border: 'none',
                                            background: item.active ? '#ede9fe' : 'transparent',
                                            padding: '0.75rem 0.625rem',
                                            textAlign: 'left',
                                            borderRadius: '0.5rem',
                                            cursor: 'pointer',
                                            color: item.active ? '#5b21b6' : '#1e293b',
                                            fontSize: '0.875rem',
                                            fontWeight: item.active ? 700 : 600,
                                        }}
                                    >
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div
                        style={{
                            width: '1px',
                            height: '24px',
                            background: 'rgba(203, 213, 225, 0.5)',
                        }}
                    />
                </>
            )}

            {!compact && (
                <>
                    {/* Primary Group: Materials */}
                    <Button
                        variant={isMaterialsActive ? 'primary' : 'glass'}
                        onClick={() => onNavigate(ROUTES.LOBBY, 'nav_to_materials')}
                    >
                        Materials
                    </Button>

            {/* Divider */}
            <div
                style={{
                    width: '1px',
                    height: '24px',
                    background: 'rgba(203, 213, 225, 0.5)',
                }}
            />

            {/* Management Group: Students, Classes, Courses, Homework */}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
                <Button
                    variant={isActive(ROUTES.TEACHER_STUDENTS) ? 'primary' : 'glass'}
                    onClick={() => {
                        // Security: Route based on role
                        // Super admins use /admin/users, teachers use /teacher/students
                        if (userRole === 'super_admin') {
                            onNavigate(ROUTES.ADMIN_USERS, 'nav_to_users');
                        } else {
                            onNavigate(ROUTES.TEACHER_STUDENTS, 'nav_to_students');
                        }
                    }}
                >
                    Students
                </Button>

                <Button
                    variant={isActive(ROUTES.TEACHER_CLASSES) ? 'primary' : 'glass'}
                    onClick={() => onNavigate(ROUTES.TEACHER_CLASSES, 'nav_to_classes')}
                >
                    Classes
                </Button>

                <Button
                    variant={isActive(ROUTES.TEACHER_COURSES) ? 'primary' : 'glass'}
                    onClick={() => onNavigate(ROUTES.TEACHER_COURSES, 'nav_to_courses')}
                >
                    Courses
                </Button>

                <Button
                    variant={isActive(ROUTES.TEACHER_HOMEWORK) ? 'primary' : 'glass'}
                    onClick={() => onNavigate(ROUTES.TEACHER_HOMEWORK, 'nav_to_homework')}
                >
                    Homework
                </Button>

                <Button
                    variant={isActive(ROUTES.TEACHER_GRADING) ? 'primary' : 'glass'}
                    onClick={() => onNavigate(ROUTES.TEACHER_GRADING, 'nav_to_grading')}
                >
                    Grading
                </Button>

            </div>

            {/* Divider */}
            <div
                style={{
                    width: '1px',
                    height: '24px',
                    background: 'rgba(203, 213, 225, 0.5)',
                }}
            />

            {/* Activity Group: Sessions */}
            <Button
                variant={isActive(ROUTES.SESSIONS) ? 'primary' : 'glass'}
                onClick={() => onNavigate(ROUTES.SESSIONS, 'nav_to_sessions')}
            >
                Sessions
            </Button>

                    {/* Divider */}
                    <div
                        style={{
                            width: '1px',
                            height: '24px',
                            background: 'rgba(203, 213, 225, 0.5)',
                        }}
                    />
                </>
            )}

            {/* User Actions: Notifications, Profile Menu */}
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {userId && (
                    <div style={{ marginRight: '0.25rem' }}>
                        <NotificationBell userId={userId} />
                    </div>
                )}

                <div ref={menuRef} style={{ position: 'relative' }}>
                    <button
                        type="button"
                        onClick={() => setMenuOpen(open => !open)}
                        aria-haspopup="menu"
                        aria-expanded={menuOpen ? 'true' : 'false'}
                        aria-label="Open profile menu"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            border: '1px solid rgba(203, 213, 225, 0.8)',
                            background: '#ffffff',
                            borderRadius: '999px',
                            padding: '0.3rem 0.75rem 0.3rem 0.3rem',
                            cursor: 'pointer',
                        }}
                    >
                        <div
                            style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '50%',
                                background: 'linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%)',
                                color: '#0f172a',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.875rem',
                                fontWeight: 700,
                                overflow: 'hidden',
                            }}
                        >
                            {userAvatarUrl ? (
                                <img
                                    src={userAvatarUrl}
                                    alt={displayName}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                            ) : (
                                avatarInitial
                            )}
                        </div>

                        <span
                            style={{
                                maxWidth: '140px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                color: '#1e293b',
                                fontWeight: 600,
                                fontSize: '0.875rem',
                            }}
                        >
                            {displayName}
                        </span>
                    </button>

                    {menuOpen && (
                        <div
                            role="menu"
                            aria-label="Teacher profile menu"
                            style={{
                                position: 'absolute',
                                right: 0,
                                top: 'calc(100% + 0.5rem)',
                                minWidth: '220px',
                                borderRadius: '0.75rem',
                                border: '1px solid #e2e8f0',
                                background: '#ffffff',
                                boxShadow: '0 12px 24px rgba(15, 23, 42, 0.12)',
                                padding: '0.5rem',
                                zIndex: 50,
                            }}
                        >
                            <div style={{ padding: '0.5rem 0.625rem 0.625rem' }}>
                                <p
                                    style={{
                                        margin: 0,
                                        fontSize: '0.875rem',
                                        color: '#0f172a',
                                        fontWeight: 700,
                                    }}
                                >
                                    {displayName}
                                </p>
                                {displayEmail && (
                                    <p
                                        style={{
                                            margin: '0.125rem 0 0',
                                            fontSize: '0.75rem',
                                            color: '#64748b',
                                            wordBreak: 'break-all',
                                        }}
                                    >
                                        {displayEmail}
                                    </p>
                                )}
                            </div>

                            <button
                                type="button"
                                role="menuitem"
                                onClick={handleProfileClick}
                                style={{
                                    width: '100%',
                                    border: 'none',
                                    background: 'transparent',
                                    padding: '0.625rem',
                                    textAlign: 'left',
                                    borderRadius: '0.5rem',
                                    cursor: 'pointer',
                                    color: '#1e293b',
                                    fontSize: '0.875rem',
                                    fontWeight: 500,
                                }}
                            >
                                Profile
                            </button>

                            <button
                                type="button"
                                role="menuitem"
                                onClick={handleLogoutClick}
                                style={{
                                    width: '100%',
                                    border: 'none',
                                    background: 'transparent',
                                    padding: '0.625rem',
                                    textAlign: 'left',
                                    borderRadius: '0.5rem',
                                    cursor: 'pointer',
                                    color: '#b91c1c',
                                    fontSize: '0.875rem',
                                    fontWeight: 600,
                                }}
                            >
                                Logout
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TeacherNavigation;
