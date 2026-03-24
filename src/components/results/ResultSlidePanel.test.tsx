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

const MOCK_REVIEWABLE_RESULT = {
  ...MOCK_THCS_RESULT,
  resultId: 'res-review',
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

/**
 * Helper to simulate onValue calling the success callback
 */
function simulateOnValueSuccess(data: any) {
  const successCb = mockOnValue.mock.calls[0]?.[1];
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
function simulateOnValueError(error: any) {
  const errorCb = mockOnValue.mock.calls[0]?.[2];
  if (errorCb) {
    act(() => {
      errorCb(error);
    });
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ResultSlidePanel — PRD-0039 Task 5.11', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
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
    // Default: onValue returns an unsubscribe fn
    mockOnValue.mockReturnValue(vi.fn());
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
      simulateOnValueSuccess(MOCK_RESULT);

      expect(screen.getByText('IELTS Reading Practice Test 3')).toBeInTheDocument();
      expect(screen.getByText('IELTS Reading')).toBeInTheDocument();
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
      simulateOnValueSuccess(MOCK_RESULT);

      expect(screen.getByTestId('rsp-header-attempt')).toHaveTextContent('Attempt 2 of 2');
      expect(screen.getByTestId('rsp-header-attempt')).toHaveTextContent('+13% improvement');
    });

    it('should display THCS badge for THCS test types', () => {
      render(<ResultSlidePanel resultId="res-thcs" onClose={mockOnClose} />);
      simulateOnValueSuccess(MOCK_THCS_RESULT);

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
      simulateOnValueSuccess(MOCK_RESULT);

      rerender(<ResultSlidePanel resultId="res-2" onClose={mockOnClose} />);

      const latestRefArg = mockOnValue.mock.calls.at(-1)?.[0];
      expect(latestRefArg.path).toBe('test_results/res-2');
    });
  });

  describe('Tab switch (Task 5.11c)', () => {
    it('should default to Overview tab', () => {
      render(<ResultSlidePanel resultId="res-1" onClose={mockOnClose} />);
      simulateOnValueSuccess(MOCK_RESULT);

      const overviewTab = screen.getByTestId('rsp-tab-overview');
      expect(overviewTab.className).toContain('rsp-tab--active');
    });

    it('should switch to Review Mistakes tab when clicked', () => {
      render(<ResultSlidePanel resultId="res-1" onClose={mockOnClose} />);
      simulateOnValueSuccess(MOCK_RESULT);

      fireEvent.click(screen.getByTestId('rsp-tab-review'));

      expect(screen.getByTestId('rsp-tab-review').className).toContain('rsp-tab--active');
      expect(screen.getByTestId('rsp-tab-overview').className).not.toContain('rsp-tab--active');
    });

    it('should switch to Feedback tab when clicked', () => {
      render(<ResultSlidePanel resultId="res-1" onClose={mockOnClose} />);
      simulateOnValueSuccess(MOCK_RESULT);

      fireEvent.click(screen.getByTestId('rsp-tab-feedback'));

      expect(screen.getByTestId('rsp-tab-feedback').className).toContain('rsp-tab--active');
    });

    it('should jump from an incorrect overview pill to the matching review card', async () => {
      const scrollIntoView = vi.fn();
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        value: scrollIntoView,
      });

      render(<ResultSlidePanel resultId="res-review" onClose={mockOnClose} />);
      simulateOnValueSuccess(MOCK_REVIEWABLE_RESULT);

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
      simulateOnValueError(new Error('RTDB listener error'));

      await waitFor(() => {
        expect(screen.getByText('Could not load result. Please try again.')).toBeInTheDocument();
      });

      // Retry button should be present
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });

    it('should show error when result is null', () => {
      render(<ResultSlidePanel resultId="res-1" onClose={mockOnClose} />);
      simulateOnValueSuccess(null);

      expect(screen.getByText('Result not found.')).toBeInTheDocument();
    });

    it('should retry loading when Retry button is clicked', async () => {
      mockGetTestResult.mockResolvedValueOnce(MOCK_RESULT);

      render(<ResultSlidePanel resultId="res-1" onClose={mockOnClose} />);
      simulateOnValueSuccess(null); // triggers "not found" error

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
    it('does not auto-trigger formative feedback for IELTS results without existing feedback', async () => {
      render(<ResultSlidePanel resultId="res-1" onClose={mockOnClose} />);
      simulateOnValueSuccess({
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

      expect(mockGenerateFormativeFeedbackForSavedResult).not.toHaveBeenCalled();
    });

    it('allows manual retry for IELTS results without stored feedback', async () => {
      render(<ResultSlidePanel resultId="res-1" onClose={mockOnClose} />);
      simulateOnValueSuccess({
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
      });

      fireEvent.click(screen.getByTestId('rsp-tab-feedback'));

      await waitFor(() => {
        expect(screen.getByTestId('fb-feedback-missing')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Retry AI Feedback'));

      await waitFor(() => {
        expect(mockGenerateFormativeFeedbackForSavedResult).toHaveBeenCalledWith('res-1', { forceAiUpgrade: true });
      });
    });

    it('should auto-upgrade stored AI feedback when question explanations are still missing', async () => {
      render(<ResultSlidePanel resultId="res-thcs" onClose={mockOnClose} />);
      simulateOnValueSuccess({
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
        expect(mockGenerateFormativeFeedbackForSavedResult).toHaveBeenCalledWith('res-thcs', { forceAiUpgrade: true });
      });
    });

    it('should auto-upgrade stored feedback when question explanations are weak legacy scaffolding', async () => {
      render(<ResultSlidePanel resultId="res-thcs" onClose={mockOnClose} />);
      simulateOnValueSuccess({
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
        expect(mockGenerateFormativeFeedbackForSavedResult).toHaveBeenCalledWith('res-thcs', { forceAiUpgrade: true });
      });
    });

    it('should keep deterministic feedback visible but expose AI upgrade for saved fallback content', async () => {
      render(<ResultSlidePanel resultId="res-thcs" onClose={mockOnClose} />);
      simulateOnValueSuccess({
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
        expect(mockGenerateFormativeFeedbackForSavedResult).toHaveBeenCalledWith('res-thcs', { forceAiUpgrade: true });
      });
    });

    it('should auto-upgrade weak stored feedback even for generic non-IELTS results', async () => {
      render(<ResultSlidePanel resultId="res-generic" onClose={mockOnClose} />);
      simulateOnValueSuccess({
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
        expect(mockGenerateFormativeFeedbackForSavedResult).toHaveBeenCalledWith('res-generic', { forceAiUpgrade: true });
      });
    });
  });

  describe('FR-035 Access-Lost Behavior (Task 3.3)', () => {
    it('shows access-lost state when RTDB returns PERMISSION_DENIED on initial load', async () => {
      render(<ResultSlidePanel resultId="res-1" onClose={mockOnClose} />);

      // Simulate PERMISSION_DENIED error from RTDB
      simulateOnValueError(new Error('PERMISSION_DENIED: Permission denied'));

      await waitFor(() => {
        expect(screen.getByTestId('rsp-access-lost')).toBeInTheDocument();
      });

      expect(screen.getByText('Access Revoked')).toBeInTheDocument();
      expect(screen.getByText(/no longer have access/i)).toBeInTheDocument();
    });

    it('clears result data on PERMISSION_DENIED after initial load', async () => {
      render(<ResultSlidePanel resultId="res-1" onClose={mockOnClose} />);

      // First: load successfully
      simulateOnValueSuccess(MOCK_RESULT);

      await waitFor(() => {
        expect(screen.getByText('IELTS Reading Practice Test 3')).toBeInTheDocument();
      });

      // Then: simulate a PERMISSION_DENIED (access revoked while viewing)
      simulateOnValueError(new Error('PERMISSION_DENIED'));

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
      simulateOnValueError(new Error('client_offline'));

      await waitFor(() => {
        // Should show regular error, not access-lost
        expect(screen.queryByTestId('rsp-access-lost')).not.toBeInTheDocument();
      });
    });
  });
});
