/**
 * useHomeworkSubmission Hook
 * PRD-0016: Solo Study & Homework System
 * 
 * React hook for managing homework submission state.
 * Handles attempt tracking, late detection, and auto-save.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
    createSubmission,
    getStudentSubmissionsForHomework,
    HomeworkSubmissionError
} from '../services/homeworkSubmissionService';
import { getHomeworkById } from '../services/homeworkManager';
import type { HomeworkSubmission, HomeworkAssignment } from '../types/homework.types';
import type { ClassSummary } from '../types/class.types';
import { isBookHomeworkCompatibilityProjection } from '../services/book-homework/bookHomeworkCompatibilityProjection.service';

// ============================================================================
// TYPES
// ============================================================================

export interface UseHomeworkSubmissionOptions {
    homeworkId: string;
    studentId: string;
    studentName?: string;
    /** Auto-refresh interval in seconds (0 to disable) */
    refreshInterval?: number;
}

export interface UseHomeworkSubmissionReturn {
    // Data
    homework: HomeworkAssignment | null;
    currentSubmission: HomeworkSubmission | null;
    allSubmissions: HomeworkSubmission[];
    latestSubmission: HomeworkSubmission | null;
    bestSubmission: HomeworkSubmission | null;

    // Attempt info
    maxAttempts: number | null;
    attemptsUsed: number;
    attemptsRemaining: number | null;
    attemptsNullified: boolean;

    // Status flags
    isLoading: boolean;
    error: string | null;
    isOverdue: boolean;
    isAvailable: boolean;
    canStartAttempt: boolean;
    hasInProgressAttempt: boolean;

    // Actions
    startAttempt: () => Promise<HomeworkSubmission>;
    refreshData: () => Promise<void>;
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

export function useHomeworkSubmission({
    homeworkId,
    studentId,
    studentName,
    refreshInterval = 0
}: UseHomeworkSubmissionOptions): UseHomeworkSubmissionReturn {
    // State
    const [homework, setHomework] = useState<HomeworkAssignment | null>(null);
    const [allSubmissions, setAllSubmissions] = useState<HomeworkSubmission[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Refs for cleanup
    const isMounted = useRef(true);
    const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

    // ========================================================================
    // DERIVED STATE
    // ========================================================================

    const currentSubmission = allSubmissions.find(s => s.status === 'in_progress') || null;
    const latestSubmission = allSubmissions.length > 0 ? allSubmissions[0] : null;

    const completedSubmissions = allSubmissions.filter(
        s => s.status === 'submitted' || s.status === 'graded'
    );
    const scoredSubmissions = completedSubmissions.filter(
        submission =>
            typeof submission.percentage === 'number'
            || typeof submission.bandScore === 'number'
    );
    const bestSubmission = scoredSubmissions.reduce<HomeworkSubmission | null>(
        (best, current) => {
            if (!best) return current;

            const currentValue = typeof current.percentage === 'number'
                ? current.percentage
                : current.bandScore ?? Number.NEGATIVE_INFINITY;
            const bestValue = typeof best.percentage === 'number'
                ? best.percentage
                : best.bandScore ?? Number.NEGATIVE_INFINITY;

            return currentValue > bestValue ? current : best;
        },
        null
    );

    const maxAttempts = homework?.config.maxAttempts ?? null;
    const attemptsUsed = completedSubmissions.length;
    const attemptsNullified = allSubmissions.some(
        (submission) => submission.attemptsNullified === true,
    );
    const attemptsRemaining = attemptsNullified
        ? 0
        : maxAttempts !== null
        ? Math.max(0, maxAttempts - attemptsUsed)
        : null;

    const now = Date.now();
    const isOverdue = homework ? now > homework.scheduling.dueDate : false;
    const isAvailable = homework
        ? (!homework.scheduling.availableFrom || now >= homework.scheduling.availableFrom)
        : false;

    const hasInProgressAttempt = currentSubmission !== null;
    const isBookHomework = isBookHomeworkCompatibilityProjection(homework);

    const canStartAttempt =
        homework !== null &&
        !isBookHomework &&
        homework.status !== 'closed' &&
        isAvailable &&
        !hasInProgressAttempt &&
        !attemptsNullified &&
        (attemptsRemaining === null || attemptsRemaining > 0) &&
        (!isOverdue || homework.config.lateSubmissionAllowed);

    // ========================================================================
    // DATA LOADING
    // ========================================================================

    const loadData = useCallback(async () => {
        if (!isMounted.current) return;

        try {
            setIsLoading(true);
            setError(null);

            const homeworkData = await getHomeworkById(homeworkId);

            if (!isMounted.current) return;

            if (!homeworkData) {
                // Preserve the ordinary missing-record submission read performed
                // by the legacy parallel loader. Only a validated Book shell
                // suppresses the legacy submission boundary.
                await getStudentSubmissionsForHomework(homeworkId, studentId);
                if (!isMounted.current) return;
                setError('Homework not found');
                setHomework(null);
                setAllSubmissions([]);
                return;
            }

            const submissionsData = isBookHomeworkCompatibilityProjection(homeworkData)
                ? []
                : await getStudentSubmissionsForHomework(homeworkId, studentId);

            if (!isMounted.current) return;

            setHomework(homeworkData);
            // Sort by attemptNumber descending (most recent first)
            setAllSubmissions(
                submissionsData.sort((a, b) => b.attemptNumber - a.attemptNumber)
            );
        } catch (err) {
            if (!isMounted.current) return;
            console.error('Error loading homework submission data:', err);
            setError(err instanceof Error ? err.message : 'Failed to load homework');
        } finally {
            if (isMounted.current) {
                setIsLoading(false);
            }
        }
    }, [homeworkId, studentId]);

    // ========================================================================
    // ACTIONS
    // ========================================================================

    const startAttempt = useCallback(async (): Promise<HomeworkSubmission> => {
        if (!canStartAttempt) {
            throw new HomeworkSubmissionError(
                'Cannot start a new attempt at this time',
                'UNKNOWN'
            );
        }

        try {
            const submission = await createSubmission(homeworkId, studentId, studentName);

            // Refresh data after starting
            await loadData();

            return submission;
        } catch (err) {
            if (err instanceof HomeworkSubmissionError) {
                throw err;
            }
            throw new HomeworkSubmissionError(
                err instanceof Error ? err.message : 'Failed to start attempt',
                'UNKNOWN'
            );
        }
    }, [canStartAttempt, homeworkId, studentId, studentName, loadData]);

    const refreshData = useCallback(async () => {
        await loadData();
    }, [loadData]);

    // ========================================================================
    // EFFECTS
    // ========================================================================

    // Initial load
    useEffect(() => {
        isMounted.current = true;
        loadData();

        return () => {
            isMounted.current = false;
        };
    }, [loadData]);

    // Auto-refresh
    useEffect(() => {
        if (refreshInterval > 0) {
            refreshTimerRef.current = setInterval(() => {
                loadData();
            }, refreshInterval * 1000);
        }

        return () => {
            if (refreshTimerRef.current) {
                clearInterval(refreshTimerRef.current);
                refreshTimerRef.current = null;
            }
        };
    }, [refreshInterval, loadData]);

    // ========================================================================
    // RETURN
    // ========================================================================

    return {
        // Data
        homework,
        currentSubmission,
        allSubmissions,
        latestSubmission,
        bestSubmission,

        // Attempt info
        maxAttempts,
        attemptsUsed,
        attemptsRemaining,
        attemptsNullified,

        // Status flags
        isLoading,
        error,
        isOverdue,
        isAvailable,
        canStartAttempt,
        hasInProgressAttempt,

        // Actions
        startAttempt,
        refreshData
    };
}

// ============================================================================
// STUDENT HOMEWORK LIST HOOK
// ============================================================================

export interface StudentHomeworkItem {
    homework: HomeworkAssignment;
    latestSubmission: HomeworkSubmission | null;
    bestSubmission: HomeworkSubmission | null;
    attemptsUsed: number;
    attemptsRemaining: number | null;
    isOverdue: boolean;
    canSubmit: boolean;
    canViewFeedback: boolean;
    status: 'not_started' | 'in_progress' | 'submitted' | 'graded' | 'overdue';
}

export interface UseStudentHomeworkListReturn {
    homeworkItems: StudentHomeworkItem[];
    isLoading: boolean;
    error: string | null;
    refreshData: () => Promise<void>;

    // Categorized lists
    notStarted: StudentHomeworkItem[];
    inProgress: StudentHomeworkItem[];
    completed: StudentHomeworkItem[];
    overdue: StudentHomeworkItem[];
}

export interface UseStudentHomeworkListOptions {
    enabled?: boolean;
    /** Canonical shell-owned membership input. Omit for callers outside the shell provider. */
    studentClasses?: readonly Pick<ClassSummary, 'id'>[];
}

export function useStudentHomeworkList(
    studentId: string,
    options: UseStudentHomeworkListOptions = {}
): UseStudentHomeworkListReturn {
    const [homeworkItems, setHomeworkItems] = useState<StudentHomeworkItem[]>([]);
    const enabled = options.enabled ?? true;
    const [isLoading, setIsLoading] = useState(Boolean(studentId) && enabled);
    const [error, setError] = useState<string | null>(null);
    const isMounted = useRef(true);
    const lastSuccessfulStudentIdRef = useRef<string | null>(null);

    const loadData = useCallback(async () => {
        if (!enabled || !studentId) {
            if (isMounted.current) {
                setHomeworkItems([]);
                setError(null);
                setIsLoading(false);
            }
            return;
        }

        try {
            setIsLoading(lastSuccessfulStudentIdRef.current !== studentId);
            setError(null);

            const { getBookCompatibleStudentHomeworkList } = await import(
                '../services/book-homework/bookHomeworkStudentList.service'
            );
            const items = await getBookCompatibleStudentHomeworkList(studentId, {
                studentClasses: options.studentClasses,
            });

            if (!isMounted.current) return;

            const now = Date.now();

            // Transform and categorize items
            const transformedItems: StudentHomeworkItem[] = items.map(item => {
                const { homework, submission, attemptsUsed, attemptsRemaining, isOverdue, canSubmit, canViewFeedback } = item;

                // Determine overall status
                let status: StudentHomeworkItem['status'] = 'not_started';
                if (submission) {
                    if (submission.status === 'in_progress') {
                        status = 'in_progress';
                    } else if (submission.status === 'graded') {
                        status = 'graded';
                    } else if (submission.status === 'submitted') {
                        status = 'submitted';
                    }
                }
                if (isOverdue && status !== 'submitted') {
                    status = 'overdue';
                }

                // Get best submission
                const completedSubmissions = items
                    .find(i => i.homework.id === homework.id)?.submission;

                return {
                    homework,
                    latestSubmission: submission,
                    bestSubmission: submission?.status === 'submitted' || submission?.status === 'graded'
                        ? submission
                        : null,
                    attemptsUsed,
                    attemptsRemaining,
                    isOverdue,
                    canSubmit,
                    canViewFeedback,
                    status
                };
            });

            setHomeworkItems(transformedItems);
            lastSuccessfulStudentIdRef.current = studentId;
        } catch (err) {
            if (!isMounted.current) return;
            console.error('Error loading student homework list:', err);
            setError(err instanceof Error ? err.message : 'Failed to load homework');
        } finally {
            if (isMounted.current) {
                setIsLoading(false);
            }
        }
    }, [enabled, options.studentClasses, studentId]);

    useEffect(() => {
        isMounted.current = true;
        if (enabled && studentId) {
            void loadData();
        } else {
            lastSuccessfulStudentIdRef.current = null;
            setHomeworkItems([]);
            setError(null);
            setIsLoading(false);
        }

        return () => {
            isMounted.current = false;
        };
    }, [enabled, loadData, studentId]);

    // Categorized lists
    const notStarted = homeworkItems.filter(i => i.status === 'not_started');
    const inProgress = homeworkItems.filter(i => i.status === 'in_progress');
    const completed = homeworkItems.filter(i => i.status === 'submitted' || i.status === 'graded');
    const overdue = homeworkItems.filter(i => i.status === 'overdue');

    return {
        homeworkItems,
        isLoading,
        error,
        refreshData: loadData,
        notStarted,
        inProgress,
        completed,
        overdue
    };
}
