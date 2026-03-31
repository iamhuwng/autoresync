/**
 * AccessDeniedPage.tsx
 * 
 * Displays a user-friendly error page when access to a route is denied.
 * Part of RBAC Security Hardening (PRD-0016).
 * 
 * @security This page is shown when PrivateRoute denies access based on role
 */

import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button, Card, CardBody } from '../components/modern';
import { IconLock, IconHome, IconLogout, IconArrowLeft } from '@tabler/icons-react';
import { useAuth } from '../hooks/useAuth';

interface LocationState {
    from?: string;
    reason?: 'role' | 'ownership' | 'blocked' | 'session' | 'unknown';
}

/**
 * Get role-appropriate dashboard path
 */
const getDashboardPath = (role?: string): string => {
    switch (role) {
        case 'student':
            return '/student/dashboard';
        case 'teacher':
            return '/lobby';
        case 'super_admin':
            return '/admin/users';
        default:
            return '/';
    }
};

/**
 * Get human-readable reason for access denial
 */
const getReasonText = (reason?: string): string => {
    switch (reason) {
        case 'role':
            return 'Your account role does not have permission to view this page.';
        case 'ownership':
            return 'You can only access data that belongs to you or is assigned to you.';
        case 'blocked':
            return 'Your account has been temporarily blocked. Please contact support.';
        case 'session':
            return 'Your session has expired or is invalid. Please log in again.';
        default:
            return 'You do not have the required permissions to access this page.';
    }
};

const AccessDeniedPage: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { profile, logout } = useAuth();

    const state = location.state as LocationState | undefined;
    const attemptedPath = state?.from || 'this page';
    const reason = state?.reason || 'unknown';

    const dashboardPath = getDashboardPath(profile?.role);
    const reasonText = getReasonText(reason);

    const handleGoBack = () => {
        // Try to go back in history, or go to dashboard
        if (window.history.length > 2) {
            navigate(-1);
        } else {
            navigate(dashboardPath);
        }
    };

    const handleGoToDashboard = () => {
        navigate(dashboardPath);
    };

    const handleLogout = async () => {
        try {
            await logout();
            navigate('/');
        } catch (error) {
            console.error('Logout failed:', error);
            navigate('/');
        }
    };

    return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', background: 'linear-gradient(180deg, #fff7ed 0%, #f8fafc 100%)' }}>
            <Card
                variant="glass"
                style={{
                    maxWidth: '620px',
                    width: '100%',
                }}
            >
                <CardBody>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', alignItems: 'center', textAlign: 'center' }}>
                        <div
                            style={{
                                width: '5rem',
                                height: '5rem',
                                borderRadius: '999px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: 'linear-gradient(135deg, #fb7185 0%, #f97316 100%)',
                                color: '#ffffff',
                                boxShadow: '0 18px 40px rgba(249, 115, 22, 0.28)',
                            }}
                        >
                            <IconLock size={40} stroke={1.5} />
                        </div>

                        <div>
                            <h1
                                style={{
                                    margin: 0,
                                    fontSize: '2rem',
                                    fontWeight: 800,
                                    background: 'linear-gradient(135deg, #ef4444 0%, #f97316 100%)',
                                    WebkitBackgroundClip: 'text',
                                    WebkitTextFillColor: 'transparent',
                                }}
                            >
                                Access Denied
                            </h1>
                            <p style={{ margin: '0.75rem auto 0', maxWidth: '430px', color: '#64748b', lineHeight: 1.65 }}>
                                {reasonText}
                            </p>
                        </div>

                        <div
                            style={{
                                width: '100%',
                                borderRadius: '1rem',
                                padding: '1rem 1.1rem',
                                background: 'rgba(15, 23, 42, 0.03)',
                                border: '1px solid rgba(148, 163, 184, 0.22)',
                                textAlign: 'left',
                            }}
                        >
                            <div style={{ color: '#0f172a', fontSize: '0.92rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                                This could be because:
                            </div>
                            <ul style={{ margin: 0, paddingLeft: '1.1rem', color: '#64748b', lineHeight: 1.75 }}>
                                <li>You're trying to access an admin-only or teacher-only page</li>
                                <li>You're trying to view data that belongs to someone else</li>
                                <li>Your session has expired and needs to be refreshed</li>
                                <li>Your account permissions have been recently changed</li>
                            </ul>
                        </div>

                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                            <Button variant="outline" leftSection={<IconArrowLeft size={18} />} onClick={handleGoBack}>
                                Go Back
                            </Button>
                            <Button variant="primary" leftSection={<IconHome size={18} />} onClick={handleGoToDashboard}>
                                Go to Dashboard
                            </Button>
                            <Button variant="glass" leftSection={<IconLogout size={18} />} onClick={handleLogout}>
                                Log Out
                            </Button>
                        </div>

                        {process.env.NODE_ENV === 'development' && (
                            <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.75rem', lineHeight: 1.5 }}>
                                <strong>Debug:</strong> Attempted: {attemptedPath}, Reason: {reason}, Role: {profile?.role || 'none'}
                            </p>
                        )}
                    </div>
                </CardBody>
            </Card>
        </div>
    );
};

export default AccessDeniedPage;
