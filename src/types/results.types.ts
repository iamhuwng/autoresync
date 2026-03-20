import type { ResultContext } from './solo.types';
import type { FormativeFeedback } from './thcs-test.types';
import type { SectionResult } from './thcs-test.types';

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

    // PRD-0039: Derived attempt summary (UI-only, not persisted to RTDB)
    attemptSummary?: AttemptSummary;

    // Result Context (PRD-0016: Solo Study & Homework System)
    // Identifies how the result was generated:
    // - class_session: Teacher-led live session
    // - homework: Teacher-assigned async homework
    // - self_study: Student-initiated practice
    // - course_material: Course material practice
    context?: ResultContext;
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
