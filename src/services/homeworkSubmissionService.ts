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
import { auth, firestore as db } from './firebase';
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
import type { HomeworkIntegrity } from '../types/integrity.types'; // PRD-0036
import type { BookHomeworkProgressProjection } from './book-homework/bookHomeworkProgress.types';
import { validateBookHomeworkProgressProjection } from './book-homework/bookHomeworkProgress.service';
import { resolveBookHomeworkWorkerOrigin } from './homeworkAssignmentClient';

const SUBMISSION_COLLECTION = 'homework_submissions';

export interface BookHomeworkProgressRequestOptions {
    readonly workerOrigin?: string;
    readonly studentId?: string;
    readonly fetchImpl?: typeof fetch;
    readonly getIdToken?: (forceRefresh?: boolean) => Promise<string>;
    readonly signal?: AbortSignal;
}

export interface TeacherBookHomeworkProgressRow {
    readonly studentId: string;
    readonly completion: BookHomeworkProgressProjection;
}

export class BookHomeworkProgressReadError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly code: string
    ) {
        super(message);
        this.name = 'BookHomeworkProgressReadError';
    }
}

const BOOK_HOMEWORK_READ_ID = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

const isBookHomeworkProgressProjection = (
    value: unknown
): value is BookHomeworkProgressProjection =>
    validateBookHomeworkProgressProjection(value).valid;

/**
 * Reads the trusted Book aggregate. It never falls back to legacy Homework
 * score fields because completion progress and academic grading are different
 * domains.
 */
export async function getBookHomeworkProgress(
    homeworkId: string,
    options: BookHomeworkProgressRequestOptions = {}
): Promise<BookHomeworkProgressProjection | null> {
    if (!BOOK_HOMEWORK_READ_ID.test(homeworkId)
        || (options.studentId !== undefined && !BOOK_HOMEWORK_READ_ID.test(options.studentId))) {
        throw new BookHomeworkProgressReadError(
            'Book Homework progress identity is invalid.',
            400,
            'INVALID_BOOK_HOMEWORK_PROGRESS_REQUEST'
        );
    }
    const getIdToken = options.getIdToken ?? (async (forceRefresh = false) => {
        const user = auth.currentUser;
        if (!user) {
            throw new BookHomeworkProgressReadError(
                'You must be signed in to view Book Homework progress.',
                401,
                'BOOK_HOMEWORK_AUTH_REQUIRED'
            );
        }
        return user.getIdToken(forceRefresh);
    });
    const origin = options.workerOrigin ?? resolveBookHomeworkWorkerOrigin();
    const endpoint = new URL(options.studentId
        ? `/book-homework/assignments/${encodeURIComponent(homeworkId)}/students/${encodeURIComponent(options.studentId)}/projection`
        : `/book-homework/assignments/${encodeURIComponent(homeworkId)}/student-projection`,
    origin);
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    let token = await getIdToken(false);
    let response: Response | undefined;
    let body: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
        response = await fetchImpl(endpoint, {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}` },
            signal: options.signal,
        });
        body = await response.json().catch(() => ({}));
        if (response.status !== 401 || attempt === 1) break;
        token = await getIdToken(true);
    }
    if (!response) {
        throw new BookHomeworkProgressReadError(
            'Book Homework progress service did not respond.',
            503,
            'BOOK_HOMEWORK_PROGRESS_UNAVAILABLE'
        );
    }
    if (response.status === 404) return null;
    if (!response.ok || !isRecord(body) || !isBookHomeworkProgressProjection(body.completion)) {
        const responseBody = isRecord(body) ? body : {};
        throw new BookHomeworkProgressReadError(
            String(responseBody.message ?? responseBody.code ?? 'Book Homework progress is unavailable.'),
            response.ok ? 502 : response.status,
            typeof responseBody.code === 'string'
                ? responseBody.code
                : 'BOOK_HOMEWORK_PROGRESS_UNAVAILABLE'
        );
    }
    const completion = body.completion;
    if (completion.contextId !== homeworkId
        || (options.studentId !== undefined && completion.recipientId !== options.studentId)) {
        throw new BookHomeworkProgressReadError(
            'Book Homework progress response is inconsistent.',
            502,
            'BOOK_HOMEWORK_PROGRESS_UNAVAILABLE'
        );
    }
    return completion;
}

/** One bounded teacher read; avoids browser-side per-student fan-out. */
export async function getTeacherBookHomeworkProgress(
    homeworkId: string,
    options: Omit<BookHomeworkProgressRequestOptions, 'studentId'> = {}
): Promise<readonly TeacherBookHomeworkProgressRow[] | null> {
    if (!BOOK_HOMEWORK_READ_ID.test(homeworkId)) {
        throw new BookHomeworkProgressReadError(
            'Book Homework progress identity is invalid.',
            400,
            'INVALID_BOOK_HOMEWORK_PROGRESS_REQUEST'
        );
    }
    const getIdToken = options.getIdToken ?? (async (forceRefresh = false) => {
        const user = auth.currentUser;
        if (!user) {
            throw new BookHomeworkProgressReadError(
                'You must be signed in to view Book Homework progress.',
                401,
                'BOOK_HOMEWORK_AUTH_REQUIRED'
            );
        }
        return user.getIdToken(forceRefresh);
    });
    const origin = options.workerOrigin ?? resolveBookHomeworkWorkerOrigin();
    const endpoint = new URL(
        `/book-homework/assignments/${encodeURIComponent(homeworkId)}/teacher-projection`,
        origin
    );
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    let token = await getIdToken(false);
    let response: Response | undefined;
    let body: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
        response = await fetchImpl(endpoint, {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}` },
            signal: options.signal,
        });
        body = await response.json().catch(() => ({}));
        if (response.status !== 401 || attempt === 1) break;
        token = await getIdToken(true);
    }
    if (!response) {
        throw new BookHomeworkProgressReadError(
            'Book Homework progress service did not respond.',
            503,
            'BOOK_HOMEWORK_PROGRESS_UNAVAILABLE'
        );
    }
    if (response.status === 404) return null;
    const responseBody = isRecord(body) ? body : {};
    const rows = responseBody.students;
    if (!response.ok
        || !Array.isArray(rows)
        || rows.length > 30
        || rows.some((row) => !isRecord(row)
            || typeof row.studentId !== 'string'
            || !BOOK_HOMEWORK_READ_ID.test(row.studentId)
            || !isBookHomeworkProgressProjection(row.completion))) {
        throw new BookHomeworkProgressReadError(
            String(responseBody.message ?? responseBody.code ?? 'Book Homework progress is unavailable.'),
            response.ok ? 502 : response.status,
            typeof responseBody.code === 'string'
                ? responseBody.code
                : 'BOOK_HOMEWORK_PROGRESS_UNAVAILABLE'
        );
    }
    const seen = new Set<string>();
    return rows.map((row) => {
        const typed = row as { studentId: string; completion: BookHomeworkProgressProjection };
        if (seen.has(typed.studentId)
            || typed.completion.recipientId !== typed.studentId
            || typed.completion.contextId !== homeworkId) {
            throw new BookHomeworkProgressReadError(
                'Book Homework progress response is inconsistent.',
                502,
                'BOOK_HOMEWORK_PROGRESS_UNAVAILABLE'
            );
        }
        seen.add(typed.studentId);
        return typed;
    });
}

// ============================================================================
// ERROR TYPES
// ============================================================================

export class HomeworkSubmissionError extends Error {
    constructor(
        message: string,
        public code: 'MAX_ATTEMPTS_REACHED' | 'HOMEWORK_NOT_FOUND' | 'HOMEWORK_CLOSED' | 'NOT_AVAILABLE_YET' | 'SUBMISSION_NOT_FOUND' | 'ALREADY_SUBMITTED' | 'IN_PROGRESS_REQUIRES_CONFIRMATION' | 'UNKNOWN'
    ) {
        super(message);
        this.name = 'HomeworkSubmissionError';
    }
}

export interface ImportedHomeworkSubmissionInput {
    submissionId: string;
    homeworkId: string;
    studentId: string;
    studentName?: string;
    resultId: string;
    submittedAt: number;
    timeSpent?: number;
    isLate?: boolean;
    importedByTeacherId: string;
    importedAt?: number;
    sourceNote?: string;
    confirmInProgressOverwrite?: boolean;
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

    // PRD-0036: Check if attempts were nullified by anti-cheat system
    const hasNullified = previousAttempts.some(s => s.attemptsNullified === true);
    if (hasNullified) {
        throw new HomeworkSubmissionError('No remaining attempts (integrity violation)', 'MAX_ATTEMPTS_REACHED');
    }

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
    score?: number,
    maxScore?: number,
    percentage?: number,
    bandScore?: number,
    timeSpent?: number,
    integrity?: HomeworkIntegrity, // PRD-0036
    attemptsNullified?: boolean // PRD-0036: nullify remaining attempts on integrity violation
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
        isLate,
        status: 'submitted' as HomeworkSubmissionStatus,
        ...(typeof score === 'number' ? { score } : {}),
        ...(typeof maxScore === 'number' ? { maxScore } : {}),
        ...(typeof percentage === 'number' ? { percentage } : {}),
        ...(typeof bandScore === 'number' ? { bandScore } : {}),
        ...(typeof timeSpent === 'number' ? { timeSpent } : {}),
        ...(integrity ? { integrity } : {}), // PRD-0036: Anti-cheat integrity data
        ...(attemptsNullified ? { attemptsNullified: true } : {}), // PRD-0036: Nullify remaining attempts
    });

    // Update homework stats
    await updateHomeworkStats(submission.homeworkId, 'submitted', isLate);
}

/**
 * Create or submit a homework submission row for teacher-entered off-app work.
 *
 * This keeps homework statistics on the same private update path as the normal
 * student flow, while allowing a teacher-owned historical submittedAt value.
 */
export async function submitImportedHomeworkSubmission(
    input: ImportedHomeworkSubmissionInput
): Promise<HomeworkSubmission> {
    const homework = await getHomeworkById(input.homeworkId);
    if (!homework) {
        throw new HomeworkSubmissionError('Homework not found', 'HOMEWORK_NOT_FOUND');
    }

    const previousAttempts = await getStudentSubmissionsForHomework(input.homeworkId, input.studentId);
    const latestAttempt = previousAttempts[previousAttempts.length - 1] ?? null;

    if (latestAttempt?.status === 'submitted' || latestAttempt?.status === 'graded') {
        throw new HomeworkSubmissionError('Homework already submitted', 'ALREADY_SUBMITTED');
    }
    if (latestAttempt?.status === 'in_progress' && input.confirmInProgressOverwrite !== true) {
        throw new HomeworkSubmissionError(
            'Homework attempt is in progress',
            'IN_PROGRESS_REQUIRES_CONFIRMATION'
        );
    }

    const completedAttempts = previousAttempts.filter(
        s => s.status === 'submitted' || s.status === 'graded'
    );
    const submissionId = latestAttempt?.status === 'in_progress'
        ? latestAttempt.id
        : input.submissionId;
    const timeSpent = Math.max(0, Math.round(input.timeSpent ?? 0));
    const startedAt = latestAttempt?.startedAt
        ?? Math.max(0, input.submittedAt - (timeSpent * 1000));
    const isLate = input.isLate ?? input.submittedAt > getEffectiveHomeworkDueDate(homework, input.studentId);
    const importedAt = input.importedAt ?? Date.now();

    const administrativeImport: HomeworkSubmission['administrativeImport'] = {
        source: 'external-admin-import',
        importedByTeacherId: input.importedByTeacherId,
        importedAt,
        ...(input.sourceNote?.trim() ? { sourceNote: input.sourceNote.trim() } : {}),
    };

    const submission: HomeworkSubmission = {
        ...(latestAttempt ?? {}),
        id: submissionId,
        homeworkId: input.homeworkId,
        studentId: input.studentId,
        ...(input.studentName ? { studentName: input.studentName } : {}),
        teacherId: homework.createdBy,
        attemptNumber: latestAttempt?.attemptNumber ?? completedAttempts.length + 1,
        startedAt,
        submittedAt: input.submittedAt,
        timeSpent,
        isLate,
        resultId: input.resultId,
        status: 'submitted' as HomeworkSubmissionStatus,
        administrativeImport,
    };

    const submissionRef = doc(db, SUBMISSION_COLLECTION, submissionId);
    if (latestAttempt?.status === 'in_progress') {
        await updateDoc(submissionRef, {
            ...(input.studentName ? { studentName: input.studentName } : {}),
            teacherId: homework.createdBy,
            submittedAt: input.submittedAt,
            timeSpent,
            isLate,
            resultId: input.resultId,
            status: 'submitted' as HomeworkSubmissionStatus,
            administrativeImport,
        });
    } else {
        await setDoc(submissionRef, submission);
        await updateHomeworkStats(input.homeworkId, 'started');
    }

    await updateHomeworkStats(input.homeworkId, 'submitted', isLate);

    return submission;
}

/**
 * Mark a homework submission as graded after a teacher finishes manual review.
 *
 * Used by manual-review workflows such as IELTS Writing where the submission is
 * first recorded as "submitted" and later upgraded to "graded".
 */
export async function markHomeworkSubmissionGraded(
    submissionId: string,
    updates: {
        bandScore?: number;
        score?: number;
        maxScore?: number;
        percentage?: number;
    } = {}
): Promise<void> {
    const submissionRef = doc(db, SUBMISSION_COLLECTION, submissionId);
    const snapshot = await getDoc(submissionRef);

    if (!snapshot.exists()) {
        throw new HomeworkSubmissionError('Submission not found', 'SUBMISSION_NOT_FOUND');
    }

    await updateDoc(submissionRef, {
        status: 'graded' as HomeworkSubmissionStatus,
        ...(typeof updates.bandScore === 'number' ? { bandScore: updates.bandScore } : {}),
        ...(typeof updates.score === 'number' ? { score: updates.score } : {}),
        ...(typeof updates.maxScore === 'number' ? { maxScore: updates.maxScore } : {}),
        ...(typeof updates.percentage === 'number' ? { percentage: updates.percentage } : {}),
    });
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
    attemptsNullified: boolean;
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
        const attemptsNullified = submissions.some(s => s.attemptsNullified === true);

        const maxAttempts = homework.config.maxAttempts;
        const attemptsUsed = completedAttempts.length;
        const attemptsRemaining = attemptsNullified
            ? 0
            : maxAttempts !== null
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
            !attemptsNullified &&
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
            attemptsNullified,
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
    attemptsNullified: boolean;
}> {
    const homework = await getHomeworkById(homeworkId);
    if (!homework) {
        return {
            maxAttempts: null,
            usedAttempts: 0,
            remainingAttempts: null,
            canAttempt: false,
            attemptsNullified: false,
        };
    }

    const submissions = await getStudentSubmissionsForHomework(homeworkId, studentId);
    const completedAttempts = submissions.filter(s =>
        s.status === 'submitted' || s.status === 'graded'
    );
    const attemptsNullified = submissions.some(s => s.attemptsNullified === true);

    const maxAttempts = homework.config.maxAttempts;
    const usedAttempts = completedAttempts.length;
    const remainingAttempts = attemptsNullified
        ? 0
        : maxAttempts !== null
        ? Math.max(0, maxAttempts - usedAttempts)
        : null;

    const canAttempt = !attemptsNullified && (remainingAttempts === null || remainingAttempts > 0);

    return {
        maxAttempts,
        usedAttempts,
        remainingAttempts,
        canAttempt,
        attemptsNullified,
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
