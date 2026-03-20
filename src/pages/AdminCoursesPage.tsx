/**
 * AdminCoursesPage
 *
 * Super admin page for managing all courses in the system.
 * Uses AdminCourseManagement component with AdminLayout wrapper.
 *
 * Route: /admin/courses
 * Allowed Roles: super_admin only
 */
import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigation } from '../hooks/useNavigation';
import { AdminLayout } from '../components/navigation';
import { AdminCourseManagement } from '../components/admin/AdminCourseManagement';

const AdminCoursesPage: React.FC = () => {
    const { user, profile, logout } = useAuth();
    const { navigateTo } = useNavigation('admin');

    const isSuperAdmin = profile?.role === 'super_admin';

    const handleLogout = async () => {
        await logout();
        sessionStorage.removeItem('isAdmin');
        navigateTo('LOGIN', {}, { reason: 'admin_logout', replace: true });
    };

    const handleSidebarNavigate = (page: string) => {
        const pageRoutes: Record<string, string> = {
            dashboard: 'ADMIN_DASHBOARD',
            materials: 'ADMIN_MATERIALS',
            users: 'ADMIN_USERS',
            courses: 'ADMIN_COURSES',
            classes: 'ADMIN_CLASSES',
            sessions: 'ADMIN_SESSIONS',
            settings: 'ADMIN_SETTINGS',
            backup: 'ADMIN_BACKUP',
            reports: 'ADMIN_REPORTS',
        };
        const route = pageRoutes[page];
        if (route) navigateTo(route as any, {}, { reason: `admin_nav_${page}` });
    };

    if (!isSuperAdmin) {
        return (
            <div style={{ padding: '2rem', textAlign: 'center' }}>
                <h2>Access Denied</h2>
                <p>This page is only accessible to super administrators.</p>
            </div>
        );
    }

    return (
        <AdminLayout
            pageTitle="Course Management"
            currentPage="courses"
            onNavigate={handleSidebarNavigate}
            onLogout={handleLogout}
            userRole={profile?.role}
        >
            <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
                <AdminCourseManagement currentUserId={user?.uid || ''} />
            </div>
        </AdminLayout>
    );
};

export default AdminCoursesPage;
