import type { ResultContext } from './solo.types';

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
    testType: 'quiz' | 'test';
    testSkill: 'reading' | 'listening' | 'writing' | 'speaking';
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

    // Result Context (PRD-0016: Solo Study & Homework System)
    // Identifies how the result was generated:
    // - class_session: Teacher-led live session
    // - homework: Teacher-assigned async homework
    // - self_study: Student-initiated practice
    // - course_material: Course material practice
    context?: ResultContext;
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
    testType?: 'quiz' | 'test';
    skill?: 'reading' | 'listening' | 'writing' | 'speaking';
    scoreMin?: number;
    scoreMax?: number;
    isGuest?: boolean;
    classId?: string;
    sessionCode?: string;
    // PRD-0016: Context filtering
    contextType?: 'class_session' | 'homework' | 'self_study' | 'course_material';
    homeworkId?: string;
}
