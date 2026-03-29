/**
 * FeedbackTab Tests - PRD-0039 Task 8.11
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FeedbackTab } from './FeedbackTab';
import type { TestResultRecord } from '../../services/testResults.service';

vi.mock('../../hooks/useHistoricalScores', () => ({
  useHistoricalScores: vi.fn(() => ({
    scores: [],
    loading: false,
    error: null,
  })),
}));

vi.mock('../../hooks/useClassPosition', () => ({
  useClassPosition: vi.fn(() => ({
    average: null,
    totalStudents: 0,
    position: null,
    loading: false,
    error: null,
  })),
}));

import { useHistoricalScores } from '../../hooks/useHistoricalScores';
import { useClassPosition } from '../../hooks/useClassPosition';

const baseResult: TestResultRecord = {
  resultId: 'r1',
  testId: 't1',
  testTitle: 'Test',
  testType: 'THCS-THPT',
  studentId: 's1',
  totalScore: 7,
  maxScore: 10,
  percentage: 70,
  correct: 7,
  incorrect: 3,
  partialCredit: 0,
  totalQuestions: 10,
  submittedAt: Date.now(),
  questionResults: [],
} as any;

const resultWithAI: TestResultRecord = {
  ...baseResult,
  formativeFeedback: {
    aiFeedback: {
      summary: 'Good performance overall.',
      strengths: 'You did well on grammar and vocabulary.',
      revision: 'Reading comprehension needs work.',
      critical: 'Focus on sentence rewriting exercises.',
    },
    studyRecommendations: [
      {
        skillTag: 'Grammar',
        questionNumbers: [5, 6, 7],
        guidance: 'Questions 5, 6, and 7 show a grammar gap around tense choice.',
        resources: [
          {
            bookTitle: 'English Grammar in Use (5th Edition)',
            author: 'Raymond Murphy',
            sectionTitle: 'Unit 11: Present Perfect and Past Simple',
            reason: 'This unit addresses the tense confusion shown in the wrong answers.',
          },
        ],
      },
      {
        skillTag: 'Reading Comprehension',
        questionNumbers: [3, 4],
        guidance: 'Questions 3 and 4 suggest the student needs more work on finding textual evidence.',
        resources: [
          {
            bookTitle: 'The Official Cambridge Guide to IELTS',
            author: 'Pauline Cullen & Amanda French',
            sectionTitle: 'Reading Section: Matching Information',
            reason: 'This section trains the evidence-hunting skill behind those mistakes.',
          },
        ],
      },
    ],
    aiModel: 'gemini',
    analysis: {
      strengths: [],
      revision: [
        {
          intent: 'reading-comprehension',
          skillName: 'Reading Comprehension',
          category: 'Reading',
          correct: 2,
          total: 4,
          percentage: 50,
          questionNumbers: [1, 2, 3, 4],
          wrongQuestionNumbers: [3, 4],
        },
      ],
      critical: [
        {
          intent: 'mcq-grammar',
          skillName: 'Grammar',
          category: 'Language Use',
          correct: 1,
          total: 4,
          percentage: 25,
          questionNumbers: [5, 6, 7, 8],
          wrongQuestionNumbers: [5, 6, 7],
        },
      ],
    },
    deterministicFeedback: '',
    totalCorrect: 7,
    totalQuestions: 10,
    scaledScore: 7.0,
  },
} as any;

const resultWithClassId: TestResultRecord = {
  ...baseResult,
  classId: 'class-1',
} as any;

describe('FeedbackTab', () => {
  let offsetHeightMock: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    vi.mocked(useHistoricalScores).mockReturnValue({ scores: [], loading: false, error: null });
    vi.mocked(useClassPosition).mockReturnValue({ average: null, totalStudents: 0, position: null, loading: false, error: null });
  });

  afterEach(() => {
    offsetHeightMock?.mockRestore();
    offsetHeightMock = null;
  });

  it('shows no-feedback message when AI feedback is absent', () => {
    render(<FeedbackTab result={baseResult} />);
    expect(screen.getByTestId('fb-no-analysis')).toBeInTheDocument();
    expect(screen.getByText(/AI feedback is not yet available/)).toBeInTheDocument();
  });

  it('shows retry affordance when stored deterministic feedback still needs AI upgrade', () => {
    const storedDeterministicResult = {
      ...baseResult,
      formativeFeedback: {
        analysis: { strengths: [], revision: [], critical: [] },
        deterministicFeedback: 'Stored deterministic explanation',
        totalCorrect: 7,
        totalQuestions: 10,
        scaledScore: 7.0,
      },
    } as TestResultRecord;

    render(<FeedbackTab result={storedDeterministicResult} isEligibleForAIFeedback onRetryFeedback={vi.fn()} />);

    expect(screen.getByTestId('fb-feedback-stored')).toBeInTheDocument();
    expect(screen.getByText(/still needs an AI upgrade/i)).toBeInTheDocument();
    expect(screen.getByText(/Retry AI Feedback/i)).toBeInTheDocument();
  });

  it('renders AI analysis sections when formativeFeedback exists', () => {
    render(<FeedbackTab result={resultWithAI} />);
    expect(screen.getByTestId('fb-ai-analysis')).toBeInTheDocument();
    expect(screen.getByText('You did well on grammar and vocabulary.')).toBeInTheDocument();
    expect(screen.getByText('Reading comprehension needs work.')).toBeInTheDocument();
    expect(screen.getByText('Focus on sentence rewriting exercises.')).toBeInTheDocument();
  });

  it('shows an AI refresh notice when saved AI summary still has weak explanations', () => {
    render(<FeedbackTab result={{
      ...resultWithAI,
      formativeFeedback: {
        ...resultWithAI.formativeFeedback,
        questionExplanations: {
          '3': 'You chose "D", but the correct answer is "B". Review the grammar rule or vocabulary pattern behind this question and try again with similar exercises.',
        },
      },
    } as TestResultRecord} onRetryFeedback={vi.fn()} />);

    expect(screen.getByTestId('fb-feedback-upgrade')).toBeInTheDocument();
    expect(screen.getByText(/question explanations still need an AI refresh/i)).toBeInTheDocument();
    expect(screen.getByText(/Retry AI Feedback/i)).toBeInTheDocument();
  });

  it('does not crash when legacy analysis entries omit wrongQuestionNumbers', () => {
    const legacyResult = {
      ...resultWithAI,
      formativeFeedback: {
        ...resultWithAI.formativeFeedback,
        analysis: {
          strengths: [
            {
              intent: 'mcq-vocabulary',
              skillName: 'Vocabulary',
              category: 'Language Use',
              correct: 4,
              total: 5,
              percentage: 80,
              questionNumbers: [1, 2, 3, 4, 5],
            },
          ],
          revision: [],
          critical: [],
        },
      },
    } as TestResultRecord;

    render(<FeedbackTab result={legacyResult} />);

    expect(screen.getByTestId('fb-ai-analysis')).toBeInTheDocument();
    expect(screen.getByText('Vocabulary - 80%')).toBeInTheDocument();
  });

  it('renders recommendation cards from the approved book catalog', () => {
    render(<FeedbackTab result={resultWithAI} />);
    expect(screen.getByTestId('fb-study-recommendations')).toBeInTheDocument();
    expect(screen.getByTestId('fb-study-card-grammar')).toBeInTheDocument();
    expect(screen.getAllByText('Unit 11: Present Perfect and Past Simple').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Reading Section: Matching Information').length).toBeGreaterThan(0);
  });

  it('shows the advanced-resource state for a perfect-score result', () => {
    const perfectResult = {
      ...resultWithAI,
      incorrect: 0,
      percentage: 100,
      totalScore: 10,
      formativeFeedback: {
        ...resultWithAI.formativeFeedback,
        analysis: { strengths: [], revision: [], critical: [] },
        studyRecommendations: [
          {
            skillTag: 'Advanced Extension',
            questionNumbers: [],
            guidance: 'Move into harder texts and higher-precision grammar review.',
            resources: [
              {
                bookTitle: 'Advanced Grammar in Use (3rd Edition)',
                author: 'Martin Hewings',
                sectionTitle: 'Advanced Verb Patterns',
                reason: 'This is a stronger next-step target after a clean result.',
              },
            ],
          },
        ],
      },
    } as TestResultRecord;

    render(<FeedbackTab result={perfectResult} />);
    expect(screen.getByText('Stretch targets')).toBeInTheDocument();
    expect(screen.getAllByText('Advanced Verb Patterns').length).toBeGreaterThan(0);
  });

  it('renders score trend widget with bars when scores are available', () => {
    vi.mocked(useHistoricalScores).mockReturnValue({
      scores: [
        { ...baseResult, resultId: 'r-old', percentage: 50, submittedAt: Date.now() - 86400000 },
        { ...baseResult, resultId: 'r1', percentage: 70, submittedAt: Date.now() },
      ] as any[],
      loading: false,
      error: null,
    });

    render(<FeedbackTab result={baseResult} />);

    expect(screen.getByTestId('fb-score-trend')).toBeInTheDocument();
    expect(screen.getByTestId('fb-trend-badge')).toHaveTextContent('Improving');
  });

  it('moves score trend into the left column when the recommendations stack is much taller', async () => {
    offsetHeightMock = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
      const testId = this.getAttribute('data-testid');

      if (testId === 'fb-ai-analysis') return 320;
      if (testId === 'fb-study-recommendations') return 760;
      if (testId === 'fb-score-trend') return 250;
      if (testId === 'fb-class-position') return 170;

      return 0;
    });

    vi.mocked(useHistoricalScores).mockReturnValue({
      scores: [
        { ...baseResult, resultId: 'r-old', percentage: 50, submittedAt: Date.now() - 86400000 },
        { ...baseResult, resultId: 'r1', percentage: 70, submittedAt: Date.now() },
      ] as any[],
      loading: false,
      error: null,
    });

    vi.mocked(useClassPosition).mockReturnValue({
      average: 60,
      totalStudents: 12,
      position: 'above',
      loading: false,
      error: null,
    });

    render(<FeedbackTab result={{ ...resultWithAI, classId: 'class-1' } as TestResultRecord} />);

    await waitFor(() => {
      expect(screen.getByTestId('fb-left-column')).toContainElement(screen.getByTestId('fb-score-trend'));
    });

    expect(screen.getByTestId('fb-right-column')).not.toContainElement(screen.getByTestId('fb-score-trend'));
  });

  it('hides score trend when no scores', () => {
    render(<FeedbackTab result={baseResult} />);
    expect(screen.queryByTestId('fb-score-trend')).not.toBeInTheDocument();
  });

  it('shows helper text for single score', () => {
    vi.mocked(useHistoricalScores).mockReturnValue({
      scores: [baseResult] as any[],
      loading: false,
      error: null,
    });

    render(<FeedbackTab result={baseResult} />);
    expect(screen.getByText('Need more results to show a trend')).toBeInTheDocument();
  });

  it('hides class position when classId is missing', () => {
    render(<FeedbackTab result={baseResult} />);
    expect(screen.queryByTestId('fb-class-position')).not.toBeInTheDocument();
  });

  it('shows class position with Above Average when score is above', () => {
    vi.mocked(useClassPosition).mockReturnValue({
      average: 60,
      totalStudents: 10,
      position: 'above',
      loading: false,
      error: null,
    });

    render(<FeedbackTab result={resultWithClassId} />);
    expect(screen.getByTestId('fb-class-position')).toBeInTheDocument();
    expect(screen.getByText('Above Average')).toBeInTheDocument();
    expect(screen.getByText('Class average: 60%')).toBeInTheDocument();
  });

  it('shows "Only student" text when totalStudents is 1', () => {
    vi.mocked(useClassPosition).mockReturnValue({
      average: 70,
      totalStudents: 1,
      position: null,
      loading: false,
      error: null,
    });

    render(<FeedbackTab result={resultWithClassId} />);
    expect(screen.getByText('Only student in this test')).toBeInTheDocument();
  });

  it('shows shimmer when scores are loading', () => {
    vi.mocked(useHistoricalScores).mockReturnValue({
      scores: [],
      loading: true,
      error: null,
    });

    render(<FeedbackTab result={baseResult} />);
    expect(screen.getByTestId('fb-trend-loading')).toBeInTheDocument();
  });
});
