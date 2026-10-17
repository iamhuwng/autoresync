import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import THCSTestLayout from './THCSTestLayout';

const {
    mockNavigate,
    mockRef,
    mockSet,
    mockUpdate,
    mockOnValue,
    mockRunTransaction,
    mockMarkThcsTest,
    mockThcsResultToTestMarkingResult,
    mockSaveTestResult,
    mockGradeWritingQuestions,
    mockCreateTrustedNotification,
    mockTriggerFormativeFeedbackForSavedResult,
    mockUpdateThcsProgress,
    mockShuffleTest,
} = vi.hoisted(() => ({
    mockNavigate: vi.fn(),
    mockRef: vi.fn((_: unknown, path?: string) => path ?? '__root__'),
    mockSet: vi.fn(),
    mockUpdate: vi.fn(),
    mockOnValue: vi.fn(),
    mockRunTransaction: vi.fn(),
    mockMarkThcsTest: vi.fn(),
    mockThcsResultToTestMarkingResult: vi.fn(),
    mockSaveTestResult: vi.fn(),
    mockGradeWritingQuestions: vi.fn(),
    mockCreateTrustedNotification: vi.fn(),
    mockTriggerFormativeFeedbackForSavedResult: vi.fn(),
    mockUpdateThcsProgress: vi.fn(),
    mockShuffleTest: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

vi.mock('../../services/firebase', () => ({
    database: {},
}));

vi.mock('firebase/database', () => ({
    ref: (...args: unknown[]) => mockRef(...args),
    set: (...args: unknown[]) => mockSet(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    onValue: (...args: unknown[]) => mockOnValue(...args),
    runTransaction: (...args: unknown[]) => mockRunTransaction(...args),
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

vi.mock('./THCSQuestionRenderer', () => ({
    default: () => <div data-testid="thcs-question-renderer" />,
}));

vi.mock('./THCSRawTextFallback', () => ({
    default: () => null,
}));

vi.mock('./THCSSectionNav', () => ({
    default: () => <div data-testid="thcs-section-nav" />,
}));

vi.mock('./THCSPassagePanel', () => ({
    default: () => null,
}));

vi.mock('../modern', () => ({
    Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
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

vi.mock('../../services/resultFeedbackGeneration.service', () => ({
    triggerFormativeFeedbackForSavedResult: (...args: unknown[]) => mockTriggerFormativeFeedbackForSavedResult(...args),
}));

vi.mock('../../services/academicRecordService', () => ({
    updateThcsProgress: (...args: unknown[]) => mockUpdateThcsProgress(...args),
}));

vi.mock('../../utils/thcsShuffle', () => ({
    shuffleTest: (...args: unknown[]) => mockShuffleTest(...args),
}));

const thcsTestFixture = {
    id: 'thcs-test-1',
    metadata: {
        title: 'THCS Session Test',
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

describe('THCSTestLayout', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        Object.defineProperty(window, 'matchMedia', {
            writable: true,
            value: vi.fn().mockImplementation((query: string) => ({
                matches: false,
                media: query,
                onchange: null,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                addListener: vi.fn(),
                removeListener: vi.fn(),
                dispatchEvent: vi.fn(),
            })),
        });

        mockOnValue.mockImplementation((_ref, callback) => {
            callback({
                exists: () => true,
                val: () => ({
                    status: 'in-progress',
                    testId: 'thcs-test-1',
                    isPaused: false,
                    startTime: Date.now(),
                }),
            });
            return vi.fn();
        });
        mockSet.mockResolvedValue(undefined);
        mockUpdate.mockResolvedValue(undefined);
        mockRunTransaction.mockResolvedValue(undefined);
        mockShuffleTest.mockImplementation((testData) => testData);

        mockMarkThcsTest.mockReturnValue({
            totalPoints: 1,
            maxPoints: 1,
            scaledScore: 8.5,
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
        mockSaveTestResult.mockResolvedValue('result-session-1');
        mockGradeWritingQuestions.mockResolvedValue(undefined);
        mockCreateTrustedNotification.mockResolvedValue({ success: true });
        mockTriggerFormativeFeedbackForSavedResult.mockResolvedValue(undefined);
        mockUpdateThcsProgress.mockResolvedValue(undefined);
    });

    const submitLayoutAttempt = async (testDataOverride?: any) => {
        render(
            <THCSTestLayout
                testData={{
                    ...thcsTestFixture,
                    ...testDataOverride,
                } as any}
                sessionCode="SESSION-1"
            />,
        );

        fireEvent.click(await screen.findByRole('button', { name: /submit/i }));
        fireEvent.click(await screen.findByRole('button', { name: /submit anyway/i }));

        await waitFor(() => {
            expect(mockSaveTestResult).toHaveBeenCalledTimes(1);
        });

        return mockSaveTestResult.mock.calls[0]!;
    };

    it('submits via saveTestResult with canonical class-session context', async () => {
        const saveCall = await submitLayoutAttempt();
        expect(saveCall[0]).toBe('SESSION-1');
        expect(saveCall[1]).toBe('thcs-test-1');
        expect(saveCall[2]).toBe('student-1');
        expect(saveCall[7]).toBeUndefined();
        expect(saveCall[10]).toBeUndefined();
        expect(saveCall[11]).toEqual(
            expect.objectContaining({
                type: 'class_session',
                sessionCode: 'SESSION-1',
                source: expect.objectContaining({
                    type: 'class',
                    id: 'SESSION-1',
                    sessionCode: 'SESSION-1',
                    name: 'THCS Session Test',
                }),
            }),
        );

        await waitFor(() => {
            expect(mockUpdate).toHaveBeenCalledWith(
                'game_sessions/SESSION-1/players/student-1',
                expect.objectContaining({
                    isSubmitted: true,
                    hasCompletedTest: true,
                    submittedBy: 'student',
                }),
            );
        });

        expect(mockNavigate).toHaveBeenCalledWith(
            '/student-wait/SESSION-1',
            expect.objectContaining({
                replace: true,
                state: expect.objectContaining({
                    showResults: true,
                    sessionCode: 'SESSION-1',
                    testId: 'thcs-test-1',
                }),
            }),
        );
        expect(mockCreateTrustedNotification).toHaveBeenCalledWith({
            producerFamily: 'thcs-practice',
            authorityRecordId: 'result-session-1',
            recipientId: 'student-1',
            operationKey: 'thcs-fully-graded:result-session-1',
            type: 'success',
            title: '✅ Test Fully Graded',
            message: 'All answers in "THCS Session Test" have been graded. Your score: 8.5/10.',
            link: '/result/result-session-1',
        });
    });

    it('does not forward testData.createdBy when saving class-session THCS results', async () => {
        const saveCall = await submitLayoutAttempt({
            createdBy: 'teacher-99',
        });

        expect(saveCall[7]).toBeUndefined();
        expect(saveCall[10]).toBeUndefined();
        expect(saveCall[11]).toEqual(
            expect.objectContaining({
                type: 'class_session',
                sessionCode: 'SESSION-1',
                source: expect.objectContaining({
                    type: 'class',
                    id: 'SESSION-1',
                    sessionCode: 'SESSION-1',
                    name: 'THCS Session Test',
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
    });
});
