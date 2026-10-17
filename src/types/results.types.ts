import type { ResultContext } from './solo.types';
import type { FormativeFeedback } from './thcs-test.types';
import type { SectionResult } from './thcs-test.types';

export type ResultVisibilityContextType =
    | 'homework'
    | 'class_session'
    | 'course_material'
    | 'solo_practice'
    | 'unresolved';

export type ResultVisibilitySourceType =
    | 'homework'
    | 'session'
    | 'class'
    | 'course'
    | 'writing_submission'
    | 'solo_practice'
    | 'unknown';

export type ResultOwnerResolutionSource =
    | 'homework.createdBy'
    | 'session.createdByUserId'
    | 'session.createdBy'
    | 'result.teacherId'
    | 'class.createdBy'
    | 'course.ownerId'
    | 'solo_practice'
    | 'unresolved';

export type ResultVisibilityUnresolvedReason =
    | 'missing_context'
    | 'missing_homework_id'
    | 'missing_session_code'
    | 'missing_class_id'
    | 'missing_course_id'
    | 'missing_writing_submission_id'
    | 'missing_writing_linked_source'
    | 'homework_not_found'
    | 'session_not_found'
    | 'class_not_found'
    | 'course_not_found'
    | 'writing_submission_not_found'
    | 'owner_not_resolved'
    | 'unsupported_context';

export interface ResultVisibilitySnapshot {
    contextType: ResultVisibilityContextType;
    sourceType: ResultVisibilitySourceType;
    sourceId: string | null;
    sourceNameSnapshot: string | null;
    visibilityOwnerTeacherId: string | null;
    ownerResolutionSource: ResultOwnerResolutionSource;
    ownershipResolved: boolean;
    unresolvedReason: ResultVisibilityUnresolvedReason | null;
    homeworkId: string | null;
    sessionCode: string | null;
    courseId: string | null;
    classId: string | null;
    assignmentId: string | null;
    sourceDeleted?: boolean;
    sourceArchived?: boolean;
    currentSourceName?: string | null;
}

export interface DeletedSourceDisplayMetadata {
    sourceType: ResultVisibilitySourceType;
    sourceId: string | null;
    snapshotName: string | null;
    currentName: string | null;
    isDeleted: boolean;
    isArchived: boolean;
}

export interface SoloPracticeVisibilityClassification {
    isSoloPractice: boolean;
    teacherCanView: boolean;
    teacherActionsAllowed: boolean;
    tagLabel: 'Solo Practice' | null;
    excludeFromAnalytics: boolean;
}

export interface ResolvedResultVisibilityVerdict {
    isVisibleToTeacher: boolean;
    isTeacherOwned: boolean;
    shouldDisplayInTeacherHistory: boolean;
    shouldDisplayInTeacherDetail: boolean;
    shouldAllowTeacherActions: boolean;
    excludeFromAnalytics: boolean;
    isUnresolved: boolean;
    exclusionReason:
        | 'assignment_gate_denied'
        | 'missing_visibility'
        | 'unresolved'
        | 'teacher_not_owner'
        | 'visible';
    visibilityOwnerTeacherId: string | null;
    deletedSource: DeletedSourceDisplayMetadata | null;
    soloPractice: SoloPracticeVisibilityClassification;
}

/** Additive Book result visibility inputs. Legacy result visibility stays unchanged. */
export type BookResultViewerRole = 'student' | 'teacher';
export type BookResultContextKind = 'solo' | 'homework';
export type BookResultFeedbackReleaseState = 'pending' | 'withheld' | 'released';
export type BookResultEvaluationState = 'pending_review' | 'submitted' | 'graded';

export interface BookResultOwnershipAttemptInput {
    attemptId: string;
    recipientId: string;
    contextId: string;
    contextKind: BookResultContextKind;
    ownerTeacherIdSnapshot: string | null;
}

export interface BookResultViewerIdentity {
    uid: string;
    role: BookResultViewerRole;
}

export type BookResultOwnershipDenialReason =
    | 'visible'
    | 'wrong_student'
    | 'private_solo'
    | 'wrong_teacher'
    | 'unresolved_owner';

export interface BookResultOwnershipDecision {
    attemptId: string;
    visible: boolean;
    viewerRole: BookResultViewerRole;
    reason: BookResultOwnershipDenialReason;
}

export interface BookResultVisibilityDecision extends BookResultOwnershipDecision {
    canViewResponse: boolean;
    canViewScore: boolean;
    canViewFeedback: boolean;
    canViewSafeProvenance: boolean;
}

export interface UnresolvedResultVisibilityReportEntry {
    resultId: string;
    studentId: string;
    contextType: ResultVisibilityContextType;
    unresolvedReason: ResultVisibilityUnresolvedReason;
    sourceLookupAttempted: boolean;
    strongestKnownSourceClue: string | null;
    ownershipResolved: boolean;
    reportVersion: number;
    createdAt: number;
    updatedAt: number;
}

export type SavedResultFeedbackKind = 'thcs' | 'ielts-reading' | 'ielts-listening' | null;

export type SavedResultFeedbackOutcome =
    | 'saved-ai'
    | 'saved-deterministic'
    | 'reused'
    | 'skipped-ineligible'
    | 'failed';

export interface FeedbackGenerationMeta {
    kind: SavedResultFeedbackKind;
    lastAttemptAt: number | null;
    lastTriggerSource: string | null;
    lastOutcome: SavedResultFeedbackOutcome | null;
    lastError?: string | null;
}

export interface EnhancedTestResultRecord {
    resultId: string;
    sessionCode: string;
    testId: string;
    studentId: string;
    studentName: string;
    isGuest: boolean;
    teacherId: string;

    // Scores
    totalScore: number;
    maxScore: number;
    percentage: number;
    bandScore: number;

    // Test info
    testTitle: string;
    testType: string;
    testSkill: string;
    testDuration: number;

    /**
     * True when retained answer review must not reload retired source material.
     * Missing means legacy/unknown, not source-present.
     */
    sourceMaterialRemoved?: boolean;

    // Question details
    questionResults: QuestionResult[];

    // Summary
    correct: number;
    incorrect: number;
    partialCredit: number;
    totalQuestions: number;

    // Timestamps
    submittedAt: number;
    timeElapsed: number;
    createdAt: number;
    updatedAt?: number;

    // Re-marking
    reMarkHistory?: ReMarkEntry[];
    lastReMarkedAt?: number;
    lastReMarkedBy?: string;

    // Academic Context (PRD-0015: Phase 3)
    courseId?: string | null;
    courseName?: string | null;
    classId?: string | null;
    className?: string | null;
    moduleId?: string | null;
    moduleName?: string | null;

    // Teacher Feedback (PRD-0015: Phase 3)
    overallFeedback?: string | null;
    feedbackUpdatedAt?: number | null;
    feedbackUpdatedBy?: string | null;
    feedbackUpdatedByTeacherId?: string | null;
    feedbackUpdatedByTeacherName?: string | null;

    // Future-proofing for Writing/Speaking
    writingSubmission?: {
        text: string;
        wordCount: number;
    };
    speakingSubmission?: {
        audioUrl: string;
        duration: number;
    };
    rubricScores?: {
        criterion: string;
        score: number;
        maxScore: number;
        feedback: string;
    }[];

    // IELTS Writing data (PRD-0030)
    // Cross-reference to Firestore writing_submissions document
    writingData?: {
        submissionId: string;
        overallBand: number | null;
        markingStatus: 'pending-review' | 'graded';
        tasks: Array<{
            taskNumber: number;
            wordCount: number;
            activeTimeSeconds: number;
        }>;
    };

    // Marking status (PRD-0015: Phase 7 & 8, PRD-0030)
    // - 'auto-marked': Reading/Listening tests marked automatically
    // - 'pending-review': Writing/Speaking tests waiting for teacher review
    // - 'reviewed': Writing/Speaking tests reviewed by teacher
    // - 'graded': Writing tests graded by teacher (PRD-0030)
    markingStatus: 'auto-marked' | 'pending-review' | 'reviewed' | 'graded';

    // PRD-0027: THCS-THPT specific grading data
    thcsData?: {
        scaledScore: number;
        sectionResults: SectionResult[];
        intentBreakdown: Record<string, { correct: number; total: number }>;
    };

    // PRD-0039: IELTS passage breakdown
    ieltsData?: {
        passageResults: PassageResult[];
    };

    // PRD-0039: AI formative feedback (stored at test_results/{id}/formativeFeedback in RTDB)
    formativeFeedback?: FormativeFeedback;

    // PRD-0039: Feedback pipeline status metadata
    feedbackGenerationMeta?: FeedbackGenerationMeta;

    // PRD-0039: Derived attempt summary (UI-only, not persisted to RTDB)
    attemptSummary?: AttemptSummary;

    // Result Context (PRD-0016: Solo Study & Homework System)
    // Identifies how the result was generated:
    // - class_session: Teacher-led live session
    // - homework: Teacher-assigned async homework
    // - self_study: Student-initiated practice
    // - course_material: Course material practice
    context?: ResultContext;

    // PRD-0041: Canonical ownership and teacher-visibility snapshot
    visibility?: ResultVisibilitySnapshot;
}

/** PRD-0039: IELTS passage-level result */
export interface PassageResult {
    passageName: string;
    questionRange: [number, number];
    correct: number;
    total: number;
    percentage: number;
}

/** PRD-0039: Derived attempt summary (UI-only, not persisted) */
export interface AttemptSummary {
    attemptNumber: number;
    totalAttempts: number;
    isLatestAttempt: boolean;
    trend: 'up' | 'down' | 'stable';
    firstAttemptPercentage: number;
    latestAttemptPercentage: number;
}

export interface QuestionResult {
    questionNumber: number;
    questionType: string;
    isCorrect: boolean;
    score: number;
    maxScore: number;
    studentAnswer: any;
    correctAnswer: any;
    feedback: string;
    timeSpent?: number;
    teacherFeedback?: string | null; // PRD-0015: Phase 3
}

export interface ReMarkEntry {
    questionNumber: number;
    originalScore: number;
    newScore: number;
    reason: string;
    remarkedBy: string;
    remarkedAt: number;
}

export interface ProgressData {
    totalTests: number;
    averageScore: number;
    bestScore: number;
    recentScores: { date: number; score: number; skill: string }[];
    skillBreakdown: { skill: string; averageScore: number; testCount: number }[];
    bandScoreProgression: { date: number; bandScore: number }[];
    studyStreak: number;
}

export interface QuestionAnalytics {
    questionNumber: number;
    correctCount: number;
    incorrectCount: number;
    partialCount: number;
    totalAttempts: number;
    difficultyPercent: number;
    commonWrongAnswers: { answer: string; count: number }[];
}

export interface ResultFilters {
    dateFrom?: number;
    dateTo?: number;
    testType?: string;
    skill?: string;
    scoreMin?: number;
    scoreMax?: number;
    isGuest?: boolean;
    classId?: string;
    sessionCode?: string;
    // PRD-0016: Context filtering
    contextType?: 'class_session' | 'homework' | 'self_study' | 'course_material';
    homeworkId?: string;
}
