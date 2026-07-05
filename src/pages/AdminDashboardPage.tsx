/**
 * AdminDashboardPage
 * 
 * Super admin landing page with overview statistics and quick access links.
 * Replaces /lobby for super_admin users.
 * 
 * Route: /admin/dashboard
 * Allowed Roles: super_admin only
 */
import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigation } from '../hooks/useNavigation';
import { AdminLayout } from '../components/navigation';
import { Card } from '../components/modern';
import {
    IconUsers,
    IconBook,
    IconSchool,
    IconPlayerPlay,
    IconFileText,
    IconChartBar,
    IconArrowRight
} from '@tabler/icons-react';

// Services for stats
import { getAllUsers } from '../services/userService';
import { getAllCourses } from '../services/courseManager';
import { getClasses } from '../services/classManager';
// @ts-ignore - JS module without type declarations
import firebaseQueryOptimizer from '../services/firebaseQueryOptimizer';

interface DashboardStats {
    totalUsers: number;
    totalCourses: number;
    totalClasses: number;
    totalMaterials: number;
    loading: boolean;
}

interface QuickLink {
    id: string;
    title: string;
    description: string;
    icon: React.ReactNode;
    route: string;
    color: string;
    bgColor: string;
}

const AdminDashboardPage: React.FC = () => {
    const { user, profile, logout } = useAuth();
    const { navigateTo } = useNavigation('admin');
    const [stats, setStats] = useState<DashboardStats>({
        totalUsers: 0,
        totalCourses: 0,
        totalClasses: 0,
        totalMaterials: 0,
        loading: true
    });

    const isSuperAdmin = profile?.role === 'super_admin';

    // Load dashboard statistics
    useEffect(() => {
        const loadStats = async () => {
            try {
                const [users, courses, classes, tests] = await Promise.all([
                    getAllUsers().catch(() => []),
                    getAllCourses().catch(() => []),
                    getClasses().catch(() => []),
                    firebaseQueryOptimizer.getAllTests().catch(() => [])
                ]);

                setStats({
                    totalUsers: users.length,
                    totalCourses: courses.length,
                    totalClasses: classes.length,
                    totalMaterials: tests.length,
                    loading: false
                });
            } catch (error) {
                console.error('[AdminDashboard] Error loading stats:', error);
                setStats(prev => ({ ...prev, loading: false }));
            }
        };

        if (user?.uid) {
            loadStats();
        }
    }, [user?.uid]);

    const handleLogout = async () => {
        await logout();
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
        if (route) {
            navigateTo(route as any, {}, { reason: `admin_nav_${page}` });
        }
    };

    // Quick access links
    const quickLinks: QuickLink[] = [
        {
            id: 'materials',
            title: 'Materials',
            description: 'Create and manage tests',
            icon: <IconFileText size={32} />,
            route: 'ADMIN_MATERIALS',
            color: '#6366f1',
            bgColor: 'rgba(99, 102, 241, 0.1)'
        },
        {
            id: 'users',
            title: 'User Management',
            description: 'Manage teachers and students',
            icon: <IconUsers size={32} />,
            route: 'ADMIN_USERS',
            color: '#10b981',
            bgColor: 'rgba(16, 185, 129, 0.1)'
        },
        {
            id: 'courses',
            title: 'Courses',
            description: 'Manage all courses in the system',
            icon: <IconBook size={32} />,
            route: 'ADMIN_COURSES',
            color: '#f59e0b',
            bgColor: 'rgba(245, 158, 11, 0.1)'
        },
        {
            id: 'classes',
            title: 'Classes',
            description: 'View and manage all classes',
            icon: <IconSchool size={32} />,
            route: 'ADMIN_CLASSES',
            color: '#ec4899',
            bgColor: 'rgba(236, 72, 153, 0.1)'
        },
        {
            id: 'sessions',
            title: 'Live Sessions',
            description: 'Monitor active learning sessions',
            icon: <IconPlayerPlay size={32} />,
            route: 'SESSIONS',
            color: '#8b5cf6',
            bgColor: 'rgba(139, 92, 246, 0.1)'
        },
        {
            id: 'reports',
            title: 'Production Reports',
            description: 'Monitor errors, feature usage, and system health',
            icon: <IconChartBar size={32} />,
            route: 'ADMIN_REPORTS',
            color: '#ef4444',
            bgColor: 'rgba(239, 68, 68, 0.1)'
        }
    ];

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
            pageTitle="Dashboard"
            currentPage="dashboard"
            onNavigate={handleSidebarNavigate}
            onLogout={handleLogout}
            userRole={profile?.role}
        >
            <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
                {/* Welcome Header */}
                <div style={{ marginBottom: '2rem' }}>
                    <h1 style={{
                        fontSize: '2rem',
                        fontWeight: '700',
                        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        marginBottom: '0.5rem'
                    }}>
                        Welcome back, {profile?.displayName || 'Admin'} 👋
                    </h1>
                    <p style={{ color: '#64748b', fontSize: '1rem' }}>
                        Here's an overview of your learning platform
                    </p>
                </div>

                {/* Statistics Cards */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '1rem',
                    marginBottom: '2rem'
                }}>
                    {[
                        { label: 'Total Users', value: stats.totalUsers, icon: <IconUsers size={24} />, color: '#6366f1' },
                        { label: 'Courses', value: stats.totalCourses, icon: <IconBook size={24} />, color: '#10b981' },
                        { label: 'Classes', value: stats.totalClasses, icon: <IconSchool size={24} />, color: '#f59e0b' },
                        { label: 'Materials', value: stats.totalMaterials, icon: <IconFileText size={24} />, color: '#ec4899' }
                    ].map((stat) => (
                        <Card key={stat.label} variant="glass" style={{ padding: '1.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <div style={{
                                    width: '48px',
                                    height: '48px',
                                    borderRadius: '12px',
                                    background: `${stat.color}15`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: stat.color
                                }}>
                                    {stat.icon}
                                </div>
                                <div>
                                    <div style={{
                                        fontSize: '1.75rem',
                                        fontWeight: '700',
                                        color: '#1e293b'
                                    }}>
                                        {stats.loading ? '...' : stat.value}
                                    </div>
                                    <div style={{ fontSize: '0.875rem', color: '#64748b' }}>
                                        {stat.label}
                                    </div>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>

                {/* Quick Access Section */}
                <div style={{ marginBottom: '2rem' }}>
                    <h2 style={{
                        fontSize: '1.25rem',
                        fontWeight: '600',
                        color: '#1e293b',
                        marginBottom: '1rem'
                    }}>
                        Quick Access
                    </h2>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                        gap: '1rem'
                    }}>
                        {quickLinks.map((link) => (
                            <div
                                key={link.id}
                                style={{
                                    padding: '1.5rem',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    border: '1px solid transparent',
                                    background: 'rgba(255, 255, 255, 0.8)',
                                    backdropFilter: 'blur(12px)',
                                    borderRadius: '16px',
                                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
                                }}
                                onClick={() => navigateTo(link.route as any, {}, { reason: `dashboard_quick_${link.id}` })}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                    e.currentTarget.style.borderColor = link.color;
                                    e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.1)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.borderColor = 'transparent';
                                    e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.05)';
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                                    <div style={{
                                        width: '56px',
                                        height: '56px',
                                        borderRadius: '12px',
                                        background: link.bgColor,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: link.color,
                                        flexShrink: 0
                                    }}>
                                        {link.icon}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{
                                            fontSize: '1.1rem',
                                            fontWeight: '600',
                                            color: '#1e293b',
                                            marginBottom: '0.25rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.5rem'
                                        }}>
                                            {link.title}
                                            <IconArrowRight size={16} style={{ color: '#94a3b8' }} />
                                        </div>
                                        <div style={{ fontSize: '0.875rem', color: '#64748b' }}>
                                            {link.description}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Recent Activity Placeholder */}
                <Card variant="glass" style={{ padding: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                        <IconChartBar size={24} style={{ color: '#6366f1' }} />
                        <h2 style={{
                            fontSize: '1.125rem',
                            fontWeight: '600',
                            color: '#1e293b',
                            margin: 0
                        }}>
                            Recent Activity
                        </h2>
                    </div>
                    <p style={{ color: '#64748b', fontSize: '0.9rem' }}>
                        Activity tracking and analytics coming soon. Check back for insights on user engagement,
                        session completions, and learning progress across your platform.
                    </p>
                </Card>
            </div>
        </AdminLayout>
    );
};

export default AdminDashboardPage;
