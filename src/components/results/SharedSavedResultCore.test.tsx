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
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

const {
  mockGetHistoricalScores,
  mockGetClassTestScores,
  mockDefaultDeliveryIssue,
} = vi.hoisted(() => {
  const mockGetHistoricalScores = vi.fn();
  const mockGetClassTestScores = vi.fn();
  const mockDefaultDeliveryIssue = vi.fn();
  return { mockGetHistoricalScores, mockGetClassTestScores, mockDefaultDeliveryIssue };
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

vi.mock('../../features/assessment/listening/adapters/listeningResultReviewDeliveryClient', () => ({
  createListeningResultReviewDeliveryIssuer: () => ({
    issue: mockDefaultDeliveryIssue,
  }),
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
    mockDefaultDeliveryIssue.mockReset();
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

  it('renders legacy Listening result-review audio through the public resolver without delivery issuance', async () => {
    const deliveryIssuer = {
      issue: vi.fn(),
    };

    render(
      <SharedSavedResultCore
        result={{
          ...MOCK_RESULT,
          resultId: 'listening-result-legacy',
          testSkill: 'listening',
          testType: 'listening',
          listeningResultReviewAudio: {
            audioUrl: 'https://pub.example.r2.dev/listening-audio/legacy.mp3',
            streamUrl: 'https://pub.example.r2.dev/listening-audio/legacy.mp3',
          },
        }}
        variant="modal"
        listeningResultReviewDeliveryIssuer={deliveryIssuer}
      />,
    );

    const audio = await screen.findByTestId('ssrc-listening-review-audio');
    expect(audio).toHaveAttribute('src', 'https://pub.example.r2.dev/listening-audio/legacy.mp3');
    expect(audio).toHaveAttribute('data-delivery-mode', 'public-r2');
    expect(deliveryIssuer.issue).not.toHaveBeenCalled();
  });

  it('does not render or request Listening audio when retained source material was removed', () => {
    const deliveryIssuer = {
      issue: vi.fn(),
    };

    render(
      <SharedSavedResultCore
        result={{
          ...MOCK_RESULT,
          resultId: 'listening-result-source-removed',
          sourceMaterialRemoved: true,
          testSkill: 'listening',
          testType: 'listening',
          listeningResultReviewAudio: {
            audioUrl: 'https://drive.google.com/file/d/legacy-audio/view',
            streamUrl: 'https://drive.google.com/file/d/legacy-audio/view',
          },
        }}
        variant="modal"
        listeningResultReviewDeliveryIssuer={deliveryIssuer}
      />,
    );

    expect(screen.getByTestId('ssrc-source-material-removed')).toHaveTextContent('Original material removed');
    expect(screen.queryByTestId('ssrc-listening-review-audio')).not.toBeInTheDocument();
    expect(deliveryIssuer.issue).not.toHaveBeenCalled();
  });

  it('resolves new Listening asset-ID result-review audio through authorized delivery', async () => {
    const deliveryIssuer = {
      issue: vi.fn(async (input) => ({
        assetId: input.assetId,
        url: 'https://authorized.example/asset-1',
        tokenId: 'token-1',
        issuedAt: input.now,
        expiresAt: input.now + 60 * 60 * 1000,
        refreshAfter: input.now + 50 * 60 * 1000,
        ttlMs: 60 * 60 * 1000,
        deliveryReady: true as const,
        range: {
          requestRange: 'bytes=0-0',
          status: 206 as const,
          acceptRanges: 'bytes' as const,
          contentLength: 1,
          contentRange: 'bytes 0-0/4096',
        },
      })),
    };

    render(
      <SharedSavedResultCore
        result={{
          ...MOCK_RESULT,
          resultId: 'listening-result-new',
          testSkill: 'listening',
          testType: 'listening',
          studentId: 'student-1',
          listeningResultReviewAudio: {
            audioUrl: 'https://pub.example.r2.dev/assessment-assets/listening/teacher-1/asset-1/audio.mp3',
            streamUrl: 'https://pub.example.r2.dev/assessment-assets/listening/teacher-1/asset-1/audio.mp3',
            assetId: 'asset-1',
            versionId: 'version-1',
          },
        }}
        variant="modal"
        listeningResultReviewDeliveryIssuer={deliveryIssuer}
        listeningResultReviewNow={1_700_000_000_000}
      />,
    );

    const audio = await screen.findByTestId('ssrc-listening-review-audio');
    expect(audio).toHaveAttribute('src', 'https://authorized.example/asset-1');
    expect(audio).toHaveAttribute('data-delivery-mode', 'authorized');
    await waitFor(() => {
      expect(deliveryIssuer.issue).toHaveBeenCalledWith({
        assetId: 'asset-1',
        context: {
          runtime: 'trusted-server',
          callerUserId: 'student-1',
        },
        now: 1_700_000_000_000,
        resultScope: {
          resultId: 'listening-result-new',
          versionId: 'version-1',
        },
      });
    });
  });

  it('uses the production result-review delivery issuer when shells do not inject one', async () => {
    mockDefaultDeliveryIssue.mockResolvedValue({
      assetId: 'asset-default',
      url: 'https://authorized.example/default-asset',
      tokenId: 'token-default',
      issuedAt: 1_700_000_000_000,
      expiresAt: 1_700_003_600_000,
      refreshAfter: 1_700_003_000_000,
      ttlMs: 60 * 60 * 1000,
      deliveryReady: true,
      range: {
        requestRange: 'bytes=0-0',
        status: 206,
        acceptRanges: 'bytes',
        contentLength: 1,
        contentRange: 'bytes 0-0/4096',
      },
    });

    render(
      <SharedSavedResultCore
        result={{
          ...MOCK_RESULT,
          resultId: 'listening-result-default',
          testSkill: 'listening',
          testType: 'listening',
          studentId: 'student-1',
          listeningResultReviewAudio: {
            audioUrl: 'https://pub.example.r2.dev/assessment-assets/listening/teacher-1/asset-default/audio.mp3',
            assetId: 'asset-default',
            versionId: 'version-default',
          },
        }}
        variant="modal"
        listeningResultReviewNow={1_700_000_000_000}
      />,
    );

    const audio = await screen.findByTestId('ssrc-listening-review-audio');
    expect(audio).toHaveAttribute('src', 'https://authorized.example/default-asset');
    expect(audio).toHaveAttribute('data-delivery-mode', 'authorized');
    await waitFor(() => {
      expect(mockDefaultDeliveryIssue).toHaveBeenCalledWith({
        assetId: 'asset-default',
        context: {
          runtime: 'trusted-server',
          callerUserId: 'student-1',
        },
        now: 1_700_000_000_000,
        resultScope: {
          resultId: 'listening-result-default',
          versionId: 'version-default',
        },
      });
    });
  });

  it('routes Reading V2 saved results to the grouped review adapter instead of legacy ReviewTab', () => {
    render(
      <SharedSavedResultCore result={MOCK_READING_V2_RESULT} variant="modal" />,
    );

    expect(screen.getByTestId('reading-v2-review-adapter')).toBeInTheDocument();
    expect(screen.queryByTestId('rv-incorrect-banner')).not.toBeInTheDocument();
    expect(screen.getByText('Reading V2 Saved Result')).toBeInTheDocument();
  });

  it('does not show the legacy empty-question message when Reading V2 grouped review payload exists', () => {
    render(
      <SharedSavedResultCore
        result={{ ...MOCK_READING_V2_RESULT, questionResults: [] }}
        variant="modal"
      />,
    );

    expect(screen.getByTestId('reading-v2-review-adapter')).toBeInTheDocument();
    expect(screen.getByText('Questions 1-2')).toBeInTheDocument();
    expect(screen.queryByTestId('ssrc-empty-questions')).not.toBeInTheDocument();
    expect(screen.queryByText('No question results available for this test.')).not.toBeInTheDocument();
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
