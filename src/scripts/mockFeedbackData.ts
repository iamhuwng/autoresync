/**
 * Mock Data Generator for Feedback Demo
 * 
 * Generates mock test result data with feedback fields for testing
 * the feedback components without hitting Firebase.
 * 
 * Part of PRD-0015: Academic Record & Enhanced Profile System - Phase 5
 */

import type { EnhancedTestResultRecord } from '../types/results.types';

// Sample question data
const sampleQuestions = [
    {
        type: 'multiple-choice',
        correctAnswer: 'B',
        incorrectAnswer: 'A',
        feedback: 'The correct answer is B because...'
    },
    {
        type: 'fill-blank',
        correctAnswer: 'greenhouse gases',
        incorrectAnswer: 'pollution levels',
        feedback: 'Remember to focus on the key scientific terms...'
    },
    {
        type: 'multiple-choice',
        correctAnswer: 'C',
        incorrectAnswer: 'D',
        feedback: 'Option C is correct based on the passage context...'
    },
    {
        type: 'true-false',
        correctAnswer: 'True',
        incorrectAnswer: 'False',
        feedback: 'The passage clearly states this fact...'
    },
    {
        type: 'matching',
        correctAnswer: 'B-2',
        incorrectAnswer: 'B-3',
        feedback: 'Pay attention to the chronological order...'
    },
];

const studentNames = ['Alice Johnson', 'Bob Smith', 'Charlie Brown', 'Diana Prince', 'Edward Norton'];
const testTitles = [
    'IELTS Reading Practice Test 1',
    'IELTS Listening Practice Test 2',
    'Cambridge Advanced Reading',
    'TOEFL Reading Section',
    'Academic Reading Assessment'
];
const skills = ['reading', 'listening', 'writing', 'speaking'] as const;

/**
 * Generate a mock test result with optional pre-filled feedback
 */
export function generateMockResultWithFeedback(
    options: {
        withOverallFeedback?: boolean;
        feedbackQuestionCount?: number;
        questionCount?: number;
    } = {}
): EnhancedTestResultRecord {
    const {
        withOverallFeedback = Math.random() > 0.5,
        feedbackQuestionCount = Math.floor(Math.random() * 3),
        questionCount = 5
    } = options;

    const studentName = studentNames[Math.floor(Math.random() * studentNames.length)] || 'Test Student';
    const testTitle = testTitles[Math.floor(Math.random() * testTitles.length)] || 'Practice Test';
    const skill = skills[Math.floor(Math.random() * skills.length)] || 'reading';

    // Generate question results
    const questionResults: EnhancedTestResultRecord['questionResults'] = [];
    let correctCount = 0;
    let totalScore = 0;

    for (let i = 1; i <= questionCount; i++) {
        const questionTemplate = sampleQuestions[(i - 1) % sampleQuestions.length]!;
        const isCorrect = Math.random() > 0.4; // 60% correct rate
        const score = isCorrect ? 1 : 0;

        if (isCorrect) correctCount++;
        totalScore += score;

        const hasTeacherFeedback = i <= feedbackQuestionCount;

        questionResults.push({
            questionNumber: i,
            questionType: questionTemplate.type,
            isCorrect,
            score,
            maxScore: 1,
            studentAnswer: isCorrect ? questionTemplate.correctAnswer : questionTemplate.incorrectAnswer,
            correctAnswer: questionTemplate.correctAnswer,
            feedback: questionTemplate.feedback,
            teacherFeedback: hasTeacherFeedback
                ? (isCorrect
                    ? 'Great work on this question! You demonstrated good understanding.'
                    : 'Review this concept. Focus on the key details in the passage.'
                )
                : undefined,
        });
    }

    const maxScore = questionCount;
    const percentage = Math.round((totalScore / maxScore) * 100);
    const bandScore = percentage >= 80 ? 9 : percentage >= 70 ? 8 : percentage >= 60 ? 7 : percentage >= 50 ? 6 : 5;

    const submittedAt = Date.now() - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000); // Within last 7 days
    const firstName = studentName.split(' ')[0] || 'Student';

    const result: EnhancedTestResultRecord = {
        resultId: `demo-result-${Date.now()}`,
        sessionCode: 'DEMO-SESSION',
        testId: 'demo-test-123',
        studentId: 'demo-student-456',
        studentName,

        totalScore,
        maxScore,
        percentage,
        bandScore,

        questionResults,

        correct: correctCount,
        incorrect: questionCount - correctCount,
        partialCredit: 0,
        totalQuestions: questionCount,

        submittedAt,
        timeElapsed: 1800, // 30 minutes
        testDuration: 3600, // 60 minutes
        createdAt: submittedAt,

        testTitle,
        testType: 'quiz',
        testSkill: skill,

        // Required fields
        teacherId: 'demo-teacher-123',
        isGuest: false,

        // Feedback fields
        overallFeedback: withOverallFeedback
            ? `Overall, ${firstName} showed good effort on this test. ${percentage >= 70
                ? 'Keep up the excellent work and continue practicing with challenging materials.'
                : 'Focus on reviewing the areas where mistakes were made and practice more.'
            }`
            : undefined,
        feedbackUpdatedAt: withOverallFeedback ? Date.now() - 3600000 : undefined, // 1 hour ago
        feedbackUpdatedBy: withOverallFeedback ? 'Demo Teacher' : undefined,

        // Academic context
        courseId: 'demo-course-789',
        courseName: 'IELTS Preparation Course',
        classId: undefined,
        className: undefined,
        moduleId: undefined,
        moduleName: undefined,
    };

    return result;
}

/**
 * Generate multiple mock results for batch testing
 */
export function generateMockResultsBatch(count: number = 5): EnhancedTestResultRecord[] {
    return Array.from({ length: count }, (_, i) =>
        generateMockResultWithFeedback({
            withOverallFeedback: i % 2 === 0,
            feedbackQuestionCount: i % 3,
            questionCount: 5
        })
    );
}

export default generateMockResultWithFeedback;
