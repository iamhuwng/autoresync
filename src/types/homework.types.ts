/**
 * Homework Types
 * 
 * Defines types for the Homework System (PRD-0016: Solo Study & Homework System)
 * 
 * Key Concepts:
 * - A "Homework" is an async assignment created by a teacher
 * - Students complete homework on their own time with configured settings
 * - Results are tracked with context labels (homework vs class_session vs self_study)
 * 
 * @module types/homework.types
 */

// ============================================================================
// STATUS TYPES
// ============================================================================

/**
 * Homework assignment lifecycle status
 */
export type HomeworkStatus =
    | 'draft'       // Created but not yet visible to students
    | 'scheduled'   // Scheduled for future availability
    | 'active'      // Currently available for students to complete
    | 'past_due'    // Past deadline (may still accept late submissions)
    | 'closed';     // No longer accepting submissions

/**
 * Individual student's submission status for a homework
 */
export type HomeworkSubmissionStatus =
    | 'not_started'  // Student hasn't begun the homework
    | 'in_progress'  // Student has started but not submitted
    | 'submitted'    // Student has submitted their answers
    | 'graded';      // Homework has been reviewed/graded

/**
 * Feedback timing options for homework
 */
export type FeedbackTiming =
    | 'immediate'        // Show answers immediately after each question
    | 'after_completion' // Show answers after completing the test
    | 'after_deadline'   // Show answers only after the deadline passes
    | 'never';           // Never show correct answers (score only)

// ============================================================================
// HOMEWORK TARGET TYPES
// ============================================================================

/**
 * Base target interface for homework assignment
 */
interface HomeworkTargetBase {
    /** Type of target */
    type: 'class' | 'course' | 'students' | 'group';
}

/**
 * Assign to an entire class
 */
interface HomeworkTargetClass extends HomeworkTargetBase {
    type: 'class';
    classId: string;
    className?: string;  // Denormalized for display
}

/**
 * Assign to all students enrolled in a course
 */
interface HomeworkTargetCourse extends HomeworkTargetBase {
    type: 'course';
    courseId: string;
    courseName?: string;  // Denormalized for display
}

/**
 * Assign to specific individual students (ad-hoc)
 */
interface HomeworkTargetStudents extends HomeworkTargetBase {
    type: 'students';
    studentIds: string[];
    studentNames?: string[];  // Denormalized for display
}

/**
 * Assign to a saved student group
 */
interface HomeworkTargetGroup extends HomeworkTargetBase {
    type: 'group';
    groupId: string;
    groupName: string;
    studentIds: string[];  // Resolved at assignment time
}

/**
 * Union type for all homework targets
 */
export type HomeworkTarget =
    | HomeworkTargetClass
    | HomeworkTargetCourse
    | HomeworkTargetStudents
    | HomeworkTargetGroup;

// ============================================================================
// HOMEWORK CONFIGURATION
// ============================================================================

/**
 * Configuration for homework settings
 * These can override material defaults
 */
export interface HomeworkConfig {
    /** Time limit in minutes (null = no timer) */
    timerMinutes: number | null;

    /** Maximum number of attempts allowed (null = unlimited) */
    maxAttempts: number | null;

    /** When to show correct answers */
    feedbackTiming: FeedbackTiming;

    /** Allow late submissions after deadline */
    lateSubmissionAllowed: boolean;

    /** Anti-cheat configuration for this homework (PRD-0036, FR-31) */
    antiCheatConfig?: import('./integrity.types').AntiCheatConfig;
}

/**
 * Scheduling configuration for homework
 */
export interface HomeworkScheduling {
    /** When the homework becomes available (optional) */
    availableFrom?: number;

    /** When the homework is due (required) */
    dueDate: number;
}

export interface HomeworkStudentOverride {
    dueDate?: number;
    exempted?: boolean;
    exemptReason?: string;
    notes?: string;
    reminderCount?: number;
    lastRemindedAt?: number;
}

export type StudentOverride = HomeworkStudentOverride;
export type HomeworkStudentOverrides = Record<string, StudentOverride>;

/**
 * Visibility settings for what students can see before starting
 */
export interface HomeworkVisibility {
    /** Show time limit */
    showTimer: boolean;

    /** Show number of attempts */
    showAttempts: boolean;

    /** Show due date */
    showDueDate: boolean;

    /** Show question count */
    showQuestionCount: boolean;

    /** Show estimated duration */
    showDuration: boolean;
}

// ============================================================================
// HOMEWORK ASSIGNMENT
// ============================================================================

export type HomeworkMaterialType = 'quiz' | 'test' | 'thcs-test' | 'reading-passage' | 'reading-passage-set';

export type HomeworkMaterialSkill = 'reading' | 'listening' | 'writing' | 'speaking';

/** Explicit Mode 2 assignment discriminator. Legacy records omit this field. */
export const BOOK_HOMEWORK_ASSIGNMENT_KIND = 'book_activity_bundle' as const;
export const BOOK_HOMEWORK_MANIFEST_SCHEMA_VERSION = 1 as const;
export type BookHomeworkAssignmentKind = typeof BOOK_HOMEWORK_ASSIGNMENT_KIND;

export const BOOK_HOMEWORK_COMPATIBILITY_ASSIGNMENT_KIND = 'book_homework_compatibility' as const;
export const BOOK_HOMEWORK_COMPATIBILITY_SCHEMA_VERSION = 1 as const;
export type BookHomeworkCompatibilityAssignmentKind = typeof BOOK_HOMEWORK_COMPATIBILITY_ASSIGNMENT_KIND;

export interface BookHomeworkCompatibilityProjection {
    readonly schemaVersion: typeof BOOK_HOMEWORK_COMPATIBILITY_SCHEMA_VERSION;
    readonly assignmentKind: BookHomeworkCompatibilityAssignmentKind;
    readonly id: string;
    readonly createdBy: string;
    readonly createdAt: number;
    readonly updatedAt: number;
    readonly materialId: string;
    readonly materialTitle: string;
    readonly materialType: 'book';
    readonly materialSkill: 'mixed';
    readonly title: string;
    readonly description?: string;
    readonly target: {
        readonly type: 'students';
        readonly studentIds: readonly string[];
    };
    readonly scheduling: {
        readonly availableFrom?: number;
        readonly dueDate: number;
    };
    readonly config: {
        readonly timerMinutes: null;
        readonly maxAttempts: null;
        readonly feedbackTiming: 'never';
        readonly lateSubmissionAllowed: false;
    };
    readonly visibility: {
        readonly showTimer: false;
        readonly showAttempts: false;
        readonly showDueDate: true;
        readonly showQuestionCount: false;
        readonly showDuration: false;
    };
    readonly archived: false;
    readonly tags: readonly [];
    readonly bookHomeworkCompatibility: {
        readonly schemaVersion: typeof BOOK_HOMEWORK_COMPATIBILITY_SCHEMA_VERSION;
        readonly assignmentId: string;
        readonly sourceSagaRevision: number;
        readonly sourceFingerprint: string;
    };
}

export type BookHomeworkSelectionTarget =
    | { readonly kind: 'book'; readonly bookId: string }
    | { readonly kind: 'section' | 'chapter' | 'unit' | 'test'; readonly bookId: string; readonly nodeKey: string }
    | { readonly kind: 'activity'; readonly bookId: string; readonly activityId: string; readonly placementId?: string };

export type BookHomeworkStructuralNodeType =
    | 'intro-placeholder'
    | 'toc-placeholder'
    | 'note-placeholder'
    | 'section'
    | 'chapter'
    | 'unit'
    | 'test';

export interface BookHomeworkStructuralOutlineNode {
    readonly nodeKey: string;
    readonly parentNodeKey: string | null;
    readonly nodeType: BookHomeworkStructuralNodeType;
    readonly order: number;
    readonly titleSnapshot?: string;
}

export interface BookHomeworkSourceContext {
    readonly sourceKey: string;
    readonly sourceVersionId: string;
    readonly componentOrder?: number;
    readonly ownerNodeKey?: string;
    readonly physicalPageNumbers: readonly number[];
}

export type BookHomeworkBindingState = 'required' | 'excluded';
export type BookHomeworkSourceReadiness = 'ready' | 'unavailable' | 'not-required';
export type BookHomeworkExclusionReason =
    | 'not-published'
    | 'unsupported-activity'
    | 'missing-source'
    | 'unresolved-mapping'
    | 'outside-selected-target'
    | 'duplicate-placement';

interface BookHomeworkActivityBindingBase {
    readonly bindingId: string;
    readonly placementId: string;
    readonly activityId: string;
    readonly nodeKey: string;
    readonly order: number;
    readonly titleSnapshot?: string;
    readonly contextMode: 'none' | 'optional' | 'required';
    readonly pageGroupKeys: readonly string[];
    readonly sourceReadiness: BookHomeworkSourceReadiness;
}

export type BookHomeworkActivityBinding =
    | (BookHomeworkActivityBindingBase & {
        readonly state: 'required';
        readonly activityVersion: number;
        readonly activityVersionId: string;
        readonly sourceContext: readonly BookHomeworkSourceContext[];
    })
    | (BookHomeworkActivityBindingBase & {
        readonly state: 'excluded';
        readonly activityVersion?: number;
        readonly activityVersionId?: string;
        readonly exclusionReason: BookHomeworkExclusionReason;
        readonly sourceContext?: readonly BookHomeworkSourceContext[];
    });

export interface BookHomeworkScheduleRule {
    readonly nodeKey: string;
    readonly availableFrom?: string;
    readonly dueAt?: string;
}

export interface BookHomeworkManifest {
    readonly schemaVersion: typeof BOOK_HOMEWORK_MANIFEST_SCHEMA_VERSION;
    readonly assignmentKind: BookHomeworkAssignmentKind;
    readonly manifestVersionId: string;
    readonly ownerId: string;
    readonly createdByCommandId: string;
    readonly createdAt: string;
    readonly bindingRevision: number;
    readonly book: {
        readonly bookId: string;
        readonly bookMode: 'pdf';
        readonly bookRevision: number;
        readonly publicationId: string;
        readonly publicationRevision: number;
        readonly publicationStatus: 'published';
    };
    readonly context: {
        readonly contextId: string;
        readonly recipientId: string;
        readonly kind: 'homework';
        readonly entitlementBasis: 'assignment';
    };
    readonly selectedTarget: BookHomeworkSelectionTarget;
    readonly outline: readonly BookHomeworkStructuralOutlineNode[];
    readonly scheduleRules: readonly BookHomeworkScheduleRule[];
    readonly bindings: readonly BookHomeworkActivityBinding[];
    readonly completion: {
        readonly aggregation: 'required-activities-submitted-over-required-activities';
        readonly requiredBindingCount: number;
        readonly excludedBindingCount: number;
        readonly legacyScoreFields: 'untouched';
    };
}

export interface BookHomeworkStudentSafeProjection {
    readonly schemaVersion: typeof BOOK_HOMEWORK_MANIFEST_SCHEMA_VERSION;
    readonly assignmentKind: BookHomeworkAssignmentKind;
    readonly manifestVersionId: string;
    readonly book: Pick<BookHomeworkManifest['book'], 'bookId' | 'bookRevision' | 'publicationId' | 'publicationRevision'>;
    readonly context: Pick<BookHomeworkManifest['context'], 'contextId' | 'recipientId' | 'kind'>;
    readonly selectedTarget: BookHomeworkSelectionTarget;
    readonly outline: readonly BookHomeworkStructuralOutlineNode[];
    readonly scheduleRules: readonly BookHomeworkScheduleRule[];
    readonly bindings: readonly BookHomeworkActivityBinding[];
    readonly completion: BookHomeworkManifest['completion'];
}

export interface BookHomeworkAssignmentFields {
    readonly assignmentKind: BookHomeworkAssignmentKind;
    readonly bookManifest: BookHomeworkManifest;
}

export interface HomeworkContentRef {
    contentKind:
        | 'thcs_test'
        | 'reading_passage'
        | 'ielts_reading'
        | 'ielts_listening'
        | 'ielts_writing';
    contentId: string;
    version?: string;
    title?: string;
    source?: string;
}

export interface ReadingPassageHomeworkSnapshot {
    passageMaterialId: string;
    snapshotVersionId: string;
    titleSnapshot: string;
    questionCount: number;
    testTypeIds: string[];
    sourceOrderDisplay?: string;
    sourceFullTestTitle?: string;
}

export interface ReadingPassageHomeworkSetItem extends ReadingPassageHomeworkSnapshot {
    order: number;
}

export interface ReadingPassageHomeworkSet {
    titleSnapshot: string;
    items: ReadingPassageHomeworkSetItem[];
    compositionId?: string;
    compositionVersionId?: string;
    assignmentPayloadPath?: string;
    assignmentPayloadKey?: string;
    frozenAt?: string;
}

/**
 * A homework assignment created by a teacher
 * 
 * This is the main entity for homework tracking.
 * Multiple students can be assigned via the `target` field.
 */
export interface HomeworkAssignment {
    /** Unique homework ID */
    id: string;

    // ========== Ownership ==========
    /** Teacher who created this homework */
    createdBy: string;
    /** Creation timestamp */
    createdAt: number;
    /** Last update timestamp */
    updatedAt: number;

    // ========== Content ==========
    /** Reference to the material/test */
    materialId: string;
    /** Material title (denormalized for display) */
    materialTitle: string;
    /** Material type */
    materialType: HomeworkMaterialType;
    /** Material skill type */
    materialSkill: HomeworkMaterialSkill;

    /** Normalized canonical content reference for Worker-created assignments. */
    contentRef?: HomeworkContentRef;

    /** Reading Passage assignment-time snapshot. Only set for materialType === 'reading-passage'. */
    readingPassageSnapshot?: ReadingPassageHomeworkSnapshot;

    /** Ordered Reading Passage set snapshot. Only set for materialType === 'reading-passage-set'. */
    readingPassageSet?: ReadingPassageHomeworkSet;

    /** Frozen Reading V2 composed assignment projection path for composition-backed Reading Passage sets. */
    readingV2AssignmentPayloadPath?: string;

    /** Homework-scoped student-safe payload for Worker-created private standard tests. */
    studentSafeTestPayloadPath?: string;

    // ========== Target ==========
    /** Who should complete this homework */
    target: HomeworkTarget;

    // ========== Scheduling ==========
    /** Scheduling configuration */
    scheduling: HomeworkScheduling;

    // ========== Configuration ==========
    /** Homework settings (overrides material defaults) */
    config: HomeworkConfig;

    /** Visibility settings */
    visibility: HomeworkVisibility;

    // ========== Anti-Cheat (PRD-0036) ==========
    /** Anti-cheat configuration for this homework assignment (FR-31) */
    antiCheatConfig?: import('./integrity.types').AntiCheatConfig;

    // ========== Status ==========
    /** Current status */
    status: HomeworkStatus;

    tags?: string[];
    archived?: boolean;
    archivedAt?: number;
    trashExpiresAt?: number;
    closedAt?: number;
    studentOverrides?: HomeworkStudentOverrides;

    // ========== Metadata ==========
    /** Custom title (optional, defaults to material title) */
    title?: string;

    /** Instructions for students (optional) */
    description?: string;

    // ========== Statistics (denormalized) ==========
    /** Quick access statistics */
    stats: HomeworkStats;

    // ========== THCS-THPT Configuration (Phase 3) ==========
    /** THCS-specific configuration — only used when materialType === 'thcs-test' */
    thcsConfig?: {
        timerModeOverride?: 'strict' | 'informational' | 'none';
        lateSubmissionPolicy?: 'accept' | 'accept-late' | 'reject' | 'penalty';
        // 'accept' = accept with NO late marking (no badge, no penalty)
        // 'accept-late' = accept but mark as "Late" in submission record (badge shown to teacher)
        // 'reject' = block submission entirely after deadline
        // 'penalty' = accept but deduct penaltyPercent from final score
        penaltyPercent?: number; // Only meaningful if policy === 'penalty'
        maxAttempts?: number; // 1-5, default 1. Number of times student can submit.
        feedbackTiming?: 'after-submission' | 'after-deadline' | 'manual';
        // 'after-submission' = student sees results immediately after submit
        // 'after-deadline' = results hidden until deadline passes
        // 'manual' = teacher manually releases results
        instructions?: string; // Optional teacher notes shown to student before starting
        versionKey?: string; // Pinned version key from _changelog
        pinToVersion?: boolean;
    };
    // NOTE: `scheduling` (availableFrom, dueDate) is stored in the existing HomeworkAssignment
    // fields (HomeworkScheduling), NOT in thcsConfig. Do NOT duplicate date fields in thcsConfig.
}

/** Strongly typed Mode 2 assignment view; legacy HomeworkAssignment remains unchanged. */
export type BookHomeworkAssignment = HomeworkAssignment & BookHomeworkAssignmentFields;

/**
 * Denormalized statistics for a homework assignment
 */
export interface HomeworkStats {
    /** Total number of assigned students */
    totalAssigned: number;

    /** Number who have started */
    started: number;

    /** Number who have submitted */
    submitted: number;

    /** Number of late submissions */
    lateSubmissions: number;

    /** Average score (after all submissions) */
    averageScore?: number;

    /** Completion rate percentage */
    completionRate?: number;
}

// ============================================================================
// HOMEWORK SUBMISSION
// ============================================================================

/**
 * A student's submission for a homework assignment
 * 
 * Each attempt creates a new submission record.
 * The latest submission is used for grading.
 */
export interface HomeworkSubmission {
    /** Unique submission ID */
    id: string;

    /** Reference to the homework assignment */
    homeworkId: string;

    /** Student who made this submission */
    studentId: string;

    /** Student name (denormalized for display) */
    studentName?: string;

    /** Teacher who assigned this homework (denormalized for Firestore security rules) */
    teacherId?: string;

    // ========== Attempt Tracking ==========
    /** Which attempt this is (1-based) */
    attemptNumber: number;

    // ========== Timing ==========
    /** When student started this attempt */
    startedAt: number;

    /** When student submitted (null if in progress) */
    submittedAt?: number;

    /** Time spent in seconds */
    timeSpent?: number;

    /** Whether this submission was late */
    isLate: boolean;

    // ========== Scores (denormalized from result) ==========
    /** Link to the full result record */
    resultId?: string;

    /** Score achieved */
    score?: number;

    /** Maximum possible score */
    maxScore?: number;

    /** Percentage score */
    percentage?: number;

    /** Band score (IELTS-style) */
    bandScore?: number;

    // ========== Status ==========
    /** Current status of this submission */
    status: HomeworkSubmissionStatus;

    // ========== THCS-THPT Data (Phase 3) ==========
    /**
     * THCS-native grading result — stores THCSGradingResult format natively.
     * Do NOT convert to TestMarkingResult for storage.
     * Only populated when the homework materialType === 'thcs-test'.
     */
    thcsData?: {
        scaledScore: number;        // 0-10
        rawScore: number;
        totalPoints: number;
        sectionResults: import('./thcs-test.types').SectionResult[];
        gradingStatus: import('./thcs-test.types').THCSGradingStatus;
        questionResults: import('./thcs-test.types').QuestionResult[];
    };
    /** Penalty percentage applied for late submission (only when policy === 'penalty') */
    latePenaltyApplied?: number;
    /** Raw student answers keyed by question ID (for potential re-grading or teacher review) */
    studentAnswers?: Record<string, any>;

    // ========== PRD-0036: Anti-Cheat ==========
    /** PRD-0036: When true, remaining attempts were nullified due to anti-cheat violation */
    attemptsNullified?: boolean;
    /** PRD-0036: Integrity report data written by the client during the test session (Task 6.5) */
    integrity?: import('./integrity.types').HomeworkIntegrity;

    /** Administrative import metadata for off-app submissions added by a teacher */
    administrativeImport?: {
        source: 'external-admin-import';
        importedByTeacherId: string;
        importedAt: number;
        sourceNote?: string;
    };
}

// ============================================================================
// STUDENT GROUP
// ============================================================================

/**
 * A saved group of students for quick homework assignment
 */
export interface StudentGroup {
    /** Unique group ID */
    id: string;

    /** Teacher who created this group */
    teacherId: string;

    /** Group name (e.g., "Advanced Readers", "Group A") */
    name: string;

    /** Student IDs in this group */
    studentIds: string[];

    /** Student names (denormalized for display) */
    studentNames?: string[];

    /** Creation timestamp */
    createdAt: number;

    /** Last update timestamp */
    updatedAt: number;
}

// ============================================================================
// HOMEWORK TEMPLATE
// ============================================================================

/**
 * A reusable configuration template for homework
 */
export interface HomeworkTemplate {
    /** Unique template ID */
    id: string;

    /** Teacher who created this template */
    teacherId: string;

    /** Template name (e.g., "Standard Quiz", "Timed Exam") */
    name: string;

    /** Configuration settings */
    config: HomeworkConfig;

    /** Visibility settings */
    visibility: HomeworkVisibility;

    /** Creation timestamp */
    createdAt: number;

    /** Last update timestamp */
    updatedAt: number;
}

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Request to create a new homework assignment
 */
export interface CreateHomeworkRequest {
    /** Material to assign */
    materialId: string;
    materialTitle: string;
    materialType: 'quiz' | 'test' | 'thcs-test';
    materialSkill: 'reading' | 'listening' | 'writing' | 'speaking';

    /** Target students */
    target: HomeworkTarget;

    /** Scheduling */
    scheduling: HomeworkScheduling;

    /** Configuration */
    config: HomeworkConfig;

    /** Visibility */
    visibility: HomeworkVisibility;

    /** Optional metadata */
    title?: string;
    description?: string;
    tags?: string[];
}

/**
 * Request to update a homework assignment
 */
export interface UpdateHomeworkRequest {
    /** Fields that can be updated */
    scheduling?: Partial<HomeworkScheduling>;
    config?: Partial<HomeworkConfig>;
    visibility?: Partial<HomeworkVisibility>;
    title?: string;
    description?: string;
    status?: HomeworkStatus;
    tags?: string[];
    archived?: boolean;
    studentOverrides?: HomeworkStudentOverrides;
}

/**
 * Summary of a homework for list views
 */
export interface HomeworkSummary {
    id: string;
    title: string;
    materialTitle: string;
    materialType: 'quiz' | 'test' | 'thcs-test';
    materialSkill: string;
    status: HomeworkStatus;
    dueDate: number;
    targetType: HomeworkTarget['type'];
    targetName: string;  // Class name, course name, or "X students"
    stats: HomeworkStats;
}

/**
 * Student's view of their assigned homework
 */
export interface StudentHomeworkView {
    id: string;
    homeworkId: string;
    title: string;
    materialTitle: string;
    materialType: 'quiz' | 'test' | 'thcs-test';
    materialSkill: string;

    /** Assignment source */
    assignedBy: string;
    assignedByName?: string;
    sourceName?: string;  // Class name, course name, etc.

    /** Scheduling */
    dueDate: number;
    availableFrom?: number;

    /** Configuration (what student can see) */
    timerMinutes: number | null;
    attemptsRemaining: number | null;  // null = unlimited

    /** Student's progress */
    status: HomeworkSubmissionStatus;
    currentAttempt: number;
    lastSubmissionScore?: number;
    bestScore?: number;

    /** Flags */
    isOverdue: boolean;
    canSubmit: boolean;
    canViewFeedback: boolean;
    lastRemindedAt?: number;
}

// ============================================================================
// FILTER TYPES
// ============================================================================

/**
 * Filters for querying homework assignments (teacher view)
 */
export interface HomeworkFilters {
    /** Filter by status */
    status?: HomeworkStatus | HomeworkStatus[];

    /** Filter by class */
    classId?: string;

    /** Filter by date range */
    dueDateFrom?: number;
    dueDateTo?: number;

    /** Search by title */
    searchQuery?: string;
}

/**
 * Filters for querying student homework
 */
export interface StudentHomeworkFilters {
    /** Filter by status */
    status?: HomeworkSubmissionStatus | HomeworkSubmissionStatus[];

    /** Filter overdue only */
    overdueOnly?: boolean;

    /** Filter by material skill */
    skill?: 'reading' | 'listening' | 'writing' | 'speaking';
}

export interface HomeworkTagConfig {
    tags: Array<{
        id: string;
        label: string;
        color?: string;
    }>;
    updatedAt: number;
    updatedBy: string;
}
