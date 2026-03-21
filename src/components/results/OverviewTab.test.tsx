/**
 * OverviewTab.test.tsx — PRD-0039 Task 6.25
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { OverviewTab } from './OverviewTab';
import type { TestResultRecord } from '../../services/testResults.service';

/* ─── Factory ────────────────────────────────────────────────────────────── */

function makeResult(overrides: Partial<TestResultRecord> = {}): TestResultRecord {
  return {
    testId: 'test-1',
    userId: 'u1',
    testTitle: 'Grade 8 - Unit 3',
    testType: 'practice_thcs',
    testSkill: 'Grammar',
    totalScore: 22,
    maxScore: 30,
    percentage: 73,
    bandScore: 0,
    correct: 22,
    incorrect: 6,
    partialCredit: 2,
    totalQuestions: 30,
    submittedAt: 1711000000000,
    timeElapsed: 930, // 15m 30s
    testDuration: 2400,
    createdAt: 1711000000000,
    questionResults: Array.from({ length: 30 }, (_, i) => ({
      questionNumber: i + 1,
      questionType: 'mcq',
      isCorrect: i < 22,
      score: i < 22 ? 1 : i < 24 ? 0.5 : 0,
      maxScore: 1,
      studentAnswer: 'A',
      correctAnswer: i < 22 ? 'A' : 'B',
      feedback: '',
    })),
    thcsData: {
      scaledScore: 7.3,
      sectionResults: [
        {
          sectionId: 's1',
          sectionName: 'Phonetics',
          pointsEarned: 4,
          pointsMax: 5,
          correctCount: 4,
          totalCount: 5,
          percentage: 80,
          intentBreakdown: {} as any,
        },
        {
          sectionId: 's2',
          sectionName: 'Grammar',
          pointsEarned: 10,
          pointsMax: 15,
          correctCount: 10,
          totalCount: 15,
          percentage: 66.7,
          intentBreakdown: {} as any,
        },
      ],
      intentBreakdown: {
        'multiple-choice-vocab': { correct: 8, total: 10 },
        'fill-in-blank': { correct: 6, total: 10 },
        'sentence-rewrite': { correct: 4, total: 10 },
      },
    },
    ...overrides,
  } as TestResultRecord;
}

function makeIeltsResult(): TestResultRecord {
  return makeResult({
    testType: 'reading',
    testSkill: 'reading',
    totalScore: 30,
    maxScore: 40,
    percentage: 75,
    bandScore: 6.5,
    correct: 30,
    totalQuestions: 40,
    thcsData: undefined,
    ieltsData: {
      passageResults: [
        { passageName: 'The History of Tea', questionRange: [1, 13], correct: 10, total: 13, percentage: 76.9 },
        { passageName: 'Marine Biology', questionRange: [14, 26], correct: 11, total: 13, percentage: 84.6 },
        { passageName: 'Urban Planning', questionRange: [27, 40], correct: 9, total: 14, percentage: 64.3 },
      ],
    },
  });
}

/* ─── Tests ───────────────────────────────────────────────────────────────── */

describe('OverviewTab', () => {
  const onTabSwitch = vi.fn();
  const onHighlight = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    onTabSwitch.mockReset();
    onHighlight.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ── THCS Overview (Task 6.25a) ─────────────────────────────────────────
  describe('THCS Overview', () => {
    it('renders the score ring with percentage and raw points like the mockup', () => {
      render(<OverviewTab result={makeResult()} onTabSwitch={onTabSwitch} onHighlightQuestion={onHighlight} />);
      expect(screen.getByText('73%')).toBeInTheDocument();
      expect(screen.getAllByText('22/30').length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText('7.3')).toBeInTheDocument();
    });

    it('renders THCS stat cards', () => {
      render(<OverviewTab result={makeResult()} onTabSwitch={onTabSwitch} onHighlightQuestion={onHighlight} />);
      expect(screen.getByText('Points Earned')).toBeInTheDocument();
      expect(screen.getByText('Scaled Score')).toBeInTheDocument();
      expect(screen.getByText('Time Spent')).toBeInTheDocument();
      expect(screen.getByText('15m 30s')).toBeInTheDocument();
    });

    it('renders THCS section cards', () => {
      render(<OverviewTab result={makeResult()} onTabSwitch={onTabSwitch} onHighlightQuestion={onHighlight} />);
      expect(screen.getByText('Phonetics')).toBeInTheDocument();
      expect(screen.getByText('Grammar')).toBeInTheDocument();
      expect(screen.getByText('4/5')).toBeInTheDocument();
      expect(screen.getByText('10/15')).toBeInTheDocument();
    });

    it('does not render the removed THCS skill analysis block', () => {
      render(<OverviewTab result={makeResult()} onTabSwitch={onTabSwitch} onHighlightQuestion={onHighlight} />);
      expect(screen.queryByTestId('ov-thcs-intents')).not.toBeInTheDocument();
      expect(screen.queryByText('Skill Analysis')).not.toBeInTheDocument();
    });
  });

  // ── IELTS Overview (Task 6.25b) ────────────────────────────────────────
  describe('IELTS Overview', () => {
    it('renders percentage and raw score in the ring', () => {
      render(<OverviewTab result={makeIeltsResult()} onTabSwitch={onTabSwitch} onHighlightQuestion={onHighlight} />);
      expect(screen.getByText('75%')).toBeInTheDocument();
      expect(screen.getAllByText('30/40').length).toBeGreaterThanOrEqual(2);
    });

    it('renders IELTS stat cards', () => {
      render(<OverviewTab result={makeIeltsResult()} onTabSwitch={onTabSwitch} onHighlightQuestion={onHighlight} />);
      expect(screen.getByText('Band Score')).toBeInTheDocument();
      expect(screen.getByText('Correct Answers')).toBeInTheDocument();
    });

    it('renders IELTS passage cards', () => {
      render(<OverviewTab result={makeIeltsResult()} onTabSwitch={onTabSwitch} onHighlightQuestion={onHighlight} />);
      expect(screen.getByTestId('ov-ielts-passages')).toBeInTheDocument();
      expect(screen.getByText('The History of Tea')).toBeInTheDocument();
      expect(screen.getByText('Marine Biology')).toBeInTheDocument();
      expect(screen.getByText('Urban Planning')).toBeInTheDocument();
    });
  });

  // ── 50+ question layout switch (Task 6.25c) ───────────────────────────
  describe('50+ question layout', () => {
    it('uses 10 columns for > 50 questions', () => {
      const result = makeResult({
        totalQuestions: 60,
        questionResults: Array.from({ length: 60 }, (_, i) => ({
          questionNumber: i + 1,
          questionType: 'mcq',
          isCorrect: i < 40,
          score: i < 40 ? 1 : 0,
          maxScore: 1,
          studentAnswer: 'A',
          correctAnswer: 'B',
          feedback: '',
        })),
      });

      const { container } = render(
        <OverviewTab result={result} onTabSwitch={onTabSwitch} onHighlightQuestion={onHighlight} />
      );
      const grid = container.querySelector('.ov-pill-grid');
      expect(grid).toHaveStyle({ gridTemplateColumns: 'repeat(10, 1fr)' });
    });

    it('uses 20 columns for <= 50 questions', () => {
      const { container } = render(
        <OverviewTab result={makeResult()} onTabSwitch={onTabSwitch} onHighlightQuestion={onHighlight} />
      );
      const grid = container.querySelector('.ov-pill-grid');
      expect(grid).toHaveStyle({ gridTemplateColumns: 'repeat(20, 1fr)' });
    });
  });

  // ── Tooltip text (Task 6.25d) ──────────────────────────────────────────
  describe('Tooltip', () => {
    it('shows "Click to review" tooltip on incorrect pills', () => {
      render(<OverviewTab result={makeResult()} onTabSwitch={onTabSwitch} onHighlightQuestion={onHighlight} />);
      // Question 25 is incorrect (index 24, score=0)
      const pill = screen.getByTestId('ov-pill-25');
      expect(pill).toHaveAttribute('data-tooltip', 'Click to review');
    });

    it('does not show tooltip on correct pills', () => {
      render(<OverviewTab result={makeResult()} onTabSwitch={onTabSwitch} onHighlightQuestion={onHighlight} />);
      const pill = screen.getByTestId('ov-pill-1');
      expect(pill).not.toHaveAttribute('data-tooltip');
    });
  });

  // ── goToQuestion (Task 6.25e) ──────────────────────────────────────────
  describe('goToQuestion', () => {
    it('switches to review tab and passes the highlighted question number', () => {
      render(<OverviewTab result={makeResult()} onTabSwitch={onTabSwitch} onHighlightQuestion={onHighlight} />);
      const pill = screen.getByTestId('ov-pill-25');
      fireEvent.click(pill);

      expect(onTabSwitch).toHaveBeenCalledWith('review');
      expect(onHighlight).toHaveBeenCalledWith(25);
    });

    it('correct pills are not clickable', () => {
      render(<OverviewTab result={makeResult()} onTabSwitch={onTabSwitch} onHighlightQuestion={onHighlight} />);
      const pill = screen.getByTestId('ov-pill-1');
      fireEvent.click(pill);
      expect(onTabSwitch).not.toHaveBeenCalled();
    });
  });

  // ── Performance card ──────────────────────────────────────────────────
  describe('Performance card', () => {
    it('shows excellent for >= 80%', () => {
      const result = makeResult({
        percentage: 85,
        formativeFeedback: {
          aiFeedback: {
            summary: 'You are sustaining strong accuracy across the paper.',
            strengths: '',
            revision: '',
            critical: '',
          },
        } as any,
      });
      render(<OverviewTab result={result} onTabSwitch={onTabSwitch} onHighlightQuestion={onHighlight} />);
      expect(screen.getByText('Excellent Performance!')).toBeInTheDocument();
      expect(
        within(screen.getByTestId('ov-perf-card')).getByText('You are sustaining strong accuracy across the paper.')
      ).toBeInTheDocument();
    });

    it('shows good for >= 60%', () => {
      const result = makeResult({
        percentage: 65,
        formativeFeedback: {
          aiFeedback: {
            summary: 'Your score is solid, with a few areas still worth tightening.',
            strengths: '',
            revision: '',
            critical: '',
          },
        } as any,
      });
      render(<OverviewTab result={result} onTabSwitch={onTabSwitch} onHighlightQuestion={onHighlight} />);
      expect(screen.getByText('Good Job!')).toBeInTheDocument();
    });

    it('shows needs work for < 60%', () => {
      const result = makeResult({
        percentage: 40,
        formativeFeedback: {
          aiFeedback: {
            summary: 'You need more targeted revision before the next attempt.',
            strengths: '',
            revision: '',
            critical: '',
          },
        } as any,
      });
      render(<OverviewTab result={result} onTabSwitch={onTabSwitch} onHighlightQuestion={onHighlight} />);
      expect(screen.getByText('Keep Practicing!')).toBeInTheDocument();
    });

    it('does not render the performance card without AI summary text', () => {
      render(<OverviewTab result={makeResult()} onTabSwitch={onTabSwitch} onHighlightQuestion={onHighlight} />);
      expect(screen.queryByTestId('ov-perf-card')).not.toBeInTheDocument();
    });
  });

  // ── Legend ─────────────────────────────────────────────────────────────
  describe('Legend', () => {
    it('shows partial dot when partial results exist', () => {
      const { container } = render(
        <OverviewTab result={makeResult()} onTabSwitch={onTabSwitch} onHighlightQuestion={onHighlight} />
      );
      expect(container.querySelector('.ov-legend-dot--partial')).toBeInTheDocument();
    });

    it('hides partial dot when no partial results', () => {
      const result = makeResult({
        questionResults: Array.from({ length: 10 }, (_, i) => ({
          questionNumber: i + 1,
          questionType: 'mcq',
          isCorrect: i < 8,
          score: i < 8 ? 1 : 0,
          maxScore: 1,
          studentAnswer: 'A',
          correctAnswer: 'B',
          feedback: '',
        })),
      });
      const { container } = render(
        <OverviewTab result={result} onTabSwitch={onTabSwitch} onHighlightQuestion={onHighlight} />
      );
      expect(container.querySelector('.ov-legend-dot--partial')).not.toBeInTheDocument();
    });
  });

  // ── Time formatting ───────────────────────────────────────────────────
  describe('Time formatting', () => {
    it('formats time < 1h as Xm Ys', () => {
      render(<OverviewTab result={makeResult()} onTabSwitch={onTabSwitch} onHighlightQuestion={onHighlight} />);
      expect(screen.getByText('15m 30s')).toBeInTheDocument();
    });

    it('formats time >= 1h as Xh Ym', () => {
      const result = makeResult({ timeElapsed: 4500 }); // 1h 15m
      render(<OverviewTab result={result} onTabSwitch={onTabSwitch} onHighlightQuestion={onHighlight} />);
      expect(screen.getByText('1h 15m')).toBeInTheDocument();
    });

    it('shows -- when time data is missing', () => {
      const result = makeResult({ timeElapsed: 0 });
      render(<OverviewTab result={result} onTabSwitch={onTabSwitch} onHighlightQuestion={onHighlight} />);
      expect(screen.getByText('--')).toBeInTheDocument();
    });
  });

  // ── IELTS with no ieltsData (Task 6.18) ───────────────────────────────
  describe('Legacy IELTS', () => {
    it('shows no passage breakdown for legacy IELTS results', () => {
      const result = makeIeltsResult();
      delete (result as any).ieltsData;
      render(<OverviewTab result={result} onTabSwitch={onTabSwitch} onHighlightQuestion={onHighlight} />);
      expect(screen.queryByTestId('ov-ielts-passages')).not.toBeInTheDocument();
    });
  });

  describe('Section truncation', () => {
    it('shows only three section rows by default and expands on demand', () => {
      const result = makeResult({
        thcsData: {
          scaledScore: 7.3,
          sectionResults: [
            { sectionId: 's1', sectionName: 'Phonetics', pointsEarned: 4, pointsMax: 5, correctCount: 4, totalCount: 5, percentage: 80, intentBreakdown: {} as any },
            { sectionId: 's2', sectionName: 'Grammar', pointsEarned: 10, pointsMax: 15, correctCount: 10, totalCount: 15, percentage: 66.7, intentBreakdown: {} as any },
            { sectionId: 's3', sectionName: 'Vocabulary', pointsEarned: 3, pointsMax: 5, correctCount: 3, totalCount: 5, percentage: 60, intentBreakdown: {} as any },
            { sectionId: 's4', sectionName: 'Reading', pointsEarned: 2, pointsMax: 5, correctCount: 2, totalCount: 5, percentage: 40, intentBreakdown: {} as any },
            { sectionId: 's5', sectionName: 'Writing', pointsEarned: 3, pointsMax: 5, correctCount: 3, totalCount: 5, percentage: 60, intentBreakdown: {} as any },
          ],
          intentBreakdown: {
            'multiple-choice-vocab': { correct: 8, total: 10 },
          },
        } as any,
      });

      render(<OverviewTab result={result} onTabSwitch={onTabSwitch} onHighlightQuestion={onHighlight} />);

      expect(screen.getByText('Phonetics')).toBeInTheDocument();
      expect(screen.getByText('Grammar')).toBeInTheDocument();
      expect(screen.getByText('Vocabulary')).toBeInTheDocument();
      expect(screen.queryByText('Reading')).not.toBeInTheDocument();
      expect(screen.queryByText('Writing')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('ov-sections-toggle'));

      expect(screen.getByText('Reading')).toBeInTheDocument();
      expect(screen.getByText('Writing')).toBeInTheDocument();
      expect(screen.getByTestId('ov-sections-toggle')).toHaveTextContent('Show fewer sections');
    });
  });
});
