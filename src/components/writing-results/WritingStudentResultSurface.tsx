import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { RichContent } from '../../core/components/RichContent';
import AnnotatedEssayReadOnly from './AnnotatedEssayReadOnly';
import WritingPublishedMarkupViewer from './WritingPublishedMarkupViewer';
import type {
    PublishedFeedbackItem,
    WritingResultSurfaceData,
    WritingResultTaskData,
} from './writingResultSurface';
import { formatElapsedTime, getVisibleCriteriaEntries } from './writingResultSurface';

interface WritingStudentResultSurfaceProps {
    data: WritingResultSurfaceData;
    variant?: 'page' | 'panel';
    forceWidePanelLayout?: boolean;
    releaseNotice?: {
        title: string;
        body: string;
        tone: 'warning' | 'info';
    } | null;
    onMarkupViewChange?: (taskNumber: 1 | 2, mode: 'marked' | 'original') => void;
    onCriteriaToggle?: (expanded: boolean) => void;
}

type StudentPanelTab = 'prompt' | 'comments' | 'scoring';

const CRITERIA_LABELS: Record<string, string> = {
    TA: 'Task Achievement',
    TR: 'Task Response',
    CC: 'Coherence & Cohesion',
    LR: 'Lexical Resource',
    GRA: 'Grammatical Range & Accuracy',
};

export default function WritingStudentResultSurface({
    data,
    variant = 'page',
    forceWidePanelLayout = false,
    releaseNotice = null,
    onMarkupViewChange,
    onCriteriaToggle,
}: WritingStudentResultSurfaceProps) {
    const [criteriaExpanded, setCriteriaExpanded] = useState(false);
    const [activeTaskNumber, setActiveTaskNumber] = useState<1 | 2>(data.tasks[0]?.taskNumber ?? 1);
    const [panelTab, setPanelTab] = useState<StudentPanelTab>('prompt');
    const [selectedFeedbackId, setSelectedFeedbackId] = useState<string | null>(null);
    const [selectedFeedbackAnchorViewportTop, setSelectedFeedbackAnchorViewportTop] = useState<number | null>(null);
    const isPanel = variant === 'panel';
    const useSplitLayout = variant === 'page' || forceWidePanelLayout;
    const bandColumnCount = data.bandSummaryItems.length >= 3 ? 3 : Math.max(1, data.bandSummaryItems.length);
    const activeTask = useMemo(
        () => data.tasks.find((task) => task.taskNumber === activeTaskNumber) ?? data.tasks[0] ?? null,
        [activeTaskNumber, data.tasks],
    );
    const activeCriteriaEntries = useMemo(
        () => (activeTask ? getVisibleCriteriaEntries(activeTask) : []),
        [activeTask],
    );
    const activeFeedbackItems = useMemo(
        () => activeTask
            ? [...activeTask.comments, ...activeTask.corrections].sort((left, right) => left.from - right.from)
            : [],
        [activeTask],
    );
    const scoringLocked = data.phase !== 'published';
    const commentsLocked = data.phase !== 'published';

    useEffect(() => {
        if (!activeTask) {
            return;
        }

        if (!data.tasks.some((task) => task.taskNumber === activeTaskNumber)) {
            setActiveTaskNumber(activeTask.taskNumber);
        }
    }, [activeTask, activeTaskNumber, data.tasks]);

    useEffect(() => {
        if ((panelTab === 'comments' && commentsLocked) || (panelTab === 'scoring' && scoringLocked)) {
            setPanelTab('prompt');
        }
    }, [commentsLocked, panelTab, scoringLocked]);

    useEffect(() => {
        if (!selectedFeedbackId) {
            return;
        }

        if (!activeFeedbackItems.some((item) => item.id === selectedFeedbackId)) {
            setSelectedFeedbackId(null);
            setSelectedFeedbackAnchorViewportTop(null);
        }
    }, [activeFeedbackItems, selectedFeedbackId]);

    const handleCriteriaToggle = () => {
        const nextExpanded = !criteriaExpanded;
        setCriteriaExpanded(nextExpanded);
        onCriteriaToggle?.(nextExpanded);
    };

    const handleEssayFeedbackSelect = (feedbackId: string, anchorViewportTop: number | null) => {
        if (commentsLocked) {
            return;
        }

        setPanelTab('comments');
        setSelectedFeedbackId(feedbackId);
        setSelectedFeedbackAnchorViewportTop(anchorViewportTop);
    };

    if (!activeTask) {
        return null;
    }

    return (
        <div style={{ display: 'grid', gap: '1rem' }}>
            {releaseNotice && (
                <NoticeCard notice={releaseNotice} />
            )}

            <section style={cardStyle()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    <div>
                        <div style={eyebrowStyle()}>{data.contextLabel}</div>
                        <h2 style={{ margin: '0.25rem 0 0', fontSize: isPanel ? '1.25rem' : '1.45rem', fontWeight: 800, color: '#111827' }}>
                            {data.testTitle}
                        </h2>
                        <div style={{ marginTop: '0.45rem', display: 'flex', gap: '0.6rem', flexWrap: 'wrap', color: '#6b7280', fontSize: '0.84rem' }}>
                            <span>{data.formatLabel}</span>
                            <span>{new Date(data.submittedAt).toLocaleDateString()}</span>
                            <span>{formatElapsedTime(data.totalElapsedTimeSeconds)}</span>
                            <span>{data.totalWordCount} words</span>
                        </div>
                    </div>

                    {data.phase === 'published' && data.bandSummaryItems.length > 0 && (
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: `repeat(${bandColumnCount}, minmax(88px, 1fr))`,
                                gap: '0.6rem',
                                minWidth: useSplitLayout ? '280px' : '100%',
                                maxWidth: useSplitLayout ? '380px' : '100%',
                                width: useSplitLayout ? 'auto' : '100%',
                            }}
                        >
                            {data.bandSummaryItems.map((item) => (
                                <div
                                    key={item.key}
                                    style={{
                                        padding: '0.75rem 0.8rem',
                                        borderRadius: '16px',
                                        border: item.tone === 'overall' ? '1px solid #c7d2fe' : '1px solid #dbe4ee',
                                        background: item.tone === 'overall' ? '#eef2ff' : '#f9fafb',
                                        textAlign: 'center',
                                    }}
                                >
                                    <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#6b7280' }}>
                                        {item.label}
                                    </div>
                                    <div style={{ marginTop: '0.22rem', fontSize: item.tone === 'overall' ? '1.45rem' : '1.08rem', fontWeight: 800, color: '#111827' }}>
                                        {item.band !== null ? item.band.toFixed(1) : '-'}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {data.phase === 'published' ? (
                    <div style={{ marginTop: '0.9rem', color: '#4b5563', fontSize: '0.9rem', lineHeight: 1.6 }}>
                        {data.teacherName
                            ? `Published by ${data.teacherName}${data.gradedAt ? ` on ${new Date(data.gradedAt).toLocaleDateString()}` : ''}.`
                            : 'Published teacher feedback.'}
                    </div>
                ) : (
                    <div style={{ marginTop: '0.9rem', color: '#4b5563', fontSize: '0.9rem', lineHeight: 1.6 }}>
                        Your submission is recorded. The result page will stay blank until your teacher publishes feedback.
                    </div>
                )}
            </section>

            {data.tasks.length > 1 && (
                <div style={taskTabsStyle()}>
                    {data.tasks.map((task) => {
                        const active = task.taskNumber === activeTask.taskNumber;
                        return (
                            <button
                                key={task.taskNumber}
                                type="button"
                                onClick={() => setActiveTaskNumber(task.taskNumber)}
                                style={taskTabButtonStyle(active)}
                            >
                                Task {task.taskNumber}
                                {task.isVoided ? ' | Voided' : ''}
                            </button>
                        );
                    })}
                </div>
            )}

            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: useSplitLayout ? 'minmax(0, 1.42fr) minmax(340px, 0.92fr)' : '1fr',
                    gap: '1rem',
                    alignItems: 'start',
                }}
            >
                <section style={{ display: 'grid', gap: '1rem' }}>
                    <div style={cardStyle()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'baseline' }}>
                            <div>
                                <div style={eyebrowStyle()}>{activeTask.taskType || `Task ${activeTask.taskNumber}`}</div>
                                <h3 style={{ margin: '0.2rem 0 0', fontSize: '1.08rem', fontWeight: 800, color: '#111827' }}>
                                    Task {activeTask.taskNumber}
                                </h3>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', color: '#6b7280', fontSize: '0.8rem' }}>
                                <span>{activeTask.wordCount} words</span>
                                <span>{formatElapsedTime(activeTask.activeTimeSeconds)}</span>
                                {activeTask.isVoided && (
                                    <span style={{ color: '#b91c1c', fontWeight: 700 }}>
                                        Voided{activeTask.voidReason ? `: ${activeTask.voidReason}` : ''}
                                    </span>
                                )}
                            </div>
                        </div>

                        <div style={{ marginTop: '1rem' }}>
                            {data.phase === 'published' ? (
                                activeTask.markedContent || activeFeedbackItems.length > 0 ? (
                                    <WritingPublishedMarkupViewer
                                        originalEssayText={activeTask.essayText}
                                        markedContent={activeTask.markedContent}
                                        comments={activeTask.comments}
                                        corrections={activeTask.corrections}
                                        compact={isPanel}
                                        onViewModeChange={(mode) => onMarkupViewChange?.(activeTask.taskNumber, mode)}
                                        onFeedbackSelect={handleEssayFeedbackSelect}
                                    />
                                ) : activeTask.fallbackAnnotations.length > 0 ? (
                                    <AnnotatedEssayReadOnly essayText={activeTask.essayText} annotations={activeTask.fallbackAnnotations} />
                                ) : (
                                    <PlainEssayCard essayText={activeTask.essayText} />
                                )
                            ) : (
                                <PlainEssayCard essayText={activeTask.essayText} />
                            )}
                        </div>
                    </div>
                </section>

                <aside style={{ display: 'grid', gap: '1rem', position: useSplitLayout ? 'sticky' : 'static', top: 24 }}>
                    <section style={cardStyle()}>
                        <div style={panelTabsWrapStyle()}>
                            <button
                                type="button"
                                onClick={() => setPanelTab('prompt')}
                                style={panelTabButtonStyle(panelTab === 'prompt')}
                            >
                                Prompt
                            </button>
                            <button
                                type="button"
                                onClick={() => !commentsLocked && setPanelTab('comments')}
                                style={panelTabButtonStyle(panelTab === 'comments', commentsLocked)}
                                disabled={commentsLocked}
                            >
                                Comments
                            </button>
                            <button
                                type="button"
                                onClick={() => !scoringLocked && setPanelTab('scoring')}
                                style={panelTabButtonStyle(panelTab === 'scoring', scoringLocked)}
                                disabled={scoringLocked}
                            >
                                Scoring
                            </button>
                        </div>

                        <div style={{ marginTop: '1rem' }}>
                            {panelTab === 'prompt' && (
                                <PromptTab task={activeTask} phase={data.phase} />
                            )}

                            {panelTab === 'comments' && (
                                <CommentsTab
                                    feedbackItems={activeFeedbackItems}
                                    taskNumber={activeTask.taskNumber}
                                    selectedFeedbackId={selectedFeedbackId}
                                    selectedFeedbackAnchorViewportTop={selectedFeedbackAnchorViewportTop}
                                    alignToEssay={useSplitLayout}
                                />
                            )}

                            {panelTab === 'scoring' && (
                                <ScoringTab
                                    data={data}
                                    task={activeTask}
                                    criteriaEntries={activeCriteriaEntries}
                                    criteriaExpanded={criteriaExpanded}
                                    onCriteriaToggle={handleCriteriaToggle}
                                />
                            )}
                        </div>
                    </section>
                </aside>
            </div>
        </div>
    );
}

function PromptTab({
    task,
    phase,
}: {
    task: WritingResultTaskData;
    phase: WritingResultSurfaceData['phase'];
}) {
    return (
        <div style={{ display: 'grid', gap: '1rem' }}>
            <div>
                <div style={eyebrowStyle()}>Task {task.taskNumber}</div>
                <h3 style={{ margin: '0.2rem 0 0', fontSize: '1.04rem', fontWeight: 800, color: '#111827' }}>
                    Prompt
                </h3>
            </div>

            {task.promptImageUrl && (
                <img
                    src={task.promptImageUrl}
                    alt={`Task ${task.taskNumber} prompt`}
                    style={{ width: '100%', borderRadius: '16px', border: '1px solid #dbe4ee', objectFit: 'cover' }}
                />
            )}

            <div style={mutedPanelStyle()}>
                <div style={{ color: '#1f2937', lineHeight: 1.7, fontSize: '0.92rem', whiteSpace: 'pre-wrap' }}>
                    {task.promptText}
                </div>
            </div>

            <div style={metaGridStyle()}>
                <MetaTile label="Words" value={String(task.wordCount)} />
                <MetaTile label="Target" value={`${task.wordMinimum}+`} />
                <MetaTile label="Active Time" value={formatElapsedTime(task.activeTimeSeconds)} />
                <MetaTile label="Status" value={phase === 'published' ? 'Published' : 'Pending'} />
            </div>

            {phase === 'pending-review' && (
                <div style={mutedPanelStyle()}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#6b7280', marginBottom: '0.45rem' }}>
                        What Happens Next
                    </div>
                    <div style={{ display: 'grid', gap: '0.7rem', color: '#4b5563', fontSize: '0.88rem', lineHeight: 1.6 }}>
                        <div>Your teacher will grade this submission in the Writing grading tool.</div>
                        <div>Comments, corrections, and scores stay hidden until that feedback is published.</div>
                        <div>Once published, this panel will show the same prompt, feedback, and scoring structure in read-only form.</div>
                    </div>
                </div>
            )}
        </div>
    );
}

function CommentsTab({
    feedbackItems,
    taskNumber,
    selectedFeedbackId,
    selectedFeedbackAnchorViewportTop,
    alignToEssay,
}: {
    feedbackItems: PublishedFeedbackItem[];
    taskNumber: 1 | 2;
    selectedFeedbackId: string | null;
    selectedFeedbackAnchorViewportTop: number | null;
    alignToEssay: boolean;
}) {
    const commentRefs = useRef<Record<string, HTMLElement | null>>({});
    const commentHeaderRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const stackRef = useRef<HTMLDivElement | null>(null);
    const [commentsStackTranslateY, setCommentsStackTranslateY] = useState(0);

    useLayoutEffect(() => {
        if (!selectedFeedbackId) {
            setCommentsStackTranslateY(0);
            return;
        }

        const viewportElement = viewportRef.current;
        const stackElement = stackRef.current;
        const selectedCommentElement = commentRefs.current[selectedFeedbackId];
        const selectedCommentHeaderElement = commentHeaderRefs.current[selectedFeedbackId] ?? null;

        if (!selectedCommentElement || !stackElement || !selectedCommentHeaderElement) {
            setCommentsStackTranslateY(0);
            return;
        }

        if (alignToEssay && viewportElement && selectedFeedbackAnchorViewportTop !== null) {
            const measuredViewportRect = viewportElement.getBoundingClientRect();
            const measuredStackRect = stackElement.getBoundingClientRect();
            const measuredHeaderRect = selectedCommentHeaderElement.getBoundingClientRect();
            const headerHeight = measuredHeaderRect.height || selectedCommentHeaderElement.offsetHeight || 0;
            const railPadding = 12;
            const desiredHeaderTop = Math.min(
                Math.max(selectedFeedbackAnchorViewportTop, measuredViewportRect.top + railPadding),
                measuredViewportRect.bottom - railPadding - headerHeight,
            );
            const headerOffsetWithinStack = measuredHeaderRect.top - measuredStackRect.top;
            const desiredHeaderTopWithinViewport = desiredHeaderTop - measuredViewportRect.top;
            setCommentsStackTranslateY(desiredHeaderTopWithinViewport - headerOffsetWithinStack);
            return;
        }

        if (alignToEssay) {
            return;
        }

        setCommentsStackTranslateY(0);
        selectedCommentElement.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
        });
    }, [alignToEssay, selectedFeedbackAnchorViewportTop, selectedFeedbackId]);

    return (
        <div style={{ display: 'grid', gap: '1rem' }}>
            <div>
                <div style={eyebrowStyle()}>Task {taskNumber}</div>
                <h3 style={{ margin: '0.2rem 0 0', fontSize: '1.04rem', fontWeight: 800, color: '#111827' }}>
                    Published Feedback
                </h3>
            </div>

            {feedbackItems.length > 0 ? (
                <div
                    ref={viewportRef}
                    data-comments-viewport="true"
                    style={{
                        maxHeight: alignToEssay ? 'min(68vh, 720px)' : undefined,
                        overflowY: alignToEssay ? 'auto' : undefined,
                        paddingRight: alignToEssay ? '0.25rem' : undefined,
                    }}
                >
                    <div
                        ref={stackRef}
                        data-comments-shifted={alignToEssay && selectedFeedbackId && selectedFeedbackAnchorViewportTop !== null ? 'true' : 'false'}
                        data-comments-stack="true"
                        style={{
                            display: 'grid',
                            gap: '0.8rem',
                            transform: alignToEssay ? `translateY(${commentsStackTranslateY}px)` : 'none',
                            transition: 'transform 0.22s ease',
                        }}
                    >
                        {feedbackItems.map((item) => {
                            const selected = selectedFeedbackId === item.id;
                            return (
                                <article
                                    key={item.id}
                                    ref={(node) => {
                                        commentRefs.current[item.id] = node;
                                    }}
                                    data-comment-card-id={item.id}
                                    data-highlighted={selected ? 'true' : 'false'}
                                    style={{
                                        ...mutedPanelStyle(),
                                        border: selected ? '1px solid #818cf8' : '1px solid #e5e7eb',
                                        background: selected ? '#eef2ff' : '#f9fafb',
                                        boxShadow: selected ? '0 0 0 3px rgba(99, 102, 241, 0.18), 0 16px 32px rgba(79, 70, 229, 0.12)' : 'none',
                                        transition: 'border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease',
                                    }}
                                >
                                    <div
                                        ref={(node) => {
                                            commentHeaderRefs.current[item.id] = node;
                                        }}
                                        data-comment-header-id={item.id}
                                        style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'baseline', marginBottom: '0.35rem', flexWrap: 'wrap' }}
                                    >
                                        <span style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#4f46e5' }}>
                                            {item.kind === 'comment' ? item.categoryLabel : item.label}
                                        </span>
                                        {item.anchorText ? (
                                            <span style={{ fontSize: '0.76rem', color: '#6b7280' }}>{item.anchorText}</span>
                                        ) : null}
                                    </div>
                                    {item.kind === 'comment' ? (
                                        <RichContent content={item.text} style={{ color: '#374151', lineHeight: 1.55, fontSize: '0.86rem' }} />
                                    ) : (
                                        <div style={{ display: 'grid', gap: '0.35rem', color: '#374151', fontSize: '0.86rem', lineHeight: 1.55 }}>
                                            <div>
                                                <span style={{ fontSize: '0.74rem', fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', color: '#6b7280', marginRight: '0.45rem' }}>
                                                    Replace with
                                                </span>
                                                <span>{item.correctionText || 'No replacement text'}</span>
                                            </div>
                                        </div>
                                    )}
                                </article>
                            );
                        })}
                    </div>
                </div>
            ) : (
                <EmptyPanelMessage message="No published comments or corrections for this task." />
            )}
        </div>
    );
}

function ScoringTab({
    data,
    task,
    criteriaEntries,
    criteriaExpanded,
    onCriteriaToggle,
}: {
    data: WritingResultSurfaceData;
    task: WritingResultTaskData;
    criteriaEntries: ReturnType<typeof getVisibleCriteriaEntries>;
    criteriaExpanded: boolean;
    onCriteriaToggle: () => void;
}) {
    return (
        <div style={{ display: 'grid', gap: '1rem' }}>
            <div>
                <div style={eyebrowStyle()}>Task {task.taskNumber}</div>
                <h3 style={{ margin: '0.2rem 0 0', fontSize: '1.04rem', fontWeight: 800, color: '#111827' }}>
                    Published Scoring
                </h3>
            </div>

            <div style={scoreGridStyle()}>
                <MetaTile label={task.taskNumber === 1 ? 'TA' : 'TR'} value={formatScoreValue(task.criteriaScores[task.taskNumber === 1 ? 'TA' : 'TR'])} />
                <MetaTile label="CC" value={formatScoreValue(task.criteriaScores.CC)} />
                <MetaTile label="LR" value={formatScoreValue(task.criteriaScores.LR)} />
                <MetaTile label="GRA" value={formatScoreValue(task.criteriaScores.GRA)} />
                <MetaTile label="Task Band" value={task.isVoided ? 'Voided' : formatBandValue(task.taskBand)} />
                <MetaTile label="Overall Band" value={formatBandValue(data.overallBand)} />
            </div>

            <div style={mutedPanelStyle()}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#374151', marginBottom: '0.55rem' }}>
                    Task Summary
                </div>
                {task.taskSummary ? (
                    <RichContent content={task.taskSummary} style={{ color: '#374151', lineHeight: 1.6, fontSize: '0.88rem' }} />
                ) : (
                    <div style={{ color: '#9ca3af', fontSize: '0.86rem' }}>No published summary.</div>
                )}
            </div>

            <div style={mutedPanelStyle()}>
                <button
                    type="button"
                    onClick={onCriteriaToggle}
                    style={{
                        width: '100%',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        border: 'none',
                        background: 'transparent',
                        padding: 0,
                        cursor: 'pointer',
                    }}
                >
                    <div style={{ textAlign: 'left' }}>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#374151' }}>
                            Criteria Feedback
                        </div>
                        <div style={{ marginTop: '0.18rem', fontSize: '0.82rem', color: '#6b7280' }}>
                            Read the published criterion-by-criterion breakdown
                        </div>
                    </div>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#4f46e5' }}>
                        {criteriaExpanded ? 'Hide' : 'Show'}
                    </span>
                </button>

                {criteriaExpanded && (
                    <div style={{ display: 'grid', gap: '0.8rem', marginTop: '1rem' }}>
                        {criteriaEntries.length > 0 ? criteriaEntries.map((entry) => (
                            <div key={entry.key} style={{ padding: '0.85rem', borderRadius: '12px', background: '#ffffff', border: '1px solid #e5e7eb' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'baseline', marginBottom: '0.25rem' }}>
                                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#111827' }}>
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
                        )) : (
                            <EmptyPanelMessage message="No published criteria feedback for this task." />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function NoticeCard({
    notice,
}: {
    notice: NonNullable<WritingStudentResultSurfaceProps['releaseNotice']>;
}) {
    const warning = notice.tone === 'warning';
    return (
        <div
            style={{
                padding: '0.95rem 1rem',
                borderRadius: '16px',
                border: warning ? '1px solid #fcd34d' : '1px solid #bfdbfe',
                background: warning ? '#fffbeb' : '#eff6ff',
            }}
        >
            <div style={{ fontSize: '0.84rem', fontWeight: 800, color: warning ? '#92400e' : '#1d4ed8' }}>
                {notice.title}
            </div>
            <div style={{ marginTop: '0.3rem', fontSize: '0.85rem', lineHeight: 1.55, color: warning ? '#b45309' : '#3b82f6' }}>
                {notice.body}
            </div>
        </div>
    );
}

function PlainEssayCard({ essayText }: { essayText: string }) {
    return (
        <div
            style={{
                border: '1px solid #dbe4ee',
                borderRadius: '18px',
                background: '#ffffff',
                padding: '1rem 1.1rem',
                whiteSpace: 'pre-wrap',
                lineHeight: 1.8,
                color: '#1f2937',
                fontSize: '0.95rem',
            }}
        >
            {essayText || 'No essay submitted'}
        </div>
    );
}

function EmptyPanelMessage({ message }: { message: string }) {
    return (
        <div style={{ padding: '0.95rem', borderRadius: '14px', background: '#f9fafb', border: '1px solid #e5e7eb', color: '#9ca3af', fontSize: '0.86rem' }}>
            {message}
        </div>
    );
}

function MetaTile({ label, value }: { label: string; value: string }) {
    return (
        <div style={{ padding: '0.85rem', borderRadius: '14px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'block', marginBottom: '0.28rem', fontSize: '0.74rem', fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', color: '#64748b' }}>
                {label}
            </div>
            <strong style={{ fontSize: '1rem', color: '#0f172a' }}>{value}</strong>
        </div>
    );
}

function formatScoreValue(score: number | undefined) {
    return score !== undefined ? `${score}/9` : '-';
}

function formatBandValue(score: number | null) {
    return score !== null ? score.toFixed(1) : '-';
}

function cardStyle(): React.CSSProperties {
    return {
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '20px',
        padding: '1.1rem 1.15rem',
    };
}

function mutedPanelStyle(): React.CSSProperties {
    return {
        padding: '0.95rem',
        borderRadius: '14px',
        background: '#f9fafb',
        border: '1px solid #e5e7eb',
    };
}

function eyebrowStyle(): React.CSSProperties {
    return {
        fontSize: '0.7rem',
        fontWeight: 800,
        color: '#6b7280',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
    };
}

function taskTabsStyle(): React.CSSProperties {
    return {
        display: 'inline-flex',
        gap: '0.55rem',
        padding: '0.35rem',
        borderRadius: '16px',
        background: '#f3f4f6',
        border: '1px solid #e5e7eb',
        width: 'fit-content',
        flexWrap: 'wrap',
    };
}

function taskTabButtonStyle(active: boolean): React.CSSProperties {
    return {
        border: 'none',
        borderRadius: '12px',
        padding: '0.6rem 0.9rem',
        background: active ? '#ffffff' : 'transparent',
        color: active ? '#111827' : '#6b7280',
        fontSize: '0.84rem',
        fontWeight: 700,
        cursor: 'pointer',
        boxShadow: active ? '0 1px 2px rgba(15, 23, 42, 0.08)' : 'none',
    };
}

function panelTabsWrapStyle(): React.CSSProperties {
    return {
        display: 'inline-flex',
        gap: '0.45rem',
        padding: '0.35rem',
        borderRadius: '14px',
        background: '#f3f4f6',
        border: '1px solid #e5e7eb',
        width: 'fit-content',
        flexWrap: 'wrap',
    };
}

function panelTabButtonStyle(active: boolean, disabled = false): React.CSSProperties {
    return {
        border: 'none',
        borderRadius: '10px',
        padding: '0.55rem 0.85rem',
        background: active ? '#ffffff' : 'transparent',
        color: disabled ? '#9ca3af' : (active ? '#111827' : '#6b7280'),
        fontSize: '0.82rem',
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        boxShadow: active ? '0 1px 2px rgba(15, 23, 42, 0.08)' : 'none',
    };
}

function metaGridStyle(): React.CSSProperties {
    return {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: '0.75rem',
    };
}

function scoreGridStyle(): React.CSSProperties {
    return {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: '0.75rem',
    };
}
