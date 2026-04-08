import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IELTSPracticeView } from './IELTSPracticeView';
import { storage } from '../../core/platform/storage';
import { useMobileExamMode } from '../../core/platform/hooks/useMobileExamMode';
import { useAuth } from '../../hooks/useAuth';
import { useSoloTestData } from '../../hooks/solo/useSoloTestData';
import { useSoloTimer } from '../../hooks/solo/useSoloTimer';
import { useSoloAutoSave } from '../../hooks/solo/useSoloAutoSave';
import { useSoloResume } from '../../hooks/solo/useSoloResume';
import { useSoloSubmission } from '../../hooks/solo/useSoloSubmission';
import { useTestIntegrity } from '../../hooks/test/useTestIntegrity';
import { useAntiCopyPaste } from '../../hooks/test/useAntiCopyPaste';
import { useFullscreenMode } from '../../hooks/test/useFullscreenMode';
import { useTestCompletionCheck } from '../../hooks/test/useTestCompletionCheck';
import { useBeforeUnloadWarning } from '../../hooks/test/useBeforeUnloadWarning';
import { toast } from '../modern/ToastNotification';
import { getHomeworkById } from '../../services/homeworkManager';

const { trackActionMock } = vi.hoisted(() => ({
  trackActionMock: vi.fn(),
}));

vi.mock('../../hooks/useNavigation', () => ({
  useNavigation: vi.fn(() => ({
    navigateTo: vi.fn(),
  })),
}));

vi.mock('../../core/platform/storage', () => ({
  storage: {
    get: vi.fn(async () => undefined),
    set: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
  },
}));

vi.mock('../../core/platform/hooks/useMobileExamMode', () => ({
  useMobileExamMode: vi.fn(),
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../hooks/solo/useSoloTestData', () => ({
  useSoloTestData: vi.fn(),
}));

vi.mock('../../hooks/solo/useSoloTimer', () => ({
  useSoloTimer: vi.fn(),
}));

vi.mock('../../hooks/solo/useSoloAutoSave', () => ({
  useSoloAutoSave: vi.fn(),
}));

vi.mock('../../hooks/solo/useSoloResume', () => ({
  useSoloResume: vi.fn(),
}));

vi.mock('../../hooks/solo/useSoloSubmission', () => ({
  useSoloSubmission: vi.fn(),
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

vi.mock('../../services/homeworkManager', () => ({
  getHomeworkById: vi.fn(async () => null),
}));

vi.mock('../../components/modern/ToastNotification', () => ({
  toast: {
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../utils/integrityUtils', () => ({
  toHomeworkIntegrity: vi.fn(() => undefined),
}));

vi.mock('../../utils/thcsShuffle', () => ({
  getIELTSQuestionsForStudent: vi.fn((questions) => questions),
}));

vi.mock('../PassageRenderer_v2', () => ({
  default: () => <div data-testid="mock-practice-passage-renderer" />,
}));

vi.mock('../test/mobile/MobileStartScreen', () => ({
  MobileStartScreen: (props: any) => (
    <button type="button" onClick={props.onStart}>
      Start Mobile Practice
    </button>
  ),
}));

vi.mock('../test/mobile/MobileReadingExamScaffold', () => ({
  MobileReadingExamScaffold: (props: any) => (
    <div data-testid="mock-practice-mobile-scaffold">
      <div
        data-testid="mock-practice-mobile-state"
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
        Open Practice Sheet
      </button>
      <button type="button" onClick={props.onCloseQuestionSheet}>
        Close Practice Sheet
      </button>
      <button type="button" onClick={props.onOpenReviewSummary}>
        Open Practice Review
      </button>
      <button type="button" onClick={props.onOpenOverflowMenu}>
        Open Practice Overflow
      </button>
      <button type="button" onClick={props.onOpenTextSizeControl}>
        Open Practice Text Size
      </button>
      <button type="button" onClick={props.onOpenInstructions}>
        Open Practice Instructions
      </button>
      <button type="button" onClick={() => props.onTextSizeChange(18)}>
        Change Practice Text Size
      </button>
      <button type="button" onClick={() => props.onActiveQuestionGroupChange(props.activePassageId, 3)}>
        Save Practice Group
      </button>
      <button type="button" onClick={() => props.onQuestionSheetScroll(props.activePassageId, 140)}>
        Save Practice Sheet Scroll
      </button>
    </div>
  ),
}));

vi.mock('../test/SoloSettingsModal', () => ({
  SoloSettingsModal: () => null,
}));

vi.mock('../test/SoloResumeModal', () => ({
  SoloResumeModal: ({ opened, onResume, onStartNew }: any) => opened ? (
    <div data-testid="mock-solo-resume-modal">
      <button type="button" onClick={onResume}>
        Resume Saved Progress
      </button>
      <button type="button" onClick={onStartNew}>
        Start New Practice
      </button>
    </div>
  ) : null,
}));

vi.mock('../test/IELTSQuestionsPanel', () => ({
  IELTSQuestionsPanel: () => <div data-testid="mock-practice-questions-panel" />,
}));

vi.mock('../test/TwoColumnLayout', () => ({
  TwoColumnLayout: ({ leftColumn, rightColumn }: any) => (
    <div>
      <div>{leftColumn}</div>
      <div>{rightColumn}</div>
    </div>
  ),
}));

vi.mock('../test/TestHeader', () => ({
  TestHeader: () => <div data-testid="mock-practice-header" />,
}));

vi.mock('../test/PassageControls', () => ({
  PassageControls: () => <div data-testid="mock-practice-controls" />,
}));

vi.mock('../test/TimeUpOverlay', () => ({
  TimeUpOverlay: () => <div data-testid="mock-practice-time-up-overlay" />,
}));

vi.mock('../test/InspiraFooterNav', () => ({
  InspiraFooterNav: () => <button type="button">Submit Practice</button>,
}));

const mockTestData = {
  id: 'reading-material',
  title: 'Reading Practice',
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

describe('IELTSPracticeView mobile host state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    trackActionMock.mockReset();

    vi.mocked(useMobileExamMode).mockReturnValue({ isMobileExamMode: true } as any);
    vi.mocked(useAuth).mockReturnValue({
      user: {
        uid: 'student-1',
        displayName: 'Student One',
        email: 'student@example.com',
      },
      profile: {
        displayName: 'Student One',
      },
    } as any);
    vi.mocked(useSoloTestData).mockReturnValue({
      testData: mockTestData,
      loading: false,
      error: null,
      activePassageId: 'p1',
      setActivePassageId: vi.fn(),
      questionsWithAnswersRef: { current: mockTestData.questions },
    } as any);
    vi.mocked(useSoloResume).mockReturnValue({
      savedProgress: null,
      checking: false,
      discardProgress: vi.fn(),
    } as any);
    vi.mocked(useSoloTimer).mockReturnValue({
      timeRemaining: 1500,
      formatTime: (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`,
      isPaused: false,
      togglePause: vi.fn(),
      showTimeUpOverlay: false,
      gracePeriodRemaining: 0,
      hasTimer: true,
    } as any);
    vi.mocked(useSoloSubmission).mockReturnValue({
      isSubmitting: false,
      testSubmitted: false,
      testResults: null,
      handleSubmit: vi.fn(async () => {}),
      isLocked: false,
    } as any);
    vi.mocked(useTestIntegrity).mockReturnValue({
      addEvent: vi.fn(),
      violationCount: 0,
      totalEvents: 0,
      warningLevel: 'none',
      warningMessage: '',
      shouldAutoSubmit: false,
      flushEvents: vi.fn(async () => {}),
      getIntegrityReport: vi.fn(() => ({ violationCount: 0 })),
    } as any);
    vi.mocked(useSoloAutoSave).mockReturnValue({
      status: 'idle',
      lastSaved: null,
      error: null,
    } as any);
    vi.mocked(useAntiCopyPaste).mockReturnValue(undefined as never);
    vi.mocked(useFullscreenMode).mockReturnValue(undefined as never);
    vi.mocked(useTestCompletionCheck).mockReturnValue(undefined as never);
    vi.mocked(useBeforeUnloadWarning).mockReturnValue(undefined as never);
    vi.mocked(storage.get).mockResolvedValue(undefined);
    vi.mocked(storage.set).mockResolvedValue(undefined);
  });

  it('persists mobile sheet scroll and active question group across close and reopen', async () => {
    render(
      <IELTSPracticeView
        materialId="reading-material"
        resolvedSettings={{ timerMinutes: 25, allowPause: true } as any}
        practiceContext={{ type: 'self_study' }}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Start Mobile Practice' }));
    await screen.findByTestId('mock-practice-mobile-scaffold');

    fireEvent.click(screen.getByRole('button', { name: 'Open Practice Sheet' }));
    await waitFor(() => {
      expect(screen.getByTestId('mock-practice-mobile-state').getAttribute('data-sheet-open')).toBe('true');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save Practice Group' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Practice Sheet Scroll' }));

    await waitFor(() => {
      const state = screen.getByTestId('mock-practice-mobile-state');
      expect(state.getAttribute('data-active-group')).toBe('3');
      expect(state.getAttribute('data-sheet-scroll')).toBe('140');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Close Practice Sheet' }));
    await waitFor(() => {
      expect(screen.getByTestId('mock-practice-mobile-state').getAttribute('data-sheet-open')).toBe('false');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open Practice Sheet' }));
    await waitFor(() => {
      const state = screen.getByTestId('mock-practice-mobile-state');
      expect(state.getAttribute('data-sheet-open')).toBe('true');
      expect(state.getAttribute('data-active-group')).toBe('3');
      expect(state.getAttribute('data-sheet-scroll')).toBe('140');
    });
  });

  it('hydrates resumed mobile state and serializes it back into solo autosave', async () => {
    vi.mocked(useSoloResume).mockReturnValue({
      savedProgress: {
        materialId: 'reading-material',
        studentId: 'student-1',
        answers: { 1: 'A' },
        currentQuestion: 2,
        timeElapsed: 90,
        startedAt: 1,
        lastSavedAt: 2,
        mobileState: {
          activePassageId: 'p1',
          questionSheetOpen: true,
          reviewSummaryOpen: false,
          passageScrollByPassage: { p1: 110 },
          activeQuestionGroupByPassage: { p1: 3 },
          questionSheetScrollByPassage: { p1: 140 },
          textSize: 19,
        },
      },
      checking: false,
      discardProgress: vi.fn(),
    } as any);

    render(
      <IELTSPracticeView
        materialId="reading-material"
        resolvedSettings={{ timerMinutes: 25, allowPause: true } as any}
        practiceContext={{ type: 'self_study' }}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Resume Saved Progress' }));
    await screen.findByTestId('mock-practice-mobile-scaffold');

    await waitFor(() => {
      const state = screen.getByTestId('mock-practice-mobile-state');
      expect(state.getAttribute('data-sheet-open')).toBe('true');
      expect(state.getAttribute('data-active-group')).toBe('3');
      expect(state.getAttribute('data-sheet-scroll')).toBe('140');
      expect(state.getAttribute('data-passage-scroll')).toBe('110');
      expect(state.getAttribute('data-font-size')).toBe('19');
    });

    await waitFor(() => {
      const lastCall = vi.mocked(useSoloAutoSave).mock.calls.at(-1)?.[0];
      expect(lastCall?.mobileState).toEqual({
        activePassageId: 'p1',
        questionSheetOpen: true,
        reviewSummaryOpen: false,
        passageScrollByPassage: { p1: 110 },
        activeQuestionGroupByPassage: { p1: 3 },
        questionSheetScrollByPassage: { p1: 140 },
        textSize: 19,
      });
    });
  });

  it('auto-resumes homework mobile state without surfacing the Start New modal path', async () => {
    vi.mocked(useSoloResume).mockReturnValue({
      savedProgress: {
        materialId: 'reading-material',
        studentId: 'student-1',
        answers: { 1: 'A' },
        currentQuestion: 2,
        timeElapsed: 90,
        startedAt: 1,
        lastSavedAt: 2,
        mobileState: {
          activePassageId: 'p1',
          questionSheetOpen: true,
          reviewSummaryOpen: false,
          passageScrollByPassage: { p1: 110 },
          activeQuestionGroupByPassage: { p1: 3 },
          questionSheetScrollByPassage: { p1: 140 },
          textSize: 19,
        },
      },
      checking: false,
      discardProgress: vi.fn(),
    } as any);

    render(
      <IELTSPracticeView
        materialId="reading-material"
        resolvedSettings={{ timerMinutes: 25, allowPause: true } as any}
        practiceContext={{ type: 'homework', homeworkId: 'hw-1', submissionId: 'sub-1' }}
      />,
    );

    await screen.findByTestId('mock-practice-mobile-scaffold');

    expect(screen.queryByTestId('mock-solo-resume-modal')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start Mobile Practice' })).not.toBeInTheDocument();

    await waitFor(() => {
      const state = screen.getByTestId('mock-practice-mobile-state');
      expect(state.getAttribute('data-sheet-open')).toBe('true');
      expect(state.getAttribute('data-active-group')).toBe('3');
      expect(state.getAttribute('data-sheet-scroll')).toBe('140');
      expect(state.getAttribute('data-passage-scroll')).toBe('110');
      expect(state.getAttribute('data-font-size')).toBe('19');
    });
  });

  it('falls back to persisted reading text size when starting fresh mobile practice', async () => {
    vi.mocked(storage.get).mockResolvedValue(20);

    render(
      <IELTSPracticeView
        materialId="reading-material"
        resolvedSettings={{ timerMinutes: 25, allowPause: true } as any}
        practiceContext={{ type: 'self_study' }}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Start Mobile Practice' }));
    await screen.findByTestId('mock-practice-mobile-scaffold');

    await waitFor(() => {
      expect(screen.getByTestId('mock-practice-mobile-state').getAttribute('data-font-size')).toBe('20');
    });

    expect(storage.get).toHaveBeenCalledWith('reading_text_size_student-1');
  });

  it('deduplicates solo autosave error toasts until a later save resets the guard', async () => {
    const autoSaveState = {
      status: 'error',
      lastSaved: null,
      error: 'Storage offline',
    } as { status: 'idle' | 'saving' | 'saved' | 'error'; lastSaved: number | null; error: string | null };

    vi.mocked(useSoloAutoSave).mockImplementation(() => autoSaveState as any);

    const view = render(
      <IELTSPracticeView
        materialId="reading-material"
        resolvedSettings={{ timerMinutes: 25, allowPause: true } as any}
        practiceContext={{ type: 'self_study' }}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Start Mobile Practice' }));
    await screen.findByTestId('mock-practice-mobile-scaffold');

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledTimes(1);
    });

    view.rerender(
      <IELTSPracticeView
        materialId="reading-material"
        resolvedSettings={{ timerMinutes: 25, allowPause: true } as any}
        practiceContext={{ type: 'self_study' }}
      />,
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledTimes(1);
    });

    autoSaveState.status = 'saved';
    autoSaveState.lastSaved = Date.now();
    autoSaveState.error = null;

    view.rerender(
      <IELTSPracticeView
        materialId="reading-material"
        resolvedSettings={{ timerMinutes: 25, allowPause: true } as any}
        practiceContext={{ type: 'self_study' }}
      />,
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledTimes(1);
    });

    autoSaveState.status = 'error';
    autoSaveState.lastSaved = null;
    autoSaveState.error = 'Storage offline';

    view.rerender(
      <IELTSPracticeView
        materialId="reading-material"
        resolvedSettings={{ timerMinutes: 25, allowPause: true } as any}
        practiceContext={{ type: 'self_study' }}
      />,
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledTimes(2);
    });
  });

  it('force-closes mobile overlays when a practice interruption overlay takes over', async () => {
    const timerState = {
      timeRemaining: 1500,
      formatTime: (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`,
      isPaused: false,
      togglePause: vi.fn(),
      showTimeUpOverlay: false,
      gracePeriodRemaining: 0,
      hasTimer: true,
    };
    vi.mocked(useSoloTimer).mockImplementation(() => timerState as any);

    const view = render(
      <IELTSPracticeView
        materialId="reading-material"
        resolvedSettings={{ timerMinutes: 25, allowPause: true } as any}
        practiceContext={{ type: 'self_study' }}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Start Mobile Practice' }));
    await screen.findByTestId('mock-practice-mobile-scaffold');

    fireEvent.click(screen.getByRole('button', { name: 'Open Practice Sheet' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Practice Review' }));

    await waitFor(() => {
      expect(screen.getByTestId('mock-practice-mobile-state').getAttribute('data-review-open')).toBe('true');
    });

    timerState.showTimeUpOverlay = true;
    view.rerender(
      <IELTSPracticeView
        materialId="reading-material"
        resolvedSettings={{ timerMinutes: 25, allowPause: true } as any}
        practiceContext={{ type: 'self_study' }}
      />,
    );

    await waitFor(() => {
      const state = screen.getByTestId('mock-practice-mobile-state');
      expect(state.getAttribute('data-sheet-open')).toBe('false');
      expect(state.getAttribute('data-review-open')).toBe('false');
    });

    expect(screen.getByTestId('mock-practice-time-up-overlay')).toBeTruthy();
  });

  it('force-closes mobile overlays when practice submission completes', async () => {
    const submissionState = {
      isSubmitting: false,
      testSubmitted: false,
      testResults: null,
      handleSubmit: vi.fn(async () => {}),
      isLocked: false,
    };
    vi.mocked(useSoloSubmission).mockImplementation(() => submissionState as any);

    vi.mocked(useSoloResume).mockReturnValue({
      savedProgress: {
        materialId: 'reading-material',
        studentId: 'student-1',
        answers: { 1: 'A' },
        currentQuestion: 2,
        timeElapsed: 90,
        startedAt: 1,
        lastSavedAt: 2,
        mobileState: {
          activePassageId: 'p1',
          questionSheetOpen: true,
          reviewSummaryOpen: true,
          passageScrollByPassage: {},
          activeQuestionGroupByPassage: {},
          questionSheetScrollByPassage: {},
          textSize: 16,
        },
      },
      checking: false,
      discardProgress: vi.fn(),
    } as any);

    const view = render(
      <IELTSPracticeView
        materialId="reading-material"
        resolvedSettings={{ timerMinutes: 25, allowPause: true } as any}
        practiceContext={{ type: 'self_study' }}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Resume Saved Progress' }));
    await screen.findByTestId('mock-practice-mobile-scaffold');

    await waitFor(() => {
      const state = screen.getByTestId('mock-practice-mobile-state');
      expect(state.getAttribute('data-sheet-open')).toBe('true');
      expect(state.getAttribute('data-review-open')).toBe('true');
    });

    submissionState.testSubmitted = true;
    view.rerender(
      <IELTSPracticeView
        materialId="reading-material"
        resolvedSettings={{ timerMinutes: 25, allowPause: true } as any}
        practiceContext={{ type: 'self_study' }}
      />,
    );

    await waitFor(() => {
      const state = screen.getByTestId('mock-practice-mobile-state');
      expect(state.getAttribute('data-sheet-open')).toBe('false');
      expect(state.getAttribute('data-review-open')).toBe('false');
    });
  });

  it('uses popstate to close the review layer first and the sheet layer second', async () => {
    render(
      <IELTSPracticeView
        materialId="reading-material"
        resolvedSettings={{ timerMinutes: 25, allowPause: true } as any}
        practiceContext={{ type: 'self_study' }}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Start Mobile Practice' }));
    await screen.findByTestId('mock-practice-mobile-scaffold');

    fireEvent.click(screen.getByRole('button', { name: 'Open Practice Sheet' }));
    await waitFor(() => {
      expect(screen.getByTestId('mock-practice-mobile-state').getAttribute('data-sheet-open')).toBe('true');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open Practice Review' }));
    await waitFor(() => {
      const state = screen.getByTestId('mock-practice-mobile-state');
      expect(state.getAttribute('data-sheet-open')).toBe('false');
      expect(state.getAttribute('data-review-open')).toBe('true');
    });

    await act(async () => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await waitFor(() => {
      const state = screen.getByTestId('mock-practice-mobile-state');
      expect(state.getAttribute('data-review-open')).toBe('false');
      expect(state.getAttribute('data-sheet-open')).toBe('true');
    });

    await act(async () => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('mock-practice-mobile-state').getAttribute('data-sheet-open')).toBe('false');
    });
  });

  it('closes review on popstate without reopening the sheet when review was opened directly', async () => {
    render(
      <IELTSPracticeView
        materialId="reading-material"
        resolvedSettings={{ timerMinutes: 25, allowPause: true } as any}
        practiceContext={{ type: 'self_study' }}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Start Mobile Practice' }));
    await screen.findByTestId('mock-practice-mobile-scaffold');

    fireEvent.click(screen.getByRole('button', { name: 'Open Practice Review' }));
    await waitFor(() => {
      const state = screen.getByTestId('mock-practice-mobile-state');
      expect(state.getAttribute('data-sheet-open')).toBe('false');
      expect(state.getAttribute('data-review-open')).toBe('true');
    });

    await act(async () => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    await waitFor(() => {
      const state = screen.getByTestId('mock-practice-mobile-state');
      expect(state.getAttribute('data-review-open')).toBe('false');
      expect(state.getAttribute('data-sheet-open')).toBe('false');
    });
  });

  it('ignores popstate when neither practice mobile overlay is open', async () => {
    render(
      <IELTSPracticeView
        materialId="reading-material"
        resolvedSettings={{ timerMinutes: 25, allowPause: true } as any}
        practiceContext={{ type: 'self_study' }}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Start Mobile Practice' }));
    await screen.findByTestId('mock-practice-mobile-scaffold');

    await act(async () => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    await waitFor(() => {
      const state = screen.getByTestId('mock-practice-mobile-state');
      expect(state.getAttribute('data-sheet-open')).toBe('false');
      expect(state.getAttribute('data-review-open')).toBe('false');
    });
  });

  it('disables fullscreen enforcement for mobile homework even when homework anti-cheat requires it', async () => {
    vi.mocked(getHomeworkById).mockResolvedValue({
      antiCheatConfig: {
        requireFullscreen: true,
      },
    } as any);

    render(
      <IELTSPracticeView
        materialId="reading-material"
        resolvedSettings={{ timerMinutes: 25, allowPause: true } as any}
        practiceContext={{ type: 'homework', homeworkId: 'hw-1', submissionId: 'sub-1' }}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Start Mobile Practice' }));

    await waitFor(() => {
      expect(useFullscreenMode).toHaveBeenCalledWith(expect.objectContaining({
        enabled: false,
      }));
    });
  });

  it('wires mobile overflow, instructions, and text-size state through the practice host with fixed line spacing', async () => {
    render(
      <IELTSPracticeView
        materialId="reading-material"
        resolvedSettings={{ timerMinutes: 25, allowPause: true } as any}
        practiceContext={{ type: 'self_study' }}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Start Mobile Practice' }));
    await screen.findByTestId('mock-practice-mobile-scaffold');

    expect(screen.getByTestId('mock-practice-mobile-state').getAttribute('data-line-spacing')).toBe('1.6');

    fireEvent.click(screen.getByRole('button', { name: 'Open Practice Overflow' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Practice Text Size' }));
    fireEvent.click(screen.getByRole('button', { name: 'Change Practice Text Size' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Practice Instructions' }));

    await waitFor(() => {
      const state = screen.getByTestId('mock-practice-mobile-state');
      expect(state.getAttribute('data-overflow-open')).toBe('false');
      expect(state.getAttribute('data-text-size-open')).toBe('false');
      expect(state.getAttribute('data-instructions-open')).toBe('true');
      expect(state.getAttribute('data-font-size')).toBe('18');
    });

    expect(trackActionMock).toHaveBeenCalledWith('startTest', expect.any(Object));
    expect(trackActionMock).toHaveBeenCalledWith('openOverflowMenu', expect.any(Object));
    expect(trackActionMock).toHaveBeenCalledWith('openTextSizeControl', expect.any(Object));
    expect(trackActionMock).toHaveBeenCalledWith('adjustTextSize', expect.objectContaining({ size: 18 }));
    expect(trackActionMock).toHaveBeenCalledWith('openInstructions', expect.any(Object));
  });
});
