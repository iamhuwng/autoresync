/**
 * StudentResultOverview — Grading Editor Redesign (Phase 2)
 * Student-facing result overview with band scores, feedback, and "View Detailed Markup" link.
 * Responsive: mobile-first with desktop grid breakpoints.
 * NO MANTINE.
 */

import { useMemo } from 'react';
import type { WritingSubmission, GradingComment } from '../../types/ielts-writing.types';
import { COMMENT_CATEGORIES } from '../../types/ielts-writing.types';
import './StudentResultOverview.css';

interface StudentResultOverviewProps {
    submission: WritingSubmission;
    onViewDetailedMarkup?: () => void;
}

const CRITERIA_LABELS: Record<string, string> = {
    TA: 'Task Achievement',
    TR: 'Task Response',
    CC: 'Coherence & Cohesion',
    LR: 'Lexical Resource',
    GRA: 'Grammatical Range & Accuracy',
};

const CRITERIA_SHORT: Record<string, string> = {
    TA: 'TA',
    TR: 'TR',
    CC: 'CC',
    LR: 'LR',
    GRA: 'GRA',
};

export default function StudentResultOverview({ submission, onViewDetailedMarkup }: StudentResultOverviewProps) {
    const { markingStatus, grading, tasks, comments } = submission;

    // Determine state
    const state = useMemo(() => {
        if (markingStatus === 'pending-review') return 'pending' as const;
        if (!grading) return 'pending' as const;
        const hasUngraded = grading.perTask.some(t => !t.isVoided && t.taskBand === 0);
        return hasUngraded ? 'partial' as const : 'graded' as const;
    }, [markingStatus, grading]);

    const activeComments = useMemo(() => {
        if (!comments || !Array.isArray(comments)) return [];
        return comments.filter((c: GradingComment) => c.status === 'active');
    }, [comments]);

    const commentCount = activeComments.length;

    // ─── Pending ──────────────────────────────────────────────
    if (state === 'pending') {
        return (
            <div className="sro-container">
                <div className="sro-banner pending">
                    <span className="sro-banner-icon">⏳</span>
                    <div>
                        <div className="sro-banner-title">Pending Teacher Review</div>
                        <div className="sro-banner-sub">Your essay has been submitted and is waiting to be graded.</div>
                    </div>
                </div>

                <div className="sro-stats-row">
                    <div className="sro-stat-card">
                        <div className="sro-stat-label">Format</div>
                        <div className="sro-stat-value">{submission.testMeta.format.toUpperCase()}</div>
                    </div>
                    <div className="sro-stat-card">
                        <div className="sro-stat-label">Word Count</div>
                        <div className="sro-stat-value">{tasks.reduce((s, t) => s + t.wordCount, 0)}</div>
                    </div>
                    <div className="sro-stat-card">
                        <div className="sro-stat-label">Time Spent</div>
                        <div className="sro-stat-value">{formatDuration(submission.totalElapsedTimeSeconds)}</div>
                    </div>
                    <div className="sro-stat-card">
                        <div className="sro-stat-label">Submitted</div>
                        <div className="sro-stat-value">{new Date(submission.submittedAt).toLocaleDateString()}</div>
                    </div>
                </div>
            </div>
        );
    }

    // ─── Graded / Partial ─────────────────────────────────────
    if (!grading) return null;

    return (
        <div className="sro-container">
            {/* Partial banner */}
            {state === 'partial' && (
                <div className="sro-banner partial">
                    <span className="sro-banner-icon">ℹ️</span>
                    <div>
                        <div className="sro-banner-title">Partially Graded</div>
                        <div className="sro-banner-sub">Some tasks are still pending. Your teacher will complete the review soon.</div>
                    </div>
                </div>
            )}

            {/* Overall Band Hero */}
            {state === 'graded' && (
                <div className="sro-band-hero" id="sro-band-hero">
                    <div className="sro-band-label">Overall Band Score</div>
                    <div className="sro-band-value">{grading.overallBand.toFixed(1)}</div>
                    <div className="sro-band-teacher">
                        Graded by {grading.teacherName || 'teacher'} on {new Date(grading.gradedAt).toLocaleDateString()}
                    </div>
                </div>
            )}

            {/* Criteria Grid */}
            <div className="sro-criteria-grid">
                {grading.perTask.map(taskResult => {
                    if (taskResult.isVoided) return null;
                    return Object.entries(taskResult.criteriaScores)
                        .filter(([, v]) => v !== undefined && v > 0)
                        .map(([key, value]) => (
                            <div className="sro-criteria-card" key={`${taskResult.taskNumber}-${key}`}>
                                <div className="sro-criteria-label">
                                    {CRITERIA_SHORT[key] || key} {grading.perTask.length > 1 ? `(T${taskResult.taskNumber})` : ''}
                                </div>
                                <div className="sro-criteria-score">
                                    {value}<span className="sro-criteria-max">/9</span>
                                </div>
                            </div>
                        ));
                })}
            </div>

            {/* Per-task breakdown */}
            {grading.perTask.map(taskResult => (
                <div className="sro-task-card" key={taskResult.taskNumber}>
                    <div className="sro-task-header">
                        <span className="sro-task-title">Task {taskResult.taskNumber}</span>
                        {taskResult.isVoided ? (
                            <span className="sro-task-voided">
                                Voided{taskResult.voidReason ? `: ${taskResult.voidReason}` : ''}
                            </span>
                        ) : (
                            <span className="sro-task-band">Band {taskResult.taskBand}</span>
                        )}
                    </div>
                    {!taskResult.isVoided && (
                        <div className="sro-task-criteria-row">
                            {Object.entries(taskResult.criteriaScores)
                                .filter(([, v]) => v !== undefined)
                                .map(([key, value]) => (
                                    <div className="sro-task-criteria-chip" key={key}>
                                        <strong>{CRITERIA_LABELS[key] || key}:</strong> {value}/9
                                    </div>
                                ))}
                        </div>
                    )}
                </div>
            ))}

            {/* Feedback Section */}
            {grading.feedback && (
                <div className="sro-feedback-section">
                    <div className="sro-feedback-title">📝 Teacher Feedback</div>

                    {grading.feedback.overall && (
                        <div className="sro-feedback-block">
                            <div className="sro-feedback-label">Overall</div>
                            <div
                                className="sro-feedback-text"
                                dangerouslySetInnerHTML={{ __html: grading.feedback.overall }}
                            />
                        </div>
                    )}

                    {Object.entries(grading.feedback.perCriteria)
                        .filter(([, html]) => html && typeof html === 'string' && html.trim())
                        .map(([key, html]) => (
                            <div className="sro-feedback-block" key={key}>
                                <div className="sro-feedback-label">{CRITERIA_LABELS[key] || key}</div>
                                <div
                                    className="sro-feedback-text"
                                    dangerouslySetInnerHTML={{ __html: html as string }}
                                />
                            </div>
                        ))}
                </div>
            )}

            {/* Comments + View Detailed Markup */}
            <div className="sro-comments-row" id="sro-comments-row">
                <span className="sro-comments-count">
                    💬 {commentCount} {commentCount === 1 ? 'comment' : 'comments'} on your essay
                    {commentCount > 0 && (
                        <span>
                            {' '}({getCategoryBreakdown(activeComments)})
                        </span>
                    )}
                </span>
                {onViewDetailedMarkup && commentCount > 0 && (
                    <button
                        className="sro-view-markup-btn"
                        onClick={onViewDetailedMarkup}
                        id="sro-view-markup-btn"
                    >
                        View Detailed Markup →
                    </button>
                )}
            </div>
        </div>
    );
}

// ─── Helpers ────────────────────────────────────────────

function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m > 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
    return `${m}m ${s}s`;
}

function getCategoryBreakdown(comments: GradingComment[]): string {
    const counts: Record<string, number> = {};
    for (const c of comments) {
        const label = COMMENT_CATEGORIES[c.categoryId as keyof typeof COMMENT_CATEGORIES]?.label || c.categoryLabel;
        counts[label] = (counts[label] || 0) + 1;
    }
    return Object.entries(counts)
        .map(([label, count]) => `${count} ${label}`)
        .join(', ');
}
