import type {
    PublishedWritingGrading,
    WritingAnnotation,
    WritingGradingResult,
    WritingSubmission,
    WritingTaskMarkupState,
} from '../../types/ielts-writing.types';
import type { TestResultRecord } from '../../services/testResults.service';

export type WritingResultPhase = 'pending-review' | 'published';
export type WritingResultViewerMode = 'student' | 'teacher-actionable' | 'teacher-read-only';

export interface WritingCriteriaFeedbackMap {
    TA?: string;
    TR?: string;
    CC?: string;
    LR?: string;
    GRA?: string;
}

export interface WritingResultTaskData {
    taskNumber: 1 | 2;
    taskType: string;
    promptText: string;
    promptImageUrl?: string;
    wordMinimum: number;
    essayText: string;
    wordCount: number;
    activeTimeSeconds: number;
    isVoided: boolean;
    voidReason?: string;
    taskBand: number | null;
    criteriaScores: Partial<Record<'TA' | 'TR' | 'CC' | 'LR' | 'GRA', number>>;
    taskSummary: string;
    criteriaFeedback: WritingCriteriaFeedbackMap;
    markedContent: Record<string, any> | null;
    comments: PublishedCommentData[];
    corrections: PublishedCorrectionData[];
    fallbackAnnotations: WritingAnnotation[];
    usesLegacyProjection: boolean;
}

export interface PublishedCommentData {
    kind: 'comment';
    id: string;
    text: string;
    color: string;
    anchorText: string;
    from: number;
    to: number;
    status: 'active' | 'resolved' | 'deleted';
    categoryLabel: string;
}

export interface PublishedCorrectionData {
    kind: 'correction';
    id: string;
    anchorText: string;
    correctionText: string;
    from: number;
    to: number;
    label: string;
}

export type PublishedFeedbackItem = PublishedCommentData | PublishedCorrectionData;

export interface WritingBandSummaryItem {
    key: string;
    label: string;
    band: number | null;
    tone: 'overall' | 'task';
}

export interface WritingResultSurfaceData {
    submissionId: string;
    phase: WritingResultPhase;
    viewerMode: WritingResultViewerMode;
    testTitle: string;
    formatLabel: string;
    contextLabel: string;
    studentName: string;
    studentId: string;
    submittedAt: number;
    totalElapsedTimeSeconds: number;
    totalWordCount: number;
    teacherName: string | null;
    teacherId: string | null;
    gradedAt: number | null;
    updatedAt: number | null;
    overallBand: number | null;
    overallSummary: string;
    auditVersion: number | null;
    activeTaskCount: number;
    hasPublishedMarkup: boolean;
    hasAnyFeedback: boolean;
    usesLegacyProjection: boolean;
    draftOwnerTeacherId: string | null;
    tasks: WritingResultTaskData[];
    bandSummaryItems: WritingBandSummaryItem[];
}

interface BuildWritingResultSurfaceOptions {
    viewerMode: WritingResultViewerMode;
    canRevealPublishedData?: boolean;
}

const CRITERIA_KEYS: Array<keyof WritingCriteriaFeedbackMap> = ['TA', 'TR', 'CC', 'LR', 'GRA'];

export function buildWritingResultSurfaceData(
    submission: WritingSubmission,
    options: BuildWritingResultSurfaceOptions,
): WritingResultSurfaceData {
    const canRevealPublishedData = options.canRevealPublishedData ?? true;
    const published = submission.publishedGrading ?? null;
    const legacy = !published && submission.grading ? submission.grading : null;
    const hasCanonicalPublishedData = Boolean(published || submission.markingStatus === 'graded');
    const hasVisiblePublishedData = Boolean(canRevealPublishedData && (published || (hasCanonicalPublishedData ? legacy : null)));
    const tasks = submission.tasks
        .slice()
        .sort((left, right) => left.taskNumber - right.taskNumber)
        .map((task) => buildTaskData(task, submission, published, legacy));
    const activeTasks = tasks.filter((task) => !task.isVoided);
    const overallBand = hasVisiblePublishedData
        ? (published?.overallBand ?? legacy?.overallBand ?? null)
        : null;
    const overallSummary = hasVisiblePublishedData
        ? (published?.overallSummary ?? legacy?.feedback?.overall ?? '')
        : '';
    const teacherName = hasVisiblePublishedData
        ? (published?.teacherName ?? legacy?.teacherName ?? null)
        : null;
    const teacherId = hasVisiblePublishedData
        ? (published?.teacherId ?? legacy?.teacherId ?? null)
        : null;
    const gradedAt = hasVisiblePublishedData
        ? (published?.gradedAt ?? legacy?.gradedAt ?? null)
        : null;
    const updatedAt = hasVisiblePublishedData
        ? (published?.updatedAt ?? legacy?.gradedAt ?? null)
        : null;
    const bandSummaryItems = buildBandSummaryItems(overallBand, activeTasks);
    const hasPublishedMarkup = hasVisiblePublishedData
        && tasks.some((task) => Boolean(task.markedContent) || task.fallbackAnnotations.length > 0 || task.comments.length > 0 || task.corrections.length > 0);
    const hasAnyFeedback = hasVisiblePublishedData
        && (Boolean(stripHtml(overallSummary)) || tasks.some((task) => hasTaskFeedback(task)));

    return {
        submissionId: submission.id,
        phase: hasVisiblePublishedData ? 'published' : 'pending-review',
        viewerMode: options.viewerMode,
        testTitle: submission.testMeta.testTitle,
        formatLabel: formatWritingFormat(submission.testMeta.format),
        contextLabel: formatWritingContext(submission.context.type),
        studentName: submission.studentName,
        studentId: submission.studentId,
        submittedAt: submission.submittedAt,
        totalElapsedTimeSeconds: submission.totalElapsedTimeSeconds,
        totalWordCount: submission.tasks.reduce((sum, task) => sum + task.wordCount, 0),
        teacherName,
        teacherId,
        gradedAt,
        updatedAt,
        overallBand,
        overallSummary,
        auditVersion: hasVisiblePublishedData ? (published?.auditVersion ?? null) : null,
        activeTaskCount: activeTasks.length,
        hasPublishedMarkup,
        hasAnyFeedback,
        usesLegacyProjection: Boolean(hasVisiblePublishedData && legacy),
        draftOwnerTeacherId: submission.gradingDraftMeta?.ownerTeacherId ?? null,
        tasks,
        bandSummaryItems,
    };
}

export function buildWritingSubmissionFallbackFromResult(
    result: TestResultRecord | null | undefined,
): WritingSubmission | null {
    if (!result) {
        return null;
    }

    const writingData = (result as any).writingData;
    const preview = (result as any).writingSubmission;
    const isWritingResult = result.testSkill === 'writing' || Boolean(writingData) || Boolean(preview);

    if (!isWritingResult) {
        return null;
    }

    const indexedTasks = Array.isArray(writingData?.tasks) && writingData.tasks.length > 0
        ? writingData.tasks
        : [{
            taskNumber: 1,
            wordCount: preview?.wordCount ?? 0,
            activeTimeSeconds: typeof result.timeElapsed === 'number' ? result.timeElapsed : 0,
        }];

    const format = normalizeWritingFormat(indexedTasks);
    const markingStatus = normalizeWritingMarkingStatus(result.markingStatus ?? writingData?.markingStatus);
    const fallbackTasks = indexedTasks
        .map((task: any, index: number) => {
            const taskNumber = normalizeTaskNumber(task?.taskNumber ?? index + 1);

            return {
                taskNumber,
                taskType: taskNumber === 1 ? 'bar-chart' : 'opinion',
                promptText: typeof task?.promptText === 'string' && task.promptText.trim()
                    ? task.promptText
                    : 'Prompt unavailable in this saved result snapshot.',
                promptImageUrl: typeof task?.promptImageUrl === 'string' ? task.promptImageUrl : undefined,
                wordMinimum: typeof task?.wordMinimum === 'number'
                    ? task.wordMinimum
                    : (taskNumber === 1 ? 150 : 250),
                essayText: extractTaskEssayText(preview?.text, taskNumber, indexedTasks.length),
                wordCount: typeof task?.wordCount === 'number'
                    ? task.wordCount
                    : (typeof preview?.wordCount === 'number' ? preview.wordCount : 0),
                activeTimeSeconds: typeof task?.activeTimeSeconds === 'number'
                    ? task.activeTimeSeconds
                    : (typeof result.timeElapsed === 'number' ? result.timeElapsed : 0),
            };
        })
        .sort((left, right) => left.taskNumber - right.taskNumber);
    const fallbackPublishedBand = typeof writingData?.overallBand === 'number'
        ? writingData.overallBand
        : (typeof result.bandScore === 'number' && result.bandScore > 0 ? result.bandScore : null);
    const fallbackGrading = markingStatus === 'graded'
        ? {
            teacherId: getResultFeedbackTeacherId(result),
            teacherName: getResultFeedbackTeacherName(result),
            gradedAt: typeof result.feedbackUpdatedAt === 'number'
                ? result.feedbackUpdatedAt
                : (typeof result.updatedAt === 'number' ? result.updatedAt : result.submittedAt),
            overallBand: fallbackPublishedBand ?? 0,
            perTask: [],
            feedback: {
                overall: typeof result.overallFeedback === 'string' ? result.overallFeedback : '',
                perCriteria: {
                    CC: '',
                    LR: '',
                    GRA: '',
                },
            },
        } satisfies WritingGradingResult
        : undefined;

    return {
        id: writingData?.submissionId || result.resultId,
        studentId: result.studentId || result.userId || 'unknown-student',
        studentName: result.studentName || 'Student',
        context: normalizeWritingContext(result),
        testMeta: {
            testId: result.testId || writingData?.submissionId || result.resultId,
            testTitle: result.testTitle || 'IELTS Writing',
            format,
            duration: normalizeWritingDuration(result, fallbackTasks.length),
        },
        tasks: fallbackTasks,
        submittedAt: result.submittedAt || result.createdAt || Date.now(),
        totalElapsedTimeSeconds: typeof result.timeElapsed === 'number'
            ? result.timeElapsed
            : fallbackTasks.reduce((sum, task) => sum + task.activeTimeSeconds, 0),
        pasteAttemptCount: 0,
        markingStatus,
        publishedGrading: null,
        gradingDraftMeta: null,
        grading: fallbackGrading,
        annotations: [],
        auditTrail: [],
    };
}

function buildTaskData(
    task: WritingSubmission['tasks'][number],
    submission: WritingSubmission,
    published: PublishedWritingGrading | null,
    legacy: WritingGradingResult | null,
): WritingResultTaskData {
    const publishedTask = published?.perTask?.[task.taskNumber] ?? null;
    const legacyTask = legacy?.perTask?.find((entry) => entry.taskNumber === task.taskNumber) ?? null;
    const markedContent = publishedTask?.markedContent ?? null;
    const fallbackAnnotations = publishedTask
        ? []
        : (submission.annotations || []).filter((annotation) => annotation.taskNumber === task.taskNumber);

    return {
        taskNumber: task.taskNumber,
        taskType: String(task.taskType || ''),
        promptText: task.promptText,
        promptImageUrl: task.promptImageUrl,
        wordMinimum: task.wordMinimum,
        essayText: task.essayText,
        wordCount: task.wordCount,
        activeTimeSeconds: task.activeTimeSeconds,
        isVoided: publishedTask?.isVoided ?? legacyTask?.isVoided ?? false,
        voidReason: publishedTask?.voidReason ?? legacyTask?.voidReason,
        taskBand: publishedTask?.taskBand ?? legacyTask?.taskBand ?? null,
        criteriaScores: publishedTask?.criteriaScores ?? legacyTask?.criteriaScores ?? {},
        taskSummary: publishedTask?.taskSummary ?? '',
        criteriaFeedback: publishedTask
            ? publishedTask.perCriteriaFeedback
            : buildLegacyCriteriaFeedback(task.taskNumber, legacy),
        markedContent,
        comments: (publishedTask?.comments ?? [])
            .filter((comment) => comment.status === 'active')
            .slice()
            .map((comment) => ({
                kind: 'comment' as const,
                ...comment,
            }))
            .sort((left, right) => left.from - right.from),
        corrections: extractPublishedCorrections(markedContent),
        fallbackAnnotations,
        usesLegacyProjection: Boolean(!publishedTask && legacyTask),
    };
}

function buildLegacyCriteriaFeedback(
    taskNumber: 1 | 2,
    legacy: WritingGradingResult | null,
): WritingCriteriaFeedbackMap {
    const feedback = legacy?.feedback?.perCriteria;
    if (!feedback) {
        return {};
    }

    return {
        ...(taskNumber === 1 && feedback.TA ? { TA: feedback.TA } : {}),
        ...(taskNumber === 2 && feedback.TR ? { TR: feedback.TR } : {}),
        ...(feedback.CC ? { CC: feedback.CC } : {}),
        ...(feedback.LR ? { LR: feedback.LR } : {}),
        ...(feedback.GRA ? { GRA: feedback.GRA } : {}),
    };
}

function buildBandSummaryItems(
    overallBand: number | null,
    tasks: WritingResultTaskData[],
): WritingBandSummaryItem[] {
    const items: WritingBandSummaryItem[] = [];

    if (overallBand !== null) {
        items.push({
            key: 'overall',
            label: 'Overall Band',
            band: overallBand,
            tone: 'overall',
        });
    }

    tasks.forEach((task) => {
        items.push({
            key: `task-${task.taskNumber}`,
            label: `Task ${task.taskNumber}`,
            band: task.taskBand,
            tone: 'task',
        });
    });

    return items;
}

function extractPublishedCorrections(
    markedContent: Record<string, any> | null,
): PublishedCorrectionData[] {
    if (!markedContent || typeof markedContent !== 'object') {
        return [];
    }

    const correctionsById = new Map<string, PublishedCorrectionData>();
    let textOffset = 0;

    const visitNode = (node: any) => {
        if (!node || typeof node !== 'object') {
            return;
        }

        if (node.type === 'hardBreak') {
            textOffset += 1;
            return;
        }

        if (typeof node.text === 'string') {
            const nodeText = node.text;
            const correctionMark = Array.isArray(node.marks)
                ? node.marks.find((mark: any) => mark?.type === 'correctionMark' && typeof mark?.attrs?.correctionText === 'string')
                : null;

            if (correctionMark && nodeText.length > 0) {
                const correctionId = typeof correctionMark.attrs?.correctionId === 'string' && correctionMark.attrs.correctionId.trim()
                    ? correctionMark.attrs.correctionId
                    : `correction-${textOffset}-${textOffset + nodeText.length}`;
                const correctionText = String(correctionMark.attrs?.correctionText || '').trim();
                const existing = correctionsById.get(correctionId);

                if (existing) {
                    existing.anchorText += nodeText;
                    existing.to = textOffset + nodeText.length;
                    if (!existing.correctionText && correctionText) {
                        existing.correctionText = correctionText;
                    }
                } else {
                    correctionsById.set(correctionId, {
                        kind: 'correction',
                        id: correctionId,
                        anchorText: nodeText,
                        correctionText,
                        from: textOffset,
                        to: textOffset + nodeText.length,
                        label: 'Correction',
                    });
                }
            }

            textOffset += nodeText.length;
            return;
        }

        const content = Array.isArray(node.content) ? node.content : [];
        content.forEach(visitNode);

        if (content.length > 0 && insertsBlockSeparator(node.type)) {
            textOffset += 1;
        }
    };

    visitNode(markedContent);

    return [...correctionsById.values()]
        .filter((correction) => correction.anchorText.trim().length > 0 || correction.correctionText.length > 0)
        .sort((left, right) => left.from - right.from);
}

function insertsBlockSeparator(nodeType: unknown) {
    return nodeType === 'paragraph'
        || nodeType === 'heading'
        || nodeType === 'blockquote'
        || nodeType === 'listItem';
}

function hasTaskFeedback(task: WritingResultTaskData) {
    return Boolean(stripHtml(task.taskSummary))
        || CRITERIA_KEYS.some((key) => Boolean(stripHtml(task.criteriaFeedback[key] || '')));
}

function stripHtml(value: string | null | undefined) {
    return String(value || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .trim();
}

export function formatWritingFormat(format: string) {
    switch (format) {
        case 'task1-only':
            return 'Task 1 Only';
        case 'task2-only':
            return 'Task 2 Only';
        case 'full-test':
            return 'Full Test';
        default:
            return String(format || 'Writing');
    }
}

export function formatWritingContext(contextType: string) {
    switch (contextType) {
        case 'live-session':
            return 'Class Session';
        case 'solo-practice':
            return 'Solo Practice';
        case 'homework':
            return 'Homework';
        default:
            return 'Writing Submission';
    }
}

export function formatElapsedTime(totalSeconds: number) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
}

export function getVisibleCriteriaEntries(task: WritingResultTaskData) {
    return CRITERIA_KEYS
        .map((key) => ({
            key,
            score: task.criteriaScores[key],
            feedback: task.criteriaFeedback[key] || '',
        }))
        .filter((entry) => entry.score !== undefined || Boolean(stripHtml(entry.feedback)));
}

function normalizeWritingContext(result: TestResultRecord): WritingSubmission['context'] {
    const contextType = result.context?.type;

    if (contextType === 'homework') {
        return {
            type: 'homework',
            sessionCode: result.sessionCode || undefined,
            homeworkId: result.context?.assignment?.homeworkId,
            classId: result.classId ?? undefined,
            className: result.className ?? undefined,
            courseId: result.courseId ?? undefined,
            courseName: result.courseName ?? undefined,
            moduleId: result.moduleId ?? undefined,
            moduleName: result.moduleName ?? undefined,
        };
    }

    if (contextType === 'class_session') {
        return {
            type: 'live-session',
            sessionCode: result.sessionCode || undefined,
            classId: result.classId ?? undefined,
            className: result.className ?? undefined,
            courseId: result.courseId ?? undefined,
            courseName: result.courseName ?? undefined,
            moduleId: result.moduleId ?? undefined,
            moduleName: result.moduleName ?? undefined,
        };
    }

    return {
        type: 'solo-practice',
        classId: result.classId ?? undefined,
        className: result.className ?? undefined,
        courseId: result.courseId ?? undefined,
        courseName: result.courseName ?? undefined,
        moduleId: result.moduleId ?? undefined,
        moduleName: result.moduleName ?? undefined,
    };
}

function normalizeWritingDuration(result: TestResultRecord, taskCount: number) {
    const timerMinutes = result.context?.configApplied?.timerMinutes;
    if (typeof timerMinutes === 'number' && Number.isFinite(timerMinutes) && timerMinutes > 0) {
        return timerMinutes;
    }

    if (typeof result.testDuration === 'number' && Number.isFinite(result.testDuration) && result.testDuration > 0) {
        return result.testDuration > 180 ? Math.round(result.testDuration / 60) : result.testDuration;
    }

    return taskCount > 1 ? 60 : 20;
}

function normalizeWritingFormat(tasks: Array<{ taskNumber?: number }> | number): WritingSubmission['testMeta']['format'] {
    if (typeof tasks === 'number') {
        return tasks >= 2 ? 'full-test' : 'task1-only';
    }

    if (tasks.length >= 2) {
        return 'full-test';
    }

    return normalizeTaskNumber(tasks[0]?.taskNumber) === 2 ? 'task2-only' : 'task1-only';
}

function normalizeWritingMarkingStatus(
    status: TestResultRecord['markingStatus'] | string | null | undefined,
): WritingSubmission['markingStatus'] {
    if (status === 'graded' || status === 'reviewed') {
        return 'graded';
    }

    return 'pending-review';
}

function normalizeTaskNumber(value: unknown): 1 | 2 {
    return Number(value) === 2 ? 2 : 1;
}

function extractTaskEssayText(previewText: unknown, taskNumber: 1 | 2, totalTasks: number) {
    const normalizedText = typeof previewText === 'string' ? previewText.trim() : '';

    if (!normalizedText) {
        return '';
    }

    if (totalTasks <= 1) {
        return normalizedText.replace(/^Task\s+\d+\s*/i, '').trim();
    }

    const matcher = new RegExp(
        `Task\\s+${taskNumber}\\s*\\n?([\\s\\S]*?)(?=\\n\\s*Task\\s+\\d+\\s*\\n?|$)`,
        'i',
    );
    const match = normalizedText.match(matcher);

    if (match?.[1]) {
        return match[1].trim();
    }

    return normalizedText;
}

function getResultFeedbackTeacherId(result: TestResultRecord) {
    if (typeof (result as any).feedbackUpdatedByTeacherId === 'string' && (result as any).feedbackUpdatedByTeacherId.trim()) {
        return (result as any).feedbackUpdatedByTeacherId;
    }

    return typeof result.feedbackUpdatedBy === 'string' ? result.feedbackUpdatedBy : '';
}

function getResultFeedbackTeacherName(result: TestResultRecord) {
    if (typeof (result as any).feedbackUpdatedByTeacherName === 'string' && (result as any).feedbackUpdatedByTeacherName.trim()) {
        return (result as any).feedbackUpdatedByTeacherName;
    }

    if (typeof result.feedbackUpdatedBy === 'string' && result.feedbackUpdatedBy.trim()) {
        return result.feedbackUpdatedBy;
    }

    return 'Teacher';
}
