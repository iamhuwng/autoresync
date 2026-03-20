import { renderHook, waitFor, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTestSubmission } from './useTestSubmission';
import { getTestQuestionsFromFirebase } from '../../services/testStorage';
import { scoreQuestion } from '../../services/autoMarking.service';
import { saveTestResult } from '../../services/testResults.service';
import { getIELTSQuestionsForStudent } from '../../utils/thcsShuffle';

const {
  mockNavigate,
  mockGet,
  mockUpdate,
  mockTrackAntiCheatAction,
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockGet: vi.fn(),
  mockUpdate: vi.fn(),
  mockTrackAntiCheatAction: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
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

vi.mock('../../services/testStorage', () => ({
  getTestQuestionsFromFirebase: vi.fn(),
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
            createdBy: 'teacher-1',
          }),
        };
      }

      return {
        exists: () => false,
        val: () => null,
      };
    });

    vi.mocked(getTestQuestionsFromFirebase).mockResolvedValue({
      success: true,
      data: [
        {
          number: 1,
          type: 'multiple-choice',
          question: 'Q1',
          options: ['A', 'B'],
          answer: 'A',
          passageId: 'p1',
          points: 1,
        },
      ] as any,
    });

    vi.mocked(scoreQuestion).mockImplementation((question: any, studentAnswer: string) => ({
      isCorrect: question.answer === studentAnswer,
      score: question.answer === studentAnswer ? 1 : 0,
    }) as any);

    vi.mocked(saveTestResult).mockResolvedValue('result-1');
  });

  it('lazy-loads grading questions at submit time and reuses them for result persistence', async () => {
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
      expect(getTestQuestionsFromFirebase).toHaveBeenCalledWith('test-1');
      expect(saveTestResult).toHaveBeenCalled();
    });

    expect(getTestQuestionsFromFirebase).toHaveBeenCalledTimes(1);
    expect(questionsWithAnswersRef.current).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ answer: 'A' }),
      ]),
    );
    expect(
      mockUpdate.mock.calls.some(([, payload]) => payload.correctCount === 1 && payload.percentage === 100),
    ).toBe(true);
    expect(mockTrackAntiCheatAction).toHaveBeenCalledWith(
      'persistSessionIntegrity',
      expect.objectContaining({
        context: 'session',
        surface: 'student_test',
        sessionCode: 'SESSION123',
      }),
      expect.objectContaining({
        status: 'success',
        submissionMode: 'manual',
        violationCount: 1,
      }),
    );
    expect(mockNavigate).toHaveBeenCalledWith('/student-wait/SESSION123', {
      replace: true,
      state: { showResults: true, sessionCode: 'SESSION123', testId: 'test-1' },
    });
  });

  it('replays option shuffling on grading questions so remapped answers still score correctly', async () => {
    const fullQuestions = [
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

    const studentId = ['student-a', 'student-b', 'student-c', 'student-d'].find((candidate) => {
      const shuffled = getIELTSQuestionsForStudent(fullQuestions, candidate, 'test-1', {
        shuffleQuestions: false,
        shuffleOptions: true,
      })[0];

      return shuffled.options.join('|') !== fullQuestions[0]!.options.join('|');
    });

    expect(studentId).toBeDefined();

    const shuffledGradingQuestion = getIELTSQuestionsForStudent(fullQuestions, studentId!, 'test-1', {
      shuffleQuestions: false,
      shuffleOptions: true,
    })[0];

    vi.mocked(getTestQuestionsFromFirebase).mockResolvedValueOnce({
      success: true,
      data: fullQuestions,
    });

    vi.mocked(scoreQuestion).mockImplementation((question: any, studentAnswer: string) => ({
      isCorrect: question.answer === studentAnswer,
      score: question.answer === studentAnswer ? 1 : 0,
    }) as any);

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
              options: shuffledGradingQuestion.options,
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
          1: shuffledGradingQuestion.answer,
        },
        timeRemaining: 3000,
        questionPresentation: {
          studentId,
          shuffleQuestions: false,
          shuffleOptions: true,
        },
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
        options: shuffledGradingQuestion.options,
        answer: shuffledGradingQuestion.answer,
      }),
    );
    expect(
      mockUpdate.mock.calls.some(([, payload]) => payload.correctCount === 1 && payload.percentage === 100),
    ).toBe(true);
  });
});
