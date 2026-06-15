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
    deleteField,
    writeBatch,
} from 'firebase/firestore';
// @ts-ignore - JS service file
import { firestore as db } from './firebase';
import { isRestoreInProgress } from './restoreGuard';
import { getClass, getStudentClasses } from './classManager';
import type {
    HomeworkAssignment,
    HomeworkConfig,
    HomeworkMaterialSkill,
    HomeworkMaterialType,
    ReadingPassageHomeworkSet,
    ReadingPassageHomeworkSnapshot,
    HomeworkTarget,
    HomeworkStatus,
    HomeworkVisibility,
    HomeworkStats,
    HomeworkStudentOverride,
    StudentOverride
} from '../types/homework.types';
import type { AntiCheatConfig } from '../types/integrity.types';

const HOMEWORK_COLLECTION = 'homework_assignments';

/**
 * Input data for creating homework
 */
interface CreateHomeworkInput {
    materialId: string;
    materialTitle: string;
    materialType?: HomeworkMaterialType;
    materialSkill?: HomeworkMaterialSkill;
    teacherId: string;
    target: HomeworkTarget;
    config: HomeworkConfig;
    availableFrom?: Date;
    dueDate: Date;
    instructions?: string;
    title?: string;
    tags?: string[];

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

    // PRD-0036: Anti-cheat configuration
    antiCheatConfig?: AntiCheatConfig;

    // PRD-0052: Reading Passage homework snapshot contracts
    readingPassageSnapshot?: ReadingPassageHomeworkSnapshot;
    readingPassageSet?: ReadingPassageHomeworkSet;
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

const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

function stripUndefinedFields<T>(value: T): T {
    if (Array.isArray(value)) {
        return value.map((item) => stripUndefinedFields(item)) as T;
    }

    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value)
                .filter(([, currentValue]) => currentValue !== undefined)
                .map(([key, currentValue]) => [key, stripUndefinedFields(currentValue)])
        ) as T;
    }

    return value;
}

function normalizeHomeworkAssignment(homework: HomeworkAssignment): HomeworkAssignment {
    return {
        ...homework,
        tags: homework.tags ?? [],
        archived: homework.archived ?? false,
        studentOverrides: homework.studentOverrides ?? {},
    };
}

async function resolveAssignedCount(target: HomeworkTarget): Promise<number> {
    if (target.type === 'class') {
        const classData = await getClass(target.classId);
        return Object.keys(classData?.students ?? {}).length;
    }

    if (target.type === 'students' || target.type === 'group') {
        return target.studentIds.length;
    }

    return 0;
}

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
        const materialType = data.materialType || 'quiz';
        const materialId = materialType === 'reading-passage-set'
            ? `reading-passage-set:${homeworkRef.id}`
            : data.materialId;

        // Calculate initial assigned count based on target
        const totalAssigned = await resolveAssignedCount(data.target);

        const homework: HomeworkAssignment = {
            id: homeworkRef.id,
            createdBy: data.teacherId,
            createdAt: now,
            updatedAt: now,
            materialId,
            materialTitle: data.materialTitle,
            materialType,
            materialSkill: data.materialSkill || 'reading',
            target: data.target,
            scheduling: {
                availableFrom,
                dueDate,
            },
            config: data.config,
            visibility: DEFAULT_VISIBILITY,
            status: determineStatus(availableFrom, dueDate),
            tags: data.tags ?? [],
            archived: false,
            studentOverrides: {},
            title: data.title,
            description: data.instructions || '',
            stats: {
                ...DEFAULT_STATS,
                totalAssigned,
            },
            // Phase 3: THCS-specific configuration (only included when materialType is 'thcs-test')
            // Firestore rejects undefined field values, so strip them before writing
            ...(data.materialType === 'thcs-test' && data.thcsConfig
                ? { thcsConfig: Object.fromEntries(
                    Object.entries(data.thcsConfig).filter(([, v]) => v !== undefined)
                  ) }
                : {}),
            // PRD-0036: Anti-cheat configuration (Task 5.5)
            ...(data.antiCheatConfig ? { antiCheatConfig: data.antiCheatConfig } : {}),
            ...(materialType === 'reading-passage' && data.readingPassageSnapshot
                ? { readingPassageSnapshot: data.readingPassageSnapshot }
                : {}),
            ...(materialType === 'reading-passage-set' && data.readingPassageSet
                ? { readingPassageSet: data.readingPassageSet }
                : {}),
        };

        await setDoc(homeworkRef, stripUndefinedFields(homework));
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
        const sanitizedUpdates = Object.fromEntries(
            Object.entries(updates).filter(([, value]) => value !== undefined)
        );
        const payload: Record<string, unknown> = {
            ...sanitizedUpdates,
            updatedAt: Date.now(),
        };
        let existing: HomeworkAssignment | null = null;

        // If scheduling is being updated, recalculate status
        if (updates.scheduling) {
            const existingDoc = await getDoc(homeworkRef);
            if (!existingDoc.exists()) {
                throw new Error('Homework not found');
            }

            existing = normalizeHomeworkAssignment(existingDoc.data() as HomeworkAssignment);
            const availableFrom = updates.scheduling.availableFrom ?? existing.scheduling.availableFrom;
            const dueDate = updates.scheduling.dueDate ?? existing.scheduling.dueDate;

            payload.status = determineStatus(availableFrom, dueDate);
        }

        const nextStatus = payload.status as HomeworkStatus | undefined;
        if (nextStatus) {
            payload.closedAt = nextStatus === 'closed' ? Date.now() : deleteField();
        }

        if (updates.archived === false) {
            payload.archivedAt = deleteField();
            payload.trashExpiresAt = deleteField();
        }

        await updateDoc(homeworkRef, payload);
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
        await archiveHomework(id);
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
        const homework = snapshot.docs.map(doc => normalizeHomeworkAssignment(doc.data() as HomeworkAssignment));

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
        const homework = snapshot.docs.map(doc => normalizeHomeworkAssignment(doc.data() as HomeworkAssignment));

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
        const studentClasses = await getStudentClasses(studentId);
        const studentQuery = query(
            collection(db, HOMEWORK_COLLECTION),
            where('target.studentIds', 'array-contains', studentId)
        );
        const classQueries = studentClasses.map(cls =>
            query(
                collection(db, HOMEWORK_COLLECTION),
                where('target.classId', '==', cls.id)
            )
        );

        const [studentSnapshot, ...classSnapshots] = await Promise.all([
            getDocs(studentQuery),
            ...classQueries.map(currentQuery => getDocs(currentQuery))
        ]);

        const allHomework = [
            ...studentSnapshot.docs.map(doc => normalizeHomeworkAssignment(doc.data() as HomeworkAssignment)),
            ...classSnapshots.flatMap(snapshot =>
                snapshot.docs.map(doc => normalizeHomeworkAssignment(doc.data() as HomeworkAssignment))
            )
        ];

        // Remove duplicates and sort by due date
        const uniqueHomework = Array.from(
            new Map(allHomework.map(hw => [hw.id, hw])).values()
        ).filter(homework => !homework.archived && !isStudentExemptedFromHomework(homework, studentId));

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

        return normalizeHomeworkAssignment(snapshot.data() as HomeworkAssignment);
    } catch (error) {
        console.error('Error fetching homework:', error);
        throw new Error('Failed to fetch homework assignment');
    }
}

export function getStudentOverride(
    homework: HomeworkAssignment,
    studentId: string
): HomeworkStudentOverride {
    return normalizeHomeworkAssignment(homework).studentOverrides?.[studentId] ?? {};
}

export function getEffectiveHomeworkDueDate(
    homework: HomeworkAssignment,
    studentId: string
): number {
    return getStudentOverride(homework, studentId).dueDate ?? homework.scheduling.dueDate;
}

export function isStudentExemptedFromHomework(
    homework: HomeworkAssignment,
    studentId: string
): boolean {
    return getStudentOverride(homework, studentId).exempted ?? false;
}

export async function archiveHomework(id: string): Promise<void> {
    if (await isRestoreInProgress()) {
        throw new Error('Restore in progress');
    }

    const now = Date.now();
    const homeworkRef = doc(db, HOMEWORK_COLLECTION, id);

    await updateDoc(homeworkRef, {
        archived: true,
        archivedAt: now,
        trashExpiresAt: now + TRASH_RETENTION_MS,
        updatedAt: now,
    });
}

export async function restoreHomework(id: string): Promise<void> {
    if (await isRestoreInProgress()) {
        throw new Error('Restore in progress');
    }

    const homeworkRef = doc(db, HOMEWORK_COLLECTION, id);
    const homeworkSnapshot = await getDoc(homeworkRef);

    if (!homeworkSnapshot.exists()) {
        throw new Error('Homework not found');
    }

    const homework = normalizeHomeworkAssignment(homeworkSnapshot.data() as HomeworkAssignment);

    if (typeof homework.trashExpiresAt === 'number' && homework.trashExpiresAt < Date.now()) {
        throw new Error('This homework has been permanently deleted.');
    }

    await updateDoc(homeworkRef, {
        archived: false,
        archivedAt: deleteField(),
        trashExpiresAt: deleteField(),
        status: 'draft',
        updatedAt: Date.now(),
    });
}

export async function permanentlyDeleteHomework(id: string): Promise<void> {
    if (await isRestoreInProgress()) {
        throw new Error('Restore in progress');
    }

    const homeworkRef = doc(db, HOMEWORK_COLLECTION, id);
    await deleteDoc(homeworkRef);
}

export async function updateStudentOverride(
    homeworkId: string,
    studentId: string,
    override: Partial<StudentOverride>
): Promise<void> {
    const updates: Record<string, unknown> = {};
    const keys: Array<keyof StudentOverride> = [
        'dueDate',
        'exempted',
        'exemptReason',
        'notes',
        'reminderCount',
        'lastRemindedAt',
    ];

    keys.forEach((key) => {
        const value = override[key];
        if (value !== undefined) {
            updates[`studentOverrides.${studentId}.${key}`] = value;
        }
    });

    if (Object.keys(updates).length === 0) {
        return;
    }

    const homeworkRef = doc(db, HOMEWORK_COLLECTION, homeworkId);
    await updateDoc(homeworkRef, updates);
}

/**
 * PRD-0034 Task 11.6 / Edge Case E5 (AC-7.7):
 * When the teacher extends the GLOBAL deadline, any per-student deadline overrides
 * that are now at or before the new global deadline are redundant → clear them.
 */
export async function clearSubsumedOverrides(
    homeworkId: string,
    newGlobalDeadline: number,
): Promise<void> {
    const homeworkRef = doc(db, HOMEWORK_COLLECTION, homeworkId);
    const snapshot = await getDoc(homeworkRef);

    if (!snapshot.exists()) {
        return;
    }

    const data = snapshot.data() as HomeworkAssignment;
    const overrides = data.studentOverrides ?? {};
    const updates: Record<string, unknown> = {};

    for (const [studentId, override] of Object.entries(overrides)) {
        if (override.dueDate !== undefined && override.dueDate <= newGlobalDeadline) {
            updates[`studentOverrides.${studentId}.dueDate`] = deleteField();
        }
    }

    if (Object.keys(updates).length > 0) {
        await updateDoc(homeworkRef, updates);
        console.log(`[clearSubsumedOverrides] Cleared ${Object.keys(updates).length} override(s) for homework ${homeworkId}`);
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
            tags: original.tags ?? [],
            antiCheatConfig: original.antiCheatConfig,
            // Phase 3: Preserve THCS config when duplicating
            ...(original.thcsConfig ? { thcsConfig: original.thcsConfig } : {}),
            ...(original.readingPassageSnapshot
                ? { readingPassageSnapshot: original.readingPassageSnapshot }
                : {}),
            ...(original.readingPassageSet
                ? { readingPassageSet: original.readingPassageSet }
                : {}),
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

// ─── Metadata Propagation ───────────────────────────────────────────────────

/**
 * Propagates test metadata changes (e.g., title rename) to all active
 * homework assignments that reference the given materialId.
 *
 * This is fire-and-forget — call it after a successful test save.
 * Failures are logged but never surface to the user.
 *
 * @param materialId - The test ID that was edited
 * @param updates    - Partial metadata fields to propagate
 */
export async function propagateTestMetadataToHomework(
    materialId: string,
    updates: { materialTitle?: string },
): Promise<void> {
    // Nothing to propagate
    if (!updates.materialTitle) return;

    try {
        const q = query(
            collection(db, HOMEWORK_COLLECTION),
            where('materialId', '==', materialId),
        );
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            console.log(`[propagateTestMetadata] No homework found for materialId=${materialId}`);
            return;
        }

        const batch = writeBatch(db);
        let updateCount = 0;

        snapshot.docs.forEach((docSnap) => {
            const data = docSnap.data();
            // Only update if the title actually changed
            if (updates.materialTitle && data.materialTitle !== updates.materialTitle) {
                batch.update(docSnap.ref, { materialTitle: updates.materialTitle });
                updateCount++;
            }
        });

        if (updateCount > 0) {
            await batch.commit();
            console.log(`✅ [propagateTestMetadata] Updated ${updateCount} homework assignment(s) for materialId=${materialId}`);
        } else {
            console.log(`[propagateTestMetadata] All homework already has current title for materialId=${materialId}`);
        }
    } catch (error) {
        // Fire-and-forget: never block the editor save
        console.warn('[propagateTestMetadata] Failed to propagate test metadata to homework:', error);
    }
}
