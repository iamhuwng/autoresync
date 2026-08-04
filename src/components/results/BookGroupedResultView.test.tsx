import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  BookResultAttemptDetail,
  BookResultAttemptSummary,
  BookResultGroupSummary,
} from '../../services/book-activity/results/bookResult.types';
import { BookGroupedResultView } from './BookGroupedResultView';

const attempt = (overrides: Partial<BookResultAttemptSummary> = {}): BookResultAttemptSummary => ({
  schemaVersion: 1,
  attemptId: 'attempt-2',
  resultId: 'result-2',
  completionId: 'completion-2',
  recipientId: 'student-1',
  studentId: 'student-1',
  activityId: 'activity-1',
  contextId: 'homework-1',
  placementId: 'placement-1',
  bindingId: 'binding-1',
  bindingRevision: 4,
  activityVersionId: 'activity-1@7',
  activityVersion: 7,
  interactionId: 'interaction-1',
  attemptNumber: 2,
  surface: 'homework',
  deliveryContextId: 'homework-1',
  deliveryId: 'delivery-1',
  ownerId: 'teacher-1',
  homeworkId: 'homework-1',
  pageGroupKeys: ['page-group-1'],
  sourceProvenance: [],
  sources: [{
    sourceKey: 'source-a',
    componentId: 'component-a',
    sourceVersionId: 'source-version-1',
    pages: [3, 4],
    availability: 'replaced',
    available: false,
    displayOnly: true,
  }],
  sourceAvailability: 'replaced',
  sourceAvailable: false,
  createdAt: '2026-07-31T02:00:00.000Z',
  submittedAt: '2026-07-31T02:00:00.000Z',
  completedAt: '2026-07-31T02:00:00.000Z',
  resultStatus: 'submitted',
  evaluationStatus: 'graded',
  completionStatus: 'completed',
  completion: {
    completionId: 'completion-2',
    attemptId: 'attempt-2',
    resultId: 'result-2',
    status: 'completed',
    contextId: 'homework-1',
    placementId: 'placement-1',
    activityVersionId: 'activity-1@7',
    activityVersion: 7,
    createdAt: '2026-07-31T02:00:00.000Z',
  },
  evaluation: {
    status: 'graded',
    score: { earnedScore: 8, maximumScore: 10, displayScore: '8 / 10' },
  },
  feedback: {
    release: 'released',
    available: true,
    text: 'Good reasoning.',
  },
  attemptLimit: 3,
  attemptsUsed: 2,
  attemptsRemaining: 1,
  ...overrides,
});

const firstAttempt = attempt({
  attemptId: 'attempt-1',
  resultId: 'result-1',
  completionId: 'completion-1',
  attemptNumber: 1,
  submittedAt: '2026-07-30T02:00:00.000Z',
  evaluationStatus: 'pending_review',
  evaluation: { status: 'pending_review' },
  feedback: { release: 'withheld', available: false },
});

const latestAttempt = attempt();
const group: BookResultGroupSummary = {
  groupKey: 'opaque-group',
  recipientId: 'student-1',
  studentId: 'student-1',
  activityId: 'activity-1',
  attemptCount: 2,
  attempts: [latestAttempt, firstAttempt],
  contexts: [{
    contextId: 'homework-1',
    placementId: 'placement-1',
    surface: 'homework',
    attemptLimit: 3,
    attemptsUsed: 2,
    attemptsRemaining: 1,
    completionStatus: 'completed',
    latestAttemptId: 'attempt-2',
    attemptIds: ['attempt-2', 'attempt-1'],
  }],
  latestAttemptId: 'attempt-2',
};

const detail: BookResultAttemptDetail = {
  ...latestAttempt,
  response: { choice: 'B' },
};

describe('BookGroupedResultView', () => {
  it('shows exact attempt, version, binding, context, and display-only provenance', () => {
    render(
      <BookGroupedResultView
        group={group}
        selectedAttemptId="attempt-2"
        detail={detail}
        onAttemptChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Review Activity attempts' })).toBeInTheDocument();
    expect(screen.getByText('activity-1@7 (v7)')).toBeInTheDocument();
    expect(screen.getByText('binding-1 · revision 4')).toBeInTheDocument();
    expect(screen.getByText('homework-1')).toBeInTheDocument();
    expect(screen.getByText(/Historical display-only metadata/)).toBeInTheDocument();
    expect(screen.getByText('Replaced')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText(/"choice": "B"/)).toBeInTheDocument();
    expect(screen.getByText('Good reasoning.')).toBeInTheDocument();
  });

  it('keeps attempt identities separate and requests the chosen attempt', () => {
    const onAttemptChange = vi.fn();
    render(
      <BookGroupedResultView
        group={group}
        selectedAttemptId="attempt-2"
        detail={detail}
        onAttemptChange={onAttemptChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Select result attempt/ }));
    fireEvent.click(screen.getByRole('option', { name: /Attempt 1/ }));
    expect(onAttemptChange).toHaveBeenCalledWith('attempt-1');
  });

  it('does not reveal withheld feedback and announces pending detail state', () => {
    render(
      <BookGroupedResultView
        group={group}
        selectedAttemptId="attempt-1"
        detail={null}
        detailLoading
        onAttemptChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Loading this attempt');
    expect(screen.queryByText('Good reasoning.')).not.toBeInTheDocument();
  });

  it('offers an accessible retry when a detail read fails', () => {
    const onRetry = vi.fn();
    render(
      <BookGroupedResultView
        group={group}
        selectedAttemptId="attempt-1"
        detail={null}
        detailError="This attempt is no longer visible."
        onAttemptChange={vi.fn()}
        onRetryDetail={onRetry}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('no longer visible');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('does not render legacy score, response, or feedback to students outside policy projection', () => {
    render(
      <BookGroupedResultView
        group={group}
        selectedAttemptId="attempt-2"
        detail={detail}
        viewerRole="student"
        evaluationProjection={{
          attemptId: 'attempt-2',
          status: 'graded',
          feedback: 'Policy released feedback',
        }}
        onAttemptChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Policy released feedback')).toBeInTheDocument();
    expect(screen.queryByText('Good reasoning.')).not.toBeInTheDocument();
    expect(screen.queryByText(/"choice": "B"/)).not.toBeInTheDocument();
    expect(screen.queryByText('8 / 10')).not.toBeInTheDocument();
    expect(screen.queryByText(/score/iu)).not.toBeInTheDocument();
  });

  it('renders the safest student state when the presentation gate is disabled', () => {
    render(
      <BookGroupedResultView
        group={group}
        selectedAttemptId="attempt-2"
        detail={detail}
        viewerRole="student"
        evaluationProjection={{ attemptId: 'attempt-2', status: 'hidden' }}
        onAttemptChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Evaluation details are not available.')).toHaveAttribute(
      'role',
      'status',
    );
    expect(screen.queryByText('Good reasoning.')).not.toBeInTheDocument();
    expect(screen.queryByText('8 / 10')).not.toBeInTheDocument();
  });
});
