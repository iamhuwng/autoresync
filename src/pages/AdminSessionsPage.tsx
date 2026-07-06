/**
 * AdminSessionsPage
 * 
 * Super admin page for managing all sessions in the system.
 * Provides the same functionality as SessionManagementPage but with AdminLayout.
 * 
 * Route: /admin/sessions
 * Allowed Roles: super_admin only
 */
import React, { useState, useEffect } from 'react';
import { useNavigation } from '../hooks/useNavigation';
import { useAuth } from '../hooks/useAuth';
import { useFeatureTracking } from '../hooks/useFeatureTracking';
import { FEATURE_IDS } from '../config/featureRegistry';
import { AdminLayout } from '../components/navigation';
import { Card, Button, Input, toast } from '../components/modern';
import { CreateSessionModal } from '../components/session/CreateSessionModal';
import {
    IconRefresh, IconPlus, IconPlayerPlay, IconClock,
    IconTrash, IconPlayerStop
} from '@tabler/icons-react';
// @ts-ignore - sessionManager.js doesn't have type declarations
import {
    deleteSession,
    extendSession,
    endSession,
    calculateSessionStatsFromData,
    SessionStatus,
    SessionMode,
} from '../services/sessionManager.js';
import {
    subscribeTeacherSessions,
    type TeacherSession,
} from '../services/sessionQuery';

interface SessionData extends TeacherSession {
    mode?: string;
    status?: string;
    testId?: string;
    playerCount?: number;
    teacherId?: string;
}

const AdminSessionsPage: React.FC = () => {
    const { navigateTo } = useNavigation('admin');
    const { logout, profile, user } = useAuth();
    const { trackAction } = useFeatureTracking(FEATURE_IDS.adminPanel);
    const [sessions, setSessions] = useState<SessionData[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [serverTimeOffsetMs, setServerTimeOffsetMs] = useState(0);

    const isSuperAdmin = profile?.role === 'super_admin';

    const handleLogout = async () => {
        trackAction('adminLogout');
        await logout();
        navigateTo('LOGIN', {}, { reason: 'admin_logout', replace: true });
    };

    const handleSidebarNavigate = (page: string) => {
        trackAction('navigateAdminSection', { page });
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

    const handleSessionCreated = (sessionCode: string, mode: string) => {
        trackAction('createSession', { mode, sessionCode });
        navigateTo('TEACHER_LOBBY' as any, { sessionCode }, { reason: 'admin_session_created' });
    };

    const handleOpenCreateSession = () => {
        trackAction('openCreateSession');
        setShowCreateModal(true);
    };

    const handleCloseCreateSession = () => {
        trackAction('closeCreateSession');
        setShowCreateModal(false);
    };

    // Global reads are explicit and restricted to the super-admin surface.
    useEffect(() => {
        if (!isSuperAdmin || !user?.uid) {
            setSessions([]);
            setLoading(false);
            return undefined;
        }

        setLoading(true);

        return subscribeTeacherSessions({
            teacherId: user.uid,
            canReadAll: true,
            onSessions: (managedSessions: TeacherSession[], context) => {
                setServerTimeOffsetMs(context.serverTimeOffsetMs);
                const sessionsWithStats = managedSessions.map((session) => {
                    const stats = calculateSessionStatsFromData(session, session.sessionCode);
                    return {
                        ...session,
                        playerCount: stats?.playerCount || 0,
                    } as SessionData;
                });

                setSessions(sessionsWithStats);
                setLoading(false);
            },
            onError: (error) => {
                console.error('[AdminSessions] Session subscription failed:', error);
                setLoading(false);
            },
        });
    }, [isSuperAdmin, refreshTrigger, user?.uid]);

    const handleRefresh = () => {
        trackAction('refreshSessions');
        setRefreshTrigger((prev) => prev + 1);
    };

    const handleJoinSession = (sessionCode: string) => {
        trackAction('joinSession', { sessionCode });
        navigateTo('TEACHER_LOBBY' as any, { sessionCode }, { reason: 'admin_join_session' });
    };

    const handleEndSession = async (sessionCode: string) => {
        if (window.confirm(`End session ${sessionCode}? This will complete it for all students.`)) {
            try {
                await endSession(sessionCode);
                trackAction('endSession', { outcome: 'success', sessionCode });
                toast.success(`Ended session ${sessionCode}.`);
                setRefreshTrigger((prev) => prev + 1);
            } catch (error) {
                trackAction('endSession', { outcome: 'failure', sessionCode });
                toast.error(`Could not end session ${sessionCode}.`);
            }
        }
    };

    const handleDeleteSession = async (sessionCode: string) => {
        const session = sessions.find(s => s.sessionCode === sessionCode);
        let confirmMessage = `Delete session ${sessionCode}? This cannot be undone.`;

        if (session && (session.status === SessionStatus.WAITING || session.status === SessionStatus.IN_PROGRESS)) {
            confirmMessage = `⚠️ Session ${sessionCode} is ${String(session.status).toUpperCase()} with ${session.playerCount || 0} player(s). Delete anyway?`;
        }

        if (window.confirm(confirmMessage)) {
            try {
                await deleteSession(sessionCode);
                trackAction('deleteSession', { outcome: 'success', sessionCode });
                toast.success(`Deleted session ${sessionCode}.`);
                setRefreshTrigger((prev) => prev + 1);
            } catch (error) {
                trackAction('deleteSession', { outcome: 'failure', sessionCode });
                toast.error(`Could not delete session ${sessionCode}.`);
            }
        }
    };

    const handleExtendSession = async (sessionCode: string) => {
        try {
            await extendSession(sessionCode, 24);
            trackAction('extendSession', { hours: 24, outcome: 'success', sessionCode });
            toast.success(`Extended session ${sessionCode} by 24 hours.`);
            setRefreshTrigger((prev) => prev + 1);
        } catch (error) {
            trackAction('extendSession', { hours: 24, outcome: 'failure', sessionCode });
            toast.error(`Could not extend session ${sessionCode}.`);
        }
    };

    const getStatusColor = (status?: string) => {
        switch (status) {
            case SessionStatus.WAITING: return '#2563eb';
            case SessionStatus.IN_PROGRESS: return '#15803d';
            case SessionStatus.COMPLETED: return '#64748b';
            case SessionStatus.EXPIRED: return '#dc2626';
            default: return '#64748b';
        }
    };

    const formatTimeRemaining = (expiresAt?: number) => {
        if (typeof expiresAt !== 'number') return 'No expiry';
        const remaining = expiresAt - (Date.now() + serverTimeOffsetMs);
        if (remaining <= 0) return 'Expired';
        const hours = Math.floor(remaining / (1000 * 60 * 60));
        const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
        return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
    };

    const filteredSessions = sessions.filter((session) =>
        session.sessionCode.toLowerCase().includes(searchTerm.toLowerCase())
    );

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
            pageTitle="Sessions"
            currentPage="sessions"
            onNavigate={handleSidebarNavigate}
            onLogout={handleLogout}
            userRole={profile?.role}
        >
            <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
                {/* Header */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '1.5rem',
                    flexWrap: 'wrap',
                    gap: '1rem'
                }}>
                    <div>
                        <h1 style={{
                            fontSize: '1.75rem',
                            fontWeight: '700',
                            color: '#1e293b',
                            marginBottom: '0.25rem'
                        }}>
                            Session Management
                        </h1>
                        <p style={{ color: '#64748b', fontSize: '0.9rem', margin: 0 }}>
                            Monitor and manage all active test sessions
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <Button variant="glass" onClick={handleRefresh} disabled={loading}>
                            <IconRefresh size={16} style={{ marginRight: '0.5rem' }} />
                            Refresh
                        </Button>
                        <Button variant="primary" onClick={handleOpenCreateSession}>
                            <IconPlus size={16} style={{ marginRight: '0.5rem' }} />
                            Create Session
                        </Button>
                    </div>
                </div>

                {/* Search and Stats */}
                <div style={{
                    alignItems: 'center',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '1rem',
                    marginBottom: '1.5rem',
                }}>
                    <Input
                        placeholder="Search by session code..."
                        value={searchTerm}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                        style={{ flex: 1, maxWidth: 400 }}
                    />
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <span style={{
                            background: '#2563eb',
                            borderRadius: '6px',
                            color: '#fff',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            padding: '0.4rem 0.65rem',
                        }}>
                            {sessions.filter(s => s.status === SessionStatus.WAITING).length} Waiting
                        </span>
                        <span style={{
                            background: '#15803d',
                            borderRadius: '6px',
                            color: '#fff',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            padding: '0.4rem 0.65rem',
                        }}>
                            {sessions.filter(s => s.status === SessionStatus.IN_PROGRESS).length} In Progress
                        </span>
                    </div>
                </div>

                {/* Sessions Grid */}
                {loading ? (
                    <div
                        role="status"
                        aria-live="polite"
                        style={{ color: '#64748b', padding: '2rem', textAlign: 'center' }}
                    >
                        Loading sessions…
                    </div>
                ) : filteredSessions.length === 0 ? (
                    <Card variant="glass" style={{ padding: '3rem', textAlign: 'center' }}>
                        <IconPlayerPlay size={48} style={{ color: '#94a3b8', marginBottom: '1rem' }} />
                        <p style={{ color: '#64748b', fontSize: '1.125rem', fontWeight: 500, margin: 0 }}>
                            No active sessions
                        </p>
                        <p style={{ color: '#64748b', fontSize: '0.875rem', margin: '0.5rem 0 1.5rem' }}>
                            Create a new session to get started
                        </p>
                        <Button variant="primary" onClick={handleOpenCreateSession}>
                            <IconPlus size={16} style={{ marginRight: '0.5rem' }} />
                            Create Session
                        </Button>
                    </Card>
                ) : (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                        gap: '1rem'
                    }}>
                        {filteredSessions.map((session) => (
                            <Card key={session.sessionCode} variant="glass" style={{ padding: '1.25rem' }}>
                                <div style={{
                                    alignItems: 'flex-start',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    marginBottom: '0.75rem',
                                }}>
                                    <div>
                                        <p style={{
                                            fontSize: '1.25rem',
                                            fontWeight: 700,
                                            letterSpacing: '0.05em',
                                            margin: 0,
                                        }}>
                                            {session.mode === SessionMode.TEST ? '📝' : '🎮'} {session.sessionCode}
                                        </p>
                                        <p style={{
                                            color: '#64748b',
                                            fontSize: '0.75rem',
                                            margin: '0.25rem 0 0',
                                            textTransform: 'uppercase',
                                        }}>
                                            Test Mode
                                        </p>
                                    </div>
                                    <span style={{
                                        background: getStatusColor(session.status),
                                        borderRadius: '5px',
                                        color: '#fff',
                                        fontSize: '0.75rem',
                                        fontWeight: 600,
                                        padding: '0.3rem 0.5rem',
                                    }}>
                                        {session.status}
                                    </span>
                                </div>

                                <div style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.5rem',
                                    marginBottom: '1rem',
                                }}>
                                    <p style={{ fontSize: '0.875rem', margin: 0 }}>
                                        👥 <strong>{session.playerCount || 0}</strong> players
                                    </p>
                                    <p style={{ fontSize: '0.875rem', margin: 0 }}>
                                        ⏰ Expires in <strong>{formatTimeRemaining(session.expiresAt)}</strong>
                                    </p>
                                    <p style={{ color: '#64748b', fontSize: '0.75rem', margin: 0 }}>
                                        Created {typeof session.createdAt === 'number'
                                            ? new Date(session.createdAt).toLocaleString()
                                            : 'date unavailable'}
                                    </p>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {(session.status === SessionStatus.WAITING || session.status === SessionStatus.IN_PROGRESS) && (
                                        <Button
                                            variant="primary"
                                            fullWidth
                                            onClick={() => handleJoinSession(session.sessionCode)}
                                        >
                                            <IconPlayerPlay size={16} style={{ marginRight: '0.5rem' }} />
                                            Join Session
                                        </Button>
                                    )}
                                    <div style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: 'repeat(3, 1fr)' }}>
                                        <Button variant="glass" size="sm" onClick={() => handleExtendSession(session.sessionCode)}>
                                            <IconClock size={14} />
                                        </Button>
                                        {(session.status === SessionStatus.WAITING || session.status === SessionStatus.IN_PROGRESS) && (
                                            <Button variant="warning" size="sm" onClick={() => handleEndSession(session.sessionCode)}>
                                                <IconPlayerStop size={14} />
                                            </Button>
                                        )}
                                        <Button variant="danger" size="sm" onClick={() => handleDeleteSession(session.sessionCode)}>
                                            <IconTrash size={14} />
                                        </Button>
                                    </div>
                                </div>
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            {/* Create Session Modal */}
            <CreateSessionModal
                opened={showCreateModal}
                onClose={handleCloseCreateSession}
                onSessionCreated={handleSessionCreated}
            />
        </AdminLayout>
    );
};

export default AdminSessionsPage;
