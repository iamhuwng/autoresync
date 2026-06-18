import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ReadingTestPage from '../../skills/reading/components/ReadingTestPage';
import { useTestData } from '../../hooks/test/useTestData';
import { useTestSession } from '../../hooks/test/useTestSession';
import { useTestTimer } from '../../hooks/test/useTestTimer';
import { useTestSubmission } from '../../hooks/test/useTestSubmission';
import { useTestAutoSave } from '../../hooks/useTestAutoSave';
import { useIntegrityRefreshRequest } from '../../hooks/test/useIntegrityRefreshRequest';
import { useTestIntegrity } from '../../hooks/test/useTestIntegrity';
import { useAntiCopyPaste } from '../../hooks/test/useAntiCopyPaste';
import { useFullscreenMode } from '../../hooks/test/useFullscreenMode';
import { storage } from '../../core/platform/storage';
import { toast } from '../../components/modern/ToastNotification';

const {
  mockUseMobileExamMode,
  trackActionMock,
} = vi.hoisted(() => ({
  mockUseMobileExamMode: vi.fn(),
  trackActionMock: vi.fn(),
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

vi.mock('../../core/platform/storage', () => ({
  storage: {
    get: vi.fn(async () => undefined),
    set: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
  },
}));

vi.mock('../../hooks/test/useTestCompletionCheck', () => ({
  useTestCompletionCheck: vi.fn(),
}));

vi.mock('../../hooks/test/useBeforeUnloadWarning', () => ({
  useBeforeUnloadWarning: vi.fn(),
}));

vi.mock('../../hooks/useFeatureTracking', () => ({
  useFeatureTracking: vi.fn(() => ({
    trackAction: trackActionMock,
  })),
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

vi.mock('../../core/platform/hooks/useMobileExamMode', () => ({
  useMobileExamMode: (...args: unknown[]) => mockUseMobileExamMode(...args),
}));

vi.mock('../../components/modern/ToastNotification', () => ({
  toast: {
    warning: vi.fn(),
    error: vi.fn(),
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
  TestWaitingOverlay: () => <div data-testid="mock-test-waiting-overlay" />,
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
  TimeUpOverlay: () => <div data-testid="mock-time-up-overlay" />,
}));

vi.mock('../../components/test/ExtraTimeBanner', () => ({
  ExtraTimeBanner: () => null,
}));

vi.mock('../../components/test/mobile/MobileReadingExamScaffold', () => ({
  MobileReadingExamScaffold: (props: any) => (
    <div data-testid="mock-mobile-reading-scaffold">
      <div
        data-testid="mock-mobile-reading-state"
        data-sheet-open={String(props.questionSheetOpen)}
        data-review-open={String(props.reviewSummaryOpen)}
        data-overflow-open={String(props.overflowMenuOpen)}
        data-text-size-open={String(props.textSizeControlOpen)}
        data-instructions-open={String(props.instructionsOpen)}
        data-active-group={String(props.activeQuestionGroupByPassage?.[props.activePassageId] ?? '')}
        data-sheet-scroll={String(props.questionSheetScrollByPassage?.[props.activePassageId] ?? '')}
        data-passage-scroll={String(props.passageScrollByPassage?.[props.activePassageId] ?? '')}
        data-font-size={String(props.fontSize)}
        data-line-spacing={String(props.lineSpacing)}
      />
      <button type="button" onClick={props.onOpenQuestionSheet}>
        Open Mobile Sheet
      </button>
      <button type="button" onClick={props.onCloseQuestionSheet}>
        Close Mobile Sheet
      </button>
      <button type="button" onClick={props.onOpenReviewSummary}>
        Open Mobile Review
      </button>
      <button type="button" onClick={props.onOpenOverflowMenu}>
        Open Mobile Overflow
      </button>
      <button type="button" onClick={props.onOpenTextSizeControl}>
        Open Mobile Text Size
      </button>
      <button type="button" onClick={props.onOpenInstructions}>
        Open Mobile Instructions
      </button>
      <button type="button" onClick={() => props.onTextSizeChange(20)}>
        Change Mobile Text Size
      </button>
      <button type="button" onClick={props.onLeaveTest}>
        Leave Mobile Test
      </button>
      <button type="button" onClick={() => props.onActiveQuestionGroupChange(props.activePassageId, 3)}>
        Save Mobile Group
      </button>
      <button type="button" onClick={() => props.onQuestionSheetScroll(props.activePassageId, 180)}>
        Save Mobile Sheet Scroll
      </button>
    </div>
  ),
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
    mockUseMobileExamMode.mockReturnValue({ isMobileExamMode: false });
    trackActionMock.mockReset();

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
      mobileState: null,
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
    vi.mocked(useTestAutoSave).mockReturnValue({
      status: 'idle',
      lastSaved: null,
      error: null,
    } as any);
    vi.mocked(storage.get).mockResolvedValue(undefined);
    vi.mocked(storage.set).mockResolvedValue(undefined);
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

  it('persists mobile sheet scroll and active question group across close and reopen', async () => {
    mockUseMobileExamMode.mockReturnValue({ isMobileExamMode: true });

    renderPage();

    await screen.findByTestId('mock-mobile-reading-scaffold');

    fireEvent.click(screen.getByRole('button', { name: 'Open Mobile Sheet' }));
    await waitFor(() => {
      expect(screen.getByTestId('mock-mobile-reading-state').getAttribute('data-sheet-open')).toBe('true');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save Mobile Group' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Mobile Sheet Scroll' }));

    await waitFor(() => {
      const state = screen.getByTestId('mock-mobile-reading-state');
      expect(state.getAttribute('data-active-group')).toBe('3');
      expect(state.getAttribute('data-sheet-scroll')).toBe('180');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Close Mobile Sheet' }));
    await waitFor(() => {
      expect(screen.getByTestId('mock-mobile-reading-state').getAttribute('data-sheet-open')).toBe('false');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open Mobile Sheet' }));
    await waitFor(() => {
      const state = screen.getByTestId('mock-mobile-reading-state');
      expect(state.getAttribute('data-sheet-open')).toBe('true');
      expect(state.getAttribute('data-active-group')).toBe('3');
      expect(state.getAttribute('data-sheet-scroll')).toBe('180');
    });
  });

  it('hydrates saved mobile state and serializes it back into live autosave', async () => {
    mockUseMobileExamMode.mockReturnValue({ isMobileExamMode: true });
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
      mobileState: {
        activePassageId: 'p1',
        questionSheetOpen: true,
        reviewSummaryOpen: false,
        passageScrollByPassage: { p1: 120 },
        activeQuestionGroupByPassage: { p1: 3 },
        questionSheetScrollByPassage: { p1: 180 },
        textSize: 19,
      },
    } as any);

    renderPage();

    await waitFor(() => {
      const state = screen.getByTestId('mock-mobile-reading-state');
      expect(state.getAttribute('data-sheet-open')).toBe('true');
      expect(state.getAttribute('data-active-group')).toBe('3');
      expect(state.getAttribute('data-sheet-scroll')).toBe('180');
      expect(state.getAttribute('data-passage-scroll')).toBe('120');
      expect(state.getAttribute('data-font-size')).toBe('19');
    });

    await waitFor(() => {
      const lastCall = vi.mocked(useTestAutoSave).mock.calls.at(-1)?.[0];
      expect(lastCall?.mobileState).toEqual({
        kind: 'reading',
        activePassageId: 'p1',
        questionSheetOpen: true,
        reviewSummaryOpen: false,
        passageScrollByPassage: { p1: 120 },
        activeQuestionGroupByPassage: { p1: 3 },
        questionSheetScrollByPassage: { p1: 180 },
        textSize: 19,
      });
    });
  });

  it('keeps the live mobile scaffold mounted when a later session mobile-state sync arrives after local interaction', async () => {
    mockUseMobileExamMode.mockReturnValue({ isMobileExamMode: true });

    const sessionState = {
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
      mobileState: null,
    };
    vi.mocked(useTestSession).mockImplementation(() => sessionState as any);

    const view = renderPage();

    await screen.findByTestId('mock-mobile-reading-scaffold');

    fireEvent.click(screen.getByRole('button', { name: 'Open Mobile Sheet' }));
    await waitFor(() => {
      expect(screen.getByTestId('mock-mobile-reading-state').getAttribute('data-sheet-open')).toBe('true');
    });

    sessionState.mobileState = {
      activePassageId: 'p1',
      questionSheetOpen: false,
      reviewSummaryOpen: false,
      flaggedQuestions: { 9: true } as any,
      passageScrollByPassage: { p1: 90 },
      activeQuestionGroupByPassage: { p1: 2 },
      questionSheetScrollByPassage: { p1: 110 },
      textSize: 17,
    };

    view.rerender(
      <MemoryRouter initialEntries={['/student-test/ABC123']}>
        <Routes>
          <Route path="/student-test/:sessionCode" element={<ReadingTestPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByTestId('mock-mobile-reading-scaffold');
    expect(screen.queryByText('Loading Reading Test...')).not.toBeInTheDocument();
    expect(screen.getByTestId('mock-mobile-reading-state').getAttribute('data-sheet-open')).toBe('true');
  });

  it('wires mobile overflow, instructions, and text-size state through the live host with fixed line spacing', async () => {
    mockUseMobileExamMode.mockReturnValue({ isMobileExamMode: true });

    renderPage();

    await screen.findByTestId('mock-mobile-reading-scaffold');

    expect(screen.getByTestId('mock-mobile-reading-state').getAttribute('data-line-spacing')).toBe('1.6');

    fireEvent.click(screen.getByRole('button', { name: 'Open Mobile Overflow' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Mobile Text Size' }));
    fireEvent.click(screen.getByRole('button', { name: 'Change Mobile Text Size' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Mobile Instructions' }));

    await waitFor(() => {
      const state = screen.getByTestId('mock-mobile-reading-state');
      expect(state.getAttribute('data-overflow-open')).toBe('false');
      expect(state.getAttribute('data-text-size-open')).toBe('false');
      expect(state.getAttribute('data-instructions-open')).toBe('true');
      expect(state.getAttribute('data-font-size')).toBe('20');
    });

    expect(trackActionMock).toHaveBeenCalledWith('openOverflowMenu', expect.any(Object));
    expect(trackActionMock).toHaveBeenCalledWith('openTextSizeControl', expect.any(Object));
    expect(trackActionMock).toHaveBeenCalledWith('adjustTextSize', expect.objectContaining({ size: 20 }));
    expect(trackActionMock).toHaveBeenCalledWith('openInstructions', expect.any(Object));
  });

  it('falls back to persisted reading text size when no saved mobile state exists', async () => {
    mockUseMobileExamMode.mockReturnValue({ isMobileExamMode: true });
    vi.mocked(storage.get).mockResolvedValue(21);

    renderPage();

    await waitFor(() => {
      expect(screen.getByTestId('mock-mobile-reading-state').getAttribute('data-font-size')).toBe('21');
    });

    expect(storage.get).toHaveBeenCalledWith('reading_text_size_player-123');
  });

  it('deduplicates autosave error toasts until a successful save resets the guard', async () => {
    const autoSaveState = {
      status: 'error',
      lastSaved: null,
      error: 'Network down',
    } as { status: 'idle' | 'saving' | 'saved' | 'error'; lastSaved: number | null; error: string | null };

    vi.mocked(useTestAutoSave).mockImplementation(() => autoSaveState as any);

    const view = renderPage();

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledTimes(1);
    });

    view.rerender(
      <MemoryRouter initialEntries={['/student-test/ABC123']}>
        <Routes>
          <Route path="/student-test/:sessionCode" element={<ReadingTestPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledTimes(1);
    });

    autoSaveState.status = 'saved';
    autoSaveState.lastSaved = Date.now();
    autoSaveState.error = null;

    view.rerender(
      <MemoryRouter initialEntries={['/student-test/ABC123']}>
        <Routes>
          <Route path="/student-test/:sessionCode" element={<ReadingTestPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledTimes(1);
    });

    autoSaveState.status = 'error';
    autoSaveState.lastSaved = null;
    autoSaveState.error = 'Network down';

    view.rerender(
      <MemoryRouter initialEntries={['/student-test/ABC123']}>
        <Routes>
          <Route path="/student-test/:sessionCode" element={<ReadingTestPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledTimes(2);
    });
  });

  it('renders waiting overlay and connection-loss indicator in the mobile live host', async () => {
    mockUseMobileExamMode.mockReturnValue({ isMobileExamMode: true });
    vi.mocked(useTestSession).mockReturnValue({
      session: { studentName: 'Test Student' },
      sessionStatus: 'waiting',
      isPaused: false,
      sessionStartTime: Date.now() - 30_000,
      pausedDuration: 0,
      reMarkingData: null,
      showReMarkModal: false,
      setShowReMarkModal: vi.fn(),
      isConnected: false,
      antiCheatConfig,
      integrityRefreshRequestedAt: 1_700_000_000_000,
      mobileState: null,
    } as any);

    renderPage();

    await screen.findByTestId('mock-mobile-reading-scaffold');
    expect(screen.getByTestId('mock-test-waiting-overlay')).toBeTruthy();
    expect(screen.getByText('Connection Issue')).toBeTruthy();
    expect(screen.getByText('Your answers are being saved locally')).toBeTruthy();
  });

  it('renders the time-up overlay above the mobile live host when timer expiry is active', async () => {
    mockUseMobileExamMode.mockReturnValue({ isMobileExamMode: true });
    vi.mocked(useTestTimer).mockReturnValue({
      timeRemaining: 0,
      formatTime: (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`,
      showTimeUpOverlay: true,
      gracePeriodRemaining: 0,
      isInExtraTime: false,
    } as any);

    renderPage();

    await screen.findByTestId('mock-mobile-reading-scaffold');
    expect(screen.getByTestId('mock-time-up-overlay')).toBeTruthy();
  });

  it('force-closes mobile overlays when a live interruption state takes over', async () => {
    mockUseMobileExamMode.mockReturnValue({ isMobileExamMode: true });
    vi.mocked(useTestSession).mockReturnValue({
      session: { studentName: 'Test Student' },
      sessionStatus: 'paused',
      isPaused: true,
      sessionStartTime: Date.now() - 30_000,
      pausedDuration: 0,
      reMarkingData: null,
      showReMarkModal: false,
      setShowReMarkModal: vi.fn(),
      isConnected: true,
      antiCheatConfig,
      integrityRefreshRequestedAt: 1_700_000_000_000,
      mobileState: {
        activePassageId: 'p1',
        questionSheetOpen: true,
        reviewSummaryOpen: true,
        passageScrollByPassage: {},
        activeQuestionGroupByPassage: {},
        questionSheetScrollByPassage: {},
        textSize: 16,
      },
    } as any);

    renderPage();

    await waitFor(() => {
      const state = screen.getByTestId('mock-mobile-reading-state');
      expect(state.getAttribute('data-sheet-open')).toBe('false');
      expect(state.getAttribute('data-review-open')).toBe('false');
    });
  });

  it('force-closes mobile overlays when reading submission completes', async () => {
    mockUseMobileExamMode.mockReturnValue({ isMobileExamMode: true });

    const submissionState = {
      testSubmitted: false,
      testResults: null,
      loadedAnswers: null,
      handleSubmit: vi.fn(async () => {}),
      isLocked: false,
      lockInputs: vi.fn(),
    };
    vi.mocked(useTestSubmission).mockImplementation(() => submissionState as any);

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
      mobileState: {
        activePassageId: 'p1',
        questionSheetOpen: true,
        reviewSummaryOpen: true,
        passageScrollByPassage: {},
        activeQuestionGroupByPassage: {},
        questionSheetScrollByPassage: {},
        textSize: 16,
      },
    } as any);

    const view = renderPage();

    await waitFor(() => {
      const state = screen.getByTestId('mock-mobile-reading-state');
      expect(state.getAttribute('data-sheet-open')).toBe('true');
      expect(state.getAttribute('data-review-open')).toBe('true');
    });

    submissionState.testSubmitted = true;
    view.rerender(
      <MemoryRouter initialEntries={['/student-test/ABC123']}>
        <Routes>
          <Route path="/student-test/:sessionCode" element={<ReadingTestPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      const state = screen.getByTestId('mock-mobile-reading-state');
      expect(state.getAttribute('data-sheet-open')).toBe('false');
      expect(state.getAttribute('data-review-open')).toBe('false');
    });
  });

  it('uses popstate to close the review layer first and the sheet layer second', async () => {
    mockUseMobileExamMode.mockReturnValue({ isMobileExamMode: true });

    renderPage();

    await screen.findByTestId('mock-mobile-reading-scaffold');

    fireEvent.click(screen.getByRole('button', { name: 'Open Mobile Sheet' }));
    await waitFor(() => {
      expect(screen.getByTestId('mock-mobile-reading-state').getAttribute('data-sheet-open')).toBe('true');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open Mobile Review' }));
    await waitFor(() => {
      const state = screen.getByTestId('mock-mobile-reading-state');
      expect(state.getAttribute('data-sheet-open')).toBe('false');
      expect(state.getAttribute('data-review-open')).toBe('true');
    });

    await act(async () => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await waitFor(() => {
      const state = screen.getByTestId('mock-mobile-reading-state');
      expect(state.getAttribute('data-review-open')).toBe('false');
      expect(state.getAttribute('data-sheet-open')).toBe('true');
    });

    await act(async () => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('mock-mobile-reading-state').getAttribute('data-sheet-open')).toBe('false');
    });
  });

  it('closes review on popstate without reopening the sheet when review was opened directly', async () => {
    mockUseMobileExamMode.mockReturnValue({ isMobileExamMode: true });

    renderPage();

    await screen.findByTestId('mock-mobile-reading-scaffold');

    fireEvent.click(screen.getByRole('button', { name: 'Open Mobile Review' }));
    await waitFor(() => {
      const state = screen.getByTestId('mock-mobile-reading-state');
      expect(state.getAttribute('data-sheet-open')).toBe('false');
      expect(state.getAttribute('data-review-open')).toBe('true');
    });

    await act(async () => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    await waitFor(() => {
      const state = screen.getByTestId('mock-mobile-reading-state');
      expect(state.getAttribute('data-review-open')).toBe('false');
      expect(state.getAttribute('data-sheet-open')).toBe('false');
    });
  });

  it('ignores popstate when neither mobile overlay is open', async () => {
    mockUseMobileExamMode.mockReturnValue({ isMobileExamMode: true });

    renderPage();

    await screen.findByTestId('mock-mobile-reading-scaffold');

    await act(async () => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    await waitFor(() => {
      const state = screen.getByTestId('mock-mobile-reading-state');
      expect(state.getAttribute('data-sheet-open')).toBe('false');
      expect(state.getAttribute('data-review-open')).toBe('false');
    });
  });

  it('skips the mobile overlay history entry when leaving from the question sheet', async () => {
    mockUseMobileExamMode.mockReturnValue({ isMobileExamMode: true });
    const historyGoSpy = vi.spyOn(window.history, 'go').mockImplementation(() => {});

    renderPage();

    await screen.findByTestId('mock-mobile-reading-scaffold');

    fireEvent.click(screen.getByRole('button', { name: 'Open Mobile Sheet' }));
    await waitFor(() => {
      expect(screen.getByTestId('mock-mobile-reading-state').getAttribute('data-sheet-open')).toBe('true');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Leave Mobile Test' }));

    await waitFor(() => {
      const state = screen.getByTestId('mock-mobile-reading-state');
      expect(state.getAttribute('data-sheet-open')).toBe('false');
      expect(historyGoSpy).toHaveBeenCalledWith(-2);
    });
  });
});
