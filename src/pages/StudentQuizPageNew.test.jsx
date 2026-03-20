import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
} = vi.hoisted(() => ({
  getMock: vi.fn(),
  onValueMock: vi.fn(),
  refMock: vi.fn((_database, path) => path),
  updateMock: vi.fn(),
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
    navigateTo: vi.fn(),
    handleSessionChange: vi.fn(),
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

vi.mock('../utils/scoring', () => ({
  calculateScore: vi.fn(() => 0),
}));

const mockGameSession = {
  status: 'in-progress',
  quizId: 'quiz-1',
  antiCheatConfig: {
    detectCopyPaste: true,
    detectRightClick: true,
    detectKeyboardShortcuts: true,
    requireFullscreen: true,
  },
  integrityRefreshRequestedAt: 1_700_000_000_000,
  players: {
    'player-123': {
      score: 0,
      answers: {},
    },
  },
  currentQuestionIndex: 0,
  timer: {
    duration: 30,
  },
};

const mockQuiz = {
  questions: [
    {
      question: 'Question 1',
      options: ['A', 'B', 'C'],
      timer: 30,
    },
  ],
};

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

    onValueMock.mockImplementation((_ref, callback) => {
      callback({
        val: () => mockGameSession,
      });
      return () => {};
    });

    getMock.mockResolvedValue({
      exists: () => true,
      val: () => mockQuiz,
    });

    vi.mocked(useTestIntegrity).mockReturnValue({
      addEvent: vi.fn(),
      warningLevel: 'none',
      warningMessage: '',
      shouldAutoSubmit: false,
      flushEvents: vi.fn(async () => {}),
    });
  });

  it('wires the quiz refresh timestamp into the integrity refresh hook', async () => {
    renderPage();

    await screen.findByText('Quiz Answer Input');

    expect(useIntegrityRefreshRequest).toHaveBeenCalledWith(expect.objectContaining({
      requestTimestamp: 1_700_000_000_000,
      enabled: true,
    }));

    expect(useAntiCopyPaste).toHaveBeenCalledWith(expect.objectContaining({
      enabled: true,
      detectRightClick: true,
      detectKeyboardShortcuts: true,
    }));

    expect(useFullscreenMode).toHaveBeenCalledWith(expect.objectContaining({
      enabled: true,
    }));

    await waitFor(() => {
      expect(refMock).toHaveBeenCalledWith({}, 'game_sessions/ABC123');
    });
  });
});
