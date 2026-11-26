/**
 * Assignment Manager Service
 * 
 * Manages student-teacher assignments with support for:
 * - Creating and removing assignments
 * - Querying assignments by teacher or student
 * - Assignment history tracking
 * - Real-time subscription to assignment changes
 */

import { ref, get, set, update, push, onValue, query, orderByChild, equalTo } from 'firebase/database';
import { getAuth } from 'firebase/auth';
import { database } from './firebase';
import type {
    StudentTeacherAssignment,
    AssignmentRequest,
    AssignmentHistory
} from '../types/assignment.types';
import { getUserByEmail } from './userService';
import { notifyCommittedEvent } from './notificationProducerClient';
import { logCreate, logDelete } from './auditService';

// ============================================================================
// CONSTANTS
// ============================================================================

const ASSIGNMENTS_REF = 'student_teacher_assignments';
const ASSIGNMENT_REQUESTS_REF = 'student_requests';
const ASSIGNMENT_HISTORY_REF = 'assignment_history';
const ASSIGNMENT_LINKS_REF = 'student_teacher_links';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate a unique ID for assignments
 */
function generateId(): string {
    return push(ref(database, ASSIGNMENTS_REF)).key || Date.now().toString();
}

/**
 * Get current timestamp
 */
function now(): number {
    return Date.now();
}

async function setAssignmentLink(
    teacherId: string,
    studentId: string,
    isActive: boolean
): Promise<void> {
    const linkRef = ref(database, `${ASSIGNMENT_LINKS_REF}/${teacherId}/${studentId}`);
    await set(linkRef, isActive ? true : null);
}

// ============================================================================
// ASSIGNMENT CRUD OPERATIONS
// ============================================================================

/**
 * Create a new student-teacher assignment
 * 
 * @param studentId - Student's user ID
 * @param teacherId - Teacher's user ID
 * @param assignedBy - Admin who is creating the assignment
 * @param courseIds - Optional array of course IDs to enroll student in
 * @returns Promise with success status and assignment ID
 */
export async function createAssignment(
    studentId: string,
    teacherId: string,
    assignedBy: string,
    courseIds?: string[]
): Promise<{ success: boolean; assignmentId?: string; error?: string }> {
    try {
        // Validate inputs
        if (!studentId || !teacherId || !assignedBy) {
            return {
                success: false,
                error: 'Missing required fields: studentId, teacherId, or assignedBy'
            };
        }

        // Check if assignment already exists
        const existingAssignment = await getActiveAssignment(studentId, teacherId);
        if (existingAssignment) {
            return {
                success: false,
                error: 'Assignment already exists between this student and teacher'
            };
        }

        const assignmentId = generateId();
        const timestamp = now();

        const assignment: StudentTeacherAssignment = {
            id: assignmentId,
            studentId,
            teacherId,
            assignedBy,
            assignedAt: timestamp,
            unassignedAt: null,
            coursesEnrolled: courseIds || [],
            status: 'active'
        };

        // Save assignment
        const assignmentRef = ref(database, `${ASSIGNMENTS_REF}/${assignmentId}`);
        await set(assignmentRef, assignment);
        await setAssignmentLink(teacherId, studentId, true);

        // Create history entry
        await createHistoryEntry({
            studentId,
            teacherId,
            action: 'assigned',
            performedBy: assignedBy,
            timestamp,
            coursesEnrolled: courseIds
        });

        // Log audit event (Task 6.6)
        logCreate(null, 'assignment', assignmentId, {
            studentId,
            teacherId,
            assignedBy,
            courseIds
        });

        return {
            success: true,
            assignmentId
        };
    } catch (error) {
        console.error('Error creating assignment:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred'
        };
    }
}

const pairReleaseLocks = new Map<string, Promise<unknown>>();

async function withPairReleaseLock<T>(
    teacherId: string,
    studentId: string,
    work: () => Promise<T>
): Promise<T> {
    const key = `${teacherId}::${studentId}`;
    const previous = pairReleaseLocks.get(key) ?? Promise.resolve();
    let releaseLock!: () => void;
    const current = new Promise<void>((resolve) => {
        releaseLock = resolve;
    });
    const chained = previous.then(() => current);
    pairReleaseLocks.set(key, chained);

    await previous;
    try {
        return await work();
    } finally {
        releaseLock();
        if (pairReleaseLocks.get(key) === chained) {
            pairReleaseLocks.delete(key);
        }
    }
}

function hasOtherActivePairAssignment(
    pairSnapshot: { exists: () => boolean; val: () => unknown } | null | undefined,
    teacherId: string,
    studentId: string,
    excludedIds: Set<string>
): boolean {
    if (!pairSnapshot || typeof pairSnapshot.exists !== 'function' || !pairSnapshot.exists()) {
        return false;
    }
    const pairAssignments = pairSnapshot.val() as Record<string, StudentTeacherAssignment> | null;
    if (!pairAssignments || typeof pairAssignments !== 'object') {
        return false;
    }
    return Object.entries(pairAssignments).some(
        ([key, item]) =>
            !excludedIds.has(item?.id || key) &&
            item?.studentId === studentId &&
            item?.teacherId === teacherId &&
            item?.status === 'active'
    );
}

async function releasePairAssignmentsAtomically(
    teacherId: string,
    studentId: string,
    entries: Array<{ assignmentId: string; assignment: StudentTeacherAssignment }>,
    actorUid: string,
    reason?: string
): Promise<void> {
    await withPairReleaseLock(teacherId, studentId, async () => {
        const timestamp = now();
        const targetIds = new Set(entries.map((entry) => entry.assignmentId));

        // Check whether any active assignment outside this batch still binds
        // this teacher-student pair so the shared link is cleared atomically
        // whenever the final active row(s) are released.
        const pairQuery = query(
            ref(database, ASSIGNMENTS_REF),
            orderByChild('teacherId'),
            equalTo(teacherId)
        );
        const pairSnapshot = await get(pairQuery);
        const hasRemainingActive = hasOtherActivePairAssignment(
            pairSnapshot,
            teacherId,
            studentId,
            targetIds
        );

        const patch: Record<string, unknown> = {};
        for (const { assignmentId } of entries) {
            patch[`${ASSIGNMENTS_REF}/${assignmentId}/unassignedAt`] = timestamp;
            patch[`${ASSIGNMENTS_REF}/${assignmentId}/status`] = 'removed';
        }
        if (!hasRemainingActive) {
            patch[`${ASSIGNMENT_LINKS_REF}/${teacherId}/${studentId}`] = null;
        }
        await update(ref(database), patch);

        // Cross-client concurrency guard: if another active row existed before
        // our write (so we preserved the link), re-check after commit in case a
        // concurrent client removed the last remaining active row at the same time.
        if (hasRemainingActive) {
            const postSnapshot = await get(pairQuery);
            if (
                postSnapshot &&
                typeof postSnapshot.exists === 'function' &&
                !hasOtherActivePairAssignment(postSnapshot, teacherId, studentId, new Set())
            ) {
                await update(ref(database), {
                    [`${ASSIGNMENT_LINKS_REF}/${teacherId}/${studentId}`]: null,
                });
            }
        }

        for (const { assignmentId, assignment } of entries) {
            await createHistoryEntry({
                studentId: assignment.studentId,
                teacherId: assignment.teacherId,
                action: 'unassigned',
                performedBy: actorUid,
                timestamp,
                reason: reason || 'Released'
            });

            logDelete(null, 'assignment', assignmentId, {
                studentId: assignment.studentId,
                teacherId: assignment.teacherId,
                performedBy: actorUid,
                reason
            });
        }
    });
}

export interface RemoveAssignmentsResult {
    success: boolean;
    releasedIds: string[];
    failed: Array<{ assignmentId: string; error: string }>;
}

/**
 * Remove one or more student-teacher assignments (soft delete), reconciling
 * all rows and the shared authorization link atomically per teacher-student pair.
 */
export async function removeAssignments(
    assignmentIds: string[],
    reason?: string
): Promise<RemoveAssignmentsResult> {
    const uniqueIds = Array.from(new Set(assignmentIds.filter((id): id is string => Boolean(id))));
    if (uniqueIds.length === 0) {
        return {
            success: false,
            releasedIds: [],
            failed: [{ assignmentId: '', error: 'Assignment ID is required' }],
        };
    }

    const actorUid = getAuth().currentUser?.uid;
    if (!actorUid) {
        return {
            success: false,
            releasedIds: [],
            failed: uniqueIds.map((assignmentId) => ({
                assignmentId,
                error: 'Authentication required to release assignment',
            })),
        };
    }

    const releasedIds: string[] = [];
    const failed: Array<{ assignmentId: string; error: string }> = [];
    const groupsByPair = new Map<
        string,
        {
            teacherId: string;
            studentId: string;
            entries: Array<{ assignmentId: string; assignment: StudentTeacherAssignment }>;
        }
    >();

    await Promise.all(
        uniqueIds.map(async (assignmentId) => {
            try {
                const snapshot = await get(ref(database, `${ASSIGNMENTS_REF}/${assignmentId}`));
                if (!snapshot.exists()) {
                    failed.push({ assignmentId, error: 'Assignment not found' });
                    return;
                }
                const assignment = snapshot.val() as StudentTeacherAssignment;
                const pairKey = `${assignment.teacherId}::${assignment.studentId}`;
                const existingGroup = groupsByPair.get(pairKey);
                if (existingGroup) {
                    existingGroup.entries.push({ assignmentId, assignment });
                } else {
                    groupsByPair.set(pairKey, {
                        teacherId: assignment.teacherId,
                        studentId: assignment.studentId,
                        entries: [{ assignmentId, assignment }],
                    });
                }
            } catch (error) {
                console.error(`Error loading assignment ${assignmentId} for release:`, error);
                failed.push({
                    assignmentId,
                    error: error instanceof Error ? error.message : 'Unknown error occurred',
                });
            }
        })
    );

    for (const group of groupsByPair.values()) {
        try {
            await releasePairAssignmentsAtomically(
                group.teacherId,
                group.studentId,
                group.entries,
                actorUid,
                reason
            );
            group.entries.forEach(({ assignmentId }) => releasedIds.push(assignmentId));
        } catch (error) {
            console.error('Error removing assignments:', error);
            const message = error instanceof Error ? error.message : 'Unknown error occurred';
            group.entries.forEach(({ assignmentId }) =>
                failed.push({ assignmentId, error: message })
            );
        }
    }

    return {
        success: failed.length === 0 && releasedIds.length > 0,
        releasedIds,
        failed,
    };
}

/**
 * Remove a student-teacher assignment (soft delete)
 * 
 * @param assignmentId - ID of the assignment to remove
 * @param reason - Optional reason for removal
 * @returns Promise with success status
 */
export async function removeAssignment(
    assignmentId: string,
    reason?: string
): Promise<{ success: boolean; error?: string }> {
    try {
        if (!assignmentId) {
            return {
                success: false,
                error: 'Assignment ID is required'
            };
        }

        const actorUid = getAuth().currentUser?.uid;
        if (!actorUid) {
            return {
                success: false,
                error: 'Authentication required to release assignment'
            };
        }

        const snapshot = await get(ref(database, `${ASSIGNMENTS_REF}/${assignmentId}`));
        if (!snapshot.exists()) {
            return {
                success: false,
                error: 'Assignment not found'
            };
        }

        const assignment = snapshot.val() as StudentTeacherAssignment;
        await releasePairAssignmentsAtomically(
            assignment.teacherId,
            assignment.studentId,
            [{ assignmentId, assignment }],
            actorUid,
            reason
        );

        return { success: true };
    } catch (error) {
        console.error('Error removing assignment:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred'
        };
    }
}

/**
 * Get active assignment between a student and teacher
 */
async function getActiveAssignment(
    studentId: string,
    teacherId: string
): Promise<StudentTeacherAssignment | null> {
    try {
        const snapshot = await get(query(
            ref(database, ASSIGNMENTS_REF),
            orderByChild('teacherId'),
            equalTo(teacherId)
        ));

        if (!snapshot.exists()) {
            return null;
        }

        const assignments = snapshot.val();
        const activeAssignment = Object.values(assignments).find(
            (assignment: any) =>
                assignment.studentId === studentId &&
                assignment.teacherId === teacherId &&
                assignment.status === 'active'
        );

        return activeAssignment as StudentTeacherAssignment || null;
    } catch (error) {
        console.error('Error getting active assignment:', error);
        return null;
    }
}

// ============================================================================
// QUERY OPERATIONS
// ============================================================================

/**
 * Get all students assigned to a specific teacher
 * 
 * @param teacherId - Teacher's user ID
 * @returns Promise with array of assignments
 */
export async function getAssignmentsByTeacher(
    teacherId: string
): Promise<StudentTeacherAssignment[]> {
    if (!teacherId) {
        return [];
    }

    try {
        // Indexed query (`.indexOn: teacherId`) instead of downloading every
        // assignment in the system and filtering on the client.
        const snapshot = await get(query(
            ref(database, ASSIGNMENTS_REF),
            orderByChild('teacherId'),
            equalTo(teacherId)
        ));

        if (!snapshot.exists()) {
            return [];
        }

        const assignments = snapshot.val();
        const teacherAssignments = Object.values(assignments).filter(
            (assignment: any) =>
                assignment.teacherId === teacherId &&
                assignment.status === 'active'
        );

        return teacherAssignments as StudentTeacherAssignment[];
    } catch (error) {
        console.error('Error getting assignments by teacher:', error);
        throw error;
    }
}

/**
 * Get all teachers assigned to a specific student
 * 
 * @param studentId - Student's user ID
 * @returns Promise with array of assignments
 */
export async function getAssignmentsByStudent(
    studentId: string
): Promise<StudentTeacherAssignment[]> {
    try {
        if (!studentId) {
            return [];
        }

        // Indexed query (`.indexOn: studentId`).
        const snapshot = await get(query(
            ref(database, ASSIGNMENTS_REF),
            orderByChild('studentId'),
            equalTo(studentId)
        ));

        if (!snapshot.exists()) {
            return [];
        }

        const assignments = snapshot.val();
        const studentAssignments = Object.values(assignments).filter(
            (assignment: any) =>
                assignment.studentId === studentId &&
                assignment.status === 'active'
        );

        return studentAssignments as StudentTeacherAssignment[];
    } catch (error) {
        console.error('Error getting assignments by student:', error);
        return [];
    }
}

/**
 * Get ALL assignments in a single batch operation (fixes N+1 query problem)
 * 
 * This method fetches all assignments at once and organizes them by student and teacher.
 * Use this instead of calling getAssignmentsByStudent() or getAssignmentsByTeacher() 
 * in a loop when you need assignments for multiple users.
 * 
 * @returns Promise with organized assignment data
 * 
 * @example
 * // BEFORE (N+1 Problem - 100 queries for 100 students):
 * for (const student of students) {
 *   const assignments = await getAssignmentsByStudent(student.uid);
 * }
 * 
 * // AFTER (1 query total):
 * const { byStudent, byTeacher, all } = await getAllAssignments();
 * students.forEach(student => {
 *   const assignments = byStudent[student.uid] || [];
 * });
 */
export async function getAllAssignments(): Promise<{
    all: StudentTeacherAssignment[];
    byStudent: Record<string, StudentTeacherAssignment[]>;
    byTeacher: Record<string, StudentTeacherAssignment[]>;
}> {
    try {
        const assignmentsRef = ref(database, ASSIGNMENTS_REF);
        const snapshot = await get(assignmentsRef);

        if (!snapshot.exists()) {
            return {
                all: [],
                byStudent: {},
                byTeacher: {}
            };
        }

        const assignments = snapshot.val();
        const allAssignments = Object.values(assignments) as StudentTeacherAssignment[];

        // Filter active assignments
        const activeAssignments = allAssignments.filter(a => a.status === 'active');

        // Organize by student ID
        const byStudent: Record<string, StudentTeacherAssignment[]> = {};
        activeAssignments.forEach(assignment => {
            if (!byStudent[assignment.studentId]) {
                byStudent[assignment.studentId] = [];
            }
            byStudent[assignment.studentId]!.push(assignment);
        });

        // Organize by teacher ID
        const byTeacher: Record<string, StudentTeacherAssignment[]> = {};
        activeAssignments.forEach(assignment => {
            if (!byTeacher[assignment.teacherId]) {
                byTeacher[assignment.teacherId] = [];
            }
            byTeacher[assignment.teacherId]!.push(assignment);
        });

        return {
            all: activeAssignments,
            byStudent,
            byTeacher
        };
    } catch (error) {
        console.error('Error getting all assignments:', error);
        return {
            all: [],
            byStudent: {},
            byTeacher: {}
        };
    }
}


/**
 * Get assignment history for a user (student or teacher)
 * 
 * @param userId - User ID (student or teacher)
 * @param type - Type of user ('student' or 'teacher')
 * @returns Promise with array of history entries
 */
export async function getAssignmentHistory(
    userId: string,
    type: 'student' | 'teacher'
): Promise<AssignmentHistory[]> {
    try {
        if (!userId) {
            return [];
        }

        const historyRef = ref(database, ASSIGNMENT_HISTORY_REF);
        const snapshot = await get(historyRef);

        if (!snapshot.exists()) {
            return [];
        }

        const history = snapshot.val();
        const userHistory = Object.values(history).filter((entry: any) => {
            if (type === 'student') {
                return entry.studentId === userId;
            } else {
                return entry.teacherId === userId;
            }
        });

        // Sort by timestamp descending (most recent first)
        return (userHistory as AssignmentHistory[]).sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
        console.error('Error getting assignment history:', error);
        return [];
    }
}

/**
 * Check if a student is assigned to a specific teacher
 * 
 * @param studentId - Student's user ID
 * @param teacherId - Teacher's user ID
 * @returns Promise with boolean result
 */
export async function isStudentAssignedToTeacher(
    studentId: string,
    teacherId: string
): Promise<boolean> {
    try {
        const assignment = await getActiveAssignment(studentId, teacherId);
        return assignment !== null;
    } catch (error) {
        console.error('Error checking assignment:', error);
        return false;
    }
}

// ============================================================================
// REAL-TIME SUBSCRIPTIONS
// ============================================================================

/**
 * Subscribe to assignment changes for a user
 * 
 * @param userId - User ID to subscribe to
 * @param callback - Callback function to receive updates
 * @returns Unsubscribe function
 */
export function subscribeToAssignments(
    userId: string,
    callback: (assignments: StudentTeacherAssignment[]) => void
): () => void {
    const teacherQuery = query(
        ref(database, ASSIGNMENTS_REF),
        orderByChild('teacherId'),
        equalTo(userId)
    );
    const studentQuery = query(
        ref(database, ASSIGNMENTS_REF),
        orderByChild('studentId'),
        equalTo(userId)
    );

    let teacherAssignments: StudentTeacherAssignment[] = [];
    let studentAssignments: StudentTeacherAssignment[] = [];

    const emitMerged = () => {
        const merged = new Map<string, StudentTeacherAssignment>();
        for (const item of [...teacherAssignments, ...studentAssignments]) {
            if (item.status === 'active' && (item.teacherId === userId || item.studentId === userId)) {
                merged.set(item.id, item);
            }
        }
        callback(Array.from(merged.values()));
    };

    const extractActive = (snapshot: { exists: () => boolean; val: () => unknown }): StudentTeacherAssignment[] => {
        if (!snapshot.exists()) {
            return [];
        }
        const assignments = snapshot.val() as Record<string, StudentTeacherAssignment>;
        return Object.values(assignments).filter(
            (assignment) =>
                (assignment.studentId === userId || assignment.teacherId === userId) &&
                assignment.status === 'active'
        );
    };

    const unsubscribeTeacher = onValue(teacherQuery, (snapshot) => {
        teacherAssignments = extractActive(snapshot);
        emitMerged();
    });

    const unsubscribeStudent = onValue(studentQuery, (snapshot) => {
        studentAssignments = extractActive(snapshot);
        emitMerged();
    });

    return () => {
        if (typeof unsubscribeTeacher === 'function') unsubscribeTeacher();
        if (typeof unsubscribeStudent === 'function') unsubscribeStudent();
    };
}

// ============================================================================
// ASSIGNMENT REQUESTS
// ============================================================================

/**
 * Create a request for a teacher to be assigned a student
 * 
 * @param teacherId - Teacher making the request
 * @param studentEmail - Email of the student being requested
 * @returns Promise with success status and request ID
 */
export async function createStudentRequest(
    teacherId: string,
    studentEmail: string
): Promise<{ success: boolean; requestId?: string; error?: string }> {
    try {
        const normalizedEmail = (studentEmail || '').trim().toLowerCase();
        if (!teacherId || !normalizedEmail) {
            return {
                success: false,
                error: 'Teacher ID and student email are required'
            };
        }

        // Check for duplicate pending request
        const existingRequest = await getPendingRequest(teacherId, normalizedEmail);
        if (existingRequest) {
            return {
                success: false,
                error: 'A pending request already exists for this student'
            };
        }

        const requestId = generateId();
        const timestamp = now();

        const request: AssignmentRequest = {
            id: requestId,
            teacherId,
            studentEmail: normalizedEmail,
            requestedAt: timestamp,
            status: 'pending'
        };

        const requestRef = ref(database, `${ASSIGNMENT_REQUESTS_REF}/${requestId}`);
        await set(requestRef, request);

        return {
            success: true,
            requestId
        };
    } catch (error) {
        console.error('Error creating student request:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred'
        };
    }
}

/**
 * Get pending request for a teacher and student email
 */
async function getPendingRequest(
    teacherId: string,
    studentEmail: string
): Promise<AssignmentRequest | null> {
    try {
        const normalizedEmail = studentEmail.trim().toLowerCase();
        const snapshot = await get(query(
            ref(database, ASSIGNMENT_REQUESTS_REF),
            orderByChild('teacherId'),
            equalTo(teacherId)
        ));

        if (!snapshot.exists()) {
            return null;
        }

        const requests = snapshot.val();
        const pendingRequest = Object.values(requests).find(
            (request: any) =>
                request.teacherId === teacherId &&
                typeof request.studentEmail === 'string' &&
                request.studentEmail.trim().toLowerCase() === normalizedEmail &&
                request.status === 'pending'
        );

        return pendingRequest as AssignmentRequest || null;
    } catch (error) {
        console.error('Error getting pending request:', error);
        return null;
    }
}

/**
 * Get assignment requests submitted by a specific teacher (indexed query)
 */
export async function getAssignmentRequestsByTeacher(
    teacherId: string
): Promise<AssignmentRequest[]> {
    if (!teacherId) {
        return [];
    }

    try {
        const snapshot = await get(query(
            ref(database, ASSIGNMENT_REQUESTS_REF),
            orderByChild('teacherId'),
            equalTo(teacherId)
        ));

        if (!snapshot.exists()) {
            return [];
        }

        const requests = snapshot.val();
        return (Object.values(requests) as AssignmentRequest[])
            .filter((request) => request.teacherId === teacherId)
            .sort((a, b) => (b.requestedAt || 0) - (a.requestedAt || 0));
    } catch (error) {
        console.error('Error getting requests by teacher:', error);
        throw error;
    }
}

/**
 * Get all assignment requests (for admin)
 */
export async function getAllAssignmentRequests(): Promise<AssignmentRequest[]> {
    try {
        const requestsRef = ref(database, ASSIGNMENT_REQUESTS_REF);
        const snapshot = await get(requestsRef);

        if (!snapshot.exists()) {
            return [];
        }

        const requests = snapshot.val();
        // Sort by requestedAt descending
        return Object.values(requests).sort((a: any, b: any) => b.requestedAt - a.requestedAt) as AssignmentRequest[];
    } catch (error) {
        console.error('Error getting all requests:', error);
        return [];
    }
}

/**
 * Approve a student request
 */
export async function approveStudentRequest(
    requestId: string,
    approvedBy: string
): Promise<{ success: boolean; error?: string }> {
    try {
        if (!approvedBy || getAuth().currentUser?.uid !== approvedBy) {
            return { success: false, error: 'Approver does not match the signed-in user' };
        }
        // 1. Get request
        const requestRef = ref(database, `${ASSIGNMENT_REQUESTS_REF}/${requestId}`);
        const snapshot = await get(requestRef);

        if (!snapshot.exists()) {
            return { success: false, error: 'Request not found' };
        }

        const request = snapshot.val() as AssignmentRequest;

        if (request.status !== 'pending') {
            return { success: false, error: 'Request is not pending' };
        }

        // 2. Find student user
        const student = await getUserByEmail(request.studentEmail);
        if (!student) {
            return { success: false, error: `Student with email ${request.studentEmail} not found` };
        }

        // Commit the approval and assignment before attempting its notices.
        const currentAssignments = await get(ref(database, ASSIGNMENTS_REF));
        const assignments = currentAssignments.exists()
            ? Object.values(currentAssignments.val() as Record<string, StudentTeacherAssignment>)
            : [];
        const existing = assignments.find((item) => item.studentId === student.uid
            && item.teacherId === request.teacherId && item.status === 'active');
        const timestamp = now();
        const assignmentId = existing?.id || generateId();
        const historyId = existing ? null : push(ref(database, ASSIGNMENT_HISTORY_REF)).key;
        const patch: Record<string, unknown> = {
            [`${ASSIGNMENT_REQUESTS_REF}/${requestId}`]: {
                ...request,
                status: 'approved',
                reviewedBy: approvedBy,
                reviewedAt: timestamp,
                studentId: student.uid,
                assignmentId,
            },
        };
        if (!existing) {
            patch[`${ASSIGNMENTS_REF}/${assignmentId}`] = {
                id: assignmentId,
                studentId: student.uid,
                teacherId: request.teacherId,
                assignedBy: approvedBy,
                assignedAt: timestamp,
                unassignedAt: null,
                coursesEnrolled: [],
                status: 'active',
            } satisfies StudentTeacherAssignment;
            patch[`${ASSIGNMENT_LINKS_REF}/${request.teacherId}/${student.uid}`] = true;
            if (historyId) patch[`${ASSIGNMENT_HISTORY_REF}/${historyId}`] = {
                id: historyId,
                studentId: student.uid,
                teacherId: request.teacherId,
                action: 'assigned',
                performedBy: approvedBy,
                timestamp,
                coursesEnrolled: [],
            };
        }
        await update(ref(database), patch);
        if (!existing) logCreate(null, 'assignment', assignmentId, {
            studentId: student.uid, teacherId: request.teacherId, assignedBy: approvedBy,
        });
        try {
            void notifyCommittedEvent({ eventKind: 'assignment-approved', requestId, occurredAt: timestamp });
        } catch (error) {
            console.error('Failed to start assignment approval notice:', error);
        }

        return { success: true };
    } catch (error) {
        console.error('Error approving request:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

/**
 * Deny a student request
 */
export async function denyStudentRequest(
    requestId: string,
    deniedBy: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const requestRef = ref(database, `${ASSIGNMENT_REQUESTS_REF}/${requestId}`);
        const snapshot = await get(requestRef);

        if (!snapshot.exists()) {
            return { success: false, error: 'Request not found' };
        }

        await update(requestRef, {
            status: 'denied',
            reviewedBy: deniedBy,
            reviewedAt: now()
        });

        return { success: true };
    } catch (error) {
        console.error('Error denying request:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

// ============================================================================
// HISTORY TRACKING
// ============================================================================

/**
 * Create a history entry for an assignment action
 */
async function createHistoryEntry(
    entry: Omit<AssignmentHistory, 'id'>
): Promise<void> {
    try {
        const historyId = generateId();
        const historyEntry: AssignmentHistory = {
            id: historyId,
            ...entry
        };

        const historyRef = ref(database, `${ASSIGNMENT_HISTORY_REF}/${historyId}`);
        await set(historyRef, historyEntry);
    } catch (error) {
        console.error('Error creating history entry:', error);
        // Don't throw - history is non-critical
    }
}
