/**
 * WritingResultView — PRD-0030 Task 6.1
 * Student-facing result display with 3 states:
 * A) pending-review: banner + summary + read-only essay (no annotations)
 * B) Partially graded: scored tasks show criteria, unscored shows "pending"
 * C) Fully graded: band + criteria + feedback + annotated essay + model answer
 * NO MANTINE.
 */

import { useMemo } from 'react';
import type { WritingSubmission } from '../../types/ielts-writing.types';
import AnnotatedEssayReadOnly from './AnnotatedEssayReadOnly';
import CriteriaScoreChart from './CriteriaScoreChart';

interface WritingResultViewProps {
    submission: WritingSubmission;
}

const CRITERIA_LABELS: Record<string, string> = {
    TA: 'Task Achievement',
    TR: 'Task Response',
    CC: 'Coherence & Cohesion',
    LR: 'Lexical Resource',
    GRA: 'Grammatical Range & Accuracy',
};

export default function WritingResultView({ submission }: WritingResultViewProps) {
    const { markingStatus, grading, tasks, annotations } = submission;

    // Determine state
    const state = useMemo(() => {
        if (markingStatus === 'pending-review') return 'pending' as const;
        if (!grading) return 'pending' as const;
        const hasUngraded = grading.perTask.some(t => !t.isVoided && t.taskBand === 0);
        return hasUngraded ? 'partial' as const : 'graded' as const;
    }, [markingStatus, grading]);

    // ─── A) Pending Review ─────────────────────────────────────
    if (state === 'pending') {
        return (
            <div style={{ fontFamily: "'Inter', sans-serif" }}>
                {/* Banner */}
                <div style={{
                    padding: '1rem 1.25rem',
                    background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
                    borderRadius: '10px',
                    marginBottom: '1.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                }}>
                    <span style={{ fontSize: '1.5rem' }}>⏳</span>
                    <div>
                        <div style={{ fontWeight: 700, color: '#92400e', fontSize: '0.95rem' }}>
                            Pending Teacher Review
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#a16207', marginTop: '2px' }}>
                            Your essay has been submitted and is waiting to be graded.
                        </div>
                    </div>
                </div>

                {/* Summary */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                    gap: '0.75rem',
                    marginBottom: '1.5rem',
                }}>
                    <StatCard label="Format" value={submission.testMeta.format.toUpperCase()} />
                    <StatCard label="Word Count" value={tasks.reduce((s, t) => s + t.wordCount, 0).toString()} />
                    <StatCard label="Time Spent" value={formatDuration(submission.totalElapsedTimeSeconds)} />
                    <StatCard label="Submitted" value={new Date(submission.submittedAt).toLocaleDateString()} />
                </div>

                {/* Read-only essays */}
                {tasks.map(task => (
                    <div key={task.taskNumber} style={{ marginBottom: '1.5rem' }}>
                        <div style={{
                            fontSize: '0.85rem', fontWeight: 700,
                            color: '#475569', marginBottom: '0.5rem',
                        }}>
                            Task {task.taskNumber}
                        </div>
                        <AnnotatedEssayReadOnly
                            essayText={task.essayText}
                            annotations={[]}
                        />
                    </div>
                ))}
            </div>
        );
    }

    // ─── B & C) Graded / Partially Graded ──────────────────────
    if (!grading) return null;

    return (
        <div style={{ fontFamily: "'Inter', sans-serif" }}>
            {/* State-specific banner */}
            {state === 'partial' && (
                <div style={{
                    padding: '0.75rem 1rem',
                    background: '#dbeafe',
                    borderRadius: '8px',
                    marginBottom: '1.25rem',
                    fontSize: '0.8rem',
                    color: '#1e40af',
                    fontWeight: 500,
                }}>
                    ℹ️ Some tasks are still pending grading. Your teacher will complete the review soon.
                </div>
            )}

            {/* Overall Band — only for fully graded */}
            {state === 'graded' && (
                <div style={{
                    textAlign: 'center',
                    marginBottom: '1.5rem',
                    padding: '1.5rem',
                    background: 'linear-gradient(135deg, #eff6ff, #f0fdf4)',
                    borderRadius: '16px',
                    border: '1px solid #e0f2fe',
                }}>
                    <div style={{
                        fontSize: '0.7rem', fontWeight: 600,
                        color: '#64748b', textTransform: 'uppercase',
                        letterSpacing: '1px', marginBottom: '0.25rem',
                    }}>
                        Overall Band Score
                    </div>
                    <div style={{
                        fontSize: '3.5rem', fontWeight: 900,
                        background: 'linear-gradient(135deg, #3b82f6, #10b981)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                        lineHeight: 1.1,
                    }}>
                        {grading.overallBand.toFixed(1)}
                    </div>
                    <div style={{
                        fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem',
                    }}>
                        Graded by teacher on {new Date(grading.gradedAt).toLocaleDateString()}
                    </div>
                </div>
            )}

            {/* Criteria Chart */}
            <div style={{ marginBottom: '1.5rem' }}>
                <CriteriaScoreChart perTask={grading.perTask} />
            </div>

            {/* Per-task breakdown */}
            {grading.perTask.map(taskResult => {
                const taskData = tasks.find(t => t.taskNumber === taskResult.taskNumber);
                const taskAnnotations = annotations.filter(a => a.taskNumber === taskResult.taskNumber);

                return (
                    <div key={taskResult.taskNumber} style={{
                        marginBottom: '1.5rem',
                        padding: '1.25rem',
                        borderRadius: '10px',
                        border: '1px solid #e2e8f0',
                        background: '#fff',
                    }}>
                        <div style={{
                            display: 'flex', justifyContent: 'space-between',
                            alignItems: 'center', marginBottom: '1rem',
                        }}>
                            <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
                                Task {taskResult.taskNumber}
                            </span>
                            {taskResult.isVoided ? (
                                <span style={{
                                    padding: '3px 10px', borderRadius: '6px',
                                    background: '#fef2f2', color: '#dc2626',
                                    fontSize: '0.7rem', fontWeight: 600,
                                }}>
                                    Voided{taskResult.voidReason ? `: ${taskResult.voidReason}` : ''}
                                </span>
                            ) : (
                                <span style={{
                                    padding: '4px 12px', borderRadius: '8px',
                                    background: '#eff6ff', color: '#1d4ed8',
                                    fontWeight: 700, fontSize: '0.85rem',
                                }}>
                                    Band {taskResult.taskBand}
                                </span>
                            )}
                        </div>

                        {/* Criteria scores row */}
                        {!taskResult.isVoided && (
                            <div style={{
                                display: 'flex', gap: '0.5rem', flexWrap: 'wrap',
                                marginBottom: '1rem',
                            }}>
                                {Object.entries(taskResult.criteriaScores)
                                    .filter(([, v]) => v !== undefined)
                                    .map(([key, value]) => (
                                        <div key={key} style={{
                                            padding: '4px 10px', borderRadius: '6px',
                                            background: '#f8fafc', border: '1px solid #e2e8f0',
                                            fontSize: '0.75rem', color: '#475569',
                                        }}>
                                            <strong>{CRITERIA_LABELS[key] || key}:</strong> {value}/9
                                        </div>
                                    ))
                                }
                            </div>
                        )}

                        {/* Annotated essay */}
                        {taskData && (
                            <AnnotatedEssayReadOnly
                                essayText={taskData.essayText}
                                annotations={taskAnnotations}
                            />
                        )}
                    </div>
                );
            })}

            {/* Feedback sections */}
            {grading.feedback && (
                <div style={{
                    padding: '1.25rem',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    background: '#fff',
                    marginBottom: '1.5rem',
                }}>
                    <div style={{
                        fontSize: '0.9rem', fontWeight: 700,
                        color: '#0f172a', marginBottom: '1rem',
                    }}>
                        📝 Teacher Feedback
                    </div>

                    {/* Overall feedback */}
                    {grading.feedback.overall && (
                        <div style={{ marginBottom: '1rem' }}>
                            <div style={{
                                fontSize: '0.75rem', fontWeight: 600,
                                color: '#64748b', marginBottom: '0.25rem',
                            }}>
                                Overall
                            </div>
                            <div
                                style={{
                                    fontSize: '0.85rem', lineHeight: '1.6', color: '#334155',
                                    padding: '0.75rem', background: '#f8fafc',
                                    borderRadius: '8px', border: '1px solid #f1f5f9',
                                }}
                                dangerouslySetInnerHTML={{ __html: grading.feedback.overall }}
                            />
                        </div>
                    )}

                    {/* Per-criteria feedback */}
                    {Object.entries(grading.feedback.perCriteria)
                        .filter(([, html]) => html && typeof html === 'string' && html.trim())
                        .map(([key, html]) => (
                            <div key={key} style={{ marginBottom: '0.75rem' }}>
                                <div style={{
                                    fontSize: '0.75rem', fontWeight: 600,
                                    color: '#64748b', marginBottom: '0.25rem',
                                }}>
                                    {CRITERIA_LABELS[key] || key}
                                </div>
                                <div
                                    style={{
                                        fontSize: '0.85rem', lineHeight: '1.6', color: '#334155',
                                        padding: '0.75rem', background: '#f8fafc',
                                        borderRadius: '8px', border: '1px solid #f1f5f9',
                                    }}
                                    dangerouslySetInnerHTML={{ __html: html as string }}
                                />
                            </div>
                        ))
                    }
                </div>
            )}

            {/* Model answers — requires test data (not in submission). Future enhancement. */}
        </div>
    );
}

// ─── Helpers ────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string }) {
    return (
        <div style={{
            padding: '0.75rem',
            borderRadius: '8px',
            background: '#fff',
            border: '1px solid #e2e8f0',
            textAlign: 'center',
        }}>
            <div style={{ fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>
                {label}
            </div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>
                {value}
            </div>
        </div>
    );
}

function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m > 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
    return `${m}m ${s}s`;
}
