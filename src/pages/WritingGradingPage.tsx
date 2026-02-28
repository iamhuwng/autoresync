/**
 * WritingGradingPage — PRD-0030 Task 5.9
 * Side-by-side grading interface for IELTS Writing submissions.
 * Left: essay + annotations + toolbar. Right: criteria scoring + feedback.
 * NO MANTINE.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSubmission, updateGrading } from '../services/writingSubmissionService';
import { getAnnotationCategories } from '../services/writingAnnotationService';
import { useAuth } from '../hooks/useAuth';
import { calculateTaskBand, calculateOverallBand } from '../utils/ieltsWritingBandCalculator';
import { notifyWritingGraded } from '../services/notificationService';
import AnnotatedEssayRenderer from '../components/writing-grading/AnnotatedEssayRenderer';
import AnnotationToolbar from '../components/writing-grading/AnnotationToolbar';
import CriteriaScoringPanel from '../components/writing-grading/CriteriaScoringPanel';
import FeedbackPanel from '../components/writing-grading/FeedbackPanel';
import VoidTaskButton from '../components/writing-grading/VoidTaskButton';
import GradingAuditTrail from '../components/writing-grading/GradingAuditTrail';
import CategoryManager from '../components/writing-grading/CategoryManager';
import type {
    WritingSubmission,
    WritingAnnotation,
    AnnotationCategory,
    WritingGradingResult,
    WritingTaskGradingResult,
    WritingGradingAudit,
} from '../types/ielts-writing.types';
import './WritingGradingPage.css';

interface TaskScores {
    ta: number | null;
    cc: number | null;
    lr: number | null;
    gra: number | null;
}
interface TaskFeedback {
    ta: string; cc: string; lr: string; gra: string; overall: string;
}

const EMPTY_SCORES: TaskScores = { ta: null, cc: null, lr: null, gra: null };
const EMPTY_FEEDBACK: TaskFeedback = { ta: '', cc: '', lr: '', gra: '', overall: '' };

interface SelectedText {
    text: string;
    startOffset: number;
    endOffset: number;
}

export default function WritingGradingPage() {
    const { submissionId } = useParams<{ submissionId: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();

    // Data
    const [submission, setSubmission] = useState<WritingSubmission | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Grading state
    const [activeTask, setActiveTask] = useState<1 | 2>(1);
    const [scores, setScores] = useState<{ 1: TaskScores; 2: TaskScores }>({
        1: { ...EMPTY_SCORES }, 2: { ...EMPTY_SCORES },
    });
    const [feedback, setFeedback] = useState<{ 1: TaskFeedback; 2: TaskFeedback }>({
        1: { ...EMPTY_FEEDBACK }, 2: { ...EMPTY_FEEDBACK },
    });
    const [annotations, setAnnotations] = useState<WritingAnnotation[]>([]);
    const [voided, setVoided] = useState<{ 1: boolean; 2: boolean }>({ 1: false, 2: false });
    const [voidReasons, setVoidReasons] = useState<{ 1: string; 2: string }>({ 1: '', 2: '' });
    const [auditTrail, setAuditTrail] = useState<WritingGradingAudit[]>([]);
    const [categories, setCategories] = useState<AnnotationCategory[]>([]);
    const [selectedText, setSelectedText] = useState<SelectedText | null>(null);
    const [showPrompt, setShowPrompt] = useState(false);
    const [showModelAnswer, setShowModelAnswer] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [hasUnsaved, setHasUnsaved] = useState(false);

    const essayContainerRef = useRef<HTMLDivElement>(null);
    const autoSaveRef = useRef<ReturnType<typeof setTimeout>>(undefined);

    // Load submission
    useEffect(() => {
        if (!submissionId) return;
        (async () => {
            setLoading(true);
            const result = await getSubmission(submissionId);
            if (result.success && result.data) {
                setSubmission(result.data);
                // Restore existing grading state if already partially graded
                if (result.data.grading) {
                    const g = result.data.grading;
                    if (g.perTask) {
                        for (const tg of g.perTask) {
                            const tn = tg.taskNumber as 1 | 2;
                            setScores(prev => ({
                                ...prev,
                                [tn]: {
                                    ta: tg.criteriaScores?.TA ?? tg.criteriaScores?.TR ?? null,
                                    cc: tg.criteriaScores?.CC ?? null,
                                    lr: tg.criteriaScores?.LR ?? null,
                                    gra: tg.criteriaScores?.GRA ?? null,
                                },
                            }));
                            if (tg.isVoided) {
                                setVoided(prev => ({ ...prev, [tn]: true }));
                                setVoidReasons(prev => ({ ...prev, [tn]: tg.voidReason || '' }));
                            }
                        }
                        // Restore feedback from grading.feedback
                        if (g.feedback) {
                            // Map the per-criteria feedback to both tasks
                            const fb: TaskFeedback = {
                                ta: g.feedback.perCriteria?.TA || g.feedback.perCriteria?.TR || '',
                                cc: g.feedback.perCriteria?.CC || '',
                                lr: g.feedback.perCriteria?.LR || '',
                                gra: g.feedback.perCriteria?.GRA || '',
                                overall: g.feedback.overall || '',
                            };
                            setFeedback(prev => ({ ...prev, 1: { ...fb }, 2: { ...fb } }));
                        }
                    }
                }
                if (result.data.annotations) {
                    setAnnotations(result.data.annotations);
                }
                if (result.data.auditTrail) {
                    setAuditTrail(result.data.auditTrail);
                }
            } else {
                setError(result.error || 'Submission not found');
            }
            setLoading(false);
        })();
    }, [submissionId]);

    // Load categories
    useEffect(() => {
        if (!user?.uid) return;
        getAnnotationCategories(user.uid).then((cats: AnnotationCategory[]) => {
            if (cats.length > 0) setCategories(cats);
        });
    }, [user?.uid]);

    // [GAP-15] Selection tracking
    useEffect(() => {
        const handleSelectionChange = () => {
            const selection = document.getSelection();
            if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
                setSelectedText(null); return;
            }
            if (!essayContainerRef.current?.contains(selection.anchorNode)) {
                setSelectedText(null); return;
            }
            const range = selection.getRangeAt(0);
            const preRange = range.cloneRange();
            preRange.selectNodeContents(essayContainerRef.current);
            preRange.setEnd(range.startContainer, range.startOffset);
            const startOffset = preRange.toString().length;
            const endOffset = startOffset + range.toString().length;
            setSelectedText({ text: selection.toString(), startOffset, endOffset });
        };
        document.addEventListener('selectionchange', handleSelectionChange);
        return () => document.removeEventListener('selectionchange', handleSelectionChange);
    }, []);

    // Beforeunload warning
    useEffect(() => {
        if (!hasUnsaved) return;
        const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [hasUnsaved]);

    // Auto-save every 30 seconds
    useEffect(() => {
        if (!submissionId || !hasUnsaved) return;
        clearTimeout(autoSaveRef.current);
        autoSaveRef.current = setTimeout(() => {
            handleSaveDraft();
        }, 30_000);
        return () => clearTimeout(autoSaveRef.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scores, feedback, annotations, hasUnsaved]);

    const markUnsaved = useCallback(() => setHasUnsaved(true), []);

    // Computed
    const taskCount = useMemo(() => {
        if (!submission) return 1;
        const fmt = submission.testMeta?.format;
        return fmt === 'full-test' ? 2 : 1;
    }, [submission]);

    const activeTaskData = useMemo(() => {
        return submission?.tasks?.find(t => t.taskNumber === activeTask);
    }, [submission, activeTask]);

    // Annotations for active task
    const taskAnnotations = useMemo(() => {
        return annotations.filter(a => a.taskNumber === activeTask);
    }, [annotations, activeTask]);

    // Build WritingTaskGradingResult[] for band calculation
    const buildTaskGradingResults = useCallback((): WritingTaskGradingResult[] => {
        const results: WritingTaskGradingResult[] = [];
        for (let tn = 1; tn <= taskCount; tn++) {
            const s = scores[tn as 1 | 2];
            const v = voided[tn as 1 | 2];
            if (v) {
                results.push({
                    taskNumber: tn as 1 | 2,
                    isVoided: true,
                    voidReason: voidReasons[tn as 1 | 2],
                    criteriaScores: { CC: 0, LR: 0, GRA: 0 },
                    taskBand: 0,
                });
                continue;
            }
            if (s.ta === null || s.cc === null || s.lr === null || s.gra === null) continue;
            const criteriaScores = tn === 1
                ? { TA: s.ta, CC: s.cc, LR: s.lr, GRA: s.gra }
                : { TR: s.ta, CC: s.cc, LR: s.lr, GRA: s.gra };
            const taskBand = calculateTaskBand(criteriaScores);
            results.push({
                taskNumber: tn as 1 | 2,
                isVoided: false,
                criteriaScores,
                taskBand,
            });
        }
        return results;
    }, [scores, voided, voidReasons, taskCount]);

    const overallBand = useMemo(() => {
        if (!submission) return null;
        const taskResults = buildTaskGradingResults().filter(t => !t.isVoided && t.taskBand > 0);
        if (taskResults.length === 0) return null;
        const format = submission.testMeta?.format || 'full-test';
        return calculateOverallBand(taskResults, format);
    }, [submission, buildTaskGradingResults]);

    // Handlers
    const handleAddAnnotation = useCallback((a: WritingAnnotation) => {
        // Ensure taskNumber is set
        const annotationWithTask: WritingAnnotation = {
            ...a,
            taskNumber: a.taskNumber || activeTask,
        };
        setAnnotations(prev => [...prev, annotationWithTask]);
        markUnsaved();
    }, [activeTask, markUnsaved]);

    const handleDeleteAnnotation = useCallback((id: string) => {
        setAnnotations(prev => prev.filter(a => a.id !== id));
        markUnsaved();
    }, [markUnsaved]);

    const handleScoresChange = useCallback((taskNum: 1 | 2, newScores: TaskScores) => {
        setScores(prev => ({ ...prev, [taskNum]: newScores }));
        markUnsaved();
    }, [markUnsaved]);

    const handleFeedbackChange = useCallback((taskNum: 1 | 2, newFeedback: TaskFeedback) => {
        setFeedback(prev => ({ ...prev, [taskNum]: newFeedback }));
        markUnsaved();
    }, [markUnsaved]);

    const handleVoid = useCallback((taskNum: 1 | 2, reason: string) => {
        setVoided(prev => ({ ...prev, [taskNum]: true }));
        setVoidReasons(prev => ({ ...prev, [taskNum]: reason }));
        markUnsaved();
    }, [markUnsaved]);

    const handleUnvoid = useCallback((taskNum: 1 | 2) => {
        setVoided(prev => ({ ...prev, [taskNum]: false }));
        setVoidReasons(prev => ({ ...prev, [taskNum]: '' }));
        markUnsaved();
    }, [markUnsaved]);

    const buildGradingResult = useCallback((): WritingGradingResult => {
        const perTask = buildTaskGradingResults();
        return {
            teacherId: user?.uid || '',
            teacherName: user?.displayName || user?.email || '',
            gradedAt: Date.now(),
            perTask,
            overallBand: overallBand ?? 0,
            feedback: {
                overall: feedback[1].overall || feedback[2].overall || '',
                perCriteria: {
                    TA: feedback[1].ta || undefined,
                    TR: feedback[2].ta || undefined,
                    CC: feedback[1].cc || feedback[2].cc || '',
                    LR: feedback[1].lr || feedback[2].lr || '',
                    GRA: feedback[1].gra || feedback[2].gra || '',
                },
            },
        };
    }, [buildTaskGradingResults, overallBand, feedback, user]);

    const handleSaveDraft = useCallback(async () => {
        if (!submissionId) return;
        try {
            const gradingResult = buildGradingResult();
            await updateGrading(submissionId, gradingResult, annotations);
            setHasUnsaved(false);
        } catch (err) {
            console.error('Failed to save draft:', err);
        }
    }, [submissionId, buildGradingResult, annotations]);

    const handleSubmitGrading = useCallback(async () => {
        if (!submissionId || submitting) return;

        // Validate: at least one non-voided task with all 4 criteria
        const validResults = buildTaskGradingResults().filter(t => !t.isVoided && t.taskBand > 0);
        if (validResults.length === 0) {
            alert('Please score at least one task completely (all 4 criteria) or void all tasks.');
            return;
        }

        setSubmitting(true);
        try {
            const gradingResult = buildGradingResult();
            await updateGrading(submissionId, gradingResult, annotations);
            setHasUnsaved(false);

            // Notify student (non-blocking)
            if (submission?.studentId && overallBand !== null) {
                notifyWritingGraded(
                    submission.studentId,
                    submissionId,
                    submission.testMeta?.testTitle || 'Writing Test',
                    overallBand,
                    user?.displayName || user?.email || undefined
                ).catch(err => console.warn('[WritingGradingPage] Notification failed:', err));
            }

            navigate('/teacher/grading/writing');
        } catch (err) {
            console.error('Failed to submit grading:', err);
            alert('Failed to submit grading. Please try again.');
        } finally {
            setSubmitting(false);
        }
    }, [submissionId, submitting, buildTaskGradingResults, buildGradingResult, annotations, navigate]);

    // --- RENDER ---
    if (loading) {
        return (
            <div className="wgp-page">
                <div className="wgp-loading"><div className="wgp-spinner" /></div>
            </div>
        );
    }

    if (error || !submission) {
        return (
            <div className="wgp-page">
                <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#1e293b' }}>
                        {error || 'Submission not found'}
                    </div>
                    <button
                        onClick={() => navigate('/teacher/grading/writing')}
                        className="wgp-back-btn"
                        style={{ marginTop: '1rem' }}
                    >
                        ← Back to Queue
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="wgp-page">
            {/* Header */}
            <div className="wgp-header">
                <div className="wgp-header-left">
                    <button
                        className="wgp-back-btn"
                        onClick={() => navigate('/teacher/grading/writing')}
                    >
                        ← Queue
                    </button>
                    <span className="wgp-student-name">
                        {submission.studentName || '[Deleted Student]'}
                    </span>
                </div>
                <div className="wgp-header-actions">
                    <button
                        onClick={handleSaveDraft}
                        style={{
                            padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0',
                            background: '#fff', cursor: 'pointer', fontSize: '0.85rem', color: '#475569',
                        }}
                    >
                        💾 Save Draft
                    </button>
                    <button
                        onClick={handleSubmitGrading}
                        disabled={submitting}
                        style={{
                            padding: '8px 16px', borderRadius: '8px', border: 'none',
                            background: '#3b82f6', color: '#fff', cursor: submitting ? 'wait' : 'pointer',
                            fontSize: '0.85rem', fontWeight: 600, opacity: submitting ? 0.6 : 1,
                        }}
                    >
                        {submitting ? 'Submitting...' : '✅ Submit Grading'}
                    </button>
                </div>
            </div>

            {/* Task Tabs */}
            {taskCount > 1 && (
                <div className="wgp-tab-bar">
                    {([1, 2] as const).map(tn => (
                        <button
                            key={tn}
                            className={`wgp-tab ${activeTask === tn ? 'wgp-tab--active' : ''}`}
                            onClick={() => setActiveTask(tn)}
                        >
                            Task {tn}
                            {voided[tn] && ' 🚫'}
                        </button>
                    ))}
                </div>
            )}

            {/* Content */}
            <div className="wgp-content">
                {/* LEFT PANEL */}
                <div className="wgp-left">
                    {/* Prompt toggle */}
                    <div className="wgp-section">
                        <button
                            className="wgp-prompt-toggle"
                            onClick={() => setShowPrompt(!showPrompt)}
                        >
                            {showPrompt ? '▼' : '▶'} Task {activeTask} Prompt
                        </button>
                        {showPrompt && activeTaskData && (
                            <div className="wgp-prompt-content">
                                {activeTaskData.promptImageUrl && (
                                    <img
                                        src={activeTaskData.promptImageUrl}
                                        alt="Task prompt"
                                        style={{ maxWidth: '100%', borderRadius: '6px', marginBottom: '0.75rem' }}
                                    />
                                )}
                                {activeTaskData.promptText}
                            </div>
                        )}
                    </div>

                    {/* Annotated essay */}
                    <div className="wgp-section">
                        <div className="wgp-section-title">Student Essay</div>
                        <AnnotatedEssayRenderer
                            ref={essayContainerRef}
                            essayText={activeTaskData?.essayText || ''}
                            annotations={taskAnnotations}
                            onAnnotationClick={(a) => {
                                if (a.commentText) alert(`Comment: ${a.commentText}`);
                            }}
                            onAnnotationDelete={handleDeleteAnnotation}
                        />
                    </div>

                    {/* Annotation toolbar */}
                    <div className="wgp-section">
                        <AnnotationToolbar
                            selectedText={selectedText}
                            annotations={taskAnnotations}
                            onAddAnnotation={handleAddAnnotation}
                            categories={categories}
                            onAddCategory={(cat) => {
                                setCategories(prev => [...prev, cat]);
                                markUnsaved();
                            }}
                        />
                    </div>

                    {/* Metadata line */}
                    <div className="wgp-meta-line">
                        <span>📝 {activeTaskData?.wordCount || 0} words</span>
                        <span>⏱️ {Math.round((activeTaskData?.activeTimeSeconds || 0) / 60)} min active time</span>
                        {(submission.pasteAttemptCount ?? 0) > 0 && (
                            <span style={{ color: '#f59e0b', fontWeight: 600 }}>
                                ⚠️ {submission.pasteAttemptCount} paste attempt(s)
                            </span>
                        )}
                    </div>

                    {/* Model answer toggle */}
                    {activeTaskData && (
                        <div className="wgp-section" style={{ marginTop: '0.75rem' }}>
                            <button
                                className="wgp-model-toggle"
                                onClick={() => setShowModelAnswer(!showModelAnswer)}
                            >
                                {showModelAnswer ? '▼ Hide' : '▶ Show'} Model Answer
                            </button>
                            {showModelAnswer && (activeTaskData as any).modelAnswer && (
                                <div className="wgp-model-answer">
                                    {(activeTaskData as any).modelAnswer}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* RIGHT PANEL */}
                <div className="wgp-right">
                    {/* Category Manager */}
                    <div className="wgp-section">
                        <CategoryManager
                            teacherId={user?.uid || ''}
                            categories={categories}
                            onCategoriesChange={setCategories}
                        />
                    </div>

                    {/* Criteria Scoring */}
                    <div className="wgp-section">
                        <CriteriaScoringPanel
                            taskNumber={activeTask}
                            scores={scores[activeTask]}
                            onChange={(s) => handleScoresChange(activeTask, s)}
                            isVoided={voided[activeTask]}
                        />
                    </div>

                    {/* Feedback */}
                    <div className="wgp-section">
                        <FeedbackPanel
                            taskNumber={activeTask}
                            feedback={feedback[activeTask]}
                            onChange={(f) => handleFeedbackChange(activeTask, f)}
                        />
                    </div>

                    {/* Void Task */}
                    <div className="wgp-section">
                        <VoidTaskButton
                            taskNumber={activeTask}
                            isVoided={voided[activeTask]}
                            voidReason={voidReasons[activeTask]}
                            onVoid={(reason) => handleVoid(activeTask, reason)}
                            onUnvoid={() => handleUnvoid(activeTask)}
                        />
                    </div>

                    {/* Audit Trail */}
                    <div className="wgp-section">
                        <GradingAuditTrail entries={auditTrail} />
                    </div>
                </div>
            </div>

            {/* Bottom Bar */}
            <div className="wgp-bottom-bar">
                <div>
                    <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Overall Band: </span>
                    <span className="wgp-overall-band">
                        {overallBand !== null ? overallBand : '—'}
                    </span>
                </div>
                <div className="wgp-nav-buttons">
                    <button
                        onClick={() => navigate('/teacher/grading/writing')}
                        style={{
                            padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0',
                            background: '#fff', cursor: 'pointer', fontSize: '0.85rem', color: '#475569',
                        }}
                    >
                        Back to Queue
                    </button>
                </div>
            </div>
        </div>
    );
}
