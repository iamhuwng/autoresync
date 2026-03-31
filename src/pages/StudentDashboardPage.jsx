import React, { useEffect, useMemo, useState } from 'react';
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
import StudentDashboardFeedView from '../components/dashboard/StudentDashboardFeedView';
import { StudentDashboardRightRail } from '../components/dashboard/StudentDashboardRightRail';
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
    if (notification.metadata?.sessionCode || notification.metadata?.className || notification.title?.includes('Joined Class')) return 'classes';
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
    if (notification.metadata?.homeworkId) {
        const dueDate = notification.metadata?.dueDate
            ? new Date(notification.metadata.dueDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }).toUpperCase()
            : 'Upcoming';
        return `Assignment Due • ${dueDate}`;
    }
    if (notification.metadata?.className || notification.title?.includes('Joined Class') || notification.metadata?.sessionCode) {
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
    if (typeof notification.metadata?.score !== 'number') {
        return notification.metadata?.score || 'Updated';
    }
    const value = Number.isInteger(notification.metadata.score) ? notification.metadata.score : notification.metadata.score.toFixed(1);
    return notification.metadata?.maxScore === 100 ? `${value}%` : String(value);
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

function getFocusArea(assignments, notifications, fallbackLabel) {
    const counts = new Map();

    assignments.forEach(item => {
        const assignment = item?.homework;
        const label = assignment?.target?.className || assignment?.className || assignment?.courseName;
        if (!label) return;
        counts.set(label, (counts.get(label) || 0) + 1);
    });

    if (counts.size === 0) {
        notifications.forEach(notification => {
            const label = notification.metadata?.className || notification.metadata?.courseName;
            if (!label) return;
            counts.set(label, (counts.get(label) || 0) + 1);
        });
    }

    let topLabel = fallbackLabel;
    let topCount = -1;
    counts.forEach((count, label) => {
        if (count > topCount) {
            topLabel = label;
            topCount = count;
        }
    });

    return topLabel;
}

const StudentDashboardPage = () => {
    const { user, profile } = useAuth();
    const navigate = useNavigate();
    const { navigateTo } = useNavigation('student');
    const { trackAction } = useFeatureTracking(FEATURE_IDS.studentDashboard);
    const { enrolledClasses, classLiveSessions, notStarted, sortedAssignments, refreshClasses } = useResolvedStudentShellData();

    const [classCode, setClassCode] = useState('');
    const [isEnrolling, setIsEnrolling] = useState(false);
    const [enrollError, setEnrollError] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [publicSessions, setPublicSessions] = useState([]);
    const [feedFilter, setFeedFilter] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [showUnreadOnly, setShowUnreadOnly] = useState(false);
    const [showAllPublicSessions, setShowAllPublicSessions] = useState(false);
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
                const [notificationResult, sessions] = await Promise.all([
                    getPaginatedUserNotifications(user.uid, 20),
                    getAvailablePublicSessions(),
                ]);

                setAllNotifications(notificationResult.notifications || []);
                setHasMoreNotifs(notificationResult.hasMore);
                setNotifCursor(notificationResult.lastKey);
                setPublicSessions(sessions || []);
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

    const feedSummaryCards = useMemo(
        () => [
            { label: 'Activity', value: allNotifications.length, meta: `${filteredNotifications.length} in current view`, color: studentTokens.textPrimary },
            { label: 'Homework Due', value: sortedAssignments.length, meta: notStarted.length > 0 ? `${notStarted.length} not started` : 'No pending start', color: '#9a6427' },
            { label: 'Live Now', value: classLiveSessions.length + publicSessions.length, meta: classLiveSessions.length > 0 ? `${classLiveSessions.length} class sessions active` : 'No active class sessions', color: studentTokens.accent },
        ],
        [allNotifications.length, filteredNotifications.length, sortedAssignments.length, notStarted.length, classLiveSessions.length, publicSessions.length],
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

    const handleJoinPublicSession = sessionCode => {
        trackAction('joinPublicSession', { sessionCode });
        if (user) {
            sessionService.setPlayerData(user.uid, user.displayName || user.email || 'Student', sessionCode);
        }
        navigateTo('STUDENT_WAITING', { gameSessionId: sessionCode }, { reason: 'dashboard_public_session_join' });
    };

    const handleNotificationClick = notification => {
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
            sessionService.setPlayerData(user.uid, user.displayName || user.email || 'Student', sessionCode);
            navigateTo('STUDENT_WAITING', { gameSessionId: sessionCode }, { reason: 'dashboard_session_notification' });
            return;
        }

        if (notification.metadata?.resultId) {
            trackAction('openFeedResult', { resultId: notification.metadata.resultId });
            setSelectedResultId(notification.metadata.resultId);
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

    const handleOpenHomework = () => {
        trackAction('openHomeworkList', { source: 'dashboard_right_rail' });
        navigateTo('STUDENT_HOMEWORK');
    };

    const handleExpandPublicSessions = () => {
        const nextValue = !showAllPublicSessions;
        trackAction('expandPublicSessions', { expanded: nextValue });
        setShowAllPublicSessions(nextValue);
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

    const feedSnapshotCards = useMemo(() => {
        const activeAssignments = sortedAssignments.length;
        const readyAssignments = Math.max(activeAssignments - notStarted.length, 0);
        const currentFilterLabel = FILTER_TABS.find(tab => tab.key === feedFilter)?.label || 'All';
        const focusPercent = activeAssignments > 0 ? Math.round((readyAssignments / activeAssignments) * 100) : unreadCount > 0 ? Math.max(18, 100 - unreadCount * 8) : 100;
        const focusArea = getFocusArea(sortedAssignments, filteredNotifications, currentFilterLabel);

        return [
            {
                id: 'snapshot-focus',
                label: 'Weekly Focus',
                value: `${focusPercent}%`,
                summary:
                    activeAssignments > 0
                        ? `Most of your open work is sitting in ${focusArea} right now.`
                        : unreadCount > 0
                          ? `${unreadCount} updates still need your attention in the feed.`
                          : 'You are caught up for now with no open homework waiting for a start.',
                meta:
                    activeAssignments > 0
                        ? `${notStarted.length} homework waiting to start`
                        : publicSessions.length > 0
                          ? `${publicSessions.length} public sessions are available to join`
                          : 'Your next academic activity will surface here.',
                tone: activeAssignments > 0 ? (notStarted.length > 0 ? 'warm' : 'accent') : 'neutral',
                actionLabel: activeAssignments > 0 ? 'Open Homework' : undefined,
                onClick: activeAssignments > 0 ? handleOpenHomework : undefined,
            },
        ];
    }, [feedFilter, filteredNotifications, unreadCount, publicSessions.length, sortedAssignments, notStarted.length, handleOpenHomework]);

    const upNextItems = useMemo(
        () =>
            sortedAssignments.slice(0, 4).map(item => {
                const assignment = item.homework;
                const className = assignment.target?.className || assignment.className;
                return {
                    id: assignment.id,
                    title: assignment.title || assignment.materialTitle || 'Untitled assignment',
                    meta: [className, assignment.materialType ? String(assignment.materialType).replace(/-/g, ' ') : null].filter(Boolean).join(' - '),
                    summary: item.status === 'overdue' ? 'This assignment is overdue and should be reopened first.' : 'Review the assignment details and continue from the homework page.',
                    dueLabel: item.status === 'overdue' ? 'Overdue' : assignment.scheduling?.dueDate ? new Date(assignment.scheduling.dueDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }) : undefined,
                    tone: item.status === 'overdue' ? 'warm' : assignment.materialType === 'thcs-test' ? 'accent' : 'neutral',
                    actionLabel: 'Open',
                    onClick: () => {
                        trackAction('openHomeworkAssignment', { homeworkId: assignment.id, source: 'dashboard_right_rail' });
                        navigateTo('STUDENT_HOMEWORK_DETAIL', { homeworkId: assignment.id });
                    },
                };
            }),
        [navigateTo, sortedAssignments, trackAction],
    );

    const railPublicSessions = useMemo(
        () =>
            [...publicSessions]
                .sort((a, b) => b.playerCount - a.playerCount || a.createdAt - b.createdAt)
                .map(session => ({
                    sessionCode: session.sessionCode,
                    title: session.testTitle || 'Public Session',
                    meta: [`${session.playerCount || 0} playing`, session.createdAt ? `Opened ${timeAgo(session.createdAt)}` : null].filter(Boolean),
                    badgeLabel: session.playerCount > 0 ? 'Open' : undefined,
                    tone: 'cool',
                    joinLabel: 'Join',
                    onJoin: () => handleJoinPublicSession(session.sessionCode),
                })),
        [publicSessions],
    );

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
                mobileTitle="Dashboard"
                shellData={shellData}
                sidebar={
                    <StudentSidebar
                        user={user ? { ...user, avatarUrl: profile?.avatarUrl } : undefined}
                        activePage="feed"
                        pendingHomeworkCount={notStarted.length}
                        onJoinClass={() => openJoinModal('sidebar')}
                    />
                }
                rightPanel={
                    <StudentDashboardRightRail
                        feedSnapshotCards={feedSnapshotCards}
                        upNextItems={upNextItems}
                        publicSessions={railPublicSessions}
                        onOpenHomework={handleOpenHomework}
                        onExpandPublicSessions={railPublicSessions.length > 4 ? handleExpandPublicSessions : undefined}
                        onJoinPublicSession={handleJoinPublicSession}
                        expandPublicSessionsLabel={showAllPublicSessions ? 'Show fewer sessions' : 'See all public sessions'}
                        visiblePublicSessionsCount={showAllPublicSessions ? railPublicSessions.length : 4}
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
