import { renderHook, waitFor, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTestSubmission } from './useTestSubmission';
import { scoreQuestion } from '../../services/autoMarking.service';
import { saveTestResult } from '../../services/testResults.service';

const {
  mockNavigate,
  mockUseLocation,
  mockGet,
  mockUpdate,
  mockTrackAntiCheatAction,
  mockTriggerFormativeFeedbackForSavedResult,
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockUseLocation: vi.fn(),
  mockGet: vi.fn(),
  mockUpdate: vi.fn(),
  mockTrackAntiCheatAction: vi.fn(),
  mockTriggerFormativeFeedbackForSavedResult: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => mockUseLocation(),
}));

vi.mock('firebase/database', () => ({
  ref: vi.fn((_: unknown, path: string) => path),
  update: (...args: any[]) => mockUpdate(...args),
  get: (...args: any[]) => mockGet(...args),
}));

vi.mock('../../services/firebase', () => ({
  database: {},
  auth: {
    currentUser: null,
  },
}));

vi.mock('../../services/sessionService', () => ({
  sessionService: {
    getPlayerId: vi.fn(() => 'guest_1'),
    getPlayerName: vi.fn(() => 'Guest Student'),
    setTestSubmission: vi.fn(),
  },
}));

vi.mock('../../services/autoMarking.service', () => ({
  scoreQuestion: vi.fn(),
}));

vi.mock('../../services/testResults.service', () => ({
  saveTestResult: vi.fn(),
}));

vi.mock('../../services/emailNotification.service', () => ({
  sendResultNotification: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../services/resultFeedbackGeneration.service', () => ({
  triggerFormativeFeedbackForSavedResult: (...args: any[]) =>
    mockTriggerFormativeFeedbackForSavedResult(...args),
}));

vi.mock('../../services/antiCheatReporting', () => ({
  summarizeError: (error: unknown) => ({
    errorMessage: error instanceof Error ? error.message : String(error),
  }),
  summarizeIntegritySnapshot: (report: any) => ({
    violationCount: report?.violationCount ?? 0,
    totalEvents: report?.totalEvents ?? 0,
    riskLevel: report?.riskLevel ?? 'low',
    forceSubmitted: report?.forceSubmitted ?? false,
  }),
  trackAntiCheatAction: mockTrackAntiCheatAction,
}));

describe('useTestSubmission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseLocation.mockReturnValue({ state: null });

    mockUpdate.mockResolvedValue(undefined);
    mockGet.mockImplementation(async (path: string) => {
      if (path.includes('/players/guest_1')) {
        return {
          exists: () => false,
          val: () => null,
        };
      }

      if (path === 'game_sessions/SESSION123') {
        return {
          exists: () => true,
          val: () => ({
            createdByUserId: 'teacher-auth',
            createdBy: 'teacher-legacy',
            teacherId: 'teacher-synthetic',
          }),
        };
      }

      return {
        exists: () => false,
        val: () => null,
      };
    });

    vi.mocked(scoreQuestion).mockImplementation((question: any, studentAnswer: string) => ({
      isCorrect: question.answer === studentAnswer,
      score: question.answer === studentAnswer ? 1 : 0,
    }) as any);

    vi.mocked(saveTestResult).mockResolvedValue('result-1');
  });

  it('persists the result, integrity snapshot, and redirect state after submit', async () => {
    const questionsWithAnswersRef = { current: null } as any;

    const { result } = renderHook(() =>
      useTestSubmission({
        testData: {
          id: 'test-1',
          duration: 60,
          skill: 'Reading',
          questionCount: 1,
          questions: [
            {
              number: 1,
              type: 'multiple-choice',
              question: 'Q1',
              options: ['A', 'B'],
              passageId: 'p1',
              points: 1,
            },
          ],
        } as any,
        session: {
          testId: 'test-1',
          sessionCode: 'SESSION123',
          studentName: 'Guest Student',
          startTime: 1,
          answers: {},
          isSubmitted: false,
        },
        sessionCode: 'SESSION123',
        answers: {
          1: 'A',
        },
        timeRemaining: 3000,
        questionsWithAnswersRef,
        integrityReport: {
          violationCount: 1,
          totalEvents: 2,
          tabSwitchCount: 1,
          totalTimeAwayMs: 8000,
          copyAttempts: 0,
          pasteAttempts: 0,
          rightClickAttempts: 0,
          fullscreenExitCount: 0,
          keyboardShortcutAttempts: 0,
          forceSubmitted: false,
          forceSubmittedBy: null,
          riskLevel: 'medium',
          events: [],
        },
        telemetrySurface: 'student_test',
      }),
    );

    await act(async () => {
      await result.current.handleSubmit(false);
    });

    await waitFor(() => {
      expect(saveTestResult).toHaveBeenCalled();
    });

    const saveCall = vi.mocked(saveTestResult).mock.calls[0];
    expect(saveCall?.[7]).toBeUndefined();
    expect(saveCall?.[11]).toEqual(
      expect.objectContaining({
        type: 'class_session',
        sessionCode: 'SESSION123',
        source: expect.objectContaining({
          id: 'SESSION123',
          name: 'SESSION123 Test',
          sessionCode: 'SESSION123',
        }),
      }),
    );

    expect(mockNavigate).toHaveBeenCalledWith('/student-wait/SESSION123', {
      replace: true,
      state: { showResults: true, sessionCode: 'SESSION123', testId: 'test-1' },
    });
    expect(mockTriggerFormativeFeedbackForSavedResult).not.toHaveBeenCalled();
  });

  it('uses questionsWithAnswersRef as the grading source when provided', async () => {
    const gradingQuestions = [
      {
        id: 'question-1',
        number: 1,
        type: 'multiple-choice',
        question: 'Q1',
        options: ['Alpha', 'Beta', 'Gamma', 'Delta'],
        answer: 'B',
        passageId: 'p1',
        points: 1,
      },
    ] as any;

    const questionsWithAnswersRef = { current: gradingQuestions } as any;

    const { result } = renderHook(() =>
      useTestSubmission({
        testData: {
          id: 'test-1',
          duration: 60,
          skill: 'Reading',
          questionCount: 1,
          questions: [
            {
              id: 'question-1',
              number: 1,
              type: 'multiple-choice',
              question: 'Q1',
              options: ['Delta', 'Beta', 'Alpha', 'Gamma'],
              passageId: 'p1',
              points: 1,
            },
          ],
        } as any,
        session: {
          testId: 'test-1',
          sessionCode: 'SESSION123',
          studentName: 'Guest Student',
          startTime: 1,
          answers: {},
          isSubmitted: false,
        },
        sessionCode: 'SESSION123',
        answers: {
          1: 'B',
        },
        timeRemaining: 3000,
        questionsWithAnswersRef,
      }),
    );

    await act(async () => {
      await result.current.handleSubmit(false);
    });

    await waitFor(() => {
      expect(scoreQuestion).toHaveBeenCalled();
    });

    expect(vi.mocked(scoreQuestion).mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        options: gradingQuestions[0].options,
        answer: gradingQuestions[0].answer,
      }),
    );
  });

  it('triggers shared formative feedback generation after saving an IELTS result', async () => {
    const { result } = renderHook(() =>
      useTestSubmission({
        testData: {
          id: 'test-1',
          duration: 60,
          type: 'IELTS',
          skill: 'Reading',
          questionCount: 1,
          questions: [
            {
              number: 1,
              type: 'multiple-choice',
              question: 'Q1',
              options: ['A', 'B'],
              passageId: 'p1',
              points: 1,
            },
          ],
        } as any,
        session: {
          testId: 'test-1',
          sessionCode: 'SESSION123',
          studentName: 'Guest Student',
          startTime: 1,
          answers: {},
          isSubmitted: false,
        },
        sessionCode: 'SESSION123',
        answers: {
          1: 'A',
        },
        timeRemaining: 3000,
      }),
    );

    await act(async () => {
      await result.current.handleSubmit(false);
    });

    await waitFor(() => {
      expect(mockTriggerFormativeFeedbackForSavedResult).toHaveBeenCalledWith('result-1');
    });
  });

  it('links the saved result back to class assignment progress when class navigation state is present', async () => {
    mockUseLocation.mockReturnValue({
      state: {
        classId: 'class-1',
        assignmentId: 'assignment-1',
      },
    });

    mockGet.mockImplementation(async (path: string) => {
      if (path.includes('/players/guest_1')) {
        return {
          exists: () => false,
          val: () => null,
        };
      }

      if (path === 'game_sessions/SESSION123') {
        return {
          exists: () => true,
          val: () => ({
            createdBy: 'teacher-1',
            linkedClassId: 'class-1',
          }),
        };
      }

      if (path === 'classes/class-1/students/guest_1/assignments/assignment-1') {
        return {
          exists: () => true,
          val: () => ({
            testAssignmentId: 'assignment-1',
            attemptNumber: 2,
            status: 'in_progress',
          }),
        };
      }

      return {
        exists: () => false,
        val: () => null,
      };
    });

    const { result } = renderHook(() =>
      useTestSubmission({
        testData: {
          id: 'test-1',
          duration: 60,
          skill: 'Reading',
          questionCount: 1,
          questions: [
            {
              number: 1,
              type: 'multiple-choice',
              question: 'Q1',
              options: ['A', 'B'],
              answer: 'A',
              points: 1,
            },
          ],
        } as any,
        session: {
          testId: 'test-1',
          sessionCode: 'SESSION123',
          studentName: 'Guest Student',
          startTime: 1,
          answers: {},
          isSubmitted: false,
        },
        sessionCode: 'SESSION123',
        answers: {
          1: 'A',
        },
        timeRemaining: 3000,
      }),
    );

    await act(async () => {
      await result.current.handleSubmit(false);
    });

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        'classes/class-1/students/guest_1/assignments/assignment-1',
        expect.objectContaining({
          testAssignmentId: 'assignment-1',
          attemptNumber: 2,
          status: 'submitted',
          resultId: 'result-1',
          score: 1,
          maxScore: 1,
          percentage: 100,
        }),
      );
    });

    const saveCall = vi.mocked(saveTestResult).mock.calls[0];
    expect(saveCall?.[11]).toEqual(
      expect.objectContaining({
        classId: 'class-1',
        assignmentId: 'assignment-1',
      }),
    );
  });
});
