// File: src/hooks/solo/useSoloSubmission.ts
import { useState } from 'react';
import type { MutableRefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { scoreQuestion } from '../../services/autoMarking.service';
import { calculateIELTSReadingBandScore } from '../../config/scoring.config';
import { saveTestResult } from '../../services/testResults.service';
import { getTestQuestionsFromFirebase } from '../../services/testStorage';
import { getIELTSQuestionsForStudent } from '../../utils/thcsShuffle';
import { clearSoloProgress } from './useSoloAutoSave';
import type { ResolvedPracticeSettings } from '../../types/practice.types';
import type { HomeworkIntegrity } from '../../types/integrity.types';
import {
    summarizeError,
    summarizeIntegritySnapshot,
    trackAntiCheatAction,
} from '../../services/antiCheatReporting';

interface TestData {
    id: string;
    duration: number;
    questions: Array<{ number: number; type: string; answer: any;[key: string]: any }>;
    questionCount: number;
    title?: string;
    type?: string;
    skill?: string;
}

interface StudentAnswers {
    [questionNumber: number]: any;
}

interface TestResults {
    correctAnswers: number;
    totalQuestions: number;
    totalScore?: number;
    percentage?: number;
    bandScore?: number;
    questionResults: Record<number, boolean>;
}

interface UseSoloSubmissionOptions {
    testData: TestData | null;
    answers: StudentAnswers;
    materialId: string | undefined;
    studentId: string | undefined;
    studentName: string;
    timeRemaining: number;
    resolvedSettings: ResolvedPracticeSettings | null;
    context: {
        type: 'course_material' | 'self_study' | 'homework';
        source: { type: string; id: string; name: string };
    };
    /** Course context for progress update */
    courseContext?: {
        courseId: string;
        moduleId: string;
    };
    /** Homework context — when set, also updates homework_submissions */
    homeworkId?: string;
    /** Homework submission ID — required for homework mode */
    submissionId?: string;
    questionsWithAnswersRef?: MutableRefObject<TestData['questions'] | null>;
    questionPresentation?: {
        studentId?: string | null;
        shuffleQuestions?: boolean;
        shuffleOptions?: boolean;
    } | null;
    integrity?: HomeworkIntegrity;
    attemptsNullified?: boolean;
    telemetrySurface?: string;
}

interface UseSoloSubmissionReturn {
    isSubmitting: boolean;
    testSubmitted: boolean;
    testResults: TestResults | null;
    handleSubmit: (isAutoSubmit?: boolean) => Promise<void>;
    markTest: () => Promise<TestResults>;
    isLocked: boolean;
    lockInputs: () => void;
}

export const useSoloSubmission = ({
    testData,
    answers,
    materialId,
    studentId,
    studentName,
    timeRemaining,
    resolvedSettings,
    context,
    courseContext,
    homeworkId,
    submissionId,
    questionsWithAnswersRef,
    questionPresentation,
    integrity,
    attemptsNullified = false,
    telemetrySurface = 'solo_submission',
}: UseSoloSubmissionOptions): UseSoloSubmissionReturn => {
    const isHomework = context.type === 'homework' && !!homeworkId;
    const navigate = useNavigate();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [testSubmitted, setTestSubmitted] = useState(false);
    const [testResults, setTestResults] = useState<TestResults | null>(null);
    const [isLocked, setIsLocked] = useState(false);

    const loadGradingQuestions = async (): Promise<NonNullable<TestData['questions']>> => {
        if (questionsWithAnswersRef?.current && questionsWithAnswersRef.current.length > 0) {
            return questionsWithAnswersRef.current;
        }

        if (!testData?.id) {
            return testData?.questions ?? [];
        }

        const result = await getTestQuestionsFromFirebase(testData.id);
        if (!result.success || !result.data) {
            throw new Error(result.error || 'Failed to load grading questions');
        }

        const gradingQuestions = getIELTSQuestionsForStudent(
            result.data,
            questionPresentation?.studentId,
            testData.id,
            {
                shuffleQuestions: questionPresentation?.shuffleQuestions,
                shuffleOptions: questionPresentation?.shuffleOptions,
            },
        ) as NonNullable<TestData['questions']>;

        if (questionsWithAnswersRef) {
            questionsWithAnswersRef.current = gradingQuestions;
        }

        return gradingQuestions;
    };

    const markTest = async (): Promise<TestResults> => {
        if (!testData) return { correctAnswers: 0, totalQuestions: 0, questionResults: {} };
        const gradingQuestions = await loadGradingQuestions();

        let correctAnswers = 0;
        const questionResults: Record<number, boolean> = {};

        gradingQuestions.forEach(question => {
            const studentAnswer = answers[question.number];
            const result = scoreQuestion(
                question as any,
                studentAnswer === undefined || studentAnswer === null ? '' : String(studentAnswer)
            );
            questionResults[question.number] = result.isCorrect;
            if (result.isCorrect) correctAnswers++;
        });

        const percentage = Math.round((correctAnswers / testData.questions.length) * 100);
        const bandScore = calculateIELTSReadingBandScore(correctAnswers, testData.questions.length);

        return {
            correctAnswers,
            totalQuestions: testData.questions.length,
            questionResults,
            percentage,
            bandScore,
            totalScore: correctAnswers,
        };
    };

    const handleSubmit = async (isAutoSubmit = false): Promise<void> => {
        if (isSubmitting || !testData || testSubmitted || !materialId || !studentId) return;

        // M5: Server-side maxAttempts guard — check before allowing submission
        if (resolvedSettings?.maxAttempts != null && resolvedSettings.maxAttempts > 0) {
            try {
                const { getStudentResultCount } = await import('../../services/testResults.service');
                const existingCount = await getStudentResultCount(studentId, materialId);
                if (existingCount >= resolvedSettings.maxAttempts) {
                    alert(`You've reached the maximum number of attempts (${resolvedSettings.maxAttempts}). This submission cannot be saved.`);
                    return;
                }
            } catch (err) {
                console.warn('Failed to check attempt count, allowing submission:', err);
                // Fail open — allow the submit if we can't check
            }
        }

        const unansweredCount = testData.questionCount - Object.keys(answers).length;
        if (!isAutoSubmit && unansweredCount > 0) {
            const confirmed = window.confirm(
                `You have ${unansweredCount} unanswered question(s). Are you sure you want to submit?`
            );
            if (!confirmed) return;
        }

        setIsSubmitting(true);

        try {
            const results = await markTest();

            // Build marking result for saveTestResult
            const gradingQuestions = await loadGradingQuestions();
            const questionResultsList = gradingQuestions.map(q => ({
                questionId: String(q.id || q.number),
                questionNumber: q.number,
                questionType: q.type as any,
                studentAnswer: answers[q.number] || '',
                correctAnswer: q.answer,
                isCorrect: results.questionResults[q.number] || false,
                score: results.questionResults[q.number] ? 1 : 0,
                maxScore: 1,
                feedback: results.questionResults[q.number] ? 'Correct' : 'Incorrect',
                partialCredit: false,
            }));

            const markingResult = {
                totalScore: results.correctAnswers,
                maxScore: results.totalQuestions,
                percentage: results.percentage || 0,
                questionResults: questionResultsList,
                summary: {
                    correct: results.correctAnswers,
                    incorrect: results.totalQuestions - results.correctAnswers,
                    partialCredit: 0,
                    totalQuestions: results.totalQuestions,
                },
                correct: results.correctAnswers,
                incorrect: results.totalQuestions - results.correctAnswers,
                partialCredit: 0,
                totalQuestions: results.totalQuestions,
                completedAt: Date.now(),
            };

            // Save to test_results/ — NO sessionCode (use materialId as testId)
            const resultId = await saveTestResult(
                `solo_${materialId}_${Date.now()}`, // sessionCode substitute
                materialId,
                studentId,
                studentName,
                markingResult,
                {
                    title: testData.title || 'Practice Test',
                    type: testData.type || 'reading',
                    skill: testData.skill || 'reading',
                    duration: testData.duration,
                },
                (testData.duration * 60) - (isFinite(timeRemaining) ? timeRemaining : 0),
                '', // teacherId — empty for solo
                false, // isGuest — solo requires auth
                undefined, // submissionContent
                courseContext ? {
                    courseId: courseContext.courseId,
                    moduleId: courseContext.moduleId,
                } : undefined,
                {
                    type: context.type,
                    source: context.source,
                    configApplied: {
                        timerMinutes: resolvedSettings?.timerMinutes ?? testData.duration,
                        feedbackTiming: resolvedSettings?.feedbackTiming ?? 'after_completion',
                        source: 'practice_settings',
                    },
                } as any
            );

            const isIeltsReadingOrListening =
                String(testData.type || '').toLowerCase().includes('ielts')
                && ['reading', 'listening'].includes(String(testData.skill || '').toLowerCase());

            if (isIeltsReadingOrListening && resultId) {
                import('../../services/resultFeedbackGeneration.service')
                    .then(({ triggerFormativeFeedbackForSavedResult }) => {
                        triggerFormativeFeedbackForSavedResult(resultId);
                    })
                    .catch((feedbackErr) => {
                        console.warn('Failed to trigger IELTS formative feedback generation:', feedbackErr);
                    });
            }

            // Update course progress if passing score met
            if (courseContext && resolvedSettings?.minPassingScore != null && results.percentage != null) {
                if (results.percentage >= resolvedSettings.minPassingScore) {
                    try {
                        // Dynamic import to avoid circular deps
                        const { updateStudentCourseProgress } = await import('../../services/courseProgressService');
                        await updateStudentCourseProgress(
                            courseContext.courseId,
                            studentId,
                            materialId,
                            { completed: true, score: results.percentage, resultId }
                        );
                        console.log('✅ Course progress updated');
                    } catch (err) {
                        console.warn('Failed to update course progress:', err);
                    }
                }
            }

            // If homework mode, update the homework submission record in Firestore
            if (isHomework && submissionId) {
                try {
                    const { submitHomework } = await import('../../services/homeworkSubmissionService');
                    const timeSpent = (testData.duration * 60) - (isFinite(timeRemaining) ? timeRemaining : 0);
                    await submitHomework(
                        submissionId,
                        resultId,
                        results.correctAnswers,
                        results.totalQuestions,
                        results.percentage || 0,
                        results.bandScore,
                        timeSpent,
                        integrity,
                        attemptsNullified
                    );
                    if (integrity) {
                        trackAntiCheatAction(
                            'persistHomeworkIntegrity',
                            {
                                context: 'homework',
                                surface: telemetrySurface,
                                studentId,
                                testId: testData.id,
                                homeworkId,
                                submissionId,
                            },
                            {
                                status: 'success',
                                attemptsNullified,
                                ...summarizeIntegritySnapshot(integrity),
                            },
                        );
                    }
                    console.log('✅ Homework submission updated:', submissionId);
                } catch (err) {
                    if (integrity) {
                        trackAntiCheatAction(
                            'persistHomeworkIntegrity',
                            {
                                context: 'homework',
                                surface: telemetrySurface,
                                studentId,
                                testId: testData.id,
                                homeworkId,
                                submissionId,
                            },
                            {
                                status: 'failed',
                                attemptsNullified,
                                ...summarizeIntegritySnapshot(integrity),
                                ...summarizeError(err),
                            },
                        );
                    }
                    console.warn('Failed to update homework submission:', err);
                    // Don't block — the test result is already saved
                }
            }

            // Clear localStorage progress
            clearSoloProgress(materialId, studentId);

            // Update local state
            setTestResults(results);
            setTestSubmitted(true);

            // Navigate to the appropriate page
            if (isHomework) {
                // Homework: go back to the homework list
                navigate('/student/homework', {
                    replace: true,
                    state: { justSubmitted: true },
                });
            } else {
                // Solo/Course: go to Academic Record page
                navigate('/student/academic-record', {
                    replace: true,
                    state: { resultId, showResult: true },
                });
            }
        } catch (err) {
            console.error('Error submitting solo test:', err);
            alert('Failed to submit test. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const lockInputs = () => setIsLocked(true);

    return {
        isSubmitting,
        testSubmitted,
        testResults,
        handleSubmit,
        markTest,
        isLocked,
        lockInputs,
    };
};
