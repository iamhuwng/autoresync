import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { THCSPracticeView } from './THCSPracticeView';

const {
    mockNavigate,
    mockGetThcsTestFromFirebase,
    mockShuffleTest,
    mockMarkThcsTest,
    mockThcsResultToTestMarkingResult,
    mockSaveTestResult,
    mockGradeWritingQuestions,
    mockCreateTrustedNotification,
    mockGetSubmissionById,
    mockSubmitHomework,
    mockGetHomeworkById,
    mockUseTestIntegrity,
    mockUseAntiCopyPaste,
    mockUseFullscreenMode,
    mockUseTestCompletionCheck,
    mockUseBeforeUnloadWarning,
    mockTriggerFormativeFeedbackForSavedResult,
    mockUpdateThcsProgress,
} = vi.hoisted(() => ({
    mockNavigate: vi.fn(),
    mockGetThcsTestFromFirebase: vi.fn(),
    mockShuffleTest: vi.fn(),
    mockMarkThcsTest: vi.fn(),
    mockThcsResultToTestMarkingResult: vi.fn(),
    mockSaveTestResult: vi.fn(),
    mockGradeWritingQuestions: vi.fn(),
    mockCreateTrustedNotification: vi.fn(),
    mockGetSubmissionById: vi.fn(),
    mockSubmitHomework: vi.fn(),
    mockGetHomeworkById: vi.fn(),
    mockUseTestIntegrity: vi.fn(),
    mockUseAntiCopyPaste: vi.fn(),
    mockUseFullscreenMode: vi.fn(),
    mockUseTestCompletionCheck: vi.fn(),
    mockUseBeforeUnloadWarning: vi.fn(),
    mockTriggerFormativeFeedbackForSavedResult: vi.fn(),
    mockUpdateThcsProgress: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

vi.mock('@mantine/core', () => ({
    Container: ({ children }: any) => <div>{children}</div>,
    Text: ({ children }: any) => <div>{children}</div>,
    Alert: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@mantine/hooks', () => ({
    useMediaQuery: () => false,
}));

vi.mock('../../hooks/useAuth', () => ({
    useAuth: () => ({
        user: {
            uid: 'student-1',
            displayName: 'Student One',
            email: 'student@example.com',
        },
        profile: {
            role: 'student',
        },
    }),
}));

vi.mock('../thcs-student/THCSQuestionRenderer', () => ({
    default: () => <div data-testid="thcs-question-renderer" />,
}));

vi.mock('../thcs-student/THCSSectionNav', () => ({
    default: () => <div data-testid="thcs-section-nav" />,
}));

vi.mock('../thcs-student/THCSPassagePanel', () => ({
    default: () => null,
}));

vi.mock('../thcs-student/THCSSubmitConfirmation', () => ({
    default: ({ opened, onConfirm }: any) => (
        opened ? (
            <button type="button" onClick={onConfirm}>
                Confirm Submit
            </button>
        ) : null
    ),
}));

vi.mock('../modern', () => ({
    Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

vi.mock('../modern/ToastNotification', () => ({
    toast: {
        warning: vi.fn(),
        error: vi.fn(),
        success: vi.fn(),
    },
}));

vi.mock('../../services/thcsTestStorage', () => ({
    getThcsTestFromFirebase: (...args: unknown[]) => mockGetThcsTestFromFirebase(...args),
}));

vi.mock('../../services/thcsAutoMarking.service', () => ({
    markThcsTest: (...args: unknown[]) => mockMarkThcsTest(...args),
    thcsResultToTestMarkingResult: (...args: unknown[]) => mockThcsResultToTestMarkingResult(...args),
}));

vi.mock('../../services/thcsWritingGrading.service', () => ({
    gradeWritingQuestions: (...args: unknown[]) => mockGradeWritingQuestions(...args),
}));

vi.mock('../../services/testResults.service', () => ({
    saveTestResult: (...args: unknown[]) => mockSaveTestResult(...args),
}));

vi.mock('../../services/notificationProducerClient', () => ({
    createTrustedNotification: (...args: unknown[]) => mockCreateTrustedNotification(...args),
}));

vi.mock('../../services/homeworkSubmissionService', () => ({
    getSubmissionById: (...args: unknown[]) => mockGetSubmissionById(...args),
    submitHomework: (...args: unknown[]) => mockSubmitHomework(...args),
}));

vi.mock('../../services/homeworkManager', () => ({
    getHomeworkById: (...args: unknown[]) => mockGetHomeworkById(...args),
}));

vi.mock('../../hooks/test/useTestIntegrity', () => ({
    useTestIntegrity: (...args: unknown[]) => mockUseTestIntegrity(...args),
}));

vi.mock('../../hooks/test/useAntiCopyPaste', () => ({
    useAntiCopyPaste: (...args: unknown[]) => mockUseAntiCopyPaste(...args),
}));

vi.mock('../../hooks/test/useFullscreenMode', () => ({
    useFullscreenMode: (...args: unknown[]) => mockUseFullscreenMode(...args),
}));

vi.mock('../../hooks/test/useTestCompletionCheck', () => ({
    useTestCompletionCheck: (...args: unknown[]) => mockUseTestCompletionCheck(...args),
}));

vi.mock('../../hooks/test/useBeforeUnloadWarning', () => ({
    useBeforeUnloadWarning: (...args: unknown[]) => mockUseBeforeUnloadWarning(...args),
}));

vi.mock('../../services/resultFeedbackGeneration.service', () => ({
    triggerFormativeFeedbackForSavedResult: (...args: unknown[]) => mockTriggerFormativeFeedbackForSavedResult(...args),
}));

vi.mock('../../services/academicRecordService', () => ({
    updateThcsProgress: (...args: unknown[]) => mockUpdateThcsProgress(...args),
}));

vi.mock('../../services/antiCheatReporting', () => ({
    summarizeError: vi.fn(() => ({})),
    summarizeIntegritySnapshot: vi.fn(() => ({})),
    trackAntiCheatAction: vi.fn(),
}));

vi.mock('../../utils/integrityUtils', () => ({
    toHomeworkIntegrity: vi.fn(() => undefined),
}));

vi.mock('../../utils/thcsShuffle', () => ({
    shuffleTest: (...args: unknown[]) => mockShuffleTest(...args),
}));

const thcsTestFixture = {
    id: 'thcs-test-1',
    metadata: {
        title: 'THCS Practice Test',
        duration: 30,
        gradeLevel: 10,
        examType: 'thcs',
    },
    sections: [
        {
            id: 'section-1',
            title: 'Section 1',
            name: 'Section 1',
            layout: 'single-column',
            questions: [
                {
                    id: 'q-1',
                    questionNumber: 1,
                    type: 'multiple-choice',
                },
            ],
        },
    ],
};

describe('THCSPracticeView', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        mockGetThcsTestFromFirebase.mockResolvedValue({
            success: true,
            data: thcsTestFixture,
        });
        mockShuffleTest.mockImplementation((testData) => testData);
        mockMarkThcsTest.mockReturnValue({
            totalPoints: 1,
            maxPoints: 1,
            scaledScore: 9,
            gradingStatus: 'fully-graded',
            sectionResults: [],
            questionResults: {
                '1': {
                    isCorrect: true,
                },
            },
        });
        mockThcsResultToTestMarkingResult.mockReturnValue({
            markingResult: {
                totalScore: 1,
                maxScore: 1,
                percentage: 100,
                completedAt: 1_700_000_000_000,
                questionResults: [],
                summary: {
                    correct: 1,
                    incorrect: 0,
                    partialCredit: 0,
                    totalQuestions: 1,
                },
            },
            thcsData: {
                pendingWritingCount: 0,
            },
        });
        mockSaveTestResult.mockResolvedValue('result-1');
        mockGradeWritingQuestions.mockResolvedValue(undefined);
        mockCreateTrustedNotification.mockResolvedValue({ success: true });
        mockTriggerFormativeFeedbackForSavedResult.mockResolvedValue(undefined);
        mockUpdateThcsProgress.mockResolvedValue(undefined);
        mockGetSubmissionById.mockResolvedValue(null);
        mockSubmitHomework.mockResolvedValue(undefined);
        mockGetHomeworkById.mockResolvedValue(null);
        mockUseTestIntegrity.mockReturnValue({
            addEvent: vi.fn(),
            warningLevel: 'none',
            warningMessage: null,
            shouldAutoSubmit: false,
            flushEvents: vi.fn().mockResolvedValue(undefined),
            getIntegrityReport: vi.fn(() => ({ riskLevel: 'low' })),
        });
    });

    const submitPracticeAttempt = async (practiceContext: any, testDataOverride?: any) => {
        mockGetThcsTestFromFirebase.mockResolvedValueOnce({
            success: true,
            data: {
                ...thcsTestFixture,
                ...testDataOverride,
            },
        });

        render(
            <THCSPracticeView
                materialId="material-1"
                practiceContext={practiceContext}
            />,
        );

        fireEvent.click(await screen.findByRole('button', { name: /submit/i }));
        fireEvent.click(await screen.findByRole('button', { name: /confirm submit/i }));

        await waitFor(() => {
            expect(mockSaveTestResult).toHaveBeenCalledTimes(1);
        });

        return mockSaveTestResult.mock.calls[0]!;
    };

    it('submits via saveTestResult with canonical self-study context', async () => {
        const saveCall = await submitPracticeAttempt({ type: 'self_study' } as any);
        expect(saveCall[0]).toMatch(/^practice_material-1_/);
        expect(saveCall[1]).toBe('thcs-test-1');
        expect(saveCall[2]).toBe('student-1');
        expect(saveCall[7]).toBeUndefined();
        expect(saveCall[10]).toBeUndefined();
        expect(saveCall[11]).toEqual(
            expect.objectContaining({
                type: 'self_study',
                source: expect.objectContaining({
                    type: 'library',
                    id: 'material-1',
                    name: 'THCS Practice Test',
                }),
            }),
        );
        expect(mockCreateTrustedNotification).toHaveBeenCalledWith({
            producerFamily: 'thcs-practice',
            authorityRecordId: 'result-1',
            recipientId: 'student-1',
            operationKey: 'thcs-fully-graded:result-1',
            type: 'success',
            title: '✅ Test Fully Graded',
            message: 'All answers in "THCS Practice Test" have been graded. Your score: 9/10.',
            link: '/result/result-1',
        });
    }, 15000);

    it('submits via saveTestResult with canonical homework context', async () => {
        const saveCall = await submitPracticeAttempt({
            type: 'homework',
            homeworkId: 'homework-1',
            submissionId: 'submission-1',
        } as any);

        expect(saveCall[0]).toMatch(/^practice_material-1_/);
        expect(saveCall[7]).toBeUndefined();
        expect(saveCall[10]).toBeUndefined();
        expect(saveCall[11]).toEqual(
            expect.objectContaining({
                type: 'homework',
                source: expect.objectContaining({
                    type: 'homework',
                    id: 'homework-1',
                    name: 'THCS Practice Test',
                    submissionId: 'submission-1',
                }),
                assignment: expect.objectContaining({
                    homeworkId: 'homework-1',
                    attemptNumber: 1,
                }),
            }),
        );
    }, 15000);

    it('submits via saveTestResult with canonical course-material context', async () => {
        const saveCall = await submitPracticeAttempt({
            type: 'course_material',
            courseId: 'course-1',
            moduleId: 'module-1',
            courseName: 'Course Alpha',
        } as any);

        expect(saveCall[0]).toMatch(/^practice_material-1_/);
        expect(saveCall[7]).toBeUndefined();
        expect(saveCall[10]).toEqual({
            courseId: 'course-1',
            moduleId: 'module-1',
        });
        expect(saveCall[11]).toEqual(
            expect.objectContaining({
                type: 'course_material',
                source: expect.objectContaining({
                    type: 'course',
                    id: 'course-1',
                    name: 'Course Alpha',
                    courseId: 'course-1',
                }),
                courseId: 'course-1',
            }),
        );
    }, 15000);

    it('does not forward testData.createdBy when saving a THCS practice result', async () => {
        const saveCall = await submitPracticeAttempt(
            { type: 'self_study' } as any,
            { createdBy: 'teacher-99' },
        );

        expect(saveCall[7]).toBeUndefined();
        expect(saveCall[10]).toBeUndefined();
        expect(saveCall[11]).toEqual(
            expect.objectContaining({
                type: 'self_study',
                source: expect.objectContaining({
                    type: 'library',
                    id: 'material-1',
                    name: 'THCS Practice Test',
                }),
            }),
        );
        expect(saveCall[11]).not.toEqual(
            expect.objectContaining({
                createdBy: 'teacher-99',
                teacherId: 'teacher-99',
                visibilityOwnerTeacherId: 'teacher-99',
            }),
        );
    }, 15000);
});
