import React from 'react';
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
    /** User role for conditional navigation (super_admin vs teacher) */
    userRole?: 'teacher' | 'super_admin';
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
    userRole = 'teacher',
}) => {
    const location = useLocation();
    const currentPath = location.pathname;

    // Determine active page based on current route
    const isActive = (route: string): boolean => {
        return currentPath === route || currentPath.startsWith(route);
    };

    // Materials is the lobby/root page
    const isMaterialsActive = currentPath === ROUTES.LOBBY ||
        currentPath.startsWith('/teacher-lobby');

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
            }}
        >
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

            {/* User Actions: Notifications, Logout */}
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {userId && (
                    <div style={{ marginRight: '0.25rem' }}>
                        <NotificationBell userId={userId} />
                    </div>
                )}

                <Button variant="glass" onClick={onLogout}>
                    Logout
                </Button>
            </div>
        </div>
    );
};

export default TeacherNavigation;
