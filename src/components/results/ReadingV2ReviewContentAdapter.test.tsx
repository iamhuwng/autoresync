import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReadingV2ReviewContentAdapter } from './ReadingV2ReviewContentAdapter';

const mocks = vi.hoisted(() => ({
  trackAction: vi.fn(),
}));

vi.mock('../../services/reportingService', () => ({
  reportingService: {
    trackAction: (...args: unknown[]) => mocks.trackAction(...args),
  },
}));

describe('ReadingV2ReviewContentAdapter', () => {
  beforeEach(() => {
    mocks.trackAction.mockClear();
  });

  const reviewPayload = {
    deliveryEngine: 'reading-v2',
    schemaVersion: 1,
    resultId: 'result-v2',
    sourceSnapshotVersionId: 'snapshot-1',
    materialId: 'material-1',
    title: 'Reading V2 Result',
    taskGroups: [
      {
        taskGroupId: 'task-group-1',
        title: 'Questions 1-2',
        officialTaskType: 'sentence-completion',
        engineeringFamily: 'completion',
        instructionText: 'Complete the sentences.',
        stimulusContext: [
          {
            stimulusId: 'stimulus-1',
            title: 'Passage A',
            kind: 'passage',
            anchorLabels: ['Paragraph A'],
            excerpt: 'The passage explains the context needed for questions 1-2.',
          },
        ],
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
  } as const;

  it('renders grouped Reading V2 review content inside the existing result shell boundary', () => {
    render(
      <ReadingV2ReviewContentAdapter
        resultId="result-v2"
        variant="teacher"
        reviewPayload={reviewPayload}
      />,
    );

    expect(screen.getByTestId('reading-v2-review-adapter')).toBeInTheDocument();
    expect(screen.getByText('Reading V2 Result')).toBeInTheDocument();
    expect(screen.getByText('Complete the sentences.')).toBeInTheDocument();
    expect(screen.getByTestId('reading-v2-review-stimulus-stimulus-1')).toHaveTextContent(
      'The passage explains the context needed for questions 1-2.',
    );
    expect(screen.getByText(/Correct answer:/)).toBeInTheDocument();
    expect(screen.getByText(/answer one/)).toBeInTheDocument();
  });

  it('hides correct answers for student review interactions that are not released', () => {
    render(
      <ReadingV2ReviewContentAdapter
        resultId="result-v2"
        variant="student"
        reviewPayload={{
          ...reviewPayload,
          taskGroups: [
            {
              ...reviewPayload.taskGroups[0],
              interactions: [
                {
                  ...reviewPayload.taskGroups[0].interactions[0],
                  reviewState: 'withheld',
                },
              ],
            },
          ],
        }}
      />,
    );

    expect(screen.getByTestId('reading-v2-review-withheld-1')).toHaveTextContent(
      'Correct answer is hidden until release.',
    );
    expect(screen.queryByText(/answer one/)).not.toBeInTheDocument();
  });

  it('labels Reading Passage set review groups with assigned passage source metadata', () => {
    render(
      <ReadingV2ReviewContentAdapter
        resultId="result-v2"
        variant="teacher"
        reviewPayload={{
          ...reviewPayload,
          materialKind: 'reading-passage-set',
          materialLabel: 'Reading Passage Set',
          title: 'Selected Reading Passages',
          sourceSnapshotVersionId: 'homework-set:hw-1',
          taskGroups: [
            {
              ...reviewPayload.taskGroups[0],
              taskGroupId: 'passage-1:task-group-1',
              title: 'Questions 1-8',
              passageSection: {
                order: 1,
                title: 'Passage A',
                passageMaterialId: 'passage-a',
                snapshotVersionId: 'snapshot-a',
                sourceOrderDisplay: 'Passage 1',
                sourceFullTestTitle: 'Mock Test A',
              },
            },
            {
              ...reviewPayload.taskGroups[0],
              taskGroupId: 'passage-2:task-group-1',
              title: 'Questions 9-18',
              passageSection: {
                order: 2,
                title: 'Passage B',
                passageMaterialId: 'passage-b',
                snapshotVersionId: 'snapshot-b',
                sourceOrderDisplay: 'Passage 2',
                sourceFullTestTitle: 'Mock Test B',
              },
            },
          ],
        }}
      />,
    );

    expect(screen.getByText('Reading Passage Set Review')).toBeInTheDocument();
    expect(screen.getByTestId('reading-v2-review-passage-section-passage-1:task-group-1')).toHaveTextContent(
      'Passage A',
    );
    expect(screen.getByTestId('reading-v2-review-passage-section-passage-1:task-group-1')).toHaveTextContent(
      'Passage 1, Mock Test A, Snapshot snapshot-a',
    );
    expect(screen.getByTestId('reading-v2-review-passage-section-passage-2:task-group-1')).toHaveTextContent(
      'Passage B',
    );
    expect(mocks.trackAction).toHaveBeenCalledWith(
      'results',
      'teacher_materials_reading_passage_result_viewed',
      {
        resultId: 'result-v2',
        variant: 'teacher',
        materialKind: 'reading-passage-set',
        taskGroupCount: 2,
      },
    );
  });

  it('shows an adapter-owned empty state for invalid payloads', () => {
    render(
      <ReadingV2ReviewContentAdapter
        resultId="result-v2"
        variant="teacher"
        reviewPayload={{ deliveryEngine: 'reading-v2' }}
      />,
    );

    expect(screen.getByTestId('reading-v2-review-empty')).toBeInTheDocument();
  });
});
