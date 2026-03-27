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
    testType: 'IELTS';
    skill: 'Writing';               // Discriminator within IELTS tests
    metadata: WritingTestMetadata;
    tasks: WritingTask[];            // 1 or 2 tasks based on format
    createdBy: string;               // Teacher UID
    ownerId: string;
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
    status: 'editing' | 'review' | 'published';
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
        assigningTeacherId?: string;   // Homework: auto-assigned teacher
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
