/**
 * Setup script for Feedback Demo
 * Creates mock test result data with feedback for demonstration
 */

import type { EnhancedTestResultRecord } from '@/types/results.types';

export const generateMockResultWithFeedback = (): EnhancedTestResultRecord => {
    const now = Date.now();

    return {
        resultId: 'demo-result-001',
        testId: 'test-demo-001',
        testTitle: 'IELTS Reading Practice Test',
        testType: 'test',
        testSkill: 'reading',
        sessionCode: 'DEMO123',
        studentId: 'demo-student',
        studentName: 'Demo Student',
        isGuest: false,
        teacherId: 'demo-teacher',

        // Scores
        totalScore: 7,
        maxScore: 10,
        percentage: 70,
        bandScore: 6.5,

        // Summary
        totalQuestions: 10,
        correct: 7,
        incorrect: 3,
        partialCredit: 0,

        // Timestamps
        submittedAt: now - (24 * 60 * 60 * 1000), // 1 day ago
        timeElapsed: 1800, // 30 minutes
        createdAt: now - (24 * 60 * 60 * 1000),
        testDuration: 3600, // 1 hour

        // Academic context
        courseId: 'course-ielts',
        courseName: 'IELTS Preparation',
        classId: 'class-morning-a',
        className: 'Morning Class A',
        moduleId: 'module-reading-1',
        moduleName: 'Module 1: Reading Basics',

        // Feedback
        overallFeedback: 'Good effort! You showed strong comprehension skills. Focus on time management for the last few questions.',
        feedbackUpdatedAt: now - (12 * 60 * 60 * 1000), // 12 hours ago
        feedbackUpdatedBy: 'Teacher Smith',

        // Question results with per-question feedback
        questionResults: [
            {
                questionNumber: 1,
                questionType: 'multiple_choice',
                isCorrect: true,
                studentAnswer: 'A',
                correctAnswer: 'A',
                score: 1,
                maxScore: 1,
                feedback: '',
                teacherFeedback: 'Excellent! You correctly identified the main idea.',
            },
            {
                questionNumber: 2,
                questionType: 'multiple_choice',
                isCorrect: true,
                studentAnswer: 'C',
                correctAnswer: 'C',
                score: 1,
                maxScore: 1,
                feedback: '',
                teacherFeedback: null,
            },
            {
                questionNumber: 3,
                questionType: 'multiple_choice',
                isCorrect: false,
                studentAnswer: 'B',
                correctAnswer: 'D',
                score: 0,
                maxScore: 1,
                feedback: '',
                teacherFeedback: 'Remember to look for synonyms in the passage. "Increase" can also mean "rise".',
            },
            {
                questionNumber: 4,
                questionType: 'multiple_choice',
                isCorrect: true,
                studentAnswer: 'D',
                correctAnswer: 'D',
                score: 1,
                maxScore: 1,
                feedback: '',
                teacherFeedback: null,
            },
            {
                questionNumber: 5,
                questionType: 'multiple_choice',
                isCorrect: true,
                studentAnswer: 'A',
                correctAnswer: 'A',
                score: 1,
                maxScore: 1,
                feedback: '',
                teacherFeedback: null,
            },
            {
                questionNumber: 6,
                questionType: 'multiple_choice',
                isCorrect: false,
                studentAnswer: 'C',
                correctAnswer: 'B',
                score: 0,
                maxScore: 1,
                feedback: '',
                teacherFeedback: 'The key word here is "primarily". Option B is the main focus of the paragraph.',
            },
            {
                questionNumber: 7,
                questionType: 'multiple_choice',
                isCorrect: true,
                studentAnswer: 'B',
                correctAnswer: 'B',
                score: 1,
                maxScore: 1,
                feedback: '',
                teacherFeedback: null,
            },
            {
                questionNumber: 8,
                questionType: 'multiple_choice',
                isCorrect: false,
                studentAnswer: 'A',
                correctAnswer: 'C',
                score: 0,
                maxScore: 1,
                feedback: '',
                teacherFeedback: 'Watch out for "not" questions. The passage says the opposite of what you selected.',
            },
            {
                questionNumber: 9,
                questionType: 'multiple_choice',
                isCorrect: true,
                studentAnswer: 'D',
                correctAnswer: 'D',
                score: 1,
                maxScore: 1,
                feedback: '',
                teacherFeedback: 'Perfect! You understood the inference correctly.',
            },
            {
                questionNumber: 10,
                questionType: 'multiple_choice',
                isCorrect: true,
                studentAnswer: 'C',
                correctAnswer: 'C',
                score: 1,
                maxScore: 1,
                feedback: '',
                teacherFeedback: null,
            },
        ],
    };
};

export const generateMockResultsWithMixedFeedback = (): EnhancedTestResultRecord[] => {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    return [
        // Result with full feedback
        generateMockResultWithFeedback(),

        // Result without feedback
        {
            resultId: 'demo-result-002',
            testId: 'test-demo-002',
            testTitle: 'IELTS Listening Practice Test',
            testType: 'test',
            testSkill: 'listening',
            sessionCode: 'DEMO124',
            studentId: 'demo-student',
            studentName: 'Demo Student',
            isGuest: false,
            teacherId: 'demo-teacher',
            totalScore: 8,
            maxScore: 10,
            percentage: 80,
            bandScore: 7,
            totalQuestions: 10,
            correct: 8,
            incorrect: 2,
            partialCredit: 0,
            submittedAt: now - (2 * dayMs),
            timeElapsed: 2100,
            createdAt: now - (2 * dayMs),
            testDuration: 3600,
            courseId: 'course-ielts',
            courseName: 'IELTS Preparation',
            classId: 'class-morning-a',
            className: 'Morning Class A',
            moduleId: 'module-listening-1',
            moduleName: 'Module 2: Listening Skills',
            overallFeedback: null,
            feedbackUpdatedAt: null,
            feedbackUpdatedBy: null,
            questionResults: Array.from({ length: 10 }, (_, i) => ({
                questionNumber: i + 1,
                questionType: 'multiple_choice',
                isCorrect: i < 8,
                studentAnswer: String.fromCharCode(65 + (i % 4)),
                correctAnswer: i < 8
                    ? String.fromCharCode(65 + (i % 4))
                    : String.fromCharCode(65 + ((i + 1) % 4)),
                score: i < 8 ? 1 : 0,
                maxScore: 1,
                feedback: '',
                teacherFeedback: null,
            })),
        },

        // Result with overall feedback only
        {
            resultId: 'demo-result-003',
            testId: 'test-demo-003',
            testTitle: 'Writing Task 1 Practice',
            testType: 'quiz',
            testSkill: 'writing',
            sessionCode: 'DEMO125',
            studentId: 'demo-student',
            studentName: 'Demo Student',
            isGuest: false,
            teacherId: 'demo-teacher',
            totalScore: 6,
            maxScore: 10,
            percentage: 60,
            bandScore: 6,
            totalQuestions: 10,
            correct: 6,
            incorrect: 4,
            partialCredit: 0,
            submittedAt: now - (3 * dayMs),
            timeElapsed: 2700,
            createdAt: now - (3 * dayMs),
            testDuration: 3600,
            courseId: 'course-ielts',
            courseName: 'IELTS Preparation',
            classId: 'class-morning-a',
            className: 'Morning Class A',
            moduleId: 'module-writing-1',
            moduleName: 'Module 3: Writing Task 1',
            overallFeedback: 'You need to work on organizing your paragraphs better. Review the structure guidelines.',
            feedbackUpdatedAt: now - (dayMs),
            feedbackUpdatedBy: 'Teacher Johnson',
            questionResults: Array.from({ length: 10 }, (_, i) => ({
                questionNumber: i + 1,
                questionType: 'multiple_choice',
                isCorrect: i < 6,
                studentAnswer: String.fromCharCode(65 + (i % 4)),
                correctAnswer: i < 6
                    ? String.fromCharCode(65 + (i % 4))
                    : String.fromCharCode(65 + ((i + 1) % 4)),
                score: i < 6 ? 1 : 0,
                maxScore: 1,
                feedback: '',
                teacherFeedback: null,
            })),
        },
    ];
};
