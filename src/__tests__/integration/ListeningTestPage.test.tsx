import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { get } from 'firebase/database';
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

// ── Hoisted mocks ───────────────────────────────────────────────────────────

const {
  mockUseMobileExamMode,
} = vi.hoisted(() => ({
  mockUseMobileExamMode: vi.fn(),
}));

vi.mock('../../services/firebase', () => ({
  database: {},
}));

vi.mock('firebase/database', () => ({
  ref: vi.fn(),
  update: vi.fn(() => Promise.resolve()),
  get: vi.fn(async () => ({
    exists: () => false,
    val: () => null,
  })),
  onValue: vi.fn(() => vi.fn()),
  off: vi.fn(),
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

vi.mock('../../core/platform/hooks/useMobileExamMode', () => ({
  useMobileExamMode: (...args: unknown[]) => mockUseMobileExamMode(...args),
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
    <div data-testid="desktop-listening-question-nav">
      <button type="button" onClick={onReview}>
        Submit Listening
      </button>
    </div>
  ),
}));

vi.mock('../../skills/listening/components/ListeningQuestionDisplay', () => ({
  ListeningQuestionDisplay: ({ group, disabled }: any) => (
    <div
      data-testid="listening-question-display"
      data-start={group?.startNumber}
      data-end={group?.endNumber}
      data-disabled={String(Boolean(disabled))}
    />
  ),
}));

vi.mock('../../skills/listening/components/ListeningImageModeDisplay', () => ({
  ListeningImageModeDisplay: () => <div data-testid="listening-image-mode" />,
}));

vi.mock('../../components/test/mobile/MobileListeningImageCanvas', () => ({
  MobileListeningImageCanvas: ({ viewedPartNumber }: any) => (
    <div data-testid="mobile-image-canvas" data-viewed-part={String(viewedPartNumber)} />
  ),
}));

vi.mock('../../components/test/mobile/MobileListeningAnswerSheet', () => ({
  MobileListeningAnswerSheet: () => <div data-testid="mobile-answer-sheet" />,
}));

vi.mock('../../skills/listening/components/ListeningHeader', () => ({
  ListeningHeader: () => <div>Listening Header</div>,
}));

vi.mock('../../skills/listening/components/SectionRubricBlock', () => ({
  SectionRubricBlock: ({ partNumber }: any) => (
    <div data-testid="section-rubric" data-part={partNumber} />
  ),
}));

vi.mock('../../skills/listening/components/ListeningNavArrows', () => ({
  ListeningNavArrows: () => <div data-testid="desktop-listening-nav-arrows" />,
}));

vi.mock('../../skills/listening/components/AudioPlayer', () => ({
  AudioPlayer: ({ sectionNumber, mobileLayout }: any) => (
    <div
      data-testid="mobile-audio-player"
      data-section={sectionNumber}
      data-mobile-layout={String(Boolean(mobileLayout))}
    />
  ),
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

// Mock the scaffold to expose internal state — mirrors Reading test pattern
vi.mock('../../components/test/mobile/MobileListeningExamScaffold', () => ({
  MobileListeningExamScaffold: (props: any) => (
    <div data-testid="mock-mobile-listening-scaffold">
      <div
        data-testid="mock-mobile-listening-state"
        data-active-part={String(props.activePartNumber)}
        data-playing-part={String(props.playingPartNumber)}
        data-submit-sheet-open={String(props.submitSheetOpen)}
        data-overflow-open={String(props.overflowMenuOpen)}
        data-text-size-open={String(props.textSizeControlOpen)}
        data-instructions-open={String(props.instructionsOpen)}
        data-font-size={String(props.fontSize)}
        data-test-submitted={String(props.testSubmitted)}
        data-is-paused={String(props.isPaused)}
        data-is-waiting={String(props.isWaiting)}
        data-part-count={String(props.partCount)}
        data-anti-select={props.antiSelectClass || ''}
      />
      {/* Exposure button to simulate tab taps */}
      <button
        type="button"
        data-testid="tap-part-1"
        onClick={() => props.onPartChange(1)}
      >
        Tap Part 1
      </button>
      <button
        type="button"
        data-testid="tap-part-2"
        onClick={() => props.onPartChange(2)}
      >
        Tap Part 2
      </button>
      <button
        type="button"
        data-testid="tap-part-3"
        onClick={() => props.onPartChange(3)}
      >
        Tap Part 3
      </button>
      <button
        type="button"
        data-testid="tap-part-4"
        onClick={() => props.onPartChange(4)}
      >
        Tap Part 4
      </button>
      <button type="button" onClick={props.onOpenSubmitSheet}>
        Open Submit Sheet
      </button>
      <button type="button" onClick={props.onOpenOverflowMenu}>
        Open Overflow
      </button>
      <button type="button" onClick={props.onOpenTextSizeControl}>
        Open Text Size
      </button>
      <button type="button" onClick={props.onOpenInstructions}>
        Open Instructions
      </button>
      <button type="button" onClick={() => props.onTextSizeChange(20)}>
        Change Font Size
      </button>
      {/* Render slots so we can assert on content */}
      <div data-testid="mobile-audio-row">{props.audioRowContent}</div>
      <div data-testid="mobile-main-content">{props.mainContent}</div>
    </div>
  ),
}));

// ── Shared test data ────────────────────────────────────────────────────────

const antiCheatConfig = {
  detectTabSwitch: true,
  detectCopyPaste: true,
  detectRightClick: true,
  detectKeyboardShortcuts: true,
  requireFullscreen: true,
  shuffleQuestions: false,
  shuffleOptions: false,
};

/** Standard Listening test with 4 audio sections, showPlayPause=false */
const makeMockTestData = (showPlayPause = false) => ({
  id: 'listening-test',
  title: 'Listening Test',
  type: 'IELTS',
  skill: 'Listening',
  duration: 30,
  questionCount: 8,
  displayMode: 'text',
  audioSections: [
    { number: 1, name: 'Section 1', audioUrl: 'https://example.com/audio1.mp3', startQuestion: 1, endQuestion: 2 },
    { number: 2, name: 'Section 2', audioUrl: 'https://example.com/audio2.mp3', startQuestion: 3, endQuestion: 4 },
    { number: 3, name: 'Section 3', audioUrl: 'https://example.com/audio3.mp3', startQuestion: 5, endQuestion: 6 },
    { number: 4, name: 'Section 4', audioUrl: 'https://example.com/audio4.mp3', startQuestion: 7, endQuestion: 8 },
  ],
  questions: [
    { number: 1, type: 'multiple-choice', question: 'Q1', options: ['A', 'B', 'C'], answer: 'A', sectionNumber: 1, points: 1 },
    { number: 2, type: 'multiple-choice', question: 'Q2', options: ['A', 'B', 'C'], answer: 'B', sectionNumber: 1, points: 1 },
    { number: 3, type: 'completion', question: 'Q3', answer: 'test', sectionNumber: 2, points: 1 },
    { number: 4, type: 'completion', question: 'Q4', answer: 'answer', sectionNumber: 2, points: 1 },
    { number: 5, type: 'multiple-choice', question: 'Q5', options: ['A', 'B', 'C'], answer: 'C', sectionNumber: 3, points: 1 },
    { number: 6, type: 'multiple-choice', question: 'Q6', options: ['A', 'B', 'C'], answer: 'A', sectionNumber: 3, points: 1 },
    { number: 7, type: 'completion', question: 'Q7', answer: 'final', sectionNumber: 4, points: 1 },
    { number: 8, type: 'completion', question: 'Q8', answer: 'end', sectionNumber: 4, points: 1 },
  ],
  settings: {
    allowReplay: false,
    audioControls: {
      showPlayPause,
      showProgressBar: true,
      showSeekControl: false,
      showSpeedControl: false,
      showSkipSection: false,
      showVolumeControl: true,
    },
  },
});

/** Image-mode Listening test with displayMode='image' and questionImages */
const makeMockImageModeTestData = (showPlayPause = false) => {
  const base = makeMockTestData(showPlayPause);
  return {
    ...base,
    displayMode: 'image',
    questionImages: [
      { sectionNumber: 1, imageUrl: 'https://example.com/img1.jpg', startQuestion: 1, endQuestion: 2 },
      { sectionNumber: 2, imageUrl: 'https://example.com/img2.jpg', startQuestion: 3, endQuestion: 4 },
      { sectionNumber: 3, imageUrl: 'https://example.com/img3.jpg', startQuestion: 5, endQuestion: 6 },
      { sectionNumber: 4, imageUrl: 'https://example.com/img4.jpg', startQuestion: 7, endQuestion: 8 },
    ],
  };
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

// ── beforeEach ───────────────────────────────────────────────────────────────

function setupDefaults(showPlayPause = false) {
  vi.clearAllMocks();
  mockUseMobileExamMode.mockReturnValue({ isMobileExamMode: false });

  sessionStorage.clear();
  sessionStorage.setItem('playerId', 'player-123');
  sessionStorage.setItem('playerName', 'Test Student');
  sessionStorage.setItem('sessionCode', 'ABC123');

  vi.mocked(useHeadphonePermission).mockReturnValue({
    requestPermission: vi.fn(),
  } as any);

  vi.mocked(useTestData).mockReturnValue({
    testData: makeMockTestData(showPlayPause),
    loading: false,
    error: null,
    questionsWithAnswersRef: { current: makeMockTestData(showPlayPause).questions },
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
    mobileState: null,
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
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('ListeningTestPage integration', () => {
  beforeEach(() => {
    setupDefaults();
  });

  // ── Existing desktop integration tests ────────────────────────────────

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

// ═══════════════════════════════════════════════════════════════════════════
// Phase 3: Mobile Direct-Question Behavior (PRD-0045 Task 3.9)
// ═══════════════════════════════════════════════════════════════════════════

describe('ListeningTestPage mobile direct-question (Phase 3)', () => {
  beforeEach(() => {
    setupDefaults();
    mockUseMobileExamMode.mockReturnValue({ isMobileExamMode: true });
  });

  it('renders the mobile scaffold when isMobileExamMode is true', async () => {
    renderPage();
    await screen.findByTestId('mock-mobile-listening-scaffold');
    expect(screen.queryByText('Listening Header')).not.toBeInTheDocument();
  });

  it('desktop branch renders when isMobileExamMode is false', async () => {
    mockUseMobileExamMode.mockReturnValue({ isMobileExamMode: false });
    renderPage();
    await screen.findByText('Listening Header');
    expect(screen.queryByTestId('mock-mobile-listening-scaffold')).not.toBeInTheDocument();
  });

  // Task 3.3: Standard/live tab tap changes viewed-part only
  it('Standard/live tab tap changes viewed-part cue only — audio stays unchanged', async () => {
    // Default test data has showPlayPause = false (Standard mode)
    renderPage();
    await screen.findByTestId('mock-mobile-listening-scaffold');

    // Initially: audio on section 1, viewed part = 1
    const stateEl = screen.getByTestId('mock-mobile-listening-state');
    expect(stateEl.getAttribute('data-active-part')).toBe('1');
    expect(stateEl.getAttribute('data-playing-part')).toBe('1');

    // Tap Part 3 tab
    fireEvent.click(screen.getByTestId('tap-part-3'));

    await waitFor(() => {
      const s = screen.getByTestId('mock-mobile-listening-state');
      // viewedPartNumber changed to 3
      expect(s.getAttribute('data-active-part')).toBe('3');
      // playingPartNumber stays at 1 — audio is NOT changed
      expect(s.getAttribute('data-playing-part')).toBe('1');
    });
  });

  // Task 3.3: Standard/live rendered question group stays audio-locked
  it('Standard/live rendered content derives from audio section 1 even when viewed-part is 3', async () => {
    renderPage();
    await screen.findByTestId('mock-mobile-listening-scaffold');

    // Tap Part 3 to change viewed part only (Standard mode)
    fireEvent.click(screen.getByTestId('tap-part-3'));

    await waitFor(() => {
      expect(screen.getByTestId('mock-mobile-listening-state').getAttribute('data-active-part')).toBe('3');
    });

    // The section rubric should show part 3 (the viewed part)
    const rubric = screen.getByTestId('section-rubric');
    expect(rubric.getAttribute('data-part')).toBe('3');

    // The audio player should still show section 1 (audio-locked)
    const audioPlayer = screen.getByTestId('mobile-audio-player');
    expect(audioPlayer.getAttribute('data-section')).toBe('1');
  });

  // Task 3.4: Practice/Relaxed tab tap changes audio section AND rendered group
  it('Practice/Relaxed tab tap changes both viewed-part and audio section', async () => {
    // Re-setup with showPlayPause = true (Practice/Relaxed mode)
    setupDefaults(true);
    mockUseMobileExamMode.mockReturnValue({ isMobileExamMode: true });

    renderPage();
    await screen.findByTestId('mock-mobile-listening-scaffold');

    // Tap Part 2 tab
    fireEvent.click(screen.getByTestId('tap-part-2'));

    await waitFor(() => {
      const s = screen.getByTestId('mock-mobile-listening-state');
      // Both active and playing should update to 2
      expect(s.getAttribute('data-active-part')).toBe('2');
      // In practice mode, playingPartNumber tracks the currentAudioIndex+1 mapped section
      // The scaffold receives playingPartNumber from currentSection state
    });

    // Rubric should match viewed part
    const rubric = screen.getByTestId('section-rubric');
    expect(rubric.getAttribute('data-part')).toBe('2');
  });

  // Task 3.5: Direct-question mode has no Questions FAB
  it('direct-question mode does not render a Questions FAB button', async () => {
    renderPage();
    await screen.findByTestId('mock-mobile-listening-scaffold');

    // No Questions button / FAB in direct-question mode
    expect(screen.queryByText('Questions')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mobile-questions-fab')).not.toBeInTheDocument();
  });

  // Task 3.7: Desktop still renders the legacy bottom navigator and arrows
  it('desktop mode renders legacy ListeningQuestionNav and ListeningNavArrows', async () => {
    mockUseMobileExamMode.mockReturnValue({ isMobileExamMode: false });
    renderPage();
    await screen.findByText('Listening Header');

    // Desktop elements should be present
    expect(screen.getByTestId('desktop-listening-question-nav')).toBeInTheDocument();
    expect(screen.getByTestId('desktop-listening-nav-arrows')).toBeInTheDocument();
  });

  // Task 3.7: Mobile mode hides them
  it('mobile mode hides legacy ListeningQuestionNav and ListeningNavArrows', async () => {
    renderPage();
    await screen.findByTestId('mock-mobile-listening-scaffold');

    // Legacy desktop elements should NOT be present in the mobile branch
    expect(screen.queryByTestId('desktop-listening-question-nav')).not.toBeInTheDocument();
    expect(screen.queryByTestId('desktop-listening-nav-arrows')).not.toBeInTheDocument();
  });

  // Task 3.8: Audio row shows currently playing section number
  it('audio row always displays the currently playing section number', async () => {
    renderPage();
    await screen.findByTestId('mock-mobile-listening-scaffold');

    const audioPlayer = screen.getByTestId('mobile-audio-player');
    expect(audioPlayer.getAttribute('data-section')).toBe('1');
    expect(audioPlayer.getAttribute('data-mobile-layout')).toBe('true');
  });

  // Task 3.8: Section rubric shows viewed part number, not audio part
  it('section rubric block displays the currently viewed part number', async () => {
    renderPage();
    await screen.findByTestId('mock-mobile-listening-scaffold');

    // Initially viewed part = 1
    expect(screen.getByTestId('section-rubric').getAttribute('data-part')).toBe('1');

    // Switch to Part 4
    fireEvent.click(screen.getByTestId('tap-part-4'));

    await waitFor(() => {
      expect(screen.getByTestId('section-rubric').getAttribute('data-part')).toBe('4');
    });
  });

  // Task 3.3: Tapping the currently active tab is a no-op (no re-render thrash)
  it('tapping the already-active tab does not cause errors', async () => {
    renderPage();
    await screen.findByTestId('mock-mobile-listening-scaffold');

    expect(screen.getByTestId('mock-mobile-listening-state').getAttribute('data-active-part')).toBe('1');

    // Tap Part 1 again — should be a safe no-op
    fireEvent.click(screen.getByTestId('tap-part-1'));

    await waitFor(() => {
      expect(screen.getByTestId('mock-mobile-listening-state').getAttribute('data-active-part')).toBe('1');
    });
  });

  // Additional: scaffold receives correct host-owned state
  it('passes host-owned state correctly to the mobile scaffold', async () => {
    renderPage();
    await screen.findByTestId('mock-mobile-listening-scaffold');

    const state = screen.getByTestId('mock-mobile-listening-state');
    expect(state.getAttribute('data-test-submitted')).toBe('false');
    expect(state.getAttribute('data-is-paused')).toBe('false');
    expect(state.getAttribute('data-is-waiting')).toBe('false');
    expect(state.getAttribute('data-submit-sheet-open')).toBe('false');
    expect(state.getAttribute('data-overflow-open')).toBe('false');
  });

  it('passes protection props to the scaffold and closes overlays when waiting blocks interaction', async () => {
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
      audioCommand: null,
      accommodation: null,
      masterAudioState: null,
      audioMode: 'standard',
      headphoneRequest: null,
      mobileState: null,
      antiCheatConfig,
      integrityRefreshRequestedAt: 1_700_000_000_000,
    } as any;

    vi.mocked(useTestSession).mockImplementation(() => sessionState);

    const view = renderPage();
    await screen.findByTestId('mock-mobile-listening-scaffold');

    const state = screen.getByTestId('mock-mobile-listening-state');
    expect(state.getAttribute('data-part-count')).toBe('4');
    expect(state.getAttribute('data-anti-select')).toBe('anti-select');

    fireEvent.click(screen.getByRole('button', { name: 'Open Overflow' }));
    await waitFor(() => {
      expect(screen.getByTestId('mock-mobile-listening-state').getAttribute('data-overflow-open')).toBe('true');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open Submit Sheet' }));
    await waitFor(() => {
      const updatedState = screen.getByTestId('mock-mobile-listening-state');
      expect(updatedState.getAttribute('data-submit-sheet-open')).toBe('true');
      expect(updatedState.getAttribute('data-overflow-open')).toBe('false');
    });

    sessionState.sessionStatus = 'waiting';
    view.rerender(
      <MemoryRouter initialEntries={['/student-test/ABC123']}>
        <Routes>
          <Route path="/student-test/:sessionCode" element={<ListeningTestPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      const waitingState = screen.getByTestId('mock-mobile-listening-state');
      expect(waitingState.getAttribute('data-is-waiting')).toBe('true');
      expect(waitingState.getAttribute('data-submit-sheet-open')).toBe('false');
      expect(waitingState.getAttribute('data-overflow-open')).toBe('false');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open Instructions' }));

    await waitFor(() => {
      expect(screen.getByTestId('mock-mobile-listening-state').getAttribute('data-instructions-open')).toBe('false');
    });
  });

  it('closes transient overlays when the live time-up overlay is active', async () => {
    const timerState = {
      timeRemaining: 1700,
      formatTime: (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`,
      showTimeUpOverlay: false,
      gracePeriodRemaining: 0,
      isInExtraTime: false,
    };

    vi.mocked(useTestTimer).mockImplementation(() => timerState as any);

    const view = renderPage();
    await screen.findByTestId('mock-mobile-listening-scaffold');

    fireEvent.click(screen.getByRole('button', { name: 'Open Instructions' }));
    await waitFor(() => {
      expect(screen.getByTestId('mock-mobile-listening-state').getAttribute('data-instructions-open')).toBe('true');
    });

    timerState.showTimeUpOverlay = true;
    view.rerender(
      <MemoryRouter initialEntries={['/student-test/ABC123']}>
        <Routes>
          <Route path="/student-test/:sessionCode" element={<ListeningTestPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      const state = screen.getByTestId('mock-mobile-listening-state');
      expect(state.getAttribute('data-instructions-open')).toBe('false');
      expect(state.getAttribute('data-submit-sheet-open')).toBe('false');
    });
  });

  // Phase 7.1: Standard/live tapping a future part tab (Part 4 while audio is Part 1) succeeds
  it('Standard/live tapping Part 4 while audio is Part 1 changes viewed-part without blocking', async () => {
    renderPage();
    await screen.findByTestId('mock-mobile-listening-scaffold');

    // Initially: Part 1 active and playing
    const stateEl = screen.getByTestId('mock-mobile-listening-state');
    expect(stateEl.getAttribute('data-active-part')).toBe('1');
    expect(stateEl.getAttribute('data-playing-part')).toBe('1');

    // Tap Part 4 — a future part that hasn't played yet
    fireEvent.click(screen.getByTestId('tap-part-4'));

    await waitFor(() => {
      const s = screen.getByTestId('mock-mobile-listening-state');
      // viewed part changed to 4
      expect(s.getAttribute('data-active-part')).toBe('4');
      // audio stays locked to Part 1
      expect(s.getAttribute('data-playing-part')).toBe('1');
    });

    // Section rubric shows the viewed part (4)
    expect(screen.getByTestId('section-rubric').getAttribute('data-part')).toBe('4');
    // Audio player stays on section 1
    expect(screen.getByTestId('mobile-audio-player').getAttribute('data-section')).toBe('1');
  });

  it('passes locked state through to mobile question groups', async () => {
    vi.mocked(useTestSubmission).mockReturnValue({
      testSubmitted: false,
      testResults: null,
      loadedAnswers: null,
      handleSubmit: vi.fn(async () => {}),
      isLocked: true,
    } as any);

    renderPage();

    const questionDisplay = await screen.findByTestId('listening-question-display');
    expect(questionDisplay.getAttribute('data-disabled')).toBe('true');
  });

  it('keeps player-root question state authoritative over conflicting mobile shell restore', async () => {
    vi.mocked(get).mockResolvedValueOnce({
      exists: () => true,
      val: () => ({
        currentAudioIndex: 0,
        currentQuestionNumber: 3,
        volume: 0.7,
        playbackSpeed: 1,
        audioIndicesCompleted: [],
      }),
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
      mobileState: {
        kind: 'listening',
        version: 1,
        compat: {
          materialId: 'listening-test',
          scopeKey: 'ABC123',
          partCount: 4,
          questionLayoutSignature: '1:1,2|2:3,4|3:5,6|4:7,8',
        },
        viewedPartNumber: 4,
        currentQuestionNumber: 7,
        textSize: 18,
        answerSheetScrollByPart: {},
        imageZoomByPart: {},
      },
      antiCheatConfig,
      integrityRefreshRequestedAt: 1_700_000_000_000,
    } as any);

    renderPage();

    await waitFor(() => {
      const state = screen.getByTestId('mock-mobile-listening-state');
      expect(state.getAttribute('data-playing-part')).toBe('1');
      expect(state.getAttribute('data-active-part')).toBe('2');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Phase 7.2: Mobile Image-Mode Behavior (PRD-0045 Task 7.2)
// ═══════════════════════════════════════════════════════════════════════════

describe('ListeningTestPage mobile image-mode (Phase 7.2)', () => {
  function setupImageMode(showPlayPause = false) {
    setupDefaults(showPlayPause);
    mockUseMobileExamMode.mockReturnValue({ isMobileExamMode: true });
    const imageTestData = makeMockImageModeTestData(showPlayPause);
    vi.mocked(useTestData).mockReturnValue({
      testData: imageTestData,
      loading: false,
      error: null,
      questionsWithAnswersRef: { current: imageTestData.questions },
    } as any);
  }

  beforeEach(() => {
    setupImageMode();
  });

  it('renders Questions FAB in image mode', async () => {
    renderPage();
    await screen.findByTestId('mock-mobile-listening-scaffold');

    // FAB should be visible in the main content slot
    const mainContent = screen.getByTestId('mobile-main-content');
    const fab = mainContent.querySelector('[data-testid="mobile-listening-questions-fab"]');
    expect(fab).toBeTruthy();
  });

  it('Questions FAB is NOT rendered in direct-question (text) mode', async () => {
    // Reset to text mode
    setupDefaults();
    mockUseMobileExamMode.mockReturnValue({ isMobileExamMode: true });

    renderPage();
    await screen.findByTestId('mock-mobile-listening-scaffold');

    expect(screen.queryByTestId('mobile-listening-questions-fab')).not.toBeInTheDocument();
  });

  it('part tabs remain accessible in image mode', async () => {
    renderPage();
    await screen.findByTestId('mock-mobile-listening-scaffold');

    fireEvent.click(screen.getByTestId('tap-part-2'));

    await waitFor(() => {
      expect(screen.getByTestId('mock-mobile-listening-state').getAttribute('data-active-part')).toBe('2');
    });
  });

  it('part switch updates image canvas in image mode (Standard)', async () => {
    renderPage();
    await screen.findByTestId('mock-mobile-listening-scaffold');

    const canvas = screen.getByTestId('mobile-image-canvas');
    expect(canvas.getAttribute('data-viewed-part')).toBe('1');

    fireEvent.click(screen.getByTestId('tap-part-3'));

    await waitFor(() => {
      const c = screen.getByTestId('mobile-image-canvas');
      expect(c.getAttribute('data-viewed-part')).toBe('3');
    });
  });

  it('audio does not change when tapping parts in Standard image mode', async () => {
    renderPage();
    await screen.findByTestId('mock-mobile-listening-scaffold');

    fireEvent.click(screen.getByTestId('tap-part-4'));

    await waitFor(() => {
      const s = screen.getByTestId('mock-mobile-listening-state');
      expect(s.getAttribute('data-active-part')).toBe('4');
      expect(s.getAttribute('data-playing-part')).toBe('1');
    });
  });

  it('audio row remains visible in image mode', async () => {
    renderPage();
    await screen.findByTestId('mock-mobile-listening-scaffold');

    const audioRow = screen.getByTestId('mobile-audio-row');
    expect(audioRow).toBeTruthy();
    const audioPlayer = audioRow.querySelector('[data-testid="mobile-audio-player"]');
    expect(audioPlayer).toBeTruthy();
  });
});
