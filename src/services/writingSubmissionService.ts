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
    collection,
    query,
    where,
    orderBy,
} from 'firebase/firestore';
import { ref, get, push, update } from 'firebase/database';
// @ts-ignore — JS service file
import { database, firestore as db } from './firebase';
import { deepRemoveUndefined } from './draftCloudService';
import { withRestoreGuard } from './restoreGuard';
import type {
    WritingSubmission,
    WritingGradingResult,
    WritingAnnotation,
    IELTSWritingTest,
} from '../types/ielts-writing.types';
import { notifyWritingSubmitted } from './notificationService';
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

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const SUBMISSIONS_COLLECTION = 'writing_submissions';

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

function mapSubmissionContextToResultContext(submission: WritingSubmission): ResultContext {
    const sourceName = submission.testMeta.testTitle;
    const timerMinutes = submission.testMeta.duration;

    if (submission.context.type === 'homework') {
        return {
            type: 'homework',
            source: {
                type: 'homework',
                id: submission.context.homeworkId ?? null,
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
                id: submission.context.sessionCode ?? null,
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

    const updates: Record<string, any> = {
        [`test_results/${resultId}`]: normalizedResultRecord,
        [`test_results_by_student/${studentId}/${resultId}`]: normalizedResultRecord,
    };

    if (effectiveSessionCode) {
        updates[`test_results_by_session/${effectiveSessionCode}/${resultId}`] = {
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
        updates[`test_results_by_teacher/${teacherIndexOwnerId}/${resultId}`] = {
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

    const canWriteScopedIndexes = isScopedIndexBackfillEligible(normalizedResultRecord);
    const canonicalCourseId = getCanonicalCourseIndexId(normalizedResultRecord);
    const canonicalClassId = getCanonicalClassIndexId(normalizedResultRecord);

    if (canWriteScopedIndexes && canonicalCourseId) {
        updates[`test_results_by_course/${canonicalCourseId}/${studentId}/${resultId}`] = {
            resultId,
            studentId,
            studentName,
            percentage,
            bandScore,
            testTitle,
            testSkill: 'writing',
            submittedAt,
            moduleId: academicContext.moduleId ?? null,
            markingStatus,
        };
    }

    if (canWriteScopedIndexes && canonicalClassId) {
        updates[`test_results_by_class/${canonicalClassId}/${studentId}/${resultId}`] = {
            resultId,
            studentId,
            studentName,
            percentage,
            bandScore,
            testTitle,
            testSkill: 'writing',
            submittedAt,
            courseId: academicContext.courseId ?? null,
            markingStatus,
        };
    }

    await update(ref(database), deepRemoveUndefined(updates));

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
            overallBand: submission.grading?.overallBand ?? null,
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

/**
 * Update grading data on a submission.
 */
export const updateGrading = withRestoreGuard<{ success: boolean; error?: string }>(
    'WritingGradingUpdate',
    { success: false, error: 'Blocked by restore guard' }
)(async (
    submissionId: string,
    gradingResult: WritingGradingResult,
    annotations: WritingAnnotation[]
): Promise<{ success: boolean; error?: string }> => {
    try {
        const submissionRef = doc(db, SUBMISSIONS_COLLECTION, submissionId);
        const submissionSnap = await getDoc(submissionRef);
        if (!submissionSnap.exists()) {
            return { success: false, error: 'Submission not found' };
        }

        const submission = submissionSnap.data() as WritingSubmission;
        const sanitized = deepRemoveUndefined({
            grading: gradingResult,
            annotations,
            markingStatus: 'graded',
        });
        await updateDoc(submissionRef, sanitized);

        const sessionCode = submission.context?.sessionCode;
        const resultRef = ref(database, `test_results/${submissionId}`);
        const [resultSnapshot, sessionSnapshot] = await Promise.all([
            get(resultRef),
            sessionCode ? get(ref(database, `game_sessions/${sessionCode}`)) : Promise.resolve(null as any),
        ]);

        const sessionData = sessionSnapshot?.exists?.() ? sessionSnapshot.val() : null;
        const academicContext =
            extractAcademicContext(resultSnapshot.exists() ? resultSnapshot.val() : null)
            || extractAcademicContext(sessionData);
        const writingResultContext = mapSubmissionContextToResultContext(submission);

        const baseResultRecord = resultSnapshot.exists()
            ? resultSnapshot.val()
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
            markingStatus: 'graded',
            updatedAt: feedbackUpdatedAt,
            overallFeedback: gradingResult.feedback?.overall || null,
            feedbackUpdatedAt,
            feedbackUpdatedBy: graderId,
            context: baseResultRecord.context || writingResultContext,
            writingData: {
                ...(baseResultRecord.writingData || {}),
                submissionId,
                overallBand: gradingResult.overallBand,
                markingStatus: 'graded',
                tasks: toWritingTaskIndex(submission.tasks),
            },
        });

        await persistWritingResultRecord(syncedResultRecord, {
            resultId: submissionId,
            studentId: submission.studentId,
            studentName: submission.studentName,
            sessionCode,
            academicContext,
        });
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
    updateGrading,
    getPendingSubmissions,
    getSubmissionsForStudent,
    getSubmissionsBySession,
    autoSubmitFromRTDB,
};

export default writingSubmissionService;
