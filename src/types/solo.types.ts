/**
 * Solo Mode Types
 *
 * Defines types for the Solo Study System (PRD-0016: Solo Study & Homework System)
 *
 * Key Concepts:
 * - Solo mode allows students to practice independently
 * - Materials can be configured for solo access
 * - Results are tagged with context (self_study, homework, class_session, course_material)
 *
 * @module types/solo.types
 */

import type { FeedbackTiming, HomeworkConfig } from './homework.types';
import type { Timestamp } from 'firebase/firestore';

// ============================================================================
// RESULT CONTEXT TYPES
// ============================================================================

/**
 * Context types for result tracking
 * Identifies how a result was generated
 */
export type ResultContextType =
    | 'class_session'    // Teacher-led live session
    | 'homework'         // Teacher-assigned async homework
    | 'self_study'       // Student-initiated practice
    | 'course_material'; // Course material practice (may be required or optional)

/**
 * Source types for result tracking
 * Identifies where the material came from
 */
export type ResultSourceType =
    | 'class'       // From a class session
    | 'homework'    // From a homework assignment
    | 'course'      // From course curriculum
    | 'library'     // From public library
    | 'direct_link'; // From direct sharing

/**
 * Source information for a result
 */
export interface ResultSource {
    /** Type of source */
    type: ResultSourceType;

    /** ID of the source entity (classId, homeworkId, courseId, etc.) */
    id?: string;

    /** Display name of the source */
    name?: string;

    /** Exact session code for live-session sourced results */
    sessionCode?: string;

    /** Exact class id for class-linked results */
    classId?: string;

    /** Exact course id for course-linked results */
    courseId?: string;

    /** Exact writing submission identifier when available */
    submissionId?: string;
}

/**
 * Assignment metadata for homework/course_material results
 */
export interface ResultAssignmentMeta {
    /** Homework assignment ID (if applicable) */
    homeworkId?: string;

    /** Secondary assignment identifier for class/course orchestration */
    assignmentId?: string;

    /** Homework title */
    homeworkTitle?: string;

    /** Due date (if applicable) */
    dueDate?: number;

    /** Whether this submission was late */
    isLate?: boolean;

    /** Which attempt this was */
    attemptNumber: number;

    /** Maximum attempts allowed (undefined = unlimited) */
    maxAttempts?: number;
}

/**
 * Configuration that was applied to the session
 */
export interface AppliedConfig {
    /** Timer duration in minutes (null = no timer) */
    timerMinutes: number | null;

    /** Feedback timing setting */
    feedbackTiming: FeedbackTiming;

    /** Where the config came from */
    source: 'material_default' | 'teacher_override';
}

/**
 * Complete result context for tagging results
 * This is added to EnhancedTestResultRecord
 */
export interface ResultContext {
    /** Primary context type */
    type: ResultContextType;

    /** Source information */
    source: ResultSource;

    /** Exact session identifier used for ownership lookup */
    sessionCode?: string;

    /** Exact class identifier used for ownership lookup */
    classId?: string;

    /** Exact course identifier used for ownership lookup */
    courseId?: string;

    /** Assignment metadata (for homework/course_material) */
    assignment?: ResultAssignmentMeta;

    /** Configuration that was applied */
    configApplied: AppliedConfig;

    /** Exact session code when context is tied to a live session */
    sessionCode?: string;

    /** Exact class id when context is tied to a class-owned source */
    classId?: string;

    /** Exact course id when context is tied to a course-owned source */
    courseId?: string;

    /** Secondary assignment identifier for reporting/debugging only */
    assignmentId?: string;
}

// ============================================================================
// MATERIAL SOLO CONFIGURATION
// ============================================================================

/**
 * Default configuration for a material in solo mode
 */
export interface MaterialSoloDefaults {
    /** Time limit in minutes (null = no timer) */
    timerMinutes: number | null;

    /** When to show feedback */
    feedbackTiming: FeedbackTiming;

    /** Suggested number of attempts (hint for teachers, not enforced) */
    suggestedAttempts: number;
}

/**
 * Self-study specific settings
 */
export interface SelfStudySettings {
    /** Available in student library */
    enabled: boolean;

    /** Visible in public library (if false, only course enrollees can see) */
    publicLibrary: boolean;
}

/**
 * Homework specific settings
 */
export interface HomeworkSettings {
    /** Can be used in homework assignments */
    enabled: boolean;

    /** Teacher can override default settings */
    allowTeacherOverride: boolean;
}

/**
 * Course material specific settings
 */
export interface CourseMaterialSettings {
    /** Teacher can mark as required in course */
    canMarkRequired: boolean;
}

/**
 * Complete solo configuration for a material
 * This is added to the material/test schema
 */
export interface MaterialSoloConfig {
    /** Whether solo mode is enabled for this material */
    soloEnabled: boolean;

    /** Default configuration */
    defaults: MaterialSoloDefaults;

    /** Context-specific settings */
    contexts: {
        selfStudy: SelfStudySettings;
        homework: HomeworkSettings;
        courseMaterial: CourseMaterialSettings;
    };
}

// ============================================================================
// SOLO SESSION
// ============================================================================

/**
 * Solo session status
 */
export type SoloSessionStatus =
    | 'active'      // Session is in progress
    | 'paused'      // Session is paused (if allowed)
    | 'completed'   // Session finished successfully
    | 'abandoned';  // Session was abandoned (timeout, etc.)

/**
 * A solo study session
 * Tracks a student's progress through a material
 */
export interface SoloSession {
    /** Unique session ID */
    id: string;

    /** Student taking the session */
    studentId: string;

    /** Material being practiced */
    materialId: string;

    /** Material title (denormalized) */
    materialTitle: string;

    /** Material type */
    materialType: 'quiz' | 'test' | 'thcs-test';

    /** Material skill */
    materialSkill: 'reading' | 'listening' | 'writing' | 'speaking';

    // ========== Context ==========
    /** Context for this session (determines config and result tagging) */
    context: ResultContext;

    // ========== Configuration ==========
    /** Applied configuration */
    config: AppliedConfig;

    // ========== Timing ==========
    /** When session started */
    startedAt: number;

    /** When session ended (null if in progress) */
    endedAt?: number;

    /** Time spent in seconds */
    timeSpent: number;

    /** Time remaining in seconds (null if no timer) */
    timeRemaining: number | null;

    // ========== Progress ==========
    /** Current question index */
    currentQuestion: number;

    /** Total questions */
    totalQuestions: number;

    /** Answers given so far (questionId -> answer) */
    answers: Record<string, any>;

    // ========== Status ==========
    /** Session status */
    status: SoloSessionStatus;

    // ========== Result ==========
    /** Link to result after completion */
    resultId?: string;
}

// ============================================================================
// LIBRARY DISCOVERY TYPES
// ============================================================================

/**
 * Material source for library filtering
 */
export type LibrarySource =
    | 'my_courses'   // Materials from enrolled courses
    | 'public'       // Public library materials
    | 'recommended'  // AI-recommended materials
    | 'recent';      // Recently practiced

/**
 * Filters for library search
 */
export interface LibraryFilters {
    /** Source filter */
    source?: LibrarySource;

    /** Skill type filter */
    skill?: 'reading' | 'reading-v2' | 'listening' | 'writing' | 'speaking';

    /** Material type filter */
    type?: 'quiz' | 'test' | 'thcs-test';

    /** Difficulty filter */
    difficulty?: 'easy' | 'medium' | 'hard';

    /** Search query */
    searchQuery?: string;

    /** Course ID filter (for course materials) */
    courseId?: string;
}

/**
 * A material item for library display
 */
export interface LibraryMaterial {
    /** Material ID */
    id: string;

    /** Title */
    title: string;

    /** Type */
    type: 'quiz' | 'test' | 'thcs-test';

    /** Skill */
    skill: 'reading' | 'reading-v2' | 'listening' | 'writing' | 'speaking';

    /** Difficulty level */
    difficulty?: 'easy' | 'medium' | 'hard';

    /** Estimated duration in minutes */
    estimatedDuration?: number;

    /** Number of questions */
    questionCount: number;

    /** Source information */
    source: {
        type: 'course' | 'public' | 'recommended';
        courseName?: string;
        courseId?: string;
    };

    /** Solo config (for determining availability) */
    soloConfig: MaterialSoloConfig;

    /** Student's history with this material */
    studentHistory?: {
        /** Number of times attempted */
        attemptCount: number;
        /** Best score percentage */
        bestScore?: number;
        /** Most recent score percentage */
        lastScore?: number;
        /** Last practice date */
        lastPracticed?: number;
    };
}

// ============================================================================
// PROGRESS TRACKING
// ============================================================================

/**
 * Student's self-study progress summary
 */
export interface SelfStudyProgress {
    /** Total self-study sessions */
    totalSessions: number;

    /** Total time spent (seconds) */
    totalTimeSpent: number;

    /** Current practice streak (consecutive days) */
    currentStreak: number;

    /** Longest practice streak */
    longestStreak: number;

    /** Last practice date */
    lastPracticed?: number;

    /** Materials practiced */
    materialsPracticed: number;

    /** Average score across all self-study */
    averageScore?: number;

    /** Breakdown by skill */
    skillBreakdown: {
        skill: string;
        sessions: number;
        averageScore?: number;
    }[];
}

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Request to create a solo session
 */
export interface CreateSoloSessionRequest {
    /** Student ID */
    studentId: string;

    /** Material to practice */
    materialId: string;

    /** Context for the session */
    context: Omit<ResultContext, 'configApplied'>;

    /** Optional: homework ID if from homework */
    homeworkId?: string;
}

/**
 * Response after completing a solo session
 */
export interface SoloSessionResult {
    /** Session ID */
    sessionId: string;

    /** Result ID */
    resultId: string;

    /** Score achieved */
    score: number;

    /** Maximum score */
    maxScore: number;

    /** Percentage */
    percentage: number;

    /** Band score (if applicable) */
    bandScore?: number;

    /** Time spent (seconds) */
    timeSpent: number;

    /** Whether feedback is available */
    feedbackAvailable: boolean;
}

// ============================================================================
// STUDENT GROUP TYPES
// ============================================================================

/**
 * A saved group of students for quick homework assignment
 */
export interface StudentGroup {
    /** Unique group ID */
    id: string;

    /** Teacher who created this group */
    teacherId: string;

    /** Group name */
    name: string;

    /** List of student IDs in this group */
    studentIds: string[];

    /** Creation timestamp */
    createdAt: Timestamp;

    /** Last update timestamp */
    updatedAt: Timestamp;
}

// ============================================================================
// HOMEWORK TEMPLATE TYPES
// ============================================================================

/**
 * A saved homework configuration template
 */
export interface HomeworkTemplate {
    /** Unique template ID */
    id: string;

    /** Teacher who created this template */
    teacherId: string;

    /** Template name */
    name: string;

    /** Saved configuration settings */
    config: HomeworkConfig;

    /** Optional description */
    description?: string;

    /** Creation timestamp */
    createdAt: Timestamp;

    /** Last update timestamp */
    updatedAt: Timestamp;
}
