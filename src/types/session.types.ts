/**
 * Class Management Type Definitions
 * 
 * Defines the new "Class" architecture where:
 * - A Class is a persistent group of students (replaces temporary "Session")
 * - Multiple tests can be assigned and run concurrently within one class
 * - Students are assigned to specific tests
 * - Each test has independent timing and state
 */

/**
 * Class Status
 * Overall state of the class
 */
export type ClassStatus = 'active' | 'inactive' | 'archived';

/**
 * Test Assignment Status
 * Status of a specific test within a class
 */
export type TestAssignmentStatus = 'waiting' | 'in-progress' | 'paused' | 'completed';

/**
 * Test Assignment
 * Represents one test assigned to a group of students in a class
 */
export interface TestAssignment {
  /** Unique ID for this test assignment */
  assignmentId: string;
  
  /** ID of the test from tests/ collection */
  testId: string;
  
  /** Array of student IDs assigned to this test */
  assignedStudents: string[];
  
  /** Current status of this test assignment */
  status: TestAssignmentStatus;
  
  /** When this test was assigned */
  assignedAt: number;
  
  /** When test was started (null if not started) */
  startTime: number | null;
  
  /** Test duration in minutes */
  duration: number;
  
  /** Is test currently paused */
  isPaused: boolean;
  
  /** When test was paused (if paused) */
  pausedAt?: number;
  
  /** Total accumulated pause duration in ms */
  pausedDuration?: number;
  
  /** When test was resumed (if was paused) */
  resumedAt?: number;
  
  /** When test was completed */
  completedAt?: number;
  
  /** Test metadata (cached from tests/ collection) */
  metadata?: {
    title: string;
    skill: string;
    questionCount: number;
  };
}

/**
 * Student Data in Class
 * Represents a student who has joined a class
 */
export interface ClassStudent {
  /** Unique student ID (Firebase-generated) */
  studentId: string;
  
  /** Student's display name */
  studentName: string;
  
  /** When student joined the class */
  joinedAt: number;
  
  /** Last activity timestamp */
  lastActivity: number;
  
  /** Is student currently connected */
  isConnected: boolean;
  
  /** When student disconnected (if disconnected) */
  disconnectedAt?: number;
  
  /** Which test this student is assigned to (null if none) */
  assignedTestId: string | null;
  
  /** Student's answers for their assigned test */
  answers: Record<number, string | string[] | Record<string, string>>;
  
  /** Has student submitted their test */
  isSubmitted: boolean;
  
  /** When student submitted (if submitted) */
  submittedAt?: number;
  
  /** Calculated progress (0-100) */
  progress?: number;
  
  /** Grading results (if test is graded) */
  score?: number;
  maxScore?: number;
  correctCount?: number;
  
  /** Re-marking data (if re-marked by teacher) */
  isReMarked?: boolean;
  reMarkTimestamp?: number;
  reMarkDetails?: Record<string, number>;
}

/**
 * Class Session
 * The main class data structure in Firebase
 * Path: game_sessions/{classId}
 */
export interface ClassSession {
  /** Unique class code (e.g., "ABC123") */
  classId: string;
  
  /** Human-readable class name */
  className: string;
  
  /** Overall class status */
  status: ClassStatus;
  
  /** When class was created */
  createdAt: number;
  
  /** When class expires (longer than old sessions, e.g., 1 semester) */
  expiresAt: number;
  
  /** Last update timestamp */
  updatedAt: number;
  
  /** Teacher who created this class */
  teacherId: string;
  
  /** Active test assignments in this class */
  activeTests: Record<string, TestAssignment>;
  
  /** Students in this class */
  students: Record<string, ClassStudent>;
  
  /** Banned students (for moderation) */
  bannedStudents?: Record<string, { studentName: string; bannedAt: number; reason?: string }>;
  
  /** Class settings */
  settings: {
    /** Allow students to join mid-test */
    allowLateJoin: boolean;
    
    /** Show leaderboard to students */
    showLeaderboard: boolean;
    
    /** Auto-archive after X days of inactivity */
    autoArchiveDays: number;
  };
  
  /** Class metadata */
  metadata?: {
    /** School name */
    school?: string;
    
    /** Grade level */
    grade?: string;
    
    /** Subject */
    subject?: string;
    
    /** Additional notes */
    notes?: string;
  };
}

/**
 * Test Assignment Request
 * Data needed to assign a test to students
 */
export interface AssignTestRequest {
  /** Class ID */
  classId: string;
  
  /** Test ID from tests/ collection */
  testId: string;
  
  /** Student IDs to assign this test to */
  studentIds: string[];
  
  /** Test duration in minutes */
  duration: number;
  
  /** Optional assignment name/note */
  assignmentName?: string;
}

/**
 * Class Creation Request
 * Data needed to create a new class
 */
export interface CreateClassRequest {
  /** Human-readable class name */
  className: string;
  
  /** Optional settings (uses defaults if not provided) */
  settings?: Partial<ClassSession['settings']>;
  
  /** Optional metadata */
  metadata?: ClassSession['metadata'];
}

/**
 * Class Summary
 * Lightweight class data for listings
 */
export interface ClassSummary {
  classId: string;
  className: string;
  status: ClassStatus;
  createdAt: number;
  studentCount: number;
  activeTestCount: number;
  teacherId: string;
}

/**
 * Student Assignment Info
 * What test a student is currently assigned to
 */
export interface StudentAssignment {
  studentId: string;
  studentName: string;
  assignedTestId: string | null;
  testTitle?: string;
  testStatus?: TestAssignmentStatus;
}

/**
 * Class Statistics
 * Aggregated stats for a class
 */
export interface ClassStatistics {
  totalStudents: number;
  activeStudents: number;
  totalTests: number;
  testsInProgress: number;
  testsCompleted: number;
  averageProgress: number;
  submissionRate: number;
}
