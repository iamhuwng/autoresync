import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { enrollStudent } from '../services/classManager';
import { getAvailablePublicSessions } from '../services/resultsService';
import { getPaginatedUserNotifications, markNotificationAsRead, subscribeToNewNotifications } from '../services/notificationService';
import { sessionService } from '../services/sessionService';
import { Loader, Badge } from '@mantine/core';
import { useNavigation } from '../hooks/useNavigation';
import { useResolvedStudentShellData } from '../context/StudentShellDataContext';
import { StudentLayout } from '../components/layout/StudentLayout';
import { StudentSidebar } from '../components/layout/StudentSidebar';
import { S } from '../components/layout/studentLayoutStyles';
import { IconCheck, IconBriefcase } from '../components/layout/StudentIcons';
import { ResultSlidePanel } from '../components/results/ResultSlidePanel';
import { cleanupExpiredProgress } from '../hooks/solo/useSoloAutoSave';
import { PendingReviewsWidget } from '../components/dashboard/PendingReviewsWidget';

const localStyles = {
    article: { background: 'white', padding: '16px 24px', borderBottom: '1px solid #e5e7eb', cursor: 'pointer', transition: 'background 0.2s' },
    articleRow: { display: 'flex', gap: 12 },
    avatar: { width: 48, height: 48, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1.25rem', flexShrink: 0 },
    articleMeta: { display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 },
    articleTitle: { fontSize: '0.95rem', fontWeight: 700, color: '#111827', margin: 0 },
    articleTime: { fontSize: '0.875rem', color: '#6b7280' },
    articleBody: { fontSize: '15px', color: '#111827', margin: 0, lineHeight: 1.5 },
    nestedCard: { marginTop: 12, background: '#f8fafc', borderRadius: 8, padding: 12, border: '1px solid #e2e8f0' },
    nestedCardGreen: { marginTop: 12, background: '#ecfdf5', borderRadius: 8, padding: 12, border: '1px solid #a7f3d0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    widgetItemTitle: { fontWeight: 600, fontSize: '0.875rem', color: '#111827', margin: '0 0 2px' },
    widgetItemSub: { fontSize: '0.75rem', color: '#6b7280', margin: 0 },
    widgetItemSubRed: { fontSize: '0.75rem', color: '#ef4444', margin: 0, fontWeight: 500 },
    showMoreLink: { color: '#4f46e5', fontSize: '0.875rem', fontWeight: 600, background: 'none', border: 'none', padding: 0, cursor: 'pointer', marginTop: 8 },
    classRow: { display: 'flex', alignItems: 'center', gap: 12 },
    classIcon: { width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1rem', flexShrink: 0 }
};

// ─── Utility: Relative time ─────────────────────────────────────────────────
function timeAgo(dateInput) {
    const date = typeof dateInput === 'number' ? new Date(dateInput) : new Date(dateInput);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d`;
    return date.toLocaleDateString();
}

// ─── Feed item type → avatar config ──────────────────────────────────────────
function getFeedAvatar(notif) {
    const type = notif.type;
    const title = notif.title || '';
    if (title.includes('Test Complete') || title.includes('auto-graded') || (type === 'success' && notif.metadata?.resultId)) {
        return { bg: '#d1fae5', color: '#059669', icon: <IconCheck /> }; // Emerald
    }
    if (title.includes('Joined Class') || notif.metadata?.className) {
        return { bg: '#dbeafe', color: '#2563eb', icon: <IconBriefcase /> }; // Blue
    }
    if (title.includes('Homework') || notif.metadata?.homeworkId) {
        // Task 12.2: THCS homework gets violet avatar
        if (notif.metadata?.materialType === 'thcs-test') {
            return { bg: '#ede9fe', color: '#7c3aed', char: 'T' }; // Violet THCS
        }
        return { bg: '#fef3c7', color: '#d97706', char: 'T' }; // Amber (using T to match prototype 'T'eacher)
    }
    if (notif.metadata?.testName || notif.metadata?.resultId) {
        return { bg: '#d1fae5', color: '#059669', icon: <IconCheck /> }; // Emerald
    }
    return { bg: '#fef3c7', color: '#d97706', char: (title[0] || 'N').toUpperCase() }; // Default Amber
}

// ─── Feed filter tabs config ─────────────────────────────────────────────────
const FILTER_TABS = [
    { key: 'all', label: 'All' },
    { key: 'homework', label: 'Homework' },
    { key: 'tests', label: 'Tests' },
    { key: 'classes', label: 'Classes' },
];

// ─── Class color palette ─────────────────────────────────────────────────────
const CLASS_COLORS = [
    { bg: '#e0e7ff', color: '#4338ca' },
    { bg: '#d1fae5', color: '#047857' },
    { bg: '#fef3c7', color: '#b45309' },
    { bg: '#fce7f3', color: '#be185d' },
    { bg: '#e0f2fe', color: '#0369a1' },
];

const StudentDashboardPage = () => {
    const { user, profile } = useAuth();
    const navigate = useNavigate();
    const { navigateTo } = useNavigation('student');

    const [classCode, setClassCode] = useState('');
    const [isEnrolling, setIsEnrolling] = useState(false);
    const [enrollError, setEnrollError] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [publicSessions, setPublicSessions] = useState([]);
    const {
        enrolledClasses,
        classLiveSessions,
        notStarted,
        sortedAssignments,
        refreshClasses,
    } = useResolvedStudentShellData();

    const [activeView, setActiveView] = useState('feed');
    const [feedFilter, setFeedFilter] = useState('all');
    const [allNotifications, setAllNotifications] = useState([]);
    const [notifCursor, setNotifCursor] = useState(undefined);
    const [hasMoreNotifs, setHasMoreNotifs] = useState(false);
    const [joinSuccessMessage, setJoinSuccessMessage] = useState('');
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [showJoinModal, setShowJoinModal] = useState(false);
    const [selectedResultId, setSelectedResultId] = useState(null);


    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('view') === 'feed') setActiveView('feed');
        else if (params.get('view') === 'classes') setActiveView('classes');
    }, []);

    useEffect(() => {
        const loadNotifications = async () => {
            if (!user?.uid) return;
            try {
                const result = await getPaginatedUserNotifications(user.uid, 20);
                setAllNotifications(result.notifications || []);
                setHasMoreNotifs(result.hasMore);
                setNotifCursor(result.lastKey);
            } catch (e) {
                console.error('Error loading notifications', e);
            }
        };

        const loadDashboardData = async () => {
            if (!user?.uid) return;
            setIsLoading(true);
            try {
                const sessions = await getAvailablePublicSessions();
                setPublicSessions(sessions || []);
            } catch (error) {
                console.error('Error loading dashboard data:', error);
            } finally {
                setIsLoading(false);
            }
        };

        if (user?.uid) {
            cleanupExpiredProgress(); // Clean up expired solo progress entries
            loadNotifications();
            loadDashboardData();
        }
    }, [user]);

    // ── Real-time listener: live sessions from enrolled classes ───────────────
    // ── Real-time listener: prepend new notifications as they arrive ──────────
    useEffect(() => {
        if (!user?.uid) return;

        // Record now so the listener ONLY fires for notifications created after
        // this mount — avoids duplicating the initial paginated fetch.
        const sinceMs = Date.now();

        const unsubscribe = subscribeToNewNotifications(user.uid, sinceMs, (newNotif) => {
            setAllNotifications(prev => {
                // Deduplicate: skip if we already have this id
                if (prev.some(n => n.id === newNotif.id)) return prev;
                return [newNotif, ...prev];
            });
        });

        return () => unsubscribe();
    }, [user?.uid]);

    const handleLoadMore = async () => {
        if (!user?.uid || !hasMoreNotifs) return;
        setIsLoadingMore(true);
        try {
            const result = await getPaginatedUserNotifications(user.uid, 20, notifCursor);
            setAllNotifications(prev => {
                const updated = [...prev, ...result.notifications];
                return updated;
            });
            setHasMoreNotifs(result.hasMore);
            setNotifCursor(result.lastKey);
        } catch (e) {
            console.error('Error loading more notifications', e);
        } finally {
            setIsLoadingMore(false);
        }
    };

    const handleJoinClass = async (e) => {
        e.preventDefault();
        if (!classCode.trim() || !user?.uid) {
            setEnrollError('Please enter a class code');
            return;
        }
        setIsEnrolling(true);
        setEnrollError('');
        setJoinSuccessMessage('');
        try {
            const result = await enrollStudent(classCode.trim().toUpperCase(), user.uid, user.displayName || 'Student', user.email);
            if (result.success) {
                setJoinSuccessMessage(`✅ Successfully joined ${classCode.trim().toUpperCase()}!`);
                setClassCode('');
                await refreshClasses();
                setTimeout(() => { setJoinSuccessMessage(''); setShowJoinModal(false); }, 3000);
            } else {
                setEnrollError(result.error || 'Failed to join class');
            }
        } catch (error) {
            console.error('Error joining class:', error);
            setEnrollError('An error occurred. Please try again.');
        } finally {
            setIsEnrolling(false);
        }
    };

    const filteredNotifications = useMemo(() => {
        let result = allNotifications;
        if (feedFilter === 'homework') {
            result = result.filter(n => n.metadata?.homeworkId);
        } else if (feedFilter === 'tests') {
            result = result.filter(n => (n.metadata?.resultId || n.metadata?.testName) && !n.metadata?.homeworkId);
        } else if (feedFilter === 'classes') {
            result = result.filter(n => n.metadata?.className || (n.title && n.title.includes('Joined Class')));
        }
        return result;
    }, [allNotifications, feedFilter]);

    const shellData = useMemo(() => ({
        classLiveSessions,
        enrolledClasses,
        sortedAssignments,
    }), [classLiveSessions, enrolledClasses, sortedAssignments]);

    const handleJoinPublicSession = (sessionCode) => {
        if (user) {
            sessionService.setPlayerData(
                user.uid,
                user.displayName || user.email || 'Student',
                sessionCode,
            );
        }

        navigateTo(
            'STUDENT_WAITING',
            { gameSessionId: sessionCode },
            { reason: 'dashboard_public_session_join' },
        );
    };

    const handleSidebarClick = (view) => {
        setActiveView(view);
    };

    const handleNotificationClick = async (notif) => {
        // Mark as read (fire-and-forget)
        try { markNotificationAsRead(user.uid, notif.id); } catch (_) { /* non-blocking */ }

        // ── Session/Test Join ──────────────────────────────────────────────────
        // When a "New Session" or "Test Started" notification is clicked, we
        // must first register the student's player data in sessionStorage before
        // navigating, exactly as StudentClassDetailPage does. This ensures the
        // test page can identify the player and apply class-based permissions.
        const { sessionCode } = notif.metadata || {};
        if (sessionCode) {
            sessionService.setPlayerData(
                user.uid,
                user.displayName || user.email || 'Student',
                sessionCode
            );
            // Always enter live sessions via the waiting room so the session
            // lifecycle controls the transition to the student test surface.
            navigateTo(
                'STUDENT_WAITING',
                { gameSessionId: sessionCode },
                { reason: 'dashboard_session_notification' },
            );
            return;
        }

        // ── Result Link ────────────────────────────────────────────────────────
        // PRD-0025 US-11: Open inline ResultDetailModal on Academic Record page
        if (notif.metadata?.resultId) {
            setSelectedResultId(notif.metadata.resultId);
            return;
        }

        // ── Generic Link (homework, class join, etc.) ──────────────────────────
        if (notif.link) {
            navigate(notif.link);
        }
    };



    const renderFeedItem = (notif) => {
        const av = getFeedAvatar(notif);
        const hasScore = notif.metadata?.score !== undefined && notif.metadata?.maxScore !== undefined;
        const hasAction = notif.metadata?.testName && !hasScore;

        return (
            <article
                key={notif.id}
                style={localStyles.article}
                onClick={() => handleNotificationClick(notif)}
                onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                onMouseLeave={e => e.currentTarget.style.background = 'white'}
            >
                <div style={localStyles.articleRow}>
                    <div style={{ ...localStyles.avatar, background: av.bg, color: av.color }}>
                        {av.icon || av.char}
                    </div>

                    <div style={{ flex: 1 }}>
                        <div style={localStyles.articleMeta}>
                            <h3 style={localStyles.articleTitle}>{notif.title}</h3>
                            {/* Task 12.2: THCS badge */}
                            {notif.metadata?.materialType === 'thcs-test' && (
                                <Badge size="xs" color="violet" variant="light" ml={4}>THCS-THPT</Badge>
                            )}
                            <span style={localStyles.articleTime}>· {timeAgo(notif.createdAt)}</span>
                        </div>
                        <div style={localStyles.articleBody} dangerouslySetInnerHTML={{ __html: notif.message.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />

                        {hasScore && (
                            <div style={localStyles.nestedCardGreen}>
                                <div style={{ minWidth: 0 }}>
                                    <p style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#065f46', margin: 0 }}>Score</p>
                                    <p style={{ fontSize: '1.75rem', fontWeight: 700, color: '#059669', margin: '4px 0 0', whiteSpace: 'nowrap' }}>{typeof notif.metadata.score === 'number' ? (Number.isInteger(notif.metadata.score) ? notif.metadata.score : notif.metadata.score.toFixed(1)) : notif.metadata.score}/{typeof notif.metadata.maxScore === 'number' ? (Number.isInteger(notif.metadata.maxScore) ? notif.metadata.maxScore : notif.metadata.maxScore.toFixed(1)) : notif.metadata.maxScore}</p>
                                </div>
                                <button
                                    style={{ color: '#047857', background: 'white', border: '1px solid #a7f3d0', padding: '6px 12px', borderRadius: 999, fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                                    onClick={(e) => { e.stopPropagation(); handleNotificationClick(notif); }}
                                >
                                    View Details
                                </button>
                            </div>
                        )}

                        {hasAction && (
                            <div style={localStyles.nestedCard}>
                                <p style={{ fontWeight: 600, fontSize: '0.875rem', margin: '0 0 4px', color: '#111827' }}>{notif.metadata.testName}</p>
                                {notif.metadata?.dueDate && (
                                    <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0 0 12px' }}>Due: {new Date(notif.metadata.dueDate).toLocaleDateString()}</p>
                                )}
                                <button
                                    style={{ background: '#111827', color: 'white', padding: '6px 16px', borderRadius: 999, fontSize: '0.875rem', fontWeight: 700, border: 'none', cursor: 'pointer' }}
                                    onClick={(e) => { e.stopPropagation(); handleNotificationClick(notif); }}
                                >
                                    Start Now
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </article>
        );
    };

    const renderCenterContent = () => {
        if (activeView === 'feed' && allNotifications.length === 0 && enrolledClasses.length === 0 && !isLoading) {
            return (
                <div style={{ textAlign: 'center', padding: '60px 24px' }}>
                    <div style={{ fontSize: '3.5rem', marginBottom: 16 }}>👋</div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', margin: '0 0 8px' }}>Welcome to Kahoot!</h2>
                    <p style={{ color: '#6b7280', fontSize: '1rem', margin: '0 0 32px' }}>Ask your teacher for a class code to get started.</p>
                    <button style={{ ...S.joinBtn, maxWidth: 300, margin: '0 auto' }} onClick={() => setShowJoinModal(true)}>Join a Class</button>
                    {publicSessions.length > 0 && (
                        <div style={{ marginTop: 32, textAlign: 'left', maxWidth: 400, margin: '32px auto 0' }}>
                            <p style={{ textTransform: 'uppercase', fontSize: '0.75rem', color: '#9ca3af', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 12 }}>Or try a public session</p>
                            {publicSessions.slice(0, 3).map(s => (
                                <div key={s.sessionCode} style={{ ...localStyles.article, borderRadius: 12, border: '1px solid #e5e7eb', marginBottom: 8 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontWeight: 600 }}>{s.testTitle}</span>
                                        <button style={{ background: '#111827', color: 'white', padding: '6px 16px', borderRadius: 999, fontSize: '0.875rem', fontWeight: 600, border: 'none', cursor: 'pointer' }} onClick={() => handleJoinPublicSession(s.sessionCode)}>Join</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            );
        }

        if (activeView === 'feed') {
            return (
                <>
                    {filteredNotifications.length === 0 && !isLoading ? (
                        <div style={{ textAlign: 'center', padding: '48px 16px', color: '#6b7280' }}>
                            No {feedFilter === 'all' ? '' : feedFilter} activity yet.
                        </div>
                    ) : (
                        filteredNotifications.map(renderFeedItem)
                    )}
                    {hasMoreNotifs && (
                        <div style={{ padding: 16, textAlign: 'center' }}>
                            <button style={{ ...S.joinBtn, background: 'white', color: '#4f46e5', border: '1px solid #e5e7eb', fontSize: '0.875rem', padding: '10px 24px' }} onClick={handleLoadMore} disabled={isLoadingMore}>
                                {isLoadingMore ? 'Loading...' : 'Load More'}
                            </button>
                        </div>
                    )}
                </>
            );
        }

        if (activeView === 'classes') {
            return (
                <div style={{ padding: 16 }}>
                    {isLoading ? <div style={{ textAlign: 'center', padding: 32 }}><Loader size="sm" /></div> :
                        enrolledClasses.length === 0 ? <p style={{ color: '#6b7280', textAlign: 'center', padding: 32 }}>No classes yet.</p> : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
                                {enrolledClasses.map((cls, idx) => {
                                    const c = CLASS_COLORS[idx % CLASS_COLORS.length];
                                    return (
                                        <div key={cls.id} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, cursor: 'pointer', transition: 'box-shadow 0.2s' }} onClick={() => navigateTo('STUDENT_CLASS_DETAIL', { classId: cls.id })} onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'} onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
                                            <div style={{ ...localStyles.classIcon, background: c.bg, color: c.color, marginBottom: 12 }}>{cls.classCode?.slice(0, 2) || '??'}</div>
                                            <p style={{ fontWeight: 700, fontSize: '0.875rem', margin: '0 0 4px', color: '#111827' }}>{cls.name || cls.classCode}</p>
                                            <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: 0 }}>👥 {cls.studentCount || 0} students</p>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                </div>
            );
        }

        return null;
    };

    const renderRightPanel = () => {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {publicSessions.length > 0 && (
                    <div style={S.widget}>
                        <h3 style={S.widgetTitle}>Live Now ðŸ”¥</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {[...publicSessions]
                                .sort((a, b) => b.playerCount - a.playerCount || a.createdAt - b.createdAt)
                                .slice(0, 5)
                                .map(session => (
                                    <div key={session.sessionCode} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <p style={localStyles.widgetItemTitle}>{session.testTitle}</p>
                                            <p style={localStyles.widgetItemSub}>{session.playerCount} playing</p>
                                        </div>
                                        <button
                                            style={{ background: '#111827', color: 'white', padding: '4px 12px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 600, border: 'none', cursor: 'pointer' }}
                                            onClick={() => handleJoinPublicSession(session.sessionCode)}
                                        >
                                            Join
                                        </button>
                                    </div>
                                ))}
                        </div>
                    </div>
                )}
                <PendingReviewsWidget />
            </div>
        );

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {/* Search Box */}
                <div style={{ position: 'relative', background: '#e5e7eb', borderRadius: 999, display: 'flex', alignItems: 'center', marginBottom: 24 }}>
                    <div style={{ paddingLeft: 16, color: '#6b7280' }}>🔍</div>
                    <input type="text" placeholder="Search classes, tests..." style={{ background: 'transparent', width: '100%', padding: '12px 16px 12px 12px', outline: 'none', border: 'none', color: '#111827' }} />
                </div>

                {/* ── Live Sessions from Classes ─────────────────────── */}
                {classLiveSessions.length > 0 && (
                    <div style={{ ...S.widget, border: '1px solid #fecaca', background: '#fff5f5' }}>
                        <h3 style={{ ...S.widgetTitle, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{
                                width: 8, height: 8, borderRadius: '50%',
                                background: '#ef4444',
                                boxShadow: '0 0 0 3px rgba(239, 68, 68, 0.2)',
                                animation: 'livePulse 2s infinite',
                                display: 'inline-block', flexShrink: 0
                            }} />
                            Live Now
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {classLiveSessions.slice(0, 5).map(session => (
                                <div key={session.code} style={{
                                    background: 'white', borderRadius: 12,
                                    padding: '12px 14px',
                                    border: '1px solid #e5e7eb',
                                    transition: 'box-shadow 0.2s'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                        <span style={{
                                            fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase',
                                            padding: '2px 8px', borderRadius: 999,
                                            background: session.mode === 'test' ? '#d1fae5' : '#e0e7ff',
                                            color: session.mode === 'test' ? '#059669' : '#4338ca',
                                            letterSpacing: '0.04em'
                                        }}>
                                            {session.mode === 'test' ? 'Test' : 'Quiz'}
                                        </span>
                                        <span style={{ fontSize: '0.7rem', color: '#6b7280', fontFamily: 'monospace' }}>
                                            {session.code}
                                        </span>
                                    </div>
                                    <p style={{ fontWeight: 600, fontSize: '0.875rem', color: '#111827', margin: '0 0 2px' }}>
                                        {session.testTitle || session.quizTitle || 'Live Session'}
                                    </p>
                                    <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0 0 10px' }}>
                                        {session.className}
                                        {session.status === 'in-progress' ? ' · In Progress' : ' · Waiting'}
                                    </p>
                                    <button
                                        style={{
                                            width: '100%', padding: '7px 0',
                                            borderRadius: 999, border: 'none',
                                            background: '#ef4444', color: 'white',
                                            fontWeight: 700, fontSize: '0.8rem',
                                            cursor: 'pointer',
                                            transition: 'background 0.15s'
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.background = '#dc2626'}
                                        onMouseLeave={e => e.currentTarget.style.background = '#ef4444'}
                                        onClick={() => {
                                            if (user) {
                                                sessionService.setPlayerData(user.uid, user.displayName || user.email || 'Student', session.code);
                                            }
                                            navigateTo(
                                                'STUDENT_WAITING',
                                                { gameSessionId: session.code },
                                                { reason: 'dashboard_live_session_join' },
                                            );
                                        }}
                                    >
                                        Join Now →
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div style={S.widget}>
                    <h3 style={S.widgetTitle}>Up Next</h3>
                    {sortedAssignments.length === 0 ? (
                        <p style={{ textAlign: 'center', color: '#6b7280', padding: '8px 0', fontSize: '0.875rem' }}>No upcoming deadlines 🎉</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {sortedAssignments.slice(0, 5).map(item => {
                                const assignment = item.homework;
                                const isOverdue = item.status === 'overdue';
                                const dueStr = assignment.scheduling?.dueDate ? new Date(assignment.scheduling.dueDate).toLocaleDateString() : '';
                                const classNameStr = assignment.target?.className ? ` • ${assignment.target.className}` : '';
                                return (
                                    <div key={assignment.id} style={{ borderLeft: assignment.materialType === 'thcs-test' ? '3px solid #7c3aed' : 'none', paddingLeft: assignment.materialType === 'thcs-test' ? 8 : 0 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 4 }}>
                                            <p style={{ ...localStyles.widgetItemTitle, margin: 0 }}>{assignment.title || assignment.materialTitle || 'Untitled'}</p>
                                            {isOverdue && <Badge color="red" size="sm" variant="light">Overdue</Badge>}
                                        </div>
                                        <p style={isOverdue ? localStyles.widgetItemSubRed : localStyles.widgetItemSub}>
                                            {isOverdue ? `Overdue ${classNameStr}` : `${dueStr} ${classNameStr}`}
                                        </p>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    {sortedAssignments.length > 5 && (
                        <button style={localStyles.showMoreLink} onClick={() => navigate('/student/homework')}>Show more</button>
                    )}
                </div>

                {enrolledClasses.length > 0 && (
                    <div style={S.widget}>
                        <h3 style={S.widgetTitle}>Your Classes</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {enrolledClasses.slice(0, 4).map((cls, idx) => {
                                const c = CLASS_COLORS[idx % CLASS_COLORS.length];
                                return (
                                    <div key={cls.id} style={localStyles.classRow}>
                                        <div style={{ ...localStyles.classIcon, background: c.bg, color: c.color }}>{cls.classCode?.slice(0, 2) || '??'}</div>
                                        <div style={{ flex: 1 }}>
                                            <p style={localStyles.widgetItemTitle}>{cls.classCode || cls.name}</p>
                                            <p style={localStyles.widgetItemSub}>{cls.teacherName || cls.name || ''}</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {publicSessions.length > 0 && (
                    <div style={S.widget}>
                        <h3 style={S.widgetTitle}>Live Now 🔥</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {[...publicSessions].sort((a, b) => b.playerCount - a.playerCount || a.createdAt - b.createdAt).slice(0, 5).map(session => (
                                <div key={session.sessionCode} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <p style={localStyles.widgetItemTitle}>{session.testTitle}</p>
                                        <p style={localStyles.widgetItemSub}>{session.playerCount} playing</p>
                                    </div>
                                    <button style={{ background: '#111827', color: 'white', padding: '4px 12px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 600, border: 'none', cursor: 'pointer' }} onClick={() => navigateTo('STUDENT_WAITING', { gameSessionId: session.sessionCode })}>Join</button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                {/* ── Pending Writing Reviews ────────────────── */}
                <PendingReviewsWidget />
            </div>
        );
    };

    const renderJoinModal = () => {
        if (!showJoinModal) return null;
        return (
            <>
                <div style={S.backdrop} onClick={() => setShowJoinModal(false)} />
                <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'white', borderRadius: 16, padding: 24, width: 400, maxWidth: '90vw', zIndex: 1001, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 16px', color: '#111827' }}>Join a Class</h2>
                    <form onSubmit={handleJoinClass}>
                        <input value={classCode} onChange={e => setClassCode(e.target.value)} placeholder="Enter class code..." disabled={isEnrolling} style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid #d1d5db', fontSize: '1rem', outline: 'none', textTransform: 'uppercase', boxSizing: 'border-box', transition: 'border-color 0.2s' }} />
                        {joinSuccessMessage && <p style={{ color: '#059669', fontSize: '0.875rem', marginTop: 8, fontWeight: 500 }}>{joinSuccessMessage}</p>}
                        {enrollError && <p style={{ color: '#dc2626', fontSize: '0.875rem', marginTop: 8, fontWeight: 500 }}>{enrollError}</p>}
                        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                            <button type="button" onClick={() => setShowJoinModal(false)} style={{ flex: 1, padding: '10px 16px', borderRadius: 999, border: '1px solid #d1d5db', background: 'white', color: '#374151', fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem' }}>Cancel</button>
                            <button type="submit" disabled={isEnrolling || !classCode.trim()} style={{ flex: 1, padding: '10px 16px', borderRadius: 999, border: 'none', background: classCode.trim() ? '#4f46e5' : '#a5b4fc', color: 'white', fontWeight: 700, cursor: classCode.trim() ? 'pointer' : 'default', fontSize: '0.875rem' }}>{isEnrolling ? 'Joining...' : 'Join Class'}</button>
                        </div>
                    </form>
                </div>
            </>
        );
    };

    const mobileTitle = activeView === 'feed' ? 'For You' : activeView === 'classes' ? 'My Classes' : 'Dashboard';

    return (
        <>
            <StudentLayout
                mobileTitle={mobileTitle}
                shellData={shellData}
                sidebar={
                    <StudentSidebar
                        user={user ? { ...user, avatarUrl: profile?.avatarUrl } : undefined}
                        activePage={activeView}
                        pendingHomeworkCount={notStarted.length}
                        onViewSwitch={handleSidebarClick}
                        onJoinClass={() => setShowJoinModal(true)}
                    />
                }
                rightPanel={renderRightPanel()}
            >
                <div style={S.feedHeader}>
                    <h2 style={S.feedHeaderTitle}>{mobileTitle}</h2>
                </div>

                {activeView === 'feed' && (
                    <div style={S.filterBar}>
                        {FILTER_TABS.map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setFeedFilter(tab.key)}
                                style={{ ...S.filterTab, ...(feedFilter === tab.key ? S.filterTabActive : {}) }}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                )}

                <div style={{ animation: 'dashFadeIn 200ms ease-out forwards' }}>
                    {renderCenterContent()}
                </div>

                {isLoading && activeView !== 'feed' && (
                    <div style={{ textAlign: 'center', padding: 48 }}><Loader /></div>
                )}
            </StudentLayout>
            {renderJoinModal()}
            {selectedResultId && (
                <ResultSlidePanel
                    resultId={selectedResultId}
                    onClose={() => setSelectedResultId(null)}
                />
            )}
        </>
    );
};

export default StudentDashboardPage;
