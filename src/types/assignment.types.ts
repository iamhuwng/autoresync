/**
 * Assignment Types
 * 
 * Type definitions for the Student-Teacher Assignment system.
 * Manages relationships between students and teachers, including assignment history.
 */

/**
 * Status of a student-teacher assignment
 */
export type AssignmentStatus = 'active' | 'removed';

/**
 * Main student-teacher assignment record
 */
export interface StudentTeacherAssignment {
    /** Unique assignment ID */
    id: string;

    /** Student's user ID */
    studentId: string;

    /** Teacher's user ID */
    teacherId: string;

    /** Admin who created this assignment */
    assignedBy: string;

    /** Timestamp when assignment was created */
    assignedAt: number;

    /** Timestamp when assignment was removed (null if active) */
    unassignedAt: number | null;

    /** Optional list of course IDs student was enrolled in upon assignment */
    coursesEnrolled?: string[];

    /** Current status of the assignment */
    status: AssignmentStatus;
}

/**
 * Request for a teacher to be assigned a specific student
 */
export interface AssignmentRequest {
    /** Unique request ID */
    id: string;

    /** Teacher making the request */
    teacherId: string;

    /** Email of the student being requested */
    studentEmail: string;

    /** Timestamp when request was created */
    requestedAt: number;

    /** Status of the request */
    status: 'pending' | 'approved' | 'denied' | 'expired';

    /** Admin who responded to the request (if any) */
    respondedBy?: string;

    /** Timestamp when request was responded to */
    respondedAt?: number;

    /** Reason for denial (if denied) */
    denialReason?: string;
}

/**
 * Historical record of assignment changes
 */
export interface AssignmentHistory {
    /** Unique history entry ID */
    id: string;

    /** Student's user ID */
    studentId: string;

    /** Teacher's user ID */
    teacherId: string;

    /** Type of action */
    action: 'assigned' | 'unassigned';

    /** Admin who performed the action */
    performedBy: string;

    /** Timestamp of the action */
    timestamp: number;

    /** Courses enrolled at time of action */
    coursesEnrolled?: string[];

    /** Reason for unassignment (if applicable) */
    reason?: string;
}

/**
 * Summary of assignments for display purposes
 */
export interface AssignmentSummary {
    /** Student or teacher ID */
    userId: string;

    /** Display name */
    displayName: string;

    /** Email address */
    email: string;

    /** Number of active assignments */
    assignmentCount: number;

    /** List of assigned user IDs (teacher IDs for students, student IDs for teachers) */
    assignedTo: string[];

    /** Assignment date (for most recent assignment) */
    assignedAt?: number;
}
