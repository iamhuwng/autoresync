/**
 * WritingGradingModal — Grading Editor Redesign
 * Full grading interface: 2-column layout with 3-tab right panel.
 * Integrates EssayEditor, CommentSidebar, QuickCommentsDialog, CorrectionPopup,
 * TabbedFeedbackEditor, CriteriaScoringPanel, VoidTaskButton, GradingAuditTrail.
 * NO MANTINE — uses native portal pattern.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { getSubmission, updateGradingV2 } from '../../services/writingSubmissionService';
import { useAuth } from '../../hooks/useAuth';
import { calculateTaskBand, calculateOverallBand } from '../../utils/ieltsWritingBandCalculator';
import { notifyWritingGraded } from '../../services/notificationService';
import EssayEditor from './EssayEditor';
import CommentSidebar from './CommentSidebar';
import QuickCommentsDialog from './QuickCommentsDialog';
import CorrectionPopup from './CorrectionPopup';
import TabbedFeedbackEditor from './TabbedFeedbackEditor';
import CriteriaScoringPanel from './CriteriaScoringPanel';
import VoidTaskButton from './VoidTaskButton';
import GradingAuditTrail from './GradingAuditTrail';
import type {
    WritingSubmission,
    WritingAnnotation,
    AnnotationCategory,
    WritingGradingResult,
    WritingTaskGradingResult,
    WritingGradingAudit,
    GradingComment,
    QuickCommentPreset,
} from '../../types/ielts-writing.types';
import { COMMENT_CATEGORIES } from '../../types/ielts-writing.types';
import './WritingGradingModal.css';

// ═══════════════════════════════════════════════════════════════
// LOCAL-STORAGE AUTO-SAVE TYPES & HELPERS
// ═══════════════════════════════════════════════════════════════

const DRAFT_KEY_PREFIX = 'kahoot_grading_draft_';
const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

interface GradingDraft {
    scores: { 1: TaskScores; 2: TaskScores };
    feedback: { 1: TaskFeedback; 2: TaskFeedback };
    comments: { 1: GradingComment[]; 2: GradingComment[] };
    voided: { 1: boolean; 2: boolean };
    voidReasons: { 1: string; 2: string };
    savedAt: number;
}

// ═══════════════════════════════════════════════════════════════
// DIAGNOSTIC LOGGING (buffered — supports clipboard export)
// ═══════════════════════════════════════════════════════════════

const WGM_LOG_ENABLED = import.meta.env.DEV;

/** In-memory buffer of all WGM log entries (max 2000) */
const _wgmBuffer: string[] = [];
const WGM_BUFFER_MAX = 2000;

/** Dedup: suppress identical [tag + serialized] within 100ms (React StrictMode) */
let _wgmLastEntry = '';
let _wgmLastTime = 0;
const WGM_DEDUP_MS = 100;

function _wgmPush(tag: string, args: unknown[]): boolean {
    const ts = new Date().toISOString().slice(11, 23); // HH:mm:ss.SSS
    const serialized = args.map(a => {
        if (a === null || a === undefined) return String(a);
        if (typeof a === 'object') {
            try { return JSON.stringify(a); } catch { return String(a); }
        }
        return String(a);
    }).join(' ');

    // Dedup: skip if same tag+content within 100ms
    const fingerprint = `${tag}|${serialized}`;
    const now = performance.now();
    if (fingerprint === _wgmLastEntry && now - _wgmLastTime < WGM_DEDUP_MS) {
        return false; // suppressed
    }
    _wgmLastEntry = fingerprint;
    _wgmLastTime = now;

    const line = `[${ts}] [${tag}] ${serialized}`;
    _wgmBuffer.push(line);
    if (_wgmBuffer.length > WGM_BUFFER_MAX) _wgmBuffer.shift();
    return true;
}

function _wgmMakeLogger(tag: string, consoleFn: 'debug' | 'warn' | 'error', color: string) {
    return (...args: unknown[]) => {
        if (!WGM_LOG_ENABLED && consoleFn !== 'error') return;
        if (!_wgmPush(tag, args)) return; // deduped — don't print
        if (consoleFn === 'error') {
            console.error(`[WGM:${tag}]`, ...args);
        } else if (consoleFn === 'warn') {
            console.warn(`[WGM:${tag}]`, ...args);
        } else {
            console.debug(`%c[WGM:${tag}]`, `color:${color};font-weight:bold`, ...args);
        }
    };
}

const wgmLog = {
    lifecycle: _wgmMakeLogger('LIFECYCLE', 'debug', '#8b5cf6'),
    data: _wgmMakeLogger('DATA', 'debug', '#06b6d4'),
    scoring: _wgmMakeLogger('SCORING', 'debug', '#f59e0b'),
    band: _wgmMakeLogger('BAND', 'debug', '#10b981'),
    annotation: _wgmMakeLogger('ANNOTATION', 'debug', '#ec4899'),
    feedback: _wgmMakeLogger('FEEDBACK', 'debug', '#3b82f6'),
    void_: _wgmMakeLogger('VOID', 'debug', '#dc2626'),
    save: _wgmMakeLogger('SAVE', 'debug', '#16a34a'),
    submit: _wgmMakeLogger('SUBMIT', 'debug', '#7c3aed'),
    audit: _wgmMakeLogger('AUDIT', 'debug', '#94a3b8'),
    selection: _wgmMakeLogger('SELECTION', 'debug', '#64748b'),
    warn: _wgmMakeLogger('WARN', 'warn', '#f59e0b'),
    error: _wgmMakeLogger('ERROR', 'error', '#dc2626'),
    table: (label: string, data: unknown) => {
        if (!WGM_LOG_ENABLED) return;
        if (!_wgmPush('TABLE', [label, data])) return;
        console.groupCollapsed(`%c[WGM:TABLE] ${label}`, 'color:#475569;font-weight:bold');
        console.table(data);
        console.groupEnd();
    },
    /** Get all buffered log lines as a single string */
    getBuffer: () => _wgmBuffer.join('\n'),
    /** Get count of buffered entries */
    getBufferCount: () => _wgmBuffer.length,
    /** Clear the buffer */
    clearBuffer: () => { _wgmBuffer.length = 0; },
};

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface WritingGradingModalProps {
    /** Whether the modal is open */
    opened: boolean;
    /** Submission ID to grade (null = closed) */
    submissionId: string | null;
    /** Called when the modal should close */
    onClose: () => void;
    /** Called after successful grading submission (to refresh list) */
    onGradingComplete?: () => void;
}

interface TaskScores {
    ta: number | null;
    cc: number | null;
    lr: number | null;
    gra: number | null;
}

interface TaskFeedback {
    ta: string; cc: string; lr: string; gra: string; overall: string;
}

interface SelectedText {
    text: string;
    startOffset: number;
    endOffset: number;
}

const EMPTY_SCORES: TaskScores = { ta: null, cc: null, lr: null, gra: null };
const EMPTY_FEEDBACK: TaskFeedback = { ta: '', cc: '', lr: '', gra: '', overall: '' };

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function WritingGradingModal({
    opened,
    submissionId,
    onClose,
    onGradingComplete,
}: WritingGradingModalProps) {
    const { user } = useAuth();

    // ─── Data ─────────────────────────────────────────────────
    const [submission, setSubmission] = useState<WritingSubmission | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // ─── Grading state ────────────────────────────────────────
    const [activeTask, setActiveTask] = useState<1 | 2>(1);
    const [scores, setScores] = useState<{ 1: TaskScores; 2: TaskScores }>({
        1: { ...EMPTY_SCORES }, 2: { ...EMPTY_SCORES },
    });
    const [feedback, setFeedback] = useState<{ 1: TaskFeedback; 2: TaskFeedback }>({
        1: { ...EMPTY_FEEDBACK }, 2: { ...EMPTY_FEEDBACK },
    });
    const [_annotations, setAnnotations] = useState<WritingAnnotation[]>([]);
    const [voided, setVoided] = useState<{ 1: boolean; 2: boolean }>({ 1: false, 2: false });
    const [voidReasons, setVoidReasons] = useState<{ 1: string; 2: string }>({ 1: '', 2: '' });
    const [auditTrail, setAuditTrail] = useState<WritingGradingAudit[]>([]);
    const [_categories, _setCategories] = useState<AnnotationCategory[]>([]);
    const [selectedText, setSelectedText] = useState<SelectedText | null>(null);
    const [showModelAnswer, setShowModelAnswer] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [hasUnsaved, setHasUnsaved] = useState(false);

    // ─── New: Right-panel tab + Comments state ──────────────────
    type RightPanelTab = 'prompt' | 'comments' | 'scoring';
    const [rightTab, setRightTab] = useState<RightPanelTab>('prompt');
    const [comments, setComments] = useState<{ 1: GradingComment[]; 2: GradingComment[] }>({ 1: [], 2: [] });
    const [focusedCommentId, setFocusedCommentId] = useState<string | null>(null);
    const [hoveredCommentId, setHoveredCommentId] = useState<string | null>(null);
    const [essayViewMode, setEssayViewMode] = useState<'original' | 'marked'>('marked');
    const [showCorrectionPopup, setShowCorrectionPopup] = useState(false);
    const [_correctionPosition, _setCorrectionPosition] = useState({ top: 0, left: 0 });
    const [_correctionSelectedText, _setCorrectionSelectedText] = useState('');
    const [editorScrollTop, setEditorScrollTop] = useState(0);

    // ─── Toast + Recovery + Close dialog ────────────────────────
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const toastTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const [showRecoveryPrompt, setShowRecoveryPrompt] = useState(false);
    const [recoveryDraft, setRecoveryDraft] = useState<GradingDraft | null>(null);
    const [showCloseDialog, setShowCloseDialog] = useState(false);

    const essayContainerRef = useRef<HTMLDivElement>(null);
    const autoSaveRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const isRestoringRef = useRef(false); // Guard: suppress markUnsaved during initial load

    // ─── Reset state on open/close ─────────────────────────────
    useEffect(() => {
        if (!opened || !submissionId) {
            wgmLog.lifecycle('CLOSE/RESET — opened:', opened, 'submissionId:', submissionId);
            // Reset when closed
            setSubmission(null);
            setLoading(true);
            setError(null);
            setActiveTask(1);
            setScores({ 1: { ...EMPTY_SCORES }, 2: { ...EMPTY_SCORES } });
            setFeedback({ 1: { ...EMPTY_FEEDBACK }, 2: { ...EMPTY_FEEDBACK } });
            setAnnotations([]);
            setVoided({ 1: false, 2: false });
            setVoidReasons({ 1: '', 2: '' });
            setAuditTrail([]);
            setSelectedText(null);
            setShowModelAnswer(false);
            setSubmitting(false);
            setHasUnsaved(false);
            setRightTab('prompt');
            setComments({ 1: [], 2: [] });
            setFocusedCommentId(null);
            setHoveredCommentId(null);
            setEssayViewMode('marked');
            setShowCorrectionPopup(false);
            setEditorScrollTop(0);
            isRestoringRef.current = false;
            wgmLog.lifecycle('All state reset to defaults');
            return;
        }

        // Load submission
        wgmLog.lifecycle('OPEN — submissionId:', submissionId, 'teacher:', user?.uid);
        const loadStartTime = performance.now();
        (async () => {
            setLoading(true);
            isRestoringRef.current = true;
            wgmLog.data('Fetching submission:', submissionId);
            const result = await getSubmission(submissionId);
            const loadMs = Math.round(performance.now() - loadStartTime);

            if (result.success && result.data) {
                const sub = result.data;
                setSubmission(sub);
                wgmLog.data(`Submission loaded in ${loadMs}ms`, {
                    id: sub.id,
                    student: sub.studentName,
                    studentId: sub.studentId,
                    testTitle: sub.testMeta?.testTitle,
                    format: sub.testMeta?.format,
                    markingStatus: sub.markingStatus,
                    taskCount: sub.tasks?.length ?? 0,
                    contextType: sub.context?.type,
                    pasteAttempts: sub.pasteAttemptCount ?? 0,
                    submittedAt: sub.submittedAt ? new Date(sub.submittedAt).toISOString() : 'N/A',
                });

                // Log each task's essay stats
                sub.tasks?.forEach(t => {
                    wgmLog.data(`Task ${t.taskNumber} essay:`, {
                        wordCount: t.wordCount,
                        essayLength: t.essayText?.length ?? 0,
                        activeTimeSec: t.activeTimeSeconds,
                        activeTimeMin: Math.round((t.activeTimeSeconds || 0) / 60),
                        taskType: t.taskType,
                        wordMinimum: t.wordMinimum,
                        hasPromptImage: !!t.promptImageUrl,
                        promptLength: t.promptText?.length ?? 0,
                    });
                });

                // Restore existing grading state if already partially graded
                if (sub.grading) {
                    const g = sub.grading;
                    wgmLog.scoring('RESTORING existing grading state', {
                        gradedBy: g.teacherName,
                        gradedAt: g.gradedAt ? new Date(g.gradedAt).toISOString() : 'N/A',
                        overallBand: g.overallBand,
                        perTaskCount: g.perTask?.length ?? 0,
                    });

                    if (g.perTask) {
                        for (const tg of g.perTask) {
                            const tn = tg.taskNumber as 1 | 2;
                            const restoredScores = {
                                ta: tg.criteriaScores?.TA ?? tg.criteriaScores?.TR ?? null,
                                cc: tg.criteriaScores?.CC ?? null,
                                lr: tg.criteriaScores?.LR ?? null,
                                gra: tg.criteriaScores?.GRA ?? null,
                            };
                            setScores(prev => ({ ...prev, [tn]: restoredScores }));
                            wgmLog.scoring(`Task ${tn} scores restored:`, restoredScores, 'band:', tg.taskBand, 'voided:', tg.isVoided);

                            if (tg.isVoided) {
                                setVoided(prev => ({ ...prev, [tn]: true }));
                                setVoidReasons(prev => ({ ...prev, [tn]: tg.voidReason || '' }));
                                wgmLog.void_(`Task ${tn} is VOIDED — reason:`, tg.voidReason);
                            }
                        }
                        if (g.feedback) {
                            const fb: TaskFeedback = {
                                ta: g.feedback.perCriteria?.TA || g.feedback.perCriteria?.TR || '',
                                cc: g.feedback.perCriteria?.CC || '',
                                lr: g.feedback.perCriteria?.LR || '',
                                gra: g.feedback.perCriteria?.GRA || '',
                                overall: g.feedback.overall || '',
                            };
                            setFeedback(prev => ({ ...prev, 1: { ...fb }, 2: { ...fb } }));
                            wgmLog.feedback('Feedback restored:', {
                                taLength: fb.ta.length,
                                ccLength: fb.cc.length,
                                lrLength: fb.lr.length,
                                graLength: fb.gra.length,
                                overallLength: fb.overall.length,
                            });
                        }
                    }
                } else {
                    wgmLog.scoring('No existing grading — fresh submission');
                }

                if (sub.annotations?.length) {
                    setAnnotations(sub.annotations);
                    const byType: Record<string, number> = {};
                    const byCat: Record<string, number> = {};
                    sub.annotations.forEach(a => {
                        byType[a.type] = (byType[a.type] || 0) + 1;
                        byCat[a.categoryLabel || a.categoryId || 'unknown'] = (byCat[a.categoryLabel || a.categoryId || 'unknown'] || 0) + 1;
                    });
                    wgmLog.annotation(`${sub.annotations.length} annotations loaded`);
                    wgmLog.table('Annotations by type', byType);
                    wgmLog.table('Annotations by category', byCat);
                } else {
                    wgmLog.annotation('No annotations on this submission');
                }

                if (sub.auditTrail?.length) {
                    setAuditTrail(sub.auditTrail);
                    wgmLog.audit(`${sub.auditTrail.length} audit trail entries loaded`);
                    sub.auditTrail.forEach((entry) => {
                        wgmLog.audit(`  [v${entry.version}] ${new Date(entry.gradedAt).toISOString()} by ${entry.teacherId?.slice(0, 8)} — reason: "${entry.reason}"`);
                    });
                } else {
                    wgmLog.audit('No audit trail (first grading)');
                }
            } else {
                const errMsg = result.error || 'Submission not found';
                wgmLog.error(`Failed to load submission ${submissionId} after ${loadMs}ms:`, errMsg);
                setError(errMsg);
            }
            setLoading(false);
            // Clear restoring guard after TipTap settles (onUpdate fires async)
            setTimeout(() => { isRestoringRef.current = false; }, 500);
        })();
    }, [opened, submissionId]);

    // Categories are now managed by COMMENT_CATEGORIES constant
    // (Old getAnnotationCategories effect removed)

    // Selection tracking
    useEffect(() => {
        if (!opened) return;
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
    }, [opened]);

    // Beforeunload warning
    useEffect(() => {
        if (!hasUnsaved) return;
        const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [hasUnsaved]);

    // Auto-save to localStorage every 30 seconds
    useEffect(() => {
        if (!submissionId || !hasUnsaved || !opened) return;
        clearTimeout(autoSaveRef.current);
        autoSaveRef.current = setTimeout(() => {
            const draft: GradingDraft = {
                scores,
                feedback,
                comments,
                voided,
                voidReasons,
                savedAt: Date.now(),
            };
            try {
                localStorage.setItem(DRAFT_KEY_PREFIX + submissionId, JSON.stringify(draft));
                wgmLog.save('Auto-saved to localStorage');
            } catch (e) {
                wgmLog.warn('localStorage auto-save failed:', e);
            }
        }, 30_000);
        return () => clearTimeout(autoSaveRef.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scores, feedback, comments, voided, voidReasons, hasUnsaved, opened, submissionId]);

    // Escape to close (with unsaved check)
    useEffect(() => {
        if (!opened) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                handleCloseRequest();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [opened, hasUnsaved]); // eslint-disable-line react-hooks/exhaustive-deps

    const markUnsaved = useCallback(() => {
        if (isRestoringRef.current) return; // Skip during initial load
        setHasUnsaved(prev => {
            if (!prev) wgmLog.lifecycle('State marked UNSAVED');
            return true;
        });
    }, []);

    // ─── Computed ─────────────────────────────────────────────
    const taskCount = useMemo(() => {
        if (!submission) return 1;
        const fmt = submission.testMeta?.format;
        const count = fmt === 'full-test' ? 2 : 1;
        wgmLog.data('Task count computed:', count, '(format:', fmt, ')');
        return count;
    }, [submission]);

    const activeTaskData = useMemo(() => {
        const data = submission?.tasks?.find(t => t.taskNumber === activeTask);
        if (data) {
            wgmLog.data(`Active task data resolved: Task ${activeTask}`, {
                wordCount: data.wordCount,
                essayPreview: data.essayText?.slice(0, 60) + (data.essayText?.length > 60 ? '...' : ''),
                taskType: data.taskType,
            });
        }
        return data;
    }, [submission, activeTask]);

    // taskAnnotations removed — comments now managed via comments state

    const buildTaskGradingResults = useCallback((): WritingTaskGradingResult[] => {
        const results: WritingTaskGradingResult[] = [];
        for (let tn = 1; tn <= taskCount; tn++) {
            const s = scores[tn as 1 | 2];
            const v = voided[tn as 1 | 2];
            if (v) {
                wgmLog.band(`Task ${tn}: VOIDED — excluded from band calc`);
                results.push({
                    taskNumber: tn as 1 | 2,
                    isVoided: true,
                    voidReason: voidReasons[tn as 1 | 2],
                    criteriaScores: { CC: 0, LR: 0, GRA: 0 },
                    taskBand: 0,
                });
                continue;
            }
            const missing = [s.ta === null && 'TA/TR', s.cc === null && 'CC', s.lr === null && 'LR', s.gra === null && 'GRA'].filter(Boolean);
            if (missing.length > 0) {
                wgmLog.band(`Task ${tn}: INCOMPLETE — missing:`, missing.join(', '));
                continue;
            }
            const criteriaScores = tn === 1
                ? { TA: s.ta!, CC: s.cc!, LR: s.lr!, GRA: s.gra! }
                : { TR: s.ta!, CC: s.cc!, LR: s.lr!, GRA: s.gra! };
            const taskBand = calculateTaskBand(criteriaScores);
            wgmLog.band(`Task ${tn}: ${tn === 1 ? 'TA' : 'TR'}=${s.ta} CC=${s.cc} LR=${s.lr} GRA=${s.gra} → avg=${((s.ta! + s.cc! + s.lr! + s.gra!) / 4).toFixed(2)} → band=${taskBand}`);
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
        const allResults = buildTaskGradingResults();
        const taskResults = allResults.filter(t => !t.isVoided && t.taskBand > 0);
        if (taskResults.length === 0) {
            wgmLog.band('Overall band: N/A (no valid scored tasks)');
            return null;
        }
        const format = submission.testMeta?.format || 'full-test';
        const result = calculateOverallBand(taskResults, format);
        wgmLog.band(`OVERALL BAND: ${result}`, {
            format,
            validTasks: taskResults.length,
            voidedTasks: allResults.filter(t => t.isVoided).length,
            taskBands: taskResults.map(t => `Task${t.taskNumber}=${t.taskBand}`).join(', '),
        });
        return result;
    }, [submission, buildTaskGradingResults]);

    // ─── Handlers ─────────────────────────────────────────────
    // Old annotation handlers removed — replaced by comment management handlers below

    const handleScoresChange = useCallback((taskNum: 1 | 2, newScores: TaskScores) => {
        setScores(prev => {
            const old = prev[taskNum];
            const changed = (['ta', 'cc', 'lr', 'gra'] as const).filter(k => old[k] !== newScores[k]);
            if (changed.length > 0) {
                wgmLog.scoring(`Task ${taskNum} score change:`, changed.map(k =>
                    `${k.toUpperCase()}: ${old[k] ?? '—'} → ${newScores[k] ?? '—'}`
                ).join(', '));
            }
            const filled = (['ta', 'cc', 'lr', 'gra'] as const).filter(k => newScores[k] !== null).length;
            wgmLog.scoring(`Task ${taskNum} completeness: ${filled}/4 criteria scored`);
            return { ...prev, [taskNum]: newScores };
        });
        markUnsaved();
    }, [markUnsaved]);

    // Debounced feedback logging — batches per-keystroke TipTap updates
    const _fbLogTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
    const _fbLogAccum = useRef<Record<string, { from: number; to: number }>>({}); // tracks pending log data

    const handleFeedbackChange = useCallback((taskNum: 1 | 2, newFeedback: TaskFeedback) => {
        setFeedback(prev => {
            const old = prev[taskNum];
            (['ta', 'cc', 'lr', 'gra', 'overall'] as const).forEach(k => {
                if (old[k] !== newFeedback[k]) {
                    const key = `T${taskNum}_${k}`;
                    const existing = _fbLogAccum.current[key];
                    if (!existing) {
                        _fbLogAccum.current[key] = { from: old[k].length, to: newFeedback[k].length };
                    } else {
                        existing.to = newFeedback[k].length;
                    }
                }
            });
            return { ...prev, [taskNum]: newFeedback };
        });

        // Flush accumulated feedback changes after 500ms of quiet
        clearTimeout(_fbLogTimer.current);
        _fbLogTimer.current = setTimeout(() => {
            const accum = _fbLogAccum.current;
            const keys = Object.keys(accum);
            if (keys.length > 0) {
                const summary = keys.map(k => {
                    const entry = accum[k];
                    return `${k}: ${entry?.from ?? '?'} → ${entry?.to ?? '?'} chars`;
                }).join(', ');
                wgmLog.feedback(`Feedback updated: ${summary}`);
                _fbLogAccum.current = {};
            }
        }, 500);

        markUnsaved();
    }, [markUnsaved]);

    const handleVoid = useCallback((taskNum: 1 | 2, reason: string) => {
        wgmLog.void_(`VOIDING Task ${taskNum} — reason: "${reason}" (${reason.length} chars)`);
        setVoided(prev => ({ ...prev, [taskNum]: true }));
        setVoidReasons(prev => ({ ...prev, [taskNum]: reason }));
        markUnsaved();
    }, [markUnsaved]);

    const handleUnvoid = useCallback((taskNum: 1 | 2) => {
        wgmLog.void_(`UN-VOIDING Task ${taskNum}`);
        setVoided(prev => ({ ...prev, [taskNum]: false }));
        setVoidReasons(prev => ({ ...prev, [taskNum]: '' }));
        markUnsaved();
    }, [markUnsaved]);

    const buildGradingResult = useCallback((): WritingGradingResult => {
        const perTask = buildTaskGradingResults();
        const result: WritingGradingResult = {
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
        wgmLog.save('Built grading result payload', {
            teacher: result.teacherName,
            overallBand: result.overallBand,
            tasksGraded: perTask.filter(t => !t.isVoided && t.taskBand > 0).length,
            tasksVoided: perTask.filter(t => t.isVoided).length,
            feedbackTotal: Object.values(result.feedback.perCriteria).filter(v => v && v.length > 0).length + (result.feedback.overall ? 1 : 0) + ' fields filled',
        });
        return result;
    }, [buildTaskGradingResults, overallBand, feedback, user]);

    // ─── Toast helper ─────────────────────────────────────────
    const showToast = useCallback((msg: string) => {
        setToastMessage(msg);
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => setToastMessage(null), 3000);
    }, []);

    // ─── Clear localStorage draft ────────────────────────────
    const clearLocalDraft = useCallback(() => {
        if (submissionId) {
            localStorage.removeItem(DRAFT_KEY_PREFIX + submissionId);
            wgmLog.save('localStorage draft cleared');
        }
    }, [submissionId]);

    // ─── Recovery Prompt: check on submission load ────────────
    useEffect(() => {
        if (!submissionId || !submission || loading) return;
        try {
            const raw = localStorage.getItem(DRAFT_KEY_PREFIX + submissionId);
            if (!raw) return;
            const draft: GradingDraft = JSON.parse(raw);
            if (Date.now() - draft.savedAt > DRAFT_MAX_AGE_MS) {
                localStorage.removeItem(DRAFT_KEY_PREFIX + submissionId);
                wgmLog.save('Expired localStorage draft removed (> 24h)');
                return;
            }
            wgmLog.save('Found localStorage draft from', Math.round((Date.now() - draft.savedAt) / 60_000), 'min ago');
            setRecoveryDraft(draft);
            setShowRecoveryPrompt(true);
        } catch {
            wgmLog.warn('Failed to parse localStorage draft');
        }
    }, [submissionId, submission, loading]);

    const handleRecoveryResume = useCallback(() => {
        if (!recoveryDraft) return;
        setScores(recoveryDraft.scores);
        setFeedback(recoveryDraft.feedback);
        setComments(recoveryDraft.comments);
        setVoided(recoveryDraft.voided);
        setVoidReasons(recoveryDraft.voidReasons);
        wgmLog.save('Recovered from localStorage draft');
        showToast('Draft recovered from auto-save');
        setShowRecoveryPrompt(false);
        setRecoveryDraft(null);
    }, [recoveryDraft, showToast]);

    const handleRecoveryDiscard = useCallback(() => {
        clearLocalDraft();
        wgmLog.save('Discarded localStorage draft');
        setShowRecoveryPrompt(false);
        setRecoveryDraft(null);
    }, [clearLocalDraft]);

    // ─── Save Draft (Firestore) ──────────────────────────────
    const handleSaveDraft = useCallback(async () => {
        if (!submissionId) return;
        const saveStart = performance.now();
        const allComments = [...comments[1], ...comments[2]];
        wgmLog.save('SAVE DRAFT starting...', { submissionId, commentCount: allComments.length });
        try {
            const gradingResult = buildGradingResult();
            await updateGradingV2(submissionId, gradingResult, {}, allComments, false);
            const saveMs = Math.round(performance.now() - saveStart);
            wgmLog.save(`SAVE DRAFT SUCCESS in ${saveMs}ms`);
            setHasUnsaved(false);
            clearLocalDraft();
            showToast('Draft saved');
        } catch (err) {
            const saveMs = Math.round(performance.now() - saveStart);
            wgmLog.error(`SAVE DRAFT FAILED after ${saveMs}ms:`, err);
            showToast('Failed to save draft');
        }
    }, [submissionId, buildGradingResult, comments, clearLocalDraft, showToast]);

    // ─── Submit Grading (Firestore + set graded) ─────────────
    const handleSubmitGrading = useCallback(async () => {
        if (!submissionId || submitting) {
            wgmLog.submit('SUBMIT blocked — submissionId:', submissionId, 'submitting:', submitting);
            return;
        }

        const allResults = buildTaskGradingResults();
        const validResults = allResults.filter(t => !t.isVoided && t.taskBand > 0);
        if (validResults.length === 0) {
            wgmLog.warn('SUBMIT REJECTED — no valid scored tasks');
            showToast('Please score at least one task completely (all 4 criteria) or void all tasks.');
            return;
        }

        setSubmitting(true);
        const submitStart = performance.now();
        const allComments = [...comments[1], ...comments[2]];
        const isReEdit = submission?.markingStatus === 'graded';

        try {
            const gradingResult = buildGradingResult();
            await updateGradingV2(submissionId, gradingResult, {}, allComments, true /* markAsGraded */);
            const submitMs = Math.round(performance.now() - submitStart);
            wgmLog.submit(`SUBMIT SUCCESS in ${submitMs}ms — band: ${gradingResult.overallBand}`);
            setHasUnsaved(false);
            clearLocalDraft();
            showToast('Grading submitted');

            // Notify student (non-blocking)
            if (submission?.studentId && overallBand !== null) {
                const notifMsg = isReEdit
                    ? `Your writing result has been updated by ${user?.displayName || user?.email || 'your teacher'}`
                    : undefined;
                wgmLog.submit('Sending notification to student:', submission.studentId, isReEdit ? '(RE-EDIT)' : '');
                notifyWritingGraded(
                    submission.studentId,
                    submissionId,
                    submission.testMeta?.testTitle || 'Writing Test',
                    overallBand,
                    user?.displayName || user?.email || undefined
                ).then(() => {
                    wgmLog.submit('Notification sent successfully', notifMsg ? '(re-edit msg sent)' : '');
                }).catch(err => {
                    wgmLog.warn('Notification failed:', err);
                });
            }

            onGradingComplete?.();
            onClose();
        } catch (err) {
            const submitMs = Math.round(performance.now() - submitStart);
            wgmLog.error(`SUBMIT FAILED after ${submitMs}ms:`, err);
            showToast('Failed to submit grading. Please try again.');
        } finally {
            setSubmitting(false);
        }
    }, [submissionId, submitting, buildTaskGradingResults, buildGradingResult, comments, submission, overallBand, user, onClose, onGradingComplete, clearLocalDraft, showToast]);

    // ─── Close request with 3-button dialog ──────────────────
    const handleCloseRequest = useCallback(() => {
        wgmLog.lifecycle('Close requested — hasUnsaved:', hasUnsaved);
        if (hasUnsaved) {
            setShowCloseDialog(true);
            return;
        }
        onClose();
    }, [hasUnsaved, onClose]);

    const handleCloseSaveAndClose = useCallback(async () => {
        setShowCloseDialog(false);
        await handleSaveDraft();
        onClose();
    }, [handleSaveDraft, onClose]);

    const handleCloseDiscard = useCallback(() => {
        setShowCloseDialog(false);
        clearLocalDraft();
        setHasUnsaved(false);
        onClose();
    }, [clearLocalDraft, onClose]);

    const handleCloseCancel = useCallback(() => {
        setShowCloseDialog(false);
    }, []);

    // ─── Don't render if not opened ───────────────────────────
    // ─── Comment management handlers ─────────────────────────
    const activeComments = useMemo(() => comments[activeTask], [comments, activeTask]);
    const commentCount = useMemo(() => comments[activeTask].length, [comments, activeTask]);

    const handleAddComment = useCallback((text: string, categoryId: string, color: string, anchorText: string, existingCommentId?: string) => {
        const newComment: GradingComment = {
            id: existingCommentId || `comment-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            text,
            anchorText,
            categoryId: categoryId as any,
            categoryLabel: COMMENT_CATEGORIES[categoryId as keyof typeof COMMENT_CATEGORIES]?.label || categoryId.toUpperCase(),
            color,
            status: 'active',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            taskNumber: activeTask,
        };
        setComments(prev => ({ ...prev, [activeTask]: [...prev[activeTask], newComment] }));
        setRightTab('comments');
        setFocusedCommentId(newComment.id);
        markUnsaved();
    }, [activeTask, markUnsaved]);

    const handleQuickPreset = useCallback((preset: QuickCommentPreset) => {
        if (!selectedText) return;
        handleAddComment(preset.text, preset.categoryId, preset.color, selectedText.text);
    }, [selectedText, handleAddComment]);

    const handleEditComment = useCallback((commentId: string, newText: string) => {
        setComments(prev => ({
            ...prev,
            [activeTask]: prev[activeTask].map(c => c.id === commentId ? { ...c, text: newText } : c),
        }));
        markUnsaved();
    }, [activeTask, markUnsaved]);

    const handleResolveComment = useCallback((commentId: string) => {
        setComments(prev => ({
            ...prev,
            [activeTask]: prev[activeTask].map(c => c.id === commentId ? { ...c, status: 'resolved' as const } : c),
        }));
        markUnsaved();
    }, [activeTask, markUnsaved]);

    const handleReopenComment = useCallback((commentId: string) => {
        setComments(prev => ({
            ...prev,
            [activeTask]: prev[activeTask].map(c => c.id === commentId ? { ...c, status: 'active' as const } : c),
        }));
        markUnsaved();
    }, [activeTask, markUnsaved]);

    const handleDeleteComment = useCallback((commentId: string) => {
        setComments(prev => ({
            ...prev,
            [activeTask]: prev[activeTask].map(c => c.id === commentId ? { ...c, status: 'deleted' as const } : c),
        }));
        markUnsaved();
    }, [activeTask, markUnsaved]);

    const handleRecoverComment = useCallback((commentId: string) => {
        setComments(prev => ({
            ...prev,
            [activeTask]: prev[activeTask].map(c => c.id === commentId ? { ...c, status: 'active' as const } : c),
        }));
        markUnsaved();
    }, [activeTask, markUnsaved]);

    const handleCommentCategoryChange = useCallback((commentId: string, categoryId: any) => {
        const cat = COMMENT_CATEGORIES[categoryId as keyof typeof COMMENT_CATEGORIES];
        if (!cat) return;
        setComments(prev => ({
            ...prev,
            [activeTask]: prev[activeTask].map(c =>
                c.id === commentId ? { ...c, categoryId, categoryLabel: cat.label, color: cat.color } : c
            ),
        }));
        markUnsaved();
    }, [activeTask, markUnsaved]);

    const handleCorrectionApply = useCallback((_correctionText: string) => {
        setShowCorrectionPopup(false);
        markUnsaved();
    }, [markUnsaved]);

    // ─── Don't render if not opened ───────────────────────────
    if (!opened) return null;

    // ─── RENDER CONTENT ──────────────────────────────────────
    const renderBody = () => {
        if (loading) {
            return (
                <div className="wgm-loading">
                    <div className="wgm-spinner" />
                    <span style={{ color: '#64748b', fontSize: '0.875rem' }}>Loading submission...</span>
                </div>
            );
        }

        if (error || !submission) {
            return (
                <div className="wgm-error">
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
                    <div style={{ fontSize: '1.125rem', fontWeight: 600, color: '#1e293b' }}>
                        {error || 'Submission not found'}
                    </div>
                </div>
            );
        }

        return (
            <div className="wgm-content-grid" id="wgm-content-grid">
                {/* ═══ LEFT COLUMN: Essay Editor ═══ */}
                <div className="wgm-essay-column" ref={essayContainerRef}>
                    <EssayEditor
                        originalEssayText={activeTaskData?.essayText || ''}
                        initialContent={null}
                        wordCount={activeTaskData?.wordCount || 0}
                        activeTimeSeconds={activeTaskData?.activeTimeSeconds || 0}
                        taskNumber={activeTask}
                        commentPositions={[]}
                        focusedCommentId={focusedCommentId}
                        hoveredCommentId={hoveredCommentId}
                        onAddComment={(anchorText: string, _from: number, _to: number, commentId: string) => {
                            handleAddComment('', 'uncategorized', COMMENT_CATEGORIES.uncategorized.color, anchorText, commentId);
                        }}
                        onGutterDotClick={(commentId) => {
                            setRightTab('comments');
                            setFocusedCommentId(commentId);
                        }}
                        onCommentMarkClick={(commentId) => {
                            setRightTab('comments');
                            setFocusedCommentId(commentId);
                        }}
                        onViewModeChange={(_mode: 'marked' | 'original') => {
                            // View mode toggling handled by EssayEditor internally
                        }}
                        onCorrectionRequest={(_from: number, _to: number, _selectedText: string) => {
                            // Corrections handled by EssayEditor internally
                        }}
                    />

                    {/* Quick Comments FAB */}
                    <QuickCommentsDialog
                        taskNumber={activeTask}
                        hasSelection={!!selectedText}
                        onSelectPreset={handleQuickPreset}
                    />

                    {/* Correction Popup */}
                    <CorrectionPopup
                        isOpen={showCorrectionPopup}
                        selectedText={_correctionSelectedText}
                        position={_correctionPosition}
                        onApply={handleCorrectionApply}
                        onDismiss={() => setShowCorrectionPopup(false)}
                    />
                </div>

                {/* ═══ RIGHT COLUMN: Tabbed Panel ═══ */}
                <div className="wgm-right-panel">
                    {/* ── 3-Tab Header ── */}
                    <div className="wgm-right-tabs" id="wgm-right-tabs">
                        <button
                            className={`wgm-right-tab ${rightTab === 'prompt' ? 'active' : ''}`}
                            onClick={() => setRightTab('prompt')}
                            id="wgm-tab-prompt"
                        >
                            📋 Prompt
                        </button>
                        <button
                            className={`wgm-right-tab ${rightTab === 'comments' ? 'active' : ''} ${essayViewMode === 'original' ? 'disabled' : ''}`}
                            onClick={() => essayViewMode !== 'original' && setRightTab('comments')}
                            disabled={essayViewMode === 'original'}
                            id="wgm-tab-comments"
                        >
                            💬 Comments ({commentCount})
                        </button>
                        <button
                            className={`wgm-right-tab ${rightTab === 'scoring' ? 'active' : ''}`}
                            onClick={() => setRightTab('scoring')}
                            id="wgm-tab-scoring"
                        >
                            📊 Scoring
                        </button>
                    </div>

                    {/* ── Tab Content ── */}
                    <div className="wgm-right-content">
                        {/* Prompt Tab */}
                        {rightTab === 'prompt' && (
                            <div className="wgm-prompt-panel" id="wgm-prompt-panel">
                                <div className="wgm-prompt-text">
                                    {activeTaskData?.promptText || 'No prompt available'}
                                </div>
                                {activeTaskData?.promptImageUrl && (
                                    <img
                                        src={activeTaskData.promptImageUrl}
                                        alt="Task prompt"
                                        className="wgm-prompt-image"
                                    />
                                )}
                                {/* Model Answer — collapsible */}
                                <div className="wgm-model-section">
                                    <button
                                        className="wgm-model-toggle"
                                        onClick={() => setShowModelAnswer(!showModelAnswer)}
                                        id="wgm-model-toggle"
                                    >
                                        {showModelAnswer ? '▼ Hide' : '▶ Show'} Model Answer
                                    </button>
                                    {showModelAnswer && (activeTaskData as any)?.modelAnswer && (
                                        <div className="wgm-model-answer">
                                            {(activeTaskData as any).modelAnswer}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Comments Tab */}
                        {rightTab === 'comments' && (
                            <CommentSidebar
                                comments={activeComments}
                                taskNumber={activeTask}
                                focusedCommentId={focusedCommentId}
                                hoveredCommentId={hoveredCommentId}
                                anchorPositions={[]}
                                editorScrollTop={editorScrollTop}
                                onFocusComment={setFocusedCommentId}
                                onHoverComment={setHoveredCommentId}
                                onEditComment={handleEditComment}
                                onResolveComment={handleResolveComment}
                                onReopenComment={handleReopenComment}
                                onDeleteComment={handleDeleteComment}
                                onRecoverComment={handleRecoverComment}
                                onCategoryChange={handleCommentCategoryChange}
                            />
                        )}

                        {/* Scoring Tab */}
                        {rightTab === 'scoring' && (
                            <div className="wgm-scoring-panel" id="wgm-scoring-panel">
                                <CriteriaScoringPanel
                                    taskNumber={activeTask}
                                    scores={scores[activeTask]}
                                    onChange={(s) => handleScoresChange(activeTask, s)}
                                    isVoided={voided[activeTask]}
                                />

                                <TabbedFeedbackEditor
                                    taskNumber={activeTask}
                                    feedback={feedback[activeTask]}
                                    onChange={(f) => handleFeedbackChange(activeTask, f)}
                                />

                                <VoidTaskButton
                                    taskNumber={activeTask}
                                    isVoided={voided[activeTask]}
                                    voidReason={voidReasons[activeTask]}
                                    onVoid={(reason) => handleVoid(activeTask, reason)}
                                    onUnvoid={() => handleUnvoid(activeTask)}
                                />

                                <div className="wgm-scoring-audit">
                                    <GradingAuditTrail entries={auditTrail} />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const studentName = submission?.studentName || '[Deleted Student]';
    const testTitle = submission?.testMeta?.testTitle || 'Writing Submission';

    return createPortal(
        <div className="wgm-overlay" onClick={(e) => {
            if (e.target === e.currentTarget) handleCloseRequest();
        }}>
            <div className="wgm-dialog" role="dialog" aria-modal="true" aria-label="Writing Grading">
                {/* ─── Header ─────────────────────────────────── */}
                <div className="wgm-header">
                    <div className="wgm-header-left">
                        <span style={{ fontSize: '1.5rem' }}>✍️</span>
                        <div className="wgm-title-area">
                            <h2>{loading ? 'Loading…' : studentName}</h2>
                            <p>{loading ? '' : `${testTitle} • ${submission?.testMeta?.format === 'full-test' ? 'Full Test' : submission?.testMeta?.format === 'task1-only' ? 'Task 1 Only' : 'Task 2 Only'}`}</p>
                        </div>
                    </div>
                    <div className="wgm-header-actions">
                        {!loading && !error && submission && (
                            <>
                                <button className="wgm-btn-save" onClick={handleSaveDraft}>
                                    💾 Save Draft
                                </button>
                                {import.meta.env.DEV && (
                                    <button
                                        className="wgm-btn-save"
                                        onClick={() => {
                                            const logs = wgmLog.getBuffer();
                                            const count = wgmLog.getBufferCount();
                                            navigator.clipboard.writeText(logs).then(() => {
                                                const btn = document.getElementById('wgm-copy-logs-btn');
                                                if (btn) {
                                                    btn.textContent = `✅ ${count} lines copied!`;
                                                    setTimeout(() => { btn.textContent = `📋 Copy Logs (${count})`; }, 1500);
                                                }
                                            }).catch(() => {
                                                alert('Failed to copy logs to clipboard');
                                            });
                                        }}
                                        id="wgm-copy-logs-btn"
                                        style={{ fontSize: '0.75rem', opacity: 0.7 }}
                                        title="DEV ONLY — Copy all WGM diagnostic logs to clipboard"
                                    >
                                        📋 Copy Logs ({wgmLog.getBufferCount()})
                                    </button>
                                )}
                                <button
                                    className="wgm-btn-submit"
                                    onClick={handleSubmitGrading}
                                    disabled={submitting}
                                >
                                    {submitting ? 'Submitting...' : '✅ Submit Grading'}
                                </button>
                            </>
                        )}
                        <button className="wgm-btn-close" onClick={handleCloseRequest} aria-label="Close modal">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* ─── Task Tabs ───────────────────────────────── */}
                {!loading && !error && submission && taskCount > 1 && (
                    <div className="wgm-tab-bar">
                        {([1, 2] as const).map(tn => (
                            <button
                                key={tn}
                                className={`wgm-tab ${activeTask === tn ? 'wgm-tab--active' : ''}`}
                                onClick={() => setActiveTask(tn)}
                            >
                                Task {tn}
                                {voided[tn] && ' 🚫'}
                            </button>
                        ))}
                    </div>
                )}

                {/* ─── Body (scrollable) ───────────────────────── */}
                <div className="wgm-body">
                    {renderBody()}
                </div>

                {/* ─── Footer ──────────────────────────────────── */}
                {!loading && !error && submission && (
                    <div className="wgm-footer">
                        <div>
                            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Overall Band: </span>
                            <span className="wgm-overall-band">
                                {overallBand !== null ? overallBand : '—'}
                            </span>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button className="wgm-btn-save" onClick={handleCloseRequest}>
                                Close
                            </button>
                        </div>
                    </div>
                )}

                {/* ─── Toast Notification ────────────────────── */}
                {toastMessage && (
                    <div className="wgm-toast" id="wgm-toast">
                        {toastMessage}
                    </div>
                )}

                {/* ─── Recovery Prompt Overlay ───────────────── */}
                {showRecoveryPrompt && recoveryDraft && (
                    <div className="wgm-recovery-overlay">
                        <div className="wgm-recovery-dialog" id="wgm-recovery-dialog">
                            <p>
                                📝 Resume from auto-save from{' '}
                                <strong>{Math.round((Date.now() - recoveryDraft.savedAt) / 60_000)} minutes ago</strong>?
                            </p>
                            <div className="wgm-recovery-actions">
                                <button className="wgm-recovery-btn resume" onClick={handleRecoveryResume}>
                                    Resume
                                </button>
                                <button className="wgm-recovery-btn discard" onClick={handleRecoveryDiscard}>
                                    Discard
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ─── Unsaved Changes Close Dialog ─────────── */}
                {showCloseDialog && (
                    <div className="wgm-recovery-overlay">
                        <div className="wgm-recovery-dialog" id="wgm-close-dialog">
                            <p>⚠️ You have unsaved changes.</p>
                            <div className="wgm-recovery-actions">
                                <button className="wgm-recovery-btn resume" onClick={handleCloseSaveAndClose}>
                                    Save & Close
                                </button>
                                <button className="wgm-recovery-btn discard" onClick={handleCloseDiscard}>
                                    Discard
                                </button>
                                <button className="wgm-recovery-btn cancel" onClick={handleCloseCancel}>
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}
