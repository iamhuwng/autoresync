import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, get } from 'firebase/database';
import { database } from '../services/firebase';
import { useAuth } from '../hooks/useAuth';
import { enrollStudent } from '../services/classManager';
import { getPaginatedUserNotifications, markNotificationAsRead, subscribeToNewNotifications } from '../services/notificationService';
import { sessionService } from '../services/sessionService';
import { useNavigation } from '../hooks/useNavigation';
import { useResolvedStudentShellData } from '../context/StudentShellDataContext';
import { StudentLayout } from '../components/layout/StudentLayout';
import { StudentSidebar } from '../components/layout/StudentSidebar';
import { S, studentTokens } from '../components/layout/studentLayoutStyles';
import StudentDashboardFeedView from '../components/dashboard/StudentDashboardFeedView';
import PendingReviewsWidget from '../components/dashboard/PendingReviewsWidget';

import { useFeatureTracking } from '../hooks/useFeatureTracking';
import { FEATURE_IDS } from '../config/featureRegistry';
import { DeferredResultSlidePanel } from '../components/results/DeferredResultSlidePanel';
import { cleanupExpiredProgress } from '../hooks/solo/useSoloAutoSave';

const FILTER_TABS = [
    { key: 'all', label: 'All' },
    { key: 'homework', label: 'Homework' },
    { key: 'tests', label: 'Tests' },
    { key: 'classes', label: 'Classes' },
];

const localStyles = {
    actionButtonDark: {
        background: studentTokens.accent,
        color: '#faf6ff',
        padding: '10px 16px',
        borderRadius: studentTokens.radiusSoft,
        fontSize: '0.6875rem',
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        border: 'none',
        cursor: 'pointer',
        flex: 1,
    },
    actionButtonLight: {
        background: studentTokens.bgSurfaceAlt,
        color: '#4c5458',
        border: `1px solid ${studentTokens.outlineSoft}`,
        padding: '10px 16px',
        borderRadius: studentTokens.radiusSoft,
        fontSize: '0.6875rem',
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        cursor: 'pointer',
        boxShadow: '0 1px 2px rgba(43, 52, 55, 0.04)',
        flex: 1,
    },
};

function timeAgo(dateInput) {
    const date = typeof dateInput === 'number' ? new Date(dateInput) : new Date(dateInput);
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
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

function getPlainMessage(message = '') {
    return message.replace(/\*\*(.*?)\*\*/g, '$1').trim();
}

function getFeedKind(notification) {
    if (notification.metadata?.homeworkId) return 'homework';
    if (notification.metadata?.resultId) return 'tests';
    if (notification.title?.includes('Graded') || notification.title?.includes('Band') || notification.metadata?.writingId) return 'tests';
    if (notification.metadata?.sessionCode || notification.metadata?.className || notification.title?.includes('Joined Class')
        || notification.title?.includes('Test Started') || notification.title?.includes('Test Completed')
        || notification.title?.includes('Session Available') || notification.title?.includes('session')) return 'classes';
    return 'updates';
}

function getFeedActionLabel(notification) {
    if (notification.metadata?.sessionCode) return 'Join Session';
    if (notification.link) return 'Open';
    return null;
}

function getFeedEyebrow(notification) {
    if (notification.metadata?.resultId) {
        return `Test Results • ${notification.metadata?.className || notification.metadata?.courseName || 'Academic Record'}`;
    }
    if (notification.title?.includes('Graded') || notification.title?.includes('Band') || notification.metadata?.writingId) {
        return `Test Results • ${notification.metadata?.className || 'Writing Assessment'}`;
    }
    if (notification.metadata?.homeworkId) {
        const dueDate = notification.metadata?.dueDate
            ? new Date(notification.metadata.dueDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }).toUpperCase()
            : 'Upcoming';
        return `Assignment Due • ${dueDate}`;
    }
    if (notification.metadata?.className || notification.title?.includes('Joined Class') || notification.metadata?.sessionCode
        || notification.title?.includes('Test Started') || notification.title?.includes('Test Completed')
        || notification.title?.includes('Session Available')) {
        return `Class Update • ${notification.metadata?.className || 'Student Workspace'}`;
    }
    return `Academic Update • ${notification.metadata?.courseName || 'Student Workspace'}`;
}

function getNotificationSearchText(notification) {
    return [
        notification.title,
        notification.message,
        notification.metadata?.className,
        notification.metadata?.courseName,
        notification.metadata?.testName,
        notification.metadata?.materialTitle,
        notification.metadata?.homeworkTitle,
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
}

function getHomeworkTags(notification) {
    const tags = [];
    if (notification.metadata?.className) tags.push(notification.metadata.className);
    if (notification.metadata?.dueDate) {
        tags.push(`Due ${new Date(notification.metadata.dueDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}`);
    }
    if (notification.metadata?.materialType === 'thcs-test') {
        tags.push('THCS-THPT');
    } else if (notification.metadata?.materialType) {
        tags.push(String(notification.metadata.materialType).replace(/-/g, ' '));
    }
    return tags.slice(0, 3);
}

function formatScoreLabel(notification) {
    if (typeof notification.metadata?.score === 'number') {
        const value = Number.isInteger(notification.metadata.score) ? notification.metadata.score : notification.metadata.score.toFixed(1);
        return notification.metadata?.maxScore === 100 ? `${value}%` : String(value);
    }
    if (notification.metadata?.score) return String(notification.metadata.score);
    const bandMatch = (notification.message || '').match(/Band[:\s]+([\d.]+)/i);
    if (bandMatch) return `Band ${bandMatch[1]}`;
    return null;
}

function formatFeedBody(notification) {
    const plainMessage = getPlainMessage(notification.message);

    if (notification.metadata?.resultId) {
        const resultTarget = notification.metadata?.testName || notification.metadata?.materialTitle || notification.metadata?.courseName || 'your latest result';
        if (typeof notification.metadata?.score === 'number' || notification.metadata?.score) {
            return `Your result for ${resultTarget} is ready. Open the full breakdown and feedback.`;
        }
        return plainMessage || `A fresh result update for ${resultTarget} is ready to review.`;
    }

    if (notification.metadata?.homeworkId) {
        const assignmentTitle = notification.metadata?.homeworkTitle || notification.metadata?.materialTitle || notification.title || 'this assignment';
        const dueDate = notification.metadata?.dueDate
            ? new Date(notification.metadata.dueDate).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })
            : null;
        if (dueDate) {
            return `${assignmentTitle} is due ${dueDate}. Reopen the assignment details and continue your work.`;
        }
        return plainMessage || `Reopen ${assignmentTitle} and continue from the homework page.`;
    }

    if (notification.metadata?.sessionCode) {
        return plainMessage || 'A class session is ready to join from your dashboard.';
    }

    if (notification.metadata?.className || notification.title?.includes('Joined Class')) {
        return plainMessage || `A class update is available in ${notification.metadata?.className || 'your workspace'}.`;
    }

    return plainMessage || notification.metadata?.testName || notification.metadata?.materialTitle || 'A new update is available in your workspace.';
}

function resolveNotificationResultId(notification) {
    if (notification.metadata?.resultId) {
        return notification.metadata.resultId;
    }

    if (notification.metadata?.submissionId) {
        return notification.metadata.submissionId;
    }

    try {
        if (!notification.link) {
            return null;
        }

        const url = new URL(notification.link, 'https://student.local');
        const queryResultId = url.searchParams.get('result');

        if (queryResultId) {
            return queryResultId;
        }

        if (getFeedKind(notification) !== 'tests') {
            return null;
        }

        const routeMatch = url.pathname.match(/^\/result\/([^/]+)$/);
        return routeMatch?.[1] ? decodeURIComponent(routeMatch[1]) : null;
    } catch (_) {
        return null;
    }
}

const StudentDashboardPage = () => {
    const { user, profile } = useAuth();
    const navigate = useNavigate();
    const { navigateTo } = useNavigation('student');
    const { trackAction } = useFeatureTracking(FEATURE_IDS.studentDashboard);
    const { enrolledClasses, classLiveSessions, notStarted, sortedAssignments, refreshClasses, refreshHomeworkData } = useResolvedStudentShellData();

    const [classCode, setClassCode] = useState('');
    const [isEnrolling, setIsEnrolling] = useState(false);
    const [enrollError, setEnrollError] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [feedFilter, setFeedFilter] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [showUnreadOnly, setShowUnreadOnly] = useState(false);
    const [allNotifications, setAllNotifications] = useState([]);
    const [notifCursor, setNotifCursor] = useState(undefined);
    const [hasMoreNotifs, setHasMoreNotifs] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [joinSuccessMessage, setJoinSuccessMessage] = useState('');
    const [showJoinModal, setShowJoinModal] = useState(false);
    const [selectedResultId, setSelectedResultId] = useState(null);

    useEffect(() => {
        const loadDashboard = async () => {
            if (!user?.uid) return;
            setIsLoading(true);

            try {
                const notificationResult = await getPaginatedUserNotifications(user.uid, 20);

                setAllNotifications(notificationResult.notifications || []);
                setHasMoreNotifs(notificationResult.hasMore);
                setNotifCursor(notificationResult.lastKey);
            } catch (error) {
                console.error('Error loading student dashboard:', error);
            } finally {
                setIsLoading(false);
            }
        };

        if (user?.uid) {
            cleanupExpiredProgress();
            loadDashboard();
        }
    }, [user?.uid]);

    useEffect(() => {
        if (!user?.uid) return undefined;

        const unsubscribe = subscribeToNewNotifications(user.uid, Date.now(), newNotification => {
            setAllNotifications(previous => (previous.some(item => item.id === newNotification.id) ? previous : [newNotification, ...previous]));
        });

        return () => unsubscribe();
    }, [user?.uid]);

    const unreadCount = useMemo(
        () => allNotifications.filter(notification => !notification.read).length,
        [allNotifications],
    );

    const filteredNotifications = useMemo(() => {
        let result = allNotifications;

        if (showUnreadOnly) {
            result = result.filter(notification => !notification.read);
        }

        if (feedFilter === 'homework') {
            result = result.filter(notification => notification.metadata?.homeworkId);
        } else if (feedFilter === 'tests') {
            result = result.filter(notification => notification.metadata?.resultId);
        } else if (feedFilter === 'classes') {
            result = result.filter(notification => getFeedKind(notification) === 'classes');
        }

        const normalizedSearch = searchQuery.trim().toLowerCase();
        if (normalizedSearch) {
            result = result.filter(notification => getNotificationSearchText(notification).includes(normalizedSearch));
        }

        return result;
    }, [allNotifications, feedFilter, searchQuery, showUnreadOnly]);

    const shellData = useMemo(
        () => ({ classLiveSessions, enrolledClasses, sortedAssignments }),
        [classLiveSessions, enrolledClasses, sortedAssignments],
    );

    const openJoinModal = source => {
        trackAction('openJoinClassModal', { source });
        setShowJoinModal(true);
    };

    const closeJoinModal = source => {
        trackAction('closeJoinClassModal', { source });
        setShowJoinModal(false);
    };

    const handleLoadMore = async () => {
        if (!user?.uid || !hasMoreNotifs) return;
        trackAction('loadMoreFeed', { currentCount: allNotifications.length, filter: feedFilter });
        setIsLoadingMore(true);
        try {
            const result = await getPaginatedUserNotifications(user.uid, 20, notifCursor);
            setAllNotifications(previous => [...previous, ...result.notifications]);
            setHasMoreNotifs(result.hasMore);
            setNotifCursor(result.lastKey);
        } catch (error) {
            console.error('Error loading more notifications:', error);
        } finally {
            setIsLoadingMore(false);
        }
    };

    const handleJoinClass = async event => {
        event.preventDefault();
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
            if (!result.success) {
                trackAction('submitJoinClass', { outcome: 'failure', code: normalizedCode });
                setEnrollError(result.error || 'Failed to join class');
                return;
            }

            trackAction('submitJoinClass', { outcome: 'success', code: normalizedCode });
            setJoinSuccessMessage(`Successfully joined ${normalizedCode}.`);
            setClassCode('');
            await refreshClasses();
            await refreshHomeworkData();
            setTimeout(() => {
                setJoinSuccessMessage('');
                closeJoinModal('auto_success');
            }, 3000);
        } catch (error) {
            console.error('Error joining class:', error);
            trackAction('submitJoinClass', { outcome: 'error' });
            setEnrollError('An error occurred. Please try again.');
        } finally {
            setIsEnrolling(false);
        }
    };

    const [sessionUnavailableMsg, setSessionUnavailableMsg] = useState(null);

    const handleNotificationClick = async (notification) => {
        try {
            if (user?.uid) {
                markNotificationAsRead(user.uid, notification.id);
            }
        } catch (_) {
            // non-blocking
        }

        const { sessionCode } = notification.metadata || {};
        if (sessionCode) {
            trackAction('openSessionNotification', { sessionCode });

            // ── Pre-navigation session validation ──
            // Check if session still exists and is active before navigating
            try {
                const sessionSnapshot = await get(ref(database, `game_sessions/${sessionCode}`));
                if (!sessionSnapshot.exists()) {
                    trackAction('sessionNotificationBlocked', { sessionCode, reason: 'deleted' });
                    setSessionUnavailableMsg('This session has been deleted and is no longer available.');
                    setTimeout(() => setSessionUnavailableMsg(null), 5000);
                    return;
                }
                const sessionData = sessionSnapshot.val();
                const activeStatuses = ['waiting', 'in-progress'];
                if (sessionData.status && !activeStatuses.includes(sessionData.status)) {
                    trackAction('sessionNotificationBlocked', { sessionCode, reason: 'ended', status: sessionData.status });
                    setSessionUnavailableMsg('This session has ended and is no longer accepting students.');
                    setTimeout(() => setSessionUnavailableMsg(null), 5000);
                    return;
                }
            } catch (checkError) {
                console.warn('⚠️ Session pre-check failed, allowing navigation as fallback:', checkError);
                // On network error, allow navigation — the WaitingRoom page has its own guards
            }

            sessionService.setPlayerData(user.uid, user.displayName || user.email || 'Student', sessionCode);
            navigateTo('STUDENT_WAITING', { gameSessionId: sessionCode }, { reason: 'dashboard_session_notification' });
            return;
        }

        const resultId = resolveNotificationResultId(notification);
        if (resultId) {
            trackAction('openFeedResult', { resultId });
            setSelectedResultId(resultId);
            return;
        }

        if (notification.link) {
            trackAction('openFeedLink', { link: notification.link, category: getFeedKind(notification) });
            navigate(notification.link);
        }
    };

    const handleSearchBlur = () => {
        if (!searchQuery.trim()) return;
        trackAction('searchFeed', { queryLength: searchQuery.trim().length, filter: feedFilter, results: filteredNotifications.length });
    };

    const handleToggleUnreadOnly = () => {
        const nextValue = !showUnreadOnly;
        trackAction('toggleUnreadFeed', { unreadOnly: nextValue });
        setShowUnreadOnly(nextValue);
    };

    const handleOpenAcademicHistory = () => {
        trackAction('openAcademicHistory', { source: 'dashboard_topbar' });
        navigate('/student/academic-record');
    };

    const feedRows = useMemo(
        () =>
            filteredNotifications.map(notification => {
                const kind = getFeedKind(notification);
                return {
                    id: notification.id,
                    kind,
                    eyebrow: getFeedEyebrow(notification),
                    timeLabel: timeAgo(notification.createdAt),
                    title: notification.title,
                    body: formatFeedBody(notification),
                    scoreLabel: formatScoreLabel(notification),
                    tags: kind === 'homework' ? getHomeworkTags(notification) : undefined,
                    actionLabel: kind === 'classes' ? getFeedActionLabel(notification) : undefined,
                    onPress: () => handleNotificationClick(notification),
                    onAction: kind === 'classes' ? () => handleNotificationClick(notification) : undefined,
                };
            }),
        [filteredNotifications],
    );

    const feedSummaryCards = useMemo(
        () => [
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
                value: classLiveSessions.length,
                meta: classLiveSessions.length > 0 ? `${classLiveSessions.length} class sessions active` : 'No active class sessions',
                color: studentTokens.accent,
            },
        ],
        [allNotifications.length, filteredNotifications.length, sortedAssignments.length, notStarted.length, classLiveSessions.length],
    );

    const rightPanel = useMemo(() => <PendingReviewsWidget onResultSelect={setSelectedResultId} />, []);

    const emptyState = useMemo(() => {
        if (isLoading && allNotifications.length === 0) {
            return {
                title: 'Loading your dashboard',
                body: 'Fetching your latest academic activity and upcoming milestones.',
                actionLabel: 'Join a Class',
            };
        }

        if (allNotifications.length === 0 && enrolledClasses.length === 0) {
            return {
                title: 'Your workspace is ready.',
                body: 'Join a class to unlock live sessions, coursework, and result tracking in this academic shell.',
                actionLabel: 'Join a Class',
            };
        }

        return {
            title: 'No activity matches this view.',
            body: searchQuery.trim() || showUnreadOnly ? 'Try clearing search or unread filtering to restore the full academic timeline.' : 'This filter does not have matching activity yet.',
            actionLabel: 'Join a Class',
        };
    }, [allNotifications.length, enrolledClasses.length, isLoading, searchQuery, showUnreadOnly]);

    return (
        <>
            <StudentLayout
                mobileTitle="Feed"
                shellData={shellData}
                rightRailVariant="dashboard"
                rightPanel={rightPanel}
                sidebar={
                    <StudentSidebar
                        user={user ? { ...user, avatarUrl: profile?.avatarUrl } : undefined}
                        activePage="feed"
                        pendingHomeworkCount={notStarted.length}
                        onJoinClass={() => openJoinModal('sidebar')}
                    />
                }
            >
                <StudentDashboardFeedView
                    mode="feed"
                    title="Dashboard"
                    subtitle="Review your latest academic activity and upcoming milestones."
                    searchValue={searchQuery}
                    onSearchChange={setSearchQuery}
                    onSearchBlur={handleSearchBlur}
                    unreadCount={unreadCount}
                    showUnreadOnly={showUnreadOnly}
                    onToggleUnreadOnly={handleToggleUnreadOnly}
                    onOpenAcademicHistory={handleOpenAcademicHistory}
                    summaryCards={feedSummaryCards}
                    filterTabs={FILTER_TABS}
                    activeFilter={feedFilter}
                    onFilterChange={nextFilter => {
                        trackAction('filterFeed', { filter: nextFilter });
                        setFeedFilter(nextFilter);
                    }}
                    feedRows={feedRows}
                    loading={isLoading}
                    emptyTitle={emptyState.title}
                    emptyBody={emptyState.body}
                    emptyActionLabel={emptyState.actionLabel}
                    onEmptyAction={() => openJoinModal('feed_empty_state')}
                    hasMore={hasMoreNotifs}
                    loadingMore={isLoadingMore}
                    onLoadMore={handleLoadMore}
                />
            </StudentLayout>

            {/* Session unavailable toast — shown when notification points to ended/deleted session */}
            {sessionUnavailableMsg && (
                <div
                    role="alert"
                    style={{
                        position: 'fixed',
                        bottom: 24,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: '#2b3437',
                        color: '#faf6ff',
                        padding: '12px 24px',
                        borderRadius: 12,
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        zIndex: 2000,
                        boxShadow: '0 8px 32px rgba(43, 52, 55, 0.25)',
                        maxWidth: '90vw',
                        textAlign: 'center',
                        animation: 'fadeInUp 0.3s ease',
                    }}
                >
                    {sessionUnavailableMsg}
                </div>
            )}

            {showJoinModal ? (
                <>
                    <div style={S.backdrop} onClick={() => closeJoinModal('backdrop')} />
                    <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: studentTokens.bgSurface, borderRadius: 16, padding: 24, width: 400, maxWidth: '90vw', zIndex: 1001, boxShadow: '0 20px 60px rgba(43, 52, 55, 0.15)', border: `1px solid ${studentTokens.borderWhisper}` }}>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 16px', color: studentTokens.textPrimary }}>Join a Class</h2>
                        <form onSubmit={handleJoinClass}>
                            <input
                                value={classCode}
                                onChange={event => setClassCode(event.target.value)}
                                placeholder="Enter class code..."
                                disabled={isEnrolling}
                                style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: `1px solid ${studentTokens.outlineSoft}`, fontSize: '1rem', outline: 'none', textTransform: 'uppercase', boxSizing: 'border-box', color: studentTokens.textPrimary, background: studentTokens.bgPage }}
                            />
                            {joinSuccessMessage ? <p style={{ color: '#4c5458', fontSize: '0.875rem', marginTop: 8, fontWeight: 500 }}>{joinSuccessMessage}</p> : null}
                            {enrollError ? <p style={{ color: '#9e3f4e', fontSize: '0.875rem', marginTop: 8, fontWeight: 500 }}>{enrollError}</p> : null}
                            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                                <button type="button" onClick={() => closeJoinModal('cancel_button')} style={localStyles.actionButtonLight}>Cancel</button>
                                <button
                                    type="submit"
                                    disabled={isEnrolling || !classCode.trim()}
                                    style={{ ...localStyles.actionButtonDark, background: classCode.trim() ? studentTokens.accent : studentTokens.bgSurfaceStrong, color: classCode.trim() ? '#faf6ff' : studentTokens.textDim, cursor: classCode.trim() ? 'pointer' : 'default' }}
                                >
                                    {isEnrolling ? 'Joining...' : 'Join Class'}
                                </button>
                            </div>
                        </form>
                    </div>
                </>
            ) : null}

            {selectedResultId ? (
                <DeferredResultSlidePanel
                    resultId={selectedResultId}
                    onClose={() => {
                        trackAction('closeResultSlidePanel', { source: 'dashboard' });
                        setSelectedResultId(null);
                    }}
                />
            ) : null}
        </>
    );
};

export default StudentDashboardPage;
