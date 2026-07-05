// @ts-nocheck
import React from 'react';
import { useLocation } from 'react-router-dom';
import { Button } from '../modern';
import { NotificationBell } from '../notifications/NotificationBell';
import { ROUTES } from '../../constants/routes';

export interface StudentNavigationProps {
    /** Current user ID for notification bell */
    userId?: string;
    /** Callback when navigation button is clicked */
    onNavigate: (route: string, reason: string) => void;
    /** Callback when logout is clicked */
    onLogout: () => void;
}

/**
 * StudentNavigation Component
 * 
 * Navigation button group for student pages with visual dividers between logical groups:
 * - Primary: Dashboard
 * - Learning: Library, Homework
 * - Records: Profile, Results History
 * - User Actions: Notifications, Logout
 * 
 * Uses text-only buttons (no icons) as per PRD requirements.
 * Active page uses variant="primary", inactive uses variant="glass".
 */
export const StudentNavigation: React.FC<StudentNavigationProps> = ({
    userId,
    onNavigate,
    onLogout,
}) => {
    const location = useLocation();
    const currentPath = location.pathname;

    // Determine active page based on current route
    const isActive = (route: string): boolean => {
        return currentPath === route || currentPath.startsWith(route);
    };

    // Dashboard is the root page
    const isDashboardActive = currentPath === ROUTES.STUDENT_DASHBOARD ||
        currentPath === '/student/dashboard';

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
            }}
        >
            {/* Primary Group: Dashboard */}
            <Button
                variant={isDashboardActive ? 'primary' : 'glass'}
                onClick={() => onNavigate(ROUTES.STUDENT_DASHBOARD, 'nav_to_dashboard')}
            >
                Dashboard
            </Button>

            {/* Divider */}
            <div
                style={{
                    width: '1px',
                    height: '24px',
                    background: 'rgba(203, 213, 225, 0.5)',
                }}
            />

            {/* Learning Group: Library, Homework, Courses */}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
                <Button
                    variant={isActive(ROUTES.STUDENT_LIBRARY) ? 'primary' : 'glass'}
                    onClick={() => onNavigate(ROUTES.STUDENT_LIBRARY, 'nav_to_library')}
                >
                    Library
                </Button>

                <Button
                    variant={isActive(ROUTES.STUDENT_HOMEWORK) ? 'primary' : 'glass'}
                    onClick={() => onNavigate(ROUTES.STUDENT_HOMEWORK, 'nav_to_homework')}
                >
                    Homework
                </Button>

                <Button
                    variant={isActive(ROUTES.STUDENT_COURSES) ? 'primary' : 'glass'}
                    onClick={() => onNavigate(ROUTES.STUDENT_COURSES, 'nav_to_courses')}
                >
                    Courses
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

            {/* Records Group: Results History */}
            <Button
                variant={isActive(ROUTES.STUDENT_RESULTS_HISTORY) ? 'primary' : 'glass'}
                onClick={() => onNavigate(ROUTES.STUDENT_RESULTS_HISTORY, 'nav_to_results')}
            >
                Results
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

export default StudentNavigation;
