/**
 * Class Types
 * 
 * Defines the "Class" architecture that supports running multiple different tests
 * concurrently within a single class. This implements "Option C" (Hybrid) which
 * internally redefines the session structure while maintaining external API compatibility.
 * 
 * Key Concepts:
 * - A "Class" is a long-lived container (replaces short-lived "session")
 * - Multiple tests can be assigned to a class
 * - Students join a class once and can take multiple tests
 * - Each test assignment tracks individual student progress
 * 
 * @module types/class.types
 */

// ============================================================================
// STATUS TYPES
// ============================================================================

/**
 * Class lifecycle status
 */
export type ClassStatus =
  | 'active'      // Class is open, students can join and take tests
  | 'paused'      // Class temporarily paused, no new activity
  | 'archived'    // Class completed, read-only for historical access
  | 'deleted';    // Soft delete, hidden from UI

/**
 * Test assignment status within a class
 */
export type TestAssignmentStatus =
  | 'scheduled'   // Test assigned but not yet available
  | 'available'   // Students can start the test
  | 'in_progress' // At least one student is taking the test
  | 'completed'   // All students finished or deadline passed
  | 'graded';     // Results finalized and released

/**
 * Individual student's status for a specific test
 */
export type StudentTestStatus =
  | 'not_started' // Student hasn't begun the test
  | 'in_progress' // Student is currently taking the test
  | 'submitted'   // Student submitted answers
  | 'graded'      // Student's test has been graded
  | 'absent';     // Student marked as absent

// ============================================================================
// CORE INTERFACES
// ============================================================================

/**
 * Test Assignment - A test assigned to a class
 * Multiple tests can be assigned to the same class
 */
export interface TestAssignment {
  /** Unique ID for this assignment */
  id: string;
  /** Reference to the test/quiz content */
  testId: string;
  /** Test title (denormalized for quick display) */
  testTitle: string;
  /** Type of content */
  testType: 'quiz' | 'test';
  /** Assignment status */
  status: TestAssignmentStatus;

  /** When the test becomes available (optional scheduling) */
  availableFrom?: number;
  /** Deadline for completing the test */
  deadline?: number;
  /** Time limit in minutes (overrides test default) */
  timeLimit?: number;

  /** Number of attempts allowed per student */
  maxAttempts: number;
  /** Whether to show answers after completion */
  showAnswers: boolean;
  /** Whether to show scores immediately */
  showScores: boolean;

  /** Tracking timestamps */
  assignedAt: number;
  assignedBy: string;
  startedAt?: number;
  completedAt?: number;

  /** Statistics (denormalized for quick access) */
  stats: {
    totalStudents: number;
    started: number;
    submitted: number;
    graded: number;
    averageScore?: number;
  };
}

/**
 * Student within a class
 */
export interface ClassStudent {
  /** Unique student ID */
  id: string;
  /** Firebase Auth UID (for authenticated students) */
  uid?: string;
  /** Display name */
  name: string;
  /** Email if available */
  email?: string;
  /** Enrollment status: pending_approval (joined via code, awaiting teacher), active (approved), removed */
  status?: 'pending_approval' | 'active' | 'removed';
  /** When student joined the class */
  joinedAt: number;
  /** Last activity timestamp */
  lastActiveAt: number;
  /** Whether student is currently online */
  isOnline: boolean;
  /** Device/browser info for anti-cheating */
  deviceInfo?: string;
  /** IP address for tracking */
  ipAddress?: string;

  /** Student's assignments - maps testAssignmentId to their progress */
  assignments: Record<string, StudentAssignment>;
}

/**
 * A student's progress on a specific test assignment
 */
export interface StudentAssignment {
  /** Reference to the test assignment */
  testAssignmentId: string;
  /** Current status */
  status: StudentTestStatus;
  /** Attempt number (1-based) */
  attemptNumber: number;

  /** When student started (current attempt) */
  startedAt?: number;
  /** When student submitted (current attempt) */
  submittedAt?: number;
  /** Time spent in seconds (current attempt) */
  timeSpent?: number;

  /** Student's answers - maps questionId to answer */
  answers?: Record<string, any>;
  /** Score achieved (after grading) */
  score?: number;
  /** Maximum possible score */
  maxScore?: number;
  /** Percentage score */
  percentage?: number;
  /** Band score for IELTS-style tests */
  bandScore?: number;
  /** Canonical saved-result record for result drill-down */
  resultId?: string;

  /** Per-question results (after grading) */
  questionResults?: Record<string, {
    correct: boolean;
    pointsEarned: number;
    pointsPossible: number;
    feedback?: string;
  }>;

  /** History of all attempts */
  attemptHistory?: Array<{
    attemptNumber: number;
    startedAt: number;
    submittedAt?: number;
    score?: number;
    percentage?: number;
  }>;
}

/**
 * Module Progress within a class
 */
export interface ModuleProgress {
  status: 'locked' | 'available' | 'completed';
  unlockedAt?: number;
  completedAt?: number;
}

/**
 * The main Class (formerly Session) entity
 */
export interface ClassSession {
  /** Unique class ID */
  id: string;
  /** Human-readable class code for students to join */
  classCode: string;
  /** Class name/title */
  name: string;
  /** Optional description */
  description?: string;
  /** Current status */
  status: ClassStatus;

  /** Mode for backward compatibility */
  mode: 'class';  // Always 'class' for new system

  /** Teacher/admin who created the class */
  createdBy: string;
  /** Creation timestamp */
  createdAt: number;
  /** Last update timestamp */
  updatedAt: number;
  /** When class expires (optional) */
  expiresAt?: number;

  /** Students enrolled in this class */
  students: Record<string, ClassStudent>;
  /** Test assignments for this class */
  assignments: Record<string, TestAssignment>;
  /** Module progress for this class - maps moduleId to progress */
  moduleProgress?: Record<string, ModuleProgress>;

  /** Currently active test assignment (for real-time monitoring) */
  activeAssignmentId?: string;

  /** Class-level settings */
  settings: {
    /** Allow students to join after class starts */
    allowLateJoin: boolean;
    /** Require student email */
    requireEmail: boolean;
    /** Allow students to practice tests independently without teacher monitoring */
    allowSelfStudy?: boolean;
    /** Auto-archive after days of inactivity */
    autoArchiveDays?: number;
    /** Maximum students allowed */
    maxStudents?: number;
  };

  /** Aggregate statistics */
  stats: {
    totalStudents: number;
    activeStudents: number;
    totalAssignments: number;
    completedAssignments: number;
  };
}

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Request to create a new class
 */
export interface CreateClassRequest {
  name: string;
  description?: string;
  settings?: Partial<ClassSession['settings']>;
  /** Optional initial test to assign */
  initialTestId?: string;
  initialTestType?: 'quiz' | 'test';
}

/**
 * Request to assign a test to a class
 */
export interface AssignTestRequest {
  classId: string;
  testId: string;
  testType: 'quiz' | 'test';
  testTitle: string;

  /** Optional scheduling */
  availableFrom?: number;
  deadline?: number;
  timeLimit?: number;

  /** Attempt settings */
  maxAttempts?: number;
  showAnswers?: boolean;
  showScores?: boolean;
}

/**
 * Summary of a class for list views
 */
export interface ClassSummary {
  id: string;
  classCode: string;
  name: string;
  status: ClassStatus;
  createdAt: number;
  studentCount: number;
  activeAssignments: number;
  completedAssignments: number;
}

/**
 * Class-level statistics
 */
export interface ClassStatistics {
  classId: string;
  className: string;

  /** Student metrics */
  totalStudents: number;
  activeStudents: number;
  averageParticipation: number;

  /** Assignment metrics */
  totalAssignments: number;
  completedAssignments: number;
  averageCompletionRate: number;

  /** Performance metrics */
  overallAverageScore: number;
  highestScore: number;
  lowestScore: number;

  /** Per-assignment breakdown */
  assignmentStats: Array<{
    assignmentId: string;
    testTitle: string;
    completionRate: number;
    averageScore: number;
    submissionCount: number;
  }>;
}

// ============================================================================
// BACKWARD COMPATIBILITY TYPES
// ============================================================================

/**
 * Maps old session fields to new class fields
 * Used for gradual migration
 */
export interface LegacySessionFields {
  /** Old: sessionCode -> New: classCode */
  sessionCode?: string;
  /** Old: players -> New: students */
  players?: Record<string, any>;
  /** Old: quizId/testId -> New: assignments[0].testId */
  quizId?: string;
  testId?: string;
  /** Old: status values -> New: ClassStatus */
  status?: string;
}

/**
 * Converts legacy session to new class format
 */
export function convertLegacySession(legacy: LegacySessionFields): Partial<ClassSession> {
  return {
    classCode: legacy.sessionCode,
    // Students will be migrated separately
    mode: 'class',
    status: mapLegacyStatus(legacy.status),
  };
}

/**
 * Maps old status values to new ClassStatus
 */
function mapLegacyStatus(oldStatus?: string): ClassStatus {
  switch (oldStatus) {
    case 'waiting':
    case 'in-progress':
      return 'active';
    case 'completed':
    case 'results':
      return 'archived';
    default:
      return 'active';
  }
}
