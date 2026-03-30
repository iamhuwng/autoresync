import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, act, waitFor } from '@testing-library/react';
import React from 'react';

const {
  mockOnValue,
  mockGetTestResult,
  mockGenerateFormativeFeedbackForSavedResult,
  mockNeedsAiFeedbackUpgrade,
} = vi.hoisted(() => {
  const mockOnValue = vi.fn();
  const mockGetTestResult = vi.fn();
  const mockGenerateFormativeFeedbackForSavedResult = vi.fn();
  const mockNeedsAiFeedbackUpgrade = vi.fn((_feedback?: unknown, _questionResults?: unknown) => false);

  return {
    mockOnValue,
    mockGetTestResult,
    mockGenerateFormativeFeedbackForSavedResult,
    mockNeedsAiFeedbackUpgrade,
  };
});

vi.mock('firebase/database', () => ({
  ref: vi.fn((_db: unknown, path: string) => ({ path })),
  onValue: mockOnValue,
}));

vi.mock('../../services/firebase', () => ({
  database: {},
}));

vi.mock('../../services/testResults.service', () => ({
  getTestResult: mockGetTestResult,
  TestResultRecord: {},
}));

vi.mock('../../services/resultFeedbackGeneration.service', () => ({
  generateFormativeFeedbackForSavedResult: (...args: unknown[]) =>
    mockGenerateFormativeFeedbackForSavedResult(...args),
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'teacher-1', email: 'teacher@example.com' },
    profile: { role: 'teacher' },
  }),
}));

vi.mock('../../hooks/useNavigation', () => ({
  useNavigation: () => ({
    navigateTo: vi.fn(),
  }),
}));

vi.mock('./ResultContextBadge', () => ({
  ResultContextBadge: ({ contextType }: { contextType?: string }) => (
    <div data-testid="result-context-badge">{contextType || 'self_study'}</div>
  ),
}));

vi.mock('../thcs-student/FormativeFeedbackPanel', () => ({
  FormativeFeedbackPanel: () => <div data-testid="formative-feedback-panel" />,
}));

vi.mock('./StudyRecommendations', () => ({
  StudyRecommendations: () => <div data-testid="study-recommendations" />,
}));

// ── Mock hooks used by FeedbackTab via SharedSavedResultCore ────────────────

vi.mock('../../hooks/useHistoricalScores', () => ({
  useHistoricalScores: () => ({ scores: [], loading: false }),
}));

vi.mock('../../hooks/useClassPosition', () => ({
  useClassPosition: () => ({ average: null, totalStudents: 0, position: null, loading: false }),
}));

// ── Mock useScreenSize used by OverviewTab ──────────────────────────────────

vi.mock('@/core/platform', () => ({
  useScreenSize: () => ({ isMobile: false, isTablet: false, isDesktop: true, width: 1200, height: 800 }),
}));

// ── Mock formativeFeedback.service for ReviewTab/FeedbackTab ────────────────

vi.mock('../../services/formativeFeedback.service', () => ({
  needsAiFeedbackUpgrade: (feedback: unknown, questionResults: unknown) => mockNeedsAiFeedbackUpgrade(feedback, questionResults),
  getPreferredQuestionExplanation: vi.fn(() => null),
  getRenderableQuestionExplanations: vi.fn(() => ({})),
}));


import { ResultDetailModal } from './ResultDetailModal';

const IELTS_RESULT = {
  resultId: 'res-1',
  testId: 'test-1',
  studentId: 'student-1',
  testTitle: 'IELTS Reading Practice 1',
  testType: 'ielts-reading',
  testSkill: 'reading',
  totalScore: 15,
  maxScore: 20,
  percentage: 75,
  correct: 15,
  incorrect: 5,
  partialCredit: 0,
  timeElapsed: 1800,
  submittedAt: 1710921600000,
  questionResults: [
    {
      questionNumber: 1,
      questionType: 'matching',
      isCorrect: false,
      score: 0,
      maxScore: 1,
      studentAnswer: 'A',
      correctAnswer: 'B',
      feedback: '',
    },
  ],
  context: {
    type: 'homework',
    configApplied: {
      feedbackTiming: 'after_completion',
    },
  },
};

const GENERIC_RESULT = {
  ...IELTS_RESULT,
  resultId: 'res-generic',
  testId: 'test-generic',
  testTitle: 'Grammar Progress Check',
  testType: 'grammar-quiz',
  testSkill: 'grammar',
  bandScore: undefined,
};

function simulateOnValueSuccess(data: unknown) {
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

describe('ResultDetailModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnValue.mockReturnValue(vi.fn());
    mockGetTestResult.mockResolvedValue(IELTS_RESULT);
    mockGenerateFormativeFeedbackForSavedResult.mockResolvedValue({
      saved: true,
      aiApplied: true,
      mode: 'ai',
    });
  });

  it('auto-triggers feedback generation for missing IELTS results in the modal', async () => {
    render(<ResultDetailModal opened onClose={vi.fn()} resultId="res-1" />);
    simulateOnValueSuccess(IELTS_RESULT);

    await waitFor(() => {
      expect(screen.getByText('IELTS Reading Practice 1')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(mockGenerateFormativeFeedbackForSavedResult).toHaveBeenCalledWith(
        'res-1',
        expect.objectContaining({ triggerSource: 'ResultDetailModal:auto-generate' }),
      );
    });
  });

  it('uses the shared saved-result generate flow when manual retry is clicked for missing feedback', async () => {
    render(<ResultDetailModal opened onClose={vi.fn()} resultId="res-1" />);
    simulateOnValueSuccess(IELTS_RESULT);

    await waitFor(() => {
      expect(screen.getByText('Generate AI Feedback')).toBeInTheDocument();
    });

    act(() => {
      screen.getByText('Generate AI Feedback').click();
    });

    await waitFor(() => {
      expect(mockGenerateFormativeFeedbackForSavedResult).toHaveBeenNthCalledWith(
        2,
        'res-1',
        expect.objectContaining({ triggerSource: 'ResultDetailModal:manual-generate' }),
      );
    });
  });

  it('keeps stored deterministic feedback visible but allows AI upgrade retry', async () => {
    mockNeedsAiFeedbackUpgrade.mockReturnValue(true);
    render(<ResultDetailModal opened onClose={vi.fn()} resultId="res-1" />);
    simulateOnValueSuccess({
      ...IELTS_RESULT,
      formativeFeedback: {
        analysis: { strengths: [], revision: [], critical: [] },
        deterministicFeedback: 'Base explanation only',
        questionExplanations: {
          '1': 'You chose "A", but the correct answer is "B". Review the grammar rule or vocabulary pattern behind this question and try again with similar exercises.',
        },
        totalCorrect: 0,
        totalQuestions: 1,
        scaledScore: 6.5,
      },
    });

    await waitFor(() => {
      expect(screen.getByText(/Saved feedback still needs an AI upgrade/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Retry AI Feedback/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(mockGenerateFormativeFeedbackForSavedResult).toHaveBeenCalledWith(
        'res-1',
        expect.objectContaining({
          forceAiUpgrade: true,
          triggerSource: 'ResultDetailModal:auto-upgrade',
        }),
      );
    });
  });

  it('auto-triggers AI upgrade for weak stored feedback on generic results too', async () => {
    mockNeedsAiFeedbackUpgrade.mockReturnValue(true);
    render(<ResultDetailModal opened onClose={vi.fn()} resultId="res-generic" />);
    simulateOnValueSuccess({
      ...GENERIC_RESULT,
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
          triggerSource: 'ResultDetailModal:auto-upgrade',
        }),
      );
    });
  });

  it('renders AI summary and study recommendations when IELTS feedback is present', async () => {
    render(<ResultDetailModal opened onClose={vi.fn()} resultId="res-1" />);
    simulateOnValueSuccess({
      ...IELTS_RESULT,
      formativeFeedback: {
        aiFeedback: {
          summary: 'You are strongest on matching questions, but inference accuracy still needs work.',
          strengths: 'Strong on scanning tasks.',
          revision: 'Work on inference.',
          critical: 'Slow down on false/not given decisions.',
        },
        studyRecommendations: [
          {
            skillTag: 'Inference',
            questionNumbers: [1],
            guidance: 'Review inference questions.',
            resources: [
              {
                bookTitle: 'The Official Cambridge Guide to IELTS',
                author: 'Cambridge University Press',
                sectionTitle: 'Reading Unit 3',
                reason: 'Targets inference questions.',
              },
            ],
          },
        ],
        analysis: { strengths: [], revision: [], critical: [] },
        deterministicFeedback: 'Base explanation only',
        totalCorrect: 15,
        totalQuestions: 20,
        scaledScore: 7,
      },
    });

    expect(await screen.findByText('AI Performance Analysis')).toBeInTheDocument();
    // OverviewTab and FeedbackTab both render the AI summary text, so use getAllByText
    expect(screen.getAllByText(/matching questions/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId('study-recommendations')).toBeInTheDocument();
  });

  it('renders teacher feedback sections in the teacher homework modal', async () => {
    render(<ResultDetailModal opened onClose={vi.fn()} resultId="res-1" />);
    simulateOnValueSuccess({
      ...IELTS_RESULT,
      overallFeedback: 'Teacher overall feedback',
      feedbackUpdatedBy: 'Ms. Nguyen',
      feedbackUpdatedAt: 1710921600000,
      questionResults: [
        {
          ...IELTS_RESULT.questionResults[0],
          teacherFeedback: 'Check the passage for the detail that changes the answer.',
        },
      ],
    });

    await waitFor(() => {
      expect(screen.getByTestId('ssrc-teacher-overall-feedback')).toBeInTheDocument();
    });
    expect(screen.getByText('Teacher overall feedback')).toBeInTheDocument();
    expect(screen.getByTestId('ssrc-teacher-question-feedback')).toBeInTheDocument();
    expect(screen.getByText(/check the passage for the detail/i)).toBeInTheDocument();
  });
});
