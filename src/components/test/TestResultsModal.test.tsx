import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const {
  mockGetStudentSessionResult,
  mockGetStudentResults,
  mockGetTestResult,
  mockGeneratePerformanceFeedback,
  mockGetPlayerId,
  mockGet,
} = vi.hoisted(() => ({
  mockGetStudentSessionResult: vi.fn(),
  mockGetStudentResults: vi.fn(),
  mockGetTestResult: vi.fn(),
  mockGeneratePerformanceFeedback: vi.fn(),
  mockGetPlayerId: vi.fn(),
  mockGet: vi.fn(),
}));

vi.mock('@mantine/core', () => ({
  Modal: ({ opened, title, children }: any) => (
    opened ? (
      <div data-testid="test-results-modal">
        <div>{title}</div>
        {children}
      </div>
    ) : null
  ),
  Center: ({ children }: any) => <div>{children}</div>,
  Loader: () => <div>Loading...</div>,
  ScrollArea: ({ children }: any) => <div>{children}</div>,
  Text: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('../../services/testResults.service', () => ({
  getStudentSessionResult: (...args: any[]) => mockGetStudentSessionResult(...args),
  getStudentResults: (...args: any[]) => mockGetStudentResults(...args),
  getTestResult: (...args: any[]) => mockGetTestResult(...args),
}));

vi.mock('../../services/autoMarking.service', () => ({
  calculateBandScore: vi.fn(() => 6.5),
  generatePerformanceFeedback: (...args: any[]) => mockGeneratePerformanceFeedback(...args),
}));

vi.mock('../../services/sessionService', () => ({
  sessionService: {
    getPlayerId: (...args: any[]) => mockGetPlayerId(...args),
  },
}));

vi.mock('firebase/database', () => ({
  ref: vi.fn((_database: any, path: string) => path),
  get: (...args: any[]) => mockGet(...args),
}));

vi.mock('../../services/firebase', () => ({
  database: {},
}));

import { TestResultsModal } from './TestResultsModal';

const MOCK_RESULT = {
  resultId: 'result-1',
  sessionCode: 'SESSION-1',
  studentId: 'student-1',
  testTitle: 'THCS Grammar Review',
  testType: 'THCS-THPT',
  testSkill: 'grammar',
  percentage: 72,
  totalScore: 18,
  maxScore: 25,
  correct: 3,
  incorrect: 1,
  partialCredit: 1,
  questionResults: [
    {
      questionNumber: 1,
      isCorrect: true,
      score: 1,
      maxScore: 1,
      studentAnswer: 'A',
      correctAnswer: 'A',
      feedback: 'Solid answer.',
    },
    {
      questionNumber: 2,
      isCorrect: false,
      score: 0,
      maxScore: 1,
      studentAnswer: 'B',
      correctAnswer: 'C',
      feedback: 'Review the grammar cue.',
    },
  ],
  thcsData: {
    scaledScore: 7.2,
    sectionResults: [
      {
        sectionTitle: 'Grammar',
        totalPoints: 8,
        maxPoints: 10,
      },
    ],
    intentBreakdown: {
      grammar: { correct: 3, total: 4 },
    },
  },
};

describe('TestResultsModal release governance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPlayerId.mockReturnValue('student-1');
    mockGetStudentSessionResult.mockResolvedValue(MOCK_RESULT);
    mockGetStudentResults.mockResolvedValue([MOCK_RESULT]);
    mockGetTestResult.mockResolvedValue(MOCK_RESULT);
    mockGeneratePerformanceFeedback.mockReturnValue('Mock tutor feedback');
    mockGet.mockResolvedValue({
      exists: () => false,
      val: () => null,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('keeps THCS breakdown, correct answers, and feedback hidden in locked review', async () => {
    render(
      <TestResultsModal
        opened
        onClose={vi.fn()}
        sessionCode="SESSION-1"
        reviewReleaseState="locked-review"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('THCS Grammar Review')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Question 2'));

    expect(screen.queryByText('Grammar')).not.toBeInTheDocument();
    expect(screen.queryByText('Correct Key')).not.toBeInTheDocument();
    expect(screen.queryByText(/Result:/)).not.toBeInTheDocument();
    expect(screen.queryByText('Mock tutor feedback')).not.toBeInTheDocument();
    expect(screen.getAllByText('Tap to view your answer').length).toBeGreaterThan(0);
  });

  it('releases review detail but keeps feedback hidden in review-released', async () => {
    render(
      <TestResultsModal
        opened
        onClose={vi.fn()}
        sessionCode="SESSION-1"
        reviewReleaseState="review-released"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('THCS Grammar Review')).toBeInTheDocument();
    });

    expect(screen.getByText('Grammar')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Question 2'));

    expect(screen.getByText('Correct Key')).toBeInTheDocument();
    expect(screen.getAllByText(/Result:/).length).toBeGreaterThan(0);
    expect(screen.queryByText('Tap to view your answer')).not.toBeInTheDocument();
    expect(screen.queryByText('Mock tutor feedback')).not.toBeInTheDocument();
  });

  it('releases feedback only in feedback-released', async () => {
    render(
      <TestResultsModal
        opened
        onClose={vi.fn()}
        sessionCode="SESSION-1"
        reviewReleaseState="feedback-released"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Mock tutor feedback')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Question 2'));

    expect(screen.getByText('Explanation')).toBeInTheDocument();
    expect(screen.getByText('Review the grammar cue.')).toBeInTheDocument();
  });

  it('stops background retry timers when the modal is closed', async () => {
    vi.useFakeTimers();

    try {
      mockGetStudentSessionResult.mockResolvedValueOnce(null);
      mockGetStudentResults.mockResolvedValueOnce([]);

      const { rerender } = render(
        <TestResultsModal
          opened
          onClose={vi.fn()}
          sessionCode="SESSION-1"
          reviewReleaseState="review-released"
        />,
      );

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(mockGetStudentSessionResult).toHaveBeenCalledTimes(1);

      rerender(
        <TestResultsModal
          opened={false}
          onClose={vi.fn()}
          sessionCode="SESSION-1"
          reviewReleaseState="review-released"
        />,
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });

      expect(mockGetStudentSessionResult).toHaveBeenCalledTimes(1);
      expect(mockGetStudentResults).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses the player latestResultId pointer when session and student indexes miss', async () => {
    mockGetStudentSessionResult.mockResolvedValueOnce(null);
    mockGetStudentResults.mockResolvedValueOnce([]);
    mockGet.mockResolvedValueOnce({
      exists: () => true,
      val: () => ({
        latestResultId: 'result-direct',
        lastTestId: 'test-1',
      }),
    });
    mockGetTestResult.mockResolvedValueOnce({
      ...MOCK_RESULT,
      resultId: 'result-direct',
    });

    render(
      <TestResultsModal
        opened
        onClose={vi.fn()}
        sessionCode="SESSION-1"
        reviewReleaseState="review-released"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('THCS Grammar Review')).toBeInTheDocument();
    });

    expect(mockGetTestResult).toHaveBeenCalledWith('result-direct');
  });

  it('renders a safe empty state when the result has no questionResults array', async () => {
    mockGetStudentSessionResult.mockResolvedValueOnce({
      ...MOCK_RESULT,
      testSkill: 'writing',
      questionResults: undefined,
    });

    render(
      <TestResultsModal
        opened
        onClose={vi.fn()}
        sessionCode="SESSION-1"
        reviewReleaseState="review-released"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('THCS Grammar Review')).toBeInTheDocument();
    });

    expect(
      screen.getByText('This writing submission does not include a per-question breakdown. Your writing result is saved, and detailed grading will appear once review is available.')
    ).toBeInTheDocument();
  });
});
