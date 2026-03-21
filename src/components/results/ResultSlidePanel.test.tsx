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
  mockGenerateFormativeFeedback,
} = vi.hoisted(() => {
  const mockOnValue = vi.fn();
  const mockGetTestResult = vi.fn();
  const mockGetHistoricalScores = vi.fn();
  const mockGetClassTestScores = vi.fn();
  const mockUseScreenSize = vi.fn();
  const mockUseTestAttempts = vi.fn();
  const mockGenerateFormativeFeedback = vi.fn();
  return {
    mockOnValue,
    mockGetTestResult,
    mockGetHistoricalScores,
    mockGetClassTestScores,
    mockUseScreenSize,
    mockUseTestAttempts,
    mockGenerateFormativeFeedback,
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

vi.mock('../../services/formativeFeedback.service', () => ({
  generateFormativeFeedback: (...args: any[]) => mockGenerateFormativeFeedback(...args),
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
    mockGenerateFormativeFeedback.mockResolvedValue(undefined);
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
    it('should auto-trigger formative feedback for IELTS results without existing feedback', async () => {
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
        expect(mockGenerateFormativeFeedback).toHaveBeenCalledTimes(1);
      });
    });
  });
});
