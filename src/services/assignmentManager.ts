/**
 * Assignment Manager Service
 * 
 * Manages student-teacher assignments with support for:
 * - Creating and removing assignments
 * - Querying assignments by teacher or student
 * - Assignment history tracking
 * - Real-time subscription to assignment changes
 */

import { ref, get, set, update, push, onValue } from 'firebase/database';
import { database } from './firebase';
import type {
    StudentTeacherAssignment,
    AssignmentRequest,
    AssignmentHistory
} from '../types/assignment.types';
import { getUserByEmail, getUserById } from './userService';
import { createNotification } from './notificationService';
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

/**
 * Remove a student-teacher assignment (soft delete)
 * 
 * @param assignmentId - ID of the assignment to remove
 * @param reason - Optional reason for removal
 * @param unenrollCourseIds - Optional array of course IDs to unenroll student from
 * @returns Promise with success status
 */
export async function removeAssignment(
    assignmentId: string,
    reason?: string,
    unenrollCourseIds?: string[]
): Promise<{ success: boolean; error?: string }> {
    try {
        if (!assignmentId) {
            return {
                success: false,
                error: 'Assignment ID is required'
            };
        }

        // Get the assignment
        const assignmentRef = ref(database, `${ASSIGNMENTS_REF}/${assignmentId}`);
        const snapshot = await get(assignmentRef);

        if (!snapshot.exists()) {
            return {
                success: false,
                error: 'Assignment not found'
            };
        }

        const assignment = snapshot.val() as StudentTeacherAssignment;
        const timestamp = now();

        // Update assignment with soft delete
        // If unenrollCourseIds is provided, we might want to update the coursesEnrolled list
        // but since we are soft-deleting, we usually keep the record as it was.
        // For now, we'll just log the unenrollment in the history.
        await update(assignmentRef, {
            unassignedAt: timestamp,
            status: 'removed'
        });
        await setAssignmentLink(assignment.teacherId, assignment.studentId, false);

        // Create history entry
        await createHistoryEntry({
            studentId: assignment.studentId,
            teacherId: assignment.teacherId,
            action: 'unassigned',
            performedBy: assignment.assignedBy, // TODO: Should be current admin user
            timestamp,
            reason: reason || (unenrollCourseIds && unenrollCourseIds.length > 0
                ? `Released and unenrolled from ${unenrollCourseIds.length} course(s)`
                : 'Released'),
            coursesEnrolled: unenrollCourseIds // Track what was unenrolled
        });

        // Log audit event (Task 6.6)
        logDelete(null, 'assignment', assignmentId, {
            studentId: assignment.studentId,
            teacherId: assignment.teacherId,
            reason
        });

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
        const assignmentsRef = ref(database, ASSIGNMENTS_REF);
        const snapshot = await get(assignmentsRef);

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
    try {
        if (!teacherId) {
            return [];
        }

        const assignmentsRef = ref(database, ASSIGNMENTS_REF);
        const snapshot = await get(assignmentsRef);

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
        return [];
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

        const assignmentsRef = ref(database, ASSIGNMENTS_REF);
        const snapshot = await get(assignmentsRef);

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
    const assignmentsRef = ref(database, ASSIGNMENTS_REF);

    const unsubscribe = onValue(assignmentsRef, (snapshot) => {
        if (!snapshot.exists()) {
            callback([]);
            return;
        }

        const assignments = snapshot.val();
        const userAssignments = Object.values(assignments).filter(
            (assignment: any) =>
                (assignment.studentId === userId || assignment.teacherId === userId) &&
                assignment.status === 'active'
        );

        callback(userAssignments as StudentTeacherAssignment[]);
    });

    return unsubscribe;
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
        if (!teacherId || !studentEmail) {
            return {
                success: false,
                error: 'Teacher ID and student email are required'
            };
        }

        // Check for duplicate pending request
        const existingRequest = await getPendingRequest(teacherId, studentEmail);
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
            studentEmail,
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
        const requestsRef = ref(database, ASSIGNMENT_REQUESTS_REF);
        const snapshot = await get(requestsRef);

        if (!snapshot.exists()) {
            return null;
        }

        const requests = snapshot.val();
        const pendingRequest = Object.values(requests).find(
            (request: any) =>
                request.teacherId === teacherId &&
                request.studentEmail === studentEmail &&
                request.status === 'pending'
        );

        return pendingRequest as AssignmentRequest || null;
    } catch (error) {
        console.error('Error getting pending request:', error);
        return null;
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

        // 3. Create assignment
        const assignResult = await createAssignment(student.uid, request.teacherId, approvedBy);

        if (!assignResult.success) {
            // If assignment already exists, we should still mark request as approved/completed to clean up
            if (assignResult.error && assignResult.error.includes('already exists')) {
                // Proceed to update request status
            } else {
                return { success: false, error: assignResult.error };
            }
        }

        // 4. Update request status
        await update(requestRef, {
            status: 'approved',
            reviewedBy: approvedBy,
            reviewedAt: now()
        });

        // 5. Send notifications
        // Notify Teacher
        try {
            const studentName = student.displayName || student.email;
            await createNotification({
                userId: request.teacherId,
                type: 'success',
                title: 'Student Request Approved',
                message: `Your request for student ${studentName} has been approved.`,
                link: '/teacher/students'
            });

            // Notify Student
            const teacher = await getUserById(request.teacherId);
            const teacherName = teacher?.displayName || teacher?.email || 'Unknown Teacher';

            await createNotification({
                userId: student.uid,
                type: 'info',
                title: 'New Teacher Assigned',
                message: `You have been assigned to ${teacherName}.`,
                link: '/student/dashboard'
            });
        } catch (notifyError) {
            console.error('Error sending notifications:', notifyError);
            // Non-blocking error
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
