import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader } from '@mantine/core';
import type { StudentHomeworkItem } from '../hooks/useHomeworkSubmission';
import { useAuth } from '../hooks/useAuth';
import { createSubmission } from '../services/homeworkSubmissionService';
import { StudentLayout } from '../components/layout/StudentLayout';
import { StudentSidebar } from '../components/layout/StudentSidebar';
import { S } from '../components/layout/studentLayoutStyles';
import { DeferredResultSlidePanel } from '../components/results/DeferredResultSlidePanel';
import { buildRoute } from '../constants/routes';
import { useResolvedStudentHomeworkList } from '../context/StudentShellDataContext';

const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === now.toDateString()) {
        return `Today, ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
    }

    if (date.toDateString() === tomorrow.toDateString()) {
        return `Tomorrow, ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
    }

    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
};

const getTimeRemaining = (dueDate: number): { text: string; urgent: boolean } => {
    const diff = dueDate - Date.now();

    if (diff <= 0) {
        return { text: 'Overdue', urgent: true };
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (hours < 24) {
        return { text: `${hours}h remaining`, urgent: hours < 6 };
    }

    if (days < 7) {
        return { text: `${days}d remaining`, urgent: days < 2 };
    }

    return { text: `${days}d remaining`, urgent: false };
};

const getStatusVisual = (status: string): { bg: string; text: string; border: string } => {
    switch (status) {
        case 'not_started':
            return { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' };
        case 'in_progress':
            return { bg: '#dbeafe', text: '#2563eb', border: '#bfdbfe' };
        case 'submitted':
            return { bg: '#d1fae5', text: '#059669', border: '#a7f3d0' };
        case 'graded':
            return { bg: '#dcfce7', text: '#166534', border: '#86efac' };
        case 'overdue':
            return { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' };
        default:
            return { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' };
    }
};

const getSkillColor = (skill: string): { bg: string; text: string } => {
    switch (skill.toLowerCase()) {
        case 'reading':
            return { bg: '#dbeafe', text: '#2563eb' };
        case 'listening':
            return { bg: '#e0e7ff', text: '#4f46e5' };
        case 'writing':
            return { bg: '#ffedd5', text: '#c2410c' };
        case 'speaking':
            return { bg: '#ccfbf1', text: '#0f766e' };
        default:
            return { bg: '#f3f4f6', text: '#374151' };
    }
};

const formatStatus = (status: string): string => {
    return status
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
};

const localStyles: Record<string, React.CSSProperties> = {
    contentStack: {
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        padding: '12px 16px 16px',
    },
    summaryGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: 12,
    },
    summaryCard: {
        background: '#ffffff',
        borderRadius: 16,
        padding: '16px 18px',
        border: '1px solid #e5e7eb',
        borderTopWidth: 4,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        minHeight: 108,
    },
    summaryLabel: {
        margin: 0,
        fontSize: '0.6875rem',
        fontWeight: 700,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        color: '#6b7280',
    },
    summaryValue: {
        margin: 0,
        fontSize: '1.45rem',
        fontWeight: 800,
        color: '#111827',
        lineHeight: 1.05,
    },
    listStack: {
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
    },
    rowCard: {
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: 16,
        borderTopWidth: 4,
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        cursor: 'pointer',
    },
    rowHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 16,
    },
    titleBlock: {
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        minWidth: 0,
        flex: 1,
    },
    title: {
        fontSize: '1.05rem',
        fontWeight: 700,
        margin: 0,
        color: '#111827',
        lineHeight: 1.35,
    },
    pillRow: {
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap',
    },
    pill: {
        padding: '4px 10px',
        borderRadius: 999,
        fontSize: '0.75rem',
        fontWeight: 600,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
    },
    metaRow: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: 14,
        fontSize: '0.875rem',
        color: '#6b7280',
    },
    resultPanel: {
        background: '#f9fafb',
        padding: '12px 14px',
        borderRadius: 14,
        border: '1px solid #e5e7eb',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
    },
    resultLabel: {
        fontSize: '0.75rem',
        fontWeight: 700,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        color: '#6b7280',
    },
    resultValue: {
        fontSize: '1.125rem',
        fontWeight: 700,
    },
    actionRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        borderTop: '1px solid #e5e7eb',
        paddingTop: 14,
    },
    sourceText: {
        fontSize: '0.75rem',
        color: '#6b7280',
    },
    emptyState: {
        padding: '48px 24px',
        textAlign: 'center',
        background: '#ffffff',
        borderRadius: 16,
        border: '1px solid #e5e7eb',
    },
    primaryBtn: {
        background: '#4f46e5',
        color: '#ffffff',
        border: 'none',
        borderRadius: 999,
        padding: '8px 16px',
        fontWeight: 700,
        fontSize: '0.875rem',
        cursor: 'pointer',
    },
    outlineBtn: {
        background: 'transparent',
        color: '#374151',
        border: '1px solid #d1d5db',
        borderRadius: 999,
        padding: '8px 16px',
        fontWeight: 600,
        fontSize: '0.875rem',
        cursor: 'pointer',
    },
    rightWidgetCard: {
        background: '#ffffff',
        borderRadius: 16,
        padding: 16,
        border: '1px solid #e5e7eb',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
    },
    rightMetricRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
    },
    rightMetricLabel: {
        fontSize: '0.875rem',
        color: '#374151',
        fontWeight: 600,
    },
    rightMetricValue: {
        fontSize: '1rem',
        color: '#111827',
        fontWeight: 700,
    },
    rightCallout: {
        background: '#f9fafb',
        borderRadius: 14,
        border: '1px solid #e5e7eb',
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
    },
    rightCalloutLabel: {
        fontSize: '0.6875rem',
        fontWeight: 700,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        color: '#6b7280',
    },
    rightCalloutTitle: {
        fontSize: '0.875rem',
        fontWeight: 700,
        color: '#111827',
        margin: 0,
    },
    rightCalloutMeta: {
        fontSize: '0.75rem',
        color: '#6b7280',
        margin: 0,
    },
};

function getHomeworkResultDisplay(
    latestSubmission: StudentHomeworkItem['latestSubmission'],
    canViewFeedback: boolean,
): { label: string; value: string; valueColor: string } {
    if (!latestSubmission) {
        return { label: 'Result', value: '--', valueColor: '#9ca3af' };
    }

    if (canViewFeedback && typeof latestSubmission.percentage === 'number') {
        return {
            label: 'Your Score',
            value: `${latestSubmission.percentage.toFixed(0)}%`,
            valueColor: '#4f46e5',
        };
    }

    if (canViewFeedback && typeof latestSubmission.bandScore === 'number') {
        return {
            label: 'Your Band',
            value: `Band ${latestSubmission.bandScore.toFixed(1)}`,
            valueColor: '#4f46e5',
        };
    }

    if (latestSubmission.status === 'graded') {
        return {
            label: canViewFeedback ? 'Grade Ready' : 'Result Locked',
            value: canViewFeedback ? 'Open Result' : 'Awaiting release',
            valueColor: canViewFeedback ? '#4f46e5' : '#9ca3af',
        };
    }

    return {
        label: 'Pending Review',
        value: 'Awaiting teacher',
        valueColor: '#9ca3af',
    };
}

export const StudentHomeworkListPage: React.FC = () => {
    const { user, profile } = useAuth();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<string>('all');
    const [selectedResultId, setSelectedResultId] = useState<string | null>(null);

    const {
        homeworkItems,
        isLoading,
        error,
        refreshData,
        notStarted,
        inProgress,
        completed,
        overdue,
    } = useResolvedStudentHomeworkList(user?.uid || '');

    const handleStartHomework = async (item: StudentHomeworkItem, event?: React.MouseEvent) => {
        if (event) {
            event.stopPropagation();
        }

        if (!user?.uid) {
            return;
        }

        const { homework, latestSubmission, status, canSubmit } = item;

        if (!homework.materialId) {
            console.error('[Homework] Missing materialId for homework:', homework.id);
            alert('This homework has no test material linked. Please contact your teacher.');
            return;
        }

        if ((status === 'submitted' || status === 'graded') && latestSubmission?.resultId) {
            setSelectedResultId(latestSubmission.resultId);
            return;
        }

        if (status === 'in_progress' && latestSubmission?.id) {
            navigate(buildRoute('STUDENT_PRACTICE', { materialId: homework.materialId }), {
                state: {
                    isHomework: true,
                    homeworkId: homework.id,
                    submissionId: latestSubmission.id,
                    teacherId: homework.createdBy,
                    dueDate: homework.scheduling?.dueDate,
                    lateSubmissionAllowed: homework.config?.lateSubmissionAllowed ?? false,
                },
            });
            return;
        }

        if (canSubmit) {
            try {
                const submission = await createSubmission(
                    homework.id,
                    user.uid,
                    user.displayName || 'Student',
                );

                navigate(buildRoute('STUDENT_PRACTICE', { materialId: homework.materialId }), {
                    state: {
                        isHomework: true,
                        homeworkId: homework.id,
                        submissionId: submission.id,
                        teacherId: homework.createdBy,
                        dueDate: homework.scheduling?.dueDate,
                        lateSubmissionAllowed: homework.config?.lateSubmissionAllowed ?? false,
                    },
                });
            } catch (submissionError) {
                console.error('Failed to start homework:', submissionError);
                alert('Unable to start homework. Please try again.');
            }
        }
    };

    const getTabItems = (): StudentHomeworkItem[] => {
        switch (activeTab) {
            case 'not_started':
                return notStarted;
            case 'in_progress':
                return inProgress;
            case 'completed':
                return completed;
            case 'overdue':
                return overdue;
            default:
                return homeworkItems;
        }
    };

    const tabItems = getTabItems();
    const dueSoonItems = homeworkItems.filter((item) => {
        const dueDate = item.homework.scheduling?.dueDate;
        if (!dueDate) {
            return false;
        }

        const diff = dueDate - Date.now();
        return diff > 0 && diff <= 2 * 24 * 60 * 60 * 1000 && item.status !== 'submitted' && item.status !== 'graded';
    });
    const nextDueItem = [...homeworkItems]
        .filter((item) => item.homework.scheduling?.dueDate && item.status !== 'submitted' && item.status !== 'graded')
        .sort((left, right) => left.homework.scheduling.dueDate - right.homework.scheduling.dueDate)[0] || null;
    const summaryCards = [
        { label: 'Assignments', value: homeworkItems.length, color: '#111827' },
        { label: 'Not Started', value: notStarted.length, color: '#111827' },
        { label: 'In Progress', value: inProgress.length, color: '#2563eb' },
        { label: 'Completed', value: completed.length, color: '#059669' },
        { label: 'Overdue', value: overdue.length, color: '#dc2626' },
    ];

    const renderCenterContent = () => {
        if (isLoading) {
            return (
                <div style={{ textAlign: 'center', padding: '60px' }}>
                    <Loader />
                </div>
            );
        }

        if (error) {
            return (
                <div style={localStyles.contentStack}>
                    <div style={localStyles.emptyState}>
                        <h2 style={{ fontSize: '1.25rem', color: '#dc2626', margin: '0 0 16px' }}>{error}</h2>
                        <button type="button" style={localStyles.primaryBtn} onClick={refreshData}>
                            Try Again
                        </button>
                    </div>
                </div>
            );
        }

        return (
            <div style={localStyles.contentStack}>
                <div style={localStyles.summaryGrid}>
                    {summaryCards.map((card) => (
                        <div
                            key={card.label}
                            style={{ ...localStyles.summaryCard, borderTopColor: '#d1d5db' }}
                        >
                            <p style={localStyles.summaryLabel}>{card.label}</p>
                            <p style={{ ...localStyles.summaryValue, color: card.color }}>{card.value}</p>
                        </div>
                    ))}
                </div>

                {tabItems.length === 0 ? (
                    <div style={localStyles.emptyState}>
                        <h2 style={{ fontSize: '1.25rem', color: '#111827', margin: '0 0 8px' }}>No homework found</h2>
                        <p style={{ color: '#6b7280', margin: 0 }}>
                            {activeTab === 'all'
                                ? "Your teachers haven't assigned any homework yet."
                                : 'No homework in this category.'}
                        </p>
                    </div>
                ) : (
                    <div style={localStyles.listStack}>
                        {tabItems.map((item) => {
                            const {
                                homework,
                                latestSubmission,
                                attemptsUsed,
                                attemptsRemaining,
                                canSubmit,
                                canViewFeedback,
                                status,
                            } = item;
                            const timeInfo = getTimeRemaining(homework.scheduling.dueDate);
                            const resultDisplay = getHomeworkResultDisplay(latestSubmission, canViewFeedback);
                            const statusVisual = getStatusVisual(status);
                            const skillColor = getSkillColor(homework.materialSkill);

                            return (
                                <article
                                    key={homework.id}
                                    style={{ ...localStyles.rowCard, borderTopColor: statusVisual.border }}
                                    onClick={() => {
                                        void handleStartHomework(item);
                                    }}
                                >
                                    <div style={localStyles.rowHeader}>
                                        <div style={localStyles.titleBlock}>
                                            <h3 style={localStyles.title}>{homework.title || homework.materialTitle}</h3>
                                            <div style={localStyles.pillRow}>
                                                <span style={{ ...localStyles.pill, background: skillColor.bg, color: skillColor.text }}>
                                                    {homework.materialSkill}
                                                </span>
                                                <span style={{ ...localStyles.pill, background: '#f3f4f6', color: '#374151' }}>
                                                    {homework.materialType}
                                                </span>
                                            </div>
                                        </div>

                                        <span style={{ ...localStyles.pill, background: statusVisual.bg, color: statusVisual.text }}>
                                            {formatStatus(status)}
                                        </span>
                                    </div>

                                    <div style={localStyles.metaRow}>
                                        <span style={{ fontWeight: 600, color: timeInfo.urgent ? '#dc2626' : '#6b7280' }}>
                                            Due: {formatDate(homework.scheduling.dueDate)}
                                        </span>
                                        <span>{timeInfo.text}</span>
                                        {homework.config.maxAttempts !== null ? (
                                            <span>
                                                Attempts: {attemptsUsed} / {homework.config.maxAttempts}
                                                {attemptsRemaining !== null && attemptsRemaining > 0 ? ` (${attemptsRemaining} left)` : ''}
                                            </span>
                                        ) : null}
                                        {homework.config.timerMinutes ? <span>{homework.config.timerMinutes} min limit</span> : null}
                                    </div>

                                    {latestSubmission && (latestSubmission.status === 'submitted' || latestSubmission.status === 'graded') ? (
                                        <div
                                            style={{
                                                ...localStyles.resultPanel,
                                                cursor: canViewFeedback && latestSubmission.resultId ? 'pointer' : 'default',
                                            }}
                                            onClick={(event) => {
                                                if (canViewFeedback && latestSubmission.resultId) {
                                                    event.stopPropagation();
                                                    setSelectedResultId(latestSubmission.resultId);
                                                }
                                            }}
                                        >
                                            <span style={localStyles.resultLabel}>{resultDisplay.label}</span>
                                            <span style={{ ...localStyles.resultValue, color: resultDisplay.valueColor }}>
                                                {resultDisplay.value}
                                            </span>
                                        </div>
                                    ) : null}

                                    <div style={localStyles.actionRow}>
                                        <span style={localStyles.sourceText}>
                                            {homework.target.type === 'class' ? `From: ${homework.target.className}` : 'Assigned to you'}
                                        </span>

                                        {canSubmit ? (
                                            <button
                                                type="button"
                                                style={status === 'not_started' ? localStyles.primaryBtn : localStyles.outlineBtn}
                                                onClick={(event) => {
                                                    void handleStartHomework(item, event);
                                                }}
                                            >
                                                {status === 'not_started' ? 'Start Homework' : 'Continue'}
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                style={localStyles.outlineBtn}
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    void handleStartHomework(item);
                                                }}
                                            >
                                                View Details
                                            </button>
                                        )}
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    };

    const renderRightPanel = () => {
        return (
            <div style={localStyles.rightWidgetCard}>
                <h3 style={S.widgetTitle}>Homework Snapshot</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={localStyles.rightMetricRow}>
                        <span style={localStyles.rightMetricLabel}>Not Started</span>
                        <span style={localStyles.rightMetricValue}>{notStarted.length}</span>
                    </div>
                    <div style={localStyles.rightMetricRow}>
                        <span style={{ ...localStyles.rightMetricLabel, color: '#2563eb' }}>In Progress</span>
                        <span style={localStyles.rightMetricValue}>{inProgress.length}</span>
                    </div>
                    <div style={localStyles.rightMetricRow}>
                        <span style={{ ...localStyles.rightMetricLabel, color: '#059669' }}>Completed</span>
                        <span style={localStyles.rightMetricValue}>{completed.length}</span>
                    </div>
                    <div style={{ ...localStyles.rightMetricRow, paddingTop: 8, borderTop: '1px solid #e5e7eb' }}>
                        <span style={{ ...localStyles.rightMetricLabel, color: '#dc2626' }}>Overdue</span>
                        <span style={{ ...localStyles.rightMetricValue, color: '#dc2626' }}>{overdue.length}</span>
                    </div>
                </div>

                <div style={localStyles.rightCallout}>
                    <span style={localStyles.rightCalloutLabel}>Due Soon</span>
                    <p style={localStyles.rightCalloutTitle}>{dueSoonItems.length} assignment{dueSoonItems.length === 1 ? '' : 's'}</p>
                    <p style={localStyles.rightCalloutMeta}>
                        {nextDueItem
                            ? `${nextDueItem.homework.title || nextDueItem.homework.materialTitle} · ${formatDate(nextDueItem.homework.scheduling.dueDate)}`
                            : 'No upcoming due date'}
                    </p>
                </div>
            </div>
        );
    };

    return (
        <StudentLayout
            mobileTitle="Homework"
            sidebar={(
                <StudentSidebar
                    user={user ? { ...user, avatarUrl: profile?.avatarUrl } : undefined}
                    activePage="homework"
                    pendingHomeworkCount={notStarted.length}
                />
            )}
            rightPanel={renderRightPanel()}
        >
            <div style={S.feedHeader}>
                <h2 style={S.feedHeaderTitle}>My Homework</h2>
            </div>

            <div style={{ ...S.filterBar, overflowX: 'auto', whiteSpace: 'nowrap' }}>
                {[
                    { key: 'all', label: `All (${homeworkItems.length})` },
                    { key: 'not_started', label: 'Not Started' },
                    { key: 'in_progress', label: 'In Progress' },
                    { key: 'completed', label: 'Completed' },
                    ...(overdue.length > 0 ? [{ key: 'overdue', label: 'Overdue' }] : []),
                ].map((tab) => (
                    <button
                        key={tab.key}
                        type="button"
                        onClick={() => setActiveTab(tab.key)}
                        style={{
                            ...S.filterTab,
                            ...(activeTab === tab.key ? S.filterTabActive : {}),
                        }}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <div>{renderCenterContent()}</div>

            {selectedResultId ? (
                <DeferredResultSlidePanel
                    resultId={selectedResultId}
                    onClose={() => setSelectedResultId(null)}
                />
            ) : null}
        </StudentLayout>
    );
};

export default StudentHomeworkListPage;
