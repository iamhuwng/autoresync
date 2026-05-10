/**
 * SharedSavedResultCore Tests — PRD-0040 Task 2.2
 *
 * Tests the presentation-only shared core component:
 * 1. Renders score summary via OverviewTab
 * 2. Renders question review via ReviewTab
 * 3. Renders feedback display via FeedbackTab
 * 4. Respects sections prop to show/hide sections
 * 5. Renders teacher feedback when teacherFeedback section enabled
 * 6. Renders writing placeholder when writingPlaceholder section enabled
 * 7. Renders empty state when no question results
 * 8. Respects feedbackTiming='never' to hide detailed sections
 * 9. Handles legacy results with missing fields gracefully
 * 10. Passes variant to root element
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import React from 'react';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

const {
  mockGetHistoricalScores,
  mockGetClassTestScores,
} = vi.hoisted(() => {
  const mockGetHistoricalScores = vi.fn();
  const mockGetClassTestScores = vi.fn();
  return { mockGetHistoricalScores, mockGetClassTestScores };
});

// ─── Mock firebase ──────────────────────────────────────────────────────────

vi.mock('firebase/database', () => ({
  ref: vi.fn((_db: any, path: string) => ({ path })),
  onValue: vi.fn(() => vi.fn()),
  get: vi.fn(),
}));

vi.mock('../../services/firebase', () => ({
  database: {},
  db: {},
}));

// ─── Mock testResults.service ───────────────────────────────────────────────

vi.mock('../../services/testResults.service', () => ({
  getTestResult: vi.fn(),
  getHistoricalScores: mockGetHistoricalScores,
  getClassTestScores: mockGetClassTestScores,
  TestResultRecord: {},
}));

// ─── Mock formative feedback service ────────────────────────────────────────

vi.mock('../../services/formativeFeedback.service', () => ({
  needsAiFeedbackUpgrade: vi.fn(() => false),
  getPreferredQuestionExplanation: vi.fn(() => null),
  getRenderableQuestionExplanations: vi.fn(() => ({})),
}));

// ─── Mock useScreenSize ─────────────────────────────────────────────────────

vi.mock('@/core/platform', () => ({
  useScreenSize: () => ({ isMobile: false, isTablet: false, isDesktop: true, width: 1200, height: 800 }),
}));

// ─── Mock hooks used by FeedbackTab ─────────────────────────────────────────

vi.mock('../../hooks/useHistoricalScores', () => ({
  useHistoricalScores: () => ({ scores: [], loading: false }),
}));

vi.mock('../../hooks/useClassPosition', () => ({
  useClassPosition: () => ({ average: null, totalStudents: 0, position: null, loading: false }),
}));

// ─── Mock CSS imports ───────────────────────────────────────────────────────

vi.mock('./OverviewTab.css', () => ({}));
vi.mock('./ReviewTab.css', () => ({}));
vi.mock('./FeedbackTab.css', () => ({}));
vi.mock('./ResultContextBadge.css', () => ({}));

// ─── Import component under test ────────────────────────────────────────────

import { SharedSavedResultCore } from './SharedSavedResultCore';

// ─── Test data ──────────────────────────────────────────────────────────────

const MOCK_RESULT: any = {
  resultId: 'res-core-1',
  testTitle: 'IELTS Reading Practice Test 3',
  testType: 'reading',
  testSkill: 'reading',
  percentage: 85,
  totalScore: 17,
  maxScore: 20,
  submittedAt: 1710921600000,
  createdAt: 1710921600000,
  correct: 17,
  incorrect: 3,
  totalQuestions: 20,
  bandScore: 7.0,
  questionResults: [
    { questionNumber: 1, questionType: 'multiple-choice', isCorrect: true, score: 1, maxScore: 1, studentAnswer: 'A', correctAnswer: 'A' },
    { questionNumber: 2, questionType: 'multiple-choice', isCorrect: false, score: 0, maxScore: 1, studentAnswer: 'B', correctAnswer: 'C' },
    { questionNumber: 3, questionType: 'multiple-choice', isCorrect: true, score: 1, maxScore: 1, studentAnswer: 'C', correctAnswer: 'C' },
  ],
};

const MOCK_RESULT_WITH_TEACHER_FEEDBACK: any = {
  ...MOCK_RESULT,
  resultId: 'res-core-tf',
  overallFeedback: 'Great work on reading comprehension!',
  feedbackUpdatedBy: 'Ms. Nguyen',
  feedbackUpdatedAt: 1710925200000,
  questionResults: [
    { questionNumber: 1, questionType: 'multiple-choice', isCorrect: true, score: 1, maxScore: 1, studentAnswer: 'A', correctAnswer: 'A' },
    { questionNumber: 2, questionType: 'multiple-choice', isCorrect: false, score: 0, maxScore: 1, studentAnswer: 'B', correctAnswer: 'C', teacherFeedback: 'Review passage 2 again' },
  ],
};

const MOCK_RESULT_WITH_WRITING: any = {
  ...MOCK_RESULT,
  resultId: 'res-core-w',
  testSkill: 'writing',
  writingSubmission: { text: 'Sample essay text', wordCount: 250 },
  markingStatus: 'pending-review',
};

const MOCK_LEGACY_RESULT: any = {
  resultId: 'res-legacy',
  testTitle: 'Old Test',
  testType: 'unknown',
  testSkill: '',
  percentage: 50,
  totalScore: 5,
  maxScore: 10,
  submittedAt: 1600000000000,
  createdAt: 1600000000000,
  correct: 5,
  incorrect: 5,
  totalQuestions: 10,
  // Missing: bandScore, thcsData, ieltsData, formativeFeedback, questionResults
};

const MOCK_READING_V2_RESULT: any = {
  ...MOCK_RESULT,
  resultId: 'res-reading-v2',
  deliveryEngine: 'reading-v2',
  testType: 'ielts-reading-v2',
  readingV2: {
    result: {
      resultId: 'res-reading-v2',
      deliveryEngine: 'reading-v2',
      publishedSnapshotVersion: 'snapshot-v2',
      interactions: [],
    },
    reviewPayload: {
      deliveryEngine: 'reading-v2',
      schemaVersion: 1,
      resultId: 'res-reading-v2',
      sourceSnapshotVersionId: 'snapshot-v2',
      title: 'Reading V2 Saved Result',
      taskGroups: [
        {
          taskGroupId: 'task-group-1',
          title: 'Questions 1-2',
          officialTaskType: 'sentence-completion',
          engineeringFamily: 'completion',
          instructionText: 'Complete the sentences.',
          interactions: [
            {
              interactionId: 'interaction-1',
              taskGroupId: 'task-group-1',
              displayNumber: 1,
              taskFamily: 'completion',
              officialTaskType: 'sentence-completion',
              studentAnswer: 'wrong',
              correctAnswer: 'answer one',
              score: 0,
              maxScore: 1,
              reviewState: 'released',
            },
          ],
        },
      ],
    },
    regradeArtifacts: [],
  },
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('SharedSavedResultCore — PRD-0040 Task 2.2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetHistoricalScores.mockResolvedValue([]);
    mockGetClassTestScores.mockResolvedValue([]);
  });

  it('renders the shared core root with data-variant attribute', () => {
    render(
      <SharedSavedResultCore result={MOCK_RESULT} variant="slide-panel" />,
    );
    const root = screen.getByTestId('shared-saved-result-core');
    expect(root).toBeInTheDocument();
    expect(root).toHaveAttribute('data-variant', 'slide-panel');
  });

  it('renders OverviewTab with score summary', () => {
    render(
      <SharedSavedResultCore result={MOCK_RESULT} variant="slide-panel" />,
    );
    // OverviewTab renders ov-root
    expect(screen.getByTestId('ov-root')).toBeInTheDocument();
    // Score header is visible
    expect(screen.getByTestId('ov-score-header')).toBeInTheDocument();
  });

  it('renders ReviewTab with question review cards', () => {
    render(
      <SharedSavedResultCore result={MOCK_RESULT} variant="modal" />,
    );
    // ReviewTab renders incorrect banner for results with incorrect questions
    expect(screen.getByTestId('rv-incorrect-banner')).toBeInTheDocument();
  });

  it('routes Reading V2 saved results to the grouped review adapter instead of legacy ReviewTab', () => {
    render(
      <SharedSavedResultCore result={MOCK_READING_V2_RESULT} variant="modal" />,
    );

    expect(screen.getByTestId('reading-v2-review-adapter')).toBeInTheDocument();
    expect(screen.queryByTestId('rv-incorrect-banner')).not.toBeInTheDocument();
    expect(screen.getByText('Reading V2 Saved Result')).toBeInTheDocument();
  });

  it('hides ReviewTab when feedbackTiming is never', () => {
    render(
      <SharedSavedResultCore
        result={MOCK_RESULT}
        variant="modal"
        feedbackTiming="never"
      />,
    );
    // ReviewTab should not render
    expect(screen.queryByTestId('rv-incorrect-banner')).not.toBeInTheDocument();
  });

  it('hides FeedbackTab when feedbackTiming is never', () => {
    render(
      <SharedSavedResultCore
        result={MOCK_RESULT}
        variant="modal"
        feedbackTiming="never"
      />,
    );
    // FeedbackTab renders fb-root — should not be present
    expect(screen.queryByTestId('fb-no-analysis')).not.toBeInTheDocument();
  });

  it('renders teacher overall feedback when section enabled', () => {
    render(
      <SharedSavedResultCore
        result={MOCK_RESULT_WITH_TEACHER_FEEDBACK}
        variant="full-page"
        sections={{ teacherFeedback: true }}
      />,
    );
    expect(screen.getByTestId('ssrc-teacher-overall-feedback')).toBeInTheDocument();
    expect(screen.getByTestId('teacher-feedback-overall')).toBeInTheDocument();
    expect(screen.getByText('Great work on reading comprehension!')).toBeInTheDocument();
  });

  it('does not render teacher feedback by default', () => {
    render(
      <SharedSavedResultCore
        result={MOCK_RESULT_WITH_TEACHER_FEEDBACK}
        variant="slide-panel"
      />,
    );
    expect(screen.queryByTestId('ssrc-teacher-overall-feedback')).not.toBeInTheDocument();
  });

  it('renders per-question teacher feedback when section enabled', () => {
    render(
      <SharedSavedResultCore
        result={MOCK_RESULT_WITH_TEACHER_FEEDBACK}
        variant="full-page"
        sections={{ teacherFeedback: true }}
      />,
    );
    expect(screen.getByTestId('ssrc-teacher-question-feedback')).toBeInTheDocument();
    expect(screen.getByTestId('teacher-feedback-q2')).toBeInTheDocument();
    expect(screen.getByText('Review passage 2 again')).toBeInTheDocument();
  });

  it('renders writing placeholder when section enabled and submission exists', () => {
    render(
      <SharedSavedResultCore
        result={MOCK_RESULT_WITH_WRITING}
        variant="full-page"
        sections={{ writingPlaceholder: true }}
      />,
    );
    // WritingSpeakingPlaceholder renders submission info
    expect(screen.getByText('Writing Submission')).toBeInTheDocument();
  });

  it('does not render writing placeholder by default', () => {
    render(
      <SharedSavedResultCore
        result={MOCK_RESULT_WITH_WRITING}
        variant="slide-panel"
      />,
    );
    expect(screen.queryByText('Writing Submission')).not.toBeInTheDocument();
  });

  it('renders empty state when no question results and no writing', () => {
    render(
      <SharedSavedResultCore
        result={MOCK_LEGACY_RESULT}
        variant="slide-panel"
      />,
    );
    expect(screen.getByTestId('ssrc-empty-questions')).toBeInTheDocument();
    expect(screen.getByText('No question results available for this test.')).toBeInTheDocument();
  });

  it('handles legacy result with missing fields gracefully', () => {
    // Should not throw — missing bandScore, thcsData, ieltsData, formativeFeedback, questionResults
    const { container } = render(
      <SharedSavedResultCore result={MOCK_LEGACY_RESULT} variant="full-page" />,
    );
    expect(container).toBeTruthy();
    expect(screen.getByTestId('shared-saved-result-core')).toBeInTheDocument();
  });

  it('can hide overview section via sections prop', () => {
    render(
      <SharedSavedResultCore
        result={MOCK_RESULT}
        variant="slide-panel"
        sections={{ scoreSummary: false, answerMap: false, sectionBreakdown: false }}
      />,
    );
    // OverviewTab should not render since all 3 of its sections are disabled
    expect(screen.queryByTestId('ov-root')).not.toBeInTheDocument();
  });

  it('renders with modal variant spacing', () => {
    render(
      <SharedSavedResultCore result={MOCK_RESULT} variant="modal" />,
    );
    const root = screen.getByTestId('shared-saved-result-core');
    expect(root).toHaveAttribute('data-variant', 'modal');
  });

  it('renders with full-page variant spacing', () => {
    render(
      <SharedSavedResultCore result={MOCK_RESULT} variant="full-page" />,
    );
    const root = screen.getByTestId('shared-saved-result-core');
    expect(root).toHaveAttribute('data-variant', 'full-page');
  });

  it('passes feedbackState loading to OverviewTab shimmer', () => {
    render(
      <SharedSavedResultCore
        result={MOCK_RESULT}
        variant="slide-panel"
        feedbackState={{ feedbackLoading: true }}
      />,
    );
    // OverviewTab shows feedback shimmer when loading
    expect(screen.getByTestId('ov-feedback-shimmer')).toBeInTheDocument();
  });

  it('passes feedbackState error to OverviewTab', () => {
    render(
      <SharedSavedResultCore
        result={MOCK_RESULT}
        variant="slide-panel"
        feedbackState={{
          feedbackLoading: false,
          feedbackError: 'AI service unavailable',
        }}
      />,
    );
    expect(screen.getByTestId('ov-feedback-error')).toBeInTheDocument();
    // Text appears in both OverviewTab and FeedbackTab — use getAllByText
    expect(screen.getAllByText('AI service unavailable').length).toBeGreaterThanOrEqual(1);
  });

  it('renders retry button when feedbackState has error and onRetryFeedback', () => {
    const mockRetry = vi.fn();
    render(
      <SharedSavedResultCore
        result={MOCK_RESULT}
        variant="slide-panel"
        feedbackState={{
          feedbackLoading: false,
          feedbackError: 'Failed to generate',
          onRetryFeedback: mockRetry,
        }}
      />,
    );
    const retryBtn = screen.getByText('Retry');
    expect(retryBtn).toBeInTheDocument();
  });
});
