/**
 * Result Detail Page
 * PRD-0015 Section 4.9.3: "Click card → Navigate to result detail page"
 * PRD-0039 Task 4.9: Role-based routing
 *
 * Wrapper route for /result/:resultId
 *
 * PRD-0039 Routing:
 * - Students: redirect to /student/academic-record?result={resultId}
 * - Teachers and super_admin: render LegacyResultDetailView (full-page)
 *
 * LegacyResultDetailView handles all data-fetching, ownership validation,
 * loading, error states, and rendering internally.
 */

import React from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { TeacherHeader } from '../components/navigation';
import { LegacyResultDetailView } from '../components/results/LegacyResultDetailView';

export const ResultDetailPage: React.FC = () => {
    const { resultId } = useParams<{ resultId: string }>();
    const navigate = useNavigate();
    const { user, profile, loading: authLoading, logout } = useAuth();

    const handleLogout = React.useCallback(async () => {
        try {
            await logout();
            sessionStorage.removeItem('isAdmin');
            navigate('/', { replace: true });
        } catch (error) {
            console.error('[ResultDetailPage] Logout failed:', error);
        }
    }, [logout, navigate]);

    /**
     * Wait for auth to resolve before deciding route behavior
     */
    if (authLoading) {
        return (
            <div style={centeredContainerStyle}>
                <div style={spinnerStyle} />
                <style>{`@keyframes resultDetailSpin { to { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    /**
     * Guard: resultId is required
     */
    if (!resultId) {
        return (
            <div style={{ ...centeredContainerStyle, flexDirection: 'column', gap: '1rem' }}>
                <div style={{ fontSize: '3rem' }}>⚠️</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1e293b' }}>
                    No result ID provided
                </div>
                <button
                    type="button"
                    onClick={() => navigate('/student')}
                    style={primaryNavButtonStyle}
                >
                    Return to Dashboard
                </button>
            </div>
        );
    }

    /**
     * PRD-0039 Task 4.9: Role-based routing
     * Students are redirected to the academic record page with ?result= query param
     * so the slide panel opens there instead of a standalone page.
     */
    if (profile?.role === 'student') {
        return (
            <Navigate
                to={`/student/academic-record?result=${resultId}`}
                replace
            />
        );
    }

    /**
     * Teachers / Admins: Full-page view using self-contained LegacyResultDetailView
     * It handles data-fetching, ownership, loading, error, and rendering internally.
     */
    return (
        <div
            data-testid="result-detail-teacher-shell"
            style={teacherShellStyle}
        >
            <TeacherHeader
                pageTitle="Result Detail"
                userId={user?.uid}
                userRole={profile?.role === 'super_admin' ? 'super_admin' : 'teacher'}
                userDisplayName={profile?.displayName || user?.displayName || user?.email}
                userEmail={profile?.email || user?.email}
                userAvatarUrl={profile?.avatarUrl || profile?.photoURL || user?.photoURL}
                onLogout={handleLogout}
            />
            <div style={teacherShellContentStyle}>
                <div style={teacherShellPanelStyle}>
                    <LegacyResultDetailView
                        resultId={resultId}
                        onReturn={() => navigate(-1)}
                    />
                </div>
            </div>
        </div>
    );
};

// ─── Native styles (replacing Mantine Center/Loader per Rule 15) ─────────────

const centeredContainerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
};

const spinnerStyle: React.CSSProperties = {
    width: 48,
    height: 48,
    border: '4px solid #e2e8f0',
    borderTopColor: '#8b5cf6',
    borderRadius: '50%',
    animation: 'resultDetailSpin 0.8s linear infinite',
};

const primaryNavButtonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.75rem 1.5rem',
    fontSize: '0.9375rem',
    fontWeight: 600,
    color: '#ffffff',
    background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
    border: 'none',
    borderRadius: '0.75rem',
    cursor: 'pointer',
    boxShadow: '0 4px 14px rgba(139, 92, 246, 0.3)',
};

const teacherShellStyle: React.CSSProperties = {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #f8fafc 0%, #eff6ff 50%, #f0fdfa 100%)',
};

const teacherShellContentStyle: React.CSSProperties = {
    minHeight: 'calc(100vh - 110px)',
    padding: '2rem 1rem 3rem',
};

const teacherShellPanelStyle: React.CSSProperties = {
    maxWidth: '1200px',
    margin: '0 auto',
};

export default ResultDetailPage;
