import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  BookActivityEvaluationBrowserClient,
  BookActivityEvaluationLocator,
  BookActivityTeacherEvaluationPresentation,
} from '../../services/book-activity/activityEvaluation.browser';
import {
  BookActivityEvaluationBrowserError,
} from '../../services/book-activity/activityEvaluation.browser';
import { BookActivityGradingPanel } from './BookActivityGradingPanel';

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock('../modern/ToastNotification', () => ({
  toast: {
    success: toastSuccess,
    error: toastError,
  },
}));

const locator: BookActivityEvaluationLocator = {
  bookId: 'book-1',
  studentId: 'student-1',
  contextKind: 'homework',
  contextId: 'homework-1',
  placementId: 'placement-1',
  activityId: 'activity-1',
  activityVersionId: 'activity-version-1',
  attemptId: 'attempt-1',
};

const revision = (
  value: number,
): NonNullable<BookActivityTeacherEvaluationPresentation['current']> => ({
  revision: value,
  previousRevision: value - 1,
  commandKind: value === 1 ? 'teacher_evaluation' : 'regrade',
  facts: {
    status: 'scored',
    earnedScore: value,
    maximumScore: 2,
    displayScore: `${value}.00 / 2.00`,
    feedback: `Feedback ${value}`,
    correctionFacts: value === 1 ? [] : [{
      interactionId: 'interaction-1',
      outcome: 'correct',
      note: 'Corrected after review.',
    }],
  },
  evaluatedBy: 'teacher',
  evaluatedAt: `2026-08-0${value}T00:00:00.000Z`,
});

const presentation = (
  current: BookActivityTeacherEvaluationPresentation['current'] = null,
  priorRevisions: BookActivityTeacherEvaluationPresentation['priorRevisions'] = [],
): BookActivityTeacherEvaluationPresentation => ({
  locator,
  attemptId: 'attempt-1',
  resultId: 'result-1',
  interactionId: 'interaction-1',
  submission: { text: 'Student work' },
  current,
  priorRevisions,
});

const client = (
  initial = presentation(),
): BookActivityEvaluationBrowserClient => ({
  readTeacherEvaluation: vi.fn(async () => initial),
  grade: vi.fn(async () => presentation(revision(1))),
  regrade: vi.fn(async () => presentation(revision(2), [revision(1)])),
  readStudentResult: vi.fn(),
});

describe('BookActivityGradingPanel', () => {
  beforeEach(() => {
    toastSuccess.mockReset();
    toastError.mockReset();
  });

  it('grades a submitted Activity through the typed client and announces success', async () => {
    const user = userEvent.setup();
    const evaluationClient = client();
    const onAction = vi.fn();
    render(
      <BookActivityGradingPanel
        locator={locator}
        studentName="Student One"
        activityLabel="Activity One"
        client={evaluationClient}
        onAction={onAction}
      />,
    );

    expect(await screen.findByText(/Student work/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Earned score'), '1');
    await user.type(screen.getByLabelText('Maximum score'), '2');
    await user.type(screen.getByLabelText('Feedback'), 'Initial feedback');
    await user.click(screen.getByRole('button', { name: 'Save grade' }));

    await waitFor(() => expect(evaluationClient.grade).toHaveBeenCalledWith({
      locator,
      expectedRevision: 0,
      earnedScore: 1,
      maximumScore: 2,
      feedback: 'Initial feedback',
    }));
    expect(await screen.findByText('Revision 1')).toBeInTheDocument();
    expect(toastSuccess).toHaveBeenCalledWith('Activity grade saved.');
    expect(onAction).toHaveBeenCalledWith('bookActivityGradeSubmitted', {
      activityId: 'activity-1',
      revision: 1,
    });
  });

  it('shows immutable prior revisions and requires a correction note for regrade', async () => {
    const user = userEvent.setup();
    const evaluationClient = client(presentation(revision(1)));
    render(
      <BookActivityGradingPanel
        locator={locator}
        studentName="Student One"
        activityLabel="Activity One"
        client={evaluationClient}
      />,
    );

    expect(await screen.findByText('Revision 1 · Current')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Earned score'));
    await user.type(screen.getByLabelText('Earned score'), '2');
    await user.click(screen.getByRole('button', { name: 'Save regrade' }));
    expect(screen.getByLabelText(/Correction note/)).toBeRequired();
    expect(evaluationClient.regrade).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/Correction note/), 'Corrected after review.');
    await user.click(screen.getByRole('button', { name: 'Save regrade' }));
    await waitFor(() => expect(evaluationClient.regrade).toHaveBeenCalledWith(
      expect.objectContaining({
        locator,
        expectedRevision: 1,
        correctionNote: 'Corrected after review.',
      }),
    ));
    expect(await screen.findByText('Revision 2 · Current')).toBeInTheDocument();
    expect(screen.getByText('Revision 1')).toBeInTheDocument();
    expect(toastSuccess).toHaveBeenCalledWith('Activity regrade saved.');
  });

  it('recovers a stale conflict by reloading current history before retry', async () => {
    const user = userEvent.setup();
    const initial = presentation(revision(1));
    const latest = presentation(revision(2), [revision(1)]);
    const evaluationClient = client(initial);
    vi.mocked(evaluationClient.readTeacherEvaluation)
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(latest);
    vi.mocked(evaluationClient.regrade).mockRejectedValueOnce(
      new BookActivityEvaluationBrowserError('stale_conflict', 409, 2),
    );
    render(
      <BookActivityGradingPanel
        locator={locator}
        studentName="Student One"
        activityLabel="Activity One"
        client={evaluationClient}
      />,
    );

    await screen.findByText('Revision 1 · Current');
    await user.type(screen.getByLabelText(/Correction note/), 'Correction');
    await user.click(screen.getByRole('button', { name: 'Save regrade' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Latest saved revision: 2',
    );
    await user.click(screen.getByRole('button', { name: 'Reload latest evaluation' }));

    expect(await screen.findByText('Revision 2 · Current')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Earned score')).toHaveFocus());
    expect(evaluationClient.readTeacherEvaluation).toHaveBeenCalledTimes(2);
    expect(toastError).toHaveBeenCalledWith('Activity evaluation could not be saved.');
  });

  it('atomically clears presentation and form state when the locator changes', async () => {
    const secondLocator: BookActivityEvaluationLocator = {
      ...locator,
      studentId: 'student-2',
      attemptId: 'attempt-2',
    };
    const evaluationClient = client(presentation(revision(1)));
    vi.mocked(evaluationClient.readTeacherEvaluation)
      .mockResolvedValueOnce(presentation(revision(1)))
      .mockRejectedValueOnce(new Error('second locator unavailable'));
    const { rerender } = render(
      <BookActivityGradingPanel
        locator={locator}
        studentName="Student One"
        activityLabel="Activity One"
        client={evaluationClient}
      />,
    );

    expect(await screen.findAllByText('Feedback 1')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Save regrade' })).toBeInTheDocument();

    rerender(
      <BookActivityGradingPanel
        locator={secondLocator}
        studentName="Student Two"
        activityLabel="Activity Two"
        client={evaluationClient}
      />,
    );

    expect(screen.queryByText('Student work')).not.toBeInTheDocument();
    expect(screen.queryAllByText('Feedback 1')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /Save (?:grade|regrade)/u })).not.toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The Activity evaluation could not be loaded. Try again.',
    );
    expect(evaluationClient.readTeacherEvaluation).toHaveBeenLastCalledWith(secondLocator);
  });
});
