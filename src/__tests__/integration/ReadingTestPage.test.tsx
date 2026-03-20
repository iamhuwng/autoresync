import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ReadingTestPage from '../../skills/reading/components/ReadingTestPage';
import { useTestData } from '../../hooks/test/useTestData';
import { useTestSession } from '../../hooks/test/useTestSession';
import { useTestTimer } from '../../hooks/test/useTestTimer';
import { useTestSubmission } from '../../hooks/test/useTestSubmission';
import { useIntegrityRefreshRequest } from '../../hooks/test/useIntegrityRefreshRequest';
import { useTestIntegrity } from '../../hooks/test/useTestIntegrity';
import { useAntiCopyPaste } from '../../hooks/test/useAntiCopyPaste';
import { useFullscreenMode } from '../../hooks/test/useFullscreenMode';

vi.mock('../../hooks/test/useTestData', () => ({
  useTestData: vi.fn(),
}));

vi.mock('../../hooks/test/useTestSession', () => ({
  useTestSession: vi.fn(),
}));

vi.mock('../../hooks/test/useTestTimer', () => ({
  useTestTimer: vi.fn(),
}));

vi.mock('../../hooks/test/useTestSubmission', () => ({
  useTestSubmission: vi.fn(),
}));

vi.mock('../../hooks/test/useIntegrityRefreshRequest', () => ({
  useIntegrityRefreshRequest: vi.fn(),
}));

vi.mock('../../hooks/useTestAutoSave', () => ({
  useTestAutoSave: vi.fn(() => ({
    status: 'idle',
    lastSaved: null,
    error: null,
  })),
}));

vi.mock('../../hooks/useNavigation', () => ({
  useNavigation: vi.fn(() => ({
    navigateTo: vi.fn(),
    handleSessionChange: vi.fn(),
  })),
}));

vi.mock('../../hooks/test/useTestCompletionCheck', () => ({
  useTestCompletionCheck: vi.fn(),
}));

vi.mock('../../hooks/test/useBeforeUnloadWarning', () => ({
  useBeforeUnloadWarning: vi.fn(),
}));

vi.mock('../../hooks/test/useTeacherEndRedirect', () => ({
  useTeacherEndRedirect: vi.fn(() => ({
    checkAndRedirect: vi.fn(async () => false),
  })),
}));

vi.mock('../../hooks/test/useTestIntegrity', () => ({
  useTestIntegrity: vi.fn(),
}));

vi.mock('../../hooks/test/useAntiCopyPaste', () => ({
  useAntiCopyPaste: vi.fn(),
}));

vi.mock('../../hooks/test/useFullscreenMode', () => ({
  useFullscreenMode: vi.fn(),
}));

vi.mock('../../components/modern/ToastNotification', () => ({
  toast: {
    warning: vi.fn(),
  },
}));

vi.mock('../../components/test/IELTSQuestionsPanel', () => ({
  IELTSQuestionsPanel: () => <div data-testid="reading-questions-panel" />,
}));

vi.mock('../../components/test/TwoColumnLayout', () => ({
  TwoColumnLayout: ({ leftColumn, rightColumn }: any) => (
    <div>
      <div>{leftColumn}</div>
      <div>{rightColumn}</div>
    </div>
  ),
}));

vi.mock('../../skills/reading/components/PassageControls', () => ({
  PassageControls: () => <div data-testid="passage-controls" />,
}));

vi.mock('../../skills/reading/components/PassageRenderer', () => ({
  PassageRenderer: () => <div data-testid="passage-renderer" />,
}));

vi.mock('../../components/test/ReadingHeader', () => ({
  ReadingHeader: () => <div>Reading Header</div>,
}));

vi.mock('../../components/test/TestWaitingOverlay', () => ({
  TestWaitingOverlay: () => null,
}));

vi.mock('../../components/test/ReMarkingModal', () => ({
  ReMarkingModal: () => null,
}));

vi.mock('../../components/test/TestErrorBoundary', () => ({
  TestErrorBoundary: ({ children }: any) => children,
}));

vi.mock('../../components/test/ConnectionMonitor', () => ({
  ConnectionMonitor: () => null,
}));

vi.mock('../../components/test/InspiraFooterNav', () => ({
  InspiraFooterNav: ({ onSubmit }: any) => (
    <button type="button" onClick={onSubmit}>
      Submit Reading
    </button>
  ),
}));

vi.mock('../../components/test/TimeUpOverlay', () => ({
  TimeUpOverlay: () => null,
}));

vi.mock('../../components/test/ExtraTimeBanner', () => ({
  ExtraTimeBanner: () => null,
}));

const antiCheatConfig = {
  detectTabSwitch: true,
  detectCopyPaste: true,
  detectRightClick: true,
  detectKeyboardShortcuts: true,
  requireFullscreen: true,
  shuffleQuestions: true,
  shuffleOptions: true,
};

const mockTestData = {
  id: 'reading-test',
  title: 'Reading Test',
  type: 'IELTS',
  skill: 'Reading',
  questionCount: 4,
  passages: [
    { id: 'p1', title: 'Passage 1', content: 'Text', type: 'text' },
  ],
  questions: [
    { number: 1, type: 'multiple-choice', question: 'Q1', options: ['A', 'B', 'C', 'D'], answer: 'A', passageId: 'p1', points: 1 },
    { number: 2, type: 'multiple-choice', question: 'Q2', options: ['A', 'B', 'C', 'D'], answer: 'B', passageId: 'p1', points: 1 },
    { number: 3, type: 'multiple-choice', question: 'Q3', options: ['A', 'B', 'C', 'D'], answer: 'C', passageId: 'p1', points: 1 },
    { number: 4, type: 'multiple-choice', question: 'Q4', options: ['A', 'B', 'C', 'D'], answer: 'D', passageId: 'p1', points: 1 },
  ],
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/student-test/ABC123']}>
      <Routes>
        <Route path="/student-test/:sessionCode" element={<ReadingTestPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ReadingTestPage integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    sessionStorage.clear();
    sessionStorage.setItem('playerId', 'player-123');
    sessionStorage.setItem('playerName', 'Test Student');
    sessionStorage.setItem('sessionCode', 'ABC123');

    vi.mocked(useTestData).mockReturnValue({
      testData: mockTestData,
      loading: false,
      error: null,
      activePassageId: 'p1',
      setActivePassageId: vi.fn(),
      questionsWithAnswersRef: { current: mockTestData.questions },
    } as any);

    vi.mocked(useTestSession).mockReturnValue({
      session: { studentName: 'Test Student' },
      sessionStatus: 'in-progress',
      isPaused: false,
      sessionStartTime: Date.now() - 30_000,
      pausedDuration: 0,
      reMarkingData: null,
      showReMarkModal: false,
      setShowReMarkModal: vi.fn(),
      isConnected: true,
      antiCheatConfig,
      integrityRefreshRequestedAt: 1_700_000_000_000,
    } as any);

    vi.mocked(useTestTimer).mockReturnValue({
      timeRemaining: 3500,
      formatTime: (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`,
      showTimeUpOverlay: false,
      gracePeriodRemaining: 0,
      isInExtraTime: false,
    } as any);

    vi.mocked(useTestSubmission).mockReturnValue({
      testSubmitted: false,
      testResults: null,
      loadedAnswers: null,
      handleSubmit: vi.fn(async () => {}),
      isLocked: false,
      lockInputs: vi.fn(),
    } as any);

    vi.mocked(useTestIntegrity).mockReturnValue({
      addEvent: vi.fn(),
      warningLevel: 'none',
      warningMessage: '',
      shouldAutoSubmit: false,
      flushEvents: vi.fn(async () => {}),
      getIntegrityReport: vi.fn(() => ({ violationCount: 0 })),
    } as any);
  });

  it('reads anti-cheat config for the routed reading surface', async () => {
    renderPage();

    await screen.findByText('Reading Header');

    expect(useTestIntegrity).toHaveBeenCalledWith(expect.objectContaining({
      config: antiCheatConfig,
      context: 'session',
      sessionCode: 'ABC123',
      testId: 'reading-test',
    }));

    expect(useAntiCopyPaste).toHaveBeenCalledWith(expect.objectContaining({
      enabled: true,
      detectRightClick: true,
      detectKeyboardShortcuts: true,
    }));

    expect(useFullscreenMode).toHaveBeenCalledWith(expect.objectContaining({
      enabled: true,
    }));

    expect(useIntegrityRefreshRequest).toHaveBeenCalledWith(expect.objectContaining({
      requestTimestamp: 1_700_000_000_000,
    }));
  });

  it('flushes integrity events before reading submission', async () => {
    const callOrder: string[] = [];
    const flushEvents = vi.fn(async () => {
      callOrder.push('flush');
    });
    const handleSubmit = vi.fn(async (mode?: boolean | 'teacher') => {
      callOrder.push(`submit:${String(mode)}`);
    });

    vi.mocked(useTestIntegrity).mockReturnValue({
      addEvent: vi.fn(),
      warningLevel: 'none',
      warningMessage: '',
      shouldAutoSubmit: false,
      flushEvents,
      getIntegrityReport: vi.fn(() => ({ violationCount: 0 })),
    } as any);

    vi.mocked(useTestSubmission).mockReturnValue({
      testSubmitted: false,
      testResults: null,
      loadedAnswers: null,
      handleSubmit,
      isLocked: false,
      lockInputs: vi.fn(),
    } as any);

    renderPage();

    fireEvent.click(await screen.findByText('Submit Reading'));

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith(false);
    });

    expect(callOrder).toEqual(['flush', 'submit:false']);
  });
});
