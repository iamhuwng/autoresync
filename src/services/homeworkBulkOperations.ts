/**
 * homeworkBulkOperations.ts
 * 
 * Bulk operations for homework management.
 * Allows teachers to perform actions on multiple homework assignments at once.
 * 
 * Per PRD-0016, Task 7.3:
 * - Assign to multiple classes at once
 * - Extend deadline for all students
 * - Close all past-due homework
 * 
 * @module services/homeworkBulkOperations
 */

import {
    getHomeworkByTeacher,
    getHomeworkById,
    duplicateHomework,
    closeHomework,
    extendDeadline
} from './homeworkManager';
import type {
    HomeworkAssignment,
    HomeworkTarget,
    HomeworkConfig
} from '../types/homework.types';

// ============================================================================
// TYPES
// ============================================================================

export interface BulkOperationResult {
    success: number;
    failed: number;
    total: number;
    results: {
        id: string;
        success: boolean;
        error?: string;
        newId?: string;
    }[];
}

export interface BulkAssignInput {
    /** Original homework ID to duplicate */
    sourceHomeworkId: string;
    /** Class IDs to assign to */
    targetClassIds: string[];
    /** Optional: Override due date for all */
    dueDate?: Date;
    /** Optional: Override available from date for all */
    availableFrom?: Date;
    /** Optional: Override config for all */
    configOverrides?: Partial<HomeworkConfig>;
}

export interface BulkExtendDeadlineInput {
    /** Homework IDs to extend */
    homeworkIds: string[];
    /** New due date (absolute) */
    newDueDate?: Date;
    /** Or: extend by this many hours (relative) */
    extendByHours?: number;
}

export interface BulkCloseInput {
    /** Homework IDs to close */
    homeworkIds: string[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MS_PER_HOUR = 60 * 60 * 1000;

// ============================================================================
// BULK OPERATIONS
// ============================================================================

/**
 * Assign homework to multiple classes at once
 * Creates duplicates of the source homework for each target class
 */
export async function bulkAssignToClasses(
    input: BulkAssignInput
): Promise<BulkOperationResult> {
    const result: BulkOperationResult = {
        success: 0,
        failed: 0,
        total: input.targetClassIds.length,
        results: []
    };

    try {
        const sourceHomework = await getHomeworkById(input.sourceHomeworkId);
        if (!sourceHomework) {
            throw new Error('Source homework not found');
        }

        for (const classId of input.targetClassIds) {
            try {
                const target: HomeworkTarget = {
                    type: 'class',
                    classId
                };

                const newId = await duplicateHomework(input.sourceHomeworkId, {
                    target,
                    dueDate: input.dueDate,
                    availableFrom: input.availableFrom,
                    config: input.configOverrides
                });

                result.success++;
                result.results.push({
                    id: classId,
                    success: true,
                    newId
                });
            } catch (error) {
                result.failed++;
                result.results.push({
                    id: classId,
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }
    } catch (error) {
        console.error('Error in bulk assign:', error);
        // Mark all as failed
        for (const classId of input.targetClassIds) {
            result.results.push({
                id: classId,
                success: false,
                error: error instanceof Error ? error.message : 'Source homework not found'
            });
        }
        result.failed = input.targetClassIds.length;
    }

    return result;
}

/**
 * Extend deadline for multiple homework assignments
 * Can use absolute date or relative hours extension
 */
export async function bulkExtendDeadlines(
    input: BulkExtendDeadlineInput
): Promise<BulkOperationResult> {
    const result: BulkOperationResult = {
        success: 0,
        failed: 0,
        total: input.homeworkIds.length,
        results: []
    };

    for (const homeworkId of input.homeworkIds) {
        try {
            let newDueDate: Date;

            if (input.newDueDate) {
                newDueDate = input.newDueDate;
            } else if (input.extendByHours) {
                const homework = await getHomeworkById(homeworkId);
                if (!homework) {
                    throw new Error('Homework not found');
                }
                const currentDueDate = homework.scheduling.dueDate;
                newDueDate = new Date(currentDueDate + (input.extendByHours * MS_PER_HOUR));
            } else {
                throw new Error('Must provide newDueDate or extendByHours');
            }

            await extendDeadline(homeworkId, newDueDate);

            result.success++;
            result.results.push({
                id: homeworkId,
                success: true
            });
        } catch (error) {
            result.failed++;
            result.results.push({
                id: homeworkId,
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    return result;
}

/**
 * Close multiple homework assignments
 */
export async function bulkCloseHomework(
    input: BulkCloseInput
): Promise<BulkOperationResult> {
    const result: BulkOperationResult = {
        success: 0,
        failed: 0,
        total: input.homeworkIds.length,
        results: []
    };

    for (const homeworkId of input.homeworkIds) {
        try {
            await closeHomework(homeworkId);

            result.success++;
            result.results.push({
                id: homeworkId,
                success: true
            });
        } catch (error) {
            result.failed++;
            result.results.push({
                id: homeworkId,
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    return result;
}

/**
 * Close all past-due homework for a teacher
 */
export async function closeAllPastDueHomework(
    teacherId: string
): Promise<BulkOperationResult> {
    try {
        const allHomework = await getHomeworkByTeacher(teacherId);
        const pastDue = allHomework.filter(hw => hw.status === 'past_due');

        if (pastDue.length === 0) {
            return {
                success: 0,
                failed: 0,
                total: 0,
                results: []
            };
        }

        return await bulkCloseHomework({
            homeworkIds: pastDue.map(hw => hw.id)
        });
    } catch (error) {
        console.error('Error closing past due homework:', error);
        throw error;
    }
}

/**
 * Get statistics for homework management dashboard
 */
export async function getHomeworkStatistics(
    teacherId: string
): Promise<{
    total: number;
    byStatus: Record<HomeworkAssignment['status'], number>;
    overdueCount: number;
    activeCount: number;
    upcomingCount: number;
    recentlyCreated: number;
}> {
    try {
        const allHomework = await getHomeworkByTeacher(teacherId);
        const now = Date.now();
        const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);

        const byStatus: Record<HomeworkAssignment['status'], number> = {
            draft: 0,
            scheduled: 0,
            active: 0,
            past_due: 0,
            closed: 0
        };

        let recentlyCreated = 0;

        for (const hw of allHomework) {
            byStatus[hw.status]++;

            if (hw.createdAt > oneWeekAgo) {
                recentlyCreated++;
            }
        }

        return {
            total: allHomework.length,
            byStatus,
            overdueCount: byStatus.past_due,
            activeCount: byStatus.active,
            upcomingCount: byStatus.scheduled,
            recentlyCreated
        };
    } catch (error) {
        console.error('Error getting homework statistics:', error);
        throw error;
    }
}

/**
 * Select homework for bulk operations
 * Returns filtered list based on criteria
 */
export async function selectHomeworkForBulkOperation(
    teacherId: string,
    criteria: {
        status?: HomeworkAssignment['status'];
        classIds?: string[];
        materialIds?: string[];
        createdAfter?: Date;
        createdBefore?: Date;
        dueBefore?: Date;
        dueAfter?: Date;
    }
): Promise<HomeworkAssignment[]> {
    try {
        let allHomework = await getHomeworkByTeacher(teacherId);

        // Apply filters
        if (criteria.status) {
            allHomework = allHomework.filter(hw => hw.status === criteria.status);
        }

        if (criteria.classIds && criteria.classIds.length > 0) {
            allHomework = allHomework.filter(hw =>
                hw.target.type === 'class' &&
                criteria.classIds!.includes(hw.target.classId!)
            );
        }

        if (criteria.materialIds && criteria.materialIds.length > 0) {
            allHomework = allHomework.filter(hw =>
                criteria.materialIds!.includes(hw.materialId)
            );
        }

        if (criteria.createdAfter) {
            allHomework = allHomework.filter(hw =>
                hw.createdAt >= criteria.createdAfter!.getTime()
            );
        }

        if (criteria.createdBefore) {
            allHomework = allHomework.filter(hw =>
                hw.createdAt <= criteria.createdBefore!.getTime()
            );
        }

        if (criteria.dueBefore) {
            allHomework = allHomework.filter(hw =>
                hw.scheduling.dueDate <= criteria.dueBefore!.getTime()
            );
        }

        if (criteria.dueAfter) {
            allHomework = allHomework.filter(hw =>
                hw.scheduling.dueDate >= criteria.dueAfter!.getTime()
            );
        }

        return allHomework;
    } catch (error) {
        console.error('Error selecting homework:', error);
        throw error;
    }
}

export default {
    bulkAssignToClasses,
    bulkExtendDeadlines,
    bulkCloseHomework,
    closeAllPastDueHomework,
    getHomeworkStatistics,
    selectHomeworkForBulkOperation
};
