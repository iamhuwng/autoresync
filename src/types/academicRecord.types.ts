/**
 * Academic Record Types
 * 
 * Type definitions for student academic records, progress tracking,
 * and performance analytics.
 * Part of PRD-0015: Academic Record & Enhanced Profile System - Phase 3
 */

/**
 * Academic Summary
 * Comprehensive overview of a student's academic performance
 */
export interface AcademicSummary {
    studentId: string;
    studentName: string;

    // Overall Statistics
    totalTests: number;
    totalQuizzes: number;
    averageScore: number;
    averageBandScore: number;

    // Best Performances
    bestScore: number;
    bestBandScore: number;
    bestTestId: string | null;

    // Recent Activity
    lastTestDate: number | null;
    recentScores: {
        resultId: string;
        testTitle: string;
        score: number;
        percentage: number;
        submittedAt: number;
        skill: string;
    }[];

    // Skill Breakdown
    skillBreakdown: SkillBreakdown[];

    // Course Progress
    courseProgress: CourseProgress[];

    // Time Range
    periodStart: number;
    periodEnd: number;

    // Metadata
    generatedAt: number;
    cacheKey?: string;

    // THCS/THPT Progress (Phase 3)
    thcsProgress?: {
        testsCompleted: number;
        averageScore: number;         // 0-10 scale
        scoreHistory: Array<{
            testId: string;
            testTitle: string;
            score: number;              // 0-10
            date: number;
            gradeLevel: number;
            examType: string;
        }>;
        skillBreakdown?: {
            pronunciation: { average: number; count: number };
            grammar: { average: number; count: number };
            vocabulary: { average: number; count: number };
            reading: { average: number; count: number };
            writing: { average: number; count: number };
        };
        lastUpdated: number;
    };

    // Progressive Feedback (Academic Record page)
    progressiveFeedback?: ProgressiveFeedbackRecord;
}

export interface ProgressiveFeedbackSnapshot {
    windowStart: number;
    windowEnd: number;
    testCount: number;
    averageScore: number;
    strongestSkills: string[];
    weakestSkills: string[];
    recurringGaps: string[];
}

export interface ProgressiveFeedbackNarrative {
    summary: string;
    progression: string;
    regression: string;
    repetition: string;
    advice: string;
}

export interface ProgressiveFeedbackRecord {
    generatedAt: number;
    sourceWindowDays: number;
    maxResultsAnalyzed: number;
    basedOnResultIds: string[];
    lastAutoRefreshAt: number;
    lastManualRefreshAt: number | null;
    nextEligibleManualRefreshAt: number | null;
    nextScheduledRefreshAt: number;
    currentSnapshot: ProgressiveFeedbackSnapshot;
    previousSnapshot: ProgressiveFeedbackSnapshot | null;
    strengths: string[];
    weaknesses: string[];
    criticalGaps: string[];
    positiveProgressions: string[];
    regressions: string[];
    repetitivePatterns: string[];
    narrative: ProgressiveFeedbackNarrative;
    deterministicFeedback: string;
    aiModel?: string;
}

/**
 * Course Progress
 * Tracks student progress within a specific course
 */
export interface CourseProgress {
    courseId: string;
    courseName: string;
    classId: string | null;
    className: string | null;

    // Progress Metrics
    totalModules: number;
    completedModules: number;
    progressPercentage: number;

    // Performance
    totalTests: number;
    averageScore: number;
    bestScore: number;

    // Module Details
    moduleProgress: {
        moduleId: string;
        moduleName: string;
        isCompleted: boolean;
        testCount: number;
        averageScore: number;
        lastAttemptDate: number | null;
    }[];

    // Timestamps
    enrolledAt: number | null;
    lastActivityAt: number | null;
    completedAt: number | null;
}

/**
 * Skill Breakdown
 * Performance analysis by skill type
 */
export interface SkillBreakdown {
    skill: 'reading' | 'listening' | 'writing' | 'speaking';

    // Test Counts
    totalTests: number;
    totalQuizzes: number;

    // Scores
    averageScore: number;
    averageBandScore: number;
    bestScore: number;
    worstScore: number;

    // Trend Analysis
    trend: 'improving' | 'stable' | 'declining' | 'insufficient-data';
    trendPercentage: number; // Positive for improvement, negative for decline

    // Recent Performance
    recentTests: {
        resultId: string;
        testTitle: string;
        score: number;
        bandScore: number;
        submittedAt: number;
    }[];

    // Strengths & Weaknesses
    strongAreas: string[]; // Question types with >80% accuracy
    weakAreas: string[]; // Question types with <50% accuracy
}

/**
 * Result Preview
 * Lightweight result entry for index/list views
 * Used in Firebase indexes for efficient querying
 */
export interface ResultPreview {
    resultId: string;
    testTitle: string;
    testType: 'quiz' | 'test';
    skill: 'reading' | 'listening' | 'writing' | 'speaking';

    // Scores
    percentage: number;
    bandScore: number;

    // Context
    courseId: string | null;
    courseName: string | null;
    classId: string | null;
    className: string | null;
    moduleId: string | null;
    moduleName: string | null;

    // Metadata
    submittedAt: number;
    isGuest: boolean;

    // Quick Stats
    correct: number;
    totalQuestions: number;
}

/**
 * Academic Record Query Filters
 * Filter options for querying academic records
 */
export interface AcademicRecordFilters {
    // Time Range
    dateFrom?: number;
    dateTo?: number;

    // Context Filters
    courseId?: string;
    classId?: string;
    moduleId?: string;

    // Performance Filters
    skill?: 'reading' | 'listening' | 'writing' | 'speaking';
    testType?: 'quiz' | 'test';
    minScore?: number;
    maxScore?: number;

    // Sorting
    sortBy?: 'date' | 'score' | 'skill' | 'course';
    sortOrder?: 'asc' | 'desc';

    // Pagination
    limit?: number;
    offset?: number;
}

/**
 * Progress Calculation Options
 * Configuration for progress calculation
 */
export interface ProgressCalculationOptions {
    // Include only completed modules
    completedOnly?: boolean;

    // Weight by module importance
    weighted?: boolean;
    moduleWeights?: Record<string, number>;

    // Time-based filtering
    sinceDate?: number;
    untilDate?: number;
}

/**
 * Academic Analytics
 * Advanced analytics for student performance
 */
export interface AcademicAnalytics {
    studentId: string;

    // Performance Trends
    scoreProgression: {
        date: number;
        averageScore: number;
        testCount: number;
    }[];

    // Band Score Progression
    bandScoreProgression: {
        date: number;
        bandScore: number;
    }[];

    // Study Patterns
    studyStreak: number; // Consecutive days with activity
    mostActiveDay: string; // Day of week
    mostActiveHour: number; // Hour of day (0-23)

    // Improvement Rate
    improvementRate: number; // Percentage improvement over time
    projectedBandScore: number; // Predicted future band score

    // Comparison
    classRank?: number;
    classSize?: number;
    percentile?: number;
}

/**
 * Feedback Summary
 * Summary of teacher feedback for a student
 */
export interface FeedbackSummary {
    studentId: string;

    // Feedback Counts
    totalFeedbackReceived: number;
    feedbackByTeacher: Record<string, number>;

    // Recent Feedback
    recentFeedback: {
        resultId: string;
        testTitle: string;
        overallFeedback: string;
        feedbackDate: number;
        teacherName: string;
    }[];

    // Feedback Themes
    commonThemes: string[]; // Extracted keywords/themes
    areasForImprovement: string[];
    strengths: string[];
}
