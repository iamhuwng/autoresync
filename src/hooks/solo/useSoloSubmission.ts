// File: src/hooks/solo/useSoloSubmission.ts
import { useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { useNavigation } from '../useNavigation';
import { scoreQuestion } from '../../services/autoMarking.service';
import { calculateIELTSReadingBandScore } from '../../config/scoring.config';
import { saveTestResult } from '../../services/testResults.service';
import { getTestQuestionsFromFirebase } from '../../services/testStorage';
import { deriveIeltsPassageResults } from '../../services/ieltsPassageResults.service';
import { getIELTSQuestionsForStudent } from '../../utils/thcsShuffle';
import { clearSoloProgress } from './useSoloAutoSave';
import type { SoloAutoSaveFlushOutcome } from './useSoloAutoSave';
import type { ResolvedPracticeSettings, SoloProgressScopeContext } from '../../types/practice.types';
import type { HomeworkIntegrity } from '../../types/integrity.types';
import type { ResultContext, ResultSourceType } from '../../types/solo.types';
import { toast } from '../../components/modern/ToastNotification';
import {
    summarizeError,
    summarizeIntegritySnapshot,
    trackAntiCheatAction,
} from '../../services/antiCheatReporting';
import { studentResumeService } from '../../services/studentResume.service';
import { buildListeningSoloAttemptIdentity } from '../../features/assessment/listening/runtime/solo/listeningSoloAttemptIdentity';

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
        type: ResultContext['type'];
        source: {
            type: string;
            id?: string;
            name?: string;
            sessionCode?: string;
            classId?: string;
            courseId?: string;
            submissionId?: string;
        };
        classId?: string;
        courseId?: string;
        assignmentId?: string;
    };
    /** Course context for progress update */
    courseContext?: {
        courseId: string;
        moduleId: string;
    };
    /** Homework context â€” when set, also updates homework_submissions */
    homeworkId?: string;
    /** Homework submission ID â€” required for homework mode */
    submissionId?: string;
    questionsWithAnswersRef?: MutableRefObject<TestData['questions'] | null>;
    questionPresentation?: {
        studentId?: string | null;
        shuffleQuestions?: boolean;
        shuffleOptions?: boolean;
    } | null;
    progressScopeContext?: SoloProgressScopeContext;
    attemptId?: string;
    submissionOperationId?: string;
    integrity?: HomeworkIntegrity;
    attemptsNullified?: boolean;
    telemetrySurface?: string;
    /** When true, skip the shared unanswered warning because mobile UI provides its own submit sheet */
    skipConfirm?: boolean;
}

interface SoloSubmissionCoordination {
    autosaveFlush?: SoloAutoSaveFlushOutcome;
}

interface UseSoloSubmissionReturn {
    isSubmitting: boolean;
    testSubmitted: boolean;
    testResults: TestResults | null;
    handleSubmit: (isAutoSubmit?: boolean, coordination?: SoloSubmissionCoordination) => Promise<void>;
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
    progressScopeContext,
    attemptId,
    submissionOperationId,
    integrity,
    attemptsNullified = false,
    telemetrySurface = 'solo_submission',
    skipConfirm = false,
}: UseSoloSubmissionOptions): UseSoloSubmissionReturn => {
    const isHomework = context.type === 'homework' && !!homeworkId;
    const { navigateTo } = useNavigation('student');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [testSubmitted, setTestSubmitted] = useState(false);
    const [testResults, setTestResults] = useState<TestResults | null>(null);
    const [isLocked, setIsLocked] = useState(false);
    const isSubmittingRef = useRef(false);
    const testSubmittedRef = useRef(false);
    const submitPromiseRef = useRef<Promise<void> | null>(null);
    const generatedAttemptSeedRef = useRef<string | null>(null);

    const getGeneratedAttemptSeed = () => {
        if (!generatedAttemptSeedRef.current) {
            generatedAttemptSeedRef.current = `attempt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        }
        return generatedAttemptSeedRef.current;
    };

    const buildCanonicalResultContext = (): ResultContext => {
        const normalizedCourseId = courseContext?.courseId || context.courseId || context.source.courseId;
        const normalizedClassId = context.classId || context.source.classId;
        const normalizedSourceId =
            context.type === 'homework'
                ? homeworkId || context.source.id || materialId
                : context.type === 'course_material'
                    ? normalizedCourseId || context.source.id || materialId
                    : context.source.id || materialId;
        const normalizedSourceName =
            context.source.name && context.source.name.trim().length > 0 && context.source.name !== 'Self Study'
                ? context.source.name
                : testData?.title || context.source.name || 'Practice Test';
        const normalizedSourceType = (() => {
            const sourceType = context.source.type as ResultSourceType;
            if (['class', 'homework', 'course', 'library', 'direct_link'].includes(sourceType)) {
                return sourceType;
            }

            if (context.type === 'homework') {
                return 'homework';
            }
            if (context.type === 'course_material') {
                return 'course';
            }
            return 'library';
        })();

        return {
            type: context.type,
            source: {
                type: normalizedSourceType,
                id: normalizedSourceId,
                name: normalizedSourceName,
                sessionCode: context.source.sessionCode,
                classId: normalizedClassId,
                courseId: normalizedCourseId,
                submissionId: submissionId || context.source.submissionId,
            },
            classId: normalizedClassId,
            courseId: normalizedCourseId,
            assignment: homeworkId
                ? {
                    homeworkId,
                    assignmentId: context.assignmentId,
                    attemptNumber: 1,
                }
                : undefined,
            assignmentId: context.assignmentId,
            configApplied: {
                timerMinutes: resolvedSettings?.timerMinutes ?? testData?.duration ?? null,
                feedbackTiming: resolvedSettings?.feedbackTiming ?? 'after_completion',
                source: resolvedSettings ? 'teacher_override' : 'material_default',
            },
        };
    };

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

    const submitOnce = async (isAutoSubmit = false, _coordination?: SoloSubmissionCoordination): Promise<void> => {
        if (!testData || testSubmittedRef.current || !materialId || !studentId) return;

        // M5: Server-side maxAttempts guard â€” check before allowing submission
        if (resolvedSettings?.maxAttempts != null && resolvedSettings.maxAttempts > 0) {
            try {
                const { getStudentResultCount } = await import('../../services/testResults.service');
                const existingCount = await getStudentResultCount(studentId, materialId);
                if (existingCount >= resolvedSettings.maxAttempts) {
                    toast.error(`You've reached the maximum number of attempts (${resolvedSettings.maxAttempts}). This submission cannot be saved.`);
                    return;
                }
            } catch (err) {
                console.warn('Failed to check attempt count, allowing submission:', err);
                // Fail open â€” allow the submit if we can't check
            }
        }

        const unansweredCount = testData.questionCount - Object.keys(answers).length;
        if (!isAutoSubmit && !skipConfirm && unansweredCount > 0) {
            toast.warning(`You have ${unansweredCount} unanswered question(s). Open the submit sheet to confirm when ready.`);
            return;
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

            const isIeltsReadingOrListening =
                String(testData.type || '').toLowerCase().includes('ielts')
                && ['reading', 'listening'].includes(String(testData.skill || '').toLowerCase());

            let ieltsData: { passageResults: ReturnType<typeof deriveIeltsPassageResults> } | undefined;

            if (isIeltsReadingOrListening) {
                try {
                    const mappedQuestions = gradingQuestions.map((q: any) => ({
                        questionNumber: q.number,
                        passageId: q.passageId ?? q.passage ?? undefined,
                        sectionId: q.sectionId ?? (q.sectionNumber !== undefined && q.sectionNumber !== null ? String(q.sectionNumber) : undefined),
                        passageName: q.passageName ?? q.passageTitle ?? (q.passage ? String(q.passage) : undefined),
                        sectionName: q.sectionName ?? (q.sectionNumber !== undefined && q.sectionNumber !== null ? `Part ${q.sectionNumber}` : undefined),
                    }));
                    const passageResults = deriveIeltsPassageResults(mappedQuestions, questionResultsList);
                    if (passageResults.length > 0) {
                        ieltsData = { passageResults };
                    }
                } catch (ieltsErr) {
                    console.warn('Failed to derive IELTS passage results:', ieltsErr);
                }
            }

            const canonicalContext = buildCanonicalResultContext();
            const submitIdentity = buildListeningSoloAttemptIdentity({
                materialId,
                studentId,
                scopeContext: progressScopeContext,
                existingAttemptId: attemptId,
                existingSubmissionOperationId: submissionOperationId,
                generatedAttemptSeed: getGeneratedAttemptSeed(),
            });

            // Save to test_results/ using canonical practice/homework context identifiers
            const resultId = await saveTestResult(
                submitIdentity.submissionOperationId,
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
                undefined,
                false,
                undefined,
                courseContext ? {
                    courseId: courseContext.courseId,
                    moduleId: courseContext.moduleId,
                } : undefined,
                canonicalContext,
                undefined,
                ieltsData,
                {
                    stableResultId: submitIdentity.resultId,
                    submissionOperationId: submitIdentity.submissionOperationId,
                }
            );

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
                        console.log('âœ… Course progress updated');
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
                    console.log('âœ… Homework submission updated:', submissionId);
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
                    // Don't block â€” the test result is already saved
                }
            }

            // Clear localStorage progress
            await clearSoloProgress(materialId, studentId, progressScopeContext);
            await studentResumeService.clearResume();

            // Update local state
            setTestResults(results);
            setTestSubmitted(true);
            testSubmittedRef.current = true;

            // Navigate to the appropriate page
            if (isHomework) {
                // Homework: go back to the homework list
                navigateTo('STUDENT_HOMEWORK', undefined, {
                    replace: true,
                    state: { justSubmitted: true },
                    reason: 'test_submission_homework',
                });
            } else {
                // Solo/Course: go to Academic Record page
                navigateTo('STUDENT_ACADEMIC_RECORD', undefined, {
                    replace: true,
                    state: { resultId, showResult: true },
                    reason: 'test_submission_solo',
                });
            }
        } catch (err) {
            console.error('Error submitting solo test:', err);
            toast.error('Failed to submit test. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSubmit = async (
        isAutoSubmit = false,
        coordination?: SoloSubmissionCoordination,
    ): Promise<void> => {
        if (submitPromiseRef.current) {
            return submitPromiseRef.current;
        }

        if (isSubmittingRef.current || !testData || testSubmittedRef.current || testSubmitted || !materialId || !studentId) {
            return;
        }

        isSubmittingRef.current = true;
        setIsSubmitting(true);
        setIsLocked(true);

        let operation: Promise<void>;
        operation = submitOnce(isAutoSubmit, coordination).finally(() => {
            isSubmittingRef.current = false;
            setIsSubmitting(false);
            if (!testSubmittedRef.current) {
                setIsLocked(false);
            }
            if (submitPromiseRef.current === operation && !testSubmittedRef.current) {
                submitPromiseRef.current = null;
            }
        });

        submitPromiseRef.current = operation;
        return operation;
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
