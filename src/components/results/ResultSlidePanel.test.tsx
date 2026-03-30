/**
 * ResultSlidePanel Tests — PRD-0039 Task 5.11
 *
 * Tests:
 * 1. Shell render with result data
 * 2. Open state from resultId
 * 3. Tab switch
 * 4. Close callback (back button, Escape, backdrop)
 * 5. Error fallback + retry
 * 6. Mobile vs desktop shell mode
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';

const listenerRegistry = new Map<string, { success?: (snapshot: any) => void; error?: (error: any) => void }>();

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

const {
  mockOnValue,
  mockGetTestResult,
  mockGetHistoricalScores,
  mockGetClassTestScores,
  mockUseScreenSize,
  mockUseTestAttempts,
  mockGenerateFormativeFeedbackForSavedResult,
} = vi.hoisted(() => {
  const mockOnValue = vi.fn();
  const mockGetTestResult = vi.fn();
  const mockGetHistoricalScores = vi.fn();
  const mockGetClassTestScores = vi.fn();
  const mockUseScreenSize = vi.fn();
  const mockUseTestAttempts = vi.fn();
  const mockGenerateFormativeFeedbackForSavedResult = vi.fn();
  return {
    mockOnValue,
    mockGetTestResult,
    mockGetHistoricalScores,
    mockGetClassTestScores,
    mockUseScreenSize,
    mockUseTestAttempts,
    mockGenerateFormativeFeedbackForSavedResult,
  };
});

// ─── Mock firebase ──────────────────────────────────────────────────────────

vi.mock('firebase/database', () => ({
  ref: vi.fn((_db: any, path: string) => ({ path })),
  onValue: mockOnValue,
}));

vi.mock('../../services/firebase', () => ({
  database: {},
}));

// ─── Mock testResults.service ───────────────────────────────────────────────

vi.mock('../../services/testResults.service', () => ({
  getTestResult: mockGetTestResult,
  getHistoricalScores: mockGetHistoricalScores,
  getClassTestScores: mockGetClassTestScores,
  TestResultRecord: {},
}));

vi.mock('../../hooks/useTestAttempts', () => ({
  useTestAttempts: (...args: any[]) => mockUseTestAttempts(...args),
}));

vi.mock('../../services/resultFeedbackGeneration.service', () => ({
  generateFormativeFeedbackForSavedResult: (...args: any[]) =>
    mockGenerateFormativeFeedbackForSavedResult(...args),
}));

// ─── Mock useScreenSize ─────────────────────────────────────────────────────

vi.mock('@/core/platform', () => ({
  useScreenSize: () => mockUseScreenSize(),
}));

// ─── Import component under test ────────────────────────────────────────────

import { ResultSlidePanel } from './ResultSlidePanel';

// ─── Helpers ────────────────────────────────────────────────────────────────

const MOCK_RESULT = {
  resultId: 'res-1',
  sessionCode: 'hw-session-1',
  testId: 'test-1',
  studentId: 'student-1',
  testTitle: 'IELTS Reading Practice Test 3',
  testType: 'reading',
  testSkill: 'reading',
  percentage: 85,
  totalScore: 17,
  maxScore: 20,
  submittedAt: 1710921600000, // 20 Mar 2024
  createdAt: 1710921600000,
  correct: 17,
  incorrect: 3,
  totalQuestions: 20,
  bandScore: 7.0,
  questionResults: [],
  context: {
    type: 'homework',
    source: { type: 'homework', id: 'hw-1', name: 'Homework 1' },
    configApplied: {
      timerMinutes: 30,
      feedbackTiming: 'after_completion',
      source: 'teacher_override',
    },
  },
};

const MOCK_THCS_RESULT = {
  ...MOCK_RESULT,
  resultId: 'res-thcs',
  testTitle: 'English 6 Unit 3 Quiz',
  testType: 'practice_thcs',
  testSkill: 'grammar',
};

const MOCK_GENERIC_RESULT = {
  ...MOCK_RESULT,
  resultId: 'res-generic',
  testTitle: 'Grammar Progress Check',
  testType: 'grammar-quiz',
  testSkill: 'grammar',
  bandScore: undefined,
};

const MOCK_WRITING_RESULT = {
  ...MOCK_RESULT,
  resultId: 'res-writing',
  testTitle: 'IELTS Writing Homework',
  testType: 'homework',
  testSkill: 'writing',
  percentage: 0,
  totalScore: 0,
  maxScore: 0,
  correct: 0,
  incorrect: 0,
  totalQuestions: 0,
  bandScore: 0,
  markingStatus: 'pending-review',
  questionResults: [],
  writingData: {
    submissionId: 'res-writing',
    overallBand: null,
    markingStatus: 'pending-review',
    tasks: [{ taskNumber: 1, wordCount: 260, activeTimeSeconds: 1200 }],
  },
  writingSubmission: {
    text: 'Task 1\nSample essay text',
    wordCount: 260,
  },
};

const MOCK_LEGACY_CONTEXT_RESULT = {
  ...MOCK_GENERIC_RESULT,
  resultId: 'res-legacy-context',
  sessionCode: 'legacy-session',
  context: {
    source: { type: 'class', id: 'class-legacy', name: 'Legacy Class' },
    configApplied: {
      timerMinutes: 20,
      feedbackTiming: 'after_completion',
      source: 'teacher_override',
    },
  },
};

const MOCK_REVIEWABLE_RESULT = {
  ...MOCK_THCS_RESULT,
  resultId: 'res-review',
  sessionCode: 'hw-session-review',
  totalQuestions: 5,
  correct: 3,
  incorrect: 2,
  percentage: 60,
  questionResults: [
    { questionNumber: 1, questionType: 'multiple-choice', isCorrect: true, score: 1, maxScore: 1, studentAnswer: 'A', correctAnswer: 'A' },
    { questionNumber: 2, questionType: 'multiple-choice', isCorrect: true, score: 1, maxScore: 1, studentAnswer: 'B', correctAnswer: 'B' },
    { questionNumber: 3, questionType: 'multiple-choice', isCorrect: false, score: 0, maxScore: 1, studentAnswer: 'A', correctAnswer: 'C' },
    { questionNumber: 4, questionType: 'multiple-choice', isCorrect: false, score: 0, maxScore: 1, studentAnswer: 'D', correctAnswer: 'B' },
    { questionNumber: 5, questionType: 'multiple-choice', isCorrect: true, score: 1, maxScore: 1, studentAnswer: 'C', correctAnswer: 'C' },
  ],
};

const MOCK_LIVE_SESSION_RESULT = {
  ...MOCK_REVIEWABLE_RESULT,
  resultId: 'res-live',
  sessionCode: 'live-session-1',
  context: {
    type: 'class_session',
    source: { type: 'class', id: 'class-1', name: 'Class 1' },
    configApplied: {
      timerMinutes: 45,
      feedbackTiming: 'after_completion',
      source: 'teacher_override',
    },
  },
};

const MOCK_LIVE_SESSION_THCS_RESULT = {
  ...MOCK_LIVE_SESSION_RESULT,
  testId: 'test-live',
  studentId: 'student-1',
  timeElapsed: 900,
  thcsData: {
    scaledScore: 6.0,
    sectionResults: [
      {
        sectionId: 'grammar',
        sectionName: 'Grammar',
        pointsEarned: 3,
        pointsMax: 5,
        correctCount: 3,
        totalCount: 5,
        percentage: 60,
        intentBreakdown: {
          mcq_grammar: { correct: 3, total: 5 },
        },
      },
    ],
    intentBreakdown: {
      mcq_grammar: { correct: 3, total: 5 },
    },
  },
};

/**
 * Helper to simulate onValue calling the success callback
 */
function emitSnapshot(path: string, data: any) {
  const successCb = listenerRegistry.get(path)?.success;
  if (successCb) {
    act(() => {
      successCb({
        exists: () => data !== null,
        val: () => data,
      });
    });
  }
}

/**
 * Helper to simulate onValue calling the error callback
 */
function emitError(path: string, error: any) {
  const errorCb = listenerRegistry.get(path)?.error;
  if (errorCb) {
    act(() => {
      errorCb(error);
    });
  }
}

function emitResultSnapshot(resultId: string, data: any) {
  emitSnapshot(`test_results/${resultId}`, data);
}

function emitResultError(resultId: string, error: any) {
  emitError(`test_results/${resultId}`, error);
}

function emitSessionSnapshot(sessionCode: string, data: any) {
  emitSnapshot(`game_sessions/${sessionCode}`, data);
}

function emitSessionError(sessionCode: string, error: any) {
  emitError(`game_sessions/${sessionCode}`, error);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ResultSlidePanel — PRD-0039 Task 5.11', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    listenerRegistry.clear();
    mockUseScreenSize.mockReturnValue({
      isMobile: false,
      isTablet: false,
      isDesktop: true,
      width: 1200,
      height: 800,
    });
    mockUseTestAttempts.mockReturnValue({
      attempts: [],
      loading: false,
      error: null,
    });
    mockGetHistoricalScores.mockResolvedValue([]);
    mockGetClassTestScores.mockResolvedValue([]);
    mockGenerateFormativeFeedbackForSavedResult.mockResolvedValue({
      saved: true,
      aiApplied: true,
      mode: 'ai',
    });
    mockOnValue.mockImplementation((reference: { path: string }, success: (snapshot: any) => void, error?: (err: any) => void) => {
      listenerRegistry.set(reference.path, { success, error });
      return vi.fn(() => {
        listenerRegistry.delete(reference.path);
      });
    });
    document.body.style.overflow = '';
  });

  afterEach(() => {
    document.body.style.overflow = '';
  });

  describe('Shell render (Task 5.11a)', () => {
    it('should render the panel shell with header, tabs, and body', async () => {
      render(<ResultSlidePanel resultId="res-1" onClose={mockOnClose} />);

      // Panel is rendered
      expect(screen.getByTestId('rsp-panel')).toBeInTheDocument();

      // Tab bar with 3 tabs
      expect(screen.getByTestId('rsp-tab-overview')).toHaveTextContent('Overview');
      expect(screen.getByTestId('rsp-tab-review')).toHaveTextContent('Review Mistakes');
      expect(screen.getByTestId('rsp-tab-feedback')).toHaveTextContent('Feedback');

      // Back button
      expect(screen.getByTestId('rsp-back-btn')).toBeInTheDocument();

      // Backdrop on desktop
      expect(screen.getByTestId('rsp-backdrop')).toBeInTheDocument();
    });

    it('should show loading state initially', () => {
      render(<ResultSlidePanel resultId="res-1" onClose={mockOnClose} />);
      expect(screen.getByText('Loading result…')).toBeInTheDocument();
    });

    it('should display result data when loaded', () => {
      render(<ResultSlidePanel resultId="res-1" onClose={mockOnClose} />);
      emitResultSnapshot('res-1', MOCK_RESULT);

      expect(screen.getByText('IELTS Reading Practice Test 3')).toBeInTheDocument();
      expect(screen.getByText('IELTS Reading')).toBeInTheDocument();
    });

    it('renders the Writing pending-review surface instead of the generic score summary for writing results', async () => {
      render(<ResultSlidePanel resultId="res-writing" onClose={mockOnClose} />);
      emitResultSnapshot('res-writing', MOCK_WRITING_RESULT);

      expect(await screen.findByText('What Happens Next')).toBeInTheDocument();
      expect(screen.getByText(/your submission is recorded/i)).toBeInTheDocument();
      expect(screen.getByTestId('rsp-panel').className).toContain('rsp-panel--writing');
      expect(screen.queryByTestId('rsp-tab-bar')).not.toBeInTheDocument();
      expect(screen.queryByText('No question results available for this test.')).not.toBeInTheDocument();
    });

    it('should render attempt history beside the title when multiple attempts exist', () => {
      mockUseTestAttempts.mockReturnValue({
        attempts: [
          MOCK_RESULT,
          {
            ...MOCK_RESULT,
            resultId: 'res-0',
            percentage: 72,
            submittedAt: 1710835200000,
            createdAt: 1710835200000,
          },
        ],
        loading: false,
        error: null,
      });

      render(<ResultSlidePanel resultId="res-1" onClose={mockOnClose} />);
      emitResultSnapshot('res-1', MOCK_RESULT);

      expect(screen.getByTestId('rsp-header-attempt')).toHaveTextContent('Attempt 2 of 2');
      expect(screen.getByTestId('rsp-header-attempt')).toHaveTextContent('+13% improvement');
    });

    it('should display THCS badge for THCS test types', () => {
      render(<ResultSlidePanel resultId="res-thcs" onClose={mockOnClose} />);
      emitResultSnapshot('res-thcs', MOCK_THCS_RESULT);

      expect(screen.getByText('THCS')).toBeInTheDocument();
    });
  });

  describe('Open state from resultId (Task 5.11b)', () => {
    it('should set up onValue listener with correct path', () => {
      render(<ResultSlidePanel resultId="res-1" onClose={mockOnClose} />);

      expect(mockOnValue).toHaveBeenCalledTimes(1);
      const refArg = mockOnValue.mock.calls[0][0];
      expect(refArg.path).toBe('test_results/res-1');
    });

    it('should lock body scroll on mount and restore on unmount', () => {
      const { unmount } = render(
        <ResultSlidePanel resultId="res-1" onClose={mockOnClose} />,
      );

      expect(document.body.style.overflow).toBe('hidden');

      unmount();
      expect(document.body.style.overflow).toBe('');
    });

    it('should reload when the incoming resultId prop changes', () => {
      const { rerender } = render(<ResultSlidePanel resultId="res-1" onClose={mockOnClose} />);
      emitResultSnapshot('res-1', MOCK_RESULT);

      rerender(<ResultSlidePanel resultId="res-2" onClose={mockOnClose} />);

      const latestRefArg = mockOnValue.mock.calls.at(-1)?.[0];
      expect(latestRefArg.path).toBe('test_results/res-2');
    });
  });

  describe('Tab switch (Task 5.11c)', () => {
    it('should default to Overview tab', () => {
      render(<ResultSlidePanel resultId="res-1" onClose={mockOnClose} />);
      emitResultSnapshot('res-1', MOCK_RESULT);

      const overviewTab = screen.getByTestId('rsp-tab-overview');
      expect(overviewTab.className).toContain('rsp-tab--active');
    });

    it('should switch to Review Mistakes tab when clicked', () => {
      render(<ResultSlidePanel resultId="res-1" onClose={mockOnClose} />);
      emitResultSnapshot('res-1', MOCK_RESULT);

      fireEvent.click(screen.getByTestId('rsp-tab-review'));

      expect(screen.getByTestId('rsp-tab-review').className).toContain('rsp-tab--active');
      expect(screen.getByTestId('rsp-tab-overview').className).not.toContain('rsp-tab--active');
    });

    it('should switch to Feedback tab when clicked', async () => {
      vi.useFakeTimers();

      try {
        render(<ResultSlidePanel resultId="res-1" onClose={mockOnClose} />);
        emitResultSnapshot('res-1', MOCK_RESULT);

        fireEvent.click(screen.getByTestId('rsp-tab-feedback'));

        await act(async () => {
          await Promise.resolve();
          vi.runOnlyPendingTimers();
        });

        expect(screen.getByTestId('rsp-tab-feedback').className).toContain('rsp-tab--active');
      } finally {
        vi.useRealTimers();
      }
    });

    it('should jump from an incorrect overview pill to the matching review card', async () => {
      const scrollIntoView = vi.fn();
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        value: scrollIntoView,
      });

      render(<ResultSlidePanel resultId="res-review" onClose={mockOnClose} />);
      emitResultSnapshot('res-review', MOCK_REVIEWABLE_RESULT);

      fireEvent.click(screen.getByTestId('ov-pill-3'));

      await waitFor(() => {
        expect(screen.getByTestId('rsp-tab-review').className).toContain('rsp-tab--active');
        expect(screen.getByTestId('rv-card-3')).toHaveClass('rv-card--highlighted');
      });

      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
    });
  });

  describe('Close callback (Task 5.11d)', () => {
    it('should call onClose when back button is clicked (after animation delay)', async () => {
      render(<ResultSlidePanel resultId="res-1" onClose={mockOnClose} />);

      fireEvent.click(screen.getByTestId('rsp-back-btn'));

      // Panel should have closing class
      expect(screen.getByTestId('rsp-panel').className).toContain('rsp-panel--closing');

      // onClose called after ~250ms animation
      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalledTimes(1);
      }, { timeout: 1000 });
    });

    it('should register Escape key handler on document', () => {
      const addEventSpy = vi.spyOn(document, 'addEventListener');
      render(<ResultSlidePanel resultId="res-1" onClose={mockOnClose} />);

      // Verify a keydown listener was added
      const keydownCalls = addEventSpy.mock.calls.filter(
        (call) => call[0] === 'keydown',
      );
      expect(keydownCalls.length).toBeGreaterThanOrEqual(1);

      // Invoke the handler with Escape key
      const handler = keydownCalls[0][1] as EventListener;
      act(() => {
        handler(new KeyboardEvent('keydown', { key: 'Escape' }));
      });

      // Panel should be closing
      expect(screen.getByTestId('rsp-panel').className).toContain('rsp-panel--closing');

      addEventSpy.mockRestore();
    });

    it('should trigger close animation when backdrop is clicked on desktop', () => {
      render(<ResultSlidePanel resultId="res-1" onClose={mockOnClose} />);

      fireEvent.click(screen.getByTestId('rsp-backdrop'));

      // Panel should be in closing state
      expect(screen.getByTestId('rsp-panel').className).toContain('rsp-panel--closing');
    });
  });

  describe('Error fallback (Task 5.11e)', () => {
    it('should show error card when onValue errors and fallback fails', async () => {
      mockGetTestResult.mockRejectedValueOnce(new Error('Network error'));

      render(<ResultSlidePanel resultId="res-1" onClose={mockOnClose} />);

      // Simulate onValue error (before first snapshot)
      emitResultError('res-1', new Error('RTDB listener error'));

      await waitFor(() => {
        expect(screen.getByText('Could not load result. Please try again.')).toBeInTheDocument();
      });

      // Retry button should be present
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });

    it('should show error when result is null', () => {
      render(<ResultSlidePanel resultId="res-1" onClose={mockOnClose} />);
      emitResultSnapshot('res-1', null);

      expect(screen.getByText('Result not found.')).toBeInTheDocument();
    });

    it('should retry loading when Retry button is clicked', async () => {
      mockGetTestResult.mockResolvedValueOnce(MOCK_RESULT);

      render(<ResultSlidePanel resultId="res-1" onClose={mockOnClose} />);
      emitResultSnapshot('res-1', null); // triggers "not found" error

      fireEvent.click(screen.getByText('Retry'));

      await waitFor(() => {
        expect(mockGetTestResult).toHaveBeenCalledWith('res-1');
      });
    });
  });

  describe('Mobile vs desktop shell mode (Task 5.11f)', () => {
    it('should render mobile full-screen mode without backdrop', () => {
      mockUseScreenSize.mockReturnValue({
        isMobile: true,
        isTablet: false,
        isDesktop: false,
        width: 375,
        height: 812,
      });

      render(<ResultSlidePanel resultId="res-1" onClose={mockOnClose} />);

      // Panel should have mobile class
      expect(screen.getByTestId('rsp-panel').className).toContain('rsp-panel--mobile');

      // No backdrop in mobile
      expect(screen.queryByTestId('rsp-backdrop')).not.toBeInTheDocument();
    });

    it('should render desktop mode with backdrop', () => {
      render(<ResultSlidePanel resultId="res-1" onClose={mockOnClose} />);

      // Panel should NOT have mobile class
      expect(screen.getByTestId('rsp-panel').className).not.toContain('rsp-panel--mobile');

      // Backdrop present
      expect(screen.getByTestId('rsp-backdrop')).toBeInTheDocument();
    });
  });

  describe('Feedback generation', () => {
    it('auto-triggers formative feedback for missing IELTS results', async () => {
      render(<ResultSlidePanel resultId="res-1" onClose={mockOnClose} />);
      emitResultSnapshot('res-1', {
        ...MOCK_RESULT,
        testId: 'test-1',
        studentId: 'student-1',
        timeElapsed: 1800,
        questionResults: [
          {
            questionNumber: 1,
            questionType: 'true_false_not_given',
            isCorrect: false,
            score: 0,
            maxScore: 1,
            studentAnswer: 'False',
            correctAnswer: 'True',
            feedback: '',
          },
          {
            questionNumber: 2,
            questionType: 'matching',
            isCorrect: true,
            score: 1,
            maxScore: 1,
            studentAnswer: 'B',
            correctAnswer: 'B',
            feedback: '',
          },
        ],
        ieltsData: {
          passageResults: [
            { passageName: 'Passage 1', questionRange: [1, 2], correct: 1, total: 2, percentage: 50 },
          ],
        },
      });

      await waitFor(() => {
        expect(screen.getByText('IELTS Reading Practice Test 3')).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(mockGenerateFormativeFeedbackForSavedResult).toHaveBeenCalledWith(
          'res-1',
          expect.objectContaining({ triggerSource: 'ResultSlidePanel:auto-generate' }),
        );
      });
    });

    it('generates feedback on manual retry when IELTS results have no stored feedback', async () => {
      render(<ResultSlidePanel resultId="res-1" onClose={mockOnClose} />);
      emitResultSnapshot('res-1', {
        ...MOCK_RESULT,
        testId: 'test-1',
        studentId: 'student-1',
        timeElapsed: 1800,
        questionResults: [
          {
            questionNumber: 1,
            questionType: 'true_false_not_given',
            isCorrect: false,
            score: 0,
            maxScore: 1,
            studentAnswer: 'False',
            correctAnswer: 'True',
            feedback: '',
          },
        ],
        ieltsData: {
          passageResults: [
            { passageName: 'Passage 1', questionRange: [1, 1], correct: 0, total: 1, percentage: 0 },
          ],
        },
      });

      fireEvent.click(screen.getByTestId('rsp-tab-feedback'));

      await waitFor(() => {
        expect(screen.getByTestId('fb-feedback-missing')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Generate AI Feedback'));

      await waitFor(() => {
        expect(mockGenerateFormativeFeedbackForSavedResult).toHaveBeenNthCalledWith(
          2,
          'res-1',
          expect.objectContaining({ triggerSource: 'ResultSlidePanel:manual-generate' }),
        );
      });
    });

    it('should auto-upgrade stored AI feedback when question explanations are still missing', async () => {
      render(<ResultSlidePanel resultId="res-thcs" onClose={mockOnClose} />);
      emitResultSnapshot('res-thcs', {
        ...MOCK_THCS_RESULT,
        testId: 'test-thcs',
        studentId: 'student-1',
        timeElapsed: 900,
        questionResults: [
          {
            questionNumber: 1,
            questionType: 'mcq-grammar',
            isCorrect: false,
            score: 0,
            maxScore: 1,
            studentAnswer: 'B',
            correctAnswer: 'C',
            feedback: '',
          },
        ],
        thcsData: {
          scaledScore: 6.0,
          sectionResults: [
            {
              sectionId: 'grammar',
              sectionName: 'Grammar',
              pointsEarned: 0,
              pointsMax: 1,
              correctCount: 0,
              totalCount: 1,
              percentage: 0,
              intentBreakdown: {
                mcq_grammar: { correct: 0, total: 1 },
              },
            },
          ],
          intentBreakdown: {
            mcq_grammar: { correct: 0, total: 1 },
          },
        },
        formativeFeedback: {
          aiFeedback: {
            summary: 'Old summary',
            strengths: '',
            revision: 'Old revision',
            critical: 'Old critical',
          },
          analysis: { strengths: [], revision: [], critical: [] },
          deterministicFeedback: 'Old feedback',
          totalCorrect: 0,
          totalQuestions: 1,
          scaledScore: 6.0,
        },
      });

      fireEvent.click(screen.getByTestId('rsp-tab-feedback'));

      await waitFor(() => {
        expect(screen.getByTestId('fb-ai-analysis')).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(mockGenerateFormativeFeedbackForSavedResult).toHaveBeenCalledWith(
          'res-thcs',
          expect.objectContaining({
            forceAiUpgrade: true,
            triggerSource: 'ResultSlidePanel:auto-upgrade',
          }),
        );
      });
    });

    it('should auto-upgrade stored feedback when question explanations are weak legacy scaffolding', async () => {
      render(<ResultSlidePanel resultId="res-thcs" onClose={mockOnClose} />);
      emitResultSnapshot('res-thcs', {
        ...MOCK_THCS_RESULT,
        testId: 'test-thcs',
        studentId: 'student-1',
        timeElapsed: 900,
        questionResults: [
          {
            questionNumber: 1,
            questionType: 'mcq-grammar',
            isCorrect: false,
            score: 0,
            maxScore: 1,
            studentAnswer: 'D',
            correctAnswer: 'B',
            feedback: '',
          },
        ],
        thcsData: {
          scaledScore: 6.0,
          sectionResults: [
            {
              sectionId: 'grammar',
              sectionName: 'Grammar',
              pointsEarned: 0,
              pointsMax: 1,
              correctCount: 0,
              totalCount: 1,
              percentage: 0,
              intentBreakdown: {
                mcq_grammar: { correct: 0, total: 1 },
              },
            },
          ],
          intentBreakdown: {
            mcq_grammar: { correct: 0, total: 1 },
          },
        },
        formativeFeedback: {
          aiFeedback: {
            summary: 'Old summary',
            strengths: '',
            revision: 'Old revision',
            critical: 'Old critical',
          },
          questionExplanations: {
            '1': 'You chose "D", but the correct answer is "B". Review the grammar rule or vocabulary pattern behind this question and try again with similar exercises.',
          },
          studyRecommendations: [
            {
              skillTag: 'Grammar',
              questionNumbers: [1],
              guidance: 'Work on grammar.',
              resources: [
                {
                  bookTitle: 'English Grammar in Use (5th Edition)',
                  author: 'Raymond Murphy',
                  sectionTitle: 'Unit 1',
                  reason: 'Review the basics.',
                },
              ],
            },
          ],
          analysis: { strengths: [], revision: [], critical: [] },
          deterministicFeedback: 'Old feedback',
          totalCorrect: 0,
          totalQuestions: 1,
          scaledScore: 6.0,
        },
      });

      fireEvent.click(screen.getByTestId('rsp-tab-feedback'));

      await waitFor(() => {
        expect(screen.getByTestId('fb-ai-analysis')).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(mockGenerateFormativeFeedbackForSavedResult).toHaveBeenCalledWith(
          'res-thcs',
          expect.objectContaining({
            forceAiUpgrade: true,
            triggerSource: 'ResultSlidePanel:auto-upgrade',
          }),
        );
      });
    });

    it('should keep deterministic feedback visible but expose AI upgrade for saved fallback content', async () => {
      render(<ResultSlidePanel resultId="res-thcs" onClose={mockOnClose} />);
      emitResultSnapshot('res-thcs', {
        ...MOCK_THCS_RESULT,
        testId: 'test-thcs',
        studentId: 'student-1',
        timeElapsed: 900,
        questionResults: [
          {
            questionNumber: 1,
            questionType: 'mcq-grammar',
            isCorrect: false,
            score: 0,
            maxScore: 1,
            studentAnswer: 'D',
            correctAnswer: 'B',
            feedback: '',
          },
        ],
        thcsData: {
          scaledScore: 6.0,
          sectionResults: [
            {
              sectionId: 'grammar',
              sectionName: 'Grammar',
              pointsEarned: 0,
              pointsMax: 1,
              correctCount: 0,
              totalCount: 1,
              percentage: 0,
              intentBreakdown: {
                mcq_grammar: { correct: 0, total: 1 },
              },
            },
          ],
          intentBreakdown: {
            mcq_grammar: { correct: 0, total: 1 },
          },
        },
        formativeFeedback: {
          analysis: { strengths: [], revision: [], critical: [] },
          deterministicFeedback: 'Base explanation only',
          questionExplanations: {
            '1': 'You chose "D", but the correct answer is "B". Review the grammar rule or vocabulary pattern behind this question and try again with similar exercises.',
          },
          totalCorrect: 0,
          totalQuestions: 1,
          scaledScore: 6.0,
        },
      });

      fireEvent.click(screen.getByTestId('rsp-tab-feedback'));

      await waitFor(() => {
        expect(screen.getByTestId('fb-feedback-stored')).toBeInTheDocument();
      });

      expect(screen.getByText(/still needs an AI upgrade/i)).toBeInTheDocument();
      expect(screen.getByText('Retry AI Feedback')).toBeInTheDocument();
      await waitFor(() => {
        expect(mockGenerateFormativeFeedbackForSavedResult).toHaveBeenCalledWith(
          'res-thcs',
          expect.objectContaining({
            forceAiUpgrade: true,
            triggerSource: 'ResultSlidePanel:auto-upgrade',
          }),
        );
      });
    });

    it('should auto-upgrade weak stored feedback even for generic non-IELTS results', async () => {
      render(<ResultSlidePanel resultId="res-generic" onClose={mockOnClose} />);
      emitResultSnapshot('res-generic', {
        ...MOCK_GENERIC_RESULT,
        questionResults: [
          { questionNumber: 1, questionType: 'mcq-grammar', isCorrect: false, score: 0, maxScore: 1, studentAnswer: '', correctAnswer: 'D' },
        ],
        formativeFeedback: {
          analysis: { strengths: [], revision: [], critical: [] },
          deterministicFeedback: 'Base explanation only',
          questionExplanations: {
            '1': 'You did not answer this question. The correct answer is "D". Review the grammar rule or vocabulary pattern behind this question and try again with similar exercises.',
          },
          totalCorrect: 0,
          totalQuestions: 1,
          scaledScore: 2,
          generatedAt: Date.now(),
          aiFeedback: {
            summary: 'Summary exists',
            strengths: '',
            revision: '',
            critical: '',
          },
          generationMode: 'ai',
        },
      });

      await waitFor(() => {
        expect(mockGenerateFormativeFeedbackForSavedResult).toHaveBeenCalledWith(
          'res-generic',
          expect.objectContaining({
            forceAiUpgrade: true,
            triggerSource: 'ResultSlidePanel:auto-upgrade',
          }),
        );
      });
    });
  });

  describe('Live-session release governance', () => {
    it('does not keep historical waiting-session results under live-session governance', async () => {
      render(<ResultSlidePanel resultId="res-live" onClose={mockOnClose} />);
      emitResultSnapshot('res-live', MOCK_LIVE_SESSION_THCS_RESULT);

      await waitFor(() => {
        expect(listenerRegistry.has('game_sessions/live-session-1')).toBe(true);
      });

      emitSessionSnapshot('live-session-1', {
        status: 'waiting',
        lastTestId: 'test-live',
        lastTestCompletedAt: Date.now(),
        players: {
          'student-1': {
            name: 'Student 1',
            latestResultId: 'res-live',
          },
        },
      });

      await waitFor(() => {
        expect(screen.getByTestId('rsp-tab-review')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('rsp-release-notice-locked-review')).not.toBeInTheDocument();
      expect(screen.getByTestId('rsp-tab-feedback')).toBeInTheDocument();
    });

    it('locks live-session saved results to the overview tab until review is released', async () => {
      render(<ResultSlidePanel resultId="res-live" onClose={mockOnClose} />);
      emitResultSnapshot('res-live', MOCK_LIVE_SESSION_THCS_RESULT);

      await waitFor(() => {
        expect(listenerRegistry.has('game_sessions/live-session-1')).toBe(true);
      });

      emitSessionSnapshot('live-session-1', {
        status: 'in-progress',
        testId: 'test-live',
        reviewReleaseState: 'locked-review',
      });

      await waitFor(() => {
        expect(screen.getByTestId('rsp-release-notice-locked-review')).toBeInTheDocument();
      });

      expect(screen.getByTestId('rsp-tab-overview')).toBeInTheDocument();
      expect(screen.queryByTestId('rsp-tab-review')).not.toBeInTheDocument();
      expect(screen.queryByTestId('rsp-tab-feedback')).not.toBeInTheDocument();
      expect(mockGenerateFormativeFeedbackForSavedResult).not.toHaveBeenCalled();
    });

    it('shows answer review but still withholds feedback for review-released live-session results', async () => {
      render(<ResultSlidePanel resultId="res-live" onClose={mockOnClose} />);
      emitResultSnapshot('res-live', MOCK_LIVE_SESSION_THCS_RESULT);

      await waitFor(() => {
        expect(listenerRegistry.has('game_sessions/live-session-1')).toBe(true);
      });

      emitSessionSnapshot('live-session-1', {
        status: 'in-progress',
        testId: 'test-live',
        reviewReleaseState: 'review-released',
      });

      await waitFor(() => {
        expect(screen.getByTestId('rsp-release-notice-review-released')).toBeInTheDocument();
      });

      expect(screen.getByTestId('rsp-tab-review')).toBeInTheDocument();
      expect(screen.queryByTestId('rsp-tab-feedback')).not.toBeInTheDocument();
      expect(mockGenerateFormativeFeedbackForSavedResult).not.toHaveBeenCalled();
    });

    it('enables feedback generation only after the live-session reaches feedback release', async () => {
      render(<ResultSlidePanel resultId="res-live" onClose={mockOnClose} />);
      emitResultSnapshot('res-live', MOCK_LIVE_SESSION_THCS_RESULT);

      await waitFor(() => {
        expect(listenerRegistry.has('game_sessions/live-session-1')).toBe(true);
      });

      emitSessionSnapshot('live-session-1', {
        status: 'in-progress',
        testId: 'test-live',
        reviewReleaseState: 'feedback-released',
      });

      await waitFor(() => {
        expect(screen.getByTestId('rsp-tab-feedback')).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(mockGenerateFormativeFeedbackForSavedResult).toHaveBeenCalled();
      });
    });

    it('fails closed when the live-session release state cannot be loaded', async () => {
      render(<ResultSlidePanel resultId="res-live" onClose={mockOnClose} />);
      emitResultSnapshot('res-live', MOCK_LIVE_SESSION_THCS_RESULT);

      await waitFor(() => {
        expect(listenerRegistry.has('game_sessions/live-session-1')).toBe(true);
      });

      emitSessionError('live-session-1', new Error('Permission denied'));

      await waitFor(() => {
        expect(screen.getByTestId('rsp-release-notice-locked-review')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('rsp-tab-review')).not.toBeInTheDocument();
      expect(screen.queryByTestId('rsp-tab-feedback')).not.toBeInTheDocument();
      expect(mockGenerateFormativeFeedbackForSavedResult).not.toHaveBeenCalled();
    });
  });

  describe('Legacy saved-result context handling', () => {
    it('does not treat a saved result with missing context.type as live-session governed', async () => {
      render(<ResultSlidePanel resultId="res-legacy-context" onClose={mockOnClose} />);
      emitResultSnapshot('res-legacy-context', MOCK_LEGACY_CONTEXT_RESULT);

      await waitFor(() => {
        expect(screen.getByText('Grammar Progress Check')).toBeInTheDocument();
      });

      expect(listenerRegistry.has('game_sessions/legacy-session')).toBe(false);
      expect(screen.queryByTestId('rsp-release-notice-locked-review')).not.toBeInTheDocument();
      expect(screen.getByTestId('rsp-tab-review')).toBeInTheDocument();
      expect(screen.getByTestId('rsp-tab-feedback')).toBeInTheDocument();
    });
  });

  describe('FR-035 Access-Lost Behavior (Task 3.3)', () => {
    it('shows access-lost state when RTDB returns PERMISSION_DENIED on initial load', async () => {
      render(<ResultSlidePanel resultId="res-1" onClose={mockOnClose} />);

      // Simulate PERMISSION_DENIED error from RTDB
      emitResultError('res-1', new Error('PERMISSION_DENIED: Permission denied'));

      await waitFor(() => {
        expect(screen.getByTestId('rsp-access-lost')).toBeInTheDocument();
      });

      expect(screen.getByText('Access Revoked')).toBeInTheDocument();
      expect(screen.getByText(/no longer have access/i)).toBeInTheDocument();
    });

    it('clears result data on PERMISSION_DENIED after initial load', async () => {
      render(<ResultSlidePanel resultId="res-1" onClose={mockOnClose} />);

      // First: load successfully
      emitResultSnapshot('res-1', MOCK_RESULT);

      await waitFor(() => {
        expect(screen.getByText('IELTS Reading Practice Test 3')).toBeInTheDocument();
      });

      // Then: simulate a PERMISSION_DENIED (access revoked while viewing)
      emitResultError('res-1', new Error('PERMISSION_DENIED'));

      await waitFor(() => {
        expect(screen.getByTestId('rsp-access-lost')).toBeInTheDocument();
      });

      // Result data should be cleared — test title should not be visible
      expect(screen.queryByText('IELTS Reading Practice Test 3')).not.toBeInTheDocument();
    });

    it('does NOT show access-lost for non-permission errors', async () => {
      render(<ResultSlidePanel resultId="res-1" onClose={mockOnClose} />);

      // Simulate a generic network error (not permission denied)
      mockGetTestResult.mockRejectedValue(new Error('Network error'));
      emitResultError('res-1', new Error('client_offline'));

      await waitFor(() => {
        // Should show regular error, not access-lost
        expect(screen.queryByTestId('rsp-access-lost')).not.toBeInTheDocument();
      });
    });
  });
});
