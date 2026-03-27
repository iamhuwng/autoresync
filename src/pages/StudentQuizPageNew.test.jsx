import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import StudentQuizPageNew from './StudentQuizPageNew';
import { useIntegrityRefreshRequest } from '../hooks/test/useIntegrityRefreshRequest';
import { useTestIntegrity } from '../hooks/test/useTestIntegrity';
import { useAntiCopyPaste } from '../hooks/test/useAntiCopyPaste';
import { useFullscreenMode } from '../hooks/test/useFullscreenMode';

const {
  getMock,
  onValueMock,
  refMock,
  updateMock,
  saveTestResultMock,
  handleSessionChangeMock,
  navigateToMock,
} = vi.hoisted(() => ({
  getMock: vi.fn(),
  onValueMock: vi.fn(),
  refMock: vi.fn((_database, path) => path),
  updateMock: vi.fn(),
  saveTestResultMock: vi.fn(),
  handleSessionChangeMock: vi.fn(),
  navigateToMock: vi.fn(),
}));

vi.mock('../services/firebase', () => ({
  database: {},
}));

vi.mock('firebase/database', () => ({
  ref: refMock,
  onValue: onValueMock,
  get: getMock,
  update: updateMock,
}));

vi.mock('../hooks/useNavigation', () => ({
  useNavigation: vi.fn(() => ({
    navigateTo: navigateToMock,
    handleSessionChange: handleSessionChangeMock,
  })),
}));

vi.mock('../hooks/test/useIntegrityRefreshRequest', () => ({
  useIntegrityRefreshRequest: vi.fn(),
}));

vi.mock('../hooks/test/useTestIntegrity', () => ({
  useTestIntegrity: vi.fn(),
}));

vi.mock('../hooks/test/useAntiCopyPaste', () => ({
  useAntiCopyPaste: vi.fn(),
}));

vi.mock('../hooks/test/useFullscreenMode', () => ({
  useFullscreenMode: vi.fn(),
}));

vi.mock('../hooks/test/useBeforeUnloadWarning', () => ({
  useBeforeUnloadWarning: vi.fn(),
}));

vi.mock('../components/modern/ToastNotification', () => ({
  toast: {
    warning: vi.fn(),
  },
}));

vi.mock('../components/SemicircleTimer', () => ({
  default: () => null,
}));

vi.mock('../components/StudentAnswerInput', () => ({
  default: () => <div>Quiz Answer Input</div>,
}));

vi.mock('../services/testResults.service', () => ({
  saveTestResult: saveTestResultMock,
}));

const baseQuiz = {
  title: 'Live Quiz 1',
  type: 'quiz',
  skill: 'Reading',
  duration: 30,
  questions: [
    {
      id: 'q1',
      number: 1,
      type: 'multiple-choice',
      question: 'Question 1',
      answer: 'B',
      options: ['A', 'B', 'C'],
      timer: 30,
    },
  ],
};

const basePlayer = {
  name: 'Student One',
  score: 999,
  answers: {
    0: {
      answer: 'B',
      score: 10,
      timeSpent: 30,
    },
  },
  latestResultId: null,
};

const baseSession = {
  status: 'in-progress',
  quizId: 'quiz-1',
  quizTitle: 'Live Quiz 1',
  quizType: 'quiz',
  quizSkill: 'Reading',
  startTime: 1_700_000_000_000,
  linkedClassId: 'class-1',
  courseId: 'course-1',
  antiCheatConfig: {
    detectCopyPaste: true,
    detectRightClick: true,
    detectKeyboardShortcuts: true,
    requireFullscreen: true,
  },
  integrityRefreshRequestedAt: 1_700_000_000_000,
  players: {
    'player-123': { ...basePlayer },
  },
  currentQuestionIndex: 0,
  timer: {
    duration: 30,
  },
};

let currentSession;
let onValueListener;

function emitSessionSnapshot(snapshot = currentSession) {
  if (!onValueListener) {
    throw new Error('Session listener not initialized');
  }

  onValueListener({
    val: () => snapshot,
  });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/student-quiz/ABC123']}>
      <Routes>
        <Route path="/student-quiz/:gameSessionId" element={<StudentQuizPageNew />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('StudentQuizPageNew', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    sessionStorage.clear();
    sessionStorage.setItem('playerId', 'player-123');

    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_060_000);

    currentSession = {
      ...baseSession,
      players: {
        'player-123': { ...basePlayer },
      },
    };

    onValueListener = null;
    onValueMock.mockImplementation((_ref, callback) => {
      onValueListener = callback;
      callback({
        val: () => currentSession,
      });
      return () => {
        if (onValueListener === callback) {
          onValueListener = null;
        }
      };
    });

    getMock.mockImplementation((target) => {
      if (target === 'quizzes/quiz-1') {
        return Promise.resolve({
          exists: () => true,
          val: () => baseQuiz,
        });
      }

      if (target === 'test_results_by_student/player-123') {
        return Promise.resolve({
          exists: () => false,
          val: () => ({}),
        });
      }

      if (target === 'test_results/result-1') {
        const latestResultId = currentSession?.players?.['player-123']?.latestResultId;
        return Promise.resolve({
          exists: () => latestResultId === 'result-1',
          val: () => ({
            resultId: 'result-1',
            studentId: 'player-123',
            sessionCode: 'ABC123',
            testId: 'quiz-1',
          }),
        });
      }

      if (target === 'test_results/result-99') {
        return Promise.resolve({
          exists: () => true,
          val: () => ({
            resultId: 'result-99',
            studentId: 'player-123',
            sessionCode: 'ABC123',
            testId: 'quiz-1',
          }),
        });
      }

      return Promise.resolve({
        exists: () => false,
        val: () => null,
      });
    });

    updateMock.mockImplementation(async (_target, payload) => {
      if (payload?.latestResultId && currentSession?.players?.['player-123']) {
        currentSession.players['player-123'].latestResultId = payload.latestResultId;
      }

      return undefined;
    });

    saveTestResultMock.mockResolvedValue('result-1');

    vi.mocked(useTestIntegrity).mockReturnValue({
      addEvent: vi.fn(),
      warningLevel: 'none',
      warningMessage: '',
      shouldAutoSubmit: false,
      flushEvents: vi.fn(async () => {}),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('persists one canonical result exactly once when the attempt completes', async () => {
    renderPage();

    await screen.findByText('Quiz Answer Input');
    expect(saveTestResultMock).not.toHaveBeenCalled();

    currentSession = {
      ...baseSession,
      status: 'completed',
      players: {
        'player-123': { ...basePlayer },
      },
    };

    await act(async () => {
      emitSessionSnapshot();
    });

    await waitFor(() => expect(saveTestResultMock).toHaveBeenCalledTimes(1));

    const [
      sessionCode,
      testId,
      studentId,
      studentName,
      markingResult,
      testMetadata,
      timeElapsed,
      teacherId,
      isGuest,
      submissionContent,
      academicContext,
      context,
    ] = saveTestResultMock.mock.calls[0];

    expect(sessionCode).toBe('ABC123');
    expect(testId).toBe('quiz-1');
    expect(studentId).toBe('player-123');
    expect(studentName).toBe('Student One');
    expect(markingResult).toEqual(expect.objectContaining({
      totalScore: 10,
      maxScore: 10,
      percentage: 100,
      summary: expect.objectContaining({
        correct: 1,
        incorrect: 0,
        partialCredit: 0,
        totalQuestions: 1,
      }),
    }));
    expect(testMetadata).toEqual(expect.objectContaining({
      title: 'Live Quiz 1',
      type: 'quiz',
      skill: 'Reading',
      duration: 30,
    }));
    expect(timeElapsed).toBe(60);
    expect(teacherId).toBeUndefined();
    expect(isGuest).toBe(false);
    expect(submissionContent).toBeUndefined();
    expect(academicContext).toBeUndefined();
    expect(context).toEqual(expect.objectContaining({
      type: 'class_session',
      sessionCode: 'ABC123',
      classId: 'class-1',
      courseId: 'course-1',
    }));

    await waitFor(() => expect(updateMock).toHaveBeenCalledWith(
      'game_sessions/ABC123/players/player-123',
      { latestResultId: 'result-1' },
    ));

    await act(async () => {
      emitSessionSnapshot();
    });

    await waitFor(() => expect(saveTestResultMock).toHaveBeenCalledTimes(1));
    expect(handleSessionChangeMock).toHaveBeenCalledTimes(1);
    expect(handleSessionChangeMock).toHaveBeenCalledWith('completed', 'ABC123');
  });

  it('persists one canonical result exactly once when the session transitions to waiting', async () => {
    currentSession = {
      ...baseSession,
      status: 'waiting',
      players: {
        'player-123': { ...basePlayer },
      },
    };

    renderPage();

    await screen.findByText('Quiz Answer Input');
    await waitFor(() => expect(saveTestResultMock).toHaveBeenCalledTimes(1));

    const [
      sessionCode,
      testId,
      studentId,
      studentName,
      markingResult,
      testMetadata,
      timeElapsed,
      teacherId,
      isGuest,
      submissionContent,
      academicContext,
      context,
    ] = saveTestResultMock.mock.calls[0];

    expect(sessionCode).toBe('ABC123');
    expect(testId).toBe('quiz-1');
    expect(studentId).toBe('player-123');
    expect(studentName).toBe('Student One');
    expect(markingResult).toEqual(expect.objectContaining({
      totalScore: 10,
      maxScore: 10,
      percentage: 100,
    }));
    expect(testMetadata).toEqual(expect.objectContaining({
      title: 'Live Quiz 1',
      type: 'quiz',
      skill: 'Reading',
      duration: 30,
    }));
    expect(timeElapsed).toBe(60);
    expect(teacherId).toBeUndefined();
    expect(isGuest).toBe(false);
    expect(submissionContent).toBeUndefined();
    expect(academicContext).toBeUndefined();
    expect(context).toEqual(expect.objectContaining({
      type: 'class_session',
      sessionCode: 'ABC123',
      classId: 'class-1',
      courseId: 'course-1',
    }));

    await act(async () => {
      emitSessionSnapshot();
    });

    await waitFor(() => expect(saveTestResultMock).toHaveBeenCalledTimes(1));
    expect(handleSessionChangeMock).toHaveBeenCalledTimes(1);
    expect(handleSessionChangeMock).toHaveBeenCalledWith('waiting', 'ABC123');
  });

  it('does not write canonical results while the quiz remains in-progress', async () => {
    renderPage();
    await screen.findByText('Quiz Answer Input');

    currentSession = {
      ...baseSession,
      status: 'in-progress',
      players: {
        'player-123': { ...basePlayer, latestResultId: null },
      },
    };

    await act(async () => {
      emitSessionSnapshot();
    });

    expect(saveTestResultMock).not.toHaveBeenCalled();
    expect(handleSessionChangeMock).not.toHaveBeenCalled();
  });

  it('skips a canonical write when an existing result already matches the same session and quiz', async () => {
    getMock.mockImplementation((target) => {
      if (target === 'quizzes/quiz-1') {
        return Promise.resolve({
          exists: () => true,
          val: () => baseQuiz,
        });
      }

      if (target === 'test_results_by_student/player-123') {
        return Promise.resolve({
          exists: () => true,
          val: () => ({
            'result-99': {
              resultId: 'result-99',
              sessionCode: 'ABC123',
              testId: 'quiz-1',
            },
          }),
        });
      }

      if (target === 'test_results/result-99') {
        return Promise.resolve({
          exists: () => true,
          val: () => ({
            resultId: 'result-99',
            studentId: 'player-123',
            sessionCode: 'ABC123',
            testId: 'quiz-1',
          }),
        });
      }

      return Promise.resolve({
        exists: () => false,
        val: () => null,
      });
    });

    currentSession = {
      ...baseSession,
      status: 'completed',
      players: {
        'player-123': {
          ...basePlayer,
          latestResultId: null,
        },
      },
    };

    renderPage();
    await screen.findByText('Quiz Answer Input');

    await act(async () => {
      emitSessionSnapshot();
    });

    await waitFor(() => expect(updateMock).toHaveBeenCalledWith(
      'game_sessions/ABC123/players/player-123',
      { latestResultId: 'result-99' },
    ));

    expect(saveTestResultMock).not.toHaveBeenCalled();
    expect(handleSessionChangeMock).toHaveBeenCalledTimes(1);
    expect(handleSessionChangeMock).toHaveBeenCalledWith('completed', 'ABC123');
  });
});
