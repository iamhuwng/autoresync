import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReadingV2ReviewContentAdapter } from './ReadingV2ReviewContentAdapter';

describe('ReadingV2ReviewContentAdapter', () => {
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
