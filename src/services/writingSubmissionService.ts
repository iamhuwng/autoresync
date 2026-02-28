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
import { ref, get, set, push } from 'firebase/database';
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

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const SUBMISSIONS_COLLECTION = 'writing_submissions';

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
        const sanitized = deepRemoveUndefined({
            grading: gradingResult,
            annotations,
            markingStatus: 'graded',
        });
        await updateDoc(doc(db, SUBMISSIONS_COLLECTION, submissionId), sanitized);
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

        // Client-side filter for teacher
        const filtered = all.filter(s =>
            s.grading?.teacherId === teacherId ||
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
    testData: IELTSWritingTest
): Promise<void> => {
    try {
        // Read latest essay data from RTDB
        const writingRef = ref(database, `game_sessions/${sessionCode}/students/${studentUid}/writing`);
        const writingSnap = await get(writingRef);
        const writingData = writingSnap.val() || {};

        // Generate resultId using Firebase push ID
        const resultId = push(ref(database)).key;
        if (!resultId) {
            console.error('❌ Failed to generate resultId');
            return;
        }

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
            submittedAt: Date.now(),
            totalElapsedTimeSeconds: writingData.totalElapsedTime || 0,
            pasteAttemptCount: writingData.pasteAttemptCount || 0,
            markingStatus: 'pending-review',
            annotations: [],
            auditTrail: [],
        };

        const sanitized = deepRemoveUndefined(submission);
        await setDoc(doc(db, SUBMISSIONS_COLLECTION, resultId), sanitized);

        // Create RTDB result index
        const resultRecord = deepRemoveUndefined({
            resultId,
            sessionCode,
            testId: testData.id,
            studentId: studentUid,
            studentName,
            isGuest: false,
            teacherId: testData.createdBy,
            totalScore: 0,
            maxScore: 0,
            percentage: 0,
            bandScore: 0,
            testTitle: testData.metadata.title,
            testType: 'test',
            testSkill: 'writing',
            testDuration: testData.metadata.duration,
            questionResults: [],
            correct: 0,
            incorrect: 0,
            partialCredit: 0,
            totalQuestions: 0,
            submittedAt: Date.now(),
            timeElapsed: writingData.totalElapsedTime || 0,
            createdAt: Date.now(),
            markingStatus: 'pending-review',
            writingData: {
                submissionId: resultId,
                overallBand: null,
                markingStatus: 'pending-review',
                tasks: submissionTasks.map(t => ({
                    taskNumber: t.taskNumber,
                    wordCount: t.wordCount,
                    activeTimeSeconds: t.activeTimeSeconds,
                })),
            },
        });

        await set(
            ref(database, `test_results_by_student/${studentUid}/${resultId}`),
            resultRecord
        );

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
    getSubmission,
    updateGrading,
    getPendingSubmissions,
    getSubmissionsForStudent,
    getSubmissionsBySession,
    autoSubmitFromRTDB,
};

export default writingSubmissionService;
