import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { enrollStudent } from '../services/classManager';
import { getAvailablePublicSessions } from '../services/resultsService';
import { getPaginatedUserNotifications, markNotificationAsRead, subscribeToNewNotifications } from '../services/notificationService';
import { sessionService } from '../services/sessionService';
import { useNavigation } from '../hooks/useNavigation';
import { useResolvedStudentShellData } from '../context/StudentShellDataContext';
import { StudentLayout } from '../components/layout/StudentLayout';
import { StudentSidebar } from '../components/layout/StudentSidebar';
import { S, studentTokens } from '../components/layout/studentLayoutStyles';
import { IconCheck, IconBriefcase } from '../components/layout/StudentIcons';
import { useFeatureTracking } from '../hooks/useFeatureTracking';
import { FEATURE_IDS } from '../config/featureRegistry';
import { DeferredResultSlidePanel } from '../components/results/DeferredResultSlidePanel';
import { cleanupExpiredProgress } from '../hooks/solo/useSoloAutoSave';
import { PendingReviewsWidget } from '../components/dashboard/PendingReviewsWidget';

const localStyles = {
    contentStack: { display: 'flex', flexDirection: 'column', gap: 0, padding: '12px 0 0' },
    summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 0, paddingBottom: 12, marginBottom: 20 },
    summaryCard: { background: 'transparent', borderRadius: 0, padding: '0 24px 0 0', display: 'flex', flexDirection: 'column', gap: 4, minHeight: 0 },
    summaryLabel: { margin: 0, fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: studentTokens.textMuted },
    summaryValue: { margin: 0, fontSize: '2.75rem', fontWeight: 300, color: studentTokens.textPrimary, lineHeight: 1 },
    summaryMeta: { margin: 0, fontSize: '0.75rem', color: studentTokens.textBody, lineHeight: 1.4 },
    feedIntro: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 18 },
    feedIntroTitle: { margin: 0, fontSize: '0.875rem', fontWeight: 700, color: studentTokens.textPrimary, letterSpacing: '0.02em' },
    feedIntroBody: { margin: '4px 0 0', fontSize: '0.75rem', color: studentTokens.textMuted, lineHeight: 1.45 },
    feedTabBar: { display: 'flex', gap: 28, overflowX: 'auto', padding: '0 0 16px', marginBottom: 18, borderBottom: `1px solid ${studentTokens.borderWhisper}` },
    feedTab: { padding: '0 0 12px', fontWeight: 600, fontSize: '0.7rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: studentTokens.textMuted, cursor: 'pointer', border: 'none', background: 'transparent', borderBottom: '2px solid transparent', whiteSpace: 'nowrap' },
    feedTabActive: { color: studentTokens.accent, borderBottom: `2px solid ${studentTokens.accent}` },
    feedList: { display: 'flex', flexDirection: 'column', gap: 0 },
    feedCard: { display: 'flex', gap: 24, cursor: 'pointer' },
    timelineRail: { width: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, paddingTop: 2 },
    timelineNode: { width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1rem', flexShrink: 0 },
    timelineStem: { width: 1, flex: 1, minHeight: 48, background: studentTokens.borderWhisper, marginTop: 16 },
    feedBody: { flex: 1, minWidth: 0, paddingBottom: 32, borderBottom: `1px solid ${studentTokens.borderWhisper}` },
    feedMetaRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 8 },
    feedMetaLabel: { fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: studentTokens.textMuted, lineHeight: 1.5 },
    feedMetaTime: { fontSize: '0.625rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: studentTokens.textDim, whiteSpace: 'nowrap' },
    feedTitle: { margin: '0 0 12px', fontSize: '1.35rem', fontWeight: 500, color: studentTokens.textPrimary, lineHeight: 1.2 },
    scoreRow: { display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' },
    scoreValue: { fontSize: '2.1rem', fontWeight: 300, color: studentTokens.accent, lineHeight: 1 },
    scoreDivider: { width: 1, height: 28, background: studentTokens.borderWhisper },
    scoreInsight: { margin: 0, fontSize: '0.875rem', color: studentTokens.textBody, lineHeight: 1.6, maxWidth: 440 },
    quotePanel: { background: studentTokens.bgSurfaceAlt, padding: '16px 18px', borderRadius: 6, border: `1px solid ${studentTokens.borderWhisper}` },
    quoteText: { margin: 0, fontSize: '0.9375rem', color: studentTokens.textPrimary, lineHeight: 1.6, fontStyle: 'italic' },
    tagRow: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 },
    tag: { padding: '3px 8px', borderRadius: 999, fontSize: '0.5625rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', background: studentTokens.bgShell, color: studentTokens.textBody },
    inlineAction: { display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 14, fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: studentTokens.accent },
    pill: { padding: '3px 9px', borderRadius: studentTokens.radiusSoft, fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' },
    nestedCardLabel: { margin: 0, fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: studentTokens.textMuted },
    nestedCardValue: { margin: '4px 0 0', fontSize: '1.125rem', fontWeight: 700, lineHeight: 1.2 },
    nestedCardTitle: { fontWeight: 700, fontSize: '0.9375rem', margin: '0 0 4px', color: studentTokens.textPrimary },
    nestedCardMeta: { fontSize: '0.75rem', color: studentTokens.textBody, margin: 0 },
    detailRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingTop: 12, marginTop: 2, borderTop: `1px solid ${studentTokens.borderWhisper}` },
    detailStack: { minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 },
    detailTitle: { margin: 0, fontSize: '0.875rem', fontWeight: 700, color: studentTokens.textPrimary },
    detailMeta: { margin: 0, fontSize: '0.75rem', color: studentTokens.textBody, lineHeight: 1.35 },
    actionButtonDark: { background: studentTokens.accent, color: '#faf6ff', padding: '9px 14px', borderRadius: studentTokens.radiusSoft, fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', border: 'none', cursor: 'pointer', flexShrink: 0 },
    actionButtonLight: { background: studentTokens.bgSurfaceAlt, color: '#4c5458', border: `1px solid ${studentTokens.outlineSoft}`, padding: '9px 14px', borderRadius: studentTokens.radiusSoft, fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', boxShadow: '0 1px 2px rgba(43, 52, 55, 0.04)', flexShrink: 0 },
    emptyState: { padding: '56px 24px', textAlign: 'center', background: studentTokens.bgSurface, borderRadius: 0 },
    classesGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 },
    classCard: { background: studentTokens.bgSurface, border: `1px solid ${studentTokens.borderWhisper}`, borderRadius: 0, padding: 20, cursor: 'pointer', transition: 'background 0.2s ease' },
    rightWidgetCard: { background: studentTokens.bgSurface, borderRadius: 16, padding: 16, border: `1px solid ${studentTokens.borderWhisper}`, display: 'flex', flexDirection: 'column', gap: 12 },
    rightMetricRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
    rightMetricLabel: { fontSize: '0.875rem', color: studentTokens.textBody, fontWeight: 600 },
    rightMetricValue: { fontSize: '1rem', color: studentTokens.textPrimary, fontWeight: 700 },
    rightCallout: { background: studentTokens.bgShell, borderRadius: 14, border: `1px solid ${studentTokens.borderWhisper}`, padding: 12, display: 'flex', flexDirection: 'column', gap: 6 },
    rightCalloutLabel: { fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: studentTokens.textMuted },
    rightCalloutTitle: { fontSize: '0.875rem', fontWeight: 700, color: studentTokens.textPrimary, margin: 0 },
    rightCalloutMeta: { fontSize: '0.75rem', color: studentTokens.textBody, margin: 0 },
    publicSessionCard: { background: studentTokens.bgShell, borderRadius: 0, border: `1px solid ${studentTokens.borderWhisper}`, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
    article: { background: studentTokens.bgSurface, padding: '18px 20px', borderBottom: `1px solid ${studentTokens.borderWhisper}`, cursor: 'pointer', transition: 'background 0.15s ease, border-color 0.15s ease' },
    articleRow: { display: 'flex', gap: 12 },
    avatar: { width: 48, height: 48, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1.25rem', flexShrink: 0 },
    articleMeta: { display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 },
    articleTitle: { fontSize: '0.95rem', fontWeight: 700, color: studentTokens.textPrimary, margin: 0 },
    articleTime: { fontSize: '0.875rem', color: studentTokens.textMuted },
    articleBody: { fontSize: '15px', color: studentTokens.textPrimary, margin: 0, lineHeight: 1.5 },
    nestedCard: { marginTop: 0, background: 'transparent', borderRadius: 0, padding: 0, border: 'none' },
    nestedCardGreen: { marginTop: 0, background: 'transparent', borderRadius: 0, padding: 0, border: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    widgetItemTitle: { fontWeight: 600, fontSize: '0.875rem', color: studentTokens.textPrimary, margin: '0 0 2px' },
    widgetItemSub: { fontSize: '0.75rem', color: studentTokens.textBody, margin: 0 },
    widgetItemSubRed: { fontSize: '0.75rem', color: '#9e3f4e', margin: 0, fontWeight: 500 },
    showMoreLink: { color: studentTokens.accent, fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', background: 'none', border: 'none', padding: 0, cursor: 'pointer', marginTop: 8 },
    classRow: { display: 'flex', alignItems: 'center', gap: 12 },
    classIcon: { width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1rem', flexShrink: 0 },
    loaderWrap: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: '50%', border: '3px solid #e2dfff', borderTopColor: studentTokens.accent, animation: 'studentSpinner 0.8s linear infinite' },
};

function InlineLoader({ size = 32 }) {
    return (
        <div
            aria-hidden="true"
            style={{
                ...localStyles.loaderWrap,
                width: size,
                height: size,
            }}
        />
    );
}

function InlineBadge({ children, tone = 'neutral' }) {
    const palette = {
        neutral: { background: studentTokens.bgSurfaceAlt, color: studentTokens.textBody },
        alert: { background: '#fff2f2', color: '#9e3f4e' },
        accent: { background: studentTokens.accentSoft, color: studentTokens.accentHover },
    }[tone];

    return (
        <span
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '4px 8px',
                borderRadius: 999,
                fontSize: '0.6875rem',
                fontWeight: 700,
                letterSpacing: '0.04em',
                background: palette.background,
                color: palette.color,
                textTransform: 'uppercase',
            }}
        >
            {children}
        </span>
    );
}

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

function renderMessageContent(message = '') {
    return message
        .split(/(\*\*.*?\*\*)/g)
        .filter(Boolean)
        .map((segment, index) => {
            if (segment.startsWith('**') && segment.endsWith('**')) {
                return <strong key={index}>{segment.slice(2, -2)}</strong>;
            }

            return <React.Fragment key={index}>{segment}</React.Fragment>;
        });
}

// ─── Feed item type → avatar config ──────────────────────────────────────────
function getFeedAvatar(notif) {
    const type = notif.type;
    const title = notif.title || '';
    if (title.includes('Test Complete') || title.includes('auto-graded') || (type === 'success' && notif.metadata?.resultId)) {
        return { bg: '#edf5f9', color: '#4c5458', icon: <IconCheck /> };
    }
    if (title.includes('Joined Class') || notif.metadata?.className) {
        return { bg: studentTokens.accentSoft, color: studentTokens.accentHover, icon: <IconBriefcase /> };
    }
    if (title.includes('Homework') || notif.metadata?.homeworkId) {
        if (notif.metadata?.materialType === 'thcs-test') {
            return { bg: studentTokens.accentSoft, color: studentTokens.accentHover, char: 'T' };
        }
        return { bg: '#f7efe4', color: '#9a5c2d', char: 'T' };
    }
    if (notif.metadata?.testName || notif.metadata?.resultId) {
        return { bg: '#edf5f9', color: '#4c5458', icon: <IconCheck /> };
    }
    return { bg: studentTokens.bgSurfaceAlt, color: studentTokens.textBody, char: (title[0] || 'N').toUpperCase() };
}

function getFeedSurfaceTone(notif) {
    if (notif.metadata?.homeworkId) {
        return {
            label: 'Homework',
            borderTopColor: '#cdb18d',
            pillStyle: { background: '#f7efe4', color: '#9a5c2d' },
        };
    }

    if (notif.metadata?.className || notif.title?.includes('Joined Class')) {
        return {
            label: 'Class',
            borderTopColor: '#c6c2ff',
            pillStyle: { background: studentTokens.accentSoft, color: studentTokens.accentHover },
        };
    }

    if (notif.metadata?.resultId || notif.metadata?.testName || notif.metadata?.sessionCode) {
        return {
            label: 'Test',
            borderTopColor: '#b6c5ca',
            pillStyle: { background: '#edf5f9', color: '#4c5458' },
        };
    }

    return {
        label: 'Update',
        borderTopColor: studentTokens.outlineSoft,
        pillStyle: { background: studentTokens.bgSurfaceAlt, color: studentTokens.textBody },
    };
}

function getFeedActionLabel(notif) {
    if (notif.metadata?.resultId) return 'View Details';
    if (notif.metadata?.sessionCode) return 'Join Session';
    if (notif.metadata?.testName) return 'Start Now';
    if (notif.link) return 'Open';
    return null;
}

function getFeedEyebrow(notif) {
    if (notif.metadata?.resultId) {
        return `Test Results • ${notif.metadata?.className || notif.metadata?.courseName || 'Academic Record'}`;
    }
    if (notif.metadata?.homeworkId) {
        const dueDate = notif.metadata?.dueDate
            ? new Date(notif.metadata.dueDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }).toUpperCase()
            : 'Upcoming';
        return `Assignment Due • ${dueDate}`;
    }
    if (notif.metadata?.className || notif.title?.includes('Joined Class')) {
        return `Class Update • ${notif.metadata?.className || 'Student Workspace'}`;
    }

    return `Academic Update • ${notif.metadata?.courseName || 'Student Workspace'}`;
}

function getPlainMessage(message = '') {
    return message.replace(/\*\*(.*?)\*\*/g, '$1').trim();
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
    { bg: studentTokens.accentSoft, color: studentTokens.accentHover },
    { bg: '#edf5f9', color: '#4c5458' },
    { bg: '#f7efe4', color: '#9a5c2d' },
    { bg: '#dce4e8', color: '#586064' },
    { bg: '#eaeff1', color: '#2b3437' },
];

const StudentDashboardPage = () => {
    const { user, profile } = useAuth();
    const navigate = useNavigate();
    const { navigateTo } = useNavigation('student');
    const { trackAction } = useFeatureTracking(FEATURE_IDS.studentDashboard);

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
        trackAction('loadMoreFeed', { currentCount: allNotifications.length, filter: feedFilter });
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
        trackAction('submitJoinClass', { outcome: 'attempt', source: 'modal' });
        setIsEnrolling(true);
        setEnrollError('');
        setJoinSuccessMessage('');
        try {
            const normalizedCode = classCode.trim().toUpperCase();
            const result = await enrollStudent(normalizedCode, user.uid, user.displayName || 'Student', user.email);
            if (result.success) {
                trackAction('submitJoinClass', { outcome: 'success', code: normalizedCode });
                setJoinSuccessMessage(`Successfully joined ${classCode.trim().toUpperCase()}.`);
                setClassCode('');
                await refreshClasses();
                setTimeout(() => { setJoinSuccessMessage(''); closeJoinModal('auto_success'); }, 3000);
            } else {
                trackAction('submitJoinClass', { outcome: 'failure', code: normalizedCode });
                setEnrollError(result.error || 'Failed to join class');
            }
        } catch (error) {
            console.error('Error joining class:', error);
            trackAction('submitJoinClass', { outcome: 'error' });
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

    const feedSummaryCards = useMemo(() => ([
        {
            label: 'Activity',
            value: allNotifications.length,
            meta: `${filteredNotifications.length} in current view`,
            color: studentTokens.textPrimary,
        },
        {
            label: 'Homework Due',
            value: sortedAssignments.length,
            meta: notStarted.length > 0 ? `${notStarted.length} not started` : 'No pending start',
            color: '#9a6427',
        },
        {
            label: 'Live Now',
            value: classLiveSessions.length + publicSessions.length,
            meta: classLiveSessions.length > 0 ? `${classLiveSessions.length} class sessions` : 'No active class sessions',
            color: studentTokens.accent,
        },
    ]), [
        allNotifications.length,
        filteredNotifications.length,
        sortedAssignments.length,
        notStarted.length,
        classLiveSessions.length,
        publicSessions.length,
    ]);

    const openJoinModal = (source) => {
        trackAction('openJoinClassModal', { source });
        setShowJoinModal(true);
    };

    const closeJoinModal = (source) => {
        trackAction('closeJoinClassModal', { source });
        setShowJoinModal(false);
    };

    const handleJoinPublicSession = (sessionCode) => {
        trackAction('joinPublicSession', { sessionCode });
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
        trackAction('switchDashboardView', { view });
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
            trackAction('openSessionNotification', { sessionCode });
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
            trackAction('openFeedResult', { resultId: notif.metadata.resultId });
            setSelectedResultId(notif.metadata.resultId);
            return;
        }

        // ── Generic Link (homework, class join, etc.) ──────────────────────────
        if (notif.link) {
            trackAction('openFeedLink', { link: notif.link, category: getFeedSurfaceTone(notif).label.toLowerCase() });
            navigate(notif.link);
        }
    };



    const renderFeedItem = (notif) => {
        const avatar = getFeedAvatar(notif);
        const hasScore = notif.metadata?.score !== undefined && notif.metadata?.maxScore !== undefined;
        const hasTaskDetails = notif.metadata?.testName && !hasScore;
        const actionLabel = getFeedActionLabel(notif);
        const plainMessage = getPlainMessage(notif.message);
        const eyebrow = getFeedEyebrow(notif);
        const scoreLabel = typeof notif.metadata?.score === 'number'
            ? `${Number.isInteger(notif.metadata.score) ? notif.metadata.score : notif.metadata.score.toFixed(1)}${typeof notif.metadata?.maxScore === 'number' && notif.metadata.maxScore === 100 ? '%' : ''}`
            : notif.metadata?.score;
        const dueText = notif.metadata?.dueDate
            ? `Due ${new Date(notif.metadata.dueDate).toLocaleDateString()}`
            : null;

        return (
            <article
                key={notif.id}
                style={localStyles.feedCard}
                onClick={() => handleNotificationClick(notif)}
                onMouseEnter={(e) => {
                    e.currentTarget.style.background = studentTokens.bgSurfaceMuted;
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                }}
            >
                <div style={localStyles.timelineRail}>
                    <div style={{ ...localStyles.timelineNode, background: avatar.bg, color: avatar.color }}>
                        {avatar.icon || avatar.char}
                    </div>
                    <div style={localStyles.timelineStem} />
                </div>

                <div style={localStyles.feedBody}>
                    <div style={localStyles.feedMetaRow}>
                        <span style={localStyles.feedMetaLabel}>{eyebrow}</span>
                        <span style={localStyles.feedMetaTime}>{String(timeAgo(notif.createdAt)).toUpperCase()}</span>
                    </div>
                    <h3 style={localStyles.feedTitle}>{notif.title}</h3>

                    {hasScore ? (
                        <div style={localStyles.scoreRow}>
                            <span style={localStyles.scoreValue}>{scoreLabel}</span>
                            <div style={localStyles.scoreDivider} />
                            <p style={localStyles.scoreInsight}>
                                {plainMessage || 'Your latest score has been recorded in the academic feed.'}
                            </p>
                        </div>
                    ) : hasTaskDetails ? (
                        <div style={localStyles.quotePanel}>
                            <p style={localStyles.quoteText}>{plainMessage || notif.metadata.testName}</p>
                            <div style={localStyles.tagRow}>
                                <span style={localStyles.tag}>Research</span>
                                {dueText ? <span style={localStyles.tag}>{dueText}</span> : null}
                                {notif.metadata?.materialType === 'thcs-test' ? <span style={localStyles.tag}>THCS-THPT</span> : null}
                            </div>
                        </div>
                    ) : (
                        <p style={{ ...localStyles.scoreInsight, maxWidth: 520 }}>
                            {renderMessageContent(notif.message)}
                        </p>
                    )}

                    {actionLabel ? (
                        <div style={localStyles.inlineAction}>
                            <span>{actionLabel}</span>
                        </div>
                    ) : null}
                </div>
            </article>
        );
    };

    const renderCenterContent = () => {
        if (activeView === 'feed' && allNotifications.length === 0 && enrolledClasses.length === 0 && !isLoading) {
            return (
                <div style={{ textAlign: 'center', padding: '60px 24px' }}>
                    <div style={{ width: 56, height: 2, background: studentTokens.accentSoft, margin: '0 auto 24px', borderRadius: 999 }} />
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: studentTokens.textPrimary, margin: '0 0 8px' }}>Your workspace is ready.</h2>
                    <p style={{ color: studentTokens.textBody, fontSize: '1rem', margin: '0 0 32px' }}>Join a class to unlock live sessions, coursework, and result tracking in this academic shell.</p>
                    <button style={{ ...S.joinBtn, maxWidth: 300, margin: '0 auto' }} onClick={() => openJoinModal('empty_state')}>Join a Class</button>
                                {publicSessions.length > 0 && (
                        <div style={{ marginTop: 32, textAlign: 'left', maxWidth: 400, margin: '32px auto 0' }}>
                            <p style={{ textTransform: 'uppercase', fontSize: '0.75rem', color: studentTokens.textMuted, fontWeight: 700, letterSpacing: '0.05em', marginBottom: 12 }}>Public sessions</p>
                            {publicSessions.slice(0, 3).map(s => (
                                <div key={s.sessionCode} style={{ ...localStyles.publicSessionCard, marginBottom: 8 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontWeight: 600, color: studentTokens.textPrimary }}>{s.testTitle}</span>
                                        <button type="button" style={localStyles.actionButtonDark} onClick={() => handleJoinPublicSession(s.sessionCode)}>Join</button>
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
                <div style={localStyles.contentStack}>
                    <div style={localStyles.feedIntro}>
                        <div>
                            <h3 style={localStyles.feedIntroTitle}>Recent activity</h3>
                            <p style={localStyles.feedIntroBody}>A quieter academic timeline of results, assignments, and class notices.</p>
                        </div>
                    </div>
                    <div style={localStyles.summaryGrid}>
                        {feedSummaryCards.map((card, index) => (
                            <div
                                key={card.label}
                                style={{
                                    ...localStyles.summaryCard,
                                    borderRight: index < feedSummaryCards.length - 1 ? `1px solid ${studentTokens.borderWhisper}` : 'none',
                                }}
                            >
                                <p style={localStyles.summaryLabel}>{card.label}</p>
                                <p style={{ ...localStyles.summaryValue, color: card.color }}>{card.value}</p>
                                <p style={localStyles.summaryMeta}>{card.meta}</p>
                            </div>
                        ))}
                    </div>
                    {isLoading && allNotifications.length === 0 ? (
                        <div style={{ ...localStyles.emptyState, padding: '60px 24px' }}>
                            <InlineLoader />
                            <p style={{ color: studentTokens.textBody, margin: '16px 0 0' }}>Loading your feed...</p>
                        </div>
                    ) : filteredNotifications.length === 0 ? (
                        <div style={localStyles.emptyState}>
                            No {feedFilter === 'all' ? '' : feedFilter} activity yet.
                        </div>
                    ) : (
                        <div style={localStyles.feedList}>
                            {filteredNotifications.map(renderFeedItem)}
                        </div>
                    )}
                    {hasMoreNotifs && (
                        <div style={{ padding: 16, textAlign: 'center' }}>
                            <button style={{ ...localStyles.actionButtonLight, padding: '10px 24px' }} onClick={handleLoadMore} disabled={isLoadingMore}>
                                {isLoadingMore ? 'Loading...' : 'Load More'}
                            </button>
                        </div>
                    )}
                </div>
            );
        }

        if (activeView === 'classes') {
            return (
                <div style={localStyles.contentStack}>
                    {isLoading ? <div style={{ ...localStyles.emptyState, padding: '60px 24px' }}><InlineLoader size={24} /><p style={{ color: studentTokens.textBody, margin: '16px 0 0' }}>Loading your classes...</p></div> :
                        enrolledClasses.length === 0 ? <div style={localStyles.emptyState}><p style={{ color: studentTokens.textBody, textAlign: 'center', margin: 0 }}>No classes yet.</p></div> : (
                            <div style={localStyles.classesGrid}>
                                {enrolledClasses.map((cls, idx) => {
                                    const c = CLASS_COLORS[idx % CLASS_COLORS.length];
                                    return (
                                        <div key={cls.id} style={localStyles.classCard} onClick={() => {
                                            trackAction('openClassCard', { classId: cls.id });
                                            navigateTo('STUDENT_CLASS_DETAIL', { classId: cls.id });
                                        }} onMouseEnter={e => {
                                            e.currentTarget.style.background = studentTokens.bgSurfaceMuted;
                                        }} onMouseLeave={e => {
                                            e.currentTarget.style.background = studentTokens.bgSurface;
                                        }}>
                                            <div style={{ ...localStyles.classIcon, background: c.bg, color: c.color, marginBottom: 12 }}>{cls.classCode?.slice(0, 2) || '??'}</div>
                                            <p style={{ fontWeight: 700, fontSize: '0.875rem', margin: '0 0 4px', color: studentTokens.textPrimary }}>{cls.name || cls.classCode}</p>
                                            <span style={{ ...localStyles.pill, background: c.bg, color: c.color, marginBottom: 8, display: 'inline-flex' }}>Open Class</span>
                                            <p style={{ fontSize: '0.75rem', color: studentTokens.textBody, margin: 0 }}>{cls.studentCount || 0} students</p>
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
                <div style={localStyles.rightWidgetCard}>
                    <h3 style={S.widgetTitle}>Feed Snapshot</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={localStyles.rightMetricRow}>
                            <span style={localStyles.rightMetricLabel}>Current Filter</span>
                            <span style={localStyles.rightMetricValue}>{FILTER_TABS.find(tab => tab.key === feedFilter)?.label || 'All'}</span>
                        </div>
                        <div style={localStyles.rightMetricRow}>
                            <span style={localStyles.rightMetricLabel}>Feed Items</span>
                            <span style={localStyles.rightMetricValue}>{filteredNotifications.length}</span>
                        </div>
                        <div style={localStyles.rightMetricRow}>
                            <span style={{ ...localStyles.rightMetricLabel, color: studentTokens.accent }}>Live Sessions</span>
                            <span style={localStyles.rightMetricValue}>{classLiveSessions.length + publicSessions.length}</span>
                        </div>
                        <div style={{ ...localStyles.rightMetricRow, paddingTop: 8, borderTop: `1px solid ${studentTokens.borderWhisper}` }}>
                            <span style={{ ...localStyles.rightMetricLabel, color: '#9a6427' }}>Homework Open</span>
                            <span style={localStyles.rightMetricValue}>{notStarted.length}</span>
                        </div>
                    </div>

                    <div style={localStyles.rightCallout}>
                        <span style={localStyles.rightCalloutLabel}>Up Next</span>
                        <p style={localStyles.rightCalloutTitle}>
                            {sortedAssignments[0] ? (sortedAssignments[0].homework.title || sortedAssignments[0].homework.materialTitle) : 'Nothing queued'}
                        </p>
                        <p style={localStyles.rightCalloutMeta}>
                            {sortedAssignments[0]
                                ? `Due ${new Date(sortedAssignments[0].homework.scheduling?.dueDate).toLocaleDateString()}`
                                : 'Your next homework deadline will appear here.'}
                        </p>
                        {sortedAssignments.length > 0 && (
                            <button style={localStyles.showMoreLink} onClick={() => {
                                trackAction('openHomeworkList', { source: 'right_panel' });
                                navigate('/student/homework');
                            }}>Open Homework</button>
                        )}
                    </div>
                </div>
                {publicSessions.length > 0 && (
                    <div style={localStyles.rightWidgetCard}>
                        <h3 style={S.widgetTitle}>Public Sessions</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {[...publicSessions]
                                .sort((a, b) => b.playerCount - a.playerCount || a.createdAt - b.createdAt)
                                .slice(0, 5)
                                .map(session => (
                                    <div key={session.sessionCode} style={localStyles.publicSessionCard}>
                                        <div>
                                            <p style={localStyles.widgetItemTitle}>{session.testTitle}</p>
                                            <p style={localStyles.widgetItemSub}>{session.playerCount} playing now</p>
                                        </div>
                                        <button
                                            type="button"
                                            style={localStyles.actionButtonDark}
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
                        <p style={{ textAlign: 'center', color: studentTokens.textMuted, padding: '8px 0', fontSize: '0.875rem' }}>No upcoming deadlines.</p>
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
                                            {isOverdue && <InlineBadge tone="alert">Overdue</InlineBadge>}
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
                <div style={S.backdrop} onClick={() => closeJoinModal('backdrop')} />
                <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: studentTokens.bgSurface, borderRadius: 16, padding: 24, width: 400, maxWidth: '90vw', zIndex: 1001, boxShadow: '0 20px 60px rgba(43, 52, 55, 0.15)', border: `1px solid ${studentTokens.borderWhisper}` }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 16px', color: studentTokens.textPrimary }}>Join a Class</h2>
                    <form onSubmit={handleJoinClass}>
                        <input value={classCode} onChange={e => setClassCode(e.target.value)} placeholder="Enter class code..." disabled={isEnrolling} style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: `1px solid ${studentTokens.outlineSoft}`, fontSize: '1rem', outline: 'none', textTransform: 'uppercase', boxSizing: 'border-box', transition: 'border-color 0.2s', color: studentTokens.textPrimary, background: studentTokens.bgPage }} />
                        {joinSuccessMessage && <p style={{ color: '#4c5458', fontSize: '0.875rem', marginTop: 8, fontWeight: 500 }}>{joinSuccessMessage}</p>}
                        {enrollError && <p style={{ color: '#9e3f4e', fontSize: '0.875rem', marginTop: 8, fontWeight: 500 }}>{enrollError}</p>}
                        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                            <button type="button" onClick={() => closeJoinModal('cancel_button')} style={{ ...localStyles.actionButtonLight, flex: 1, padding: '10px 16px' }}>Cancel</button>
                            <button type="submit" disabled={isEnrolling || !classCode.trim()} style={{ ...localStyles.actionButtonDark, flex: 1, padding: '10px 16px', background: classCode.trim() ? studentTokens.accent : studentTokens.bgSurfaceStrong, color: classCode.trim() ? '#faf6ff' : studentTokens.textDim, cursor: classCode.trim() ? 'pointer' : 'default' }}>{isEnrolling ? 'Joining...' : 'Join Class'}</button>
                        </div>
                    </form>
                </div>
            </>
        );
    };

    const mobileTitle = activeView === 'feed' ? 'Dashboard' : activeView === 'classes' ? 'My Classes' : 'Dashboard';

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
                        onJoinClass={() => openJoinModal('sidebar')}
                    />
                }
                rightPanel={renderRightPanel()}
            >
                <style>{`
                    @keyframes studentSpinner {
                        from { transform: rotate(0deg); }
                        to { transform: rotate(360deg); }
                    }
                `}</style>
                <div style={S.feedHeader}>
                    <div style={S.feedHeaderText}>
                        <h2 style={S.feedHeaderTitle}>{activeView === 'feed' ? 'Dashboard' : mobileTitle}</h2>
                        <p style={S.feedHeaderSubtitle}>
                            {activeView === 'feed'
                                ? 'Review your latest academic activity and upcoming milestones.'
                                : 'Review joined classes with softer grouping that preserves the student shell without boxing it into rigid columns.'}
                        </p>
                    </div>
                </div>

                {activeView === 'feed' && (
                    <div style={localStyles.feedTabBar}>
                        {FILTER_TABS.map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => {
                                    trackAction('filterFeed', { filter: tab.key });
                                    setFeedFilter(tab.key);
                                }}
                                style={{ ...localStyles.feedTab, ...(feedFilter === tab.key ? localStyles.feedTabActive : {}) }}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                )}

                <div style={{ animation: 'dashFadeIn 200ms ease-out forwards' }}>
                    {renderCenterContent()}
                </div>

            </StudentLayout>
            {renderJoinModal()}
            {selectedResultId && (
                <DeferredResultSlidePanel
                    resultId={selectedResultId}
                    onClose={() => {
                        trackAction('closeResultSlidePanel', { source: 'dashboard' });
                        setSelectedResultId(null);
                    }}
                />
            )}
        </>
    );
};

export default StudentDashboardPage;
