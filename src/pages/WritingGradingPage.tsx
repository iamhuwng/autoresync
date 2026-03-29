import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useNavigation } from '../hooks/useNavigation';
import { useFeatureTracking } from '../hooks/useFeatureTracking';
import { FEATURE_IDS } from '../config/featureRegistry';
import { storage } from '../core/platform';
import { RichContent } from '../core/components/RichContent';
import { TeacherHeader } from '../components/navigation';
import {
    getWritingSubmissionForGrading,
    saveGradingDraft,
    publishGrading,
    discardPrivateDraft,
} from '../services/writingSubmissionService';
import {
    WRITING_GRADING_LOCK_HEARTBEAT_MS,
    acquireWritingGradingLock,
    getWritingGradingLock,
    releaseWritingGradingLock,
    renewWritingGradingLock,
    type WritingGradingLock,
} from '../services/writingGradingLockService';
import {
    DEFAULT_QUICK_COMMENT_PRESETS,
    addTeacherQuickCommentPreset,
    deleteTeacherQuickCommentPreset,
    getTeacherQuickCommentPresets,
} from '../services/writingQuickCommentPresetService';
import AIMaintenanceBanner from '../components/ai/AIMaintenanceBanner';
import EssayEditor from '../components/writing-grading/EssayEditor';
import CommentSidebar, { type PendingCommentDraft } from '../components/writing-grading/CommentSidebar';
import QuickCommentsDialog from '../components/writing-grading/QuickCommentsDialog';
import CorrectionPopup from '../components/writing-grading/CorrectionPopup';
import CriteriaScoringPanel from '../components/writing-grading/CriteriaScoringPanel';
import TabbedFeedbackEditor, { type FeedbackContent } from '../components/writing-grading/TabbedFeedbackEditor';
import VoidTaskButton from '../components/writing-grading/VoidTaskButton';
import GradingAuditTrail from '../components/writing-grading/GradingAuditTrail';
import type {
    CommentCategoryId,
    GradingComment,
    PublishedWritingGrading,
    QuickCommentPreset,
    WritingGradingDraft,
    WritingSubmission,
    WritingSubmissionForGrading,
    WritingSubmissionTask,
    WritingTaskMarkupState,
} from '../types/ielts-writing.types';
import { COMMENT_CATEGORIES } from '../types/ielts-writing.types';
import { calculateTaskBand } from '../utils/ieltsWritingBandCalculator';
import './WritingGradingPage.css';

type PanelTab = 'prompt' | 'comments' | 'scoring';
type PageMode = 'review' | 'editing';

interface TaskScores {
    ta: number | null;
    cc: number | null;
    lr: number | null;
    gra: number | null;
}

interface TaskEditorState {
    taskNumber: 1 | 2;
    taskType: WritingSubmissionTask['taskType'];
    promptText: string;
    promptImageUrl?: string;
    essayText: string;
    wordCount: number;
    activeTimeSeconds: number;
    markedContent: Record<string, any> | null;
    comments: GradingComment[];
    scores: TaskScores;
    feedback: FeedbackContent;
    isVoided: boolean;
    voidReason: string;
    taskBand: number | null;
}

interface LocalDraftBackup {
    submissionId: string;
    draft: WritingGradingDraft;
    savedAt: number;
}

interface CommentAnchorPosition {
    commentId: string;
    anchorTop: number;
    anchorRight: number;
    anchorCenterY: number;
}

const COMMENT_HIGHLIGHT_COLORS = [
    '#f59e0b',
    '#10b981',
    '#3b82f6',
    '#8b5cf6',
    '#ef4444',
    '#ec4899',
    '#14b8a6',
    '#f97316',
    '#84cc16',
    '#6366f1',
] as const;

function createSessionId() {
    return `grading-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getDraftStorageKey(submissionId: string) {
    return `kahoot_grading_draft_${submissionId}`;
}

function createTaskScores(taskNumber: 1 | 2, task?: WritingTaskMarkupState): TaskScores {
    return {
        ta: taskNumber === 1 ? task?.criteriaScores.TA ?? null : task?.criteriaScores.TR ?? null,
        cc: task?.criteriaScores.CC ?? null,
        lr: task?.criteriaScores.LR ?? null,
        gra: task?.criteriaScores.GRA ?? null,
    };
}

function createTaskFeedback(taskNumber: 1 | 2, task?: WritingTaskMarkupState): FeedbackContent {
    return {
        taskSummary: task?.taskSummary || '',
        ta: taskNumber === 1 ? task?.perCriteriaFeedback.TA || '' : task?.perCriteriaFeedback.TR || '',
        cc: task?.perCriteriaFeedback.CC || '',
        lr: task?.perCriteriaFeedback.LR || '',
        gra: task?.perCriteriaFeedback.GRA || '',
    };
}

function buildTaskEditorState(task: WritingSubmissionTask, markup?: WritingTaskMarkupState): TaskEditorState {
    return {
        taskNumber: task.taskNumber,
        taskType: task.taskType,
        promptText: task.promptText,
        promptImageUrl: task.promptImageUrl,
        essayText: task.essayText,
        wordCount: task.wordCount,
        activeTimeSeconds: task.activeTimeSeconds,
        markedContent: markup?.markedContent || null,
        comments: markup?.comments ? [...markup.comments] : [],
        scores: createTaskScores(task.taskNumber, markup),
        feedback: createTaskFeedback(task.taskNumber, markup),
        isVoided: markup?.isVoided || false,
        voidReason: markup?.voidReason || '',
        taskBand: markup?.taskBand ?? null,
    };
}

function buildTaskStates(
    submission: WritingSubmission,
    source?: Partial<Record<1 | 2, WritingTaskMarkupState>>
) {
    return submission.tasks.reduce((acc, task) => {
        acc[task.taskNumber] = buildTaskEditorState(task, source?.[task.taskNumber]);
        return acc;
    }, {} as Record<1 | 2, TaskEditorState>);
}

function buildTaskMarkupState(task: TaskEditorState): WritingTaskMarkupState {
    return {
        taskNumber: task.taskNumber,
        markedContent: task.markedContent,
        comments: task.comments,
        isVoided: task.isVoided,
        voidReason: task.voidReason || undefined,
        criteriaScores: {
            ...(task.taskNumber === 1 && task.scores.ta !== null ? { TA: task.scores.ta } : {}),
            ...(task.taskNumber === 2 && task.scores.ta !== null ? { TR: task.scores.ta } : {}),
            ...(task.scores.cc !== null ? { CC: task.scores.cc } : {}),
            ...(task.scores.lr !== null ? { LR: task.scores.lr } : {}),
            ...(task.scores.gra !== null ? { GRA: task.scores.gra } : {}),
        },
        taskBand: task.taskBand,
        taskSummary: task.feedback.taskSummary,
        perCriteriaFeedback: {
            ...(task.taskNumber === 1 ? { TA: task.feedback.ta } : { TR: task.feedback.ta }),
            CC: task.feedback.cc,
            LR: task.feedback.lr,
            GRA: task.feedback.gra,
        },
    };
}

function buildDerivedOverallSummary(taskStates: Record<1 | 2, TaskEditorState>) {
    return Object.values(taskStates)
        .filter((task) => !task.isVoided && isHtmlMeaningful(task.feedback.taskSummary))
        .sort((left, right) => left.taskNumber - right.taskNumber)
        .map((task) => `<p><strong>Task ${task.taskNumber} Summary</strong></p>${task.feedback.taskSummary}`)
        .join('');
}

function buildDraftFromPageState(
    submissionId: string,
    teacherId: string,
    teacherName: string,
    taskStates: Record<1 | 2, TaskEditorState>,
    previous?: WritingGradingDraft | null,
): WritingGradingDraft {
    return {
        submissionId,
        version: previous?.version ?? 0,
        ownerTeacherId: teacherId,
        ownerTeacherName: teacherName,
        basedOnPublishedVersion: previous?.basedOnPublishedVersion ?? 0,
        createdAt: previous?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
        overallSummary: buildDerivedOverallSummary(taskStates),
        perTask: Object.entries(taskStates).reduce((acc, [key, task]) => {
            acc[Number(key) as 1 | 2] = buildTaskMarkupState(task);
            return acc;
        }, {} as Partial<Record<1 | 2, WritingTaskMarkupState>>),
    };
}

function calculateLiveTaskBand(task: TaskEditorState): number | null {
    if (task.isVoided) {
        return null;
    }

    if (
        task.scores.ta === null
        || task.scores.cc === null
        || task.scores.lr === null
        || task.scores.gra === null
    ) {
        return null;
    }

    return task.taskNumber === 1
        ? calculateTaskBand({ TA: task.scores.ta, CC: task.scores.cc, LR: task.scores.lr, GRA: task.scores.gra })
        : calculateTaskBand({ TR: task.scores.ta, CC: task.scores.cc, LR: task.scores.lr, GRA: task.scores.gra });
}

function isHtmlMeaningful(html: string) {
    return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').trim().length > 0;
}

function getNextCommentHighlightColor(comments: GradingComment[]) {
    const usedColors = new Set(comments.map((comment) => comment.color));
    const unusedColor = COMMENT_HIGHLIGHT_COLORS.find((color) => !usedColors.has(color));
    if (unusedColor) {
        return unusedColor;
    }

    return COMMENT_HIGHLIGHT_COLORS[comments.length % COMMENT_HIGHLIGHT_COLORS.length] || COMMENT_HIGHLIGHT_COLORS[0];
}

function formatAbsoluteDate(timestamp?: number) {
    if (!timestamp) {
        return '-';
    }

    return new Date(timestamp).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export default function WritingGradingPage() {
    const { submissionId } = useParams<{ submissionId: string }>();
    const { user, profile, logout } = useAuth();
    const { navigateTo } = useNavigation('teacher');
    const { trackAction } = useFeatureTracking(FEATURE_IDS.grading);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [submission, setSubmission] = useState<WritingSubmission | null>(null);
    const [publishedGrading, setPublishedGrading] = useState<PublishedWritingGrading | null>(null);
    const [serverDraft, setServerDraft] = useState<WritingGradingDraft | null>(null);
    const [taskStates, setTaskStates] = useState<Record<1 | 2, TaskEditorState>>({} as Record<1 | 2, TaskEditorState>);
    const [mode, setMode] = useState<PageMode>('review');
    const [panelTab, setPanelTab] = useState<PanelTab>('comments');
    const [editorViewMode, setEditorViewMode] = useState<'marked' | 'original'>('marked');
    const [activeTask, setActiveTask] = useState<1 | 2>(1);
    const [focusedCommentId, setFocusedCommentId] = useState<string | null>(null);
    const [hoveredCommentId, setHoveredCommentId] = useState<string | null>(null);
    const [anchorPositions, setAnchorPositions] = useState<CommentAnchorPosition[]>([]);
    const [editorScrollTop, setEditorScrollTop] = useState(0);
    const [hasSelectionInEditor, setHasSelectionInEditor] = useState(false);
    const [quickCommentPresets, setQuickCommentPresets] = useState<QuickCommentPreset[]>(DEFAULT_QUICK_COMMENT_PRESETS);
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [lockInfo, setLockInfo] = useState<WritingGradingLock | null>(null);
    const [lockConflict, setLockConflict] = useState<WritingGradingLock | null>(null);
    const [pendingCommentDrafts, setPendingCommentDrafts] = useState<Partial<Record<1 | 2, PendingCommentDraft>>>({});
    const [pendingQuickComment, setPendingQuickComment] = useState<{ preset: QuickCommentPreset; nonce: number } | null>(null);
    const [pendingCorrection, setPendingCorrection] = useState<{ from: number; to: number; correctionText: string; nonce: number } | null>(null);
    const [pendingCommentMutation, setPendingCommentMutation] = useState<{
        action: 'remove' | 'apply';
        commentId: string;
        color: string;
        from: number;
        to: number;
        nonce: number;
    } | null>(null);
    const [correctionRequest, setCorrectionRequest] = useState<{
        from: number;
        to: number;
        selectedText: string;
        position: { top: number; left: number };
    } | null>(null);

    const pageRef = useRef<HTMLDivElement>(null);
    const sessionIdRef = useRef(createSessionId());
    const saveQueueRef = useRef(Promise.resolve());
    const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const mutationNonceRef = useRef(0);
    const quickCommentNonceRef = useRef(0);
    const correctionNonceRef = useRef(0);
    const dirtyRef = useRef(false);
    const modeRef = useRef<PageMode>('review');
    const submissionRef = useRef<WritingSubmission | null>(null);
    const publishedGradingRef = useRef<PublishedWritingGrading | null>(null);
    const serverDraftRef = useRef<WritingGradingDraft | null>(null);
    const taskStatesRef = useRef<Record<1 | 2, TaskEditorState>>({} as Record<1 | 2, TaskEditorState>);
    const lockInfoRef = useRef<WritingGradingLock | null>(null);
    const pendingCommentDraftsRef = useRef<Partial<Record<1 | 2, PendingCommentDraft>>>({});

    useEffect(() => {
        dirtyRef.current = dirty;
    }, [dirty]);

    useEffect(() => {
        modeRef.current = mode;
    }, [mode]);

    useEffect(() => {
        submissionRef.current = submission;
    }, [submission]);

    useEffect(() => {
        publishedGradingRef.current = publishedGrading;
    }, [publishedGrading]);

    useEffect(() => {
        serverDraftRef.current = serverDraft;
    }, [serverDraft]);

    useEffect(() => {
        taskStatesRef.current = taskStates;
    }, [taskStates]);

    useEffect(() => {
        lockInfoRef.current = lockInfo;
    }, [lockInfo]);

    useEffect(() => {
        pendingCommentDraftsRef.current = pendingCommentDrafts;
    }, [pendingCommentDrafts]);

    const showStatus = useCallback((message: string) => {
        setStatusMessage(message);
        if (statusTimerRef.current) {
            clearTimeout(statusTimerRef.current);
        }
        statusTimerRef.current = setTimeout(() => setStatusMessage(null), 3500);
    }, []);

    const handleLogout = useCallback(async () => {
        try {
            await logout();
            navigateTo('LOGIN', {}, { reason: 'teacher_logout', replace: true });
        } catch (logoutError) {
            console.error('Logout error:', logoutError);
        }
    }, [logout, navigateTo]);

    const buildCurrentDraft = useCallback(() => {
        if (!submissionId || !user?.uid) {
            return null;
        }

        const draft = buildDraftFromPageState(
            submissionId,
            user.uid,
            user.displayName || user.email || 'Teacher',
            taskStatesRef.current,
            serverDraftRef.current,
        );

        draft.basedOnPublishedVersion = serverDraftRef.current?.basedOnPublishedVersion
            ?? publishedGradingRef.current?.auditVersion
            ?? 0;

        return draft;
    }, [submissionId, user?.displayName, user?.email, user?.uid]);

    const setTaskState = useCallback((taskNumber: 1 | 2, updater: (current: TaskEditorState) => TaskEditorState) => {
        setTaskStates((current) => {
            const next = { ...current, [taskNumber]: updater(current[taskNumber]) };
            return next;
        });
        setDirty(true);
    }, []);

    const setPendingCommentDraft = useCallback((taskNumber: 1 | 2, draft: PendingCommentDraft | null) => {
        setPendingCommentDrafts((current) => {
            if (!draft) {
                if (!current[taskNumber]) {
                    return current;
                }

                const next = { ...current };
                delete next[taskNumber];
                return next;
            }

            return {
                ...current,
                [taskNumber]: draft,
            };
        });
    }, []);

    const activeTaskState = taskStates[activeTask];
    const activePendingCommentDraft = pendingCommentDrafts[activeTask] || null;
    const taskCount = submission?.tasks.length || 1;
    const ownsDraft = Boolean(user?.uid && serverDraft?.ownerTeacherId === user.uid);
    const foreignDraftOwnerId = submission?.gradingDraftMeta?.ownerTeacherId;
    const hasForeignDraft = Boolean(foreignDraftOwnerId && foreignDraftOwnerId !== user?.uid);
    const hasAnyPendingCommentDraft = Object.keys(pendingCommentDrafts).length > 0;
    const currentLockIsOwned = Boolean(
        user?.uid
        && lockInfo?.teacherId === user.uid
        && lockInfo.sessionId === sessionIdRef.current
        && lockInfo.expiresAt > Date.now()
    );
    const hasPublishBlockingError = useMemo(() => {
        if (!submission) {
            return true;
        }

        return submission.tasks.some((task) => {
            const state = taskStates[task.taskNumber];
            if (!state || state.isVoided) {
                return false;
            }

            return (
                state.scores.ta === null
                || state.scores.cc === null
                || state.scores.lr === null
                || state.scores.gra === null
                || !isHtmlMeaningful(state.feedback.taskSummary)
            );
        });
    }, [submission, taskStates]);

    const resetFromGradingSource = useCallback((
        nextSubmission: WritingSubmission,
        nextPublished: PublishedWritingGrading | null,
        nextDraft: WritingGradingDraft | null
    ) => {
        const source = nextDraft?.perTask || nextPublished?.perTask;
        setTaskStates(buildTaskStates(nextSubmission, source));
        setPublishedGrading(nextPublished);
        setServerDraft(nextDraft);
        setSubmission(nextSubmission);
        setFocusedCommentId(null);
        setHoveredCommentId(null);
        setAnchorPositions([]);
        setDirty(false);
    }, []);

    useEffect(() => {
        if (!submissionId || !user?.uid) {
            return;
        }

        let isActive = true;

        const load = async () => {
            setLoading(true);
            setError(null);

            try {
                const [gradingResult, presets, localBackup] = await Promise.all([
                    getWritingSubmissionForGrading(submissionId, user.uid),
                    getTeacherQuickCommentPresets(user.uid),
                    storage.get<LocalDraftBackup>(getDraftStorageKey(submissionId)),
                ]);

                if (!gradingResult.success || !gradingResult.data) {
                    throw new Error(gradingResult.error || 'Failed to load writing submission');
                }

                if (!isActive) {
                    return;
                }

                const data: WritingSubmissionForGrading = gradingResult.data;
                const serverOwnedDraft = data.gradingDraft;
                const published = data.publishedGrading || data.submission.publishedGrading || null;
                const backupMatches = Boolean(
                    localBackup
                    && localBackup.submissionId === submissionId
                    && localBackup.draft.ownerTeacherId === user.uid
                    && localBackup.draft.basedOnPublishedVersion === (published?.auditVersion ?? 0)
                    && localBackup.savedAt > (serverOwnedDraft?.updatedAt ?? 0)
                );
                const preferredDraft = backupMatches ? localBackup!.draft : serverOwnedDraft;
                const nextHasForeignDraft = Boolean(
                    data.submission.gradingDraftMeta?.ownerTeacherId
                    && data.submission.gradingDraftMeta.ownerTeacherId !== user.uid
                );

                setQuickCommentPresets(presets);
                resetFromGradingSource(data.submission, published, preferredDraft);
                setMode(data.submission.markingStatus === 'pending-review' && !nextHasForeignDraft ? 'editing' : 'review');
            } catch (loadError) {
                if (!isActive) {
                    return;
                }
                setError(loadError instanceof Error ? loadError.message : 'Failed to load writing grading page');
            } finally {
                if (isActive) {
                    setLoading(false);
                }
            }
        };

        void load();

        return () => {
            isActive = false;
        };
    }, [resetFromGradingSource, submissionId, user?.uid]);

    const releaseLock = useCallback(async () => {
        if (!submissionId || !user?.uid || !lockInfoRef.current) {
            return;
        }

        const owned = (
            lockInfoRef.current.teacherId === user.uid
            && lockInfoRef.current.sessionId === sessionIdRef.current
        );
        if (!owned) {
            return;
        }

        await releaseWritingGradingLock(submissionId, user.uid, sessionIdRef.current).catch(() => undefined);
        setLockInfo(null);
    }, [submissionId, user?.uid]);

    const acquireLock = useCallback(async () => {
        if (!submissionId || !user?.uid) {
            return false;
        }

        const response = await acquireWritingGradingLock({
            submissionId,
            teacherId: user.uid,
            teacherName: user.displayName || user.email || 'Teacher',
            sessionId: sessionIdRef.current,
        });

        if (!response.success || !response.lock) {
            setLockConflict(response.conflict || null);
            return false;
        }

        setLockInfo(response.lock);
        setLockConflict(null);
        trackAction('acquireLock', { submissionId, mode: modeRef.current });
        return true;
    }, [submissionId, trackAction, user?.displayName, user?.email, user?.uid]);

    const startEditing = useCallback(async (reason: 'pending-review' | 'resume-draft' | 'start-regrade') => {
        if (!submission || !user?.uid) {
            return;
        }

        if (submission.gradingDraftMeta?.ownerTeacherId && submission.gradingDraftMeta.ownerTeacherId !== user.uid) {
            const latestLock = await getWritingGradingLock(submission.id);
            setLockConflict(latestLock);
            return;
        }

        const locked = await acquireLock();
        if (!locked) {
            return;
        }

        if (reason === 'start-regrade' && publishedGrading && !ownsDraft) {
            const nextTaskStates = buildTaskStates(submission, publishedGrading.perTask);
            const seededDraft = buildDraftFromPageState(
                submission.id,
                user.uid,
                user.displayName || user.email || 'Teacher',
                nextTaskStates,
                null,
            );
            seededDraft.basedOnPublishedVersion = publishedGrading.auditVersion;
            resetFromGradingSource(submission, publishedGrading, seededDraft);
        }

        setMode('editing');
        trackAction(reason === 'start-regrade' ? 'startRegrade' : 'openSubmission', {
            submissionId: submission.id,
            state: submission.markingStatus,
        });
    }, [
        acquireLock,
        ownsDraft,
        publishedGrading,
        resetFromGradingSource,
        submission,
        trackAction,
        user?.displayName,
        user?.email,
        user?.uid,
    ]);

    const saveLocalBackup = useCallback(async () => {
        if (!submissionId || !user?.uid || !dirtyRef.current) {
            return;
        }

        const draft = buildCurrentDraft();
        if (!draft) {
            return;
        }

        await storage.set(getDraftStorageKey(submissionId), {
            submissionId,
            draft,
            savedAt: Date.now(),
        } satisfies LocalDraftBackup);
    }, [buildCurrentDraft, submissionId, user?.uid]);

    const enqueueWrite = useCallback(async <T,>(job: () => Promise<T>) => {
        const next = saveQueueRef.current.then(job, job);
        saveQueueRef.current = next.then(() => undefined, () => undefined);
        return next;
    }, []);

    const persistDraft = useCallback(async (source: 'manual' | 'autosave') => {
        if (!submissionId || !submission || !user?.uid || !dirtyRef.current) {
            return true;
        }

        const currentLock = lockInfoRef.current;
        const ownsLiveLock = Boolean(
            currentLock
            && currentLock.teacherId === user.uid
            && currentLock.sessionId === sessionIdRef.current
            && currentLock.expiresAt > Date.now()
        );

        if (modeRef.current !== 'editing' || !ownsLiveLock) {
            await saveLocalBackup();
            return false;
        }

        return enqueueWrite(async () => {
            setSaving(true);
            await saveLocalBackup();

            const draft = buildCurrentDraft();
            if (!draft) {
                throw new Error('Unable to build draft snapshot');
            }

            const response = await saveGradingDraft(submissionId, draft, {
                expectedDraftVersion: serverDraftRef.current?.version ?? null,
                expectedPublishedVersion: publishedGradingRef.current?.auditVersion ?? 0,
            });

            setSaving(false);

            if (!response.success || !response.data) {
                throw new Error(response.error || 'Failed to save draft');
            }

            setServerDraft(response.data);
            setSubmission((current) => current ? ({
                ...current,
                gradingDraftMeta: {
                    ownerTeacherId: response.data!.ownerTeacherId,
                    ownerTeacherName: response.data!.ownerTeacherName,
                    version: response.data!.version,
                    basedOnPublishedVersion: response.data!.basedOnPublishedVersion,
                    updatedAt: response.data!.updatedAt,
                },
                markingStatus: current.markingStatus === 'graded' ? 'graded' : 'pending-review',
            }) : current);
            setDirty(false);
            showStatus(source === 'autosave' ? 'Draft autosaved' : 'Draft saved');
            trackAction('saveDraft', { submissionId, source });
            return true;
        });
    }, [
        buildCurrentDraft,
        enqueueWrite,
        saveLocalBackup,
        showStatus,
        submission,
        submissionId,
        trackAction,
        user?.uid,
    ]);

    const handlePublish = useCallback(async () => {
        if (!submissionId || !submission || !user?.uid) {
            return;
        }

        if (!currentLockIsOwned) {
            showStatus('Your grading lock is not active. Reacquire it before publishing.');
            return;
        }

        if (hasAnyPendingCommentDraft) {
            showStatus('Finish or cancel the open comment composer before publishing.');
            return;
        }

        if (hasPublishBlockingError) {
            showStatus('Complete all non-voided scores and write a task summary for each active task before publishing');
            return;
        }

        if (autosaveTimerRef.current) {
            clearTimeout(autosaveTimerRef.current);
            autosaveTimerRef.current = null;
        }

        setPublishing(true);

        try {
            await enqueueWrite(async () => {
                const draft = buildCurrentDraft();
                if (!draft) {
                    throw new Error('Unable to build draft snapshot');
                }

                const reason = publishedGradingRef.current
                    ? (window.prompt('Reason for regrade:') || '').trim()
                    : '';

                if (publishedGradingRef.current && !reason) {
                    throw new Error('A regrade reason is required');
                }

                const response = await publishGrading(submissionId, draft, {
                    expectedDraftVersion: serverDraftRef.current?.version ?? null,
                    expectedPublishedVersion: publishedGradingRef.current?.auditVersion ?? 0,
                    reason: reason || undefined,
                });

                if (!response.success || !response.data) {
                    throw new Error(response.error || 'Failed to publish grading');
                }

                const nextPublished = response.data;
                setPublishedGrading(nextPublished);
                setServerDraft(null);
                setSubmission((current) => current ? ({
                    ...current,
                    publishedGrading: nextPublished,
                    gradingDraftMeta: null,
                    markingStatus: 'graded',
                }) : current);
                setDirty(false);
                await storage.remove(getDraftStorageKey(submissionId));
                await releaseLock();
                setMode('review');
                showStatus('Grading published');
                trackAction('submitGrading', { submissionId, auditVersion: nextPublished.auditVersion });
            });
        } catch (publishError) {
            showStatus(publishError instanceof Error ? publishError.message : 'Failed to publish grading');
        } finally {
            setPublishing(false);
        }
    }, [
        buildCurrentDraft,
        enqueueWrite,
        hasPublishBlockingError,
        hasAnyPendingCommentDraft,
        currentLockIsOwned,
        releaseLock,
        showStatus,
        submission,
        submissionId,
        trackAction,
        user?.uid,
    ]);

    const handleDiscardTakeover = useCallback(async () => {
        if (!submission || !user?.uid || !submission.gradingDraftMeta?.ownerTeacherId || submission.gradingDraftMeta.ownerTeacherId === user.uid) {
            return;
        }

        const latestLock = await getWritingGradingLock(submission.id);
        if (latestLock && latestLock.expiresAt > Date.now() && latestLock.teacherId !== user.uid) {
            setLockConflict(latestLock);
            showStatus('Another teacher still has an active lock. Takeover is blocked until the lock expires.');
            return;
        }

        const reason = (window.prompt('Reason for discarding the other teacher draft and taking over:') || '').trim();
        if (!reason) {
            return;
        }

        const discardResult = await discardPrivateDraft(submission.id, {
            actorTeacherId: user.uid,
            actorTeacherName: user.displayName || user.email || 'Teacher',
            reason,
        });

        if (!discardResult.success) {
            showStatus(discardResult.error || 'Failed to discard the private draft');
            return;
        }

        setSubmission((current) => current ? ({ ...current, gradingDraftMeta: null }) : current);
        trackAction('discardDraftTakeover', { submissionId: submission.id });
        const locked = await acquireLock();
        if (!locked) {
            return;
        }
        setMode('editing');
        showStatus('Private draft discarded. You now own the grading draft.');
    }, [
        acquireLock,
        showStatus,
        submission,
        trackAction,
        user?.displayName,
        user?.email,
        user?.uid,
    ]);

    useEffect(() => {
        if (mode !== 'editing' || !submission || hasForeignDraft) {
            return;
        }

        if (submission.markingStatus === 'pending-review') {
            void startEditing('pending-review');
        }
    }, [hasForeignDraft, mode, startEditing, submission]);

    useEffect(() => {
        if (mode !== 'editing') {
            if (heartbeatTimerRef.current) {
                clearInterval(heartbeatTimerRef.current);
                heartbeatTimerRef.current = null;
            }
            return;
        }

        if (!submissionId || !user?.uid) {
            return;
        }

        if (!heartbeatTimerRef.current) {
            heartbeatTimerRef.current = setInterval(() => {
                const currentLock = lockInfoRef.current;
                if (!currentLock || currentLock.teacherId !== user.uid || currentLock.sessionId !== sessionIdRef.current) {
                    return;
                }

                void renewWritingGradingLock(submissionId, user.uid, sessionIdRef.current).then((result) => {
                    if (!result.success || !result.lock) {
                        setLockInfo(null);
                        trackAction('lockExpired', { submissionId });
                        showStatus(result.error || 'Your grading lock expired');
                        return;
                    }

                    setLockInfo(result.lock);
                });
            }, WRITING_GRADING_LOCK_HEARTBEAT_MS);
        }

        return () => {
            if (heartbeatTimerRef.current) {
                clearInterval(heartbeatTimerRef.current);
                heartbeatTimerRef.current = null;
            }
        };
    }, [mode, showStatus, submissionId, trackAction, user?.uid]);

    useEffect(() => {
        if (mode !== 'editing' || !dirty) {
            if (autosaveTimerRef.current) {
                clearTimeout(autosaveTimerRef.current);
                autosaveTimerRef.current = null;
            }
            return;
        }

        autosaveTimerRef.current = setTimeout(() => {
            void persistDraft('autosave').catch((saveError) => {
                showStatus(saveError instanceof Error ? saveError.message : 'Failed to autosave draft');
            });
        }, 30_000);

        return () => {
            if (autosaveTimerRef.current) {
                clearTimeout(autosaveTimerRef.current);
                autosaveTimerRef.current = null;
            }
        };
    }, [dirty, mode, persistDraft, showStatus]);

    useEffect(() => {
        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            if (modeRef.current === 'editing' && (dirtyRef.current || Object.keys(pendingCommentDraftsRef.current).length > 0)) {
                event.preventDefault();
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, []);

    useEffect(() => () => {
        if (statusTimerRef.current) {
            clearTimeout(statusTimerRef.current);
        }
        if (heartbeatTimerRef.current) {
            clearInterval(heartbeatTimerRef.current);
        }
        if (autosaveTimerRef.current) {
            clearTimeout(autosaveTimerRef.current);
        }
        void releaseLock();
    }, [releaseLock]);

    useEffect(() => {
        const handleSelectionChange = () => {
            const editorContainer = pageRef.current?.querySelector('#essay-editor-container');
            const selection = document.getSelection();
            if (!editorContainer || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
                setHasSelectionInEditor(false);
                return;
            }

            const anchorNode = selection.anchorNode;
            setHasSelectionInEditor(Boolean(anchorNode && editorContainer.contains(anchorNode)));
        };

        document.addEventListener('selectionchange', handleSelectionChange);
        return () => document.removeEventListener('selectionchange', handleSelectionChange);
    }, []);

    useEffect(() => {
        const editorContainer = pageRef.current?.querySelector('#essay-editor-container') as HTMLElement | null;
        if (!editorContainer) {
            return;
        }

        const updatePositions = () => {
            const nextAnchors = (activeTaskState?.comments || [])
                .filter((comment) => comment.status !== 'deleted')
                .map((comment) => {
                    const mark = editorContainer.querySelector(`[data-comment-id="${comment.id}"]`) as HTMLElement | null;
                    if (!mark) {
                        return null;
                    }

                    const markRect = mark.getBoundingClientRect();
                    const containerRect = editorContainer.getBoundingClientRect();
                    return {
                        commentId: comment.id,
                        anchorTop: markRect.top - containerRect.top + editorContainer.scrollTop,
                        anchorRight: markRect.right - containerRect.left,
                        anchorCenterY: (markRect.top - containerRect.top + editorContainer.scrollTop) + (markRect.height / 2),
                    } satisfies CommentAnchorPosition;
                })
                .filter(Boolean) as CommentAnchorPosition[];

            setAnchorPositions(nextAnchors);
            setEditorScrollTop(editorContainer.scrollTop);
        };

        const raf = requestAnimationFrame(updatePositions);
        editorContainer.addEventListener('scroll', updatePositions);
        window.addEventListener('resize', updatePositions);

        return () => {
            cancelAnimationFrame(raf);
            editorContainer.removeEventListener('scroll', updatePositions);
            window.removeEventListener('resize', updatePositions);
        };
    }, [activeTaskState?.comments, activeTaskState?.markedContent, activeTask, focusedCommentId, hoveredCommentId, mode, panelTab]);

    const handleTaskChange = useCallback((taskNumber: 1 | 2) => {
        setActiveTask(taskNumber);
        setFocusedCommentId(null);
        setHoveredCommentId(null);
        trackAction('switchTask', { submissionId, taskNumber });
    }, [submissionId, trackAction]);

    const handlePanelTabChange = useCallback((nextTab: PanelTab) => {
        if (nextTab !== panelTab) {
            trackAction('switchTab', { submissionId, tab: nextTab });
        }
        setPanelTab(nextTab);
    }, [panelTab, submissionId, trackAction]);

    const handleViewModeChange = useCallback((viewMode: 'marked' | 'original') => {
        setEditorViewMode(viewMode);
        trackAction('toggleOriginalView', { submissionId, viewMode });
        if (viewMode === 'original' && panelTab === 'comments') {
            setPanelTab('prompt');
        }
    }, [panelTab, submissionId, trackAction]);

    const updateCommentState = useCallback((
        commentId: string,
        updater: (comment: GradingComment) => GradingComment
    ) => {
        setTaskState(activeTask, (current) => ({
            ...current,
            comments: current.comments.map((comment) => comment.id === commentId ? updater(comment) : comment),
        }));
    }, [activeTask, setTaskState]);

    const handleEditComment = useCallback((commentId: string, newText: string) => {
        updateCommentState(commentId, (comment) => ({
            ...comment,
            text: newText,
            updatedAt: Date.now(),
        }));
    }, [updateCommentState]);

    const pushCommentMutation = useCallback((comment: GradingComment, action: 'remove' | 'apply', color?: string) => {
        mutationNonceRef.current += 1;
        setPendingCommentMutation({
            action,
            commentId: comment.id,
            color: color || comment.color,
            from: comment.from,
            to: comment.to,
            nonce: mutationNonceRef.current,
        });
    }, []);

    const createSavedComment = useCallback((
        draft: PendingCommentDraft,
        html: string,
        preset?: QuickCommentPreset
    ) => {
        const taskComments = taskStatesRef.current[draft.taskNumber]?.comments || [];
        const categoryId = preset?.categoryId || draft.categoryId;
        const category = COMMENT_CATEGORIES[categoryId] || COMMENT_CATEGORIES.uncategorized;
        const now = Date.now();
        const nextComment: GradingComment = {
            id: draft.commentId,
            taskNumber: draft.taskNumber,
            text: html,
            categoryId,
            categoryLabel: preset?.categoryLabel || category.label,
            color: getNextCommentHighlightColor(taskComments),
            status: 'active',
            anchorText: draft.anchorText,
            from: draft.from,
            to: draft.to,
            createdAt: now,
            updatedAt: now,
        };

        setTaskState(draft.taskNumber, (current) => ({
            ...current,
            comments: [...current.comments, nextComment],
        }));
        setPendingCommentDraft(draft.taskNumber, null);
        setFocusedCommentId(nextComment.id);
        setPanelTab('comments');
        pushCommentMutation(nextComment, 'apply', nextComment.color);
        trackAction('addComment', {
            submissionId,
            taskNumber: draft.taskNumber,
            preset: preset?.id || null,
        });
    }, [pushCommentMutation, setPendingCommentDraft, setTaskState, submissionId, trackAction]);

    const handleAddComment = useCallback((
        selectedText: string,
        from: number,
        to: number,
        commentId: string,
        preset?: QuickCommentPreset
    ) => {
        const existingPendingDraft = pendingCommentDraftsRef.current[activeTask];
        if (existingPendingDraft) {
            setPanelTab('comments');
            showStatus('Finish or cancel the open comment before starting another one.');
            return;
        }

        if (preset) {
            createSavedComment({
                commentId,
                taskNumber: activeTask,
                anchorText: selectedText,
                from,
                to,
                categoryId: preset.categoryId,
                html: preset.text,
            }, preset.text, preset);
            return;
        }

        setPanelTab('comments');
        setFocusedCommentId(null);
        setPendingCommentDraft(activeTask, {
            commentId,
            taskNumber: activeTask,
            anchorText: selectedText,
            from,
            to,
            categoryId: 'uncategorized',
            html: '',
        });
    }, [activeTask, createSavedComment, setPendingCommentDraft, showStatus]);

    const handleResolveComment = useCallback((commentId: string) => {
        const comment = activeTaskState?.comments.find((entry) => entry.id === commentId);
        if (!comment) {
            return;
        }

        updateCommentState(commentId, (current) => ({
            ...current,
            status: 'resolved',
            resolvedAt: Date.now(),
            updatedAt: Date.now(),
        }));
        pushCommentMutation(comment, 'remove');
        trackAction('resolveComment', { submissionId, taskNumber: activeTask });
    }, [activeTask, activeTaskState?.comments, pushCommentMutation, submissionId, trackAction, updateCommentState]);

    const handleDeleteComment = useCallback((commentId: string) => {
        const comment = activeTaskState?.comments.find((entry) => entry.id === commentId);
        if (!comment) {
            return;
        }

        updateCommentState(commentId, (current) => ({
            ...current,
            status: 'deleted',
            deletedAt: Date.now(),
            updatedAt: Date.now(),
        }));
        pushCommentMutation(comment, 'remove');
        trackAction('deleteComment', { submissionId, taskNumber: activeTask });
    }, [activeTask, activeTaskState?.comments, pushCommentMutation, submissionId, trackAction, updateCommentState]);

    const handleRecoverComment = useCallback((commentId: string) => {
        const comment = activeTaskState?.comments.find((entry) => entry.id === commentId);
        if (!comment) {
            return;
        }

        updateCommentState(commentId, (current) => ({
            ...current,
            status: 'active',
            deletedAt: undefined,
            resolvedAt: undefined,
            updatedAt: Date.now(),
        }));
        pushCommentMutation(comment, 'apply', comment.color);
        trackAction('recoverComment', { submissionId, taskNumber: activeTask });
    }, [activeTask, activeTaskState?.comments, pushCommentMutation, submissionId, trackAction, updateCommentState]);

    const handleReopenComment = useCallback((commentId: string) => {
        const comment = activeTaskState?.comments.find((entry) => entry.id === commentId);
        if (!comment) {
            return;
        }

        updateCommentState(commentId, (current) => ({
            ...current,
            status: 'active',
            resolvedAt: undefined,
            updatedAt: Date.now(),
        }));
        pushCommentMutation(comment, 'apply', comment.color);
    }, [activeTaskState?.comments, pushCommentMutation, updateCommentState]);

    const handleCategoryChange = useCallback((commentId: string, categoryId: CommentCategoryId) => {
        const category = COMMENT_CATEGORIES[categoryId] || COMMENT_CATEGORIES.uncategorized;
        updateCommentState(commentId, (current) => ({
            ...current,
            categoryId,
            categoryLabel: category.label,
            updatedAt: Date.now(),
        }));

        const comment = activeTaskState?.comments.find((entry) => entry.id === commentId);
        if (comment) {
            pushCommentMutation(comment, 'apply', comment.color);
        }
    }, [activeTaskState?.comments, pushCommentMutation, updateCommentState]);

    const handlePendingCommentChange = useCallback((html: string) => {
        if (!activePendingCommentDraft) {
            return;
        }

        setPendingCommentDraft(activeTask, {
            ...activePendingCommentDraft,
            html,
        });
    }, [activePendingCommentDraft, activeTask, setPendingCommentDraft]);

    const handlePendingCommentCategoryChange = useCallback((categoryId: CommentCategoryId) => {
        if (!activePendingCommentDraft) {
            return;
        }

        setPendingCommentDraft(activeTask, {
            ...activePendingCommentDraft,
            categoryId,
        });
    }, [activePendingCommentDraft, activeTask, setPendingCommentDraft]);

    const handleCancelPendingComment = useCallback(() => {
        setPendingCommentDraft(activeTask, null);
    }, [activeTask, setPendingCommentDraft]);

    const handleSavePendingComment = useCallback((html: string, categoryId: CommentCategoryId) => {
        if (!activePendingCommentDraft) {
            return;
        }

        if (!isHtmlMeaningful(html)) {
            showStatus('Comment text cannot be empty.');
            return;
        }

        createSavedComment({
            ...activePendingCommentDraft,
            categoryId,
            html,
        }, html);
    }, [activePendingCommentDraft, createSavedComment, showStatus]);

    const handleTaskScoresChange = useCallback((taskNumber: 1 | 2, scores: TaskScores) => {
        setTaskState(taskNumber, (current) => {
            const next = { ...current, scores };
            next.taskBand = calculateLiveTaskBand(next);
            return next;
        });
    }, [setTaskState]);

    const handleTaskFeedbackChange = useCallback((taskNumber: 1 | 2, feedback: FeedbackContent) => {
        setTaskState(taskNumber, (current) => ({
            ...current,
            feedback,
        }));
    }, [setTaskState]);

    const handleVoidTask = useCallback((taskNumber: 1 | 2, reason: string) => {
        setTaskState(taskNumber, (current) => ({
            ...current,
            isVoided: true,
            voidReason: reason,
            taskBand: null,
        }));
    }, [setTaskState]);

    const handleUnvoidTask = useCallback((taskNumber: 1 | 2) => {
        setTaskState(taskNumber, (current) => {
            const next = {
                ...current,
                isVoided: false,
                voidReason: '',
            };
            next.taskBand = calculateLiveTaskBand(next);
            return next;
        });
    }, [setTaskState]);

    const handleCreatePreset = useCallback(async (text: string, categoryId: CommentCategoryId) => {
        if (!user?.uid) {
            return;
        }

        const category = COMMENT_CATEGORIES[categoryId] || COMMENT_CATEGORIES.uncategorized;
        const nextPresets = await addTeacherQuickCommentPreset(user.uid, {
            id: `custom-${Date.now()}`,
            text,
            categoryId,
            categoryLabel: category.label,
            color: category.color,
            isDefault: false,
            createdByTeacherId: user.uid,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });

        setQuickCommentPresets(nextPresets);
    }, [user?.uid]);

    const handleDeletePreset = useCallback(async (presetId: string) => {
        if (!user?.uid) {
            return;
        }

        const nextPresets = await deleteTeacherQuickCommentPreset(user.uid, presetId);
        setQuickCommentPresets(nextPresets);
    }, [user?.uid]);

    const handleSelectQuickComment = useCallback((preset: QuickCommentPreset) => {
        if (pendingCommentDraftsRef.current[activeTask]) {
            setPanelTab('comments');
            showStatus('Finish or cancel the open comment before using a quick comment.');
            return;
        }

        quickCommentNonceRef.current += 1;
        setPendingQuickComment({ preset, nonce: quickCommentNonceRef.current });
        setFocusedCommentId(null);
        trackAction('useQuickComment', { submissionId, presetId: preset.id });
    }, [activeTask, showStatus, submissionId, trackAction]);

    const handleCorrectionRequest = useCallback((from: number, to: number, selectedText: string) => {
        const selection = document.getSelection();
        const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
        const editorContainer = pageRef.current?.querySelector('#essay-editor-container') as HTMLElement | null;
        const rect = range?.getBoundingClientRect();
        const containerRect = editorContainer?.getBoundingClientRect();
        const fallback = { top: 24, left: 120 };

        setCorrectionRequest({
            from,
            to,
            selectedText,
            position: rect && containerRect
                ? {
                    top: rect.top - containerRect.top + (editorContainer?.scrollTop || 0) - 72,
                    left: Math.max(24, rect.left - containerRect.left),
                }
                : fallback,
        });
    }, []);

    const applyCorrection = useCallback((correctionText: string) => {
        if (!correctionRequest) {
            return;
        }

        correctionNonceRef.current += 1;
        setPendingCorrection({
            from: correctionRequest.from,
            to: correctionRequest.to,
            correctionText,
            nonce: correctionNonceRef.current,
        });
        setCorrectionRequest(null);
    }, [correctionRequest]);

    const handleBackToQueue = useCallback(async () => {
        if (Object.keys(pendingCommentDraftsRef.current).length > 0) {
            const discardPending = window.confirm('There is an open comment composer that has not been saved. Leave the grading page and discard it?');
            if (!discardPending) {
                return;
            }
        }

        if (mode === 'editing' && dirtyRef.current) {
            const shouldSave = window.confirm('You have unsaved grading changes. Save draft before returning to the queue?');
            if (shouldSave) {
                try {
                    await persistDraft('manual');
                } catch (saveError) {
                    showStatus(saveError instanceof Error ? saveError.message : 'Failed to save draft');
                    return;
                }
            }
        }

        await releaseLock();
        navigateTo('TEACHER_GRADING_QUEUE', {}, { reason: 'teacher_grading_back_to_queue' });
    }, [mode, navigateTo, persistDraft, releaseLock, showStatus]);

    const renderTeacherShell = useCallback((content: ReactNode) => (
        <div className="wgp-shell">
            <TeacherHeader
                pageTitle="Writing Grading"
                userId={user?.uid || ''}
                userRole={profile?.role === 'super_admin' ? 'super_admin' : 'teacher'}
                userDisplayName={profile?.displayName || user?.displayName || user?.email}
                userEmail={profile?.email || user?.email}
                userAvatarUrl={profile?.avatarUrl || profile?.photoURL || user?.photoURL}
                onLogout={handleLogout}
            />
            <div className="wgp-shell-content">
                <div className="wgp-shell-panel">
                    {content}
                </div>
            </div>
        </div>
    ), [handleLogout, profile?.avatarUrl, profile?.displayName, profile?.email, profile?.photoURL, profile?.role, user?.displayName, user?.email, user?.photoURL, user?.uid]);

    if (loading) {
        return renderTeacherShell(
            <div className="wgp-page">
                <div className="wgp-loading">
                    <div className="wgp-spinner" />
                </div>
            </div>
        );
    }

    if (error || !submission || !activeTaskState) {
        return renderTeacherShell(
            <div className="wgp-page">
                <div className="wgp-empty-state">
                    <h1>Unable to open grading page</h1>
                    <p>{error || 'Submission not found'}</p>
                    <button
                        className="wgp-secondary-btn"
                        onClick={() => navigateTo('TEACHER_GRADING_QUEUE', {}, { reason: 'teacher_grading_load_error' })}
                    >
                        Back to Queue
                    </button>
                </div>
            </div>
        );
    }

    const promptTask = submission.tasks.find((task) => task.taskNumber === activeTask) ?? submission.tasks[0]!;
    const publishedTask = publishedGrading?.perTask[activeTask] || null;
    const commentPositions = anchorPositions
        .map((anchor) => {
            const comment = activeTaskState.comments.find((entry) => entry.id === anchor.commentId);
            return comment ? { commentId: comment.id, color: comment.color, top: anchor.anchorTop - editorScrollTop } : null;
        })
        .filter(Boolean) as Array<{ commentId: string; color: string; top: number }>;
    const canStartTakeover = Boolean(
        hasForeignDraft
        && (!lockConflict || lockConflict.expiresAt <= Date.now() || lockConflict.teacherId === user?.uid)
    );

    return renderTeacherShell(
        <div className="wgp-page" ref={pageRef}>
            <AIMaintenanceBanner style={{ margin: '0 1rem' }} />

            <header className="wgp-header">
                <div className="wgp-header-left">
                    <button className="wgp-back-btn" onClick={() => void handleBackToQueue()}>
                        Back to Queue
                    </button>
                    <div>
                        <div className="wgp-student-name">{submission.studentName}</div>
                        <div className="wgp-subtitle">
                            {submission.testMeta.testTitle} | Submitted {formatAbsoluteDate(submission.submittedAt)}
                        </div>
                    </div>
                </div>

                <div className="wgp-header-actions">
                    <span className={`wgp-status-pill ${mode === 'editing' ? 'editing' : submission.markingStatus === 'graded' ? 'published' : 'pending'}`}>
                        {mode === 'editing' ? 'Draft Editing' : submission.markingStatus === 'graded' ? 'Published' : 'Pending Review'}
                    </span>
                    {statusMessage && <span className="wgp-status-text">{statusMessage}</span>}

                    {mode === 'review' ? (
                        submission.markingStatus === 'graded' ? (
                            <button
                                className="wgp-primary-btn"
                                onClick={() => void startEditing(ownsDraft ? 'resume-draft' : 'start-regrade')}
                                disabled={hasForeignDraft}
                            >
                                {ownsDraft ? 'Resume Draft' : 'Edit / Regrade'}
                            </button>
                        ) : (
                            <button
                                className="wgp-primary-btn"
                                onClick={() => void startEditing('pending-review')}
                                disabled={hasForeignDraft}
                            >
                                Start Grading
                            </button>
                        )
                    ) : (
                        <>
                            <button className="wgp-secondary-btn" onClick={() => void persistDraft('manual')} disabled={saving || !dirty || !currentLockIsOwned}>
                                {saving ? 'Saving...' : 'Save Draft'}
                            </button>
                            <button className="wgp-primary-btn" onClick={() => void handlePublish()} disabled={publishing || hasPublishBlockingError || !currentLockIsOwned || hasAnyPendingCommentDraft}>
                                {publishing ? 'Publishing...' : 'Submit Grading'}
                            </button>
                        </>
                    )}
                </div>
            </header>

            {taskCount > 1 && (
                <div className="wgp-task-tabs">
                    {submission.tasks.map((task) => (
                        <button
                            key={task.taskNumber}
                            className={`wgp-task-tab ${activeTask === task.taskNumber ? 'active' : ''}`}
                            onClick={() => handleTaskChange(task.taskNumber)}
                        >
                            Task {task.taskNumber}
                            {taskStates[task.taskNumber]?.isVoided ? ' | Voided' : ''}
                        </button>
                    ))}
                </div>
            )}

            {lockConflict && lockConflict.teacherId !== user?.uid && lockConflict.expiresAt > Date.now() && (
                <div className="wgp-banner wgp-banner-warning">
                    Locked by {lockConflict.teacherName || lockConflict.teacherId} until {formatAbsoluteDate(lockConflict.expiresAt)}.
                    Unpublished private drafts do not transfer automatically when a lock expires.
                </div>
            )}

            {hasForeignDraft && (
                <div className="wgp-banner wgp-banner-danger">
                    Another teacher owns the private grading draft for this submission.
                    {canStartTakeover ? (
                        <button className="wgp-inline-btn" onClick={() => void handleDiscardTakeover()}>
                            Discard Private Draft and Take Over
                        </button>
                    ) : (
                        <span className="wgp-inline-note">Takeover stays blocked while that teacher still holds a live lock.</span>
                    )}
                </div>
            )}

            {!currentLockIsOwned && mode === 'editing' && !hasForeignDraft && (
                <div className="wgp-banner wgp-banner-warning">
                    Your grading lock is not active. Saving and publishing are blocked until you reacquire the lock.
                    <button className="wgp-inline-btn" onClick={() => void startEditing(submission.markingStatus === 'graded' ? 'start-regrade' : 'pending-review')}>
                        Reacquire Lock
                    </button>
                </div>
            )}

            <main className="wgp-layout">
                <section className="wgp-left-column">
                    <div className={`wgp-editor-card ${mode === 'review' ? 'wgp-editor-card-readonly' : ''}`}>
                        <EssayEditor
                            originalEssayText={activeTaskState.essayText}
                            initialContent={activeTaskState.markedContent}
                            wordCount={activeTaskState.wordCount}
                            activeTimeSeconds={activeTaskState.activeTimeSeconds}
                            taskNumber={activeTask}
                            onAddComment={handleAddComment}
                            onGutterDotClick={(commentId) => {
                                setFocusedCommentId(commentId);
                                setPanelTab('comments');
                            }}
                            onCommentMarkClick={(commentId) => {
                                setFocusedCommentId(commentId);
                                setPanelTab('comments');
                            }}
                            onCommentMarkHover={setHoveredCommentId}
                            onViewModeChange={handleViewModeChange}
                            onContentChange={(json) => {
                                setTaskState(activeTask, (current) => ({ ...current, markedContent: json as Record<string, any> }));
                            }}
                            onCorrectionRequest={handleCorrectionRequest}
                            pendingQuickComment={pendingQuickComment}
                            pendingCorrection={pendingCorrection}
                            pendingCommentMutation={pendingCommentMutation}
                            commentPositions={commentPositions}
                            comments={activeTaskState.comments}
                            focusedCommentId={focusedCommentId}
                            hoveredCommentId={hoveredCommentId}
                            readOnly={mode !== 'editing'}
                        />

                        {mode === 'editing' && (
                            <QuickCommentsDialog
                                taskNumber={activeTask}
                                hasSelection={hasSelectionInEditor}
                                presets={quickCommentPresets}
                                onSelectPreset={handleSelectQuickComment}
                                onCreatePreset={handleCreatePreset}
                                onDeletePreset={handleDeletePreset}
                            />
                        )}

                        <CorrectionPopup
                            isOpen={Boolean(correctionRequest)}
                            selectedText={correctionRequest?.selectedText || ''}
                            position={correctionRequest?.position || { top: 24, left: 24 }}
                            onApply={applyCorrection}
                            onDismiss={() => setCorrectionRequest(null)}
                        />
                    </div>
                </section>

                <aside className="wgp-right-column">
                    <div className="wgp-panel-tabs">
                        <button className={`wgp-panel-tab ${panelTab === 'prompt' ? 'active' : ''}`} onClick={() => handlePanelTabChange('prompt')}>
                            Prompt
                        </button>
                        <button
                            className={`wgp-panel-tab ${panelTab === 'comments' ? 'active' : ''}`}
                            onClick={() => editorViewMode === 'marked' && handlePanelTabChange('comments')}
                            disabled={editorViewMode === 'original'}
                        >
                            Comments
                        </button>
                        <button className={`wgp-panel-tab ${panelTab === 'scoring' ? 'active' : ''}`} onClick={() => handlePanelTabChange('scoring')}>
                            Scoring
                        </button>
                    </div>

                    {panelTab === 'prompt' && (
                        <div className="wgp-panel-card">
                            <div className="wgp-card-title">Task {activeTask} Prompt</div>
                            {promptTask.promptImageUrl && (
                                <img className="wgp-prompt-image" src={promptTask.promptImageUrl} alt={`Task ${activeTask} prompt`} />
                            )}
                            <p className="wgp-prompt-text">{promptTask.promptText}</p>
                            <div className="wgp-meta-grid">
                                <div><span>Words</span><strong>{activeTaskState.wordCount}</strong></div>
                                <div><span>Active Time</span><strong>{Math.round(activeTaskState.activeTimeSeconds / 60)} min</strong></div>
                                <div><span>Paste Attempts</span><strong>{submission.pasteAttemptCount}</strong></div>
                                <div><span>Marking</span><strong>{submission.markingStatus}</strong></div>
                            </div>
                        </div>
                    )}

                    {panelTab === 'comments' && (
                        <div className="wgp-comments-card">
                            <CommentSidebar
                                comments={activeTaskState.comments}
                                taskNumber={activeTask}
                                focusedCommentId={focusedCommentId}
                                hoveredCommentId={hoveredCommentId}
                                anchorPositions={anchorPositions}
                                editorScrollTop={editorScrollTop}
                                pendingCommentDraft={activePendingCommentDraft}
                                onFocusComment={setFocusedCommentId}
                                onHoverComment={setHoveredCommentId}
                                onEditComment={handleEditComment}
                                onResolveComment={handleResolveComment}
                                onReopenComment={handleReopenComment}
                                onDeleteComment={handleDeleteComment}
                                onRecoverComment={handleRecoverComment}
                                onCategoryChange={handleCategoryChange}
                                onSavePendingComment={handleSavePendingComment}
                                onPendingCommentChange={handlePendingCommentChange}
                                onPendingCommentCategoryChange={handlePendingCommentCategoryChange}
                                onCancelPendingComment={handleCancelPendingComment}
                                readOnly={mode !== 'editing'}
                            />
                        </div>
                    )}

                    {panelTab === 'scoring' && (
                        <div className="wgp-panel-stack">
                            {mode === 'editing' ? (
                                <>
                                    <div className="wgp-panel-card">
                                        <CriteriaScoringPanel
                                            taskNumber={activeTask}
                                            scores={activeTaskState.scores}
                                            onChange={(scores) => handleTaskScoresChange(activeTask, scores)}
                                            isVoided={activeTaskState.isVoided}
                                        />
                                    </div>

                                    <div className="wgp-panel-card">
                                        <div className="wgp-card-title">Task {activeTask} Feedback</div>
                                        <TabbedFeedbackEditor
                                            taskNumber={activeTask}
                                            feedback={activeTaskState.feedback}
                                            onChange={(feedback) => handleTaskFeedbackChange(activeTask, feedback)}
                                            onTabChange={(tab) => trackAction('switchTab', { submissionId, tab: `feedback-${tab}` })}
                                        />
                                    </div>

                                    <div className="wgp-panel-card">
                                        <VoidTaskButton
                                            taskNumber={activeTask}
                                            isVoided={activeTaskState.isVoided}
                                            voidReason={activeTaskState.voidReason}
                                            onVoid={(reason) => handleVoidTask(activeTask, reason)}
                                            onUnvoid={() => handleUnvoidTask(activeTask)}
                                        />
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="wgp-panel-card">
                                        <div className="wgp-card-title">Published Scores</div>
                                        <div className="wgp-score-grid">
                                            <div><span>{activeTask === 1 ? 'TA' : 'TR'}</span><strong>{publishedTask?.criteriaScores?.[activeTask === 1 ? 'TA' : 'TR'] ?? '-'}</strong></div>
                                            <div><span>CC</span><strong>{publishedTask?.criteriaScores?.CC ?? '-'}</strong></div>
                                            <div><span>LR</span><strong>{publishedTask?.criteriaScores?.LR ?? '-'}</strong></div>
                                            <div><span>GRA</span><strong>{publishedTask?.criteriaScores?.GRA ?? '-'}</strong></div>
                                            <div><span>Task Band</span><strong>{publishedTask?.isVoided ? 'Voided' : publishedTask?.taskBand ?? '-'}</strong></div>
                                            <div><span>Overall Band</span><strong>{publishedGrading?.overallBand ?? '-'}</strong></div>
                                        </div>
                                    </div>

                                    <div className="wgp-panel-card">
                                        <div className="wgp-card-title">Task Summary</div>
                                        <RichContent className="wgp-rich-copy" content={publishedTask?.taskSummary || activeTaskState.feedback.taskSummary} />
                                        <div className="wgp-feedback-columns">
                                            <div>
                                                <span>{activeTask === 1 ? 'Task Achievement' : 'Task Response'}</span>
                                                <RichContent className="wgp-rich-copy" content={activeTask === 1 ? (publishedTask?.perCriteriaFeedback.TA || '') : (publishedTask?.perCriteriaFeedback.TR || '')} />
                                            </div>
                                            <div>
                                                <span>Coherence & Cohesion</span>
                                                <RichContent className="wgp-rich-copy" content={publishedTask?.perCriteriaFeedback.CC || ''} />
                                            </div>
                                            <div>
                                                <span>Lexical Resource</span>
                                                <RichContent className="wgp-rich-copy" content={publishedTask?.perCriteriaFeedback.LR || ''} />
                                            </div>
                                            <div>
                                                <span>Grammatical Range & Accuracy</span>
                                                <RichContent className="wgp-rich-copy" content={publishedTask?.perCriteriaFeedback.GRA || ''} />
                                            </div>
                                        </div>
                                    </div>

                                </>
                            )}

                            {Boolean(submission.auditTrail?.length) && (
                                <div className="wgp-panel-card">
                                    <GradingAuditTrail entries={submission.auditTrail || []} />
                                </div>
                            )}
                        </div>
                    )}
                </aside>
            </main>
        </div>
    );
}
