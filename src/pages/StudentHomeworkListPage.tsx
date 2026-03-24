import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStudentHomeworkList, StudentHomeworkItem } from '../hooks/useHomeworkSubmission';
import { useAuth } from '../hooks/useAuth';
import { createSubmission } from '../services/homeworkSubmissionService';
import { Loader } from '@mantine/core';
import { StudentLayout } from '../components/layout/StudentLayout';
import { StudentSidebar } from '../components/layout/StudentSidebar';
import { S } from '../components/layout/studentLayoutStyles';
import { ResultSlidePanel } from '../components/results/ResultSlidePanel';

// ─── Utility: Date Formatting & Status ──────────────────────────────────────
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
        minute: '2-digit'
    });
};

const getTimeRemaining = (dueDate: number): { text: string; urgent: boolean } => {
    const now = Date.now();
    const diff = dueDate - now;

    if (diff <= 0) return { text: 'Overdue', urgent: true };

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (hours < 24) return { text: `${hours}h remaining`, urgent: hours < 6 };
    if (days < 7) return { text: `${days}d remaining`, urgent: days < 2 };

    return { text: `${days}d remaining`, urgent: false };
};

const getStatusColor = (status: string): { bg: string; text: string } => {
    switch (status) {
        case 'not_started': return { bg: '#f3f4f6', text: '#374151' }; // gray
        case 'in_progress': return { bg: '#dbeafe', text: '#2563eb' }; // blue
        case 'submitted': return { bg: '#d1fae5', text: '#059669' };   // green
        case 'overdue': return { bg: '#fef2f2', text: '#dc2626' };     // red
        default: return { bg: '#f3f4f6', text: '#374151' };
    }
};

const getSkillColor = (skill: string): { bg: string; text: string } => {
    switch (skill.toLowerCase()) {
        case 'reading': return { bg: '#dbeafe', text: '#2563eb' };
        case 'listening': return { bg: '#e0e7ff', text: '#4f46e5' }; // using indigo to respect Purple Ban
        case 'writing': return { bg: '#ffedd5', text: '#c2410c' };
        case 'speaking': return { bg: '#ccfbf1', text: '#0f766e' };
        default: return { bg: '#f3f4f6', text: '#374151' };
    }
};

// ─── Inline Styles for Homework Page ───────────────────────────────────────
const localStyles: any = {
    // Content layout
    contentArea: {
        background: '#ffffff',
    },
    emptyState: {
        padding: '60px 24px',
        textAlign: 'center',
    },
    // Cards
    card: {
        background: '#ffffff',
        borderBottom: '1px solid #e5e7eb',
        padding: '16px 24px',
        cursor: 'pointer',
        transition: 'background 0.15s',
    },
    cardHover: {
        background: '#f9fafb',
    },
    cardOverdue: {
        background: '#fff1f2',
        border: '1px solid #fecdd3',
    },
    pill: {
        padding: '4px 10px',
        borderRadius: 999,
        fontSize: '0.75rem',
        fontWeight: 600,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
    },

    primaryBtn: {
        background: '#4f46e5',
        color: 'white',
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
    }
};

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
        overdue
    } = useStudentHomeworkList(user?.uid || '');

    // Navigate directly to test-taking interface, creating submission inline
    const handleStartHomework = async (item: StudentHomeworkItem, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (!user?.uid) return;

        const { homework, latestSubmission, status, canSubmit } = item;

        // Guard: materialId must exist
        if (!homework.materialId) {
            console.error('[Homework] Missing materialId for homework:', homework.id);
            alert('This homework has no test material linked. Please contact your teacher.');
            return;
        }

        // If already submitted / completed, go to academic record to view results
        if (status === 'submitted' && latestSubmission?.resultId) {
            setSelectedResultId(latestSubmission.resultId);
            return;
        }

        // If there's an in-progress submission, resume it directly
        if (status === 'in_progress' && latestSubmission?.id) {
            navigate(`/student/practice/${homework.materialId}`, {
                state: {
                    isHomework: true,
                    homeworkId: homework.id,
                    submissionId: latestSubmission.id,
                    dueDate: homework.scheduling?.dueDate,
                    lateSubmissionAllowed: homework.config?.lateSubmissionAllowed ?? false,
                },
            });
            return;
        }

        // Not started — create submission then navigate
        if (canSubmit) {
            try {
                const submission = await createSubmission(
                    homework.id,
                    user.uid,
                    user.displayName || 'Student',
                );
                navigate(`/student/practice/${homework.materialId}`, {
                    state: {
                        isHomework: true,
                        homeworkId: homework.id,
                        submissionId: submission.id,
                        dueDate: homework.scheduling?.dueDate,
                        lateSubmissionAllowed: homework.config?.lateSubmissionAllowed ?? false,
                    },
                });
            } catch (err) {
                console.error('Failed to start homework:', err);
                alert('Unable to start homework. Please try again.');
            }
            return;
        }

        // Fallback — overdue / no attempts left, just show the card info
        // (the button is already disabled in these cases)
    };

    const getTabItems = (): StudentHomeworkItem[] => {
        switch (activeTab) {
            case 'not_started': return notStarted;
            case 'in_progress': return inProgress;
            case 'completed': return completed;
            case 'overdue': return overdue;
            default: return homeworkItems;
        }
    };

    const tabItems = getTabItems();

    // ─── CENTER COLUMN CONTENT ────────────────────────────────────────────────
    const renderCenterContent = () => {
        if (isLoading) {
            return <div style={{ textAlign: 'center', padding: '60px' }}><Loader /></div>;
        }

        if (error) {
            return (
                <div style={localStyles.emptyState}>
                    <p style={{ fontSize: '3rem', margin: '0 0 16px' }}>⚠️</p>
                    <h2 style={{ fontSize: '1.25rem', color: '#dc2626', margin: '0 0 16px' }}>{error}</h2>
                    <button style={localStyles.primaryBtn} onClick={refreshData}>Try Again</button>
                </div>
            );
        }

        if (tabItems.length === 0) {
            return (
                <div style={localStyles.emptyState}>
                    <p style={{ fontSize: '3rem', margin: '0 0 16px' }}>📋</p>
                    <h2 style={{ fontSize: '1.25rem', color: '#111827', margin: '0 0 8px' }}>No homework found</h2>
                    <p style={{ color: '#6b7280', margin: 0 }}>
                        {activeTab === 'all'
                            ? "Your teachers haven't assigned any homework yet."
                            : "No homework in this category."}
                    </p>
                </div>
            );
        }

        return (
            <div style={{ ...localStyles.contentArea, borderTop: '1px solid #e5e7eb' }}>
                {tabItems.map((item) => {
                    const { homework, latestSubmission, attemptsUsed, attemptsRemaining, canSubmit, canViewFeedback, status } = item;
                    const timeInfo = getTimeRemaining(homework.scheduling.dueDate);
                    const isCardOverdue = status === 'overdue';

                    const statColor = getStatusColor(status);
                    const sklColor = getSkillColor(homework.materialSkill);

                    return (
                        <div
                            key={homework.id}
                            style={{
                                ...localStyles.card,
                                ...(isCardOverdue ? localStyles.cardOverdue : {})
                            }}
                            onClick={() => handleStartHomework(item)}
                            onMouseEnter={e => { if (!isCardOverdue) e.currentTarget.style.background = '#f9fafb'; }}
                            onMouseLeave={e => { if (!isCardOverdue) e.currentTarget.style.background = '#ffffff'; }}
                        >
                            {/* Header row */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                                <div>
                                    <h3 style={{ fontSize: '1.125rem', fontWeight: 700, margin: '0 0 8px', color: '#111827' }}>
                                        {homework.title || homework.materialTitle}
                                    </h3>
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        <span style={{ ...localStyles.pill, background: sklColor.bg, color: sklColor.text }}>
                                            {homework.materialSkill}
                                        </span>
                                        <span style={{ ...localStyles.pill, background: '#f3f4f6', color: '#374151' }}>
                                            {homework.materialType}
                                        </span>
                                    </div>
                                </div>

                                <span style={{ ...localStyles.pill, background: statColor.bg, color: statColor.text }}>
                                    {status.replace('_', ' ')}
                                </span>
                            </div>

                            {/* Info row */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 16, fontSize: '0.875rem', color: '#6b7280' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <span style={{ fontWeight: 600, color: timeInfo.urgent ? '#dc2626' : '#6b7280' }}>
                                        Due: {formatDate(homework.scheduling.dueDate)}
                                    </span>
                                </div>
                                {homework.config.maxAttempts !== null && (
                                    <div>
                                        Attempts: {attemptsUsed} / {homework.config.maxAttempts}
                                        {attemptsRemaining !== null && attemptsRemaining > 0 && ` (${attemptsRemaining} left)`}
                                    </div>
                                )}
                                {homework.config.timerMinutes && (
                                    <div>{homework.config.timerMinutes} min limit</div>
                                )}
                            </div>

                            {/* Completed Score */}
                            {latestSubmission && (latestSubmission.status === 'submitted' || latestSubmission.status === 'graded') && (
                                <div
                                    style={{
                                        background: '#f8fafc',
                                        padding: 12,
                                        borderRadius: 12,
                                        marginBottom: 16,
                                        border: '1px solid #e2e8f0',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        cursor: (canViewFeedback && latestSubmission.resultId) ? 'pointer' : 'default',
                                    }}
                                    onClick={(e) => {
                                        if (canViewFeedback && latestSubmission.resultId) {
                                            e.stopPropagation();
                                            // PRD-0025 US-11: Open inline ResultDetailModal on Academic Record page
                                            setSelectedResultId(latestSubmission.resultId);
                                        }
                                    }}
                                >
                                    <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#475569' }}>
                                        {canViewFeedback ? 'Your Score' : 'Score Hidden'}
                                    </span>
                                    <span style={{ fontSize: '1.125rem', fontWeight: 700, color: canViewFeedback ? '#4f46e5' : '#9ca3af' }}>
                                        {canViewFeedback ? `${latestSubmission.percentage?.toFixed(0)}%` : '--'}
                                    </span>
                                </div>
                            )}

                            {/* Actions */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
                                <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                                    {homework.target.type === 'class' ? `From: ${homework.target.className}` : 'Assigned to you'}
                                </span>

                                {canSubmit ? (
                                    <button
                                        style={status === 'not_started' ? localStyles.primaryBtn : localStyles.outlineBtn}
                                        onClick={(e) => handleStartHomework(item, e)}
                                    >
                                        {status === 'not_started' ? 'Start Homework' : 'Continue'}
                                    </button>
                                ) : (
                                    <button style={localStyles.outlineBtn} onClick={() => handleStartHomework(item)}>
                                        View Details
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    // ─── RIGHT PANEL WIDGET (SUMMARY) ─────────────────────────────────────────
    const renderRightPanel = () => {
        return (
            <div style={S.rightSticky}>
                <div style={S.widget}>
                    <h3 style={S.widgetTitle}>Summary</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.875rem', color: '#4b5563', fontWeight: 500 }}>Not Started</span>
                            <span style={{ fontSize: '1.125rem', fontWeight: 700, color: '#111827' }}>{notStarted.length}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.875rem', color: '#2563eb', fontWeight: 500 }}>In Progress</span>
                            <span style={{ fontSize: '1.125rem', fontWeight: 700, color: '#111827' }}>{inProgress.length}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.875rem', color: '#059669', fontWeight: 500 }}>Completed</span>
                            <span style={{ fontSize: '1.125rem', fontWeight: 700, color: '#111827' }}>{completed.length}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '1px solid #e5e7eb' }}>
                            <span style={{ fontSize: '0.875rem', color: '#dc2626', fontWeight: 600 }}>Overdue</span>
                            <span style={{ fontSize: '1.125rem', fontWeight: 700, color: '#dc2626' }}>{overdue.length}</span>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    // ─── MAIN RENDER ────────────────────────────────────────────────────────
    return (
        <StudentLayout
            mobileTitle="Homework"
            sidebar={
                <StudentSidebar
                    user={user ? { ...user, avatarUrl: profile?.avatarUrl } : undefined}
                    activePage="homework"
                    pendingHomeworkCount={notStarted.length}
                />
            }
            rightPanel={renderRightPanel()}
        >
            <div style={S.feedHeader}>
                <h2 style={S.feedHeaderTitle}>My Homework</h2>
            </div>

            {/* Filter Tabs */}
            <div style={{ ...S.filterBar, overflowX: 'auto', whiteSpace: 'nowrap' }}>
                {[
                    { key: 'all', label: `All (${homeworkItems.length})` },
                    { key: 'not_started', label: `Not Started` },
                    { key: 'in_progress', label: `In Progress` },
                    { key: 'completed', label: `Completed` },
                    ...(overdue.length > 0 ? [{ key: 'overdue', label: `Overdue` }] : []),
                ].map(tab => (
                    <button
                        key={tab.key}
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

            <div>
                {renderCenterContent()}
            </div>
            {selectedResultId && (
                <ResultSlidePanel
                    resultId={selectedResultId}
                    onClose={() => setSelectedResultId(null)}
                />
            )}
        </StudentLayout>
    );
};

export default StudentHomeworkListPage;
