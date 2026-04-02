/**
 * IELTS Writing Test Data Model
 * 
 * PRD-0030: IELTS Writing Test System
 * Defines all interfaces and types for writing test creation,
 * submission, grading, annotations, and audit trail.
 * 
 * @module types/ielts-writing.types
 */

import type { MaterialSoloConfig } from './solo.types';

// ═══════════════════════════════════════════════════════════════
// TASK TYPE ENUMS
// ═══════════════════════════════════════════════════════════════

/**
 * Task 1 visual types (metadata tag only — no UI change)
 */
export type WritingTask1Type =
    | 'bar-chart'
    | 'line-graph'
    | 'pie-chart'
    | 'table'
    | 'process-diagram'
    | 'map'
    | 'mixed';

/**
 * Task 2 essay types (metadata tag only — no UI change)
 */
export type WritingTask2Type =
    | 'opinion'
    | 'discussion'
    | 'problem-solution'
    | 'advantages-disadvantages'
    | 'two-part-question';

// ═══════════════════════════════════════════════════════════════
// WRITING TASK
// ═══════════════════════════════════════════════════════════════

/**
 * A single writing task (Task 1 or Task 2)
 */
export interface WritingTask {
    taskNumber: 1 | 2;
    taskType: WritingTask1Type | WritingTask2Type;
    promptText: string;              // The essay prompt/instruction
    promptImageUrl?: string;         // Task 1 only: graph/chart/diagram image
    promptImageCaption?: string;     // Optional alt text for the image
    wordMinimum: number;             // Default: 150 (Task 1), 250 (Task 2)
    recommendedTimeMinutes: number;  // Default: 20 (Task 1), 40 (Task 2)
    modelAnswer?: string;            // Optional: teacher's sample answer
    showModelAnswerToStudent: boolean; // Toggle: show after grading
    rubricNotes?: {                  // Optional: per-criteria notes for self-reference
        TA?: string;  // Task Achievement (Task 1) / Task Response (Task 2)
        CC?: string;  // Coherence & Cohesion
        LR?: string;  // Lexical Resource
        GRA?: string; // Grammatical Range & Accuracy
    };
}

// ═══════════════════════════════════════════════════════════════
// WRITING TEST FORMAT & METADATA
// ═══════════════════════════════════════════════════════════════

/**
 * Writing test format
 */
export type WritingTestFormat = 'task1-only' | 'task2-only' | 'full-test';

/**
 * Writing test metadata
 */
export interface WritingTestMetadata {
    title: string;
    description?: string;
    duration: number;               // Minutes (total, shared timer)
    format: WritingTestFormat;
    difficulty?: 'beginner' | 'intermediate' | 'advanced';
    targetBand?: number;            // e.g., 6.5
    tags?: string[];
}

// ═══════════════════════════════════════════════════════════════
// COMPLETE WRITING TEST (Published — RTDB)
// ═══════════════════════════════════════════════════════════════

/**
 * Complete IELTS Writing test (published, stored in RTDB)
 */
export interface IELTSWritingTest {
    id: string;
    type?: 'IELTS';                  // Compatibility mirror for legacy material consumers
    testType: 'IELTS';
    skill: 'Writing';               // Discriminator within IELTS tests
    title?: string;                 // Compatibility mirror for legacy cards / pickers
    duration?: number;              // Compatibility mirror for legacy cards / pickers
    questionCount?: number;         // Compatibility mirror; equals active task count
    metadata: WritingTestMetadata;
    tasks: WritingTask[];            // 1 or 2 tasks based on format
    createdBy: string;               // Teacher UID
    ownerId: string;
    sourceDraftId?: string;          // Firestore draft used for future edits
    isPublic: boolean;
    createdAt: number;
    updatedAt: number;
    publishedAt?: number;
    stats?: {
        attempts: number;
        averageBand: number;
        completionRate: number;
    };

    // Solo/homework configuration (PRD-0025 MaterialSoloConfig)
    soloConfig?: MaterialSoloConfig;
}

// ═══════════════════════════════════════════════════════════════
// WRITING TEST DRAFT (Firestore)
// ═══════════════════════════════════════════════════════════════

/**
 * Writing test draft (Firestore)
 */
export interface WritingTestDraft {
    id: string;
    userId: string;
    testType: 'IELTS';
    skill: 'Writing';
    metadata: WritingTestMetadata;
    tasks: WritingTask[];
    isPublic?: boolean;
    status: 'editing' | 'review' | 'published';
    publishedTestId?: string;
    createdAt: Date;
    updatedAt: Date;
}

// ═══════════════════════════════════════════════════════════════
// WRITING SUBMISSION (Firestore — Self-Contained)
// ═══════════════════════════════════════════════════════════════

/**
 * Student writing submission (Firestore: writing_submissions/{submissionId})
 * 
 * This is the primary document for a student's writing attempt.
 * Contains: essays, grading, annotations, feedback, and audit trail.
 * Single document per submission (~20KB worst case, well within 1MB limit).
 */
export interface WritingSubmission {
    id: string;                      // = resultId for cross-reference
    studentId: string;
    studentName: string;

    // Context: how this submission originated
    context: {
        type: 'live-session' | 'solo-practice' | 'homework';
        sessionCode?: string;          // Live session only
        homeworkId?: string;           // Homework only
        homeworkSubmissionId?: string; // Homework attempt record in homework_submissions
        assigningTeacherId?: string;   // Homework: auto-assigned teacher
        isLate?: boolean;              // Homework: submitted after effective due date
        selectedTeacherId?: string;    // Solo: student-chosen teacher
        studentNote?: string;          // Solo: optional message to teacher
        classId?: string;
        className?: string;
        courseId?: string;
        courseName?: string;
        moduleId?: string;
        moduleName?: string;
    };

    // Test metadata (embedded — self-contained)
    testMeta: {
        testId: string;
        testTitle: string;
        format: WritingTestFormat;
        duration: number;
    };

    // Student's essays (embedded task prompts + essays)
    tasks: WritingSubmissionTask[];

    // Timing
    submittedAt: number;
    totalElapsedTimeSeconds: number;
    pasteAttemptCount: number;       // External paste attempts logged

    // Grading status
    markingStatus: 'pending-review' | 'graded';

    // Canonical published grading artifact
    publishedGrading?: PublishedWritingGrading | null;

    // Metadata for an unpublished private grading draft
    gradingDraftMeta?: WritingGradingDraftMeta | null;

    // Grading result (populated when teacher grades)
    grading?: WritingGradingResult;

    // Annotations on the essay (populated during grading)
    annotations: WritingAnnotation[];

    // Grading audit trail
    auditTrail: WritingGradingAudit[];
}

/**
 * A single task within a writing submission
 */
export interface WritingSubmissionTask {
    taskNumber: 1 | 2;
    taskType: WritingTask1Type | WritingTask2Type;
    promptText: string;              // Embedded from test (immutable snapshot)
    promptImageUrl?: string;         // Embedded from test
    wordMinimum: number;
    essayText: string;               // Student's essay
    wordCount: number;
    activeTimeSeconds: number;       // Active writing time (keystroke-gap tracked)
}

// ═══════════════════════════════════════════════════════════════
// GRADING
// ═══════════════════════════════════════════════════════════════

/**
 * Grading result
 */
export interface WritingGradingResult {
    teacherId: string;
    teacherName: string;
    gradedAt: number;
    overallBand: number;             // Weighted average, rounded per IELTS rules

    perTask: WritingTaskGradingResult[];

    feedback: {
        overall: string;               // Rich HTML
        perCriteria: {
            TA?: string;                 // Rich HTML — Task 1
            TR?: string;                 // Rich HTML — Task 2
            CC: string;                  // Rich HTML
            LR: string;                  // Rich HTML
            GRA: string;                 // Rich HTML
        };
    };
}

/**
 * Per-task grading result
 */
export interface WritingTaskGradingResult {
    taskNumber: 1 | 2;
    isVoided: boolean;
    voidReason?: string;
    criteriaScores: {
        TA?: number;                   // Task Achievement (Task 1 only) — whole number 0-9
        TR?: number;                   // Task Response (Task 2 only) — whole number 0-9
        CC: number;                    // Coherence & Cohesion — whole number 0-9
        LR: number;                    // Lexical Resource — whole number 0-9
        GRA: number;                   // Grammatical Range & Accuracy — whole number 0-9
    };
    taskBand: number;                // Average of 4 criteria, rounded DOWN to nearest 0.5
}

export type CommentCategoryId =
    | 'gra'
    | 'lr'
    | 'cc'
    | 'ta'
    | 'tr'
    | 'uncategorized';

export interface CommentCategoryDefinition {
    id: CommentCategoryId;
    label: string;
    color: string;
}

export const COMMENT_CATEGORIES: Record<CommentCategoryId, CommentCategoryDefinition> = {
    gra: { id: 'gra', label: 'GRA', color: '#ef4444' },
    lr: { id: 'lr', label: 'LR', color: '#f97316' },
    cc: { id: 'cc', label: 'CC', color: '#0ea5e9' },
    ta: { id: 'ta', label: 'TA', color: '#22c55e' },
    tr: { id: 'tr', label: 'TR', color: '#22c55e' },
    uncategorized: { id: 'uncategorized', label: 'General', color: '#64748b' },
};

export interface QuickCommentPreset {
    id: string;
    text: string;
    categoryId: CommentCategoryId;
    categoryLabel: string;
    color: string;
    isDefault: boolean;
    createdByTeacherId?: string;
    createdAt?: number;
    updatedAt?: number;
}

export interface GradingComment {
    id: string;
    taskNumber: 1 | 2;
    text: string;
    categoryId: CommentCategoryId;
    categoryLabel: string;
    color: string;
    status: 'active' | 'resolved' | 'deleted';
    anchorText: string;
    from: number;
    to: number;
    createdAt: number;
    updatedAt: number;
    resolvedAt?: number;
    deletedAt?: number;
}

export interface WritingTaskMarkupState {
    taskNumber: 1 | 2;
    markedContent: Record<string, any> | null;
    comments: GradingComment[];
    isVoided: boolean;
    voidReason?: string;
    criteriaScores: {
        TA?: number;
        TR?: number;
        CC?: number;
        LR?: number;
        GRA?: number;
    };
    taskBand: number | null;
    taskSummary: string;
    perCriteriaFeedback: {
        TA?: string;
        TR?: string;
        CC: string;
        LR: string;
        GRA: string;
    };
}

export interface WritingPendingCommentDraft {
    commentId: string;
    taskNumber: 1 | 2;
    anchorText: string;
    from: number;
    to: number;
    categoryId: CommentCategoryId;
    html: string;
}

export interface WritingGradingDraft {
    submissionId: string;
    version: number;
    ownerTeacherId: string;
    ownerTeacherName: string;
    basedOnPublishedVersion: number;
    createdAt: number;
    updatedAt: number;
    overallSummary: string;
    perTask: Partial<Record<1 | 2, WritingTaskMarkupState>>;
    pendingCommentDrafts?: Partial<Record<1 | 2, WritingPendingCommentDraft>>;
}

export interface WritingGradingDraftMeta {
    ownerTeacherId: string;
    ownerTeacherName: string;
    version: number;
    basedOnPublishedVersion: number;
    updatedAt: number;
}

export interface PublishedWritingGrading {
    teacherId: string;
    teacherName: string;
    gradedAt: number;
    updatedAt: number;
    overallBand: number;
    overallSummary: string;
    auditVersion: number;
    perTask: Partial<Record<1 | 2, WritingTaskMarkupState>>;
}

export interface WritingSubmissionForGrading {
    submission: WritingSubmission;
    publishedGrading: PublishedWritingGrading | null;
    gradingDraft: WritingGradingDraft | null;
}
export type WritingSuggestionCacheStatus = 'generating' | 'ready' | 'failed';

export type WritingSuggestionFocus = 'grammar' | 'vocabulary-expression';

export type WritingSuggestionKind = 'comment' | 'correction';

export interface WritingSuggestionItem {
    id: string;
    taskNumber: 1 | 2;
    kind: WritingSuggestionKind;
    focus: WritingSuggestionFocus;
    sentenceIndex: number;
    anchorText: string;
    from: number;
    to: number;
    title: string;
    reason: string;
    suggestedCommentText?: string;
    replacementText?: string;
    categoryId: CommentCategoryId;
}

export interface WritingSuggestionItemSet {
    comments: WritingSuggestionItem[];
    corrections: WritingSuggestionItem[];
}

export interface WritingSuggestionTaskResult {
    taskNumber: 1 | 2;
    grammar: WritingSuggestionItemSet;
    vocabularyExpression: WritingSuggestionItemSet;
}

export interface WritingSuggestionCacheDoc {
    submissionId: string;
    status: WritingSuggestionCacheStatus;
    generatedAt?: number;
    updatedAt: number;
    error?: string;
    perTask: Partial<Record<1 | 2, WritingSuggestionTaskResult>>;
    generatedFromEssayHashByTask: Partial<Record<1 | 2, string>>;
}

// ═══════════════════════════════════════════════════════════════
// ANNOTATIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Annotation on student essay
 */
export interface WritingAnnotation {
    id: string;
    taskNumber: 1 | 2;
    type: 'highlight' | 'comment' | 'strikethrough' | 'correction' | 'textColor';
    startOffset: number;             // Character offset in essay text
    endOffset: number;
    color: string;                   // Hex color (e.g., '#3b82f6')
    categoryId: string;              // e.g., 'TA', 'CC', 'SPL', 'FMT'
    categoryLabel: string;           // e.g., 'Task Achievement', 'Spelling'
    commentText?: string;            // For 'comment' type
    correctionText?: string;         // For 'correction' type — suggested replacement
    createdAt: number;
}

/**
 * Custom annotation category (per-teacher, Firestore)
 * Stored at: users/{teacherId}/settings/writingAnnotationCategories
 */
export interface AnnotationCategory {
    id: string;                      // e.g., 'SPL', 'FMT'
    label: string;                   // e.g., 'Spelling'
    color: string;                   // Hex color
    isDefault: boolean;              // true for 4 IELTS criteria presets
}

// ═══════════════════════════════════════════════════════════════
// AUDIT TRAIL
// ═══════════════════════════════════════════════════════════════

/**
 * Grading audit entry
 */
export interface WritingGradingAudit {
    version: number;
    gradedAt: number;
    teacherId: string;
    teacherName?: string;
    action?: 'published' | 'regraded' | 'discarded-draft';
    reason: string;                  // Required when re-grading
    previousScores: {
        overallBand: number;
        perTask: Array<{
            taskNumber: number;
            criteriaScores: Record<string, number>;
            taskBand: number;
            isVoided: boolean;
        }>;
    };
}
