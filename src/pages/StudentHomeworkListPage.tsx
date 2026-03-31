import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader } from '@mantine/core';
import type { StudentHomeworkItem } from '../hooks/useHomeworkSubmission';
import { useAuth } from '../hooks/useAuth';
import { createSubmission } from '../services/homeworkSubmissionService';
import { StudentLayout } from '../components/layout/StudentLayout';
import { StudentSidebar } from '../components/layout/StudentSidebar';
import { S, studentTokens } from '../components/layout/studentLayoutStyles';
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
            return { bg: studentTokens.bgSurfaceAlt, text: studentTokens.textBody, border: studentTokens.outlineSoft };
        case 'in_progress':
            return { bg: studentTokens.accentSoft, text: studentTokens.accentHover, border: studentTokens.outlineSoft };
        case 'submitted':
            return { bg: '#edf5f9', text: '#4c5458', border: studentTokens.outlineSoft };
        case 'graded':
            return { bg: '#dce4e8', text: '#2b3437', border: studentTokens.outlineSoft };
        case 'overdue':
            return { bg: '#fff2f2', text: '#9e3f4e', border: '#d7b7bd' };
        default:
            return { bg: studentTokens.bgSurfaceAlt, text: studentTokens.textBody, border: studentTokens.outlineSoft };
    }
};

const getSkillColor = (skill: string): { bg: string; text: string } => {
    switch (skill.toLowerCase()) {
        case 'reading':
            return { bg: '#edf5f9', text: '#4c5458' };
        case 'listening':
            return { bg: studentTokens.accentSoft, text: studentTokens.accentHover };
        case 'writing':
            return { bg: '#f7efe4', text: '#9a5c2d' };
        case 'speaking':
            return { bg: '#dce4e8', text: '#586064' };
        default:
            return { bg: studentTokens.bgSurfaceAlt, text: studentTokens.textBody };
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
        gap: 18,
        padding: '18px 0 0',
    },
    summaryGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: 12,
    },
    summaryCard: {
        background: studentTokens.bgSurface,
        borderRadius: 12,
        padding: '18px 20px',
        border: `1px solid ${studentTokens.borderWhisper}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        minHeight: 116,
    },
    summaryLabel: {
        margin: 0,
        fontSize: '0.6875rem',
        fontWeight: 700,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        color: studentTokens.textMuted,
    },
    summaryValue: {
        margin: 0,
        fontSize: '2rem',
        fontWeight: 800,
        color: studentTokens.textPrimary,
        lineHeight: 1.05,
    },
    listStack: {
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
    },
    rowCard: {
        background: studentTokens.bgSurface,
        border: `1px solid ${studentTokens.borderWhisper}`,
        borderRadius: 12,
        padding: '18px 20px',
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
        fontSize: '1rem',
        fontWeight: 700,
        margin: 0,
        color: studentTokens.textPrimary,
        lineHeight: 1.35,
    },
    pillRow: {
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap',
    },
    pill: {
        padding: '4px 10px',
        borderRadius: studentTokens.radiusPill,
        fontSize: '0.6875rem',
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
    },
    metaRow: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: 14,
        fontSize: '0.875rem',
        color: studentTokens.textBody,
    },
    resultPanel: {
        background: studentTokens.bgShell,
        padding: '12px 14px',
        borderRadius: 12,
        border: `1px solid ${studentTokens.borderWhisper}`,
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
        color: studentTokens.textMuted,
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
        borderTop: `1px solid ${studentTokens.borderWhisper}`,
        paddingTop: 14,
    },
    sourceText: {
        fontSize: '0.75rem',
        color: studentTokens.textMuted,
    },
    emptyState: {
        padding: '48px 24px',
        textAlign: 'center',
        background: studentTokens.bgSurface,
        borderRadius: 12,
        border: `1px solid ${studentTokens.borderWhisper}`,
    },
    primaryBtn: {
        background: studentTokens.accent,
        color: '#ffffff',
        border: 'none',
        borderRadius: 8,
        padding: '9px 16px',
        fontWeight: 700,
        fontSize: '0.75rem',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        cursor: 'pointer',
    },
    outlineBtn: {
        background: 'transparent',
        color: studentTokens.textBody,
        border: `1px solid ${studentTokens.borderSoft}`,
        borderRadius: 8,
        padding: '9px 16px',
        fontWeight: 600,
        fontSize: '0.75rem',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        cursor: 'pointer',
    },
    rightWidgetCard: {
        background: studentTokens.bgSurface,
        borderRadius: 12,
        padding: 16,
        border: `1px solid ${studentTokens.borderWhisper}`,
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
        color: studentTokens.textBody,
        fontWeight: 600,
    },
    rightMetricValue: {
        fontSize: '1rem',
        color: studentTokens.textPrimary,
        fontWeight: 700,
    },
    rightCallout: {
        background: studentTokens.bgShell,
        borderRadius: 12,
        border: `1px solid ${studentTokens.borderWhisper}`,
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
        color: studentTokens.textMuted,
    },
    rightCalloutTitle: {
        fontSize: '0.875rem',
        fontWeight: 700,
        color: studentTokens.textPrimary,
        margin: 0,
    },
    rightCalloutMeta: {
        fontSize: '0.75rem',
        color: studentTokens.textMuted,
        margin: 0,
    },
};

function getHomeworkResultDisplay(
    latestSubmission: StudentHomeworkItem['latestSubmission'],
    canViewFeedback: boolean,
): { label: string; value: string; valueColor: string } {
    if (!latestSubmission) {
        return { label: 'Result', value: '--', valueColor: studentTokens.textDim };
    }

    if (canViewFeedback && typeof latestSubmission.percentage === 'number') {
        return {
            label: 'Your Score',
            value: `${latestSubmission.percentage.toFixed(0)}%`,
            valueColor: studentTokens.accent,
        };
    }

    if (canViewFeedback && typeof latestSubmission.bandScore === 'number') {
        return {
            label: 'Your Band',
            value: `Band ${latestSubmission.bandScore.toFixed(1)}`,
            valueColor: studentTokens.accent,
        };
    }

    if (latestSubmission.status === 'graded') {
        return {
            label: canViewFeedback ? 'Grade Ready' : 'Result Locked',
            value: canViewFeedback ? 'Open Result' : 'Awaiting release',
            valueColor: canViewFeedback ? studentTokens.accent : studentTokens.textDim,
        };
    }

    return {
        label: 'Pending Review',
        value: 'Awaiting teacher',
        valueColor: studentTokens.textDim,
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
        { label: 'Assignments', value: homeworkItems.length, color: studentTokens.textPrimary },
        { label: 'Not Started', value: notStarted.length, color: studentTokens.textPrimary },
        { label: 'In Progress', value: inProgress.length, color: studentTokens.accent },
        { label: 'Completed', value: completed.length, color: '#4c5458' },
        { label: 'Overdue', value: overdue.length, color: '#9e3f4e' },
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
                        <h2 style={{ fontSize: '1.25rem', color: '#9e3f4e', margin: '0 0 16px' }}>{error}</h2>
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
                            style={localStyles.summaryCard}
                        >
                            <p style={localStyles.summaryLabel}>{card.label}</p>
                            <p style={{ ...localStyles.summaryValue, color: card.color }}>{card.value}</p>
                        </div>
                    ))}
                </div>

                {tabItems.length === 0 ? (
                    <div style={localStyles.emptyState}>
                        <h2 style={{ fontSize: '1.25rem', color: studentTokens.textPrimary, margin: '0 0 8px' }}>No homework found</h2>
                        <p style={{ color: studentTokens.textMuted, margin: 0 }}>
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
                                        <span style={{ fontWeight: 600, color: timeInfo.urgent ? '#9e3f4e' : studentTokens.textMuted }}>
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
                        <span style={{ ...localStyles.rightMetricLabel, color: studentTokens.accent }}>In Progress</span>
                        <span style={localStyles.rightMetricValue}>{inProgress.length}</span>
                    </div>
                    <div style={localStyles.rightMetricRow}>
                        <span style={{ ...localStyles.rightMetricLabel, color: '#4c5458' }}>Completed</span>
                        <span style={localStyles.rightMetricValue}>{completed.length}</span>
                    </div>
                    <div style={{ ...localStyles.rightMetricRow, paddingTop: 8, borderTop: `1px solid ${studentTokens.borderWhisper}` }}>
                        <span style={{ ...localStyles.rightMetricLabel, color: '#9e3f4e' }}>Overdue</span>
                        <span style={{ ...localStyles.rightMetricValue, color: '#9e3f4e' }}>{overdue.length}</span>
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
                <div style={S.feedHeaderText}>
                    <h2 style={S.feedHeaderTitle}>My Homework</h2>
                    <p style={S.feedHeaderSubtitle}>Track upcoming assignments, review progress, and continue active work without losing the calm academic workspace.</p>
                </div>
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
