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
} from 'firebase/firestore';
// @ts-ignore - JS service file
import { firestore as db } from './firebase';
import { isRestoreInProgress } from './restoreGuard';
import type {
    HomeworkAssignment,
    HomeworkConfig,
    HomeworkTarget,
    HomeworkStatus,
    HomeworkVisibility,
    HomeworkStats
} from '../types/homework.types';

const HOMEWORK_COLLECTION = 'homework_assignments';

/**
 * Input data for creating homework
 */
interface CreateHomeworkInput {
    materialId: string;
    materialTitle: string;
    materialType?: 'quiz' | 'test' | 'thcs-test';
    materialSkill?: 'reading' | 'listening' | 'writing' | 'speaking';
    teacherId: string;
    target: HomeworkTarget;
    config: HomeworkConfig;
    availableFrom?: Date;
    dueDate: Date;
    instructions?: string;
    title?: string;

    // Phase 3: THCS-specific configuration
    thcsConfig?: {
        timerModeOverride?: 'strict' | 'informational' | 'none';
        lateSubmissionPolicy?: 'accept' | 'accept-late' | 'reject' | 'penalty';
        penaltyPercent?: number;
        maxAttempts?: number;
        feedbackTiming?: 'after-submission' | 'after-deadline' | 'manual';
        instructions?: string;
        versionKey?: string;
        pinToVersion?: boolean;
    };
}

/**
 * Default visibility settings
 */
const DEFAULT_VISIBILITY: HomeworkVisibility = {
    showTimer: true,
    showAttempts: true,
    showDueDate: true,
    showQuestionCount: true,
    showDuration: true,
};

/**
 * Default stats for new homework
 */
const DEFAULT_STATS: HomeworkStats = {
    totalAssigned: 0,
    started: 0,
    submitted: 0,
    lateSubmissions: 0,
};

/**
 * Create a new homework assignment
 */
export async function createHomework(data: CreateHomeworkInput): Promise<string> {
    try {
        // PRD-0026 §4.13.6: Block homework creation during restore
        if (await isRestoreInProgress()) {
            console.log('[Homework] createHomework blocked — restore in progress');
            throw new Error('Cannot create homework during system restore');
        }

        const homeworkRef = doc(collection(db, HOMEWORK_COLLECTION));
        const now = Date.now();
        const availableFrom = data.availableFrom?.getTime() || now;
        const dueDate = data.dueDate.getTime();

        // Calculate initial assigned count based on target
        let totalAssigned = 0;
        if (data.target.type === 'class') {
            // Would need to fetch class enrollment - set to 0 for now
            totalAssigned = 0;
        } else if (data.target.type === 'students') {
            totalAssigned = data.target.studentIds.length;
        } else if (data.target.type === 'group') {
            totalAssigned = data.target.studentIds.length;
        }

        const homework: HomeworkAssignment = {
            id: homeworkRef.id,
            createdBy: data.teacherId,
            createdAt: now,
            updatedAt: now,
            materialId: data.materialId,
            materialTitle: data.materialTitle,
            materialType: data.materialType || 'quiz',
            materialSkill: data.materialSkill || 'reading',
            target: data.target,
            scheduling: {
                availableFrom,
                dueDate,
            },
            config: data.config,
            visibility: DEFAULT_VISIBILITY,
            status: determineStatus(availableFrom, dueDate),
            title: data.title,
            description: data.instructions || '',
            stats: {
                ...DEFAULT_STATS,
                totalAssigned,
            },
            // Phase 3: THCS-specific configuration (only included when materialType is 'thcs-test')
            ...(data.materialType === 'thcs-test' && data.thcsConfig ? { thcsConfig: data.thcsConfig } : {}),
        };

        await setDoc(homeworkRef, homework);
        return homeworkRef.id;
    } catch (error) {
        console.error('Error creating homework:', error);
        throw new Error('Failed to create homework assignment');
    }
}

/**
 * Update an existing homework assignment
 */
export async function updateHomework(
    id: string,
    updates: Partial<Omit<HomeworkAssignment, 'id' | 'createdAt' | 'createdBy'>>
): Promise<void> {
    try {
        const homeworkRef = doc(db, HOMEWORK_COLLECTION, id);

        // If scheduling is being updated, recalculate status
        if (updates.scheduling) {
            const existingDoc = await getDoc(homeworkRef);
            if (!existingDoc.exists()) {
                throw new Error('Homework not found');
            }

            const existing = existingDoc.data() as HomeworkAssignment;
            const availableFrom = updates.scheduling.availableFrom ?? existing.scheduling.availableFrom;
            const dueDate = updates.scheduling.dueDate ?? existing.scheduling.dueDate;

            updates.status = determineStatus(availableFrom, dueDate);
        }

        await updateDoc(homeworkRef, {
            ...updates,
            updatedAt: Date.now(),
        });
    } catch (error) {
        console.error('Error updating homework:', error);
        throw new Error('Failed to update homework assignment');
    }
}

/**
 * Delete a homework assignment
 */
export async function deleteHomework(id: string): Promise<void> {
    try {
        const homeworkRef = doc(db, HOMEWORK_COLLECTION, id);
        await deleteDoc(homeworkRef);
    } catch (error) {
        console.error('Error deleting homework:', error);
        throw new Error('Failed to delete homework assignment');
    }
}

/**
 * Get all homework assignments created by a teacher
 */
export async function getHomeworkByTeacher(teacherId: string): Promise<HomeworkAssignment[]> {
    try {
        const q = query(
            collection(db, HOMEWORK_COLLECTION),
            where('createdBy', '==', teacherId)
        );

        const snapshot = await getDocs(q);
        const homework = snapshot.docs.map(doc => doc.data() as HomeworkAssignment);

        // Sort by createdAt descending in application code to avoid requiring composite index
        return homework.sort((a, b) => b.createdAt - a.createdAt);
    } catch (error) {
        console.error('Error fetching homework by teacher:', error);
        throw new Error('Failed to fetch homework assignments');
    }
}

/**
 * Get all homework assignments for a specific class
 */
export async function getHomeworkByClass(classId: string): Promise<HomeworkAssignment[]> {
    try {
        const q = query(
            collection(db, HOMEWORK_COLLECTION),
            where('target.classId', '==', classId)
        );

        const snapshot = await getDocs(q);
        const homework = snapshot.docs.map(doc => doc.data() as HomeworkAssignment);

        // Sort by dueDate descending in application code to avoid requiring composite index
        return homework.sort((a, b) => b.scheduling.dueDate - a.scheduling.dueDate);
    } catch (error) {
        console.error('Error fetching homework by class:', error);
        throw new Error('Failed to fetch homework for class');
    }
}

/**
 * Get homework assignments for a specific student
 */
export async function getHomeworkForStudent(studentId: string): Promise<HomeworkAssignment[]> {
    try {
        // Query for class-based assignments
        const classQuery = query(
            collection(db, HOMEWORK_COLLECTION),
            where('target.type', '==', 'class')
        );

        // Query for individual student assignments
        const studentQuery = query(
            collection(db, HOMEWORK_COLLECTION),
            where('target.studentIds', 'array-contains', studentId)
        );

        const [classSnapshot, studentSnapshot] = await Promise.all([
            getDocs(classQuery),
            getDocs(studentQuery)
        ]);

        const allHomework = [
            ...classSnapshot.docs.map(doc => doc.data() as HomeworkAssignment),
            ...studentSnapshot.docs.map(doc => doc.data() as HomeworkAssignment)
        ];

        // Remove duplicates and sort by due date
        const uniqueHomework = Array.from(
            new Map(allHomework.map(hw => [hw.id, hw])).values()
        );

        return uniqueHomework.sort((a, b) =>
            b.scheduling.dueDate - a.scheduling.dueDate
        );
    } catch (error) {
        console.error('Error fetching homework for student:', error);
        throw new Error('Failed to fetch homework assignments');
    }
}

/**
 * Get a single homework assignment by ID
 */
export async function getHomeworkById(id: string): Promise<HomeworkAssignment | null> {
    try {
        const homeworkRef = doc(db, HOMEWORK_COLLECTION, id);
        const snapshot = await getDoc(homeworkRef);

        if (!snapshot.exists()) {
            return null;
        }

        return snapshot.data() as HomeworkAssignment;
    } catch (error) {
        console.error('Error fetching homework:', error);
        throw new Error('Failed to fetch homework assignment');
    }
}

/**
 * Duplicate a homework assignment with modifications
 */
export async function duplicateHomework(
    id: string,
    modifications?: {
        target?: HomeworkTarget;
        availableFrom?: Date;
        dueDate?: Date;
        config?: Partial<HomeworkConfig>;
        title?: string;
    }
): Promise<string> {
    try {
        const original = await getHomeworkById(id);
        if (!original) {
            throw new Error('Original homework not found');
        }

        const newHomework: CreateHomeworkInput = {
            materialId: original.materialId,
            materialTitle: original.materialTitle,
            materialType: original.materialType,
            materialSkill: original.materialSkill,
            teacherId: original.createdBy,
            target: modifications?.target || original.target,
            config: modifications?.config
                ? { ...original.config, ...modifications.config }
                : original.config,
            availableFrom: modifications?.availableFrom || new Date(original.scheduling.availableFrom!),
            dueDate: modifications?.dueDate || new Date(original.scheduling.dueDate),
            instructions: original.description,
            title: modifications?.title || `${original.title || original.materialTitle} (Copy)`,
            // Phase 3: Preserve THCS config when duplicating
            ...(original.thcsConfig ? { thcsConfig: original.thcsConfig } : {}),
        };

        return await createHomework(newHomework);
    } catch (error) {
        console.error('Error duplicating homework:', error);
        throw new Error('Failed to duplicate homework assignment');
    }
}

/**
 * Determine homework status based on dates
 */
function determineStatus(availableFrom: number | undefined, dueDate: number): HomeworkStatus {
    const now = Date.now();
    const startTime = availableFrom || now;

    if (now < startTime) {
        return 'scheduled';
    } else if (now >= startTime && now < dueDate) {
        return 'active';
    } else {
        return 'past_due';
    }
}

/**
 * Update homework status (can be called periodically or on-demand)
 */
export async function updateHomeworkStatus(id: string): Promise<void> {
    try {
        const homework = await getHomeworkById(id);
        if (!homework) {
            throw new Error('Homework not found');
        }

        const newStatus = determineStatus(
            homework.scheduling.availableFrom,
            homework.scheduling.dueDate
        );

        if (newStatus !== homework.status) {
            await updateHomework(id, { status: newStatus });
        }
    } catch (error) {
        console.error('Error updating homework status:', error);
        throw new Error('Failed to update homework status');
    }
}

/**
 * Set homework status to closed
 */
export async function closeHomework(id: string): Promise<void> {
    try {
        await updateHomework(id, { status: 'closed' });
    } catch (error) {
        console.error('Error closing homework:', error);
        throw new Error('Failed to close homework');
    }
}

/**
 * Extend homework deadline
 */
export async function extendDeadline(id: string, newDueDate: Date): Promise<void> {
    try {
        const homework = await getHomeworkById(id);
        if (!homework) {
            throw new Error('Homework not found');
        }

        const newDueTimestamp = newDueDate.getTime();
        const newStatus = determineStatus(homework.scheduling.availableFrom, newDueTimestamp);

        await updateHomework(id, {
            scheduling: {
                ...homework.scheduling,
                dueDate: newDueTimestamp,
            },
            status: newStatus,
        });
    } catch (error) {
        console.error('Error extending deadline:', error);
        throw new Error('Failed to extend deadline');
    }
}
