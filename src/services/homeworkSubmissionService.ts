/**
 * Homework Submission Service
 * PRD-0016: Solo Study & Homework System
 * 
 * Manages student homework submissions:
 * - Creating and tracking attempts
 * - Progress saving
 * - Late submission detection
 * - Result linking
 */

import {
    collection,
    doc,
    setDoc,
    getDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy
} from 'firebase/firestore';
// @ts-ignore - JS service file
import { firestore as db } from './firebase';
import {
    getEffectiveHomeworkDueDate,
    getHomeworkById,
    getStudentOverride,
    isStudentExemptedFromHomework,
    updateHomework
} from './homeworkManager';
import type {
    HomeworkSubmission,
    HomeworkSubmissionStatus,
    HomeworkAssignment
} from '../types/homework.types';

const SUBMISSION_COLLECTION = 'homework_submissions';

// ============================================================================
// ERROR TYPES
// ============================================================================

export class HomeworkSubmissionError extends Error {
    constructor(
        message: string,
        public code: 'MAX_ATTEMPTS_REACHED' | 'HOMEWORK_NOT_FOUND' | 'HOMEWORK_CLOSED' | 'NOT_AVAILABLE_YET' | 'SUBMISSION_NOT_FOUND' | 'ALREADY_SUBMITTED' | 'UNKNOWN'
    ) {
        super(message);
        this.name = 'HomeworkSubmissionError';
    }
}

export function isStudentExempted(
    homework: HomeworkAssignment,
    studentId: string
): boolean {
    return isStudentExemptedFromHomework(homework, studentId);
}

export function isLateSubmission(
    homework: HomeworkAssignment,
    studentId: string,
    timestamp: number = Date.now()
): boolean {
    return timestamp > getEffectiveHomeworkDueDate(homework, studentId);
}

// ============================================================================
// CREATE SUBMISSION
// ============================================================================

/**
 * Create a new submission (start an attempt)
 * 
 * @param homeworkId - Homework assignment ID
 * @param studentId - Student ID
 * @param studentName - Student name for display
 * @returns Created submission
 */
export async function createSubmission(
    homeworkId: string,
    studentId: string,
    studentName?: string
): Promise<HomeworkSubmission> {
    // Get homework to validate
    const homework = await getHomeworkById(homeworkId);
    if (!homework) {
        throw new HomeworkSubmissionError('Homework not found', 'HOMEWORK_NOT_FOUND');
    }

    if (isStudentExempted(homework, studentId)) {
        throw new HomeworkSubmissionError('You are exempt from this homework', 'HOMEWORK_CLOSED');
    }

    // Check if homework is closed
    if (homework.status === 'closed') {
        throw new HomeworkSubmissionError('This homework is no longer accepting submissions', 'HOMEWORK_CLOSED');
    }

    // Check if homework is available yet
    const now = Date.now();
    if (homework.scheduling.availableFrom && homework.scheduling.availableFrom > now) {
        throw new HomeworkSubmissionError('This homework is not yet available', 'NOT_AVAILABLE_YET');
    }

    // Check attempt count
    const previousAttempts = await getStudentSubmissionsForHomework(homeworkId, studentId);
    const completedAttempts = previousAttempts.filter(s => s.status === 'submitted' || s.status === 'graded');
    const maxAttempts = homework.config.maxAttempts;

    if (maxAttempts !== null && completedAttempts.length >= maxAttempts) {
        throw new HomeworkSubmissionError('Maximum attempts reached', 'MAX_ATTEMPTS_REACHED');
    }

    // Check for in-progress submission
    const inProgress = previousAttempts.find(s => s.status === 'in_progress');
    if (inProgress) {
        // Return existing in-progress submission instead of creating new
        return inProgress;
    }

    // Determine if this is a late submission
    const isLate = isLateSubmission(homework, studentId, now);

    // Check if late submissions are allowed
    if (isLate && !homework.config.lateSubmissionAllowed) {
        throw new HomeworkSubmissionError('This homework is past due and does not accept late submissions', 'HOMEWORK_CLOSED');
    }

    // Create new submission
    const submissionId = `${homeworkId}_${studentId}_${Date.now()}`;
    const attemptNumber = completedAttempts.length + 1;

    const submission: HomeworkSubmission = {
        id: submissionId,
        homeworkId,
        studentId,
        studentName,
        teacherId: homework.createdBy, // Stored for Firestore security rules (teacher reset authorization)
        attemptNumber,
        startedAt: now,
        isLate,
        status: 'in_progress' as HomeworkSubmissionStatus
    };

    // Save to Firestore
    const submissionRef = doc(db, SUBMISSION_COLLECTION, submissionId);
    await setDoc(submissionRef, submission);

    // Update homework stats
    await updateHomeworkStats(homeworkId, 'started');

    return submission;
}

// ============================================================================
// UPDATE SUBMISSION
// ============================================================================

/**
 * Update submission progress (save answers, time spent)
 * 
 * @param submissionId - Submission ID
 * @param updates - Updates to apply
 */
export async function updateSubmission(
    submissionId: string,
    updates: {
        timeSpent?: number;
    }
): Promise<void> {
    const submissionRef = doc(db, SUBMISSION_COLLECTION, submissionId);
    const snapshot = await getDoc(submissionRef);

    if (!snapshot.exists()) {
        throw new HomeworkSubmissionError('Submission not found', 'SUBMISSION_NOT_FOUND');
    }

    const submission = snapshot.data() as HomeworkSubmission;
    if (submission.status !== 'in_progress') {
        throw new HomeworkSubmissionError('Cannot update a submitted homework', 'ALREADY_SUBMITTED');
    }

    await updateDoc(submissionRef, updates);
}

// ============================================================================
// SUBMIT HOMEWORK
// ============================================================================

/**
 * Complete and submit a homework attempt
 * 
 * @param submissionId - Submission ID
 * @param resultId - Result ID from test results
 * @param score - Score achieved
 * @param maxScore - Maximum possible score
 * @param percentage - Percentage score
 * @param bandScore - Optional IELTS band score
 * @param timeSpent - Time spent in seconds
 */
export async function submitHomework(
    submissionId: string,
    resultId: string,
    score: number,
    maxScore: number,
    percentage: number,
    bandScore?: number,
    timeSpent?: number
): Promise<void> {
    const submissionRef = doc(db, SUBMISSION_COLLECTION, submissionId);
    const snapshot = await getDoc(submissionRef);

    if (!snapshot.exists()) {
        throw new HomeworkSubmissionError('Submission not found', 'SUBMISSION_NOT_FOUND');
    }

    const submission = snapshot.data() as HomeworkSubmission;
    if (submission.status === 'submitted' || submission.status === 'graded') {
        throw new HomeworkSubmissionError('Homework already submitted', 'ALREADY_SUBMITTED');
    }

    const now = Date.now();

    // Check if this is a late submission (could have started on time but submitted late)
    const homework = await getHomeworkById(submission.homeworkId);
    const isLate = homework ? isLateSubmission(homework, submission.studentId, now) : submission.isLate;

    // Update submission
    await updateDoc(submissionRef, {
        submittedAt: now,
        resultId,
        score,
        maxScore,
        percentage,
        bandScore: bandScore || null,
        timeSpent: timeSpent || null,
        isLate,
        status: 'submitted' as HomeworkSubmissionStatus
    });

    // Update homework stats
    await updateHomeworkStats(submission.homeworkId, 'submitted', isLate);
}

// ============================================================================
// QUERY FUNCTIONS
// ============================================================================

/**
 * Get all submissions for a student
 * 
 * @param studentId - Student ID
 * @returns Array of submissions
 */
export async function getStudentSubmissions(
    studentId: string
): Promise<HomeworkSubmission[]> {
    const submissionsRef = collection(db, SUBMISSION_COLLECTION);
    const q = query(
        submissionsRef,
        where('studentId', '==', studentId),
        orderBy('startedAt', 'desc')
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data() as HomeworkSubmission);
}

/**
 * Get all submissions for a specific homework assignment
 * 
 * @param homeworkId - Homework ID
 * @returns Array of submissions
 */
export async function getHomeworkSubmissions(
    homeworkId: string
): Promise<HomeworkSubmission[]> {
    const submissionsRef = collection(db, SUBMISSION_COLLECTION);
    // NOTE: Do NOT use orderBy('submittedAt') — Firestore excludes documents
    // where submittedAt is undefined (i.e. in_progress submissions).
    // Instead, query without orderBy and sort client-side.
    const q = query(
        submissionsRef,
        where('homeworkId', '==', homeworkId)
    );

    const snapshot = await getDocs(q);
    const submissions = snapshot.docs.map(doc => doc.data() as HomeworkSubmission);
    // Sort by submittedAt desc (submitted first), then startedAt desc for in-progress
    return submissions.sort((a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0) || b.startedAt - a.startedAt);
}

/**
 * Get submissions for a specific student and homework
 * 
 * @param homeworkId - Homework ID
 * @param studentId - Student ID
 * @returns Array of submissions
 */
export async function getStudentSubmissionsForHomework(
    homeworkId: string,
    studentId: string
): Promise<HomeworkSubmission[]> {
    const submissionsRef = collection(db, SUBMISSION_COLLECTION);
    const q = query(
        submissionsRef,
        where('homeworkId', '==', homeworkId),
        where('studentId', '==', studentId)
    );

    const snapshot = await getDocs(q);
    const submissions = snapshot.docs.map(doc => doc.data() as HomeworkSubmission);
    // Sort by attemptNumber ascending in JS (avoids needing a 3-field composite index)
    return submissions.sort((a, b) => a.attemptNumber - b.attemptNumber);
}

/**
 * Get a single submission by ID
 * 
 * @param submissionId - Submission ID
 * @returns Submission or null
 */
export async function getSubmissionById(
    submissionId: string
): Promise<HomeworkSubmission | null> {
    const submissionRef = doc(db, SUBMISSION_COLLECTION, submissionId);
    const snapshot = await getDoc(submissionRef);

    if (!snapshot.exists()) {
        return null;
    }

    return snapshot.data() as HomeworkSubmission;
}

/**
 * Get the latest submission for a student on a homework
 * 
 * @param homeworkId - Homework ID
 * @param studentId - Student ID
 * @returns Latest submission or null
 */
export async function getLatestSubmission(
    homeworkId: string,
    studentId: string
): Promise<HomeworkSubmission | null> {
    const submissions = await getStudentSubmissionsForHomework(homeworkId, studentId);
    if (submissions.length === 0) {
        return null;
    }
    return submissions[submissions.length - 1] ?? null;
}

/**
 * Get the best scoring submission for a student on a homework
 * 
 * @param homeworkId - Homework ID
 * @param studentId - Student ID
 * @returns Best submission or null
 */
export async function getBestSubmission(
    homeworkId: string,
    studentId: string
): Promise<HomeworkSubmission | null> {
    const submissions = await getStudentSubmissionsForHomework(homeworkId, studentId);
    const completedSubmissions = submissions.filter(s =>
        (s.status === 'submitted' || s.status === 'graded') && s.percentage !== undefined
    );

    if (completedSubmissions.length === 0) {
        return null;
    }

    return completedSubmissions.reduce((best, current) =>
        (current.percentage || 0) > (best.percentage || 0) ? current : best
    );
}

// ============================================================================
// HOMEWORK VIEW FOR STUDENTS
// ============================================================================

/**
 * Get homework assignments for a student with their status
 * 
 * @param studentId - Student ID
 * @returns Array of homework with student status
 */
export async function getStudentHomeworkList(
    studentId: string
): Promise<Array<{
    homework: HomeworkAssignment;
    submission: HomeworkSubmission | null;
    attemptsUsed: number;
    attemptsRemaining: number | null;
    isOverdue: boolean;
    canSubmit: boolean;
    canViewFeedback: boolean;
    effectiveDueDate: number;
    lastRemindedAt?: number;
    reminderCount: number;
    isExempted: boolean;
}>> {
    // Import here to avoid circular dependency
    const { getHomeworkForStudent } = await import('./homeworkManager');

    // Get all homework assigned to this student
    const homeworks = await getHomeworkForStudent(studentId);

    // Get all submissions for this student
    const allSubmissions = await getStudentSubmissions(studentId);
    const submissionsByHomework = new Map<string, HomeworkSubmission[]>();

    for (const submission of allSubmissions) {
        const existing = submissionsByHomework.get(submission.homeworkId) || [];
        existing.push(submission);
        submissionsByHomework.set(submission.homeworkId, existing);
    }

    const now = Date.now();

    return homeworks.map(homework => {
        const submissions = [...(submissionsByHomework.get(homework.id) || [])].sort(
            (a, b) => (b.startedAt || 0) - (a.startedAt || 0)
        );
        const completedAttempts = submissions.filter(s =>
            s.status === 'submitted' || s.status === 'graded'
        );
        const latestSubmission: HomeworkSubmission | null = submissions[0] ?? null;
        const studentOverride = getStudentOverride(homework, studentId);
        const effectiveDueDate = getEffectiveHomeworkDueDate(homework, studentId);
        const isExempted = isStudentExempted(homework, studentId);

        const maxAttempts = homework.config.maxAttempts;
        const attemptsUsed = completedAttempts.length;
        const attemptsRemaining = maxAttempts !== null
            ? Math.max(0, maxAttempts - attemptsUsed)
            : null;

        const isOverdue = now > effectiveDueDate;
        const isAvailable = !homework.scheduling.availableFrom ||
            now >= homework.scheduling.availableFrom;

        // Can submit if: not closed, available, has attempts left (or unlimited), 
        // and either not past due or late submissions allowed
        const canSubmit =
            homework.status !== 'closed' &&
            !isExempted &&
            isAvailable &&
            (attemptsRemaining === null || attemptsRemaining > 0) &&
            (!isOverdue || homework.config.lateSubmissionAllowed);

        // Feedback visibility based on timing config
        let canViewFeedback = false;
        if (completedAttempts.length > 0) {
            switch (homework.config.feedbackTiming) {
                case 'immediate':
                case 'after_completion':
                    canViewFeedback = true;
                    break;
                case 'after_deadline':
                    canViewFeedback = now > effectiveDueDate;
                    break;
                case 'never':
                    canViewFeedback = false;
                    break;
            }
        }

        return {
            homework,
            submission: latestSubmission,
            attemptsUsed,
            attemptsRemaining,
            isOverdue,
            canSubmit,
            canViewFeedback,
            effectiveDueDate,
            lastRemindedAt: studentOverride.lastRemindedAt,
            reminderCount: studentOverride.reminderCount ?? 0,
            isExempted
        };
    });
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Update homework statistics after submission events
 * 
 * @param homeworkId - Homework ID
 * @param event - Event type (started or submitted)
 * @param isLate - Whether this is a late submission
 */
async function updateHomeworkStats(
    homeworkId: string,
    event: 'started' | 'submitted',
    isLate: boolean = false
): Promise<void> {
    try {
        const homework = await getHomeworkById(homeworkId);
        if (!homework) return;

        const stats = { ...homework.stats };

        if (event === 'started') {
            stats.started = (stats.started || 0) + 1;
        } else if (event === 'submitted') {
            stats.submitted = (stats.submitted || 0) + 1;
            if (isLate) {
                stats.lateSubmissions = (stats.lateSubmissions || 0) + 1;
            }

            // Calculate completion rate
            if (stats.totalAssigned > 0) {
                stats.completionRate = Math.round((stats.submitted / stats.totalAssigned) * 100);
            }
        }

        await updateHomework(homeworkId, { stats });
    } catch (error) {
        console.error('Failed to update homework stats:', error);
        // Non-critical, don't throw
    }
}

/**
 * Calculate remaining attempts for a student
 * 
 * @param homeworkId - Homework ID
 * @param studentId - Student ID
 * @returns Object with attempt info
 */
export async function getAttemptInfo(
    homeworkId: string,
    studentId: string
): Promise<{
    maxAttempts: number | null;
    usedAttempts: number;
    remainingAttempts: number | null;
    canAttempt: boolean;
}> {
    const homework = await getHomeworkById(homeworkId);
    if (!homework) {
        return {
            maxAttempts: null,
            usedAttempts: 0,
            remainingAttempts: null,
            canAttempt: false
        };
    }

    const submissions = await getStudentSubmissionsForHomework(homeworkId, studentId);
    const completedAttempts = submissions.filter(s =>
        s.status === 'submitted' || s.status === 'graded'
    );

    const maxAttempts = homework.config.maxAttempts;
    const usedAttempts = completedAttempts.length;
    const remainingAttempts = maxAttempts !== null
        ? Math.max(0, maxAttempts - usedAttempts)
        : null;

    const canAttempt = remainingAttempts === null || remainingAttempts > 0;

    return {
        maxAttempts,
        usedAttempts,
        remainingAttempts,
        canAttempt
    };
}

// ============================================================================
// RESET STUDENT HOMEWORK
// ============================================================================

/**
 * Reset a student's homework — deletes all submissions and linked results.
 * The student will see the homework as "not_started" and can retake it.
 *
 * Steps:
 * 1. Fetch all submissions for (homeworkId, studentId)
 * 2. Collect all linked resultIds
 * 3. Delete each submission doc from Firestore
 * 4. Delete each linked test result from RTDB (via deleteTestResult)
 * 5. Recalculate HomeworkAssignment.stats
 * 6. Send notification to the student
 *
 * @param homeworkId - Homework assignment ID
 * @param studentId - Student ID to reset
 * @param homeworkTitle - Title of the homework (for notification)
 * @returns Summary of what was deleted
 */
export async function resetStudentHomework(
    homeworkId: string,
    studentId: string,
    homeworkTitle?: string
): Promise<{ submissionsDeleted: number; resultsDeleted: number }> {
    // 1. Fetch all submissions for this student + homework
    const submissions = await getStudentSubmissionsForHomework(homeworkId, studentId);

    if (submissions.length === 0) {
        return { submissionsDeleted: 0, resultsDeleted: 0 };
    }

    // 2. Collect linked resultIds
    const resultIds = submissions
        .map(s => s.resultId)
        .filter((id): id is string => !!id);

    // 3. Count stats adjustments before deleting
    const startedCount = submissions.filter(s => s.status !== 'not_started').length;
    const submittedCount = submissions.filter(
        s => s.status === 'submitted' || s.status === 'graded'
    ).length;
    const lateCount = submissions.filter(
        s => s.isLate && (s.status === 'submitted' || s.status === 'graded')
    ).length;

    // 4. Get homework for teacher ownership info (needed for backfilling old submissions)
    const homework = await getHomeworkById(homeworkId);
    const teacherId = homework?.createdBy;

    // 5. Delete each submission doc from Firestore
    // For submissions created before teacherId was added, stamp it first so
    // the security rule (resource.data.teacherId == auth.uid) passes on delete.
    for (const submission of submissions) {
        const submissionRef = doc(db, SUBMISSION_COLLECTION, submission.id);
        if (!submission.teacherId && teacherId) {
            await updateDoc(submissionRef, { teacherId });
        }
        await deleteDoc(submissionRef);
    }

    // 6. Delete each linked test result from RTDB
    let resultsDeleted = 0;
    if (resultIds.length > 0) {
        const { deleteTestResult } = await import('./testResults.service');
        for (const resultId of resultIds) {
            try {
                await deleteTestResult(resultId);
                resultsDeleted++;
            } catch (err) {
                console.warn(`⚠️ Failed to delete test result ${resultId}:`, err);
                // Continue with remaining deletions
            }
        }
    }

    // 7. Recalculate homework stats (reuse homework fetched in step 4)
    try {
        if (homework) {
            const stats = { ...homework.stats };
            stats.started = Math.max(0, (stats.started || 0) - startedCount);
            stats.submitted = Math.max(0, (stats.submitted || 0) - submittedCount);
            stats.lateSubmissions = Math.max(0, (stats.lateSubmissions || 0) - lateCount);

            // Recalculate completion rate
            if (stats.totalAssigned > 0) {
                stats.completionRate = Math.round((stats.submitted / stats.totalAssigned) * 100);
            } else {
                stats.completionRate = 0;
            }

            await updateHomework(homeworkId, { stats });
        }
    } catch (err) {
        console.error('Failed to update homework stats after reset:', err);
        // Non-critical — submissions are already deleted
    }

    // 8. Send notification to the student
    try {
        const { sendHomeworkResetNotification } = await import('./notificationService');
        await sendHomeworkResetNotification(
            studentId,
            homeworkId,
            homeworkTitle || 'Homework'
        );
    } catch (err) {
        console.warn('Failed to send homework reset notification:', err);
        // Non-critical
    }

    console.log(
        `🔄 [HomeworkReset] Reset homework ${homeworkId} for student ${studentId}: ` +
        `${submissions.length} submissions deleted, ${resultsDeleted} results deleted`
    );

    return {
        submissionsDeleted: submissions.length,
        resultsDeleted
    };
}
