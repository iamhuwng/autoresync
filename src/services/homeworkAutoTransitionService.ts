/**
 * homeworkAutoTransitionService.ts
 * 
 * Service for automatic homework status transitions.
 * Handles transitions like scheduled -> active -> past_due.
 * 
 * Per PRD-0016, Task 7.7:
 * - `scheduled` → `active` at availableFrom
 * - `active` → `past_due` at deadline
 * - Can be triggered on client-side check (dashboard load)
 * 
 * @module services/homeworkAutoTransitionService
 */

import {
    collection,
    query,
    where,
    getDocs,
    writeBatch
} from 'firebase/firestore';
import { db } from './firebase';
import {
    getHomeworkByTeacher,
    getHomeworkForStudent,
    updateHomeworkStatus
} from './homeworkManager';
import type { HomeworkAssignment, HomeworkStatus } from '../types/homework.types';

// ============================================================================
// TYPES
// ============================================================================

export interface TransitionResult {
    homeworkId: string;
    title: string;
    previousStatus: HomeworkStatus;
    newStatus: HomeworkStatus;
    transitionedAt: number;
}

export interface BatchTransitionResult {
    total: number;
    transitioned: number;
    failed: number;
    transitions: TransitionResult[];
    errors: { homeworkId: string; error: string }[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

const HOMEWORK_COLLECTION = 'homework_assignments';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Determine what status a homework should have based on current time
 */
function calculateCurrentStatus(homework: HomeworkAssignment): HomeworkStatus {
    const now = Date.now();
    const availableFrom = homework.scheduling.availableFrom || now;
    const dueDate = homework.scheduling.dueDate;

    // Closed status is manually set, don't auto-transition
    if (homework.status === 'closed') {
        return 'closed';
    }

    if (now < availableFrom) {
        return 'scheduled';
    } else if (now >= availableFrom && now < dueDate) {
        return 'active';
    } else {
        return 'past_due';
    }
}

/**
 * Check if a homework needs status transition
 */
function needsTransition(homework: HomeworkAssignment): boolean {
    if (homework.status === 'closed') {
        return false; // Never auto-transition closed homework
    }

    const expectedStatus = calculateCurrentStatus(homework);
    return expectedStatus !== homework.status;
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Check and transition all homework for a teacher
 * Call this on teacher dashboard load
 */
export async function checkTeacherHomeworkStatus(
    teacherId: string
): Promise<BatchTransitionResult> {
    const result: BatchTransitionResult = {
        total: 0,
        transitioned: 0,
        failed: 0,
        transitions: [],
        errors: []
    };

    try {
        const allHomework = await getHomeworkByTeacher(teacherId);
        result.total = allHomework.length;

        for (const homework of allHomework) {
            if (needsTransition(homework)) {
                try {
                    const previousStatus = homework.status;
                    await updateHomeworkStatus(homework.id);
                    const newStatus = calculateCurrentStatus(homework);

                    result.transitioned++;
                    result.transitions.push({
                        homeworkId: homework.id,
                        title: homework.title || homework.materialTitle,
                        previousStatus,
                        newStatus,
                        transitionedAt: Date.now()
                    });
                } catch (error) {
                    result.failed++;
                    result.errors.push({
                        homeworkId: homework.id,
                        error: error instanceof Error ? error.message : 'Unknown error'
                    });
                }
            }
        }
    } catch (error) {
        console.error('Error checking teacher homework status:', error);
    }

    return result;
}

/**
 * Check and transition all homework for a student
 * Call this on student dashboard/homework list load
 */
export async function checkStudentHomeworkStatus(
    studentId: string
): Promise<BatchTransitionResult> {
    const result: BatchTransitionResult = {
        total: 0,
        transitioned: 0,
        failed: 0,
        transitions: [],
        errors: []
    };

    try {
        const allHomework = await getHomeworkForStudent(studentId);
        result.total = allHomework.length;

        for (const homework of allHomework) {
            if (needsTransition(homework)) {
                try {
                    const previousStatus = homework.status;
                    await updateHomeworkStatus(homework.id);
                    const newStatus = calculateCurrentStatus(homework);

                    result.transitioned++;
                    result.transitions.push({
                        homeworkId: homework.id,
                        title: homework.title || homework.materialTitle,
                        previousStatus,
                        newStatus,
                        transitionedAt: Date.now()
                    });
                } catch (error) {
                    result.failed++;
                    result.errors.push({
                        homeworkId: homework.id,
                        error: error instanceof Error ? error.message : 'Unknown error'
                    });
                }
            }
        }
    } catch (error) {
        console.error('Error checking student homework status:', error);
    }

    return result;
}

/**
 * Get homework that needs attention (status transitions pending)
 * Useful for dashboard alerts
 */
export async function getHomeworkNeedingAttention(
    homework: HomeworkAssignment[]
): Promise<{
    becomingActive: HomeworkAssignment[];
    becomingPastDue: HomeworkAssignment[];
    recentlyPastDue: HomeworkAssignment[];
}> {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const oneDayAgo = now - (24 * 60 * 60 * 1000);

    const becomingActive: HomeworkAssignment[] = [];
    const becomingPastDue: HomeworkAssignment[] = [];
    const recentlyPastDue: HomeworkAssignment[] = [];

    for (const hw of homework) {
        if (hw.status === 'closed') continue;

        const availableFrom = hw.scheduling.availableFrom || now;
        const dueDate = hw.scheduling.dueDate;

        // Becoming active within an hour
        if (hw.status === 'scheduled' && availableFrom - now <= oneHour && availableFrom > now) {
            becomingActive.push(hw);
        }

        // Becoming past due within an hour
        if (hw.status === 'active' && dueDate - now <= oneHour && dueDate > now) {
            becomingPastDue.push(hw);
        }

        // Recently became past due (last 24 hours)
        if (hw.status === 'past_due' && dueDate > oneDayAgo && dueDate < now) {
            recentlyPastDue.push(hw);
        }
    }

    return {
        becomingActive,
        becomingPastDue,
        recentlyPastDue
    };
}

/**
 * Schedule status check for a specific homework
 * Returns a timeout handle that can be cleared if needed
 */
export function scheduleStatusTransition(
    homework: HomeworkAssignment,
    onTransition: (homework: HomeworkAssignment, newStatus: HomeworkStatus) => void
): NodeJS.Timeout | null {
    if (homework.status === 'closed') {
        return null;
    }

    const now = Date.now();
    const availableFrom = homework.scheduling.availableFrom || now;
    const dueDate = homework.scheduling.dueDate;

    let nextTransitionTime: number | null = null;
    let nextStatus: HomeworkStatus | null = null;

    if (homework.status === 'scheduled' && availableFrom > now) {
        nextTransitionTime = availableFrom;
        nextStatus = 'active';
    } else if (homework.status === 'active' && dueDate > now) {
        nextTransitionTime = dueDate;
        nextStatus = 'past_due';
    }

    if (nextTransitionTime && nextStatus) {
        const delay = nextTransitionTime - now;

        // Don't schedule if too far in the future (max 24 hours)
        if (delay > 24 * 60 * 60 * 1000) {
            return null;
        }

        return setTimeout(() => {
            onTransition(homework, nextStatus!);
        }, delay);
    }

    return null;
}

export default {
    checkTeacherHomeworkStatus,
    checkStudentHomeworkStatus,
    getHomeworkNeedingAttention,
    scheduleStatusTransition,
    calculateCurrentStatus,
    needsTransition
};
