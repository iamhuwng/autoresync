/**
 * Writing Submission Service
 * 
 * PRD-0030: IELTS Writing Test System
 * Handles CRUD for writing submissions (Firestore) and RTDB result index.
 * Includes autoSubmitFromRTDB() standalone function for end-session auto-submit.
 * 
 * @module services/writingSubmissionService
 */

import {
    doc,
    setDoc,
    getDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    collection,
    query,
    where,
    orderBy,
} from 'firebase/firestore';
import { ref, get, push, set, update } from 'firebase/database';
// @ts-ignore — JS service file
import { database, firestore as db } from './firebase';
import { deepRemoveUndefined } from './draftCloudService';
import { withRestoreGuard } from './restoreGuard';
import type {
    WritingSubmission,
    WritingSubmissionForGrading,
    WritingGradingResult,
    WritingGradingDraft,
    WritingGradingAudit,
    WritingAnnotation,
    PublishedWritingGrading,
    WritingTaskMarkupState,
    WritingTaskGradingResult,
    IELTSWritingTest,
} from '../types/ielts-writing.types';
import { notifyWritingGraded, notifyWritingSubmitted } from './notificationService';
import { markHomeworkSubmissionGraded } from './homeworkSubmissionService';
import type { ResultContext } from '../types/solo.types';
import { resolveResultOwnership } from './resultOwnershipResolver';
import {
    buildUnresolvedResultVisibilityReportEntry,
    clearUnresolvedResultVisibilityReport,
    upsertUnresolvedResultVisibilityReport,
} from './resultVisibilityReporting.service';
import {
    getCanonicalClassIndexId,
    getCanonicalCourseIndexId,
    isScopedIndexBackfillEligible,
} from './resultVisibilityReindex.service';
import { calculateOverallBand } from '../utils/ieltsWritingBandCalculator';
import {
    evaluateWritingSubmissionReadiness,
    isMeaningfulHtml,
    type WritingReadinessTaskInput,
} from '../utils/writingGradingReadiness';
import { normalizeTaskCorrections } from '../utils/writingCorrections';

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const SUBMISSIONS_COLLECTION = 'writing_submissions';
const GRADING_DRAFTS_COLLECTION = 'writing_grading_drafts';
const AUTHORING_DRAFTS_COLLECTION = 'writing_drafts';
const WRITING_RESET_RTDB_ROOTS = [
    'test_results',
    'test_results_by_student',
    'test_results_by_session',
    'test_results_by_teacher',
    'test_results_by_course',
    'test_results_by_class',
    'test_results_solo_practice_by_student',
    'writing_grading_locks',
] as const;

type WritingResultAcademicContext = {
    courseId?: string | null;
    courseName?: string | null;
    classId?: string | null;
    className?: string | null;
    moduleId?: string | null;
    moduleName?: string | null;
};

type WritingAutoSubmitSource = 'student' | 'teacher-end' | 'system-timeout';

interface PersistWritingResultOptions {
    resultId: string;
    studentId: string;
    studentName: string;
    sessionCode?: string;
    academicContext?: WritingResultAcademicContext;
}

interface BuildWritingResultRecordOptions {
    resultId: string;
    sessionCode?: string;
    testId: string;
    studentId: string;
    studentName: string;
    testTitle: string;
    testType: string;
    testDuration: number;
    submittedAt: number;
    timeElapsed: number;
    tasks: WritingSubmission['tasks'];
    markingStatus: 'pending-review' | 'graded';
    overallBand?: number | null;
    academicContext?: WritingResultAcademicContext;
    context?: ResultContext;
}

interface UpdateGradingOptions {
    markingStatus?: WritingSubmission['markingStatus'];
    syncResultRecord?: boolean;
}

interface DraftWriteOptions {
    expectedDraftVersion?: number | null;
    expectedPublishedVersion?: number;
}

interface PublishGradingOptions extends DraftWriteOptions {
    reason?: string;
    skipNotification?: boolean;
}

interface DiscardDraftOptions {
    actorTeacherId: string;
    actorTeacherName?: string;
    reason: string;
}

export interface WritingDataResetPlan {
    firestoreCollections: Array<{
        collection: string;
        count: number;
        ids: string[];
    }>;
    realtimeDatabasePaths: string[];
}

function isPermissionDeniedError(error: unknown): boolean {
    if (!(error instanceof Error)) {
        return false;
    }

    const message = error.message.toLowerCase();
    return message.includes('permission denied') || message.includes('insufficient permissions');
}

async function readExistingWritingResultRecord(resultId: string): Promise<Record<string, any> | null> {
    try {
        const snapshot = await get(ref(database, `test_results/${resultId}`));
        return snapshot.exists() ? snapshot.val() : null;
    } catch (error) {
        if (isPermissionDeniedError(error)) {
            console.warn(
                '[WritingSubmission] Existing RTDB result row unreadable during grading sync, rebuilding from Firestore submission',
                error
            );
            return null;
        }

        throw error;
    }
}

function getPreferredTeacherId(...candidates: unknown[]): string | undefined {
    for (const candidate of candidates) {
        if (typeof candidate === 'string') {
            const trimmed = candidate.trim();
            if (trimmed) {
                return trimmed;
            }
        }
    }

    return undefined;
}

function extractAcademicContext(source: Record<string, any> | null | undefined): WritingResultAcademicContext | undefined {
    if (!source) {
        return undefined;
    }

    const rawContext = source.academicContext || source;
    const academicContext: WritingResultAcademicContext = {
        courseId: rawContext.courseId ?? null,
        courseName: rawContext.courseName ?? null,
        classId: rawContext.classId ?? null,
        className: rawContext.className ?? null,
        moduleId: rawContext.moduleId ?? null,
        moduleName: rawContext.moduleName ?? null,
    };

    const hasContext = Object.values(academicContext).some(value => value !== null && value !== undefined && value !== '');
    return hasContext ? academicContext : undefined;
}

function toWritingTaskIndex(tasks: WritingSubmission['tasks']) {
    return tasks.map(task => ({
        taskNumber: task.taskNumber,
        wordCount: task.wordCount,
        activeTimeSeconds: task.activeTimeSeconds,
    }));
}

function buildWritingSubmissionPreview(tasks: WritingSubmission['tasks']) {
    const text = tasks
        .map(task => `Task ${task.taskNumber}\n${task.essayText || ''}`.trim())
        .filter(Boolean)
        .join('\n\n');
    const wordCount = tasks.reduce((sum, task) => sum + (task.wordCount || 0), 0);

    return {
        text,
        wordCount,
    };
}

function mapSubmissionContextToResultContext(submission: WritingSubmission): ResultContext {
    const sourceName = submission.testMeta.testTitle;
    const timerMinutes = submission.testMeta.duration;

    if (submission.context.type === 'homework') {
        return {
            type: 'homework',
            source: {
                type: 'homework',
                id: submission.context.homeworkId || undefined,
                name: sourceName,
                submissionId: submission.id,
                classId: submission.context.classId,
                courseId: submission.context.courseId,
            },
            classId: submission.context.classId,
            courseId: submission.context.courseId,
            assignment: submission.context.homeworkId
                ? {
                    homeworkId: submission.context.homeworkId,
                    attemptNumber: 1,
                }
                : undefined,
            configApplied: {
                timerMinutes,
                feedbackTiming: 'after_completion',
                source: 'material_default',
            },
        };
    }

    if (submission.context.type === 'live-session') {
        return {
            type: 'class_session',
            source: {
                type: 'class',
                id: submission.context.sessionCode || undefined,
                name: sourceName,
                sessionCode: submission.context.sessionCode,
                classId: submission.context.classId,
                courseId: submission.context.courseId,
                submissionId: submission.id,
            },
            sessionCode: submission.context.sessionCode,
            classId: submission.context.classId,
            courseId: submission.context.courseId,
            configApplied: {
                timerMinutes,
                feedbackTiming: 'after_completion',
                source: 'material_default',
            },
        };
    }

    if (submission.context.courseId) {
        return {
            type: 'course_material',
            source: {
                type: 'course',
                id: submission.context.courseId,
                name: submission.context.courseName || sourceName,
                courseId: submission.context.courseId,
                classId: submission.context.classId,
                submissionId: submission.id,
            },
            courseId: submission.context.courseId,
            classId: submission.context.classId,
            configApplied: {
                timerMinutes,
                feedbackTiming: 'after_completion',
                source: 'material_default',
            },
        };
    }

    return {
        type: 'self_study',
        source: {
            type: 'library',
            id: submission.testMeta.testId,
            name: sourceName,
            submissionId: submission.id,
        },
        configApplied: {
            timerMinutes,
            feedbackTiming: 'after_completion',
            source: 'material_default',
        },
    };
}

function mapSubmissionContextTypeToResultTestType(
    contextType: WritingSubmission['context']['type']
): string {
    if (contextType === 'homework') {
        return 'homework';
    }
    if (contextType === 'solo-practice') {
        return 'practice';
    }
    return 'test';
}

function buildWritingResultRecord({
    resultId,
    sessionCode,
    testId,
    studentId,
    studentName,
    testTitle,
    testType,
    testDuration,
    submittedAt,
    timeElapsed,
    tasks,
    markingStatus,
    overallBand = null,
    academicContext,
    context,
}: BuildWritingResultRecordOptions) {
    return deepRemoveUndefined({
        resultId,
        sessionCode,
        testId,
        studentId,
        studentName,
        isGuest: false,
        totalScore: 0,
        maxScore: 0,
        percentage: 0,
        bandScore: overallBand ?? 0,
        testTitle,
        testType,
        testSkill: 'writing',
        testDuration,
        questionResults: [],
        correct: 0,
        incorrect: 0,
        partialCredit: 0,
        totalQuestions: 0,
        submittedAt,
        timeElapsed,
        createdAt: submittedAt,
        updatedAt: submittedAt,
        markingStatus,
        courseId: academicContext?.courseId ?? null,
        courseName: academicContext?.courseName ?? null,
        classId: academicContext?.classId ?? null,
        className: academicContext?.className ?? null,
        moduleId: academicContext?.moduleId ?? null,
        moduleName: academicContext?.moduleName ?? null,
        context,
        writingData: {
            submissionId: resultId,
            overallBand,
            markingStatus,
            tasks: toWritingTaskIndex(tasks),
        },
        writingSubmission: buildWritingSubmissionPreview(tasks),
    });
}

function getSubmissionRef(submissionId: string) {
    return doc(db, SUBMISSIONS_COLLECTION, submissionId);
}

function getGradingDraftRef(submissionId: string) {
    return doc(db, GRADING_DRAFTS_COLLECTION, submissionId);
}

function getCurrentPublishedGrading(submission: WritingSubmission): PublishedWritingGrading | null {
    return normalizePublishedWritingGrading(submission.publishedGrading ?? null);
}

function getCurrentPublishedVersion(submission: WritingSubmission): number {
    return submission.publishedGrading?.auditVersion ?? 0;
}

function getSortedTaskMarkupStates(
    perTask: Partial<Record<1 | 2, WritingTaskMarkupState>>
): WritingTaskMarkupState[] {
    return Object.values(perTask)
        .filter((task): task is WritingTaskMarkupState => Boolean(task))
        .sort((left, right) => left.taskNumber - right.taskNumber);
}

function normalizeTaskMarkupState(
    task: WritingTaskMarkupState,
    fallbackTimestamp: number,
): WritingTaskMarkupState {
    return {
        ...task,
        comments: Array.isArray(task.comments) ? task.comments : [],
        corrections: normalizeTaskCorrections({
            taskNumber: task.taskNumber,
            markedContent: task.markedContent,
            corrections: task.corrections,
            fallbackTimestamp,
        }),
    };
}

function normalizePerTaskMarkupStates(
    perTask: Partial<Record<1 | 2, WritingTaskMarkupState>>,
    fallbackTimestamp: number,
): Partial<Record<1 | 2, WritingTaskMarkupState>> {
    return Object.entries(perTask || {}).reduce((accumulator, [taskNumber, task]) => {
        if (!task) {
            return accumulator;
        }

        const normalizedTaskNumber = task.taskNumber ?? Number(taskNumber);
        if (normalizedTaskNumber !== 1 && normalizedTaskNumber !== 2) {
            return accumulator;
        }

        accumulator[normalizedTaskNumber] = normalizeTaskMarkupState({
            ...task,
            taskNumber: normalizedTaskNumber,
        }, fallbackTimestamp);
        return accumulator;
    }, {} as Partial<Record<1 | 2, WritingTaskMarkupState>>);
}

function normalizePublishedWritingGrading(
    publishedGrading: PublishedWritingGrading | null,
): PublishedWritingGrading | null {
    if (!publishedGrading) {
        return null;
    }

    const fallbackTimestamp = publishedGrading.updatedAt ?? publishedGrading.gradedAt ?? Date.now();
    return {
        ...publishedGrading,
        perTask: normalizePerTaskMarkupStates(publishedGrading.perTask, fallbackTimestamp),
    };
}

function normalizeWritingGradingDraft(
    draft: WritingGradingDraft | null,
): WritingGradingDraft | null {
    if (!draft) {
        return null;
    }

    const fallbackTimestamp = draft.updatedAt ?? draft.createdAt ?? Date.now();
    return {
        ...draft,
        perTask: normalizePerTaskMarkupStates(draft.perTask, fallbackTimestamp),
    };
}

function buildTaskGradingResultsFromMarkup(
    perTask: Partial<Record<1 | 2, WritingTaskMarkupState>>
): WritingTaskGradingResult[] {
    return getSortedTaskMarkupStates(perTask).map((task) => ({
        taskNumber: task.taskNumber,
        isVoided: task.isVoided,
        voidReason: task.voidReason,
        criteriaScores: {
            ...(typeof task.criteriaScores.TA === 'number' ? { TA: task.criteriaScores.TA } : {}),
            ...(typeof task.criteriaScores.TR === 'number' ? { TR: task.criteriaScores.TR } : {}),
            CC: task.criteriaScores.CC ?? 0,
            LR: task.criteriaScores.LR ?? 0,
            GRA: task.criteriaScores.GRA ?? 0,
        },
        taskBand: task.taskBand ?? 0,
    }));
}

function buildCombinedFeedback(
    tasks: WritingTaskMarkupState[],
    selector: (task: WritingTaskMarkupState) => string | undefined
): string {
    const sections = tasks
        .map((task) => {
            const value = selector(task)?.trim();
            if (!value) {
                return null;
            }

            return tasks.length > 1
                ? `<p><strong>Task ${task.taskNumber}:</strong></p>${value}`
                : value;
        })
        .filter((value): value is string => Boolean(value));

    return sections.join('<hr />');
}

function buildCompatibilityGradingFromPublished(
    publishedGrading: PublishedWritingGrading
): WritingGradingResult {
    const tasks = getSortedTaskMarkupStates(publishedGrading.perTask);

    return {
        teacherId: publishedGrading.teacherId,
        teacherName: publishedGrading.teacherName,
        gradedAt: publishedGrading.gradedAt,
        overallBand: publishedGrading.overallBand,
        perTask: buildTaskGradingResultsFromMarkup(publishedGrading.perTask),
        feedback: {
            overall: publishedGrading.overallSummary,
            perCriteria: {
                TA: tasks.find((task) => task.taskNumber === 1)?.perCriteriaFeedback.TA,
                TR: tasks.find((task) => task.taskNumber === 2)?.perCriteriaFeedback.TR,
                CC: buildCombinedFeedback(tasks, (task) => task.perCriteriaFeedback.CC),
                LR: buildCombinedFeedback(tasks, (task) => task.perCriteriaFeedback.LR),
                GRA: buildCombinedFeedback(tasks, (task) => task.perCriteriaFeedback.GRA),
            },
        },
    };
}

function buildCompatibilityAnnotationsFromPublished(
    publishedGrading: PublishedWritingGrading
): WritingAnnotation[] {
    return getSortedTaskMarkupStates(publishedGrading.perTask)
        .flatMap((task) => {
            const commentAnnotations = task.comments
                .filter((comment) => comment.status === 'active')
                .map((comment) => ({
                    id: comment.id,
                    taskNumber: task.taskNumber,
                    type: 'comment' as const,
                    startOffset: comment.from,
                    endOffset: comment.to,
                    color: comment.color,
                    categoryId: comment.categoryLabel,
                    categoryLabel: comment.categoryLabel,
                    commentText: comment.text,
                    createdAt: comment.createdAt,
                }));
            const correctionAnnotations = task.corrections.map((correction) => ({
                id: correction.id,
                taskNumber: task.taskNumber,
                type: 'correction' as const,
                startOffset: correction.from,
                endOffset: correction.to,
                color: '#818cf8',
                categoryId: 'correction',
                categoryLabel: 'Correction',
                correctionText: correction.correctionText,
                createdAt: correction.createdAt,
            }));

            return [...commentAnnotations, ...correctionAnnotations];
        });
}

function buildAuditScoreSnapshot(
    publishedGrading: PublishedWritingGrading | null
): WritingGradingAudit['previousScores'] {
    const taskResults = publishedGrading
        ? buildTaskGradingResultsFromMarkup(publishedGrading.perTask)
        : [];

    return {
        overallBand: publishedGrading?.overallBand ?? 0,
        perTask: taskResults.map((task) => ({
            taskNumber: task.taskNumber,
            criteriaScores: Object.entries(task.criteriaScores).reduce<Record<string, number>>((accumulator, [key, value]) => {
                if (typeof value === 'number') {
                    accumulator[key] = value;
                }
                return accumulator;
            }, {}),
            taskBand: task.taskBand,
            isVoided: task.isVoided,
        })),
    };
}

function calculatePublishedOverallBand(
    submission: WritingSubmission,
    perTask: Partial<Record<1 | 2, WritingTaskMarkupState>>
): number {
    const taskResults = buildTaskGradingResultsFromMarkup(perTask)
        .filter((task) => task.isVoided || task.taskBand > 0);

    if (taskResults.length === 0) {
        return 0;
    }

    return calculateOverallBand(taskResults, submission.testMeta.format);
}

function buildDraftReadinessTasks(
    submission: WritingSubmission,
    draft: WritingGradingDraft,
): WritingReadinessTaskInput[] {
    return submission.tasks.map((task) => {
        const taskState = draft.perTask[task.taskNumber];

        return {
            taskNumber: task.taskNumber,
            isVoided: taskState?.isVoided ?? false,
            responseScore: task.taskNumber === 1 ? taskState?.criteriaScores.TA : taskState?.criteriaScores.TR,
            ccScore: taskState?.criteriaScores.CC,
            lrScore: taskState?.criteriaScores.LR,
            graScore: taskState?.criteriaScores.GRA,
            summaryHtml: taskState?.taskSummary || '',
            hasPendingCommentDraft: Boolean(draft.pendingCommentDrafts?.[task.taskNumber]),
        };
    });
}

function buildDerivedOverallSummaryFromTasks(
    submission: WritingSubmission,
    perTask: Partial<Record<1 | 2, WritingTaskMarkupState>>,
): string {
    return submission.tasks
        .map((task) => perTask[task.taskNumber])
        .filter((taskState): taskState is WritingTaskMarkupState => Boolean(taskState && !taskState.isVoided && isMeaningfulHtml(taskState.taskSummary)))
        .sort((left, right) => left.taskNumber - right.taskNumber)
        .map((taskState) => `<p><strong>Task ${taskState.taskNumber} Summary</strong></p>${taskState.taskSummary}`)
        .join('');
}

async function persistPublishedWritingProjection(
    submission: WritingSubmission,
    publishedGrading: PublishedWritingGrading
): Promise<void> {
    const normalizedPublishedGrading = normalizePublishedWritingGrading(publishedGrading) ?? publishedGrading;
    const compatibilityGrading = buildCompatibilityGradingFromPublished(normalizedPublishedGrading);
    const annotations = buildCompatibilityAnnotationsFromPublished(normalizedPublishedGrading);
    const submissionRef = getSubmissionRef(submission.id);

    await updateDoc(submissionRef, deepRemoveUndefined({
        grading: compatibilityGrading,
        annotations,
        markingStatus: 'graded',
        gradingDraftMeta: null,
    }));

    const projectedSubmission: WritingSubmission = {
        ...submission,
        markingStatus: 'graded',
        publishedGrading: normalizedPublishedGrading,
        grading: compatibilityGrading,
        annotations,
        gradingDraftMeta: null,
    };

    const academicContext = extractAcademicContext(projectedSubmission.context as Record<string, any>);
    const resultContext = mapSubmissionContextToResultContext(projectedSubmission);
    const existingResultRecord = await readExistingWritingResultRecord(projectedSubmission.id);
    const baseResultRecord = existingResultRecord
        ? existingResultRecord
        : buildWritingResultRecord({
            resultId: projectedSubmission.id,
            sessionCode: projectedSubmission.context.sessionCode,
            testId: projectedSubmission.testMeta.testId,
            studentId: projectedSubmission.studentId,
            studentName: projectedSubmission.studentName,
            testTitle: projectedSubmission.testMeta.testTitle,
            testType: mapSubmissionContextTypeToResultTestType(projectedSubmission.context.type),
            testDuration: projectedSubmission.testMeta.duration,
            submittedAt: projectedSubmission.submittedAt,
            timeElapsed: projectedSubmission.totalElapsedTimeSeconds,
            tasks: projectedSubmission.tasks,
            markingStatus: 'graded',
            overallBand: publishedGrading.overallBand,
            academicContext,
            context: resultContext,
        });

    const syncedResultRecord = deepRemoveUndefined({
        ...baseResultRecord,
        bandScore: normalizedPublishedGrading.overallBand,
        overallFeedback: normalizedPublishedGrading.overallSummary || null,
        feedbackUpdatedAt: normalizedPublishedGrading.updatedAt,
        feedbackUpdatedBy: normalizedPublishedGrading.teacherId,
        feedbackUpdatedByTeacherId: normalizedPublishedGrading.teacherId,
        feedbackUpdatedByTeacherName: normalizedPublishedGrading.teacherName,
        updatedAt: normalizedPublishedGrading.updatedAt,
        markingStatus: 'graded',
        context: baseResultRecord.context || resultContext,
        writingData: {
            ...(baseResultRecord.writingData || {}),
            submissionId: projectedSubmission.id,
            overallBand: normalizedPublishedGrading.overallBand,
            markingStatus: 'graded',
            tasks: toWritingTaskIndex(projectedSubmission.tasks),
        },
        writingSubmission: baseResultRecord.writingSubmission || buildWritingSubmissionPreview(projectedSubmission.tasks),
    });

    await persistWritingResultRecord(syncedResultRecord, {
        resultId: projectedSubmission.id,
        studentId: projectedSubmission.studentId,
        studentName: projectedSubmission.studentName,
        sessionCode: projectedSubmission.context.sessionCode,
        academicContext,
    });
}

async function persistWritingResultRecord(
    resultRecord: Record<string, any>,
    {
        resultId,
        studentId,
        studentName,
        sessionCode,
        academicContext,
    }: PersistWritingResultOptions
): Promise<void> {
    const visibilityResolution = await resolveResultOwnership({
        result: resultRecord,
        context: resultRecord.context as ResultContext | undefined,
        sessionCode: sessionCode ?? resultRecord.sessionCode ?? null,
        classId: academicContext?.classId ?? resultRecord.classId ?? null,
        courseId: academicContext?.courseId ?? resultRecord.courseId ?? null,
        homeworkId: resultRecord.context?.assignment?.homeworkId ?? null,
        writingSubmissionId: resultId,
        sourceNameSnapshot: resultRecord.testTitle ?? null,
    });

    const normalizedResultRecord = deepRemoveUndefined({
        ...resultRecord,
        visibility: visibilityResolution.visibility,
    });

    const effectiveSessionCode = sessionCode ?? normalizedResultRecord.sessionCode;
    const submittedAt =
        typeof normalizedResultRecord.submittedAt === 'number'
            ? normalizedResultRecord.submittedAt
            : Date.now();
    const percentage =
        typeof normalizedResultRecord.percentage === 'number'
            ? normalizedResultRecord.percentage
            : 0;
    const bandScore =
        typeof normalizedResultRecord.bandScore === 'number'
            ? normalizedResultRecord.bandScore
            : 0;
    const testTitle =
        typeof normalizedResultRecord.testTitle === 'string'
            ? normalizedResultRecord.testTitle
            : '';
    const markingStatus =
        typeof normalizedResultRecord.markingStatus === 'string'
            ? normalizedResultRecord.markingStatus
            : 'pending-review';

    const rootResultPath = `test_results/${resultId}`;
    const indexUpdates: Record<string, any> = {
        [`test_results_by_student/${studentId}/${resultId}`]: normalizedResultRecord,
    };

    if (effectiveSessionCode) {
        indexUpdates[`test_results_by_session/${effectiveSessionCode}/${resultId}`] = {
            resultId,
            studentId,
            studentName,
            percentage,
            bandScore,
            submittedAt,
            markingStatus,
            testTitle,
        };
    }

    const visibilityOwnerTeacherId = visibilityResolution.visibility.visibilityOwnerTeacherId;
    const teacherIndexOwnerId =
        visibilityResolution.visibility.ownershipResolved
        && visibilityOwnerTeacherId
            ? visibilityOwnerTeacherId
            : null;
    if (teacherIndexOwnerId) {
        indexUpdates[`test_results_by_teacher/${teacherIndexOwnerId}/${resultId}`] = {
            resultId,
            sessionCode: effectiveSessionCode ?? null,
            studentId,
            studentName,
            percentage,
            bandScore,
            submittedAt,
            markingStatus,
            testTitle,
            isGuest: false,
        };
    }

    if (
        visibilityResolution.visibility.ownershipResolved
        && visibilityResolution.visibility.contextType === 'solo_practice'
    ) {
        indexUpdates[`test_results_solo_practice_by_student/${studentId}/${resultId}`] = {
            resultId,
            sessionCode: effectiveSessionCode ?? null,
            testId: normalizedResultRecord.testId,
            percentage,
            submittedAt,
        };
    }

    const canWriteScopedIndexes = isScopedIndexBackfillEligible(normalizedResultRecord);
    const canonicalCourseId = getCanonicalCourseIndexId(normalizedResultRecord);
    const canonicalClassId = getCanonicalClassIndexId(normalizedResultRecord);
    const scopedModuleId =
        normalizedResultRecord.moduleId
        ?? academicContext?.moduleId
        ?? null;
    const scopedCourseId =
        canonicalCourseId
        ?? normalizedResultRecord.courseId
        ?? academicContext?.courseId
        ?? null;

    if (canWriteScopedIndexes && canonicalCourseId) {
        indexUpdates[`test_results_by_course/${canonicalCourseId}/${studentId}/${resultId}`] = {
            resultId,
            studentId,
            studentName,
            percentage,
            bandScore,
            testTitle,
            testSkill: 'writing',
            submittedAt,
            moduleId: scopedModuleId,
            markingStatus,
        };
    }

    if (canWriteScopedIndexes && canonicalClassId) {
        indexUpdates[`test_results_by_class/${canonicalClassId}/${studentId}/${resultId}`] = {
            resultId,
            studentId,
            studentName,
            percentage,
            bandScore,
            testTitle,
            testSkill: 'writing',
            submittedAt,
            courseId: scopedCourseId,
            markingStatus,
        };
    }

    // Several RTDB index rules validate against the canonical root result row.
    // Write that row first so fan-out writes can satisfy those permission checks.
    await set(ref(database, rootResultPath), normalizedResultRecord);

    if (Object.keys(indexUpdates).length > 0) {
        await update(ref(database), deepRemoveUndefined(indexUpdates));
    }

    try {
        if (visibilityResolution.visibility.ownershipResolved) {
            await clearUnresolvedResultVisibilityReport(resultId);
            return;
        }

        const unresolvedEntry = buildUnresolvedResultVisibilityReportEntry({
            resultId,
            studentId,
            visibility: visibilityResolution.visibility,
            sourceLookupAttempted: visibilityResolution.sourceLookupAttempted,
            strongestKnownSourceClue: visibilityResolution.strongestKnownSourceClue,
        });
        await upsertUnresolvedResultVisibilityReport({
            resultId,
            studentId,
            visibility: visibilityResolution.visibility,
            sourceLookupAttempted: visibilityResolution.sourceLookupAttempted,
            strongestKnownSourceClue: visibilityResolution.strongestKnownSourceClue,
            existingCreatedAt: unresolvedEntry.createdAt,
        });
    } catch (error) {
        console.warn('[WritingSubmission] Non-blocking unresolved visibility report sync failed', error);
    }
}

// ═══════════════════════════════════════════════════════════════
// SUBMISSION CRUD
// ═══════════════════════════════════════════════════════════════

/**
 * Create a new writing submission in Firestore.
 */
export const createSubmission = withRestoreGuard<{ success: boolean; error?: string }>(
    'WritingSubmissionCreate',
    { success: false, error: 'Blocked by restore guard' }
)(async (
    data: WritingSubmission
): Promise<{ success: boolean; error?: string }> => {
    try {
        const sanitized = deepRemoveUndefined(data);
        await setDoc(doc(db, SUBMISSIONS_COLLECTION, data.id), sanitized);
        console.log('✅ Writing submission created:', data.id);
        return { success: true };
    } catch (error) {
        console.error('❌ Failed to create writing submission:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to create submission',
        };
    }
});

export const materializeSubmissionResult = withRestoreGuard<{ success: boolean; error?: string }>(
    'WritingResultMaterialize',
    { success: false, error: 'Blocked by restore guard' }
)(async (submission: WritingSubmission): Promise<{ success: boolean; error?: string }> => {
    try {
        const academicContext = extractAcademicContext(submission.context as Record<string, any>);
        const resultContext = mapSubmissionContextToResultContext(submission);
        const resultRecord = buildWritingResultRecord({
            resultId: submission.id,
            sessionCode: submission.context.sessionCode,
            testId: submission.testMeta.testId,
            studentId: submission.studentId,
            studentName: submission.studentName,
            testTitle: submission.testMeta.testTitle,
            testType: mapSubmissionContextTypeToResultTestType(submission.context.type),
            testDuration: submission.testMeta.duration,
            submittedAt: submission.submittedAt,
            timeElapsed: submission.totalElapsedTimeSeconds,
            tasks: submission.tasks,
            markingStatus: submission.markingStatus,
            overallBand: submission.publishedGrading?.overallBand ?? submission.grading?.overallBand ?? null,
            academicContext,
            context: resultContext,
        });

        await persistWritingResultRecord(resultRecord, {
            resultId: submission.id,
            studentId: submission.studentId,
            studentName: submission.studentName,
            sessionCode: submission.context.sessionCode,
            academicContext,
        });

        return { success: true };
    } catch (error) {
        console.error('❌ Failed to materialize writing result:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to materialize writing result',
        };
    }
});

/**
 * Get a writing submission by ID.
 */
export async function getSubmission(
    submissionId: string
): Promise<{ success: boolean; data?: WritingSubmission; error?: string }> {
    try {
        const snap = await getDoc(doc(db, SUBMISSIONS_COLLECTION, submissionId));
        if (!snap.exists()) {
            return { success: false, error: 'Submission not found' };
        }
        return { success: true, data: snap.data() as WritingSubmission };
    } catch (error) {
        console.error('❌ Failed to get submission:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get submission',
        };
    }
}

export async function getWritingSubmissionForGrading(
    submissionId: string,
    teacherId?: string
): Promise<{ success: boolean; data?: WritingSubmissionForGrading; error?: string }> {
    try {
        const [submissionSnap, draftSnap] = await Promise.all([
            getDoc(getSubmissionRef(submissionId)),
            getDoc(getGradingDraftRef(submissionId)),
        ]);

        if (!submissionSnap.exists()) {
            return { success: false, error: 'Submission not found' };
        }

        const submission = submissionSnap.data() as WritingSubmission;
        const draft = draftSnap.exists()
            ? (draftSnap.data() as WritingGradingDraft)
            : null;
        const normalizedPublishedGrading = getCurrentPublishedGrading(submission);
        const normalizedDraft = normalizeWritingGradingDraft(draft);

        return {
            success: true,
            data: {
                submission,
                publishedGrading: normalizedPublishedGrading,
                gradingDraft: normalizedDraft && teacherId && normalizedDraft.ownerTeacherId !== teacherId ? null : normalizedDraft,
            },
        };
    } catch (error) {
        console.error('Failed to get writing submission for grading:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to load grading submission',
        };
    }
}

export const saveGradingDraft = withRestoreGuard<{
    success: boolean;
    data?: WritingGradingDraft;
    error?: string;
}>(
    'WritingGradingDraftSave',
    { success: false, error: 'Blocked by restore guard' }
)(async (
    submissionId: string,
    draft: WritingGradingDraft,
    options: DraftWriteOptions = {}
): Promise<{ success: boolean; data?: WritingGradingDraft; error?: string }> => {
    try {
        const [submissionSnap, currentDraftSnap] = await Promise.all([
            getDoc(getSubmissionRef(submissionId)),
            getDoc(getGradingDraftRef(submissionId)),
        ]);

        if (!submissionSnap.exists()) {
            return { success: false, error: 'Submission not found' };
        }

        const submission = submissionSnap.data() as WritingSubmission;
        const currentDraft = currentDraftSnap.exists()
            ? (currentDraftSnap.data() as WritingGradingDraft)
            : null;
        const currentPublishedVersion = getCurrentPublishedVersion(submission);

        if (
            typeof options.expectedPublishedVersion === 'number'
            && currentPublishedVersion !== options.expectedPublishedVersion
        ) {
            return { success: false, error: 'A newer published grading already exists' };
        }

        if (
            typeof options.expectedDraftVersion === 'number'
            && (currentDraft?.version ?? 0) !== options.expectedDraftVersion
        ) {
            return { success: false, error: 'A newer grading draft already exists' };
        }

        if (currentDraft && currentDraft.ownerTeacherId !== draft.ownerTeacherId) {
            return { success: false, error: 'Another teacher owns the current grading draft' };
        }

        const now = Date.now();
        const normalizedInputDraft = normalizeWritingGradingDraft(draft) ?? draft;
        const nextDraft: WritingGradingDraft = deepRemoveUndefined({
            ...normalizedInputDraft,
            submissionId,
            version: (currentDraft?.version ?? 0) + 1,
            basedOnPublishedVersion: currentPublishedVersion,
            createdAt: currentDraft?.createdAt ?? normalizedInputDraft.createdAt ?? now,
            updatedAt: now,
        }) as WritingGradingDraft;

        await setDoc(getGradingDraftRef(submissionId), nextDraft);
        await updateDoc(getSubmissionRef(submissionId), {
            gradingDraftMeta: {
                ownerTeacherId: nextDraft.ownerTeacherId,
                ownerTeacherName: nextDraft.ownerTeacherName,
                version: nextDraft.version,
                basedOnPublishedVersion: nextDraft.basedOnPublishedVersion,
                updatedAt: nextDraft.updatedAt,
            },
        });

        return { success: true, data: nextDraft };
    } catch (error) {
        console.error('Failed to save grading draft:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to save grading draft',
        };
    }
});

export const projectPublishedWritingResult = withRestoreGuard<{
    success: boolean;
    error?: string;
}>(
    'WritingPublishedProjectionSync',
    { success: false, error: 'Blocked by restore guard' }
)(async (
    submissionId: string,
    publishedGrading?: PublishedWritingGrading
): Promise<{ success: boolean; error?: string }> => {
    try {
        const submissionSnap = await getDoc(getSubmissionRef(submissionId));
        if (!submissionSnap.exists()) {
            return { success: false, error: 'Submission not found' };
        }

        const submission = submissionSnap.data() as WritingSubmission;
        const gradingToProject = publishedGrading ?? submission.publishedGrading;
        if (!gradingToProject) {
            return { success: false, error: 'Published grading not found' };
        }

        await persistPublishedWritingProjection(submission, gradingToProject);
        return { success: true };
    } catch (error) {
        console.error('Failed to project published writing result:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to sync published writing result',
        };
    }
});

export const publishGrading = withRestoreGuard<{
    success: boolean;
    data?: PublishedWritingGrading;
    error?: string;
}>(
    'WritingGradingPublish',
    { success: false, error: 'Blocked by restore guard' }
)(async (
    submissionId: string,
    draft: WritingGradingDraft,
    options: PublishGradingOptions = {}
): Promise<{ success: boolean; data?: PublishedWritingGrading; error?: string }> => {
    try {
        const [submissionSnap, currentDraftSnap] = await Promise.all([
            getDoc(getSubmissionRef(submissionId)),
            getDoc(getGradingDraftRef(submissionId)),
        ]);

        if (!submissionSnap.exists()) {
            return { success: false, error: 'Submission not found' };
        }

        const submission = submissionSnap.data() as WritingSubmission;
        const currentPublished = getCurrentPublishedGrading(submission);
        const currentPublishedVersion = getCurrentPublishedVersion(submission);
        const currentDraft = currentDraftSnap.exists()
            ? (currentDraftSnap.data() as WritingGradingDraft)
            : null;
        const normalizedInputDraft = normalizeWritingGradingDraft(draft) ?? draft;

        if (
            typeof options.expectedPublishedVersion === 'number'
            && currentPublishedVersion !== options.expectedPublishedVersion
        ) {
            return { success: false, error: 'A newer published grading already exists' };
        }

        if (
            typeof options.expectedDraftVersion === 'number'
            && (currentDraft?.version ?? 0) !== options.expectedDraftVersion
        ) {
            return { success: false, error: 'A newer grading draft already exists' };
        }

        if (currentDraft && currentDraft.ownerTeacherId !== normalizedInputDraft.ownerTeacherId) {
            return { success: false, error: 'Another teacher owns the current grading draft' };
        }

        for (const task of submission.tasks) {
            if (!normalizedInputDraft.perTask[task.taskNumber]) {
                return { success: false, error: `Task ${task.taskNumber} is missing grading data` };
            }
        }

        const submissionReadiness = evaluateWritingSubmissionReadiness(buildDraftReadinessTasks(submission, normalizedInputDraft));
        if (!submissionReadiness.canPublish) {
            return {
                success: false,
                error: submissionReadiness.firstBlockingReason || 'Draft is not ready for publishing',
            };
        }

        const now = Date.now();
        const auditVersion = currentPublishedVersion + 1;
        const derivedOverallSummary = normalizedInputDraft.overallSummary?.trim()
            || buildDerivedOverallSummaryFromTasks(submission, normalizedInputDraft.perTask);
        const publishedGrading: PublishedWritingGrading = deepRemoveUndefined({
            teacherId: normalizedInputDraft.ownerTeacherId,
            teacherName: normalizedInputDraft.ownerTeacherName,
            gradedAt: now,
            updatedAt: now,
            overallBand: calculatePublishedOverallBand(submission, normalizedInputDraft.perTask),
            overallSummary: derivedOverallSummary,
            auditVersion,
            perTask: normalizedInputDraft.perTask,
        }) as PublishedWritingGrading;

        const auditEntry: WritingGradingAudit = {
            version: auditVersion,
            gradedAt: now,
            teacherId: normalizedInputDraft.ownerTeacherId,
            teacherName: normalizedInputDraft.ownerTeacherName,
            action: currentPublished ? 'regraded' : 'published',
            reason: options.reason || (currentPublished ? 'Regraded submission' : 'Initial publish'),
            previousScores: buildAuditScoreSnapshot(currentPublished),
        };

        await updateDoc(getSubmissionRef(submissionId), deepRemoveUndefined({
            publishedGrading,
            markingStatus: 'graded',
            gradingDraftMeta: null,
            auditTrail: [...(submission.auditTrail || []), auditEntry],
        }));
        await deleteDoc(getGradingDraftRef(submissionId)).catch(() => undefined);

        const updatedSubmission: WritingSubmission = {
            ...submission,
            publishedGrading,
            markingStatus: 'graded',
            gradingDraftMeta: null,
            auditTrail: [...(submission.auditTrail || []), auditEntry],
        };

        await persistPublishedWritingProjection(updatedSubmission, publishedGrading);

        if (submission.context?.homeworkSubmissionId) {
            await markHomeworkSubmissionGraded(submission.context.homeworkSubmissionId, {
                bandScore: publishedGrading.overallBand,
            });
        }

        if (!options.skipNotification) {
            await notifyWritingGraded(
                submission.studentId,
                submission.id,
                submission.testMeta.testTitle,
                publishedGrading.overallBand,
                publishedGrading.teacherName
            ).catch((error) => {
                console.warn('[WritingSubmission] Non-blocking writing graded notification failed', error);
            });
        }

        return { success: true, data: publishedGrading };
    } catch (error) {
        console.error('Failed to publish grading:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to publish grading',
        };
    }
});

export const discardPrivateDraft = withRestoreGuard<{
    success: boolean;
    error?: string;
}>(
    'WritingGradingDraftDiscard',
    { success: false, error: 'Blocked by restore guard' }
)(async (
    submissionId: string,
    options: DiscardDraftOptions
): Promise<{ success: boolean; error?: string }> => {
    try {
        const [submissionSnap, draftSnap] = await Promise.all([
            getDoc(getSubmissionRef(submissionId)),
            getDoc(getGradingDraftRef(submissionId)),
        ]);

        if (!submissionSnap.exists()) {
            return { success: false, error: 'Submission not found' };
        }

        if (!draftSnap.exists()) {
            await updateDoc(getSubmissionRef(submissionId), { gradingDraftMeta: null });
            return { success: true };
        }

        const submission = submissionSnap.data() as WritingSubmission;
        const currentPublished = getCurrentPublishedGrading(submission);
        const auditEntry: WritingGradingAudit = {
            version: getCurrentPublishedVersion(submission),
            gradedAt: Date.now(),
            teacherId: options.actorTeacherId,
            teacherName: options.actorTeacherName,
            action: 'discarded-draft',
            reason: options.reason,
            previousScores: buildAuditScoreSnapshot(currentPublished),
        };

        await updateDoc(getSubmissionRef(submissionId), {
            gradingDraftMeta: null,
            auditTrail: [...(submission.auditTrail || []), auditEntry],
        });
        await deleteDoc(getGradingDraftRef(submissionId));

        return { success: true };
    } catch (error) {
        console.error('Failed to discard private grading draft:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to discard grading draft',
        };
    }
});

/**
 * Update grading data on a submission.
 */
export const updateGrading = withRestoreGuard<{ success: boolean; error?: string }>(
    'WritingGradingUpdate',
    { success: false, error: 'Blocked by restore guard' }
)(async (
    submissionId: string,
    gradingResult: WritingGradingResult,
    annotations: WritingAnnotation[],
    options: UpdateGradingOptions = {}
): Promise<{ success: boolean; error?: string }> => {
    try {
        const submissionRef = doc(db, SUBMISSIONS_COLLECTION, submissionId);
        const submissionSnap = await getDoc(submissionRef);
        if (!submissionSnap.exists()) {
            return { success: false, error: 'Submission not found' };
        }

        const submission = submissionSnap.data() as WritingSubmission;
        const nextMarkingStatus = options.markingStatus || 'graded';
        const shouldSyncResultRecord = options.syncResultRecord ?? nextMarkingStatus === 'graded';
        const sanitized = deepRemoveUndefined({
            grading: gradingResult,
            annotations,
            markingStatus: nextMarkingStatus,
        });
        await updateDoc(submissionRef, sanitized);

        if (!shouldSyncResultRecord) {
            console.log('✅ Writing grading draft saved:', submissionId);
            return { success: true };
        }

        const sessionCode = submission.context?.sessionCode;
        const [existingResultRecord, sessionSnapshot] = await Promise.all([
            readExistingWritingResultRecord(submissionId),
            sessionCode ? get(ref(database, `game_sessions/${sessionCode}`)) : Promise.resolve(null as any),
        ]);

        const sessionData = sessionSnapshot?.exists?.() ? sessionSnapshot.val() : null;
        const academicContext =
            extractAcademicContext(existingResultRecord)
            || extractAcademicContext(sessionData);
        const writingResultContext = mapSubmissionContextToResultContext(submission);

        const baseResultRecord = existingResultRecord
            ? existingResultRecord
            : buildWritingResultRecord({
                resultId: submissionId,
                sessionCode,
                testId: submission.testMeta.testId,
                studentId: submission.studentId,
                studentName: submission.studentName,
                testTitle: submission.testMeta.testTitle,
                testType: submission.context?.type === 'homework'
                    ? 'homework'
                    : submission.context?.type === 'solo-practice'
                        ? 'practice'
                        : 'test',
                testDuration: submission.testMeta.duration,
                submittedAt: submission.submittedAt,
                timeElapsed: submission.totalElapsedTimeSeconds,
                tasks: submission.tasks,
                markingStatus: 'pending-review',
                overallBand: null,
                academicContext,
                context: writingResultContext,
            });

        const graderId = gradingResult.teacherId || null;
        const feedbackUpdatedAt = Date.now();
        const syncedResultRecord = deepRemoveUndefined({
            ...baseResultRecord,
            bandScore: gradingResult.overallBand,
            markingStatus: nextMarkingStatus,
            updatedAt: feedbackUpdatedAt,
            overallFeedback: gradingResult.feedback?.overall || null,
            feedbackUpdatedAt,
            feedbackUpdatedBy: graderId,
            feedbackUpdatedByTeacherId: graderId,
            feedbackUpdatedByTeacherName: gradingResult.teacherName || null,
            context: baseResultRecord.context || writingResultContext,
            writingData: {
                ...(baseResultRecord.writingData || {}),
                submissionId,
                overallBand: gradingResult.overallBand,
                markingStatus: nextMarkingStatus,
                tasks: toWritingTaskIndex(submission.tasks),
            },
            writingSubmission: baseResultRecord.writingSubmission || buildWritingSubmissionPreview(submission.tasks),
        });

        await persistWritingResultRecord(syncedResultRecord, {
            resultId: submissionId,
            studentId: submission.studentId,
            studentName: submission.studentName,
            sessionCode,
            academicContext,
        });

        if (nextMarkingStatus === 'graded' && submission.context?.homeworkSubmissionId) {
            await markHomeworkSubmissionGraded(submission.context.homeworkSubmissionId, {
                bandScore: gradingResult.overallBand,
            });
        }

        console.log('✅ Writing grading updated:', submissionId);
        return { success: true };
    } catch (error) {
        console.error('❌ Failed to update grading:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to update grading',
        };
    }
});

/**
 * Get pending submissions for a teacher.
 * [GAP-04] Uses ONLY markingStatus filter in Firestore query,
 * then filters client-side for teacher ownership to avoid composite index requirement.
 */
export async function getPendingSubmissions(
    teacherId: string
): Promise<{ success: boolean; data?: WritingSubmission[]; error?: string }> {
    try {
        const q = query(
            collection(db, SUBMISSIONS_COLLECTION),
            where('markingStatus', '==', 'pending-review')
        );
        const snap = await getDocs(q);
        const all: WritingSubmission[] = [];

        snap.forEach((docSnap) => {
            all.push(docSnap.data() as WritingSubmission);
        });

        // Client-side filter for teacher assignment metadata only.
        const filtered = all.filter(s =>
            s.context?.assigningTeacherId === teacherId ||
            s.context?.selectedTeacherId === teacherId
        );

        return { success: true, data: filtered };
    } catch (error) {
        console.error('❌ Failed to get pending submissions:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get pending submissions',
        };
    }
}

/**
 * Get all submissions for a student.
 */
export async function getSubmissionsForStudent(
    studentId: string
): Promise<{ success: boolean; data?: WritingSubmission[]; error?: string }> {
    try {
        const q = query(
            collection(db, SUBMISSIONS_COLLECTION),
            where('studentId', '==', studentId),
            orderBy('submittedAt', 'desc')
        );
        const snap = await getDocs(q);
        const submissions: WritingSubmission[] = [];

        snap.forEach((docSnap) => {
            submissions.push(docSnap.data() as WritingSubmission);
        });

        return { success: true, data: submissions };
    } catch (error) {
        console.error('❌ Failed to get student submissions:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get student submissions',
        };
    }
}

/**
 * Get all submissions for a specific session code.
 * Used by TeacherTestResultsPage when viewing writing test results.
 */
export async function getSubmissionsBySession(
    sessionCode: string
): Promise<{ success: boolean; data?: WritingSubmission[]; error?: string }> {
    try {
        const q = query(
            collection(db, SUBMISSIONS_COLLECTION),
            where('context.sessionCode', '==', sessionCode),
            orderBy('submittedAt', 'desc')
        );
        const snap = await getDocs(q);
        const submissions: WritingSubmission[] = [];

        snap.forEach((docSnap) => {
            submissions.push(docSnap.data() as WritingSubmission);
        });

        return { success: true, data: submissions };
    } catch (error) {
        console.error('❌ Failed to get session submissions:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get session submissions',
        };
    }
}

// ═══════════════════════════════════════════════════════════════
// AUTO-SUBMIT FROM RTDB
// [GAP-14] Standalone function used by both WritingTestPage and 
// TeacherTestMonitorPage for end-session auto-submit.
// ═══════════════════════════════════════════════════════════════

/**
 * Auto-submit a student's writing from RTDB data.
 * Reads the latest essay text from RTDB and creates a Firestore submission + RTDB result.
 * 
 * Called by:
 * - WritingTestPage (normal submit + timer expiry)
 * - TeacherTestMonitorPage (end-session auto-submit for students who haven't submitted)
 */
function isRecordLike(value: unknown): value is Record<string, any> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function matchesWritingRealtimeTarget(
    key: string,
    value: unknown,
    knownResultIds: Set<string>
): boolean {
    if (knownResultIds.has(key)) {
        return true;
    }

    if (!isRecordLike(value)) {
        return false;
    }

    const candidateIds = [
        value.resultId,
        value.submissionId,
        value.writingData?.submissionId,
    ].filter((candidate): candidate is string => typeof candidate === 'string');

    if (candidateIds.some((candidate) => knownResultIds.has(candidate))) {
        return true;
    }

    return value.testSkill === 'writing' || Boolean(value.writingData) || Boolean(value.writingSubmission);
}

function collectRealtimePaths(
    rootPath: string,
    value: unknown,
    knownResultIds: Set<string>,
    paths: Set<string>,
    segments: string[] = []
): void {
    if (!isRecordLike(value)) {
        return;
    }

    for (const [key, childValue] of Object.entries(value)) {
        const nextSegments = [...segments, key];
        const nextPath = `${rootPath}/${nextSegments.join('/')}`;

        if (matchesWritingRealtimeTarget(key, childValue, knownResultIds)) {
            paths.add(nextPath);
            continue;
        }

        collectRealtimePaths(rootPath, childValue, knownResultIds, paths, nextSegments);
    }
}

async function listCollectionDocumentIds(collectionName: string): Promise<string[]> {
    const snapshot = await getDocs(collection(db, collectionName));
    return snapshot.docs.map((docSnap) => docSnap.id);
}

export async function planWritingDataReset(): Promise<{
    success: boolean;
    data?: WritingDataResetPlan;
    error?: string;
}> {
    try {
        const [submissionIds, authoringDraftIds, gradingDraftIds, testResultsSnapshot] = await Promise.all([
            listCollectionDocumentIds(SUBMISSIONS_COLLECTION),
            listCollectionDocumentIds(AUTHORING_DRAFTS_COLLECTION),
            listCollectionDocumentIds(GRADING_DRAFTS_COLLECTION).catch(() => []),
            get(ref(database, 'test_results')),
        ]);

        const knownResultIds = new Set<string>(submissionIds);
        if (testResultsSnapshot.exists()) {
            const rootResults = testResultsSnapshot.val() as Record<string, any>;
            for (const [resultId, resultRecord] of Object.entries(rootResults)) {
                if (matchesWritingRealtimeTarget(resultId, resultRecord, knownResultIds)) {
                    knownResultIds.add(resultId);
                }
            }
        }

        const realtimePaths = new Set<string>();
        for (const rootPath of WRITING_RESET_RTDB_ROOTS) {
            const snapshot = await get(ref(database, rootPath));
            if (!snapshot.exists()) {
                continue;
            }

            collectRealtimePaths(rootPath, snapshot.val(), knownResultIds, realtimePaths);
        }

        return {
            success: true,
            data: {
                firestoreCollections: [
                    {
                        collection: SUBMISSIONS_COLLECTION,
                        count: submissionIds.length,
                        ids: submissionIds,
                    },
                    {
                        collection: AUTHORING_DRAFTS_COLLECTION,
                        count: authoringDraftIds.length,
                        ids: authoringDraftIds,
                    },
                    {
                        collection: GRADING_DRAFTS_COLLECTION,
                        count: gradingDraftIds.length,
                        ids: gradingDraftIds,
                    },
                ],
                realtimeDatabasePaths: [...realtimePaths].sort(),
            },
        };
    } catch (error) {
        console.error('Failed to plan writing data reset:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to plan writing data reset',
        };
    }
}

export const executeWritingDataReset = withRestoreGuard<{
    success: boolean;
    data?: WritingDataResetPlan;
    error?: string;
}>(
    'WritingDataResetExecute',
    { success: false, error: 'Blocked by restore guard' }
)(async (
    plan?: WritingDataResetPlan
): Promise<{ success: boolean; data?: WritingDataResetPlan; error?: string }> => {
    try {
        const resolvedPlan = plan ?? (await planWritingDataReset()).data;
        if (!resolvedPlan) {
            return { success: false, error: 'Writing data reset plan could not be resolved' };
        }

        for (const firestoreCollection of resolvedPlan.firestoreCollections) {
            for (const documentId of firestoreCollection.ids) {
                await deleteDoc(doc(db, firestoreCollection.collection, documentId));
            }
        }

        if (resolvedPlan.realtimeDatabasePaths.length > 0) {
            const updates = resolvedPlan.realtimeDatabasePaths.reduce<Record<string, null>>((accumulator, path) => {
                accumulator[path] = null;
                return accumulator;
            }, {});

            await update(ref(database), updates);
        }

        return {
            success: true,
            data: resolvedPlan,
        };
    } catch (error) {
        console.error('Failed to execute writing data reset:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to execute writing data reset',
        };
    }
});

export const autoSubmitFromRTDB = withRestoreGuard(
    'WritingAutoSubmit',
    undefined as void
)(async (
    sessionCode: string,
    studentUid: string,
    studentName: string,
    testData: IELTSWritingTest,
    options?: {
        submittedBy?: WritingAutoSubmitSource;
    }
): Promise<void> => {
    try {
        // Read latest essay data from RTDB
        const writingRef = ref(database, `game_sessions/${sessionCode}/students/${studentUid}/writing`);
        const sessionRef = ref(database, `game_sessions/${sessionCode}`);
        const [writingSnap, sessionSnap] = await Promise.all([
            get(writingRef),
            get(sessionRef),
        ]);
        const writingData = writingSnap.val() || {};
        const sessionData = sessionSnap.exists() ? sessionSnap.val() : {};
        const existingResultId = typeof writingData.resultId === 'string' ? writingData.resultId : null;

        if (writingData.submitted === true && existingResultId) {
            const existingResultSnap = await get(ref(database, `test_results/${existingResultId}`));
            if (existingResultSnap.exists()) {
                console.log('ℹ️ Writing submission already materialized:', existingResultId);
                return;
            }
        }

        // Generate resultId using Firebase push ID
        const resultId = existingResultId || push(ref(database, 'test_results')).key;
        if (!resultId) {
            console.error('❌ Failed to generate resultId');
            return;
        }

        const submittedAt = typeof writingData.submittedAt === 'number'
            ? writingData.submittedAt
            : Date.now();

        // Build submission tasks from test data + RTDB essay data
        const submissionTasks = testData.tasks.map(task => {
            const rtdbTask = writingData[`task${task.taskNumber}`] || {};
            const essayText = rtdbTask.text || '';
            const wordCount = essayText.trim()
                ? essayText.trim().split(/\s+/).filter((w: string) => w.length > 0).length
                : 0;

            return {
                taskNumber: task.taskNumber,
                taskType: task.taskType,
                promptText: task.promptText,
                promptImageUrl: task.promptImageUrl,
                wordMinimum: task.wordMinimum,
                essayText,
                wordCount,
                activeTimeSeconds: rtdbTask.activeTimeSeconds || 0,
            };
        });

        // Create Firestore submission
        const submission: WritingSubmission = {
            id: resultId,
            studentId: studentUid,
            studentName,
            context: {
                type: 'live-session',
                sessionCode,
                assigningTeacherId: getPreferredTeacherId(
                    sessionData?.createdByUserId,
                    testData.createdBy,
                    testData.ownerId,
                    sessionData?.createdBy
                ),
                classId: sessionData?.linkedClassId ?? sessionData?.classId,
                className: sessionData?.className,
                courseId: sessionData?.courseId,
                courseName: sessionData?.courseName,
                moduleId: sessionData?.moduleId,
                moduleName: sessionData?.moduleName,
            },
            testMeta: {
                testId: testData.id,
                testTitle: testData.metadata.title,
                format: testData.metadata.format,
                duration: testData.metadata.duration,
            },
            tasks: submissionTasks,
            submittedAt,
            totalElapsedTimeSeconds: writingData.totalElapsedTime || 0,
            pasteAttemptCount: writingData.pasteAttemptCount || 0,
            markingStatus: 'pending-review',
            annotations: [],
            auditTrail: [],
        };

        const sanitized = deepRemoveUndefined(submission);
        await setDoc(doc(db, SUBMISSIONS_COLLECTION, resultId), sanitized);
        const materializeResult = await materializeSubmissionResult(submission);
        if (!materializeResult.success) {
            console.error('❌ Failed to materialize writing auto-submit result:', materializeResult.error);
            return;
        }

        const playerExists = Boolean(sessionData?.players?.[studentUid]);
        const sessionUpdates: Record<string, any> = {
            [`game_sessions/${sessionCode}/students/${studentUid}/writing/submitted`]: true,
            [`game_sessions/${sessionCode}/students/${studentUid}/writing/submittedAt`]: submittedAt,
            [`game_sessions/${sessionCode}/students/${studentUid}/writing/resultId`]: resultId,
            [`game_sessions/${sessionCode}/students/${studentUid}/writing/reopened`]: false,
        };

        if (playerExists) {
            sessionUpdates[`game_sessions/${sessionCode}/players/${studentUid}/submittedAt`] = submittedAt;
            sessionUpdates[`game_sessions/${sessionCode}/players/${studentUid}/isSubmitted`] = true;
            sessionUpdates[`game_sessions/${sessionCode}/players/${studentUid}/hasSubmitted`] = true;
            sessionUpdates[`game_sessions/${sessionCode}/players/${studentUid}/hasCompletedTest`] = true;
            sessionUpdates[`game_sessions/${sessionCode}/players/${studentUid}/submittedBy`] = options?.submittedBy || 'student';
            sessionUpdates[`game_sessions/${sessionCode}/players/${studentUid}/latestResultId`] = resultId;
        }

        await update(ref(database), sessionUpdates);

        console.log('✅ Writing auto-submitted:', resultId, 'for student:', studentName);

        // Fire notification (non-blocking)
        notifyWritingSubmitted(
            studentUid,
            resultId,
            testData.metadata.title,
            'class-session'
        ).catch(err => console.warn('[autoSubmitFromRTDB] Notification failed:', err));
    } catch (error) {
        console.error('❌ Failed to auto-submit writing:', error);
    }
});

// Default export for convenience
const writingSubmissionService = {
    createSubmission,
    materializeSubmissionResult,
    getSubmission,
    getWritingSubmissionForGrading,
    saveGradingDraft,
    publishGrading,
    discardPrivateDraft,
    projectPublishedWritingResult,
    planWritingDataReset,
    executeWritingDataReset,
    updateGrading,
    getPendingSubmissions,
    getSubmissionsForStudent,
    getSubmissionsBySession,
    autoSubmitFromRTDB,
};

export default writingSubmissionService;
