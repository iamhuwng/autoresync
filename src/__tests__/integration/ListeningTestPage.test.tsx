import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ListeningTestPage from '../../skills/listening/components/ListeningTestPage';
import { useTestData } from '../../hooks/test/useTestData';
import { useTestSession } from '../../hooks/test/useTestSession';
import { useTestTimer } from '../../hooks/test/useTestTimer';
import { useTestSubmission } from '../../hooks/test/useTestSubmission';
import { useIntegrityRefreshRequest } from '../../hooks/test/useIntegrityRefreshRequest';
import { useTestIntegrity } from '../../hooks/test/useTestIntegrity';
import { useAntiCopyPaste } from '../../hooks/test/useAntiCopyPaste';
import { useFullscreenMode } from '../../hooks/test/useFullscreenMode';
import { useHeadphonePermission } from '../../hooks/audio/useHeadphonePermission';

vi.mock('../../services/firebase', () => ({
  database: {},
}));

vi.mock('firebase/database', () => ({
  ref: vi.fn(),
  update: vi.fn(),
  get: vi.fn(async () => ({
    exists: () => false,
    val: () => null,
  })),
}));

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

vi.mock('../../hooks/audio/useHeadphonePermission', () => ({
  useHeadphonePermission: vi.fn(),
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

vi.mock('../../skills/listening/components/WaitTimePopup', () => ({
  WaitTimePopup: () => null,
}));

vi.mock('../../skills/listening/components/ListeningQuestionNav', () => ({
  ListeningQuestionNav: ({ onReview }: any) => (
    <button type="button" onClick={onReview}>
      Submit Listening
    </button>
  ),
}));

vi.mock('../../skills/listening/components/ListeningQuestionDisplay', () => ({
  ListeningQuestionDisplay: () => <div data-testid="listening-question-display" />,
}));

vi.mock('../../skills/listening/components/ListeningImageModeDisplay', () => ({
  ListeningImageModeDisplay: () => <div data-testid="listening-image-mode" />,
}));

vi.mock('../../skills/listening/components/ListeningHeader', () => ({
  ListeningHeader: () => <div>Listening Header</div>,
}));

vi.mock('../../skills/listening/components/SectionRubricBlock', () => ({
  SectionRubricBlock: () => <div data-testid="section-rubric" />,
}));

vi.mock('../../skills/listening/components/ListeningNavArrows', () => ({
  ListeningNavArrows: () => null,
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
  shuffleQuestions: false,
  shuffleOptions: false,
};

const mockTestData = {
  id: 'listening-test',
  title: 'Listening Test',
  type: 'IELTS',
  skill: 'Listening',
  duration: 30,
  questionCount: 2,
  displayMode: 'text',
  audioSections: [
    {
      number: 1,
      name: 'Section 1',
      audioUrl: 'https://example.com/audio.mp3',
      startQuestion: 1,
      endQuestion: 2,
    },
  ],
  questions: [
    {
      number: 1,
      type: 'multiple-choice',
      question: 'Question 1',
      options: ['A', 'B', 'C'],
      answer: 'A',
      sectionNumber: 1,
      points: 1,
    },
    {
      number: 2,
      type: 'multiple-choice',
      question: 'Question 2',
      options: ['A', 'B', 'C'],
      answer: 'B',
      sectionNumber: 1,
      points: 1,
    },
  ],
  settings: {
    allowReplay: false,
    audioControls: {
      showPlayPause: false,
      showProgressBar: true,
      showSeekControl: false,
      showSpeedControl: false,
      showSkipSection: false,
      showVolumeControl: true,
    },
  },
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/student-test/ABC123']}>
      <Routes>
        <Route path="/student-test/:sessionCode" element={<ListeningTestPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ListeningTestPage integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    sessionStorage.clear();
    sessionStorage.setItem('playerId', 'player-123');
    sessionStorage.setItem('playerName', 'Test Student');
    sessionStorage.setItem('sessionCode', 'ABC123');

    vi.mocked(useHeadphonePermission).mockReturnValue({
      requestPermission: vi.fn(),
    } as any);

    vi.mocked(useTestData).mockReturnValue({
      testData: mockTestData,
      loading: false,
      error: null,
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
      audioCommand: null,
      accommodation: null,
      masterAudioState: null,
      audioMode: 'standard',
      headphoneRequest: null,
      antiCheatConfig,
      integrityRefreshRequestedAt: 1_700_000_000_000,
    } as any);

    vi.mocked(useTestTimer).mockReturnValue({
      timeRemaining: 1700,
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

  it('reads anti-cheat config for the routed listening surface', async () => {
    renderPage();

    await screen.findByText('Listening Header');

    expect(useTestIntegrity).toHaveBeenCalledWith(expect.objectContaining({
      config: antiCheatConfig,
      context: 'session',
      sessionCode: 'ABC123',
      testId: 'listening-test',
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

  it('flushes integrity events before listening submission', async () => {
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
    } as any);

    renderPage();

    fireEvent.click(await screen.findByText('Submit Listening'));

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith(false);
    });

    expect(callOrder).toEqual(['flush', 'submit:false']);
  });
});
