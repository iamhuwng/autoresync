import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WritingStudentResultSurface from './WritingStudentResultSurface';
import type { WritingResultSurfaceData } from './writingResultSurface';

vi.mock('./WritingPublishedMarkupViewer', () => ({
  __esModule: true,
  default: ({ onFeedbackSelect }: { onFeedbackSelect?: (feedbackId: string, anchorViewportTop: number | null) => void }) => (
    <>
      <button type="button" onClick={() => onFeedbackSelect?.('comment-2', 180)}>
        Focus comment 2
      </button>
      <button type="button" onClick={() => onFeedbackSelect?.('correction-1', 210)}>
        Focus correction 1
      </button>
    </>
  ),
}));

const scrollIntoViewMock = vi.fn();

const surfaceData: WritingResultSurfaceData = {
  submissionId: 'submission-1',
  phase: 'published',
  viewerMode: 'student',
  testTitle: 'IELTS Writing',
  formatLabel: 'IELTS Academic',
  contextLabel: 'Saved Result',
  studentName: 'Student One',
  studentId: 'student-1',
  submittedAt: Date.UTC(2026, 2, 30),
  totalElapsedTimeSeconds: 2400,
  totalWordCount: 420,
  teacherName: 'Teacher One',
  teacherId: 'teacher-1',
  gradedAt: Date.UTC(2026, 2, 30),
  updatedAt: Date.UTC(2026, 2, 30),
  overallBand: 6.5,
  overallSummary: '<p>Overall summary</p>',
  auditVersion: 2,
  activeTaskCount: 2,
  hasPublishedMarkup: true,
  hasAnyFeedback: true,
  usesLegacyProjection: false,
  draftOwnerTeacherId: null,
  bandSummaryItems: [
    { key: 'overall', label: 'Overall', band: 6.5, tone: 'overall' },
    { key: 'task-1', label: 'Task 1', band: 6, tone: 'task' },
    { key: 'task-2', label: 'Task 2', band: 7, tone: 'task' },
  ],
  tasks: [
    {
      taskNumber: 1,
      taskType: 'report',
      promptText: 'Summarize the chart.',
      wordMinimum: 150,
      essayText: 'Essay text',
      wordCount: 190,
      activeTimeSeconds: 900,
      isVoided: false,
      taskBand: 6,
      criteriaScores: { TA: 6, CC: 6, LR: 6, GRA: 6 },
      taskSummary: '<p>Task summary</p>',
      criteriaFeedback: { TA: '<p>TA feedback</p>' },
      markedContent: { type: 'doc', content: [] },
      comments: [
        {
          kind: 'comment',
          id: 'comment-1',
          text: '<p>First comment</p>',
          color: '#4f46e5',
          anchorText: 'first phrase',
          from: 1,
          to: 5,
          status: 'active',
          categoryLabel: 'Task Response',
        },
        {
          kind: 'comment',
          id: 'comment-2',
          text: '<p>Second comment</p>',
          color: '#4f46e5',
          anchorText: 'second phrase',
          from: 6,
          to: 10,
          status: 'active',
          categoryLabel: 'Grammar',
        },
      ],
      corrections: [
        {
          kind: 'correction',
          id: 'correction-1',
          anchorText: 'wrong phrase',
          correctionText: 'improved phrase',
          from: 11,
          to: 22,
          label: 'Correction',
        },
      ],
      fallbackAnnotations: [],
      usesLegacyProjection: false,
    },
    {
      taskNumber: 2,
      taskType: 'essay',
      promptText: 'Discuss both views.',
      wordMinimum: 250,
      essayText: 'Essay text 2',
      wordCount: 230,
      activeTimeSeconds: 1200,
      isVoided: false,
      taskBand: 7,
      criteriaScores: { TR: 7, CC: 7, LR: 7, GRA: 7 },
      taskSummary: '<p>Task 2 summary</p>',
      criteriaFeedback: { TR: '<p>TR feedback</p>' },
      markedContent: null,
      comments: [],
      corrections: [],
      fallbackAnnotations: [],
      usesLegacyProjection: false,
    },
  ],
};

describe('WritingStudentResultSurface', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scrollIntoViewMock.mockClear();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoViewMock,
    });
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get() {
        if (this?.getAttribute?.('data-feedback-header-id') === 'comment-2') {
          return 20;
        }
        return 80;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
      configurable: true,
      writable: true,
      value: 0,
    });
    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value() {
        if (this?.getAttribute?.('data-feedback-viewport') === 'true') {
          return {
            x: 0,
            y: 100,
            width: 480,
            height: 400,
            top: 100,
            left: 0,
            right: 480,
            bottom: 500,
            toJSON() {
              return this;
            },
          };
        }

        if (this?.getAttribute?.('data-feedback-stack') === 'true') {
          return {
            x: 0,
            y: 140,
            width: 480,
            height: 320,
            top: 140,
            left: 0,
            right: 480,
            bottom: 460,
            toJSON() {
              return this;
            },
          };
        }

        if (this?.getAttribute?.('data-feedback-header-id') === 'comment-2') {
          return {
            x: 0,
            y: 260,
            width: 420,
            height: 20,
            top: 260,
            left: 24,
            right: 444,
            bottom: 280,
            toJSON() {
              return this;
            },
          };
        }

        if (this?.getAttribute?.('data-feedback-card-id') === 'comment-2') {
          return {
            x: 0,
            y: 244,
            width: 440,
            height: 96,
            top: 244,
            left: 20,
            right: 460,
            bottom: 340,
            toJSON() {
              return this;
            },
          };
        }

        if (this?.getAttribute?.('data-feedback-header-id') === 'correction-1') {
          return {
            x: 0,
            y: 300,
            width: 420,
            height: 20,
            top: 300,
            left: 24,
            right: 444,
            bottom: 320,
            toJSON() {
              return this;
            },
          };
        }

        if (this?.getAttribute?.('data-feedback-card-id') === 'correction-1') {
          return {
            x: 0,
            y: 284,
            width: 440,
            height: 96,
            top: 284,
            left: 20,
            right: 460,
            bottom: 380,
            toJSON() {
              return this;
            },
          };
        }

        return {
          x: 0,
          y: 0,
          width: 480,
          height: 320,
          top: 0,
          left: 0,
          right: 480,
          bottom: 320,
          toJSON() {
            return this;
          },
        };
      },
    });
  });

  it('opens the feedback tab and highlights the matching comment when essay markup is clicked', async () => {
    render(
      <WritingStudentResultSurface
        data={surfaceData}
        variant="panel"
        forceWidePanelLayout
      />,
    );

    expect(screen.getByRole('button', { name: 'Prompt' })).toBeInTheDocument();
    expect(screen.queryByText('Second comment')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Focus comment 2' }));

    const highlightedComment = await screen.findByText('Second comment');
    const highlightedCard = highlightedComment.closest('article');
    const shiftedFeedbackStack = highlightedCard?.closest('[data-feedback-stack="true"]');

    expect(screen.getByRole('button', { name: 'Feedback' })).toBeInTheDocument();
    expect(highlightedCard).toHaveAttribute('data-highlighted', 'true');
    expect(highlightedCard).toHaveStyle({
      background: '#eef2ff',
      border: '1px solid #818cf8',
    });
    expect(shiftedFeedbackStack).toHaveAttribute('data-feedback-shifted', 'true');

    await waitFor(() => {
      expect(shiftedFeedbackStack).toHaveStyle({
        transform: 'translateY(-52px)',
      });
      expect(scrollIntoViewMock).not.toHaveBeenCalled();
    });
  });

  it('opens the feedback tab and highlights the matching correction when essay markup is clicked', async () => {
    render(
      <WritingStudentResultSurface
        data={surfaceData}
        variant="panel"
        forceWidePanelLayout
      />,
    );

    expect(screen.queryByText('improved phrase')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Focus correction 1' }));

    const correctionText = await screen.findByText('improved phrase');
    const highlightedCard = correctionText.closest('article');
    const shiftedFeedbackStack = highlightedCard?.closest('[data-feedback-stack="true"]');

    expect(highlightedCard).toHaveAttribute('data-highlighted', 'true');
    expect(highlightedCard).toHaveTextContent('Correction');
    expect(highlightedCard).toHaveTextContent('wrong phrase');

    await waitFor(() => {
      expect(shiftedFeedbackStack).toHaveStyle({
        transform: 'translateY(-62px)',
      });
      expect(scrollIntoViewMock).not.toHaveBeenCalled();
    });
  });
});
