import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useNavigation } from '../hooks/useNavigation';
import { useFeatureTracking } from '../hooks/useFeatureTracking';
import { FEATURE_IDS } from '../config/featureRegistry';
import { IconArrowLeft, IconChecklist, IconCircleCheckFilled, IconCircleXFilled } from '@tabler/icons-react';
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
import EssayEditor, { type CorrectionMarkSelection, type EssaySelectionState, type EssayEditorHandle } from '../components/writing-grading/EssayEditor';
import CommentSidebar, { type PendingCommentDraft } from '../components/writing-grading/CommentSidebar';
import QuickCommentsDialog from '../components/writing-grading/QuickCommentsDialog';
import CorrectionPopup from '../components/writing-grading/CorrectionPopup';
import CriteriaScoringPanel from '../components/writing-grading/CriteriaScoringPanel';
import WritingSuggestionsPanel from '../components/writing-grading/WritingSuggestionsPanel';
import WritingSuggestionsReviewModal from '../components/writing-grading/WritingSuggestionsReviewModal';
import TabbedFeedbackEditor, { type FeedbackContent } from '../components/writing-grading/TabbedFeedbackEditor';
import VoidTaskButton from '../components/writing-grading/VoidTaskButton';
import GradingAuditTrail from '../components/writing-grading/GradingAuditTrail';
import { getOrCreateWritingSuggestionCache, updateWritingSuggestionReviewStatus } from '../services/writingSuggestionService';
import type {
    CommentCategoryId,
    GradingComment,
    PublishedWritingGrading,
    QuickCommentPreset,
    WritingGradingDraft,
    WritingPendingCommentDraft,
    WritingSubmission,
    WritingSubmissionForGrading,
    WritingSuggestionCacheDoc,
    WritingSuggestionItem,
    WritingSubmissionTask,
    WritingTaskMarkupState,
} from '../types/ielts-writing.types';
import { COMMENT_CATEGORIES, COMMENT_HIGHLIGHT_COLOR } from '../types/ielts-writing.types';
import { calculateTaskBand } from '../utils/ieltsWritingBandCalculator';
import {
    evaluateWritingSubmissionReadiness,
    isMeaningfulHtml,
    type WritingReadinessTaskInput,
} from '../utils/writingGradingReadiness';
import './WritingGradingPage.css';

type PanelTab = 'prompt' | 'comments' | 'suggestions' | 'scoring';
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
    anchorViewportTop: number;
}

interface PendingQuickCommentCommand {
    taskNumber: 1 | 2;
    preset: QuickCommentPreset;
    from: number;
    to: number;
    selectedText: string;
    nonce: number;
}

interface PendingCorrectionCommand {
    taskNumber: 1 | 2;
    action: 'apply' | 'remove';
    from: number;
    to: number;
    correctionId?: string;
    correctionText?: string;
    nonce: number;
}

interface PendingCommentMutationCommand {
    taskNumber: 1 | 2;
    action: 'remove' | 'apply';
    commentId: string;
    color: string;
    from: number;
    to: number;
    nonce: number;
}

interface PendingSuggestionFocusCommand {
    taskNumber: 1 | 2;
    from: number;
    to: number;
    nonce: number;
}

type PendingLeaveIntent =
    | { type: 'queue' }
    | { type: 'route'; route: string; reason: string }
    | { type: 'logout' };

function createSessionId() {
    return `grading-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function renderReadinessIcon(isReady: boolean) {
    return isReady
        ? <IconCircleCheckFilled size={16} stroke={1.8} aria-hidden="true" />
        : <IconCircleXFilled size={16} stroke={1.8} aria-hidden="true" />;
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
        .filter((task) => !task.isVoided && isMeaningfulHtml(task.feedback.taskSummary))
        .sort((left, right) => left.taskNumber - right.taskNumber)
        .map((task) => `<p><strong>Task ${task.taskNumber} Summary</strong></p>${task.feedback.taskSummary}`)
        .join('');
}

function buildDraftFromPageState(
    submissionId: string,
    teacherId: string,
    teacherName: string,
    taskStates: Record<1 | 2, TaskEditorState>,
    pendingCommentDrafts: Partial<Record<1 | 2, WritingPendingCommentDraft>>,
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
        pendingCommentDrafts,
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

function createReadinessTaskInput(
    task: TaskEditorState,
    hasPendingCommentDraft: boolean,
): WritingReadinessTaskInput {
    return {
        taskNumber: task.taskNumber,
        isVoided: task.isVoided,
        responseScore: task.scores.ta,
        ccScore: task.scores.cc,
        lrScore: task.scores.lr,
        graScore: task.scores.gra,
        summaryHtml: task.feedback.taskSummary,
        hasPendingCommentDraft,
    };
}

function escapeHtml(value: string) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function convertPlainTextToCommentHtml(value: string) {
    return value
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
        .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br />')}</p>`)
        .join('');
}

function getNextCommentHighlightColor() {
    return COMMENT_HIGHLIGHT_COLOR;
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

function getInitialActiveWritingTask(submission: WritingSubmission, preferredTask?: 1 | 2 | null): 1 | 2 {
    const availableTasks = submission.tasks
        .map((task) => task.taskNumber)
        .filter((taskNumber): taskNumber is 1 | 2 => taskNumber === 1 || taskNumber === 2)
        .sort((left, right) => left - right);

    if (preferredTask && availableTasks.includes(preferredTask)) {
        return preferredTask;
    }

    return availableTasks[0] || 1;
}

function isVersionConflictError(errorMessage: string) {
    return errorMessage.includes('A newer published grading already exists')
        || errorMessage.includes('A newer grading draft already exists');
}

function serializePendingCommentDrafts(
    drafts: Partial<Record<1 | 2, WritingPendingCommentDraft>>,
) {
    return JSON.stringify(
        Object.entries(drafts)
            .sort(([left], [right]) => Number(left) - Number(right))
            .map(([taskNumber, draft]) => [taskNumber, draft]),
    );
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
    const [reviewFeedbackTab, setReviewFeedbackTab] = useState<string>('taskSummary');
    const [focusedCommentId, setFocusedCommentId] = useState<string | null>(null);
    const [focusedCorrectionId, setFocusedCorrectionId] = useState<string | null>(null);
    const [focusedCommentAnchorViewportTop, setFocusedCommentAnchorViewportTop] = useState<number | null>(null);
    const [hoveredCommentId, setHoveredCommentId] = useState<string | null>(null);
    const [anchorPositions, setAnchorPositions] = useState<CommentAnchorPosition[]>([]);
    const [editorScrollTop, setEditorScrollTop] = useState(0);
    const [hasSelectionInEditor, setHasSelectionInEditor] = useState(false);
    const [editorSelectionState, setEditorSelectionState] = useState<EssaySelectionState>({
        hasSelection: false,
        from: null,
        to: null,
        selectedText: '',
        containsComment: false,
        containsCorrection: false,
    });
    const [quickCommentPresets, setQuickCommentPresets] = useState<QuickCommentPreset[]>(DEFAULT_QUICK_COMMENT_PRESETS);
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [lockInfo, setLockInfo] = useState<WritingGradingLock | null>(null);
    const [lockConflict, setLockConflict] = useState<WritingGradingLock | null>(null);
    const [pendingCommentDrafts, setPendingCommentDrafts] = useState<Partial<Record<1 | 2, PendingCommentDraft>>>({});
    const [pendingQuickComment, setPendingQuickComment] = useState<PendingQuickCommentCommand | null>(null);
    const [pendingCorrection, setPendingCorrection] = useState<PendingCorrectionCommand | null>(null);
    const [pendingCommentMutation, setPendingCommentMutation] = useState<PendingCommentMutationCommand | null>(null);
    const [pendingSuggestionFocus, setPendingSuggestionFocus] = useState<PendingSuggestionFocusCommand | null>(null);
    const [suggestionCache, setSuggestionCache] = useState<WritingSuggestionCacheDoc | null>(null);
    const [suggestionsLoading, setSuggestionsLoading] = useState(false);
    const [suggestionsReloading, setSuggestionsReloading] = useState(false);
    const [suggestionReviewOpen, setSuggestionReviewOpen] = useState(false);
    const [correctionRequest, setCorrectionRequest] = useState<{
        mode: 'create' | 'edit';
        correctionId?: string;
        from: number;
        to: number;
        selectedText: string;
        correctionText: string;
        position: { top: number; left: number };
    } | null>(null);
    const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
    const [leaveDialogSaving, setLeaveDialogSaving] = useState(false);
    const [pendingLeaveIntent, setPendingLeaveIntent] = useState<PendingLeaveIntent>({ type: 'queue' });
    const [takeoverReason, setTakeoverReason] = useState('');
    const [takeoverDialogOpen, setTakeoverDialogOpen] = useState(false);
    const [takeoverSubmitting, setTakeoverSubmitting] = useState(false);
    const [regradeReason, setRegradeReason] = useState('');
    const [regradeDialogOpen, setRegradeDialogOpen] = useState(false);
    const [regradeError, setRegradeError] = useState<string | null>(null);
    const [savedPendingCommentDraftSignature, setSavedPendingCommentDraftSignature] = useState(() => serializePendingCommentDrafts({}));
    const [editorHydrationNonce, setEditorHydrationNonce] = useState(0);

    const pageRef = useRef<HTMLDivElement>(null);
    const sessionIdRef = useRef(createSessionId());
    const saveQueueRef = useRef(Promise.resolve());
    const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const mutationNonceRef = useRef(0);
    const quickCommentNonceRef = useRef(0);
    const correctionNonceRef = useRef(0);
    const suggestionFocusNonceRef = useRef(0);
    const dirtyRef = useRef(false);
    const hasUnsavedChangesRef = useRef(false);
    const suggestionGenerationActiveRef = useRef(false);
    const savedPendingCommentDraftSignatureRef = useRef(savedPendingCommentDraftSignature);
    const modeRef = useRef<PageMode>('review');
    const submissionRef = useRef<WritingSubmission | null>(null);
    const publishedGradingRef = useRef<PublishedWritingGrading | null>(null);
    const serverDraftRef = useRef<WritingGradingDraft | null>(null);
    const taskStatesRef = useRef<Record<1 | 2, TaskEditorState>>({} as Record<1 | 2, TaskEditorState>);
    const lockInfoRef = useRef<WritingGradingLock | null>(null);
    const pendingCommentDraftsRef = useRef<Partial<Record<1 | 2, PendingCommentDraft>>>({});
    const previousActiveTaskRef = useRef<1 | 2>(activeTask);
    const essayEditorRef = useRef<EssayEditorHandle>(null);

    useEffect(() => {
        dirtyRef.current = dirty;
    }, [dirty]);

    useEffect(() => {
        savedPendingCommentDraftSignatureRef.current = savedPendingCommentDraftSignature;
    }, [savedPendingCommentDraftSignature]);

    useEffect(() => {
        if (previousActiveTaskRef.current === activeTask) {
            return;
        }

        previousActiveTaskRef.current = activeTask;
        setReviewFeedbackTab('taskSummary');
    }, [activeTask]);

    useEffect(() => {
        hasUnsavedChangesRef.current = dirty
            || serializePendingCommentDrafts(pendingCommentDrafts) !== savedPendingCommentDraftSignatureRef.current;
    }, [dirty, pendingCommentDrafts]);

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

    const openLeaveWarning = useCallback((
        source: 'back-to-queue' | 'header-navigation' | 'logout',
        intent: PendingLeaveIntent,
    ) => {
        const hasUnsaved = modeRef.current === 'editing' && hasUnsavedChangesRef.current;
        const generating = suggestionGenerationActiveRef.current;
        if (!hasUnsaved && !generating) {
            return false;
        }

        trackAction('showSuggestionLeaveWarning', {
            submissionId,
            taskNumber: activeTask,
            reason: generating
                ? (hasUnsaved ? 'unsaved-and-generating' : 'generating')
                : 'unsaved-only',
            source,
        });
        setPendingLeaveIntent(intent);
        setLeaveDialogOpen(true);
        return true;
    }, [activeTask, submissionId, trackAction]);

    const buildCurrentDraft = useCallback(() => {
        if (!submissionId || !user?.uid) {
            return null;
        }

        const draft = buildDraftFromPageState(
            submissionId,
            user.uid,
            user.displayName || user.email || 'Teacher',
            taskStatesRef.current,
            pendingCommentDraftsRef.current,
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
    const hasUnsavedPendingCommentDrafts = serializePendingCommentDrafts(pendingCommentDrafts) !== savedPendingCommentDraftSignature;
    const hasUnsavedChanges = dirty || hasUnsavedPendingCommentDrafts;
    const currentLockIsOwned = Boolean(
        user?.uid
        && lockInfo?.teacherId === user.uid
        && lockInfo.sessionId === sessionIdRef.current
        && lockInfo.expiresAt > Date.now()
    );
    const submissionReadiness = useMemo(() => {
        const readinessTasks = Object.values(taskStates)
            .map((task) => createReadinessTaskInput(task, Boolean(pendingCommentDrafts[task.taskNumber])));

        return evaluateWritingSubmissionReadiness(readinessTasks);
    }, [pendingCommentDrafts, taskStates]);
    const activeTaskReadiness = submissionReadiness.tasks[activeTask];
    const hasAnyPendingCommentDraft = submissionReadiness.hasAnyPendingCommentDraft;
    const hasPublishBlockingError = !submissionReadiness.canPublish;
    const suggestionApprovalBlockedReason = mode !== 'editing'
        ? 'Open the grading session to approve suggestions into comments or corrections.'
        : hasAnyPendingCommentDraft
            ? 'Finish or cancel the open comment before approving another suggestion.'
            : correctionRequest
                ? 'Finish or cancel the open correction before approving another suggestion.'
                : null;
    const suggestionApprovalBlocked = Boolean(suggestionApprovalBlockedReason);
    const activeSuggestionRunState = suggestionCache?.runStateByTask?.[activeTask] || null;
    const suggestionGenerationActive = suggestionsLoading || suggestionsReloading || activeSuggestionRunState?.status === 'generating';
    const suggestionCanGenerateMore = activeSuggestionRunState?.lastRunHasMorePotential === true
        || (activeSuggestionRunState?.status === 'incomplete' && activeSuggestionRunState?.lastRunHasMorePotential == null);
    const leaveWarningMode = suggestionGenerationActive
        ? (hasUnsavedChanges ? 'unsaved-and-generating' : 'generating-only')
        : 'unsaved-only';

    useEffect(() => {
        suggestionGenerationActiveRef.current = suggestionGenerationActive;
    }, [suggestionGenerationActive]);

    const clearTaskScopedTransientState = useCallback(() => {
        setFocusedCommentId(null);
        setFocusedCorrectionId(null);
        setFocusedCommentAnchorViewportTop(null);
        setHoveredCommentId(null);
        setAnchorPositions([]);
        setHasSelectionInEditor(false);
        setEditorSelectionState({
            hasSelection: false,
            from: null,
            to: null,
            selectedText: '',
            containsComment: false,
            containsCorrection: false,
        });
        setPendingQuickComment(null);
        setPendingCorrection(null);
        setPendingCommentMutation(null);
        setPendingSuggestionFocus(null);
        setCorrectionRequest(null);
        setSuggestionReviewOpen(false);
    }, []);

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
        setPendingCommentDrafts(nextDraft?.pendingCommentDrafts ?? {});
        setSavedPendingCommentDraftSignature(serializePendingCommentDrafts(nextDraft?.pendingCommentDrafts ?? {}));
        setEditorHydrationNonce((current) => current + 1);
        setActiveTask((current) => getInitialActiveWritingTask(nextSubmission, current));
        clearTaskScopedTransientState();
        setEditorViewMode('marked');
        setDirty(false);
    }, [clearTaskScopedTransientState]);

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
                setMode('review');
                setLockConflict(nextHasForeignDraft ? data.submission.gradingDraftMeta ? {
                    submissionId: data.submission.id,
                    teacherId: data.submission.gradingDraftMeta.ownerTeacherId,
                    teacherName: data.submission.gradingDraftMeta.ownerTeacherName,
                    sessionId: '',
                    heartbeatAt: 0,
                    expiresAt: 0,
                } : null : null);
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

    const loadSuggestions = useCallback(async (options: { force?: boolean; source?: 'open' | 'force' | 'continue' } = {}) => {
        const currentSubmission = submissionRef.current;
        if (!currentSubmission) {
            return;
        }

        suggestionGenerationActiveRef.current = true;

        if (options.force) {
            setSuggestionsReloading(true);
            trackAction('reloadSuggestions', { submissionId: currentSubmission.id });
            trackAction(options.source === 'continue' ? 'generateMoreSuggestions' : 'generateSuggestions', {
                submissionId: currentSubmission.id,
                source: options.source || 'force',
                taskNumber: activeTask,
            });
        } else {
            setSuggestionsLoading(true);
            trackAction('generateSuggestions', {
                submissionId: currentSubmission.id,
                source: options.source || 'open',
                taskNumber: activeTask,
            });
        }

        const result = await getOrCreateWritingSuggestionCache(currentSubmission, {
            taskNumber: activeTask,
            force: options.force,
            source: options.source,
            sessionId: sessionIdRef.current,
        });
        if (result.success) {
            setSuggestionCache(result.data);
        } else {
            setSuggestionCache({
                submissionId: currentSubmission.id,
                status: 'failed',
                updatedAt: Date.now(),
                error: result.error,
                perTask: {},
                generatedFromEssayHashByTask: {},
                reviewStateByTask: {},
                runStateByTask: {},
            });
        }

        if (options.force) {
            setSuggestionsReloading(false);
        } else {
            setSuggestionsLoading(false);
        }
        suggestionGenerationActiveRef.current = false;
    }, [activeTask, trackAction]);

    const persistSuggestionReviewStatus = useCallback(async (
        suggestion: WritingSuggestionItem,
        status: 'pending' | 'approved' | 'dismissed',
        actionName: 'approveSuggestion' | 'dismissSuggestion' | 'restoreSuggestion',
    ) => {
        const currentSubmission = submissionRef.current;
        if (!currentSubmission) {
            return false;
        }

        const result = await updateWritingSuggestionReviewStatus(
            currentSubmission.id,
            suggestion.taskNumber,
            suggestion.reviewKey,
            status,
        );

        if (!result.success) {
            showStatus(result.error || 'Failed to update suggestion review state.');
            return false;
        }

        setSuggestionCache(result.data);
        trackAction(actionName, {
            submissionId: currentSubmission.id,
            taskNumber: suggestion.taskNumber,
            focus: suggestion.focus,
            kind: suggestion.kind,
        });
        return true;
    }, [showStatus, trackAction]);

    const openSuggestionReview = useCallback((source: 'tab' | 'summary') => {
        if (!submissionRef.current) {
            return;
        }

        setSuggestionReviewOpen(true);
        trackAction('openSuggestionReview', {
            submissionId: submissionRef.current.id,
            taskNumber: activeTask,
            source,
        });
    }, [activeTask, trackAction]);

    const closeSuggestionReview = useCallback(() => {
        const currentSubmission = submissionRef.current;
        if (!suggestionReviewOpen) {
            return;
        }

        setSuggestionReviewOpen(false);
        if (!currentSubmission) {
            return;
        }

        trackAction('closeSuggestionReview', {
            submissionId: currentSubmission.id,
            taskNumber: activeTask,
        });
    }, [activeTask, suggestionReviewOpen, trackAction]);

    useEffect(() => {
        if (!submission?.id) {
            setSuggestionCache(null);
            setSuggestionsLoading(false);
            setSuggestionsReloading(false);
            setSuggestionReviewOpen(false);
            return;
        }

        let cancelled = false;
        setSuggestionsLoading(true);
        suggestionGenerationActiveRef.current = true;

        void getOrCreateWritingSuggestionCache(submission, {
            taskNumber: activeTask,
            force: false,
            source: 'open',
            sessionId: sessionIdRef.current,
        }).then((result) => {
            if (cancelled) {
                return;
            }

            if (result.success) {
                setSuggestionCache(result.data);
            } else {
                setSuggestionCache({
                    submissionId: submission.id,
                    status: 'failed',
                    updatedAt: Date.now(),
                    error: result.error,
                    perTask: {},
                    generatedFromEssayHashByTask: {},
                    reviewStateByTask: {},
                    runStateByTask: {},
                });
            }
            setSuggestionsLoading(false);
            suggestionGenerationActiveRef.current = false;
        });

        return () => {
            cancelled = true;
            suggestionGenerationActiveRef.current = false;
        };
    }, [activeTask, submission]);

    const reloadLatestGradingState = useCallback(async () => {
        if (!submissionId || !user?.uid) {
            return false;
        }

        const gradingResult = await getWritingSubmissionForGrading(submissionId, user.uid);
        if (!gradingResult.success || !gradingResult.data) {
            return false;
        }

        const data: WritingSubmissionForGrading = gradingResult.data;
        const published = data.publishedGrading || data.submission.publishedGrading || null;
        resetFromGradingSource(data.submission, published, data.gradingDraft);
        setMode('review');
        showStatus('The grading state changed on another session. Latest data has been reloaded.');
        return true;
    }, [resetFromGradingSource, showStatus, submissionId, user?.uid]);

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
                {},
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
        if (!submissionId || !user?.uid || !hasUnsavedChangesRef.current) {
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
        if (!submissionId || !submission || !user?.uid || !hasUnsavedChangesRef.current) {
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
            try {
                await saveLocalBackup();

                const draft = buildCurrentDraft();
                if (!draft) {
                    throw new Error('Unable to build draft snapshot');
                }

                const response = await saveGradingDraft(submissionId, draft, {
                    expectedDraftVersion: serverDraftRef.current?.version ?? null,
                    expectedPublishedVersion: publishedGradingRef.current?.auditVersion ?? 0,
                });

                if (!response.success || !response.data) {
                    const errorMessage = response.error || 'Failed to save draft';
                    if (isVersionConflictError(errorMessage)) {
                        await reloadLatestGradingState();
                    }
                    throw new Error(errorMessage);
                }

                setServerDraft(response.data);
                setSavedPendingCommentDraftSignature(serializePendingCommentDrafts(response.data.pendingCommentDrafts ?? {}));
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
            } finally {
                setSaving(false);
            }
        });
    }, [
        buildCurrentDraft,
        enqueueWrite,
        reloadLatestGradingState,
        saveLocalBackup,
        showStatus,
        submission,
        submissionId,
        trackAction,
        user?.uid,
    ]);

    const executePublish = useCallback(async (reason?: string) => {
        if (!submissionId || !submission || !user?.uid) {
            return;
        }

        if (!currentLockIsOwned) {
            showStatus('Your grading lock is not active. Reacquire it before publishing.');
            return;
        }

        if (hasPublishBlockingError) {
            showStatus(submissionReadiness.firstBlockingReason || 'Complete all non-voided scores and summaries before publishing.');
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

                const response = await publishGrading(submissionId, draft, {
                    expectedDraftVersion: serverDraftRef.current?.version ?? null,
                    expectedPublishedVersion: publishedGradingRef.current?.auditVersion ?? 0,
                    reason: reason || undefined,
                });

                if (!response.success || !response.data) {
                    const errorMessage = response.error || 'Failed to publish grading';
                    if (isVersionConflictError(errorMessage)) {
                        await reloadLatestGradingState();
                    }
                    throw new Error(errorMessage);
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
        currentLockIsOwned,
        releaseLock,
        reloadLatestGradingState,
        showStatus,
        submissionReadiness.firstBlockingReason,
        submission,
        submissionId,
        trackAction,
        user?.uid,
    ]);

    const handlePublish = useCallback(async () => {
        if (publishedGradingRef.current) {
            setRegradeReason('');
            setRegradeError(null);
            setRegradeDialogOpen(true);
            return;
        }

        await executePublish();
    }, [executePublish]);

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
        setTakeoverReason('');
        setTakeoverDialogOpen(true);
    }, [
        acquireLock,
        showStatus,
        submission,
        user?.displayName,
        user?.email,
        user?.uid,
    ]);

    const confirmDiscardTakeover = useCallback(async () => {
        if (!submission || !user?.uid) {
            return;
        }

        const reason = takeoverReason.trim();
        if (!reason) {
            showStatus('A takeover reason is required.');
            return;
        }

        setTakeoverSubmitting(true);
        try {
            const discardResult = await discardPrivateDraft(submission.id, {
                actorTeacherId: user.uid,
                actorTeacherName: user.displayName || user.email || 'Teacher',
                reason,
            });

            if (!discardResult.success) {
                showStatus(discardResult.error || 'Failed to discard the private draft');
                return;
            }

            setTakeoverDialogOpen(false);
            setSubmission((current) => current ? ({ ...current, gradingDraftMeta: null }) : current);
            trackAction('discardDraftTakeover', { submissionId: submission.id });
            const locked = await acquireLock();
            if (!locked) {
                return;
            }

            setMode('editing');
            showStatus('Private draft discarded. You now own the grading draft.');
        } finally {
            setTakeoverSubmitting(false);
        }
    }, [
        acquireLock,
        showStatus,
        submission,
        takeoverReason,
        trackAction,
        user?.displayName,
        user?.email,
        user?.uid,
    ]);

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
                        setMode('review');
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
        if (mode !== 'editing' || !hasUnsavedChanges) {
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
    }, [hasUnsavedChanges, mode, persistDraft, showStatus]);

    useEffect(() => {
        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            const hasUnsaved = modeRef.current === 'editing' && hasUnsavedChangesRef.current;
            const generatingSuggestions = suggestionGenerationActiveRef.current;
            if (!hasUnsaved && !generatingSuggestions) {
                return;
            }

            event.preventDefault();
            event.returnValue = '';
            if (generatingSuggestions) {
                trackAction('showSuggestionLeaveWarning', {
                    submissionId,
                    taskNumber: activeTask,
                    reason: hasUnsaved ? 'unsaved-and-generating' : 'generating',
                    source: 'beforeunload',
                });
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [activeTask, submissionId, trackAction]);

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

    const handleEditorSelectionStateChange = useCallback((selection: EssaySelectionState) => {
        setEditorSelectionState(selection);
        setHasSelectionInEditor(selection.hasSelection);
    }, []);

    useEffect(() => {
        const editorContainer = pageRef.current?.querySelector('#essay-editor-container') as HTMLElement | null;
        if (!editorContainer) {
            return;
        }

        const updatePositions = () => {
            const nextAnchors = (activeTaskState?.comments || [])
                .filter((comment) => comment.status !== 'deleted')
                .map((comment) => ({
                    id: comment.id,
                    selector: `[data-comment-id="${comment.id}"]`,
                }))
                .map(({ id, selector }) => {
                    const mark = editorContainer.querySelector(selector) as HTMLElement | null;
                    if (!mark) {
                        return null;
                    }

                    const markRect = mark.getBoundingClientRect();
                    const containerRect = editorContainer.getBoundingClientRect();
                    return {
                        commentId: id,
                        anchorTop: markRect.top - containerRect.top + editorContainer.scrollTop,
                        anchorRight: markRect.right - containerRect.left,
                        anchorCenterY: (markRect.top - containerRect.top + editorContainer.scrollTop) + (markRect.height / 2),
                        anchorViewportTop: markRect.top,
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
        if (taskNumber === activeTask) {
            return;
        }

        clearTaskScopedTransientState();
        setActiveTask(taskNumber);
        trackAction('switchTask', { submissionId, taskNumber });
    }, [activeTask, clearTaskScopedTransientState, submissionId, trackAction]);

    const handlePanelTabChange = useCallback((nextTab: PanelTab) => {
        if (nextTab !== panelTab) {
            trackAction('switchTab', { submissionId, tab: nextTab });
            if (nextTab === 'suggestions') {
                trackAction('viewSuggestions', { submissionId, taskNumber: activeTask });
            }
        }
        setPanelTab(nextTab);
        if (nextTab === 'suggestions') {
            openSuggestionReview('tab');
        }
    }, [activeTask, openSuggestionReview, panelTab, submissionId, trackAction]);

    const resolveCommentAnchorViewportTop = useCallback((
        commentId: string | null,
        explicitAnchorViewportTop?: number | null,
    ) => {
        if (!commentId) {
            return null;
        }

        if (explicitAnchorViewportTop !== undefined) {
            return explicitAnchorViewportTop;
        }

        return anchorPositions.find((position) => position.commentId === commentId)?.anchorViewportTop ?? null;
    }, [anchorPositions]);

    const focusCommentInRail = useCallback((
        commentId: string | null,
        options?: {
            anchorViewportTop?: number | null;
            openCommentsTab?: boolean;
            dismissCorrectionRequest?: boolean;
        },
    ) => {
        setFocusedCommentId(commentId);
        setFocusedCorrectionId(null);
        setFocusedCommentAnchorViewportTop(
            resolveCommentAnchorViewportTop(commentId, options?.anchorViewportTop),
        );

        if (options?.dismissCorrectionRequest !== false) {
            setCorrectionRequest(null);
        }

        if (commentId && options?.openCommentsTab !== false) {
            setPanelTab('comments');
        }
    }, [resolveCommentAnchorViewportTop]);

    const handleFocusComment = useCallback((commentId: string | null) => {
        focusCommentInRail(commentId, {
            openCommentsTab: false,
        });
    }, [focusCommentInRail]);

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

    const pushCommentMutation = useCallback((comment: GradingComment, action: 'remove' | 'apply') => {
        mutationNonceRef.current += 1;
        setPendingCommentMutation({
            taskNumber: comment.taskNumber,
            action,
            commentId: comment.id,
            color: COMMENT_HIGHLIGHT_COLOR,
            from: comment.from,
            to: comment.to,
            nonce: mutationNonceRef.current,
        });
    }, []);

    const createSavedComment = useCallback((
        draft: PendingCommentDraft,
        html: string,
        preset?: QuickCommentPreset,
        options?: {
            focusInSidebar?: boolean;
            source?: 'comment-tool' | 'quick-comment' | 'suggestion' | 'correction-popup';
        }
    ) => {
        const categoryId = preset?.categoryId || draft.categoryId;
        const category = COMMENT_CATEGORIES[categoryId] || COMMENT_CATEGORIES.uncategorized;
        const now = Date.now();
        const nextComment: GradingComment = {
            id: draft.commentId,
            taskNumber: draft.taskNumber,
            text: html,
            categoryId,
            categoryLabel: preset?.categoryLabel || category.label,
            color: getNextCommentHighlightColor(),
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
        if (options?.focusInSidebar === false) {
            setFocusedCommentId(null);
            setFocusedCommentAnchorViewportTop(null);
        } else {
            focusCommentInRail(nextComment.id, {
                anchorViewportTop: draft.anchorViewportTop ?? null,
            });
        }
        pushCommentMutation(nextComment, 'apply');
        trackAction('addComment', {
            submissionId,
            taskNumber: draft.taskNumber,
            preset: preset?.id || null,
            source: options?.source || (preset ? 'quick-comment' : 'comment-tool'),
        });
    }, [
        pushCommentMutation,
        setPendingCommentDraft,
        setTaskState,
        focusCommentInRail,
        submissionId,
        trackAction,
    ]);

    const handleAddComment = useCallback((
        selectedText: string,
        from: number,
        to: number,
        commentId: string,
        anchorViewportTop: number | null,
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
                anchorViewportTop,
                categoryId: preset.categoryId,
                html: preset.text,
            }, preset.text, preset, { source: 'quick-comment' });
            return;
        }

        setPanelTab('comments');
        setFocusedCommentId(null);
        setFocusedCorrectionId(null);
        setFocusedCommentAnchorViewportTop(anchorViewportTop);
        setPendingCommentDraft(activeTask, {
            commentId,
            taskNumber: activeTask,
            anchorText: selectedText,
            from,
            to,
            anchorViewportTop,
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
        pushCommentMutation(comment, 'apply');
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
        pushCommentMutation(comment, 'apply');
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
            pushCommentMutation(comment, 'apply');
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

        if (!isMeaningfulHtml(html)) {
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

        if (!editorSelectionState.hasSelection || editorSelectionState.from === null || editorSelectionState.to === null) {
            showStatus('Select text in the essay before using a quick comment.');
            return;
        }

        if (editorSelectionState.containsCorrection) {
            showStatus('Remove the correction before adding a quick comment on that text.');
            return;
        }

        quickCommentNonceRef.current += 1;
        setPendingQuickComment({
            taskNumber: activeTask,
            preset,
            from: editorSelectionState.from,
            to: editorSelectionState.to,
            selectedText: editorSelectionState.selectedText,
            nonce: quickCommentNonceRef.current,
        });
        setFocusedCommentId(null);
        trackAction('useQuickComment', { submissionId, presetId: preset.id });
    }, [activeTask, editorSelectionState, showStatus, submissionId, trackAction]);

    const getActiveCommentForRange = useCallback((taskNumber: 1 | 2, from: number, to: number) => {
        const taskState = taskStatesRef.current[taskNumber];
        return taskState?.comments.find((comment) => (
            comment.status === 'active'
            && comment.from === from
            && comment.to === to
        )) || null;
    }, []);

    const getCorrectionPopupPosition = useCallback((anchorViewportTop: number | null, anchorViewportLeft: number | null) => {
        const fallback = { top: 96, left: 120 };

        if (anchorViewportTop === null || anchorViewportLeft === null) {
            return fallback;
        }

        return {
            top: Math.max(16, anchorViewportTop - 72),
            left: Math.max(24, anchorViewportLeft),
        };
    }, []);

    const handleCorrectionRequest = useCallback((from: number, to: number, selectedText: string) => {
        const selection = document.getSelection();
        const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
        const rect = range?.getBoundingClientRect();

        setFocusedCommentId(null);
        setFocusedCorrectionId(null);
        setFocusedCommentAnchorViewportTop(null);
        setCorrectionRequest({
            mode: 'create',
            correctionId: undefined,
            from,
            to,
            selectedText,
            correctionText: '',
            position: getCorrectionPopupPosition(rect?.top ?? null, rect?.left ?? null),
        });
    }, [getCorrectionPopupPosition]);

    const handleCorrectionMarkClick = useCallback((selection: CorrectionMarkSelection) => {
        setFocusedCommentId(null);
        setFocusedCorrectionId(selection.id);
        setFocusedCommentAnchorViewportTop(null);

        if (mode !== 'editing') {
            return;
        }

        setCorrectionRequest({
            mode: 'edit',
            correctionId: selection.id,
            from: selection.from,
            to: selection.to,
            selectedText: selection.selectedText,
            correctionText: selection.correctionText,
            position: getCorrectionPopupPosition(selection.anchorViewportTop, selection.anchorViewportLeft),
        });
    }, [getCorrectionPopupPosition, mode]);

    const dismissCorrectionRequest = useCallback(() => {
        setCorrectionRequest(null);
        setFocusedCorrectionId(null);
    }, []);

    const applyCorrection = useCallback((correctionText: string, commentText: string) => {
        if (!correctionRequest) {
            return;
        }

        const nextCorrectionId = correctionRequest.correctionId || `correction-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        correctionNonceRef.current += 1;
        setPendingCorrection({
            taskNumber: activeTask,
            action: 'apply',
            from: correctionRequest.from,
            to: correctionRequest.to,
            correctionId: nextCorrectionId,
            correctionText,
            nonce: correctionNonceRef.current,
        });
        setFocusedCommentId(null);
        setFocusedCorrectionId(nextCorrectionId);
        trackAction(correctionRequest.mode === 'edit' ? 'editCorrection' : 'addCorrection', {
            submissionId,
            taskNumber: activeTask,
        });

        const trimmedCommentText = commentText.trim();
        if (trimmedCommentText) {
            const existingComment = getActiveCommentForRange(activeTask, correctionRequest.from, correctionRequest.to);
            if (existingComment) {
                showStatus('A comment already exists on this selected text. Edit it from the Comments tab if needed.');
            } else if (pendingCommentDraftsRef.current[activeTask]) {
                showStatus('Finish or cancel the open comment before adding another one.');
            } else {
                const html = convertPlainTextToCommentHtml(trimmedCommentText);
                if (isMeaningfulHtml(html)) {
                    createSavedComment({
                        commentId: `comment-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                        taskNumber: activeTask,
                        anchorText: correctionRequest.selectedText,
                        from: correctionRequest.from,
                        to: correctionRequest.to,
                        categoryId: 'uncategorized',
                        html,
                    }, html, undefined, {
                        focusInSidebar: false,
                        source: 'correction-popup',
                    });
                }
            }
        }

        setCorrectionRequest(null);
    }, [
        activeTask,
        correctionRequest,
        createSavedComment,
        getActiveCommentForRange,
        showStatus,
        submissionId,
        trackAction,
    ]);

    const deleteCorrection = useCallback(() => {
        if (!correctionRequest || correctionRequest.mode !== 'edit') {
            return;
        }

        correctionNonceRef.current += 1;
        setPendingCorrection({
            taskNumber: activeTask,
            action: 'remove',
            from: correctionRequest.from,
            to: correctionRequest.to,
            correctionId: correctionRequest.correctionId,
            nonce: correctionNonceRef.current,
        });
        setFocusedCorrectionId(null);
        trackAction('deleteCorrection', { submissionId, taskNumber: activeTask });
        setCorrectionRequest(null);
    }, [activeTask, correctionRequest, submissionId, trackAction]);

    const focusSuggestionInEssay = useCallback((suggestion: WritingSuggestionItem) => {
        suggestionFocusNonceRef.current += 1;
        setPendingSuggestionFocus({
            taskNumber: suggestion.taskNumber,
            from: suggestion.from,
            to: suggestion.to,
            nonce: suggestionFocusNonceRef.current,
        });
    }, []);

    const createCommentFromSuggestion = useCallback((suggestion: WritingSuggestionItem) => {
        if (pendingCommentDraftsRef.current[suggestion.taskNumber]) {
            setPanelTab('comments');
            showStatus('Finish or cancel the open comment before approving another suggestion.');
            return false;
        }

        const html = convertPlainTextToCommentHtml(suggestion.suggestedCommentText || '');
        if (!isMeaningfulHtml(html)) {
            showStatus('This suggestion is missing comment text and cannot be approved automatically.');
            return false;
        }

        setFocusedCommentId(null);
        createSavedComment({
            commentId: `comment-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            taskNumber: suggestion.taskNumber,
            anchorText: suggestion.anchorText,
            from: suggestion.from,
            to: suggestion.to,
            categoryId: suggestion.categoryId,
            html,
        }, html, undefined, { source: 'suggestion' });
        focusSuggestionInEssay(suggestion);
        return true;
    }, [createSavedComment, focusSuggestionInEssay, showStatus]);

    const applySuggestionCorrection = useCallback((suggestion: WritingSuggestionItem) => {
        if (correctionRequest) {
            showStatus('Finish or cancel the open correction before approving another suggestion.');
            return false;
        }
        if (!suggestion.replacementText?.trim()) {
            showStatus('This suggestion is missing correction text and cannot be approved automatically.');
            return false;
        }

        correctionNonceRef.current += 1;
        focusSuggestionInEssay(suggestion);
        setPendingCorrection({
            taskNumber: suggestion.taskNumber,
            action: 'apply',
            from: suggestion.from,
            to: suggestion.to,
            correctionText: suggestion.replacementText,
            nonce: correctionNonceRef.current,
        });
        trackAction('addCorrection', {
            submissionId,
            taskNumber: suggestion.taskNumber,
            focus: suggestion.focus,
        });
        return true;
    }, [correctionRequest, focusSuggestionInEssay, showStatus, submissionId, trackAction]);

    const dismissSuggestion = useCallback((suggestion: WritingSuggestionItem) => {
        void persistSuggestionReviewStatus(suggestion, 'dismissed', 'dismissSuggestion');
    }, [persistSuggestionReviewStatus]);

    const restoreSuggestion = useCallback((suggestion: WritingSuggestionItem) => {
        void persistSuggestionReviewStatus(suggestion, 'pending', 'restoreSuggestion');
    }, [persistSuggestionReviewStatus]);

    const approveSuggestion = useCallback((suggestion: WritingSuggestionItem) => {
        if (suggestionApprovalBlockedReason) {
            showStatus(suggestionApprovalBlockedReason);
            return;
        }

        const started = suggestion.kind === 'comment'
            ? createCommentFromSuggestion(suggestion)
            : applySuggestionCorrection(suggestion);

        if (!started) {
            return;
        }

        void persistSuggestionReviewStatus(suggestion, 'approved', 'approveSuggestion');
        setSuggestionReviewOpen(false);
    }, [
        applySuggestionCorrection,
        createCommentFromSuggestion,
        persistSuggestionReviewStatus,
        showStatus,
        suggestionApprovalBlockedReason,
    ]);

    const handleGenerateMoreSuggestions = useCallback(() => {
        if (suggestionGenerationActive) {
            return;
        }

        void loadSuggestions({ force: true, source: 'continue' });
    }, [loadSuggestions, suggestionGenerationActive]);

    const confirmRegradePublish = useCallback(async () => {
        const reason = regradeReason.trim();
        if (!reason) {
            setRegradeError('A regrade reason is required.');
            return;
        }

        setRegradeError(null);
        setRegradeDialogOpen(false);
        await executePublish(reason);
    }, [executePublish, regradeReason]);

    const executeLeaveIntent = useCallback(async (modeToUse: 'save' | 'discard') => {
        if (modeToUse === 'save') {
            setLeaveDialogSaving(true);
            try {
                await persistDraft('manual');
            } catch (saveError) {
                showStatus(saveError instanceof Error ? saveError.message : 'Failed to save draft');
                return;
            } finally {
                setLeaveDialogSaving(false);
            }
        }

        setLeaveDialogOpen(false);
        const intent = pendingLeaveIntent;
        await releaseLock();
        if (intent.type === 'route') {
            navigateTo(intent.route as never, {}, { reason: intent.reason });
            return;
        }
        if (intent.type === 'logout') {
            await handleLogout();
            return;
        }
        navigateTo('TEACHER_GRADING_QUEUE', {}, { reason: 'teacher_grading_back_to_queue' });
    }, [handleLogout, navigateTo, pendingLeaveIntent, persistDraft, releaseLock, showStatus]);

    const handleBackToQueue = useCallback(async () => {
        if (openLeaveWarning('back-to-queue', { type: 'queue' })) {
            return;
        }

        await releaseLock();
        navigateTo('TEACHER_GRADING_QUEUE', {}, { reason: 'teacher_grading_back_to_queue' });
    }, [navigateTo, openLeaveWarning, releaseLock]);

    const handleTeacherShellNavigateAttempt = useCallback((route: string, reason: string) => {
        if (openLeaveWarning('header-navigation', { type: 'route', route, reason })) {
            return false;
        }
        return true;
    }, [openLeaveWarning]);

    const handleTeacherShellLogoutAttempt = useCallback(() => {
        if (openLeaveWarning('logout', { type: 'logout' })) {
            return false;
        }
        return true;
    }, [openLeaveWarning]);

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
                onNavigateAttempt={handleTeacherShellNavigateAttempt}
                onLogoutAttempt={handleTeacherShellLogoutAttempt}
            />
            <div className="wgp-shell-content">
                <div className="wgp-shell-panel">
                    {content}
                </div>
            </div>
        </div>
    ), [handleLogout, handleTeacherShellLogoutAttempt, handleTeacherShellNavigateAttempt, profile?.avatarUrl, profile?.displayName, profile?.email, profile?.photoURL, profile?.role, user?.displayName, user?.email, user?.photoURL, user?.uid]);

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
    const correctionLinkedComment = correctionRequest
        ? activeTaskState.comments.find((comment) => (
            comment.status === 'active'
            && comment.from === correctionRequest.from
            && comment.to === correctionRequest.to
        )) || null
        : null;
    const correctionCommentDisabledReason = correctionLinkedComment
        ? 'An active comment already exists on this selected text. Edit it from the Comments tab if needed.'
        : activePendingCommentDraft
            ? 'Finish or cancel the open comment draft before adding another comment here.'
            : null;
    const commentPositions = anchorPositions
        .map((anchor) => {
            const comment = activeTaskState.comments.find((entry) => entry.id === anchor.commentId);
            return comment ? { commentId: comment.id, color: COMMENT_HIGHLIGHT_COLOR, top: anchor.anchorTop - editorScrollTop } : null;
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
                    <button className="wgp-back-link" onClick={() => void handleBackToQueue()}>
                        <span className="wgp-back-link-icon" aria-hidden="true"><IconArrowLeft size={16} stroke={2} /></span>
                        <span>Back to Queue</span>
                    </button>
                    <div style={{ height: '2rem', width: '1px', background: '#a9b4b9', opacity: 0.3 }}></div>
                    <div className="wgp-header-student">
                        <div className="wgp-header-student-info">
                            <span className="wgp-header-student-name">{submission.studentName || 'Student'}</span>
                            <span className="wgp-header-student-id">ID: {submission.studentId?.slice(-4) || '—'}</span>
                        </div>
                        <span className={`wgp-status-pill ${mode === 'editing' ? 'editing' : submission.markingStatus === 'graded' ? 'published' : 'pending'}`}>
                            {mode === 'editing' ? 'EDITING' : submission.markingStatus === 'graded' ? 'GRADED' : 'IN REVIEW'}
                        </span>
                    </div>
                </div>

                <div className="wgp-header-actions">
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
                            <button className="wgp-secondary-btn" onClick={() => void persistDraft('manual')} disabled={saving || !hasUnsavedChanges || !currentLockIsOwned}>
                                {saving ? 'Saving…' : 'Save Draft'}
                            </button>
                            <button className="wgp-primary-btn" onClick={() => void handlePublish()} disabled={publishing || hasPublishBlockingError || !currentLockIsOwned}>
                                {publishing ? 'Publishing…' : 'Submit Grading'}
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
                    {/* Marked / Original view toggle */}
                    <div className="wgp-editor-topbar">
                        <div className="wgp-panel-tabs wgp-editor-view-tabs">
                            <button
                                className={`wgp-panel-tab ${editorViewMode === 'marked' ? 'active' : ''}`}
                                onClick={() => handleViewModeChange('marked')}
                            >
                                Marked
                            </button>
                            <button
                                className={`wgp-panel-tab ${editorViewMode === 'original' ? 'active' : ''}`}
                                onClick={() => handleViewModeChange('original')}
                            >
                                Original
                            </button>
                        </div>
                    </div>
                    <div className="wgp-editor-card-wrapper">
                        <div className={`wgp-editor-card ${mode === 'review' ? 'wgp-editor-card-readonly' : ''}`}>
                        <EssayEditor
                            key={`essay-${submission.id}-${activeTask}-${editorHydrationNonce}`}
                            originalEssayText={activeTaskState.essayText}
                            initialContent={activeTaskState.markedContent}
                            wordCount={activeTaskState.wordCount}
                            activeTimeSeconds={activeTaskState.activeTimeSeconds}
                            taskNumber={activeTask}
                            viewMode={editorViewMode}
                            onAddComment={handleAddComment}
                            onGutterDotClick={(commentId) => {
                                focusCommentInRail(commentId);
                            }}
                            onCommentMarkClick={(commentId, anchorViewportTop) => {
                                focusCommentInRail(commentId, {
                                    anchorViewportTop,
                                });
                            }}
                            onCommentMarkHover={setHoveredCommentId}
                            onSelectionStateChange={handleEditorSelectionStateChange}
                            onContentChange={(json) => {
                                setTaskState(activeTask, (current) => ({ ...current, markedContent: json as Record<string, any> }));
                            }}
                            onCorrectionRequest={handleCorrectionRequest}
                            onCorrectionMarkClick={handleCorrectionMarkClick}
                            pendingQuickComment={pendingQuickComment}
                            pendingCorrection={pendingCorrection}
                            pendingCommentMutation={pendingCommentMutation}
                            pendingCommentDraft={activePendingCommentDraft}
                            pendingFocusRange={pendingSuggestionFocus}
                            commentPositions={commentPositions}
                            comments={activeTaskState.comments}
                            focusedCommentId={focusedCommentId}
                            focusedCorrectionId={focusedCorrectionId}
                            hoveredCommentId={hoveredCommentId}
                            readOnly={mode !== 'editing'}
                            editorRef={essayEditorRef}
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
                            initialValue={correctionRequest?.correctionText || ''}
                            position={correctionRequest?.position || { top: 24, left: 24 }}
                            mode={correctionRequest?.mode || 'create'}
                            commentDisabledReason={correctionCommentDisabledReason}
                            onApply={applyCorrection}
                            onDelete={correctionRequest?.mode === 'edit' ? deleteCorrection : undefined}
                            onDismiss={dismissCorrectionRequest}
                        />
                    </div>
                    </div>{/* end wgp-editor-card-wrapper */}

                    {/* Score strip removed — scoring is in sidebar per mockup */}
                </section>

                <aside className="wgp-right-column">
                    {/* Plain Text Panel Tabs — matches mockup */}
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
                        <button className={`wgp-panel-tab ${panelTab === 'suggestions' ? 'active' : ''}`} onClick={() => handlePanelTabChange('suggestions')}>
                            Suggestions
                        </button>
                        <button className={`wgp-panel-tab ${panelTab === 'scoring' ? 'active' : ''}`} onClick={() => handlePanelTabChange('scoring')}>
                            Scoring
                        </button>
                    </div>

                    {panelTab === 'prompt' && (
                        <div className="wgp-panel-card wgp-panel-card--seamless">
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
                                focusedCommentAnchorViewportTop={focusedCommentAnchorViewportTop}
                                hoveredCommentId={hoveredCommentId}
                                anchorPositions={anchorPositions}
                                editorScrollTop={editorScrollTop}
                                pendingCommentDraft={activePendingCommentDraft}
                                onFocusComment={handleFocusComment}
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

                    {panelTab === 'suggestions' && (
                        <WritingSuggestionsPanel
                            cache={suggestionCache}
                            taskNumber={activeTask}
                            loading={suggestionsLoading}
                            reloading={suggestionsReloading}
                            runState={activeSuggestionRunState}
                            canApprove={mode === 'editing'}
                            canGenerateMore={suggestionCanGenerateMore}
                            approvalBlockedReason={suggestionApprovalBlockedReason}
                            onReload={() => void loadSuggestions({ force: true, source: 'force' })}
                            onGenerateMore={handleGenerateMoreSuggestions}
                            onOpenReview={() => openSuggestionReview('summary')}
                        />
                    )}

                    {panelTab === 'scoring' && (
                        <div className="wgp-panel-stack">
                            {mode === 'editing' ? (
                                <>
                                    <CriteriaScoringPanel
                                        taskNumber={activeTask}
                                        scores={activeTaskState.scores}
                                        onChange={(scores) => handleTaskScoresChange(activeTask, scores)}
                                        isVoided={activeTaskState.isVoided}
                                    />

                                    <TabbedFeedbackEditor
                                        key={`feedback-${submission.id}-${activeTask}-${editorHydrationNonce}`}
                                        taskNumber={activeTask}
                                        feedback={activeTaskState.feedback}
                                        onChange={(feedback) => handleTaskFeedbackChange(activeTask, feedback)}
                                        onTabChange={(tab) => trackAction('switchTab', { submissionId, tab: `feedback-${tab}` })}
                                        onEditorAction={(action, tab) => trackAction('formatFeedback', {
                                            submissionId,
                                            taskNumber: activeTask,
                                            tab: `feedback-${tab}`,
                                            action,
                                        })}
                                    />
                                </>
                            ) : (
                                <>
                                    <div className="wgp-panel-card--flat">
                                        <div className="wgp-card-title">Published Scores</div>
                                        <div className="wgp-score-grid">
                                            <div><span>{activeTask === 1 ? 'Task Achievement' : 'Task Response'}</span><strong>{publishedTask?.criteriaScores?.[activeTask === 1 ? 'TA' : 'TR'] ?? '-'}</strong></div>
                                            <div><span>Coherence & Cohesion</span><strong>{publishedTask?.criteriaScores?.CC ?? '-'}</strong></div>
                                            <div><span>Lexical Resource</span><strong>{publishedTask?.criteriaScores?.LR ?? '-'}</strong></div>
                                            <div><span>Grammatical Range</span><strong>{publishedTask?.criteriaScores?.GRA ?? '-'}</strong></div>
                                            <div><span>Task Band</span><strong>{publishedTask?.isVoided ? 'Voided' : publishedTask?.taskBand ?? '-'}</strong></div>
                                            <div><span>Overall Band</span><strong>{publishedGrading?.overallBand ?? '-'}</strong></div>
                                        </div>
                                        {/* ── Task Feedback (tabbed, same design as edit mode) ── */}
                                        {(() => {
                                            const feedbackTabs = [
                                                { id: 'taskSummary', label: 'Task Summary' },
                                                { id: activeTask === 1 ? 'TA' : 'TR', label: activeTask === 1 ? 'TA' : 'TR' },
                                                { id: 'CC', label: 'CC' },
                                                { id: 'LR', label: 'LR' },
                                                { id: 'GRA', label: 'GRA' },
                                            ];
                                            const feedbackData: Record<string, string> = {
                                                taskSummary: publishedTask?.taskSummary || activeTaskState.feedback.taskSummary || '',
                                                [activeTask === 1 ? 'TA' : 'TR']: activeTask === 1
                                                    ? (publishedTask?.perCriteriaFeedback?.TA || '')
                                                    : (publishedTask?.perCriteriaFeedback?.TR || ''),
                                                CC: publishedTask?.perCriteriaFeedback?.CC || '',
                                                LR: publishedTask?.perCriteriaFeedback?.LR || '',
                                                GRA: publishedTask?.perCriteriaFeedback?.GRA || '',
                                            };
                                            return (
                                                <div className="tabbed-feedback-editor" id="review-feedback-viewer">
                                                    <div className="feedback-tabs" id="review-feedback-tabs">
                                                        {feedbackTabs.map(tab => (
                                                            <button
                                                                key={tab.id}
                                                                className={`feedback-tab ${reviewFeedbackTab === tab.id ? 'active' : ''}`}
                                                                onClick={() => setReviewFeedbackTab(tab.id)}
                                                                id={`review-feedback-tab-${tab.id}`}
                                                            >
                                                                {tab.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                    <div className="feedback-editor-content">
                                                        <RichContent className="wgp-rich-copy" content={feedbackData[reviewFeedbackTab] || ''} />
                                                    </div>
                                                </div>
                                            );
                                        })()}
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

                    {/* Readiness Checklist — matches mockup */}
                    {mode === 'editing' && (
                        <div className="wgp-readiness-checklist">
                            <div className="wgp-readiness-title">
                                <IconChecklist size={14} stroke={1.8} aria-hidden="true" />
                                Readiness
                            </div>
                            <div className="wgp-readiness-items">
                                <div className="wgp-readiness-item">
                                    <span>Scores Set</span>
                                    <span className={`wgp-readiness-indicator ${activeTaskReadiness?.scoresReady ? 'ready' : 'not-ready'}`}>
                                        {renderReadinessIcon(Boolean(activeTaskReadiness?.scoresReady))}
                                    </span>
                                </div>
                                <div className="wgp-readiness-item">
                                    <span>Summary Required</span>
                                    <span className={`wgp-readiness-indicator ${activeTaskReadiness?.summaryReady ? 'ready' : 'not-ready'}`}>
                                        {renderReadinessIcon(Boolean(activeTaskReadiness?.summaryReady))}
                                    </span>
                                </div>
                                <div className="wgp-readiness-item">
                                    <span>Comment Draft Clear</span>
                                    <span className={`wgp-readiness-indicator ${activeTaskReadiness?.commentDraftClear ? 'ready' : 'not-ready'}`}>
                                        {renderReadinessIcon(Boolean(activeTaskReadiness?.commentDraftClear))}
                                    </span>
                                </div>
                            </div>
                            <div className={`wgp-readiness-summary ${submissionReadiness.canPublish ? 'ready' : 'not-ready'}`}>
                                <span>Ready to Submit</span>
                                <span>
                                    {submissionReadiness.readyTaskCount}/{submissionReadiness.activeTaskCount} tasks ready
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Bottom Utility Links — matches mockup */}
                    <div className="wgp-utility-links">
                        <button className="wgp-utility-link" onClick={() => { handlePanelTabChange('suggestions'); openSuggestionReview('summary'); }}>
                            Review AI Suggestions
                        </button>
                        {Boolean(submission.auditTrail?.length) && (
                            <button className="wgp-utility-link" onClick={() => handlePanelTabChange('scoring')}>
                                Audit Trail
                            </button>
                        )}
                        {mode === 'editing' && (
                            <div className="wgp-utility-void-wrapper">
                                <VoidTaskButton
                                    taskNumber={activeTask}
                                    isVoided={activeTaskState.isVoided}
                                    voidReason={activeTaskState.voidReason}
                                    onVoid={(reason) => handleVoidTask(activeTask, reason)}
                                    onUnvoid={() => handleUnvoidTask(activeTask)}
                                />
                            </div>
                        )}
                    </div>
                </aside>
            </main>

            <WritingSuggestionsReviewModal
                open={suggestionReviewOpen}
                cache={suggestionCache}
                taskNumber={activeTask}
                loading={suggestionsLoading}
                reloading={suggestionsReloading}
                runState={activeSuggestionRunState}
                canApprove={mode === 'editing'}
                canGenerateMore={suggestionCanGenerateMore}
                approvalBlocked={suggestionApprovalBlocked}
                approvalBlockedReason={suggestionApprovalBlockedReason}
                onClose={closeSuggestionReview}
                onReload={() => void loadSuggestions({ force: true, source: 'force' })}
                onGenerateMore={handleGenerateMoreSuggestions}
                onApproveSuggestion={approveSuggestion}
                onDismissSuggestion={dismissSuggestion}
                onRestoreSuggestion={restoreSuggestion}
            />

            {leaveDialogOpen && (
                <div className="wgp-modal-backdrop" role="presentation">
                    <div className="wgp-modal-card" role="dialog" aria-modal="true" aria-labelledby="wgp-leave-dialog-title">
                        <h2 className="wgp-modal-title" id="wgp-leave-dialog-title">Leave grading page?</h2>
                        <p className="wgp-modal-copy">
                            {leaveWarningMode === 'unsaved-and-generating'
                                ? 'Writing suggestion generation is still running in this browser, and you also have unsaved grading changes. Leaving now may cancel the AI run and lose unsaved grading work unless you save first.'
                                : leaveWarningMode === 'generating-only'
                                    ? 'Writing suggestion generation is still running in this browser. Leaving now may cancel the AI run and require another paid generation later.'
                                    : hasAnyPendingCommentDraft
                                        ? 'Open comment composers and unsaved grading changes will be lost unless you save a draft first.'
                                        : 'You have unsaved grading changes. Save a draft before returning to the queue?'}
                        </p>
                        <div className="wgp-modal-actions">
                            <button
                                className="wgp-secondary-btn"
                                type="button"
                                onClick={() => {
                                    trackAction('cancelLeave', { submissionId, source: 'grading_dialog' });
                                    setLeaveDialogOpen(false);
                                    setPendingLeaveIntent({ type: 'queue' });
                                }}
                                disabled={leaveDialogSaving}
                            >
                                Cancel
                            </button>
                            <button
                                className="wgp-secondary-btn"
                                type="button"
                                onClick={() => {
                                    trackAction('discardChanges', { submissionId, source: 'grading_dialog' });
                                    void executeLeaveIntent('discard');
                                }}
                                disabled={leaveDialogSaving}
                            >
                                {leaveWarningMode === 'generating-only' ? 'Leave Anyway' : 'Discard and Leave'}
                            </button>
                            {leaveWarningMode !== 'generating-only' && (
                                <button
                                    className="wgp-primary-btn"
                                    type="button"
                                    onClick={() => void executeLeaveIntent('save')}
                                    disabled={leaveDialogSaving}
                                >
                                    {leaveDialogSaving ? 'Saving...' : 'Save Draft and Leave'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {takeoverDialogOpen && (
                <div className="wgp-modal-backdrop" role="presentation">
                    <div className="wgp-modal-card" role="dialog" aria-modal="true" aria-labelledby="wgp-takeover-dialog-title">
                        <h2 className="wgp-modal-title" id="wgp-takeover-dialog-title">Discard private draft and take over?</h2>
                        <p className="wgp-modal-copy">
                            This will permanently remove the other teacher&apos;s unpublished draft. A takeover reason is required for the audit trail.
                        </p>
                        <textarea
                            className="wgp-modal-textarea"
                            value={takeoverReason}
                            onChange={(event) => setTakeoverReason(event.target.value)}
                            placeholder="Explain why this private draft is being discarded..."
                            rows={4}
                        />
                        <div className="wgp-modal-actions">
                            <button
                                className="wgp-secondary-btn"
                                type="button"
                                onClick={() => {
                                    trackAction('cancelDraftTakeover', { submissionId, source: 'grading_dialog' });
                                    setTakeoverDialogOpen(false);
                                }}
                                disabled={takeoverSubmitting}
                            >
                                Cancel
                            </button>
                            <button
                                className="wgp-primary-btn"
                                type="button"
                                onClick={() => void confirmDiscardTakeover()}
                                disabled={takeoverSubmitting}
                            >
                                {takeoverSubmitting ? 'Taking Over...' : 'Discard Draft and Take Over'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {regradeDialogOpen && (
                <div className="wgp-modal-backdrop" role="presentation">
                    <div className="wgp-modal-card" role="dialog" aria-modal="true" aria-labelledby="wgp-regrade-dialog-title">
                        <h2 className="wgp-modal-title" id="wgp-regrade-dialog-title">Publish regrade</h2>
                        <p className="wgp-modal-copy">
                            A regrade reason is required before updating the published grading.
                        </p>
                        <textarea
                            className="wgp-modal-textarea"
                            value={regradeReason}
                            onChange={(event) => {
                                setRegradeReason(event.target.value);
                                if (regradeError) {
                                    setRegradeError(null);
                                }
                            }}
                            placeholder="Explain what changed in this regrade..."
                            rows={4}
                        />
                        {regradeError && <p className="wgp-modal-error">{regradeError}</p>}
                        <div className="wgp-modal-actions">
                            <button
                                className="wgp-secondary-btn"
                                type="button"
                                onClick={() => {
                                    trackAction('cancelRegrade', { submissionId, source: 'grading_dialog' });
                                    setRegradeDialogOpen(false);
                                    setRegradeError(null);
                                }}
                                disabled={publishing}
                            >
                                Cancel
                            </button>
                            <button
                                className="wgp-primary-btn"
                                type="button"
                                onClick={() => void confirmRegradePublish()}
                                disabled={publishing}
                            >
                                {publishing ? 'Publishing...' : 'Publish Regrade'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
