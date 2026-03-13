import React, { useState, useCallback } from 'react';
import { HomeworkTagChips } from './HomeworkTagChips';
import { HomeworkStatusBadge } from './HomeworkStatusBadge';
import type { HomeworkAssignment, HomeworkTagConfig } from '../../types/homework.types';
import type { HomeworkSubmission } from '../../types/homework.types';
import { resetStudentHomework, getHomeworkSubmissions } from '../../services/homeworkSubmissionService';
import './HomeworkCard.css';

interface HomeworkCardProps {
    homework: HomeworkAssignment;
    onEdit?: (homework: HomeworkAssignment) => void;
    onDuplicate?: (homework: HomeworkAssignment) => void;
    onDelete?: (homework: HomeworkAssignment) => void;
    onExtendDeadline?: (homework: HomeworkAssignment) => void;
    onRestore?: (homework: HomeworkAssignment) => void;
    onPermanentDelete?: (homework: HomeworkAssignment) => void;
    onClick?: (homework: HomeworkAssignment) => void;
    showSubmissionProgress?: boolean;
    availableTags?: HomeworkTagConfig['tags'];
    /** Called after a student's homework is successfully reset */
    onResetComplete?: () => void;
}

export function HomeworkCard({
    homework,
    onEdit,
    onDuplicate,
    onDelete,
    onExtendDeadline,
    onRestore,
    onPermanentDelete,
    onClick,
    showSubmissionProgress = true,
    availableTags = [],
    onResetComplete,
}: HomeworkCardProps) {
    // Use scheduling object for dates (timestamps in milliseconds)
    const dueDate = new Date(homework.scheduling.dueDate);
    const availableFrom = new Date(homework.scheduling.availableFrom || homework.createdAt);
    const now = new Date();

    const isOverdue = now > dueDate && homework.status !== 'closed';
    const timeUntilDue = dueDate.getTime() - now.getTime();
    const daysUntilDue = Math.floor(timeUntilDue / (1000 * 60 * 60 * 24));
    const hoursUntilDue = Math.floor((timeUntilDue % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    const formatDate = (date: Date) => {
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const getTargetDisplay = () => {
        switch (homework.target.type) {
            case 'class':
                return `📚 Class: ${homework.target.className || 'Unknown'}`;
            case 'course':
                return `📖 Course: ${homework.target.courseName || 'Unknown'}`;
            case 'group':
                return `👥 Group: ${homework.target.groupName || 'Custom Group'}`;
            case 'students':
                return `👤 ${homework.target.studentIds?.length || 0} student(s)`;
            default:
                return 'Unknown target';
        }
    };

    const getTimeUntilDueDisplay = () => {
        if (homework.status === 'closed') {
            return <span className="time-closed">Closed</span>;
        }

        if (isOverdue) {
            return <span className="time-overdue">⚠️ Overdue</span>;
        }

        if (daysUntilDue > 7) {
            return <span className="time-plenty">{daysUntilDue} days remaining</span>;
        } else if (daysUntilDue > 1) {
            return <span className="time-soon">{daysUntilDue} days remaining</span>;
        } else if (daysUntilDue === 1) {
            return <span className="time-urgent">Due tomorrow</span>;
        } else if (hoursUntilDue > 0) {
            return <span className="time-urgent">Due in {hoursUntilDue}h</span>;
        } else if (timeUntilDue > 0) {
            return <span className="time-urgent">Due very soon!</span>;
        } else {
            return <span className="time-overdue">⚠️ Overdue</span>;
        }
    };

    const handleCardClick = () => {
        if (onClick) {
            onClick(homework);
        }
    };

    const handleActionClick = (
        e: React.MouseEvent,
        action: (homework: HomeworkAssignment) => void
    ) => {
        e.stopPropagation();
        action(homework);
    };

    // Use stats from homework if available
    const stats = homework.stats;

    // ========== Reset Student Feature ==========
    const [showResetModal, setShowResetModal] = useState(false);
    const [mobileExpanded, setMobileExpanded] = useState(false);
    const [submissions, setSubmissions] = useState<HomeworkSubmission[]>([]);
    const [loadingSubmissions, setLoadingSubmissions] = useState(false);
    const [resetTarget, setResetTarget] = useState<{ studentId: string; studentName: string } | null>(null);
    const [isResetting, setIsResetting] = useState(false);
    const [resetMessage, setResetMessage] = useState<{ success: boolean; text: string } | null>(null);

    // Deduplicate submissions by studentId (show latest per student)
    const studentSubmissions = React.useMemo(() => {
        const byStudent = new Map<string, HomeworkSubmission>();
        for (const sub of submissions) {
            const existing = byStudent.get(sub.studentId);
            if (!existing || sub.attemptNumber > existing.attemptNumber) {
                byStudent.set(sub.studentId, sub);
            }
        }
        return Array.from(byStudent.values());
    }, [submissions]);

    const openResetModal = useCallback(async (e: React.MouseEvent) => {
        e.stopPropagation();
        setShowResetModal(true);
        setResetTarget(null);
        setResetMessage(null);
        setLoadingSubmissions(true);
        try {
            const subs = await getHomeworkSubmissions(homework.id);
            setSubmissions(subs);
        } catch (err) {
            console.error('Failed to load submissions:', err);
            setSubmissions([]);
        } finally {
            setLoadingSubmissions(false);
        }
    }, [homework.id]);

    const handleResetConfirm = useCallback(async () => {
        if (!resetTarget) return;
        setIsResetting(true);
        setResetMessage(null);
        try {
            const result = await resetStudentHomework(
                homework.id,
                resetTarget.studentId,
                homework.title || homework.materialTitle
            );
            setResetMessage({
                success: true,
                text: `✅ Reset complete: ${result.submissionsDeleted} submission(s) and ${result.resultsDeleted} result(s) deleted.`
            });
            // Remove the reset student from the local list
            setSubmissions(prev => prev.filter(s => s.studentId !== resetTarget.studentId));
            setResetTarget(null);
            // Notify parent to refresh
            if (onResetComplete) {
                setTimeout(() => onResetComplete(), 1000);
            }
        } catch (err) {
            setResetMessage({
                success: false,
                text: `❌ Reset failed: ${err instanceof Error ? err.message : 'Unknown error'}`
            });
        } finally {
            setIsResetting(false);
        }
    }, [resetTarget, homework.id, homework.title, homework.materialTitle, onResetComplete]);

    return (
        <div
            className={`homework-card ${isOverdue ? 'overdue' : ''} ${homework.archived ? 'archived' : ''} ${onClick ? 'clickable' : ''} ${mobileExpanded ? 'mobile-expanded' : ''}`}
            onClick={handleCardClick}
        >
            <div className="homework-card-header">
                <div className="homework-title-section">
                    <h3 className="homework-title">{homework.title || homework.materialTitle}</h3>
                    <div className="homework-status-row">
                        <HomeworkStatusBadge status={homework.status} />
                        {homework.archived ? (
                            <span className="homework-archived-badge">🗄️ Archived</span>
                        ) : null}
                    </div>
                </div>

                {(onEdit || onDuplicate || onDelete || onExtendDeadline || onRestore || onPermanentDelete) && (
                    <div className="homework-actions">
                        {homework.archived ? (
                            <>
                                {onRestore ? (
                                    <button
                                        className="action-btn restore-btn"
                                        onClick={(e) => handleActionClick(e, onRestore)}
                                        title="Restore homework"
                                        aria-label={`Restore ${homework.title || homework.materialTitle}`}
                                    >
                                        ♻️
                                    </button>
                                ) : null}
                                {onPermanentDelete ? (
                                    <button
                                        className="action-btn permanent-delete-btn"
                                        onClick={(e) => handleActionClick(e, onPermanentDelete)}
                                        title="Permanently delete homework"
                                        aria-label={`Permanently delete ${homework.title || homework.materialTitle}`}
                                    >
                                        🗑️
                                    </button>
                                ) : null}
                            </>
                        ) : (
                            <>
                                {onEdit && (
                                    <button
                                        className="action-btn edit-btn"
                                        onClick={(e) => handleActionClick(e, onEdit)}
                                        title="Edit homework"
                                        aria-label={`Edit ${homework.title || homework.materialTitle}`}
                                    >
                                        ✏️
                                    </button>
                                )}
                                {onDuplicate && (
                                    <button
                                        className="action-btn duplicate-btn"
                                        onClick={(e) => handleActionClick(e, onDuplicate)}
                                        title="Duplicate homework"
                                        aria-label={`Duplicate ${homework.title || homework.materialTitle}`}
                                    >
                                        📋
                                    </button>
                                )}
                                {onExtendDeadline && homework.status === 'active' && (
                                    <button
                                        className="action-btn extend-btn"
                                        onClick={(e) => handleActionClick(e, onExtendDeadline)}
                                        title="Extend deadline"
                                        aria-label={`Extend ${homework.title || homework.materialTitle}`}
                                    >
                                        ⏰
                                    </button>
                                )}
                                {onDelete && (
                                    <button
                                        className="action-btn delete-btn"
                                        onClick={(e) => handleActionClick(e, onDelete)}
                                        title="Delete homework"
                                        aria-label={`Archive ${homework.title || homework.materialTitle}`}
                                    >
                                        🗑️
                                    </button>
                                )}
                                <button
                                    className="action-btn reset-student-btn"
                                    onClick={openResetModal}
                                    title="Reset student's homework"
                                    aria-label={`Reset student homework for ${homework.title || homework.materialTitle}`}
                                >
                                    🔄
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>

            <div className="homework-card-body">
                <div className="homework-info-grid">
                    <div className="info-item">
                        <span className="info-label">Target:</span>
                        <span className="info-value">{getTargetDisplay()}</span>
                    </div>

                    <div className="info-item">
                        <span className="info-label">Available:</span>
                        <span className="info-value">{formatDate(availableFrom)}</span>
                    </div>

                    <div className="info-item">
                        <span className="info-label">Due:</span>
                        <span className="info-value">
                            {formatDate(dueDate)}
                            <span className="time-remaining">{getTimeUntilDueDisplay()}</span>
                        </span>
                    </div>

                    <div className="info-item">
                        <span className="info-label">Config:</span>
                        <span className="info-value">
                            {homework.config.timerMinutes ? `⏱️ ${homework.config.timerMinutes}min` : '⏱️ No limit'}
                            {' • '}
                            {homework.config.maxAttempts ? `🔄 ${homework.config.maxAttempts} attempts` : '🔄 Unlimited'}
                        </span>
                    </div>
                </div>

                {homework.description && (
                    <div className="homework-instructions">
                        <span className="instructions-label">Instructions:</span>
                        <p className="instructions-text">{homework.description}</p>
                    </div>
                )}

                {(homework.tags?.length ?? 0) > 0 ? (
                    <div style={{ marginTop: '0.9rem' }}>
                        <HomeworkTagChips tags={homework.tags ?? []} allTags={availableTags} />
                    </div>
                ) : null}

                {showSubmissionProgress && stats && (
                    <div className="submission-progress">
                        <div className="progress-header">
                            <span className="progress-label">Submissions</span>
                            <span className="progress-stats">
                                {stats.submitted} / {stats.totalAssigned}
                                {stats.averageScore !== undefined && (
                                    <span className="average-score">
                                        {' • '}Avg: {Math.round(stats.averageScore)}%
                                    </span>
                                )}
                            </span>
                        </div>
                        <div className="progress-bar">
                            <div
                                className="progress-fill"
                                style={{
                                    width: `${stats.totalAssigned > 0 ? (stats.submitted / stats.totalAssigned) * 100 : 0}%`,
                                }}
                            />
                        </div>
                    </div>
                )}
            </div>

                {/* Task 17.5: Mobile expand/collapse toggle */}
                <button
                    type="button"
                    className="hw-mobile-expand-toggle"
                    onClick={(e) => { e.stopPropagation(); setMobileExpanded((v) => !v); }}
                    style={{
                        display: 'none', /* shown via CSS media query */
                        width: '100%',
                        border: 'none',
                        background: 'transparent',
                        color: '#64748b',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        padding: '0.4rem 0',
                        cursor: 'pointer',
                        textAlign: 'center',
                    }}
                >
                    {mobileExpanded ? '▲ Show less' : '▼ Show more'}
                </button>

            {/* Reset Student Modal — native HTML dialog */}
            {showResetModal && (
                <div
                    className="homework-reset-overlay"
                    onClick={(e) => { e.stopPropagation(); setShowResetModal(false); }}
                >
                    <div
                        className="homework-reset-modal"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="reset-modal-header">
                            <h3>🔄 Reset Student Homework</h3>
                            <button
                                className="reset-modal-close"
                                onClick={() => setShowResetModal(false)}
                            >
                                ✕
                            </button>
                        </div>

                        <p className="reset-modal-subtitle">
                            Select a student to reset their homework for <strong>{homework.title || homework.materialTitle}</strong>
                        </p>

                        {resetMessage && (
                            <div className={`reset-message ${resetMessage.success ? 'success' : 'error'}`}>
                                {resetMessage.text}
                            </div>
                        )}

                        {resetTarget ? (
                            <div className="reset-confirm-section">
                                <div className="reset-warning">
                                    <p>⚠️ Are you sure you want to reset <strong>{resetTarget.studentName}</strong>'s homework?</p>
                                    <ul>
                                        <li>All submission attempts will be deleted</li>
                                        <li>All test results and scores will be removed</li>
                                        <li>The student will need to retake from scratch</li>
                                    </ul>
                                    <p className="reset-warning-note">This action cannot be undone.</p>
                                </div>
                                <div className="reset-confirm-actions">
                                    <button
                                        className="reset-btn-cancel"
                                        onClick={() => setResetTarget(null)}
                                        disabled={isResetting}
                                    >
                                        Back
                                    </button>
                                    <button
                                        className="reset-btn-confirm"
                                        onClick={handleResetConfirm}
                                        disabled={isResetting}
                                    >
                                        {isResetting ? '⏳ Resetting...' : '🔄 Reset Homework'}
                                    </button>
                                </div>
                            </div>
                        ) : loadingSubmissions ? (
                            <div className="reset-loading">⏳ Loading submissions...</div>
                        ) : studentSubmissions.length === 0 ? (
                            <div className="reset-empty">No students have submitted this homework yet.</div>
                        ) : (
                            <div className="reset-student-list">
                                {studentSubmissions.map((sub) => (
                                    <div key={sub.studentId} className="reset-student-row">
                                        <div className="reset-student-info">
                                            <span className="reset-student-name">
                                                {sub.studentName || sub.studentId}
                                            </span>
                                            <span className="reset-student-meta">
                                                {sub.status === 'submitted' || sub.status === 'graded'
                                                    ? `${sub.percentage !== undefined ? Math.round(sub.percentage) + '%' : 'Submitted'}`
                                                    : sub.status === 'in_progress'
                                                        ? '⏳ In Progress'
                                                        : sub.status
                                                }
                                                {sub.isLate && ' • 🔴 Late'}
                                            </span>
                                        </div>
                                        <button
                                            className="reset-student-btn"
                                            onClick={() => setResetTarget({
                                                studentId: sub.studentId,
                                                studentName: sub.studentName || sub.studentId
                                            })}
                                            title={`Reset homework for ${sub.studentName || sub.studentId}`}
                                        >
                                            🔄 Reset
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
