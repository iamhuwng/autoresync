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
import { AdminLayout } from '../components/navigation';
import { Card, Button, Input } from '../components/modern';
import { CreateSessionModal } from '../components/session/CreateSessionModal';
import { Group, Badge, Loader, Text, Stack } from '@mantine/core';
import {
    IconRefresh, IconPlus, IconPlayerPlay, IconClock,
    IconTrash, IconPlayerStop
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';

// @ts-ignore - Firebase is a .js file
import { ref, onValue, query, orderByChild, equalTo } from 'firebase/database';
// @ts-ignore - Firebase is a .js file
import { database } from '../services/firebase';
// @ts-ignore - sessionManager.js doesn't have type declarations
import {
    deleteSession,
    extendSession,
    endSession,
    calculateSessionStatsFromData,
    SessionStatus,
    SessionMode,
} from '../services/sessionManager.js';

interface SessionData {
    sessionCode: string;
    mode: string;
    status: string;
    quizId?: string;
    testId?: string;
    createdAt: number;
    expiresAt: number;
    playerCount?: number;
    teacherId?: string;
}

const AdminSessionsPage: React.FC = () => {
    const { navigateTo } = useNavigation('admin');
    const { logout, profile } = useAuth();
    const [sessions, setSessions] = useState<SessionData[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [showCreateModal, setShowCreateModal] = useState(false);

    const isSuperAdmin = profile?.role === 'super_admin';

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

    const handleSessionCreated = (sessionCode: string, mode: string) => {
        console.log(`✅ Session created: ${sessionCode} (mode: ${mode})`);
        navigateTo('TEACHER_LOBBY' as any, { sessionCode }, { reason: 'admin_session_created' });
    };

    // Auto-cleanup expired sessions
    useEffect(() => {
        const runCleanup = async () => {
            try {
                const { cleanupExpiredSessions } = await import('../services/sessionManager.js');
                const result = await cleanupExpiredSessions(false);
                if (result.marked > 0) {
                    console.log(`🧹 Auto-cleanup: ${result.marked} sessions marked as expired`);
                }
            } catch (error) {
                console.error('Error during auto-cleanup:', error);
            }
        };

        runCleanup();
        const cleanupInterval = setInterval(runCleanup, 5 * 60 * 1000);
        return () => clearInterval(cleanupInterval);
    }, []);

    // Load sessions with realtime listeners
    useEffect(() => {
        if (!isSuperAdmin) return;

        let unsubWaiting: (() => void) | null = null;
        let unsubInProgress: (() => void) | null = null;
        let waitingData: Record<string, any> = {};
        let inProgressData: Record<string, any> = {};

        const updateSessionsState = () => {
            const realtimeNow = Date.now();
            const combined = [
                ...Object.entries(waitingData).map(([code, data]) => ({ ...data, sessionCode: code })),
                ...Object.entries(inProgressData).map(([code, data]) => ({ ...data, sessionCode: code }))
            ];

            const filtered = combined
                .filter((session: any) => {
                    if (session.status === SessionStatus.EXPIRED || session.status === SessionStatus.COMPLETED) return false;
                    if (session.expiresAt && realtimeNow > session.expiresAt) return false;
                    return true;
                })
                .sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));

            const sessionsWithStats = filtered.map((session: any) => {
                const stats = calculateSessionStatsFromData(session, session.sessionCode);
                return {
                    ...session,
                    playerCount: stats?.playerCount || 0,
                };
            });

            setSessions(sessionsWithStats);
            setLoading(false);
        };

        const setupListeners = () => {
            setLoading(true);
            try {
                const sessionsRef = ref(database, 'game_sessions');

                const waitingQuery = query(sessionsRef, orderByChild('status'), equalTo(SessionStatus.WAITING));
                unsubWaiting = onValue(waitingQuery, (snapshot) => {
                    waitingData = snapshot.val() || {};
                    updateSessionsState();
                });

                const inProgressQuery = query(sessionsRef, orderByChild('status'), equalTo(SessionStatus.IN_PROGRESS));
                unsubInProgress = onValue(inProgressQuery, (snapshot) => {
                    inProgressData = snapshot.val() || {};
                    updateSessionsState();
                });
            } catch (error) {
                console.error('Failed to set up listeners:', error);
                setLoading(false);
            }
        };

        setupListeners();

        return () => {
            if (unsubWaiting) unsubWaiting();
            if (unsubInProgress) unsubInProgress();
        };
    }, [refreshTrigger, isSuperAdmin]);

    const handleRefresh = () => setRefreshTrigger((prev) => prev + 1);

    const handleJoinSession = (sessionCode: string) => {
        navigateTo('TEACHER_LOBBY' as any, { sessionCode }, { reason: 'admin_join_session' });
    };

    const handleEndSession = async (sessionCode: string) => {
        if (window.confirm(`End session ${sessionCode}? This will complete it for all students.`)) {
            try {
                await endSession(sessionCode);
                notifications.show({ title: 'Session Ended', message: `Session ${sessionCode} has been ended`, color: 'green' });
                handleRefresh();
            } catch (error) {
                notifications.show({ title: 'Error', message: 'Failed to end session', color: 'red' });
            }
        }
    };

    const handleDeleteSession = async (sessionCode: string) => {
        const session = sessions.find(s => s.sessionCode === sessionCode);
        let confirmMessage = `Delete session ${sessionCode}? This cannot be undone.`;

        if (session && (session.status === SessionStatus.WAITING || session.status === SessionStatus.IN_PROGRESS)) {
            confirmMessage = `⚠️ Session ${sessionCode} is ${session.status.toUpperCase()} with ${session.playerCount || 0} player(s). Delete anyway?`;
        }

        if (window.confirm(confirmMessage)) {
            try {
                await deleteSession(sessionCode);
                notifications.show({ title: 'Session Deleted', message: `Session ${sessionCode} deleted`, color: 'green' });
                handleRefresh();
            } catch (error) {
                notifications.show({ title: 'Error', message: 'Failed to delete session', color: 'red' });
            }
        }
    };

    const handleExtendSession = async (sessionCode: string) => {
        try {
            await extendSession(sessionCode, 24);
            notifications.show({ title: 'Session Extended', message: `Session ${sessionCode} extended by 24 hours`, color: 'green' });
            handleRefresh();
        } catch (error) {
            notifications.show({ title: 'Error', message: 'Failed to extend session', color: 'red' });
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case SessionStatus.WAITING: return 'blue';
            case SessionStatus.IN_PROGRESS: return 'green';
            case SessionStatus.COMPLETED: return 'gray';
            case SessionStatus.EXPIRED: return 'red';
            default: return 'gray';
        }
    };

    const formatTimeRemaining = (expiresAt: number) => {
        const remaining = expiresAt - Date.now();
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
                            Monitor and manage all active quiz and test sessions
                        </p>
                    </div>
                    <Group>
                        <Button variant="glass" onClick={handleRefresh} disabled={loading}>
                            <IconRefresh size={16} style={{ marginRight: '0.5rem' }} />
                            Refresh
                        </Button>
                        <Button variant="primary" onClick={() => setShowCreateModal(true)}>
                            <IconPlus size={16} style={{ marginRight: '0.5rem' }} />
                            Create Session
                        </Button>
                    </Group>
                </div>

                {/* Search and Stats */}
                <Group mb="lg" gap="md">
                    <Input
                        placeholder="Search by session code..."
                        value={searchTerm}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                        style={{ flex: 1, maxWidth: 400 }}
                    />
                    <Group gap="xs">
                        <Badge size="lg" variant="filled" color="blue">
                            {sessions.filter(s => s.status === SessionStatus.WAITING).length} Waiting
                        </Badge>
                        <Badge size="lg" variant="filled" color="green">
                            {sessions.filter(s => s.status === SessionStatus.IN_PROGRESS).length} In Progress
                        </Badge>
                    </Group>
                </Group>

                {/* Sessions Grid */}
                {loading ? (
                    <Group justify="center" py="xl">
                        <Loader size="lg" />
                    </Group>
                ) : filteredSessions.length === 0 ? (
                    <Card variant="glass" style={{ padding: '3rem', textAlign: 'center' }}>
                        <IconPlayerPlay size={48} style={{ color: '#94a3b8', marginBottom: '1rem' }} />
                        <Text size="lg" fw={500} c="dimmed">No active sessions</Text>
                        <Text size="sm" c="dimmed" mb="lg">
                            Create a new session to get started
                        </Text>
                        <Button variant="primary" onClick={() => setShowCreateModal(true)}>
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
                                <Group justify="space-between" mb="sm">
                                    <div>
                                        <Text fw={700} size="xl" style={{ letterSpacing: '0.05em' }}>
                                            {session.mode === SessionMode.TEST ? '📝' : '🎮'} {session.sessionCode}
                                        </Text>
                                        <Text size="xs" c="dimmed" tt="uppercase">
                                            {session.mode === SessionMode.TEST ? 'Test Mode' : 'Quiz Mode'}
                                        </Text>
                                    </div>
                                    <Badge color={getStatusColor(session.status)} size="sm">
                                        {session.status}
                                    </Badge>
                                </Group>

                                <Stack gap="xs" mb="md">
                                    <Group gap="xs">
                                        <Text size="sm">👥 <strong>{session.playerCount || 0}</strong> players</Text>
                                    </Group>
                                    <Group gap="xs">
                                        <Text size="sm">⏰ Expires in <strong>{formatTimeRemaining(session.expiresAt)}</strong></Text>
                                    </Group>
                                    <Group gap="xs">
                                        <Text size="xs" c="dimmed">
                                            Created {new Date(session.createdAt).toLocaleString()}
                                        </Text>
                                    </Group>
                                </Stack>

                                <Stack gap="xs">
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
                                    <Group grow>
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
                                    </Group>
                                </Stack>
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            {/* Create Session Modal */}
            <CreateSessionModal
                opened={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                onSessionCreated={handleSessionCreated}
            />
        </AdminLayout>
    );
};

export default AdminSessionsPage;
