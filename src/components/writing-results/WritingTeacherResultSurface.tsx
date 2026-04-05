import React, { useEffect, useMemo, useState } from 'react';
import { RichContent } from '../../core/components/RichContent';
import GradingAuditTrail from '../writing-grading/GradingAuditTrail';
import AnnotatedEssayReadOnly from './AnnotatedEssayReadOnly';
import PublishedFeedbackPanel from './PublishedFeedbackPanel';
import WritingPublishedMarkupViewer from './WritingPublishedMarkupViewer';
import type { WritingSubmission } from '../../types/ielts-writing.types';
import type { WritingResultSurfaceData } from './writingResultSurface';
import { formatElapsedTime, getVisibleCriteriaEntries } from './writingResultSurface';

interface WritingTeacherResultSurfaceProps {
    data: WritingResultSurfaceData;
    submission: WritingSubmission;
    onOpenGrading?: () => void;
    onReopen?: () => void;
    onClose?: () => void;
    onMarkupViewChange?: (taskNumber: 1 | 2, mode: 'marked' | 'original') => void;
}

const CRITERIA_LABELS: Record<string, string> = {
    TA: 'Task Achievement',
    TR: 'Task Response',
    CC: 'Coherence & Cohesion',
    LR: 'Lexical Resource',
    GRA: 'Grammatical Range & Accuracy',
};

export default function WritingTeacherResultSurface({
    data,
    submission,
    onOpenGrading,
    onReopen,
    onClose,
    onMarkupViewChange,
}: WritingTeacherResultSurfaceProps) {
    const isActionable = data.viewerMode === 'teacher-actionable';
    const hasDraft = data.phase === 'pending-review' && Boolean(data.draftOwnerTeacherId);
    const [selectedFeedbackId, setSelectedFeedbackId] = useState<string | null>(null);
    const [selectedFeedbackAnchorViewportTop, setSelectedFeedbackAnchorViewportTop] = useState<number | null>(null);
    const publishedFeedbackIds = useMemo(
        () => new Set(data.tasks.flatMap((task) => [...task.comments, ...task.corrections].map((item) => item.id))),
        [data.tasks],
    );

    useEffect(() => {
        if (!selectedFeedbackId || publishedFeedbackIds.has(selectedFeedbackId)) {
            return;
        }

        setSelectedFeedbackId(null);
        setSelectedFeedbackAnchorViewportTop(null);
    }, [publishedFeedbackIds, selectedFeedbackId]);

    const handleEssayFeedbackSelect = (feedbackId: string, anchorViewportTop: number | null) => {
        setSelectedFeedbackId(feedbackId);
        setSelectedFeedbackAnchorViewportTop(anchorViewportTop);
    };

    return (
        <div style={{ display: 'grid', gap: '1rem', fontFamily: "'Inter', sans-serif" }}>
            <section style={heroCardStyle()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                    <div>
                        <div style={eyebrowStyle()}>{data.contextLabel}</div>
                        <h2 style={{ margin: '0.25rem 0 0', fontSize: '1.55rem', fontWeight: 800, color: '#0f172a' }}>
                            {submission.studentName}
                        </h2>
                        <div style={{ marginTop: '0.45rem', display: 'flex', gap: '0.6rem', flexWrap: 'wrap', color: '#64748b', fontSize: '0.84rem' }}>
                            <span>{data.testTitle}</span>
                            <span>{data.formatLabel}</span>
                            <span>{new Date(data.submittedAt).toLocaleDateString()}</span>
                            <span>{formatElapsedTime(data.totalElapsedTimeSeconds)}</span>
                            <span>{data.totalWordCount} words</span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'flex-end' }}>
                        {data.phase === 'published' && data.bandSummaryItems.map((item) => (
                            <div
                                key={item.key}
                                style={{
                                    minWidth: 92,
                                    padding: '0.7rem 0.82rem',
                                    borderRadius: '16px',
                                    border: item.tone === 'overall' ? '1px solid rgba(79, 70, 229, 0.2)' : '1px solid rgba(148, 163, 184, 0.22)',
                                    background: item.tone === 'overall' ? 'rgba(238, 242, 255, 0.96)' : 'rgba(255,255,255,0.8)',
                                    textAlign: 'center',
                                }}
                            >
                                <div style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b' }}>
                                    {item.label}
                                </div>
                                <div style={{ marginTop: '0.2rem', fontSize: item.tone === 'overall' ? '1.4rem' : '1.05rem', fontWeight: 800, color: '#0f172a' }}>
                                    {item.band !== null ? item.band.toFixed(1) : '—'}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    {data.phase === 'pending-review' && isActionable && onOpenGrading && (
                        <ActionButton label={hasDraft ? 'Resume Draft' : 'Grade Now'} onClick={onOpenGrading} tone="primary" />
                    )}
                    {data.phase === 'published' && isActionable && onReopen && (
                        <ActionButton label="Reopen Grading" onClick={onReopen} tone="secondary" />
                    )}
                    {onClose && (
                        <ActionButton label="Close" onClick={onClose} tone="ghost" />
                    )}
                </div>

                {data.phase === 'pending-review' ? (
                    <StatusNotice
                        tone={isActionable ? 'warning' : 'info'}
                        title={isActionable ? (hasDraft ? 'Draft in progress' : 'Awaiting grading') : 'Read-only pending review'}
                        body={
                            isActionable
                                ? (hasDraft
                                    ? 'A private grading draft exists for this submission. Resume from the grading tool to continue.'
                                    : 'This submission is ready for grading. The result page stays blank until feedback is published.')
                                : 'This submission is visible to you, but grading actions are disabled by visibility ownership rules.'
                        }
                    />
                ) : (
                    <StatusNotice
                        tone="info"
                        title={data.teacherName ? `Published by ${data.teacherName}` : 'Published feedback'}
                        body={data.auditVersion ? `Current published version: v${data.auditVersion}. Latest student-visible data comes from the published grading artifact.` : 'Student-visible data is sourced from the published grading artifact.'}
                    />
                )}
            </section>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.55fr) minmax(300px, 0.95fr)', gap: '1rem', alignItems: 'start' }}>
                <div style={{ display: 'grid', gap: '1rem' }}>
                    {data.tasks.map((task) => (
                        <section key={task.taskNumber} style={surfaceCardStyle()}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '1rem', flexWrap: 'wrap' }}>
                                <div>
                                    <div style={eyebrowStyle()}>{task.taskType || `Task ${task.taskNumber}`}</div>
                                    <h3 style={{ margin: '0.2rem 0 0', fontSize: '1.08rem', fontWeight: 800, color: '#0f172a' }}>
                                        Task {task.taskNumber}
                                    </h3>
                                </div>
                                <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap', color: '#64748b', fontSize: '0.8rem' }}>
                                    <span>{task.wordCount} words</span>
                                    <span>{formatElapsedTime(task.activeTimeSeconds)}</span>
                                    {task.isVoided && (
                                        <span style={{ color: '#b91c1c', fontWeight: 700 }}>
                                            Voided{task.voidReason ? `: ${task.voidReason}` : ''}
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div style={{ marginTop: '0.95rem', padding: '0.95rem 1rem', borderRadius: '16px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: '0.45rem' }}>
                                    Prompt
                                </div>
                                <div style={{ color: '#1f2937', fontSize: '0.94rem', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                                    {task.promptText}
                                </div>
                            </div>

                            <div style={{ marginTop: '1rem' }}>
                                {data.phase === 'published' ? (
                                    task.markedContent || task.comments.length > 0 || task.corrections.length > 0 ? (
                                        <WritingPublishedMarkupViewer
                                            originalEssayText={task.essayText}
                                            markedContent={task.markedContent}
                                            comments={task.comments}
                                            corrections={task.corrections}
                                            onViewModeChange={(mode) => onMarkupViewChange?.(task.taskNumber, mode)}
                                            onFeedbackSelect={handleEssayFeedbackSelect}
                                        />
                                    ) : task.fallbackAnnotations.length > 0 ? (
                                        <AnnotatedEssayReadOnly essayText={task.essayText} annotations={task.fallbackAnnotations} />
                                    ) : (
                                        <PlainEssayCard essayText={task.essayText} />
                                    )
                                ) : (
                                    <PlainEssayCard essayText={task.essayText} />
                                )}
                            </div>
                        </section>
                    ))}
                </div>

                <aside style={{ display: 'grid', gap: '1rem', position: 'sticky', top: 24 }}>
                    {data.phase === 'published' ? (
                        <>
                            <section style={surfaceCardStyle()}>
                                <div style={eyebrowStyle()}>Published Feedback</div>
                                <h3 style={{ margin: '0.2rem 0 0', fontSize: '1.02rem', fontWeight: 800, color: '#0f172a' }}>
                                    Task Summary
                                </h3>
                                <div style={{ display: 'grid', gap: '0.9rem', marginTop: '0.95rem' }}>
                                    {data.tasks.map((task) => (
                                        <div key={task.taskNumber} style={{ padding: '0.95rem', borderRadius: '16px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'baseline', marginBottom: '0.45rem' }}>
                                                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#111827' }}>Task {task.taskNumber}</span>
                                                {task.taskBand !== null && (
                                                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#4f46e5' }}>
                                                        Band {task.taskBand.toFixed(1)}
                                                    </span>
                                                )}
                                            </div>
                                            {task.taskSummary ? (
                                                <RichContent content={task.taskSummary} style={{ color: '#374151', lineHeight: 1.6, fontSize: '0.88rem' }} />
                                            ) : (
                                                <div style={{ color: '#9ca3af', fontSize: '0.85rem' }}>No published summary.</div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </section>

                            <section style={surfaceCardStyle()}>
                                <div style={eyebrowStyle()}>Published Feedback</div>
                                <h3 style={{ margin: '0.2rem 0 0', fontSize: '1.02rem', fontWeight: 800, color: '#0f172a' }}>
                                    Comments & Corrections
                                </h3>
                                <div style={{ display: 'grid', gap: '0.95rem', marginTop: '0.95rem' }}>
                                    {data.tasks.map((task) => (
                                        <div key={`feedback-${task.taskNumber}`} style={{ padding: '0.95rem', borderRadius: '16px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                                            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#111827', marginBottom: '0.7rem' }}>
                                                Task {task.taskNumber}
                                            </div>
                                            <PublishedFeedbackPanel
                                                comments={task.comments}
                                                corrections={task.corrections}
                                                selectedFeedbackId={selectedFeedbackId}
                                                selectedFeedbackAnchorViewportTop={selectedFeedbackAnchorViewportTop}
                                                alignToEssay
                                                maxHeight="min(52vh, 560px)"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </section>

                            <section style={surfaceCardStyle()}>
                                <div style={eyebrowStyle()}>Published Feedback</div>
                                <h3 style={{ margin: '0.2rem 0 0', fontSize: '1.02rem', fontWeight: 800, color: '#0f172a' }}>
                                    Criteria Feedback
                                </h3>
                                <div style={{ display: 'grid', gap: '0.95rem', marginTop: '0.95rem' }}>
                                    {data.tasks.map((task) => {
                                        const entries = getVisibleCriteriaEntries(task);
                                        if (entries.length === 0) {
                                            return null;
                                        }

                                        return (
                                            <div key={`criteria-${task.taskNumber}`} style={{ padding: '0.95rem', borderRadius: '16px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                                                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#111827', marginBottom: '0.7rem' }}>
                                                    Task {task.taskNumber}
                                                </div>
                                                <div style={{ display: 'grid', gap: '0.85rem' }}>
                                                    {entries.map((entry) => (
                                                        <div key={`${task.taskNumber}-${entry.key}`}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.25rem' }}>
                                                                <span style={{ fontSize: '0.79rem', fontWeight: 700, color: '#111827' }}>
                                                                    {CRITERIA_LABELS[entry.key] || entry.key}
                                                                </span>
                                                                {entry.score !== undefined && (
                                                                    <span style={{ fontSize: '0.78rem', color: '#4f46e5', fontWeight: 700 }}>
                                                                        {entry.score}/9
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {entry.feedback ? (
                                                                <RichContent content={entry.feedback} style={{ color: '#4b5563', lineHeight: 1.55, fontSize: '0.86rem' }} />
                                                            ) : (
                                                                <div style={{ color: '#9ca3af', fontSize: '0.84rem' }}>No published note.</div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>

                            {submission.auditTrail?.length > 0 && (
                                <section style={surfaceCardStyle()}>
                                    <div style={eyebrowStyle()}>Audit</div>
                                    <h3 style={{ margin: '0.2rem 0 0.85rem', fontSize: '1.02rem', fontWeight: 800, color: '#0f172a' }}>
                                        Version History
                                    </h3>
                                    <GradingAuditTrail entries={submission.auditTrail} />
                                </section>
                            )}
                        </>
                    ) : (
                        <section style={surfaceCardStyle()}>
                            <div style={eyebrowStyle()}>Submission Facts</div>
                            <h3 style={{ margin: '0.2rem 0 0', fontSize: '1.02rem', fontWeight: 800, color: '#0f172a' }}>
                                Pending Review
                            </h3>
                            <div style={{ display: 'grid', gap: '0.7rem', marginTop: '0.9rem', color: '#475569', fontSize: '0.9rem' }}>
                                <div>The student can only see the blank waiting state until feedback is published.</div>
                                <div>Published result content must come from `publishedGrading`, not private draft state.</div>
                                <div>{isActionable ? 'Use the grading tool to continue from this submission.' : 'This teacher view is intentionally read-only.'}</div>
                            </div>
                        </section>
                    )}
                </aside>
            </div>
        </div>
    );
}

function StatusNotice({
    tone,
    title,
    body,
}: {
    tone: 'warning' | 'info';
    title: string;
    body: string;
}) {
    const warning = tone === 'warning';
    return (
        <div
            style={{
                marginTop: '1rem',
                padding: '0.95rem 1rem',
                borderRadius: '16px',
                background: warning ? 'rgba(254, 243, 199, 0.92)' : 'rgba(239, 246, 255, 0.92)',
                border: warning ? '1px solid rgba(245, 158, 11, 0.22)' : '1px solid rgba(59, 130, 246, 0.18)',
            }}
        >
            <div style={{ fontSize: '0.84rem', fontWeight: 800, color: warning ? '#92400e' : '#1d4ed8' }}>
                {title}
            </div>
            <div style={{ marginTop: '0.3rem', fontSize: '0.85rem', lineHeight: 1.55, color: warning ? '#b45309' : '#3b82f6' }}>
                {body}
            </div>
        </div>
    );
}

function ActionButton({
    label,
    onClick,
    tone,
}: {
    label: string;
    onClick: () => void;
    tone: 'primary' | 'secondary' | 'ghost';
}) {
    const styles = tone === 'primary'
        ? { background: '#111827', color: '#ffffff', border: '1px solid #111827' }
        : tone === 'secondary'
            ? { background: '#ffffff', color: '#4f46e5', border: '1px solid #c7d2fe' }
            : { background: '#ffffff', color: '#475569', border: '1px solid #dbe4ee' };

    return (
        <button
            type="button"
            onClick={onClick}
            style={{
                ...styles,
                borderRadius: 999,
                padding: '0.62rem 1rem',
                fontSize: '0.84rem',
                fontWeight: 700,
                cursor: 'pointer',
            }}
        >
            {label}
        </button>
    );
}

function PlainEssayCard({ essayText }: { essayText: string }) {
    return (
        <div style={{ border: '1px solid #dbe4ee', borderRadius: '18px', background: '#ffffff', padding: '1rem 1.1rem', whiteSpace: 'pre-wrap', lineHeight: 1.8, color: '#1f2937', fontSize: '0.95rem' }}>
            {essayText || 'No essay submitted'}
        </div>
    );
}

function heroCardStyle(): React.CSSProperties {
    return {
        background: 'linear-gradient(135deg, rgba(248, 250, 252, 0.98) 0%, rgba(239, 246, 255, 0.92) 100%)',
        border: '1px solid rgba(148, 163, 184, 0.18)',
        borderRadius: '24px',
        padding: '1.25rem 1.3rem',
        boxShadow: '0 18px 40px rgba(15, 23, 42, 0.08)',
    };
}

function surfaceCardStyle(): React.CSSProperties {
    return {
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '20px',
        padding: '1.1rem 1.15rem',
        boxShadow: '0 12px 28px rgba(15, 23, 42, 0.05)',
    };
}

function eyebrowStyle(): React.CSSProperties {
    return {
        fontSize: '0.7rem',
        fontWeight: 800,
        color: '#64748b',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
    };
}
