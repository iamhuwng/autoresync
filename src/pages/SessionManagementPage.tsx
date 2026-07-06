// @ts-nocheck
/**
 * Session Management Page
 * Teacher dashboard to view and manage multiple concurrent sessions
 */

import React, { useState, useEffect } from 'react';
import { useNavigation } from '../hooks/useNavigation';
import { useAuth } from '../hooks/useAuth';
import { TeacherHeader } from '../components/navigation';
import { Card, CardBody, CardFooter } from '../components/modern';
import { Button } from '../components/modern';
import { Input } from '../components/modern';
import { CreateSessionModal } from '../components/session/CreateSessionModal';
// @ts-ignore - sessionManager.js doesn't have type declarations (TODO: convert to TypeScript)
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

interface SessionData {
  sessionCode: string;
  mode: string;
  status: string;
  testId?: string;
  createdAt: number;
  expiresAt: number;
  playerCount?: number;
}

const SessionManagementPage: React.FC = () => {
  const { navigateTo } = useNavigation('admin');
  const { logout, user, isAdmin } = useAuth();
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [serverTimeOffsetMs, setServerTimeOffsetMs] = useState(0);

  const handleLogout = async () => {
    try {
      await logout();
      navigateTo('LOGIN', {}, { reason: 'admin_logout', replace: true });
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleBack = () => {
    navigateTo('LOBBY', {}, { reason: 'admin_back_to_lobby' });
  };

  const handleSessionCreated = (sessionCode: string, mode: string) => {
    console.log(`✅ Session created: ${sessionCode} (mode: ${mode})`);

    // Navigate to Teacher Lobby with session code
    navigateTo('TEACHER_LOBBY', { sessionCode }, { reason: 'admin_session_created' });
  };

  // Expiration is derived from canonical session data and RTDB rules.
  // This page subscribes only to indexed sessions the current teacher may manage.
  useEffect(() => {
    if (!user?.uid) {
      setSessions([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);

    return subscribeTeacherSessions({
      teacherId: user.uid,
      canReadAll: isAdmin,
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
        console.error('📊 [SessionMgmt] Session subscription failed:', error);
        setLoading(false);
      },
    });
  }, [isAdmin, refreshTrigger, user?.uid]);

  const handleRefresh = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  const handleJoinSession = (sessionCode: string, _mode: string) => {
    // Navigate to Teacher Lobby with session code
    navigateTo('TEACHER_LOBBY', { sessionCode }, { reason: 'admin_session_created' });
  };

  const handleEndSession = async (sessionCode: string) => {
    if (window.confirm(`Are you sure you want to end session ${sessionCode}? This will complete the session for all students.`)) {
      try {
        await endSession(sessionCode);
        console.log(`✅ Session ${sessionCode} ended`);
        handleRefresh();
      } catch (error) {
        console.error('Error ending session:', error);
        alert(error instanceof Error ? error.message : 'Failed to end session. Please try again.');
      }
    }
  };

  const handleDeleteSession = async (sessionCode: string) => {
    // Get session to check status
    const session = sessions.find(s => s.sessionCode === sessionCode);

    let confirmMessage = `Are you sure you want to delete session ${sessionCode}? This action cannot be undone.`;

    // Stronger warning for active sessions
    if (session && (session.status === SessionStatus.WAITING || session.status === SessionStatus.IN_PROGRESS)) {
      confirmMessage = `⚠️ WARNING: Session ${sessionCode} is currently ${session.status.toUpperCase()} with ${session.playerCount || 0} player(s).\n\nDeleting this session will:\n- Immediately disconnect all students\n- Remove all session data\n- Cannot be undone\n\nAre you absolutely sure?`;
    }

    if (window.confirm(confirmMessage)) {
      try {
        await deleteSession(sessionCode);
        console.log(`🗑️ Session ${sessionCode} deleted`);
        handleRefresh();
      } catch (error) {
        console.error('Error deleting session:', error);
        alert('Failed to delete session. Please try again.');
      }
    }
  };

  const handleExtendSession = async (sessionCode: string) => {
    try {
      await extendSession(sessionCode, 24); // Extend by 24 hours
      console.log(`⏰ Session ${sessionCode} extended`);
      alert(`Session ${sessionCode} has been extended by 24 hours.`);
      handleRefresh();
    } catch (error) {
      console.error('Error extending session:', error);
      alert('Failed to extend session. Please try again.');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case SessionStatus.WAITING:
        return '#0ea5e9'; // Sky blue
      case SessionStatus.IN_PROGRESS:
        return '#10b981'; // Green
      case SessionStatus.COMPLETED:
        return '#64748b'; // Gray
      case SessionStatus.EXPIRED:
        return '#ef4444'; // Red
      default:
        return '#64748b';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case SessionStatus.WAITING:
        return 'Waiting';
      case SessionStatus.IN_PROGRESS:
        return 'In Progress';
      case SessionStatus.COMPLETED:
        return 'Completed';
      case SessionStatus.EXPIRED:
        return 'Expired';
      default:
        return status;
    }
  };

  const getSessionLabel = (session: SessionData) => {
    if (session.testId) return 'Assessment Session';
    return 'Session';
  };

  const getModeIcon = (mode: string) => {
    return mode === SessionMode.TEST ? '📝' : '🎮';
  };

  const formatTimeRemaining = (expiresAt: number) => {
    const now = Date.now() + serverTimeOffsetMs;
    const remaining = expiresAt - now;

    if (remaining <= 0) return 'Expired';

    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const filteredSessions = sessions.filter((session) =>
    session.sessionCode.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const renderSessionCard = (session: SessionData, index: number) => {
    const variants = ['lavender', 'sky', 'mint', 'rose', 'peach'] as const;
    const variant = variants[index % variants.length];
    const statusColor = getStatusColor(session.status);

    return (
      <Card
        key={session.sessionCode}
        variant={variant}
        hover
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          animation: `slideUp 0.5s ease-out ${index * 0.1}s backwards`,
        }}
      >
        <CardBody style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Session Code Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                <span style={{ fontSize: '1.5rem' }}>{getModeIcon(session.mode)}</span>
                <h3
                  style={{
                    fontSize: '1.75rem',
                    fontWeight: '800',
                    margin: 0,
                    color: '#1e293b',
                    letterSpacing: '0.05em',
                  }}
                >
                  {session.sessionCode}
                </h3>
              </div>
              <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0, textTransform: 'uppercase', fontWeight: '600' }}>
                {getSessionLabel(session)}
              </p>
            </div>

            {/* Status Badge */}
            <div
              style={{
                padding: '0.25rem 0.75rem',
                borderRadius: '9999px',
                backgroundColor: `${statusColor}20`,
                border: `2px solid ${statusColor}40`,
                fontSize: '0.75rem',
                fontWeight: '700',
                color: statusColor,
                textTransform: 'uppercase',
              }}
            >
              {getStatusLabel(session.status)}
            </div>
          </div>

          {/* Session Info */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.25rem' }}>👥</span>
              <span style={{ fontSize: '0.875rem', color: '#64748b' }}>
                <strong style={{ color: '#1e293b' }}>{session.playerCount || 0}</strong> players
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.25rem' }}>⏰</span>
              <span style={{ fontSize: '0.875rem', color: '#64748b' }}>
                Expires in <strong style={{ color: '#1e293b' }}>{formatTimeRemaining(session.expiresAt)}</strong>
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.25rem' }}>📅</span>
              <span style={{ fontSize: '0.875rem', color: '#64748b' }}>
                Created {new Date(session.createdAt).toLocaleString()}
              </span>
            </div>
          </div>
        </CardBody>

        <CardFooter style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
          {/* Join Button */}
          {(session.status === SessionStatus.WAITING || session.status === SessionStatus.IN_PROGRESS) && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => handleJoinSession(session.sessionCode, session.mode)}
              style={{ flex: '1 1 100%' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '0.25rem' }}>
                <path d="M8 5v14l11-7z" />
              </svg>
              Join Session
            </Button>
          )}

          {/* Action Buttons */}
          <Button
            variant="glass"
            size="sm"
            onClick={() => handleExtendSession(session.sessionCode)}
            style={{ flex: '1 1 auto' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.25rem' }}>
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            Extend
          </Button>

          {(session.status === SessionStatus.WAITING || session.status === SessionStatus.IN_PROGRESS) && (
            <Button
              variant="warning"
              size="sm"
              onClick={() => handleEndSession(session.sessionCode)}
              style={{ flex: '1 1 auto' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '0.25rem' }}>
                <path d="M6 6h12v12H6z" />
              </svg>
              End
            </Button>
          )}

          {/* Always show delete button for all sessions */}
          <Button
            variant="danger"
            size="sm"
            onClick={() => handleDeleteSession(session.sessionCode)}
            style={{ flex: '1 1 auto' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '0.25rem' }}>
              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
            </svg>
            Delete
          </Button>
        </CardFooter>
      </Card>
    );
  };

  return (
    <>
      <TeacherHeader
        pageTitle="Session Management"
        userId={user?.uid || ''}
        userRole={isAdmin ? 'super_admin' : 'teacher'}
        userDisplayName={user?.displayName || user?.email}
        userEmail={user?.email}
        userAvatarUrl={user?.photoURL}
        onLogout={handleLogout}
        hideBackButton={false}
        hideNavigation={false}
        hideBreadcrumbs={false}
      />

      <div
        style={{
          minHeight: 'calc(100vh - 180px)',
          background: 'linear-gradient(135deg, #faf5ff 0%, #f0f9ff 25%, #f0fdfa 50%, #fff7ed 75%, #faf5ff 100%)',
          backgroundAttachment: 'fixed',
          padding: '2rem 1rem',
        }}
      >
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          {/* Page Header */}
          <div style={{ marginBottom: '2.5rem', animation: 'slideDown 0.5s ease-out' }}>
            <h1
              style={{
                fontSize: '2.5rem',
                fontWeight: '800',
                marginBottom: '0.5rem',
                color: '#1e293b',
              }}
            >
              Active Sessions
            </h1>
            <p style={{ fontSize: '1rem', color: '#64748b' }}>
              View and manage all your active sessions
            </p>
          </div>

          {/* Search and Actions Bar */}
          <Card
            variant="glass"
            style={{
              marginBottom: '2rem',
              animation: 'slideUp 0.5s ease-out 0.1s backwards',
            }}
          >
            <CardBody>
              <div
                style={{
                  display: 'flex',
                  gap: '1rem',
                  alignItems: 'flex-end',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ flex: '1 1 300px' }}>
                  <Input
                    placeholder="Search by session code..."
                    value={searchTerm}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                    variant="default"
                  />
                </div>

                <Button
                  variant="primary"
                  onClick={() => setShowCreateModal(true)}
                  style={{ marginRight: '0.5rem' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '0.5rem' }}>
                    <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                  </svg>
                  Create New Session
                </Button>

                <Button variant="glass" onClick={handleRefresh}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.5rem' }}>
                    <polyline points="23 4 23 10 17 10" />
                    <polyline points="1 20 1 14 7 14" />
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                  </svg>
                  Refresh
                </Button>
              </div>
            </CardBody>
          </Card>

          {/* Sessions Grid */}
          {loading ? (
            <Card
              variant="default"
              style={{
                textAlign: 'center',
                padding: '4rem 2rem',
                animation: 'scaleIn 0.5s ease-out 0.2s backwards',
              }}
            >
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
              <h2
                style={{
                  fontSize: '1.75rem',
                  fontWeight: '700',
                  marginBottom: '0.5rem',
                  color: '#1e293b',
                }}
              >
                Loading sessions...
              </h2>
            </Card>
          ) : filteredSessions.length === 0 ? (
            <Card
              variant="default"
              style={{
                textAlign: 'center',
                padding: '4rem 2rem',
                animation: 'scaleIn 0.5s ease-out 0.2s backwards',
              }}
            >
              <svg
                width="80"
                height="80"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#cbd5e1"
                strokeWidth="1.5"
                style={{ margin: '0 auto 1.5rem' }}
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <h2
                style={{
                  fontSize: '1.75rem',
                  fontWeight: '700',
                  marginBottom: '0.5rem',
                  color: '#1e293b',
                }}
              >
                No active sessions
              </h2>
              <p style={{ fontSize: '1rem', color: '#64748b', marginBottom: '1.5rem' }}>
                Create a new session from the Teacher Lobby to get started
              </p>
              <Button variant="primary" onClick={handleBack}>
                Go to Lobby
              </Button>
            </Card>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: '1.5rem',
              }}
            >
              {filteredSessions.map((session, index) => renderSessionCard(session, index))}
            </div>
          )}
        </div>
      </div>

      {/* Create Session Modal */}
      <CreateSessionModal
        opened={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSessionCreated={handleSessionCreated}
      />
    </>
  );
};

export default SessionManagementPage;
